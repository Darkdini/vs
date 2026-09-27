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
// Храм во втором замке ускоряет прирост лояльности населения (Храм столицы не считается)
const v = g.register({ login: 'templetest', password: '123', race: 0 }).user, T = Date.now();
v.royal = 0; v.royalAt = T; v.lastSeen = T;
g.castlesOf(v)[0].grid[0][0] = 25; g.castlesOf(v)[0].levels[0][0] = 10; // Храм в столице — не даёт
g.royalTick(v, T + 86400000); const noTemple = v.royal;
const c2 = g.createCastle(v, { x: 3, y: 3 }); v.castleIds = [...g.castlesOf(v).map((k) => k.id), c2.id];
c2.grid[0][0] = 25; c2.levels[0][0] = 10;
g.royalTick(v, T + 2 * 86400000);
assert.equal(noTemple, 50); assert.equal(v.royal - noTemple, 150);
console.log('✓ Храм 10 ур. во втором замке: прирост лояльности населения 50 → 150 в сутки');
try { fs.unlinkSync(DB); } catch {}
process.exit(0);
