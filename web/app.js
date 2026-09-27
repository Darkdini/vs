'use strict';
// Браузерный клиент «Война Королей». Говорит с сервером (server/src/web.js) JSON-сообщениями по WebSocket.
// Графика: если серверу дали оригинальный jar (CLIENT_JAR), картинки берутся из него (/orig/...),
// иначе рисуются простые фигуры — потом заменяется своей графикой (см. ASSETS ниже).

// ---------------- справочники графики (пути внутри jar клиента) ----------------
const GROUND = ['grass', 'stone', 'roadS0', 'roadS1', 'roadS2', 'roadG0', 'roadG1', 'ground', 'stone1', 'water', 'castle', 'grass1',
  'arrowup', 'arrowright', 'arrowdown', 'arrowleft', 'rov0', 'rov5', 'rov4', 'rov1', 'rov7', 'rov3', 'rov2', 'rov6',
  'castle_old', 'dikari', 'lumber', 'troll_rudnik', 'castle_small', 'castle_big'];
const DECOR = ['wood', 'walun', 'mount'];
const EDGE = ['0', '1', '2', '3', '40', '41', '50', '51', '60', '61', '70', '71'];
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
const RES = ['wood', 'stone', 'iron', 'food', 'people'];
const RES_NAME = { wood: 'Дерево', stone: 'Камень', iron: 'Железо', food: 'Еда', people: 'Люди' };
const RES_COLOR = { wood: '#b07a3c', stone: '#9a9a9a', iron: '#6f8fae', food: '#d9c24a', people: '#e8a37d' };

// Основание замка 17×17 (массив k.i из клиента): 0 трава, 1 камень, 2-4 дорога, 5-6 дорога; здания — в квадрате 5..11
const CASTLE_BASE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 3, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 3, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 3, 1, 1, 1, 0, 0, 0, 0, 0],
  [5, 5, 5, 5, 5, 2, 2, 2, 4, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];
const CASTLE_OFF = 5;
const TW = 62, TH = 32; // размер ромба, как в оригинале

// ---------------- состояние ----------------
const S = {
  ws: null, catalog: null, state: null, clockSkew: 0, original: false,
  view: 'castle', sel: null, hover: null, world: null,
  cam: { x: 0, y: 0, z: 1 }, creds: null,
};
window.__cam = S.cam; // для автотестов (web/test)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- картинки ----------------
const imgCache = new Map();
function img(path) { // path внутри jar, например 'build/castle.png'
  if (!S.original || !path) return null;
  let e = imgCache.get(path);
  if (!e) {
    e = { im: new Image(), ok: false };
    e.im.onload = () => { e.ok = true; draw(); };
    e.im.src = '/orig/' + path;
    imgCache.set(path, e);
  }
  return e.ok ? e.im : null;
}
const groundImg = (n) => img(GROUND[n] && `ground/${GROUND[n]}.png`);
const buildImg = (id) => img(BUILD_IMG[id] && `build/${BUILD_IMG[id]}.png`);
const buildSrc = (id) => (S.original && BUILD_IMG[id] ? `/orig/build/${BUILD_IMG[id]}.png` : '');
const resIcon = (r) => (S.original ? `<img class="icon" src="/orig/res/${r === 'time' ? 'time' : r}.png" alt="">` : `<b style="color:${RES_COLOR[r] || '#fff'}">●</b>`);

// ---------------- сеть ----------------
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  S.ws = ws;
  $('conn-state').textContent = 'Подключение…';
  ws.onopen = () => {
    $('conn-state').textContent = 'Соединение с сервером установлено';
    send({ t: 'hello' });
    if (S.creds) send({ t: 'login', ...S.creds }); // переподключение
  };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    $('conn-state').textContent = 'Нет связи с сервером, переподключаюсь…';
    if (S.state) toast('Связь потеряна, переподключаюсь…', true);
    setTimeout(connect, 2000);
  };
}
const send = (m) => S.ws && S.ws.readyState === 1 && S.ws.send(JSON.stringify(m));

