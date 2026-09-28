'use strict';
// Пентест-фаззер: подменяет поля во всех запросах (отрицательные, NaN, огромные числа, чужие id, __proto__ и т. п.)
// и проверяет, что сервер жив, ресурсы/золото/войска не растут, нет NaN и ошибок обработчиков. node test/fuzz.js
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const PORT = 18000 + (process.pid % 1000), DB = path.join(os.tmpdir(), `fuzz-${process.pid}.json`);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], { env: { ...process.env, WEB_PORT: String(PORT), HOST: '127.0.0.1', DB, SPEED: '1', SAVE_MS: '500', NO_CAPTCHA: '1', ADMIN_PASS: 'admin', RATE_OFF: '1', NO_BACKUP: '1' } });
let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const c = { ws, last: {}, msgs: [] };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); c.last[m.t] = m; c.msgs.push(m); };
  c.open = () => new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.raw = (s) => ws.send(s);
  return c;
}
const EVIL = [-1, -1e9, 1e300, 0.5, '-5', '1e400', 'Infinity', 'NaN', null, true, [], {}, [1, 2], { __proto__: { polluted: 1 } }, '__proto__', 'constructor', 'toString', 'hasOwnProperty',
  '../../../etc/passwd', '<img src=x onerror=alert(1)>', 'x'.repeat(20000), 1, 2, 999999, 'admin', 'victim'];
