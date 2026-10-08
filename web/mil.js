'use strict';
// Функции внутри зданий, армия, генерал, отчёты и админ-панель (сервер: server/src/army.js).
// Подключается после app.js и пользуется его общими функциями (S, send, openSheet, gimg, RES_IC, fmtT…).

const M = () => S.cat.mil;
const MY = () => S.st.castle.mil;
const RES4 = ['wood', 'stone', 'iron', 'food'];
const HQ = 2;
let UNIT_BY = null;
const unitById = (id) => { if (!UNIT_BY) UNIT_BY = Object.fromEntries(M().units.map((u) => [u.id, u])); return UNIT_BY[id]; };
// портреты юнитов: units/<раса>/hd/*.png, у каждой расы свои
const HD_DIR = { dwarves: 'dwarv/hd', orcs: 'orc/hd', elves: 'elf/hd', humans: 'human/hd' };
const unitSrc = (u, race = S.st.user.race) => `${GFX}units/${u.race === 'all' && !u.img.includes('/') ? `${HD_DIR[race] || 'human/hd'}/${u.img}` : u.img}.png`;
const uimg = (u, cls = 'ui') => `<img class="${cls}" src="${unitSrc(u)}" alt="">`;
const raceUnit = (u, race = S.st.user.race) => (u && u.raceOvr && u.raceOvr[race] ? { ...u, ...u.raceOvr[race] } : u); // цена общих юнитов по расе
const myUnitList = () => M().units.filter((u) => (u.race === S.st.user.race || u.race === 'all') && !u.notrain).map((u) => raceUnit(u));
const ART_ICON = { atk: 'smallicon/artefacts/artefakt_dragon.png', def: 'smallicon/artefacts/artefakt_spider.png', prod: 'smallicon/artefacts/artefakt_wampire_blood.png', speed: 'smallicon/artefacts/artefakt_bat.png', train: 'smallicon/magattack.png' };
const TYPE_NAME = { infantry: 'пехота', cavalry: 'кавалерия', magic: 'магия', siege: 'осада', special: 'особый' };
S.cnt = {}; S.army = null; S.reports = null; S.alliances = null;

function unitTrainSec(u) {
  return Math.max(1, Math.round(u.time * MY().bonus.train / S.cat.speed)); // уровень здания тренировку не ускоряет
}
// все условия тренировки юнита (как «Необходимо» в оригинале): основное здание + доп. требования
const unitNeeds = (u) => [[u.building, u.level], ...Object.entries(u.req).map(([id, l]) => [Number(id), l])].map(([id, l]) => ({ name: S.by[id].name, lvl: l, ok: buildingLevel(id) >= l }));
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
  if (u.id === 224 || u.id === 233) n = Math.min(n, 3); // за один заказ — не больше 3
  else if (MY().trainDay) n = Math.min(n, MY().trainDay.max - MY().trainDay.used);
  return Math.max(0, n === Infinity ? 0 : n);
}
function unitStatsHtml(u) {
  // улучшения Кузницы: +1 к базовой атаке/защите за уровень — показываем «база +N»
  const fg = (S.st && MY().forge && MY().forge[u.id]) || {}, fa = u.attack ? fg.a || 0 : 0, fd = fg.d || 0, fm = u.magic ? fg.m || 0 : 0, fmd = fg.md || 0;
  const plus = (n) => (n ? ` <b class="fplus">+${n}</b>` : '');
  return `<div class="grid4 g5"><div><small>Здоровье</small>${u.hp || '—'}</div><div><small>Атака</small>${u.attack}${plus(fa)}${u.magic ? `<br>маг ${u.magic}${plus(fm)}` : ''}</div>
    <div><small>Защита п/к/м</small>${u.def.inf}${plus(fd)}/${u.def.cav}${plus(fd)}/${u.def.mag}${plus(fmd)}</div>
    <div><small>Скорость</small>${u.speed} кл/ч</div><div><small>Груз</small>${u.carry}</div></div>
    ${u.wallDmg ? `<div class="small">Ущерб стене: <b>${u.wallDmg} ед.</b>${u.oneUse ? ' · исчезает после боя' : ''}</div>` : ''}${u.bldDmg ? `<div class="small">Ущерб зданиям: <b>${u.bldDmg} ед.</b></div>` : ''}
    <div class="chips">${RES4.map((r) => `<span data-need="${r}:${u.cost[r]}">${RES_IC[r]} ${fmtFull(u.cost[r])}</span>`).join('')}
    <span>${RES_IC.people} ${u.pop}</span><span>${TIME_IC} ${fmtT(unitTrainSec(u))}</span></div>`;
}

