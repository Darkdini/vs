'use strict';
// Война Королей — мобильный браузерный клиент. Без библиотек: WebSocket + JSON (см. server/src/web.js).
// Экран: шапка (ресурсы, очередь строек) → вид (Замок / Земли / Мир / Рейтинг / Ещё) → нижнее меню.
// Нажатие на клетку открывает нижнюю шторку: здание, следующий уровень и таблица всех уровней.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const RES = ['wood', 'stone', 'iron', 'food', 'people'];
// ---------- графика оригинального клиента «Третий Мир» (web/gfx — картинки из jar) ----------
const GFX = 'gfx/';
const GROUND = ['grass', 'stone', 'roadS0', 'roadS1', 'roadS2', 'roadG0', 'roadG1', 'ground', 'stone1', 'water', 'castle', 'grass1',
  'arrowup', 'arrowright', 'arrowdown', 'arrowleft', 'rov0', 'rov5', 'rov4', 'rov1', 'rov7', 'rov3', 'rov2', 'rov6',
  'castle_old', 'dikari', 'lumber', 'troll_rudnik', 'castle_small', 'castle_big'];
const DECOR = ['wood', 'walun', 'mount'];
const EDGE = ['0', '1', '2', '3', '40', '41', '50', '51', '60', '61', '70', '71'];
// id здания → build/<имя>.png (порядок картинок клиента: id = номер картинки − 100)
const BUILD_IMG = ['castle', 'storage', 'mbases', 'baraks', 'market', 'farm_small', 'house_small', 'sawmill_small', 'stone_small', 'iron_small',
  'build', 'smith', 'stables', 'diplomat', 'wisdom_house', 'university', 'arhcamp', 'expedition', 'art_tower', 'commerce', 'magtower',
  'guard_tower', null, 'workshop', 'traveler', 'temple', 'secret', 'sawmill_avg', 'stone_avg', 'iron_avg', 'farm_avg', 'house_avg',
  'sawmill_big', 'stone_big', 'iron_big', 'farm_big', 'house_big', 'chip', 'portal', 'magscool', 'builder', 'beer', 'gendel',
  'alchimia', 'reasury', 'spycentr', 'resident'];
const UNIT_IMG = {
  200: 'human/swordman', 201: 'human/javelineer', 202: 'human/scout', 203: 'human/mage', 204: 'human/knight', 205: 'human/paladin', 206: 'human/jin',
  207: 'elf/archer', 208: 'elf/fighter', 209: 'elf/scout', 210: 'elf/create', 211: 'elf/kenaur', 212: 'elf/edinorog', 213: 'elf/ent',
  214: 'dwarv/fighter', 215: 'dwarv/arbalet', 216: 'dwarv/elder', 217: 'dwarv/gryphon', 218: 'dwarv/defender', 219: 'dwarv/revolver', 220: 'dwarv/yeti',
};
const RACE_IMG = { humans: 'units/human/knight.png', elves: 'units/elf/archer.png', dwarves: 'units/dwarv/fighter.png' };
const displayId = (def, level) => (!def.tiers ? def.id : level >= 10 ? def.tiers[2] : level >= 5 ? def.tiers[1] : def.tiers[0]);
// у Забора (22) картинки здания в клиенте нет — он виден оградой вокруг замка; в списках — кусок ограды
const bsrc = (id) => (id === 22 ? `${GFX}fence/fence1.png` : `${GFX}build/${BUILD_IMG[id] || 'build'}.png`);
const bimg = (id, cls = 'bi') => `<img class="${cls}" src="${bsrc(id)}" alt="">`;
const gimg = (path, cls = 'gi') => `<img class="${cls}" src="${GFX}${path}" alt="">`;
const RES_IC = Object.fromEntries(['wood', 'stone', 'iron', 'food', 'people'].map((r) => [r, gimg(`res/${r}.png`, 'ri')]));
const TIME_IC = gimg('res/time.png', 'ri');
const RES_NAME = { wood: 'Дерево', stone: 'Камень', iron: 'Железо', food: 'Еда', people: 'Люди' };
const VIEW = { CASTLE: 0, LANDS: 1 };
const WORLD_NAME_IMG = (o) => `ground/${GROUND[o.kind === 'castle' ? castleTile(o.rating) : o.img]}.png`;
const castleTile = (rating) => (rating < 300 ? 28 : rating < 1000 ? 10 : 29);

const S = {
  ws: null, cat: null, by: {}, st: null, offset: 0, tab: 'castle', sub: null, world: null,
  sheets: [], ignorePop: 0, mode: 'login', race: 0, creds: null, auto: false, pendingBuild: null, mailFolder: 0,
  
};

