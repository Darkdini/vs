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
const SPAWN_GAP = 2;
// провинции (как в оригинале): мир нарезан на квадраты PROV×PROV клеток (20×20); новые игроки заселяют провинцию по PROV_CAP замков,
// потом — следующую, по спирали от центра карты (соседи рядом). Номер провинции — по строкам, с 1.
const PROV = 20, PROV_CAP = 10, PROV_EDGE = 2, PROV_N = Math.ceil(WORLD / PROV);
// клетки у границы провинции (по PROV_EDGE с каждой стороны линии) пустые: замки и лагеря не налезают на границу
const onProvEdge = (x, y) => { const a = ((x % PROV) + PROV) % PROV, b = ((y % PROV) + PROV) % PROV; return a < PROV_EDGE || a >= PROV - PROV_EDGE || b < PROV_EDGE || b >= PROV - PROV_EDGE; };
// NPC в каждой провинции поровну (как в оригинале): один и тот же набор, разложенный ровно по провинции
// (по номеру провинции — всегда одинаково), не у границы и не вплотную друг к другу
const PROV_NPC = [[25, 'Дикари', 5], [26, 'Лесорубы', 5], [27, 'Рудник троллей', 3], [24, 'Заброшенный замок', 5],
  [30, 'Лагерь разбойников (лёгкий)', 5], [31, 'Лагерь разбойников (средний)', 2], [32, 'Лагерь разбойников (тяжёлый)', 1]];
const PROV_LAY = new Map();
const provLayout = (n) => {
  let L = PROV_LAY.get(n); if (L) return L;
  let seed = (n * 2654435761) >>> 0 || 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const inner = PROV - 2 * PROV_EDGE, want = PROV_NPC.reduce((a, t) => a + t[2], 0), picked = [];
  for (let k = 0; k < want; k++) { // каждый следующий — дальше всех от уже поставленных (равномерно)
    let best = null, bs = -1;
    for (let t = 0; t < 40; t++) { const x = Math.floor(rnd() * inner), y = Math.floor(rnd() * inner); if (picked.some((q) => q[0] === x && q[1] === y)) continue;
      const sc = picked.length ? Math.min(...picked.map((q) => Math.hypot(q[0] - x, q[1] - y))) : 99; if (sc > bs) { bs = sc; best = [x, y]; } }
    if (best) picked.push(best);
  }
  const kinds = PROV_NPC.flatMap(([img, name, c]) => Array(c).fill([img, name]));
  for (let k = kinds.length - 1; k > 0; k--) { const r = Math.floor(rnd() * (k + 1)); [kinds[k], kinds[r]] = [kinds[r], kinds[k]]; } // виды вперемешку
  L = new Map(picked.map((q, k) => [q[1] * PROV + q[0], kinds[k]]));
  if (PROV_LAY.size > 5000) PROV_LAY.clear(); PROV_LAY.set(n, L); return L;
};
const provObjects = (x, y) => { const px = Math.floor(x / PROV), py = Math.floor(y / PROV), lx = x - px * PROV - PROV_EDGE, ly = y - py * PROV - PROV_EDGE, inner = PROV - 2 * PROV_EDGE;
  if (lx < 0 || ly < 0 || lx >= inner || ly >= inner) return null; return provLayout(py * PROV_N + px + 1).get(ly * PROV + lx) || null; };
const provinceOf = (x, y) => { const px = Math.floor(x / PROV), py = Math.floor(y / PROV); return { px, py, n: py * PROV_N + px + 1 }; };
let PROV_ORDER = null; // провинции от центра карты к краям
const provOrder = () => PROV_ORDER || (PROV_ORDER = Array.from({ length: PROV_N * PROV_N }, (_, i) => i).map((i) => ({ px: i % PROV_N, py: Math.floor(i / PROV_N) }))
  .map((p) => ({ ...p, d: Math.hypot((p.px + 0.5) * PROV - WORLD / 2, (p.py + 0.5) * PROV - WORLD / 2), a: Math.atan2((p.py + 0.5) * PROV - WORLD / 2, (p.px + 0.5) * PROV - WORLD / 2) }))
  .sort((p, q) => Math.round(p.d / PROV) - Math.round(q.d / PROV) || p.a - q.a));