// ---------- эффекты зданий (что даёт уровень) ----------
function milEffect(def, L) {
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  const train = () => ({ text: `открывает новых воинов по мере роста уровня`, short: `${L} ур.` }); // уровень не ускоряет тренировку (как в оригинале)
  const wallPer = { humans: 0.03, elves: 0.035, dwarves: 0.02 }[S.st.user.race] || 0.03;
  const fx = {
    2: () => ({ text: 'армии, генерал, бунтари; отправка войск', short: 'армии' }),
    3: train, 12: train, 20: train, 23: train,
    4: () => ({ text: `обмен по курсу ${Math.min(1, 0.7 + 0.015 * L).toFixed(2)}, торговцы`, short: `курс ${Math.min(1, 0.7 + 0.015 * L).toFixed(2)}` }),
    11: () => ({ text: `улучшение атаки и защиты юнитов до ${L} ур.`, short: `до ${L} ур.` }),
    13: () => ({ text: `мест в альянсе: ${3 * L}`, short: `${3 * L} мест` }),
    14: () => ({ text: 'обучение ученых (ускоряют науку)', short: 'ученые' }),
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
  if (def.id === 0) return `<button class="rbar" data-wallwin>Стена${S.st.castle.wall ? ` · ${S.st.castle.wall} ур.` : ''}</button><button class="rbar" data-shieldopen>🛡 Защита</button>`; // Ратуша: стена замка (wall.js)
  if (def.id === 46) return residenceHtml(); // Резиденция: лояльность населения (residence.js)
  if (def.id === 11) return '<button class="rbar" data-forge>Юниты</button>' + upJobsHtml(11); // Кузница (forge.js)
  if (def.id === 39) return '<button class="rbar" data-magic>Юниты</button>' + upJobsHtml(39); // Школа магии (forge.js)
  if (def.id === 21) return '<button class="rbar" data-moves>Передвижения армий</button>'; // Караульная башня (watch.js)
  if (def.id === 45) return spyButtons() + trainJobsHtml(45); // Центр разведки: Возможности / Тренировать / Разведка (spy.js)
  if (def.id === HQ) h += hqHtml();
  if (def.id === 4) h += marketHtml();
  if (def.id === 13) h += diplomacyButtons();
  if (def.id === 15) return `<button class="rbar" data-scilist>Науки</button>${sciJob()}`; // Университет (science.js)
  if (def.id === 14) h += universityHtml(def.id);
  if (def.id === 25) h += templeHtml();
  if (def.id === 17) h += expedHtml();
  if (def.id === 18 || def.id === 44) h += artifactsHtml();
  if (def.id === 24) h += `<div class="section">Бунтари</div><div class="card small">Количество доступных бунтарей является общим для всего Королевства, и зависит от количества лояльности для захвата последующих замков.</div>
    <div class="card small">Бунтарей и путешественников — не больше 3 за один заказ. «Освоение»: армия, в которой 10 путешественников, строит новый замок на пустой клетке карты 3 дня (нажмите на пустую клетку → «Основать замок»).</div>`;
  const units = myUnitList().filter((u) => u.building === def.id);
  // как в оригинале: кнопка «Тренировать» открывает окно «Постройка юнитов», ниже — «Юниты:» с идущими партиями
  if (units.length && def.id !== HQ) h += // генерал — через «Генерал» (general.js), как в оригинале
    `<button class="rbar" data-trainopen="${def.id}">Тренировать</button>${trainJobsHtml(def.id)}`; // в штабе — только чтобы нанять генерала, если его нет
  return h;
}
// «Юниты:» — партии в тренировке: «Мародер 8/402 · Осталось 23:17:25» (готово/всего, время до конца партии)
function trainJobsHtml(bid) {
  const jobs = MY().training.filter((t) => t.building === bid);
  return jobs.length ? `${ribbon('Юниты:')}${jobs.map((t) => { const u = unitById(t.unit), end = t.start + t.each * t.count;
    return `<div class="upjob"><img src="${unitSrc(u)}" alt=""> ${esc(u.name)} ${t.done}/${t.count}<br>Осталось <img class="ri" src="${GFX}res/time.png" alt=""> <span class="cd" data-e="${end}"></span></div>`; }).join('')}` : '';
}
function trainWin(bid) {
  const units = myUnitList().filter((u) => u.building === bid);
  return `${ribbon('Постройка юнитов')}${units.length ? trainHtml(S.by[bid], units) : '<p class="parch-note">Нет юнитов для тренировки.</p>'}`;
}

function trainHtml(def, units) {
  return `
    ${units.map((u) => trainCard(u)).join('')}`;
}
// карточка тренировки — как «Постройка юнитов» в оригинале: параметры значками, зелёная плашка стоимости,
// «Количество: N /макс», ползунок (картинки ProgressBar из клиента) и кнопка «Тренировать»
const STAT_IC = (f) => `<img src="${GFX}smallicon/${f}.png" alt="">`;
function trainCard(u) {
  const lock = unitLock(u), max = unitMax(u), n = Math.min(S.cnt[u.id] ?? 0, max); // как в оригинале: по умолчанию 0
  const fg = (MY().forge && MY().forge[u.id]) || {}, plus = (v, k) => v + (k || 0);
  return `<div class="tcard"><div class="tname">${esc(u.name)}</div>${uimg(u, 'timg')}
    <div class="tparams-h">Параметры юнита:</div>
    <div class="tparams"><div>${STAT_IC('health')}<b>${u.hp}</b></div><div>${STAT_IC('phiattack')}<b>${plus(u.attack, u.attack ? fg.a : 0)}</b></div><div>${STAT_IC('magattack')}<b>${plus(u.magic, u.magic ? fg.m : 0)}</b></div>
      <div>${STAT_IC('phidef')}<b>${plus(u.def.inf, fg.d)}</b></div><div>${STAT_IC('magdef')}<b>${plus(u.def.mag, fg.md)}</b></div><div>${STAT_IC('speed')}<b>${u.speed}</b></div><div>${STAT_IC('carry')}<b>${u.carry}</b></div></div>
    <div class="tcost"><div class="tcost-h">Стоимость тренировки:</div><div class="tcost-r">${RES4.map((r) => `<span data-need="${r}:${u.cost[r]}">${RES_IC[r]}<b>${fmtFull(u.cost[r])}</b></span>`).join('')}
      <span>${RES_IC.people}<b>${u.pop}</b></span><span>${TIME_IC}<b>${fmtT(unitTrainSec(u))}</b></span></div></div>
    ${lock ? `<div class="needlist"><div class="needhead">Необходимо:</div>${unitNeeds(u).map((x) => `<div class="need ${x.ok ? 'ok' : ''}">${x.ok ? '✔' : '✖'} ${esc(x.name)} ${x.lvl} ур.</div>`).join('')}${unitNeeds(u).every((x) => x.ok) ? `<p class="reasons">${esc(lock)}</p>` : ''}</div>`
    : `<div class="tqty">Количество: <input type="number" inputmode="numeric" min="0" max="${max}" value="${n}" data-cnt-input="${u.id}"> /${max}</div>
    <input type="range" class="tslider" min="0" max="${Math.max(1, max)}" value="${n}" data-cnt-range="${u.id}" style="--p:${max ? n / max * 100 : 0}%" ${max ? '' : 'disabled'}>
    <button class="pbar tbtn" data-train="${u.id}" ${max ? '' : 'disabled'}>Тренировать</button>`}</div>`;
}


// Военный штаб — как в оригинале (видео): кнопки Армии, Симулятор, Генерал, Расписание походов, Обзор армий, Учения
function hqHtml() {
  return `<button class="rbar" data-armies>Армии</button><button class="rbar" data-hq="sim">Симулятор</button>
    <button class="rbar" data-general>Генерал</button><button class="rbar ${isPrem() ? '' : 'rlock'}" data-hq="sched">${isPrem() ? '' : '🔒 '}Расписание походов</button>
    <button class="rbar" data-moves>Обзор армий</button><button class="rbar" data-hq="drill">Учения</button>`;
}
// «Расписание походов» — армии, отправленные по расписанию и ещё не вышедшие
function schedWin() {
  const list = (MY().armies || []).filter((a) => a.state === 'wait');
  return `${ribbon('Расписание походов')}${list.map((a) => `<div class="arow2"><div class="aicon"><img class="aswords" src="${G3}menu/swords.svg" alt=""></div><div class="ainfo">
    <div class="aname">${M().missions[a.mission]} ${a.x}:${a.y}</div><div class="acount"><img src="${G3}hq/helmet.png" alt=""> ${fmtFull(Object.values(a.units).reduce((q, n) => q + n, 0))} · выйдет через <span class="cd" data-e="${a.depart}"></span></div></div></div>`).join('') || '<p class="parch-note">Запланированных походов нет.</p>'}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-hq]'); if (!t) return;
  const k = t.dataset.hq;
  if (k === 'sched' && !isPrem()) return toast('Расписание походов — только с премиумом.', 'err');
  if (k === 'sched') return openSheet(schedWin);
  if (k === 'sim') return openSoon('Симулятор');
  if (k === 'drill') return openSoon('Учения');
});

// Рынок — как в оригинале: груз и скорость торговца, «Передать», «Бартер» (обмен), «Торговцы»
function marketHtml() {
  const m = MY().merchants || { total: 0, free: 0, away: 0, carry: 0, speed: 0 };
  return `<div class="bwline">Торговый центр замка.</div>
    <div class="bwline">Количество ресурсов переносимых одним торговцем <img class="fi" src="${G3}menu/basket.svg" alt=""> <b>${fmtFull(m.carry)}</b> ед.</div>
    <div class="bwline">Скорость торговца ▶▶ <b>${m.speed * (S.cat.march || 1)}</b> полей/час</div>
    <button class="pbar" data-mkt="give">Передать</button>
    <button class="pbar" data-mkt="barter">Бартер</button>
    <button class="pbar" data-mkt="merch">Торговцы</button>`;
}
// время в пути торговцев до X:Y (как на сервере: расстояние / скорость)
function mktSec(g) {
  const m = MY().merchants, c = S.st.castle; if (g.x === '' || g.y === '' || !m.speed) return 0;
  const own = (S.st.castles || []).some((k) => k.x === Number(g.x) && k.y === Number(g.y)) ? 3 : 1; // свои замки — втрое быстрее
  const d = Math.hypot(Number(g.x) - c.x, Number(g.y) - c.y); return d ? Math.min(Math.max(5, Math.round(600 / S.cat.speed)), Math.max(5, Math.round(d / (m.speed * own * (S.cat.march || 1)) * 3600 / S.cat.speed))) : 0; // не дольше 10 минут
}
const mktTime = (g) => { const s = mktSec(g); return s ? `${fmtT(s)} <small>(обратно столько же)</small>` : '—'; };
function mktGiveWin() {
  const m = MY().merchants, g = S.mkt || (S.mkt = { x: '', y: '', res: {} });
  const total = RES4.reduce((s, r) => s + (Number(g.res[r]) || 0), 0), need = m.carry ? Math.ceil(total / m.carry) : 0;
  return `${ribbon('Передать')}
    <div class="bwline">Свободных торговцев: <b>${m.free}</b> из ${m.total} · каждый везёт <b>${fmtFull(m.carry)}</b></div>
    ${(S.st.castles || []).filter((c) => !c.active).length ? `<div class="mkown"><span>Мои замки:</span>${S.st.castles.filter((c) => !c.active).map((c) => `<button class="${String(g.x) === String(c.x) && String(g.y) === String(c.y) ? 'on' : ''}" data-mkown="${c.x},${c.y}">${esc(c.name)} <small>${c.x}:${c.y}</small></button>`).join('')}</div>` : ''}
    <div class="row2 cxy"><label>X<input type="number" inputmode="numeric" data-mkx="x" value="${esc(g.x)}"></label><label>Y<input type="number" inputmode="numeric" data-mkx="y" value="${esc(g.y)}"></label></div>
    <div class="row2">${RES4.map((r) => `<label>${RES_IC[r]}<input type="number" inputmode="numeric" min="0" data-mkr="${r}" value="${g.res[r] || ''}" placeholder="0"></label>`).join('')}</div>
    <div class="cinfo">Понадобится торговцев: <b id="mkNeed" class="${need > m.free ? 'bad' : ''}">${need}</b></div>
    <div class="cinfo">Доставка: <b id="mkTime">${mktTime(g)}</b> · скорость ${m.speed * (S.cat.march || 1)} полей/час, в свои замки — ${m.speed * 3 * (S.cat.march || 1)}, не дольше 10 минут</div>
    <button class="pbar" data-mkt="send">Отправить</button>`;
}
function mktMerchWin() {
  const m = MY().merchants;
  return `${ribbon('Торговцы')}<div class="bwline">Всего торговцев: <b>${m.total}</b></div><div class="bwline">Свободных: <b>${m.free}</b></div>
    <div class="bwline">Зарезервированных: <b>${m.reserved}</b></div><div class="bwline">В пути: <b>${m.away}</b></div>
    <p class="small muted">Торговцы не тренируются и не участвуют в боях — при Рынке их всегда 20. Груз — 45 ед. за уровень Рынка (20 ур. — 900 ед.), скорость — ${(m.speed || 60) * (S.cat.march || 1)} полей/час.</p>`;
}
function mktBarterWin() {
  const opt = (sel) => RES4.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${RES_NAME[r]}</option>`).join('');
  return `${ribbon('Бартер')}<form class="card stack" data-form="exchange">
      <div class="row2"><label>Отдать<select name="from">${opt('wood')}</select></label><label>Получить<select name="to">${opt('iron')}</select></label></div>
      <input name="amount" type="number" inputmode="numeric" min="1" placeholder="Сколько отдать" required data-bxamt>
      <p class="small muted">Курс 2,5 : 1 — отдаёте 2,5 единицы, получаете 1.</p><p class="bxgot" data-bxgot>Получите: <b>0</b></p><button class="btn primary">Обменять</button></form>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const own = e.target.closest('[data-mkown]');
  if (own) { const [x, y] = own.dataset.mkown.split(','); S.mkt.x = x; S.mkt.y = y; return refreshSheet(); }
  const t = e.target.closest('[data-mkt]'); if (!t) return;
  const k = t.dataset.mkt;
  if (k === 'give') { S.mkt = null; return openSheet(mktGiveWin); }
  if (k === 'merch') return openSheet(mktMerchWin);
  if (k === 'barter') return openSheet(mktBarterWin);
  if (k === 'send') { const g = S.mkt; return send({ t: 'send', mission: 'trade', x: Number(g.x), y: Number(g.y), res: g.res }); }
});
$('#sheetBody').addEventListener('input', (e) => {
  const d = e.target.dataset; if (!S.mkt || (d.mkx === undefined && d.mkr === undefined)) return;
  if (d.mkx) S.mkt[d.mkx] = e.target.value; else S.mkt.res[d.mkr] = Math.max(0, Math.floor(Number(e.target.value)) || 0);
  const m = MY().merchants, total = RES4.reduce((s, r) => s + (Number(S.mkt.res[r]) || 0), 0), need = m.carry ? Math.ceil(total / m.carry) : 0, el = $('#mkNeed');
  if (el) { el.textContent = need; el.classList.toggle('bad', need > m.free); }
  const tm = $('#mkTime'); if (tm) tm.innerHTML = mktTime(S.mkt);
});


function universityHtml(id) {
  const my = MY(), uni = buildingLevel(15), sages = my.units[227] || 0;
  if (id === 14) return `<div class="card small">Ученые ускоряют исследования в Университете: −2% времени за каждого в замке (до −50%). Сейчас: ${sages}.</div>`;
  const r = my.research;
  return `<div class="section">Науки</div>
    ${r ? `<div class="card job"><div class="grow"><b>Изучается: ${esc(M().sciences[r.sci].name)} ${r.level} ур.</b><div class="bar"><i data-s="${r.start}" data-e="${r.end}"></i></div></div><span class="cd" data-e="${r.end}"></span></div>` : ''}
    ${Object.entries(M().sciences).map(([k, s]) => { const l = my.sciences[k], n = l + 1, can = n <= uni && !r;
      const sec = Math.max(3, Math.round(M().scienceTime[Math.min(20, n)] * Math.max(0.5, 1 - 0.02 * sages) / S.cat.speed));
      return `<div class="card unit"><div class="top">${gimg(`smallicon/${s.icon}.png`, 'ui s')}<div class="grow"><b>${esc(s.name)} ${l} ур.</b><span class="muted small">${esc(s.desc)}</span></div></div>
      ${n > 20 ? '<p class="small">Максимум.</p>' : `<div class="chips">${RES4.map((q) => `<span data-need="${q}:${M().scienceCost[n][q]}">${RES_IC[q]} ${fmtFull(M().scienceCost[n][q])}</span>`).join('')}<span>${TIME_IC} ${fmtT(sec)}</span></div>
      ${n > uni ? `<p class="reasons">Нужен Университет ${n} ур.</p>` : `<button class="btn primary small" data-sci="${k}" ${can ? '' : 'disabled'}>Изучить ${n} ур.</button>`}`}</div>`; }).join('')}`;
}

// Храм как в оригинале: «Бонус лояльности +N%» с полоской, кнопки «Бунт» и «Ритуалы» (temple.js)
function templeHtml() {
  const r = MY().royal, pct = r ? Math.round(r.bonus * 100) : 0, cap = r ? Math.round(r.bonusCap * 100) : 0;
  return `<div class="bwline">Бонус <img class="crown" src="${GFX}smallicon/bonus_status/coronalgold.png" alt=""> лояльности + ${pct}%</div>
    <div class="tbar"><i style="width:${cap ? Math.min(100, pct / cap * 100) : 0}%"></i></div>
    <button class="rbar" data-temple="riot">Бунт</button><button class="rbar" data-temple="rituals">Ритуалы</button>`;
}
function religionHtml() {
  const rel = MY().religion, L = buildingLevel(25);
  if (rel) return `<div class="section">Вера</div><div class="card"><b>${esc(M().religions[rel].name)}</b><p class="small">${esc(M().religions[rel].desc)} — сейчас +${L}%.</p></div>`;
  return `<div class="section">Выбор веры (один раз)</div>${Object.entries(M().religions).map(([k, r]) => `<div class="card"><b>${esc(r.name)}</b><p class="small">${esc(r.desc)}</p><button class="btn primary small" data-religion="${k}">Принять</button></div>`).join('')}`;
}

// Экспедиция: археологи тренируются здесь же и уходят на поиски (три вида экспедиций)
function expedHtml() {
  const my = MY(), I = my.expedInfo, ex = my.expeds || []; if (!I) return '';
  const free = I.slots - ex.length, n = Math.max(0, Math.min(I.have, I.maxN, S.exN ?? Math.min(10, I.have)));
  const KIMG = { near: 'build/hd3/arhcamp.png', city: 'ground/castle_old.png', tomb: 'ground/mount.png' };
  return `<div class="section">Экспедиции</div>
    ${ex.map((x) => { const k = I.kinds.find((y) => y.k === x.kind); return `<div class="card job exrun"><img class="exic" src="${GFX}units/human/hd/arheolog.png" alt="">
      <div class="grow"><b>${esc(k ? k.name : '')}</b> · археологов ${x.n}<div class="bar"><i data-s="${x.start}" data-e="${x.end}"></i></div></div><span class="cd" data-e="${x.end}"></span></div>`; }).join('')}
    <div class="card exhead"><div>Археологов в замке: <b>${fmtFull(I.have)}</b> · экспедиций: <b>${ex.length} из ${I.slots}</b></div>
      <label class="exn">В экспедицию: <input type="number" inputmode="numeric" min="1" max="${Math.min(I.have, I.maxN)}" value="${n}" data-exn> <small>(не больше ${I.maxN}; +2% к находке за каждого)</small></label></div>
    ${I.kinds.map((k) => `<div class="excard ${k.open ? '' : 'off'}"><div class="exscene"><img src="${GFX}${KIMG[k.k]}" alt=""></div>
      <div class="grow"><b>${esc(k.name)}</b><p>${esc(k.desc)}</p>
        <div class="exstats"><span>${TIME_IC} ${fmtT(k.sec)}</span><span>🔍 ${Math.min(95, k.base + 2 * n)}%</span><span>💠 редкий ${k.rare}% · легенд. ${k.legend}%</span>${k.risk ? `<span class="bad">☠ риск ${k.risk}%</span>` : '<span>🛡 без риска</span>'}</div>
        ${k.open ? `<button class="btn primary small" data-exgo="${k.k}" ${free > 0 && n > 0 ? '' : 'disabled'}>Отправить</button>` : `<p class="reasons">Откроется с Экспедицией ${k.lvl} ур.</p>`}</div></div>`).join('')}`;
}
const ART_HOURS = [12, 24, 48];
function artifactsHtml() {
  const my = MY(), active = my.artifacts.filter((a) => a.active).length;
  return `<div class="section">Артефакты</div><p class="small muted">Пробуждено ${active} из ${my.bonus.artSlots} (Башня артефактов), хранится ${my.artifacts.length} из ${my.bonus.artStore} (Сокровищница). Одинаковые артефакты складываются с убыванием: второй даёт половину, третий — четверть.</p>
    ${my.artifacts.map((a) => { const t = M().artifacts[a.type], r = M().rarity[a.rarity]; return `<div class="card unit"><div class="top">${gimg(ART_ICON[a.type] || 'smallicon/magattack.png', 'ui s')}
      <div class="grow"><b>${esc(t.name)}</b><span class="muted small">${r.name}: +${Math.round(r.bonus * 100)}% — ${esc(t.desc)}${a.active ? ` · <b class="good">пробуждён${a.eff !== undefined && a.eff < r.bonus - 1e-9 ? `, действует +${Math.round(a.eff * 100)}%` : ''}</b>` : ''}</span></div>
      ${a.active ? '' : `<button class="btn small primary" data-art="${a.id}" data-on="1" data-hours="${ART_HOURS[a.rarity]}">Пробудить</button>`}</div>
      ${a.active && a.until ? `<div class="artlife"><div class="bar"><i data-s="${a.until - ART_HOURS[a.rarity] * 3600000 / S.cat.speed}" data-e="${a.until}"></i></div><span>иссякнет через <span class="cd" data-e="${a.until}"></span></span></div>` : `<p class="small muted">Пробуждённый действует ${ART_HOURS[a.rarity]} ч, затем рассыпается.</p>`}</div>`; }).join('') || '<p class="muted small">Артефактов нет — их приносят экспедиции археологов (здание «Экспедиция»).</p>'}`;
}

// ---------- отправка войск — окно «Военный поход» в armies.js ----------

// ---------- отчёты ----------
function openReports() { S.reports = null; send({ t: 'reports' }); openSheet(reportsHtml); }
// дата как в оригинале: «Сегодня, 14:03», «Вчера, 14:03», иначе «27.09.2026 13:07»
function repDate(t) {
  const d = new Date(t), hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x).toDateString(), now = Date.now();
  if (day(t) === day(now)) return `Сегодня, ${hm}`;
  if (day(t) === day(now - 864e5)) return `Вчера, ${hm}`;
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${hm}`;
}
const REPG = 'gfx3d/rep/';
function reportsHtml() {
  const list = S.reports || [];
  return `<div class="ribbon"><span><img class="renv" src="${REPG}envnew.svg" alt=""> Отчеты ${S.reports ? list.length : ''}</span></div>
    <div class="replist">${!S.reports ? '<p class="parch-note">Загрузка…</p>' : list.map((r) => `<button class="repcard ${r.tone || 'info'} ${r.read ? '' : 'new'}" data-report="${r.id}">
      <b><img class="renv" src="${REPG}${r.read ? 'env' : 'envnew'}.svg" alt=""> ${esc(r.title)}</b><span>От: ${esc(r.from || 'Советник')}</span><span>${repDate(r.at)}</span></button>`).join('') || '<p class="parch-note">Отчётов пока нет.</p>'}</div>
    ${list.some((r) => r.read) ? `<button class="repclean" data-repclean title="Удалить прочитанные"><img src="${REPG}mailset.png" alt=""></button>` : ''}`;
}
// окно отчёта как в оригинале: шапка «От/Тема/дата», итог похода, стороны, армии с потерями по юнитам
function reportHtml(r) {
  S.openReport = r;
  const d = r.data || {}, pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const ic = (n) => `<img class="ric" src="${REPG}${n}.png" alt="">`;
  const plink = (id, name) => id ? `<button class="rlink" data-profile="${id}">${esc(name)}</button>` : esc(name);
  const band = (icon, text) => `<div class="ribbon rband"><span><img src="${REPG}${icon}.png" alt=""> ${text}</span></div>`;
  const bar = (icon, text) => `<div class="rbar"><img src="${REPG}${icon}.png" alt=""> ${text}</div>`;
  const head = `${ribbon('Отчет')}<div class="rp">От: ${esc(r.from || 'Советник')}<br>Тема: <b>${esc(r.title)}</b><br>${repDate(r.at)}</div><hr class="rhr">`;
  const foot = `<hr class="rhr"><div class="rtiles"><button class="rtile" data-repfwd="${r.id}"><img src="${REPG}fwd.png" alt="Переслать"></button>
    ${r.owner === S.st.user.id ? `<button class="rtile" data-repdel="${r.id}"><img src="${REPG}del.png" alt="Удалить"></button>` : ''}</div>`;
  const sideBlock = (s, rating, x, y, lossLine) => `<div class="rp">Игрок: ${plink(s.id, s.login)}<br>Замок: ${x !== '-' && x != null ? `<button class="rlink" data-goworld="${x},${y}">${esc(s.castle || '')}</button>` : esc(s.castle || '')}<br>(Рейтинг: ${rating ?? '-'}, X: ${x}, Y: ${y})${lossLine ? `<br>${lossLine}` : ''}</div>`;
  if (d.type === 'invite') { // приглашение в альянс: вступить прямо из отчёта
    const a = d.ally || {}, live = (MY().invites || []).find((x) => x.id === a.id), inAl = MY().alliance;
    return `${head}<div class="invcard"><div class="invh">Вас пригласили в альянс</div>
      <div class="invname"><b>[${esc(a.tag || '')}]</b> ${esc(a.name || '')}</div>
      <div class="invinfo">Пригласил: ${plink(d.from && d.from.id, (d.from && d.from.login) || '')}${live ? ` · глава: <b>${esc(live.leader)}</b> · участников: <b>${live.members}${live.slots ? ` / ${live.slots}` : ''}</b>` : ''}</div>
      ${inAl && inAl.id === a.id ? '<p class="parch-note">Вы уже в этом альянсе.</p>' : inAl ? `<p class="parch-note">Вы уже в альянсе [${esc(inAl.tag)}]. Чтобы вступить, сначала выйдите из него.</p>`
        : live ? `<div class="two"><button class="pbtn invyes" data-repinv="accept" data-id="${a.id}">Принять</button><button class="pbtn invno" data-repinv="decline" data-id="${a.id}">Отклонить</button></div>
          <p class="small muted center">Вступление по приглашению — сразу, Дипломатический центр не нужен.</p><button class="rlinkbig" data-repinvgo>Все приглашения (Дипломатический центр)</button>`
        : '<p class="parch-note">Приглашение уже недействительно (отклонено или отозвано).</p>'}</div>${foot}`;
  }
  if (d.type === 'friendreq') { // заявка в друзья: принять или отклонить прямо из отчёта
    const u = d.from || {}, st = d.state;
    return `${head}<div class="invcard"><div class="invh">Предложение дружбы</div>
      <div class="invname">${plink(u.id, u.login || '')}</div><div class="invinfo">Рейтинг: <b>${fmtFull(u.rating || 0)}</b></div>
      ${st === 'accepted' ? '<p class="parch-note">Заявка принята — вы друзья.</p>' : st === 'declined' ? '<p class="parch-note">Заявка отклонена.</p>' : st === 'cancelled' ? '<p class="parch-note">Игрок отозвал заявку.</p>'
        : `<div class="two"><button class="pbtn invyes" data-frreq="accept" data-id="${u.id}">Принять</button><button class="pbtn invno" data-frreq="decline" data-id="${u.id}">Отклонить</button></div>`}
      <button class="rlinkbig" data-frgo>Мои друзья</button></div>${foot}`;
  }
  if (d.type === 'friendok') { // дружба принята
    const u = d.from || {};
    return `${head}<div class="invcard"><div class="invh">🤝 Дружба принята</div>
      <div class="invname">${plink(u.id, u.login || '')}</div><div class="invinfo">теперь Ваш друг · Рейтинг: <b>${fmtFull(u.rating || 0)}</b></div>
      <button class="rlinkbig" data-frgo>Мои друзья</button></div>${foot}`;
  }
  if (d.type === 'scout') {
    const res = d.ok ? '<span class="rgood">Разведка прошла успешно.</span>' : '<span class="rbad">Разведка провалилась.</span>';
    return `${head}<div class="rp">Тип похода: Разведка<br>${ic('star')} Результат атаки: ${res}</div><hr class="rhr">
      ${band('kingatt', 'Нападение')}${sideBlock(d.att, d.att.rating, d.att.cx, d.att.cy, `${ic('skull')} Общие потери: ${d.att.lost} из ${d.att.sent} ( ${pct(d.att.lost, d.att.sent)}% )`)}
      ${band('kingdef', 'Защита')}${d.def.npc ? `<div class="rp">Игрок: Неизвестный игрок<br>Объект: ${esc(d.def.npc)}<br>(Рейтинг: -, X: ${d.x}, Y: ${d.y})</div>` : sideBlock(d.def, d.def.rating, d.x, d.y)}
      ${bar('swords', 'Армия атаки')}${bar('glass', 'Разведка')}
      <div class="rp">${d.info && d.info.length ? d.info.map(esc).join('<br>') : 'Разведчики ничего не узнали.'}</div>${foot}`;
  }
  if (d.type !== 'battle') return `${head}<div class="rp">${(r.lines || []).map(esc).join('<br>')}</div>${foot}`;
  const attV = d.side === 'att';
  const tot = (u) => Object.values(u || {}).reduce((q, v) => q + v.was, 0), lostN = (u) => Object.values(u || {}).reduce((q, v) => q + v.lost, 0);
  const aW = tot(d.att.units), aL = lostN(d.att.units), dW = tot(d.def.units), dL = lostN(d.def.units);
  // как в оригинале: «Победа атаки.» / «Поражение атаки.» — с точки зрения нападения
  const result = d.win ? ['rgood', 'Победа атаки.'] : ['rbad', 'Поражение атаки.'];
  const resRow = (o, keys = ['wood', 'stone', 'iron', 'food', 'people']) => `<div class="rres">${keys.map((k) => `<span>${RES_IC[k]} ${fmtFull(Math.round((o && o[k]) || 0))}</span>`).join('')}</div>`;
  const reb = d.att.units && d.att.units[233], rebLeft = reb ? reb.was - reb.lost : 0, rebU = unitById(233);
  // строки — блоками (без <br> после строки ресурсов, иначе пустая строка)
  const top = `<div class="rp">Тип похода: ${esc(M().missions[d.mission] || 'Нападение')}<br>
      ${d.luck !== undefined ? `${ic('horse')} Удача атаки ${d.luck} %<br>` : ''}
      ${ic('star')} Результат атаки: <span class="${result[0]}">${result[1]}</span>
      ${d.loot && RES4.some((k) => d.loot[k] > 0) ? `<div>Было украдено ресурсов${d.att.army ? ` армией ${esc(d.att.army)}` : ''}:</div>${resRow(d.loot, RES4)}` : ''}
      ${d.loyalty ? `<div>Бунт в замке после нападения: ${100 - d.loyalty.to}% ${d.captured ? `<span class="rgood">${d.def.npc ? 'Руины захвачены!' : 'Замок захвачен!'}</span>`
        : d.royalBlocked ? `<span class="rbad">Замок не захвачен: ${d.royalBlocked.wait ? `захват возможен через ${d.royalBlocked.wait} дн. игры` : 'не хватает лояльности населения'}.</span>` : ''}</div>` : ''}
      ${d.capitalBlocked ? '<div><span class="rbad">Столицу захватить нельзя.</span></div>' : ''}
      ${d.npcBack ? `<div><span class="rgood">Лагерь разбит и исчез с карты.</span> Новый появится в этой провинции через ${d.npcBack} мин.</div>` : ''}
      ${d.siteTaken && !d.siteTaken.blocked ? `<div><span class="${attV ? 'rgood' : 'rbad'}">${attV ? 'Недострой захвачен! Ваши путешественники продолжают стройку.' : 'Ваш недострой захвачен врагом.'}</span></div>` : ''}
      ${d.siteTaken && d.siteTaken.blocked ? `<div><span class="rbad">Недострой не захвачен: ${esc(d.siteTaken.blocked)}</span></div>` : ''}
      ${d.site && d.win && !d.siteTaken && d.mission === 'attack' ? `<div>Охрана недостроя разбита, но стройка продолжается — забрать её может нападение, в котором выживут ${M().settleTake || 3} путешественника.</div>` : ''}
      ${d.captured && rebU && (d.captured.rebel || rebLeft) ? `<div><img class="ric" src="${unitSrc(rebU, d.att.race)}" alt=""> ${d.captured.rebel || rebLeft} ${plural(d.captured.rebel || rebLeft, 'Бунтарь остался', 'Бунтаря остались', 'Бунтарей остались')} в замке.</div>` : ''}
      ${(d.siege || []).map((x) => `<div>${esc(x)}</div>`).join('')}
      ${d.gear ? `<div>${esc(d.gear)}</div>` : ''}</div>`;
  const lossLine = (L, W) => `${ic('skull')} Общие потери: ${fmtFull(L)} из ${fmtFull(W)} ( ${pct(L, W)}% )`;
  // «Армия атаки» / «Армия защиты» — раскрываются нажатием: потери, потери в ресурсах, по юнитам «погибло из было», генерал
  const unitRows = (units, race) => Object.entries(units || {}).map(([id, v]) => { const u = unitById(id); return u ? `<div class="rul"><img class="ric" src="${unitSrc(u, race)}" alt=""> ${esc(u.name)}: ${fmtFull(v.lost)} из ${fmtFull(v.was)}</div>` : ''; }).join('');
  const genRow = (s) => (s.general ? `<div class="rul">${gimg(`units/${HD_DIR[s.race] || 'human/hd'}/general.png`, 'ric')} Генерал ${s.general} ур.: ${s.generalDied ? '<span class="rbad">пал в бою</span>' : s.genExp ? `+${fmtFull(s.genExp)} опыта` : 'в строю'}</div>` : '');
  const armyBox = (icon, title, sub, body) => `<details class="rarmy"><summary class="rbar"><img src="${REPG}${icon}.png" alt=""> ${title}</summary>${ribbon(sub)}${body}</details>`;
  const attBox = armyBox('swords', 'Армия атаки', `Армия атаки${d.att.army ? `: ${esc(d.att.army)}` : ''}`,
    `<div class="rp">${ic('skull')} Потери: ${fmtFull(aL)} из ${fmtFull(aW)} ( ${pct(aL, aW)}% )<br>Потери в ресурсах:${resRow(d.att.lossRes)}${unitRows(d.att.units, d.att.race)}${genRow(d.att)}</div>`);
  const defBox = armyBox('shield', 'Армия защиты', 'Армия защиты', d.def.npc
    ? `<div class="rp">${ic('skull')} Охрана потеряла ${d.def.lossPct}%${(d.def.garrison || []).map((g) => `<div class="rul">${esc(g.name)}: ${fmtFull(g.lost || 0)} из ${fmtFull(g.n)}</div>`).join('')}</div>`
    : dW || d.def.general ? `<div class="rp">${ic('skull')} Потери: ${fmtFull(dL)} из ${fmtFull(dW)} ( ${pct(dL, dW)}% )<br>Потери в ресурсах:${resRow(d.def.lossRes)}${unitRows(d.def.units, d.def.race)}${genRow(d.def)}${d.def.wall ? `<div class="rul">${gimg('fence/fence1.png', 'ric')} Забор ${d.def.wall} ур.</div>` : ''}</div>`
    : '<div class="rp">В замке не было защитников.</div>');
  return `${head}${top}
    ${band('kingatt', 'Нападение')}${sideBlock(d.att, d.att.rating, d.att.cx ?? '-', d.att.cy ?? '-', lossLine(aL, aW))}
    ${band('kingdef', 'Защита')}
    ${d.def.npc ? `<div class="rp">Игрок: Неизвестный игрок<br>Объект: ${esc(d.def.npc)}<br>(Рейтинг: -, X: ${d.x}, Y: ${d.y})<br>${ic('skull')} Охрана потеряла ${d.def.lossPct}%</div>`
      : sideBlock(d.def, d.def.rating, d.x, d.y, dW ? lossLine(dL, dW) : `${ic('skull')} В замке не было защитников!`)}
    ${attBox}${defBox}
    ${foot}`;
}