function onMessage(m) {
  switch (m.t) {
    case 'catalog': S.catalog = m.catalog; break;
    case 'error':
      if (!S.state) $('auth-msg').textContent = m.msg; else toast(m.msg, true);
      break;
    case 'toast': toast(m.msg); break;
    case 'registered':
      $('auth-msg').textContent = `Аккаунт «${m.login}» создан. Теперь войдите.`;
      switchAuth('login');
      $('login-form').login.value = m.login;
      break;
    case 'auth':
      $('auth').hidden = true; $('game').hidden = false;
      try { sessionStorage.setItem('tw-creds', JSON.stringify(S.creds)); } catch (e) { /* приватный режим */ }
      resize(); fitCamera();
      break;
    case 'state':
      S.state = m; S.clockSkew = m.now - Date.now();
      renderHeader(); renderPanel(); draw();
      break;
    case 'world': S.world = m; if (S.view === 'world') { fitCamera(); draw(); renderPanel(); } break;
    case 'profile': showProfile(m.profile); break;
    case 'rating': showRating(m.rows); break;
    case 'mail': showMail(m.folder, m.list); break;
    case 'letter': showLetter(m.letter); break;
  }
}

// ---------------- вход ----------------
function switchAuth(which) {
  document.querySelectorAll('[data-auth]').forEach((b) => b.classList.toggle('active', b.dataset.auth === which));
  $('login-form').hidden = which !== 'login';
  $('register-form').hidden = which !== 'register';
}
document.querySelectorAll('[data-auth]').forEach((b) => b.onclick = () => { $('auth-msg').textContent = ''; switchAuth(b.dataset.auth); });
$('login-form').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target;
  S.creds = { login: f.login.value.trim().toLowerCase(), password: f.password.value.toLowerCase() };
  $('auth-msg').textContent = '';
  send({ t: 'login', ...S.creds });
};
$('register-form').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target;
  send({ t: 'register', login: f.login.value.trim(), password: f.password.value, email: f.email.value, race: f.race.value });
};

// ---------------- шапка: ресурсы ----------------
function liveRes() {
  const c = S.state.castle, dtH = (Date.now() + S.clockSkew - S.state.now) / 3600000;
  const r = {};
  for (const k of RES) r[k] = Math.min(c.cap[k], c.res[k] + c.rate[k] * dtH);
  return r;
}
function renderHeader() {
  const st = S.state; if (!st) return;
  $('who-name').textContent = st.user.login;
  $('who-race').textContent = `· ${st.user.raceName}`;
  $('who-rating').textContent = `· рейтинг ${st.castle.rating}`;
  const u = $('unread'); u.hidden = !st.unread; u.textContent = st.unread;
  const r = liveRes();
  $('resources').innerHTML = RES.map((k) => {
    const v = Math.floor(r[k]), full = v >= st.castle.cap[k];
    return `<span class="res" title="${RES_NAME[k]}: добыча ${st.castle.rate[k]}/час">${resIcon(k)}<span class="amt${full ? ' full' : ''}">${v}</span><span class="muted">/${st.castle.cap[k]}</span><span class="rate">+${st.castle.rate[k]}</span></span>`;
  }).join('');
}

// ---------------- выбор вида ----------------
document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => setView(b.dataset.view));
document.querySelectorAll('[data-modal]').forEach((b) => b.onclick = () => openModal(b.dataset.modal));
document.querySelector('[data-action="logout"]').onclick = () => { try { sessionStorage.removeItem('tw-creds'); } catch (e) { /* ignore */ } location.reload(); };

function setView(v) {
  S.view = v; S.sel = null; S.hover = null;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'world') send({ t: 'world' });
  fitCamera(); renderPanel(); draw();
}

// ---------------- геометрия изометрии ----------------
function gridSize() { return S.view === 'castle' ? 17 : 15; }
function tileScreen(x, y) { return { sx: x * TW / 2 + y * TW / 2, sy: y * TH / 2 - x * TH / 2 }; }
function screenToTile(px, py) { // px,py — в мировых координатах canvas (до камеры)
  const a = (px - TW / 2) / (TW / 2), b = (py - TH / 2) / (TH / 2);
  return { x: Math.round((a - b) / 2), y: Math.round((a + b) / 2) };
}

const canvas = $('map');
const ctx = canvas.getContext('2d');
function resize() {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  draw();
}
window.addEventListener('resize', () => { resize(); fitCamera(); draw(); });
function fitCamera() {
  // в замке показываем квадрат застройки 7×7 с небольшим полем, в остальных видах — всю сетку
  const n = S.view === 'castle' ? 10 : gridSize(), center = gridSize() / 2 - 0.5, r = canvas.getBoundingClientRect();
  const w = n * TW, h = n * TH + 80;
  const z = Math.max(0.5, Math.min(2.5, Math.min(r.width / w, r.height / h) * 0.98));
  S.cam.z = z;
  // центр сетки в центр canvas
  const c = tileScreen(center, center);
  S.cam.x = r.width / 2 - (c.sx + TW / 2) * z;
  S.cam.y = r.height / 2 - (c.sy + TH / 2) * z + 20 * z;
}

