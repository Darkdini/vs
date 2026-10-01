'use strict';
// Игровое состояние тестового сервера: игроки, замки, ресурсы (ленивый расчёт), очередь строительства.
// Хранилище — один JSON-файл (для локальных тестов в Termux этого достаточно).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const C = require('./catalog');

const SPEED = Number(process.env.SPEED || 1);
// мир: карта WORLD×WORLD клеток, рассчитан на ~5 000 игроков (заселённый круг ~220 клеток)
const WORLD = Number(process.env.WORLD_SIZE || 1000);
const SPAWN_DENSITY = 2.5; // клеток карты на один замок в зоне заселения — мир сплошной, соседи в 1–2 клетках
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
    default: return LANDS_BASE[y][x] === 7 ? [5] : [6]; // как в оригинале: Огород — на вспаханной земле, Хибара — на траве
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

// Хранилище: один JSON-файл. Защита данных игроков:
// • запись атомарная: сначала .tmp + fsync, потом переименование — при сбое питания остаётся старая целая копия;
// • резервные копии (gzip) в папке backups рядом с базой: при каждом запуске и раз в BACKUP_MS (час), хранятся последние 48 + 10 стартовых;
// • битая база не перезаписывается: сервер останавливается с подсказкой, как восстановить из копии.
const BACKUP_MS = Number(process.env.BACKUP_MS || 3600000);
class Store {
  constructor(file) {
    this.file = file;
    this.data = { nextId: 1, users: {}, castles: {} };
    if (fs.existsSync(file)) {
      try { this.data = JSON.parse(fs.readFileSync(file, 'utf8'), (k, v) => (typeof v === 'string' && v[0] === '~' ? unpack(v) : v)); } catch (e) {
        console.error(`База ${file} повреждена (${e.message}). Сервер остановлен, база не тронута. Восстановление: sh ~/game/restore.sh`);
        process.exit(2);
      }
      this.backup('start');
    }
    this.data.version = this.data.version || 1; // версия схемы — для будущих миграций при обновлениях
    this.timer = null;
    if (BACKUP_MS > 0 && !process.env.NO_BACKUP) this.bTimer = setInterval(() => { try { this.flush(); this.backup('auto'); } catch (e) { console.error('бэкап:', e.message); } }, BACKUP_MS).unref();
  }
  get backupDir() { return path.join(path.dirname(path.resolve(this.file)), 'backups'); }
  // копия текущего файла базы: backups/db-2026-09-28_1530-auto.json.gz
  backup(kind) {
    if (process.env.NO_BACKUP || !fs.existsSync(this.file)) return null;
    fs.mkdirSync(this.backupDir, { recursive: true });
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const name = `db-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}-${kind}.json.gz`;
    const out = path.join(this.backupDir, name);
    fs.writeFileSync(out, zlib.gzipSync(fs.readFileSync(this.file)));
    const keep = { start: 10, auto: 48, manual: 20 }[kind] || 20;
    const same = fs.readdirSync(this.backupDir).filter((f) => f.endsWith(`-${kind}.json.gz`)).sort();
    for (const f of same.slice(0, Math.max(0, same.length - keep))) fs.unlinkSync(path.join(this.backupDir, f));
    return out;
  }
  // запись не чаще раза в SAVE_MS, компактный JSON
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, SAVE_MS);
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp', fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, JSON.stringify(this.data, (k, v) => (ArrayBuffer.isView(v) ? pack(v) : v))); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
  }
}

