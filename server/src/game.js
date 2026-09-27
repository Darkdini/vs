'use strict';
// Игровое состояние тестового сервера: игроки, замки, ресурсы (ленивый расчёт), очередь строительства.
// Хранилище — один JSON-файл (для локальных тестов в Termux этого достаточно).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./catalog');

const SPEED = Number(process.env.SPEED || 10); // множитель скорости мира для тестов
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
  if (LANDS_EDGE[y][x] >= 0) return [];
  if (LANDS_BASE[y][x] === 9) return [37];
  switch (LANDS_DECOR[y][x]) {
    case 0: return [7];
    case 1: return [8];
    case 2: return [9];
    default: return [5, 6];
  }
}

const VIEW = { CASTLE: 0, LANDS: 1, WORLD: 2 };
const GRID = { [VIEW.CASTLE]: 7, [VIEW.LANDS]: 15 };

// ---------- хранилище ----------
class Store {
  constructor(file) {
    this.file = file;
    this.data = { nextId: 1, users: {}, castles: {} };
    if (fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.timer = null;
  }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }
  flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 1));
    fs.renameSync(this.file + '.tmp', this.file);
  }
}

const hashPassword = (pass, salt = crypto.randomBytes(8).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pass, salt, 32).toString('hex')}`;
const checkPassword = (pass, stored) => hashPassword(pass, stored.split(':')[0]) === stored;

class Game {
  constructor(store) { this.store = store; this.db = store.data; }

  // ----- аккаунты -----
  register({ login, password, email, race }) {
    login = (login || '').trim().toLowerCase();
    password = (password || '').toLowerCase(); // клиент приводит пароль к нижнему регистру при входе
    if (!/^[a-zа-яё0-9_]{3,10}$/i.test(login)) return { error: 'Логин: 3–10 символов (буквы, цифры, _).' };
    if (password.length < 3) return { error: 'Пароль слишком короткий (минимум 3 символа).' };
    if (this.db.users[login]) return { error: 'Такой логин уже занят.' };
    const id = this.db.nextId++;
    const raceId = C.RACES[Number(race)] || 'humans';
    this.db.users[login] = { id, login, pass: hashPassword(password), email: email || '', race: raceId, created: Date.now(), castleId: null };
    const castle = this.createCastle(this.db.users[login]);
    this.db.users[login].castleId = castle.id;
    this.store.save();
    return { user: this.db.users[login] };
  }

  login(login, password) {
    const u = this.db.users[(login || '').toLowerCase()];
    if (!u || !checkPassword((password || '').toLowerCase(), u.pass)) return null;
    return u;
  }

  userById(id) { return Object.values(this.db.users).find((u) => u.id === id); }

  // ----- замки -----
  createCastle(user) {
    const id = this.db.nextId++;
    const taken = new Set(Object.values(this.db.castles).map((c) => `${c.x}:${c.y}`));
    let x, y, r = 0;
    do { // по спирали вокруг центра карты
      const a = Math.random() * Math.PI * 2;
      x = 200 + Math.round(Math.cos(a) * (3 + r)); y = 200 + Math.round(Math.sin(a) * (3 + r)); r += 0.5;
    } while (taken.has(`${x}:${y}`));
    const castleGrid = Array(49).fill(-1);
    const landsGrid = Array(225).fill(-1);
    const castle = {
      id, owner: user.id, name: `Замок ${user.login}`, x, y,
      grid: { 0: castleGrid, 1: landsGrid },
      levels: { 0: Array(49).fill(0), 1: Array(225).fill(0) },
      res: { wood: 750, stone: 750, iron: 750, food: 750, people: 40 },
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
    return castle;
  }

  castleOf(user) { return this.db.castles[user.castleId]; }

  // рейтинг = сумма уровней зданий (замок ×10, земли ×5)
  rating(castle) {
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    return sum(castle.levels[0]) * 10 + sum(castle.levels[1]) * 5;
  }

  buildingLevel(castle, buildingId) {
    let best = 0;
    for (const v of [0, 1]) castle.grid[v].forEach((b, i) => { if (b === buildingId) best = Math.max(best, castle.levels[v][i]); });
    return best;
  }

  capacity(castle) {
    let store = 1500;
    castle.grid[0].forEach((b, i) => { if (b === 1) store += Math.round(1000 * 1.25 ** castle.levels[0][i]); });
    let people = 60;
    castle.grid[1].forEach((b, i) => { if (b === 6) people += 20 * castle.levels[1][i]; });
    return { wood: store, stone: store, iron: store, food: store, people };
  }

  // добыча в час (люди — тоже в час; клиенту отдаём «в сутки», см. handlers)
  rates(castle) {
    const r = { wood: 10, stone: 10, iron: 10, food: 10, people: 2 };
    castle.grid[1].forEach((b, i) => {
      const def = C.BY_ID[b];
      if (def && def.produces) r[def.produces] += C.PROD[castle.levels[1][i]] * (def.produces === 'people' ? 0.2 : 1);
    });
    for (const k of Object.keys(r)) r[k] = Math.round(r[k] * SPEED);
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
    if (done.length) this.store.save();
    return done;
  }

  accrue(castle, t) {
    const dtH = Math.max(0, t - castle.resAt) / 3600000;
    const rate = this.rates(castle);
    const cap = this.capacity(castle);
    for (const r of C.RES) castle.res[r] = Math.min(cap[r], castle.res[r] + rate[r] * dtH);
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
      if (def.unique && this.buildingLevel(castle, buildingId) > 0) return { error: 'Такое здание уже есть в замке.' };
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
    const time = Math.max(3, Math.round(C.levelTimeSec(def, level, this.buildingLevel(castle, 0)) / SPEED));
    const now = Date.now();
    const item = { view, cell, building: buildingId, level, start: now, end: now + time * 1000, cost };
    castle.queue.push(item);
    if (current === -1) castle.grid[view][cell] = -1; // клетка помечается клиентом как -2 (стройка)
    this.store.save();
    return { item };
  }

  nextEventAt() {
    let t = Infinity;
    for (const c of Object.values(this.db.castles)) for (const q of c.queue) t = Math.min(t, q.end);
    return t;
  }
}

module.exports = { Game, Store, VIEW, GRID, landOptions, SPEED };