// где на нарисованном фоне карты мира луг, а не роща (world_open.json — маска картинки web/gfx/ground/world_bg.jpg):
// клетка мира (X, Y) лежит в точке фона ((X+Y)·31+31, (Y−X)·16+16) по модулю размера картинки.
// Сейчас фон — ровная трава без рощ, маски нет: луг везде
const WOPEN = (() => { try { const j = require('./world_open.json'); return { ...j, b: Buffer.from(j.bits, 'base64') }; } catch { return null; } })();
const meadowAt = (X, Y) => { if (!WOPEN) return true; const m = (a, n) => ((a % n) + n) % n;
  const px = m((X + Y) * 31 + 31, WOPEN.W), py = m((Y - X) * 16 + 16, WOPEN.H), i = Math.floor(py / WOPEN.S) * WOPEN.w + Math.floor(px / WOPEN.S);
  return !!(WOPEN.b[i >> 3] & (128 >> (i & 7))); };     // новый замок — не ближе 2 клеток к другим замкам (между замками хотя бы одна пустая клетка)
const SAVE_MS = Number(process.env.SAVE_MS || 10000); // автосохранение раз в 10 с (и при остановке)
const MAX_QUEUE = Number(process.env.MAX_QUEUE || 3); // оригинал: 3 стройки одновременно (премиум — 5)

// ---------- рельеф «Земель» ----------
// рельеф «Земель» 15×15 (как в оригинале): массивы j/k/l из клиента. base: 0 трава, 7 земля, 8 камни, 9 вода; decor: 0 лес, 1 валун, 2 гора
const LANDS_N = C.LANDS_N;
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
const PEOPLE_SCI = (1400 / 1303 - 1) / 20; // прирост людей за уровень Экономики: на 20 ур. — 1400 в час при полных землях, как в оригинале
// базовая добыча замка в час (без зданий); Хибара даёт людей с коэффициентом 0.2 от таблицы PROD
const BASE_RATE = { wood: 29.5, stone: 29.5, iron: 29.5, food: 29.5, people: 14 };
const PEOPLE_FACTOR = C.PROD_K.people;

const VIEW = { CASTLE: 0, LANDS: 1, WORLD: 2 };
const GRID = { [VIEW.CASTLE]: 7, [VIEW.LANDS]: LANDS_N };

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
// журнал паролей: каждая версия — {at, by, ip, dev, h}. h — тот же стойкий хеш (scrypt с солью), что и в u.pass:
// сам пароль нигде не хранится и не показывается; админ может только проверить, совпадает ли названный игроком пароль с одним из прежних
const PASS_LOG_MAX = 30;
function passLogPush(user, by, ip = '', dev = '') {
  if (!user.passLog) user.passLog = [{ at: user.created || Date.now(), by: 'reg', ip: user.regIp || '', h: user.pass }];
  user.passLog.push({ at: Date.now(), by, ip: String(ip || ''), dev: String(dev || '').slice(0, 12), h: user.pass });
  if (user.passLog.length > PASS_LOG_MAX) user.passLog.splice(0, user.passLog.length - PASS_LOG_MAX);
}
const checkPassword = (pass, stored) => { const a = Buffer.from(hashPassword(pass, stored.split(':')[0])), b = Buffer.from(stored); return a.length === b.length && crypto.timingSafeEqual(a, b); };

// реальное время стройки с учётом скорости мира (не меньше 3 с)
const buildTime = (def, level, townhall) => Math.max(3, Math.round(C.levelTimeSec(def, level, townhall) / SPEED));

