'use strict';
// Игровое состояние тестового сервера: игроки, замки, ресурсы (ленивый расчёт), очередь строительства.
// Хранилище — один JSON-файл (для локальных тестов в Termux этого достаточно).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./catalog');

const SPEED = Number(process.env.SPEED || 10);
// мир: карта WORLD×WORLD клеток, рассчитан на ~5 000 игроков (заселённый круг ~220 клеток)
const WORLD = Number(process.env.WORLD_SIZE || 1000);
const SPAWN_DENSITY = 30; // клеток карты на один замок в зоне заселения — соседи рядом, но не впритык
const SAVE_MS = Number(process.env.SAVE_MS || 10000); // автосохранение раз в 10 с (и при остановке)
const MAX_QUEUE = Number(process.env.MAX_QUEUE || 3); // оригинал: 3 стройки одновременно (премиум — 5)

// ---------- рельеф «Земель» 15×15: массивы j/k/l из клиента (класс k) ----------
// base: 0 трава, 7 земля, 8 камни, 9 вода; decor: 0 лес, 1 валун, 2 гора; edge: дороги/берега (не застраиваются)
const LANDS_BASE = [
  [7, 7, 7, 7, 7, 7, 0, 0, 0, 8, 8, 8, 8, 8, 8], [7, 7, 7, 7, 7, 0, 0, 0, 0, 8, 8, 8, 8, 8, 8],
  [7, 7, 7, 7, 7, 0, 0, 0, 0, 8, 8, 8, 8, 8, 8], [7, 7, 7, 7, 7, 7, 0, 0, 0, 8, 8, 8, 8, 8, 8],
  [7, 7, 7, 7, 7, 7, 0, 0, 0, 8, 8, 8, 8, 8, 8], [7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 8, 8, 8, 8],
  [7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 8, 8, 8, 8], [0, 0, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 8, 8],
  [0, 0, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 9, 9, 9, 9, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 9, 9, 9, 9, 9, 9, 0, 0, 0], [0, 0, 9, 9, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 9],
  [0, 0, 9, 9, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 9],
];
const LANDS_DECOR = [
  [-1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, 2, 2, 2, 2], [-1, 1, 1, 1, -1, -1, -1, -1, -1, 2, 1, 1, 2, 2, 2],
  [-1, -1, 1, 1, -1, -1, -1, -1, -1, 2, 2, 1, 2, 2, 2], [-1, -1, -1, -1, 1, -1, -1, -1, -1, 1, 2, 1, 1, 2, 2],
  [-1, -1, -1, -1, -1, -1, -1, -1, -1, 2, 2, 2, 2, 1, 2], [-1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, 1, 2, 1, 2],
  [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, 1, 2, 1], [0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, 1, 2, 2],
  [0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0], [0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0],
  [0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0], [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0],
  [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0], [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
];
const LANDS_EDGE = [
  [-1, -1, -1, -1, -1, 4, -1, -1, -1, 2, -1, -1, -1, -1, -1], [-1, -1, -1, -1, 0, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1],
  [-1, -1, -1, -1, 0, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1], [-1, -1, -1, -1, -1, 10, -1, -1, -1, 2, -1, -1, -1, -1, -1],
  [-1, -1, -1, -1, -1, 0, -1, -1, -1, 6, 1, -1, -1, -1, -1], [-1, -1, -1, -1, -1, 4, -1, -1, -1, -1, -1, 2, -1, -1, -1],
  [1, 1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 6, 1, -1, -1], [-1, -1, 2, -1, 4, -1, -1, -1, -1, -1, -1, -1, -1, 6, 1],
  [-1, -1, 2, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1], [-1, -1, 2, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [-1, -1, 6, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1], [-1, -1, -1, -1, -1, -1, -1, 20, 15, 15, 22, -1, -1, -1, -1],
  [-1, -1, -1, -1, -1, -1, 20, 17, 13, 13, 19, 22, -1, -1, -1], [-1, -1, 20, 15, 15, 15, 21, 12, -1, -1, 14, 23, 15, 15, 15],
  [-1, -1, 14, -1, -1, -1, -1, 12, -1, -1, 14, -1, -1, -1, -1],
];

// Какие здания можно ставить на клетку земель
function landOptions(x, y) {
  // края дорог и берегов (LANDS_EDGE) — только рисунок, застраивать можно все 225 клеток
  if (LANDS_BASE[y][x] === 9 || LANDS_EDGE[y][x] >= 12) return [37]; // вода и берег — Рыболовная заводь
  switch (LANDS_DECOR[y][x]) {
    case 0: return [7];
    case 1: return [8];
    case 2: return [9];
    default: return [5, 6];
  }
}

// вместимость: база 1500 + каждый Склад 1000×1.25^ур.; люди: 60 + 20 за уровень каждой Хибары
// склад как в оригинале: вместимость каждого Склада по уровням (1–10 ур.), склады суммируются + 200 базово
// → 20 складов 10 ур. = 100 200; места для людей: 35 + 4.728 за уровень Хибары → полный замок 5 425
const STORE = { base: 200, levels: [0, 100, 300, 500, 800, 1000, 1500, 2000, 3000, 4000, 5000], people: 35, peoplePerHut: 4.728 };
const storeBonus = (level) => STORE.levels[Math.max(0, Math.min(10, level))];
// добыча ресурсов не ускоряется скоростью мира (числа как в оригинале); RES_SPEED — отдельный множитель для тестов
const RES_SPEED = Number(process.env.RES_SPEED || 1);
// базовая добыча замка в час (без зданий); Хибара даёт людей с коэффициентом 0.2 от таблицы PROD
const BASE_RATE = { wood: 29.5, stone: 29.5, iron: 29.5, food: 29.5, people: 14 };
const PEOPLE_FACTOR = C.PROD_K.people;

const VIEW = { CASTLE: 0, LANDS: 1, WORLD: 2 };
const GRID = { [VIEW.CASTLE]: 7, [VIEW.LANDS]: 15 };

// ---------- хранилище ----------
// сетки замков (здания и уровни) — байтовые массивы Int8Array: в памяти в ~8 раз меньше обычных массивов,
// в файле — строка «~base64»
const pack = (a) => `~${Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')}`;
const unpack = (s) => { const b = Buffer.from(s.slice(1), 'base64'); return new Int8Array(b.buffer, b.byteOffset, b.length).slice(); };
const packCastle = (c) => { for (const v of [0, 1]) { if (!ArrayBuffer.isView(c.grid[v])) c.grid[v] = Int8Array.from(c.grid[v]); if (!ArrayBuffer.isView(c.levels[v])) c.levels[v] = Int8Array.from(c.levels[v]); } return c; };

class Store {
  constructor(file) {
    this.file = file;
    this.data = { nextId: 1, users: {}, castles: {} };
    if (fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, 'utf8'), (k, v) => (typeof v === 'string' && v[0] === '~' ? unpack(v) : v));
    this.timer = null;
  }
  // запись не чаще раза в SAVE_MS, компактный JSON
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, SAVE_MS);
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, (k, v) => (ArrayBuffer.isView(v) ? pack(v) : v)));
    fs.renameSync(this.file + '.tmp', this.file);
  }
}