// ---------- утилиты ----------
const now = () => Date.now() + S.offset;
const fmtN = (n) => { n = Math.floor(n); return n >= 100000 ? `${Math.round(n / 1000)}k` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n); };
const fmtFull = (n) => Math.floor(n).toLocaleString('ru-RU');
// время как в клиенте: 0:00:01 (часы:минуты:секунды), больше суток — «2д 3:04:05»
function fmtT(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return `${d ? `${d}д ` : ''}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
const fmtDate = (t) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
};
// сообщения — в верхней полосе вместо часов, как в клиенте («Готово: Склад 1 ур.»); на экране входа — всплывающие
const statusQ = [];
function toast(msg, cls = '') {
  if ($('#game').classList.contains('hidden')) {
    const el = document.createElement('div'); el.textContent = msg; if (cls) el.className = cls;
    $('#toast').append(el); setTimeout(() => el.remove(), 2500);
    return;
  }
  statusQ.push({ msg, cls, until: 0 });
  if (statusQ.length > 4) statusQ.shift();
}
function statusTick() { // сообщения — плавающей строкой над картой, часы — над строкой чата
  const el = $('#status'), t = Date.now();
  if (statusQ.length && statusQ[0].until && statusQ[0].until < t) statusQ.shift();
  const m = statusQ[0];
  const inc = S.st && S.st.castle.mil && S.st.castle.mil.incoming.find((a) => a.mission !== 'trade' && a.arrive > now());
  if (m) { if (!m.until) m.until = t + 2600; el.textContent = m.msg; el.className = `show ${m.cls || 'msg'}`; }
  else if (inc) { el.className = 'show err'; el.textContent = `⚔ ${S.cat.mil.missions[inc.mission]} от ${inc.from} через ${fmtT((inc.arrive - now()) / 1000)}`; }
  else el.className = '';
  const d = new Date(now());
  $('#clock').textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
}
setInterval(statusTick, 250);
const send = (m) => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(m)); };

// ---------- правила игры (те же формулы, что на сервере: server/src/catalog.js, game.js) ----------
const R = () => S.cat.rules;
function buildSec(def, level, townhall) {
  const T = R().time, t = def.layer === 'lands' ? T.lands : T.castle;
  const raw = Math.max(T.min, Math.round(t.base * t.growth ** (level - 1) * T.townhallFactor ** townhall));
  return Math.max(R().minBuildSec, Math.round(raw / S.cat.speed));
}
const ratingPer = (def) => (def.layer === 'lands' ? R().rating.lands : R().rating.castle);
// что даёт здание на уровне level: {text, short}
function effect(def, level) {
  if (level <= 0) return { text: '—', short: '—' };
  const sp = S.cat.speed;
  if (def.produces === 'people') {
    const cap = R().store.peoplePerHut * level, p = Math.round(S.cat.prod[level] * R().peopleFactor * sp);
    return { text: `+${cap} мест для людей, +${p} людей/ч`, short: `+${cap} мест` };
  }
  if (def.produces) { const p = Math.round(S.cat.prod[level] * sp); return { text: `+${fmtFull(p)} ${RES_IC[def.produces]} в час`, short: `+${fmtN(p)}/ч` }; }
  if (def.id === 1) { const c = Math.round(R().store.perStore * R().store.growth ** level); return { text: `+${fmtFull(c)} к вместимости`, short: `+${fmtN(c)}` }; }
  if (def.id === 0) { const p = Math.round((1 - R().time.townhallFactor ** level) * 100); return { text: `стройки быстрее на ${p}%`, short: `−${p}%` }; }
  const m = typeof milEffect === 'function' && S.st && milEffect(def, level); // функции зданий (mil.js)
  return m || { text: '—', short: '' };
}
function buildingLevel(id) {
  const c = S.st.castle; let best = 0;
  for (const v of [0, 1]) c.grid[v].forEach((b, i) => { if (b === id) best = Math.max(best, c.levels[v][i]); });
  return best;
}
function resNow(r) {
  const c = S.st.castle, dt = (now() - S.st.now) / 3600000;
  return Math.min(c.cap[r], c.res[r] + c.rate[r] * dt);
}
const queueAt = (view, cell) => S.st.castle.queue.find((q) => q.view === view && q.cell === cell);
// можно ли строить: список причин, почему нельзя (пусто — можно)
function blockers(def, level, view, cell) {
  const c = S.st.castle, out = [];
  if (level > def.max) return ['Достигнут максимальный уровень.'];
  if (queueAt(view, cell)) out.push('Здесь уже идёт стройка.');
  if (c.queue.length >= S.cat.maxQueue) out.push(`Очередь занята (${c.queue.length}/${S.cat.maxQueue}).`);
  if (level === 1 && def.unique && (buildingLevel(def.id) > 0 || c.queue.some((q) => q.building === def.id))) out.push('Такое здание уже есть.');
  for (const [id, l] of Object.entries(def.req)) if (buildingLevel(Number(id)) < l) out.push(`Нужно: ${S.by[id].name} ${l} ур.`);
  const cost = def.costs[level];
  if (RES.some((r) => resNow(r) < cost[r])) out.push('Не хватает ресурсов.');
  const busy = c.queue.reduce((s, q) => s + ((S.by[q.building].costs[q.level] || {}).people || 0), 0);
  if (busy + cost.people > c.cap.people) out.push('Не хватает свободных людей.');
  return out;
}

// ---------- связь ----------
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  S.ws = ws;
  ws.onopen = () => {
    $('#offline').classList.remove('show');
    send({ t: 'hello' });
    if (S.creds) { S.auto = true; send({ t: 'login', ...S.creds }); }
  };
  ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => { if (S.ws !== ws) return; $('#offline').classList.add('show'); setTimeout(connect, 2000); };
}

function onMsg(m) {
  switch (m.t) {
    case 'catalog':
      S.cat = m.catalog; S.by = Object.fromEntries(S.cat.buildings.map((b) => [b.id, b]));
      renderRaces(); break;
    case 'registered':
      toast('Аккаунт создан!');
      send({ t: 'login', login: S.pendingCreds.login, password: S.pendingCreds.password });
      break;
    case 'auth':
      S.creds = S.pendingCreds || S.creds;
      if (S.remember && S.creds) store.set('tw.creds', S.creds);
      S.auto = false;
      $('#auth').classList.add('hidden'); $('#game').classList.remove('hidden');
      break;
    case 'state': onState(m); break;
    case 'world': if (!S.world || S.world.cx !== m.cx || S.world.cy !== m.cy) { delete Iso.cams.world; if (Iso.sel && Iso.sel.tab === 'world') Iso.sel = null; } S.world = m; if (S.tab === 'world') renderView(); break;
    case 'rating': S.ratingRows = m.rows; refreshSheet(); break;
    case 'profile': openSheet(() => profileSheet(m.profile)); break;
    case 'mail': S.mail = m; refreshSheet(); break;
    case 'letter': openSheet(() => letterSheet(m.letter)); break;
    case 'toast':
      toast(m.msg);
      if (/отправлено/.test(m.msg) && S.sheets.length && S.composing) { S.composing = false; closeSheet(); }
      if (/Армия выступила/.test(m.msg) && S.army) { S.army = null; closeAllSheets(); }
      break;
    case 'error':
      if (S.auto || !S.st) { // ошибка входа — показать форму
        S.auto = false; S.creds = null; store.set('tw.creds', null);
        $('#auth').classList.remove('hidden'); $('#game').classList.add('hidden');
        $('#authErr').textContent = m.msg;
      } else toast(m.msg, 'err');
      S.pendingBuild = null;
      break;
    default: if (typeof milMsg === 'function') milMsg(m); break;
  }
}

function onState(m) {
  const first = !S.st;
  S.st = m; S.offset = m.now - Date.now();
  if (S.pendingBuild && queueAt(S.pendingBuild.view, S.pendingBuild.cell)) {
    const q = queueAt(S.pendingBuild.view, S.pendingBuild.cell);
    toast(`Стройка начата: ${S.by[q.building].name}, ${q.level} ур. — ${fmtT((q.end - q.start) / 1000)}`);
    S.pendingBuild = null; closeAllSheets();
  }
  renderTop();
  if (first) setTab('castle'); else if (['castle', 'lands'].includes(S.tab)) isoDraw();
  refreshSheet();
}

// ---------- вход / регистрация ----------
function renderRaces() {
  const notes = (S.cat.army && S.cat.army.races) || {};
  $('#races').innerHTML = S.cat.raceOrder.map((r, i) => `
    <button type="button" class="race ${i === S.race ? 'on' : ''}" data-race="${i}">
      <i>${gimg(RACE_IMG[r])}</i><div><b>${esc(S.cat.races[r])}</b><span>${esc((notes[r] && notes[r].note) || '')}</span></div>
    </button>`).join('');
}
function setMode(mode) {
  S.mode = mode;
  $$('#authTabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('#raceBox').classList.toggle('hidden', mode !== 'reg');
  $('#authBtn').textContent = mode === 'reg' ? 'Создать аккаунт' : 'Войти';
  $('#authForm').password.autocomplete = mode === 'reg' ? 'new-password' : 'current-password';
  $('#authErr').textContent = '';
}
$('#authTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('#races').addEventListener('click', (e) => { const b = e.target.closest('[data-race]'); if (b) { S.race = Number(b.dataset.race); renderRaces(); } });
$('#authForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target, login = f.login.value.trim(), password = f.password.value;
  $('#authErr').textContent = '';
  S.remember = f.remember.checked;
  S.pendingCreds = { login, password };
  if (S.mode === 'reg') send({ t: 'register', login, password, race: String(S.race) });
  else send({ t: 'login', login, password });
});

// ---------- шапка: ресурсы и очередь ----------
function renderTop() { // конверты сообщений и отчётов наверху (как в 3D-клиенте)
  const u = S.st.unread, rep = S.st.castle.mil.unreadReports;
  $('#unread').textContent = u; $('#unread').classList.toggle('hidden', !u);
  $('#unrep').textContent = rep; $('#unrep').classList.toggle('hidden', !rep);
  tick();
}
function tick() {
  if (!S.st) return;
  const c = S.st.castle, t = now();
  $$('[data-e]').forEach((el) => {
    const e = Number(el.dataset.e);
    if (el.dataset.s) el.style.width = `${Math.min(100, Math.max(0, ((t - Number(el.dataset.s)) / (e - Number(el.dataset.s))) * 100))}%`;
    else el.textContent = e > t ? fmtT((e - t) / 1000) : 'готово';
  });
  if (Iso.cv.isConnected && c.queue.length) isoDraw(); // полосы строек на карте
  $$('[data-need]').forEach((el) => { // цены в шторке: красным то, чего не хватает
    const [r, n] = el.dataset.need.split(':');
    el.classList.toggle('lack', r !== 'people' && resNow(r) < Number(n));
  });
}
setInterval(tick, 500);


function resSheet() {
  const c = S.st.castle;
  const busy = c.queue.reduce((s, q) => s + ((S.by[q.building].costs[q.level] || {}).people || 0), 0);
  return `<div class="sh-head"><div class="big">${bimg(1)}</div><div><h3>Ресурсы</h3><div class="muted small">Скорость мира ×${S.cat.speed}</div></div></div>
    <div class="list">${RES.map((r) => {
      const v = resNow(r), full = v >= c.cap[r], left = c.rate[r] > 0 ? (c.cap[r] - v) / c.rate[r] * 3600 : Infinity;
      return `<div class="row"><span class="ic">${RES_IC[r]}</span><div class="grow"><b>${RES_NAME[r]}: ${fmtFull(v)} / ${fmtFull(c.cap[r])}</b>
        <span>+${fmtFull(c.rate[r])} в час · ${full ? '<span class="bad">склад полон</span>' : `заполнится через ${fmtT(left)}`}</span>
        <div class="bar" style="margin-top:5px"><i style="width:${Math.min(100, v / c.cap[r] * 100)}%"></i></div></div></div>`;
    }).join('')}</div>
    <p class="muted small">Войска едят ${fmtFull(c.mil.upkeep)} еды в час (уже учтено в добыче).</p>
    <p class="muted small">Людей занято на стройках: ${busy} из ${c.cap.people}. Вместимость склада растёт со Складом, мест для людей — с Хибарами.</p>`;
}

// ---------- вкладки ----------
function setTab(tab) {
  S.tab = tab;
  $$('#locs [data-loc]').forEach((b) => b.classList.toggle('on', b.dataset.loc === tab));
  if (tab === 'world') send({ t: 'world', ...(S.world ? { cx: S.world.cx, cy: S.world.cy } : {}) });
  renderView();
}

function renderView() {
  const v = $('#view');
  v.innerHTML = TABS[S.tab]();
  const wrap = $('.mapwrap', v);
  if (wrap) { isoMount(wrap); if (S.tab === 'world') worldInfo(); }
  tick();
}
const MAPWRAP = '<div class="mapwrap"><div class="infobox hidden"></div></div>';

// карты локаций на весь экран (панель локаций справа, окна — поверх)
const TABS = {
  castle: () => `<div class="mapview">${MAPWRAP}</div>`,
  lands: () => `<div class="mapview">${MAPWRAP}</div>`,
  world: () => `<div class="mapview">${MAPWRAP}</div>`,
};

function summaryHtml(view) {
  const c = S.st.castle, list = [];
  c.grid[view].forEach((b, i) => { if (b >= 0) list.push([b, c.levels[view][i], i]); });
  list.sort((a, b) => b[1] - a[1]);
  return `<h3 style="margin:4px 0 10px">${view === VIEW.CASTLE ? 'Здания замка' : 'Постройки на землях'} (${list.length})</h3><div class="list">${list.map(([b, l, i]) => {
    const def = S.by[b], q = queueAt(view, i);
    return `<button class="row" data-view="${view}" data-cell="${i}"><span class="ic">${bimg(displayId(def, l))}</span>
      <div class="grow"><b>${esc(def.name)} · ${l} ур.</b><span>${q ? `строится ${q.level} ур. · <span class="cd" data-e="${q.end}"></span>` : `${effect(def, l).text} · ★ ${l * ratingPer(def)}`}</span></div>›</button>`;
  }).join('')}</div>`;
}

// ---------- подстраницы «Ещё» ----------
const SUBPAGES = {
  mail() {
    const m = S.mail;
    return `<div class="vhead"><button class="iconbtn" data-back>‹</button><h2>Почта</h2><button class="btn small primary" data-act="compose">Написать</button></div>
      <div class="pad"><div class="pills">${['Входящие', 'Отправленные'].map((t, i) => `<button data-folder="${i}" class="${S.mailFolder === i ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="list" style="margin-top:8px">${!m ? '<p class="muted">Загрузка…</p>' : !m.list.length ? '<p class="muted">Писем нет.</p>' : m.list.map((x) => `
        <button class="row" data-letter="${x.id}"><span class="ic">${gimg(x.read || m.folder === 1 ? 'smallicon/unrep.png' : 'smallicon/unmes.png')}</span>
        <div class="grow"><b>${esc(x.subject || '(без темы)')}</b><span>${m.folder === 1 ? 'кому' : 'от'} ${esc(x.other)} · ${fmtDate(x.at)}</span></div></button>`).join('')}
      </div></div>`;
  },
  book() {
    const group = (layer, title) => `<div class="section">${title}</div><div class="list">${S.cat.buildings.filter((b) => b.layer === layer).map((b) => {
      const lvl = buildingLevel(b.id), req = Object.entries(b.req).map(([id, l]) => `${S.by[id].name} ${l}`).join(', ');
      return `<button class="row" data-book="${b.id}"><span class="ic">${bimg(b.id)}</span><div class="grow"><b>${esc(b.name)}</b>
        <span>до ${b.max} ур. · ★ ${ratingPer(b)} за уровень${req ? ` · нужно: ${esc(req)}` : ''}${lvl ? ` · у вас ${lvl} ур.` : ''}</span></div>›</button>`;
    }).join('')}</div>`;
    return `<div class="vhead"><button class="iconbtn" data-back>‹</button><h2>Справочник зданий</h2></div>
      <div class="pad" style="padding-top:0">${group('castle', 'Замок (сетка 7×7)')}${group('lands', 'Земли (сетка 15×15)')}</div>`;
  },
  army: () => armyBookHtml(), // оригинальные юниты игры (mil.js)
  rules() {
    const T = R().time, st = R().store;
    return `<div class="vhead"><button class="iconbtn" data-back>‹</button><h2>Формулы</h2></div><div class="pad" style="padding-top:0">
      <div class="section">Стоимость уровня</div>
      <div class="formula">Замок: база ${RES_IC.wood}120 ${RES_IC.stone}110 ${RES_IC.iron}80 ${RES_IC.food}60 ${RES_IC.people}2 × 1.3^(ур−1)<br>Земли: база ${RES_IC.wood}60 ${RES_IC.stone}50 ${RES_IC.iron}40 ${RES_IC.food}30 ${RES_IC.people}1 × 1.5^(ур−1)<br>Люди: база × уровень (не тратятся, заняты на время стройки)</div>
      <div class="section">Время стройки</div>
      <div class="formula">Замок: ${T.castle.base} с × ${T.castle.growth}^(ур−1)<br>Земли: ${T.lands.base} с × ${T.lands.growth}^(ур−1)<br>× ${T.townhallFactor}^(ур. Ратуши) ÷ скорость мира (×${S.cat.speed})</div>
      <div class="section">Рейтинг</div>
      <div class="formula">Каждый уровень здания в замке: ★ ${R().rating.castle}<br>Каждый уровень на землях: ★ ${R().rating.lands}</div>
      <div class="section">Добыча и склад</div>
      <div class="formula">Базово ${R().baseRate.wood}/ч каждого ресурса + добыча зданий земель по таблице × скорость мира<br>
      Склад: ${st.base} + ${st.perStore} × ${st.growth}^ур за каждый Склад<br>Люди: ${st.people} + ${st.peoplePerHut} мест за уровень Хибары</div>
      <div class="section">Добыча по уровням (в час, ×1)</div>
      <div class="formula">${S.cat.prod.slice(1).map((p, i) => `${i + 1}: ${p}`).join(' · ')}</div></div>`;
  },
};

// ---------- обработка нажатий в виде ----------
function viewClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.cell !== undefined) return openCell(Number(d.view), Number(d.cell));
  if (d.zoom) return isoZoom(Number(d.zoom) > 0 ? 1.25 : 1 / 1.25);
  if (d.whome !== undefined) return send({ t: 'world' });
  if (d.back !== undefined) return closeSheet();
  if (d.folder) { S.mailFolder = Number(d.folder); S.mail = null; refreshSheet(); return send({ t: 'mail', folder: S.mailFolder }); }
  if (d.letter) return send({ t: 'read', id: Number(d.letter) });
  if (d.book) { const def = S.by[d.book]; return openSheet(() => buildingSheet(def, buildingLevel(def.id), null)); }
  if (d.arace) { S.armyRace = d.arace; return refreshSheet(); }
  if (d.act) return ACTS[d.act]();
}
$('#view').addEventListener('click', viewClick);
$('#sheetBody').addEventListener('click', viewClick); // те же кнопки внутри окон

