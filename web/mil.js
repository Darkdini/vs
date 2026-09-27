'use strict';
// Функции внутри зданий, армия, генерал, отчёты и админ-панель (сервер: server/src/army.js).
// Подключается после app.js и пользуется его общими функциями (S, send, openSheet, gimg, RES_IC, fmtT…).

const M = () => S.cat.mil;
const MY = () => S.st.castle.mil;
const RES4 = ['wood', 'stone', 'iron', 'food'];
const HQ = 2;
let UNIT_BY = null;
const unitById = (id) => { if (!UNIT_BY) UNIT_BY = Object.fromEntries(M().units.map((u) => [u.id, u])); return UNIT_BY[id]; };
// у орков нет своих спрайтов в клиенте: берутся похожие, ?orc красит их в зелёный (style.css)
const unitSrc = (u, race = S.st.user.race) => `${GFX}units/${u.race === 'all' && !u.img.includes('/') ? `${M().raceDir[race]}/${u.img}` : u.img}.png${u.race === 'orcs' || (u.race === 'all' && race === 'orcs' && !u.img.includes('/')) ? '?orc' : ''}`;
const uimg = (u, cls = 'ui') => `<img class="${cls}" src="${unitSrc(u)}" alt="">`;
const myUnitList = () => M().units.filter((u) => u.race === S.st.user.race || u.race === 'all');
const ART_ICON = { atk: 'smallicon/artefacts/artefakt_dragon.png', def: 'smallicon/artefacts/artefakt_spider.png', prod: 'smallicon/artefacts/artefakt_wampire_blood.png', speed: 'smallicon/artefacts/artefakt_bat.png', train: 'smallicon/magattack.png' };
const TYPE_NAME = { infantry: 'пехота', cavalry: 'кавалерия', magic: 'магия', siege: 'осада', special: 'особый' };
S.cnt = {}; S.army = null; S.reports = null; S.alliances = null;

function unitTrainSec(u) {
  const bl = Math.max(1, buildingLevel(u.building));
  return Math.max(1, Math.round(u.time * 0.9 ** (bl - 1) * MY().bonus.train / S.cat.speed));
}
function unitLock(u) {
  if (buildingLevel(u.building) < u.level) return `Нужно: ${S.by[u.building].name} ${u.level} ур.`;
  for (const [id, l] of Object.entries(u.req)) if (buildingLevel(Number(id)) < l) return `Нужно: ${S.by[id].name} ${l} ур.`;
  if (u.id === M().generalId && (MY().general || MY().training.some((t) => t.unit === u.id))) return 'Генерал в замке может быть только один.';
  return null;
}
function unitMax(u) {
  let n = Infinity;
  for (const r of RES4) if (u.cost[r]) n = Math.min(n, Math.floor(resNow(r) / u.cost[r]));
  if (u.pop) n = Math.min(n, Math.floor(S.st.castle.res.people / u.pop));
  if (u.id === M().generalId) n = Math.min(n, 1);
  return Math.max(0, n === Infinity ? 0 : n);
}
function unitStatsHtml(u) {
  return `<div class="grid4"><div><small>Атака</small>${u.attack}${u.magic ? `<br>маг ${u.magic}` : ''}</div>
    <div><small>Защита п/к/м</small>${u.def.inf}/${u.def.cav}/${u.def.mag}</div>
    <div><small>Скорость</small>${u.speed} кл/ч</div><div><small>Груз</small>${u.carry}</div></div>
    <div class="chips">${RES4.map((r) => `<span data-need="${r}:${u.cost[r]}">${RES_IC[r]} ${fmtFull(u.cost[r])}</span>`).join('')}
    <span>${RES_IC.people} ${u.pop}</span><span>${TIME_IC} ${fmtT(unitTrainSec(u))}</span><span>еда ${u.upkeep}/ч</span></div>`;
}