// ---------- админ — web/admin.js ----------

// ---------- мир: действия с объектом ----------
function worldActions(o, x, y) {
  const b = (m, t) => `<button class="btn ${m === 'attack' ? 'primary' : ''}" data-armyopen="${m}" data-ax="${x}" data-ay="${y}">${t}</button>`;
  if (o.kind === 'castle') {
    if (o.ownerId === S.st.user.id) { // свой замок: если не текущий — отправить ресурсы или подкрепление
      const here = S.st.castle && S.st.castle.x === x && S.st.castle.y === y;
      return here ? '' : `<div class="btns" style="margin-top:8px">${b('trade', 'Отправить ресурсы')}${b('reinforce', 'Подкрепление')}</div>`;
    }
    return `<div class="btns" style="margin-top:8px">${b('attack', 'Атака')}${b('raid', 'Набег')}</div><div class="btns" style="margin-top:8px">${b('scout', 'Разведка')}${b('trade', 'Торговля')}</div>`;
  }
  const npc = M().npc[o.img];
  if (!npc) return '<p class="muted small">Здесь пусто.</p>';
  return `<dl class="kv">${npc.level ? `<dt>Сложность</dt><dd><b>${esc(npc.level)}</b></dd>` : ''}<dt>Охрана</dt><dd>~${fmtFull(npc.def.inf)}</dd><dt>Запас</dt><dd>${RES4.map((r) => fmtN(npc.loot[r])).join(' / ')}</dd></dl>
    <div class="btns" style="margin-top:8px">${b('attack', 'Атака')}${b('raid', 'Набег')}${b('scout', 'Разведка')}</div>
    ${npc.ruins ? `<p class="small">Бунт в руинах: <b>${100 - (o.loyalty ?? 100)}%</b>. Захват — <b>нападение с Бунтарями</b>: каждая победа добавляет 15% бунта, при 100% руины станут вашим замком.</p>
      <div class="btns" style="margin-top:8px">${b('expedition', 'Экспедиция')}</div>` : ''}`;
}