const ACTS = {
  me: () => send({ t: 'profile', id: S.st.user.id }),
  mail: () => { openSub('mail'); send({ t: 'mail', folder: S.mailFolder }); },
  book: () => openSub('book'),
  army: () => openSub('army'),
  hq: () => { const i = hqCell(); if (i < 0) return toast('Сначала постройте Военный штаб (нужна Ратуша 3 ур.).', 'err'); openCell(VIEW.CASTLE, i); },
  reports: () => openReports(),
  adminp: () => openSheet(adminHtml),
  rules: () => openSub('rules'),
  ratinginfo: () => openSheet(ratingInfoSheet),
  blist: () => openSheet(() => summaryHtml(VIEW.CASTLE)),
  llist: () => openSheet(() => summaryHtml(VIEW.LANDS)),
  compose: () => openCompose(''),
  bug: () => openSheet(() => `<div class="sh-head"><div class="big">${gimg('smallicon/soft_help.png')}</div><h3>Сообщить об ошибке</h3></div>
    <form class="stack" data-form="bug"><textarea name="text" rows="5" placeholder="Что пошло не так?" required></textarea><button class="btn primary">Отправить</button></form>`),
  logout: () => { store.set('tw.creds', null); location.reload(); },
};
function openSub(name) { openSheet(() => SUBPAGES[name]()); } // разделы открываются окнами поверх карты

