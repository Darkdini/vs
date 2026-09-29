#!/usr/bin/env python3
"""Вся графика игры в одну картинку (атлас) и обратно.

  python3 tools/atlas.py pack            → dist/atlas/atlas.png (на сером фоне, для улучшения),
                                           dist/atlas/atlas-labels.png (то же с подписями файлов), tools/atlas-map.json
  python3 tools/atlas.py unpack improved.png [--out web]
                                         → режет улучшенный атлас обратно по файлам web/gfx*/…
Каждая картинка лежит в своей клетке CELL×CELL; мелкий пиксель-арт увеличен в целое число раз.
Улучшенный атлас можно увеличить в любое число раз (2×, 4×) — масштаб определяется по ширине.
При разрезании прозрачность берётся из исходных файлов, так что фон при улучшении может быть любым;
размеры файлов остаются прежними (вёрстка не ломается).
Нужен Pillow (pip install pillow).
"""
import json, math, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web')
MAP = os.path.join(ROOT, 'tools', 'atlas-map.json')
OUT = os.path.join(ROOT, 'dist', 'atlas')
CELL, PAD, COLS, BG = 128, 6, 25, (128, 128, 128)
SKIP = ('gfx3d/locs/',)  # заменены новой графикой, в игре не используются


def files():
    out = []
    for top in ('gfx', 'gfx3d'):
        for d, _, fs in os.walk(os.path.join(WEB, top)):
            for f in fs:
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    rel = os.path.relpath(os.path.join(d, f), WEB).replace(os.sep, '/')
                    if not rel.startswith(SKIP):
                        out.append(rel)
    return sorted(out)


def pack():
    items, fl = [], files()
    rows = math.ceil(len(fl) / COLS)
    atlas = Image.new('RGB', (COLS * CELL, rows * CELL), BG)
    labels = Image.new('RGB', atlas.size, BG)
    dl = ImageDraw.Draw(labels)
    for i, rel in enumerate(fl):
        im = Image.open(os.path.join(WEB, rel)).convert('RGBA')
        w, h = im.size
        s = min((CELL - 2 * PAD) / w, (CELL - 2 * PAD) / h)
        if s >= 1:  # мелкая картинка — целое увеличение без размытия
            s = math.floor(s)
            big = im.resize((w * s, h * s), Image.NEAREST)
        else:
            big = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
        cx, cy = (i % COLS) * CELL, (i // COLS) * CELL
        dx, dy = cx + (CELL - big.width) // 2, cy + (CELL - big.height) // 2
        atlas.paste(big, (dx, dy), big)
        labels.paste(big, (dx, dy), big)
        dl.rectangle((cx, cy, cx + CELL - 1, cy + CELL - 1), outline=(90, 90, 90))
        dl.text((cx + 2, cy + CELL - 11), rel.split('/', 1)[1][-24:], fill=(255, 255, 0))
        items.append({'path': rel, 'w': w, 'h': h, 'x': dx, 'y': dy, 'dw': big.width, 'dh': big.height})
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, 'atlas.png'), optimize=True)
    labels.save(os.path.join(OUT, 'atlas-labels.png'), optimize=True)
    with open(MAP, 'w', encoding='utf-8') as f:
        json.dump({'cell': CELL, 'cols': COLS, 'width': atlas.width, 'height': atlas.height, 'items': items}, f, ensure_ascii=False, indent=0)
    print(f'{len(items)} картинок → {OUT}/atlas.png {atlas.width}×{atlas.height}, карта {MAP}')


def unpack(src, out=WEB):
    m = json.load(open(MAP, encoding='utf-8'))
    im = Image.open(src).convert('RGB')
    k = im.width / m['width']
    if abs(im.height / m['height'] - k) > 0.02:
        sys.exit(f'Пропорции атласа изменились ({im.width}×{im.height}), нужен {m["width"]}×{m["height"]} или кратный.')
    n = 0
    for it in m['items']:
        box = tuple(round(v * k) for v in (it['x'], it['y'], it['x'] + it['dw'], it['y'] + it['dh']))
        part = im.crop(box).resize((it['w'], it['h']), Image.LANCZOS)
        orig_path = os.path.join(WEB, it['path'])
        dst = os.path.join(out, it['path'])
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if it['path'].lower().endswith(('.jpg', '.jpeg')):
            part.save(dst, quality=92)
        else:
            alpha = Image.open(orig_path).convert('RGBA').split()[3]  # прозрачность — из исходника
            part = part.convert('RGBA'); part.putalpha(alpha)
            part.save(dst, optimize=True)
        n += 1
    print(f'Нарезано {n} картинок в {out} (масштаб атласа {k:.2f}×)')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'pack':
        pack()
    elif len(sys.argv) > 2 and sys.argv[1] == 'unpack':
        unpack(sys.argv[2], sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else WEB)
    else:
        print(__doc__)