const hashPassword = (pass, salt = crypto.randomBytes(8).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pass, salt, 32).toString('hex')}`;
const checkPassword = (pass, stored) => { const a = Buffer.from(hashPassword(pass, stored.split(':')[0])), b = Buffer.from(stored); return a.length === b.length && crypto.timingSafeEqual(a, b); };

// реальное время стройки с учётом скорости мира (не меньше 3 с)
const buildTime = (def, level, townhall) => Math.max(3, Math.round(C.levelTimeSec(def, level, townhall) / SPEED));

class Game {
  constructor(store) {
    this.store = store; this.db = store.data;
    this.byXY = new Map(); // индекс замков по координатам: карта мира и поиск цели без перебора всех
    this.byId = new Map(); // игроки по id
    for (const c of Object.values(this.db.castles)) { packCastle(c); this.byXY.set(c.x * WORLD + c.y, c); }
    for (const u of Object.values(this.db.users)) this.byId.set(u.id, u);
    // ключ игрока = ник с учётом регистра; старые записи (ключ строчными, ник «Zevs») переносятся на ключ «Zevs»
    for (const [k, u] of Object.entries(this.db.users)) if (k !== u.login) { if (Object.prototype.hasOwnProperty.call(this.db.users, u.login)) u.login = k; else { delete this.db.users[k]; this.db.users[u.login] = u; } }
    // логин для входа (Email / Логин) — отдельно от ника; у старых игроков логином становится прежний ник (строчными)
    this.db.accts = Object.create(null);
    for (const [k, u] of Object.entries(this.db.users)) {
      if (!u.acct) { u.acct = String(u.login).toLowerCase(); if (this.db.accts[u.acct]) u.acct += `_${u.id}`; }
      this.db.accts[u.acct] = k;
    }
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
  // регистрация: логин (Email / Логин — для входа, без учёта регистра), пароль и ник (имя в игре, с учётом регистра: Zevs и zevs — разные)
  register({ login, password, email, race, nick, system }) {
    const acct = String(login || '').trim().toLowerCase();
    nick = String(nick == null || nick === '' ? String(login || '').trim() : nick).trim();
    login = nick;
    password = String(password || '').toLowerCase(); // клиент приводит пароль к нижнему регистру при входе
    if (!/^[a-zа-яё0-9_.@-]{3,40}$/i.test(acct)) return { error: 'Email / Логин: 3–40 символов (буквы, цифры, _ . @ -).' };
    if (!/^[a-zа-яё0-9_]{3,10}$/i.test(nick)) return { error: 'Ник: 3–10 символов (буквы, цифры, _).' };
    if (password.length < 5 && !system) return { error: 'Пароль слишком короткий (минимум 5 символов).' };
    if (this.db.accts[acct]) return { error: 'Такой логин (email) уже зарегистрирован.' };
    if (Object.prototype.hasOwnProperty.call(this.db.users, nick)) return { error: 'Такой ник уже занят.' };
    if (!system && (nick.toLowerCase() === 'admin' || acct === 'admin')) return { error: 'Этот ник зарезервирован.' }; // «Admin», «ADMIN» — нельзя, чтобы не выдавать себя за админа
    if (!email && acct.includes('@')) email = acct;
    const id = this.db.nextId++;
    const raceId = C.RACES[Number(race)] || 'humans';
    this.db.accts[acct] = login;
    this.db.users[login] = { id, login: nick, acct, pass: hashPassword(password), email: String(email || '').slice(0, 60), race: raceId, created: Date.now(), castleId: null, reputation: 10, gold: 30 }; // стартовая репутация 10, золото 30 (на подарки) // стартовая репутация 10
    this.byId.set(id, this.db.users[login]);
    const castle = this.createCastle(this.db.users[login]);
    this.db.users[login].castleId = castle.id;
    this.db.users[login].castleIds = [castle.id]; // первый — столица
    this.store.save();
    return { user: this.db.users[login] };
  }

  // смена пароля игроком: нужен старый пароль; все прочие сессии завершаются
  changePassword(user, oldPass, newPass) {
    if (!checkPassword(String(oldPass || '').toLowerCase(), user.pass)) return { error: 'Старый пароль указан неверно.' };
    newPass = String(newPass || '').toLowerCase();
    if (newPass.length < 5) return { error: 'Новый пароль слишком короткий (минимум 5 символов).' };
    if (newPass.length > 40) return { error: 'Новый пароль слишком длинный.' };
    user.pass = hashPassword(newPass); user.tokens = [];
    this.store.save();
    return { ok: true };
  }
  // смена ника — только за золото (цена NICK_PRICE, по умолчанию 100); новый ник должен быть свободен, вход — по новому нику
  changeNick(user, nick) {
    nick = String(nick || '').trim();
    const price = Number(process.env.NICK_PRICE) || 100, oldKey = user.login, key = nick;
    if (user.admin) return { error: 'Ник администратора не меняется.' };
    if (!/^[a-zа-яё0-9_]{3,10}$/i.test(nick)) return { error: 'Ник: 3–10 символов (буквы, цифры, _).' };
    if (nick === user.login) return { error: 'Это ваш текущий ник.' };
    if (Object.prototype.hasOwnProperty.call(this.db.users, key) || key.toLowerCase() === 'admin') return { error: 'Такой ник уже занят.' };
    if ((user.gold || 0) < price) return { error: `Смена ника стоит ${price} золота, у вас ${user.gold || 0}.` };
    this.goldChange(user, -price, `Смена ника: ${user.login} → ${nick}`);
    (user.nickLog = user.nickLog || []).push({ at: Date.now(), from: user.login, to: nick });
    delete this.db.users[oldKey]; this.db.users[key] = user; this.db.accts[user.acct] = key;
    user.login = nick; this.store.save();
    return { ok: true, price };
  }
  // название и описание активного замка
  castleInfo(user, name, desc) {
    const c = this.castleOf(user);
    name = String(name || '').replace(/[<>]/g, '').trim().slice(0, 24);
    if (name.length < 2) return { error: 'Название замка — от 2 символов.' };
    c.name = name; c.desc = String(desc || '').replace(/[<>]/g, '').trim().slice(0, 200);
    this.store.save();
    return { ok: true };
  }
  // вход по паролю. Если задан ADMIN_LOGIN (секретный логин админа), админ входит только под ним,
  // а в игре по-прежнему виден как admin; вход под «admin» тогда отклоняется как неверный.
  login(login, password) {
    let acct = String(login || '').trim().toLowerCase(); // вход — по логину (Email / Логин), не по нику
    const alias = String(process.env.ADMIN_LOGIN || '').trim().toLowerCase();
    if (alias && alias !== 'admin') {
      if (acct === alias) acct = (this.db.users.admin && this.db.users.admin.acct) || 'admin';
      else if (acct === 'admin') return null;
    }
    const key = this.db.accts[acct];
    if (!key || !Object.prototype.hasOwnProperty.call(this.db.users, key)) return null;
    const u = this.db.users[key];
    if (!u || !checkPassword(String(password || '').toLowerCase(), u.pass)) return null;
    return u;
  }

  userById(id) { return this.byId.get(id); }

  // ----- замки -----
  createCastle(user, at = null) {
    const id = this.db.nextId++;
    let x, y;
    if (at) ({ x, y } = at);
    else { // новые игроки — в круге вокруг центра карты, круг растёт с числом замков (плотность SPAWN_DENSITY)
      const n = this.byXY.size, R = Math.max(3, Math.sqrt((n + 1) * SPAWN_DENSITY / Math.PI)), C0 = WORLD / 2;
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
      res: { wood: 500, stone: 500, iron: 500, food: 500, people: 40 }, // старт: склад 2 ур. полон (вмещает 500)
      resAt: Date.now(),
      queue: [],
    };
    castleGrid[3 * 7 + 3] = 0; castle.levels[0][3 * 7 + 3] = 1; // Ратуша 1 ур. в центре
    castleGrid[2 * 7 + 1] = 1; castle.levels[0][2 * 7 + 1] = 2; // Склад 2 ур.
    // стартовые постройки на землях: по одной добывающей каждого вида
    for (const [bx, by, b] of [[1, 8, 7], [10, 0, 8], [12, 0, 9], [3, 5, 5], [6, 3, 6]]) {
      landsGrid[by * 15 + bx] = b; castle.levels[1][by * 15 + bx] = 1;
    }
    this.db.castles[id] = castle;
    this.byXY.set(x * WORLD + y, castle);
    return castle;
  }

  // активный замок игрока (все старые места работают через него); у игрока может быть несколько замков
  // золото (монеты) игрока: все изменения — через goldChange, с историей для окна «Казна»
  goldChange(user, delta, reason) {
    delta = Math.round(delta); if (!delta) return;
    user.gold = Math.max(0, (user.gold || 0) + delta);
    if (this.addStat) this.addStat(user.id, delta > 0 ? 'goldIn' : 'goldOut', Math.abs(delta)); // Зал Славы: Богатство / Расточительство
    (user.goldLog = user.goldLog || []).push({ at: Date.now(), delta, reason, left: user.gold });
    if (user.goldLog.length > 200) user.goldLog.splice(0, user.goldLog.length - 200);
  }
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
    if (this.isPremium(this.userById(castle.owner))) r.people *= 1.5; // премиум: население +50%
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
    const maxQ = this.isPremium(this.userById(castle.owner)) ? 5 : MAX_QUEUE; // премиум — 5 строек
    if (castle.queue.length >= maxQ) return { error: `Одновременно можно строить не больше ${maxQ} зданий.${maxQ < 5 ? ' С премиумом — 5.' : ''}` };
    const current = castle.grid[view][cell];
    let level;
    if (current === -1) {
      if ((view === VIEW.CASTLE) !== (def.layer === 'castle')) return { error: 'Это здание строится в другом месте.' };
      if (view === VIEW.LANDS) {
        const x = cell % 15, y = Math.floor(cell / 15);
        if (!landOptions(x, y).includes(buildingId)) return { error: 'На этой клетке такое здание не построить.' };
      }
      if (view === VIEW.CASTLE && C.CASTLE_PATH.includes(cell)) return { error: 'На тропинке строить нельзя.' };
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
      out.push({ kind: 'castle', x: c.x, y: c.y, img: 10, castleId: c.id, name: c.name, ownerId: owner.id, owner: owner.login, race: owner.race, rating: this.rating(c), alliance: al ? al.tag : null, newbie: !owner.admin && this.rating(c) < require('./army').NEWBIE_RATING });
    }
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (occupied.has(`${x}:${y}`) || x < 0 || y < 0 || x >= WORLD || y >= WORLD) continue;
        const roll = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100;
        // на карте только замки и лагеря для походов (камни и озёра убраны)
        const roll2 = (((x * 83492791) ^ (y * 2654435761)) >>> 0) % 100;
        const obj = roll < 2 ? [25, 'Дикари'] : roll < 4 ? [26, 'Лесорубы']
          : roll < 5 ? [27, 'Рудник троллей'] : roll < 7 ? [24, 'Заброшенный замок']
          : roll < 9 ? [30, 'Лагерь разбойников (лёгкий)'] : roll < 10 ? [roll2 < 60 ? 31 : 32, roll2 < 60 ? 'Лагерь разбойников (средний)' : 'Лагерь разбойников (тяжёлый)'] : null;
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
    const to = this.db.users[String(toLogin || '').trim()];
    if (!to) return { error: 'Получатель не найден.' };
    this.db.messages = this.db.messages || [];
    const m = { id: this.db.nextId++, from: fromUser.id, to: to.id, subject: String(subject || '').slice(0, 80), text: String(text || '').slice(0, 4000), at: Date.now(), read: false, color: this.msgColor ? this.msgColor(fromUser) : '' };
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
require('./avatar').install(Game);
require('./royal').install(Game);
require('./ally').install(Game);
require('./premium').install(Game);
require('./security').install(Game);
require('./forum').install(Game);
require('./news').install(Game);

module.exports = { WORLD, Game, Store, STORE, BASE_RATE, PEOPLE_FACTOR, storeBonus, RES_SPEED, buildTime, VIEW, GRID, landOptions, SPEED, MAX_QUEUE, LANDS_BASE, LANDS_DECOR, LANDS_EDGE };