// ---------- шторка ----------
function openSheet(render) {
  S.sheets.push(render);
  if (S.menuEntry) { S.menuEntry = false; history.replaceState({ sheet: S.sheets.length }, ''); } // окно из меню занимает место меню в истории
  else history.pushState({ sheet: S.sheets.length }, '');
  showSheet(true);
}
function showSheet(scrollTop) {
  const top = S.sheets[S.sheets.length - 1];
  $('#sheet').classList.toggle('show', !!top); $('#backdrop').classList.toggle('show', !!top);
  if (!top) return;
  $('#sheetBody').innerHTML = top();
  if (scrollTop) $('#sheetBody').scrollTop = 0;
  tick();
}
function refreshSheet() {
  if (!S.sheets.length || document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const sc = $('#sheetBody').scrollTop; showSheet(false); $('#sheetBody').scrollTop = sc;
}
function closeSheet() { if (S.sheets.length) history.back(); }
function closeAllSheets() {
  const n = S.sheets.length; if (!n) return;
  S.sheets = []; showSheet(); S.ignorePop += 1; history.go(-n); // go(-n) даёт одно событие popstate
}
window.addEventListener('popstate', () => {
  if (S.ignorePop > 0) { S.ignorePop--; return; }
  if (S.sheets.length) { S.sheets.pop(); showSheet(true); return; }
});
$('#backdrop').addEventListener('click', closeAllSheets);
$('#sheetClose').addEventListener('click', closeAllSheets);
$('#sheetBack').addEventListener('click', closeSheet);


$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.build) {
    const [view, cell, id] = d.build.split(',').map(Number);
    S.pendingBuild = { view, cell };
    return send({ t: 'build', view, cell, building: id });
  }
  if (d.pick) { const [view, cell, id] = d.pick.split(',').map(Number); return openSheet(() => buildingSheet(S.by[id], 0, { view, cell })); }
  if (d.profile) return send({ t: 'profile', id: Number(d.profile) });
  if (d.write !== undefined) return openCompose(d.write, d.subj || '');
  if (d.close !== undefined) return closeSheet();
  if (d.goworld) { closeAllSheets(); const [x, y] = d.goworld.split(',').map(Number); S.world = null; setTab('world'); send({ t: 'world', cx: x, cy: y }); }
});
$('#sheetBody').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'mail') { S.composing = true; send({ t: 'sendmail', to: f.to.value.trim(), subject: f.subject.value, text: f.text.value }); }
  if (f.dataset.form === 'bug') { send({ t: 'bug', text: f.text.value }); closeSheet(); }
});

// ---------- содержимое шторок ----------
function openCell(view, cell) {
  if (view === VIEW.LANDS) {
    const x = cell % 15, y = Math.floor(cell / 15);
    if (S.cat.lands.edge[y][x] >= 0 && S.st.castle.grid[1][cell] < 0) return toast(S.cat.lands.base[y][x] === 9 ? 'Берег — здесь строить нельзя.' : 'Дорога — здесь строить нельзя.');
  }
  openSheet(() => {
    const c = S.st.castle, b = c.grid[view][cell], q = queueAt(view, cell);
    if (b < 0 && !q) return emptySheet(view, cell);
    return buildingSheet(S.by[b >= 0 ? b : q.building], c.levels[view][cell], { view, cell });
  });
}

function costChips(cost) {
  return `<div class="chips">${RES.map((r) => `<span data-need="${r}:${cost[r]}">${RES_IC[r]} ${fmtFull(cost[r])}</span>`).join('')}</div>`;
}