// ---------- справочник войск (Ещё → Войска) ----------
function armyBookHtml() {
  const races = ['humans', 'elves', 'dwarves', 'orcs', 'all'];
  S.bookRace = S.bookRace || S.st.user.race;
  const list = M().units.filter((u) => u.race === S.bookRace);
  return `<div class="vhead"><button class="iconbtn" data-back>‹</button><h2>Войска</h2></div>
    <div class="pad" style="padding-top:8px"><div class="pills">${races.map((r) => `<button data-brace="${r}" class="${r === S.bookRace ? 'on' : ''}">${r === 'all' ? 'Общие' : esc(S.cat.races[r])}</button>`).join('')}</div>
    <div class="list" style="margin-top:8px">${list.map((u0) => raceUnit(u0, S.bookRace === 'all' ? S.st.user.race : S.bookRace)).map((u) => `<div class="card unit"><div class="top">${`<img class="ui" src="${unitSrc(u, S.bookRace === 'all' ? S.st.user.race : S.bookRace)}" alt="">`}<div class="grow"><b>${esc(u.name)}</b>
      <span class="muted small">${TYPE_NAME[u.type] || ''} · ${esc(S.by[u.building].name)} ${u.level} ур.${Object.entries(u.req).map(([id, l]) => `, ${esc(S.by[id].name)} ${l} ур.`).join('')}</span></div></div>${unitStatsHtml(u)}</div>`).join('')}</div></div>`;
}

