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
  'castle_old', 'dikari', 'lumber', 'troll_rudnik', 'castle_small', 'castle_big', 'camp1', 'camp2', 'camp3'];
const DECOR = ['wood', 'walun', 'mount'];
const EDGE = ['0', '1', '2', '3', '40', '41', '50', '51', '60', '61', '70', '71'];
// id здания → build/<имя>.png (порядок картинок клиента: id = номер картинки − 100)
const BUILD_IMG = ['castle', 'storage', 'mbases', 'baraks', 'market', 'farm_small', 'house_small', 'sawmill_small', 'stone_small', 'iron_small',
  'build', 'smith', 'stables', 'diplomat', 'wisdom_house', 'university', 'arhcamp', 'expedition', 'art_tower', 'commerce', 'magtower',
  'guard_tower', null, 'workshop', 'traveler', 'temple', 'secret', 'sawmill_avg', 'stone_avg', 'iron_avg', 'farm_avg', 'house_avg',
  'sawmill_big', 'stone_big', 'iron_big', 'farm_big', 'house_big', 'chip', 'portal', 'magscool', 'builder', 'beer', 'gendel',
  'alchimia', 'reasury', 'spycentr', 'resident'];
const UNIT_IMG = {
  200: 'human/hd/swordman', 201: 'human/hd/javelineer', 202: 'human/hd/scout', 203: 'human/hd/mage', 204: 'human/hd/knight', 205: 'human/hd/paladin', 206: 'human/jin', 259: 'human/hd/nuruh', 260: 'human/hd/colossus', 261: 'human/hd/cuirassier',
  207: 'elf/hd/archer', 208: 'elf/hd/fighter', 209: 'elf/hd/scout', 210: 'elf/hd/create', 211: 'elf/hd/kenaur', 212: 'elf/hd/edinorog', 213: 'elf/hd/ent', 257: 'elf/hd/chimera', 258: 'elf/hd/beast',
  214: 'dwarv/hd/fighter', 215: 'dwarv/hd/arbalet', 216: 'dwarv/hd/elder', 217: 'dwarv/hd/gryphon', 218: 'dwarv/hd/defender', 219: 'dwarv/hd/revolver', 220: 'dwarv/hd/yeti', 255: 'dwarv/hd/giant', 256: 'dwarv/hd/centurion',
};
const RACE_IMG = { humans: 'units/human/hd/knight.png', elves: 'units/elf/hd/archer.png', dwarves: 'units/dwarv/hd/fighter.png', orcs: 'units/orc/hd/marauder.png' };
const displayId = (def, level) => (!def.tiers ? def.id : level >= 10 ? def.tiers[2] : level >= 5 ? def.tiers[1] : def.tiers[0]);
// у Забора (22) картинки здания в клиенте нет — он виден оградой вокруг замка; в списках — кусок ограды
const bsrc = (id) => { const p = id === 22 ? 'fence/fence1.png' : `build/${BUILD_IMG[id] || 'build'}.png`; return GFX + (HD[p] ? HD[p][0] : p); };
const bimg = (id, cls = 'bi') => `<img class="${cls}" src="${bsrc(id)}" alt="">`;
const gimg = (path, cls = 'gi') => `<img class="${cls}" src="${GFX}${path}" alt="">`;
const RES_IC = Object.fromEntries(['wood', 'stone', 'iron', 'food', 'people'].map((r) => [r, gimg(`../gfx3d/res/${r}.png`, 'ri')]));
const TIME_IC = gimg('res/time.png', 'ri');
const RES_NAME = { wood: 'Дерево', stone: 'Камень', iron: 'Железо', food: 'Еда', people: 'Люди' };
const VIEW = { CASTLE: 0, LANDS: 1 };
const WORLD_NAME_IMG = (o) => `ground/${GROUND[o.kind === 'castle' ? castleTile(o.rating) : o.img]}.png`;
// замок на карте мира растёт с рейтингом: 4 стадии (старт, 500, 1000, 1500)
const castleStage = (rating) => (rating < 500 ? 0 : rating < 1000 ? 1 : rating < 1500 ? 2 : 3);
const castleTile = (rating) => [28, 28, 10, 29][castleStage(rating)]; // старые картинки — пока нет новых gfx/world/castleN.png

const S = {
  ws: null, cat: null, by: {}, st: null, offset: 0, tab: 'castle', sub: null, world: null,
  sheets: [], mode: 'login', race: 0, creds: null, auto: false, pendingBuild: null, mailFolder: 0,
  
};

// ---------- утилиты ----------
// окно-сообщение с кнопкой «Ок» (как «Тренировка начата!» в оригинале)
function okPopup(text) {
  const d = document.createElement('div'); d.className = 'rinfo';
  d.innerHTML = `<div class="rinfo-box okbox"><p>${esc(text)}</p><button type="button" class="okbtn">Ок</button></div>`;
  d.addEventListener('click', (e) => { if (e.target.closest('.okbtn')) d.remove(); });
  document.body.appendChild(d);
}
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
  if (m) { if (!m.until) m.until = t + 2600; el.textContent = m.msg; el.className = `show ${m.cls || 'msg'}`; }
  else el.className = '';
  if (typeof threatBtn === 'function') threatBtn(); // ⚔ на вас идёт армия (watch.js)
  const d = new Date(now());
  $('#clock').textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
}
setInterval(statusTick, 250);
const send = (m) => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(m)); };

// ---------- правила игры (те же формулы, что на сервере: server/src/catalog.js, game.js) ----------
const R = () => S.cat.rules;
function buildSec(def, level, townhall) {
  const T = R().time, t = def.time ? { base: def.time, growth: T.castle.growth } : def.layer === 'lands' ? T.lands : T.castle;
  const raw = Math.max(T.min, Math.round(t.base * t.growth ** (Math.min(level, 20) - 1) * 1.03 ** Math.max(0, level - 20) * T.townhallFactor ** townhall));
  return Math.max(R().minBuildSec, Math.round(raw / S.cat.speed));
}
const ratingPer = (def) => (def.layer === 'lands' ? R().rating.lands : R().rating.castle);
const fr = (v) => (Math.round(v * 100) / 100).toLocaleString('ru-RU'); // дробные очки рейтинга
// что даёт здание на уровне level: {text, short}
function effect(def, level) {
  if (level <= 0) return { text: '—', short: '—' };
  const sp = S.cat.resSpeed || 1, K = S.cat.prodK || {};
  if (def.produces === 'people') {
    const LM = (S.cat.lands && S.cat.lands.mult) || {}, cap = Math.round(R().store.peoplePerHut * (S.cat.lands.hutCap || 1) * level), p = Math.round(S.cat.prod[level] * K.people * (LM[def.id] || 1) * sp);
    return { text: `+${cap} мест для людей, +${p} людей/ч`, short: `+${cap} мест` };
  }
  const GEN = { wood: 'дерева', stone: 'камня', iron: 'железа', food: 'еды' }; // текст (экранируется в окнах), без HTML-иконок
  if (def.produces) { const p = Math.round(S.cat.prod[level] * (K[def.produces] || 1) * (((S.cat.lands && S.cat.lands.mult) || {})[def.id] || 1) * sp); return { text: `+${fmtFull(p)} ${GEN[def.produces]} в час`, short: `+${fmtN(p)}/ч` }; }
  if (def.id === 1) { const c = R().store.levels[level]; return { text: `вместимость склада ${fmtFull(c)} ед.`, short: fmtN(c) }; }
  if (def.id === 0) { const p = Math.round((1 - R().time.townhallFactor ** level) * 100); return { text: `стройки быстрее на ${p}%`, short: `−${p}%` }; }
  const m = typeof milEffect === 'function' && S.st && milEffect(def, level); // функции зданий (mil.js)
  return m || { text: '—', short: '' };
}
function buildingLevel(id) {
  const c = S.st.castle; if (id === 22) return c.wall || 0; // стена — без клетки
  let best = 0;
  for (const v of [0, 1]) c.grid[v].forEach((b, i) => { if (b === id) best = Math.max(best, c.levels[v][i]); });
  return best;
}
function resNow(r) {
  const c = S.st.castle, dt = (now() - S.st.now) / 3600000;
  const v = c.res[r], n = v + c.rate[r] * dt; return v > c.cap[r] ? Math.min(v, n) : Math.min(c.cap[r], n); // сверх Склада (награда советника) — не растёт, не срезается
}
// лимит строек: 3, с премиумом (и у админа) — 5, как на сервере
const maxQueue = () => (S.st.user.admin || (S.st.user.premium || 0) > Date.now() ? 5 : S.cat.maxQueue);
const queueAt = (view, cell) => S.st.castle.queue.find((q) => q.view === view && q.cell === cell);
// можно ли строить: список причин, почему нельзя (пусто — можно)
function blockers(def, level, view, cell) {
  const c = S.st.castle, out = [];
  if (level > def.max) return ['Достигнут максимальный уровень.'];
  if (queueAt(view, cell)) out.push('Здесь уже идёт стройка.');
  if (c.queue.length >= maxQueue()) out.push(`Очередь занята (${c.queue.length}/${maxQueue()}).${maxQueue() < 5 ? ' С премиумом — 5 строек.' : ''}`);
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
    // сам входит только после обрыва связи, когда игрок уже в игре; при открытии игры — экран входа, игрок жмёт «Войти» сам
    if (S.creds && S.entered) { S.auto = true; send({ t: 'login', ...S.creds, dev: DEV }); }
  };
  // пока грузится справочник (catalog.json), сообщения встают в очередь по порядку
  const handle = (m) => { try { onMsg(m); } catch (err) { console.error(err); } };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (S.catWait) S.catWait = S.catWait.then(() => handle(m)); else handle(m); };
  ws.onclose = () => { if (S.ws !== ws) return; $('#offline').classList.add('show'); clearTimeout(S.reTimer); S.reTimer = setTimeout(connect, 2000); };
}
// Возврат в игру (свернули приложение/вкладку, телефон спал): соединение могло тихо оборваться.
// Живое — отвечает на ping за 4 с; иначе сразу переподключаемся (вход по токену «Запомнить меня» — сам).
function wake() {
  const ws = S.ws;
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) { clearTimeout(S.reTimer); return connect(); }
  if (ws.readyState !== WebSocket.OPEN) return;
  clearTimeout(S.pingTimer);
  S.pingTimer = setTimeout(() => { if (S.ws === ws) { S.ws = null; try { ws.close(); } catch { /* уже закрыт */ } clearTimeout(S.reTimer); connect(); } }, 4000);
  try { ws.send(JSON.stringify({ t: 'ping' })); } catch { /* закрыт */ }
}
// экранная клавиатура: окна (чат) поднимаются над ней — высота клавиатуры в CSS-переменной --kb
if (window.visualViewport) {
  const vv = window.visualViewport;
  const kb = () => {
    const h = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', `${h}px`);
    const l = $('#chatList'); if (l && document.activeElement && document.activeElement.closest && document.activeElement.closest('.chatbar')) l.scrollTop = l.scrollHeight;
  };
  vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb);
}
window.appResume = wake; // вызывает Android-приложение при возврате из фона
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
window.addEventListener('online', wake);
window.addEventListener('pageshow', wake);
setInterval(() => { if (!document.hidden) wake(); }, 30000); // раз в 30 с — держать соединение живым