// карточка здания; ctx = {view, cell} — можно строить, null — только справочник
function buildingSheet(def, lvl, ctx) {
  const th = S.st.castle.townhall, w = ratingPer(def);
  const q = ctx && queueAt(ctx.view, ctx.cell);
  const layerName = def.layer === 'lands' ? 'Земли' : 'Замок';
  let h = `<div class="sh-head"><div class="big">${bimg(displayId(def, Math.max(1, lvl)))}</div><div><h3>${esc(def.name)}</h3>
    <div class="muted small">${lvl ? `Уровень ${lvl} из ${def.max}` : `Не построено · до ${def.max} ур.`} · ${layerName}${def.unique ? ' · одно на замок' : ''}</div></div></div>
    <p class="desc">${esc(def.desc)}</p>
    <div class="stats"><div class="stat"><small>Сейчас даёт</small><b>${esc(effect(def, lvl).text)}</b></div>
    <div class="stat"><small>Рейтинг от здания</small><b>★ ${lvl * w}</b> <span class="muted small">(+${w} за ур.)</span></div></div>`;
  if (q) {
    h += `<div class="card next"><h4>Строится ${q.level} уровень</h4><div class="bar"><i data-s="${q.start}" data-e="${q.end}"></i></div>
      <p class="small" style="margin:6px 0 0">Осталось: <span class="cd" data-e="${q.end}"></span></p></div>`;
  } else if (lvl < def.max) {
    const n = lvl + 1, cost = def.costs[n];
    const reqs = Object.entries(def.req);
    const blk = ctx ? blockers(def, n, ctx.view, ctx.cell) : [];
    h += `<div class="card next"><h4>${lvl ? `Развить до ${n} ур.` : 'Построить (1 ур.)'}</h4>${costChips(cost)}
      <div class="chips"><span>${TIME_IC} ${fmtT(buildSec(def, n, th))}</span><span>★ +${w}</span><span>${esc(effect(def, n).text)}</span></div>
      ${reqs.length ? `<ul class="reqs">${reqs.map(([id, l]) => { const ok = buildingLevel(Number(id)) >= l; return `<li class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${esc(S.by[id].name)} ${l} ур.</li>`; }).join('')}</ul>` : ''}
      ${ctx ? `${blk.length ? `<p class="reasons">${blk.map(esc).join('<br>')}</p>` : ''}
      <button class="btn primary" data-build="${ctx.view},${ctx.cell},${def.id}" ${blk.length ? 'disabled' : ''}>${lvl ? 'Развить' : 'Построить'}</button>` : ''}</div>`;
  } else h += '<div class="card next"><h4>Максимальный уровень</h4></div>';
  if (ctx && lvl > 0) h += buildingFunctions(def, lvl); // тренировка, армия, рынок, науки… (mil.js)
  h += levelsTable(def, lvl, th);
  return h;
}

function levelsTable(def, lvl, th) {
  const w = ratingPer(def);
  let rows = '';
  for (let l = 1; l <= def.max; l++) {
    const c = def.costs[l];
    rows += `<tr class="${l === lvl ? 'cur' : l < lvl ? 'done' : ''}"><td>${l}</td>${RES.map((r) => `<td>${fmtFull(c[r])}</td>`).join('')}
      <td>${fmtT(buildSec(def, l, th))}</td><td>${esc(effect(def, l).short)}</td><td>+${w} / ${l * w}</td></tr>`;
  }
  return `<div class="section">Все уровни</div><div class="tbl"><table><thead><tr><th>Ур.</th>${RES.map((r) => `<th>${RES_IC[r]}</th>`).join('')}
    <th>${TIME_IC}</th><th>Даёт</th><th>★</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="tblnote">Время — при Ратуше ${th} ур. и скорости мира ×${S.cat.speed}. ★ — рейтинг за уровень / всего от здания.</p>`;
}

function emptySheet(view, cell) {
  let opts, title, sub;
  if (view === VIEW.LANDS) {
    const x = cell % 15, y = Math.floor(cell / 15), L = S.cat.lands;
    opts = S.cat.landOptions[y][x];
    title = ['Лес', 'Валуны', 'Горы'][L.decor[y][x]] || { 0: 'Луг', 7: 'Пашня', 8: 'Каменистая земля', 9: 'Вода' }[L.base[y][x]] || 'Земля';
    sub = `Земли: строительство · клетка ${x + 1}:${y + 1}`;
  } else {
    opts = S.cat.buildings.filter((b) => b.layer === 'castle').map((b) => b.id);
    title = 'Замок: строительство'; sub = 'Свободное место — выберите здание';
  }
  const items = opts.map((id) => S.by[id]).map((def) => ({ def, blk: blockers(def, 1, view, cell) }))
    .filter(({ blk }) => !blk.includes('Такое здание уже есть.'))
    .sort((a, b) => a.blk.length - b.blk.length);
  const th = S.st.castle.townhall;
  return `<div class="sh-head"><div class="big">${view === VIEW.LANDS ? gimg(landGroundImg(cell)) : gimg('ground/stone.png')}</div><div><h3>${esc(title)}</h3><div class="muted small">${esc(sub)}</div></div></div>
    ${!items.length ? '<p class="muted">Здесь нечего строить.</p>' : `<div class="list">${items.map(({ def, blk }) => `
      <button class="row ${blk.length ? 'locked' : ''}" data-pick="${view},${cell},${def.id}"><span class="ic">${bimg(def.id)}</span>
      <div class="grow"><b>${esc(def.name)}</b>${costChips(def.costs[1]).replace('class="chips"', 'class="chips small"')}
      <span>${TIME_IC} ${fmtT(buildSec(def, 1, th))} · ★ +${ratingPer(def)} · ${esc(effect(def, 1).text)}</span>
      ${blk.length ? `<span class="bad">${esc(blk[0])}</span>` : ''}</div>›</button>`).join('')}</div>`}`;
}

function ratingInfoSheet() {
  const c = S.st.castle, sum = (a) => a.reduce((x, y) => x + y, 0);
  const lc = sum(c.levels[0]), ll = sum(c.levels[1]), rc = R().rating.castle, rl = R().rating.lands;
  return `<div class="sh-head"><div class="big">${gimg('smallicon/status/f_gold.png')}</div><div><h3>Рейтинг: ${fmtFull(c.rating)}</h3><div class="muted small">Сумма уровней всех зданий</div></div></div>
    <dl class="kv"><dt>Замок: ${lc} ур. × ${rc}</dt><dd>★ ${lc * rc}</dd><dt>Земли: ${ll} ур. × ${rl}</dt><dd>★ ${ll * rl}</dd><dt><b>Итого</b></dt><dd><b>★ ${c.rating}</b></dd></dl>
    <p class="muted small">Каждый новый уровень здания в замке даёт +${rc} к рейтингу, на землях — +${rl}. Во вкладке «Рейтинг» — таблица игроков.</p>`;
}

function profileSheet(p) {
  const self = p.self;
  const c = p.castles[0];
  return `<div class="sh-head"><div class="big">${gimg(RACE_IMG[Object.keys(S.cat.races).find((k) => S.cat.races[k] === p.race)] || 'units/human/general.png')}</div>
    <div><h3>${esc(p.login)}</h3><div class="muted small">${esc(p.race)}${self ? ' · это вы' : ''}</div></div></div>
    <dl class="kv"><dt>Рейтинг</dt><dd>★ ${fmtFull(p.rating)}</dd><dt>В игре с</dt><dd>${fmtDate(p.created)}</dd>
    ${c ? `<dt>Замок</dt><dd>${esc(c.name)} (${c.x}:${c.y})</dd>` : ''}</dl>
    <div class="btns" style="margin-top:14px">${c ? `<button class="btn" data-goworld="${c.x},${c.y}">На карте</button>` : ''}
    ${self ? '' : `<button class="btn primary" data-write="${esc(p.login)}">Написать</button>`}</div>`;
}

