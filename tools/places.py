"""Сборка data/places.json.gz — населённые пункты России, Украины и Беларуси для «Личной информации» (страна и город/село).

Источник — npm-пакеты @geomelon/russia, @geomelon/ukraine, @geomelon/belarus (данные Wikidata, лицензия CC0 — свободно,
без указания авторства). Как собрать:
    mkdir -p /tmp/geo && cd /tmp/geo && for c in russia ukraine belarus; do npm pack @geomelon/$c; done
    for f in *.tgz; do mkdir -p ${f%.tgz} && tar -xzf $f -C ${f%.tgz}; done
    python3 -I tools/places.py /tmp/geo data/places.json.gz
Что делается с данными:
  • имя — русское (если нет — украинское или белорусское, если кириллица); область — по-русски;
  • убираются бывшие и заброшенные сёла, районы и кварталы городов, записи-области, чужие области;
  • область исправляется по соседям: если 6 из 10 ближайших пунктов — в другой области (а своей у них почти нет), пункт переносится
    туда (в данных Wikidata бывают ошибки: Сумы — в Харьковской, Грозный — в Ставропольском крае); так же получают область пункты без неё;
  • спорные территории (Крым, Севастополь, Донецкая, Луганская, Запорожская, Херсонская области) — в обоих списках, России и Украины:
    страну игрок выбирает сам; названия областей там нейтральные;
  • одинаковые «имя + область» — один раз; порядок — сначала крупные (по населению, без данных — по типу пункта).
Выход: {"ru"|"ua"|"by": {"r": [области], "p": [[имя, номер области или -1], ...]}} — gzip.
"""
import gzip, json, math, os, re, sys, collections

SRC, OUT = sys.argv[1], sys.argv[2]
PKG = {'ru': 'geomelon-russia', 'ua': 'geomelon-ukraine', 'by': 'geomelon-belarus'}
EXCL_TYPES = {'former village', 'abandoned village', 'former settlement', 'neighborhood', 'microdistrict', 'quarter', 'residential area',
              'subdivision of Kyiv'}  # чисто административные записи (сельсоветы и т. п.) — ниже, ADMIN_ONLY
# города — сами себе область (столицы, города федерального значения): без области
CITY_REGION = {'Москва', 'Санкт-Петербург', 'Севастополь', 'Минск', 'Киев'}
# ошибки областей у крупных городов, которые соседи не исправили (проверено вручную)
# имя: (ошибочная область, верная) — только у пункта с этой ошибочной областью, тёзки в других областях не трогаются
OVERRIDE = {'ua': {'Умань': ('Киевская область', 'Черкасская область'), 'Овруч': ('Киевская область', 'Житомирская область')},
            'ru': {n: ('Ставропольский край', 'Чечня') for n in ('Урус-Мартан', 'Гойты', 'Старые Атаги', 'Алхан-Юрт', 'Мартан-Чу', 'Алхазурово', 'Танги-Чу')},
            'by': {}}
# не населённые пункты, а районы, округа, общины, пляжи
NOT_PLACE = re.compile(r'\b(?:район|округ|община|громада|сельсовет|поселение|пляж|рада)\b', re.I)
ADMIN_ONLY = re.compile(r'administrative|municipal|council|division')
REGION_NAME = re.compile(r'(?: область| край| автономный округ| автономная область|^Республика .+)$')
# спорные территории: нейтральные названия; в обоих списках
CONTESTED = {'Автономная Республика Крым': 'Крым', 'Республика Крым': 'Крым', 'Крым': 'Крым', 'Севастополь': 'Севастополь',
             'Донецкая область': 'Донецкая область', 'Донецкая Народная Республика': 'Донецкая область',
             'Луганская область': 'Луганская область', 'Луганская Народная Республика': 'Луганская область',
             'Запорожская область': 'Запорожская область', 'Херсонская область': 'Херсонская область'}
# чужие области в списке страны — ошибки данных
FOREIGN = {'ua': {'Брянская область', 'Подкарпатское воеводство'}, 'ru': {'Николаевская область', 'Актюбинская область', 'Ивано-Франковская область'}, 'by': set()}
TYPE_RANK = [('big city', 1_000_000), ('city', 50_000), ('town', 30_000), ('urban-type', 5_000), ('urban settlement', 5_000), ('work settlement', 5_000),
             ('agrotown', 1_500), ('village', 500), ('posyolok', 400), ('stanitsa', 1_500), ('khutor', 150), ('hamlet', 100)]
CYR = re.compile(r'^[А-Яа-яЁёІіЇїЄєҐґЎўʼ’\'\- .()0-9]+$')

def rank(c):
    if c.get('population'): return c['population']
    ts = ' '.join(c.get('settlementTypes') or [])
    for k, v in TYPE_RANK:
        if k in ts: return v
    return 100

