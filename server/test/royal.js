'use strict';
// Баланс лояльности населения: самый активный игрок может захватить первый замок только через ~месяц.
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
const DB = path.join(os.tmpdir(), `royal-${process.pid}.json`);
const { Game, Store } = require('../src/game');
const g = new Game(new Store(DB));
const u = g.register({ login: 'royaltest', password: '123', race: 0 }).user;
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
try { fs.unlinkSync(DB); } catch {}
process.exit(0);
