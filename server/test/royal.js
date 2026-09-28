'use strict';
// Баланс лояльности населения: самый активный игрок может захватить первый замок только через ~месяц.
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
const DB = path.join(os.tmpdir(), `royal-${process.pid}.json`);
const { Game, Store } = require('../src/game');
const g = new Game(new Store(DB));
const u = g.register({ login: 'royaltest', password: '123', race: 0 }).user;
const fmt = (n) => n.toLocaleString('ru-RU');
const DAY = 86400000, t0 = Date.now();
u.royal = 0; u.royalAt = t0; u.lastSeen = t0;
let firstDay = null;
for (let d = 0; d < 60 && firstDay === null; d++) {
  const now = t0 + d * DAY + 3600000;
  u.lastSeen = now; // заходит каждый день
  for (let k = 0; k < 200; k++) g.royalGain(u, 10, now); // очень много действий — упирается в дневной лимит
  if (g.royalTick(u, now) >= g.royalNeed(u)) firstDay = d + 1;
}
assert.ok(firstDay >= 29 && firstDay <= 31, `первый захват на ${firstDay}-й день`);
console.log(`✓ лояльность: самый активный игрок может захватить первый замок на ${firstDay}-й день (нужно ${g.royalNeed(u)})`);
// отсутствие: 7 дней — прирост стоп, 14 — падение по 100/сутки, 21 — бунт в замках
const before = u.royal, away = u.lastSeen;
g.royalTick(u, away + 30 * DAY);
assert.ok(u.royal < before, 'лояльность падает при долгом отсутствии');
assert.ok(g.castlesOf(u)[0].loyalty <= 100 - 5 * 8, 'население бунтует после 3 недель');
console.log(`✓ отсутствие 30 дней: лояльность ${before} → ${u.royal}, лояльность замка ${g.castlesOf(u)[0].loyalty}%`);
// Храм: +12 в сутки за каждый замок с Храмом (1 ед. в 2 часа)
const v = g.register({ login: 'templetest', password: '123', race: 0 }).user, T = Date.now();
v.royal = 0; v.royalAt = T; v.lastSeen = T;
g.royalTick(v, T + 86400000); const noTemple = v.royal;
g.castlesOf(v)[0].grid[0][0] = 25; g.castlesOf(v)[0].levels[0][0] = 10;
g.royalTick(v, T + 2 * 86400000);
assert.equal(noTemple, 50); assert.equal(v.royal - noTemple, 62);
// ритуал «Молебен» (+5%) — ко всему приросту
v.rituals = [{ id: 'prayer', pct: 0.05, until: T + 10 * 86400000 }];
const b = v.royal; g.royalTick(v, T + 3 * 86400000);
assert.equal(v.royal - b, Math.round(62 * 1.05));
// строгий баланс: даже с лояльностью первый захват — не раньше 30-го дня игры
v.royal = 1e6; v.created = T;
assert.ok(!g.royalCanCapture(v) && g.royalWaitDays(v, T) === 30);
v.created = T - 31 * 86400000; assert.ok(g.royalCanCapture(v));
console.log('✓ Храм: +12 в сутки; ритуал +5%; первый захват не раньше 30-го дня игры');
// Кузница: улучшение атаки Мечника +1 за уровень, не выше уровня Кузнеца
const w = g.register({ login: 'forgetest', password: '123', race: 0 }).user, fc = g.castlesOf(w)[0];
fc.grid[0][1] = 11; fc.levels[0][1] = 1; fc.grid[0][2] = 1; fc.levels[0][2] = 10;
g.mil(fc); Object.assign(fc.res, { wood: 5000, stone: 5000, iron: 5000, food: 5000 });
const p0 = g.armyPower(fc, { 200: 100 }, false).inf;
assert.ok(g.forgeOp(fc, { unit: 200, kind: 'a' }).ok);
fc.forgeJob.end = Date.now() - 1; g.tick(fc);
assert.equal(fc.forge[200].a, 1);
const p1 = g.armyPower(fc, { 200: 100 }, false).inf;
assert.ok(Math.abs(p1 / p0 - (g.UNIT_ATK = require('../src/army').UNIT[200].attack + 1) / require('../src/army').UNIT[200].attack) < 1e-9);
assert.ok(/Нужен Кузнец 2/.test(g.forgeOp(fc, { unit: 200, kind: 'a' }).error));
console.log(`✓ Кузница: атака Мечника +1 (сила армии ${Math.round(p0)} → ${Math.round(p1)}), выше уровня Кузнеца нельзя`);
// науки: процент за уровень + вехи 5/10/15/20
{
  const w = g.register({ login: 'scitest', password: '123', race: 0 }).user, sc = g.castleOf(w); g.mil(sc);
  const at = (l) => { sc.sciences.war = l; return g.bonus(sc).atk; };
  assert.ok(Math.abs(at(4) - 1.08) < 1e-9 && Math.abs(at(5) - 1.10 * 1.03) < 1e-9, `${at(4)} ${at(5)}`);
  sc.sciences.eng = 20; assert.ok(Math.abs(g.bonus(sc).build - 0.4 * 0.9) < 1e-9);
  const lv = require('../src/army').SCIENCES.war.levels; assert.ok(lv.length === 20 && lv[4].mile && !lv[3].mile);
  console.log('✓ науки: Военное дело 5 ур. — атака +10% и веха +3%, Инженерия 20 ур. — стройка ×0.36');
}
// военные логи альянса: категории и доступ к отчётам союзников
{
  const L = g.register({ login: 'wlead', password: '123', race: 0 }).user, M = g.register({ login: 'wmemb', password: '123', race: 0 }).user, O = g.register({ login: 'woutsider', password: '123', race: 0 }).user;
  g.db.alliances = g.db.alliances || {}; const aid = g.db.nextId++;
  const al = g.db.alliances[aid] = { id: aid, name: 'Warlog', tag: 'WL', leader: L.id, members: [L.id, M.id], created: Date.now() }; L.alliance = M.alliance = aid;
  g.report(M.id, 'Нападение: Замок X — победа', ['Нападение на игрока'], 'battle', { side: 'att' });
  g.report(M.id, 'На ваш замок напал zz: отбились', ['Нападение от zz'], 'battle', { side: 'def' });
  g.report(M.id, 'Разведка Замок Y', ['...'], 'scout');
  g.report(M.id, 'Замечены вражеские разведчики', ['...'], 'scout');
  const v = g.allyView(L, al), cats = v.reports.map((r) => r.cat).sort().join(',');
  assert.strictEqual(cats, 'att,def,scout,sdef', cats);
  const rep = g.db.reports.find((r) => r.owner === M.id);
  assert.ok(g.canSeeReport(L, rep), 'глава видит отчёт участника');
  assert.ok(!g.canSeeReport(O, rep), 'посторонний не видит');
  console.log('✓ военные логи альянса: нападение, оборона, разведка, вражеская разведка; отчёты видны только своим');
}
// альянс: 5 мест за уровень Дипломатического центра главы, не больше 50
{
  const L = g.register({ login: 'slotlead', password: '123', race: 0 }).user, c = g.castleOf(L);
  const al = { id: 999001, name: 'Slots', tag: 'SL', leader: L.id, members: [L.id] };
  const setEmb = (lv) => { const i = c.grid[0].indexOf(13); if (i >= 0) c.levels[0][i] = lv; else { const k = c.grid[0].indexOf(-1) >= 0 ? c.grid[0].findIndex((b) => b < 0) : 0; c.grid[0][k] = 13; c.levels[0][k] = lv; } };
  setEmb(1); assert.strictEqual(g.allianceSlots(al), 5);
  setEmb(10); assert.strictEqual(g.allianceSlots(al), 50);
  al.members = Array.from({ length: 50 }, (_, i) => i + 1);
  const x = g.register({ login: 'slotx', password: '123', race: 0 }).user;
  assert.ok(/нет мест \(50\)/.test((g.joinAlliance(x, al) || {}).error || ''));
  console.log('✓ альянс: 5 мест за уровень центра, максимум 50 — 51-й не вступит');
}
// опыт генерала за бой: формула, повторные бои, лимиты за бой и за сутки
{
  const U1 = g.register({ login: 'gexp1', password: '123', race: 0 }).user, c1 = g.castleOf(U1); g.mil(c1);
  const U2 = g.register({ login: 'gexp2', password: '123', race: 0 }).user, c2 = g.castleOf(U2); g.mil(c2);
  const e = (o) => g.battleExp({ mine: c1, enemy: c2, npc: null, dLoss: 1, ...o }).exp;
  assert.strictEqual(e({ killedPop: 10000, win: true, mission: 'attack' }), 1500);
  assert.strictEqual(e({ killedPop: 10000, win: false, mission: 'attack' }), 500);
  assert.strictEqual(e({ killedPop: 10000, win: true, mission: 'raid' }), 1125);
  c1.general = g.newGeneral(c1, 100);
  const r1 = g.battleExp({ killedPop: 10000, win: true, mission: 'attack', mine: c1, enemy: c2 }), r2 = g.battleExp({ killedPop: 10000, win: true, mission: 'attack', mine: c1, enemy: c2 });
  assert.ok(r1.repeat === 0 && r2.repeat === 1 && r2.exp === r1.exp / 2, JSON.stringify([r1, r2]));
  // огромный бой: генерал 100 ур. получает не больше четверти уровня, за сутки — не больше двух уровней
  const span = g.generalNeed(100) - g.generalNeed(99);
  const a = g.addGeneralExp(c1, 10000000);
  assert.ok(a.got === Math.ceil(span * 0.15) && a.capped === 'battle' && a.level === 100, JSON.stringify(a));
  let lv = 100; for (let i = 0; i < 50; i++) lv = g.addGeneralExp(c1, 10000000).level;
  assert.ok(lv <= 101, `за сутки не больше 1 уровня, а стало ${lv}`);
  console.log(`✓ генерал: 1 опыт за 10 населения, повторный бой ×0,5, лимит за бой ${fmt(Math.ceil(span * 0.15))}, за сутки 100 → ${lv} ур. даже за 50 огромных боёв`);
}
try { fs.unlinkSync(DB); } catch {}
process.exit(0);