// ---------------- мышь / палец ----------------
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) { S.cam.x = drag.cx + dx; S.cam.y = drag.cy + dy; draw(); }
    return;
  }
  const t = pick(e); const key = t ? `${t.x}:${t.y}` : null;
  if (key !== (S.hover && `${S.hover.x}:${S.hover.y}`)) { S.hover = t; draw(); }
});
canvas.addEventListener('pointerup', (e) => {
  const wasDrag = drag && drag.moved; drag = null;
  if (wasDrag) return;
  const t = pick(e);
  if (t) { S.sel = t; renderPanel(); draw(); }
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = e.deltaY < 0 ? 1.15 : 1 / 1.15, z = Math.max(0.4, Math.min(3, S.cam.z * k));
  S.cam.x = mx - (mx - S.cam.x) * (z / S.cam.z); S.cam.y = my - (my - S.cam.y) * (z / S.cam.z); S.cam.z = z;
  draw();
}, { passive: false });

// клетка под курсором (только те, где можно что-то сделать)
function pick(e) {
  const r = canvas.getBoundingClientRect();
  const t = screenToTile((e.clientX - r.left - S.cam.x) / S.cam.z, (e.clientY - r.top - S.cam.y) / S.cam.z);
  if (S.view === 'castle') {
    const x = t.x - CASTLE_OFF, y = t.y - CASTLE_OFF;
    return x >= 0 && x < 7 && y >= 0 && y < 7 ? { x, y } : null;
  }
  if (S.view === 'lands') return t.x >= 0 && t.x < 15 && t.y >= 0 && t.y < 15 ? t : null;
  if (S.view === 'world' && S.world) {
    const R = S.world.radius;
    return t.x >= 0 && t.x <= 2 * R && t.y >= 0 && t.y <= 2 * R ? { x: t.x, y: t.y, wx: S.world.cx - R + t.x, wy: S.world.cy - R + t.y } : null;
  }
  return null;
}

// ---------------- отрисовка ----------------
let drawQueued = false;
function draw() {
  if (drawQueued) return; drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawNow(); });
}
function diamond(sx, sy, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(sx + TW / 2, sy); ctx.lineTo(sx + TW, sy + TH / 2); ctx.lineTo(sx + TW / 2, sy + TH); ctx.lineTo(sx, sy + TH / 2); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
}
const GROUND_COLOR = { 0: '#3f7d2c', 1: '#8c8c7a', 2: '#9c8a6a', 3: '#9c8a6a', 4: '#9c8a6a', 5: '#8f7c5c', 6: '#8f7c5c', 7: '#6b5232', 8: '#77776a', 9: '#2f6fb3', 11: '#4a8a33' };
function drawGround(n, sx, sy) {
  const im = groundImg(n);
  if (im) ctx.drawImage(im, sx, sy - (im.height - TH));
  else diamond(sx, sy, GROUND_COLOR[n] || '#3f7d2c', '#0002');
}
function drawSprite(im, sx, sy, dy = 0) { ctx.drawImage(im, sx + TW / 2 - im.width / 2, sy - (im.height - TH) + dy); }
function drawBuilding(id, sx, sy, label) {
  const im = buildImg(id);
  if (im) return drawSprite(im, sx, sy);
  // запасной вариант: «коробка» с подписью
  ctx.fillStyle = id === 10 ? '#8a6a3a' : '#c9a36b'; ctx.strokeStyle = '#2b1a08'; ctx.lineWidth = 1.5;
  ctx.fillRect(sx + 16, sy - 12, 30, 28); ctx.strokeRect(sx + 16, sy - 12, 30, 28);
  ctx.fillStyle = '#8b2a1a'; ctx.beginPath(); ctx.moveTo(sx + 12, sy - 12); ctx.lineTo(sx + 31, sy - 28); ctx.lineTo(sx + 50, sy - 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label || '', sx + 31, sy + 8);
}
function drawBar(sx, sy, frac) {
  ctx.fillStyle = '#000a'; ctx.fillRect(sx + 11, sy - 34, 40, 6);
  ctx.fillStyle = '#ffd27a'; ctx.fillRect(sx + 12, sy - 33, 38 * Math.max(0, Math.min(1, frac)), 4);
}