function letterSheet(l) {
  const mine = l.from === S.st.user.login;
  return `<div class="sh-head"><div class="big">${gimg('smallicon/unmes.png')}</div><div><h3>${esc(l.subject || '(без темы)')}</h3>
    <div class="muted small">${mine ? `кому: ${esc(l.to)}` : `от: ${esc(l.from)}`} · ${fmtDate(l.at)}</div></div></div>
    <div class="letter">${esc(l.text)}</div>
    ${mine ? '' : `<button class="btn primary" data-write="${esc(l.from)}" data-subj="${esc(`Re: ${l.subject || ''}`)}">Ответить</button>`}`;
}

function openCompose(to, subject = '') {
  openSheet(() => `<div class="sh-head"><div class="big">${gimg('smallicon/softedit.png')}</div><h3>Новое письмо</h3></div>
    <form class="stack" data-form="mail"><input name="to" placeholder="Кому (логин)" value="${esc(to)}" autocapitalize="none" required>
    <input name="subject" placeholder="Тема" value="${esc(subject)}"><textarea name="text" rows="6" placeholder="Текст" required></textarea>
    <button class="btn primary">Отправить</button></form>`);
}

// инфо-окно выбранной клетки мира (s.i в клиенте): координаты, замок, игрок, альянс, рейтинг
function worldInfo() {
  const box = $('#view .infobox'); if (!box) return;
  const w = S.world;
  if (!Iso.sel || Iso.sel.tab !== 'world' || !w) { box.classList.add('hidden'); return; }
  const x = w.cx - w.radius + Iso.sel.x, y = w.cy - w.radius + Iso.sel.y;
  const o = w.objects.find((v) => v.x === x && v.y === y);
  // как в клиенте: название клетки, ниже координаты и владелец
  const title = !o ? 'Свободная земля' : o.kind === 'castle' ? esc(o.name) : esc(o.name);
  box.innerHTML = `<b>${title}</b><br>X: ${x} Y: ${y}` + (o && o.kind === 'castle' ? ` · ${esc(o.owner)}${o.alliance ? ` [${esc(o.alliance)}]` : ''} · ★${fmtFull(o.rating)}` : '')
    + '<small>нажмите ещё раз — действия</small>';
  box.classList.remove('hidden');
}
$('#view').addEventListener('click', (e) => { const b = e.target.closest('.infobox'); if (b && Iso.sel && S.world) openWorldCell(S.world.cx - S.world.radius + Iso.sel.x, S.world.cy - S.world.radius + Iso.sel.y); });

function openWorldCell(x, y) {
  const o = S.world.objects.find((v) => v.x === x && v.y === y);
  if (!o) return toast(`Пустая земля ${x}:${y}. Основание новых замков — позже.`);
  if (o.kind === 'castle') {
    const me = o.ownerId === S.st.user.id;
    return openSheet(() => `<div class="sh-head"><div class="big">${gimg(WORLD_NAME_IMG(o))}</div><div><h3>${esc(o.name)}</h3>
      <div class="muted small">${x}:${y} · ${esc(o.owner)} · ${esc(S.cat.races[o.race] || '')}</div></div></div>
      <dl class="kv"><dt>Рейтинг</dt><dd>★ ${fmtFull(o.rating)}</dd><dt>Альянс</dt><dd>${esc(o.alliance || '—')}</dd></dl>
      ${worldActions(o, x, y)}
      <div class="btns" style="margin-top:8px"><button class="btn" data-profile="${o.ownerId}">Профиль</button>
      ${me ? '' : `<button class="btn" data-write="${esc(o.owner)}">Написать</button>`}</div>`);
  }
  openSheet(() => `<div class="sh-head"><div class="big">${gimg(WORLD_NAME_IMG(o))}</div><div><h3>${esc(o.name)}</h3><div class="muted small">${x}:${y}</div></div></div>
    ${worldActions(o, x, y)}`);
}

// ---------- изометрическая карта (как в оригинале: ромб 62×32, тайлы и спрайты из клиента) ----------
// Основание замка 17×17 (массив k.i клиента): 0 трава, 1 камень, 2-6 дорога; здания — в квадрате 5..11
const CASTLE_BASE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1, 1, 1, 3, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 3, 1, 1, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1, 1, 1, 3, 1, 1, 1, 0, 0, 0, 0, 0],
  [5, 5, 5, 5, 5, 2, 2, 2, 4, 1, 1, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];
const CASTLE_OFF = 5, TW = 62, TH = 32;
function landGroundImg(cell) {
  const x = cell % 15, y = Math.floor(cell / 15), L = S.cat.lands;
  return L.decor[y][x] >= 0 ? `ground/${DECOR[L.decor[y][x]]}.png` : `ground/${GROUND[L.base[y][x]]}.png`;
}

const Iso = { cv: document.createElement('canvas'), cams: {}, sel: null, queued: false };
Iso.cv.className = 'iso';
window.__iso = { Iso, tileScreen: (x, y) => tileScreen(x, y), cam: () => cam() }; // для автотестов
const ictx = Iso.cv.getContext('2d');
const IMGS = new Map();
function pic(path) {
  let e = IMGS.get(path);
  if (!e) { e = { im: new Image(), ok: false }; e.im.onload = () => { e.ok = true; isoDraw(); }; e.im.src = GFX + path; IMGS.set(path, e); }
  return e.ok ? e.im : null;
}
const tileScreen = (x, y) => ({ sx: x * TW / 2 + y * TW / 2, sy: y * TH / 2 - x * TH / 2 });
function screenToTile(px, py) {
  const a = (px - TW / 2) / (TW / 2), b = (py - TH / 2) / (TH / 2);
  return { x: Math.round((a - b) / 2), y: Math.round((a + b) / 2) };
}
const gridN = () => (S.tab === 'castle' ? 17 : S.tab === 'lands' ? 15 : S.world ? 2 * S.world.radius + 1 : 15);
const cam = () => Iso.cams[S.tab] || (Iso.cams[S.tab] = isoFit());

function isoMount(wrap) {
  wrap.prepend(Iso.cv);
  isoResize();
  isoDraw();
}
function isoResize() {
  const r = Iso.cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  Iso.cv.width = Math.max(1, Math.round(r.width * dpr)); Iso.cv.height = Math.max(1, Math.round(r.height * dpr));
}
window.addEventListener('resize', () => { if (Iso.cv.isConnected) { isoResize(); isoDraw(); } });
// начальная камера: замок целиком, земли и мир — примерно 8 клеток по ширине экрана, по центру
function isoFit() {
  const r = Iso.cv.getBoundingClientRect(), n = gridN(), vis = S.tab === 'castle' ? 9.5 : 8; // замок — вместе со рвом
  const z = Math.max(0.35, Math.min(2.5, Math.min(r.width / (vis * TW), r.height / (vis * TH + 60))));
  const c = tileScreen(n / 2 - 0.5, n / 2 - 0.5);
  return { z, x: r.width / 2 - (c.sx + TW / 2) * z, y: r.height / 2 - (c.sy + TH / 2) * z + 18 * z };
}
function isoZoom(k, mx, my) {
  const c = cam(), r = Iso.cv.getBoundingClientRect();
  if (mx === undefined) { mx = r.width / 2; my = r.height / 2; }
  const z = Math.max(0.3, Math.min(3, c.z * k));
  c.x = mx - (mx - c.x) * (z / c.z); c.y = my - (my - c.y) * (z / c.z); c.z = z;
  isoDraw();
}