// админ-панель грузится отдельно и только для админа (сервер отдаёт admin.js лишь по токену админа)
function loadAdmin() {
  if (S.admLoaded || !S.creds || !S.creds.token) return;
  S.admLoaded = true;
  const s = document.createElement('script');
  s.src = `admin.js?l=${encodeURIComponent(S.creds.login)}&t=${encodeURIComponent(S.creds.token)}`;
  s.onerror = () => { S.admLoaded = false; };
  document.body.appendChild(s);
}
function setCatalog(c) {
  S.cat = c; S.by = Object.fromEntries(S.cat.buildings.map((b) => [b.id, b]));
  renderRaces(); $('#ver').textContent = S.cat.version ? `версия ${S.cat.version}` : '';
}
function onMsg(m) {
  switch (m.t) {
    case 'pong': clearTimeout(S.pingTimer); break;
    case 'catalog': // справочник: по отпечатку h — из кэша браузера (или сети), пока он не пришёл, остальные сообщения ждут
      if (m.catalog) { setCatalog(m.catalog); break; }
      if (S.cat && S.catH === m.h) break;
      S.catWait = fetch(`catalog.json?h=${m.h}`).then((r) => r.json()).then((c) => { S.catH = m.h; setCatalog(c); })
        .catch(() => toast('Не удалось загрузить игру — проверьте связь')).finally(() => { S.catWait = null; });
      break;
    case 'captcha': $('#capImg').src = m.img; break;
    case 'registered':
      toast('Аккаунт создан!');
      send({ t: 'login', login: S.pendingCreds.login, password: S.pendingCreds.password, dev: DEV });
      break;
    case 'renamed': // сменили ник — сохранённый вход теперь по новому нику
      if (S.creds) { S.creds.login = m.login; S.creds.show = m.login; if (store.get('tw.creds')) store.set('tw.creds', S.creds); }
      break;
    case 'auth':
      // браузер хранит только токен сессии, не пароль
      // show — то, что игрок вводил в поле «Логин» (у админа это секретный логин, а в игре он «admin»)
      S.creds = { login: m.login, token: m.token, show: (S.pendingCreds && S.pendingCreds.login) || (S.creds && S.creds.show) || m.login }; S.pendingCreds = null;
      store.set('tw.creds', S.remember ? S.creds : null);
      S.auto = false; S.entered = true; savedLoginUi();
      setTimeout(() => { if (typeof musicOn === 'function') musicOn(); }, 0);
      (DEVINFO ? Promise.resolve(DEVINFO) : deviceInfo()).then((d) => send({ t: 'devinfo', dev: DEV, ...d })).catch(() => {});
      if (typeof gameLoading === 'function') gameLoading(); // заставка, пока грузится графика замка (loading.js)
      $('#auth').classList.add('hidden'); $('#game').classList.remove('hidden');
      break;
    case 'state': onState(m); if (S.st && S.st.user && S.st.user.admin) loadAdmin(); if (typeof questBtn === 'function') questBtn(); if (typeof bossBtn === 'function') bossBtn(); if (typeof stashBtn === 'function') stashBtn(); if (typeof advBar === 'function') advBar(); break;
    case 'stash': S.stash = m.list; S.stashCastle = m.castle; refreshSheet(); break;
    case 'quests': S.quests = m.q; refreshSheet(); break;
    case 'qdone': questDone(m); break;
    case 'world': {
      const old = S.world; S.wPending = 0;
      // плавная прокрутка: новый участок мира подгружается без перерисовки экрана — камера сдвигается на разницу центров
      if (old && S.tab === 'world' && Iso.cams.world && $('.mapwrap') && !S.wJump) {
        const dx = m.cx - old.cx, dy = m.cy - old.cy, c = Iso.cams.world, t = tileScreen(dx, dy);
        c.x += t.sx * c.z; c.y += t.sy * c.z;
        if (Iso.sel && Iso.sel.tab === 'world') { Iso.sel.x -= dx; Iso.sel.y -= dy; }
        S.world = m; const f = $('[data-wsearch]'); if (f && document.activeElement !== f.x && document.activeElement !== f.y) { f.x.value = m.cx; f.y.value = m.cy; } isoDraw(); break;
      }
      S.wJump = false;
      if (!old || old.cx !== m.cx || old.cy !== m.cy) { delete Iso.cams.world; if (Iso.sel && Iso.sel.tab === 'world') Iso.sel = null; }
      S.world = m; if (S.tab === 'world') renderView(); break;
    }
    case 'rating': S.ratingRows = m.rows; refreshSheet(); break;
    case 'profile': if (m.acct) { S.lastAcct = m.profile; S.lastProfile = m.profile; if (m.refresh && S.sheets.length) { S.sheets[S.sheets.length - 1] = () => accountWin(m.profile); showSheet(false); } else openSheet(() => accountWin(m.profile)); break; }
      if (m.refresh && S.sheets.length) { S.sheets[S.sheets.length - 1] = () => profileSheet(m.profile); showSheet(false); } else openSheet(() => profileSheet(m.profile)); break;
    case 'mail': S.mail = m; refreshSheet(); break;
    case 'dialogs': case 'dialog': dialogsMsg(m); break;
    case 'picok': picMsg(m); break;
    case 'avalikes': avaMsg(m); break;
    case 'news': newsMsg(m); break;
    case 'welcome': welcomeShow(m); break;
    case 'boss': S.boss = m.data; refreshSheet(); break;
    case 'forum': forumMsg(m); break;
    case 'letter': openSheet(() => letterSheet(m.letter)); break;
    case 'toast':
      if (m.msg === 'Тренировка начата!') { closeAllSheets(); okPopup(m.msg); break; } // как в оригинале: окно «Ок», затем замок
      if (m.msg === 'Тренировка генерала начата!') { closeSheet(); okPopup(m.msg); break; } // назад в окно «Генерал» с таймером
      if (m.msg === 'Армия переформирована!') { if (S.rg) { S.rg.units = {}; S.rg.gen = false; S.rg.name = ''; } closeSheet(); okPopup(m.msg); break; } // назад к армии
      toast(m.msg);
      if (/отправлено/.test(m.msg) && S.sheets.length && S.composing) { S.composing = false; closeSheet(); }
      if (/Армия выступила|Поход запланирован/.test(m.msg) && (S.army || S.cmp)) { S.army = null; S.cmp = null; closeAllSheets(); }
      if (/Торговцы \(\d+\) отправились/.test(m.msg) && S.mkt) { S.mkt = null; closeSheet(); }
      break;
    case 'loginlock': showLock(Date.now() + m.sec * 1000); break;
    case 'error':
      if (S.picQ || (S.dlg && S.dlg.picBusy)) { S.picQ = null; S.dlg.picBusy = null; } // отправка фото сорвалась — снять «Отправка…»
      if (S.auto || !S.st) { // ошибка входа — показать форму
        S.auto = false; if (S.creds) $('#authForm').login.value = S.creds.show || S.creds.login;
        if (/Сессия устарела|заблокирован/i.test(m.msg)) { S.creds = null; store.set('tw.creds', null); } // сохранённый вход стирается, только если он больше не действует
        savedLoginUi();
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
// выбор расы — как в оригинале: 4 портрета, у выбранного зелёный фон; при нажатии — окошко с описанием расы
const RACE_DESC = {
  humans: 'Доблестная, молодая и свободолюбивая раса. Преимущество расы: Сильная конница.',
  elves: 'Жители бескрайних лесов, искусные маги и чародеи. Преимущество расы: Самые сильные магические юниты.',
  dwarves: 'Отважные и безрассудные жители гор и подземелий, привыкшие полагаться на свою пехоту. Преимущество расы: Самая сильная пехота.',
  orcs: 'Воинственная раса, особенно за крепкой стеной замка. Преимущество расы: Большой запас жизни у боевых юнитов.',
};
function renderRaces() {
  // портреты рас (gfx/auth/race_*.webp): выбранная — золотая рамка и свечение
  $('#races').innerHTML = `<div class="rgrid2">${S.cat.raceOrder.map((r, i) => `<button type="button" class="rcard ${i === S.race ? 'on' : ''}" data-race="${i}" aria-label="${esc(S.cat.races[r])}">
      <span class="rpic"><img src="gfx/auth/race_${r}.webp" alt=""></span><b>${esc(S.cat.races[r])}</b></button>`).join('')}</div>`;
}
function raceInfo(r) {
  const d = document.createElement('div'); d.className = 'rinfo';
  d.innerHTML = `<div class="rinfo-box"><p>${esc(RACE_DESC[r] || S.cat.races[r])}</p><button type="button" class="rinfo-ok">Хорошо</button></div>`;
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('.rinfo-ok')) d.remove(); });
  document.body.appendChild(d);
}
// ошибка входа — поля подсвечиваются красной табличкой (form.bad), пока текст ошибки не стёрт
new MutationObserver(() => $('#authForm').classList.toggle('bad', !!$('#authErr').textContent.trim())).observe($('#authErr'), { childList: true, characterData: true, subtree: true });
function setMode(mode) {
  S.mode = mode;
  $$('#authTabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('#raceBox').classList.toggle('hidden', mode !== 'reg'); $('#nickBox').classList.toggle('hidden', mode !== 'reg'); $('#authForm').nick.required = mode === 'reg';
  $('#capBox').classList.toggle('hidden', mode !== 'reg'); if (mode === 'reg') send({ t: 'captcha' });
  $('#authBtn').textContent = mode === 'reg' ? 'Создать аккаунт' : 'Войти';
  $('#authForm').password.autocomplete = mode === 'reg' ? 'new-password' : 'current-password';
  $('#authForm').password.placeholder = mode === 'reg' ? 'от 5 символов' : ''; $('#authForm').password.minLength = mode === 'reg' ? 5 : 0;
  $('#authErr').textContent = '';
  const locked = mode === 'login' && S.lockUntil > Date.now(); // табличка блокировки — только на вкладке «Вход»
  $('#lockBox').classList.toggle('hidden', !locked); $('#authBtn').disabled = locked;
}
// id устройства (для поиска мультов админом): случайный, хранится в браузере
const DEV = (() => { let d = store.get('tw.dev'); if (!/^[a-f0-9]{16,40}$/.test(d || '')) { d = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join(''); store.set('tw.dev', d); } return d; })();
// данные устройства для админки (поиск мультов): модель, система, браузер, экран, железо; «отпечаток» — хэш железа,
// он совпадает у одного телефона даже после очистки данных браузера или переустановки приложения
async function deviceInfo() {
  const n = navigator, d = { ua: n.userAgent || '', lang: n.language || '', tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || '', tzo: new Date().getTimezoneOffset(),
    scr: `${screen.width}x${screen.height}`, dpr: window.devicePixelRatio || 1, cores: n.hardwareConcurrency || 0, mem: n.deviceMemory || 0, touch: n.maxTouchPoints || 0,
    app: /WarKingsApp/.test(n.userAgent), plat: (n.userAgentData && n.userAgentData.platform) || n.platform || '' };
  try { if (n.userAgentData && n.userAgentData.getHighEntropyValues) { const h = await n.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList']); d.model = h.model || ''; d.osv = h.platformVersion || ''; } } catch { /* нет */ }
  try { const gl = document.createElement('canvas').getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); if (e) d.gpu = String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL) || ''); } catch { /* нет */ }
  const raw = [d.model, d.plat, d.scr, d.dpr, d.cores, d.mem, d.gpu, d.tz, d.touch].join('|');
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)); d.fp = [...new Uint8Array(b)].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join(''); } catch { d.fp = ''; }
  return d;
}
let DEVINFO = null; deviceInfo().then((d) => { DEVINFO = d; }).catch(() => {});
$('#capNew').addEventListener('click', () => send({ t: 'captcha' }));
$('#authTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('#races').addEventListener('click', (e) => { const b = e.target.closest('[data-race]'); if (b) { S.race = Number(b.dataset.race); renderRaces(); raceInfo(S.cat.raceOrder[S.race]); } });
$('#authForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target, login = f.login.value.trim(), password = f.password.value;
  $('#authErr').textContent = '';
  S.remember = f.remember.checked;
  S.pendingCreds = { login, password };
  // сохранённый вход: пароль не нужен, если логин тот же — вход по токену
  if (S.mode !== 'reg' && (!password || password === SAVED_PASS) && S.creds && S.creds.token && login === (S.creds.show || S.creds.login)) { S.pendingCreds = { login, password: '' }; S.auto = true; $('#authForm').password.value = ''; return send({ t: 'login', ...S.creds, dev: DEV }); }
  if (S.mode !== 'reg' && !password) { $('#authErr').textContent = 'Введите пароль.'; return; }
  if (S.mode === 'reg' && login.length < 5) { $('#authErr').textContent = 'Логин слишком короткий (минимум 5 символов).'; return; }
  if (S.mode === 'reg') { send({ t: 'register', login, password, nick: f.nick.value.trim(), race: String(S.race), captcha: f.captcha.value, dev: DEV }); f.captcha.value = ''; }
  else send({ t: 'login', login, password, dev: DEV });
});