// ---------- эффекты зданий (что даёт уровень) ----------
function milEffect(def, L) {
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  const train = () => ({ text: `тренировка быстрее на ${pct(1 - 0.9 ** (L - 1))}`, short: `−${pct(1 - 0.9 ** (L - 1))}` });
  const wallPer = { humans: 0.03, elves: 0.035, dwarves: 0.02 }[S.st.user.race] || 0.03;
  const fx = {
    2: () => ({ text: 'армии, генерал, бунтари; отправка войск', short: 'армии' }),
    3: train, 12: train, 20: train, 23: train,
    4: () => ({ text: `обмен по курсу ${Math.min(1, 0.7 + 0.015 * L).toFixed(2)}, торговцы`, short: `курс ${Math.min(1, 0.7 + 0.015 * L).toFixed(2)}` }),
    11: () => ({ text: `+${pct(0.015 * L)} атаки и защиты войск`, short: `+${pct(0.015 * L)}` }),
    13: () => ({ text: `альянс: вступление с 1 ур., создание с 3 ур., мест ${3 * L}`, short: `${3 * L} мест` }),
    14: () => ({ text: 'обучение мудрецов (ускоряют науку)', short: 'мудрецы' }),
    15: () => ({ text: `науки до ${L} уровня`, short: `науки ${L}` }),
    16: () => ({ text: `археологи, +${3 * L}% к находке артефакта`, short: `+${3 * L}%` }),
    17: () => ({ text: `экспедиции в руины, +${2 * L}% к находке`, short: `+${2 * L}%` }),
    18: () => ({ text: `активных артефактов: ${1 + Math.floor(L / 3)}`, short: `${1 + Math.floor(L / 3)} слота` }),
    19: () => ({ text: `+${10 * L}% груза и скорости торговцев`, short: `+${10 * L}%` }),
    21: () => ({ text: `+${5 * L}% к контрразведке${L >= 5 ? ', виден состав входящих армий' : ''}`, short: `+${5 * L}%` }),
    22: () => ({ text: `+${pct(wallPer * L)} к защите, +${10 * L} обороны`, short: `+${pct(wallPer * L)}` }),
    24: () => ({ text: 'путешественники (основание замков — позже)', short: '' }),
    25: () => ({ text: `религия: +${L}% к её бонусу`, short: `+${L}%` }),
    26: () => { const h = Math.round(200 * 1.3 ** (L - 1)) * (S.st.user.race === 'dwarves' ? 2 : 1); return { text: `прячет ${fmtFull(h)} каждого ресурса от грабежа`, short: fmtN(h) }; },
    38: () => ({ text: 'призыв легендарных юнитов', short: '' }),
    39: () => ({ text: `+${2 * L}% магической атаки и защиты`, short: `+${2 * L}%` }),
    40: () => ({ text: `−${5 * L}% урона от катапульт`, short: `−${5 * L}%` }),
    41: () => ({ text: `+${L}% к атаке (боевой дух)`, short: `+${L}%` }),
    42: () => ({ text: 'найм наёмников: Великан, Валькирия', short: '' }),
    43: () => ({ text: `тренировка быстрее на ${2 * L}%`, short: `−${2 * L}%` }),
    44: () => ({ text: `хранит ${3 + L} артефактов`, short: `${3 + L}` }),
    45: () => ({ text: `+${5 * L}% к контрразведке; Око и Тень`, short: `+${5 * L}%` }),
  }[def.id];
  return fx ? fx() : null;
}

// ---------- функции здания (в шторке здания, ниже улучшения) ----------
function buildingFunctions(def, lvl) {
  if (!lvl || !S.cat.mil) return '';
  let h = '';
  if (def.id === HQ) h += hqHtml();
  if (def.id === 4) h += marketHtml();
  if (def.id === 13) h += embassyHtml();
  if (def.id === 15 || def.id === 14) h += universityHtml(def.id);
  if (def.id === 25) h += templeHtml();
  if (def.id === 17) h += `<div class="section">Экспедиции</div><div class="card"><p class="small">Археологи ищут артефакты в руинах. На карте мира нажмите на <b>Заброшенный замок</b> → «Экспедиция».
    Шанс находки: 20% + 5% за археолога + 3% за ур. Лагеря археологов + 2% за ур. Экспедиции.</p>
    <p class="small">Археологов в замке: <b>${MY().units[230] || 0}</b></p></div>`;
  if (def.id === 18 || def.id === 44) h += artifactsHtml();
  if (def.id === 24) h += '<div class="card small">Путешественники основывают новые замки — эта функция в разработке.</div>';
  const units = myUnitList().filter((u) => u.building === def.id);
  if (units.length) h += trainHtml(def, units);
  return h;
}