function drawNow() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = S.view === 'world' ? '#10200b' : '#1b0c04';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!S.state || !S.catalog) return;
  ctx.setTransform(S.cam.z * dpr, 0, 0, S.cam.z * dpr, S.cam.x * dpr, S.cam.y * dpr);
  ctx.imageSmoothingEnabled = false;
  if (S.view === 'castle') drawCastle();
  else if (S.view === 'lands') drawLands();
  else drawWorld();
}

function queueAt(view, cell) { return S.state.castle.queue.find((q) => q.view === view && q.cell === cell); }
const now = () => Date.now() + S.clockSkew;
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3);

function drawCastle() {
  const c = S.state.castle, n = 17;
  for (let y = 0; y < n; y++) for (let x = n - 1; x >= 0; x--) { const p = tileScreen(x, y); drawGround(CASTLE_BASE[y][x], p.sx, p.sy); }
  // подсветка
  for (const [t, color] of [[S.hover, '#ffffffaa'], [S.sel, '#ffd000']]) {
    if (!t) continue; const p = tileScreen(t.x + CASTLE_OFF, t.y + CASTLE_OFF); diamond(p.sx, p.sy, null, color);
  }
  for (let y = 0; y < 7; y++) {
    for (let x = 6; x >= 0; x--) {
      const cell = y * 7 + x, b = c.grid[0][cell], q = queueAt(0, cell), p = tileScreen(x + CASTLE_OFF, y + CASTLE_OFF);
      if (q && q.level === 1) drawBuilding(10, p.sx, p.sy, '…');
      else if (b >= 0) drawBuilding(displayId(b, c.levels[0][cell]), p.sx, p.sy, initials(S.catalog.buildings[b].name));
      if (q) drawBar(p.sx, p.sy, (now() - q.start) / (q.end - q.start));
    }
  }
}

function drawLands() {
  const c = S.state.castle, L = S.catalog.lands;
  for (let y = 0; y < 15; y++) {
    for (let x = 14; x >= 0; x--) {
      const p = tileScreen(x, y); drawGround(L.base[y][x], p.sx, p.sy);
      const e = L.edge[y][x];
      if (e >= 0) { const im = img(`gborder/${e < 12 ? 'ground' : 'water'}/${EDGE[e % 12]}.png`); if (im) ctx.drawImage(im, p.sx, p.sy); }
    }
  }
  for (const [t, color] of [[S.hover, '#ffffffaa'], [S.sel, '#ffd000']]) { if (t) { const p = tileScreen(t.x, t.y); diamond(p.sx, p.sy, null, color); } }
  for (let y = 0; y < 15; y++) {
    for (let x = 14; x >= 0; x--) {
      const cell = y * 15 + x, b = c.grid[1][cell], q = queueAt(1, cell), p = tileScreen(x, y);
      if (q && q.level === 1) drawBuilding(10, p.sx, p.sy, '…');
      else if (b >= 0) drawBuilding(displayId(b, c.levels[1][cell]), p.sx, p.sy, initials(S.catalog.buildings[b].name));
      else if (L.decor[y][x] >= 0) {
        const im = img(`ground/${DECOR[L.decor[y][x]]}.png`);
        if (im) drawSprite(im, p.sx, p.sy, L.decor[y][x] === 1 ? 3 : L.decor[y][x] === 2 ? -2 : 0);
        else { ctx.fillStyle = ['#2d5a1e', '#7a7a70', '#5c5c55'][L.decor[y][x]]; ctx.beginPath(); ctx.arc(p.sx + 31, p.sy + 10, 9, 0, 7); ctx.fill(); }
      }
      if (q) drawBar(p.sx, p.sy, (now() - q.start) / (q.end - q.start));
    }
  }
}