// ---------- шапка: ресурсы и очередь ----------
function renderTop() { // конверты сообщений и отчётов наверху (как в 3D-клиенте)
  const u = S.st.unread, rep = S.st.castle.mil.unreadReports;
  { // оповещение звуком: новое сообщение, отчёт, новость или нападение на нас
    const mv = S.st.moves || {}, cnt = [u, rep, S.st.newsUnread || 0, mv.inc || 0];
    if (S.prevCnt && cnt.some((v, i) => v > S.prevCnt[i]) && typeof sfxNotify === 'function') sfxNotify();
    S.prevCnt = cnt;
  }
  $('#unread').textContent = u; $('#unread').classList.toggle('hidden', !u);
  { const nn = S.st.newsUnread || 0; $('#btnNews').classList.toggle('hidden', !nn); $('#unnews').textContent = nn > 1 ? nn : ''; $('#unnews').classList.toggle('hidden', nn < 2); }
  $('#unrep').textContent = rep; $('#unrep').classList.toggle('hidden', !rep);
  // верхняя панель: сколько армий идёт (подкрепления — зелёный щит, наши нападения — зелёные мечи, на нас — красные мечи)
  const mv = S.st.moves || {};
  for (const [id, n] of [['#mvReinf', mv.reinf], ['#mvAtt', mv.att], ['#mvInc', mv.inc], ['#mvHome', mv.home]]) { const b = $(id); b.classList.toggle('hidden', !n); b.querySelector('b').textContent = n || ''; }
  tick();
}
// ресурсы на верхней панели: коротко (12,3к), склад полон — оранжевым
const shortN = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',')}м` : v >= 1e4 ? `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace('.', ',')}к` : String(Math.floor(v)));
function topRes() {
  const c = S.st.castle;
  $$('[data-tr]').forEach((el) => {
    const r = el.dataset.tr, v = resNow(r), full = v >= c.cap[r] - 0.5;
    if (!el.firstChild) el.innerHTML = `<img src="gfx3d/res/${r}.png" alt=""><b></b>`;
    const b = el.lastChild, txt = shortN(v); if (b.textContent !== txt) b.textContent = txt;
    el.classList.toggle('full', full);
  });
}
$('#resBar').addEventListener('click', () => openSheet(resSheet));
function tick() {
  if (!S.st) return;
  const c = S.st.castle, t = now();
  topRes();
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


// окно «Ресурсы» как в оригинале: запасы/вместимость и добыча в час
// окно «Ресурсы» в новом оформлении: золотая рамка с короной, ленты «Ресурсы» и «Добыча», кнопка «Закрыть»
function resSheet() {
  const c = S.st.castle, row = (r, t) => `<div class="rsline"><img src="gfx3d/res/${r}.png" alt="">${t}</div>`;
  return `<div class="rsframe"><img class="rscrown" src="gfx3d/res/crown.png" alt="">
    <div class="rsrib">Ресурсы</div><div class="rspanel">${RES.map((r) => row(r, `${Math.floor(resNow(r))}/${c.cap[r]} ед.`)).join('')}</div>
    <div class="rsrib">Добыча</div><div class="rspanel">${RES.map((r) => row(r, `${c.rate[r]} ед/час`)).join('')}
    <button class="rsclosebtn" data-rsclose><img src="gfx3d/res/closebtn.png" alt="Закрыть"></button></div></div>`;
}
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-rsclose]')) closeSheet(); });

// ---------- вкладки ----------
function setTab(tab) {
  S.tab = tab;
  $$('#locs [data-loc]').forEach((b) => b.classList.toggle('on', b.dataset.loc === tab));
  if (tab === 'world') { S.wJump = true; S.world = null; send({ t: 'world', cx: S.st.castle.x, cy: S.st.castle.y }); } // выход в мир — всегда к текущему замку
  renderView(); if (typeof stashBtn === 'function' && S.st) stashBtn(); if (typeof advBar === 'function' && S.st) advBar();
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
  world: () => `<div class="mapview">${MAPWRAP}<form class="wsearch" data-wsearch><span>X</span><input name="x" type="number" inputmode="numeric" value="${S.world ? S.world.cx : ''}"><span>Y</span><input name="y" type="number" inputmode="numeric" value="${S.world ? S.world.cy : ''}"><button class="pbtn small">Найти</button><button type="button" class="pbtn small" data-whome>Домой</button></form></div>`,
};

function summaryHtml(view) {
  const c = S.st.castle, list = [];
  c.grid[view].forEach((b, i) => { if (b >= 0) list.push([b, c.levels[view][i], i]); });
  list.sort((a, b) => b[1] - a[1]);
  return `<h3 style="margin:4px 0 10px">${view === VIEW.CASTLE ? 'Здания замка' : 'Постройки на землях'} (${list.length})</h3><div class="list">${list.map(([b, l, i]) => {
    const def = S.by[b], q = queueAt(view, i);
    return `<button class="row" data-view="${view}" data-cell="${i}"><span class="ic">${bimg(displayId(def, l))}</span>
      <div class="grow"><b>${esc(def.name)} · ${l} ур.</b><span>${q ? `строится ${q.level} ур. · <span class="cd" data-e="${q.end}"></span>` : `${effect(def, l).text} · ★ ${fr(l * ratingPer(def))}`}</span></div>›</button>`;
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
        <span>до ${b.max} ур. · ★ ${fr(ratingPer(b))} за уровень${req ? ` · нужно: ${esc(req)}` : ''}${lvl ? ` · у вас ${lvl} ур.` : ''}</span></div>›</button>`;
    }).join('')}</div>`;
    return `<div class="vhead"><button class="iconbtn" data-back>‹</button><h2>Справочник зданий</h2></div>
      <div class="pad" style="padding-top:0">${group('castle', 'Замок (сетка 7×7)')}${group('lands', 'Земли (сетка 15×15)')}</div>`;
  },
  army: () => armyBookHtml(), // оригинальные юниты игры (mil.js)
  rules() {
    const T = R().time, st = R().store;
    return `<div class="vhead"><button class="iconbtn" data-back>‹</button><h2>Формулы</h2></div><div class="pad" style="padding-top:0">
      <div class="section">Стоимость уровня</div>
      <div class="formula">Замок: база ${RES_IC.wood}120 ${RES_IC.stone}110 ${RES_IC.iron}80 ${RES_IC.food}60 ${RES_IC.people}2 × 1.3^(ур−1)<br>Земли: база ${RES_IC.wood}60 ${RES_IC.stone}50 ${RES_IC.iron}40 ${RES_IC.food}30 ${RES_IC.people}1 × 1.45^(ур−1)<br>Люди: база × уровень (не тратятся, заняты на время стройки)</div>
      <div class="section">Время стройки</div>
      <div class="formula">Замок: ${T.castle.base} с × ${T.castle.growth}^(ур−1)<br>Земли: ${T.lands.base} с × ${T.lands.growth}^(ур−1)<br>× ${T.townhallFactor}^(ур. Ратуши) ÷ скорость мира (×${S.cat.speed})</div>
      <div class="section">Рейтинг</div>
      <div class="formula">Полностью отстроенный замок — ★ ${R().rating.max}: постройки замка до ${R().rating.castleMax}, земли до ${R().rating.landsMax}.<br>Уровень здания в замке: ★ ${fr(R().rating.castle)}<br>Уровень на землях: ★ ${fr(R().rating.lands)}</div>
      <div class="section">Добыча и склад</div>
      <div class="formula">Базово ${R().baseRate.wood}/ч дерева, камня и железа + добыча зданий земель по таблице (еда ×${S.cat.prodK.food}, люди ×${S.cat.prodK.people})<br>
      Склад: ${st.base} + сумма всех Складов (по уровням: ${st.levels.slice(1).join(', ')})<br>Люди: ${st.people} + ${st.peoplePerHut} мест за уровень Хибары</div>
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
  me: () => openAccount(),
  mail: () => openDialogs(), // «Сообщения»: список переписок (dialogs.js)
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
  logout: () => { send({ t: 'logout' }); store.set('tw.creds', null); setTimeout(() => location.reload(), 200); },
};
function openSub(name) { openSheet(() => SUBPAGES[name]()); } // разделы открываются окнами поверх карты

// ---------- окна и кнопка «Назад» Android ----------
// Пока открыто окно или меню, в истории браузера лежит ровно одна наша запись: «Назад» закрывает верхнее окно.
// Так история не расходится при быстрых нажатиях (раньше каждое окно добавляло запись, и go(-n) мог уйти со страницы).
S.hist = false; S.backPending = false; S.pushAfter = false;
function overlayOpen() { return S.sheets.length > 0 || !!S.menu; }
function pushOverlay() {
  if (S.hist) return;
  if (S.backPending) { S.pushAfter = true; return; }
  history.pushState({ tw: 1 }, ''); S.hist = true;
}
function popOverlay() { if (!S.hist || overlayOpen()) return; S.hist = false; S.backPending = true; history.back(); }
window.addEventListener('popstate', () => {
  if (S.backPending) { // наш собственный history.back()
    S.backPending = false;
    if (S.pushAfter || overlayOpen()) { S.pushAfter = false; history.pushState({ tw: 1 }, ''); S.hist = true; }
    return;
  }
  S.hist = false; // «Назад» пользователя
  if (S.sheets.length) { S.sheets.pop(); showSheet(true); }
  else if (S.menu && typeof closeMenu === 'function') closeMenu(true);
  if (overlayOpen()) pushOverlay();
});
function openSheet(render) {
  S.sheets.push(render);
  pushOverlay();
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
// пока палец держит ползунок (тренировка), окно не перерисовывается — иначе ползунок под пальцем заменяется и «слетает»
let sliderHeld = false, refreshLater = false;
document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('input[type=range]')) sliderHeld = true; }, true);
for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) document.addEventListener(ev, () => { if (!sliderHeld) return; sliderHeld = false; if (refreshLater) { refreshLater = false; setTimeout(refreshSheet, 50); } }, true);
function refreshSheet() {
  if (sliderHeld) { refreshLater = true; return; }
  if (!S.sheets.length || document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
  const sc = $('#sheetBody').scrollTop; showSheet(false); $('#sheetBody').scrollTop = sc;
}
function closeSheet() { if (!S.sheets.length) return; if (S.sheets.pop() === dialogWin) send({ t: 'dialogclose' }); showSheet(true); popOverlay(); unselect(); }
function closeAllSheets() { if (!S.sheets.length) return; if (S.sheets.includes(dialogWin)) send({ t: 'dialogclose' }); S.sheets = []; showSheet(); popOverlay(); unselect(); }
// окно закрыто — снять подсветку клетки в замке и на землях
function unselect() { if (!S.sheets.length && Iso.sel && Iso.sel.tab !== 'world') { Iso.sel = null; isoDraw(); } }
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
  if (d.write !== undefined) return d.write ? openDialog(d.write) : openCompose('', d.subj || '');
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
  openSheet(() => {
    const c = S.st.castle, b = c.grid[view][cell], q = queueAt(view, cell);
    if (b < 0 && !q) return emptySheet(view, cell);
    return buildingSheet(S.by[b >= 0 ? b : q.building], c.levels[view][cell], { view, cell });
  });
}

function costChips(cost) {
  return `<div class="chips">${RES.map((r) => `<span data-need="${r}:${cost[r]}">${RES_IC[r]} ${fmtFull(cost[r])}</span>`).join('')}</div>`;
}

// строка «Текущая …» в окне здания (как в оригинале: «Текущая вместимость склада: 5000 ед.»)
function currentLine(def, lvl) {
  if ([13, 21, 25, 46].includes(def.id)) return ''; // в оригинале у Дипломатического центра и Резиденции этой строки нет
  if (S.cat.mil && S.cat.mil.units.some((u) => u.building === def.id)) return ''; // и у зданий тренировки (видео оригинала)
  if (def.id === 1) return `Текущая вместимость склада: <b>${fmtFull(R().store.levels[lvl])} ед.</b>`;
  const e = effect(def, lvl).text;
  return e && e !== '—' ? `Сейчас даёт: <b>${esc(e)}</b>` : '';
}
// шапка окна здания: картинка в золотой рамке, справа название, уровень, рейтинг
function bwinHead(def, lvl, right, title = def.name) {
  return `${title ? ribbon(title) : ''}<div class="bwhead"><div class="bframe">${bimg(displayId(def, Math.max(1, lvl)))}</div><div class="bwright">${right}</div></div>`;
}
// карточка здания; ctx = {view, cell} — можно строить, null — только справочник
function buildingSheet(def, lvl, ctx) {
  const th = S.st.castle.townhall, w = ratingPer(def);
  const q = ctx && queueAt(ctx.view, ctx.cell);
  const cur = currentLine(def, lvl);
  let h = bwinHead(def, lvl, `<b>${esc(def.name)}</b><div>${lvl ? `${lvl} уровень` : 'не построено'}</div><div>Рейтинг ★ : ${fr(lvl * w)}</div>`) +
    `${lvl ? `<div class="bwline center">Текущая прочность здания: ${fmtFull(def.hp * lvl)}</div>` : ''}
    <div class="bwline">${esc(def.desc)}</div>${cur ? `<hr class="cwhr"><div class="bwline">${cur}</div>` : ''}`;
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
  }
  if (ctx && lvl > 0) h += buildingFunctions(def, lvl); // функции здания (mil.js) — как в оригинале, над «Разрушить»
  if (ctx) h += `${lvl > 0 && def.id !== 0 && !q ? `<button class="rbar" data-demolish="${ctx.view},${ctx.cell}"><img src="${GFX}smallicon/upgrade.png" alt=""> Разрушить</button>` : ''}
    <button class="rbar" data-about="${def.id}"><img src="${GFX}smallicon/soft_help.png" alt=""> О здании</button>`;
  return h;
}

// «О здании»: максимальный уровень, прочность, стоимость постройки, описание, необходимые здания
function aboutSheet(def) {
  const cost = def.costs[1], th = S.st.castle.townhall, sec = buildSec(def, 1, th);
  const clock = `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const table = def.id === 1 ? R().store.levels.slice(1).map((c, i) => `${i + 1} уровень - ${c}.`)
    : def.produces ? Array.from({ length: def.max }, (_, i) => `${i + 1} уровень - ${effect(def, i + 1).text}.`) : [];
  const reqs = Object.entries(def.req);
  return `${bwinHead(def, def.max, `<b>${esc(def.name)}</b><div>Рейтинг ★: +${fr(ratingPer(def))}</div><div>Максимальный уровень: <img class="upar" src="${GFX}smallicon/maxupgrade.png" alt=""> ${def.max}</div>`, 'Справка')}
    <div class="bwline">Прочность на первом уровне: ${fmtFull(def.hp)}</div>
    <div class="costbox"><div class="cbt">Стоимость постройки:</div><div class="cbg">${RES.map((r) => `<div>${RES_IC[r]}<b>${fmtFull(cost[r])}</b></div>`).join('')}<div>${TIME_IC}<b>${clock}</b></div></div></div>
    ${ribbon('Описание:')}<div class="bwline">${esc(def.about || def.desc)}${table.length ? `<br>${table.map(esc).join('<br>')}` : ''}</div>
    ${ribbon('Необходимые здания:')}${reqs.length ? reqs.map(([id, l]) => `<div class="reqbar ${buildingLevel(Number(id)) >= l ? '' : 'no'}">${esc(S.by[id].name)} ${l} ур.</div>`).join('') : '<div class="bwline">Нет.</div>'}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-demolish],[data-about]'); if (!t) return;
  if (t.dataset.about) return openSheet(() => aboutSheet(S.by[t.dataset.about]));
  const [view, cell] = t.dataset.demolish.split(',').map(Number), def = S.by[S.st.castle.grid[view][cell]];
  if (def && confirm(`Разрушить «${def.name}» ${S.st.castle.levels[view][cell]} ур.? Здание пропадёт, ресурсы не вернутся.`)) { send({ t: 'demolish', view, cell }); closeSheet(); }
});


function emptySheet(view, cell) {
  if (view === VIEW.CASTLE && S.cat.castlePath && S.cat.castlePath.includes(cell)) {
    return `<div class="sh-head"><div class="big">${gimg('ground/roadS0.png')}</div><div><h3>Тропинка</h3><div class="muted small">Дорога от ворот к Ратуше</div></div></div><p class="desc">На тропинке строить нельзя.</p>`;
  }
  let opts, title, sub;
  if (view === VIEW.LANDS) {
    const x = cell % LN(), y = Math.floor(cell / LN()), L = S.cat.lands;
    opts = S.cat.landOptions[y][x];
    title = ['Лес', 'Валуны', 'Горы'][L.decor[y][x]] || { 0: 'Луг', 7: 'Пашня', 8: 'Каменистая земля', 9: 'Вода' }[L.base[y][x]] || 'Земля';
    sub = `Земли: строительство · клетка ${x + 1}:${y + 1}`;
  } else {
    opts = S.cat.buildings.filter((b) => b.layer === 'castle' && b.id !== 22).map((b) => b.id); // стена — из Ратуши (wall.js)
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
      <span>${TIME_IC} ${fmtT(buildSec(def, 1, th))} · ★ +${fr(ratingPer(def))} · ${esc(effect(def, 1).text)}</span>
      ${blk.length ? `<span class="bad">${esc(blk[0])}</span>` : ''}</div>›</button>`).join('')}</div>`}`;
}

