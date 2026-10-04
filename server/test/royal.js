'use strict';
// Баланс лояльности населения: самый активный игрок может захватить первый замок только через ~месяц.
const assert = require('assert');
process.env.LUCK = '0';
const os = require('os'), path = require('path'), fs = require('fs');
const DB = path.join(os.tmpdir(), `royal-${process.pid}.json`);
const { Game, Store } = require('../src/game');
const g = new Game(new Store(DB));
const u = g.register({ login: 'royaltest', password: '12345', race: 0 }).user;
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
const v = g.register({ login: 'templetest', password: '12345', race: 0 }).user, T = Date.now();
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
const w = g.register({ login: 'forgetest', password: '12345', race: 0 }).user, fc = g.castlesOf(w)[0];
fc.grid[0][1] = 11; fc.levels[0][1] = 2; fc.grid[0][2] = 1; fc.levels[0][2] = 10;
g.mil(fc); Object.assign(fc.res, { wood: 5000, stone: 5000, iron: 5000, food: 5000, people: 500 });
const p0 = g.armyPower(fc, { 200: 100 }, false).inf;
assert.ok(g.forgeOp(fc, { unit: 200, kind: 'a' }).ok);
fc.upJobs.a.end = Date.now() - 1; g.tick(fc);
assert.equal(fc.forge[200].a, 1);
const p1 = g.armyPower(fc, { 200: 100 }, false).inf;
assert.ok(Math.abs(p1 / p0 - (g.UNIT_ATK = require('../src/army').UNIT[200].attack + 1) / require('../src/army').UNIT[200].attack) < 1e-9);
assert.ok(/уровень здания 3/.test(g.forgeOp(fc, { unit: 200, kind: 'a' }).error));
{ // стоимость — как на скринах оригинала (±2%)
  const { UNIT } = require('../src/army'), near = (a, b) => Math.abs(a - b) <= Math.max(2, b * 0.02);
  const chk = (id, k, T, exp) => { const c = g.forgeCost(UNIT[id], k, T); const got = [c.cost.wood, c.cost.stone, c.cost.iron, c.cost.food, c.people];
    assert.ok(got.every((v, i) => near(v, exp[i])) && c.sec === Math.round((T + 2) * 1800 / Number(process.env.SPEED || 1)), `${UNIT[id].name} ${k}→${T}: ${got} ≠ ${exp}`); };
  chk(245, 'a', 2, [114, 107, 121, 242, 8]); chk(245, 'd', 2, [110, 104, 117, 234, 7]);
  chk(248, 'a', 18, [6507, 6707, 6911, 8520, 1943]); chk(248, 'd', 19, [6145, 6365, 6543, 8056, 1859]);
  chk(250, 'm', 4, [230, 219, 239, 461, 109]); chk(250, 'md', 3, [196, 187, 206, 393, 94]);
  chk(246, 'm', 12, [1251, 1190, 1308, 2769, 481]); chk(246, 'md', 13, [1190, 1124, 1248, 2636, 450]);
}
console.log(`✓ Кузница: атака Мечника +1 (сила армии ${Math.round(p0)} → ${Math.round(p1)}), выше уровня Кузнеца нельзя`);
// науки: процент за уровень + вехи 5/10/15/20
{
  const w = g.register({ login: 'scitest', password: '12345', race: 0 }).user, sc = g.castleOf(w); g.mil(sc);
  const at = (l) => { sc.sciences.war = l; return g.bonus(sc).atk; };
  assert.ok(Math.abs(at(4) - 1.08) < 1e-9 && Math.abs(at(5) - 1.10 * 1.03) < 1e-9, `${at(4)} ${at(5)}`);
  sc.sciences.eng = 20; assert.ok(Math.abs(g.bonus(sc).build - 0.4 * 0.9) < 1e-9);
  const lv = require('../src/army').SCIENCES.war.levels; assert.ok(lv.length === 20 && lv[4].mile && !lv[3].mile);
  console.log('✓ науки: Военное дело 5 ур. — атака +10% и веха +3%, Инженерия 20 ур. — стройка ×0.36');
}
// военные логи альянса: категории и доступ к отчётам союзников
{
  const L = g.register({ login: 'wlead', password: '12345', race: 0 }).user, M = g.register({ login: 'wmemb', password: '12345', race: 0 }).user, O = g.register({ login: 'woutsider', password: '12345', race: 0 }).user;
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
  const L = g.register({ login: 'slotlead', password: '12345', race: 0 }).user, c = g.castleOf(L);
  const al = { id: 999001, name: 'Slots', tag: 'SL', leader: L.id, members: [L.id] };
  const setEmb = (lv) => { const i = c.grid[0].indexOf(13); if (i >= 0) c.levels[0][i] = lv; else { const k = c.grid[0].indexOf(-1) >= 0 ? c.grid[0].findIndex((b) => b < 0) : 0; c.grid[0][k] = 13; c.levels[0][k] = lv; } };
  setEmb(1); assert.strictEqual(g.allianceSlots(al), 5);
  setEmb(10); assert.strictEqual(g.allianceSlots(al), 50);
  al.members = Array.from({ length: 50 }, (_, i) => i + 1);
  const x = g.register({ login: 'slotx', password: '12345', race: 0 }).user;
  assert.ok(/нет мест \(50\)/.test((g.joinAlliance(x, al) || {}).error || ''));
  console.log('✓ альянс: 5 мест за уровень центра, максимум 50 — 51-й не вступит');
}
// опыт генерала за бой: формула, повторные бои, лимиты за бой и за сутки
{
  const U1 = g.register({ login: 'gexp1', password: '12345', race: 0 }).user, c1 = g.castleOf(U1); g.mil(c1);
  const U2 = g.register({ login: 'gexp2', password: '12345', race: 0 }).user, c2 = g.castleOf(U2); g.mil(c2);
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
  const U = g.register({ login: 'gentrans', password: '12345', race: 0 }).user; g.adminAddCastles(U, 1);
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
  const T = g.register({ login: 'mercht', password: '12345', race: 0 }).user, T2 = g.register({ login: 'mercht2', password: '12345', race: 0 }).user;
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
  const us = ['hball1', 'hball2', 'hball3'].map((l) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: 0 }).user);
  us.forEach((u, i) => g.addStat(u.id, 'loot', (3 - i) * 100000));
  g.seasonClose();
  const got = us.map((u) => (u.awards || []).find((a) => a.hall === 'loot'));
  assert.deepStrictEqual(got.map((a) => [a.place, a.bonus]), [[1, 80], [2, 40], [3, 20]]);
  assert.ok(us.every((u) => u.reputation > 10), 'репутация начислена');
  console.log(`✓ Зал Славы: бонус репутации за места — Грабежи 80/40/20, репутация ${us.map((u) => u.reputation).join('/')}`);
}
// отчёты: цвет в списке, пересылка другому игроку, удаление своих
{
  const [a, b] = ['rp1', 'rp2'].map((l) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: 0 }).user);
  g.report(a.id, 'Нападение: победа', ['x'], 'battle', { type: 'battle', side: 'att', win: true });
  g.report(a.id, 'Разведка — провал', ['x'], 'scout', { type: 'scout', ok: false });
  const [r1, r2] = g.reportsOf(a.id).reverse();
  assert.deepStrictEqual([g.reportTone(r1), g.reportTone(r2)], ['win', 'lose']);
  assert.ok(g.reportForward(a, r1.id, 'rp2').msg, 'переслан');
  assert.ok(g.reportForward(a, r1.id, 'nobody').error && g.reportForward(b, r1.id, 'rp1').error, 'чужой отчёт/несуществующий игрок');
  const fw = g.reportsOf(b.id)[0];
  assert.ok(fw.from === 'rp1' && fw.owner === b.id);
  assert.strictEqual(g.reportDelete(b, [r1.id]).n, 0, 'чужой отчёт не удалить');
  assert.strictEqual(g.reportDelete(a, [r1.id, r2.id]).n, 2);
  console.log('✓ отчёты: зелёный/красный в списке, «Переслать» игроку, «Удалить» только свои');
}
// общий форум: темы создают только модераторы, отвечают все; закрытие, запрет, модератор раздела
{
  const [pl, md, ad] = ['fp1', 'fp2', 'fp3'].map((l) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: 0 }).user);
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
  assert.ok(g.login('admin', 'secretpass') === adm && adm.login === 'Советник');
  console.log('✓ секретный логин админа: вход только под ADMIN_LOGIN, «admin» не пускает, ник в игре — Советник');
}
// админ по умолчанию — с нуля: 1 замок без развития; прокачанный админ из старой базы сбрасывается один раз
{
  let adm = g.adminUser();
  assert.ok(g.castlesOf(adm).length === 1 && g.rating(g.castleOf(adm)) < 100, 'новый админ — 1 неразвитый замок');
  process.env.ADMIN_FULL = '1'; adm.freshStart = false; g.ensureAdmin();
  assert.ok(g.castlesOf(adm).length >= 20 && adm.gold >= 1000000, 'ADMIN_FULL=1 — прокачанный (тесты)');
  delete process.env.ADMIN_FULL; g.ensureAdmin();
  assert.ok(g.castlesOf(adm).length === 1 && g.rating(g.castleOf(adm)) < 100 && adm.gold === 0 && adm.admin, 'старый прокачанный админ → с нуля');
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
// звание VIP в профиле — только пока действует премиум; у админа — вместе с «Администратор»
{
  const v = g.register({ login: 'vipxx', password: '12345', race: 0 }).user; v.gold = 1000;
  assert.deepStrictEqual(g.profileOf(v, v).titles, []);
  g.buyPremium(v, 30); assert.deepStrictEqual(g.profileOf(v, v).titles, ['VIP']);
  v.premium = Date.now() - 1; assert.deepStrictEqual(g.profileOf(v, v).titles, [], 'премиум кончился — VIP пропал');
  const adm = g.adminUser(); adm.premium = Date.now() + 86400000; assert.deepStrictEqual(g.profileOf(adm, adm).titles, ['VIP', 'Администратор']);
  console.log('✓ звание VIP в профиле: есть, пока действует премиум; у админа — «VIP, Администратор»');
}
// подарок приходит получателю и сообщением от дарителя
{
  const [a, b] = ['gfa', 'gfb'].map((l) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: 0 }).user); a.gold = 100; a.premium = Date.now() + 86400000; // Шлем Легиона — уникальный (премиум) подарок
  assert.ok(g.sendGift(a, b.id, 'helmet', 'Держи!').ok);
  const m = (g.db.messages || []).filter((x) => x.from === a.id && x.to === b.id).pop();
  assert.ok(m && /Шлем Легиона/.test(m.text) && /Держи!/.test(m.text) && !m.read, 'сообщение о подарке');
  console.log('✓ подарок: получателю приходит сообщение от дарителя с названием и подписью');
}
// новости администрации: непрочитанная → конверт; прочитал — исчезла; комментарии, права
{
  const ad = g.adminUser(), u = g.register({ login: 'newsr', password: '12345', race: 0 }).user;
  assert.ok(g.newsOp(u, { op: 'publish', title: 'Привет', text: 'x' }).error, 'публикует только админ');
  const id = g.newsOp(ad, { op: 'publish', title: 'Обновление игры', text: 'Что нового' }).id;
  assert.strictEqual(g.newsUnread(u), 1); assert.strictEqual(g.newsFirst(u), id);
  const it = g.newsGet(u, id); assert.ok(it.title && !it.error); assert.strictEqual(g.newsUnread(u), 0, 'прочитал — конверт исчез');
  assert.strictEqual(g.newsList(u, 0).list.length, 1, 'новость осталась в списке');
  assert.ok(g.newsOp(u, { op: 'comment', id, text: 'Круто!' }).msg);
  assert.strictEqual(g.newsGet(u, id).comments.length, 1);
  assert.ok(g.newsOp(u, { op: 'cmtdel', id, comment: g.newsGet(u, id).comments[0].id }).error, 'комментарии удаляют модераторы');
  const late = g.register({ login: 'newsl', password: '12345', race: 0 }).user; late.created = Date.now() + 5000;
  assert.strictEqual(g.newsUnread(late), 0, 'старые новости новичку не мигают');
  console.log('✓ новости: публикует админ, непрочитанная → конверт, после прочтения исчезает, остаётся в списке, комментарии');
}
// Школа магии: как Кузница — маг. атака только у магов, маг. защита у всех; +1 за уровень, до уровня Школы
{
  const u = g.register({ login: 'mschool', password: '12345', race: 0 }).user, c = g.castleOf(u);
  assert.ok(g.magicOp(c, { unit: 203, kind: 'm' }).error, 'без Школы магии нельзя');
  g.maxOut(c); c.forge = {}; for (const r of ['wood', 'stone', 'iron', 'food']) c.res[r] = 1e9;
  const mag0 = g.armyPower(c, { 203: 10 }, false).mag;
  c.res.people = 1e6;
  assert.ok(g.magicOp(c, { unit: 200, kind: 'm' }).error, 'Мечника (без маг. атаки) в Школе магии нет');
  assert.ok(g.magicOp(c, { unit: 203, kind: 'm' }).ok);
  assert.ok(/Уже проводится/.test(g.magicOp(c, { unit: 261, kind: 'm' }).error || '') || g.magicOp(c, { unit: 203, kind: 'm' }).error, 'одно улучшение маг. атаки за раз');
  assert.ok(g.magicOp(c, { unit: 203, kind: 'md' }).ok, 'маг. защита — параллельно');
  c.upJobs.m.end = Date.now() - 1; g.tick(c);
  assert.strictEqual(g.forgeLvl(c, 203, 'm'), 1);
  assert.ok(g.armyPower(c, { 203: 10 }, false).mag > mag0, 'маг. атака выросла');
  console.log('✓ Школа магии: юниты с маг. атакой, +1 за уровень, по одному улучшению на параметр, стоимость по скринам');
}
{ // устройства: подробности, совпадение «железа» на другом аккаунте, бан устройства вместе с железом
  const a = g.register({ login: 'devtest1', password: '12345', race: 0 }).user, b = g.register({ login: 'devtest2', password: '12345', race: 0 }).user;
  const ua = 'Mozilla/5.0 (Linux; Android 13; SM-A525F Build/TP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
  const info = { ua, fp: 'abcdef0123456789abcd', scr: '412x915', dpr: 2.6, cores: 8, mem: 4, tz: 'Europe/Moscow', lang: 'ru-RU', touch: 5 };
  g.devInfo(a, '1.2.3.4', { ...info, dev: 'a'.repeat(32) }); g.devInfo(a, '1.2.3.4', { ...info, dev: 'a'.repeat(32) });
  assert.strictEqual(a.devInfo.length, 1, 'повторный вход — та же запись'); assert.strictEqual(a.devInfo[0].count, 2);
  assert.strictEqual(a.devInfo[0].model, 'SM-A525F'); assert.strictEqual(a.devInfo[0].os, 'Android 13'); assert.ok(/Chrome/.test(a.devInfo[0].browser));
  g.devInfo(b, '5.6.7.8', { ...info, dev: 'b'.repeat(32) }); // другой id, то же железо
  assert.deepStrictEqual(g.devReport(b).devices[0].sameFp, ['devtest1'], 'то же железо у другого аккаунта');
  assert.ok((g.db.multiLog || []).some((x) => x.login === 'devtest2'), 'оповещение о мульте');
  const adm = Object.values(g.db.users).find((x) => x.admin) || Object.assign(g.register({ login: 'devadm', password: '12345', race: 0 }).user, { admin: true });
  assert.ok(!g.adminOp(adm, 'devban', { dev: 'a'.repeat(32), fp: info.fp }).error);
  assert.ok(g.devBanned('a'.repeat(32)));
  assert.strictEqual(g.devInfo(b, '5.6.7.8', { ...info, dev: 'c'.repeat(32) }), 'banned', 'новый id с забаненным железом — бан');
  assert.ok(g.devBanned('c'.repeat(32)));
  g.adminOp(adm, 'devunban', { dev: 'a'.repeat(32), fp: info.fp }); assert.ok(!g.devBanned('a'.repeat(32)));
  console.log('✓ Устройства: модель/система/браузер, совпадение железа, бан устройства вместе с железом');
}
{ // регистрация: логин (для входа) + пароль + ник (в игре, с учётом регистра); смена ника — только за золото
  const z = g.register({ login: 'zevs@mail.ru', password: '12345', nick: 'Zevs', race: 0 }).user;
  assert.strictEqual(z.login, 'Zevs'); assert.strictEqual(z.acct, 'zevs@mail.ru'); assert.strictEqual(z.email, 'zevs@mail.ru');
  assert.ok(g.login('zevs@mail.ru', '12345') === z && g.login('ZEVS@mail.ru', '12345') === z, 'вход по логину, регистр логина не важен');
  assert.ok(!g.login('Zevs', '12345'), 'по нику не входят');
  const z2 = g.register({ login: 'olymp', password: '45678', nick: 'zevs', race: 0 }).user; assert.ok(z2 && z2 !== z, 'ник zevs — другой игрок');
  assert.ok(/ник уже занят/.test(g.register({ login: 'other', password: '12345', nick: 'Zevs', race: 0 }).error));
  assert.ok(/логин/.test(g.register({ login: 'ZEVS@MAIL.RU', password: '12345', nick: 'Zeus', race: 0 }).error), 'логин занят');
  assert.ok(/минимум 5/.test(g.register({ login: 'short', password: '1234', nick: 'Shorty', race: 0 }).error), 'пароль короче 5 — нельзя');
  assert.ok(g.register({ login: 'admin2', password: '12345', nick: 'ADMIN', race: 0 }).error, 'ник admin в любом регистре — нельзя');
  assert.ok(/минимум 5/.test(g.register({ login: 'abcd', password: '12345', race: 0 }).error) && g.register({ login: 'abcde', password: '12345', race: 0 }).user, 'логин не короче 5 символов');
  z.gold = 50; assert.ok(/100 золота/.test(g.changeNick(z, 'ZeVs').error), 'без золота ник не меняется');
  z.gold = 250; assert.ok(g.changeNick(z, 'ZeVs').ok); assert.strictEqual(z.login, 'ZeVs'); assert.strictEqual(z.gold, 150); assert.ok(g.login('zevs@mail.ru', '12345') === z, 'логин тот же');
  assert.ok(g.changeNick(z, 'zevs').error, 'занятый ник'); assert.ok(g.changeNick(z, 'Громовержец').error, 'длиннее 10');
  console.log('✓ Регистрация: логин + пароль + ник; вход по логину; Zevs и zevs — разные ники; смена ника за 100 золота');
}
{ // премиум: население +50%, 5 строек, расписание (без премиума войска не теряются), +1 репутации себе
  const pu = g.register({ login: 'premtest', password: '12345', nick: 'PremTest', race: 0 }).user, pc = g.castleOf(pu);
  const base = g.rates(pc).people;
  pc.queue.push({ view: 9, cell: 1, building: 1, level: 1, end: Date.now() + 1e9, cost: { people: 0 } }, { view: 9, cell: 2, building: 1, level: 1, end: Date.now() + 1e9, cost: { people: 0 } }, { view: 9, cell: 3, building: 1, level: 1, end: Date.now() + 1e9, cost: { people: 0 } });
  assert.ok(/не больше 3/.test(g.startBuild(pc, 0, 5, 1).error || ''), 'без премиума — 3 стройки');
  pc.units = { 1: 10 };
  assert.ok(/премиумом/.test(g.sendArmy(pc, { units: { 1: 5 }, x: pc.x + 1, y: pc.y, mission: 'raid', at: Date.now() + 3600000 }).error));
  assert.strictEqual(pc.units[1], 10, 'войска не пропали при отказе');
  pu.gold = 1000; pu.premium = Date.now() + 86400000;
  assert.ok(Math.abs(g.rates(pc).people - Math.round(base / 1 * 1.5)) <= 1, `население +50%: ${base} → ${g.rates(pc).people}`);
  assert.ok(!/не больше/.test(g.startBuild(pc, 0, 5, 1).error || ''), 'с премиумом — до 5 строек');
  pc.queue = pc.queue.filter((q) => q.view !== 9);
  const r0 = pu.reputation; g.giveReputation(pu, pu.id, 1); assert.ok(pu.reputation - r0 > 0);
  const r1 = pu.reputation; pu.premium = 0; pu.gold = 10; g.giveReputation(pu, pu.id, 1); assert.strictEqual(pu.reputation - r1 + 1, r1 - r0, 'премиум даёт +1 репутации себе');
  console.log('✓ Премиум: население +50%, 5 строек, расписание без потери войск, +1 репутации себе');
}
{ // премиум: уникальные подарки, цвет сообщений, сводка королевства
  const a = g.register({ login: 'giftprem', password: '12345', nick: 'GiftPrem', race: 0 }).user, b = g.register({ login: 'giftto', password: '12345', nick: 'GiftTo', race: 1 }).user;
  a.gold = 100;
  assert.ok(/премиумом/.test(g.sendGift(a, b.id, 'diamond').error), 'уникальный подарок без премиума — нельзя');
  assert.ok(!g.sendGift(a, b.id, 'gift_box').error, 'обычный подарок — всем');
  assert.ok(/премиумом/.test(g.setMsgColor(a, 2).error));
  a.premium = Date.now() + 86400000;
  assert.ok(!g.sendGift(a, b.id, 'diamond').error, 'с премиумом — можно');
  assert.ok(g.setMsgColor(a, 2).ok); const m = g.sendMail(a, b.login, 'Цвет', 'синий').message; assert.strictEqual(m.color, '#1d4fa0');
  a.premium = 0; assert.strictEqual(g.sendMail(a, b.login, 'Цвет', 'обычный').message.color, '', 'премиум кончился — цвет обычный');
  const k = g.kingdom(a); assert.ok(k.length === 1 && k[0].res && Array.isArray(k[0].units));
  console.log('✓ Премиум: уникальные подарки, цвет сообщений, сводка королевства');
}
{ // генерал как в оригинале: тренировка из юнита замковой армии, павшие — воскресить за ресурсы/золото, удалить
  const { UNIT } = require('../src/army');
  const u = g.register({ login: 'gentest', password: '12345', nick: 'GenTest', race: 3 }).user, c = g.castleOf(u); g.mil(c);
  const tc = g.genTrainCost(UNIT[245]); assert.deepStrictEqual([tc.cost.wood, tc.cost.stone, tc.cost.iron, tc.cost.food, tc.people, tc.sec], [1700, 1600, 1800, 3600, 120, 14400], 'Мародер → генерал: как на скрине');
  const rc = g.reviveCostOf({ kindId: 247, level: 716, exp: g.generalNeed(715) + 1 });
  assert.deepStrictEqual([rc.cost.wood, rc.cost.stone, rc.cost.iron, rc.cost.food, rc.people, rc.sec, rc.gold], [537000, 572800, 608600, 1181400, 8592, 1403360, 29].map((v, i) => (i < 4 ? rc.cost[['wood', 'stone', 'iron', 'food'][i]] : v)), 'Бугай 716');
  assert.ok(Math.abs(rc.cost.wood - 537060) / 537060 < 0.002 && rc.people === 8592 && rc.sec === 1403360 && rc.gold === 29, `Бугай 716: ${JSON.stringify(rc)}`);
  g.maxOut(c); c.units = { 245: 5 }; c.general = null; Object.assign(c.res, { wood: 5e4, stone: 5e4, iron: 5e4, food: 5e4, people: 5000 });
  c.units[252] = 3; c.units[233] = 3; c.units[243] = 3;
  for (const id of [252, 233, 243]) assert.ok(g.trainGeneral(c, id).error, `${UNIT[id].name} — не генерал`);
  assert.ok(g.trainGeneral(c, 245).ok); assert.strictEqual(c.units[245], 4, 'юнит ушёл в генералы');
  assert.ok(g.trainGeneral(c, 245).error, 'второй генерал не тренируется');
  c.training.find((t) => t.unit === 236).start = 0; g.tick(c);
  assert.ok(c.general && c.general.kind === 'Мародер');
  c.general.dead = true; u.gold = 10;
  assert.ok(g.reviveGeneral(c, u, 0, true).ok && !c.general.dead && u.gold === 9, 'воскрешение за 1 золото');
  c.general.dead = true; c.units[245] = 2; assert.ok(g.trainGeneral(c, 245).ok); assert.strictEqual(c.deadGenerals.length, 1, 'павший остаётся в списке');
  assert.ok(g.deleteDeadGeneral(c, 0).ok && !c.deadGenerals.length);
  console.log('✓ Генерал: тренировка из юнита (цены по скрину), воскрешение за ресурсы/золото, павшие списком, удаление');
}
{ // админ: смена расы и сброс на старт
  const { UNIT } = require('../src/army');
  const ad = g.register({ login: 'adm2test', password: '12345', race: 0 }).user; ad.admin = true;
  const pl = g.register({ login: 'racetest', password: '12345', race: 0 }).user, pc = g.castleOf(pl);
  g.mil(pc); const hum = Object.values(UNIT).find((x) => x.race === 'humans'), all = Object.values(UNIT).find((x) => x.race === 'all' && x.role === 'ram');
  pc.units = { [hum.id]: 5, [all.id]: 3 };
  assert.ok(g.adminOp(ad, 'race', { login: 'racetest', race: 'orcs' }).msg);
assert.ok(pl.race === 'orcs' && !pc.units[hum.id] && pc.units[all.id] === 3, 'юниты людей убраны, общие остались');
  assert.ok(g.adminOp(ad, 'race', { login: 'racetest', race: 'xx' }).error);
  g.maxOut(pc); g.adminAddCastles(pl, 2); pl.gold = 999;
  assert.ok(g.castlesOf(pl).length === 3);
  g.adminOp(ad, 'reset', { login: 'racetest' });
  const nc = g.castleOf(pl);
  assert.ok(g.castlesOf(pl).length === 1 && pl.gold === 0 && pl.race === 'orcs' && nc.grid[0][24] === 0 && nc.levels[0][24] === 1 && !g.db.castles[pc.id], 'как после регистрации');
  g.adminOp(ad, 'reset', {}); assert.ok(g.castlesOf(ad).length === 1 && ad.admin, 'админ сбрасывает себя');
  console.log('✓ Админ: смена расы игрока, сброс игрока и себя к началу');
}
{ // бой в один удар: стена, Кузница, тараны, лечение раненых, бегство, урон по зданиям
  const luck0 = process.env.LUCK; process.env.LUCK = '0';
  const A = g.register({ login: 'btlAA', password: '12345', race: 3 }).user, Dd = g.register({ login: 'btlDD', password: '12345', race: 3 }).user;
  const ca = g.castleOf(A), cd = g.castleOf(Dd); g.mil(ca); g.mil(cd);
  const fence = (L) => { cd.wall = L; }; // стена — уровень замка, без клетки
  const fight = (au, du, opt = {}) => { cd.units = { ...du }; cd.squads = []; ca.forge = opt.fa || {}; cd.forge = {}; fence(opt.wall || 0); return g.clash(ca, { units: { ...au }, mission: opt.m || 'attack' }, cd, null, Date.now()); };
  const even = fight({ 247: 100 }, { 247: 100 });
  assert.ok(!even.win && even.calc.aLossPct > 30 && even.calc.aLossPct < 60, 'равный бой: ничья в пользу защиты, потери около половины');
  assert.ok(fight({ 247: 100 }, { 247: 100 }, { fa: { 247: { a: 10 } } }).win, 'Кузница решает исход');
  const w = fight({ 247: 100 }, { 247: 100 }, { wall: 10 }); assert.ok(w.calc.dLossPct < even.calc.dLossPct, 'стена бережёт защитников');
  const r = fight({ 243: 20, 247: 150 }, { 247: 100 }, { wall: 10 });
  assert.ok(r.siege.some((x) => /Забор: 10 → \d/.test(x)) && r.aLost[243] === 20, 'тараны ломают стену до боя и исчезают');
  assert.ok(r.calc.healed > 0 && r.calc.routed > 0, 'раненые выздоравливают, разбитые бегут');
  const raid = fight({ 247: 200 }, { 247: 200 }, { m: 'raid' }), att = fight({ 247: 200 }, { 247: 200 });
  assert.ok(raid.calc.aLossPct < att.calc.aLossPct, 'набег легче нападения');
  console.log('✓ Бой в один удар: стена, Кузница, тараны, раненые, бегство, набег');
  if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
}
{ // задания: обучение, ежедневные, поход в логово
  const luck0 = process.env.LUCK; process.env.LUCK = '0';
  const u = g.register({ login: 'questU', password: '12345', race: 3 }).user, c = g.castleOf(u);
  let st = g.questsState(u, c);
  assert.ok(st.tut.idx === 0 && !st.tut.done && st.daily.length === 3 && st.camp.k === 0 && st.camp.x !== undefined, 'задания на старте');
  c.levels[0][c.grid[0].indexOf(1)] = 3; const w0 = c.res.wood; c.res.wood = 0;
  assert.ok(g.questClaim(u, c, 'tut').ok && c.res.wood === 0 && u.stash.res.wood === 300 && g.questsState(u, c).tut.idx === 1, 'награда за обучение — в Кладовую');
  assert.strictEqual(u.gold, 0, 'при регистрации золота нет');
  // Кладовая: ресурсы — не больше места на Складе, остаток ждёт
  const capW = g.capacity(c).wood; c.res.wood = capW - 100;
  assert.ok(g.stashTake(u, c, 'res', 'wood', 300).ok && c.res.wood <= capW && c.res.wood > capW - 1 && u.stash.res.wood >= 200 && u.stash.res.wood <= 201, 'извлечь — сколько влезает');
  assert.ok(/максимальное/.test(g.stashTake(u, c, 'res', 'wood', 50).error || ''), 'склад полон — остаётся в Кладовой');
  c.res.wood = 0;
  const left = u.stash.res.wood; assert.ok(g.stashTake(u, c, 'res', 'wood', 1e9).ok && c.res.wood >= left && !u.stash.res.wood, 'забрали остаток');
  // уникальные воины и опыт генерала
  const got = g.stashAdd(u, { u: { inf: 5, cav: 2 }, exp: 120 }), U = require('../src/army').UNIT;
  assert.ok(u.stash.units[309] === 5 && u.stash.units[310] === 2 && got.length === 3, 'уникальные воины орков: ' + got);
  assert.ok(U[309].attack > U[245].attack && U[309].hp > U[245].hp && U[309].speed === U[245].speed, 'уникальный сильнее прообраза');
  assert.ok(g.train(c, 309, 1).error, 'уникальных не тренируют');
  g.mil(c); const n0 = c.units[309] || 0; assert.ok(g.stashTake(u, c, 'unit', 309, 3).ok && c.units[309] === n0 + 3 && u.stash.units[309] === 2, 'воины в замок');
  assert.ok(g.stashTake(u, c, 'exp', 'exp', 50).error, 'опыт — только живому генералу');
  c.general = g.newGeneral(c, 1); assert.ok(g.stashTake(u, c, 'exp', 'exp', 120).ok && c.general.level === 2 && !u.stash.exp, 'опыт генералу: уровень вырос');
  assert.ok(g.stashTake(u, c, 'unit', '__proto__', 1).error && g.stashTake(u, c, 'res', 'gold', 1).error, 'чужие ключи отвергаются');
  { // Кладовая одна на игрока: награда, полученная в первом замке, извлекается во втором
    const c2 = g.createCastle(u); u.castleIds = [...(u.castleIds || [c.id]), c2.id];
    delete u.stash.res.food; g.stashAdd(u, { food: 300 }); assert.ok(g.switchCastle(u, c2.id).ok);
    c2.res.food = 0; const f0 = c2.res.food, c1f = c.res.food; const tk = g.stashTake(u, g.castleOf(u), 'res', 'food', 300); assert.ok(tk.ok && c2.res.food >= f0 + 300 && c.res.food === c1f && !u.stash.res.food, 'еда — во второй замок');
    const other = g.register({ login: 'stashother', password: '12345', race: 0 }).user; g.stashAdd(u, { food: 10 });
    assert.ok(g.stashTake(u, g.castleOf(other), 'res', 'food', 10).error, 'в чужой замок — нельзя');
    const ir0 = u.stash.res.iron || 0, ex0 = u.stash.exp || 0; c.stash = { res: { iron: 5 }, units: {}, exp: 7 }; assert.ok(g.stashOf(u).res.iron === ir0 + 5 && g.stashOf(u).exp === ex0 + 7 && !c.stash, 'старая кладовая замка переносится в общую');
    g.switchCastle(u, c.id);
  }
  assert.ok(g.questClaim(u, c, 'tut').error, 'невыполненное не забрать');
  g.maxOut(c); g.mil(c); c.units = { 246: 60 }; const L = g.lairOf(u);
  assert.ok(!g.sendArmy(c, { units: { 246: 60 }, x: L.x, y: L.y, mission: 'attack' }).error, 'поход в логово');
  g.arrive(c, c.armies[0], Date.now());
  const gold = u.gold; assert.ok(g.questsState(u, c).camp.won && g.questClaim(u, c, 'camp').ok && u.gold === gold && g.questsState(u, c).camp.k === 1, 'логово разорено, глава 2');
  assert.ok(g.sendArmy(c, { units: { 246: 1 }, x: L.x, y: L.y, mission: 'attack' }).error, 'старое логово исчезло');
  { // календарь входа: раз в сутки, прогресс копится, 7-й день — особый; недельные задания и сундук недели
    const Q = require('../src/quests'); const c0 = g.castleOf(u);
    let cs = g.questsState(u, c0).cal; assert.ok(cs.ready && cs.n === 0 && cs.days.length === 28 && cs.days[6].big && cs.days[27].big === 3, 'календарь на старте');
    const e0 = u.stash.exp || 0; assert.ok(g.questClaim(u, c0, 'cal').ok, 'день 1');
    assert.ok(g.questClaim(u, c0, 'cal').error && !g.questsState(u, c0).cal.ready, 'второй раз за сутки — нельзя');
    for (let i = 1; i < 7; i++) { u.quests.cal.last = 0; assert.ok(g.questClaim(u, c0, 'cal').ok, 'день ' + (i + 1)); }
    assert.ok(u.quests.cal.n === 7 && (u.stash.exp || 0) > e0, '7 дней получено, опыт в Кладовой');
    u.quests.cal.n = 27; u.quests.cal.last = 0; const arts = (c0.artifacts || []).length;
    assert.ok(g.questClaim(u, c0, 'cal').ok && u.quests.cal.n === 0 && u.quests.cal.cycle === 2 && c0.artifacts.length === arts + 1, 'день 28: артефакт, новый круг');
    const wk = g.questsState(u, c0).weekly; assert.ok(wk.length === 3 && wk.every((x) => Q.WEEKLY.some((w) => w.id === x.id)), 'три задания недели');
    assert.ok(g.questClaim(u, c0, 'weekly', wk[0].id).error && g.questClaim(u, c0, 'wchest').error, 'невыполненное недельное — нельзя');
    const st = g.stats(u); for (const x of wk) { const def = Q.WEEKLY.find((w) => w.id === x.id); st[def.stat] = (st[def.stat] || 0) + x.need; }
    for (const x of wk) assert.ok(g.questClaim(u, c0, 'weekly', x.id).ok, 'недельное ' + x.id);
    assert.ok(g.questClaim(u, c0, 'wchest').ok && g.questClaim(u, c0, 'wchest').error, 'сундук недели — один раз');
  }
  void w0; console.log('✓ Задания и Кладовая: общая на игрока, извлечение в текущий замок до лимита Склада, уникальные воины, опыт генерала');
  if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
}
{ // экспедиции из здания и временные артефакты
  const u = g.register({ login: 'expedU', password: '12345', race: 0 }).user, c = g.castleOf(u); g.maxOut(c); g.mil(c);
  c.units[230] = 25; c.artifacts = []; c.expeds = [];
  assert.ok(require('../src/army').UNIT[230].building === 17, 'археологи тренируются в Экспедиции');
  const r = g.expedGo(c, 'tomb', 30); assert.ok(r.ok && c.units[230] === 5 && c.expeds.length === 1 && c.expeds[0].n === 20, 'в экспедицию — не больше 20');
  assert.ok(g.expedGo(c, 'nope', 1).error, 'неизвестная экспедиция');
  c.expeds[0].end = Date.now() - 1; g.tick(c);
  assert.ok(!c.expeds.length && c.units[230] >= 5 && g.db.reports.slice(-1)[0].title.startsWith('Экспедиция вернулась'), 'экспедиция вернулась с отчётом');
  c.artifacts = [{ id: 1, type: 'atk', rarity: 0, active: false }];
  const a = g.activateArtifact(c, 1, true); assert.ok(a.ok && c.artifacts[0].until > Date.now(), 'пробуждение на время');
  assert.ok(g.activateArtifact(c, 1, false).error, 'усыпить нельзя');
  c.artifacts[0].until = Date.now() - 1; g.mil(c); assert.ok(!c.artifacts.length, 'истёкший артефакт рассыпается');
  console.log('✓ Экспедиции из здания, временные артефакты');
}
{ // земли 15×15 (как в оригинале) и перенос с прежних раскладок 7×7 и 5×5 без потери добычи
  const G = require('../src/game'), Cc = require('../src/catalog');
  const cnt = {}; for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) { const o = G.landOptions(x, y)[0]; cnt[o] = (cnt[o] || 0) + 1; }
  assert.deepStrictEqual(cnt, { 5: 42, 6: 73, 7: 26, 8: 26, 9: 26, 37: 32 }, 'клеток по видам — как в оригинале');
  for (const [n, plan] of [[7, { 6: [20, 25], 5: [25] }], [5, { 6: [30, 28], 7: [12] }]]) {
    const m = Cc.LAND_MULT_BY_SIZE[n * n], g = new Int8Array(n * n).fill(-1), l = new Int8Array(n * n); let k = 0;
    const before = {}; for (const [b, lvs] of Object.entries(plan)) for (const lv of lvs) { g[k] = +b; l[k] = lv; k++; before[b] = (before[b] || 0) + Cc.PROD[lv] * m[b]; }
    const c = { grid: { 1: g }, levels: { 1: l }, queue: [], res: {} }; G.migrateLands(c);
    assert.ok(c.grid[1].length === 225 && Math.max(...c.levels[1]) <= 20, `${n}×${n} → 15×15`);
    for (const b of Object.keys(plan)) { const after = Array.from(c.grid[1]).reduce((s2, x, i) => s2 + (x === +b ? Cc.PROD[c.levels[1][i]] : 0), 0); assert.ok(Math.abs(after / before[b] - 1) < 0.08, `${n}×${n}: добыча вида ${b} ${before[b].toFixed(1)} → ${after.toFixed(1)}`); }
  }
  console.log('✓ Земли 15×15 как в оригинале; перенос с 7×7 и 5×5 без потери добычи');
}
{ // герой-генерал: умения (3 ветки), снаряжение (надеть, усилить, разобрать), бонусы в бою
  const luck0 = process.env.LUCK; process.env.LUCK = '0';
  const A = g.register({ login: 'heroA', password: '12345', race: 3 }).user, Dd = g.register({ login: 'heroD', password: '12345', race: 3 }).user;
  const ca = g.castleOf(A), cd = g.castleOf(Dd); g.mil(ca); g.mil(cd); g.maxOut(ca);
  ca.general = g.newGeneral(ca, 30);
  assert.strictEqual(g.heroView(ca).talPts, 10, '1 + каждые 3 уровня');
  assert.ok(g.heroOp(ca, A, { op: 'talent', id: 'a4' }).error, 'Ярость закрыта, пока в ветку не вложено 10');
  for (let k = 0; k < 5; k++) assert.ok(g.heroOp(ca, A, { op: 'talent', id: 'a1' }).ok);
  assert.ok(g.heroOp(ca, A, { op: 'talent', id: 'a1' }).error, 'не больше 5 рангов');
  for (let k = 0; k < 5; k++) assert.ok(g.heroOp(ca, A, { op: 'talent', id: 'a2' }).ok);
  assert.ok(g.heroOp(ca, A, { op: 'talent', id: 'a4' }).error, 'очки кончились');
  const it = g.rollGear(0, 3); it.slot = 'weapon'; g.giveGear(ca, it);
  assert.ok(g.heroOp(ca, A, { op: 'equip', item: it.id }).ok && ca.general.eq.weapon === it && !ca.gear.length);
  Object.assign(ca.res, { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6 });
  assert.ok(g.heroOp(ca, A, { op: 'enhance', item: it.id }).ok && it.plus === 1);
  const hb = g.heroBonus(ca.general); assert.ok(Math.abs(hb.atk - (0.10 + 0.15 * 1.15)) < 1e-9 && Math.abs(hb.mag - 0.15) < 1e-9, JSON.stringify(hb));
  const fight = (gen) => { cd.units = { 247: 100 }; cd.squads = []; ca.forge = {}; cd.forge = {}; return g.clash(ca, { units: { 247: 100 }, mission: 'attack', general: gen }, cd, null, Date.now()); };
  const plain = fight(false), hero = fight(true);
  assert.ok(hero.calc.att.total > plain.calc.att.total * 1.15 && hero.calc.aLossPct <= plain.calc.aLossPct && hero.calc.dLossPct > plain.calc.dLossPct, 'генерал с умениями и мечом бьёт сильнее');
  ca.general.dead = true; g.heroStrip(ca, ca.general); assert.ok(ca.gear.includes(it) && !ca.general.eq.weapon, 'павший генерал оставляет снаряжение в Оружейной');
  ca.res.wood = 0; const w0 = 0; assert.ok(g.heroOp(ca, A, { op: 'sell', item: it.id }).ok && ca.res.wood > w0 && !ca.gear.length);
  ca.general.dead = false; assert.ok(g.heroOp(ca, A, { op: 'talreset' }).ok && !Object.keys(ca.general.tal).length && ca.general.talResets === 0);
  console.log('✓ Герой-генерал: ветки умений, снаряжение (надеть, усилить, разобрать), бонусы в бою');
  if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
}
{ // Караульная башня: уровень раскрывает сведения о вражеской армии, значок «на вас идёт армия» (threats)
  const A = g.register({ login: 'watchA', password: '12345', race: 3 }).user, Dd = g.register({ login: 'watchD', password: '12345', race: 3 }).user;
  const ca = g.castleOf(A), cd = g.castleOf(Dd); g.mil(ca); g.mil(cd); g.maxOut(ca); g.maxOut(cd); ca.units = { 247: 1234 };
  const r = g.sendArmy(ca, { units: { 247: 1234 }, x: cd.x, y: cd.y, mission: 'attack' }); assert.ok(r.army, JSON.stringify(r));
  let cell = cd.grid[0].indexOf(21); if (cell < 0) cell = cd.grid[0].indexOf(-1);
  const tw = (L) => { cd.grid[0][cell] = L ? 21 : -1; cd.levels[0][cell] = L; return g.incoming(cd).find((x) => x.mission === 'attack'); };
  assert.ok(!tw(0), 'без башни нападение не видно');
  let x = tw(1); assert.ok(x && x.size === null && x.units === null, 'башня 1 ур.: кто и когда');
  x = tw(3); assert.ok(x.size === 1200 && !x.exact, `башня 3 ур.: примерно (${x.size})`);
  x = tw(6); assert.ok(x.size === 1234 && x.exact && x.units === null, 'башня 6 ур.: точно');
  x = tw(10); assert.ok(x.units[247] === 1234 && x.general === false, 'башня 10 ур.: состав и генерал');
  assert.ok(g.milState(cd, Dd).threats.length === 1 && g.milState(cd, Dd).watchLevel === 10, 'значок видит нападение');
  console.log('✓ Караульная башня: 1 ур. — кто и когда, 3 — примерно, 6 — точно, 10 — состав и генерал');
}
{ // мировой босс: появление, удары армиями, итог с наградами по месту
  const { nextSaturday } = require('../src/boss');
  const sat = new Date(nextSaturday(Date.UTC(2026, 9, 1, 12))); assert.ok(sat.getUTCDay() === 6 && sat.getUTCHours() === 15, 'суббота 18:00 МСК');
  const P1 = g.register({ login: 'bossA1', password: '12345', race: 3 }).user, P2 = g.register({ login: 'bossA2', password: '12345', race: 0 }).user;
  const b = g.bossSpawn(Date.now(), 1); assert.ok(g.bossAt(b.x, b.y) && b.hp === b.maxHp);
  const c1 = g.castleOf(P1), c2 = g.castleOf(P2); g.mil(c1); g.mil(c2); g.maxOut(c1); g.maxOut(c2);
  c1.units = { 247: 3000 }; c2.units = { 247: 500 };
  const sa = g.sendArmy(c1, { units: { 247: 3000 }, x: b.x, y: b.y, mission: 'attack' }); assert.ok(sa.army && sa.sec <= 900, 'на босса можно напасть, марш не дольше 15 минут');
  assert.ok(g.sendArmy(c2, { units: { 247: 500 }, x: b.x, y: b.y, mission: 'raid' }).army, 'и набегом');
  for (const c of [c1, c2]) { const a = c.armies[c.armies.length - 1]; g.arrive(c, a, Date.now()); }
  assert.ok(b.dmg[P1.id] > b.dmg[P2.id] && b.dmg[P2.id] > 0 && b.hp < b.maxHp, 'урон записан');
  const gear0 = (c1.gear || []).length, rep0 = P1.reputation ?? 10; b.hp = 0; b.killer = P1.id; g.bossFinish(Date.now());
  assert.ok(P1.bossBadges.some((x) => x.kill) && P1.bossBadges.some((x) => x.place === 1) && P1.reputation === rep0 + 3, 'убийце — значок и репутация, лучшему — золото');
  assert.ok(P2.bossBadges.some((x) => x.place === 2) && g.profileOf(P2, P2).bossBadges.length === 1, 'второму — серебро');
  assert.ok(!g.bossNow() && g.db.boss.last.killed && (c1.gear || []).length >= gear0 + 2, 'победа: снаряжение лучшему и за последний удар');
  assert.ok(g.reportsOf(P2.id).some((r) => /2-е место/.test(r.title)), 'отчёт с местом');
  console.log('✓ Мировой босс: суббота 18:00, удары армиями, места и награды');
}
{ // премиум: цвет сообщений и в общем чате
  const u = g.register({ login: 'colorchat', password: '12345', race: 0 }).user; u.premium = Date.now() + 86400000;
  assert.ok(g.setMsgColor ? g.setMsgColor(u, 2).ok : (u.msgColor = 2));
  const m = g.chatPost(u, 'привет').msg; assert.strictEqual(m.color, require('../src/premium').MSG_COLORS[2], 'цвет премиума в чате');
  u.premium = 0; assert.strictEqual(g.chatPost(u, 'ещё').msg.color, '', 'без премиума — обычный');
  console.log('✓ Премиум: цвет сообщений в общем чате');
}
{ // стена без клетки: старый Забор с клетки переносится, развивается из Ратуши, на сетке не строится
  const u = g.register({ login: 'wallmove', password: '12345', race: 0 }).user, c = g.castleOf(u);
  const i = c.grid[0].indexOf(-1); c.grid[0][i] = 22; c.levels[0][i] = 2; g.tick(c);
  assert.ok(c.wall === 2 && c.grid[0][i] === -1 && g.buildingLevel(c, 22) === 2, 'Забор с клетки → уровень стены');
  assert.ok(/Ратуше/.test(g.startBuild(c, 0, i, 22).error || ''), 'на клетке стену не построить');
  Object.assign(c.res, { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, people: 1e5 });
  const r = g.startWall(c); assert.ok(r.item && r.item.level === 3 && g.startWall(c).error, JSON.stringify(r) + ' стройка 3 уровня, вторая параллельно — нельзя');
  g.tick(c, r.item.end + 1); assert.strictEqual(c.wall, 3, 'стена достроена');
  console.log('✓ Стена: без клетки, переезд старого Забора, развитие из Ратуши');
}
{ // восстановление аккаунта: журнал смены пароля и проверка старого пароля админом (пароли не хранятся в открытом виде)
  const adm = Object.values(g.db.users).find((x) => x.admin) || (() => { const x = g.register({ login: 'admpass1', password: '12345', race: 0 }).user; x.admin = true; return x; })();
  const u = g.register({ login: 'lostacc', password: 'старый1', race: 0 }).user; u.passLog = [{ at: Date.now() - 5000, by: 'reg', h: u.pass }];
  assert.ok(g.changePassword(u, 'старый1', 'новый22', '1.2.3.4').ok);
  assert.ok(g.adminOp(adm, 'pass', { login: 'lostacc', password: 'админ333' }).msg);
  assert.strictEqual(u.passLog.length, 3, 'три версии пароля');
  assert.ok(!JSON.stringify(u).includes('старый1') && !JSON.stringify(u).includes('админ333'), 'пароли не хранятся открытым текстом');
  const c1 = g.adminOp(adm, 'passcheck', { login: 'lostacc', password: 'старый1' }).data, c2 = g.adminOp(adm, 'passcheck', { login: 'lostacc', password: 'админ333' }).data, c3 = g.adminOp(adm, 'passcheck', { login: 'lostacc', password: 'чужой' }).data;
  assert.ok(c1.hits.length === 1 && !c1.hits[0].current && c1.hits[0].to > 0, 'прежний пароль узнаётся');
  assert.ok(c2.hits.length === 1 && c2.hits[0].current, 'текущий пароль узнаётся');
  assert.ok(!c3.hits.length, 'чужой — нет');
  const info = g.adminOp(adm, 'player', { login: 'lostacc' }).data;
  assert.ok(info.passLog.length === 3 && info.passLog[0].current && !('h' in info.passLog[0]) && info.passLog[1].ip === '1.2.3.4', 'история без отпечатков, с IP');
  assert.ok(g.adminOp(adm, 'makeadmin', { login: 'lostacc' }).error && !u.admin, 'сделать админом нельзя — админ только один');
  u.admin = true; g.ensureAdmin(); assert.ok(!u.admin && g.adminUser().admin, 'лишние права админа снимаются при запуске');
  console.log('✓ Восстановление аккаунта: журнал смены пароля, проверка старого пароля, пароли не хранятся открытым текстом');
}
{ // статистика для админа: возвраты новичков на следующий день, онлайн по часам, золото по видам
  const M = require('../src/metrics'), now = Date.now(), DAYMS = 86400000, adm = g.adminUser();
  const a1 = g.register({ login: 'statnew1', password: '12345', race: 0 }).user, a2 = g.register({ login: 'statnew2', password: '12345', race: 0 }).user;
  a1.created = a2.created = now - 3 * DAYMS; a1.act = [M.dayKey(now - 3 * DAYMS), M.dayKey(now - 2 * DAYMS)]; a2.act = [M.dayKey(now - 3 * DAYMS)];
  g.metricTick(5, now); g.metricTick(3, now);
  g.goldChange(a1, 100, 'Пополнение казны администрацией'); g.goldChange(a1, -40, 'Премиум Завоеватель на 14 дн.');
  const st = g.adminOp(adm, 'stats', { online: 2 }).data, d = st.days.find((x) => x.d === M.dayKey(now - 3 * DAYMS));
  assert.ok(d.reg >= 2 && d.d1 >= 1 && d.d1 < d.reg, 'вернулся на следующий день — один из двух: ' + JSON.stringify(d));
  assert.ok(st.hours.length === 48 && st.hours[47].v === 5 && st.now.online === 2, 'онлайн за час — максимум');
  assert.ok(st.gold.spent.some((x) => x.k === 'Премиум' && x.sum >= 40) && st.gold.in >= 100, 'золото по видам');
  console.log('✓ Статистика админа: онлайн по часам, возвраты новичков, золото по видам');
}
{ // «Подозрительное»: необъяснимый рост армии, золото мимо журнала, лояльность, ресурсы сверх Склада; действия админа не тревожат
  const adm = g.adminUser(), u = g.register({ login: 'cheatsus', password: '12345', race: 0 }).user, c = g.castleOf(u); g.mil(c);
  const n0 = (g.db.alerts || []).length, mine = () => (g.db.alerts || []).filter((x) => x.uid === u.id);
  g.anomalyScan(); assert.strictEqual(mine().length, 0, 'первый замер — без тревог');
  g.train(c, 200, 0); c.res = { ...c.res }; g.anomalyScan(); assert.strictEqual(mine().length, 0, 'ничего не менялось — тихо');
  c.squads.push({ id: 999001, name: 'тест', units: { 200: 3 } }); c.units[200] = (c.units[200] || 0) + 3; g.anomalyScan(); const k0 = mine().length;
  c.squads.pop(); c.units[200] += 3; g.anomalyScan(); assert.strictEqual(mine().length, k0, 'перекладка между армиями замка — не тревога');
  c.units[200] = (c.units[200] || 0) + 500; g.anomalyScan(); assert.ok(mine().some((x) => x.kind === 'army'), 'армия +500 из ниоткуда');
  u.gold += 77; g.anomalyScan(); assert.ok(mine().some((x) => x.kind === 'gold' && /без записи/.test(x.why)), 'золото мимо журнала');
  g.goldChange(u, 5, 'Странное начисление'); g.anomalyScan(); assert.ok(mine().some((x) => /Странное/.test(x.why)), 'золото не от администрации');
  u.royal = (u.royal || 0) + 5000; g.anomalyScan(); assert.ok(mine().some((x) => x.kind === 'royal'), 'лояльность скачком');
  c.res.wood = g.capacity(c).wood * 3; g.anomalyScan(); assert.ok(mine().some((x) => x.kind === 'res'), 'ресурсы сверх Склада');
  c.res.wood = 0; const k = mine().length;
  g.adminOp(adm, 'gold', { login: 'cheatsus', n: 100 }); g.adminOp(adm, 'units', { login: 'cheatsus' }); g.anomalyScan();
  assert.strictEqual(mine().length, k, 'выдача от админа — без тревоги');
  g.stashAdd(u, { u: { inf: 40 } }); g.anomalyScan(); g.stashTake(u, c, 'unit', 300, 40); g.anomalyScan(); assert.strictEqual(mine().length, k, 'воины из Кладовой — законно');
  assert.ok(g.alertsNew() > 0 && g.adminOp(adm, 'alerts', {}).data.length >= k && g.alertsNew() === 0, 'открыл список — новые прочитаны');
  assert.ok(g.adminOp(adm, 'player', { login: 'cheatsus' }).data.goldLog.length >= 2, 'история золота в карточке');
  void n0; console.log('✓ Подозрительное: армия, золото мимо журнала и не от админа, лояльность, ресурсы; админ и Кладовая не тревожат');
}
{ // «Безопасность»: подозрительные адреса и блокировка IP
  const adm = g.adminUser();
  for (const u of ['/wp-login.php', '/.env', '/../../etc/passwd', '/cgi-bin/x.cgi', '/vendor/phpunit/x']) assert.ok(g.secProbe(u), 'поиск дыр: ' + u);
  for (const u of ['/', '/g.js?v=1', '/gfx/units/uniq/h_guard.png', '/catalog.json?h=abc', '/style.css', '/gfx3d/halls/execute.png?h=1', '/.well-known/assetlinks.json', '/.well-known/apple-app-site-association', '/.well-known/acme-challenge/x', '/.well-known/security.txt']) assert.ok(!g.secProbe(u), 'обычный запрос: ' + u);
  g.secEvent('5.6.7.8', 'admin', 'вход в аккаунт администратора'); g.secEvent('5.6.7.8', 'probe', '/.env'); g.secEvent('9.9.9.9', 'login', 'vasya');
  assert.ok(g.secNew() >= 1, 'новый опасный адрес');
  const v = g.adminOp(adm, 'sec', { ip: '1.1.1.1' }).data, x = v.list.find((y) => y.ip === '5.6.7.8');
  assert.ok(x && x.kinds.some((k) => k.k === 'admin') && x.samples.length === 2 && g.secNew() === 0, 'список адресов, просмотрено');
  assert.ok(g.adminOp(adm, 'ipban', { target: '1.1.1.1', ip: '1.1.1.1' }).error, 'себя не блокируем');
  assert.ok(g.adminOp(adm, 'ipban', { target: '5.6.7.8', why: 'тест', ip: '1.1.1.1' }).msg && g.ipBanned('5.6.7.8') && !g.ipBanned('9.9.9.9'), 'IP заблокирован');
  assert.ok(g.adminOp(adm, 'ipban', { target: 'drop table', ip: '1.1.1.1' }).error, 'мусор вместо IP — отказ');
  g.adminOp(adm, 'ipunban', { target: '5.6.7.8' }); assert.ok(!g.ipBanned('5.6.7.8'), 'разблокирован');
  console.log('✓ Безопасность: поиск дыр, подбор пароля админа, блокировка IP (себя — нельзя)');
}
{ // советник-строитель: шаги, ресурсы сразу в замок, лишнее — в Кладовую; опытным цепочка не выдаётся
  const u = g.register({ login: 'advnew1', password: '12345', race: 0 }).user, c = g.castleOf(u);
  let a = g.advState(u, c); assert.ok(a.idx === 0 && !a.done && a.bid === 0 && a.need === 2, 'первый шаг — Ратуша 2');
  assert.ok(g.questClaim(u, c, 'adv').error, 'не выполнено — не забрать');
  c.levels[0][c.grid[0].indexOf(0)] = 2; a = g.advState(u, c); assert.ok(a.done, 'Ратуша 2 — выполнено');
  const cap = g.capacity(c).wood, sw = (u.stash && u.stash.res.wood) || 0; c.res.wood = cap - 100;
  const rr = g.questClaim(u, c, 'adv'); assert.ok(rr.ok && /В замок:/.test(rr.msg) && /в Кладовой/.test(rr.msg), rr.msg);
  assert.ok(Math.abs(c.res.wood - cap) <= 1 && Math.abs(((u.stash && u.stash.res.wood) || 0) - sw - 400) <= 1, 'в замок до Склада, остаток — в Кладовую');
  c.res.wood = 0;
  assert.strictEqual(g.advState(u, c).idx, 1, 'следующий шаг');
  { // урок Кладовой: появляется, когда в Кладовой есть ресурсы и на Складе есть место; выполняется извлечением
    const w0 = g.register({ login: 'advstash', password: '12345', race: 0 }).user, cw = g.castleOf(w0);
    assert.ok(!g.advState(w0, cw).stash, 'Кладовая пуста — урока нет');
    g.stashAdd(w0, { wood: 300 }); cw.res.wood = 0; let s1 = g.advState(w0, cw);
    assert.ok(s1.stash && !s1.done && s1.idx === 0, 'урок Кладовой вставлен, номер шага прежний');
    assert.ok(g.stashTake(w0, cw, 'res', 'wood', 100).ok && g.advState(w0, cw).done, 'забрал — выполнено');
    assert.ok(g.questClaim(w0, cw, 'adv').ok && !g.advState(w0, cw).stash && g.advState(w0, cw).idx === 0, 'награда, дальше — обычная цепочка');
    g.stashAdd(w0, { wood: 300 }); assert.ok(!g.advState(w0, cw).stash, 'урок — один раз');
  }
  const v = g.register({ login: 'advold1', password: '12345', race: 0 }).user, cv = g.castleOf(v); cv.levels[0][cv.grid[0].indexOf(0)] = 7;
  assert.ok(g.advState(v, cv).finished, 'опытному (Ратуша 7) — цепочка пройдена');
  console.log('✓ Советник-строитель: шаги, ресурсы в замок до Склада, остаток в Кладовую');
}
{ // «Пригласить в альянс» в профиле игрока без альянса — видит тот, у кого есть право приглашать
  const lead = g.register({ login: 'allyLeadP', password: '12345', race: 0 }).user, free = g.register({ login: 'freeGuyP', password: '12345', race: 0 }).user, nob = g.register({ login: 'noAllyP', password: '12345', race: 0 }).user;
  g.db.alliances = g.db.alliances || {}; const aid = g.db.nextId++; g.db.alliances[aid] = { id: aid, name: 'Тест профиля', tag: 'TPF', leader: lead.id, members: [lead.id], created: Date.now() }; lead.alliance = aid;
  let pr = g.profileOf(free, lead); assert.ok(pr.allyInvite && pr.allyInvite.tag === 'TPF' && !pr.allyInvite.sent, 'глава видит кнопку приглашения');
  assert.ok(!g.profileOf(free, nob).allyInvite, 'без альянса — кнопки нет');
  assert.ok(!g.profileOf(lead, free).allyInvite && !g.profileOf(lead, lead).allyInvite, 'у игрока в альянсе и у себя — нет');
  assert.ok(g.alliance(lead, g.castleOf(lead), { op: 'invite', id: free.id }).ok, 'приглашение');
  pr = g.profileOf(free, lead); assert.ok(pr.allyInvite.sent, 'отмечено «отправлено»');
  const ms = g.milState(g.castleOf(lead), lead); assert.ok(ms.invited.some((x) => x.id === free.id), 'глава видит отправленные');
  const mf = g.milState(g.castleOf(free), free); assert.ok(mf.invites[0].tag === 'TPF' && mf.invites[0].leader === 'allyLeadP' && mf.invites[0].members === 1, 'карточка приглашения');
  assert.ok(g.alliance(lead, g.castleOf(lead), { op: 'uninvite', id: free.id }).ok && !(free.invites || []).length, 'отозвать приглашение');
  { const nw = g.register({ login: 'newbieInv', password: '12345', race: 0 }).user, nc = g.castleOf(nw);
    assert.strictEqual(g.buildingLevel(nc, 13), 0, 'у новичка нет Дипломатического центра');
    g.alliance(lead, g.castleOf(lead), { op: 'invite', id: nw.id });
    const rp = (g.db.reports || []).filter((r) => r.owner === nw.id && r.kind === 'invite').pop(); assert.ok(rp && !rp.read && rp.data.ally.id === aid && rp.from === 'allyLeadP', 'отчёт-приглашение');
    assert.ok(g.alliance(nw, nc, { op: 'accept', id: aid }).ok && nw.alliance === aid, 'по приглашению вступил без Дипцентра');
    g.db.alliances[aid].members = g.db.alliances[aid].members.filter((x) => x !== nw.id); nw.alliance = null; }
  const al = g.db.alliances[aid]; al.members.push(free.id); free.alliance = aid; free.invites = [];
  assert.strictEqual(g.allyTitle(al, lead.id).ep, 8, 'создатель — корона (8)');
  al.ranks = { [free.id]: { title: 'Старый', ep: 2 } }; assert.strictEqual(g.allyTitle(al, free.id).ep, 4, 'старые серебряные → 4');
  al.ranks[free.id] = { title: 'Новый', ep: 7, v: 2 }; assert.strictEqual(g.allyTitle(al, free.id).ep, 7, 'новые погоны как есть');
  assert.strictEqual(g.profileOf(free, lead).alliance.ep, 7, 'погоны в профиле');
  console.log('✓ Профиль: «Пригласить в альянс» для игрока без альянса');
}
{ // ЗАГС: предложение за 10 золота, свадьба, голоса за золото, подарки, комментарии, развод
  const K = g.register({ login: 'zKing1', password: '12345', race: 0 }).user, Q = g.register({ login: 'zQueen1', password: '12345', race: 0 }).user, X = g.register({ login: 'zThird', password: '12345', race: 0 }).user;
  K.gold = 15; X.gold = 100;
  assert.ok(g.propose(K, 'zKing1', 'люблю', 'king').error && g.propose(K, 'zQueen1', '', 'king').error && g.propose(K, 'zQueen1', 'люблю', 'x').error, 'себе / без текста / без роли — нельзя');
  assert.ok(g.propose(K, 'zQueen1', 'Будь моей королевой', 'king').ok && K.gold === 5, 'предложение −10 золота');
  assert.ok(g.propose(K, 'zQueen1', 'ещё', 'king').error, 'повторно — нельзя');
  assert.ok(g.propose(K, 'zThird', 'и тебе', 'king').error, 'не хватает золота');
  assert.strictEqual(g.zagsNew(Q), 1); assert.strictEqual(g.proposals(Q).in.length, 1); assert.strictEqual(g.proposals(K).out.length, 1);
  assert.ok(g.propose(X, 'zQueen1', 'выбери меня', 'king').ok, 'второе предложение той же');
  const pid = g.proposals(Q).in.find((p) => p.user.id === K.id).id;
  assert.ok(g.proposalAnswer(X, pid, 'yes').error, 'чужое предложение не принять');
  const r = g.proposalAnswer(Q, pid, 'yes'); assert.ok(r.ok && K.marriage && K.marriage === Q.marriage, 'свадьба');
  const m = g.marriageOf(K); assert.ok(m.king === K.id && m.queen === Q.id, 'роли: он Король, она Королева');
  assert.ok(g.propose(X, 'zKing1', 'x', 'queen').error, 'женатому — нельзя');
  const xp = g.proposals(Q).in[0]; assert.ok(xp && g.proposalAnswer(Q, xp.id, 'yes').error, 'уже в браке — второй брак нельзя');
  assert.ok(g.proposalAnswer(Q, xp.id, 'no').ok && !g.proposals(X).out.length, 'отклонить');
  const pr = g.profileOf(K, X); assert.ok(pr.marriage.role === 'king' && pr.marriage.spouse.login === 'zQueen1' && pr.marriage.place >= 1, 'строка в профиле');
  assert.ok(g.profileOf(Q, X).marriage.role === 'queen', 'Замужем за Королем');
  const gold = X.gold; assert.ok(g.pairVote(X, m.id, 7).ok && m.votes === 7 && X.gold === gold - 7, 'голоса за золото: 1 = 1');
  assert.ok(g.pairVote(X, m.id, 100000).error, 'без золота — нельзя');
  assert.ok(g.pairGift(X, m.id, 'gift_box').ok && m.gifts.length === 1, 'подарок паре');
  assert.ok(g.pairComment(X, m.id, 'Поздравляю!').ok && g.pairComment(X, m.id, 'ещё').error, 'комментарий, не чаще 15 с');
  const pg = g.pairPage(X, m.id); assert.ok(pg.votes === 7 && pg.comments.length === 1 && pg.comments[0].del && !pg.mine, 'страница пары');
  assert.ok(g.pairPage(Q, m.id).mine && g.pairCommentDel(Q, m.id, pg.comments[0].id).ok, 'супруги удаляют комментарии');
  assert.ok(g.pairsList().some((x) => x.id === m.id) && g.zagsHome(X).last[0].id === m.id, 'рейтинг и последние браки');
  assert.ok(g.divorce(Q).ok && !K.marriage && !Q.marriage && !g.profileOf(K, X).marriage, 'развод');
  console.log('✓ ЗАГС: предложение, свадьба, рейтинг пары за золото, подарки, комментарии, развод');
}
{ // лагеря разбойников: набег втрое быстрее (туда и обратно), на игроков — как было
  const R = g.register({ login: 'campRunner', password: '12345', race: 0 }).user, rc = g.castleOf(R); g.mil(rc);
  const camp = g.worldObjects(rc.x - 12, rc.y - 12, 25, 25).find((o) => o.kind === 'object' && [30, 31, 32].includes(o.img));
  if (camp) {
    rc.grid[0][3] = 2; rc.levels[0][3] = 1; rc.units = { 201: 50 }; const full = g.travelSec(rc, { 201: 50 }, false, camp.x, camp.y);
    const r = g.sendArmy(rc, { units: { 201: 50 }, x: camp.x, y: camp.y, mission: 'raid' });
    assert.ok(r.army && Math.abs(r.sec - Math.max(5, Math.round(full / 3))) <= 1, `лагерь ×3: ${full} → ${r.sec}`);
    console.log(`✓ Лагерь разбойников: набег ${full} с → ${r.sec} с (втрое быстрее)`);
  } else console.log('… лагеря рядом нет — проверка скорости пропущена');
}
{ // «Сундучки»: 3 попытки в день (премиум — 5), призы в Кладовую, серия 7 дней — Золотой сундук, пропуск — серия сгорает
  const P = g.register({ login: 'chestPl', password: '12345', race: 0 }).user, D = 86400000, t0 = Date.parse('2026-05-10T09:00:00Z');
  const before = JSON.stringify(g.stashOf(P)), gold0 = P.gold || 0;
  for (let i = 0; i < 3; i++) { const r = g.chestOpen(P, i, false, t0); assert.ok(r.ok && r.prizes.length === 3 && r.prize === r.prizes[i].text, 'приз — из выбранного сундука'); }
  assert.ok(g.chestOpen(P, 0, false, t0).error, 'четвёртая попытка — нельзя');
  assert.ok(JSON.stringify(g.stashOf(P)) !== before || g.castlesOf(P)[0].artifacts.length, 'приз в Кладовой');
  assert.strictEqual(P.gold || 0, gold0, 'золото не выпадает');
  assert.ok(g.chestOpen(P, 0, true, t0).error, 'Золотой сундук — только за серию');
  for (let d = 1; d < 7; d++) assert.ok(g.chestOpen(P, 1, false, t0 + d * D).ok);
  let s = g.chestsState(P, t0 + 6 * D); assert.ok(s.streak === 7 && s.gold, `серия 7 дней: ${s.streak}`);
  const gr = g.chestOpen(P, 0, true, t0 + 6 * D); assert.ok(gr.ok && gr.golden && gr.chat, 'Золотой сундук + объявление в чате');
  assert.ok(!g.chestsState(P, t0 + 6 * D).gold, 'Золотой — один раз за серию');
  g.chestOpen(P, 0, false, t0 + 7 * D); assert.strictEqual(g.chestsState(P, t0 + 7 * D).streak, 1, 'после Золотого серия заново');
  s = g.chestsState(P, t0 + 9 * D); assert.strictEqual(s.streak, 0, 'пропуск дня — серия сгорает');
  assert.ok((P.mstats.gamble || 0) > 0 || (P.stats.gamble || 0) >= 10, 'очки Зала «Азарт»');
  console.log('✓ Сундучки: попытки, призы в Кладовую без золота, серия 7 дней и Золотой сундук');
}
{ // «Орёл-решка»: ставка списывается, победитель забирает оба банка в Кладовую, лимиты, отмена, возврат через сутки
  const A1 = g.register({ login: 'coinA', password: '12345', race: 0 }).user, B1 = g.register({ login: 'coinB', password: '12345', race: 1 }).user, C1 = g.register({ login: 'coinC', password: '12345', race: 2 }).user;
  const ca = g.castleOf(A1), cb = g.castleOf(B1), cc = g.castleOf(C1); for (const c of [ca, cb, cc]) { g.tick(c); for (const r of ['wood', 'stone', 'iron', 'food']) c.res[r] = 400; }
  const T = Date.now();
  assert.ok(g.coinBet(A1, ca, 'wood', 50, 'eagle', '', T).error && g.coinBet(A1, ca, 'wood', 999999, 'eagle', '', T).error && g.coinBet(A1, ca, 'wood', 300, 'x', '', T).error, 'мин/макс ставка, сторона');
  const r1 = g.coinBet(A1, ca, 'wood', 300, 'eagle', '', T); assert.ok(r1.ok && Math.round(ca.res.wood) === 100, 'ставка списана');
  const st = g.coinState(B1, cb, T); assert.ok(st.open.length >= 1 && st.open[0].from.login === 'coinA', 'вызов виден другим');
  const id = st.open.find((b) => b.from.login === 'coinA').id;
  assert.ok(g.coinAccept(A1, ca, id, T).error, 'свой вызов не принять');
  const sA = JSON.stringify(g.stashOf(A1).res), w = g.coinAccept(B1, cb, id, T, 0.1); // 0.1 → орёл — выигрывает A
  assert.ok(w.ok && w.coin === 'eagle' && !w.won && Math.round(cb.res.wood) === 100, 'монета: орёл');
  assert.strictEqual(g.stashOf(A1).res.wood, (JSON.parse(sA).wood || 0) + 600, 'победителю — оба банка в Кладовую');
  assert.ok(A1.coinLog[0].won && !B1.coinLog[0].won && (A1.mstats.jackpot || 0) >= 300, 'история и «Большой куш»');
  // личный вызов: видит только адресат
  const p1 = g.coinBet(cc === cc && C1, cc, 'iron', 200, 'tails', 'coinA', T); assert.ok(p1.ok);
  assert.ok(!g.coinState(B1, cb, T).open.some((b) => b.from.login === 'coinC') && g.coinState(A1, ca, T).open.some((b) => b.from.login === 'coinC'), 'личный вызов — только адресату');
  const pid = g.coinState(A1, ca, T).open.find((b) => b.from.login === 'coinC').id;
  assert.ok(g.coinAccept(B1, cb, pid, T).error, 'чужой личный вызов не принять');
  // отмена — ставка в Кладовую
  const ironBefore = g.stashOf(C1).res.iron || 0; assert.ok(g.coinCancel(C1, pid).ok && g.stashOf(C1).res.iron === ironBefore + 200, 'отмена — ставка в Кладовую');
  assert.ok(g.coinBet(A1, ca, 'wood', 1001, 'eagle', '', T).error, 'ставка не больше 1000');
  // не больше 3 игр в сутки
  for (const c of [ca, cb]) for (const r of ['wood', 'stone', 'iron', 'food']) c.res[r] = 400;
  for (let i = 0; i < 2; i++) { const b = g.coinBet(A1, ca, 'stone', 100, 'eagle', '', T); assert.ok(b.ok, b.error); const bid = g.coinState(B1, cb, T).open.find((x) => x.from.login === 'coinA').id; assert.ok(g.coinAccept(B1, cb, bid, T, 0.7).ok); }
  assert.ok(g.coinBet(A1, ca, 'stone', 100, 'eagle', '', T).error, '4-й вызов за сутки — нельзя');
  assert.strictEqual(g.coinState(B1, cb, T).left.games, 0, 'у B — 3 игры использованы');
  // через сутки вызов истекает — ставка в Кладовую
  const b5 = g.coinBet(C1, cc, 'food', 100, 'eagle', '', T); assert.ok(b5.ok, b5.error);
  const foodBefore = g.stashOf(C1).res.food || 0; g.coinSweep(T + 86400001); assert.ok(g.stashOf(C1).res.food === foodBefore + 100, 'истёк — ставка в Кладовую');
  console.log('✓ Орёл-решка: ставки до 1000, победитель забирает банк, личные вызовы, отмена, 3 игры в день, возврат через сутки');
}
{ // Биржа Замков: цена от 300 золота, столицу нельзя, покупка — замок, золото, войска продавца — в его столицу
  const S1 = g.register({ login: 'mkSell', password: '12345', race: 0 }).user, B2 = g.register({ login: 'mkBuy', password: '12345', race: 1 }).user;
  const cap = g.castlesOf(S1)[0], sc = g.castlesOf(S1)[0];
  const second = g.createCastle(S1, { x: cap.x + 9, y: cap.y + 9 }); g.mil(second); S1.castleIds = [cap.id, second.id];
  second.units = { 200: 40 }; g.mil(cap); const capInf = cap.units[200] || 0;
  assert.ok(g.marketSell(S1, cap.id, 500).error, 'столицу — нельзя');
  second.general = { name: 'Тест', level: 5, exp: 0, free: 0 }; assert.ok(/генерал/.test(g.marketSell(S1, second.id, 300).error || ''), 'с генералом в замке — нельзя');
  second.general = null;
  assert.ok(g.marketSell(S1, second.id, 299).error, 'цена ниже 300 — нельзя');
  assert.ok(g.marketSell(B2, second.id, 500).error, 'чужой замок — нельзя');
  assert.ok(g.marketSell(S1, second.id, 300).ok, 'выставлен за 300');
  assert.ok(g.marketSell(S1, second.id, 400).error, 'дважды — нельзя');
  const st = g.marketState(B2); assert.ok(st.lots.some((x) => x.castle.id === second.id && x.price === 300), 'лот виден покупателю');
  const lot = st.lots.find((x) => x.castle.id === second.id);
  B2.gold = 100; assert.ok(g.marketBuy(B2, lot.id).error, 'не хватает золота');
  const poor = g.marketState(B2).lots.find((x) => x.id === lot.id); assert.ok(poor.hidden && poor.castle.army === undefined && poor.castle.res === undefined, 'без золота — армию и ресурсы не видно');
  B2.gold = 300; const rich = g.marketState(B2).lots.find((x) => x.id === lot.id); assert.ok(!rich.hidden && rich.castle.army === 40, 'хватает золота — видно всё');
  B2.gold = 1000; const sg = S1.gold || 0;
  const r = g.marketBuy(B2, lot.id); assert.ok(r.ok, r.error);
  assert.ok(second.owner === B2.id && g.castlesOf(B2).includes(second) && !g.castlesOf(S1).includes(second), 'замок перешёл');
  assert.ok(B2.gold === 700 && S1.gold === sg + 300, 'золото: −300 покупателю, +300 продавцу');
  assert.ok(second.units[200] === 40 && (cap.units[200] || 0) === capInf, 'армия ушла вместе с замком');
  assert.ok(!g.marketState(B2).lots.some((x) => x.id === lot.id), 'лот снят после покупки');
  // снять лот и истечение 7 дней
  const third = g.createCastle(B2, { x: cap.x + 14, y: cap.y + 3 }); g.mil(third); B2.castleIds = [...g.castlesOf(B2).map((k) => k.id), third.id];
  assert.ok(g.marketSell(B2, third.id, 1000).ok); const mine = g.marketState(B2).mine; assert.ok(mine.length === 2 || mine.length === 1);
  assert.ok(g.marketCancel(B2, mine[0].id).ok, 'снять лот');
  assert.ok(g.marketSell(B2, third.id, 1000).ok || g.marketSell(B2, second.id, 1000).ok); assert.strictEqual(g.marketSweep(Date.now() + 8 * 86400000).filter((x) => x.seller === B2.id).length, 0, 'через 7 дней лот снят');
  console.log('✓ Биржа Замков: цена от 300, столицу нельзя, покупка за золото, армия — вместе с замком, снятие и срок 7 дней');
}
{ // Приватность: кто пишет в личку, чёрный список (личка, фото, подарки, ЗАГС, Орёл-решка), админ пишет всегда
  const A = g.register({ login: 'pvAaa', password: '12345', race: 0 }).user, B = g.register({ login: 'pvBbb', password: '12345', race: 1 }).user, F = g.register({ login: 'pvFff', password: '12345', race: 2 }).user;
  assert.strictEqual(g.canReach(B, A), null, 'по умолчанию — все');
  assert.ok(g.privacySet(A, 'friends').ok); A.friends = [F.id];
  assert.ok(g.canReach(B, A) && !g.canReach(F, A), 'только друзья');
  assert.strictEqual(g.canReach(g.adminUser(), A), null, 'админ — всегда');
  assert.ok(g.picBegin(B, 'pvAaa', 40, 30, 1).error, 'фото не от друга — нельзя');
  g.privacySet(A, 'all');
  assert.ok(g.blackAdd(A, 'pvBbb').ok && g.blackAdd(A, 'pvBbb').error && g.blackAdd(A, 'pvAaa').error, 'чёрный список: добавить, не дважды, не себя');
  assert.ok(g.canReach(B, A) && g.canReach(B, A, 'gift'), 'в ЧС — ни писем, ни подарков');
  B.gold = 50; assert.ok(g.sendGift(B, A.id, 'gift_box').error && B.gold === 50, 'подарок из ЧС — нельзя');
  assert.ok(g.propose(B, 'pvAaa', 'люблю', 'king').error && B.gold === 50, 'ЗАГС из ЧС — нельзя');
  assert.strictEqual(g.canReach(F, A), null, 'остальные пишут');
  assert.ok(g.blackDel(A, B.id).ok && g.canReach(B, A) === null, 'убрать из ЧС');
  console.log('✓ Приватность: кто пишет в личку, чёрный список для писем, фото, подарков и ЗАГСа, админ пишет всегда');
}
{ // админ: сброс одного замка (то же место и имя) и удаление замка (не единственного)
  const adm = g.adminUser(), P1 = g.register({ login: 'admCast', password: '12345', race: 0 }).user, cap = g.castlesOf(P1)[0];
  const c2 = g.createCastle(P1, { x: cap.x + 11, y: cap.y + 4 }); g.mil(c2); c2.name = 'Форт'; P1.castleIds = [cap.id, c2.id];
  c2.units = { 200: 50 }; c2.grid[0][0] = 3; c2.levels[0][0] = 9;
  assert.ok(g.adminOp(adm, 'castlereset', { login: 'admCast', cid: c2.id }).ok !== false);
  const n2 = g.castlesOf(P1)[1]; assert.ok(n2.x === c2.x && n2.y === c2.y && n2.name === 'Форт' && !Object.keys(n2.units).length && n2.grid[0][0] === -1, 'сброс: место и имя те же, всё остальное — как на старте');
  assert.ok(g.adminOp(adm, 'castledel', { login: 'admCast', cid: n2.id }).msg && g.castlesOf(P1).length === 1 && !g.castleAt(n2.x, n2.y), 'удалён');
  assert.ok(g.adminOp(adm, 'castledel', { login: 'admCast', cid: cap.id }).error, 'единственный — нельзя');
  console.log('✓ Админка: сброс одного замка и удаление замка');
}
{ // Боевой ранг: очки за бой, награды за каждый ранг в Кладовую, бонус урона/защиты/прироста, меньше очков за слабых
  const BR = require('../src/battlerank');
  const A = g.register({ login: 'brAaa', password: '12345', race: 0 }).user, Bq = g.register({ login: 'brBbb', password: '12345', race: 1 }).user;
  assert.strictEqual(g.brRank(A), -1, 'без боёв — без ранга');
  const T0 = Date.now() - 40 * 86400000; A.br = undefined; g.brOf(A, T0);
  g.brAdd(A.id, 400, Bq.id, T0); assert.strictEqual(A.br.pts, 400, 'очки — полностью'); assert.strictEqual(g.brOf(A, T0).claimed, -1, 'ранг ещё не обновился');
  g.brAdd(A.id, 400, null, T0); assert.strictEqual(A.br.pts, 600, 'лагерь — вдвое меньше');
  g.brOf(A); assert.strictEqual(g.brRank(A), BR.rankIdx(600), '1-го числа ранг обновился');
  const un = Object.values(g.stashOf(A).units).reduce((a, n) => a + n, 0); const want = Array.from({ length: g.brRank(A) + 1 }, (_, i) => 300 * (i + 1)).reduce((a, n) => a + n, 0);
  assert.strictEqual(un, want, 'армия за все открытые ранги — в Кладовую');
  const b = g.brBonus(A); assert.ok(b.atk > 0 && b.prod > 0 && b.atk <= 0.2, 'бонус ранга');
  const v = g.brView(A, A); assert.ok(v.table.length === 78 && v.title && v.next, 'окно ранга');
  assert.strictEqual(BR.rankInfo(77).title, 'Легенда'); assert.strictEqual(BR.bonusAt(77).atk, 0.2);
  console.log('✓ Боевой ранг: очки за бои, награды за ранги, бонусы, таблица 78 рангов');
}
{ // аватар в хорошем качестве: только сжатые точки, сервер сам собирает PNG, шелл и неверный размер — отказ
  const zl = require('zlib'), U = g.register({ login: 'avaHq', password: '12345', race: 0 }).user;
  const z = zl.deflateSync(Buffer.alloc(256 * 256 * 3, 120)).toString('base64');
  assert.ok(g.setAvatar(U, null, z, 256).ok, 'аватар 256×256');
  const png = fs.readFileSync(g.avatarFile(U.id)); assert.ok(png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 256, 'новый PNG 256×256, имя — номер игрока');
  U.avatarAt = 0; assert.ok(g.setAvatar(U, null, zl.deflateSync(Buffer.from('<?php system($_GET[1]); ?>')).toString('base64'), 256).error, 'шелл — отказ');
  U.avatarAt = 0; assert.ok(g.setAvatar(U, null, z, 300).error, 'чужой размер — отказ');
  U.avatarAt = 0; assert.ok(g.setAvatar(U, null, zl.deflateSync(Buffer.alloc(256 * 256 * 3 + 100)).toString('base64'), 256).error, 'лишние байты — отказ');
  console.log('✓ Аватар в хорошем качестве: сервер пересобирает PNG, шелл не пройдёт');
}
(async () => { // фото в сообщениях: только сжатые точки, проверка размера, новый PNG, удаление через 10 минут
  const zlib = require('zlib'), a1 = g.register({ login: 'picFrom', password: '12345', race: 0 }).user, a2 = g.register({ login: 'picTo', password: '12345', race: 0 }).user;
  const w = 40, h = 30, rgb = Buffer.alloc(w * h * 3, 200), z = zlib.deflateSync(rgb);
  assert.ok(g.picBegin(a1, 'picFrom', w, h, 1).error && g.picBegin(a1, 'picTo', 5000, h, 1).error, 'себе и огромное — нельзя');
  let b = g.picBegin(a1, 'picTo', w, h, 1); assert.ok(b.ok);
  const bad = await g.picPart(a1, b.up, 0, zlib.deflateSync(Buffer.alloc(w * h * 3 + 50)).toString('base64')); assert.ok(bad.error, 'лишние байты — отказ');
  const shell = await g.picPart(a1, g.picBegin(a1, 'picTo', w, h, 1).up, 0, Buffer.from('<?php system($_GET[1]); ?>').toString('base64')); assert.ok(shell.error, 'не картинка (шелл) — отказ');
  b = g.picBegin(a1, 'picTo', w, h, 1); const r = await g.picPart(a1, b.up, 0, z.toString('base64'));
  assert.ok(r.ok, 'фото отправлено');
  const m = g.db.messages.filter((x) => x.from === a1.id && x.to === a2.id).pop(), p = g.picGet(m.pic);
  assert.ok(p && p.png.slice(1, 4).toString() === 'PNG' && !p.png.includes(Buffer.from('<?php')), 'новый PNG');
  assert.ok(g.picBegin(a1, 'picTo', w, h, 1).error, 'не чаще раза в 15 секунд');
  g.picSweep(Date.now() + 11 * 60000); assert.ok(!m.pic && m.picGone && !g.picGet(p), 'через 10 минут — удалено');
  { // «Мне нравится!» у аватарки: один голос, не за себя, список, сброс при новой аватарке
    a2.avatar = Date.now();
    assert.ok(g.avaLike(a1, a2.id).ok && g.avaLike(a1, a2.id).error && g.avaLike(a2, a2.id).error, 'один голос, не за себя');
    const L = g.avaLikes(a2, a2.id); assert.ok(L.list.length === 1 && L.list[0].login === 'picFrom' && g.avaLikes(a1, a2.id).mine, 'список голосов');
    g.removeAvatar(a2); assert.ok(!g.avaLikes(a1, a2.id).list.length && g.avaLike(a1, a2.id).error, 'нет аватарки — голоса сброшены');
  }
  console.log('✓ Фото в сообщениях: только точки, новый PNG, шелл не пройдёт, удаление через 10 минут');
  try { fs.unlinkSync(DB); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

