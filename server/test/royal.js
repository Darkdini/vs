'use strict';
// Баланс лояльности населения: самый активный игрок может захватить первый замок только через ~месяц.
const assert = require('assert');
process.env.LUCK = '0';
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
// перевод генерала в свой другой замок подкреплением и переформирование генерала в армию
{
  const U = g.register({ login: 'gentrans', password: '123', race: 0 }).user; g.adminAddCastles(U, 1);
  const [c1, c2] = g.castlesOf(U); g.mil(c1); g.mil(c2); g.maxOut(c1); c1.general = g.newGeneral(c1, 10); c2.general = null;
  c1.units = { 200: 50 };
  // генерал в новую армию одним переформированием
  const rg = g.squadOp(c1, { op: 'regroup', from: 'castle', to: 'new', units: { 200: 10 }, general: true });
  assert.ok(rg.ok && c1.general.squad === rg.id, JSON.stringify(rg));
  const r = g.sendArmy(c1, { from: String(rg.id), mission: 'reinforce', x: c2.x, y: c2.y });
  assert.ok(!r.error && r.army.general, JSON.stringify(r.error));
  g.tickWorld(Date.now() + 1e9);
  assert.ok(!c1.general && c2.general && c2.general.level === 10 && c2.squads.some((q) => q.id === c2.general.squad && q.units[200] === 10), 'генерал переехал');
  // во второй замок, где уже есть генерал, — нельзя
  c1.general = g.newGeneral(c1, 1);
  const r2 = g.sendArmy(c1, { from: 'castle', mission: 'reinforce', x: c2.x, y: c2.y });
  assert.ok(/уже есть генерал/.test(r2.error || ''), JSON.stringify(r2));
  console.log('✓ генерал: переформирование в любую армию, перевод в свой замок подкреплением, в замке только один генерал');
}
// торговцы: 20 при Рынке, не тренируются, груз по уровню Рынка, возвращаются на Рынок
{
  const T = g.register({ login: 'mercht', password: '123', race: 0 }).user, T2 = g.register({ login: 'mercht2', password: '123', race: 0 }).user;
  const c = g.castleOf(T), c2 = g.castleOf(T2); g.maxOut(c); c.units[221] = 500;
  let m = g.merchants(c);
  assert.ok(m.total === 20 && m.free === 20 && !c.units[221], JSON.stringify(m));
  assert.ok(/не тренируются/.test(g.train(c, 221, 1).error || ''));
  c.res.wood = 100000; const r = g.sendTrade(c, { x: c2.x, y: c2.y, res: { wood: m.carry * 3 } });
  assert.ok(r.need === 3 && g.merchants(c).free === 17, JSON.stringify(r));
  assert.ok(/свободных: 17/.test(g.sendTrade(c, { x: c2.x, y: c2.y, res: { wood: m.carry * 18 } }).error || ''));
  g.tickWorld(Date.now() + 1e10); g.tickWorld(Date.now() + 2e10);
  assert.ok(g.merchants(c).free === 20 && !c.units[221], 'торговцы вернулись на Рынок');
  console.log(`✓ торговцы: 20 на Рынке, не тренируются, груз ${m.carry} на торговца, 3 ушли — 17 свободны, вернулись`);
}
// Зал Славы: бонус репутации за 1/2/3 место (Грабежи: 80/40/20)
{
  const us = ['hb1', 'hb2', 'hb3'].map((l) => g.register({ login: l, password: '123', race: 0 }).user);
  us.forEach((u, i) => g.addStat(u.id, 'loot', (3 - i) * 100000));
  g.seasonClose();
  const got = us.map((u) => (u.awards || []).find((a) => a.hall === 'loot'));
  assert.deepStrictEqual(got.map((a) => [a.place, a.bonus]), [[1, 80], [2, 40], [3, 20]]);
  assert.ok(us.every((u) => u.reputation > 10), 'репутация начислена');
  console.log(`✓ Зал Славы: бонус репутации за места — Грабежи 80/40/20, репутация ${us.map((u) => u.reputation).join('/')}`);
}
// отчёты: цвет в списке, пересылка другому игроку, удаление своих
{
  const [a, b] = ['rp1', 'rp2'].map((l) => g.register({ login: l, password: '123', race: 0 }).user);
  g.report(a.id, 'Нападение: победа', ['x'], 'battle', { type: 'battle', side: 'att', win: true });
  g.report(a.id, 'Разведка — провал', ['x'], 'scout', { type: 'scout', ok: false });
  const [r1, r2] = g.reportsOf(a.id).reverse();
  assert.deepStrictEqual([g.reportTone(r1), g.reportTone(r2)], ['win', 'lose']);
  assert.ok(g.reportForward(a, r1.id, 'RP2').msg, 'переслан');
  assert.ok(g.reportForward(a, r1.id, 'nobody').error && g.reportForward(b, r1.id, 'rp1').error, 'чужой отчёт/несуществующий игрок');
  const fw = g.reportsOf(b.id)[0];
  assert.ok(fw.from === 'rp1' && fw.owner === b.id);
  assert.strictEqual(g.reportDelete(b, [r1.id]).n, 0, 'чужой отчёт не удалить');
  assert.strictEqual(g.reportDelete(a, [r1.id, r2.id]).n, 2);
  console.log('✓ отчёты: зелёный/красный в списке, «Переслать» игроку, «Удалить» только свои');
}
// общий форум: темы создают только модераторы, отвечают все; закрытие, запрет, модератор раздела
{
  const [pl, md, ad] = ['fp1', 'fp2', 'fp3'].map((l) => g.register({ login: l, password: '123', race: 0 }).user);
  ad.admin = true;
  assert.ok(g.forumOp(pl, { op: 'topic', section: 1, title: 'Моя тема', text: 'x' }).error, 'игрок не создаёт тему');
  assert.ok(g.forumOp(md, { op: 'secmod', section: 1, login: 'fp2' }).error, 'модераторов назначает только админ');
  assert.ok(g.forumOp(ad, { op: 'secmod', section: 1, login: 'fp2' }).msg);
  assert.ok(g.forumOp(md, { op: 'topic', section: 2, title: 'Чужой раздел', text: 'x' }).error, 'модератор раздела — только в своём');
  const t = g.forumOp(md, { op: 'topic', section: 1, title: 'Помощь новичкам', text: 'Спрашивайте' }).topic;
  assert.ok(g.forumOp(pl, { op: 'post', topic: t, text: 'Как строить?' }).msg, 'игрок отвечает');
  assert.ok(g.forumOp(pl, { op: 'post', topic: t, text: 'ещё' }).error, 'антифлуд 10 с');
  assert.strictEqual(g.forumTopics(pl, 1).topics[0].replies, 1);
  g.forumOp(md, { op: 'topicop', topic: t, act: 'close' }); pl.forumLast = 0;
  assert.ok(g.forumOp(pl, { op: 'post', topic: t, text: 'закрыто?' }).error, 'в закрытую тему не пишут');
  g.forumOp(md, { op: 'topicop', topic: t, act: 'close' });
  assert.ok(g.forumOp(md, { op: 'ban', topic: t, id: pl.id, hours: 2 }).msg && g.forumOp(pl, { op: 'post', topic: t, text: 'бан' }).error, 'запрет писать');
  assert.ok(g.forumOp(pl, { op: 'ban', topic: t, id: md.id, hours: 2 }).error, 'игрок не банит');
  console.log('✓ форум: темы — только модераторы (админ назначает модератора раздела), ответы всех, антифлуд, закрытие темы, запрет писать');
}
// секретный логин админа: ADMIN_LOGIN — вход только под ним, «admin» отклоняется, в игре ник остаётся admin
{
  const adm = g.ensureAdmin('secretpass');
  process.env.ADMIN_LOGIN = 'Boss@Login';
  assert.ok(!g.login('admin', 'secretpass') && g.login('boss@login', 'secretpass') === adm && g.login(' BOSS@LOGIN ', 'secretpass') === adm);
  assert.ok(!g.login('boss@login', 'wrong'));
  delete process.env.ADMIN_LOGIN;
  assert.ok(g.login('admin', 'secretpass') === adm && adm.login === 'admin');
  console.log('✓ секретный логин админа: вход только под ADMIN_LOGIN, «admin» не пускает, ник в игре — admin');
}
// админ по умолчанию — с нуля: 1 замок без развития; прокачанный админ из старой базы сбрасывается один раз
{
  let adm = g.db.users.admin;
  assert.ok(g.castlesOf(adm).length === 1 && g.rating(g.castleOf(adm)) < 100, 'новый админ — 1 неразвитый замок');
  process.env.ADMIN_FULL = '1'; adm.freshStart = false; g.ensureAdmin();
  assert.ok(g.castlesOf(adm).length >= 20 && adm.gold >= 1000000, 'ADMIN_FULL=1 — прокачанный (тесты)');
  delete process.env.ADMIN_FULL; g.ensureAdmin();
  assert.ok(g.castlesOf(adm).length === 1 && g.rating(g.castleOf(adm)) < 100 && adm.gold === 30 && adm.admin, 'старый прокачанный админ → с нуля');
  const cid = g.castleOf(adm).id; g.ensureAdmin();
  assert.strictEqual(g.castleOf(adm).id, cid, 'сброс только один раз');
  console.log(`✓ админ с нуля: 1 замок (рейтинг ${g.rating(g.castleOf(adm))}), 30 золота; прокачанный из старой базы сбрасывается один раз`);
}
// перезапуск сервера с тем же паролем админа (ADMIN_RESET=1) не сбрасывает сессии «Запомнить меня»
{
  process.env.ADMIN_RESET = '1';
  const adm = g.ensureAdmin('samepass123'), tok = g.issueToken(adm);
  g.ensureAdmin('samepass123');
  assert.ok(g.tokenLogin('admin', tok), 'сессия админа пережила перезапуск');
  g.ensureAdmin('otherpass123');
  assert.ok(!g.tokenLogin('admin', tok) && g.login('admin', 'otherpass123'), 'смена пароля завершает сессии');
  delete process.env.ADMIN_RESET;
  console.log('✓ «Запомнить меня» у админа переживает перезапуск сервера; смена пароля завершает сессии');
}
try { fs.unlinkSync(DB); } catch {}
process.exit(0);