function worldObjAt(wx, wy) { return S.world && S.world.objects.find((o) => o.x === wx && o.y === wy); }
function castleTile(rating) { return rating < 300 ? 28 : rating < 1000 ? 10 : 29; }
function drawWorld() {
  if (!S.world) return;
  const R = S.world.radius, n = 2 * R + 1;
  for (let y = 0; y < n; y++) {
    for (let x = n - 1; x >= 0; x--) {
      const wx = S.world.cx - R + x, wy = S.world.cy - R + y, p = tileScreen(x, y);
      drawGround(0, p.sx, p.sy);
    }
  }
  for (const [t, color] of [[S.hover, '#ffffffaa'], [S.sel, '#ffd000']]) { if (t) { const p = tileScreen(t.x, t.y); diamond(p.sx, p.sy, null, color); } }
  for (let y = 0; y < n; y++) {
    for (let x = n - 1; x >= 0; x--) {
      const wx = S.world.cx - R + x, wy = S.world.cy - R + y, o = worldObjAt(wx, wy), p = tileScreen(x, y);
      if (!o) continue;
      const tile = o.kind === 'castle' ? castleTile(o.rating) : o.img;
      const im = groundImg(tile);
      if (im) ctx.drawImage(im, p.sx, p.sy - (im.height - TH));
      else if (o.kind === 'castle') drawBuilding(0, p.sx, p.sy, o.owner.slice(0, 4));
      else diamond(p.sx, p.sy, GROUND_COLOR[o.img] || '#6b5232', '#0004');
      if (o.kind === 'castle') {
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#000b'; ctx.fillText(o.owner, p.sx + 32, p.sy + TH + 9);
        ctx.fillStyle = o.ownerId === S.state.user.id ? '#ffd27a' : '#fff'; ctx.fillText(o.owner, p.sx + 31, p.sy + TH + 8);
      }
    }
  }
}