def load(cc):
    d = json.load(open(os.path.join(SRC, PKG[cc], 'package', 'data.json'), encoding='utf-8'))
    regs = {r['id']: ((r.get('translations') or {}).get('ru') or r['name']) for r in d['regions']}
    out = []
    for c in d['cities']:
        tr = c.get('translations') or {}
        name = tr.get('ru') or (tr.get('uk') if cc == 'ua' else tr.get('be') if cc == 'by' else None)
        if not name or not CYR.match(name) or REGION_NAME.search(name) or NOT_PLACE.search(name): continue
        types = set(c.get('settlementTypes') or [])
        if types & EXCL_TYPES or (types and all(ADMIN_ONLY.search(t) for t in types)): continue
        reg = regs.get(c.get('regionId'))
        if reg in FOREIGN[cc]: continue
        lat, lon = c.get('latitude'), c.get('longitude')
        name = name.strip()
        out.append({'n': name, 'r': CONTESTED.get(reg, reg), 'lat': lat, 'lon': lon, 'rank': rank(c), 'big': (c.get('population') or 0) >= 300_000})
    return out

def fix_regions(pts):
    """область по соседям: 10 ближайших; 7+ в другой области и ни одного из своей — перенос; без области — 5+ соседей в одной области.
    Мягче нельзя: у границы областей начинает переносить верные пункты (станица Галюгаевская на Тереке — к соседям в Чечню).
    Группы ошибок (соседи ошибаются вместе) — вручную, OVERRIDE."""
    cell = lambda la, lo: (int(math.floor(la / 0.25)), int(math.floor(lo / 0.25)))
    grid = collections.defaultdict(list)
    for i, p in enumerate(pts):
        if p['lat'] is not None and p['lon'] is not None: grid[cell(p['lat'], p['lon'])].append(i)
    moved = 0
    new = [p['r'] for p in pts]
    for i, p in enumerate(pts):
        if p['lat'] is None or p['lon'] is None: continue
        cy, cx = cell(p['lat'], p['lon']); near = []
        for rad in (1, 2, 3):
            near = [j for dy in range(-rad, rad + 1) for dx in range(-rad, rad + 1) for j in grid.get((cy + dy, cx + dx), ()) if j != i and pts[j]['r']]
            if len(near) >= 10: break
        if len(near) < 6: continue
        k = math.cos(math.radians(p['lat']))
        near.sort(key=lambda j: (pts[j]['lat'] - p['lat']) ** 2 + ((pts[j]['lon'] - p['lon']) * k) ** 2)
        votes = collections.Counter(pts[j]['r'] for j in near[:10])
        top, n = votes.most_common(1)[0]
        own = votes.get(p['r'], 0) if p['r'] else 0
        if top != p['r'] and ((not p['r'] and n >= 5) or (n >= 7 and own == 0)):
            new[i] = top; moved += 1
    for p, r in zip(pts, new): p['r'] = r
    for p in pts:  # столицы и города федерального значения — без области; ручные поправки
        if p['big'] and p['n'] in CITY_REGION: p['r'] = None
    return moved

lists = {}
contested = []
for cc in ('ru', 'ua', 'by'):
    pts = load(cc)
    moved = fix_regions(pts)
    for p in pts:
        fix = OVERRIDE[cc].get(p['n'])
        if fix and p['r'] == fix[0]: p['r'] = fix[1]
    print(f'{cc}: пунктов {len(pts)}, область исправлена или найдена по соседям: {moved}', file=sys.stderr)
    lists[cc] = pts
    contested += [p for p in pts if cc in ('ru', 'ua') and (p['r'] in set(CONTESTED.values()) or (p['big'] and p['n'] == 'Севастополь'))]
# спорные — в обоих списках
for cc in ('ru', 'ua'): lists[cc] = lists[cc] + contested
result = {}
for cc, pts in lists.items():
    best = {}
    for p in pts:
        key = (p['n'], p['r'] or '')
        if key not in best or p['rank'] > best[key]['rank']: best[key] = p
    items = sorted(best.values(), key=lambda p: (-p['rank'], p['n']))
    regs = sorted({p['r'] for p in items if p['r']})
    ri = {r: i for i, r in enumerate(regs)}
    result[cc] = {'r': regs, 'p': [[p['n'], ri.get(p['r'], -1)] for p in items]}
    print(f'{cc}: в списке {len(items)}, областей {len(regs)}', file=sys.stderr)
raw = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
with gzip.open(OUT, 'wb', compresslevel=9) as f: f.write(raw)
print(f'записано {OUT}: {len(raw) // 1024} КБ, сжато {os.path.getsize(OUT) // 1024} КБ', file=sys.stderr)