function trainHtml(def, units) {
  const jobs = MY().training.filter((t) => t.building === def.id);
  return `<div class="section">Тренировка</div>
    ${jobs.map((t) => { const u = unitById(t.unit), end = t.start + t.each * t.count; return `<div class="card job">${uimg(u, 'ui s')}
      <div class="grow"><b>${esc(u.name)} ×${t.count}</b> <span class="muted small">готово ${t.done}</span>
      <div class="bar"><i data-s="${t.start}" data-e="${end}"></i></div></div><span class="cd" data-e="${end}"></span></div>`; }).join('')}
    ${units.map((u) => { const lock = unitLock(u), n = S.cnt[u.id] || 1; return `<div class="card unit">
      <div class="top">${uimg(u)}<div class="grow"><b>${esc(u.name)}</b><span class="muted small">${TYPE_NAME[u.type] || ''} · в замке: ${u.id === M().generalId ? (MY().general ? 1 : 0) : MY().units[u.id] || 0}</span></div></div>
      ${unitStatsHtml(u)}
      ${lock ? `<p class="reasons">${esc(lock)}</p>` : `<div class="trainrow"><button class="btn small" data-cnt="${u.id}:-1">−</button>
        <input type="number" inputmode="numeric" min="1" value="${n}" data-cnt-input="${u.id}"><button class="btn small" data-cnt="${u.id}:1">+</button>
        <button class="btn small" data-max="${u.id}">MAX</button><button class="btn primary small" data-train="${u.id}">Тренировать</button></div>`}
    </div>`; }).join('')}`;
}

function unitsListHtml(units, empty = 'нет') {
  const rows = Object.entries(units || {}).filter(([, n]) => n > 0).map(([id, n]) => { const u = unitById(id); return u ? `<span class="uc">${uimg(u, 'ui xs')} ${esc(u.name)} <b>${fmtFull(n)}</b></span>` : ''; });
  return rows.length ? `<div class="ulist">${rows.join('')}</div>` : `<p class="muted small">${empty}</p>`;
}

function hqHtml() {
  const my = MY(), g = my.general, need = (l) => 100 * l * l;
  const gu = unitById(M().generalId);
  let gen;
  if (!g) gen = '<p class="small">Генерала нет — наймите его ниже. Генерал ведёт армию: +1% к атаке за уровень, опыт — за убитых врагов, только с ним захватываются оазисы.</p>';
  else {
    const st = g.dead ? (g.reviveAt ? `воскресает: <span class="cd" data-e="${g.reviveAt}"></span>` : 'погиб') : g.away ? 'в походе' : 'в замке';
    gen = `<div class="top">${uimg(gu)}<div class="grow"><b>Генерал ${g.level} ур.</b><span class="muted small">${st} · опыт ${fmtFull(g.exp)} / ${fmtFull(need(g.level))}</span>
      <div class="bar"><i style="width:${Math.min(100, g.exp / need(g.level) * 100)}%"></i></div></div></div>
      <p class="small">+${g.level}% к атаке армии, в которой идёт; в замке — +${g.level}% к защите.</p>
      ${g.dead && !g.reviveAt ? `<div class="chips">${RES4.map((r) => `<span>${RES_IC[r]} ${fmtFull(Math.round(gu.cost[r] * 0.5 * g.level))}</span>`).join('')}</div><button class="btn primary" data-revive>Воскресить</button>` : ''}`;
  }
  const armies = my.armies.map((a) => `<div class="card job"><div class="grow"><b>${M().missions[a.mission]} → ${a.x}:${a.y}</b>
      <span class="muted small">${a.state === 'go' ? 'идёт к цели' : 'возвращается'}${a.general ? ' · с генералом' : ''}${a.loot ? ` · добыча ${RES4.map((r) => a.loot[r] || 0).join('/')}` : ''}</span>
      ${unitsListHtml(a.units, '')}<div class="bar"><i data-s="${a.state === 'go' ? a.depart : a.arrive}" data-e="${a.state === 'go' ? a.arrive : a.back}"></i></div></div>
      <span class="cd" data-e="${a.state === 'go' ? a.arrive : a.back}"></span></div>`).join('') || '<p class="muted small">Армий в походе нет.</p>';
  const inc = my.incoming.map((a) => `<div class="card job ${a.mission === 'trade' ? '' : 'danger'}"><div class="grow"><b>${M().missions[a.mission]} от ${esc(a.from)}</b>
      ${a.units ? unitsListHtml(a.units, '') : '<span class="muted small">состав виден с Караульной башней 5 ур.</span>'}</div><span class="cd" data-e="${a.arrive}"></span></div>`).join('') || '<p class="muted small">Входящих армий нет.</p>';
  const loy = S.st.castle.loyalty;
  return `<div class="section">Лояльность замка</div><div class="card"><div class="bloy"><div class="bar"><i style="width:${loy}%"></i></div><b>${loy} / 100</b></div>
      <p class="small muted">${S.st.castle.capital ? 'Столицу захватить нельзя.' : 'Если лояльность упадёт до 0 от вражеских Бунтарей — замок захватят.'} Восстанавливается сама, быстрее с Храмом.</p></div>
    <div class="section">Генерал</div><div class="card unit">${gen}</div>
    <div class="section">Войска в замке</div><div class="card">${unitsListHtml(my.units, 'Войск нет — тренируйте их в Казарме, Конюшне, Академии магов…')}
      <p class="small muted">Содержание: ${fmtFull(my.upkeep)} еды/ч · атака ×${my.bonus.atk.toFixed(2)} · защита ×${my.bonus.def.toFixed(2)}</p>
      <div class="btns"><button class="btn primary" data-armyopen>Отправить войска</button><button class="btn" data-reports>Отчёты${my.unreadReports ? ` (${my.unreadReports})` : ''}</button></div></div>
    <div class="section">Армии в пути</div>${armies}
    <div class="section">Входящие</div>${inc}`;
}