// касания: один палец — двигать карту, два — масштаб, короткое нажатие — выбрать клетку
(() => {
  const P = new Map(); let g = null;
  const cv = Iso.cv, rel = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); P.set(e.pointerId, rel(e));
    const c = cam();
    if (P.size === 1) { const p = rel(e); g = { mode: 'pan', x: p.x, y: p.y, cx: c.x, cy: c.y, moved: false }; }
    else if (P.size === 2) {
      const [a, b] = [...P.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: c.z, wx: (m.x - c.x) / c.z, wy: (m.y - c.y) / c.z };
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!P.has(e.pointerId) || !g) return;
    P.set(e.pointerId, rel(e));
    const c = cam();
    if (g.mode === 'pan') {
      const p = rel(e), dx = p.x - g.x, dy = p.y - g.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
      if (g.moved) { c.x = g.cx + dx; c.y = g.cy + dy; isoDraw(); }
    } else if (g.mode === 'pinch' && P.size >= 2) {
      const [a, b] = [...P.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      c.z = Math.max(0.3, Math.min(3, g.z0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0));
      c.x = m.x - g.wx * c.z; c.y = m.y - g.wy * c.z;
      isoDraw();
    }
  });
  const up = (e) => {
    if (!P.has(e.pointerId)) return;
    const p = rel(e); P.delete(e.pointerId);
    // нажатие обрабатываем по событию click: иначе этот же click попадёт в фон открытой шторки и закроет её
    Iso.tap = g && g.mode === 'pan' && !g.moved && P.size === 0 ? p : null;
    if (P.size === 0) g = null; else if (g && g.mode === 'pinch') g = { mode: 'none' };
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('click', () => { const t = Iso.tap; Iso.tap = null; if (t) isoTap(t.x, t.y); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = rel(e); isoZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
})();

function isoTap(px, py) {
  const c = cam(), t = screenToTile((px - c.x) / c.z, (py - c.y) / c.z);
  if (S.tab === 'castle') {
    const x = t.x - CASTLE_OFF, y = t.y - CASTLE_OFF;
    if (x < 0 || x >= 7 || y < 0 || y >= 7) return;
    Iso.sel = { tab: 'castle', x: t.x, y: t.y }; isoDraw();
    openCell(VIEW.CASTLE, y * 7 + x);
  } else if (S.tab === 'lands') {
    if (t.x < 0 || t.x >= 15 || t.y < 0 || t.y >= 15) return;
    Iso.sel = { tab: 'lands', x: t.x, y: t.y }; isoDraw();
    openCell(VIEW.LANDS, t.y * 15 + t.x);
  } else if (S.tab === 'world' && S.world) {
    const R0 = S.world.radius, n = 2 * R0 + 1, w = S.world;
    // стрелки за краем карты: сдвиг мира (вверх — y−, вправо — x+, вниз — y+, влево — x−)
    const arrows = [[R0, -1, 0, -R0], [n, R0, R0, 0], [R0, n, 0, R0], [-1, R0, -R0, 0]];
    for (const [ax, ay, dx, dy] of arrows) if (t.x === ax && t.y === ay) { Iso.sel = null; return send({ t: 'world', cx: w.cx + dx, cy: w.cy + dy }); }
    if (t.x < 0 || t.x >= n || t.y < 0 || t.y >= n) return;
    const wx = w.cx - R0 + t.x, wy = w.cy - R0 + t.y;
    // первое нажатие — курсор и инфо-окно, повторное по той же клетке — действия
    if (Iso.sel && Iso.sel.tab === 'world' && Iso.sel.x === t.x && Iso.sel.y === t.y) return openWorldCell(wx, wy);
    Iso.sel = { tab: 'world', x: t.x, y: t.y }; isoDraw(); worldInfo();
  }
}

function isoDraw() {
  if (Iso.queued) return; Iso.queued = true;
  requestAnimationFrame(() => { Iso.queued = false; isoDrawNow(); });
}
function diamond(sx, sy, fill, stroke) {
  const x = ictx;
  x.beginPath(); x.moveTo(sx + TW / 2, sy); x.lineTo(sx + TW, sy + TH / 2); x.lineTo(sx + TW / 2, sy + TH); x.lineTo(sx, sy + TH / 2); x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); }
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = 2.5; x.stroke(); }
}
function ground(path, sx, sy) { const im = pic(path); if (im) ictx.drawImage(im, sx, sy - (im.height - TH)); else diamond(sx, sy, '#3f7d2c'); }
function sprite(path, sx, sy, dy = 0) { const im = pic(path); if (im) ictx.drawImage(im, sx + TW / 2 - im.width / 2, sy - (im.height - TH) + dy); }
// картинка без смещения (как graphics.drawImage(img, x, y, 0) в клиенте)
function raw(path, x, y) { const im = pic(path); if (im) ictx.drawImage(im, x, y); return im; }
const imH = (path) => { const im = pic(path); return im ? im.height : 0; };
function label(text, sx, sy, color = '#ffd27a') {
  const x = ictx; x.font = 'bold 11px system-ui, sans-serif'; x.textAlign = 'center';
  const w = x.measureText(text).width + 8;
  x.fillStyle = '#000a'; x.fillRect(sx + TW / 2 - w / 2, sy + TH - 4, w, 14);
  x.fillStyle = color; x.fillText(text, sx + TW / 2, sy + TH + 7);
}
// полоса стройки как в клиенте: 10 квадратиков 4×4 столбиком над клеткой, заполненные — зелёные (#4EFF00)
function bar(sx, sy, frac) {
  const pct = Math.max(0, Math.min(1, frac)) * 100;
  for (let i = 0; i < 10; i++) {
    const y = sy + 16 - 4 * i;
    ictx.fillStyle = '#424939'; ictx.fillRect(sx, y, 4, 4);
    if (pct > i * 10) { ictx.fillStyle = '#4eff00'; ictx.fillRect(sx + 1, y + 1, 2, 2); }
  }
}
// курсор-рука на выбранной клетке (cursor.png, рисуется в левый верхний угол ромба)
function cursor() { if (Iso.sel && Iso.sel.tab === S.tab) { const p = tileScreen(Iso.sel.x, Iso.sel.y); raw('cursor.png', p.sx, p.sy); } }
// здание на клетке (с учётом стройки): спрайт, уровень, полоса прогресса
function drawCellBuilding(view, cell, b, lvl, p) {
  const q = queueAt(view, cell);
  if (q && q.level === 1) sprite('build/build.png', p.sx, p.sy);
  else if (b >= 0 && BUILD_IMG[displayId(S.by[b], lvl)]) sprite(`build/${BUILD_IMG[displayId(S.by[b], lvl)]}.png`, p.sx, p.sy);
  if (q) bar(p.sx, p.sy, (now() - q.start) / (q.end - q.start));
}