// ---------- события ----------
function milMsg(m) {
  if (m.t === 'alliances') { S.alliances = m.list; S.alFound = m.list; refreshSheet(); }
  if (m.t === 'reports') { S.reports = m.list; refreshSheet(); }
  if (m.t === 'report') openSheet(() => reportHtml(m.report));
}
function hqCell() { const i = S.st.castle.grid[0].indexOf(HQ); return i; }

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.cnt) { const [id, k] = d.cnt.split(':').map(Number); S.cnt[id] = Math.max(1, (S.cnt[id] || 1) + k); const i = $(`[data-cnt-input="${id}"]`); if (i) i.value = S.cnt[id]; return; }
  if (d.max) { const u = unitById(d.max); S.cnt[u.id] = Math.max(1, unitMax(u)); const i = $(`[data-cnt-input="${u.id}"]`); if (i) i.value = S.cnt[u.id]; return; }
  if (d.trainopen) { const bid = Number(d.trainopen); S.cnt = {}; return openSheet(() => trainWin(bid)); }
  if (d.train) { const c = S.cnt[d.train] ?? 1; if (!(c > 0)) return toast('Выберите количество ползунком.', 'err'); return send({ t: 'train', unit: Number(d.train), count: c }); }
  if (d.revive !== undefined) return send({ t: 'general', op: 'revive' });
  if (d.armyopen === 'trade') { S.mkt = { x: d.ax ?? '', y: d.ay ?? '', res: {} }; return openSheet(mktGiveWin); }
  if (d.armyopen !== undefined) return openArmySheet({ mission: d.armyopen || 'raid', x: d.ax !== undefined ? Number(d.ax) : '', y: d.ay !== undefined ? Number(d.ay) : '' });
  if (d.reports !== undefined) return openReports();
  if (d.report) return send({ t: 'report', id: Number(d.report) });
  if (d.repdel) { send({ t: 'repdel', ids: [Number(d.repdel)] }); return closeSheet(); }
  if (d.repclean !== undefined) { if (confirm('Удалить все прочитанные отчёты?')) send({ t: 'repdel', ids: 'read' }); return; }
  if (d.repfwd) { const to = prompt('Кому переслать отчёт? Ник игрока:'); if (to) send({ t: 'repfwd', id: Number(d.repfwd), to }); return; }
  if (d.sci) return send({ t: 'research', sci: d.sci });
  if (d.religion) return send({ t: 'religion', id: d.religion });
  if (d.art) { if (!confirm(`Пробудить артефакт? Он будет действовать ${d.hours} ч, а затем рассыплется.`)) return; return send({ t: 'artifact', id: Number(d.art), on: true }); }
  if (d.exgo) { const n = Number(($('[data-exn]') || {}).value) || 0; if (!(n > 0)) return toast('Сколько археологов отправить?', 'err'); return send({ t: 'exped', kind: d.exgo, n }); }
  if (d.alleave !== undefined) return send({ t: 'alliance', op: 'leave' });
});
$('#sheetBody').addEventListener('input', (e) => {
  const d = e.target.dataset, v = e.target.value;
  if (d.exn !== undefined) { S.exN = Math.max(0, Math.floor(Number(v)) || 0); return; }
  if (d.cntInput || d.cntRange) { // поле и ползунок связаны
    const id = d.cntInput || d.cntRange, u = unitById(id), max = unitMax(u), c = Math.max(0, Math.min(max, Math.floor(Number(v)) || 0)); S.cnt[id] = c;
    const r = $(`[data-cnt-range="${id}"]`), i = $(`[data-cnt-input="${id}"]`);
    if (r) { if (d.cntInput) r.value = c; r.style.setProperty('--p', `${max ? c / max * 100 : 0}%`); }
    if (i && d.cntRange) i.value = c;
  }
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.form;
  if (k === 'exchange') send({ t: 'exchange', from: f.from.value, to: f.to.value, amount: Number(f.amount.value) });
  if (k === 'aljoin') send({ t: 'alliance', op: 'join', tag: f.tag.value });
  if (k === 'alcreate') send({ t: 'alliance', op: 'create', name: f.name.value, tag: f.tag.value });
  if (['aljoin', 'alcreate'].includes(k)) S.alliances = null;
});
$('#sheetBody').addEventListener('click', (e) => { const b = e.target.closest('[data-brace]'); if (b) { S.bookRace = b.dataset.brace; refreshSheet(); } });

$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-repinvgo]')) openInvites(); });
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-repinv]'); if (!b) return;
  send({ t: 'alliance', op: b.dataset.repinv, id: Number(b.dataset.id) });
  b.closest('.two').innerHTML = `<p class="parch-note">${b.dataset.repinv === 'accept' ? 'Вступаете в альянс…' : 'Приглашение отклонено.'}</p>`;
});
// бартер: сколько получите при курсе 2,5 : 1
$('#sheetBody').addEventListener('input', (e) => { const i = e.target.closest('[data-bxamt]'); if (!i) return; const g = $('[data-bxgot] b'); if (g) g.textContent = fmtFull(Math.floor((Number(i.value) || 0) * (MY().bonus.marketRate || 0.4))); });