function ratingInfoSheet() {
  const c = S.st.castle, sum = (a) => a.reduce((x, y) => x + y, 0);
  const lc = sum(c.levels[0]), ll = sum(c.levels[1]), rc = R().rating.castle, rl = R().rating.lands;
  return `${ribbon(`Рейтинг замка: ${fmtFull(c.rating)}`)}
    <dl class="kv"><dt>Замок: ${lc} ур.</dt><dd>★ ${Math.min(R().rating.castleMax, Math.round(lc * rc))} из ${R().rating.castleMax}</dd><dt>Земли: ${ll} ур.</dt><dd>★ ${Math.min(R().rating.landsMax, Math.round(ll * rl))} из ${R().rating.landsMax}</dd><dt><b>Итого</b></dt><dd><b>★ ${c.rating} из ${R().rating.max}</b></dd></dl>
    <p class="muted small">Полностью отстроенный замок даёт ${R().rating.max}. Уровень здания в замке: +${fr(rc)}, на землях: +${fr(rl)}.</p>`;
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
// поиск по координатам на карте мира
$('#view').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-wsearch]'); if (!f) return; e.preventDefault(); document.activeElement && document.activeElement.blur();
  const x = Math.round(Number(f.x.value)), y = Math.round(Number(f.y.value));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return toast('Введите X и Y.', 'err');
  S.wJump = true; send({ t: 'world', cx: x, cy: y });
});
$('#view').addEventListener('click', (e) => { if (e.target.closest('[data-whome]')) { S.wJump = true; send({ t: 'world', cx: S.st.castle.x, cy: S.st.castle.y }); } });
$('#view').addEventListener('click', (e) => { const b = e.target.closest('.infobox'); if (b && Iso.sel && S.world) openWorldCell(S.world.cx - S.world.radius + Iso.sel.x, S.world.cy - S.world.radius + Iso.sel.y); });

function openWorldCell(x, y) {
  const o = S.world.objects.find((v) => v.x === x && v.y === y);
  if (!o) return toast(`Пустая земля ${x}:${y}. Основание новых замков — позже.`);
  if (o.kind === 'castle') return openSheet(() => castleWin(o, x, y)); // окно «Замок» как в клиенте (ui3d.js)
  if (o.boss) return openBoss(); // мировой босс (boss.js)
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
  const x = cell % LN(), y = Math.floor(cell / LN()), L = S.cat.lands;
  return L.decor[y][x] >= 0 ? `ground/${DECOR[L.decor[y][x]]}.png` : `ground/${GROUND[L.base[y][x]]}.png`;
}

const Iso = { cv: document.createElement('canvas'), cams: {}, sel: null, queued: false };
Iso.cv.className = 'iso';
window.__iso = { Iso, tileScreen: (x, y) => tileScreen(x, y), cam: () => cam() }; // для автотестов
let ictx = Iso.cv.getContext('2d'); // let: статичный слой карты мира рисуется теми же функциями в свой холст
// плотность пикселей холста не больше 2: на телефонах с ×3 рисовать в 2,25 раза меньше точек (на глаз почти не видно)
const isoDpr = () => Math.min(2, window.devicePixelRatio || 1);
let PIC_LOADED = 0; // сколько картинок догрузилось — чтобы обновить готовый слой карты мира
const IMGS = new Map();
// перерисованная графика высокого качества: файл в HD[path] во столько раз крупнее, на карте рисуется в прежнем размере
const HD = { 'build/castle.png': ['build/hd/castle.png', 8], 'build/spycentr.png': ['build/hd/spycentr.png', 8],
  // все остальные здания — сглаженное увеличение ×8 (Scale2x ×3) старой пиксельной графики
  ...Object.fromEntries('alchimia arhcamp art_tower baraks beer build builder chip commerce diplomat expedition farm_avg farm_big farm_small gendel guard_tower house_avg house_big house_small iron_avg iron_big iron_small magscool magtower market mbases mount portal reasury resident sawmill_avg sawmill_big sawmill_small secret smith stables stone_avg stone_big stone_small storage temple traveler university walun wisdom_house workshop'.split(' ').map((n) => [`build/${n}.png`, [`build/hd/${n}.png`, 8]])), 'ground/camp1.png': ['ground/hd/camp1.png', 4], 'ground/camp2.png': ['ground/hd/camp2.png', 4], 'ground/camp3.png': ['ground/hd/camp3.png', 4],
  // стена замка (Забор) — HD, нарисована по листу с 5 частями
  ...Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`fence/fence${i}.png`, [`fence/hd/fence${i}.png`, 8]])),
  // ров (кольцо из одного нарисованного куска, с течением) и трава в замке — HD
  ...Object.fromEntries(['TL', 'R', 'BR', 'L', 'cL', 'cT', 'cR', 'cB', 'bL', 'bTL'].flatMap((n) => Array.from({ length: 16 }, (_, f) => [`ground/moat_${n}_${f}.png`, [`ground/hd/moat_${n}_${f}.png`, 6]]))),
  // Караульная башня — новая графика, растёт с уровнем: 1–4, 5–9, 10+ (ширина основания ≈ 50 точек, как у старых зданий)
  'build/watch1.png': ['watch/tower1.png', 354 / 50], 'build/watch2.png': ['watch/tower2.png', 319 / 46], 'build/watch3.png': ['watch/tower3.png', 323 / 46],
  'ground/grassC.png': ['ground/hd/grassC.png', 8], 'ground/grass1C.png': ['ground/hd/grass1C.png', 8] };