const D = (x, y) => tileScreen(x, y).sx, E = (x, y) => tileScreen(x, y).sy;
const CG = CASTLE_OFF, CH = CASTLE_OFF, CN = 7;
function moat() {
  for (let i = -1; i < CN; i++) raw('ground/rov1.png', D(CG + i, CH) - 10, E(CG + i, CH) - imH('ground/rov1.png') + 5);
  raw('ground/rov6.png', D(CG + 2, CH), E(CG + 2, CH) - 32);
  for (let i = -1; i < CN; i++) raw('ground/rov0.png', D(CG + 6, CH + i) + 36, E(CG + 6, CH + i) - 15);
  raw('ground/rov7.png', D(CG + 7, CH - 1) + 1, E(CG + 7, CH - 1) - 1);
  for (let i = -1; i < CN; i++) raw('ground/rov0.png', D(CG - 2, CH + i) + 36, E(CG - 2, CH + i) - 15);
  for (let i = -1; i < CN; i++) raw('ground/rov1.png', D(CG + i, CH + 8) - 10, E(CG + i, CH + 8) - imH('ground/rov1.png') + 5);
  raw('ground/rov3.png', D(CG + 6, CH + 6) + 63, E(CG + 5, CH + 4) + 15);
  raw('ground/rov2.png', D(CG - 1, CH + 6) + 32, E(CG - 1, CH + 6) + 15);
  raw('ground/rov5.png', D(CG - 1, CH + 2) + 32, E(CG - 1, CH + 3) - 1);
  raw('ground/rov4.png', D(CG - 2, CH - 2) + 63, E(CG - 2, CH - 2) - 1);
}
function fenceBack() {
  for (const i of [0, 1, 2, 4, 5, 6]) raw('fence/fence2.png', D(CG + i, CH) - 5, E(CG + i, CH) - 26);
  for (let i = 0; i < CN; i++) raw('fence/fence0.png', D(CG + 6, CH + i) + 25, E(CG + 6, CH + i) - 25);
  raw('fence/fence3.png', D(CG + 6, CH - 1) + 53, E(CG + 6, CH - 1) + 19 - imH('fence/fence3.png'));
  raw('fence/fence4.png', D(CG + 3, CH), E(CG + 3, CH) - 20);
}
function fenceFront() {
  for (const i of [0, 1, 2, 4, 5, 6]) raw('fence/fence0.png', D(CG - 1, CH + i) + 25, E(CG - 1, CH + i) - 25);
  for (let i = 0; i < CN; i++) raw('fence/fence2.png', D(CG + i, CH + 7) - 3, E(CG + i, CH + 7) - 24);
  raw('fence/fence3.png', D(CG - 1, CH - 1) + 52, E(CG - 1, CH - 1) + 18 - imH('fence/fence3.png'));
  raw('fence/fence3.png', D(CG - 1, CH + 6) + 55, E(CG - 1, CH + 6) + 21 - imH('fence/fence3.png'));
  raw('fence/fence3.png', D(CG + 6, CH + 6) + 54, E(CG + 6, CH + 6) + 20 - imH('fence/fence3.png'));
  raw('fence/fence1.png', D(CG - 1, CH + 3) + 25, E(CG - 1, CH + 3) - 25);
}
// земля сетки + поле grass1 на 5 клеток вокруг (s.a(g, true) в клиенте)
function groundField(n, at) {
  for (let y = -5; y < n + 5; y++) for (let x = n + 4; x >= -5; x--) {
    const p = tileScreen(x, y);
    ground(x >= 0 && x < n && y >= 0 && y < n ? at(x, y) : 'ground/grass1.png', p.sx, p.sy);
  }
}

function isoDrawNow() {
  if (!Iso.cv.isConnected || !S.st || !S.cat) return;
  const dpr = window.devicePixelRatio || 1, c = cam(), x = ictx;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = '#16240f'; x.fillRect(0, 0, Iso.cv.width, Iso.cv.height);
  x.setTransform(c.z * dpr, 0, 0, c.z * dpr, c.x * dpr, c.y * dpr);
  x.imageSmoothingEnabled = false;
  const st = S.st.castle;
  if (S.tab === 'castle') { // порядок как в клиенте: земля → ров → ограда сзади → здания → ограда спереди → курсор
    groundField(17, (xx, y) => `ground/${GROUND[CASTLE_BASE[y][xx]]}.png`);
    moat();
    const fence = buildingLevel(22) > 0; // Забор построен — вокруг замка стена
    if (fence) fenceBack();
    for (let y = 0; y < 7; y++) for (let xx = 6; xx >= 0; xx--) {
      const cell = y * 7 + xx; drawCellBuilding(0, cell, st.grid[0][cell], st.levels[0][cell], tileScreen(xx + CASTLE_OFF, y + CASTLE_OFF));
    }
    if (fence) fenceFront();
    cursor();
  } else if (S.tab === 'lands') {
    const L = S.cat.lands;
    groundField(15, (xx, y) => `ground/${GROUND[L.base[y][xx]]}.png`);
    for (let y = 0; y < 15; y++) for (let xx = 0; xx < 15; xx++) { // края дорог и берегов (s.c)
      const e = L.edge[y][xx]; if (e < 0) continue;
      const p = tileScreen(xx, y); raw(`gborder/${e < 12 ? 'ground' : 'water'}/${EDGE[e % 12]}.png`, p.sx, p.sy);
    }
    for (let y = 0; y < 15; y++) for (let xx = 14; xx >= 0; xx--) {
      const cell = y * 15 + xx, b = st.grid[1][cell], p = tileScreen(xx, y), d = L.decor[y][xx];
      if (b < 0 && !queueAt(1, cell) && d >= 0) sprite(`ground/${DECOR[d]}.png`, p.sx, p.sy, d === 1 ? 3 : d === 2 ? -2 : 0);
      else drawCellBuilding(1, cell, b, st.levels[1][cell], p);
    }
    cursor();
  } else if (S.world) {
    const w = S.world, R0 = w.radius, n = 2 * R0 + 1, objs = new Map(w.objects.map((o) => [`${o.x}:${o.y}`, o]));
    for (let y = 0; y < n; y++) for (let xx = n - 1; xx >= 0; xx--) {
      const p = tileScreen(xx, y); ground('ground/grass.png', p.sx, p.sy);
    }
    const mid = R0; // стрелки перехода по краям, как в клиенте
    for (const [ax, ay, img] of [[mid, -1, 'arrowup'], [n, mid, 'arrowright'], [mid, n, 'arrowdown'], [-1, mid, 'arrowleft']]) {
      const p = tileScreen(ax, ay); ground(`ground/${img}.png`, p.sx, p.sy);
    }
    for (let y = 0; y < n; y++) for (let xx = n - 1; xx >= 0; xx--) {
      const o = objs.get(`${w.cx - R0 + xx}:${w.cy - R0 + y}`); if (!o) continue;
      const p = tileScreen(xx, y);
      ground(WORLD_NAME_IMG(o), p.sx, p.sy);
    }
    cursor();
  }
}

// ---------- старт ----------
S.creds = store.get('tw.creds');
S.remember = true;
if (S.creds) $('#authForm').login.value = S.creds.login;
connect();