const hashPassword = (pass, salt = crypto.randomBytes(8).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pass, salt, 32).toString('hex')}`;
const checkPassword = (pass, stored) => hashPassword(pass, stored.split(':')[0]) === stored;

// реальное время стройки с учётом скорости мира (не меньше 3 с)
const buildTime = (def, level, townhall) => Math.max(3, Math.round(C.levelTimeSec(def, level, townhall) / SPEED));

class Game {
  constructor(store) {
    this.store = store; this.db = store.data;
    this.byXY = new Map(); // индекс замков по координатам: карта мира и поиск цели без перебора всех
    this.byId = new Map(); // игроки по id
    for (const c of Object.values(this.db.castles)) { packCastle(c); this.byXY.set(c.x * WORLD + c.y, c); }
    for (const u of Object.values(this.db.users)) this.byId.set(u.id, u);
    this.cache = {};
  }
  castleAt(x, y) { return this.byXY.get(x * WORLD + y); }
  moveCastle(c, x, y) { this.byXY.delete(c.x * WORLD + c.y); c.x = x; c.y = y; this.byXY.set(x * WORLD + y, c); }
  removeCastle(c) { this.byXY.delete(c.x * WORLD + c.y); delete this.db.castles[c.id]; }
  // кэш тяжёлых выборок по всем игрокам (рейтинги, Зал Славы) — пересчёт раз в ttl мс
  cached(key, ttl, fn) { const e = this.cache[key]; if (e && Date.now() - e.at < ttl) return e.v; const v = fn(); this.cache[key] = { at: Date.now(), v }; return v; }
  // таблица рейтинга игроков (кэш 15 с)
  leaderboard() { return this.cached('lb', 15000, () => Object.values(this.db.users).map((u) => ({ u, r: this.userRating(u) })).sort((a, b) => b.r - a.r)); }

  // ----- аккаунты -----
  register({ login, password, email, race }) {
    login = (login || '').trim().toLowerCase();
    password = (password || '').toLowerCase(); // клиент приводит пароль к нижнему регистру при входе
    if (!/^[a-zа-яё0-9_]{3,10}$/i.test(login)) return { error: 'Логин: 3–10 символов (буквы, цифры, _).' };
    if (password.length < 3) return { error: 'Пароль слишком короткий (минимум 3 символа).' };
    if (this.db.users[login]) return { error: 'Такой логин уже занят.' };
    const id = this.db.nextId++;
    const raceId = C.RACES[Number(race)] || 'humans';
    this.db.users[login] = { id, login, pass: hashPassword(password), email: email || '', race: raceId, created: Date.now(), castleId: null, reputation: 10 }; // стартовая репутация 10
    this.byId.set(id, this.db.users[login]);
    const castle = this.createCastle(this.db.users[login]);
    this.db.users[login].castleId = castle.id;
    this.db.users[login].castleIds = [castle.id]; // первый — столица
    this.store.save();
    return { user: this.db.users[login] };
  }

  login(login, password) {
    const u = this.db.users[(login || '').toLowerCase()];
    if (!u || !checkPassword((password || '').toLowerCase(), u.pass)) return null;
    return u;
  }

  userById(id) { return this.byId.get(id); }

  // ----- замки -----
  createCastle(user, at = null) {
    const id = this.db.nextId++;
    let x, y;
    if (at) ({ x, y } = at);
    else { // новые игроки — в круге вокруг центра карты, круг растёт с числом замков (плотность SPAWN_DENSITY)
      const n = this.byXY.size, R = Math.max(12, Math.sqrt((n + 1) * SPAWN_DENSITY / Math.PI)), C0 = WORLD / 2;
      for (let k = 0; ; k++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (R + k * 0.2);
        x = Math.round(C0 + Math.cos(a) * d); y = Math.round(C0 + Math.sin(a) * d);
        if (x >= 0 && y >= 0 && x < WORLD && y < WORLD && !this.byXY.has(x * WORLD + y)) break;
      }
    }
    const castleGrid = new Int8Array(49).fill(-1);
    const landsGrid = new Int8Array(225).fill(-1);
    const castle = {
      id, owner: user.id, name: `Замок ${user.login}`, x, y,
      grid: { 0: castleGrid, 1: landsGrid },
      levels: { 0: new Int8Array(49), 1: new Int8Array(225) },
      res: { wood: 300, stone: 300, iron: 300, food: 300, people: 40 },
      resAt: Date.now(),
      queue: [],
    };
    castleGrid[3 * 7 + 3] = 0; castle.levels[0][3 * 7 + 3] = 1; // Ратуша 1 ур. в центре
    castleGrid[2 * 7 + 1] = 1; castle.levels[0][2 * 7 + 1] = 1; // Склад 1 ур.
    // стартовые постройки на землях: по одной добывающей каждого вида
    for (const [bx, by, b] of [[1, 8, 7], [10, 0, 8], [12, 0, 9], [7, 7, 5], [6, 3, 6]]) {
      landsGrid[by * 15 + bx] = b; castle.levels[1][by * 15 + bx] = 1;
    }
    this.db.castles[id] = castle;
    this.byXY.set(x * WORLD + y, castle);
    return castle;
  }

  // активный замок игрока (все старые места работают через него); у игрока может быть несколько замков
  castleOf(user) { return this.db.castles[user.castleId]; }
  castlesOf(user) { if (!user.castleIds) user.castleIds = [user.castleId]; return user.castleIds.map((id) => this.db.castles[id]).filter(Boolean); }
  isCapital(castle) { const u = this.userById(castle.owner); return !!u && this.castlesOf(u)[0] === castle; }
  userRating(user) { return this.castlesOf(user).reduce((s, c) => s + this.rating(c), 0); }
  switchCastle(user, id) {
    if (!this.castlesOf(user).some((c) => c.id === Number(id))) return { error: 'Это не ваш замок.' };
    user.castleId = Number(id); this.store.save();
    return { ok: true };
  }

  // рейтинг замка: до 2300 при полной застройке (C.RATING)
  rating(castle) {
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const R = C.RATING;
    return Math.min(R.max, Math.min(R.castleMax, Math.round(sum(castle.levels[0]) * R.castle)) + Math.min(R.landsMax, Math.round(sum(castle.levels[1]) * R.lands)));
  }

  buildingLevel(castle, buildingId) {
    let best = 0;
    for (const v of [0, 1]) castle.grid[v].forEach((b, i) => { if (b === buildingId) best = Math.max(best, castle.levels[v][i]); });
    return best;
  }

  capacity(castle) {
    let store = STORE.base;
    castle.grid[0].forEach((b, i) => { if (b === 1) store += storeBonus(castle.levels[0][i]); });
    let huts = 0;
    castle.grid[1].forEach((b, i) => { if (b === 6) huts += castle.levels[1][i]; });
    const people = Math.round(STORE.people + STORE.peoplePerHut * huts);
    return { wood: store, stone: store, iron: store, food: store, people };
  }

  // добыча в час с учётом скорости мира
  rates(castle) {
    const r = { ...BASE_RATE };
    castle.grid[1].forEach((b, i) => {
      const def = C.BY_ID[b];
      if (def && def.produces) r[def.produces] += C.PROD[castle.levels[1][i]] * C.PROD_K[def.produces];
    });
    const prod = this.bonus(castle).prod; // наука Экономика, религия Природа, артефакты
    for (const k of ['wood', 'stone', 'iron', 'food']) r[k] *= prod;
    for (const k of Object.keys(r)) r[k] = Math.round(r[k] * RES_SPEED + 1e-9);
    return r;
  }

  // довести ресурсы и очередь до момента now (ленивый расчёт)
  tick(castle, now = Date.now()) {
    const done = [];
    castle.queue.sort((a, b) => a.end - b.end);
    while (castle.queue.length && castle.queue[0].end <= now) {
      const item = castle.queue.shift();
      this.accrue(castle, item.end);
      castle.grid[item.view][item.cell] = item.building;
      castle.levels[item.view][item.cell] = item.level;
      done.push(item);
    }
    this.accrue(castle, now);
    this.tickTraining(castle, now); // тренировка войск, исследования, воскрешение генерала (army.js)
    if (done.length) this.store.save();
    return done;
  }

  accrue(castle, t) {
    const dtH = Math.max(0, t - castle.resAt) / 3600000;
    const rate = this.rates(castle);
    const cap = this.capacity(castle);
    for (const r of C.RES) castle.res[r] = Math.max(0, Math.min(cap[r], castle.res[r] + rate[r] * dtH));
    castle.resAt = t;
  }

  // проверка и постановка в очередь: стройка нового здания или улучшение существующего
  startBuild(castle, view, cell, buildingId) {
    this.tick(castle);
    const size = GRID[view];
    if (!size || cell < 0 || cell >= size * size) return { error: 'Неверная клетка.' };
    const def = C.BY_ID[buildingId];
    if (!def) return { error: 'Неизвестное здание.' };
    if (castle.queue.some((q) => q.view === view && q.cell === cell)) return { error: 'Здесь уже идёт строительство.', state: 1 };
    if (castle.queue.length >= MAX_QUEUE) return { error: `Одновременно можно строить не больше ${MAX_QUEUE} зданий.` };
    const current = castle.grid[view][cell];
    let level;
    if (current === -1) {
      if ((view === VIEW.CASTLE) !== (def.layer === 'castle')) return { error: 'Это здание строится в другом месте.' };
      if (view === VIEW.LANDS) {
        const x = cell % 15, y = Math.floor(cell / 15);
        if (!landOptions(x, y).includes(buildingId)) return { error: 'На этой клетке такое здание не построить.' };
      }
      if (def.unique && (this.buildingLevel(castle, buildingId) > 0 || castle.queue.some((q) => q.building === buildingId))) return { error: 'Такое здание уже есть в замке.' };
      level = 1;
    } else {
      if (current !== buildingId) return { error: 'Клетка занята другим зданием.', state: 1 };
      level = castle.levels[view][cell] + 1;
      if (level > (def.max || 20)) return { error: 'Достигнут максимальный уровень.' };
    }
    for (const [reqId, reqLvl] of Object.entries(def.req || {})) {
      if (this.buildingLevel(castle, Number(reqId)) < reqLvl) return { error: `Нужно: ${C.BY_ID[reqId].name} ${reqLvl} ур.` };
    }
    const cost = C.levelCost(def, level);
    const cap = this.capacity(castle);
    const busyPeople = castle.queue.reduce((s, q) => s + q.cost.people, 0);
    for (const r of C.RES) {
      if (castle.res[r] < cost[r]) return { error: 'Недостаточно ресурсов.', state: 2 };
    }
    if (busyPeople + cost.people > cap.people) return { error: 'Не хватает свободных людей.', state: 2 };
    for (const r of C.RES) if (r !== 'people') castle.res[r] -= cost[r];
    const time = Math.max(3, Math.round(buildTime(def, level, this.buildingLevel(castle, 0)) * this.bonus(castle).build)); // наука Инженерия
    const now = Date.now();
    const item = { view, cell, building: buildingId, level, start: now, end: now + time * 1000, cost };
    castle.queue.push(item);
    if (current === -1) castle.grid[view][cell] = -1; // клетка помечается клиентом как -2 (стройка)
    this.store.save();
    return { item };
  }

  // «Разрушить»: здание убирается с клетки целиком (ресурсы не возвращаются). Ратушу разрушить нельзя.
  demolish(castle, view, cell) {
    this.tick(castle);
    const size = GRID[view];
    if (!size || !(cell >= 0 && cell < size * size)) return { error: 'Неверная клетка.' };
    const b = castle.grid[view][cell];
    if (b < 0 || !castle.levels[view][cell]) return { error: 'Здесь нет здания.' };
    if (b === 0) return { error: 'Ратушу разрушить нельзя.' };
    if (castle.queue.some((q) => q.view === view && q.cell === cell)) return { error: 'Здание сейчас строится.' };
    const name = C.BY_ID[b].name;
    castle.grid[view][cell] = -1; castle.levels[view][cell] = 0;
    const cap = this.capacity(castle);
    for (const r of C.RES) castle.res[r] = Math.min(castle.res[r], cap[r]); // склад стал меньше — лишнее пропадает
    this.cache = {};
    this.store.save();
    return { ok: true, name };
  }

  // Объекты карты мира в прямоугольнике: замки игроков + процедурные объекты (детерминированно по координатам).
  // img — номер тайла клиента: 10 замок, 1 камни, 9 озеро, 24 заброшенный замок, 25 дикари, 26 лесорубы, 27 рудник троллей
  worldObjects(x0, y0, w, h) {
    const out = [];
    const castles = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const c = this.castleAt(x, y); if (c) castles.push(c); }
    const occupied = new Set(castles.map((c) => `${c.x}:${c.y}`));
    for (const c of castles) {
      const owner = this.userById(c.owner);
      const al = this.allianceOf(owner);
      out.push({ kind: 'castle', x: c.x, y: c.y, img: 10, castleId: c.id, name: c.name, ownerId: owner.id, owner: owner.login, race: owner.race, rating: this.rating(c), alliance: al ? al.tag : null });
    }
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (occupied.has(`${x}:${y}`) || x < 0 || y < 0 || x >= WORLD || y >= WORLD) continue;
        const roll = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100;
        const obj = roll < 8 ? [1, 'Камни'] : roll < 11 ? [9, 'Озеро'] : roll < 13 ? [25, 'Дикари'] : roll < 15 ? [26, 'Лесорубы']
          : roll < 16 ? [27, 'Рудник троллей'] : roll < 18 ? [24, 'Заброшенный замок'] : null;
        if (obj) {
          const o = { kind: 'object', x, y, img: obj[0], name: obj[1] };
          const st = (this.db.npc || {})[`${x}:${y}`];
          if (obj[0] === 24) o.loyalty = Math.round(st && st.loyalty !== undefined ? st.loyalty : 100); // руины: захват бунтарями
          out.push(o);
        }
      }
    }
    return out;
  }

  // ----- почта -----
  sendMail(fromUser, toLogin, subject, text) {
    const to = this.db.users[(toLogin || '').trim().toLowerCase()];
    if (!to) return { error: 'Получатель не найден.' };
    this.db.messages = this.db.messages || [];
    const m = { id: this.db.nextId++, from: fromUser.id, to: to.id, subject: subject || '', text: text || '', at: Date.now(), read: false };
    this.db.messages.push(m);
    this.store.save();
    return { message: m, to };
  }

  mailList(userId, folder) {
    const all = this.db.messages || [];
    return all.filter((m) => (folder === 1 ? m.from === userId : m.to === userId)).slice(-30).reverse();
  }

  nextEventAt() {
    let t = Infinity;
    for (const c of Object.values(this.db.castles)) for (const q of c.queue) t = Math.min(t, q.end);
    return t;
  }
}

// армии, функции зданий, админ (server/src/army.js)
require('./army').install(Game, { buildTime, landOptions });
// кабинет: профиль, репутация, друзья, чат, Зал Славы (server/src/social.js)
require('./social').install(Game);
// администратор: 20 замков и все админ-команды (server/src/admin.js)
require('./admin').install(Game);

module.exports = { WORLD, Game, Store, STORE, BASE_RATE, PEOPLE_FACTOR, storeBonus, RES_SPEED, buildTime, VIEW, GRID, landOptions, SPEED, MAX_QUEUE, LANDS_BASE, LANDS_DECOR, LANDS_EDGE };