// в замке трава своя (HD): снаружи стены — светлая (grass1C), внутри — с цветами (grassC); на Землях и в Мире — прежняя
const CASTLE_GRASS = { 'ground/grass.png': 'ground/grass1C.png', 'ground/grass1.png': 'ground/grass1C.png' };
const gpath = (path) => (S.tab === 'castle' && CASTLE_GRASS[path]) || path;
function pic(path) {
  let e = IMGS.get(path);
  if (!e) {
    e = { im: new Image(), ok: false };
    const hd = HD[path];
    e.im.onload = () => {
      if (hd) { const w = e.im.naturalWidth / hd[1], h = e.im.naturalHeight / hd[1]; Object.defineProperty(e.im, 'width', { value: w }); Object.defineProperty(e.im, 'height', { value: h }); e.im.hd = true; }
      e.ok = true; PIC_LOADED++; isoDraw();
    };
    e.im.src = GFX + (hd ? hd[0] : path); IMGS.set(path, e);
  }
  return e.ok ? e.im : null;
}
// нарисовать картинку в её (логическом) размере; HD-картинки — со сглаживанием
function drawPic(im, x, y, w = im.width, h = im.height) {
  if (!im.hd) return ictx.drawImage(im, x, y, w, h);
  const sm = ictx.imageSmoothingEnabled; ictx.imageSmoothingEnabled = true; ictx.imageSmoothingQuality = 'high';
  ictx.drawImage(im, x, y, w, h); ictx.imageSmoothingEnabled = sm;
}
const tileScreen = (x, y) => ({ sx: x * TW / 2 + y * TW / 2, sy: y * TH / 2 - x * TH / 2 });
function screenToTile(px, py) {
  const a = (px - TW / 2) / (TW / 2), b = (py - TH / 2) / (TH / 2);
  return { x: Math.round((a - b) / 2), y: Math.round((a + b) / 2) };
}
// участки замка сдвинуты к центру (KC) и меньше клетки (PLOT): промежутки между ними и отступ от стены
const KC = 0.8, PLOT = 0.62, BK = 0.72, CC = CASTLE_OFF + 3; // шаг сетки, размер участка, масштаб зданий
// IN_DY: всё внутри стен (участки, здания, дорога) чуть выше — передняя стена закрывает низ, и отступы до стен на глаз равные
const IN_DY = -12;
const cellAt = (cx, cy) => { const p = tileScreen(CC + (CASTLE_OFF + cx - CC) * KC, CC + (CASTLE_OFF + cy - CC) * KC); return { sx: p.sx, sy: p.sy + IN_DY }; };
function screenToTileF(px, py) { const a = (px - TW / 2) / (TW / 2), b = (py - TH / 2) / (TH / 2); return { x: (a - b) / 2, y: (a + b) / 2 }; }
// ромб (участок) уменьшенного размера k с центром в центре клетки p
function plotDiamond(p, k, fill, stroke, lw = 2.5) {
  const x = ictx, cx = p.sx + TW / 2, cy = p.sy + TH / 2, hw = TW * k / 2, hh = TH * k / 2;
  x.beginPath(); x.moveTo(cx, cy - hh); x.lineTo(cx + hw, cy); x.lineTo(cx, cy + hh); x.lineTo(cx - hw, cy); x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); }
  if (stroke) { x.save(); x.shadowColor = '#ffd84a'; x.shadowBlur = 8; x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); x.restore(); }
}
function plotImage(path, p, k) { const im = pic(path); if (!im) return; const w = im.width * k, h = im.height * k; drawPic(im, p.sx + TW / 2 - w / 2, p.sy + TH - TH * (1 - k) / 2 - h, w, h); }
// подсветка выбранной клетки
const isSel = (x, y) => Iso.sel && Iso.sel.tab === S.tab && Iso.sel.x === x && Iso.sel.y === y;
const glow = (p, k) => plotDiamond(p, k, 'rgba(255, 214, 80, 0.38)', '#ffe27a', 2.5);
const LN = () => (S.cat && S.cat.lands && S.cat.lands.n) || 15; // сторона земель (7)
const gridN = () => (S.tab === 'castle' ? 17 : S.tab === 'lands' ? LN() : S.world ? 2 * S.world.radius + 1 : 15);
const cam = () => Iso.cams[S.tab] || (Iso.cams[S.tab] = clampCam(isoFit()));