// перенос старых земель (15×15 или 7×7) на новые: постройки каждого вида встают на клетки своего вида, а их суммарная добыча
// (уровни прежних зданий) переводится в уровни новых — до 25 ур. Стройки на землях отменяются с возвратом ресурсов.
function migrateLands(castle) {
  const N = LANDS_N, g0 = castle.grid[1], l0 = castle.levels[1];
  const sum = {};
  const om = C.LAND_MULT_BY_SIZE[g0.length] || {}; // множитель добычи прежней раскладки
  for (let i = 0; i < g0.length; i++) if (g0[i] >= 0 && C.LAND_MULT[g0[i]]) sum[g0[i]] = (sum[g0[i]] || 0) + C.PROD[l0[i]] * (om[g0[i]] || 1);
  const g = new Int8Array(N * N).fill(-1), l = new Int8Array(N * N);
  for (const [b, total] of Object.entries(sum)) {
    const cells = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (landOptions(x, y)[0] === Number(b)) cells.push(y * N + x);
    let left = total / C.LAND_MULT[b]; // столько «добычи на новом уровне» надо набрать
    for (const c of cells) {
      if (left < C.PROD[1] * 0.5 && c !== cells[0]) break; // хотя бы одна постройка вида остаётся
      let lv = 1; while (lv < C.LAND_EFF_MAX && C.PROD[lv + 1] <= left + 1e-9) lv++; // прежние уровни 1–20 (потом — в новые, landsV)
      g[c] = Number(b); l[c] = lv; left -= C.PROD[lv];
    }
  }
  const back = (castle.queue || []).filter((q) => q.view === 1);
  for (const q of back) for (const r of ['wood', 'stone', 'iron', 'food']) castle.res[r] += (q.cost && q.cost[r]) || 0;
  castle.queue = (castle.queue || []).filter((q) => q.view !== 1);
  castle.grid[1] = g; castle.levels[1] = l; castle.landsV = 1;
}

// земли: уровни 1–20 → 1–5 (C.landFromOld: ближайший из 1, 5, 10, 15, 20). Стройки на землях — к следующему новому уровню
// (если новый уровень уже не выше — стройка отменяется с возвратом ресурсов)
function landsToV2(castle) {
  if (castle.landsV === 2) return;
  const l = castle.levels[1];
  for (let i = 0; i < l.length; i++) if (l[i] > 0) l[i] = C.landFromOld(l[i]);
  const keep = [];
  for (const q of castle.queue || []) {
    if (q.view !== 1) { keep.push(q); continue; }
    const cur = q.cell >= 0 ? l[q.cell] || 0 : 0, to = Math.max(cur + 1, C.landFromOld(q.level));
    if (to > C.LANDS_MAX || keep.some((k) => k.view === 1 && k.cell === q.cell)) { for (const r of ['wood', 'stone', 'iron', 'food']) castle.res[r] += (q.cost && q.cost[r]) || 0; continue; }
    q.level = to; keep.push(q);
  }
  castle.queue = keep; castle.landsV = 2;
}

// площадь в центре земель: если там стояла постройка (до появления площади) — переезжает на свободную клетку своего вида,
// а если свободной нет — её уровни добавляются к самой слабой постройке того же вида
// Стена (Забор, id 22) не занимает клетку: её уровень — castle.wall, развивается из Ратуши.
// Старые замки: Забор с клетки переносится в castle.wall (клетка освобождается), стройка Забора на клетке — в стройку стены.
const WALL_ID = 22;
function fixWall(castle) {
  if (castle.wall === undefined) castle.wall = 0;
  const g = castle.grid[0], l = castle.levels[0];
  for (let i = 0; i < g.length; i++) if (g[i] === WALL_ID) { castle.wall = Math.max(castle.wall, l[i]); g[i] = -1; l[i] = 0; }
  for (const q of castle.queue || []) if (q.building === WALL_ID && !q.wall) { q.wall = true; q.cell = -1; q.level = Math.max(q.level, castle.wall + 1); }
}
function fixPlaza(castle) {
  const N = LANDS_N, g = castle.grid[1], l = castle.levels[1];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; if (g[i] < 0 || landOptions(x, y).length) continue;
    const b = g[i], lv = l[i]; g[i] = -1; l[i] = 0;
    castle.queue = (castle.queue || []).filter((q) => !(q.view === 1 && q.cell === i));
    let free = -1, weak = -1;
    for (let k = 0; k < N * N; k++) { if (landOptions(k % N, Math.floor(k / N))[0] !== b) continue; if (g[k] < 0 && free < 0) free = k; if (g[k] === b && (weak < 0 || l[k] < l[weak])) weak = k; }
    if (free >= 0) { g[free] = b; l[free] = lv; } else if (weak >= 0) l[weak] = Math.min(C.LANDS_MAX, l[weak] + lv);
  }
}