(async () => {
  await sleep(1200);
  const A = client(); await A.open();
  for (const [l, p] of [['hacker', '123'], ['victim', '123']]) { A.send({ t: 'register', login: l, password: p, race: 0 }); await sleep(150); }
  const adm = client(); await adm.open(); adm.send({ t: 'login', login: 'admin', password: 'admin' }); await sleep(300);
  adm.send({ t: 'admin', op: 'max', login: 'hacker' }); adm.send({ t: 'admin', op: 'gold', login: 'hacker', n: 100 }); adm.send({ t: 'admin', op: 'units', login: 'hacker' }); await sleep(500);
  A.send({ t: 'login', login: 'hacker', password: '123' }); await sleep(500);
  A.send({ t: 'alliance', op: 'create', name: 'Hack', tag: 'HK' }); await sleep(200);
  const st0 = A.last.state; if (!st0) throw new Error('no state');
  const victimId = (Object.values(JSON.parse(fs.readFileSync(DB))).users || {}).victim;
  const base = {
    build: { view: 0, cell: 5, building: 3 }, demolish: { view: 0, cell: 5 }, switch: { id: 1 }, ritual: { id: 'x' }, forge: { unit: 200, kind: 'a' }, festival: { id: 1 },
    world: { cx: 500, cy: 500 }, gift: { to: 2, gift: 1, text: 'hi' }, profile: { id: 2 }, rep: { id: 2, coins: 1 }, friend: { op: 'add', id: 2 }, search: { q: 'a' }, notes: { text: 'n' }, about: { text: 'a' },
    chat: { text: 'hi' }, premium: { days: 14, to: '' }, chatmod: { op: 'del', id: 1, login: 'victim', hours: 1 }, ratings: { kind: 'castles' }, mail: { folder: 0 }, read: { id: 1 },
    sendmail: { to: 'victim', subject: 's', text: 't' }, train: { unit: 200, count: 1 }, send: { units: { 200: 1 }, x: 510, y: 510, mission: 'attack', res: { wood: 1 }, from: '', at: 0 },
    squad: { op: 'create', from: 'castle', to: 1, units: { 200: 1 }, id: 1, name: 'q' }, general: { op: 'dist', name: 'g', pts: { atk: 1 } }, exchange: { from: 'wood', to: 'stone', amount: 100 },
    research: { sci: 'eco' }, religion: { id: 'war' }, artifact: { id: 1, on: true }, alliance: { op: 'request', id: 1, login: 'victim' }, report: { id: 1 }, admin: { op: 'gold', login: 'hacker', n: 1000 },
    ally: { op: 'gold', n: 5, to: 'victim', res: { wood: 1 }, login: 'victim', rights: {}, text: 't', title: 't', topic: 1, idx: 0, act: 'delete', name: 'n', tag: 't', status: 'war', desc: 'd' },
    avatar: { op: 'set', px: 'x' }, bug: { text: 'b' },
  };
  const allyOps = ['gold', 'store', 'transfer', 'rank', 'diplo', 'mail', 'news', 'post', 'postdel', 'topic', 'topicop', 'ad', 'charter', 'desc', 'rights', 'kick', 'leave', 'give'];
  const squadOps = ['create', 'move', 'rename', 'delete', 'split', 'merge', 'back', 'recall'];
  const genOps = ['dist', 'reset', 'rename', 'revive', 'kill'];
  const missions = ['attack', 'raid', 'scout', 'trade', 'expedition', 'reinforce', '__proto__', 'constructor'];
  const msgs = [];
  for (const [t, b] of Object.entries(base)) {
    msgs.push({ t, ...b });
    for (const k of Object.keys(b)) for (const e of EVIL) msgs.push({ t, ...b, [k]: e });
  }
  for (const op of allyOps) for (const e of EVIL) msgs.push({ t: 'ally', ...base.ally, op, n: e }, { t: 'ally', ...base.ally, op, res: { wood: e, stone: e } });
  for (const op of squadOps) for (const e of EVIL) msgs.push({ t: 'squad', ...base.squad, op, units: { 200: e, __proto__: e } });
  for (const op of genOps) for (const e of EVIL) msgs.push({ t: 'general', op, pts: { atk: e, def: e } });
  for (const m of missions) for (const e of EVIL) msgs.push({ t: 'send', ...base.send, mission: m, units: { 200: e, 233: e }, res: { wood: e, food: e } }, { t: 'send', ...base.send, mission: m, from: e });
  for (const e of EVIL) msgs.push({ t: 'exchange', from: 'wood', to: 'stone', amount: e }, { t: e }, { t: 'train', unit: 200, count: e }, { t: 'rep', id: 1, coins: e }, { t: 'gift', to: 1, gift: e });
  const bad = [];
  const check = (m) => {
    const s = A.last.state; if (!s) return;
    const c = s.castle, u = s.user;
    for (const [r, v] of Object.entries(c.res)) if (!Number.isFinite(v) || v < 0) bad.push(`ресурс ${r}=${v} после ${JSON.stringify(m).slice(0, 160)}`);
    if (!Number.isFinite(u.gold) || u.gold < 0 || u.gold > st0.user.gold) bad.push(`золото ${st0.user.gold}→${u.gold} после ${JSON.stringify(m).slice(0, 160)}`);
    const units = (c.mil && c.mil.units) || {};
    for (const [id, n] of Object.entries(units)) if (!Number.isInteger(n) || n < 0 || n > ((st0.castle.mil.units || {})[id] || 0) + 400) bad.push(`юниты ${id}=${n} после ${JSON.stringify(m).slice(0, 160)}`);
  };
  let n = 0;
  for (const m of msgs) {
    try { A.send(m); } catch (e) { continue; }
    if (++n % (process.env.EVERY ? 1 : 10) === 0) { await sleep(process.env.EVERY ? 45 : 450); check(m); if (process.env.EVERY && bad.length) break; }
  }
  // сырые кадры
  for (const r of ['null', '1', '"x"', '[]', '{"t":null}', '{"t":{"t":1}}', '{', '{"__proto__":{"polluted":1},"t":"hello"}']) A.raw(r);
  await sleep(800); check('final');
  A.send({ t: 'hello' }); await sleep(300);
  const alive = !!A.last.catalog && srv.exitCode === null;
  const polluted = ({}).polluted !== undefined;
  const handlerErr = (log.match(/handler error: [^\n]*/g) || []);
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const hk = db.users.hacker, vic = db.users.victim;
  console.log(`отправлено ${msgs.length} запросов; сервер жив: ${alive}; ошибок обработчиков: ${handlerErr.length}`);
  for (const e of [...new Set(handlerErr)].slice(0, 30)) console.log('  ', e.slice(0, 200));
  console.log(`аномалий состояния: ${bad.length}`); for (const b of [...new Set(bad)].slice(0, 30)) console.log('  ', b);
  console.log('hacker: admin', !!hk.admin, 'mod', !!hk.mod, 'gold', hk.gold, 'rep', hk.reputation, '| victim gold', vic.gold, 'rep', vic.reputation, 'banned', !!vic.banned);
  const nanScan = JSON.stringify(db).match(/"[a-zA-Z_]+":null/g) || [];
  console.log('null-полей в базе (NaN/Infinity сохраняются как null):', [...new Set(nanScan)].slice(0, 20).join(' '));
  srv.kill(); try { fs.unlinkSync(DB); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