function isoMount(wrap) {
  wrap.prepend(Iso.cv);
  isoResize();
  isoDraw();
}
function isoResize() {
  const r = Iso.cv.getBoundingClientRect(), dpr = isoDpr();
  Iso.cv.width = Math.max(1, Math.round(r.width * dpr)); Iso.cv.height = Math.max(1, Math.round(r.height * dpr));
}
window.addEventListener('resize', () => { if (Iso.cv.isConnected) { isoResize(); isoDraw(); } });
// начальная камера: замок целиком, земли и мир — примерно 8 клеток по ширине экрана, по центру
function isoFit() {
  if (S.tab === 'lands' && typeof hasPic === 'function' && hasPic()) { const r = Iso.cv.getBoundingClientRect(), L = LANDS_LAYOUT, q = L.quad, cx = (q[0][0] + q[2][0]) / 2, cy = (q[1][1] + q[3][1]) / 2, z = r.width / ((q[2][0] - q[0][0]) * 1.08); return { z, x: r.width / 2 - cx * z, y: r.height / 2 - cy * z }; }
  const r = Iso.cv.getBoundingClientRect(), n = gridN(), vis = S.tab === 'castle' ? 4.4 : S.tab === 'lands' ? 5.6 : 8; // замок — сразу крупно (ров чуть за краями), отдалить можно щипком
  const z = Math.max(0.35, Math.min(2.5, Math.min(r.width / (vis * TW), r.height / (vis * TH + 60))));
  const c = tileScreen(n / 2 - 0.5, n / 2 - 0.5);
  return { z, x: r.width / 2 - (c.sx + TW / 2) * z, y: r.height / 2 - (c.sy + TH / 2) * z + 18 * z };
}
// замок и земли: камера не уходит за края поля (и не отдаляется дальше, чем помещается поле)
function clampCam(c) {
  if (S.tab !== 'castle' && S.tab !== 'lands') return c;
  const r = Iso.cv.getBoundingClientRect(); if (!r.width) return c;
  if (S.tab === 'lands' && typeof hasPic === 'function' && hasPic()) { // картинка земель: экран не выходит за её края
    const L = LANDS_LAYOUT, zb = Math.max(r.width / L.w, r.height / L.h); if (c.z < zb) c.z = zb;
    let mx = (r.width / 2 - c.x) / c.z, my = (r.height / 2 - c.y) / c.z; const hw = r.width / 2 / c.z, hh = r.height / 2 / c.z;
    mx = Math.min(Math.max(mx, hw), L.w - hw); my = Math.min(Math.max(my, hh), L.h - hh);
    c.x = r.width / 2 - mx * c.z; c.y = r.height / 2 - my * c.z; return c;
  }
  // центр экрана не уходит дальше самого замка (со рвом) / земель; отдалить можно, пока замок во всю ширину
  const box = (a, b) => ({ L: tileScreen(a, a).sx, R: tileScreen(b, b).sx + TW, T: tileScreen(b, a).sy, B: tileScreen(a, b).sy + TH });
  const outer = S.tab === 'castle' ? box(CASTLE_OFF - 1, CASTLE_OFF + 7) : box(0, LN() - 1); // замок со рвом
  const { L, R, T, B } = S.tab === 'castle' ? box(CASTLE_OFF, CASTLE_OFF + 6) : box(2, LN() - 3); // куда может смотреть центр экрана
  const zMin = r.width / (outer.R - outer.L);
  if (c.z < zMin) c.z = zMin;
  let mx = (r.width / 2 - c.x) / c.z, my = (r.height / 2 - c.y) / c.z;
  const hw = r.width / 2 / c.z; // по ширине экран не выходит за замок со рвом
  mx = hw * 2 >= outer.R - outer.L ? (outer.L + outer.R) / 2 : Math.min(Math.max(mx, outer.L + hw), outer.R - hw);
  my = Math.min(Math.max(my, T), B);
  void L; void R;
  if (S.tab === 'castle' && pic(CASTLE_BG.src)) { // фон-картинка: экран не выходит за её края
    const G = CASTLE_BG, zb = Math.max(r.width / G.w, r.height / G.h);
    if (c.z < zb) c.z = zb;
    mx = (r.width / 2 - c.x) / c.z; my = (r.height / 2 - c.y) / c.z; // с фоном можно смотреть всю картинку (мельница, водопад по краям)
    const hw2 = r.width / 2 / c.z, hh = r.height / 2 / c.z;
    mx = Math.min(Math.max(mx, G.x + hw2), G.x + G.w - hw2); my = Math.min(Math.max(my, G.y + hh), G.y + G.h - hh);
  }
  c.x = r.width / 2 - mx * c.z; c.y = r.height / 2 - my * c.z;
  return c;
}
function isoZoom(k, mx, my) {
  const c = cam(), r = Iso.cv.getBoundingClientRect();
  if (mx === undefined) { mx = r.width / 2; my = r.height / 2; }
  const z = Math.max(0.3, Math.min(3, c.z * k));
  c.x = mx - (mx - c.x) * (z / c.z); c.y = my - (my - c.y) * (z / c.z); c.z = z; Iso.zt = Date.now();
  clampCam(c); isoDraw();
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
      if (g.moved) { c.x = g.cx + dx; c.y = g.cy + dy; clampCam(c); isoDraw(); }
    } else if (g.mode === 'pinch' && P.size >= 2) {
      const [a, b] = [...P.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      c.z = Math.max(0.3, Math.min(3, g.z0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0)); Iso.zt = Date.now();
      c.x = m.x - g.wx * c.z; c.y = m.y - g.wy * c.z;
      clampCam(c); isoDraw();
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
    const f = screenToTileF((px - c.x) / c.z, (py - c.y) / c.z - IN_DY);
    const x = Math.round(CC + (f.x - CC) / KC) - CASTLE_OFF, y = Math.round(CC + (f.y - CC) / KC) - CASTLE_OFF;
    if (x < 0 || x >= 7 || y < 0 || y >= 7) return;
    Iso.sel = { tab: 'castle', x, y }; isoDraw();
    openCell(VIEW.CASTLE, y * 7 + x);
  } else if (S.tab === 'lands') {
    const t2 = hasPic() ? landsPicTile((px - c.x) / c.z, (py - c.y) / c.z) : (() => { const f = screenToTileF((px - c.x) / c.z, (py - c.y) / c.z); return { x: Math.round(f.x / SP), y: Math.round(f.y / SP) }; })();
    if (t2.x < 0 || t2.x >= LN() || t2.y < 0 || t2.y >= LN()) return;
    Iso.sel = { tab: 'lands', x: t2.x, y: t2.y }; isoDraw();
    openCell(VIEW.LANDS, t2.y * LN() + t2.x);
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
function ground(path, sx, sy) { const im = pic(gpath(path)); if (im) drawPic(im, sx, sy - (im.height - TH)); else diamond(sx, sy, '#3f7d2c'); }
function sprite(path, sx, sy, dy = 0) { const im = pic(path); if (im) drawPic(im, sx + TW / 2 - im.width / 2, sy - (im.height - TH) + dy); }
// картинка без смещения (как graphics.drawImage(img, x, y, 0) в клиенте)
function raw(path, x, y) { const im = pic(path); if (im) drawPic(im, x, y); return im; }
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
// здание на клетке (с учётом стройки): спрайт, уровень, полоса прогресса
function drawCellBuilding(view, cell, b, lvl, p, k = 1, sel = false) {
  const q = queueAt(view, cell);
  let path = q && q.level === 1 ? 'build/build.png' : b >= 0 && BUILD_IMG[displayId(S.by[b], lvl)] ? `build/${BUILD_IMG[displayId(S.by[b], lvl)]}.png` : null;
  if (path === 'build/guard_tower.png') path = `build/watch${lvl >= 10 ? 3 : lvl >= 5 ? 2 : 1}.png`; // Караульная башня растёт с уровнем
  if (path) {
    if (sel) { ictx.save(); ictx.filter = 'brightness(1.25) drop-shadow(0 0 3px #ffd84a) drop-shadow(0 0 2px #ffd84a)'; }
    if (k === 1) sprite(path, p.sx, p.sy);
    else if (k === 'fit') { // земли: постройка на всю клетку, основание (ромб шириной в картинку) — по центру клетки
      const im = pic(path); if (im) { const kk = Math.max(1.25, Math.min(1.9, TW * 0.95 / im.width)), w = im.width * kk, h = im.height * kk;
        drawPic(im, p.sx + TW / 2 - w / 2, p.sy + TH / 2 + w / 4 - h, w, h); } }
    else { const im = pic(path); if (im) { const w = im.width * k, h = im.height * k; drawPic(im, p.sx + TW / 2 - w / 2, p.sy + TH / 2 + TH * PLOT / 2 - h + 2, w, h); } }
    if (sel) ictx.restore();
  }
  if (q) bar(p.sx, p.sy, (now() - q.start) / (q.end - q.start));
}

const D = (x, y) => tileScreen(x, y).sx, E = (x, y) => tileScreen(x, y).sy;
const CG = CASTLE_OFF, CH = CASTLE_OFF, CN = 7;
// ров: кольцо клеток вокруг замка (прямые стороны, закруглённые углы, мосты у ворот); вода течёт по часовой стрелке
const FLOW_N = 16, FLOW_MS = 165, ANIM_MS = 90; // кадр течения рва / частота перерисовки (плавнее для мельниц)
const flowOn = () => typeof SND === 'undefined' || SND.anim !== false;
let flowTimer = null;
function flowTick() { // перерисовка только пока открыт замок и вкладка видна
  flowTimer = null;
  if (!['castle', 'lands', 'world'].includes(S.tab) || document.hidden || !flowOn() || !Iso.cv.isConnected) return;
  isoDraw(); flowTimer = setTimeout(flowTick, ANIM_MS);
}
const MOAT_T = ['TL', 'R', 'BR', 'L', 'cL', 'cT', 'cR', 'cB', 'bL', 'bTL'];
function moat() {
  if (!flowTimer && flowOn()) flowTimer = setTimeout(flowTick, FLOW_MS);
  const f = flowOn() ? Math.floor(Date.now() / FLOW_MS) % FLOW_N : 0;
  if (!moat.pre) { moat.pre = true; for (const n of MOAT_T) for (let k = 0; k < FLOW_N; k++) pic(`ground/moat_${n}_${k}.png`); } // все кадры — заранее
  const tile = (n, x, y) => { const p = tileScreen(x, y), im = pic(`ground/moat_${n}_${f}.png`) || pic(`ground/moat_${n}_0.png`); if (im) drawPic(im, p.sx, p.sy); };
  for (let i = 0; i < CN; i++) {
    tile(i === 3 ? 'bTL' : 'TL', CG + i, CH - 1); // верхняя левая сторона, мост у задних ворот
    tile('R', CG + CN, CH + i);
    tile('BR', CG + i, CH + CN);
    tile(i === 3 ? 'bL' : 'L', CG - 1, CH + i); // левая сторона, мост у главных ворот
  }
  tile('cL', CG - 1, CH - 1); tile('cT', CG + CN, CH - 1); tile('cR', CG + CN, CH + CN); tile('cB', CG - 1, CH + CN);
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
// фон вокруг королевства: одна картинка (местность с лесом, рекой, скалами) под замком; стены картинки совпадают с нашими.
// Сверху и снизу картинка продолжена лесом с её краёв (полосы с отражением); камера не выходит за картинку.
// Оживление: течёт река, ручей и водопад (12 кадров воды), крутятся лопасти мельницы и водяное колесо.
const CASTLE_BG = { src: 'ground/bg/castle.jpg?v=4', // ?v — новая версия картинки сразу, без старого кэша телефона
  moat: false, iw: 1606, ih: 2455, pad: 760, // pad — сколько добавлено сверху
  x: 527 - 817.5 * 0.449, y: 16 - (517 + 760) * 0.461, w: 1606 * 0.449, h: 2455 * 0.461, // углы стены на картинке → углы сетки замка
  water: { n: 12, x: 2, y: 2 },
  mill: { hub: [132, 190], u: [28.5, -58.5], v: [45, 17.5], speed: 0.9 }, // ветряк: плоскость лопастей (u, v — оси), рад/с
  wheel: { hub: [1549, 317], u: [-7, -43], v: [29, 9], speed: 0.7, step: Math.PI / 6 } }; // колесо: крутится на шаг между спицами по кругу
function castleBackdrop() {
  const G = CASTLE_BG, im = pic(G.src); if (!im) return null;
  const x = ictx, sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(im, G.x, G.y, G.w, G.h);
  if (flowOn() && !flowTimer) flowTimer = setTimeout(flowTick, ANIM_MS);
  const t = flowOn() ? Date.now() / 1000 : 0;
  x.save(); x.translate(G.x, G.y); x.scale(G.w / G.iw, G.h / G.ih); x.translate(0, G.pad); // дальше — в точках исходной картинки
  const wf = pic(`ground/bg/water_${flowOn() ? Math.floor(Date.now() / FLOW_MS) % G.water.n : 0}.webp`);
  if (!castleBackdrop.pre) { castleBackdrop.pre = true; for (let k = 0; k < G.water.n; k++) pic(`ground/bg/water_${k}.webp`); }
  if (wf) x.drawImage(wf, G.water.x, G.water.y);
  { // водяное колесо: содержимое эллипса поворачивается вокруг оси
    const W = G.wheel, a = (t * W.speed) % W.step;
    x.save(); x.translate(W.hub[0], W.hub[1]); x.transform(W.u[0], W.u[1], W.v[0], W.v[1], 0, 0);
    x.beginPath(); x.arc(0, 0, 0.98, 0, Math.PI * 2); x.clip(); x.rotate(a);
    const det = W.u[0] * W.v[1] - W.u[1] * W.v[0]; // обратно в точки картинки
    x.transform(W.v[1] / det, -W.u[1] / det, -W.v[0] / det, W.u[0] / det, 0, 0); x.translate(-W.hub[0], -W.hub[1]);
    x.drawImage(im, W.hub[0] - 70, W.hub[1] - 70 + G.pad, 140, 140, W.hub[0] - 70, W.hub[1] - 70, 140, 140);
    x.restore();
  }
  { // ветряк: 4 решётчатых крыла
    const Mw = G.mill, a0 = t * Mw.speed;
    x.save(); x.translate(Mw.hub[0], Mw.hub[1]); x.transform(Mw.u[0], Mw.u[1], Mw.v[0], Mw.v[1], 0, 0);
    for (let k = 0; k < 4; k++) {
      x.save(); x.rotate(a0 + k * Math.PI / 2);
      x.fillStyle = 'rgba(214,196,150,0.88)'; x.fillRect(0.22, 0.02, 0.8, 0.24);
      x.strokeStyle = '#5f3e22'; x.lineWidth = 0.022; x.beginPath();
      for (let i = 0; i <= 5; i++) { const sx = 0.22 + i * 0.16; x.moveTo(sx, 0.02); x.lineTo(sx, 0.26); }
      x.moveTo(0.22, 0.14); x.lineTo(1.02, 0.14); x.moveTo(0.22, 0.26); x.lineTo(1.02, 0.26); x.stroke();
      x.strokeStyle = '#462d19'; x.lineWidth = 0.045; x.beginPath(); x.moveTo(0, 0); x.lineTo(1.06, 0); x.stroke();
      x.restore();
    }
    x.fillStyle = '#3c2816'; x.beginPath(); x.arc(0, 0, 0.06, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  x.restore(); x.imageSmoothingEnabled = sm;
  return im;
}
// земля только внутри стен (вокруг — фон-картинка)
function groundIn(at) {
  for (let y = CASTLE_OFF; y < CASTLE_OFF + 7; y++) for (let x = CASTLE_OFF + 6; x >= CASTLE_OFF; x--) { const g = at(x, y); if (g) { const p = tileScreen(x, y); ground(g, p.sx, p.sy + IN_DY); } }
}
// земля сетки + поле grass1 на 5 клеток вокруг (s.a(g, true) в клиенте)
// бесшовная трава на весь экран: узор 62×32 из ромба-тайла и четырёх соседей (как сетка изометрии)
const GRASS_PAT = {};
function grassBackdrop(path, c, dpr) {
  path = gpath(path); const im = pic(path); if (!im) return;
  const k = im.hd ? 4 : 1; // HD-трава: узор в 4 раза чётче
  if (!GRASS_PAT[path]) {
    const cv = document.createElement('canvas'); cv.width = TW * k; cv.height = TH * k; const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    for (const [dx, dy] of [[0, 0], [-TW / 2, -TH / 2], [TW / 2, -TH / 2], [-TW / 2, TH / 2], [TW / 2, TH / 2]]) g.drawImage(im, dx * k, (dy - (im.height - TH)) * k, im.width * k, im.height * k);
    GRASS_PAT[path] = ictx.createPattern(cv, 'repeat');
  }
  const pat = GRASS_PAT[path], o = tileScreen(0, 0);
  pat.setTransform(new DOMMatrix().translate(o.sx, o.sy).scale(1 / k));
  ictx.fillStyle = pat;
  ictx.fillRect(-c.x / c.z - TW, -c.y / c.z - TH, Iso.cv.width / dpr / c.z + 2 * TW, Iso.cv.height / dpr / c.z + 2 * TH);
}
// Карта мира двигается как готовая картинка (CSS-transform — сдвигает видеокарта, без перерисовки):
// под холстом лежат два слоя — фон (с запасом вокруг экрана) и объекты участка; холст рисует только кольцо и стрелку.
const WV = { box: null, inner: null, bg: null, bx: 0, by: 0, bw: 0, bh: 0, bs: 0, bkey: '' };
function worldView(on) {
  if (!on) { if (WV.box && WV.box.isConnected) WV.box.remove(); return null; }
  if (!WV.box) {
    WV.box = document.createElement('div'); WV.box.className = 'wview';
    WV.inner = document.createElement('div'); WV.inner.className = 'wview-in'; WV.box.appendChild(WV.inner);
    WV.bg = document.createElement('canvas'); WV.inner.appendChild(WV.bg);
  }
  if (Iso.cv.parentNode && (WV.box.parentNode !== Iso.cv.parentNode || WV.box.nextSibling !== Iso.cv)) Iso.cv.parentNode.insertBefore(WV.box, Iso.cv);
  return WV;
}
// фон: бесшовная картинка-плитка, привязана к координатам мира; перерисовывается, только когда экран вышел за запас
function worldBg(w, c, dpr) {
  const im = pic('ground/world_bg.jpg?v=2'); if (!im) return;
  const vw = Iso.cv.width / dpr / c.z, vh = Iso.cv.height / dpr / c.z, vx = -c.x / c.z, vy = -c.y / c.z, zooming = Date.now() - (Iso.zt || 0) < 300;
  const key = `${w.cx}:${w.cy}`, want = Math.min(2, Math.ceil(c.z * dpr * 4) / 4);
  const out = vx < WV.bx || vy < WV.by || vx + vw > WV.bx + WV.bw || vy + vh > WV.by + WV.bh;
  if (!out && WV.bkey === key && (WV.bs >= want || zooming)) { if (WV.bs < want) setTimeout(isoDraw, 320); return; }
  const M = 0.4 * Math.max(vw, vh), bw = vw + 2 * M, bh = vh + 2 * M, sc = Math.min(want, Math.sqrt(5e6 / (bw * bh)));
  const cv = WV.bg, W = Math.ceil(bw * sc), H = Math.ceil(bh * sc); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d'), o = tileScreen(-(w.cx - w.radius), -(w.cy - w.radius)), bx = vx - M, by = vy - M; // o — где точка мира (0, 0)
  const pat = g.createPattern(im, 'repeat'), md = (a, m) => ((a % m) + m) % m;
  pat.setTransform(new DOMMatrix().translate(md(o.sx - bx, im.width), md(o.sy - by, im.height)));
  g.setTransform(sc, 0, 0, sc, 0, 0); g.imageSmoothingEnabled = true; g.fillStyle = pat; g.fillRect(0, 0, bw, bh);
  Object.assign(cv.style, { left: `${bx}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px` });
  Object.assign(WV, { bx, by, bw, bh, bs: sc, bkey: key });
}
// уменьшенные копии картинок (рисовать маленькую копию быстрее, чем каждый кадр сжимать большую) — чтобы карта не подвисала
const SCALED = new Map();
function scaledPic(path, w, k = isoDpr() * Math.max(1, cam().z)) { // k — во сколько раз крупнее рисуется на экране
  const im = pic(path); if (!im) return null;
  const want = Math.max(16, Math.min(im.width, Math.ceil(w * k / 32) * 32)), key = `${path}|${want}`;
  let cv = SCALED.get(key);
  if (!cv) { cv = document.createElement('canvas'); cv.width = want; cv.height = Math.round(im.height * want / im.width); const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, cv.width, cv.height); SCALED.set(key, cv); }
  return cv;
}
// объекты карты мира — новая графика (старые плитки с зелёными ромбами не используются)
const WORLD_OBJ_IMG = { 24: 'world/ruins.png', 25: 'world/savage.png', 26: 'world/lumber.png', 27: 'world/troll_mine.png', 30: 'world/bandit_s.png', 31: 'world/bandit_m.png', 32: 'quest/lair_orc.png' };
// поляна: мягкое пятно травы, закрывающее деревья и камни фона под объектом
let CLEARING = null;
function worldClearing(p) {
  if (!CLEARING) { const R = 64, cv = document.createElement('canvas'); cv.width = 2 * R; cv.height = Math.ceil(R * 1.12); const g = cv.getContext('2d'), cy0 = cv.height / 2, gr = g.createRadialGradient(R, cy0 / 0.55, 4, R, cy0 / 0.55, R);
    gr.addColorStop(0, 'rgba(143,174,40,1)'); gr.addColorStop(0.6, 'rgba(143,174,40,0.9)'); gr.addColorStop(1, 'rgba(143,174,40,0)');
    g.scale(1, 0.55); g.fillStyle = gr; g.beginPath(); g.arc(R, cy0 / 0.55, R, 0, Math.PI * 2); g.fill(); CLEARING = cv; }
  const w = TW * 1.6, h = w * CLEARING.height / CLEARING.width; ictx.drawImage(CLEARING, p.sx + TW / 2 - w / 2, p.sy + TH / 2 - h / 2, w, h);
}
// кольцо под своим замком на карте мира: свечение и вращающиеся золотые черты; активный замок — ярче
function myCastleRing(p, active, half) { // half: −1 — задняя (верхняя) половина, 1 — передняя (нижняя)
  const x = ictx, cx = p.sx + TW / 2, cy = p.sy + TH * 0.3, t = Date.now() / 1000, rx = TW * 0.74, ry = TH * 0.74;
  if (flowOn() && !flowTimer) flowTimer = setTimeout(flowTick, ANIM_MS);
  x.save(); x.beginPath(); if (half < 0) x.rect(cx - rx - 20, cy - ry - 20, 2 * rx + 40, ry + 20); else x.rect(cx - rx - 20, cy, 2 * rx + 40, ry + 20); x.clip();
  const g = x.createRadialGradient(cx, cy, 2, cx, cy, rx); g.addColorStop(0, `rgba(255,220,90,${active ? 0.45 : 0.25})`); g.addColorStop(1, 'rgba(255,200,60,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill();
  x.lineWidth = 2.6; x.strokeStyle = active ? '#ffe066' : '#ffd24a';
  x.globalAlpha = 0.85; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; // сплошное кольцо
  x.lineWidth = 3.2; x.strokeStyle = '#fff6c8';
  for (let i = 0; i < 3; i++) { const a = t * 1.2 + i * Math.PI * 2 / 3; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, a, a + 0.45); x.stroke(); } // бегущие блики
  x.lineWidth = 1.2; x.strokeStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 3; i++) { const a = -t * 1.4 + i * Math.PI * 2 / 3; x.beginPath(); x.ellipse(cx, cy, rx * 0.86, ry * 0.86, 0, a, a + 0.9); x.stroke(); }
  x.restore();
}
// один объект карты мира (замок по рейтингу, лагерь, логово похода); sel — золотая подводка по контуру
function worldObj(o, p, sel, k, noDome) {
  if (o.boss) return bossOnMap(o, p, sel);
  if (sel) { ictx.save(); ictx.filter = 'drop-shadow(0 0 3px #fff3a0) drop-shadow(0 0 3px #ffe030) drop-shadow(0 0 4px #ffc400) drop-shadow(0 0 7px #ff9d00) brightness(1.18)'; }
  const path = o.kind === 'castle' ? `world/castle${castleStage(o.rating)}.png?v=1` : !o.qimg && WORLD_OBJ_IMG[o.img] ? WORLD_OBJ_IMG[o.img] : null, cimg = path && pic(path);
  if (cimg) { const dw = TW * (o.kind === 'castle' ? [0.78, 0.84, 0.92, 1.0][castleStage(o.rating)] : 0.8), sc = scaledPic(path, dw, k || undefined) || cimg, dh = dw * cimg.height / cimg.width;
    ictx.save(); ictx.imageSmoothingEnabled = true; ictx.drawImage(sc, p.sx + TW / 2 - dw / 2, p.sy + TH * 0.85 - dh, dw, dh); ictx.restore(); }
  else if (o.qimg && pic(o.qimg)) { const im = pic(o.qimg), q = TW * 1.25 / im.width; ictx.save(); ictx.imageSmoothingEnabled = true; ictx.drawImage(im, p.sx + TW / 2 - im.width * q / 2, p.sy + TH * 0.85 - im.height * q, im.width * q, im.height * q); ictx.restore(); } // логово похода
  else ground(WORLD_NAME_IMG(o), p.sx, p.sy);
  if (sel) ictx.restore();
  if (o.newbie && !noDome) newbieDome(p);
}
// статичный слой карты мира: рисуется заново только когда пришёл новый участок, сменилось выделение,
// догрузилась картинка или заметно изменился масштаб; иначе — одна готовая картинка на кадр
const WLAYER = { cv: null, key: '', base: '', s: 1, x0: 0, y0: 0, seq: 0 };
function worldLayer(w, c, dpr) {
  const R0 = w.radius, n = 2 * R0 + 1, x0 = -TW, y0 = -(n - 1) * TH / 2 - 120, W = (n - 1) * TW + 3 * TW, H = (n - 1) * TH + TH + 170;
  const s = Math.min(Math.ceil(c.z * dpr * 4) / 4, 2.5, Math.sqrt(8e6 / (W * H))); // ступенями по 0,25
  if (!w.lv) w.lv = ++WLAYER.seq;
  const sel = Iso.sel && Iso.sel.tab === 'world' ? `${Iso.sel.x}:${Iso.sel.y}` : '', base = `${w.lv}|${sel}|${PIC_LOADED}|${S.st && S.st.castle.id}`, key = `${base}|${s}`;
  if (WLAYER.key === key && WLAYER.cv) return WLAYER;
  if (WLAYER.cv && WLAYER.base === base && Date.now() - (Iso.zt || 0) < 300) { setTimeout(isoDraw, 320); return WLAYER; } // во время щипка — старый слой (его масштабирует видеокарта)
  const cv = WLAYER.cv || document.createElement('canvas'), Wp = Math.ceil(W * s), Hp = Math.ceil(H * s);
  if (cv.width !== Wp || cv.height !== Hp) { cv.width = Wp; cv.height = Hp; }
  const g = cv.getContext('2d'), keep = ictx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, Wp, Hp); g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s); g.imageSmoothingEnabled = false;
  ictx = g;
  try {
    const objs = new Map(w.objects.map((o) => [`${o.x}:${o.y}`, o]));
    if (Iso.sel && Iso.sel.tab === 'world') glow(tileScreen(Iso.sel.x, Iso.sel.y), 0.92);
    for (const o of w.objects) worldClearing(tileScreen(o.x - (w.cx - R0), o.y - (w.cy - R0))); // под замками и лагерями — поляна (без деревьев фона)
    for (let y = 0; y < n; y++) for (let xx = n - 1; xx >= 0; xx--) {
      const o = objs.get(`${w.cx - R0 + xx}:${w.cy - R0 + y}`); if (o) worldObj(o, tileScreen(xx, y), isSel(xx, y), s);
    }
  } finally { ictx = keep; }
  Object.assign(WLAYER, { cv, key, base, s, x0, y0 });
  Object.assign(cv.style, { left: `${x0}px`, top: `${y0}px`, width: `${Wp / s}px`, height: `${Hp / s}px` });
  return WLAYER;
}
// купол защиты новичка над замком
function newbieDome(p) {
  const cx = p.sx + TW / 2, cy = p.sy + TH / 2 + 1, rx = TW * 0.4, ry = TH * 1.05; // купол по размеру замка
  const g = ictx.createRadialGradient(cx, cy - ry * 0.55, 4, cx, cy - ry * 0.4, rx * 1.1);
  g.addColorStop(0, 'rgba(220, 245, 255, 0.55)'); g.addColorStop(0.6, 'rgba(110, 190, 255, 0.28)'); g.addColorStop(1, 'rgba(60, 140, 255, 0.12)');
  ictx.save(); ictx.beginPath(); ictx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0); ictx.ellipse(cx, cy, rx, ry * 0.32, 0, 0, Math.PI); ictx.fillStyle = g; ictx.fill();
  ictx.lineWidth = 1.5; ictx.strokeStyle = 'rgba(190, 235, 255, 0.85)'; ictx.stroke(); ictx.restore();
}
// тропинки между клетками (как в оригинале): земляная полоса по краю ромба + камушки вдоль травы.
// Соседние клетки дают по половине тропинки. Текстура рисуется один раз в 4× разрешении.
let PATH_RING = null;
function pathRing() {
  if (PATH_RING) return PATH_RING;
  const K = 4, w = TW * K, h = TH * K, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), band = 0.17; // доля ширины ромба под тропинку
  const dia = (k) => { g.beginPath(); g.moveTo(w / 2, h / 2 - h / 2 * k); g.lineTo(w / 2 + w / 2 * k, h / 2); g.lineTo(w / 2, h / 2 + h / 2 * k); g.lineTo(w / 2 - w / 2 * k, h / 2); g.closePath(); };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  dia(1); g.fillStyle = '#9a6b3c'; g.fill();
  for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < 0.5 ? '#86592f' : '#b08050'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 2); } // земля
  g.save(); dia(1); g.clip(); g.globalCompositeOperation = 'destination-out'; dia(1 - band); g.fill(); g.restore();
  // камушки вдоль внутреннего края (граница с травой)
  const k = 1 - band * 0.78, pts = [[w / 2, h / 2 - h / 2 * k], [w / 2 + w / 2 * k, h / 2], [w / 2, h / 2 + h / 2 * k], [w / 2 - w / 2 * k, h / 2]];
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = pts[e], [bx, by] = pts[(e + 1) % 4], n = 11;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (rnd() - 0.5) * 0.4) / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, r = 4.2 + rnd() * 2.2;
      g.fillStyle = '#5a4a36'; g.beginPath(); g.ellipse(x + 1, y + 1.6, r, r * 0.62, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = rnd() < 0.5 ? '#e4d6b4' : '#cfc0a0'; g.beginPath(); g.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff6dc'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.22, r * 0.35, r * 0.2, 0, 0, Math.PI * 2); g.fill();
    }
  }
  return (PATH_RING = cv);
}
function pathTile(sx, sy, k = 1) { ictx.save(); ictx.imageSmoothingEnabled = true; ictx.drawImage(pathRing(), sx, sy, TW * k, TH * k); ictx.restore(); }
const GRASSY = (img) => /\/(grass|grass1|ground)\.png$/.test(img);
function groundField(n, at, m = 5) { // m — сколько клеток травы вокруг
  for (let y = -m; y < n + m; y++) for (let x = n + m - 1; x >= -m; x--) {
    const p = tileScreen(x, y);
    ground(x >= 0 && x < n && y >= 0 && y < n ? at(x, y) : 'ground/grass1.png', p.sx, p.sy);
  }
}