class Game {
  constructor(store) {
    this.store = store; this.db = store.data;
    this.byXY = new Map(); // индекс замков по координатам: карта мира и поиск цели без перебора всех
    this.byId = new Map(); // игроки по id
    for (const c of Object.values(this.db.castles)) { packCastle(c); if (c.grid[1].length !== LANDS_N * LANDS_N) migrateLands(c); landsToV2(c); fixPlaza(c); fixWall(c); this.byXY.set(c.x * WORLD + c.y, c); }
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
    this.provEdgeFix();
  }
  castleAt(x, y) { return this.byXY.get(x * WORLD + y); }
  // замки, что стоят у самой границы провинции или на месте её лагеря (поставлены до провинций), — на ближайшую свободную клетку внутри той же провинции;
  // армии, идущие к старому месту, идут к новому
  provEdgeFix() {
    let moved = 0;
    for (const c of [...this.byXY.values()]) {
      const on = provObjects(c.x, c.y); // стоит на месте лагеря провинции (не захваченные руины — те и есть этот замок)
      if (!onProvEdge(c.x, c.y) && !(on && on[0] !== 24)) continue;
      const px = Math.floor(c.x / PROV), py = Math.floor(c.y / PROV); let best = null;
      for (let gap = 1; gap >= 0 && !best; gap--) for (let y = py * PROV + PROV_EDGE; y < (py + 1) * PROV - PROV_EDGE; y++) for (let x = px * PROV + PROV_EDGE; x < (px + 1) * PROV - PROV_EDGE; x++) {
        if (x >= WORLD || y >= WORLD || this.byXY.has(x * WORLD + y)) continue;
        let near = false; for (let dx = -gap; dx <= gap && !near; dx++) for (let dy = -gap; dy <= gap; dy++) { const k = this.castleAt(x + dx, y + dy); if (k && k !== c) { near = true; break; } }
        if (near || this.worldObjects(x, y, 1, 1).length) continue;
        const d = Math.hypot(x - c.x, y - c.y); if (!best || d < best.d) best = { x, y, d };
      }
      if (!best) continue;
      const ox = c.x, oy = c.y; this.moveCastle(c, best.x, best.y); moved++;
      for (const k of Object.values(this.db.castles)) for (const a of k.armies || []) if (a.x === ox && a.y === oy) { a.x = best.x; a.y = best.y; }
    }
    if (moved) { this.cache = {}; this.store.save(); }
    return moved;
  }
  // можно ли поставить замок на (x, y): в пределах мира, не у границы провинции, не на лагере/объекте, вокруг (SPAWN_GAP) — ни одного замка,
  // в провинции меньше PROV_CAP замков. except — замок, который переносится (его самого не считаем). Возвращает текст ошибки или null.
  placeError(x, y, except = null) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= WORLD || y >= WORLD) return `Координаты — от 0 до ${WORLD - 1}.`;
    if (onProvEdge(x, y)) return 'Это граница провинции — замок там не поставить.';
    if (!meadowAt(x, y)) return 'Там лес — замок не поставить.';
    for (let dx = -SPAWN_GAP; dx <= SPAWN_GAP; dx++) for (let dy = -SPAWN_GAP; dy <= SPAWN_GAP; dy++) { const k = this.castleAt(x + dx, y + dy); if (k && k !== except) return dx || dy ? `Слишком близко к другому замку — между замками нужно ${SPAWN_GAP} пустые клетки.` : 'Клетка занята замком.'; }
    if (this.worldObjects(x, y, 1, 1).some((o) => o.kind === 'object')) return 'Клетка занята (лагерь, руины или рудник).';
    const p = provinceOf(x, y); let n = 0; for (const k of this.byXY.values()) if (k !== except && provinceOf(k.x, k.y).n === p.n) n++;
    if (n >= PROV_CAP) return `Провинция ${p.n} заполнена (${PROV_CAP} замков).`;
    return null;
  }
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
    if (!/^[a-zа-яё0-9_.@-]{1,40}$/i.test(acct)) return { error: 'Email / Логин: до 40 символов (буквы, цифры, _ . @ -).' };
    if (acct.length < 5 && !system) return { error: 'Логин слишком короткий (минимум 5 символов).' }; // старые короткие логины входят как раньше
    if (!/^[a-zа-яё0-9_]{3,10}$/i.test(nick)) return { error: 'Ник: 3–10 символов (буквы, цифры, _).' };
    if (password.length < 5 && !system) return { error: 'Пароль слишком короткий (минимум 5 символов).' };
    if (this.db.accts[acct]) return { error: 'Такой логин (email) уже зарегистрирован.' };
    if (Object.prototype.hasOwnProperty.call(this.db.users, nick)) return { error: 'Такой ник уже занят.' };
    if (!system && (['admin', 'советник'].includes(nick.toLowerCase()) || acct === 'admin')) return { error: 'Этот ник зарезервирован.' }; // «Admin», «ADMIN» — нельзя, чтобы не выдавать себя за админа
    if (!email && acct.includes('@')) email = acct;
    const id = this.db.nextId++;
    const raceId = C.RACES[Number(race)] || 'humans';
    this.db.accts[acct] = login;
    this.db.users[login] = { id, login: nick, acct, pass: hashPassword(password), email: String(email || '').slice(0, 60), race: raceId, created: Date.now(), castleId: null, reputation: 10, gold: 0 }; // стартовая репутация 10; золото — только донат
    this.byId.set(id, this.db.users[login]);
    const castle = this.createCastle(this.db.users[login]);
    this.db.users[login].castleId = castle.id;
    this.db.users[login].castleIds = [castle.id]; // первый — столица
    this.store.save();
    return { user: this.db.users[login] };
  }

  // смена пароля игроком: нужен старый пароль; все прочие сессии завершаются
  changePassword(user, oldPass, newPass, ip = '', dev = '') {
    if (!checkPassword(String(oldPass || '').toLowerCase(), user.pass)) return { error: 'Старый пароль указан неверно.' };
    newPass = String(newPass || '').toLowerCase();
    if (newPass.length < 5) return { error: 'Новый пароль слишком короткий (минимум 5 символов).' };
    if (newPass.length > 40) return { error: 'Новый пароль слишком длинный.' };
    user.pass = hashPassword(newPass); user.tokens = []; passLogPush(user, 'self', ip, dev);
    this.store.save();
    return { ok: true };
  }
  // новый пароль по коду из Telegram (tgauth.js): старый не нужен, все входы завершаются
  setPasswordReset(user, newPass, ip = '') { user.pass = hashPassword(newPass); user.tokens = []; passLogPush(user, 'telegram', ip); this.store.save(); }
  // смена ника — только за золото (цена NICK_PRICE, по умолчанию 100); новый ник должен быть свободен, вход — по новому нику
  changeNick(user, nick) {
    nick = String(nick || '').trim();
    const price = Number(process.env.NICK_PRICE) || 100, oldKey = user.login, key = nick;
    if (user.admin) return { error: 'Ник администратора не меняется.' };
    if (!/^[a-zа-яё0-9_]{3,10}$/i.test(nick)) return { error: 'Ник: 3–10 символов (буквы, цифры, _).' };
    if (nick === user.login) return { error: 'Это ваш текущий ник.' };
    if (Object.prototype.hasOwnProperty.call(this.db.users, key) || ['admin', 'советник'].includes(key.toLowerCase())) return { error: 'Такой ник уже занят.' };
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
      if (acct === alias) acct = (this.adminUser && this.adminUser() && this.adminUser().acct) || 'admin';
      else if (acct === 'admin') return null;
    }
    const key = this.db.accts[acct];
    if (!key || !Object.prototype.hasOwnProperty.call(this.db.users, key)) return null;
    const u = this.db.users[key];
    if (!u || !checkPassword(String(password || '').toLowerCase(), u.pass)) return null;
    return u;
  }

  passOk(u, password) { return !!u && checkPassword(String(password || '').toLowerCase(), u.pass); }
  userById(id) { return this.byId.get(id); }

  // ----- замки -----
  createCastle(user, at = null) {
    const id = this.db.nextId++;
    let x, y;
    if (at) ({ x, y } = at);
    else { // новые игроки — в первую от центра провинцию, где меньше PROV_CAP замков; внутри — свободная клетка не у самой границы
      const cnt = new Map(); for (const k of this.byXY.values()) { const p = provinceOf(k.x, k.y); cnt.set(p.n, (cnt.get(p.n) || 0) + 1); }
      const free = (X, Y) => { for (let dx = -SPAWN_GAP; dx <= SPAWN_GAP; dx++) for (let dy = -SPAWN_GAP; dy <= SPAWN_GAP; dy++) if (this.byXY.has((X + dx) * WORLD + (Y + dy))) return false;
        return !this.worldObjects(X, Y, 1, 1).some((o) => o.kind === 'object'); };
      let spot = null;
      for (const p of provOrder()) {
        if ((cnt.get(p.py * PROV_N + p.px + 1) || 0) >= PROV_CAP) continue;
        const x0 = p.px * PROV + PROV_EDGE, y0 = p.py * PROV + PROV_EDGE, w = Math.min(PROV - 2 * PROV_EDGE, WORLD - 1 - x0), h = Math.min(PROV - 2 * PROV_EDGE, WORLD - 1 - y0);
        if (w < 1 || h < 1) continue;
        // ровно: из случайных свободных клеток берётся та, что дальше всех от замков провинции (первый — ближе к середине)
        const mine = [...this.byXY.values()].filter((k) => provinceOf(k.x, k.y).n === p.py * PROV_N + p.px + 1), mx = x0 + (w - 1) / 2, my = y0 + (h - 1) / 2;
        let best = -Infinity;
        for (let k = 0; k < 300; k++) {
          const X = x0 + Math.floor(Math.random() * w), Y = y0 + Math.floor(Math.random() * h); if (!free(X, Y)) continue;
          const edge = 2 * (Math.min(X - p.px * PROV, (p.px + 1) * PROV - 1 - X, Y - p.py * PROV, (p.py + 1) * PROV - 1 - Y) + 0.5); // граница «отталкивает» как сосед
          const sc = mine.length ? Math.min(edge, ...mine.map((c) => Math.hypot(c.x - X, c.y - Y))) : -Math.hypot(X - mx, Y - my);
          if (sc > best) { best = sc; spot = { x: X, y: Y }; }
        }
        if (spot) break; // провинция тесная (старые замки) — следующая
      }
      if (!spot) for (let k = 0; !spot; k++) { const X = Math.floor(Math.random() * WORLD), Y = Math.floor(Math.random() * WORLD); if (!this.byXY.has(X * WORLD + Y)) spot = { x: X, y: Y }; }
      ({ x, y } = spot);
    }
    const castleGrid = new Int8Array(49).fill(-1);
    const landsGrid = new Int8Array(LANDS_N * LANDS_N).fill(-1);
    const castle = {
      id, owner: user.id, name: `Замок ${user.login}`, x, y,
      grid: { 0: castleGrid, 1: landsGrid },
      levels: { 0: new Int8Array(49), 1: new Int8Array(LANDS_N * LANDS_N) },
      res: { wood: 500, stone: 500, iron: 500, food: 500, people: 40 }, // старт: склад 2 ур. полон (вмещает 500)
      resAt: Date.now(),
      queue: [],
    };
    castleGrid[3 * 7 + 3] = 0; castle.levels[0][3 * 7 + 3] = 1; // Ратуша 1 ур. в центре
    castleGrid[2 * 7 + 1] = 1; castle.levels[0][2 * 7 + 1] = 2; // Склад 2 ур.
    // стартовые постройки на землях: по одной добывающей каждого вида
    for (const [bx, by, b] of [[1, 8, 7], [10, 0, 8], [12, 0, 9], [3, 5, 5], [6, 3, 6]]) {
      landsGrid[by * LANDS_N + bx] = b; castle.levels[1][by * LANDS_N + bx] = 1;
    }
    castle.landsV = 2; // земли — уже в новых уровнях (1–5)
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
    return Math.min(R.max, Math.min(R.castleMax, Math.round((sum(castle.levels[0]) + (castle.wall || 0)) * R.castle)) + Math.min(R.landsMax, Math.round(castle.levels[1].reduce((x, y) => x + C.landEff(y), 0) * R.lands)));
  }

  buildingLevel(castle, buildingId) {
    if (buildingId === WALL_ID) return castle.wall || 0;
    let best = 0;
    for (const v of [0, 1]) castle.grid[v].forEach((b, i) => { if (b === buildingId) best = Math.max(best, castle.levels[v][i]); });
    return best;
  }

  capacity(castle) {
    let store = STORE.base;
    castle.grid[0].forEach((b, i) => { if (b === 1) store += storeBonus(castle.levels[0][i]); });
    let huts = 0;
    castle.grid[1].forEach((b, i) => { if (b === 6) huts += C.landEff(castle.levels[1][i]); }); // места — как у прежнего уровня
    const people = Math.round(STORE.people + STORE.peoplePerHut * C.HUT_CAP_MULT * huts);
    return { wood: store, stone: store, iron: store, food: store, people };
  }

  // добыча в час с учётом скорости мира
  rates(castle) {
    const r = { ...BASE_RATE };
    castle.grid[1].forEach((b, i) => {
      const def = C.BY_ID[b];
      if (def && def.produces) r[def.produces] += C.PROD[C.landEff(castle.levels[1][i])] * C.PROD_K[def.produces] * (C.LAND_YIELD[b] || 1);
    });
    r.people *= 1 + PEOPLE_SCI * ((castle.sciences && castle.sciences.eco) || 0); // наука «Экономика»: люди +0,37% за уровень (полные земли 1303 → 1400)
    if (this.isPremium(this.userById(castle.owner))) r.people *= 1.5; // премиум: население +50%
    const prod = this.bonus(castle).prod; // наука Экономика, религия Природа, артефакты
    for (const k of ['wood', 'stone', 'iron', 'food']) r[k] *= prod;
    for (const k of Object.keys(r)) r[k] = Math.round(r[k] * RES_SPEED + 1e-9);
    return r;
  }

  // довести ресурсы и очередь до момента now (ленивый расчёт)
  tick(castle, now = Date.now()) {
    if (castle.grid[1].length !== LANDS_N * LANDS_N) migrateLands(castle);
    fixPlaza(castle); fixWall(castle);
    const done = [];
    castle.queue.sort((a, b) => a.end - b.end);
    while (castle.queue.length && castle.queue[0].end <= now) {
      const item = castle.queue.shift();
      this.accrue(castle, item.end);
      if (item.wall) castle.wall = Math.max(castle.wall || 0, item.level); // стена — без клетки
      else { castle.grid[item.view][item.cell] = item.building; castle.levels[item.view][item.cell] = item.level; }
      done.push(item);
      if (this.addStat) this.addStat(castle.owner, 'built', 1); // задания: улучшено зданий
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
    // сверх Склада (награда советника) ресурсы не растут, но и не срезаются — тратятся как обычно
    for (const r of C.RES) { const v = castle.res[r], n = v + rate[r] * dtH; castle.res[r] = Math.max(0, v > cap[r] ? Math.min(v, n) : Math.min(cap[r], n)); }
    castle.resAt = t;
  }

  // проверка и постановка в очередь: стройка нового здания или улучшение существующего
  startBuild(castle, view, cell, buildingId) {
    this.tick(castle);
    const size = GRID[view];
    if (!size || cell < 0 || cell >= size * size) return { error: 'Неверная клетка.' };
    const def = C.BY_ID[buildingId];
    if (!def) return { error: 'Неизвестное здание.' };
    if (buildingId === WALL_ID) return { error: 'Стена развивается в Ратуше.' };
    if (castle.queue.some((q) => q.view === view && q.cell === cell)) return { error: 'Здесь уже идёт строительство.', state: 1 };
    const maxQ = this.isPremium(this.userById(castle.owner)) ? 5 : MAX_QUEUE; // премиум — 5 строек
    if (castle.queue.length >= maxQ) return { error: `Одновременно можно строить не больше ${maxQ} зданий.${maxQ < 5 ? ' С премиумом — 5.' : ''}` };
    const current = castle.grid[view][cell];
    let level;
    if (current === -1) {
      if ((view === VIEW.CASTLE) !== (def.layer === 'castle')) return { error: 'Это здание строится в другом месте.' };
      if (view === VIEW.LANDS) {
        const x = cell % LANDS_N, y = Math.floor(cell / LANDS_N);
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

  // Стена: следующий уровень из окна Ратуши (без клетки; в очереди строек — как обычная стройка)
  startWall(castle) {
    this.tick(castle);
    const def = C.BY_ID[WALL_ID];
    if (castle.queue.some((q) => q.wall)) return { error: 'Стена уже строится.' };
    const maxQ = this.isPremium(this.userById(castle.owner)) ? 5 : MAX_QUEUE;
    if (castle.queue.length >= maxQ) return { error: `Одновременно можно строить не больше ${maxQ} зданий.${maxQ < 5 ? ' С премиумом — 5.' : ''}` };
    const level = (castle.wall || 0) + 1;
    if (level > (def.max || 20)) return { error: 'Стена построена до предела.' };
    for (const [reqId, reqLvl] of Object.entries(def.req || {})) if (this.buildingLevel(castle, Number(reqId)) < reqLvl) return { error: `Нужно: ${C.BY_ID[reqId].name} ${reqLvl} ур.` };
    const cost = C.levelCost(def, level), cap = this.capacity(castle), busy = castle.queue.reduce((s, q) => s + q.cost.people, 0);
    for (const r of C.RES) if (castle.res[r] < cost[r]) return { error: 'Недостаточно ресурсов.' };
    if (busy + cost.people > cap.people) return { error: 'Не хватает свободных людей.' };
    for (const r of C.RES) if (r !== 'people') castle.res[r] -= cost[r];
    const time = Math.max(3, Math.round(buildTime(def, level, this.buildingLevel(castle, 0)) * this.bonus(castle).build)), now = Date.now();
    const item = { view: VIEW.CASTLE, cell: -1, wall: true, building: WALL_ID, level, start: now, end: now + time * 1000, cost };
    castle.queue.push(item); this.store.save();
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
      out.push({ kind: 'castle', x: c.x, y: c.y, img: 10, prem: this.isPremium(owner) || undefined, castleId: c.id, name: c.name, ownerId: owner.id, owner: owner.login, race: owner.race, rating: this.rating(c), alliance: al ? al.tag : null, allyId: al ? al.id : null, newbie: !owner.admin && this.rating(c) < require('./army').NEWBIE_RATING });
    }
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (occupied.has(`${x}:${y}`) || x < 0 || y < 0 || x >= WORLD || y >= WORLD || onProvEdge(x, y)) continue;
        const obj = provObjects(x, y); // в каждой провинции — одинаковый набор лагерей и NPC (provObjects)
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
require('./smod').install(Game);
require('./stash').install(Game);
require('./metrics').install(Game);
require('./anomaly').install(Game);
require('./secwatch').install(Game);
require('./tgbackup').install(Game);
require('./shop').install(Game);
require('./tgauth').install(Game);
require('./pics').install(Game);
require('./zags').install(Game);
require('./chests').install(Game);
require('./coin').install(Game);
require('./market').install(Game);
require('./privacy').install(Game);
require('./battlerank').install(Game);
require('./quests').install(Game);
require('./hero').install(Game);
require('./boss').install(Game);

module.exports = { PROV, PROV_CAP, PROV_N, provinceOf, onProvEdge, passLogPush, checkPassword, meadowAt, fixPlaza, migrateLands, LANDS_N, WORLD, Game, Store, STORE, BASE_RATE, PEOPLE_FACTOR, storeBonus, RES_SPEED, buildTime, VIEW, GRID, landOptions, SPEED, MAX_QUEUE, LANDS_BASE, LANDS_DECOR, LANDS_EDGE };