function marketHtml() {
  const my = MY(), rate = my.bonus.marketRate;
  const opt = (sel) => RES4.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${RES_NAME[r]}</option>`).join('');
  return `<div class="section">Обмен ресурсов</div><form class="card stack" data-form="exchange">
      <div class="row2"><label>Отдать<select name="from">${opt('wood')}</select></label><label>Получить<select name="to">${opt('iron')}</select></label></div>
      <input name="amount" type="number" inputmode="numeric" min="1" placeholder="Сколько отдать" required>
      <p class="small muted">Курс ${rate.toFixed(2)} (растёт с уровнем Рынка, максимум 1:1).</p><button class="btn primary">Обменять</button></form>
    <div class="section">Торговцы</div><div class="card"><p class="small">В замке торговцев: <b>${my.units[221] || 0}</b>, каждый везёт ${Math.floor(unitById(221).carry * my.bonus.tradeCarry)}.</p>
      <button class="btn" data-armyopen="trade">Отправить ресурсы</button></div>`;
}

function embassyHtml() {
  const al = MY().alliance, L = buildingLevel(13);
  if (!S.alliances) { S.alliances = []; send({ t: 'alliances' }); }
  if (al) return `<div class="section">Альянс</div><div class="card"><h4 style="margin:0 0 6px">${esc(al.name)} [${esc(al.tag)}]</h4>
    <p class="small">Участники: ${al.members.map(esc).join(', ')}</p><button class="btn" data-alleave>Выйти из альянса</button></div>`;
  return `<div class="section">Альянсы</div>
    <form class="card stack" data-form="aljoin"><input name="tag" placeholder="Тег альянса (например KRL)" autocapitalize="characters" required><button class="btn primary">Вступить</button></form>
    ${L >= 3 ? `<form class="card stack" data-form="alcreate"><input name="name" placeholder="Название" required><input name="tag" placeholder="Тег (2–5 букв)" autocapitalize="characters" required><button class="btn">Создать альянс</button></form>` : '<p class="small muted">Создать свой альянс можно с Посольством 3 ур.</p>'}
    <div class="list">${(S.alliances || []).map((a) => `<div class="row"><div class="grow"><b>${esc(a.name)} [${esc(a.tag)}]</b><span>глава ${esc(a.leader)} · участников ${a.members}</span></div></div>`).join('')}</div>`;
}

function universityHtml(id) {
  const my = MY(), uni = buildingLevel(15), sages = my.units[227] || 0;
  if (id === 14) return `<div class="card small">Мудрецы ускоряют исследования в Университете: −2% времени за каждого в замке (до −50%). Сейчас: ${sages}.</div>`;
  const r = my.research;
  return `<div class="section">Науки</div>
    ${r ? `<div class="card job"><div class="grow"><b>Изучается: ${esc(M().sciences[r.sci].name)} ${r.level} ур.</b><div class="bar"><i data-s="${r.start}" data-e="${r.end}"></i></div></div><span class="cd" data-e="${r.end}"></span></div>` : ''}
    ${Object.entries(M().sciences).map(([k, s]) => { const l = my.sciences[k], n = l + 1, can = n <= uni && !r;
      const sec = Math.max(3, Math.round(M().scienceTime[Math.min(20, n)] * Math.max(0.5, 1 - 0.02 * sages) / S.cat.speed));
      return `<div class="card unit"><div class="top">${gimg(`smallicon/${s.icon}.png`, 'ui s')}<div class="grow"><b>${esc(s.name)} ${l} ур.</b><span class="muted small">${esc(s.desc)}</span></div></div>
      ${n > 20 ? '<p class="small">Максимум.</p>' : `<div class="chips">${RES4.map((q) => `<span data-need="${q}:${M().scienceCost[n][q]}">${RES_IC[q]} ${fmtFull(M().scienceCost[n][q])}</span>`).join('')}<span>${TIME_IC} ${fmtT(sec)}</span></div>
      ${n > uni ? `<p class="reasons">Нужен Университет ${n} ур.</p>` : `<button class="btn primary small" data-sci="${k}" ${can ? '' : 'disabled'}>Изучить ${n} ур.</button>`}`}</div>`; }).join('')}`;
}

function templeHtml() {
  const rel = MY().religion, L = buildingLevel(25);
  if (rel) return `<div class="section">Религия</div><div class="card"><b>${esc(M().religions[rel].name)}</b><p class="small">${esc(M().religions[rel].desc)} — сейчас +${L}%.</p></div>`;
  return `<div class="section">Выбор религии (один раз)</div>${Object.entries(M().religions).map(([k, r]) => `<div class="card"><b>${esc(r.name)}</b><p class="small">${esc(r.desc)}</p><button class="btn primary small" data-religion="${k}">Принять</button></div>`).join('')}`;
}

function artifactsHtml() {
  const my = MY(), active = my.artifacts.filter((a) => a.active).length;
  return `<div class="section">Артефакты</div><p class="small muted">Активно ${active} из ${my.bonus.artSlots} (Башня артефактов), хранится ${my.artifacts.length} из ${my.bonus.artStore} (Сокровищница).</p>
    ${my.artifacts.map((a) => { const t = M().artifacts[a.type], r = M().rarity[a.rarity]; return `<div class="card unit"><div class="top">${gimg(ART_ICON[a.type] || 'smallicon/magattack.png', 'ui s')}
      <div class="grow"><b>${esc(t.name)}</b><span class="muted small">${r.name}: +${Math.round(r.bonus * 100)}% — ${esc(t.desc)}${a.active ? ' · активен' : ''}</span></div>
      <button class="btn small ${a.active ? '' : 'primary'}" data-art="${a.id}" data-on="${a.active ? 0 : 1}">${a.active ? 'Снять' : 'Активировать'}</button></div></div>`; }).join('') || '<p class="muted small">Артефактов нет — их находят экспедиции археологов.</p>'}`;
}

// ---------- отправка войск ----------
const MISSION_ROLES = {
  attack: (u) => !['merchant', 'archaeologist', 'sage', 'settler'].includes(u.role),
  raid: (u) => !['merchant', 'archaeologist', 'sage', 'settler'].includes(u.role),
  scout: (u) => ['scout', 'eye'].includes(u.role),
  expedition: (u) => u.role === 'archaeologist',
  trade: (u) => u.role === 'merchant',
};
function openArmySheet(pre = {}) {
  S.army = { x: pre.x ?? '', y: pre.y ?? '', mission: pre.mission || 'raid', units: {}, general: false, res: {} };
  openSheet(armyHtml);
}
function armySec() {
  const a = S.army, c = S.st.castle, speeds = [];
  for (const [id, n] of Object.entries(a.units)) if (n > 0) speeds.push(unitById(id).speed);
  if (a.general) speeds.push(unitById(M().generalId).speed);
  if (!speeds.length || a.x === '' || a.y === '') return null;
  const b = MY().bonus, v = Math.min(...speeds) * b.speed * (a.mission === 'trade' ? b.tradeCarry : 1);
  return Math.max(5, Math.round(Math.hypot(Number(a.x) - c.x, Number(a.y) - c.y) / v * 3600 / S.cat.speed));
}
function armyHtml() {
  const a = S.army, my = MY(), g = my.general;
  const avail = Object.entries(my.units).map(([id, n]) => [unitById(id), n]).filter(([u, n]) => u && n > 0 && MISSION_ROLES[a.mission](u));
  const sec = armySec();
  return `<div class="sh-head"><div class="big">${bimg(HQ)}</div><div><h3>Военный штаб: отправка</h3><div class="muted small">Из замка ${S.st.castle.x}:${S.st.castle.y}</div></div></div>
    <div class="pills">${Object.entries(M().missions).map(([k, t]) => `<button data-mission="${k}" class="${a.mission === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="row2" style="margin:10px 0"><label>X<input type="number" inputmode="numeric" data-af="x" value="${esc(a.x)}"></label><label>Y<input type="number" inputmode="numeric" data-af="y" value="${esc(a.y)}"></label></div>
    <div class="list">${avail.map(([u, n]) => `<div class="row">${uimg(u, 'ui s')}<div class="grow"><b>${esc(u.name)}</b><span>в замке ${fmtFull(n)}</span></div>
      <input class="num" type="number" inputmode="numeric" min="0" max="${n}" value="${a.units[u.id] || ''}" placeholder="0" data-au="${u.id}"><button class="btn small" data-amax="${u.id}">все</button></div>`).join('') || '<p class="muted small">Нет подходящих войск для этой миссии.</p>'}</div>
    ${['attack', 'raid'].includes(a.mission) && g && !g.dead && !g.away ? `<label class="check"><input type="checkbox" data-agen ${a.general ? 'checked' : ''}> Генерал ${g.level} ур. идёт с армией</label>` : ''}
    ${a.mission === 'trade' ? `<div class="row2">${RES4.map((r) => `<label>${RES_IC[r]}<input type="number" inputmode="numeric" min="0" data-ares="${r}" value="${a.res[r] || ''}" placeholder="0"></label>`).join('')}</div>` : ''}
    <p class="small">В пути: <b id="armyTime">${sec ? fmtT(sec) : '—'}</b></p>
    <button class="btn primary" data-asend>Отправить</button>`;
}
function armyPreview() { const el = $('#armyTime'); if (el) { const s = armySec(); el.textContent = s ? fmtT(s) : '—'; } }

// ---------- отчёты ----------
function openReports() { S.reports = null; send({ t: 'reports' }); openSheet(reportsHtml); }
function reportsHtml() {
  return `<div class="sh-head"><div class="big">${gimg('smallicon/swordgreen.png')}</div><div><h3>Отчёты</h3><div class="muted small">Бои, разведка, торговля, экспедиции</div></div></div>
    <div class="list">${!S.reports ? '<p class="muted">Загрузка…</p>' : S.reports.map((r) => `<button class="row" data-report="${r.id}"><div class="grow"><b style="${r.read ? 'font-weight:400' : ''}">${esc(r.title)}</b><span>${fmtDate(r.at)}</span></div>›</button>`).join('') || '<p class="muted">Отчётов пока нет.</p>'}</div>`;
}
// боевой отчёт: результат, стороны с потерями по юнитам, добыча, разрушения, лояльность и захват
function reportHtml(r) {
  const d = r.data;
  if (!d || d.type !== 'battle') return `${ribbon(r.title)}<div class="rep-date">${fmtDate(r.at)}</div><div class="letter">${r.lines.map(esc).join('\n')}</div>`;
  const mine = d.side === 'att' ? d.win : !d.win; // победа с точки зрения читателя отчёта
  const unitsTable = (units, race) => {
    const rows = Object.entries(units).map(([id, v]) => { const u = unitById(id); return u ? `<tr><td>${`<img class="ui xs" src="${unitSrc(u, race)}" alt="">`}</td><td class="un">${esc(u.name)}</td><td>${fmtFull(v.was)}</td><td class="bad">${v.lost ? `−${fmtFull(v.lost)}` : '0'}</td><td><b>${fmtFull(v.was - v.lost)}</b></td></tr>` : ''; }).join('');
    return rows ? `<table class="btab"><thead><tr><th></th><th>Юнит</th><th>Было</th><th>Погибло</th><th>Осталось</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="parch-note">Войск не было.</p>';
  };
  const side = (s, who) => `<div class="bside"><div class="bwho">${gimg(RACE_IMG[s.race] || 'units/human/general.png', 'rico')} <b>${who}: ${esc(s.login)}</b><small>${esc(s.castle || '')}</small></div>`;
  const loot = d.loot ? `<div class="bloot">${RES4.map((k) => `<span>${RES_IC[k]} ${fmtFull(d.loot[k])}</span>`).join('')}</div>` : '<p class="parch-note">Ничего не унесено.</p>';
  return `${ribbon(d.captured ? 'Захват замка' : r.data.side === 'def' ? 'Оборона' : M().missions[d.mission])}
    <div class="rep-date">${fmtDate(r.at)} · X: ${d.x} Y: ${d.y}</div>
    <div class="bres ${mine ? 'win' : 'lose'}">${mine ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</div>
    <div class="bpow">Сила атаки <b>${fmtFull(d.power.att)}</b> — сила обороны <b>${fmtFull(d.power.def)}</b></div>
    ${d.captured ? `<div class="bcap"><img src="${GFX}ground/castle.png" alt=""><div><b>Замок захвачен!</b><br>${esc(d.captured.name)} (X: ${d.captured.x}, Y: ${d.captured.y}) ${d.side === 'att' ? 'теперь ваш' : 'перешёл к врагу'}.</div></div>` : ''}
    <div class="section">Нападающий</div>${side(d.att, 'Игрок')}</div>
    ${unitsTable(d.att.units, d.att.race)}
    ${d.att.general ? `<p class="bgen">${gimg('units/human/general.png', 'rico')} Генерал ${d.att.general} ур. ${d.att.generalDied ? '<span class="bad">— пал в бою</span>' : '— в строю'}</p>` : ''}
    <div class="section">Защитник</div>
    ${d.def.npc ? `<div class="bside"><div class="bwho"><img class="rico" src="${GFX}ground/${GROUND[d.def.img] || 'grass'}.png" alt=""> <b>${esc(d.def.npc)}</b></div></div><p class="parch-note">Охрана потеряла ${d.def.lossPct}%.</p>`
      : `${side(d.def, 'Игрок')}</div>${unitsTable(d.def.units, d.def.race)}${d.def.wall ? `<p class="bgen">${gimg('fence/fence1.png', 'rico')} Забор ${d.def.wall} ур.</p>` : ''}`}
    <div class="section">Добыча</div>${loot}
    ${d.siege && d.siege.length ? `<div class="section">Разрушения</div><div class="pstats">${d.siege.map(esc).join('<br>')}</div>` : ''}
    ${d.loyalty ? `<div class="section">Лояльность</div><div class="bloy"><div class="bar"><i style="width:${d.loyalty.to}%"></i></div><b>${d.loyalty.from} → ${d.loyalty.to}</b></div>` : ''}
    ${d.capitalBlocked ? '<p class="parch-note">Столицу захватить нельзя — бунтари бессильны.</p>' : ''}`;
}

// ---------- админ — web/admin.js ----------

// ---------- мир: действия с объектом ----------
function worldActions(o, x, y) {
  const b = (m, t) => `<button class="btn ${m === 'attack' ? 'primary' : ''}" data-armyopen="${m}" data-ax="${x}" data-ay="${y}">${t}</button>`;
  if (o.kind === 'castle') {
    if (o.ownerId === S.st.user.id) return '';
    return `<div class="btns" style="margin-top:8px">${b('attack', 'Атака')}${b('raid', 'Набег')}</div><div class="btns" style="margin-top:8px">${b('scout', 'Разведка')}${b('trade', 'Торговля')}</div>`;
  }
  const npc = M().npc[o.img];
  if (!npc) return '<p class="muted small">Здесь пусто.</p>';
  return `<dl class="kv"><dt>Охрана</dt><dd>~${fmtFull(npc.def.inf)}</dd><dt>Запас</dt><dd>${RES4.map((r) => fmtN(npc.loot[r])).join(' / ')}</dd></dl>
    <div class="btns" style="margin-top:8px">${b('attack', 'Атака')}${b('raid', 'Набег')}${b('scout', 'Разведка')}</div>
    ${npc.ruins ? `<p class="small">Лояльность руин: <b>${o.loyalty ?? 100}</b>. Захват — <b>атака с Бунтарями</b>: каждый выживший бунтарь снижает лояльность на 20–30, при 0 руины станут вашим замком.</p>
      <div class="btns" style="margin-top:8px">${b('expedition', 'Экспедиция')}</div>` : ''}`;
}

// ---------- справочник войск (Ещё → Войска) ----------
function armyBookHtml() {
  const races = ['humans', 'elves', 'dwarves', 'orcs', 'all'];
  S.bookRace = S.bookRace || S.st.user.race;
  const list = M().units.filter((u) => u.race === S.bookRace);
  return `<div class="vhead"><button class="iconbtn" data-back>‹</button><h2>Войска</h2></div>
    <div class="pad" style="padding-top:8px"><div class="pills">${races.map((r) => `<button data-brace="${r}" class="${r === S.bookRace ? 'on' : ''}">${r === 'all' ? 'Общие' : esc(S.cat.races[r])}</button>`).join('')}</div>
    <div class="list" style="margin-top:8px">${list.map((u) => `<div class="card unit"><div class="top">${`<img class="ui" src="${unitSrc(u, S.bookRace === 'all' ? S.st.user.race : S.bookRace)}" alt="">`}<div class="grow"><b>${esc(u.name)}</b>
      <span class="muted small">${TYPE_NAME[u.type] || ''} · ${esc(S.by[u.building].name)} ${u.level} ур.</span></div></div>${unitStatsHtml(u)}</div>`).join('')}</div></div>`;
}

// ---------- события ----------
function milMsg(m) {
  if (m.t === 'alliances') { S.alliances = m.list; refreshSheet(); }
  if (m.t === 'reports') { S.reports = m.list; refreshSheet(); }
  if (m.t === 'report') openSheet(() => reportHtml(m.report));
}
function hqCell() { const i = S.st.castle.grid[0].indexOf(HQ); return i; }

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.cnt) { const [id, k] = d.cnt.split(':').map(Number); S.cnt[id] = Math.max(1, (S.cnt[id] || 1) + k); const i = $(`[data-cnt-input="${id}"]`); if (i) i.value = S.cnt[id]; return; }
  if (d.max) { const u = unitById(d.max); S.cnt[u.id] = Math.max(1, unitMax(u)); const i = $(`[data-cnt-input="${u.id}"]`); if (i) i.value = S.cnt[u.id]; return; }
  if (d.train) return send({ t: 'train', unit: Number(d.train), count: S.cnt[d.train] || 1 });
  if (d.revive !== undefined) return send({ t: 'general', op: 'revive' });
  if (d.armyopen !== undefined) return openArmySheet({ mission: d.armyopen || 'raid', x: d.ax !== undefined ? Number(d.ax) : '', y: d.ay !== undefined ? Number(d.ay) : '' });
  if (d.reports !== undefined) return openReports();
  if (d.report) return send({ t: 'report', id: Number(d.report) });
  if (d.mission) { S.army.mission = d.mission; S.army.units = {}; S.army.general = false; return refreshSheet(); }
  if (d.amax) { S.army.units[d.amax] = MY().units[d.amax] || 0; const i = $(`[data-au="${d.amax}"]`); if (i) i.value = S.army.units[d.amax]; return armyPreview(); }
  if (d.asend !== undefined) {
    const a = S.army;
    return send({ t: 'send', units: a.units, general: a.general, x: Number(a.x), y: Number(a.y), mission: a.mission, res: a.res });
  }
  if (d.sci) return send({ t: 'research', sci: d.sci });
  if (d.religion) return send({ t: 'religion', id: d.religion });
  if (d.art) return send({ t: 'artifact', id: Number(d.art), on: d.on === '1' });
  if (d.alleave !== undefined) return send({ t: 'alliance', op: 'leave' });
});
$('#sheetBody').addEventListener('input', (e) => {
  const d = e.target.dataset, v = e.target.value;
  if (d.cntInput) S.cnt[d.cntInput] = Math.max(1, Math.floor(Number(v)) || 1);
  if (!S.army) return;
  if (d.au) S.army.units[d.au] = Math.max(0, Math.floor(Number(v)) || 0);
  if (d.af) S.army[d.af] = v === '' ? '' : Number(v);
  if (d.ares) S.army.res[d.ares] = Math.max(0, Math.floor(Number(v)) || 0);
  armyPreview();
});
$('#sheetBody').addEventListener('change', (e) => { if (e.target.dataset.agen !== undefined && S.army) { S.army.general = e.target.checked; armyPreview(); } });
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.form;
  if (k === 'exchange') send({ t: 'exchange', from: f.from.value, to: f.to.value, amount: Number(f.amount.value) });
  if (k === 'aljoin') send({ t: 'alliance', op: 'join', tag: f.tag.value });
  if (k === 'alcreate') send({ t: 'alliance', op: 'create', name: f.name.value, tag: f.tag.value });
  if (['aljoin', 'alcreate'].includes(k)) S.alliances = null;
});
$('#sheetBody').addEventListener('click', (e) => { const b = e.target.closest('[data-brace]'); if (b) { S.bookRace = b.dataset.brace; refreshSheet(); } });