function isoDrawNow() {
  if (!Iso.cv.isConnected || !S.st || !S.cat) return;
  const dpr = isoDpr(), c = cam(), x = ictx;
  x.setTransform(1, 0, 0, 1, 0, 0);
  const wv = S.tab === 'world' && S.world; worldView(wv);
  if (wv) x.clearRect(0, 0, Iso.cv.width, Iso.cv.height); // мир — прозрачный холст поверх слоёв фона и объектов
  else { x.fillStyle = '#16240f'; x.fillRect(0, 0, Iso.cv.width, Iso.cv.height); }
  x.setTransform(c.z * dpr, 0, 0, c.z * dpr, c.x * dpr, c.y * dpr);
  x.imageSmoothingEnabled = false;
  if (S.tab !== 'world') grassBackdrop('ground/grass1.png', c, dpr); // трава до краёв экрана — без чёрных краёв (мир — своим фоном)
  const st = S.st.castle;
  if (S.tab === 'castle') { // порядок как в клиенте: земля → ров → ограда сзади → здания → ограда спереди → курсор
    // внутри стен — трава, на ней 49 каменных участков с промежутками
    const onPath = (xx, y) => (S.cat.castlePath || []).includes(y * 7 + xx) || (xx === 3 && y === 3); // и клетка Ратуши — на развилке // тропинка от ворот к Ратуше — не застраивается
    const bg = castleBackdrop();
    if (bg) groundIn((xx, y) => (!onPath(xx - CASTLE_OFF, y - CASTLE_OFF) ? null : `ground/${GROUND[CASTLE_BASE[y][xx]]}.png`)); // с фоном трава в замке — луг с картинки, рисуется только дорога
    else groundField(17, (xx, y) => (xx >= CASTLE_OFF && xx < CASTLE_OFF + 7 && y >= CASTLE_OFF && y < CASTLE_OFF + 7 && !onPath(xx - CASTLE_OFF, y - CASTLE_OFF) ? 'ground/grassC.png' : `ground/${GROUND[CASTLE_BASE[y][xx]]}.png`));
    for (let y = 0; y < 7; y++) for (let xx = 0; xx < 7; xx++) if (!onPath(xx, y)) { const p = cellAt(xx, y); pathTile(p.sx + TW * (1 - KC) / 2, p.sy + TH * (1 - KC) / 2, KC); }
    if (!bg || CASTLE_BG.moat) moat();
    const fence = buildingLevel(22) > 0; // Забор построен — вокруг замка стена
    if (fence) fenceBack();
    for (let y = 0; y < 7; y++) for (let xx = 6; xx >= 0; xx--) {
      const p = cellAt(xx, y); if (!onPath(xx, y) && !bg) plotImage('ground/stone.png', p, PLOT); // с фоном участок — тот же луг в рамке тропинки
      if (isSel(xx, y)) glow(p, PLOT);
    }
    for (let y = 0; y < 7; y++) {
      for (let xx = 6; xx >= 0; xx--) { const cell = y * 7 + xx; drawCellBuilding(0, cell, st.grid[0][cell], st.levels[0][cell], cellAt(xx, y), BK, isSel(xx, y)); }
    }
    if (fence) fenceFront();
    if (typeof advMarker === 'function') advMarker(VIEW.CASTLE, cellAt); // советник показывает нужную клетку
  } else if (S.tab === 'lands') {
    const onPic = hasPic();
    if (onPic) landsPicBegin(); // фон-картинка; земли — на центральном лугу картинки (life.js)
    landsScene(c, dpr); // клетки с тропинками между ними, жизнь (life.js)
    if (typeof advMarker === 'function') advMarker(VIEW.LANDS, (xx, y) => { const P = plotXY(xx, y); return { sx: P.cx - TW / 2, sy: P.cy - TH / 2 }; });
    if (onPic) landsPicEnd();
  } else if (S.world) {
    const w = S.world, R0 = w.radius;
    worldBg(w, c, dpr); // нарисованная местность (бесшовная), привязана к координатам мира
    { // центр экрана ушёл к краю загруженного участка — подгрузить новый (без перерисовки, см. case 'world')
      const f = screenToTileF((Iso.cv.width / dpr / 2 - c.x) / c.z, (Iso.cv.height / dpr / 2 - c.y) / c.z), ex = Math.round(f.x) - R0, ey = Math.round(f.y) - R0;
      if ((Math.abs(ex) > R0 - 5 || Math.abs(ey) > R0 - 5) && (!S.wPending || Date.now() - S.wPending > 1500)) { S.wPending = Date.now(); send({ t: 'world', cx: w.cx + ex, cy: w.cy + ey }); }
    }
    // статичное (поляны, замки, лагеря, купола, выделение) — готовым холстом; каждый кадр рисуется только фон, кольцо и стрелка
    const L = worldLayer(w, c, dpr);
    if (L.cv.parentNode !== WV.inner) WV.inner.appendChild(L.cv);
    WV.inner.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
    const myRings = w.objects.filter((o) => o.kind === 'castle' && S.st && o.castleId === S.st.castle.id).map((o) => [tileScreen(o.x - (w.cx - R0), o.y - (w.cy - R0)), true, o]);
    for (const [p, , o] of myRings) { myCastleRing(p, true, -1); worldObj(o, p, false, 0, true); } // задняя половина кольца — под своим замком (замок поверх)
    for (const [p, a] of myRings) myCastleRing(p, a, 1); // передняя половина кольца — поверх замка и соседей
    for (const [p, a] of myRings) if (a) { // текущий замок: прыгающая золотая стрелка над ним и подпись «Вы здесь»
      const x = ictx, cx = p.sx + TW / 2, top = p.sy - TH * 0.8 - Math.abs(Math.sin(Date.now() / 300)) * 8;
      x.save(); x.fillStyle = '#ffd84a'; x.strokeStyle = '#7a4a00'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(cx, top + 14); x.lineTo(cx - 9, top); x.lineTo(cx - 3.5, top); x.lineTo(cx - 3.5, top - 10); x.lineTo(cx + 3.5, top - 10); x.lineTo(cx + 3.5, top); x.lineTo(cx + 9, top); x.closePath(); x.fill(); x.stroke();
      x.font = 'bold 10px system-ui, sans-serif'; x.textAlign = 'center'; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.75)'; x.strokeText('Вы здесь', cx, top - 14); x.fillStyle = '#fff3b0'; x.fillText('Вы здесь', cx, top - 14);
      x.restore();
    }
  }
}