// ---------------- правила (как на сервере) ----------------
function displayId(b, level) {
  const t = S.catalog.buildings[b].tiers;
  if (!t) return b;
  return level >= 10 ? t[2] : level >= 5 ? t[1] : t[0];
}
function buildTime(def, level) {
  const lands = def.layer === 'lands', th = S.state.castle.townhall;
  const t = Math.max(5, Math.round((lands ? 60 : 180) * (lands ? 1.45 : 1.25) ** (level - 1) * 0.95 ** th));
  return Math.max(3, Math.round(t / S.catalog.speed));
}
function haveLevel(id) {
  const c = S.state.castle; let best = 0;
  for (const v of [0, 1]) c.grid[v].forEach((b, i) => { if (b === id) best = Math.max(best, c.levels[v][i]); });
  return best;
}
const fmt = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`; };

function costHtml(cost) {
  const r = liveRes();
  return `<div class="cost">${RES.filter((k) => cost[k] > 0).map((k) => `<span class="${k !== 'people' && r[k] < cost[k] ? 'lack' : ''}" title="${RES_NAME[k]}">${resIcon(k)}${cost[k]}</span>`).join('')}</div>`;
}
function canAfford(cost) { const r = liveRes(); return RES.every((k) => k === 'people' || r[k] >= cost[k]); }
function missingReq(def) { return Object.entries(def.req).filter(([id, l]) => haveLevel(Number(id)) < l).map(([id, l]) => `${S.catalog.buildings[id].name} ${l}`); }
function picHtml(id) { const src = buildSrc(id); return `<div class="pic">${src ? `<img src="${src}" alt="">` : ''}</div>`; }

// ---------------- правая панель ----------------
function renderPanel() {
  if (!S.state || !S.catalog) return;
  $('selection').innerHTML = S.view === 'world' ? worldPanel() : cellPanel();
  $('selection').querySelectorAll('[data-build]').forEach((b) => b.onclick = () => {
    const [view, cell, building] = b.dataset.build.split(':').map(Number);
    send({ t: 'build', view, cell, building });
  });
  $('selection').querySelectorAll('[data-profile]').forEach((a) => a.onclick = () => send({ t: 'profile', id: Number(a.dataset.profile) }));
  $('selection').querySelectorAll('[data-write]').forEach((a) => a.onclick = () => compose(a.dataset.write));
  $('selection').querySelectorAll('[data-go]').forEach((a) => a.onclick = () => {
    const [dx, dy] = a.dataset.go.split(':').map(Number);
    if (dx === 0 && dy === 0) send({ t: 'world' }); else send({ t: 'world', cx: S.world.cx + dx, cy: S.world.cy + dy });
    S.sel = null;
  });
  renderQueue();
}

function cellPanel() {
  const c = S.state.castle, view = S.view === 'castle' ? 0 : 1, size = view === 0 ? 7 : 15;
  if (!S.sel) {
    return `<h3>${view === 0 ? 'Замок' : 'Земли'}</h3><p class="desc">${view === 0
      ? 'Внутри стен строятся Ратуша, склады, казармы, храмы и другие здания. Выберите клетку.'
      : 'На землях стоят добывающие здания: на лесу — Дровосек, на валунах — Каменьщик, на горах — Рудник, на траве — Огород и Хибара, у воды — Рыболовная заводь.'}</p>`;
  }
  const cell = S.sel.y * size + S.sel.x, b = c.grid[view][cell], q = queueAt(view, cell);
  if (q) {
    const def = S.catalog.buildings[q.building], left = (q.end - now()) / 1000;
    return `<h3>${esc(def.name)} → ${q.level} ур.</h3>${picHtml(10)}<p>Идёт строительство, осталось <b data-countdown="${q.end}">${fmt(left)}</b></p>
      <div class="bar"><i style="width:${100 * (now() - q.start) / (q.end - q.start)}%"></i></div>`;
  }
  if (b >= 0) {
    const def = S.catalog.buildings[b], lvl = c.levels[view][cell];
    let h = `<h3>${esc(def.name)} — ${lvl} ур.</h3><div class="card">${picHtml(displayId(b, lvl))}<div><div class="desc">${esc(def.desc)}</div></div></div>`;
    if (def.produces) h += `<p>Добыча: ${resIcon(def.produces)} ${S.catalog.prod[lvl]}${S.catalog.prod[lvl + 1] ? ` → ${S.catalog.prod[lvl + 1]}` : ''} ед/час × скорость мира ${S.catalog.speed}</p>`;
    if (b === 1) h += `<p>Вместимость: ${Math.round(1000 * 1.25 ** lvl)} каждого ресурса</p>`;
    if (lvl < def.max) {
      const cost = def.costs[lvl + 1], miss = missingReq(def);
      h += `<h4>Развить до ${lvl + 1} ур.</h4>${costHtml(cost)}<div class="cost"><span>${resIcon('time')} ${fmt(buildTime(def, lvl + 1))}</span></div>
        ${miss.length ? `<div class="req">Нужно: ${esc(miss.join(', '))}</div>` : ''}
        <button class="btn" data-build="${view}:${cell}:${b}" ${canAfford(cost) && !miss.length ? '' : 'disabled'}>Развить</button>`;
    } else h += '<p>Максимальный уровень.</p>';
    if ([3, 12, 20, 23].includes(b)) {
      const units = S.catalog.units[S.state.user.race] || [];
      h += `<h4>Войска (тренировка появится позже)</h4><div class="units">${units.map(([id, name]) => `<div class="unit">${S.original && UNIT_IMG[id] ? `<img src="/orig/units/${UNIT_IMG[id]}.png" alt=""><br>` : ''}${esc(name)}</div>`).join('')}</div>`;
    }
    return h;
  }
  // пустая клетка — список построек
  let options;
  if (view === 1) options = S.catalog.landOptions[S.sel.y][S.sel.x];
  else options = S.catalog.buildings.filter((d) => d.layer === 'castle' && !(d.unique && haveLevel(d.id) > 0)).map((d) => d.id);
  let h = `<h3>Строительство</h3>`;
  if (!options.length) return h + '<p class="desc">Здесь строить нельзя (дорога или берег).</p>';
  for (const id of options) {
    const def = S.catalog.buildings[id], cost = def.costs[1], miss = missingReq(def);
    h += `<div class="card">${picHtml(displayId(id, 1))}<div><div class="name">${esc(def.name)}</div>${costHtml(cost)}
      <div class="cost"><span>${resIcon('time')} ${fmt(buildTime(def, 1))}</span></div>${miss.length ? `<div class="req">Нужно: ${esc(miss.join(', '))}</div>` : ''}</div>
      <div class="actions"><button class="btn small" data-build="${view}:${S.sel.y * size + S.sel.x}:${id}" ${canAfford(cost) && !miss.length ? '' : 'disabled'}>Построить</button>
      <span class="desc">${esc(def.desc)}</span></div></div>`;
  }
  return h;
}

function worldPanel() {
  if (!S.world) return '<h3>Мир</h3><p>Загрузка карты…</p>';
  const nav = `<h4>Перемещение по карте</h4><p><button class="btn small" data-go="0:-7">↑ Север</button> <button class="btn small" data-go="-7:0">← Запад</button>
    <button class="btn small" data-go="7:0">Восток →</button> <button class="btn small" data-go="0:7">↓ Юг</button> <button class="btn small" data-go="0:0">Мой замок</button></p>
    <p class="muted">Центр: X:${S.world.cx} Y:${S.world.cy}</p>`;
  if (!S.sel) return `<h3>Мир</h3><p class="desc">Выберите клетку на карте.</p>${nav}`;
  const o = worldObjAt(S.sel.wx, S.sel.wy);
  let h = `<h3>X:${S.sel.wx} Y:${S.sel.wy}</h3>`;
  if (!o) h += '<p class="desc">Свободная земля. Основание новых замков появится позже.</p>';
  else if (o.kind === 'castle') {
    h += `<p><b>${esc(o.name)}</b></p><p>Игрок: <a data-profile="${o.ownerId}">${esc(o.owner)}</a><br>Раса: ${esc(S.catalog.races[o.race] || '')}<br>Рейтинг: ${o.rating}</p>`;
    if (o.ownerId !== S.state.user.id) h += `<button class="btn small" data-write="${esc(o.owner)}">Написать</button> <button class="btn small" disabled title="Скоро">Войска</button> <button class="btn small" disabled title="Скоро">Торговля</button>`;
    else h += '<p class="muted">Это ваш замок.</p>';
  } else h += `<p><b>${esc(o.name)}</b></p><p class="desc">Объект карты. Разведка и нападение появятся позже.</p>`;
  return h + nav;
}

function renderQueue() {
  const q = S.state.castle.queue.slice().sort((a, b) => a.end - b.end);
  $('queue').innerHTML = `<h4>Стройки (${q.length}/${S.catalog.maxQueue})</h4>` + (q.length ? q.map((i) => {
    const def = S.catalog.buildings[i.building];
    return `<div class="qitem">${esc(def.name)} → ${i.level} ур. <span class="muted">(${i.view === 0 ? 'замок' : 'земли'})</span> — <b data-countdown="${i.end}">${fmt((i.end - now()) / 1000)}</b>
      <div class="bar"><i data-progress="${i.start}:${i.end}" style="width:${100 * (now() - i.start) / (i.end - i.start)}%"></i></div></div>`;
  }).join('') : '<p class="muted">Нет активных строек.</p>');
}

// ---------------- окна: почта, рейтинг, профиль, баг ----------------
function openModal(kind, html) {
  $('modal').hidden = false;
  if (html !== undefined) { $('modal-body').innerHTML = html; return; }
  if (kind === 'mail') send({ t: 'mail', folder: 0 });
  else if (kind === 'rating') send({ t: 'rating' });
  else if (kind === 'profile') send({ t: 'profile' });
  else if (kind === 'bug') {
    $('modal-body').innerHTML = `<h2>Сообщить об ошибке</h2><form id="bug-form"><textarea name="text" rows="6" required placeholder="Что произошло?"></textarea><button class="btn">Отправить</button></form>`;
    $('bug-form').onsubmit = (e) => { e.preventDefault(); send({ t: 'bug', text: e.target.text.value }); closeModal(); };
  }
  $('modal-body').innerHTML = $('modal-body').innerHTML || 'Загрузка…';
}
function closeModal() { $('modal').hidden = true; $('modal-body').innerHTML = ''; }
$('modal-close').onclick = closeModal;
$('modal').onclick = (e) => { if (e.target === $('modal')) closeModal(); };

function mailTabs(folder) {
  return `<div class="tabs small"><button data-folder="0" class="${folder === 0 ? 'active' : ''}">Входящие</button><button data-folder="1" class="${folder === 1 ? 'active' : ''}">Исходящие</button><button data-compose="">Написать</button></div>`;
}
function bindMail() {
  $('modal-body').querySelectorAll('[data-folder]').forEach((b) => b.onclick = () => send({ t: 'mail', folder: Number(b.dataset.folder) }));
  $('modal-body').querySelectorAll('[data-compose]').forEach((b) => b.onclick = () => compose(b.dataset.compose));
  $('modal-body').querySelectorAll('[data-letter]').forEach((b) => b.onclick = () => send({ t: 'read', id: Number(b.dataset.letter) }));
  $('modal-body').querySelectorAll('[data-profile]').forEach((a) => a.onclick = () => send({ t: 'profile', id: Number(a.dataset.profile) }));
}
function showMail(folder, list) {
  openModal('mail', `<h2>Почта</h2>${mailTabs(folder)}${list.length ? `<table><tr><th>${folder === 1 ? 'Кому' : 'От'}</th><th>Тема</th><th>Дата</th></tr>${list.map((m) =>
    `<tr class="${!m.read && folder === 0 ? 'unread' : ''}"><td>${esc(m.other)}</td><td><a data-letter="${m.id}">${esc(m.subject || '(без темы)')}</a></td><td class="muted">${new Date(m.at).toLocaleString('ru-RU')}</td></tr>`).join('')}</table>` : '<p class="muted">Писем нет.</p>'}`);
  bindMail();
}
function showLetter(l) {
  openModal('mail', `<h2>${esc(l.subject || '(без темы)')}</h2>${mailTabs(-1)}<p>От: <b>${esc(l.from)}</b> · Кому: <b>${esc(l.to)}</b><br><span class="muted">${new Date(l.at).toLocaleString('ru-RU')}</span></p>
    <div class="letter">${esc(l.text)}</div>${l.from !== S.state.user.login ? `<button class="btn" data-compose="${esc(l.from)}">Ответить</button>` : ''}`);
  bindMail();
  send({ t: 'sync' });
}
function compose(to = '') {
  openModal('mail', `<h2>Новое письмо</h2>${mailTabs(-1)}<form id="compose-form"><label>Кому <input name="to" required value="${esc(to)}"></label>
    <label>Тема <input name="subject" maxlength="60"></label><label>Текст <textarea name="text" rows="6" required></textarea></label><button class="btn">Отправить</button></form>`);
  bindMail();
  $('compose-form').onsubmit = (e) => { e.preventDefault(); const f = e.target; send({ t: 'sendmail', to: f.to.value, subject: f.subject.value, text: f.text.value }); closeModal(); };
}
function showRating(rows) {
  openModal('rating', `<h2>Рейтинг игроков</h2><table><tr><th>#</th><th>Игрок</th><th>Раса</th><th>Очки</th></tr>${rows.map((r, i) =>
    `<tr${r.id === S.state.user.id ? ' class="unread"' : ''}><td>${i + 1}</td><td><a data-profile="${r.id}">${esc(r.login)}</a></td><td>${esc(r.race)}</td><td>${r.rating}</td></tr>`).join('')}</table>`);
  bindMail();
}
function showProfile(p) {
  openModal('profile', `<h2>${p.self ? 'Кабинет' : 'Игрок ' + esc(p.login)}</h2><table>
    <tr><td>Игрок</td><td><b>${esc(p.login)}</b></td></tr><tr><td>Раса</td><td>${esc(p.race)}</td></tr><tr><td>Альянс</td><td>—</td></tr>
    <tr><td>Рейтинг</td><td>${p.rating}</td></tr><tr><td>В игре с</td><td>${new Date(p.created).toLocaleDateString('ru-RU')}</td></tr>
    <tr><td>Замки</td><td>${p.castles.map((c) => `${esc(c.name)} (X:${c.x} Y:${c.y})`).join('<br>')}</td></tr></table>
    ${p.self ? '' : `<p><button class="btn" data-compose="${esc(p.login)}">Написать</button></p>`}`);
  bindMail();
}

// ---------------- уведомления и таймеры ----------------
function toast(msg, err = false) {
  const d = document.createElement('div'); d.className = 'toast' + (err ? ' err' : ''); d.textContent = msg;
  $('toasts').appendChild(d); setTimeout(() => d.remove(), 4000);
}
setInterval(() => {
  const d = new Date(now());
  $('clock').textContent = d.toLocaleTimeString('ru-RU');
  if (!S.state) return;
  renderHeader();
  document.querySelectorAll('[data-countdown]').forEach((e) => { e.textContent = fmt((Number(e.dataset.countdown) - now()) / 1000); });
  document.querySelectorAll('[data-progress]').forEach((e) => { const [a, b] = e.dataset.progress.split(':').map(Number); e.style.width = `${Math.min(100, 100 * (now() - a) / (b - a))}%`; });
  if (S.state.castle.queue.length && S.view !== 'world') draw();
}, 1000);
// раз в 15 секунд сверяемся с сервером (точные ресурсы)
setInterval(() => { if (S.state) send({ t: 'sync' }); }, 15000);

// ---------------- старт ----------------
(async () => {
  try { S.original = (await (await fetch('/api/assets')).json()).original; } catch (e) { S.original = false; }
  try { S.creds = JSON.parse(sessionStorage.getItem('tw-creds') || 'null'); } catch (e) { S.creds = null; }
  resize();
  connect();
})();
