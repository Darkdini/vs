'use strict';
// node test/sim.js — живая симуляция: боты играют через WebSession.handle (как настоящие игроки) много игровых дней,
// после шагов проверяются инварианты: ресурсы 0…склад, нет NaN, войска целые и не отрицательные, один генерал на королевство,
// вещи и руны, карта (замок на своей клетке), владельцы, база сериализуется. Время — подменённые часы.
process.env.NO_BACKUP = '1'; process.env.RATE_OFF = '1'; process.env.NO_CAPTCHA = '1'; process.env.NEWBIE_DAYS = process.env.NEWBIE_DAYS || '0'; process.env.NEWBIE_PREMIUM_DAYS = process.env.NEWBIE_PREMIUM_DAYS || '0';
process.env.SAVE_MS = '600000000';
const os = require('os'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', 'src') + path.sep;
let NOW = Date.UTC(2026, 9, 12, 6, 0, 0); const realNow = Date.now; Date.now = () => NOW;
const DB = path.join(os.tmpdir(), `sim-${process.pid}.json`);
const { Game, Store, provinceOf } = require(ROOT + 'game');
const { WebSession } = require(ROOT + 'web');
const C = require(ROOT + 'catalog');
const g = new Game(new Store(DB));
const SEED = Number(process.env.SEED || 7); let rs = SEED; const rnd = () => ((rs = (rs * 1103515245 + 12345) >>> 0) / 4294967296);
Math.random = rnd; // воспроизводимо
const pick = (a) => a[Math.floor(rnd() * a.length)];
const BOTS = Number(process.env.BOTS || 24), DAYS = Number(process.env.DAYS || 5), STEP = Number(process.env.STEP_MIN || 10) * 60000;

const errCount = new Map(), bugs = [], exc = [];
const note = (k) => errCount.set(k, (errCount.get(k) || 0) + 1);
function mk(i) {
  const sock = { destroyed: false, write() {}, destroy() { this.destroyed = true; } };
  const s = new WebSession(g, sock, () => {}); s.ip = `10.1.${i >> 8}.${i & 255}`;
  s.send = (o) => { if (o.t === 'state') s.st = o; if (o.t === 'error') { s.err = o.msg; note(`${s.cur}: ${String(o.msg).replace(/\d[\d\s ]*/g, 'N').slice(0, 90)}`); } };
  s.do = (m) => { s.cur = m.t + (m.op ? '/' + m.op : '') + (m.mission ? '/' + m.mission : ''); s.err = null; try { s.handle(m); } catch (e) { exc.push(`${s.cur}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); } return !s.err; };
  return s;
}
const S = [];
for (let i = 0; i < BOTS; i++) {
  const s = mk(i); S.push(s);
  s.do({ t: 'register', login: `simbot${i}`, password: 'pass12345', race: i % 4 });
  s.do({ t: 'login', login: `simbot${i}`, password: 'pass12345' });
  if (!s.user) throw new Error('bot login failed ' + i + ' ' + s.err);
  if (i % 3 === 0) { const c = g.castleOf(s.user); g.mil(c); g.maxOut(c); } // треть — «старожилы» с развитым замком
}
console.log(`боты: ${S.length}, дней: ${DAYS}, шаг ${STEP / 60000} мин, семя ${SEED}`);

// ---------- действия ботов ----------
const RES4 = ['wood', 'stone', 'iron', 'food'];
function nearTargets(s) {
  const c = g.castleOf(s.user), R = 22;
  return g.worldObjects(c.x - R, c.y - R, 2 * R + 1, 2 * R + 1).filter((o) => !(o.x === c.x && o.y === c.y));
}
function act(s) {
  const u = s.user, c = g.castleOf(u); if (!c) return;
  const st = s.st || {}, mil = (st.castle && st.castle.mil) || {};
  const r = rnd();
  if (r < 0.18) { // стройка: случайная клетка и случайное здание из каталога
    const view = rnd() < 0.7 ? 0 : 1, cell = Math.floor(rnd() * 49);
    const b = pick(C.BUILDINGS.filter((x) => (view === 0 ? x.layer === 'castle' : x.layer !== 'castle')));
    const cur = c.grid[view][cell];
    s.do({ t: 'build', view, cell, building: cur >= 0 ? cur : b.id });
  } else if (r < 0.32) { // найм
    const list = require(ROOT + 'army').unitsForRace(u.race).filter((x) => !x.quest); const un = pick(list.length ? list : [{ id: 200 }]);
    s.do({ t: 'train', unit: un.id, count: 1 + Math.floor(rnd() * 40) });
  } else if (r < 0.52) { // поход
    const t = pick(nearTargets(s) || []); if (!t) return;
    const mission = t.rune ? 'rune' : t.kind === 'castle' ? pick(['attack', 'raid', 'scout', 'reinforce']) : t.img === 24 ? pick(['attack', 'raid', 'expedition', 'scout']) : pick(['attack', 'raid', 'scout']);
    const armies = [{ from: 'castle' }, ...(c.squads || []).map((q) => ({ from: String(q.id) }))];
    s.do({ t: 'send', ...pick(armies), mission, x: t.x, y: t.y, dropShield: rnd() < 0.2 });
  } else if (r < 0.58) { // снаряжение и руны
    const h = g.heroView(c), op = pick(['forge', 'forge', 'equip', 'enhance', 'talent', 'sell', 'unequip']);
    if (op === 'forge') s.do({ t: 'hero', op, slot: pick(['weapon', 'helm', 'armor', 'shield', 'amulet', 'horse']), r: Math.floor(rnd() * 5) });
    else if (op === 'talent') s.do({ t: 'hero', op, id: pick(['a1', 'a2', 'd1', 'l1', 'a4']) });
    else if (op === 'unequip') s.do({ t: 'hero', op, slot: pick(['weapon', 'helm', 'armor', 'shield', 'amulet', 'horse']) });
    else { const it = pick(h.gear || []); if (it) s.do({ t: 'hero', op, item: it.id }); }
  } else if (r < 0.64) { // задания
    s.do({ t: 'quests' }); const q = g.questsState(u, c);
    const k = pick(['cal', 'chest', 'wchest', 'tut', 'daily', 'weekly', 'camp']);
    if (k === 'daily') { const d = pick(q.daily || []); if (d) s.do({ t: 'qclaim', kind: 'daily', id: d.id }); }
    else if (k === 'weekly') { const d = pick(q.weekly || []); if (d) s.do({ t: 'qclaim', kind: 'weekly', id: d.id }); }
    else s.do({ t: 'qclaim', kind: k });
  } else if (r < 0.68) { // рынок и обмен
    s.do({ t: 'exchange', from: pick(RES4), to: pick(RES4), amount: Math.floor(rnd() * 3000) });
  } else if (r < 0.72) { // армии: переформирование, отзыв
    const op = pick(['regroup', 'recall', 'disband']);
    if (op === 'regroup') s.do({ t: 'squad', op, from: 'castle', to: 'new', units: Object.fromEntries(Object.entries(c.units || {}).slice(0, 3).map(([k, n]) => [k, Math.floor(n / 2)])), general: rnd() < 0.3, name: 'Отряд' });
    else if (op === 'recall') { const a = pick((c.armies || []).filter((x) => x.state === 'go')); if (a) s.do({ t: 'squad', op, id: a.id }); }
    else { const q = pick(c.squads || []); if (q) s.do({ t: 'squad', op, id: q.id }); }
  } else if (r < 0.75) { // купол
    s.do({ t: 'shield', op: pick(['buy', 'off']), kind: pick(['castle', 'kingdom']), days: 1 });
  } else if (r < 0.78) { // наука, религия, генерал
    s.do({ t: 'research', sci: pick(['eco', 'war', 'def', 'speed', 'loot', 'build']) });
    s.do({ t: 'general', op: pick(['revive', 'dist']), pts: { atk: 1 }, idx: 0 });
  } else if (r < 0.80) { // альянс
    if (!u.alliance && rnd() < 0.5) s.do({ t: 'alliance', op: 'create', name: `Ал${u.id}`, tag: `A${u.id % 100}` });
    else if (!u.alliance) { const a = pick(Object.values(g.db.alliances || {})); if (a) s.do({ t: 'alliance', op: 'request', id: a.id }); }
  } else if (r < 0.82) { // Кузница: улучшение юнита
    const fu = pick(mil.forgeUnits || [200]); s.do({ t: 'forge', unit: fu, kind: pick(['a', 'd']) });
  } else if (r < 0.84) { // экспедиция из здания
    s.do({ t: 'exped', kind: pick(['near', 'city', 'tomb']), n: 1 + Math.floor(rnd() * 5) });
  } else if (r < 0.86) { // Кладовая
    s.do({ t: 'stash', op: 'take', kind: pick(['res', 'units']), key: pick([...RES4, '200', '201']), n: Math.floor(rnd() * 1000) });
  } else s.do({ t: 'sync' });
}

// ---------- инварианты ----------
const fin = (v) => typeof v === 'number' && Number.isFinite(v); const PREV = new Map();
function check(tag) {
  const out = [];
  const add = (m) => { if (out.length < 30) out.push(m); };
  for (const c of Object.values(g.db.castles)) {
    const own = g.userById(c.owner);
    if (!own) add(`замок ${c.id}: нет хозяина ${c.owner}`);
    if (g.castleAt(c.x, c.y) !== c) add(`замок ${c.id} (${c.x}:${c.y}) не на своей клетке в индексе`);
    if (!c.site && c.res) { // сверх склада можно, только если склад уменьшился (разрушен), — тогда ресурсы «заморожены» и не растут
      const cap = g.capacity(c), pv = (PREV.get(c.id) || {}), pc = pv.cap || {}; // pc — склад на прошлой проверке: если Склад разрушили в бою,
      // ресурсы до боя законно росли до прежней вместимости
      for (const k of RES4) { const v = c.res[k]; if (!fin(v) || v < 0) add(`замок ${c.id}: ресурс ${k} = ${v}`);
        else if (v > Math.max(cap[k], pc[k] || 0) * 1.001 + 1 && !(pv[k] !== undefined && v <= pv[k] + 1)) add(`замок ${c.id}: ${k} ${Math.round(v)} > склада ${cap[k]} и растёт (было ${Math.round(pv[k] ?? -1)})`); }
      PREV.set(c.id, { ...c.res, cap }); }
    const unitsOk = (u, w) => { for (const [id, n] of Object.entries(u || {})) if (!Number.isInteger(n) || n < 0) add(`замок ${c.id} ${w}: юнит ${id} = ${n}`); };
    unitsOk(c.units, 'замок');
    for (const q of c.squads || []) unitsOk(q.units, `армия ${q.id}`);
    for (const a of c.armies || []) {
      unitsOk(a.units, `поход ${a.id}`);
      if (!['go', 'back', 'wait', 'stay'].includes(a.state)) add(`поход ${a.id}: состояние ${a.state}`);
      if (!fin(a.arrive) || !fin(a.depart) || (a.state === 'back' && !fin(a.back))) add(`поход ${a.id}: время ${a.depart}/${a.arrive}/${a.back}`);
      if (a.state === 'go' && a.arrive < NOW - 5 * 60000) add(`поход ${a.id} (${a.mission}) завис: должен был прийти ${Math.round((NOW - a.arrive) / 60000)} мин назад`);
      if (a.state === 'back' && a.back < NOW - 5 * 60000) add(`поход ${a.id} (${a.mission}) не вернулся: ${Math.round((NOW - a.back) / 60000)} мин`);
    }
    const gen = c.general; if (gen && (!fin(gen.exp) || gen.exp < 0 || !Number.isInteger(gen.level) || gen.level < 1)) add(`замок ${c.id}: генерал опыт ${gen.exp} ур ${gen.level}`);
    if (gen && gen.away && !(c.armies || []).some((a) => a.id === gen.away) && !gen.dead) add(`замок ${c.id}: генерал «в походе» ${gen.away}, а такого похода нет`);
    if (c.runeJob && (!fin(c.runeJob.end))) add(`замок ${c.id}: ковка без времени`);
    if (c.loyalty !== undefined && (!fin(c.loyalty) || c.loyalty < 0 || c.loyalty > 100)) add(`замок ${c.id}: лояльность ${c.loyalty}`);
  }
  for (const u of Object.values(g.db.users)) {
    if (u.bot) continue;
    if (!Number.isInteger(u.gold || 0) || (u.gold || 0) < 0) add(`${u.login}: золото ${u.gold}`);
    for (const [k, v] of Object.entries(u.runes || {})) if (!Number.isInteger(v) || v < 0) add(`${u.login}: руны ${k} = ${v}`);
    const cs = g.castlesOf(u);
    const live = cs.filter((c) => c.general && !c.general.dead).length;
    if (live > 1) add(`${u.login}: живых генералов ${live} (должен быть один на королевство)`);
    const ids = new Set();
    for (const it of [...(u.gear || []), ...cs.flatMap((c) => Object.values((c.general && c.general.eq) || {}))]) {
      if (!it) continue;
      if (ids.has(it.id)) add(`${u.login}: вещь ${it.id} в двух местах`); ids.add(it.id);
      if (!['weapon', 'helm', 'armor', 'shield', 'amulet', 'horse'].includes(it.slot) || !(it.r >= 0 && it.r <= 4) || (it.plus || 0) > 5) add(`${u.login}: странная вещь ${JSON.stringify(it)}`);
    }
    // трофеи — до 24; сверх этого кладутся только скованная вещь (1) и снятое с павшего генерала (6) — чтобы не пропали
    if ((u.gear || []).length > 24 + 1 + 6) add(`${u.login}: в Оружейной ${(u.gear || []).length} вещей`);
    if (u.br && (!fin(u.br.pts) || u.br.pts < 0)) add(`${u.login}: очки ранга ${u.br.pts}`);
  }
  // NaN нигде в базе (JSON превратил бы его в null)
  const seen = new WeakSet(); let nan = 0, nanAt = '';
  (function walk(o, p, d) { if (d > 12 || !o || typeof o !== 'object' || seen.has(o)) return; seen.add(o); for (const [k, v] of Object.entries(o)) { if (typeof v === 'number' && !Number.isFinite(v)) { nan++; if (!nanAt) nanAt = p + '.' + k; } else if (v && typeof v === 'object') walk(v, p + '.' + k, d + 1); } })(g.db, 'db', 0);
  if (nan) add(`NaN/Infinity в базе: ${nan} (первое: ${nanAt})`);
  try { JSON.stringify(g.db); } catch (e) { add(`база не сериализуется: ${e.message}`); }
  for (const m of out) bugs.push(`[${tag}] ${m}`);
  return out.length;
}

// ---------- прогон ----------
const t0 = realNow(); let steps = 0;
const total = Math.round(DAYS * 86400000 / STEP);
for (let k = 0; k < total; k++) {
  NOW += STEP; steps++;
  try { g.tickWorld(NOW); g.seasonCheck(); g.bossCheck(); } catch (e) { exc.push(`мир: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
  for (const s of S) { try { s.onTick(); } catch (e) { exc.push(`onTick: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); } }
  g.drainEvents && g.drainEvents();
  if (k % 6 === 0) { try { g.coinSweep && g.coinSweep(); g.marketSweep && g.marketSweep(); g.anomalyScan && g.anomalyScan(); } catch (e) { exc.push(`sweep: ${e.message}`); } }
  for (const s of S) { const n = rnd() < 0.5 ? 1 : 2; for (let j = 0; j < n; j++) act(s); }
  if (k % 24 === 0) { const n = check(`день ${(k * STEP / 86400000).toFixed(1)}`); if (n) console.log(`день ${(k * STEP / 86400000).toFixed(1)}: нарушений ${n}`); }
}
check('конец');
const users = Object.values(g.db.users).filter((u) => !u.bot && /^simbot/.test(u.login));
const stats = { castles: Object.keys(g.db.castles).length, reports: (g.db.reports || []).length, runes: users.reduce((s, u) => s + Object.values(u.runes || {}).reduce((a, b) => a + b, 0), 0),
  forged: users.reduce((s, u) => s + (u.gear || []).filter((x) => x.forged).length, 0), armiesNow: Object.values(g.db.castles).reduce((s, c) => s + (c.armies || []).length, 0) };
console.log(`шагов ${steps}, ${Math.round((realNow() - t0) / 1000)} с; итог:`, JSON.stringify(stats));
console.log(`\nИСКЛЮЧЕНИЯ (${exc.length}):`); [...new Set(exc)].slice(0, 25).forEach((e) => console.log(' ', e));
console.log(`\nНАРУШЕНИЯ (${bugs.length}):`); [...new Set(bugs.map((b) => b.replace(/^\[[^\]]+\] /, '')))].slice(0, 40).forEach((b) => console.log(' ', b));
console.log('\nЧАСТЫЕ ОТКАЗЫ:'); [...errCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45).forEach(([k, n]) => console.log(`  ${n}× ${k}`));
try { fs.unlinkSync(DB); } catch {}
if (exc.length || bugs.length) { console.log('\nСИМУЛЯЦИЯ: НАЙДЕНЫ ПРОБЛЕМЫ'); process.exit(1); }
console.log('\n✓ СИМУЛЯЦИЯ: боты играли без ошибок, все проверки сошлись');
process.exit(0);