// табличка «Попробуйте через 3 минуты» после 3 неверных входов (сервер закрывает вход сам, здесь — только отсчёт)
function showLock(until) {
  S.lockUntil = until;
  S.auto = false;
  $('#auth').classList.remove('hidden'); $('#game').classList.add('hidden');
  $('#authErr').textContent = ''; if (S.mode !== 'reg') { $('#lockBox').classList.remove('hidden'); $('#authBtn').disabled = true; }
  clearInterval(S.lockTimer);
  const tick = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    if (left <= 0) { clearInterval(S.lockTimer); $('#lockBox').classList.add('hidden'); $('#authBtn').disabled = false; S.lockUntil = 0; return; }
    if (S.mode === 'reg') return;
    $('#lockT').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  };
  tick(); S.lockTimer = setInterval(tick, 1000);
}

// ---------- старт ----------
S.creds = store.get('tw.creds');
if (S.creds && S.creds.password) { S.creds = null; store.set('tw.creds', null); } // старый формат с паролем — стираем
S.remember = true;
store.set('tw.lock', null); // блокировку решает только сервер: после его перезапуска старая табличка не нужна
// сохранённый вход: логин подставлен, пароль можно не вводить — достаточно нажать «Войти»
// сохранённый вход показан точками-подсказкой (placeholder) при ПУСТОМ поле пароля: в поле ничего не кладём, иначе браузер
// принимает метку за новый пароль и каждый раз предлагает «обновить» сохранённый (и подставляет его вместо настоящего).
// Старая метка (могла попасть в менеджер паролей браузера) по-прежнему понимается как «войти по сохранённому входу».
const SAVED_PASS = '\u2063saved\u2063';
function savedLoginUi() {
  const f = $('#authForm'), saved = !!(S.creds && S.creds.token);
  if (saved && !f.login.value) f.login.value = S.creds.show || S.creds.login;
  if (f.password.value === SAVED_PASS) f.password.value = '';
  f.password.required = !saved; f.password.placeholder = saved ? '•••••••' : '';
  f.password.classList.toggle('saved', saved);
}
savedLoginUi();
$('#authForm').login.addEventListener('input', (e) => { const saved = !!(S.creds && S.creds.token && e.target.value.trim() === (S.creds.show || S.creds.login)); const pw = $('#authForm').password; pw.required = !saved; pw.placeholder = saved ? '•••••••' : ''; pw.classList.toggle('saved', saved); });
connect();
// помощник кэша (sw.js): картинки — из памяти телефона, после обновления — только изменившиеся (нужен https или localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(() => {});
// «Скачать на Android» — если APK лежит на сервере и игра открыта не в самом приложении
if (!/WarKingsApp/.test(navigator.userAgent)) fetch('war-kings.apk', { method: 'HEAD' }).then((r) => { if (r.ok) $('#apkLink').classList.remove('hidden'); }).catch(() => {});

// ---------- имитация нажатия кнопок (профиль, альянс, меню) ----------
// Плитка на мгновение «вдавливается», телефон слегка вибрирует, и только потом открывается окно —
// иначе новое окно появляется мгновенно и нажатия не видно.
const PRESS_SEL = '.ptile, .mitem, #menubar button, .pbar, .rbar, .fbar, #btnMenu, #btnGear, #locs .lbtns button';
document.addEventListener('click', (e) => {
  const b = e.target.closest(PRESS_SEL);
  if (!b || b.dataset.pressOk || b.disabled) return;
  e.preventDefault(); e.stopPropagation();
  if (b.classList.contains('pressed')) return; // двойной тап во время анимации
  b.classList.add('pressed');
  try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* нет вибро */ }
  setTimeout(() => {
    b.classList.remove('pressed');
    if (!b.isConnected) return;
    b.dataset.pressOk = '1'; b.click(); delete b.dataset.pressOk;
  }, 130);
}, true);
