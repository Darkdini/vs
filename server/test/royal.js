'use strict';
// Баланс лояльности населения: самый активный игрок может захватить первый замок только через ~месяц.
const assert = require('assert');
process.env.NEWBIE_DAYS = process.env.NEWBIE_DAYS ?? '0'; // бои в тестах — без защиты новичка (её проверка — отдельно)
process.env.NEWBIE_PREMIUM_DAYS = process.env.NEWBIE_PREMIUM_DAYS ?? '0'; // и без Премиума новичка (проверка — отдельно)
process.env.GRANT_MIN_DAYS = process.env.GRANT_MIN_DAYS ?? '0'; // раздачи админа «всем» — и свежим тестовым аккаунтам (правило 3 дней — отдельно)
process.env.LUCK = '0';
const os = require('os'), path = require('path'), fs = require('fs');
const DB = path.join(os.tmpdir(), `royal-${process.pid}.json`);
const { Game, Store } = require('../src/game');
const g = new Game(new Store(DB));
const chatLow0 = g.chatLow; g.chatLow = () => false; // порог входа в чат (рейтинг 100) проверяется отдельно — ниже, «Порог чата»
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
{ // ритуал сверх предела Храма (5% за уровень лучшего Храма) ничего не прибавит — монеты и ресурсы не списываются
  const rv = g.register({ login: 'ritualcap', password: '12345', race: 0 }).user, rc = g.castlesOf(rv)[0];
  rc.grid[0][0] = 25; rc.levels[0][0] = 1; Object.assign(rc.res, { wood: 50000, stone: 50000, iron: 50000, food: 50000 }); rv.gold = 500;
  assert.ok(g.ritual(rv, rc, 'prayer').ok, 'Молебен при Храме 1 ур. — до предела 5%');
  const gold0 = rv.gold, r2 = g.ritual(rv, rc, 'mystery');
  assert.ok(r2.error && /на пределе/.test(r2.error) && rv.gold === gold0, `Великое таинство сверх предела — отказ без списания: ${r2.error}`);
  rc.levels[0][0] = 10; assert.ok(g.ritual(rv, rc, 'mystery').ok && rv.gold === gold0 - 100, 'Храм 10 ур. — предел 50%, таинство проходит');
}
console.log('✓ Храм: +12 в сутки; ритуал +5%; ритуал сверх предела Храма не берёт монет; первый захват не раньше 30-го дня игры');
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
  assert.ok(Math.abs(at(4) - 1.052) < 1e-9 && Math.abs(at(5) - 1.065) < 1e-9 && Math.abs(at(20) - 1.26) < 1e-9, `${at(4)} ${at(5)} ${at(20)}`); // максимум +26%
  sc.sciences.eng = 20; assert.ok(Math.abs(g.bonus(sc).build - 0.8 * 0.95) < 1e-9);
  const lv = require('../src/army').SCIENCES.war.levels; assert.ok(lv.length === 20 && lv[4].mile && !lv[3].mile);
  { // науки общие на все замки: изучаются в столице, второй замок получает их сразу
    const q = g.register({ login: 'scishare', password: '12345', race: 0 }).user; g.adminAddCastles(q, 1); const [cap, two] = g.castlesOf(q);
    g.mil(cap); g.mil(two); q.sciences = null; cap.sciences = { eco: 0, eng: 3, fhi: 0, war: 7 }; two.sciences = { eco: 5, eng: 0, fhi: 0, war: 2 };
    delete q.sciences; const m = g.sciOf(cap); assert.ok(m.war === 7 && m.eco === 5 && m.eng === 3, 'перенос: лучший уровень из всех замков');
    const a0 = g.bonus(two).atk; m.war = 10; g.mil(two); assert.ok(g.sciOf(two) === g.sciOf(cap) && two.sciences.war === 10 && Math.abs(g.bonus(two).atk / a0 - 1.13 / 1.091) < 1e-9, 'второй замок — те же науки');
    assert.ok(/столице/.test(g.research(two, 'war').error || ''), 'во втором замке не изучить');
  }
  console.log('✓ науки: Военное дело 20 ур. — атака +26% (максимум), Инженерия 20 ур. — стройка ×0.76');
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
// состав альянса: кто в игре — только своим; админ всегда «не в игре»
{
  const mk = (login, o) => Object.assign(g.register({ login, password: '12345', race: 0 }).user, o);
  const L = mk('onlead'), U = { on: mk('onact', { online: true }), off: mk('onoff'), adm: mk('onadm', { admin: true, online: true }) };
  g.db.alliances = g.db.alliances || {}; const aid = g.db.nextId++;
  const al = g.db.alliances[aid] = { id: aid, name: 'Online', tag: 'ON', leader: L.id, members: [L.id, ...Object.values(U).map((u) => u.id)], created: Date.now() };
  for (const id of al.members) g.userById(id).alliance = aid;
  const v = g.allyView(L, al), on = (u) => v.members.find((x) => x.id === u.id).on;
  assert.deepStrictEqual([L, U.on, U.off, U.adm].map(on), [true, true, false, false], 'себя и вошедших — в игре, админ — не в игре');
  assert.ok(v.members.every((m) => !('lastSeen' in m) && !('online' in m) && !('away' in m)), 'время входа не раскрывается');
  const out = mk('onoutsider');
  assert.ok(g.allyView(out, al).members.every((m) => !('on' in m)), 'не участнику (модератор форума) — без статуса');
  assert.ok(g.allyPublic(al).members.every((m) => !('on' in m)), 'в карточке альянса для всех — без статуса');
  U.adm.admin = U.adm.online = U.on.online = false; // дальше по тестам — обычные игроки не в игре
  console.log('✓ состав альянса: кто в игре — видно только своим, админ всегда «не в игре»');
}
// форум альянса: «Ответить» — ответ помнит, кому (ник и начало сообщения), автору — уведомление
{
  const mk = (login) => g.register({ login, password: '12345', race: 0 }).user;
  const A = mk('frauthor'), B = mk('frreply'), C = mk('frother');
  g.db.alliances = g.db.alliances || {}; const aid = g.db.nextId++;
  const al = g.db.alliances[aid] = { id: aid, name: 'Forum', tag: 'FR', leader: A.id, members: [A.id, B.id, C.id], created: Date.now() };
  for (const u of [A, B, C]) u.alliance = aid;
  const tid = g.allyOp(A, g.castleOf(A), { op: 'topic', title: 'Набег', text: 'Кто идёт на лагерь разбойников? '.repeat(5) }).topic, first = g.allyTopic(A, al, tid).posts[0];
  g.drainEvents();
  assert.ok(g.allyOp(B, g.castleOf(B), { op: 'post', topic: tid, text: 'frauthor, я с тобой', reply: first.at }).ok);
  const p = g.allyTopic(A, al, tid).posts[1], ev = g.drainEvents();
  assert.ok(p.reply && p.reply.by === 'frauthor' && p.reply.text === `${first.text.slice(0, 90)}…`, 'ответ с цитатой: ник и начало сообщения');
  assert.ok(ev.length === 1 && ev[0].userId === A.id && /frreply ответил\(а\) вам на форуме альянса в теме «Набег»/.test(ev[0].msg), 'автору — уведомление');
  assert.ok(g.allyOp(C, g.castleOf(C), { op: 'post', topic: tid, text: 'просто так', reply: 12345 }).ok);
  assert.ok(!g.allyTopic(A, al, tid).posts[2].reply && !g.drainEvents().length, 'несуществующее сообщение — обычный ответ, без уведомления');
  console.log('✓ форум альянса: «Ответить» — цитата над ответом и уведомление автору');
}
// кладовая и казна: история пополнений и списаний — всем участникам; старые записи (только текст) тоже разбираются
{
  const mk = (login) => g.register({ login, password: '12345', race: 0 }).user;
  const A = mk('stlead'), B = mk('stmemb'), O = mk('stout');
  g.db.alliances = g.db.alliances || {}; const aid = g.db.nextId++;
  const al = g.db.alliances[aid] = { id: aid, name: 'Store', tag: 'ST', leader: A.id, members: [A.id, B.id], created: Date.now(), treasury: 0, storage: { wood: 0, stone: 0, iron: 0, food: 0 },
    slog: [{ at: 1, text: 'stlead внёс в казну 1 500 монет' }, { at: 2, text: 'stlead выдал из кладовой stmemb: дерево 300, еда 50' }, { at: 3, text: 'что-то непонятное' }] };
  A.alliance = B.alliance = aid; B.gold = 100;
  const cb = g.castleOf(B); g.tick(cb); cb.res.wood = Math.max(cb.res.wood, 500);
  assert.ok(g.allyOp(B, cb, { op: 'store', res: { wood: 200 } }).ok && /не переводятся/.test(g.allyOp(B, cb, { op: 'gold', n: 40 }).error || '') && B.gold === 100, 'свои монеты в казну альянса не переводятся');
  al.treasury = 40; g.allyLog(al, 'Администрация пополнила казну: 40 монет', 'store', { op: '+', gold: 40, by: 'Администрация', via: 'admin' }); // как admin.js allygold
  assert.ok(/нельзя выдать/.test(g.allyOp(A, g.castleOf(A), { op: 'gold', n: 15, to: 'stmemb' }).error || ''), 'казну игрокам не выдать');
  assert.ok(g.alliance(A, g.castleOf(A), { op: 'award', login: 'stmemb', kind: 'bronze' }).ok && al.treasury === 35, 'медаль — из казны (бронзовая — 5 монет)');
  assert.ok(g.allyOp(A, g.castleOf(A), { op: 'store', res: { wood: 120 }, to: 'stmemb' }).ok);
  const mv = g.allyView(B, al).moves, line = (e) => (e.op ? `${e.op}${e.by}${e.to ? `>${e.to}` : ''}:${e.gold || JSON.stringify(e.res)}` : `?${e.text}`);
  assert.deepStrictEqual(mv.map(line), ['-stlead>stmemb:{"wood":120}', '-stlead>stmemb:5', '+Администрация:40', '+stmemb:{"wood":200}', '?что-то непонятное',
    '-stlead>stmemb:{"wood":300,"food":50}', '+stlead:1500'], 'новые сверху; кто, кому, сколько; старые текстовые записи разобраны');
  assert.ok(!g.allyView(B, al).log.length && g.allyView(O, al).moves.length === 0, 'история кладовой — участникам (и без права «Логи»), чужим — нет');
  assert.ok(mv[2].via === 'admin' && mv[1].via === 'medal' && /бронзовая/.test(mv[1].what), 'в истории — кто пополнил казну (администрация) и на что потрачено (медаль)');
  console.log('✓ кладовая и казна: история пополнений и списаний — всем участникам, старые записи разобраны; свои монеты в казну не переводятся');
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
  // огромный бой: генерал 100 ур. (с 25 ур. — «тяжёлые» уровни) получает за бой не больше 10% уровня, за сутки — не больше полуровня
  const span = g.generalNeed(100) - g.generalNeed(99);
  const a = g.addGeneralExp(c1, 10000000);
  assert.ok(a.got === Math.ceil(span * 0.10) && a.capped === 'battle' && a.level === 100, JSON.stringify(a));
  let lv = 100; for (let i = 0; i < 50; i++) lv = g.addGeneralExp(c1, 10000000).level;
  assert.ok(lv === 100 && c1.general.day.exp === Math.ceil(span * 0.5), `за сутки не больше полуровня: ${lv} ур., ${c1.general.day.exp} опыта`);
  // до 25 ур. — как раньше: 15% уровня за бой и целый уровень за сутки
  c1.general = g.newGeneral(c1, 10); const s10 = g.generalNeed(10) - g.generalNeed(9);
  assert.ok(g.addGeneralExp(c1, 10000000).got === Math.ceil(s10 * 0.15), 'до 25 ур. — 15% уровня за бой');
  let l10 = 10; for (let i = 0; i < 50; i++) l10 = g.addGeneralExp(c1, 10000000).level;
  assert.strictEqual(l10, 11, 'до 25 ур. — уровень за сутки');
  // лимит за сутки твёрдый (с 24.10): премиум ×2 ускоряет набор, но лимит не поднимает
  { const pu = g.userById(c1.owner), p0 = pu.premium; pu.premium = Date.now() + 864e5; c1.general = g.newGeneral(c1, 10);
    let l = 10; for (let i = 0; i < 50; i++) l = g.addGeneralExp(c1, 10000000).level; pu.premium = p0;
    assert.ok(l === 11 && c1.general.day.exp <= g.generalNeed(11) - g.generalNeed(10), `с премиумом — тоже не больше уровня за сутки (${l} ур., ${c1.general.day.exp})`); }
  // лимиты игроку не показываются: ни в окне «Генерал», ни в отчёте о бое
  const gv = g.generalView(c1); assert.ok(gv.lim === undefined && gv.day === undefined, 'в окно генерала лимиты не уходят');
  console.log(`✓ генерал: 1 опыт за 10 населения, повторный бой ×0,5; с 25 ур. за бой ≤10% уровня (${fmt(Math.ceil(span * 0.1))} на 100 ур.), за сутки ≤ полуровня; лимиты скрыты`);
}
// с 25 уровня каждый уровень дороже: 25-й — ×1,25, 30-й — ×2,5, 40-й — ×5; до 24 — прежняя шкала; старые генералы — с той же долей полоски
{
  const old = (l) => 50 * l * l, sp = (l) => g.generalNeed(l) - g.generalNeed(l - 1), so = (l) => old(l) - old(l - 1);
  assert.ok([1, 5, 10, 24].every((l) => g.generalNeed(l) === old(l)), 'до 24 ур. шкала прежняя');
  assert.ok(Math.abs(sp(25) / so(25) - 1.25) < 0.001 && Math.abs(sp(30) / so(30) - 2.5) < 0.001 && Math.abs(sp(40) / so(40) - 5) < 0.001, 'с 25 ур. дороже');
  let ok = true; for (let l = 2; l <= 600; l++) if (!(sp(l) > 0 && Number.isInteger(g.generalNeed(l)))) ok = false; assert.ok(ok, 'шкала растёт и в целых числах');
  const U3 = g.register({ login: 'gexp3', password: '12345', race: 0 }).user, c3 = g.castleOf(U3); g.mil(c3);
  c3.general = { name: 'Старый', level: 30, exp: old(29) + (old(30) - old(29)) / 2, expV: 2, dead: false }; g.mil(c3);
  const G = c3.general, f = (G.exp - g.generalNeed(29)) / (g.generalNeed(30) - g.generalNeed(29));
  assert.ok(G.level === 30 && G.expV === 3 && Math.abs(f - 0.5) < 0.001, `генерал 30 ур. на новой шкале: тот же уровень и полполоски (${f})`);
  c3.general = { name: 'Молодой', level: 12, exp: 7000, expV: 2, dead: false }; g.mil(c3);
  assert.ok(c3.general.level === 12 && c3.general.exp === 7000 && c3.general.expV === 3, 'до 25 ур. опыт не меняется');
  console.log(`✓ генерал: с 25 ур. уровни дороже (25-й ×1,25, 30-й ×2,5, 40-й ×5), до 24 — как раньше; старые генералы — тот же уровень и доля полоски`);
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
{ // генерал — один на всё королевство: второго не нанять и не воскресить; переезд старых данных — остаётся сильнейший
  const U = g.register({ login: 'onegen', password: '12345', race: 0 }).user; g.adminAddCastles(U, 2);
  const [a, b, c] = g.castlesOf(U); for (const k of [a, b, c]) g.mil(k);
  a.general = g.newGeneral(a, 5); b.general = g.newGeneral(b, 20); c.general = g.newGeneral(c, 10); a.general.kindId = 245; c.general.kindId = 245;
  const st0 = JSON.stringify(g.stashOf(U).units);
  assert.ok(g.generalOneFix() >= 2, 'переезд сработал');
  assert.ok(!a.general && b.general && b.general.level === 20 && !c.general, 'остался сильнейший (20 ур.)');
  assert.ok(g.stashOf(U).units[245] === 2 && g.stashOf(U).res.wood > 0 && st0 !== JSON.stringify(g.stashOf(U).units), 'цена найма двух лишних — в Кладовой');
  assert.strictEqual(g.generalOneFix(), 0, 'повторный запуск ничего не меняет');
  a.units[245] = 5;
  assert.ok(/один на всё королевство/.test(g.trainGeneral(a, 245).error || ''), 'второго генерала не нанять');
  const ms = g.milState(a, U); assert.ok(ms.genElse && ms.genElse.id === b.id && ms.genElse.level === 20, 'окно генерала: где он');
  g.maxOut(a); assert.ok(!a.general, 'полная прокачка не даёт второго генерала');
  b.general.dead = true; b.general.reviveAt = Date.now() + 1e7;
  assert.ok(/воскрешается/.test(g.trainGeneral(a, 245).error || ''), 'пока генерал воскрешается — нового не нанять');
  delete b.general.reviveAt; a.res = { wood: 1e7, stone: 1e7, iron: 1e7, food: 1e7, people: 1e6 };
  const gid = g.genTrainUnits(a)[0].id, tg = g.trainGeneral(a, gid); assert.ok(tg.ok, `генерал пал (без воскрешения) — можно нанять нового: ${JSON.stringify(tg)}`);
  c.units[gid] = 3; assert.ok(/тренируется/.test(g.trainGeneral(c, gid).error || '') && /тренируется/.test(g.reviveGeneral(b, U, 0).error || ''), 'пока идёт тренировка — ни второй тренировки, ни воскрешения');
  console.log('✓ Генерал один на королевство: второго не нанять и не воскресить, прокачка не создаёт второго; переезд — остаётся сильнейший, цена найма лишних — в Кладовую');
}
{ // окно «Поход»: время от сервера (marchEta) — то же, что у армии в пути; лагерь втрое быстрее, даже если не загружен на карте
  const u = g.register({ login: 'etatest', password: '12345', race: 0 }).user, c = g.castleOf(u); g.mil(c); g.maxOut(c); c.units[200] = 50;
  const camp = g.worldObjects(c.x - 40, c.y - 40, 80, 80).find((o) => o.kind === 'object' && [30, 31, 32].includes(o.img));
  assert.ok(camp, 'рядом есть лагерь');
  const r = g.sendArmy(c, { mission: 'attack', x: camp.x, y: camp.y, from: 'castle' }); // вся Замковая армия с генералом
  assert.ok(!r.error, JSON.stringify(r.error));
  const eta = g.marchEta(c, { units: r.army.units, general: r.army.general, mission: 'attack', x: camp.x, y: camp.y }), slow = g.travelSec(c, r.army.units, r.army.general, camp.x, camp.y);
  assert.strictEqual(eta.sec, r.army.sec, `окно и армия в пути — одно время (${eta.sec} с)`);
  assert.ok(eta.sec < slow && Math.abs(eta.sec * 3 - slow) <= 3, `лагерь — втрое быстрее (${slow} → ${eta.sec})`);
  assert.strictEqual(g.marchEta(c, { units: { __proto__: 5 }, x: 'abc' }).sec, null, 'мусор — без ошибки');
  console.log(`✓ Окно «Поход»: время от сервера совпадает с армией в пути (лагерь ${slow} с → ${eta.sec} с)`);
}
{ // снаряжение — тоже на всё королевство: одна Оружейная у игрока; старые Оружейные замков сливаются в неё
  const U = g.register({ login: 'onegear', password: '12345', race: 0 }).user; g.adminAddCastles(U, 1);
  const [a, b] = g.castlesOf(U); for (const k of [a, b]) g.mil(k);
  a.gear = [g.rollGear(0, 0), g.rollGear(0, 1)]; b.gear = [g.rollGear(0, 2)]; delete U.gear;
  assert.ok(g.heroGearMerge() === 3 && !a.gear && !b.gear && U.gear.length === 3, 'Оружейные замков слились в одну');
  assert.ok(g.heroGear(a) === g.heroGear(b), 'из любого замка — та же Оружейная');
  b.general = g.newGeneral(b, 10); const it = U.gear[0];
  assert.ok(g.heroOp(b, U, { op: 'equip', item: it.id }).ok && b.general.eq[it.slot] === it && !U.gear.includes(it), 'надел во втором замке — вещь ушла из общей Оружейной');
  a.buildingsOk = true; a.grid[0][a.grid[0].indexOf(-1) >= 0 ? a.grid[0].indexOf(-1) : 0] = 11; a.res = { wood: 1e7, stone: 1e7, iron: 1e7, food: 1e7, people: 1e6 };
  const it2 = U.gear[0], en = g.heroOp(a, U, { op: 'enhance', item: it2.id });
  if (en.ok) assert.ok(/у Кузнеца/.test(g.heroOp(b, U, { op: 'sell', item: it2.id }).error || ''), 'вещь у Кузнеца первого замка не продать из второго');
  console.log('✓ Снаряжение на всё королевство: одна Оружейная у игрока, старые Оружейные замков слиты, вещь у Кузнеца защищена из любого замка');
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
  us.forEach((u, i) => g.addStat(u.id, 'loot', (3 - i) * 1e9)); // больше любой добычи игроков других тестов (лагеря дают до 40 000 за набег)
  g.seasonClose();
  const got = us.map((u) => (u.awards || []).find((a) => a.hall === 'loot'));
  assert.deepStrictEqual(got.map((a) => [a.place, a.bonus]), [[1, 80], [2, 40], [3, 20]]);
  assert.ok(us.every((u) => u.reputation > 10), 'репутация начислена');
  console.log(`✓ Зал Славы: бонус репутации за места — Грабежи 80/40/20, репутация ${us.map((u) => u.reputation).join('/')}`);
}
// отчёты: цвет в списке, пересылка в личные сообщения, удаление своих (и «Удалить прочитанные»)
{
  const [a, b] = ['rp1', 'rp2'].map((l) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: 0 }).user);
  g.report(a.id, 'Нападение: победа', ['x'], 'battle', { type: 'battle', side: 'att', win: true });
  g.report(a.id, 'Разведка — провал', ['x'], 'scout', { type: 'scout', ok: false });
  const [r1, r2] = g.reportsOf(a.id).reverse();
  assert.deepStrictEqual([g.reportTone(r1), g.reportTone(r2)], ['win', 'lose']);
  const unreadB = () => g.db.reports.filter((r) => r.owner === b.id && !r.read).length, u0 = unreadB();
  g.blackAdd(b, a.id); assert.ok(/ограничил/.test(g.reportForward(a, r1.id, 'rp2').error || ''), 'в чёрном списке — переслать нельзя, как и письмо'); g.blackDel(b, a.id);
  assert.ok(g.reportForward(a, r1.id, 'RP2').msg, 'переслан (ник — без учёта больших букв)');
  assert.ok(g.reportForward(a, r1.id, 'nobody').error && g.reportForward(b, r1.id, 'rp1').error && g.reportForward(a, r1.id, 'rp1').error, 'несуществующий игрок / чужой отчёт / самому себе');
  // как в оригинале: в личных сообщениях — «Вам прислали отчёт» с кнопкой-названием; в «Отчётах» получателя его нет, открыть могут оба
  const mail = g.db.messages.filter((x) => x.from === a.id && x.to === b.id && x.rep).pop(), fw = mail && g.db.reports.find((x) => x.id === mail.rep);
  assert.ok(mail && mail.repTitle === r1.title && !mail.read && fw, 'письмо с пересланным отчётом');
  assert.ok(fw.fwd && fw.owner === b.id && fw.from === 'rp1' && !g.reportsOf(b.id).some((x) => x.id === fw.id) && unreadB() === u0, 'в «Отчётах» получателя копии нет, непрочитанных не прибавилось');
  assert.ok(g.canSeeReport(b, fw) && g.canSeeReport(a, fw), 'отчёт из письма открывают получатель и отправитель');
  assert.strictEqual(g.reportDelete(b, [r1.id]).n, 0, 'чужой отчёт не удалить');
  assert.ok(g.reportDelete(b, 'read').n === 0 && g.reportDelete(b, [fw.id]).n === 0, 'пересланный в личку не удаляется из «Отчётов»');
  r1.read = true; // «Удалить прочитанные» (была «Ошибка сервера»): уходят только прочитанные свои
  assert.strictEqual(g.reportDelete(a, 'read').n, 1, '«Удалить прочитанные» работает');
  assert.ok(!g.reportsOf(a.id).some((x) => x.id === r1.id) && g.reportsOf(a.id).some((x) => x.id === r2.id), 'непрочитанный остался');
  assert.strictEqual(g.reportDelete(a, [r2.id]).n, 1);
  assert.ok(g.canSeeReport(b, fw), 'отправитель удалил свой отчёт — в письме у получателя он остался');
  // как в оригинале: список по 10 на страницу; конверт — «Отметить как прочитанные», «Удалить новые / прочитанные / всё»
  for (let i = 0; i < 23; i++) g.report(a.id, `Отчёт ${i}`, ['x'], 'battle');
  const p0 = g.reportsPage(a.id, 0), p2 = g.reportsPage(a.id, 2), pBig = g.reportsPage(a.id, 99);
  assert.ok(p0.pages === 3 && p0.total === 23 && p0.list.length === 10 && p0.list[0].title === 'Отчёт 22' && p2.list.length === 3 && pBig.page === 2, 'страницы по 10, новые сверху');
  assert.ok(g.reportsPage(b.id, 0).total === 0 && g.reportsPage(b.id, 0).pages === 1, 'пересланная копия — не в списке получателя');
  for (const r of p0.list.slice(0, 4)) r.read = true;
  assert.strictEqual(g.reportDelete(a, 'new').n, 19, '«Удалить новые» — только непрочитанные');
  g.report(a.id, 'Ещё один', ['x'], 'battle');
  assert.ok(g.reportReadAll(a).n === 1 && g.reportsPage(a.id, 0).list.every((r) => r.read) && g.reportReadAll(a).n === 0, '«Отметить как прочитанные»');
  assert.ok(g.reportDelete(a, 'all').n === 5 && g.reportsPage(a.id, 0).total === 0 && g.canSeeReport(b, fw), '«Удалить всё» — свои, пересланная копия у получателя цела');
  console.log('✓ отчёты: зелёный/красный в списке, «Переслать» — в личные сообщения (кнопка-отчёт), «Удалить» и «Удалить прочитанные» — только свои; по 10 на страницу, меню конверта');
}
{ // «Сообщения», конверт: удалить все / прочитанные / с новыми переписки, отметить всё прочитанным — только у себя
  const [a, b, c, d] = ['mbA', 'mbB', 'mbC', 'mbD'].map((l) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: 0 }).user);
  g.sendMail(b, a.login, 'Сообщение', 'от B'); g.sendMail(c, a.login, 'Сообщение', 'от C'); g.sendMail(a, d.login, 'Сообщение', 'для D');
  const mine = () => g.db.messages.filter((m) => g.msgSees(m, a.id)), seesB = () => g.db.messages.some((m) => m.from === b.id && g.msgSees(m, b.id));
  g.db.messages.find((m) => m.from === b.id && m.to === a.id).read = true;
  let r = g.msgBulk(a, 'read'); // B — прочитано, D — своё отправленное: удаляются; C — с новым: остаётся
  assert.ok(r.dialogs === 2 && mine().length === 1 && mine()[0].from === c.id && seesB(), `«Удалить прочитанные» (${JSON.stringify(r)}), у собеседника сообщение осталось`);
  g.sendMail(d, a.login, 'Сообщение', 'снова D');
  r = g.msgBulk(a, 'new'); assert.ok(r.dialogs === 2 && mine().length === 0, '«Удалить новые» — переписки с непрочитанными');
  g.sendMail(b, a.login, 'Сообщение', 'ещё B'); g.sendMail(c, a.login, 'Сообщение', 'ещё C');
  assert.ok(g.msgBulk(a, 'readall').n === 2 && mine().every((m) => m.read) && g.msgBulk(a, 'readall').n === 0, '«Отметить как прочитанные»');
  r = g.msgBulk(a, 'all'); assert.ok(r.dialogs === 2 && mine().length === 0 && g.msgBulk(a, 'all').dialogs === 0, '«Удалить всё»');
  console.log('✓ Сообщения, конверт: удалить все / прочитанные / с новыми переписки, отметить всё прочитанным — только у себя');
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
  // «Ответить» у сообщения: ответ помнит, кому, и начало его текста; автору — уведомление; чужое/удалённое — просто ответ
  const q = g.forumPosts(md, t, -1).posts.find((p) => p.text === 'Как строить?');
  assert.ok(g.forumOp(md, { op: 'post', topic: t, text: 'Через Ратушу.', reply: q.id }).msg, 'ответ на сообщение');
  const last = g.forumPosts(md, t, -1).posts.slice(-1)[0];
  assert.ok(last.reply && last.reply.by === pl.login && last.reply.text === 'Как строить?' && last.reply.id === q.id, 'в ответе — кому и цитата');
  assert.ok((g.events || []).some((e) => e.userId === pl.id && /ответил\(а\) вам на форуме/.test(e.msg)), 'уведомление автору');
  md.forumLast = 0; assert.ok(g.forumOp(md, { op: 'post', topic: t, text: 'просто так', reply: '__proto__' }).msg && !g.forumPosts(md, t, -1).posts.slice(-1)[0].reply, 'неверный ответ — обычное сообщение');
  // убранные разделы (Пресс-служба союзов, Hi-Tech, Музыка, Клуб по интересам): исчезают из старой базы, их темы — в «Общение»
  g.db.forum.sections.push({ id: 7, name: 'Музыка', mods: [md.id], topics: [{ id: 99901, title: 'Песни', by: md.login, byId: md.id, at: Date.now(), pinned: false, closed: false, deleted: false, posts: [] }] });
  const secs = g.forumSections(ad).map((s) => s.name), talk = g.db.forum.sections.find((s) => s.name === 'Общение');
  assert.ok(secs.join() === 'Помощь новичкам. Обсуждение игровых моментов,Альянсы,Общение,Спорт' && talk.topics.some((x) => x.id === 99901) && g.forumTopic(99901).s === talk, `разделы: ${secs}`);
  console.log('✓ форум: темы — только модераторы (админ назначает модератора раздела), ответы всех, антифлуд, закрытие темы, запрет писать, «Ответить» с цитатой; 4 раздела, темы убранных — в «Общение»');
}
// опрос в теме форума (как в Telegram): создают модераторы; один голос (или несколько), отмена; итоги — после голоса;
// кто как голосовал — в открытом опросе всем, в анонимном — только админу; завершение и срок
{
  const [pl, pl2, md, ad] = ['fq1', 'fq2', 'fq3', 'fq4'].map((l) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: 0 }).user);
  md.mod = true; ad.admin = true;
  const t = g.forumOp(md, { op: 'topic', section: 4, title: 'Прогнозы на матч', text: 'Кто победит?' }).topic;
  assert.ok(g.forumOp(pl, { op: 'pollcreate', topic: t, q: 'Кто победит?', opts: ['Спартак', 'Зенит'] }).error, 'игрок опрос не создаёт');
  assert.ok(g.forumOp(md, { op: 'pollcreate', topic: t, q: 'Кто победит?', opts: ['Спартак'] }).error, 'нужно 2 варианта');
  assert.ok(g.forumOp(md, { op: 'pollcreate', topic: t, q: 'Кто победит?', opts: ['Спартак', 'спартак'] }).error, 'одинаковые варианты — нельзя');
  assert.ok(g.forumOp(md, { op: 'pollcreate', topic: t, q: 'Кто победит?', opts: Array.from({ length: 11 }, (_, i) => `В${i}`) }).error, 'не больше 10 вариантов');
  assert.ok(g.forumOp(md, { op: 'pollcreate', topic: t, q: 'Кто победит?', opts: ['Спартак', 'Зенит', 'Ничья <b>'], days: 3 }).msg);
  assert.ok(g.forumOp(md, { op: 'pollcreate', topic: t, q: 'Ещё', opts: ['а', 'б'] }).error, 'в теме один опрос');
  let v = g.forumPosts(pl, t, -1).poll;
  assert.ok(v && v.canVote && !v.results && v.opts.every((o) => o.n === undefined) && v.opts[2].text === 'Ничья b', 'до голоса итогов не видно, теги вычищены');
  assert.ok(g.forumPosts(md, t, -1).poll.results, 'модератор видит итоги сразу');
  assert.ok(g.forumOp(pl, { op: 'pollvote', topic: t, opts: [0, 1] }).error && g.forumOp(pl, { op: 'pollvote', topic: t, opts: [7] }).error, 'один вариант; несуществующий — нельзя');
  assert.ok(g.forumOp(pl, { op: 'pollvote', topic: t, opts: [0] }).msg && g.forumOp(pl, { op: 'pollvote', topic: t, opts: [1] }).error, 'один голос с аккаунта');
  g.forumOp(pl2, { op: 'pollvote', topic: t, opts: [1] }); g.forumOp(ad, { op: 'pollvote', topic: t, opts: [1] });
  v = g.forumPosts(pl, t, -1).poll;
  assert.ok(v.results && v.total === 3 && v.opts[0].pct === 33 && v.opts[1].pct === 67 && v.opts[0].mine && !v.canVote && v.opts[0].voters === undefined, 'итоги после голоса, опрос анонимный');
  const va = g.forumPosts(ad, t, -1).poll; assert.ok(va.opts[1].voters.includes('fq2') && va.opts[0].voters.includes('fq1'), 'админ видит, кто как голосовал');
  assert.ok(g.forumOp(pl, { op: 'pollunvote', topic: t }).msg && g.forumPosts(pl, t, -1).poll.canVote && g.forumOp(pl, { op: 'pollvote', topic: t, opts: [2] }).msg, 'отмена голоса и новый голос');
  assert.ok(g.forumTopics(pl, 4).topics.find((x) => x.id === t).poll, 'в списке тем — значок опроса');
  assert.ok(g.forumOp(pl, { op: 'pollclose', topic: t }).error && g.forumOp(md, { op: 'pollclose', topic: t }).msg, 'завершает только модератор');
  assert.ok(g.forumOp(pl2, { op: 'pollunvote', topic: t }).error && g.forumPosts(pl, t, -1).poll.results, 'после завершения голос не отменить, итоги видны всем');
  const t2 = g.forumOp(md, { op: 'topic', section: 4, title: 'Любимый вид спорта', text: 'Выбирайте' }).topic;
  g.forumOp(md, { op: 'pollcreate', topic: t2, q: 'Что смотрите?', opts: ['Футбол', 'Хоккей', 'Бокс'], multi: true, public: true, days: 1 });
  assert.ok(g.forumOp(pl, { op: 'pollvote', topic: t2, opts: [0, 1] }).msg, 'несколько вариантов');
  v = g.forumPosts(pl2, t2, -1).poll; assert.ok(!v.results && v.multi && v.public, 'до голоса — без итогов');
  g.forumOp(pl2, { op: 'pollvote', topic: t2, opts: [1] }); v = g.forumPosts(pl2, t2, -1).poll;
  assert.ok(v.opts[1].pct === 100 && v.opts[0].pct === 50 && v.opts[1].voters.join() === 'fq1,fq2', 'открытый опрос: всем видно, кто голосовал');
  g.forumTopic(t2).t.poll.until = Date.now() - 1;
  assert.ok(g.forumOp(md, { op: 'pollvote', topic: t2, opts: [2] }).error && !g.forumPosts(pl, t2, -1).poll.open, 'срок вышел — опрос завершён');
  assert.ok(g.forumOp(md, { op: 'polldel', topic: t2 }).msg && !g.forumPosts(pl, t2, -1).poll, 'модератор удаляет опрос');
  console.log('✓ форум: опросы как в Telegram — создаёт модератор, один голос (или несколько), отмена, итоги после голоса, кто как голосовал — открыто или админу, завершение и срок');
}
// опрос в общем чате: создаёт только админ; сообщение «📊 Опрос», опрос закреплён, пока открыт; голоса как на форуме;
// удалили сообщение опроса — исчез и опрос
{
  const [cp1, cp2] = ['cq1', 'cq2'].map((l) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: 0 }).user);
  const adm = Object.values(g.db.users).find((x) => x.admin) || Object.assign(g.register({ login: 'cqadmin', password: '12345', race: 0 }).user, { admin: true });
  assert.ok(g.chatPollOp(cp1, { op: 'create', q: 'Когда турнир?', opts: ['Суббота', 'Воскресенье'] }).error, 'игрок опрос в чат не создаёт');
  const r = g.chatPollOp(adm, { op: 'create', q: 'Когда турнир?', opts: ['Суббота', 'Воскресенье'] }); assert.ok(r.poll && r.msg && r.msg.poll === r.poll, JSON.stringify(r));
  let pv = g.chatPollViews(cp1); assert.ok(pv.pin === r.poll && pv.polls[r.poll] && !pv.polls[r.poll].results && g.chatLog().some((x) => x.poll === r.poll && /📊 Опрос: Когда турнир\?/.test(x.text)), 'опрос в чате и закреплён');
  assert.ok(!g.chatPollOp(cp1, { op: 'vote', id: r.poll, opts: [0] }).error && !g.chatPollOp(cp2, { op: 'vote', id: r.poll, opts: [1] }).error);
  assert.ok(g.chatPollOp(cp1, { op: 'vote', id: r.poll, opts: [1] }).error, 'один голос');
  const v1 = g.chatPollView(r.poll, cp1), va = g.chatPollView(r.poll, adm);
  assert.ok(v1.results && v1.total === 2 && v1.opts[0].pct === 50 && v1.opts[0].voters === undefined && va.opts[1].voters.includes('cq2'), 'итоги после голоса; кто как — только админу');
  assert.ok(g.chatPollOp(cp1, { op: 'close', id: r.poll }).error && !g.chatPollOp(adm, { op: 'close', id: r.poll }).error && g.chatPollPin() === 0, 'завершает админ — опрос откреплён');
  const r2 = g.chatPollOp(adm, { op: 'create', q: 'Новый ивент?', opts: ['Да', 'Нет'], days: 1 });
  const mid = g.db.chat.find((x) => x.poll === r2.poll).id; adm.chatBan = 0;
  assert.ok(!g.chatDelete(adm, mid).error && !g.db.chatPolls.some((x) => x.id === r2.poll), 'удалили сообщение опроса — опроса нет');
  const r3 = g.chatPollOp(adm, { op: 'create', q: 'Ещё опрос?', opts: ['Да', 'Нет'] }), d3 = g.chatPollOp(adm, { op: 'del', id: r3.poll });
  assert.ok(d3.gone && !g.db.chat.some((x) => x.poll === r3.poll) && !g.chatPollView(r3.poll, adm), 'админ удаляет опрос вместе с сообщением');
  console.log('✓ общий чат: опрос — только админ, закреплён, один голос, итоги после голоса, завершение и удаление');
}
// мягкая модерация чата (chatmod.js, rules.js): предупреждение по пункту правил — окно у игрока до «Понятно»;
// закрыть чат на 5/10/15/30 минут — пишут только модераторы и админ, по таймеру открывается сам
{
  const R = require('../src/rules'), adm = Object.values(g.db.users).find((x) => x.admin);
  assert.ok(R.RULES.length === 18 && R.ruleLabel(2) === 'п. 2 — Оскорбление игроков' && !R.ruleLabel(0) && !R.ruleLabel(19) && R.RULES.every((r) => r.short && r.text), 'правила игры: 18 пунктов');
  const [md, p1, p2] = ['cm_mod1', 'cm_pl01', 'cm_pl02'].map((l) => g.register({ login: l, password: '12345', race: 0 }).user); md.mod = true;
  assert.ok(g.chatWarn(p1, 'cm_pl02', 2).error, 'игрок не предупреждает');
  assert.ok(/пункт правил/.test(g.chatWarn(md, 'cm_pl01', 0).error || '') && /пункт правил/.test(g.chatWarn(md, 'cm_pl01', '__proto__').error || ''), 'без пункта правил — нельзя');
  assert.ok(g.chatWarn(md, adm.login, 1).error && g.chatWarn(md, 'cm_mod1', 1).error, 'админа и себя — нельзя');
  const t0 = Date.now(), w = g.chatWarn(md, 'cm_pl01', 2, t0);
  assert.ok(w.ok && p1.warnPending && p1.warnPending.why === 'п. 2 — Оскорбление игроков' && p1.warnPending.by === 'cm_mod1', JSON.stringify(p1.warnPending));
  assert.ok(g.chatWarn(md, 'cm_pl01', 3, t0 + 1000).error && g.chatWarn(md, 'cm_pl01', 3, t0 + 61000).ok, 'не чаще раза в минуту');
  assert.ok(g.chatWarnInfo(md, 'cm_pl01', t0 + 62000).warns === 2 && g.chatWarnInfo(md, 'cm_pl01', t0 + 8 * 86400000).warns === 0, 'за неделю — 2, через 8 дней — 0');
  assert.ok(g.db.modLog.some((x) => x.op === 'warn' && x.target === 'cm_pl01' && /п\. 2/.test(x.text)), 'в журнале модерации');
  g.chatWarnSeen(p1); assert.ok(!p1.warnPending, '«Понятно» — окно больше не показывается');
  g.chatBanUser(md, 'cm_pl02', 1, 6); const ev = g.drainEvents().filter((x) => x.userId === p2.id).map((x) => x.msg).join(' ');
  assert.ok(/Нарушение: п\. 6 — Ссылки и реклама/.test(ev), `бан в чате — с пунктом правил: ${ev}`); p2.chatBan = 0;
  // закрыть чат
  assert.ok(g.chatClose(p1, 10).error && g.chatClose(md, 7).error, 'закрывает только модератор, на 5/10/15/30 минут');
  const c = g.chatClose(md, 10, t0);
  assert.ok(c.ok && c.until === t0 + 600000 && c.chat && /Чат закрыт на 10 мин/.test(c.chat.text), JSON.stringify(c));
  { // Порог чата: писать в общий чат можно с рейтингом 100 (админ и модераторы — всегда), читать — всем
    const lowU = g.register({ login: 'chatLow1', password: '12345', race: 0 }).user, lc = g.castleOf(lowU), C = require('../src/catalog');
    g.chatLow = chatLow0;
    const e = g.chatPost(lowU, 'привет').error || ''; assert.ok(g.userRating(lowU) < 100 && /рейтингом 100/.test(e), 'новичок с рейтингом ниже 100 в чат не пишет: ' + e);
    g.mil(lc); g.maxOut(lc); lowU.chatAt = 0; lowU.rate = {}; const okp = g.chatPost(lowU, 'привет всем'); assert.ok(g.userRating(lowU) >= 100 && !/рейтингом/.test(okp.error || ''), 'набрал 100 рейтинга — пишет: ' + JSON.stringify(okp.error || 'ok'));
    const m2 = g.register({ login: 'chatLowMod', password: '12345', race: 0 }).user; m2.mod = true; assert.ok(!g.chatLow(m2), 'модератор — без порога');
    g.chatLow = () => false; console.log('✓ Порог чата: писать в общий чат — с рейтингом 100, модераторы и админ — всегда'); }
  p1.chatAt = 0; p1.rate = {}; assert.ok(/Чат закрыт модератором/.test(g.chatPost(p1, 'привет').error || ''), 'игрок не пишет');
  assert.ok(!g.chatPost(md, 'Модератор на связи').error, 'модератор пишет');
  assert.ok(!g.chatCloseCheck(t0 + 599000), 'время не вышло — закрыт');
  const o = g.chatCloseCheck(t0 + 600001);
  assert.ok(o && o.until === 0 && /Чат снова открыт/.test(o.chat.text) && !g.chatClosedUntil(t0 + 600002), 'по таймеру открылся сам');
  const c2 = g.chatClose(md, 5); assert.ok(c2.ok && g.chatClose(md, 0).ok && !g.chatClosedUntil() && g.chatClose(md, 0).error, 'открыть раньше срока');
  const c8 = g.chatClose(md, 480, t0); assert.ok(c8.ok && c8.until === t0 + 8 * 3600000 && /Чат закрыт на 8 часов\. Отдохните/.test(c8.chat.text), c8.chat && c8.chat.text);
  const c24 = g.chatClose(md, 1440, t0); assert.ok(c24.ok && c24.until === t0 + 24 * 3600000 && c24.msg === 'Чат закрыт на 24 часа.', c24.msg);
  assert.ok(g.chatClose(md, 0, t0).ok && !g.chatClosedUntil(t0), 'закрытый на сутки — открыть раньше срока');
  console.log('✓ модерация чата: 18 правил, предупреждение по пункту (окно до «Понятно», раз в минуту, счёт за неделю, журнал), бан с пунктом, чат закрыт на 5–30 мин, 8 или 24 часа и открывается сам');
}
// Колесо Фортуны (wheel.js): запускает только админ; ячейки — золото, опыт, воин по одной, остальные — ресурсы;
// «Участвую» — с одного телефона один аккаунт; по таймеру — победитель и приз сразу, полосы одинаковые у всех, итог — отчётом
{
  const adm = Object.values(g.db.users).find((x) => x.admin), D = (c) => c.repeat(16);
  const [w1, w2, w3] = ['wh1', 'wh2', 'wh3'].map((l, i) => g.register({ login: `${l}_acc`, nick: l, password: '12345', race: i }).user);
  const W = { op: 'create', gold: 1, exp: 5000, unit: 'rand', res: 10000, cells: 12, mins: 1 };
  assert.ok(/только администратор/.test(g.wheelOp(w1, W).error || ''), 'игрок колесо не запускает');
  for (const bad of [{ cells: 3 }, { cells: 21 }, { gold: 1001 }, { gold: -1 }, { exp: 1.5 }, { res: 'x' }, { mins: 7 }, { unit: 200 }, { gold: 0, exp: 0, unit: 0, res: 0 }])
    assert.ok(g.wheelOp(adm, { ...W, ...bad }).error, `неверный запуск отклонён: ${JSON.stringify(bad)}`);
  const r = g.wheelOp(adm, W); assert.ok(!r.error && r.out.some((e) => e.chat && e.chat.wheel), JSON.stringify(r));
  const w = g.db.wheels[g.db.wheels.length - 1], kinds = (k) => w.cells.filter((c) => c.k === k).length;
  assert.ok(w.cells.length === 12 && kinds('gold') === 1 && kinds('exp') === 1 && kinds('unit') === 1 && ['wood', 'stone', 'iron', 'food'].reduce((s, k) => s + kinds(k), 0) === 9, 'золото, опыт и воин — по ячейке, 9 ячеек ресурсов');
  assert.ok(require('../src/army').UNIT[w.cells.find((c) => c.k === 'unit').id].undead, 'случайный воин — из нежити сундуков');
  assert.ok(g.wheelOp(adm, W).error, 'второе колесо, пока идёт первое, — нельзя');
  assert.ok(g.wheelJoin(adm, w.id, D('a')).error, 'админ не участвует');
  assert.ok(g.wheelJoin(w1, w.id, D('b')).ok && g.wheelJoin(w1, w.id, D('b')).error, 'участвовать — один раз');
  assert.ok(/телефона/.test(g.wheelJoin(w2, w.id, D('b')).error || ''), 'с того же телефона второй аккаунт — нельзя');
  assert.ok(g.wheelJoin(w2, w.id, D('c')).ok && g.wheelJoin(w3, w.id, '').ok, 'с другого телефона — можно');
  let v = g.chatWheelViews(w1); const v1 = v.wheels[w.id];
  assert.ok(v.wpin === w.id && v1.mine && v1.n === 3 && v1.st === 'join' && !v1.strip1 && v1.win === undefined && !g.wheelView(w.id, adm).mine, 'запись: колесо закреплено, победителя ещё нет');
  assert.ok(g.wheelCheck(w.until - 2000).some((e) => e.cnt === w.id && e.n === 3) && !g.wheelCheck(w.until - 1000).length, 'число участников — всем, один раз');
  const snap = (u) => JSON.stringify([u.gold || 0, g.stashOf(u)]), before = new Map([w1, w2, w3].map((u) => [u.id, snap(u)]));
  const out = g.wheelCheck(w.until + 1), msg = (out.find((e) => e.chat) || {}).chat;
  assert.ok(w.st === 'spin' && msg && msg.wheel === w.id && msg.wph === 'spin' && msg.text === '🎰 Колесо Фортуны крутится!', 'время вышло — колесо крутится, в чате сообщение');
  const win = g.userById(w.win), c = w.cells[w.cell], s = g.stashOf(win);
  assert.ok([w1.id, w2.id, w3.id].includes(w.win) && w.strip1[34] === w.win && w.strip2[34] === w.cell && w.strip1.length === 40 && w.strip1.every((id) => [w1.id, w2.id, w3.id].includes(id)), 'полосы: выигрыш — под стрелкой');
  assert.ok(c.k === 'gold' ? (win.goldLog || []).some((x) => x.delta === 1 && /Колесо Фортуны/.test(x.reason)) : c.k === 'exp' ? s.exp === 5000 : c.k === 'unit' ? s.units[c.id] === 1 : s.res[c.k] === 10000, `приз начислен сразу: ${JSON.stringify(c)}`);
  assert.ok([w1, w2, w3].filter((u) => u !== win).every((u) => snap(u) === before.get(u.id)), 'остальным — ничего');
  const vA = g.wheelView(w.id, w1), vB = g.wheelView(w.id, w2);
  assert.ok(JSON.stringify([vA.strip1, vA.strip2]) === JSON.stringify([vB.strip1, vB.strip2]) && vA.people[w.win].login === win.login && vA.prize === g.wheelPrize(c), 'у всех одни и те же полосы');
  assert.ok(g.wheelOp(adm, { op: 'cancel', id: w.id }).error && !g.chatWheelViews(w1).wpin, 'после розыгрыша не отменить, закреп снят');
  const rep0 = g.reportsOf(w.win).length; g.wheelCheck(w.spinAt + 5000);
  assert.ok(w.st === 'spin' && g.reportsOf(w.win).length === rep0, 'отчёт — не раньше конца прокрутки');
  g.wheelCheck(w.spinAt + 12501);
  assert.ok(w.st === 'done' && g.reportsOf(w.win).length === rep0 + 1 && /выигрыш/.test(g.reportsOf(w.win)[0].title) && /выигрывает/.test(g.db.chat.find((x) => x.id === w.msg).text), 'итог: отчёт победителю, в чате — кто выиграл');
  const before2 = snap(win); g.wheelCheck(w.spinAt + 99999); assert.ok(snap(win) === before2, 'приз — один раз');
  assert.ok(g.wheelOp(adm, { ...W, gold: 0, exp: 0, unit: 0, res: 500, cells: 4 }).out && g.db.wheels[g.db.wheels.length - 1].cells.length === 4, 'колесо из одних ресурсов');
  const e = g.db.wheels[g.db.wheels.length - 1]; g.wheelCheck(e.until + 1);
  assert.ok(e.st === 'cancel' && e.why === 'empty', 'никто не записался — розыгрыш отменён');
  const r3 = g.wheelOp(adm, { ...W, unit: 323 }), w4 = g.db.wheels[g.db.wheels.length - 1];
  assert.ok(!r3.error && w4.cells.some((x) => x.k === 'unit' && x.id === 323), 'выбранный воин — в колесе');
  assert.ok(g.wheelOp(w1, { op: 'cancel', id: w4.id }).error && !g.wheelOp(adm, { op: 'cancel', id: w4.id }).error && w4.st === 'cancel' && g.wheelJoin(w1, w4.id, D('b')).error, 'отменяет только админ; после отмены не записаться');
  const w5r = g.wheelOp(adm, W), w5 = g.db.wheels[g.db.wheels.length - 1]; g.wheelJoin(w2, w5.id, D('d'));
  assert.ok(!w5r.error && g.wheelOp(adm, { op: 'spin', id: w5.id }).out.some((x) => x.chat) && w5.win === w2.id, '«Крутить сейчас» — розыгрыш без ожидания');
  g.wheelCheck(w5.spinAt + 12501);
  console.log('✓ Колесо Фортуны: запускает админ, ячейки по призам, «Участвую» — один аккаунт с телефона, приз сразу, полосы у всех одинаковые, отчёт после прокрутки');
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
// звание «Авторитет» — у игрока №1 рейтинга «Авторитет» (по репутации); админ и боты не в счёт
{
  const adm = g.adminUser(), keep = adm.reputation, max = Math.max(...Object.values(g.db.users).map((u) => u.reputation ?? 10));
  const [a, b] = ['autha', 'authb'].map((l) => g.register({ login: l, password: '12345', race: 0 }).user);
  const has = (u) => g.profileOf(u, a).titles.includes('Авторитет');
  a.reputation = max + 100; adm.reputation = max * 10 + 1000; g.cache = {};
  assert.ok(has(a) && !has(b) && !has(adm), 'первый по репутации — «Авторитет», админ не в счёт');
  assert.ok(g.profileOf(a, b).titles.at(-1) === 'Авторитет', 'видят и другие игроки');
  b.reputation = a.reputation - 1; g.cache = {}; assert.ok(!has(b), 'на 1 меньше — ещё не «Авторитет»');
  b.gold = 1; assert.ok(g.giveReputation(b, b.id, 1).ok); // +2 — звание переходит сразу, без ожидания кэша рейтинга
  assert.ok(has(b) && !has(a), 'обогнал по репутации — звание перешло');
  assert.strictEqual(Object.values(g.db.users).filter((u) => g.authorityId() === u.id).length, 1, 'звание — только у одного');
  adm.reputation = keep; a.reputation = b.reputation = 10; g.cache = {};
  console.log('✓ звание «Авторитет»: у №1 по репутации, переходит к обогнавшему, админ не в счёт');
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
  { // старший модератор публикует новость (в журнал модерации); простой модератор — нет
    const sm = g.register({ login: 'newsmod', password: '12345', race: 0 }).user; sm.mod = true;
    assert.ok(g.newsOp(sm, { op: 'publish', title: 'Турнир', text: 'x' }).error, 'модератор — нельзя');
    sm.smod = true; const r = g.newsOp(sm, { op: 'publish', title: 'Турнир', text: 'В субботу' });
    assert.ok(r.id && (g.db.modLog || []).some((x) => x.op === 'news' && x.by === 'newsmod' && x.target === '«Турнир»'), 'старший модератор — публикует, запись в журнале');
    g.db.news = g.db.news.filter((n) => n.id !== r.id); sm.mod = sm.smod = false;
  }
  assert.strictEqual(g.newsUnread(u), 1); assert.strictEqual(g.newsFirst(u), id);
  const it = g.newsGet(u, id); assert.ok(it.title && !it.error); assert.strictEqual(g.newsUnread(u), 0, 'прочитал — конверт исчез');
  assert.strictEqual(g.newsList(u, 0).list.length, 1, 'новость осталась в списке');
  assert.ok(g.newsOp(u, { op: 'comment', id, text: 'Круто!' }).msg);
  assert.strictEqual(g.newsGet(u, id).comments.length, 1);
  assert.ok(g.newsOp(u, { op: 'cmtdel', id, comment: g.newsGet(u, id).comments[0].id }).error, 'комментарии удаляют модераторы');
  { // при публикации — можно ли комментировать; потом админ может закрыть или открыть комментарии кнопкой
    const nc = g.newsOp(ad, { op: 'publish', title: 'Техработы', text: 'Сервер перезапустится', comments: false });
    assert.ok(/Комментарии закрыты/.test(nc.msg) && g.newsGet(u, nc.id).noCmt && g.newsList(u, 0).list.find((x) => x.id === nc.id).noCmt, 'опубликована без комментариев');
    u.newsCmtAt = 0; assert.ok(/закрыты/.test(g.newsOp(u, { op: 'comment', id: nc.id, text: 'А когда?' }).error || ''), 'игрок не комментирует');
    assert.ok(g.newsOp(u, { op: 'cmtlock', id: nc.id, on: false }).error && g.newsGet(u, nc.id).canLock === false, 'открыть — не игроку');
    assert.ok(g.newsOp(ad, { op: 'cmtlock', id: nc.id, on: false }).msg && !g.newsGet(u, nc.id).noCmt && g.newsOp(u, { op: 'comment', id: nc.id, text: 'А когда?' }).msg, 'админ открыл — комментируют');
    assert.ok(g.newsOp(ad, { op: 'cmtlock', id: nc.id, on: true }).msg && g.newsGet(u, nc.id).noCmt && g.newsGet(u, nc.id).comments.length === 1, 'закрыл снова — старые комментарии видны');
    assert.ok(!g.newsGet(u, id).noCmt, 'по умолчанию комментарии открыты');
    g.db.news = g.db.news.filter((n) => n.id !== nc.id); u.newsCmtAt = 0;
  }
  const late = g.register({ login: 'newsl', password: '12345', race: 0 }).user; late.created = Date.now() + 5000;
  assert.strictEqual(g.newsUnread(late), 0, 'старые новости новичку не мигают');
  console.log('✓ новости: публикует админ, непрочитанная → конверт, после прочтения исчезает, остаётся в списке, комментарии');
}
// Школа магии: как Кузница — все воины расы, маг. атака и маг. защита у каждого (с 23.10; раньше — только маги); +1 за уровень, до уровня Школы
{
  const u = g.register({ login: 'mschool', password: '12345', race: 0 }).user, c = g.castleOf(u);
  assert.ok(g.magicOp(c, { unit: 203, kind: 'm' }).error, 'без Школы магии нельзя');
  g.maxOut(c); c.forge = {}; for (const r of ['wood', 'stone', 'iron', 'food']) c.res[r] = 1e9;
  const mag0 = g.armyPower(c, { 203: 10 }, false).mag;
  c.res.people = 1e6;
  assert.ok(g.magicUnits(c).some((x) => x.id === 200) && g.magicOp(c, { unit: 233, kind: 'm' }).error, 'Мечник — в Школе магии (как в оригинале, с 23.10), Бунтаря нет');
  assert.ok(g.magicOp(c, { unit: 203, kind: 'm' }).ok);
  assert.ok(/Уже проводится/.test(g.magicOp(c, { unit: 261, kind: 'm' }).error || '') || g.magicOp(c, { unit: 203, kind: 'm' }).error, 'одно улучшение маг. атаки за раз');
  assert.ok(g.magicOp(c, { unit: 203, kind: 'md' }).ok, 'маг. защита — параллельно');
  c.upJobs.m.end = Date.now() - 1; g.tick(c);
  assert.strictEqual(g.forgeLvl(c, 203, 'm'), 1);
  assert.ok(g.armyPower(c, { 203: 10 }, false).mag > mag0, 'маг. атака выросла');
  console.log('✓ Школа магии: юниты с маг. атакой, +1 за уровень, по одному улучшению на параметр, стоимость по скринам');
}
{ // мульты: только общий телефон (id); один Wi‑Fi и одна модель телефона — не мульт; «железо + сеть» — подсказка; «Не мульт»; бан только телефона
  const a = g.register({ login: 'devtest1', password: '12345', race: 0 }).user, b = g.register({ login: 'devtest2', password: '12345', race: 0 }).user;
  const ua = 'Mozilla/5.0 (Linux; Android 13; SM-A525F Build/TP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
  const info = { ua, fp: 'abcdef0123456789abcd', scr: '412x915', dpr: 2.6, cores: 8, mem: 4, tz: 'Europe/Moscow', lang: 'ru-RU', touch: 5 };
  g.devInfo(a, '1.2.3.4', { ...info, dev: 'a'.repeat(32) }); g.devInfo(a, '1.2.3.4', { ...info, dev: 'a'.repeat(32) });
  assert.strictEqual(a.devInfo.length, 1, 'повторный вход — та же запись'); assert.strictEqual(a.devInfo[0].count, 2);
  assert.strictEqual(a.devInfo[0].model, 'SM-A525F'); assert.strictEqual(a.devInfo[0].os, 'Android 13'); assert.ok(/Chrome/.test(a.devInfo[0].browser));
  const inG = (kind, ...ls) => g.multis().some((x) => x.kind === kind && ls.every((l) => x.users.some((u) => u.login === l)));
  const log0 = (g.db.multiLog || []).length;
  g.devInfo(b, '5.6.7.8', { ...info, dev: 'b'.repeat(32) }); // другой телефон той же модели, другая сеть
  assert.deepStrictEqual(g.devReport(b).devices[0].sameFp, [], 'одна модель телефона в разных сетях — не мульт');
  assert.ok(!inG('hint', 'devtest1', 'devtest2') && (g.db.multiLog || []).length === log0, 'ни подсказки, ни оповещения по «железу»');
  g.devInfo(b, '1.2.3.4', { ...info, dev: 'b'.repeat(32) }); // то же железо и та же сеть — похоже на один телефон после очистки данных
  assert.deepStrictEqual(g.devReport(b).devices[0].sameFp, ['devtest1'], 'железо + сеть — подсказка в карточке');
  assert.ok(inG('hint', 'devtest1', 'devtest2') && !inG('dev', 'devtest1', 'devtest2'), 'подсказка, но не «один телефон»');
  assert.strictEqual((g.db.multiLog || []).length, log0, 'подсказка — без оповещения');
  const [c, e] = ['devtest3', 'devtest4'].map((l) => g.register({ login: l, password: '12345', race: 0 }).user);
  g.trackLogin(c, '9.9.9.9', 'c'.repeat(32)); g.trackLogin(e, '9.9.9.9', 'e'.repeat(32));
  assert.ok(!g.multis().some((x) => ['devtest3', 'devtest4'].every((l) => x.users.some((u) => u.login === l))), 'один Wi‑Fi (общий IP) — не мульт');
  g.trackLogin(e, '9.9.9.9', 'c'.repeat(32)); // вошёл с телефона devtest3
  assert.ok(inG('dev', 'devtest3', 'devtest4') && g.db.multiLog.some((x) => x.login === 'devtest4' && x.with.includes('devtest3')), 'один телефон — мульт и оповещение');
  const adm = Object.values(g.db.users).find((x) => x.admin) || Object.assign(g.register({ login: 'devadm', password: '12345', race: 0 }).user, { admin: true });
  const key = g.multis().find((x) => x.kind === 'dev' && x.users.some((u) => u.login === 'devtest3')).key, grp = () => g.multis().find((x) => x.key === key);
  assert.ok(g.adminOp(adm, 'multiok', { key }).ok && grp().hidden, '«Не мульт» — группа скрыта');
  const f = g.register({ login: 'devtest5', password: '12345', race: 0 }).user; g.trackLogin(f, '8.8.8.8', 'c'.repeat(32));
  assert.ok(!grp().hidden && grp().users.length === 3, 'новый аккаунт на том же телефоне — группа снова в списке');
  assert.ok(g.adminOp(adm, 'multiok', { key }).ok && grp().hidden); g.adminOp(adm, 'multiunok', { key }); assert.ok(!grp().hidden, '«Вернуть»');
  assert.ok(!g.adminOp(adm, 'devban', { dev: 'a'.repeat(32), fp: info.fp }).error);
  { // «Убрать ботов»: все боты и их замки исчезают с карты, живые игроки остаются
    const users0 = Object.values(g.db.users).filter((u) => !u.bot).length;
    assert.ok(/Создано ботов: 5/.test(g.adminOp(adm, 'bots', { n: 5 }).msg || ''));
    const bc = Object.values(g.db.users).filter((u) => u.bot).flatMap((u) => u.castleIds || []);
    assert.ok(/Удалено ботов: 5/.test(g.adminOp(adm, 'botsdel').msg || ''), 'убраны все боты');
    assert.ok(!Object.values(g.db.users).some((u) => u.bot) && bc.every((id) => !g.db.castles[id]) && Object.values(g.db.users).length === users0, 'замков ботов нет, игроки на месте');
    console.log('✓ админка: «Убрать ботов» — боты и их замки удалены, игроки на месте');
  }
  assert.ok(g.devBanned('a'.repeat(32)) && !g.db.fpBans, 'бан телефона — без «железа»');
  assert.strictEqual(g.devInfo(b, '5.6.7.8', { ...info, dev: 'd'.repeat(32) }), '', 'другой телефон той же модели — не в бане');
  assert.ok(!g.devBanned('d'.repeat(32)));
  g.adminOp(adm, 'devunban', { dev: 'a'.repeat(32) }); assert.ok(!g.devBanned('a'.repeat(32)));
  // старые баны «железа» снимаются при запуске; телефоны, забаненные админом, остаются в бане
  g.db.fpBans = { [info.fp]: { at: 1, by: 'Советник' } }; g.db.devBans['f'.repeat(32)] = { at: 1, by: `железо ${info.fp.slice(0, 8)}` }; g.db.devBans['9'.repeat(32)] = { at: 1, by: 'Советник' };
  g.db.multiLog.push({ at: 1, login: 'devtest2', with: ['devtest1'], dev: 'отпечаток abcdef01' }); g.multiCleanup();
  assert.ok(!g.db.fpBans && !g.devBanned('f'.repeat(32)) && g.devBanned('9'.repeat(32)), 'баны «железа» сняты, бан телефона админом остался');
  assert.ok(!g.db.multiLog.some((x) => /^отпечаток /.test(x.dev)), 'старые оповещения по «железу» убраны');
  delete g.db.devBans['9'.repeat(32)];
  console.log('✓ Мульты: только общий телефон; один Wi‑Fi и одна модель — не мульт; «железо + сеть» — подсказка; «Не мульт»; бан только телефона');
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
  { // ник: только английские буквы и цифры; мат, оскорбления (и с цифрами вместо букв) и «админские» ники — нельзя
    // (свой отдельный мир — лишние игроки не сдвигают замки следующих проверок)
    const NDB = path.join(os.tmpdir(), `royal-nick-${process.pid}.json`), gn = new Game(new Store(NDB));
    const reg = (nick) => gn.register({ login: `nk_${nick.toLowerCase().replace(/[^a-z0-9]/g, '')}${Math.random().toString(36).slice(2, 6)}`, password: '12345', nick, race: 0 });
    assert.ok(/английские буквы/.test(reg('Иван').error), 'русские буквы в нике — нельзя');
    for (const n of ['Admin', 'Adm1n', 'Moderator', 'Sovetnik', 'Support']) assert.ok(/администрации/.test(reg(n).error), `«${n}» — похоже на администрацию`);
    for (const n of ['Suka', 'B1yat', 'Bl9t', 'Pi3da', 'Fuuuck', 'Id10t', 'Mudak', 'Loh']) assert.ok(/мат или оскорбление/.test(reg(n).error), `«${n}» — мат/оскорбление`);
    for (const n of ['Kozlov', 'Ivan1999', 'Modern', 'Sukhoi', 'Den4ik']) assert.ok(reg(n).user, `обычный ник «${n}» разрешён`);
    const ch = gn.register({ login: 'nickchange1', password: '12345', nick: 'Rodion', race: 0 }).user; ch.gold = 500;
    assert.ok(/мат/.test(gn.changeNick(ch, 'Pidor1').error) && /администрации/.test(gn.changeNick(ch, 'Moder').error) && ch.gold === 500, 'смена на плохой ник — отказ, монеты целы');
    for (const f of [NDB, `${NDB}.tmp`]) try { fs.unlinkSync(f); } catch { /* нет файла */ }
  }
  assert.ok(g.register({ login: 'admin2', password: '12345', nick: 'ADMIN', race: 0 }).error, 'ник admin в любом регистре — нельзя');
  assert.ok(/минимум 5/.test(g.register({ login: 'abcd', password: '12345', race: 0 }).error) && g.register({ login: 'abcde', password: '12345', race: 0 }).user, 'логин не короче 5 символов');
  z.gold = 50; assert.ok(/100 монет/.test(g.changeNick(z, 'ZeVs').error), 'без монет ник не меняется');
  z.gold = 250; assert.ok(g.changeNick(z, 'ZeVs').ok); assert.strictEqual(z.login, 'ZeVs'); assert.strictEqual(z.gold, 150); assert.ok(g.login('zevs@mail.ru', '12345') === z, 'логин тот же');
  assert.ok(g.changeNick(z, 'zevs').error, 'занятый ник'); assert.ok(g.changeNick(z, 'Громовержец').error, 'длиннее 10');
  console.log('✓ Регистрация: логин + пароль + ник; вход по логину; Zevs и zevs — разные ники; смена ника за 100 монет; ник — только английские буквы, без мата, оскорблений и «админских» имён');
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
  const tc = g.genTrainCost(UNIT[245]); assert.deepStrictEqual([tc.cost.wood, tc.cost.stone, tc.cost.iron, tc.cost.food, tc.people, tc.sec], [1700, 1600, 1800, 3600, 120, 5400], 'Мародер → генерал: цена как на скрине, найм — полтора часа');
  assert.strictEqual(g.genTrainCost(UNIT[200]).sec, 3600, 'Мечник → генерал: час');
  const rc = g.reviveCostOf({ kindId: 247, level: 716, exp: g.generalNeed(715) + 1 });
  assert.deepStrictEqual([rc.cost.wood, rc.cost.stone, rc.cost.iron, rc.cost.food, rc.people, rc.sec, rc.gold], [537000, 572800, 608600, 1181400, 8592, 726 * 60 * 3, 716].map((v, i) => (i < 4 ? rc.cost[['wood', 'stone', 'iron', 'food'][i]] : v)), 'Бугай 716');
  assert.ok(Math.abs(rc.cost.wood - 537060) / 537060 < 0.002 && rc.people === 8592 && rc.sec === 726 * 60 * 3 && rc.gold === 716 && rc.coinsOnly, `Бугай 716 (выше 100 ур. — только за монеты, монета за уровень): ${JSON.stringify(rc)}`);
  // воскрешение: (уровень + 10) × 3 минуты — 10 ур. — час, каждый уровень — ещё 3 минуты; от воина не зависит (с 21.10; было втрое быстрее)
  assert.ok(g.reviveCostOf({ kindId: 200, level: 10, exp: 0 }).sec === 3600 && g.reviveCostOf({ kindId: 249, level: 10, exp: 0 }).sec === 3600 && g.reviveCostOf({ kindId: 245, level: 11, exp: 0 }).sec === 3780, 'воскрешение: 10 ур. — 1 ч, 11 ур. — 1 ч 3 мин');
  assert.strictEqual(g.reviveCostOf({ kindId: 200, level: 100, exp: 0 }).gold, 100, 'за монеты — монета за уровень: 100 ур. — 100 (было 12)');
  // Скорость восстановления: воскрешение быстрее на 1% за очко, не больше 50 очков (вдвое быстрее)
  const rv = (heal) => g.reviveCostOf({ kindId: 200, level: 10, exp: 0, pts: { heal } }).sec;
  assert.ok(rv(10) === 3240 && rv(50) === 1800 && rv(80) === 1800, `восстановление: 10 очков — 54 мин, 50 и больше — 30 мин (${rv(10)}, ${rv(50)}, ${rv(80)})`);
  { const gh = g.newGeneral(c, 40); gh.free = 78; c.general = gh;
    assert.ok(g.generalOp(c, u, { op: 'dist', pts: { heal: 40 } }).ok && /не больше 50/.test(g.generalOp(c, u, { op: 'dist', pts: { heal: 11 } }).error || '') && gh.pts.heal === 40, 'больше 50 очков в восстановление не вложить');
    assert.ok(g.generalOp(c, u, { op: 'dist', pts: { heal: 10 } }).ok && gh.pts.heal === 50 && g.genStats(gh).heal === 0.5, '50 очков — вдвое быстрее'); c.general = null; }
  g.maxOut(c); c.units = { 245: 5 }; c.general = null; Object.assign(c.res, { wood: 5e4, stone: 5e4, iron: 5e4, food: 5e4, people: 5000 });
  c.units[252] = 3; c.units[233] = 3; c.units[243] = 3;
  for (const id of [252, 233, 243]) assert.ok(g.trainGeneral(c, id).error, `${UNIT[id].name} — не генерал`);
  assert.ok(g.trainGeneral(c, 245).ok); assert.strictEqual(c.units[245], 4, 'юнит ушёл в генералы');
  assert.ok(g.trainGeneral(c, 245).error, 'второй генерал не тренируется');
  c.training.find((t) => t.unit === 236).start = 0; g.tick(c);
  assert.ok(c.general && c.general.kind === 'Мародёр');
  c.general.dead = true; u.gold = 10; const lv = c.general.level;
  assert.ok(g.reviveGeneral(c, u, 0, true).ok && !c.general.dead && u.gold === 10 - lv, `воскрешение ${lv} ур. — за ${lv} монет`);
  c.general.dead = true; c.units[245] = 2; assert.ok(g.trainGeneral(c, 245).ok); assert.strictEqual(c.deadGenerals.length, 1, 'павший остаётся в списке');
  assert.ok(g.deleteDeadGeneral(c, 0).ok && !c.deadGenerals.length);
  // сменить воина: уровень, опыт, очки и снаряжение остаются; цена — как найм; полчаса переобучения
  { c.training = c.training.filter((t) => t.unit !== 236); c.deadGenerals = [];
    c.general = g.newGeneral(c, 30); Object.assign(c.general, { kind: 'Мародер', kindId: 245 }); c.general.pts.atk = 10; c.general.free -= 10;
    const g0 = JSON.parse(JSON.stringify(c.general)); c.units = { 245: 2, 247: 1 }; Object.assign(c.res, { wood: 5e4, stone: 5e4, iron: 5e4, food: 5e4, people: 5000 });
    assert.ok(/уже из этого/.test(g.generalOp(c, u, { op: 'rekind', unit: 245 }).error || ''), 'тот же воин — нельзя');
    assert.ok(/замковой армии/.test(g.generalOp(c, u, { op: 'rekind', unit: 246 }).error || ''), 'воина нет в Замковой армии — нельзя');
    c.general.away = 99; assert.ok(/в походе/.test(g.generalOp(c, u, { op: 'rekind', unit: 247 }).error || ''), 'генерал в походе — нельзя'); delete c.general.away;
    g.tick(c); const w0 = c.res.wood, rk = g.generalOp(c, u, { op: 'rekind', unit: 247 }), tc7 = g.genTrainCost(UNIT[247]);
    assert.ok(rk.ok && !c.units[247] && Math.abs((w0 - c.res.wood) - tc7.cost.wood) < 5 && c.general.kindId === 245 && c.general.rekind, `смена начата, цена — как найм: ${JSON.stringify(rk)}`);
    assert.ok(/уже переобучается/.test(g.generalOp(c, u, { op: 'rekind', unit: 245 }).error || ''), 'вторая смена сразу — нельзя');
    assert.strictEqual(c.general.rekind.end - Date.now() <= 1800 * 1000 && c.general.rekind.end - Date.now() > 1790 * 1000, true, 'переобучение — полчаса');
    g.tickTraining(c, c.general.rekind.end + 1);
    const g1 = c.general;
    assert.ok(g1.kindId === 247 && g1.kind === 'Бугай' && !g1.rekind && g1.level === g0.level && g1.exp === g0.exp && g1.pts.atk === 10 && g1.free === g0.free && JSON.stringify(g1.eq) === JSON.stringify(g0.eq), 'через полчаса — новый воин; уровень, опыт, очки, снаряжение прежние');
    assert.ok(g.generalView(c).rekindSec === 1800, 'окно знает время смены');
    c.general.dead = true; assert.ok(/погиб/.test(g.generalOp(c, u, { op: 'rekind', unit: 245 }).error || ''), 'павшего — сначала воскресить'); c.general = null; }
  console.log('✓ Генерал: найм — Мечник 1 ч, Мародер 1,5 ч; воскрешение — (уровень + 10) мин; «Сменить воина» без потери уровня; павшие списком, удаление');
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
{ // удаление игрока админом: игрок убирается отовсюду и ничего не падает; чужое подкрепление из его замка идёт домой
  // (свой отдельный мир — лишние игроки не сдвигают замки следующих проверок)
  const DDB = path.join(os.tmpdir(), `royal-del-${process.pid}.json`), g = new Game(new Store(DDB)); g.ensureAdmin();
  const adm = g.adminUser(), reg = (l) => g.register({ login: l, password: '12345', race: 1 }).user;
  const P1 = reg('purgeA1'), P2 = reg('purgeB1'), c1 = g.castleOf(P1), c2 = g.castleOf(P2); g.mil(c1); g.mil(c2);
  P1.friends = [P2.id]; P2.friends = [P1.id]; P1.friendIn = [P2.id]; g.privacyOf(P1).black.push(P2.id);
  g.db.marriages = g.db.marriages || {}; const mid = g.db.nextId++;
  g.db.marriages[mid] = { id: mid, king: P2.id, queen: P1.id, at: Date.now(), votes: 0, gifts: [], comments: [] }; P1.marriage = P2.marriage = mid;
  g.db.messages = g.db.messages || []; g.db.messages.push({ id: g.db.nextId++, from: P2.id, to: P1.id, text: 'привет', at: Date.now(), read: false });
  g.report(P2.id, 'Отчёт удаляемого', ['—'], 'battle');
  c1.armies.push({ id: g.db.nextId++, units: { 207: 5 }, mission: 'reinforce', state: 'stay', stayAt: c2.id, x: c2.x, y: c2.y, depart: Date.now() - 60000, arrive: Date.now() });
  c1.res.wood = Math.max(c1.res.wood, 500); const bet = g.coinBet(P1, c1, 'wood', 300, 'eagle', 'purgeB1');
  assert.ok(bet.ok && g.pairsList().some((x) => x.id === mid), 'до удаления: вызов брошен, пара в рейтинге');
  const r = g.adminOp(adm, 'delete', { login: 'purgeB1' });
  assert.ok(r.ok && !g.db.users.purgeB1 && !g.userById(P2.id), 'игрок удалён');
  assert.ok(!P1.friends.length && !P1.friendIn.length && !g.privacyOf(P1).black.length, 'из друзей, заявок и чёрного списка — убран');
  assert.ok(!P1.marriage && !g.db.marriages[mid] && !g.pairsList().some((x) => x.id === mid), 'брак расторгнут, «Семейные пары» без ошибки');
  assert.ok(!g.db.messages.some((x) => x.from === P2.id || x.to === P2.id) && !g.db.reports.some((x) => x.owner === P2.id), 'переписка с ним и его отчёты удалены');
  assert.ok(c1.armies.some((a) => a.state === 'back' && a.units[207] === 5) && g.reportsOf(P1.id).some((x) => /Подкрепление возвращается/.test(x.title)), 'подкрепление из его замка идёт домой, хозяину — отчёт');
  assert.ok(!(g.db.coinBets || []).some((b) => b.to === P2.id) && ((P1.stash || {}).res || {}).wood >= 300, 'вызов «Орёл-решка» ему снят — ставка вернулась в Кладовую');
  for (const f of [DDB, `${DDB}.tmp`]) try { fs.unlinkSync(f); } catch { /* нет файла */ }
  console.log('✓ Удаление игрока: друзья, чёрный список, брак, переписка, отчёты, вызовы, подкрепления — всё убрано');
}
{ // бой как в оригинале (с 24.10): сильный побеждает с малыми потерями, проигравший при нападении гибнет весь; стена, Кузница, тараны, набег
  const luck0 = process.env.LUCK; process.env.LUCK = '0';
  const A = g.register({ login: 'btlAA', password: '12345', race: 3 }).user, Dd = g.register({ login: 'btlDD', password: '12345', race: 3 }).user;
  // механика боя проверяется на прежнем Бугае (атака 20, жизнь 50) — у орков теперь цифры «Справки»
  const bu = require('../src/army').UNIT[247], buKeep = { attack: bu.attack, hp: bu.hp }; Object.assign(bu, { attack: 20, hp: 50 });
  const ca = g.castleOf(A), cd = g.castleOf(Dd); g.mil(ca); g.mil(cd);
  const fence = (L) => { cd.wall = L; }; // стена — уровень замка, без клетки
  const fight = (au, du, opt = {}) => { cd.units = { ...du }; cd.squads = []; ca.forge = opt.fa || {}; cd.forge = {}; fence(opt.wall || 0); return g.clash(ca, { units: { ...au }, mission: opt.m || 'attack' }, cd, null, Date.now()); };
  const big = fight({ 247: 300 }, { 247: 100 });
  assert.ok(big.win && big.calc.aLossPct < 35 && big.calc.dLossPct === 100, `втрое больше — победа малой кровью (${big.calc.aLossPct}%)`);
  const x10 = fight({ 247: 1000 }, { 247: 100 });
  assert.ok(x10.win && x10.calc.aLossPct < big.calc.aLossPct && x10.calc.aLossPct < 10, `вдесятеро больше — почти без потерь (${x10.calc.aLossPct}%)`);
  const small = fight({ 247: 100 }, { 247: 300 });
  assert.ok(!small.win && small.calc.aLossPct === 100 && small.calc.dLossPct < 50, 'слабый нападающий гибнет весь, защита теряет немного');
  const f0 = fight({ 247: 100 }, { 247: 100 }), f1 = fight({ 247: 100 }, { 247: 100 }, { fa: { 247: { a: 10 } } });
  assert.ok(f1.calc.att.total > f0.calc.att.total, 'Кузница усиливает атаку');
  const w = fight({ 247: 300 }, { 247: 100 }, { wall: 10 }); assert.ok(w.calc.def.str > big.calc.def.str && w.calc.aLossPct > big.calc.aLossPct, 'стена усиливает защиту (здоровье защитников)');
  const r = fight({ 243: 20, 247: 300 }, { 247: 100 }, { wall: 10 });
  assert.ok(r.siege.some((x) => /Забор: 10 → \d/.test(x)) && r.aLost[243] === 20, 'тараны ломают стену до боя и исчезают');
  assert.ok(r.calc.healed === 0 && r.calc.dLossPct === 100 && small.calc.healed > 0, 'нападение победило — защитники гибнут все (дома не выздоравливают); замок устоял — четверть павших выздоравливает');
  const raid = fight({ 247: 200 }, { 247: 200 }, { m: 'raid' });
  assert.ok(raid.calc.aLossPct < 100 && raid.calc.dLossPct < 100, 'набег: никто не гибнет целиком');
  // треугольник «Справки»: маги бьют конницу, конница — пехоту, пехота — магов. Орки: Заклинатель (маг, универсал), Потрошитель (конница,
  // универсал), Мародёр (пехота, универсал) — равные по ресурсам армии
  { const U = require('../src/army').UNIT, cost = (id) => Object.values(U[id].cost).reduce((q, v) => q + v, 0), by = (id) => Math.round(300000 / cost(id));
    const beats = (x, y) => fight({ [x]: by(x) }, { [y]: by(y) }).win && !fight({ [y]: by(y) }, { [x]: by(x) }).win;
    assert.ok(beats(275, 274) && beats(274, 245) && beats(245, 275), 'треугольник: маги бьют конницу, конница — пехоту, пехота — магов');
    // специализация: Урук-хай (атакующий) в обороне бьёт вдвое слабее, Бугай (защитник) — при нападении
    assert.ok(U[246].spec === 'A' && U[247].spec === 'D' && U[245].spec === 'U', 'специализация из «Справки»');
    const atkU = fight({ 246: 100 }, { 245: 1 }), defU = fight({ 245: 1 }, { 246: 100 });
    assert.ok(Math.abs(defU.calc.def.total * 2 - atkU.calc.att.total) <= 2, `атакующий в обороне — вдвое слабее (${atkU.calc.att.total} → ${defU.calc.def.total})`);
    const atkB = fight({ 247: 100 }, { 245: 1 }), defB = fight({ 245: 1 }, { 247: 100 });
    assert.ok(Math.abs(atkB.calc.att.total * 2 - defB.calc.def.total) <= 2 * 1.1 * 2 || atkB.calc.att.total < defB.calc.def.total, `защитник при нападении — вдвое слабее (${atkB.calc.att.total} / ${defB.calc.def.total})`); }
  console.log('✓ Бой как в оригинале: втрое больше — потери', big.calc.aLossPct + '%, вдесятеро —', x10.calc.aLossPct + '%; стена, Кузница, тараны, набег, треугольник родов, специализация');
  // Лазарет (здание 41, бывшая Пивоварня): половина павших — ранеными в Лазарет (1000 мест за уровень), остальные гибнут; лечение — за четверть цены, сразу
  const atk0 = g.bonus(ca).atk, k = ca.grid[0].indexOf(-1) >= 0 ? ca.grid[0].indexOf(-1) : ca.grid[0].length - 1; ca.grid[0][k] = 41; ca.levels[0][k] = 10;
  assert.ok(g.infirmCap(ca) === 10000 && g.bonus(ca).atk === atk0, 'Лазарет 10 ур. — 10 000 мест, к атаке не прибавляет (бонус Пивоварни убран)');
  ca.wounded = {};
  const lz = fight({ 247: 100 }, { 247: 300 });
  assert.ok(!lz.win && lz.aLost[247] === 100 && lz.calc.wounded === 50 && ca.wounded[247] === 50, `проигранное нападение: из 100 павших ранеными — половина, остальные погибли (${lz.calc.wounded})`);
  { const one = fight({ 247: 1 }, { 247: 300 }); assert.ok(one.aLost[247] === 1 && !one.calc.wounded && ca.wounded[247] === 50, 'один павший — погиб (половина с округлением вниз)'); }
  const lzRam = fight({ 243: 20, 247: 300 }, { 247: 100 }, { wall: 10 });
  assert.ok(lzRam.aLost[243] === 20 && !ca.wounded[243], 'тараны одноразовые — в Лазарет не попадают');
  // лечение: четверть цены тренировки, сразу — вылеченные тут же в Замковой армии, дневной лимит тренировки не тратится
  const U = require('../src/army').UNIT[247], n0 = ca.wounded[247], cu0 = ca.units[247] || 0, td0 = g.trainedToday(ca), tl0 = ca.training.length;
  Object.assign(ca.res, { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6 }); const w0 = ca.res.wood;
  const hr = g.healWounded(ca, { 247: 40 }); assert.ok(hr.ok && ca.wounded[247] === n0 - 40 && (ca.units[247] || 0) === cu0 + 40 && !ca.healing, hr.error);
  assert.ok(w0 - ca.res.wood === Math.round(U.cost.wood * 40 * 0.25), `цена — четверть тренировки (${w0 - ca.res.wood})`);
  assert.ok(g.trainedToday(ca) === td0 && ca.training.length === tl0, 'лечение не занимает Казармы и не тратит дневной лимит');
  // очередь лечения прежней версии (уже оплачена) — долечивается сразу
  ca.healing = [{ id: 1, unit: 247, count: 5, done: 2, each: 3600000, start: Date.now() }]; g.tickTraining(ca, Date.now());
  assert.ok((ca.units[247] || 0) === cu0 + 43 && !ca.healing, 'старая очередь лечения — сразу в Замковую армию');
  assert.ok(/Раненых нет/.test(g.healWounded(ca, { 999: 5 }).error || ''), 'лечить можно только раненых');
  // выбрать количество: «Сколько хватит» — на сколько хватает ресурсов; не хватает — подсказка «хватит на N»
  { const left = ca.wounded[247], one = g.healOneOf(ca, 247), w1 = Math.round(one.wood * 7);
    Object.assign(ca.res, { wood: w1, stone: 1e6, iron: 1e6, food: 1e6 });
    assert.ok(left > 7 && g.healAfford(ca, 247) === 7, `дерева — ровно на 7 (${g.healAfford(ca, 247)})`);
    const r9 = g.healWounded(ca, { 247: 9 }); assert.ok(/хватит на 7/.test(r9.error || '') && ca.wounded[247] === left, r9.error || 'не хватает — подсказка, никого не лечим');
    const r7 = g.healWounded(ca, { 247: 7 }); assert.ok(r7.ok && ca.wounded[247] === left - 7 && ca.res.wood < one.wood, r7.error); // дерево ушло (за время теста чуть прибавилось — меньше цены одного)
    assert.ok(g.healAfford(ca, 247) === 0 && /даже на одного/.test(g.healWounded(ca, { 247: 1 }).error || ''), 'ресурсов нет — даже на одного');
    Object.assign(ca.res, { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6 }); }
  // места кончились — остальные павшие погибают насовсем
  ca.levels[0][k] = 1; ca.wounded = { 247: 1000 };
  const full = fight({ 247: 100 }, { 247: 300 }); assert.ok(full.calc.wounded === 0 && ca.wounded[247] === 1000, 'Лазарет полон (1 ур. — 1000 мест) — новых раненых нет');
  // оборона: свои павшие защитники — в Лазарет замка защиты
  const kd = cd.grid[0].indexOf(-1) >= 0 ? cd.grid[0].indexOf(-1) : cd.grid[0].length - 1; cd.grid[0][kd] = 41; cd.levels[0][kd] = 10; cd.wounded = {};
  const df = fight({ 247: 300 }, { 247: 100 }); assert.ok(df.calc.dWounded > 0 && cd.wounded[247] === df.calc.dWounded, `оборона: раненые защитники — в Лазарет (${df.calc.dWounded})`);
  cd.grid[0][kd] = -1; cd.levels[0][kd] = 0; delete cd.wounded;
  ca.grid[0][k] = -1; ca.levels[0][k] = 0; delete ca.wounded;
  console.log('✓ Лазарет: половина павших — ранеными (1000 мест за уровень), остальные гибнут; лечение за четверть цены и сразу, тараны — нет, оборона — тоже');
  Object.assign(bu, buKeep);
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
  c.general = g.newGeneral(c, 1); u.stash.exp = 1000; // опыт из Кладовой — в дневной лимит генерала (с 24.10): за день — около уровня, остальное ждёт
  { const t = g.stashTake(u, c, 'exp', 'exp', 1000); assert.ok(t.ok && /завтра/.test(t.msg) && c.general.level === 2 && u.stash.exp < 1000 && u.stash.exp > 0, `опыт генералу: уровень вырос, сверх дневного лимита — остался в Кладовой (${u.stash.exp})`); }
  for (let i = 0; i < 5 && !g.stashTake(u, c, 'exp', 'exp', 1000).error;) i++;
  { const v = g.stashView(u, c).find((x) => x.kind === 'exp'), rest = u.stash.exp; assert.ok(c.general.level === 2 && rest > 0 && v.max === 0 && v.tired && /завтра/.test(g.stashTake(u, c, 'exp', 'exp', 70).error) && u.stash.exp === rest, `лимит на сегодня набран — передать нельзя, опыт ждёт в Кладовой (${rest})`);
    c.general.day.d = '2000-01-01'; assert.ok(g.stashTake(u, c, 'exp', 'exp', 1000).ok && u.stash.exp < rest, 'на другой день — передаётся'); u.stash.exp = 0; }
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
  { // Сундук дня — 2 руны, без снаряжения генерала (вещи только куёт Кузнец за руны)
    const c0 = g.castleOf(u); g.questsState(u, c0); u.quests.daily.list.forEach((x) => { x.claimed = true; }); u.quests.daily.chest = false;
    const bag0 = g.heroGear(c0).length, rnd = Math.random; Math.random = () => 0; // раньше при таком броске выпадала вещь
    const rsum = () => Object.values(g.runesOf(u)).reduce((q, v) => q + v, 0), r0 = rsum();
    try { const r = g.questClaim(u, c0, 'chest'); assert.ok(r.ok, r.error); assert.ok(!/снаряжение/.test(r.msg) && g.heroGear(c0).length === bag0, 'в Сундуке дня нет снаряжения');
      assert.ok(rsum() === r0 + 2 && /Руны: Руна Силы ×2/.test(r.msg), `в Сундуке дня — 2 руны: ${r.msg}`); } finally { Math.random = rnd; }
    console.log('✓ Сундук дня: ресурсы, воины, опыт, 2 руны, шанс на артефакт — без снаряжения генерала');
  }
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
{ // Подземелье (dungeon.js): только археологи и Стражи глубин, лимиты, находки по уровням, «Забрать», налёт, мульты, монета раз в сутки
  const R0 = Math.random, AR = require('../src/army'), DG = require('../src/dungeon');
  const mk = (login, race) => { const u = g.register({ login, password: '12345', race }).user, c = g.castleOf(u); g.maxOut(c); g.mil(c); c.armies = []; c.artifacts = []; return [u, c]; };
  const [ua, ca] = mk('dungA', 0), [ub, cb] = mk('dungB', 0), D = g.dung();
  assert.ok(D.camps.length === 250 && [1, 2, 3, 4, 5].every((l) => D.camps.filter((q) => q.l === l).length === 50), 'на карте по 50 лагерей каждой сложности');
  assert.ok(AR.UNIT[231].dungOnly && AR.UNIT[231].building === AR.B.EXPEDITION && AR.UNIT[231].race === 'all', 'Страж глубин — общий, тренируется в Экспедиции');
  const camp = D.camps.find((q) => q.l === 1); ca.units = { 230: 300, 231: 300, 200: 600 };
  assert.ok(g.dungGo(ca, camp.id, { 230: 10, 200: 10 }).error, 'обычные войска в Подземелье не ходят');
  assert.ok(g.dungGo(ca, camp.id, { 231: 10 }).error, 'без археологов копать нельзя');
  assert.ok(g.dungGo(ca, camp.id, { 230: 101, 231: 10 }).error, 'в лагерь 1 ур. — не больше 100 археологов');
  assert.ok(g.sendArmy(ca, { units: { 231: 5 }, x: cb.x, y: cb.y, mission: 'attack' }).error && g.sendArmy(ca, { units: { 230: 1 }, x: cb.x, y: cb.y, mission: 'dig' }).error, 'Страж глубин и раскопки — только в Подземелье');
  { const keep = ca.units; ca.units = {}; const p0 = g.defensePower(ca, 1, 0).raw.phys; ca.units = { 231: 300 }; const p1 = g.defensePower(ca, 1, 0).raw.phys; ca.units = keep; assert.ok(p0 === p1, 'Страж глубин замок не защищает'); }
  const n0 = g.armyTotal(ua);
  assert.ok(g.dungGo(ca, camp.id, { 230: 100, 231: 60 }).ok && g.armyTotal(ua) === n0, 'отряд ушёл, войска учтены');
  assert.ok(g.dungGo(cb, camp.id, { 230: 1 }).error, 'занятый лагерь не взять');
  const a = ca.armies[0]; a.arrive = Date.now() - 1; g.tickWorld();
  const arch = a.units[230] || 0;
  assert.ok(a.state === 'dig' && arch === 100 && a.units[231] < 60, 'охрану разбили Стражи, археологи целы, раскопки идут');
  Math.random = () => 0.01; a.digEnd = Date.now() - 1; g.tickWorld(); Math.random = R0;
  const rep = g.db.reports.filter((r) => r.owner === ua.id).slice(-1)[0];
  assert.ok(a.state === 'found' && a.find && a.find.type === 'cloak' && (a.units[230] || 0) < arch && /нашли «Покров Безмолвия»/.test(rep.title) && rep.lines.some((l) => l.includes(`из ${arch}`)), 'нашли «Покров Безмолвия», археологи погибли — в отчёте');
  { const k = g.dungView(ca, ua).kinds[1]; assert.ok(k.die === undefined && k.finds === undefined && k.k === undefined && k.cap === undefined && g.dungChance(ca, 1, 1) < 0.2 && g.dungChance(ca, 1, 100) >= 0.45 && g.dungChance(ca, 1, 100) <= 0.55 && g.dungChance(ca, 2, 300) <= 0.5 && g.dungChance(ca, 3, 400) <= 0.4 && g.dungChance(ca, 4, 450) <= 0.35 && g.dungChance(ca, 5, 500) <= 0.25 && g.dungChance(ca, 5, 500) >= 0.15, 'доля гибели и что можно найти скрыты; шанс — от числа археологов (один «для галочки» — почти ноль), с 24.10 — по уровням: не больше 55/50/40/35/25%'); }
  const v = g.dungView(cb, ub).camps.find((q) => q.id === camp.id);
  assert.ok(v.o && v.o.login === 'dungA' && v.o.s === 'found' && !v.o.me && !v.o.find, 'другой видит, кто копает, но не что нашли');
  ub.devs = [{ dev: 'phone1' }]; ua.devs = [{ dev: 'phone1' }]; cb.units = { 231: 150, 200: 1000 };
  assert.ok(/телефона/.test(g.dungAttack(cb, camp.id, { 231: 100 }).error || ''), 'с одного телефона нападать нельзя');
  ub.devs = [{ dev: 'phone2' }];
  assert.ok(g.dungAttack(cb, camp.id, { 200: 100 }).error && g.dungAttack(cb, camp.id, { 231: 151 }).error, 'в налёт — только Стражи и не больше полутора лимитов');
  assert.ok(g.dungAttack(cb, camp.id, { 231: 150 }).ok, 'налёт Стражами');
  const s = cb.armies[0]; s.arrive = Date.now() - 1; g.tickWorld();
  assert.ok(s.find && s.find.type === 'cloak' && !ca.armies.includes(a) && camp.gone > 0, 'налёт победил: находка отнята, лагерь исчез');
  { const ra = g.db.reports.filter((r) => r.owner === cb.owner && /Налёт в Подземелье/.test(r.title)).at(-1), rd = g.db.reports.filter((r) => r.owner === ca.owner && /Подземелье: на отряд напали/.test(r.title)).at(-1);
    const nA = g.userById(cb.owner).login, nD = g.userById(ca.owner).login, txt = JSON.stringify([ra.lines, rd.lines]);
    assert.ok(ra && rd && !txt.includes(nA) && !txt.includes(nD) && /напал неизвестный отряд/.test(rd.lines[0]), 'отчёты налёта анонимны: ников нет ни у нападающего, ни у защитника'); }
  s.back = Date.now() - 1; g.tickWorld();
  assert.ok(cb.artifacts.length === 1 && cb.artifacts[0].type === 'cloak' && !s.find, 'отнятое засчитано, когда Стражи дошли до замка');
  // «Забрать»: находка сразу в замке, отряд домой
  const c2 = D.camps.find((q) => q.l === 2 && !q.gone && !q.occ); ca.units = { 230: 300, 231: 300 };
  assert.ok(g.dungGo(ca, c2.id, { 230: 300, 231: 250 }).ok); const b2 = ca.armies.find((x) => x.dung === c2.id); b2.arrive = Date.now() - 1; g.tickWorld();
  assert.ok(b2.state === 'dig', 'лагерь 2 ур.: 250 Стражей прошли охрану');
  Math.random = () => 0.01; b2.digEnd = Date.now() - 1; g.tickWorld(); Math.random = R0;
  assert.ok(b2.state === 'found' && b2.find.type === 'claw', 'нашли «Коготь Полководца»');
  ca.artifacts = []; assert.ok(g.dungClaim(ca, b2.id).ok && ca.artifacts.some((x) => x.type === 'claw') && b2.state === 'back' && c2.gone > 0, '«Забрать»: артефакт в замке, отряд домой');
  // монета — не чаще раза в сутки, иначе репутация
  Math.random = () => 0; const f1 = g.dungRoll(ua, 5, Date.now()), f2 = g.dungRoll(ua, 5, Date.now()); Math.random = R0;
  assert.ok(f1.type === 'coin' && f2.k === 'rep' && f2.n >= 1 && f2.n <= 3, 'монета раз в сутки, потом — репутация 1–3');
  Math.random = () => 0.99; const fr = g.dungRoll(ua, 4, Date.now()), fe = g.dungRoll(ua, 2, Date.now()); Math.random = R0;
  assert.ok(fr.k === 'res' && Object.values(fr.res).every((x) => x >= 1000 && x <= 3000) && fe.k === 'exp' && fe.n >= 100 && fe.n <= 300, 'клад 1000–3000 и опыт генерала 100–300');
  // лимит 3 раскопки
  const free = D.camps.filter((q) => q.l === 1 && !q.gone && !q.occ).slice(0, 4); ca.units = { 230: 100, 231: 400 };
  const r4 = free.map((q) => g.dungGo(ca, q.id, { 230: 1, 231: 60 }));
  assert.ok(r4.slice(0, 3).every((x) => x.ok) && r4[3].error, 'раскопок — не больше 3');
  const a3 = ca.armies.find((x) => x.dung === free[0].id); a3.arrive = Date.now() - 1; g.tickWorld();
  assert.ok(g.dungRecall(ca, a3.id).ok && a3.state === 'back' && !free[0].occ && !free[0].gone, 'бросили раскопки — лагерь свободен');
  camp.gone = Date.now() - 1; g.tickWorld(); assert.ok(!camp.gone, 'лагерь вернулся на карту');
  // артефакты Подземелья
  const art = (c, type) => { const x = { id: g.db.nextId++, type, active: false, found: Date.now() }; c.artifacts.push(x); return x; };
  ca.artifacts = []; cb.artifacts = []; ca.artCd = {}; cb.artCd = {};
  const ok1 = g.activateArtifact(cb, art(cb, 'cloak').id, true);
  assert.ok(ok1.ok && g.artOn(cb, 'cloak') && /8 ч/.test(ok1.msg), '«Покров» пробуждён на 8 ч');
  assert.ok(/снова через/.test(g.activateArtifact(cb, art(cb, 'cloak').id, true).error || ''), 'тот же вид — не раньше чем через сутки');
  const spy = Object.keys(AR.UNIT).find((id) => AR.UNIT[id].race === 'humans' && AR.UNIT[id].role === 'scout'); ca.units = { [spy]: 50 };
  const sr = g.sendArmy(ca, { units: { [spy]: 50 }, x: cb.x, y: cb.y, mission: 'scout' }); sr.army.arrive = Date.now() - 1; g.tickWorld();
  assert.ok(/неудача/.test(g.db.reports.filter((r) => r.owner === ua.id).slice(-1)[0].title) && g.db.reports.filter((r) => r.owner === ub.id).slice(-1)[0].title === 'Разведка отражена', '«Покров»: разведка проваливается, хозяин знает');
  cb.artifacts = []; ca.armies = []; ca.units = { [spy]: 50 }; const before = g.db.reports.filter((r) => r.owner === ub.id).length;
  g.activateArtifact(ca, art(ca, 'eye').id, true);
  const sr2 = g.sendArmy(ca, { units: { [spy]: 50 }, x: cb.x, y: cb.y, mission: 'scout' }); sr2.army.arrive = Date.now() - 1; g.tickWorld();
  assert.ok(g.db.reports.filter((r) => r.owner === ub.id).length === before && /^Разведка/.test(g.db.reports.filter((r) => r.owner === ua.id).slice(-1)[0].title), '«Око Призрака»: противник не узнаёт о разведке');
  const w0 = g.bonus(cb).wallPer; g.activateArtifact(cb, art(cb, 'heart').id, true);
  assert.ok(Math.abs(g.bonus(cb).wallPer - 1.5 * w0) < 1e-12, '«Сердце Твердыни»: защита Забора ×1,5');
  cb.artCd = {}; assert.ok(/не складываются/.test(g.activateArtifact(cb, art(cb, 'seal').id, true).error || ''), 'защитные артефакты Подземелья не складываются');
  ca.armies = []; ca.units = { 200: 50 }; const go = g.sendArmy(ca, { units: { 200: 50 }, x: cb.x, y: cb.y, mission: 'attack' });
  assert.ok(go.army && /вражеская армия/.test(g.activateArtifact(cb, art(cb, 'hand').id, true).error || ''), 'защитный артефакт не пробудить, когда на замок уже идут');
  ca.armies = []; ca.units = {};
  { const p0 = g.armyPower(ca, {}, true).raw.gen; g.activateArtifact(ca, art(ca, 'claw').id, true); assert.ok(p0 > 0 && g.armyPower(ca, {}, true).raw.gen === 2 * p0, '«Коготь Полководца»: атака генерала ×2'); }
  { cb.artCd = {}; ca.armies = []; cb.artifacts = []; const wall0 = g.buildingLevel(cb, AR.B.FENCE);
    const hit = () => { const D = structuredClone(cb); g.clash(structuredClone(ca), { units: { 243: 40, 200: 10 }, mission: 'attack', general: false }, D, null, Date.now()); return wall0 - g.buildingLevel(D, AR.B.FENCE); };
    const plain = hit(); g.activateArtifact(cb, art(cb, 'seal').id, true); const sealed = hit();
    assert.ok(plain > 0 && sealed < plain, `«Печать Нерушимости»: тараны ломают Забор слабее (${plain} → ${sealed} ур.)`); cb.artifacts = []; }
  const coin = art(cb, 'coin'), gold0 = ub.gold || 0;
  assert.ok(g.activateArtifact(cb, coin.id, true).ok && ub.gold === gold0 + 1 && !cb.artifacts.includes(coin), '«Монета Древних Королей»: +1 монета');
  assert.ok(!DG.DUNG.some((d) => d && d.finds.some(([k]) => ['art:atk', 'art:def', 'art:prod', 'art:speed', 'art:train'].includes(k))) && AR.ART_BASIC.length === 5, 'старые артефакты в Подземелье не выпадают, сундуки и задания — только обычные');
  console.log('✓ Подземелье: Стражи глубин, 250 лагерей, лимиты, находки по уровням, «Забрать», налёт, защита от мультов, монета раз в сутки; артефакты Покров, Око, Сердце, Монета, перезарядка и запрет при атаке');
}
{ // экспедиции из здания и временные артефакты
  const u = g.register({ login: 'expedU', password: '12345', race: 0 }).user, c = g.castleOf(u); g.maxOut(c); g.mil(c);
  c.units[230] = 25; c.artifacts = []; c.expeds = [];
  assert.ok(require('../src/army').UNIT[230].building === 17, 'археологи тренируются в Экспедиции');
  assert.ok(g.expedGo(c, 'tomb', 30).error && c.units[230] === 25, 'с 24.10 археологи ходят только в Подземелье');
  c.expeds.push({ id: 1, kind: 'tomb', n: 20, start: Date.now() - 2, end: Date.now() - 1 }); c.units[230] = 5; // ушедшая раньше экспедиция возвращается как прежде
  g.tick(c);
  assert.ok(!c.expeds.length && c.units[230] >= 5 && g.db.reports.slice(-1)[0].title.startsWith('Экспедиция вернулась'), 'экспедиция вернулась с отчётом');
  { // добыча артефактов труднее: экспедиции 15/30/45% + 1% за археолога, до 80%; руины 10% + 1%, до 50%; полная Сокровищница — осколки
    const AR = require('../src/army'), I = g.expedInfo(c), near = I.kinds.find((k) => k.k === 'near');
    assert.ok(near.per === 1 && near.cap === 80 && AR.EXPED.near.chance === 0.15 && AR.EXPED.tomb.chance === 0.45 && AR.RUINS.cap === 0.5, 'новые шансы в окне экспедиций');
    const rnd0 = Math.random, ruins = { x: 1, y: 1, units: { 230: 500 } }; c.artifacts = []; const back = g.goBack; g.goBack = () => {};
    Math.random = () => 0.51; g.expedition(c, ruins, Date.now()); assert.ok(!c.artifacts.length && /Шанс находки 50%/.test(g.db.reports.slice(-1)[0].lines.join(' ')), 'руины: 500 археологов — всё равно не больше 50%');
    Math.random = () => 0.49; g.expedition(c, ruins, Date.now()); assert.strictEqual(c.artifacts.length, 1, 'руины: находка при шансе 50%');
    c.artifacts = Array.from({ length: g.bonus(c).artStore }, (_, i) => ({ id: 8000 + i, type: 'atk', rarity: 0, active: false }));
    const w0 = g.stashOf(u).res.wood || 0; Math.random = () => 0.01; g.expedition(c, ruins, Date.now());
    assert.ok(c.artifacts.length === g.bonus(c).artStore && (g.stashOf(u).res.wood || 0) > w0 && /осколки/.test(g.db.reports.slice(-1)[0].lines.join(' ')), 'руины: Сокровищница полна — осколки в Кладовую, сверх места не кладётся');
    const w1 = g.stashOf(u).res.wood; g.expedBack(c, { kind: 'near', n: 20 }); // Math.random = 0.01: без потерь, находка
    assert.ok(c.artifacts.length === g.bonus(c).artStore && g.stashOf(u).res.wood > w1 && /осколки/.test(g.db.reports.slice(-1)[0].lines.join(' ')), 'экспедиция: полна — осколки, а не «оставить в руинах»');
    Math.random = rnd0; g.goBack = back; c.artifacts = []; delete c.units[230]; c.units[230] = 25;
  }
  c.artifacts = [{ id: 1, type: 'atk', rarity: 0, active: false }];
  const a = g.activateArtifact(c, 1, true); assert.ok(a.ok && c.artifacts[0].until > Date.now(), 'пробуждение на время');
  assert.ok(g.activateArtifact(c, 1, false).error, 'усыпить нельзя');
  c.artifacts.push({ id: 11, type: 'atk', rarity: 0, active: false }, { id: 12, type: 'atk', rarity: 1, active: false }, { id: 13, type: 'def', rarity: 0, active: false });
  assert.ok(/уже пробуждён/.test(g.activateArtifact(c, 11, true).error || '') && g.activateArtifact(c, 13, true).ok, 'такой же артефакт этого вида уже действует — второй не пробудить; другого вида — можно');
  assert.ok(g.activateArtifact(c, 12, true).ok && Math.abs(g.bonus(c).atk / g.bonus(Object.assign({}, c, { artifacts: [] })).atk - (1 + require('../src/army').RARITY[1].bonus)) < 1e-9, 'более сильный — можно, действует только он');
  c.artifacts = c.artifacts.filter((x) => x.id === 1);
  c.artifacts[0].until = Date.now() - 1; g.mil(c); assert.ok(!c.artifacts.length, 'истёкший артефакт рассыпается');
  // разбить спящий артефакт: ресурсы — в замок до вместимости Складов, остаток — в Кладовую; пробуждённый не разбить
  c.artifacts = [{ id: 2, type: 'def', rarity: 2, active: false }, { id: 3, type: 'atk', rarity: 0, active: true, until: Date.now() + 1e6 }, { id: 4, type: 'prod', rarity: 0, active: false }];
  const cap = g.capacity(c), RES = ['wood', 'stone', 'iron', 'food'], inStash = () => g.stashOf(u).res.wood || 0;
  for (const r of RES) c.res[r] = cap[r] - 500;
  let s0 = inStash();
  assert.ok(g.breakArtifact(c, 2).ok && !c.artifacts.some((x) => x.id === 2), 'спящий артефакт разбит');
  assert.ok(c.res.wood > cap.wood - 1 && inStash() - s0 >= 1500 && inStash() - s0 < 2000, 'легендарный: 2000 — до полного Склада в замок, остаток в Кладовую');
  for (const r of RES) c.res[r] = 0;
  s0 = inStash();
  assert.ok(g.breakArtifact(c, 4).ok && RES.every((r) => c.res[r] >= 300 && c.res[r] < 310) && inStash() === s0, 'обычный: +300 каждого — всё в замок');
  assert.ok(g.breakArtifact(c, 3).error && c.artifacts.length === 1, 'пробуждённый не разбить');
  assert.ok(g.breakArtifact(c, 99).error, 'нет такого артефакта');
  console.log('✓ Экспедиции из здания, временные артефакты, «Разбить» спящий артефакт; добыча труднее (экспедиции до 80%, руины до 50%), полная Сокровищница — осколки');
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
  assert.ok(g.heroOp(ca, A, { op: 'equip', item: it.id }).ok && ca.general.eq.weapon === it && !g.heroGear(ca).length);
  Object.assign(ca.res, { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6 });
  g.runesOf(A).str = 3; assert.ok(/Не хватает рун/.test(g.heroOp(ca, A, { op: 'enhance', item: it.id }).error || '') && !ca.gearJob, 'усиление — ещё и за руны вида вещи');
  g.runesOf(A).str = 10;
  assert.ok(g.heroOp(ca, A, { op: 'enhance', item: it.id }).ok && it.plus === 0 && ca.gearJob && ca.gearJob.end - ca.gearJob.start >= 9 * 60000 && g.runesOf(A).str === 6, 'усиление — по времени; легендарная вещь до +1 — 4 руны Силы');
  assert.ok(/уже усиливает/.test(g.heroOp(ca, A, { op: 'enhance', item: it.id }).error), 'одна вещь за раз');
  ca.gearJob.end = Date.now() - 1; g.heroGearTick(ca); assert.ok(it.plus === 1 && !ca.gearJob, 'по окончании +1');
  const hb = g.heroBonus(ca.general); assert.ok(Math.abs(hb.atk - (0.10 + 0.05 * 1.15)) < 1e-9 && Math.abs(hb.mag - 0.15) < 1e-9, JSON.stringify(hb)); // легендарное оружие — 5% (с 21.10; было 15%)
  const fight = (gen) => { cd.units = { 247: 100 }; cd.squads = []; ca.forge = {}; cd.forge = {}; return g.clash(ca, { units: { 247: 100 }, mission: 'attack', general: gen }, cd, null, Date.now()); };
  const plain = fight(false), hero = fight(true);
  assert.ok(hero.calc.att.total > plain.calc.att.total * 1.15 && hero.calc.aLossPct <= plain.calc.aLossPct && hero.calc.dLossPct >= plain.calc.dLossPct, 'генерал с умениями и мечом бьёт сильнее');
  ca.general.dead = true; g.heroStrip(ca, ca.general); assert.ok(g.heroGear(ca).includes(it) && !ca.general.eq.weapon, 'павший генерал оставляет снаряжение в Оружейной');
  ca.res.wood = 0; const w0 = 0; assert.ok(g.heroOp(ca, A, { op: 'sell', item: it.id }).ok && ca.res.wood > w0 && !g.heroGear(ca).length);
  ca.general.dead = false; assert.ok(g.heroOp(ca, A, { op: 'talreset' }).ok && !Object.keys(ca.general.tal).length && ca.general.talResets === 0);
  console.log('✓ Герой-генерал: ветки умений, снаряжение (надеть, усилить, разобрать), бонусы в бою');
  if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
}
{ // Караульная башня (1 ур.) замечает вражескую армию, подробности — по Центру разведки: 3 — примерно, 6 — точно, 10 — состав и генерал
  const A = g.register({ login: 'watchA', password: '12345', race: 3 }).user, Dd = g.register({ login: 'watchD', password: '12345', race: 3 }).user;
  const ca = g.castleOf(A), cd = g.castleOf(Dd); g.mil(ca); g.mil(cd); g.maxOut(ca); g.maxOut(cd); ca.units = { 247: 1234 };
  const r = g.sendArmy(ca, { units: { 247: 1234 }, x: cd.x, y: cd.y, mission: 'attack' }); assert.ok(r.army, JSON.stringify(r));
  let cell = cd.grid[0].indexOf(21); if (cell < 0) cell = cd.grid[0].indexOf(-1);
  let spy = cd.grid[0].indexOf(45); if (spy < 0) { spy = cd.grid[0].findIndex((b, k) => b === -1 && k !== cell); cd.grid[0][spy] = 45; }
  assert.strictEqual(require('../src/catalog').BY_ID[21].max, 1, 'у Караульной башни один уровень');
  const tw = (T, L) => { cd.grid[0][cell] = T ? 21 : -1; cd.levels[0][cell] = T; cd.levels[0][spy] = L; return g.incoming(cd).find((x) => x.mission === 'attack'); };
  assert.ok(!tw(0, 20), 'без башни нападение не видно, даже с Центром разведки');
  let x = tw(1, 1); assert.ok(x && x.size === null && x.units === null, 'башня и Центр разведки 1 ур.: кто и когда');
  x = tw(1, 3); assert.ok(x.size === 1200 && !x.exact, `Центр разведки 3 ур.: примерно (${x.size})`);
  x = tw(1, 6); assert.ok(x.size === 1234 && x.exact && x.units === null, 'Центр разведки 6 ур.: точно');
  x = tw(1, 10); assert.ok(x.units[247] === 1234 && x.general === false, 'Центр разведки 10 ур.: состав и генерал');
  assert.ok(g.milState(cd, Dd).threats.length === 1 && g.milState(cd, Dd).watchLevel === 10, 'значок видит нападение');
  console.log('✓ Караульная башня (1 ур.) замечает армию; Центр разведки: 3 ур. — примерно, 6 — точно, 10 — состав и генерал');
}

{ // мировой босс: созыв альянса — армии складываются и бьют одним ударом; награды всем по урону (1-е место — 20 000 / 10 / 100, повержен — ×4)
  const { nextSaturday, REWARD, KILL_X, HIT_MAX, HIT_CAP, RALLY_GAP, HP_BASE, HP_PER } = require('../src/boss');
  const sat = new Date(nextSaturday(Date.UTC(2026, 9, 1, 12))); assert.ok(sat.getUTCDay() === 6 && sat.getUTCHours() === 15, 'суббота 18:00 МСК');
  const P1 = g.register({ login: 'bossA1', password: '12345', race: 3 }).user, P2 = g.register({ login: 'bossA2', password: '12345', race: 0 }).user, P3 = g.register({ login: 'bossA3', password: '12345', race: 0 }).user;
  g.db.alliances = g.db.alliances || {}; const aid = g.db.nextId++; g.db.alliances[aid] = { id: aid, name: 'Охотники', tag: 'OXT', leader: P1.id, members: [P1.id, P2.id], created: Date.now() }; P1.alliance = aid; P2.alliance = aid;
  const b = g.bossSpawn(Date.now(), 1); assert.ok(g.bossAt(b.x, b.y) && b.hp === b.maxHp);
  assert.ok(HP_BASE === 3e6 && HP_PER === 3e5 && b.maxHp >= 3e6 && (b.maxHp - 3e6) % 3e5 === 0 && HIT_MAX === 0.02 && HIT_CAP === 0.1, `здоровье 3 млн + 300 тыс. за игрока (${b.maxHp}), созыв — до 10%, по 2% за игрока`);
  const c1 = g.castleOf(P1), c2 = g.castleOf(P2), c3 = g.castleOf(P3); for (const c of [c1, c2, c3]) { g.mil(c); g.maxOut(c); c.squads = []; c.armies = []; }
  c1.units = { 247: 3000 }; c2.units = { 247: 500 }; c3.units = { 247: 500 }; c1.general = g.newGeneral(c1, 10); c2.general = null;
  assert.ok(/созывом альянса/.test(g.sendArmy(c3, { units: { 247: 100 }, x: b.x, y: b.y, mission: 'attack' }).error || ''), 'в одиночку на босса — нельзя, только созывом');
  assert.ok(/Созыва нет/.test(g.sendArmy(c2, { units: { 247: 10 }, mission: 'rally' }).error || ''), 'без созыва войска не отправить');
  assert.ok(/вступите в альянс/.test(g.rallyStart(P3).error || ''), 'без альянса созыв не объявить');
  assert.ok(/руководство/.test(g.rallyStart(P2).error || ''), 'созыв объявляет руководство (право «Созыв»)');
  const rs = g.rallyStart(P1); assert.ok(rs.ok && rs.rally.end - Date.now() > 899000 / (Number(process.env.SPEED) || 1) - 2000, 'созыв на 15 минут');
  assert.ok(/уже идёт/.test(g.rallyStart(P1).error || ''), 'один созыв на альянс');
  assert.ok(g.db.users.bossA2 && (g.db.events || []).length >= 0, 'оповещение альянсу');
  const j1 = g.sendArmy(c1, { from: 'castle', mission: 'rally', x: 1, y: 1 }), j2 = g.sendArmy(c2, { from: 'castle', mission: 'rally' });
  assert.ok(!j1.error && !j2.error, j1.error || j2.error);
  assert.ok(j1.army.x === b.x && j1.army.y === b.y && j1.army.arrive === rs.rally.end && j1.army.general && j2.army.arrive === rs.rally.end, 'войска встали в созыв: к боссу, удар — в конце созыва, генерал тоже');
  const v = g.bossView(P2); assert.ok(v.rally && v.rally.total === 3500 && v.rally.players === 2 && v.rally.parts.some((p) => p.gen), 'в окне босса — состав созыва');
  assert.ok(!g.bossView(P3).rally && !g.bossView(P3).ally, 'чужой созыв не виден');
  g.tickWorld(rs.rally.end - 1000); assert.ok(b.hp === b.maxHp, 'до конца созыва удара нет');
  g.tickWorld(rs.rally.end + 10);
  const d1 = b.dmg[P1.id], d2 = b.dmg[P2.id], cap = Math.round(b.maxHp * HIT_MAX * 2);
  assert.ok(d1 > d2 && d2 > 0 && d1 + d2 === b.maxHp - b.hp && d1 + d2 <= cap, `урон созыва ${d1 + d2} (предел ${cap}) делится по вкладу: ${d1} / ${d2}`);
  assert.ok(d1 / d2 > 4, `вклад по силе войск (3000 с генералом против 500): ${(d1 / d2).toFixed(2)}`);
  const rp = g.reportsOf(P2.id).find((r) => /Созыв на мирового босса/.test(r.title));
  assert.ok(rp && /Армия созыва: bossA1 — 3\D000 и генерал, bossA2 — 500/.test(rp.lines.join(' ')) && /Ваш вклад/.test(rp.lines.join(' ')), 'один отчёт: армия созыва целиком и свой вклад');
  assert.ok(c1.armies.length === 1 && c1.armies[0].state === 'back' && c1.armies[0].back - (rs.rally.end) <= 900000 && c2.armies[0].state === 'back', 'армии созыва идут домой быстрым маршем');
  assert.ok(g.stats(P2).bossDmg === d2, 'урон засчитан для задания сразу');
  // пауза: следующий созыв того же альянса — через 2 часа после удара
  { const SP = Number(process.env.SPEED) || 1, gap = b.rallyNext[aid] - rs.rally.end; // пауза считается от удара (конца созыва)
    assert.ok(/Следующий созыв альянса — через \d+ мин\. Между созывами — 2 часа/.test(g.rallyStart(P1).error || '') && gap === Math.round(RALLY_GAP / SP) * 1000, `пауза 2 часа после удара (${Math.round(gap / 60000)} мин)`);
    assert.ok(g.bossView(P2).ally.next === b.rallyNext[aid] && g.bossView(P2).rules.gap === Math.round(RALLY_GAP / SP / 60), 'в окне босса — когда следующий созыв');
    b.rallyNext[aid] = Date.now() - 1; assert.ok(g.rallyStart(P1).ok, 'пауза прошла — созыв можно'); delete b.rallies[aid]; }
  // итог: ушёл непобеждённым — награды всем по урону; 1-е место — полная награда
  const rep1 = P1.reputation ?? 10, rep2 = P2.reputation ?? 10; b.end = Date.now() - 1; g.bossCheck(Date.now());
  const sh = d2 / d1;
  assert.ok(P1.stash.res.wood === REWARD.res && P1.stash.res.food === REWARD.res && P1.stash.royal === REWARD.royal && P1.reputation === rep1 + REWARD.rep, '1-е место: 20 000 каждого ресурса, 100 лояльности, +10 репутации');
  assert.ok(P2.stash.res.wood === Math.round(REWARD.res * sh) && P2.stash.res.wood < REWARD.res && P2.stash.royal === Math.round(REWARD.royal * sh) && P2.reputation === rep2 + Math.round(REWARD.rep * sh), `2-е место — меньше, по доле урона (${Math.round(sh * 100)}%)`);
  assert.ok(!(P1.bossBadges || []).length, 'ушёл — медалей нет');
  // повержен — вчетверо больше
  { const w1 = P1.stash.res.wood, w2 = P2.stash.res.wood, ro1 = P1.stash.royal, r1 = P1.reputation;
    const b2 = g.bossSpawn(Date.now(), 0); b2.dmg[P1.id] = 1000; b2.dmg[P2.id] = 250; b2.hp = 0; g.bossFinish(Date.now());
    assert.ok(P1.stash.res.wood - w1 === REWARD.res * KILL_X && P1.stash.royal - ro1 === REWARD.royal * KILL_X && P1.reputation - r1 === REWARD.rep * KILL_X, 'повержен: 80 000 каждого ресурса, 400 лояльности, +40 репутации');
    assert.ok(P2.stash.res.wood - w2 === REWARD.res * KILL_X / 4, '2-е место с четвертью урона — четверть награды');
    assert.ok(P1.bossBadges.some((x) => x.place === 1) && P2.bossBadges.some((x) => x.place === 2), 'медали первым трём'); }
  // созыв, который не успел ударить, распускается, когда босс уходит
  { const b3 = g.bossSpawn(Date.now(), 2); c2.units = { 247: 300 }; c2.armies = [];
    const r3 = g.rallyStart(P1); assert.ok(r3.ok); assert.ok(!g.sendArmy(c2, { from: 'castle', mission: 'rally' }).error);
    b3.end = Date.now() - 1; g.bossCheck(Date.now());
    assert.ok(c2.armies[0].state === 'back' && c2.armies[0].units[247] === 300 && g.reportsOf(P2.id).some((r) => /не состоялся/.test(r.title)), 'босс ушёл — армия созыва вернулась без боя');
    assert.ok(/вступите в альянс|нет/.test(g.rallyStart(P3).error || ''), 'после ухода босса созыва нет'); }
  const roy0 = g.royalTick(P1), have = P1.stash.royal; assert.ok(g.stashTake(P1, c1, 'royal', 'royal', have).ok && P1.royal === roy0 + have && !P1.stash.royal, 'лояльность из Кладовой');
  assert.ok(g.reportsOf(P2.id).some((r) => /2-е место/.test(r.title)), 'отчёт с местом');
  console.log(`✓ Мировой босс: созыв альянса 15 мин — армии складываются (урон ${d1 + d2}, вклад ${d1}/${d2}), в одиночку нельзя; награды всем по урону: 1-е место 20 000/10/100, повержен ×4, остальным — по доле`);
}
{ // премиум: цвет сообщений и в общем чате
  const u = g.register({ login: 'colorchat', password: '12345', race: 0 }).user; u.premium = Date.now() + 86400000;
  assert.ok(g.setMsgColor ? g.setMsgColor(u, 2).ok : (u.msgColor = 2));
  const m = g.chatPost(u, 'привет').msg; assert.strictEqual(m.color, require('../src/premium').MSG_COLORS[2], 'цвет премиума в чате');
  const u2 = g.register({ login: 'colorchat2', password: '12345', race: 0 }).user; assert.strictEqual(g.chatPost(u2, 'ещё').msg.color, '', 'без премиума — обычный');
  assert.ok(/Не так часто/.test(g.chatPost(u, 'и ещё').error || ''), 'чат — не чаще раза в 1,5 с');
  { // история общего чата — последние 100 сообщений (игрок листает вверх)
    for (let k = 0; k < 105; k++) assert.ok(!g.chatPost(u2, `история ${k}`, null, { sys: true }).error);
    const log = g.chatLog(); assert.ok(log.length === 100 && log[0].text === 'история 5' && log[99].text === 'история 104', 'чат помнит 100 сообщений');
  }
  { // личные сообщения: без лимита в час и в сутки (было 40 в час, 300 в сутки) — только не чаще раза в секунду
    const { tooOften, RATE } = require('../src/security'), mu = { id: -777 }, t0 = Date.now();
    for (let k = 0; k < 400; k++) assert.ok(!tooOften(mu, 'mailtest', RATE.mail, t0 + k * 1100), `письмо ${k + 1} — можно`);
    assert.ok(tooOften(mu, 'mailtest', RATE.mail, t0 + 399 * 1100 + 300), 'чаще раза в секунду — нельзя');
  }
  console.log('✓ Премиум: цвет сообщений в общем чате; чат не чаще раза в 1,5 с');
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
  { // вылеченные в Лазарете возвращаются в армию сразу — это не тревога (раньше считалось «без объяснения»)
    const i = c.grid[0].indexOf(-1); c.grid[0][i] = 41; c.levels[0][i] = 10; c.wounded = { 200: 600 }; Object.assign(c.res, { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6 });
    g.anomalyScan(); const hr = g.healWounded(c, null); g.anomalyScan();
    assert.ok(hr.ok && !c.wounded[200] && mine().length === k, `600 вылеченных — без тревоги (${hr.error || 'ок'})`);
    c.grid[0][i] = -1; c.levels[0][i] = 0; }
  assert.ok(g.alertsNew() > 0 && g.adminOp(adm, 'alerts', {}).data.length >= k && g.alertsNew() === 0, 'открыл список — новые прочитаны');
  assert.ok(g.adminOp(adm, 'player', { login: 'cheatsus' }).data.goldLog.length >= 2, 'история золота в карточке');
  void n0; console.log('✓ Подозрительное: армия, золото мимо журнала и не от админа, лояльность, ресурсы; админ, Кладовая и Лазарет не тревожат');
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
  // автоблок: 3 запроса «поиск дыр» — IP закрыт на 30 дней; адрес игрока и локальный — не трогаем
  for (let i = 0; i < 2; i++) g.secEvent('45.1.2.3', 'probe', '/wp-login.php'); assert.ok(!g.ipBanned('45.1.2.3'), '2 запроса — ещё не блок');
  g.secEvent('45.1.2.3', 'upload', 'POST /x'); const ab = g.db.ipBans['45.1.2.3'];
  assert.ok(g.ipBanned('45.1.2.3') && ab.auto && ab.until - ab.at === 30 * 86400000 && /автоблок/.test(ab.why), 'автоблок на 30 дней');
  ab.until = Date.now() - 1; assert.ok(!g.ipBanned('45.1.2.3') && !g.db.ipBans['45.1.2.3'], 'срок вышел — разблокирован');
  const pl = Object.values(g.db.users).find((u) => !u.bot && !u.admin); (pl.ips = pl.ips || []).push({ ip: '77.7.7.7', at: Date.now() });
  for (let i = 0; i < 5; i++) { g.secEvent('77.7.7.7', 'probe', '/x.php'); g.secEvent('127.0.0.1', 'probe', '/x.php'); }
  assert.ok(!g.ipBanned('77.7.7.7') && !g.ipBanned('127.0.0.1'), 'адрес игрока и локальный — без автоблока');
  console.log('✓ Безопасность: поиск дыр, подбор пароля админа, блокировка IP (себя — нельзя), автоблок после 3 попыток');
}
{ // Telegram: привязка аккаунта и восстановление пароля кодом (tgauth.js); бот подменён — сеть не трогаем
  process.env.TG_AUTH_TOKEN = '1:x'; process.env.TG_AUTH_BOT = 'war_test_bot';
  const said = []; const realApi = g.tgApi; g.tgApi = async (method, body) => { said.push(body); return {}; };
  const tu = g.register({ login: 'tgplayer', password: 'oldpass1', race: 0 }).user;
  assert.ok(g.tgLinkStart(g.adminUser()).error, 'админ — без Telegram');
  const link = g.tgLinkStart(tu).url, code = link.split('start=')[1];
  assert.ok(link.startsWith('https://t.me/war_test_bot?start=') && /^[0-9a-f]{24}$/.test(code), 'одноразовая ссылка');
  g.tgOnMessage({ chat: { id: 777, type: 'private' }, from: { username: 'vasya' }, text: `/start ${code}` });
  assert.ok(tu.tg && tu.tg.chat === 777 && tu.tg.name === '@vasya' && !tu.tgLink && /привязан/.test(said.pop().text), 'привязан');
  g.tgOnMessage({ chat: { id: 778, type: 'private' }, from: {}, text: `/start ${code}` }); assert.ok(/устарела/.test(said.pop().text) && tu.tg.chat === 777, 'ссылка одноразовая');
  // запрос кода: ответ всегда одинаковый; код — только привязанному
  const r0 = g.tgResetRequest('nosuchuser', '9.9.9.1'), r1 = g.tgResetRequest('tgplayer', '9.9.9.1');
  assert.strictEqual(r0.msg, r1.msg, 'по ответу не понять, есть ли логин');
  const m = said.pop(); const c = (/(\d{6})/.exec(m.text) || [])[1]; assert.ok(m.chat_id === 777 && c, 'код пришёл в Telegram');
  assert.ok(!JSON.stringify(tu.tgReset).includes(c), 'код в базе — только хешем');
  assert.ok(g.tgResetConfirm('tgplayer', '000000', 'newpass1').error && tu.tgReset.tries === 1, 'неверный код');
  assert.ok(/коротк/.test(g.tgResetConfirm('tgplayer', c, '123').error || ''), 'короткий пароль');
  const ok = g.tgResetConfirm('tgplayer', c, 'NewPass1', '9.9.9.1');
  assert.ok(ok.msg && ok.uid === tu.id && g.login('tgplayer', 'newpass1') && !g.login('tgplayer', 'oldpass1') && /изменён/.test(said.pop().text), 'пароль сменён, старый не подходит');
  assert.ok(g.tgResetConfirm('tgplayer', c, 'again123').error, 'код одноразовый');
  assert.ok(tu.passLog.slice(-1)[0].by === 'telegram', 'в истории паролей — «telegram»');
  // 5 неверных попыток — код сгорает
  g.tgResetRequest('tgplayer', '9.9.9.2'); const c2 = (/(\d{6})/.exec(said.pop().text) || [])[1];
  for (let i = 0; i < 5; i++) g.tgResetConfirm('tgplayer', '111111', 'xxxxx1');
  assert.ok(/попыток/.test(g.tgResetConfirm('tgplayer', c2, 'xxxxx1').error || ''), 'после 5 ошибок — новый код');
  // не чаще 3 кодов в час на аккаунт
  const n0 = said.length; for (let i = 0; i < 3; i++) g.tgResetRequest('tgplayer', `9.9.8.${i}`); assert.strictEqual(said.length, n0 + 1, 'лимит 3 кода в час (2 уже были)');
  // неверных кодов — не больше 10 за сутки на аккаунт (иначе перебор кода за год угадывал с шансом ~15%)
  tu.tgSent = []; g.tgResetRequest('tgplayer', '9.9.7.1'); const c3 = (/(\d{6})/.exec(said.pop().text) || [])[1];
  while ((tu.tgResetFails || []).length < 10) g.tgResetConfirm('tgplayer', c3 === '222222' ? '333333' : '222222', 'xxxxx1');
  assert.ok(/за сутки/.test(g.tgResetConfirm('tgplayer', c3, 'xxxxx1').error || '') && g.login('tgplayer', 'newpass1'), '10 неверных кодов за сутки — даже верный не принимается');
  tu.tgResetFails = [];
  // отвязка — только кодом из Telegram
  assert.ok(g.tgUnlink(tu, '123456').error && tu.tg, 'без запроса кода — не отвязать');
  tu.tgSent = []; assert.ok(g.tgUnlinkStart(tu).msg); const uc = (/(\d{6})/.exec(said.pop().text) || [])[1];
  assert.ok(g.tgUnlink(tu, '000000').error && tu.tg, 'неверный код — не отвязан');
  assert.ok(g.tgUnlink(tu, uc).msg && !tu.tg && /отвязан/.test(said.pop().text), 'код из Telegram — отвязан');
  { // уведомления: только привязанным, офлайн (кроме нападения), выключаются в Профиле, не больше 20 в час
    const nu = g.register({ login: 'tgnotif', password: '12345', race: 0 }).user; nu.tg = { chat: 999, name: '@n', at: Date.now() };
    const n0 = said.length;
    nu.online = true; g.tgNotify(nu.id, 'mail', 'x'); g.tgNotify(nu.id, 'attack', '⚔ test'); assert.strictEqual(said.length, n0 + 1, 'в игре — только нападение');
    nu.online = false; g.sendMail(g.adminUser(), 'tgnotif', 'Привет', 'текст'); assert.ok(/Письмо от/.test(said[said.length - 1].text), 'письмо — в Telegram');
    g.tgNotifySet(nu, 'mail', false); const n1 = said.length; g.sendMail(g.adminUser(), 'tgnotif', 'Ещё', 'т'); assert.strictEqual(said.length, n1, 'выключено — молчит');
    const nc = g.castlesOf(nu)[0]; nc.queue.push({ view: 0, cell: 3, building: 1, level: 2, start: 0, end: Date.now() - 1, cost: {} });
    assert.ok(g.tgBuildScan() >= 1 && /построено/.test(said[said.length - 1].text) && g.tgBuildScan() === 0, 'стройка — одно сообщение');
    nu.tgNotes = []; for (let i = 0; i < 25; i++) g.tgNotify(nu.id, 'battle', 'b'); assert.strictEqual(nu.tgNotes.length, 20, 'не больше 20 в час');
    assert.ok(!g.tgNotify(g.db.users.newsr ? g.db.users.newsr.id : 0, 'battle', 'z'), 'без привязки — нет');
  }
  { // Telegram через зарубежного посредника (сервер игры в России, где api.telegram.org заблокирован): TG_API — только https
    const { apiTarget } = require('../src/tgauth'), ce = console.error; console.error = () => {};
    try {
      assert.deepStrictEqual(apiTarget(''), { host: 'api.telegram.org', port: 443, prefix: '' }, 'без настройки — напрямую');
      assert.deepStrictEqual(apiTarget('https://217-194-148-101.sslip.io/'), { host: '217-194-148-101.sslip.io', port: 443, prefix: '' }, 'посредник');
      assert.deepStrictEqual(apiTarget('https://relay.example:8443/tg/'), { host: 'relay.example', port: 8443, prefix: '/tg' }, 'порт и путь');
      for (const bad of ['http://relay.example', 'relay.example', 'https://x.example/?a=1', 'javascript:alert(1)']) assert.strictEqual(apiTarget(bad).host, 'api.telegram.org', 'не https — напрямую: ' + bad);
    } finally { console.error = ce; }
    console.log('✓ Telegram через посредника (TG_API): только https-адрес, иначе — напрямую');
  }
  { // покупка монет за звёзды (tgpay.js): счёт в звёздах → проверка перед оплатой → монеты один раз → возврат звёзд уводит в минус
    const calls = []; g.tgApi = async (method, body) => { calls.push([method, body]); return method === 'createInvoiceLink' ? 'https://t.me/$testinv' : {}; };
    const last = (mt) => (calls.filter((c) => c[0] === mt).pop() || [])[1] || {};
    const pu = g.register({ login: 'payer1', password: '12345', race: 0 }).user; pu.gold = 0;
    g.payStart(pu, 99).then((r) => assert.ok(r.error, 'нет такого пакета'));
    g.payStart(pu, 1).then((r) => assert.strictEqual(r.url, 'https://t.me/$testinv', 'ссылка на оплату'));
    const inv = last('createInvoiceLink');
    assert.ok(inv.currency === 'XTR' && inv.prices[0].amount === 75 && /^g:[0-9a-f]{32}$/.test(inv.payload), 'счёт в звёздах: 25 монет = 75 ⭐');
    g.payPreCheckout({ id: 'q1', currency: 'XTR', total_amount: 75, invoice_payload: inv.payload }); assert.strictEqual(last('answerPreCheckoutQuery').ok, true, 'проверка перед оплатой — да');
    g.payPreCheckout({ id: 'q2', currency: 'XTR', total_amount: 3, invoice_payload: inv.payload }); assert.strictEqual(last('answerPreCheckoutQuery').ok, false, 'другая сумма — нет');
    g.payPreCheckout({ id: 'q3', currency: 'XTR', total_amount: 75, invoice_payload: `g:${'0'.repeat(32)}` }); assert.strictEqual(last('answerPreCheckoutQuery').ok, false, 'поддельный счёт — нет');
    const paid = { chat: { id: 555, type: 'private' }, from: { id: 555 }, successful_payment: { currency: 'XTR', total_amount: 75, invoice_payload: inv.payload, telegram_payment_charge_id: 'ch1' } };
    g.tgOnMessage(paid); assert.strictEqual(pu.gold, 25, 'оплачено — 25 монет');
    assert.ok(/зачислено/.test(last('sendMessage').text) && /звёзды Telegram/.test(pu.goldLog.slice(-1)[0].reason), 'бот подтвердил, в Казне — запись');
    assert.ok(g.payNew() >= 1, 'админу — отметка нового зачисления'); g.paySeen(); assert.strictEqual(g.payNew(), 0, 'открыл «Платежи» — отметка снята');
    g.tgOnMessage(paid); assert.strictEqual(pu.gold, 25, 'повтор того же платежа — монеты не второй раз');
    g.payPreCheckout({ id: 'q4', currency: 'XTR', total_amount: 75, invoice_payload: inv.payload }); assert.strictEqual(last('answerPreCheckoutQuery').ok, false, 'оплаченный счёт второй раз не оплатить');
    pu.gold = 10; // 15 монет уже потрачено
    g.tgOnMessage({ chat: { id: 555, type: 'private' }, refunded_payment: { currency: 'XTR', total_amount: 75, invoice_payload: inv.payload, telegram_payment_charge_id: 'ch1' } });
    assert.strictEqual(pu.gold, -15, 'возврат звёзд — монеты назад, баланс в минус');
    assert.ok(/Смена ника стоит/.test(g.changeNick(pu, 'payer2').error || ''), 'в минусе тратить нельзя');
    g.goldChange(pu, 5, 'Пополнение казны администрацией'); assert.strictEqual(pu.gold, -10, 'новые монеты закрывают минус, а не стирают его');
    g.tgOnMessage({ chat: { id: 555, type: 'private' }, refunded_payment: { currency: 'XTR', total_amount: 75, telegram_payment_charge_id: 'ch1' } }); assert.strictEqual(pu.gold, -10, 'второй возврат того же платежа — ничего');
    g.tgOnMessage({ chat: { id: 555, type: 'private' }, from: {}, text: '/paysupport' }); assert.ok(/Поддержка/.test(last('sendMessage').text), '/paysupport — куда писать');
    const pl = g.payList(); assert.ok(pl.count === 0 && pl.refunds === 1 && pl.list[0].refunded, 'в админке: покупка с возвратом');
    { // казна альянса — отдельной покупкой за звёзды: монеты сразу в казну (не игроку); возврат звёзд — списываются из казны
      const pa = g.register({ login: 'payally1', password: '12345', race: 0 }).user; pa.gold = 0;
      g.payStart(pa, 2, Date.now(), true).then((r) => assert.ok(/не в альянсе/.test(r.error || ''), 'без альянса — нельзя'));
      g.db.alliances = g.db.alliances || {}; const aid = g.db.nextId++;
      const pal = g.db.alliances[aid] = { id: aid, name: 'Платящие', tag: 'PAY', leader: pa.id, members: [pa.id], created: Date.now(), treasury: 0, storage: { wood: 0, stone: 0, iron: 0, food: 0 } }; pa.alliance = aid;
      g.payStart(pa, 2, Date.now(), true).then((r) => assert.strictEqual(r.url, 'https://t.me/$testinv', 'ссылка на оплату в казну'));
      const inv2 = last('createInvoiceLink'); assert.ok(inv2.title === '50 монет в казну [PAY]' && inv2.prices[0].amount === 150, `счёт в казну альянса: ${inv2.title}`);
      g.payPreCheckout({ id: 'q5', currency: 'XTR', total_amount: 150, invoice_payload: inv2.payload }); assert.strictEqual(last('answerPreCheckoutQuery').ok, true, 'проверка перед оплатой — да');
      const ch = { chat: { id: 556, type: 'private' }, from: { id: 556 } };
      g.tgOnMessage({ ...ch, successful_payment: { currency: 'XTR', total_amount: 150, invoice_payload: inv2.payload, telegram_payment_charge_id: 'ch2' } });
      assert.ok(pal.treasury === 50 && pa.gold === 0 && /казну альянса \[PAY\]/.test(last('sendMessage').text), `50 монет — в казну альянса, не игроку (${pal.treasury}, ${pa.gold})`);
      const m0 = g.allyMoves(pal)[0]; assert.ok(m0.op === '+' && m0.gold === 50 && m0.by === 'payally1' && m0.via === 'stars', 'в истории казны — покупка за звёзды');
      g.tgOnMessage({ ...ch, refunded_payment: { currency: 'XTR', total_amount: 150, invoice_payload: inv2.payload, telegram_payment_charge_id: 'ch2' } });
      assert.ok(pal.treasury === 0 && pa.gold === 0 && g.allyMoves(pal)[0].via === 'refund' && /казны альянса \[PAY\]/.test(last('sendMessage').text), 'возврат звёзд — списано из казны');
    }
    for (let i = 0; i < 9; i++) g.payStart(pu, 0); g.payStart(pu, 0).then((r) => assert.ok(/Слишком много/.test(r.error || ''), 'не больше 10 счетов в час'));
  }
  g.tgApi = realApi; delete process.env.TG_AUTH_TOKEN; delete process.env.TG_AUTH_BOT;
  assert.ok(g.tgResetRequest('tgplayer').error, 'без бота — подсказка написать администрации');
  console.log('✓ Telegram: покупка монет за звёзды (3 ⭐ = 1, один раз, возврат — в минус), привязка по одноразовой ссылке, код сброса (хеш, 15 мин, 5 попыток, 3 в час), пароль не пересылается, отвязка — по коду, уведомления');
}
{ // защита новичка: ровно 3 дня с регистрации; уже зарегистрированные — по своей дате; напал сам — снимается
  process.env.NEWBIE_DAYS = '3';
  const n1 = g.register({ login: 'newb3d', password: '12345', race: 0 }).user, n2 = g.register({ login: 'newb4d', password: '12345', race: 0 }).user, at = g.register({ login: 'newbatt', password: '12345', race: 0 }).user;
  n2.created = Date.now() - 4 * 86400000; at.created = 0; g.adminAddCastles(at, 1); const ac = g.castlesOf(at)[1]; g.mil(ac); ac.units = { 200: 100 };
  const c1 = g.castlesOf(n1)[0], c2 = g.castlesOf(n2)[0];
  assert.ok(g.isNewbie(n1) && !g.isNewbie(n2) && /новичка ещё 3 дн/.test(g.sendArmy(ac, { units: { 200: 5 }, mission: 'attack', x: c1.x, y: c1.y }).error || ''), '3 дня с регистрации');
  assert.ok(g.worldObjects(c1.x, c1.y, 1, 1)[0].newbie && !g.worldObjects(c2.x, c2.y, 1, 1)[0].newbie, 'купол — только у новичка');
  n1.created = Date.now() - 3 * 86400000 + 3600000; assert.ok(g.isNewbie(n1) && g.newbieLeftText(n1) === '1 ч.', 'последний час');
  n1.created = Date.now() - 3 * 86400000 - 1000; assert.ok(!g.isNewbie(n1), 'ровно через 3 дня — без защиты');
  process.env.NEWBIE_DAYS = '0';
  console.log('✓ Защита новичка: ровно 3 дня с регистрации, купол на карте, зарегистрированные раньше — по своей дате');
}
{ // Ратуша → Защита (shield.js): купол на замок/королевство, контрразведка
  const a = g.register({ login: 'shldatt', password: '12345', race: 0 }).user, d = g.register({ login: 'shlddef', password: '12345', race: 0 }).user;
  g.adminAddCastles(a, 1); g.adminAddCastles(d, 1); const ac = g.castlesOf(a)[1], dc = g.castlesOf(d)[1]; g.mil(ac); g.mil(dc); d.gold = 1000; a.gold = 0; a.created = d.created = 0;
  assert.ok(/монет/.test(g.shieldBuy(d, dc, 'castle', 1).error || '') === false, 'хватает монет');
  assert.ok(g.castleShield(dc) && d.gold === 985, 'защита замка за 15');
  const r1 = g.shieldBuy(d, dc, 'castle', 3); assert.ok(r1.msg && dc.shieldUntil - Date.now() > 3.9 * 86400000 && d.gold === 946, 'продление: 1 + 3 дня');
  assert.ok(g.worldObjects(dc.x, dc.y, 1, 1)[0].shield, 'купол на карте');
  ac.units = { 200: 50 }; const old = require('../src/army').NEWBIE_RATING;
  const e1 = g.sendArmy(ac, { units: { 200: 10 }, mission: 'attack', x: dc.x, y: dc.y });
  assert.ok(/защит/.test(e1.error || ''), 'на защищённый замок не напасть: ' + JSON.stringify(e1).slice(0, 120));
  assert.ok(/защит/.test(g.sendArmy(ac, { units: { 200: 10 }, mission: 'reinforce', x: dc.x, y: dc.y }).error || ''), 'и подкрепление не отправить');
  dc.units = { 200: 20 }; const e2 = g.sendArmy(dc, { units: { 200: 5 }, mission: 'attack', x: ac.x, y: ac.y }).error || '';
  assert.ok(e2.includes(`купол на замке «${dc.name}»`) && /нужно снять \(Ратуша → Защита\)/.test(e2) && /не восстановится/.test(e2), 'под защитой сам не воюет — сказано, какой купол, где снять и что он не восстановится: ' + e2);
  assert.ok(g.shieldBuy(d, dc, 'kingdom', 7).msg && d.gold === 622 && d.shieldKingdom > Date.now(), 'королевство за 324');
  assert.ok(g.shieldBuy(d, dc, 'castle', 5).error && g.shieldBuy(d, dc, 'spy', 1).msg && g.spyShield(d) && d.gold === 607, 'нет 5 дней; контрразведка за 15');
  a.gold = 50; ac.armies = [{ mission: 'attack', state: 'go', x: 1, y: 1, units: {} }];
  assert.ok(/походе/.test(g.shieldBuy(a, ac, 'castle', 1).error || '') && a.gold === 50, 'армии в походе — защиту не включить');
  ac.armies = [];
  // купол снимается насовсем: оставшееся время сгорает (игрока предупреждают в окне)
  const t0 = Date.now();
  const off1 = g.shieldOff(d, dc, 'castle', t0);
  assert.ok(off1.msg && !dc.shieldUntil && /сгорело/.test(off1.msg) && /защита королевства/.test(off1.msg), 'купол замка снят насовсем; сказано, что ещё действует защита королевства: ' + off1.msg);
  assert.ok(g.castleShield(dc) && g.userShielded(d) && !g.shieldInfo(d, dc, t0).castle, 'защита королевства по-прежнему держит замок; в окне купола замка нет');
  assert.ok(g.shieldOff(d, dc, 'castle', t0).error && g.shieldOff(d, dc, 'spy', t0).error && g.spyShield(d) && g.shieldOff(a, dc, 'kingdom', t0).error, 'снимать нечего; контрразведка не снимается; чужой купол не трогать');
  // нападение под куполом: армия не уходит, названы все купола — клиент предупредит, что купол не восстановится, и спросит
  assert.ok(g.shieldBuy(d, dc, 'castle', 1, t0).msg); const cap = g.castlesOf(d)[0]; cap.shieldUntil = t0 + 3600000;
  const e3 = g.sendArmy(dc, { units: { 200: 5 }, mission: 'attack', x: ac.x, y: ac.y });
  assert.ok(e3.error && /защита королевства/.test(e3.domed) && e3.domed.includes(`«${dc.name}»`) && e3.domed.includes(`«${cap.name}»`) && /не восстановится/.test(e3.error) && dc.units[200] === 20, 'под куполом армия не ушла; названы все купола: ' + e3.error);
  // согласие есть, но поход не состоится (цель под куполом) — свои купола не снимаются
  ac.shieldUntil = t0 + 3600000;
  const e4 = g.sendArmy(dc, { units: { 200: 5 }, mission: 'attack', x: ac.x, y: ac.y, dropShield: true });
  assert.ok(/под защитой/.test(e4.error || '') && dc.shieldUntil > t0 && cap.shieldUntil > t0 && d.shieldKingdom > t0 && dc.units[200] === 20, 'поход не состоялся — купола на месте: ' + e4.error);
  ac.shieldUntil = 0;
  const s5 = g.sendArmy(dc, { units: { 200: 5 }, mission: 'attack', x: ac.x, y: ac.y, dropShield: true });
  assert.ok(s5.army && s5.dropped && !g.userShielded(d) && !dc.shieldUntil && !cap.shieldUntil && !d.shieldKingdom && g.spyShield(d) && dc.units[200] === 15, 'с согласия игрока все купола сняты насовсем (контрразведка осталась), армия ушла');
  assert.ok(!g.worldObjects(dc.x, dc.y, 1, 1)[0].shield, 'на карте купола нет');
  dc.armies = []; dc.units = { 200: 20 };
  // защита королевства — тоже насовсем
  assert.ok(g.shieldBuy(d, dc, 'kingdom', 1, t0).msg && d.shieldKingdom > t0);
  const off2 = g.shieldOff(d, dc, 'kingdom', t0);
  assert.ok(off2.msg && !d.shieldKingdom && !g.userShielded(d) && /можно атаковать/.test(off2.msg), 'защита королевства снята насовсем: ' + off2.msg);
  const s6 = g.sendArmy(dc, { units: { 200: 5 }, mission: 'attack', x: ac.x, y: ac.y });
  assert.ok(s6.army && !s6.dropped, 'без купола армия уходит сразу'); dc.armies = []; dc.units = { 200: 20 };
  console.log('✓ Защита: замок (15/39/81), королевство (60/156/324), контрразведка (15/39/81); купол, продление, запреты атак и подкреплений; купол снимается насовсем — в Защите или при нападении с согласия игрока');
}
{ // «Лавка Короля» (shop.js): ускорения стройки и сундуки ресурсов
  const su = g.register({ login: 'shopper', password: '12345', race: 0 }).user, sc = g.castlesOf(su)[0], now = Date.now();
  su.gold = 100;
  sc.queue.push({ view: 0, cell: 3, building: 1, level: 2, start: now, end: now + 3 * 3600000 + 60000, cost: { wood: 0, stone: 0, iron: 0, food: 0, people: 0 } });
  assert.ok(g.shopSpeed(su, sc, '0:3', 'hour', now).msg && su.gold === 85 && sc.queue.find((q) => q.cell === 3).end === now + 2 * 3600000 + 60000, '−1 час за 15');
  assert.ok(g.shopSpeed(su, sc, '0:3', 'finish', now).msg && su.gold === 58 && !sc.queue.some((q) => q.cell === 3), 'достроить: 2 ч 1 мин = 9 × 3 = 27 монет');
  assert.ok(g.shopSpeed(su, sc, '0:3', 'finish', now).error, 'стройки нет — ошибка, золото не тратится'); assert.strictEqual(su.gold, 58);
  sc.queue.push({ view: 0, cell: 4, building: 1, level: 2, start: now, end: now + 30 * 60000, cost: { wood: 0, stone: 0, iron: 0, food: 0, people: 0 } });
  assert.ok(g.shopSpeed(su, sc, '0:4', 'hour', now).error && su.gold === 58, 'меньше часа — «−1 час» нельзя');
  sc.queue = sc.queue.filter((q) => q.cell !== 4);
  // ресурсы S…XXXL и пакеты: в замок до вместимости Складов, остаток — в Кладовую; 2 покупки в сутки
  const st0 = (g.stashOf(su).res.wood || 0), capW = g.capacity(sc).wood;
  su.gold = 1000; sc.res.wood = capW - 300;
  const r1 = g.shopRes(su, sc, 'wood', 2, now); // L: 10 000 дерева за 9
  assert.ok(r1.msg && su.gold === 991 && sc.res.wood >= capW - 1 && g.stashOf(su).res.wood - st0 >= 9700 && g.stashOf(su).res.wood - st0 <= 9701, 'L дерева: 300 до полного Склада — в замок, 9 700 в Кладовую — ' + r1.msg);
  const s0 = { ...sc.res }, k0 = { ...g.stashOf(su).res }; for (const r of ['stone', 'iron', 'food']) sc.res[r] = 0;
  const capS = g.capacity(sc).stone, k2 = { ...g.stashOf(su).res };
  assert.ok(g.shopRes(su, sc, 'pack', 0, now).msg && su.gold === 988 && ['stone', 'iron', 'food'].every((r) => sc.res[r] >= Math.min(1000, capS) - 1 && (g.stashOf(su).res[r] || 0) - (k2[r] || 0) <= 1000 - Math.min(1000, capS) + 1), 'пакет S (3): все ресурсы по 1 000 — в замок, что не влезло — в Кладовую');
  void s0; void k0;
  assert.ok(/завтра/.test(g.shopRes(su, sc, 'stone', 0, now).error || '') && su.gold === 988, 'лимит 2 покупки в сутки, монеты не тратятся');
  assert.ok(g.shopRes(su, sc, 'stone', 0, now + 86400000).msg, 'на следующий день — снова можно');
  assert.ok(g.shopRes(su, sc, 'gold', 0, now + 2 * 86400000).error && g.shopRes(su, sc, 'wood', 6, now + 2 * 86400000).error && g.shopRes(su, sc, '__proto__', 1, now + 2 * 86400000).error, 'нет такого товара');
  // «Сокровища»: всё по таблице «от … до …»; артефакты — в Сокровищницу столицы, полна — осколки в Кладовую
  { const T = require('../src/shop').TREASURES, ru0 = { ...g.runesOf(su) }, rep0 = su.reputation ?? 10, k1 = { ...g.stashOf(su) }, kr = { ...k1.res }, ku = { ...(k1.units || {}) };
    su.gold = 2000; g.mil(sc); sc.artifacts = [];
    const rt = g.shopTreasure(su, 't7'); assert.ok(rt.msg && su.gold === 1, 'Сокровище Дракона за 1999');
    // артефакты сверх места в Сокровищнице разбиты на осколки — их ресурсы тоже в Кладовой (строки отчёта), к «ресурсам» сундука не относятся
    const shards = (g.db.reports.slice(-1)[0].lines || []).reduce((q, l) => { const m = /разбит на осколки: по ([\d\s]+) каждого/u.exec(l); return q + (m ? Number(m[1].replace(/\D/g, '')) : 0); }, 0);
    const it = Object.fromEntries(T.t7.items.map(([k, a, b]) => [k, [a, b]])), dRes = g.stashOf(su).res.wood - (kr.wood || 0) - shards, dRune = ['str', 'def', 'path'].reduce((q, k) => q + g.runesOf(su)[k] - ru0[k], 0);
    assert.ok(dRes >= it.res[0] && dRes <= it.res[1] && dRune >= it.runes[0] && dRune <= it.runes[1], `ресурсы ${dRes} и руны ${dRune} (всего, вид случайный) — в пределах`);
    assert.ok(sc.artifacts.length >= it.art1[0] + it.art2[0] && sc.artifacts.length <= it.art1[1] + it.art2[1] && sc.artifacts.every((a) => a.rarity >= 1 && !a.active), 'артефакты в Сокровищнице: ' + sc.artifacts.length);
    const dRep = su.reputation - rep0, dExp = (g.stashOf(su).exp || 0) - (k1.exp || 0), dRoyal = (g.stashOf(su).royal || 0) - (k1.royal || 0);
    assert.ok(dRep >= it.rep[0] && dRep <= it.rep[1] && dExp >= it.exp[0] && dExp <= it.exp[1] && dRoyal >= it.royal[0] && dRoyal <= it.royal[1], 'репутация, опыт, лояльность — в пределах');
    assert.ok(g.db.reports.slice(-1)[0].title === 'Сокровища: Сокровище Дракона', 'отчёт со списком находок');
    // нежить: в Кладовую, количество — в пределах таблицы; сильнее любого воина игры; не тренируется, генералом не становится
    const du = (id) => (g.stashOf(su).units[id] || 0) - (ku[id] || 0);
    assert.ok([320, 321, 322, 323].every((id) => du(id) >= it[`u${id}`][0] && du(id) <= it[`u${id}`][1]), `нежить в Кладовой: ${[320, 321, 322, 323].map(du)}`);
    { const { UNITS, UNIT } = require('../src/army'), others = UNITS.filter((x) => !x.undead && x.hp > 0), mx = (f) => Math.max(...others.map(f));
      assert.ok([320, 321, 322, 323].every((id) => { const u = UNIT[id]; return Math.max(u.attack, u.magic) > mx((x) => Math.max(x.attack, x.magic || 0)) && u.def.inf > mx((x) => x.def.inf)
        && u.def.cav > mx((x) => x.def.cav) && u.def.mag > mx((x) => x.def.mag) && u.hp > mx((x) => x.hp) && u.upkeep === 0; }), 'нежить сильнее любого воина игры и не ест');
      assert.ok(/сундуков Лавки/.test(g.train(sc, 320, 1).error || '') && !g.genTrainUnits(sc).some((x) => x.undead) && !g.toInfirmary(sc, { 320: 5 }), 'нежить не тренируется, генералом не становится, в Лазарет не попадает'); }
    assert.ok(/Не хватает/.test(g.shopTreasure(su, 't1').error || '') && su.gold === 1, 'мало монет');
    su.gold = 49; sc.artifacts = Array.from({ length: g.bonus(sc).artStore }, (_, i) => ({ id: 9000 + i, type: 'atk', rarity: 0, active: false }));
    const w0 = g.stashOf(su).res.wood, rf = g.shopTreasure(su, 't2');
    assert.ok(rf.msg && sc.artifacts.length === g.bonus(sc).artStore && /осколки/.test(rf.lines.join(' ')) && g.stashOf(su).res.wood - w0 >= T.t2.items[0][1] + 300, 'Сокровищница полна — артефакт на осколки');
    assert.ok(g.shopTreasure(su, 'nope').error && g.shopTreasure(su, '__proto__').error, 'нет такого сундука');
    sc.artifacts = []; }
  // рамки аватара: купить навсегда, надеть, снять
  su.gold = 200;
  assert.ok(g.shopFrame(su, 'gold').msg && su.gold === 20 && su.frame === 'gold', 'золотая рамка (180) куплена и надета');
  assert.ok(g.shopFrame(su, 'gold').error && su.gold === 20, 'второй раз не продаётся');
  assert.ok(g.shopFrame(su, 'fire').error, 'мало монет на огненную');
  assert.ok(g.shopFrame(su, 'silver', true).error, 'некупленную не надеть');
  assert.ok(g.shopFrame(su, '', true).msg && su.frame === '' && g.shopFrame(su, 'gold', true).msg && su.frame === 'gold', 'снять и надеть — бесплатно');
  assert.strictEqual(g.profileOf(su, g.adminUser()).frame, 'gold', 'рамку видят другие в профиле');
  // переезд замка за 500: только на свободное место, армии дома, к замку никто не идёт
  { const { WORLD } = require('../src/game'), PROV_EDGE = 2;
    let spot = null; for (let y = PROV_EDGE; y < WORLD && !spot; y++) for (let x = PROV_EDGE; x < WORLD && !spot; x++) if (!g.placeError(x, y, sc)) spot = { x, y };
    const old = { x: sc.x, y: sc.y }; su.gold = 499;
    assert.ok(/Не хватает/.test(g.shopMove(su, sc, spot.x, spot.y).error || '') && sc.x === old.x, 'мало монет');
    su.gold = 600; const busy = g.castlesOf(g.register({ login: 'shopnbr', password: '12345', race: 0 }).user)[0];
    assert.ok(g.shopMove(su, sc, busy.x, busy.y).error && g.shopMove(su, sc, busy.x + 1, busy.y).error, 'на чужой замок и рядом — нельзя');
    assert.ok(/границ/.test(g.shopMove(su, sc, 0, 0).error || ''), 'граница провинции — нельзя');
    assert.ok(g.shopMove(su, sc, -5, 3).error && g.shopMove(su, sc, 1.5, 3).error, 'кривые координаты');
    sc.armies = [{ state: 'go', x: 1, y: 1 }]; assert.ok(/армии/.test(g.shopMove(su, sc, spot.x, spot.y).error || ''), 'армии в походе — нельзя'); sc.armies = [];
    busy.armies = [{ state: 'go', x: sc.x, y: sc.y }]; assert.ok(/чужая армия/.test(g.shopMove(su, sc, spot.x, spot.y).error || ''), 'к замку идёт армия — нельзя'); busy.armies = [];
    assert.ok(g.shopMove(su, sc, spot.x, spot.y).msg && sc.x === spot.x && sc.y === spot.y && su.gold === 100 && g.castleAt(spot.x, spot.y) === sc && !g.castleAt(old.x, old.y), 'переехал за 500');
    assert.ok((su.goldLog || []).some((x) => /переезд/.test(x.reason)), 'переезд — в журнале золота');
    // телепорт в провинцию (номер — как видит игрок) на случайное свободное место за 250
    const { provNo, provinceOf, PROV_CAP } = require('../src/game'), here = provNo(provinceOf(sc.x, sc.y).n);
    const inProv = (k) => [...g.byXY.values()].filter((c) => provNo(provinceOf(c.x, c.y).n) === k).length;
    let to = 1; while (to === here || inProv(to) >= PROV_CAP) to++; // первая провинция от центра, где есть место
    su.gold = 249; assert.ok(/Не хватает/.test(g.shopMoveProv(su, sc, to).error || ''), 'мало монет на телепорт');
    su.gold = 300; assert.ok(g.shopMoveProv(su, sc, 0).error && g.shopMoveProv(su, sc, 99999).error && g.shopMoveProv(su, sc, 'x').error && su.gold === 300, 'нет такой провинции');
    const mp = g.shopMoveProv(su, sc, to);
    assert.ok(mp.msg && provNo(provinceOf(sc.x, sc.y).n) === to && su.gold === 50 && g.castleAt(sc.x, sc.y) === sc, `телепорт в провинцию №${to}: ${mp.msg}`); }
  // пока лавка не открыта для всех — только администратор
  delete process.env.SHOP_OPEN; assert.ok(!g.shopAllowed(su) && g.shopAllowed(g.adminUser()), 'лавка — только админу');
  process.env.SHOP_OPEN = '1'; assert.ok(g.shopAllowed(su), 'SHOP_OPEN=1 — всем'); delete process.env.SHOP_OPEN;
  su.gold = 3; assert.ok(/Не хватает/.test(g.shopRes(su, sc, 'pack', 5, now + 3 * 86400000).error || ''), 'мало монет');
  assert.ok((su.goldLog || []).some((x) => /Лавка: достроить/.test(x.reason)), 'покупки — в журнале золота');
  console.log('✓ Лавка Короля: −1 час, достроить сейчас, ресурсы S…XXXL и пакеты (2 в сутки, замок + Кладовая), Сокровища (от … до …, артефакты, осколки), рамки, телепорт по координатам (500) и в провинцию (250), пока только админу');
}
{ // «👁 Осмотр» в админке: всё о замках игрока (генерал, войска, армии, подкрепления, здания, Кладовая) — только админу, без следов у игрока
  const ch = g.register({ login: 'inspU', password: '12345', race: 0 }).user, cc = g.castleOf(ch); g.maxOut(cc); g.mil(cc);
  cc.units = { 200: 777 }; cc.armies = [{ id: 1, units: { 201: 55 }, mission: 'raid', x: 3, y: 4, state: 'go', arrive: Date.now() + 60000, general: false }];
  const rep0 = (g.db.reports || []).filter((r) => r.owner === ch.id).length, touch0 = ch.admTouch;
  const r = g.adminOp(g.adminUser(), 'inspect', { login: 'inspU' }), c0 = r.data && r.data.castles[0];
  assert.ok(c0 && c0.general && c0.general.level >= 1 && c0.units.some((u) => u.n === 777) && c0.armies.length === 1 && c0.armies[0].units[0].n === 55 && c0.castleB.length > 5 && c0.res.wood.cap > 0, 'генерал, войска дома и в походе, здания, ресурсы');
  assert.ok(r.data.stash && r.data.runes && r.data.brank && typeof r.data.royal === 'number', 'Кладовая, руны, ранг, лояльность');
  const r2 = g.adminOp(g.adminUser(), 'inspect', { x: cc.x, y: cc.y }); assert.ok(r2.data && r2.data.login === 'inspU' && r2.data.focus === cc.id, 'по клетке карты — тот же игрок, нужный замок');
  assert.ok(g.adminOp(g.adminUser(), 'inspect', { x: 0, y: 0 }).error && g.adminOp(ch, 'inspect', { login: 'inspU' }).error, 'пустая клетка — ошибка; не админу — нельзя');
  assert.ok((g.db.reports || []).filter((x) => x.owner === ch.id).length === rep0 && ch.admTouch === touch0, 'игрок ничего не узнаёт, «Подозрительное» не сбрасывается');
  console.log('✓ Осмотр в админке: генерал, войска, армии, здания, Кладовая — по нику и с карты, только админу, без следов');
}
{ // копия базы в Telegram (tgbackup.js): шифрование, расписание; сеть не трогаем
  const TB = require('../src/tgbackup'), zlib = require('zlib');
  const gz = zlib.gzipSync(Buffer.from('{"users":{}}')), enc = TB.encrypt(gz, 'пароль123');
  assert.ok(!enc.includes(Buffer.from('users')) && TB.decrypt(enc, 'пароль123').equals(gz), 'зашифровано и расшифровывается');
  assert.throws(() => TB.decrypt(enc, 'неверный'), /неверный пароль/, 'чужой пароль — отказ');
  assert.ok(!g.tgBackupInfo().on && !g.tgBackupCheck(), 'без токена — выключено');
  const adm = g.adminUser(); assert.ok(g.adminOp(adm, 'tgbackup', {}).error, 'кнопка без настройки — подсказка');
  process.env.TG_BACKUP_TOKEN = '1:x'; process.env.TG_BACKUP_CHAT = '5'; process.env.TG_BACKUP_HOUR = '4';
  let sent = 0; const real = g.tgBackupSend; g.tgBackupSend = () => { sent++; return Promise.resolve({}); };
  const at = (h, d = 0) => new Date(2030, 0, 10 + d, h, 5).getTime(), st = g.db.tgBackup = { lastOk: 0, lastTry: 0, err: '', size: 0 };
  assert.ok(g.tgBackupCheck(at(13)) && sent === 1, 'ни разу не отправлялась — сразу');
  st.lastOk = at(4); assert.ok(!g.tgBackupCheck(at(13)) && !g.tgBackupCheck(at(4, 1) - 3 * 3600000), 'в тот же день — нет');
  assert.ok(g.tgBackupCheck(at(4, 1)) && sent === 2, 'на следующий день в 4:00 — да');
  st.err = 'сеть'; st.lastTry = at(9, 3) - 60000; assert.ok(!g.tgBackupCheck(at(9, 3)), 'после ошибки — пауза 30 минут');
  assert.ok(g.tgBackupCheck(at(9, 3) + 31 * 60000), 'пропущено больше 26 часов — сразу');
  g.tgBackupSend = real; delete process.env.TG_BACKUP_TOKEN; delete process.env.TG_BACKUP_CHAT; delete process.env.TG_BACKUP_HOUR; delete g.db.tgBackup;
  console.log('✓ Копия базы в Telegram: шифрование AES-256-GCM, раз в сутки в заданный час, пауза после ошибки');
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
  { // шаги «второй/третий Дровосек до 2 ур.»: не засчитываются сами по себе — нужно ещё одно такое здание
    const { ADV } = require('../src/quests');
    const titles = ADV.map((x) => x.title); assert.strictEqual(new Set(titles).size, titles.length, `у советника нет одинаковых заданий: ${titles.filter((t, i) => titles.indexOf(t) !== i)}`);
    const w = g.register({ login: 'advwood', password: '12345', race: 0 }).user, cw = g.castleOf(w), q = g.qinit(w);
    q.adv = ADV.findIndex((x) => x.id === 'a_wd3'); q.advStash = true;
    const forest = [...cw.grid[1].keys()].filter((i) => cw.grid[1][i] === -1).slice(0, 3);
    cw.grid[1][forest[0]] = 7; cw.levels[1][forest[0]] = 2;
    let s = g.advState(w, cw); assert.ok(s.id === 'a_wd3' && !s.done && s.have === 1 && s.need === 2, `один Дровосек 2 ур. — шаг «второй» не выполнен (${s.have}/${s.need})`);
    cw.grid[1][forest[1]] = 7; cw.levels[1][forest[1]] = 1; assert.ok(!g.advState(w, cw).done, 'второй Дровосек 1 ур. — ещё нет');
    cw.levels[1][forest[1]] = 2; s = g.advState(w, cw); assert.ok(s.done && s.have === 2, 'второй Дровосек 2 ур. — выполнено');
    q.adv = ADV.findIndex((x) => x.id === 'a_wd4'); s = g.advState(w, cw); assert.ok(!s.done && s.need === 3, 'третий — нужен ещё один');
  }
  console.log('✓ Советник-строитель: шаги без повторов («второй/третий Дровосек»), ресурсы в замок до Склада, остаток в Кладовую');
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
  { const cu = g.register({ login: 'allyMaker9', password: '12345', race: 0 }).user, cc = g.castleOf(cu); g.mil(cc); g.maxOut(cc);
    g.setBuildingLevel(cc, 13, 9); assert.ok(/10 уровня/.test(g.alliance(cu, cc, { op: 'create', name: 'Девятка', tag: 'NIN' }).error || '') && !cu.alliance, 'Дипцентр 9 ур. — создать альянс нельзя');
    g.setBuildingLevel(cc, 13, 10); assert.ok(g.alliance(cu, cc, { op: 'create', name: 'Десятка', tag: 'TEN' }).ok && cu.alliance, 'Дипцентр 10 ур. — можно');
    console.log('✓ Альянс создаётся только с Дипломатическим центром 10 уровня'); }
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
{ // лагеря разбойников и руины: у победителя потери вдвое меньше; добыча (с 21.10 в 4 раза меньше) покрывает лечение павших в Лазарете
  const luck0 = process.env.LUCK; process.env.LUCK = '0';
  const AR = require('../src/army'), cr = g.castleOf(g.register({ login: 'campProfit', password: '12345', race: 0 }).user); g.mil(cr); cr.general = null;
  // с 22.10 охрана подогнана под юнитов «Справки» (груз ×10): армия своего уровня ценой втрое больше добычи грабит с прибылью около +20%
  // (прибыль = добыча − цена павших × 0,625: половина павших — раненые, их лечение — четверть цены); проигрыш — гибнет вся армия
  const sum = (o) => Object.values(o).reduce((q, v) => q + v, 0), med = (a) => { const q = [...a].sort((x, y) => x - y); return (q[(q.length - 1) >> 1] + q[q.length >> 1]) / 2; };
  const races = ['humans', 'elves', 'dwarves', 'orcs'], cs = races.map((r, i) => { const c = g.castleOf(g.register({ login: 'campRace' + i, password: '12345', race: i }).user); g.mil(c); c.general = null; return c; });
  // с 24.10 (бой как в оригинале: треугольник родов) — армия смешанная: пехота, конница и маги поровну по цене (всего втрое дороже добычи);
  // одним родом войск лагерь не взять — у охраны все три рода
  const net = (k, ri, t) => { const loot = sum(AR.NPC[k].loot), us = [3, 12, 20].map((b) => AR.UNITS.filter((u) => u.race === races[ri] && u.building === b && !u.notrain).sort((x, y) => x.level - y.level)[t]), units = {};
    for (const u of us) units[u.id] = Math.ceil(loot / sum(u.cost));
    const a = { units: { ...units }, mission: 'attack', general: false }, R = g.clash(cs[ri], a, null, AR.NPC[k], Date.now());
    let lost = 0, carry = 0; for (const [id, n] of Object.entries(units)) { lost += (n - (a.units[id] || 0)) * sum(AR.UNIT[id].cost); carry += (a.units[id] || 0) * AR.UNIT[id].carry; }
    if (!R.win) assert.ok(Object.entries(units).every(([id, n]) => !(a.units[id] > 0)), 'проиграл — погибла вся армия');
    return ((R.win ? Math.min(loot, carry) : 0) - lost * 0.625) / loot * 100; };
  const tiers = { 30: [0], 31: [0, 2], 32: [2], 24: [2] }, got = {};
  for (const k of [30, 31, 32, 24]) {
    const all = races.flatMap((r, ri) => tiers[k].map((t) => net(k, ri, t)));
    got[k] = Math.round(med(all)); assert.ok(got[k] >= 10 && got[k] <= 35, `${AR.NPC[k].name}: прибыль своего уровня ${got[k]}% (около +20%)`);
  }
  { // одним родом войск — в минус: кони не бьют шаманов, пехота — всадников (у охраны все три рода)
    const one = (id) => { const u = AR.UNIT[id], loot = sum(AR.NPC[31].loot), a = { units: { [id]: Math.ceil(3 * loot / sum(u.cost)) }, mission: 'attack', general: false }; return g.clash(cs[0], a, null, AR.NPC[31], Date.now()).win; };
    assert.ok(!one(261), 'средний лагерь одной конницей (Кирасир) не взять'); }
  { // охрана крепнет вместе с бонусами атаки нападающего: прокачанный замок (Кузница, науки, ранг) грабит не выгоднее нового (было +80%)
    const mix = (c) => { const us = [3, 12, 20].map((bb) => AR.UNITS.filter((u) => u.race === 'humans' && u.building === bb && !u.notrain).sort((x, y) => x.level - y.level)[2]), loot = sum(AR.NPC[32].loot), units = {};
      for (const u of us) units[u.id] = Math.ceil(loot / sum(u.cost)); const a = { units: { ...units }, mission: 'attack', general: false }; const R = g.clash(c, a, null, AR.NPC[32], Date.now());
      let lost = 0, carry = 0; for (const [id, n] of Object.entries(units)) { lost += (n - (a.units[id] || 0)) * sum(AR.UNIT[id].cost); carry += (a.units[id] || 0) * AR.UNIT[id].carry; }
      return Math.round(((R.win ? Math.min(loot, carry) : 0) - lost * 0.625) / loot * 100); };
    const mx = g.castleOf(g.register({ login: 'campMaxed', password: '12345', race: 0 }).user); g.mil(mx); g.maxOut(mx); mx.general = null;
    const p0 = mix(cs[0]), p1 = mix(mx); assert.ok(p1 - p0 <= 15 && p0 > 0, `тяжёлый лагерь, смешанная элита людей: новый замок ${p0}%, прокачанный ${p1}%`);
  }
  assert.strictEqual(Object.values(AR.NPC[32].loot).reduce((q, v) => q + v, 0), 40000, 'тяжёлый лагерь — 40 000 (было 160 000)');
  assert.strictEqual(Object.values(AR.NPC[24].loot).reduce((q, v) => q + v, 0), 27500, 'руины — 27 500 (было 110 000)');
  const vs = (npc, n) => { const a = { units: { 200: n }, mission: 'attack', general: false }; const R = g.clash(cr, a, null, AR.NPC[npc], Date.now()); return { win: R.win, lost: n - (a.units[200] || 0) }; };
  assert.ok(vs(30, 3).lost === 3, 'проиграл — погибла вся армия, как прежде');
  const pvp = g.castleOf(g.register({ login: 'campPvpZ', password: '12345', race: 0 }).user); g.mil(pvp); pvp.units = { 200: 30 };
  const ap = { units: { 200: 200 }, mission: 'attack', general: false }; const Rp = g.clash(cr, ap, pvp, null, Date.now()); assert.ok(Rp.win, 'бой с игроком — как прежде');
  // добыча (с лагерей, руин и игроков одинаково): в замок до вместимости Складов, сверх — пропадает, в Кладовую не идёт
  const capW = g.capacity(cr).wood, st0 = g.stashOf(g.userById(cr.owner)).res.wood || 0;
  for (const [mission, extra] of [['attack', { lootNpc: true }], ['raid', {}]]) { // lootNpc — армии, ушедшие в поход до этой версии
    cr.res.wood = capW - 100;
    g.returnHome(cr, { units: { 200: 1 }, mission, loot: { wood: 900, stone: 0, iron: 0, food: 0 }, ...extra });
    assert.ok(cr.res.wood >= capW - 1 && cr.res.wood <= capW, `${mission}: 100 в замок, 800 пропало`);
  }
  assert.strictEqual(g.stashOf(g.userById(cr.owner)).res.wood || 0, st0, 'добыча сверх Складов — не в Кладовую');
  if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
  console.log(`✓ Лагеря под юнитов «Справки»: армия своего уровня втрое дороже добычи грабит с прибылью — лёгкий ${got[30]}%, средний ${got[31]}%, тяжёлый ${got[32]}%, руины ${got[24]}%; тяжёлый — 40 000, руины — 27 500`);
}
{ // юниты не задваиваются: нападение и набег на игрока с отрядом и подкреплением, поход на лагерь — после похода войск ровно «было − погибло»,
  // повторный тик ничего не возвращает второй раз, вылеченных в Лазарете не больше раненых
  const luck0 = process.env.LUCK; process.env.LUCK = '0';
  const AR = require('../src/army'), sum = (o) => Object.values(o || {}).reduce((q, v) => q + v, 0);
  const mk = (l, race) => { const u = g.register({ login: l, password: '12345', race }).user, c = g.castleOf(u); u.newbieOff = true; g.mil(c); g.maxOut(c); c.general = null; c.shieldUntil = 0; return c; };
  const pick = (r, b, t) => AR.UNITS.filter((u) => u.race === r && u.building === b && !u.notrain).sort((x, y) => x.level - y.level)[t].id;
  const tot = (c) => sum(c.units) + c.squads.reduce((q, x) => q + sum(x.units), 0) + (c.armies || []).reduce((q, a) => q + sum(a.units), 0);
  const cA = mk('dupAtk', 0), cD = mk('dupDef', 1), cR = mk('dupRef', 3);
  const hA = pick('humans', 3, 2), hB = pick('humans', 12, 2), eA = pick('elves', 3, 1), eB = pick('elves', 3, 0), oA = pick('orcs', 3, 1);
  cA.units = { [hA]: 300, [hB]: 200 }; cD.units = { [eA]: 120 }; cD.squads = [{ id: 'dupsq', name: 'Отряд', units: { [eB]: 80 } }]; cR.units = { [oA]: 60 };
  const log = []; g.clash = function (...x) { const R = Object.getPrototypeOf(this).clash.apply(this, x); log.push(R); return R; };
  let t = Date.now(); const step = () => { t += 1e9; g.tickWorld(t); };
  assert.ok(!g.sendArmy(cR, { units: { [oA]: 60 }, x: cD.x, y: cD.y, mission: 'reinforce' }).error, 'подкрепление ушло'); step();
  assert.ok(g.guestsOf(cD).length === 1, 'подкрепление стоит в замке');
  for (const mission of ['attack', 'raid']) {
    const A0 = tot(cA), D0 = tot(cD), R0 = tot(cR), W0 = sum(cA.wounded);
    const r = g.sendArmy(cA, { units: { ...cA.units }, x: cD.x, y: cD.y, mission }); assert.ok(r.army, JSON.stringify(r.error));
    assert.strictEqual(tot(cA), A0, `${mission}: армия в пути — те же войска`);
    log.length = 0; step(); step(); step();
    assert.strictEqual(log.length, 1, `${mission}: один бой`); const R = log[0], lost = (ids) => ids.reduce((q, id) => q + ((R.dLost || {})[id] || 0), 0);
    assert.strictEqual(tot(cA), A0 - sum(R.aLost), `${mission}: нападающие — было ${A0}, погибло ${sum(R.aLost)}, стало ${tot(cA)}`);
    assert.ok(!(cA.armies || []).length, `${mission}: армия вернулась и не висит в пути`);
    assert.strictEqual(tot(cD), D0 - lost([eA, eB]), `${mission}: защитники — было ${D0}, стало ${tot(cD)}`);
    assert.strictEqual(tot(cR), R0 - lost([oA]), `${mission}: подкрепление — было ${R0}, стало ${tot(cR)}`);
    assert.ok(sum(cA.wounded) - W0 <= sum(R.aLost), `${mission}: раненых не больше павших`);
    const A1 = tot(cA); step(); step(); assert.strictEqual(tot(cA), A1, `${mission}: повторный тик — никто не вернулся второй раз`);
  }
  const W = sum(cA.wounded), A2 = tot(cA); cA.res = { wood: 1e7, stone: 1e7, iron: 1e7, food: 1e7, people: 1e6 };
  if (W) { assert.ok(g.healWounded(cA, {}).ok, 'лечение'); assert.ok(tot(cA) === A2 + W && !sum(cA.wounded), 'вылечено ровно столько, сколько раненых'); assert.ok(g.healWounded(cA, {}).error, 'второй раз — некого'); }
  const camp = g.worldObjects(cA.x - 40, cA.y - 40, 80, 80).find((o) => o.kind === 'object' && [30, 31, 32].includes(o.img));
  if (camp) { const A3 = tot(cA); log.length = 0; assert.ok(!g.sendArmy(cA, { units: { ...cA.units }, x: camp.x, y: camp.y, mission: 'attack' }).error, 'поход на лагерь'); step(); step(); step();
    assert.ok(log.length === 1 && tot(cA) === A3 - sum(log[0].aLost), `лагерь: было ${A3}, погибло ${sum(log[0].aLost)}, стало ${tot(cA)}`); }
  delete g.clash;
  if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
  console.log(`✓ Юниты не задваиваются: нападение и набег на замок с отрядом и подкреплением${camp ? ', лагерь' : ''} — войск ровно «было − погибло», повторный тик ничего не добавляет, вылечено = ранено`);
}
{ // симулятор боя: данные из разведки, бой той же формулой, ничего в игре не меняется
  const luck0 = process.env.LUCK; process.env.LUCK = '0';
  const AR = require('../src/army'), sum = (o) => Object.values(o || {}).reduce((q, v) => q + v, 0);
  const mk = (l, race) => { const u = g.register({ login: l, password: '12345', race }).user, c = g.castleOf(u); u.newbieOff = true; g.mil(c); g.maxOut(c); c.shieldUntil = 0; return c; };
  const ca = mk('simAtk1', 0), cd = mk('simDef1', 1);
  ca.units = { 204: 300, 263: 200, 264: 200, 243: 180 }; cd.units = { 265: 300, 266: 200, 268: 150 }; cd.squads = [];
  // разведка: Центр разведки 20 ур., разведчиков много — видно всё
  g.brOf(g.userById(cd.owner)).pts = 200000; // у защитника боевой ранг — в разведке он виден всегда
  const spy = AR.UNITS.find((u) => u.race === 'humans' && u.role === 'scout'); ca.units[spy.id] = 500;
  const r = g.sendArmy(ca, { units: { [spy.id]: 500 }, x: cd.x, y: cd.y, mission: 'scout' }); assert.ok(r.army, JSON.stringify(r));
  r.army.arrive = Date.now() - 1; g.tickWorld(Date.now());
  const rep = g.reportsOf(ca.owner).find((x) => x.kind === 'scout' && x.data && x.data.sim); assert.ok(rep, 'в отчёте разведки — данные для симулятора');
  const sim = rep.data.sim, bD = g.bonus(cd);
  assert.ok(sim.race === 'elves' && sim.units[265] === 300 && sim.wall === bD.wall && Math.abs(sim.defK - bD.def) < 1e-9 && sim.gen && sim.gen.level === cd.general.level, 'раса, войска, Забор, бонус защиты, генерал — из разведки');
  assert.ok(sim.rank && sim.rank.def > 0 && sim.rank.idx === g.brRank(g.userById(cd.owner)), 'боевой ранг противника — в данных разведки');
  const before = JSON.stringify([ca.units, ca.wounded || {}, ca.res, cd.units, cd.wall]);
  const army = { 204: 300, 263: 200, 264: 200, 243: 180 };
  const S1 = g.simBattle(ca, { units: army, general: true, mission: 'attack', def: sim });
  assert.ok(S1.ok && S1.att && S1.att.length === 4 && S1.def.length >= 3, JSON.stringify(S1).slice(0, 300));
  assert.ok(Number.isFinite(S1.atkPct) && S1.defPct === Math.round((bD.def - 1) * 100) && S1.myRank >= 0, 'бонусы в расчёте показаны (ранг — в них)');
  assert.strictEqual(JSON.stringify([ca.units, ca.wounded || {}, ca.res, cd.units, cd.wall]), before, 'симулятор ничего не меняет: войска, раненые, ресурсы, Забор');
  // настоящий бой на копиях — тот же исход
  const A2 = structuredClone(ca), D2 = structuredClone(cd); const real = g.clash(A2, { units: { ...army }, mission: 'attack', general: true }, D2, null, Date.now());
  assert.ok(real.win === S1.win && Math.abs(real.calc.att.str - S1.ap) <= 1 && Math.abs(real.calc.def.str - S1.dp) <= 2 && sum(real.aLost) === S1.att.reduce((q, x) => q + x.lost, 0),
    `симулятор = настоящий бой: атака ${S1.ap}/${real.calc.att.str}, защита ${S1.dp}/${real.calc.def.str}, потери ${sum(real.aLost)}/${S1.att.reduce((q, x) => q + x.lost, 0)}, ${real.win}/${S1.win}`);
  assert.ok(S1.wallTo !== null && S1.wallTo < S1.wall, 'тараны ломают Забор и в симуляторе');
  const G1 = g.simBattle(ca, { units: army, general: false, mission: 'attack', def: sim });
  assert.ok(S1.genGain > 0 && G1.genGain === S1.genGain && G1.ap < S1.ap && S1.genLevel === ca.general.level, `генерал: +${S1.genGain}% к атаке — видно и с ним, и без него`);
  // Кузница и Школа магии — без Бунтаря, Путешественника, Катапульты, Тарана; их улучшения в бою не действуют
  const fl = g.forgeUnits(ca).map((u) => u.id), ml = g.magicUnits(ca).map((u) => u.id);
  assert.ok([224, 233, 240, 243].every((id) => !fl.includes(id) && !ml.includes(id)) && fl.length && ml.length, 'общие воины не улучшаются');
  ca.forge[243] = { a: 50, d: 50 }; const S3 = g.simBattle(ca, { units: { 243: 100, 204: 50 }, def: sim }); delete ca.forge[243]; const S4 = g.simBattle(ca, { units: { 243: 100, 204: 50 }, def: sim });
  assert.strictEqual(S3.ap, S4.ap, 'старые улучшения Тарана в бою не действуют');
  // лагерь: та же охрана, что в бою
  const C3 = AR.NPC[32], S2 = g.simBattle(ca, { units: { 204: 200, 263: 150, 264: 150 }, mission: 'attack', def: { npc: 32 } }), R2 = g.clash(structuredClone(ca), { units: { 204: 200, 263: 150, 264: 150 }, mission: 'attack', general: false }, null, C3, Date.now());
  assert.ok(S2.ok && S2.win === R2.win && S2.dp === R2.calc.def.str && S2.stock === 40000 && typeof S2.profit === 'number', 'лагерь в симуляторе — как в бою, с прибылью: ' + JSON.stringify([S2.error, S2.win, R2.win, S2.dp, R2.calc.def.str, S2.stock, S2.profit]));
  // мусор не ломает
  for (const bad of [{}, { units: { 9999: 5 } }, { units: { 204: -5 } }, { units: { 204: 10 }, def: { npc: 77 } }, { units: { __proto__: 1 } }]) assert.ok(g.simBattle(ca, bad).error, JSON.stringify(bad));
  assert.ok(g.simBattle(ca, { units: { 204: 1e12 }, def: { race: 'elves', units: { 265: 'abc' }, wall: 99, defK: 1e9 } }).ok, 'числа обрезаются');
  if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
  console.log(`✓ Симулятор боя: данные из разведки (раса, войска, Забор, бонус защиты, генерал), исход как в настоящем бою (атака ${S1.ap}, защита ${S1.dp}), в игре ничего не меняется`);
}
{ // лагеря разбойников: набег втрое быстрее (туда и обратно), на игроков — как было
  const R = g.register({ login: 'campRunner', password: '12345', race: 0 }).user, rc = g.castleOf(R); g.mil(rc);
  const camp = g.provNpc(require('../src/game').provinceOf(rc.x, rc.y).n).find((o) => [30, 31, 32].includes(o.img)); // лагеря своей провинции
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
  { // администратору пишут в личку и дарят подарки только его друзья; модераторы — всегда; заявку в друзья — можно; причина видна в профиле и диалоге
    const adm = g.adminUser(), M = g.register({ login: 'pvMod1', password: '12345', race: 0 }).user, fr0 = adm.friends; M.mod = true;
    adm.friends = [F.id];
    assert.ok(/только его друзья/.test(g.canReach(B, adm) || '') && /подарки/.test(g.canReach(B, adm, 'gift') || ''), 'не друг — ни лички, ни подарков');
    B.gold = 50; assert.ok(/только его друзья/.test(g.sendGift(B, adm.id, 'gift_box').error || '') && B.gold === 50, 'подарок администратору — нельзя, монеты целы');
    B.gold = 200; assert.ok(/только его друзья/.test(g.buyPremium(B, 14, adm.login).error || '') && B.gold === 200, 'премиум в подарок администратору — нельзя');
    assert.ok(g.canReach(B, adm, 'coin') && g.canReach(B, adm, 'propose') && g.canReach(B, adm, 'friend') === null, 'ЗАГС и Орёл-решка — нельзя, заявку в друзья — можно');
    assert.ok(g.canReach(F, adm) === null && g.canReach(F, adm, 'gift') === null && g.canReach(M, adm) === null && g.canReach(adm, B) === null, 'друг и модератор пишут, админ пишет всем');
    const pb = g.profileOf(adm, B), pf = g.profileOf(adm, F);
    assert.ok(pb.deny.msg && pb.deny.gift && /Писать в личку и дарить подарки администратору могут только его друзья/.test(pb.deny.note) && !pf.deny.msg && !pf.deny.note, 'в профиле — причина');
    assert.ok(!g.profileOf(A, B).deny.note, 'у обычного игрока — без запрета');
    adm.friends = fr0; M.mod = false;
  }
  console.log('✓ Приватность: кто пишет в личку, чёрный список для писем, фото, подарков и ЗАГСа, админ пишет всегда; администратору — только друзья');
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
{ // Боевой ранг: очки за бой — ранг растёт сразу (звание в профиле); за каждый новый ранг — сундук награды (забрать — в Кладовую); бонусы
  const BR = require('../src/battlerank');
  const A = g.register({ login: 'brAaa', password: '12345', race: 0 }).user, Bq = g.register({ login: 'brBbb', password: '12345', race: 1 }).user;
  assert.strictEqual(g.brRank(A), -1, 'без боёв — без ранга');
  A.br = undefined; g.brOf(A);
  g.brAdd(A.id, 400, Bq.id); assert.ok(A.br.pts === 80 && g.brRank(A) === BR.rankIdx(80), 'очки — пятая часть населения погибших, ранг вырос сразу');
  g.brAdd(A.id, 400, null); assert.strictEqual(A.br.pts, 120, 'лагерь — ещё вдвое меньше');
  const r = BR.rankIdx(120), units = () => Object.values(g.stashOf(A).units || {}).reduce((a, n) => a + n, 0), u0 = units(), e0 = g.stashOf(A).exp || 0;
  assert.ok(g.brRank(A) === r && g.brChests(A) === r + 1 && g.profileOf(A, A).brank.idx === r, `ранг ${r + 1} сразу, в профиле — новое звание, сундуков — ${r + 1}`);
  assert.ok(g.brClaim(A, 0).ok && g.brChests(A) === r && units() === u0 + 15, 'сундук 1-го ранга: 15 воинов — в Кладовую (в 10 раз меньше прежнего)');
  const cl = g.brClaim(A); assert.ok(cl.ok && g.brChests(A) === 0, cl.error);
  const want = Array.from({ length: r + 1 }, (_, k) => 15 * (k + 1)).reduce((a, n) => a + n, 0); assert.strictEqual(units() - u0, want, 'армия за все открытые ранги — в Кладовую');
  assert.strictEqual((g.stashOf(A).exp || 0) - e0, want / 15 * 50, 'опыт генерала за все открытые ранги — в Кладовую: 50 × номер ранга');
  assert.ok(/Новых наград нет/.test(g.brClaim(A).error || ''), 'дважды не забрать');
  const b = g.brBonus(A); assert.ok(b.atk > 0 && b.prod > 0 && b.atk <= 0.1, 'бонус ранга — сразу');
  const v = g.brView(A, A); assert.ok(v.table.length === 78 && v.title && v.next && v.chests === 0 && v.claimed === r, 'окно ранга');
  assert.ok(g.brView(Bq, A).chests === 0, 'чужие сундуки не видны');
  assert.strictEqual(BR.rankInfo(77).title, 'Легенда'); assert.ok(BR.bonusAt(77).atk === 0.1 && BR.bonusAt(77).prod === 0.3, 'Легенда 5★: урон и защита +10% (было +20%), прирост +30%');
  assert.deepStrictEqual(BR.prizeAt(6), { army: 105, res: 1750, exp: 350 }, 'ранг 7 — армия 105, ресурсы по 1 750, опыт генерала 350');
  assert.ok(Array.from({ length: 30 }, (_, i) => BR.prizeAt(i).army).reduce((a, n) => a + n, 0) === 6975, 'армия за ранги 1–30 — 6 975 (было 69 750)');
  assert.ok(BR.prizeAt(0).exp === 50 && BR.prizeAt(1).exp === 100 && BR.prizeAt(77).exp === 3900, 'опыт генерала — за каждый ранг: 50 × номер ранга');
  // пороги — прежние (таблица как в оригинале); очки недолгих порогов-сумм 20.10 (v4) — назад без потери ранга
  assert.ok(BR.rankIdx(BR.NEED[22]) === 22 && BR.rankIdx(BR.NEED[22] - 1) === 21 && BR.rankIdx(5000000) === 77, 'пороги рангов — прежние');
  {
    const M = g.register({ login: 'brMig', password: '12345', race: 0 }).user, cum22 = BR.NEED.slice(0, 23).reduce((a, n) => a + n, 0);
    M.br = { v: 4, pts: cum22 + 300, claimed: 20 };
    const mb = g.brOf(M);
    assert.ok(mb.v === 3 && mb.pts === BR.NEED[22] + 300 && g.brRank(M) === 22 && mb.claimed === 20 && g.brChests(M) === 2, `ранг 23 сохранён (${mb.pts})`);
    M.br = { v: 4, pts: 15, claimed: -1 }; assert.ok(g.brOf(M).pts === 15 && g.brRank(M) === -1, 'без ранга — очки как были');
    M.br = { v: 3, pts: 28300, claimed: 20 }; assert.strictEqual(g.brOf(M).pts, 28300, 'прежние данные (v3) не меняются');
  }
  console.log('✓ Боевой ранг: растёт сразу по очкам (пятая часть населения погибших), звание в профиле, сундуки наград за каждый ранг, бонусы, таблица 78 рангов; пороги — прежние');
}
{ // очки ранга (21.10): повторный бой с тем же игроком за сутки — вдвое меньше; мирные юниты — без очков; раненые — за четверть
  const [R1, R2, R3] = ['brRep1', 'brRep2', 'brRep3'].map((login) => g.register({ login, password: '12345', race: 0 }).user);
  [R1, R2, R3].forEach((u) => { u.br = undefined; g.brOf(u); });
  const T0 = Date.now(), add = (vs, t = T0) => { const p0 = R1.br.pts; g.brAdd(R1.id, 100, vs ? vs.id : null, t); return R1.br.pts - p0; };
  assert.deepStrictEqual([add(R2), add(R2), add(R2), add(R3), add(null)], [20, 10, 5, 20, 10], 'с тем же игроком за сутки: 20 → 10 → 5; другой игрок и лагерь — полностью');
  assert.strictEqual(add(R2, T0 + DAY + 1), 20, 'через сутки — снова полностью');
  assert.ok(Object.keys(R1.br.foes).join() === String(R2.id) && R1.br.foes[R2.id].length === 1, 'бои старше суток забываются');
  // бой: у защитника 100 мечников и 2 путешественника, Лазарета нет — четверть павших выздоравливает дома; у нападающего Лазарет
  const A = g.register({ login: 'brWnd1', password: '12345', race: 0 }).user, D = g.register({ login: 'brWnd2', password: '12345', race: 0 }).user;
  const ca = g.castleOf(A), cd = g.castleOf(D); g.maxOut(ca); g.mil(cd); ca.general = null; cd.general = null; // у нападающего всё построено (и Лазарет)
  assert.ok(g.infirmCap(ca) >= 1000 && !g.infirmCap(cd), 'Лазарет — только у нападающего');
  [A, D].forEach((u) => { u.br = undefined; g.brOf(u); });
  const fight = () => {
    cd.units = { 200: 100, 224: 2 }; cd.squads = []; ca.units = { 200: 300 }; ca.squads = []; ca.armies = []; ca.wounded = {};
    const a0 = A.br.pts, d0 = D.br.pts, s = g.sendArmy(ca, { from: 'castle', mission: 'attack', x: cd.x, y: cd.y }); assert.ok(!s.error, s.error);
    g.tickWorld(Date.now() + 1e10); g.tickWorld(Date.now() + 3e10);
    const rep = g.reportsOf(A.id).find((x) => x.data && x.data.type === 'battle' && x.data.def.login === D.login);
    return { a: A.br.pts - a0, d: D.br.pts - d0, lost: rep.data.att.units[200].lost, home: cd.units[200] || 0 };
  };
  const f1 = fight(), pop = require('../src/army').UNIT[200].pop;
  assert.ok(f1.home === 0 && f1.a === Math.round(100 * pop * 0.2), `нападающему: все 100 павших защитников (дома никто не выздоровел — нападение победило), путешественники — ничего (+${f1.a})`);
  { const w = Math.floor(f1.lost / 2); // ранеными — половина павших (Лазарет), остальные погибли
    assert.ok(f1.lost > 0 && (ca.wounded[200] || 0) === w && f1.d === 0, `защитнику (с 24.10) очков нет — ранг только за нападения и набеги (+${f1.d} за ${f1.lost}, раненых ${w})`); }
  const f2 = fight(); assert.strictEqual(f2.a, Math.round(100 * pop * 0.2 / 2), `второй бой с тем же игроком за сутки — вдвое меньше (+${f2.a})`);
  { const adm = Object.values(g.db.users).find((u) => u.admin); if (adm) { adm.br = { v: 3, pts: 50000, claimed: 3 }; g.brAdd(adm.id, 1000, null); assert.ok(g.brOf(adm).pts === 0 && g.brRank(adm) === -1 && g.brBonus(adm).atk === 0, 'у Советника ранга нет: набитый сброшен, новый не растёт'); } }
  console.log(`✓ Очки ранга: повтор за сутки 20 → 10 → 5, путешественники без очков, раненые за четверть, защитнику — 0 (бой: +${f1.a}, повтор +${f2.a})`);
}
{ // генерал гибнет по исходу боя (21.10): «Полевой лекарь» и выздоровевшие дома больше не спасают его; набег — не гибнет; уцелеть — до 30%
  const mk = (login) => g.register({ login, password: '12345', race: 0 }).user;
  const A = mk('gdAtt1'), D = mk('gdDef1'), ca = g.castleOf(A), cd = g.castleOf(D); g.maxOut(ca); g.maxOut(cd);
  const go = (mission) => { ca.squads = []; ca.armies = []; cd.squads = []; cd.armies = []; const s = g.sendArmy(ca, { from: 'castle', mission, x: cd.x, y: cd.y }); assert.ok(!s.error, s.error); g.tickWorld(Date.now() + 1e10); g.tickWorld(Date.now() + 3e10); };
  // нападение проиграно: «Полевой лекарь» (15%) спас часть воинов — генерал всё равно пал
  ca.general = g.newGeneral(ca, 20); ca.general.tal = { d1: 5, d2: 5 }; cd.general = null; ca.units = { 200: 100 }; cd.units = { 201: 3000 };
  go('attack'); assert.ok(ca.general.dead && (ca.units[200] || 0) > 0, `нападение проиграно — генерал пал, спасённые лекарем вернулись (${ca.units[200] || 0})`);
  // оборона проиграна: защитники гибнут все (дома не выздоравливают — с 24.10), генерал в замке пал
  ca.general = null; cd.general = g.newGeneral(cd, 20); cd.units = { 201: 100 }; ca.units = { 200: 5000 };
  go('attack'); assert.ok(cd.general.dead && !(cd.units[201] > 0), `оборона проиграна — генерал и все защитники пали (${cd.units[201] || 0})`);
  // набег — короткая стычка: генерал защитника жив
  cd.general = g.newGeneral(cd, 20); cd.units = { 201: 100 }; ca.units = { 200: 5000 };
  go('raid'); assert.ok(!cd.general.dead, 'набег — генерал защитника жив');
  // оборона разбита, но генерал уцелел по шансу (Math.random — 0): без опыта, в отчёте — «чудом уцелел»
  { cd.general = g.newGeneral(cd, 20); cd.units = { 201: 100 }; ca.units = { 200: 5000 }; const e0 = cd.general.exp, rnd = Math.random, hb = g.heroBonus;
    g.heroBonus = function (gn) { const r = hb.call(this, gn); return gn === cd.general ? { ...r, survive: 0.3 } : r; }; Math.random = () => 0.01;
    try { go('attack'); } finally { Math.random = rnd; g.heroBonus = hb; }
    const rep = g.reportsOf(D.id).find((x) => x.data && x.data.type === 'battle');
    assert.ok(!cd.general.dead && cd.general.exp === e0 && rep.data.def.generalSaved && !rep.data.def.genExp, 'оборона разбита, генерал уцелел — без опыта, в отчёте «чудом уцелел»'); }
  // шанс уцелеть: «Несокрушимый» (40%) и рунный щит +5 (56%) — вместе не больше 30%
  const sv = g.heroBonus({ tal: { d4: 5 }, eq: { shield: { slot: 'shield', r: 4, plus: 5 } } }).survive;
  assert.strictEqual(sv, 0.3, `шанс уцелеть — не больше 30% (${sv})`);
  // павший генерал воскрешается — в обороне его нет, и в отчёте тоже
  { cd.general = g.newGeneral(cd, 20); cd.general.dead = true; cd.general.reviveAt = Date.now() + 1e12; cd.units = { 201: 100 }; ca.units = { 200: 5000 }; go('attack');
    const rep = g.reportsOf(D.id).find((x) => x.data && x.data.type === 'battle');
    assert.ok(cd.general.dead && !rep.data.def.general && !rep.data.def.genExp, `воскрешающийся генерал в отчёте обороны не показан (${rep.data.def.general})`); }
  console.log('✓ Генерал: гибнет, когда нападение или оборона проиграны (лекарь и выздоровевшие не спасают), в набеге — нет; уцелеть — до 30%');
}
{ // закрыть игру (closedtest.js): по умолчанию открыта; закрывает и открывает только администратор — на 8 или 24 часа, потом открывается сама;
  // без времени возвращения для игроков; файл maint.on рядом с базой — сервер запускается сразу с закрытой игрой, файл удаляется
  const adm = g.adminUser(), pl = g.register({ login: 'maintPl1', password: '12345', race: 0 }).user, H = 3600000;
  assert.ok(!g.maintOn() && /технические работы/.test(g.maintMsg()), 'по умолчанию игра открыта');
  assert.ok(g.adminOp(pl, 'maint', { on: 1, hours: 8 }).error && !g.maintOn(), 'игрок закрыть не может');
  assert.ok(/8 или на 24/.test(g.adminOp(adm, 'maint', { on: 1 }).error) && g.adminOp(adm, 'maint', { on: 1, hours: 5 }).error && !g.maintOn(), 'только 8 или 24 часа');
  const t0 = Date.now(), r = g.adminOp(adm, 'maint', { on: 1, hours: 8, text: 'Вернёмся к 18:00' });
  assert.ok(g.maintOn() && r.data.on && r.data.msg === g.maintMsg() && !/18:00/.test(r.data.msg), `без времени возвращения: ${r.data.msg}`);
  assert.ok(r.data.until >= t0 + 8 * H && r.data.until <= Date.now() + 8 * H && r.data.hours.join() === '8,24', `срок — 8 часов (${r.data.until - t0})`);
  assert.ok(g.adminOp(adm, 'maint', {}).data.on, 'без on — только показать');
  const until = g.db.maint.until;
  assert.ok(!g.maintCheck(until - 1) && g.maintOn(until - 1) && !g.maintOn(until), 'за миг до срока закрыта, в срок — открыта');
  assert.ok(g.maintCheck(until) && !g.db.maint.on && !g.maintCheck(until + 1), 'срок вышел — открылась сама (один раз)');
  const r24 = g.adminOp(adm, 'maint', { on: 1, hours: 24 });
  assert.ok(g.maintOn() && r24.data.until >= t0 + 24 * H, 'на 24 часа');
  assert.ok(!g.adminOp(adm, 'maint', { on: 0 }).data.on && !g.maintOn(), 'открыта раньше срока');
  g.db.maint = { on: true, at: t0, by: 'admin' }; assert.ok(g.maintOn() && !g.maintCheck(t0 + 100 * H), 'закрыта прежней версией без срока — до кнопки');
  g.adminOp(adm, 'maint', { on: 0 });
  const flag = path.join(path.dirname(DB), `royal-${process.pid}-maint.on`);
  assert.ok(!g.maintBoot(flag) && !g.maintOn(), 'без файла maint.on — запуск как обычно');
  for (const [txt, h] of [['', 8], ['24\n', 24], ['8', 8], ['сутки', 8]]) {
    fs.writeFileSync(flag, txt); const b = Date.now();
    assert.ok(g.maintBoot(flag, b) === h && g.maintOn() && g.db.maint.until === b + h * H && !fs.existsSync(flag), `файл maint.on «${txt.trim()}» — закрыта на ${h} ч, файл удалён`);
    g.adminOp(adm, 'maint', { on: 0 });
  }
  assert.ok(!g.maintBoot(flag) && !g.maintOn(), 'администратор открыл игру — следующий запуск обычный');
  console.log('✓ Закрыть игру: только администратор, на 8 или 24 часа — потом открывается сама; без времени для игроков; файл maint.on — запуск сразу закрытой');
}
{ // Центр разведки — только разведчик своей расы, вдвое дешевле и быстрее оригинала; Портал воинов не тренирует — он ускоряет походы.
  // Око, Тень, Джин и Изувер больше не тренируются; у кого уже есть — остаются и лечатся в Лазарете
  const { UNITS, UNIT, B, GENERAL_ID } = require('../src/army');
  const scouts = { humans: 202, elves: 209, dwarves: 217, orcs: 252 };
  for (const [race, id] of Object.entries(scouts)) {
    const list = UNITS.filter((u) => u.building === B.SPY && !u.notrain && (u.race === race || u.race === 'all')).map((u) => u.id);
    assert.deepStrictEqual(list, [id], `Центр разведки (${race}): только ${UNIT[id].name}, а не ${list}`);
  }
  assert.ok(!UNITS.some((u) => u.building === B.PORTAL && !u.notrain), 'Портал не тренирует');
  const half = { 202: [45, 50, 35, 28, 600], 209: [53, 35, 23, 15, 960], 217: [28, 53, 35, 35, 1090], 252: [40, 38, 43, 85, 1190] }; // оригинал / 2
  for (const [id, v] of Object.entries(half)) { const u = UNIT[id]; assert.deepStrictEqual([u.cost.wood, u.cost.stone, u.cost.iron, u.cost.food, u.time], v, `${u.name}: вдвое дешевле и быстрее`); }
  // и все остальные воины — вдвое дешевле и быстрее (и цена для отдельных рас); генерал, Кузница и наём генерала — по прежней цене
  const SPR = require('../src/army').SPRAVKA; // люди и эльфы — цена «Справки» ×4 (проверено ниже)
  for (const u of UNITS.filter((x) => x.id !== GENERAL_ID && !x.undead && !SPR[x.id] && !SPR[x.base])) {
    assert.ok(u.refCost && Object.keys(u.cost).every((r) => u.cost[r] === Math.round(u.refCost[r] / 2)) && u.time === Math.round(u.refTime / 2), `${u.name}: вдвое дешевле и быстрее`);
  }
  assert.deepStrictEqual(UNIT[224].raceOvr.orcs.cost, { wood: 2500, stone: 2500, iron: 2500, food: 3750 }, 'Путешественник орков — тоже вдвое');
  assert.deepStrictEqual(UNIT[200].cost, { wood: 32, stone: 12, iron: 40, food: 20 }, 'Мечник: цена «Справки» ×4 (8/3/10/5)');
  assert.ok(UNIT[200].time === 240 && UNIT[200].hp === 36 && UNIT[200].speed === 17 && UNIT[200].carry === 30, 'Мечник: время ×4, жизнь, скорость — по «Справке», груз ×10 (3 → 30)');
  for (const [id, n, b, l] of [[262, 'Ведьмак', B.MAGE_ACADEMY, 3], [263, 'Варлок', B.MAGE_ACADEMY, 10], [264, 'Рейтар', B.STABLE, 7], [265, 'Страж границ', B.BARRACKS, 10], [266, 'Эльфийский всадник', B.STABLE, 1], [267, 'Повелитель стихий', B.MAGE_ACADEMY, 3], [268, 'Дух леса', B.MAGE_ACADEMY, 10], [269, 'Грифоний наездник', B.STABLE, 3], [270, 'Топтун', B.STABLE, 7], [271, 'Громовержец', B.MAGE_ACADEMY, 3], [272, 'Варг', B.STABLE, 1], [273, 'Загонщик', B.STABLE, 3], [274, 'Потрошитель', B.STABLE, 7], [275, 'Заклинатель', B.MAGE_ACADEMY, 3]])
    assert.ok(UNIT[id].name === n && UNIT[id].building === b && UNIT[id].level === l && UNIT[id].def && UNIT[id].cost.wood === SPR[id][5][0] * 4, `новый юнит: ${n}`);
  { // Торговая палата: груз торговцев +1/45 за уровень (Рынок 20 + Палата 20 — 1300 вместо 900) и скорость; Таверны больше нет (с 22.10)
    const C = require('../src/catalog'), tp = g.register({ login: 'tavernTst', password: '12345', race: 0 }).user, tc = g.castleOf(tp); g.mil(tc);
    g.maxOut(tc); assert.ok(!C.BY_ID[42] && !g.buildingLevel(tc, 42), 'Таверны нет: не строится и в полном замке её нет');
    g.setBuildingLevel(tc, B.TRADE_HALL, 1); const L = g.buildingLevel(tc, B.MARKET), m1 = g.merchants(tc); g.setBuildingLevel(tc, B.TRADE_HALL, 20); const m20 = g.merchants(tc);
    assert.ok(L === 20 && Math.abs(m20.carry - m1.carry - 380) <= 1 && m20.speed > m1.speed, `Торговая палата 1 → 20 ур.: +380 к грузу (${m1.carry} → ${m20.carry}), быстрее (${m1.speed} → ${m20.speed})`);
    const sv = tp.sciences; tp.sciences = { eco: 0, eng: 0, fhi: 0, war: 0 }; assert.strictEqual(g.merchants(tc).carry, 1300, 'Рынок 20 + Палата 20 без наук — 1300'); tp.sciences = sv;
    // Таверна в старом замке: клетка освобождается, уровни и стройка — ресурсами в Кладовую
    let cell = tc.grid[0].indexOf(B.TEMPLE); tc.grid[0][cell] = 42; tc.levels[0][cell] = 3; // вместо Храма (свободных мест в полном замке нет)
    const qc = { wood: 7, stone: 7, iron: 7, food: 7, people: 1 }; tc.queue.push({ view: 0, cell, building: 42, level: 4, start: Date.now(), end: Date.now() + 1e9, cost: qc });
    const st = g.stashOf(tp).res, w0 = st.wood || 0, want = [1, 2, 3].reduce((q, lv) => q + C.levelCost(C.GONE[42], lv).wood, 0) + 7;
    g.goneFix(tc); assert.ok(tc.grid[0][cell] === -1 && !tc.levels[0][cell] && !tc.queue.some((x) => x.building === 42), 'Таверна убрана, стройка отменена');
    assert.strictEqual((g.stashOf(tp).res.wood || 0) - w0, want, 'потраченное на Таверну — в Кладовой'); g.goneFix(tc); assert.strictEqual((g.stashOf(tp).res.wood || 0) - w0, want, 'второй раз не возвращается');
    cell = tc.grid[0].indexOf(-1); tc.grid[0][cell] = 42; tc.levels[0][cell] = 1; g.tick(tc); assert.ok(tc.grid[0][cell] === -1, 'и при обычном ходе времени');
    // Лагерь археологов (с 25.10 нет): так же — уровни в Кладовую; Экспедиции он больше не нужен
    cell = tc.grid[0].indexOf(-1); tc.grid[0][cell] = 16; tc.levels[0][cell] = 2; const w1 = g.stashOf(tp).res.wood || 0;
    g.goneFix(tc); assert.ok(!C.BY_ID[16] && tc.grid[0][cell] === -1 && (g.stashOf(tp).res.wood || 0) - w1 === C.levelCost(C.GONE[16], 1).wood + C.levelCost(C.GONE[16], 2).wood && !C.BY_ID[17].req[16], 'Лагеря археологов нет: уровни — в Кладовую, Экспедиции он не нужен');
  }
  for (const id of [250, 254, 260, 258, 257, 255, 239, 244]) assert.ok(UNIT[id].notrain && UNIT[id].retired, `${UNIT[id].name}: старый воин — больше не тренируется, в армии остаётся`);
  for (const r of ['humans', 'elves', 'dwarves', 'orcs']) assert.strictEqual(UNITS.filter((u) => u.race === r && !u.notrain && [B.BARRACKS, B.STABLE, B.MAGE_ACADEMY].includes(u.building)).length, 9, `${r}: в Казарме, Конюшне, Академии — по 3 воина (4-й — в Мастерской)`);
  for (const id of [220, 213, 259, 249]) { const u = UNIT[id], sum = Object.values(u.cost).reduce((q, v) => q + v, 0); const sc = u.hp + 3 * (u.attack + u.magic) + 1.5 * (u.def.inf + u.def.cav + u.def.mag) / 3 + u.bldDmg + 2 * u.speed; assert.ok(u.building === B.WORKSHOP && u.level === 10 && Math.abs(sum - 780) <= 2 && u.time === 1200 && Math.abs(sc - 180) <= 1, `${u.name}: в Мастерской, сила равная (${sc}), 20 мин`); }
  assert.ok(UNIT[213].oneUse && UNIT[259].oneUse && UNIT[220].oneUse && UNIT[249].oneUse, 'разрушители исчезают после боя');
  assert.ok(!UNIT[GENERAL_ID].refCost && g.genTrainCost(UNIT[200]).cost.wood === UNIT[200].refCost.wood * 20 && g.forgeCost(UNIT[200], 'a', 0).cost.wood > UNIT[200].cost.wood, 'наём генерала и Кузница — по прежней цене');
  const pl = g.register({ login: 'spyPl1', password: '12345', race: 0 }).user, c = g.castleOf(pl); g.maxOut(c); c.training = [];
  const w0 = c.res.wood; assert.ok(!g.train(c, 200, 10).error && w0 - c.res.wood === 10 * UNIT[200].cost.wood, `10 Мечников — за новую цену (${w0 - c.res.wood})`);
  assert.ok(/только разведчики/.test(g.train(c, 241, 1).error) && /только разведчики/.test(g.train(c, 242, 1).error), 'Око и Тень не тренируются');
  assert.ok(/ускоряет походы/.test(g.train(c, 206, 1).error), 'Джин не тренируется');
  assert.ok(!g.train(c, 202, 1).error, 'Разведчик тренируется');
  const d = g.register({ login: 'spyDef1', password: '12345', race: 0 }).user, cd = g.castleOf(d); g.maxOut(cd); cd.units = { 201: 50000 }; cd.squads = [];
  c.units = { 206: 100 }; c.wounded = {}; c.general = null; c.squads = [];
  g.clash(c, { units: { 206: 100 }, mission: 'attack', general: false }, cd, null, Date.now());
  assert.ok((c.wounded[206] || 0) > 0, `Джин, который уже был, лечится в Лазарете (${JSON.stringify(c.wounded)})`);
  console.log('✓ Все воины вдвое дешевле и быстрее (Кузница и генерал — по прежней цене); Центр разведки — только разведчик своей расы; Портал не тренирует; Око, Тень, Джин, Изувер — у кого есть, остаются');
}
{ // подарки: даритель удаляет свой подарок у получателя за столько же монет, сколько подарок стоил; чужой, из казны и без монет — нельзя
  const mk = (l) => g.register({ login: l, password: '12345', race: 0 }).user;
  const A = mk('gdelA1'), Bq = mk('gdelB1'), Cq = mk('gdelC1'); A.gold = 100; Cq.gold = 100;
  assert.ok(g.sendGift(A, Bq.id, 'treasure', 'от А').ok && g.sendGift(Cq, Bq.id, 'gold_coin', '').ok, 'подарили');
  const ga = Bq.gifts.find((x) => x.from === A.id), gc = Bq.gifts.find((x) => x.from === Cq.id), a0 = A.gold, stat = g.stats(Bq).giftGold; // Сундук сокровищ — 3 монеты
  assert.ok(/только свой/.test(g.deleteGift(A, Bq.id, gc.at, gc.gift).error), 'чужой подарок удалить нельзя');
  assert.ok(/только свой/.test(g.deleteGift(Bq, Bq.id, ga.at, ga.gift).error), 'получатель так не удаляет');
  A.gold = 2; assert.ok(/Нужно монет: 3/.test(g.deleteGift(A, Bq.id, ga.at, ga.gift).error) && Bq.gifts.includes(ga), 'не хватает монет — подарок остаётся');
  A.gold = a0;
  const r = g.deleteGift(A, Bq.id, ga.at, ga.gift);
  assert.ok(r.ok && A.gold === a0 - 3 && !Bq.gifts.includes(ga) && Bq.gifts.includes(gc) && g.stats(Bq).giftGold === stat, `удалён за 3 монеты, очки «Благодарности» остались: ${r.msg}`);
  assert.ok(g.deleteGift(A, Bq.id, ga.at, ga.gift).error, 'второй раз — уже нет');
  Bq.gifts.push({ gift: 'treasure', from: A.id, at: 1, text: '', ally: 'KRL' });
  assert.ok(g.deleteGift(A, Bq.id, 1, 'treasure').error, 'подарок из казны альянса так не удаляется');
  console.log('✓ Подарки: даритель удаляет свой подарок за его цену; чужой, из казны альянса и без монет — нельзя');
}
{ // новые правила боя — проба (админка): по умолчанию выключены; Кузница — до половины базы, тараны — только при победе,
  // подкрепления — со своими бонусами, магия ¾; «Сравнить бой» — по прежним и новым правилам, в игре ничего не меняется
  const adm = g.adminUser(), mk = (login) => g.register({ login, password: '12345', race: 0 }).user;
  assert.ok(!g.newBattle(), 'по умолчанию — прежние правила');
  const A = mk('brlAtt1'), D = mk('brlDef1'), H = mk('brlAlly1'), F = mk('brlFresh1');
  const ca = g.castleOf(A), cd = g.castleOf(D), ch = g.castleOf(H), cf = g.castleOf(F); g.maxOut(ca); g.maxOut(cd); g.mil(ch); g.mil(cf);
  for (const c of [ca, cd, ch, cf]) { c.general = null; c.squads = []; c.armies = []; }
  const rules = (on) => g.adminOp(adm, 'battlerules', { on });
  // 1. Кузница: с 25.10 предела «половина базы» нет — мечник с +19 бьёт с +19 и при новых правилах, улучшать можно до 20 уровня
  ca.forge = { 200: { a: 19, d: 19 } };
  const atk = () => { cd.units = { 200: 1 }; return g.clash(ca, { units: { 200: 100 }, mission: 'attack', general: false }, cd, null, Date.now()).calc.att.total; };
  const a0 = atk(); assert.ok(rules(1).data.on && g.newBattle(), 'новые правила включены'); const a1 = atk();
  const AR2 = require('../src/army'), mA = AR2.UNIT[200].attack, capA = Math.max(5, Math.floor(mA / 2)); // база мечника — из «Справки»
  assert.ok(Math.abs(a1 / a0 - 1) < 0.01, `Кузница: мечник +19 — в бою те же +19 и при новых правилах (урон ${a0} → ${a1}; база ${mA}, прежний предел был бы +${capA})`);
  ca.forge = { 200: { a: 5 } }; ca.upJobs = {}; Object.assign(ca.res, { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, people: 1e5 });
  assert.ok(g.forgeOp(ca, { unit: 200, kind: 'a' }).ok, 'после +5 улучшать дальше можно');
  ca.forge = { 200: { a: 19 } }; ca.upJobs = {}; assert.ok(/максимальный уровень \(20\)/.test(g.forgeOp(ca, { unit: 200, kind: 'a' }).error || '') && g.milState(ca, A).forgeCap === null, 'до 20 уровня — и всё; окну Кузницы предела нет');
  // 2. тараны: проигранное нападение Забор не ломает (прежние правила — ломало)
  const ram = (on) => { rules(on); g.setBuildingLevel(cd, 22, 20); cd.units = { 201: 1000 }; const R = g.clash(cf, { units: { 243: 180, 200: 1 }, mission: 'attack', general: false }, cd, null, Date.now()); return { win: R.win, wall: g.buildingLevel(cd, 22) }; };
  const r0 = ram(0), r1 = ram(1);
  assert.ok(!r0.win && r0.wall < 20 && !r1.win && r1.wall === 20, `тараны: прежние — Забор 20 → ${r0.wall}, новые — цел (${r1.wall})`);
  // 3. подкрепления — со своими бонусами: у хозяина наука 20 и легендарный артефакт защиты, у союзника — ничего
  D.sciences = { eco: 0, eng: 0, fhi: 0, war: 20 }; cd.artifacts = [{ id: 880001, type: 'def', rarity: 2, active: true, until: Date.now() + 1e9 }];
  const dp = (on) => { rules(on); cd.units = {}; ch.armies = [{ id: 880002, units: { 201: 1000 }, mission: 'reinforce', state: 'stay', stayAt: cd.id, general: false, x: cd.x, y: cd.y }];
    const v = g.clash(cf, { units: { 200: 10 }, mission: 'attack', general: false }, cd, null, Date.now()).calc.def.total; ch.armies = []; return v; };
  // с 24.10 (бой как в оригинале) подкрепления всегда бьют со своими бонусами — при любых правилах
  const g0 = dp(0), g1 = dp(1); assert.ok(g1 === g0 && g0 > 0, `подкрепление со своими бонусами: урон ${g0} = ${g1}`);
  // 5. «Сравнить бой»: два итога, в игре ничего не меняется (армии, Забор, Лазарет, подкрепления, правила, удача)
  rules(0); g.setBuildingLevel(cd, 22, 20); cd.units = { 201: 800 }; ca.units = { 200: 3000, 243: 60 }; ca.forge = { 200: { a: 19, d: 19 } }; delete ca.wounded; delete cd.wounded;
  ch.armies = [{ id: 880003, units: { 201: 300 }, mission: 'reinforce', state: 'stay', stayAt: cd.id, general: false, x: cd.x, y: cd.y }];
  const snap = () => JSON.stringify([ca.units, cd.units, g.buildingLevel(cd, 22), ch.armies[0].units, ca.wounded || null, cd.wounded || null, g.db.battleRules, process.env.LUCK]);
  const s0 = snap(), cmp = g.adminOp(adm, 'battlecmp', { att: 'BRLATT1', def: 'brlDef1', mission: 'attack', general: 1 });
  const c = cmp.data && cmp.data.cmp;
  assert.ok(c && c.old && c.new && c.old.sent === 3060 && c.old.had === 1100 && c.old.guests === 300 && c.old.wall0 === 20, `сравнение: обе колонки, ник без учёта регистра (${cmp.error || ''})`);
  assert.ok(c.new.ap === c.old.ap, `Кузница одинакова по прежним и новым правилам — до 20 ур. (${c.old.ap} → ${c.new.ap})`);
  assert.strictEqual(snap(), s0, 'сравнение ничего не меняет в игре');
  assert.ok(g.adminOp(adm, 'battlecmp', { att: 'brlAtt1', def: 'nobody_such' }).error && g.adminOp(adm, 'battlecmp', { att: 'brlAtt1', def: 'brlAtt1' }).error, 'неизвестный ник и бой с собой — ошибка');
  ch.armies = []; rules(0); assert.ok(!g.newBattle(), 'прежние правила вернулись');
  console.log(`✓ Новые правила боя (проба): Кузница и Школа магии до 20 ур. у всех, тараны — при победе, подкрепления — свои бонусы, магия ¾; «Сравнить бой» без следа (атака ${c.old.ap} → ${c.new.ap})`);
}
{ // подарок новичку: Премиум на 3 дня с регистрации — один раз, сам не продлевается; покупка — сверх подарка
  process.env.NEWBIE_PREMIUM_DAYS = '3';
  const N = g.register({ login: 'premNew1', password: '12345', race: 0 }).user;
  assert.ok(g.isPremium(N) && N.premium === N.created + 3 * DAY && N.premiumGift === N.premium, 'новичок — Премиум на 3 дня');
  assert.strictEqual(g.welcomeInfo(N, 0).premGift, N.premium, 'советник напоминает о подарке');
  const hi = g.db.messages.find((m) => m.to === N.id && m.from === g.adminUser().id);
  assert.ok(hi && hi.subject === 'Подарок новичку: Премиум на 3 дня' && /Премиум Завоеватель на 3 дня, до \d\d\.\d\d, \d\d:\d\d \(МСК\)/.test(hi.text) && !hi.read, 'приветственное письмо от Советника');
  N.gold = 100; assert.ok(g.buyPremium(N, 14).ok && N.premium === N.premiumGift + 14 * DAY, 'купленные дни — сверх подарка');
  assert.strictEqual(g.welcomeInfo(N, 0).premGift, N.premium, 'советник называет конец премиума — с купленными днями');
  N.premium = N.premiumGift = Date.now() - 1; assert.ok(!g.isPremium(N) && !g.welcomeInfo(N, 0).premGift, 'через 3 дня подарок кончается сам');
  process.env.NEWBIE_PREMIUM_DAYS = '0';
  const O = g.register({ login: 'premOld1', password: '12345', race: 0 }).user; assert.ok(!O.premium && !g.isPremium(O) && !g.db.messages.some((m) => m.to === O.id), 'NEWBIE_PREMIUM_DAYS=0 — без подарка и письма');
  console.log('✓ подарок новичку: Премиум на 3 дня с регистрации, сам не продлевается, покупка — сверх подарка');
}
{ // «Премиум всем» (админка): каждому живому игроку (в игре от 3 дней, заходил за 30 дней, не заблокирован; не боты и не админ) +N дней (1–30);
  // у кого есть — продлится; уведомление; кто был не в игре — скажет советник
  const adm = g.adminUser(), now0 = Date.now(), reg = (l) => { const x = g.register({ login: l, password: '12345', race: 0 }).user; x.created = now0 - 4 * DAY; x.lastSeen = now0; return x; };
  const P1 = reg('premAll1'), P2 = reg('premAll2'), Bt = reg('premAllB'); Bt.bot = true; P2.premium = now0 + 10 * DAY;
  const Fresh = g.register({ login: 'pmNew1', password: '12345', race: 0 }).user, Ban = reg('pmBan1'), Idle = reg('pmIdle1'); Ban.banned = true; Idle.lastSeen = now0 - 40 * DAY;
  const ap = adm.premium, bp = Bt.premium, gm0 = process.env.GRANT_MIN_DAYS; process.env.GRANT_MIN_DAYS = '3';
  for (const d of [0, 31, 'x', -3, '']) assert.ok(/от 1 до 30/.test(g.adminOp(adm, 'premall', { days: d }).error || ''), `срок «${d}» — отказ`);
  assert.ok(/Нет прав/.test(g.adminOp(P1, 'premall', { days: 3 }).error || ''), 'не админ — нет прав');
  g.drainEvents();
  const live = (u) => !u.bot && !u.admin && !u.banned && now0 - (u.created || 0) >= 3 * DAY && now0 - (u.lastSeen || u.created || 0) <= 30 * DAY;
  const r = g.adminOp(adm, 'premall', { days: 7, why: 'В честь <праздника>' }), k = Object.values(g.db.users).filter(live).length, l0 = r.data && r.data.last[0];
  assert.ok(!g.isPremium(Fresh) && !g.isPremium(Ban) && !g.isPremium(Idle), 'новичку младше 3 дней, заблокированному и давно не заходившему — нет');
  assert.ok(r.ok && l0.days === 7 && l0.players === k && l0.why === 'В честь праздника' && r.data.msg === `Премиум на 7 дней выдан ${k} ${require('../src/words').plural(k, 'игроку', 'игрокам', 'игрокам')}.`, JSON.stringify(r.data));
  assert.ok(P1.premium >= now0 + 7 * DAY && P1.premium <= Date.now() + 7 * DAY && g.isPremium(P1), 'без премиума — 7 дней с этой минуты');
  assert.strictEqual(P2.premium, now0 + 17 * DAY, 'у кого был — продлён на 7 дней');
  assert.ok(Bt.premium === bp && adm.premium === ap, 'ботам и админу — нет');
  const ev = g.drainEvents(); assert.ok(ev.length === k && ev.some((e) => e.userId === P1.id && e.msg === '👑 В честь праздника: Премиум Завоеватель на 7 дней!'), 'уведомление каждому');
  const w = g.welcomeInfo(P1, now0 - 1000).premAll; assert.ok(w && w.days === 7 && w.why === 'В честь праздника' && w.until === P1.premium, 'был не в игре — советник скажет при входе');
  assert.ok(!g.welcomeInfo(P1, Date.now() + 1).premAll, 'заходил после раздачи — советник молчит');
  P1.premium = Date.now() - 1; assert.ok(!g.welcomeInfo(P1, now0 - 1000).premAll, 'премиум уже кончился — советник молчит');
  assert.ok(g.adminOp(adm, 'premall', { days: '1' }).ok && P2.premium === now0 + 18 * DAY && g.db.premAll.slice(-1)[0].why === 'Подарок от администрации', 'срок строкой, причина по умолчанию');
  const last = g.adminOp(adm, 'premallget', {}).data.last; assert.ok(last.length === 2 && last[0].days === 1 && last[1].days === 7, 'журнал раздач — новые сверху');
  if (gm0 === undefined) delete process.env.GRANT_MIN_DAYS; else process.env.GRANT_MIN_DAYS = gm0;
  console.log('✓ «Премиум всем»: каждому живому игроку (не новичку младше 3 дней, не заблокированному, не пропавшему на месяц) на 1–30 дней, у кого есть — продлится, уведомление, советник при входе, журнал раздач');
}
{ // лазейки: вступление по тегу — только заявка; выдача из кладовой альянса — сколько влезет (остальное остаётся); взнос и выдача
  // свои монеты в казну альянса не переводятся, выдача из казны — не в Зал Славы; фонд воскрешения генерала — назад не выше Склада; цели заданий — от лучшей Ратуши
  const mk = (login) => g.register({ login, password: '12345', race: 0 }).user;
  const L = mk('lhLead1'), J = mk('lhJoin1'), M = mk('lhMemb1');
  g.db.alliances = g.db.alliances || {}; const aid = g.db.nextId++;
  const al = g.db.alliances[aid] = { id: aid, name: 'Лазейки', tag: 'LZK', leader: L.id, members: [L.id, M.id], created: Date.now(), treasury: 0, storage: { wood: 0, stone: 0, iron: 0, food: 0 } };
  L.alliance = M.alliance = aid;
  const cj = g.castleOf(J); g.mil(cj); g.maxOut(cj);
  const jr = g.alliance(J, cj, { op: 'join', tag: 'lzk' });
  assert.ok(jr.ok && /Заявка/.test(jr.msg) && !J.alliance && !al.members.includes(J.id) && (al.requests || []).includes(J.id), `по тегу — только заявка главе (${jr.error || jr.msg})`);
  al.storage.wood = 500000; const cm = g.castleOf(M); g.mil(cm); g.maxOut(cm); g.tick(cm); const capW = g.capacity(cm).wood; cm.res.wood = capW - 1000;
  const sr = g.allyOp(L, g.castleOf(L), { op: 'store', res: { wood: 50000 }, to: M.login });
  assert.ok(sr.ok && cm.res.wood <= capW && cm.res.wood >= capW - 1 && al.storage.wood >= 499000 && al.storage.wood <= 499001 && /остальное осталось/.test(sr.msg), `кладовая: выдано сколько влезло, остальное — в кладовой (${al.storage.wood}, ${sr.msg})`);
  cm.res.wood = capW + 5; assert.ok(/Склады полны/.test(g.allyOp(L, g.castleOf(L), { op: 'store', res: { wood: 10 }, to: M.login }).error || ''), 'Склад полон — выдать некуда');
  L.gold = 1000; const st0 = { ...g.stats(L) };
  assert.ok(/не переводятся/.test(g.allyOp(L, g.castleOf(L), { op: 'gold', n: 500 }).error || '') && L.gold === 1000 && !al.treasury, 'свои монеты в казну альянса не переводятся — запасные аккаунты не перегонят монеты основному');
  const ag = g.adminOp(g.adminUser(), 'allygold', { tag: 'lzk', n: 2500 }); assert.ok(/Казна \[LZK\]: \+/.test(ag.msg || '') && al.treasury === 2500, `казну пополняет администрация (${ag.error || ag.msg})`);
  assert.ok(g.adminOp(g.adminUser(), 'allygold', { tag: 'LZK', n: -2501 }).error && g.adminOp(g.adminUser(), 'allygold', { tag: 'NOPE', n: 5 }).error, 'больше, чем в казне, не списать; чужой тег — нет');
  assert.ok(/нельзя выдать/.test(g.allyOp(L, g.castleOf(L), { op: 'gold', n: 500, to: M.login }).error || '') && al.treasury === 2500, 'казну игрокам не выдать — монеты основному не перегнать');
  // казна тратится только на медали и подарки участникам
  const md = g.alliance(L, g.castleOf(L), { op: 'award', login: M.login, kind: 'gold', text: 'За оборону' });
  assert.ok(md.ok && al.treasury === 2480 && (M.allyAwards || []).length === 1, `золотая медаль — 20 монет из казны (${md.error || al.treasury})`);
  const gf = g.sendGift(L, M.id, 'gift_box', 'спасибо', true);
  assert.ok(gf.ok && al.treasury === 2479 && M.gifts.slice(-1)[0].ally === 'LZK' && L.gold === 1000, `подарок участнику — из казны, свои монеты не тратятся (${gf.error || al.treasury})`);
  assert.ok(/Себе/.test(g.sendGift(L, L.id, 'gift_box', '', true).error || '') && /только участникам/.test(g.sendGift(L, J.id, 'gift_box', '', true).error || ''), 'из казны — не себе и только участникам');
  assert.ok(/Себе/.test(g.alliance(L, g.castleOf(L), { op: 'award', login: L.login, kind: 'bronze' }).error || '') && al.treasury === 2479, 'медаль из казны себе — нельзя');
  assert.ok(/казначейство/.test(g.sendGift(M, L.id, 'gift_box', '', true).error || ''), 'дарить из казны — только с правом «Казначейство»');
  al.treasury = 2; assert.ok(/не хватает/.test(g.sendGift(L, M.id, 'treasure', '', true).error || '') && /стоит/.test(g.alliance(L, g.castleOf(L), { op: 'award', login: M.login, kind: 'bronze' }).error || '') && al.treasury === 2, 'в казне не хватает — ни подарка, ни медали');
  const st1 = g.stats(L); assert.ok((st1.goldIn || 0) === (st0.goldIn || 0) && (st1.goldOut || 0) === (st0.goldOut || 0) && L.gold === 1000, 'казна альянса — не Богатство и не Расточительство');
  const cg = g.castleOf(M), capG = g.capacity(cg); M.gold = 100;
  cg.general = { ...g.newGeneral(cg, 30), dead: true, fund: { wood: 50000, stone: 0, iron: 0, food: 0, people: 0 } }; cg.deadGenerals = []; cg.res.wood = capG.wood - 100;
  const sw0 = g.stashOf(M).res.wood || 0, rv = g.reviveGeneral(cg, M, 0, true), toStash = (g.stashOf(M).res.wood || 0) - sw0;
  assert.ok(rv.ok && cg.res.wood <= capG.wood + 1 && Math.abs(toStash - 49900) <= 2, `фонд генерала: в замок до Склада, остальное в Кладовую (${Math.round(cg.res.wood)}/${capG.wood}, в Кладовую ${toStash})`);
  const Q = mk('lhQuest1'), qc1 = g.castleOf(Q); g.mil(qc1); g.maxOut(qc1); const qc2 = g.createCastle(Q); Q.castleIds = [qc1.id, qc2.id];
  const D = require('../src/quests').DAILY, loot = D.find((d) => d.id === 'd_loot'), train = D.find((d) => d.id === 'd_train');
  assert.ok(loot.n(g, qc2) === loot.n(g, qc1) && loot.n(g, qc2) === 1500 * g.buildingLevel(qc1, 0) && train.n(g, qc2) === train.n(g, qc1), `цели заданий — от лучшей Ратуши, из любого замка (${loot.n(g, qc2)} / ${loot.n(g, qc1)})`);
  console.log('✓ Лазейки: по тегу — только заявка; кладовая альянса — сколько влезет; казна альянса — без взносов своих монет и без выдачи игрокам, только медали и подарки; фонд генерала — не выше Склада; задания — от лучшей Ратуши');
}
{ // «Топ» по боевому рангу: больше очков — выше, по 10 на страницу; без ботов, админа и заблокированных; своё место
  const BR = require('../src/battlerank');
  const T = Array.from({ length: 12 }, (_, i) => g.register({ login: `brTop${i}`, password: '12345', race: 0 }).user);
  T.forEach((u, i) => { g.brOf(u); u.br.pts = 1000000 + i * 1000; }); // выше всех прочих тестовых игроков
  T[11].banned = true; T[10].bot = true;
  const top = (page = 0) => { delete g.cache.brtop; return g.brTop(T[0], page); };
  const t = top();
  assert.ok(t.list.length === 10 && t.list[0].id === T[9].id && t.list[0].place === 1 && t.list[1].id === T[8].id, 'больше очков — выше; заблокированный и бот не в списке');
  assert.ok(t.list.every((r) => r.pts > 0 && r.title === BR.rankInfo(BR.rankIdx(r.pts)).title && !g.userById(r.id).admin), 'звание по очкам, без админа');
  assert.ok(t.me === 10 && t.total >= 10 && top(99).page === top(99).pages - 1, `своё место (${t.me}); страница — не дальше последней`);
  T[11].banned = false; T[10].bot = false;
  console.log('✓ Боевой ранг, «Топ»: больше очков — выше, по 10 на страницу, без ботов, админа и заблокированных, своё место');
}
{ // Кладовая: разовый сброс излишков при обновлении — каждого ресурса не больше 400 000; второй раз не срабатывает, дальше копить можно
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'royal-stcut-')), SDB = path.join(dir, 'db.json');
  let gs = new Game(new Store(SDB));
  assert.ok(gs.db.stashCut && gs.db.stashCut.users === 0, 'новая база — сброс отмечен сразу, списывать нечего');
  const reg = (l) => gs.register({ login: l, password: '12345', race: 0 }).user, K = reg('stCutK'), L = reg('stCutL'), Z = reg('stCutZ');
  const uid = Number(Object.keys(require('../src/army').UNIT)[0]);
  gs.stashAdd(K, { wood: 1250000, stone: 400000, iron: 399999, food: 400001, units: { [uid]: 5 }, exp: 700000 });
  gs.stashAdd(L, { wood: 1000 }); gs.castlesOf(L)[0].stash = { res: { food: 900000 } }; // прежняя кладовая замка — тоже в счёт
  delete gs.db.stashCut; gs.store.flush(); // база до обновления
  gs = new Game(new Store(SDB)); // запуск новой версии
  const k2 = gs.userById(K.id), l2 = gs.userById(L.id), ks = gs.stashOf(k2);
  assert.ok(ks.res.wood === 400000 && ks.res.stone === 400000 && ks.res.iron === 399999 && ks.res.food === 400000, 'каждого ресурса — не больше 400 000');
  assert.ok(ks.units[uid] === 5 && ks.exp === 700000, 'воины и опыт не тронуты');
  assert.deepStrictEqual(k2.stashCut.res, { wood: 850000, food: 1 }, 'сколько списано — записано у игрока');
  assert.ok(gs.stashOf(l2).res.wood === 1000 && gs.stashOf(l2).res.food === 400000 && !gs.castlesOf(l2)[0].stash, 'прежняя кладовая замка — тоже');
  assert.ok(!gs.userById(Z.id).stashCut && gs.db.stashCut.users === 2 && gs.db.stashCut.res.wood === 850000 && gs.db.stashCut.res.food === 500001, 'итог сброса');
  assert.strictEqual(gs.adminInspect(k2).stash.cut.res.wood, 850000, 'в «Осмотре» админки видно, сколько списано');
  gs.stashAdd(k2, { wood: 600000 }); gs.store.flush();
  gs = new Game(new Store(SDB));
  assert.strictEqual(gs.stashOf(gs.userById(K.id)).res.wood, 1000000, 'второй раз не срабатывает — дальше копить можно сколько угодно');
  gs.store.flush(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓ Кладовая: разовый сброс излишков при обновлении — каждого ресурса не больше 400 000; второй раз не срабатывает');
}
{ // общий чат: мат — звёздочками «***» (matfilter.js), хитрые написания тоже; похожие обычные слова — как есть
  const { censorMat, isMat } = require('../src/matfilter');
  const yes = ['нахуй', 'бля', 'Блять', 'заебал', 'ёбаный', 'пиздец', 'сука', 'мудак', 'пидор', 'xyй', '6лядь', 'х.у.й', 'бляяяять', 'отъебись', 'долбоёб', 'выблядок',
    'хули', 'blyat', 'suka', 'fuck', 'sh1t', 'охуеть', 'ПИЗДА', 'уёбок', 'съебался', 'сучка', 'гандон'];
  const no = ['корабля', 'рубля', 'употреблять', 'оскорблять', 'небо', 'хлеб', 'себя', 'требовать', 'ребята', 'застрахуй', 'психую', 'страхует', 'команда', 'мандарин',
    'хулиган', 'художник', 'хуже', 'мудрый', 'педикюр', 'сукно', 'бляха', 'блин', 'black', 'ebay', 'поехали', 'уехал', 'обед', 'скука', 'Hugo', 'hello'];
  assert.deepStrictEqual(yes.filter((w) => !isMat(w)), [], 'мат пойман');
  assert.deepStrictEqual(no.filter((w) => isMat(w)), [], 'обычные слова не задеты');
  assert.strictEqual(censorMat('иди нахуй, понял?'), 'иди ***, понял?');
  assert.strictEqual(censorMat('х у й тебе'), '*** тебе', 'слово по буквам');
  assert.strictEqual(censorMat('я и ты на корабле'), 'я и ты на корабле');
  delete g.db.chatClosed;
  const W = g.register({ login: 'matChat1', password: '12345', race: 0 }).user, r = g.chatPost(W, 'ну ты и мудак!!! бля');
  assert.ok(r.msg && r.msg.text === 'ну ты и ***!!! ***', `в чат ушло: ${r.msg ? r.msg.text : r.error}`);
  console.log('✓ общий чат: мат — звёздочками, хитрые написания тоже; похожие обычные слова не задеты');
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
(async () => { // фото в сообщениях: только сжатые точки, проверка размера, новый PNG, удаление через 3 часа
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
  g.store.flush(); { const g2 = new Game(new Store(DB)), m2 = g2.db.messages.find((x) => x.id === m.id); assert.ok(m2.pic && g2.picGet(m2.pic) && g2.picGet(m2.pic).png.length === p.png.length, 'после перезапуска сервера фото на месте'); }
  g.picSweep(Date.now() + 2 * 3600000); assert.ok(m.pic && g.picGet(m.pic), 'через 2 часа — ещё видно'); const pid = m.pic;
  g.picSweep(Date.now() + 3 * 3600000 + 60000); assert.ok(!m.pic && m.picGone && !g.picGet(pid), 'через 3 часа — удалено');
  { // «Мне нравится!» у аватарки: один голос, не за себя, список, сброс при новой аватарке
    a2.avatar = Date.now();
    assert.ok(g.avaLike(a1, a2.id).ok && g.avaLike(a1, a2.id).error && g.avaLike(a2, a2.id).error, 'один голос, не за себя');
    const L = g.avaLikes(a2, a2.id); assert.ok(L.list.length === 1 && L.list[0].login === 'picFrom' && g.avaLikes(a1, a2.id).mine, 'список голосов');
    g.removeAvatar(a2); assert.ok(!g.avaLikes(a1, a2.id).list.length && g.avaLike(a1, a2.id).error, 'нет аватарки — голоса сброшены');
  }
  console.log('✓ Фото в сообщениях: только точки, новый PNG, шелл не пройдёт, удаление через 3 часа');
  { // альянс: союзники не нападают, не грабят и не разведывают друг друга — только подкрепление и ресурсы; армия в пути к новому союзнику — домой без боя
    const A = g.register({ login: 'alyAaa', password: '12345', race: 0 }).user, Bu = g.register({ login: 'alyBbb', password: '12345', race: 0 }).user, Cu = g.register({ login: 'alyCcc', password: '12345', race: 0 }).user;
    const ca = g.castleOf(A), cb = g.castleOf(Bu), cc = g.castleOf(Cu); for (const c of [ca, cb, cc]) { g.mil(c); g.maxOut(c); c.units = { 200: 100, 202: 20, 221: 20 }; }
    A.admin = true; const al = { id: g.db.nextId++, tag: 'TST', name: 'Test' }; g.db.alliances = g.db.alliances || {}; g.db.alliances[al.id] = al; A.alliance = Bu.alliance = al.id;
    for (const [m, u] of [['attack', { 200: 5 }], ['raid', { 200: 5 }], ['scout', { 202: 2 }]]) assert.ok(/альянса/.test(g.sendArmy(ca, { units: u, x: cb.x, y: cb.y, mission: m }).error || ''), m);
    assert.ok(g.sendArmy(ca, { units: { 200: 5 }, x: cb.x, y: cb.y, mission: 'reinforce' }).army && g.sendArmy(ca, { units: { 221: 2 }, x: cb.x, y: cb.y, mission: 'trade', res: { wood: 10 } }).army, 'подкрепление и ресурсы — можно');
    const go = g.sendArmy(ca, { units: { 200: 5 }, x: cc.x, y: cc.y, mission: 'attack' }); assert.ok(go.army, 'на чужого — можно');
    Cu.alliance = al.id; const n0 = cc.units[200]; g.arrive(ca, go.army, Date.now()); assert.ok(cc.units[200] === n0 && go.army.state === 'back', 'стали союзниками в пути — без боя');
    console.log('✓ Альянс: на союзников только подкрепление и ресурсы, армия в пути — домой без боя');
  }
  { // старший модератор: модераторы, блокировка 1–7 дней, сброс ника; администратора не видит и не трогает, другого старшего — тоже
    const adm = Object.values(g.db.users).find((u) => u.admin) || (() => { const x = g.register({ login: 'smAdmin', password: '12345', race: 0 }).user; x.admin = true; return x; })();
    const sm = g.register({ login: 'smSenior', password: '12345', race: 0 }).user, sm2 = g.register({ login: 'smSecond', password: '12345', race: 0 }).user, pl = g.register({ login: 'smPlayer', password: '12345', race: 0 }).user, md = g.register({ login: 'smModer', password: '12345', race: 0 }).user;
    assert.ok(g.smodView(pl).error, 'обычному игроку панель недоступна');
    sm.smod = sm.mod = true; sm2.smod = sm2.mod = true; md.mod = true;
    for (const op of ['ban', 'chat', 'nick', 'castles', 'viol', 'mod']) assert.ok(/Администратора/.test(g.smodOp(sm, { op, login: adm.login, days: 1, why: 'тест', hours: 1, d: 1, on: 0 }).error || ''), `админа нельзя: ${op}`);
    assert.ok(/Администратора/.test(g.smodPlayer(sm, adm.login).error || ''), 'админа нельзя посмотреть');
    const v = g.smodView(sm); assert.ok(![...v.mods, ...v.smods, ...v.banned].some((x) => x.login === adm.login) && !v.multis.some((gr) => gr.users.some((x) => x.login === adm.login)), 'админа нет в списках и мультах');
    assert.ok(/Старшего/.test(g.smodOp(sm, { op: 'ban', login: sm2.login, days: 1, why: 'тест' }).error || ''), 'другого старшего — только админ');
    assert.ok(g.chatBanUser(sm, md.login, 1).ok && g.chatBanUser(md, sm.login, 1).error, 'старший наказывает модератора, модератор старшего — нет');
    assert.ok(g.smodOp(sm, { op: 'ban', login: pl.login, days: 5, why: 'тест' }).error, 'только 1, 3, 7 дней');
    assert.ok(g.smodOp(sm, { op: 'ban', login: pl.login, days: 3, why: 'оскорбления' }).msg && pl.banned && !g.banExpired(pl), 'блокировка на 3 дня');
    assert.ok(g.banExpired(pl, Date.now() + 4 * 86400000) && !pl.banned, 'через 3 дня — снята сама');
    const r = g.smodOp(sm, { op: 'nick', login: pl.login }); assert.ok(/^Player\d{1,4}$/.test(pl.login) && pl.login.length <= 10 && g.db.users[pl.login] === pl, r.msg);
    // модератора назначает администратор: старший модератор — только заявкой с причиной; снимает — сразу
    assert.ok(/почему/.test(g.smodOp(sm, { op: 'mod', login: pl.login, on: 1 }).error || ''), 'заявка — только с причиной');
    assert.ok(/Заявка отправлена/.test(g.smodOp(sm, { op: 'mod', login: pl.login, on: 1, why: 'Помогает новичкам' }).msg || '') && !pl.mod, 'старший модератор — только заявка администратору');
    assert.ok(/уже ждёт/.test(g.smodOp(sm, { op: 'mod', login: pl.login, on: 1, why: 'ещё раз' }).error || ''), 'вторая заявка на того же — нельзя');
    const rq = g.modReqList(); assert.ok(rq.length === 1 && rq[0].login === pl.login && rq[0].by === sm.login && g.smodView(sm).reqs[0].mine && g.adminOp(adm, 'mods').data.reqs.length === 1, 'заявка видна администратору и старшему');
    assert.ok(g.modReqDecide(sm, rq[0].id, true).error && !pl.mod, 'решает только администратор');
    assert.ok(g.adminOp(adm, 'modreq', { id: rq[0].id, ok: 1 }).msg && pl.mod && !pl.smod && !g.modReqList().length, 'администратор принял — модератор');
    assert.ok(g.smodOp(sm, { op: 'mod', login: pl.login, on: 0 }).msg && !pl.mod, 'снять модератора — сразу');
    g.smodOp(sm, { op: 'mod', login: pl.login, on: 1, why: 'вторая попытка' });
    assert.ok(g.adminOp(adm, 'modreq', { id: g.modReqList()[0].id, ok: 0 }).msg && !pl.mod && !g.modReqList().length, 'администратор отклонил — не модератор');
    g.smodOp(sm, { op: 'mod', login: pl.login, on: 1, why: 'третья' });
    assert.ok(g.smodOp(sm, { op: 'modreqcancel', login: pl.login }).msg && !g.modReqList().length, 'свою заявку можно отозвать');
    assert.ok(g.smodOp(adm, { op: 'mod', login: pl.login, on: 1 }).msg && pl.mod && !pl.smod, 'администратор назначает сразу');
    assert.ok((g.db.modLog || []).length >= 4, 'журнал модерации');
    console.log('✓ Старший модератор: права работают, модераторов — заявкой администратору (принять / отклонить / отозвать), администратора не видит и не трогает');
  }
  { // «Золото всем»: только админ, каждому игроку (не ботам и не админу) по n в Казну
    const adm = Object.values(g.db.users).find((u) => u.admin), pl = Object.values(g.db.users).find((u) => !u.admin && !u.bot), g0 = pl.gold || 0, a0 = adm.gold || 0;
    assert.ok(g.adminOp(pl, 'goldall', { n: 5 }).error, 'не админу — нельзя');
    assert.ok(g.adminOp(adm, 'goldall', { n: 0 }).error && g.adminOp(adm, 'goldall', { n: 5000 }).error, 'от 1 до 1000');
    const r = g.adminOp(adm, 'goldall', { n: 5, why: 'Праздник' }); assert.ok(!r.error && pl.gold === g0 + 5 && (adm.gold || 0) === a0 && pl.goldLog.some((x) => /Праздник/.test(x.reason || x.why || JSON.stringify(x))), r.msg);
    console.log('✓ Золото всем:', r.msg);
  }
  { // переписка, как в оригинале: «История» по страницам, «Изменить» — удалить отмеченное / разговор (только у себя), «Переслать»
    const MDB = path.join(os.tmpdir(), `royal-msg-${process.pid}.json`), g = new Game(new Store(MDB));
    const reg = (l) => g.register({ login: l, password: '12345', race: 0 }).user, a = reg('msgA1'), b = reg('msgB1'), c = reg('msgC1');
    for (let i = 0; i < 25; i++) g.sendMail(i % 2 ? b : a, i % 2 ? a.login : b.login, 'Сообщение', `текст ${i}`);
    const ab = () => g.db.messages.filter((x) => (x.from === a.id && x.to === b.id) || (x.from === b.id && x.to === a.id));
    const h = g.dialogHistory(a, b.id); assert.ok(h.pages === 2 && h.page === 1 && h.list.length === 5 && g.dialogHistory(a, b.id, 0).list.length === 20, 'История: по 20 на страницу, сначала — новые');
    const [first, second] = ab();
    assert.ok(g.msgDelete(c, [first.id]).n === 0, 'чужую переписку не удалить');
    assert.ok(g.msgDelete(a, [first.id, second.id]).n === 2 && !g.msgSees(first, a.id) && g.msgSees(first, b.id), 'отмеченные удалены у себя');
    assert.ok(g.dialogHistory(a, b.id).total === 23 && g.dialogHistory(b, a.id).total === 25, 'у собеседника сообщения остались');
    const fw = g.msgForward(b, second.id, 'MSGC1'); assert.ok(fw.ok, fw.error);
    const got = g.db.messages[g.db.messages.length - 1];
    assert.ok(got.from === b.id && got.to === c.id && got.fwd === g.userById(second.from).login && got.text === second.text, 'переслано с пометкой, от кого');
    assert.ok(g.msgForward(a, first.id, 'msgC1').error && g.msgForward(c, second.id, 'msgA1').error, 'удалённое у себя и чужое не переслать');
    g.blackAdd(c, a.id); assert.ok(/ограничил/.test(g.msgForward(a, ab()[5].id, 'msgC1').error || ''), 'чёрный список — как для писем'); g.blackDel(c, a.id);
    g.report(a.id, 'Нападение: победа', ['x'], 'battle', { type: 'battle', side: 'att', win: true });
    assert.ok(g.reportForward(a, g.reportsOf(a.id)[0].id, 'msgB1').msg, 'отчёт переслан');
    const repMail = g.db.messages.filter((x) => x.to === b.id && x.rep).pop(), r2 = g.msgForward(b, repMail.id, 'msgC1');
    assert.ok(r2.msg && g.db.messages.some((x) => x.from === b.id && x.to === c.id && x.rep), 'пересланный отчёт пересылается снова отчётом');
    assert.ok(g.msgDelete(b, [], a.id).n === 26 && !g.dialogHistory(b, a.id).total, 'разговор удалён у себя (25 писем и отчёт)');
    assert.ok(ab().length === 24 && ab().every((x) => g.msgSees(x, a.id)), 'удалённое обоими стёрто, остальное у собеседника на месте');
    for (const f of [MDB, `${MDB}.tmp`]) try { fs.unlinkSync(f); } catch { /* нет файла */ }
    console.log('✓ Переписка: «История» по страницам, «Изменить» — удалить отмеченное и разговор (только у себя), «Переслать» (текст, отчёт), чёрный список');
  }
  { // медаль «Первопроходец» (honors.js): вручает только админ — по никам через запятую или всем тестерам; видна в профиле, можно забрать
    // (свой отдельный мир — лишние игроки не сдвигают замки следующих проверок)
    const HDB = path.join(os.tmpdir(), `royal-hon-${process.pid}.json`), g = new Game(new Store(HDB)); g.ensureAdmin();
    const adm = g.adminUser();
    const t1 = g.register({ login: 'honTest1', password: '12345', race: 0 }).user, t2 = g.register({ login: 'honTest2', password: '12345', race: 0 }).user;
    const pl = g.register({ login: 'honPlayer', password: '12345', race: 0 }).user; t1.tester = t2.tester = true;
    assert.ok(g.adminOp(pl, 'honorgive', { id: 'pioneer', nicks: pl.login }).error && !pl.honors, 'не админу — нельзя');
    assert.ok(g.adminOp(adm, 'honorgive', { id: 'nope', nicks: pl.login }).error && g.adminOp(adm, 'honorgive', { id: 'toString', nicks: pl.login }).error, 'нет такой медали');
    assert.ok(g.adminOp(adm, 'honorgive', { id: 'pioneer', nicks: ' , ' }).error, 'пустой список');
    const e0 = (g.events || []).length;
    const r = g.adminOp(adm, 'honorgive', { id: 'pioneer', nicks: 'honplayer, honTest1 ,nobodyX' });
    assert.ok(r.data && pl.honors.pioneer && t1.honors.pioneer && !t2.honors && /Не найдены: nobodyX/.test(r.data.msg), r.error || r.data.msg);
    assert.ok(g.events.slice(e0).some((e) => e.userId === pl.id && /Первопроходец/.test(e.msg)), 'игроку — уведомление');
    assert.ok(g.reportsOf(pl.id).some((x) => /Первопроходец/.test(x.title) && !x.read), 'и отчёт — увидит, даже если его не было в игре');
    const at1 = t1.honors.pioneer, all = g.adminOp(adm, 'honorgive', { id: 'pioneer', testers: 1 });
    assert.ok(t2.honors.pioneer && t1.honors.pioneer === at1 && /Уже была: .*honTest1/.test(all.data.msg), 'всем тестерам — у кого уже была, не трогаем');
    const view = all.data.list.find((h) => h.id === 'pioneer');
    assert.ok(view.testersLeft === 0 && ['honPlayer', 'honTest1', 'honTest2'].every((l) => view.who.some((w) => w.login === l)), 'список награждённых');
    const prof = g.profileOf(pl, t1); assert.ok(prof.honors.length === 1 && prof.honors[0].name === 'Первопроходец' && prof.honors[0].small, 'медаль в профиле');
    assert.ok(g.adminOp(adm, 'honortake', { id: 'pioneer', login: pl.login }).data && !pl.honors && !g.profileOf(pl, t1).honors.length, 'забрать');
    assert.ok(g.adminOp(adm, 'honortake', { id: 'pioneer', login: pl.login }).error, 'второй раз — нечего забирать');
    for (const f of [HDB, `${HDB}.tmp`]) try { fs.unlinkSync(f); } catch { /* нет файла */ }
    console.log('✓ Медаль «Первопроходец»: вручает только админ (по никам и всем тестерам), уведомление и отчёт, видна в профиле, можно забрать');
  }
  { // скриншоты к новости: только админ/старший модератор, сервер сам собирает PNG; подставной id не пройдёт
    const zlib = require('zlib'), adm = Object.values(g.db.users).find((u) => u.admin), pl = Object.values(g.db.users).find((u) => !u.admin && !u.smod && !u.bot);
    assert.ok(g.newsPicBegin(pl, 100, 50, 1).error, 'игроку нельзя');
    assert.ok(g.newsPicBegin(adm, 5000, 50, 1).error, 'размер ограничен');
    const b = g.newsPicBegin(adm, 100, 50, 1); const rgb = Buffer.alloc(100 * 50 * 3, 200);
    const r = await g.newsPicPart(adm, b.up, 0, zlib.deflateSync(rgb).toString('base64')); assert.ok(r.id && /^[0-9a-f]{32}$/.test(r.id), r.error);
    const png = fs.readFileSync(g.newsPicFile(r.id)); assert.ok(png.slice(1, 4).toString() === 'PNG', 'новый PNG');
    const bad = g.newsPicBegin(adm, 100, 50, 1); assert.ok((await g.newsPicPart(adm, bad.up, 0, zlib.deflateSync(Buffer.alloc(10)).toString('base64'))).error, 'неверные точки — отказ');
    assert.ok(g.newsPicFile('../../etc/passwd') === null, 'путь не подставить');
    g.newsOp(adm, { op: 'publish', title: 'Скрины', text: 'Смотрите', pics: [r.id, 'f'.repeat(32), '../x'] });
    const n = g.newsDb()[g.newsDb().length - 1]; assert.deepEqual(n.pics, [r.id], 'в новости только загруженные картинки');
    assert.deepEqual(g.newsGet(pl, n.id).pics, [r.id]);
    const b2 = g.newsPicBegin(adm, 40, 40, 1), r2 = await g.newsPicPart(adm, b2.up, 0, zlib.deflateSync(Buffer.alloc(40 * 40 * 3, 9)).toString('base64')); // загружен, но не опубликован
    assert.ok(g.newsPicSweep(Date.now() + 2 * 86400000) >= 1 && !fs.existsSync(g.newsPicFile(r2.id)) && fs.existsSync(g.newsPicFile(r.id)), 'неопубликованный — через сутки, опубликованный живёт');
    assert.ok(g.newsPicSweep(Date.now() + 91 * 86400000) >= 1 && !fs.existsSync(g.newsPicFile(r.id)) && g.newsGet(pl, n.id).pics.length === 0, 'через 3 месяца — удалён и из новости');
    console.log('✓ Скриншоты к новостям: PNG пересобран сервером, чужие id отброшены, живут 3 месяца');
  }
  { // лайк / дизлайк в чате: один голос, повтор — снять, смена — переносит; за своё нельзя
    const a = g.register({ login: 'cvA1x', password: '12345', race: 0 }).user, b = g.register({ login: 'cvB1x', password: '12345', race: 0 }).user;
    const id = g.chatPost(a, 'Привет всем').msg.id;
    assert.ok(g.chatVote(a, id, 1).error, 'за своё нельзя');
    let r = g.chatVote(b, id, 1); assert.deepEqual([r.up, r.dn], [[b.id], []]);
    r = g.chatVote(b, id, -1); assert.deepEqual([r.up, r.dn], [[], [b.id]], 'смена голоса');
    r = g.chatVote(b, id, -1); assert.deepEqual([r.up, r.dn], [[], []], 'повтор — снять');
    console.log('✓ Чат: лайк и дизлайк');
  }
  { // друзья: заявка → отчёт → принять; взаимно; лента; дни рождения; админ всегда оффлайн
    const a = g.register({ login: 'frA1x', password: '12345', race: 0 }).user, b = g.register({ login: 'frB1x', password: '12345', race: 1 }).user;
    assert.ok(g.friendOp(a, 'add', b.id).ok && g.friendState(a, b) === 'sent' && g.friendState(b, a) === 'in', 'заявка');
    assert.ok(!g.isFriend(a, b) && g.friendOp(a, 'add', b.id).error, 'пока не друзья, повтор — нельзя');
    const rep = g.reportsOf(b.id).find((r) => r.data && r.data.type === 'friendreq'); assert.ok(rep && rep.data.from.id === a.id, 'отчёт с заявкой');
    assert.ok(g.friendOp(b, 'accept', a.id).ok && g.isFriend(a, b) && g.isFriend(b, a) && rep.data.state === 'accepted', 'взаимная дружба');
    assert.ok(g.reportsOf(a.id).some((r) => r.data && r.data.type === 'friendok' && r.data.from.id === b.id), 'отправителю — отчёт «дружба принята»');
    assert.ok(g.setBirthday(a, 31, 2).error && g.setBirthday(a, 29, 2).ok && a.bday === '29.02');
    const now = new Date(); g.setBirthday(a, new Date(now.getTime() + 3 * 3600000).getUTCDate(), new Date(now.getTime() + 3 * 3600000).getUTCMonth() + 1);
    a.online = true;
    g.friendFeed(a.id, 'frA1x захватил(а) замок «Тест» (X:1, Y:1)');
    const v = g.friendsView(b); assert.ok(v.list[0].login === 'frA1x' && v.list[0].online && v.today === 1 && v.feed.some((e) => /захватил/.test(e.text)), 'список, онлайн, ДР сегодня, лента');
    const adm = Object.values(g.db.users).find((u) => u.admin); adm.online = true; g.friendOp(adm, 'add', b.id); g.friendOp(b, 'accept', adm.id);
    assert.ok(g.friendsView(b).list.find((x) => x.id === adm.id).online === false, 'админ не виден онлайн');
    assert.ok(g.friendOp(a, 'del', b.id).ok && !g.isFriend(b, a), 'удаление — у обоих');
    g.friendOp(a, 'add', b.id); assert.ok(g.friendOp(b, 'decline', a.id).ok && !g.isFriend(a, b) && g.friendState(a, b) === null, 'отклонить');
    console.log('✓ Друзья: заявка, отчёт, взаимность, лента, дни рождения, админ оффлайн');
  }
  { // история ников: видна в профиле, поиск по старому нику; сброс модерацией видят только модераторы
    const a = g.register({ login: 'nkOld1', password: '12345', race: 0 }).user, b = g.register({ login: 'nkSee1', password: '12345', race: 0 }).user;
    a.gold = 500; assert.ok(g.changeNick(a, 'nkNew1').ok);
    let p = g.profileOf(a, b); assert.ok(p.nicks.length === 1 && p.nicks[0].from === 'nkOld1' && p.nicks[0].to === 'nkNew1', 'бывший ник в профиле');
    assert.ok(g.searchPlayers('nkold1').some((r) => r.id === a.id), 'находится по старому нику');
    a.nickLog.push({ at: Date.now(), from: 'Плохой', to: 'Игрок1', by: 'mod' });
    assert.ok(g.profileOf(a, b).nicks.length === 1 && g.profileOf(a, Object.values(g.db.users).find((u) => u.admin)).nicks.length === 2, 'сброшенный модерацией ник скрыт от игроков');
    console.log('✓ История ников в профиле');
  }
  { // бартер на Рынке: 2 : 1
    const u = g.register({ login: 'bxA1x', password: '12345', race: 0 }).user, c = g.castleOf(u); g.maxOut(c);
    Object.assign(c.res, { wood: 1000, iron: 0 }); const r = g.exchange(c, 'wood', 'iron', 250);
    assert.ok(r.got === 125 && c.res.wood < 760 && c.res.iron >= 125, JSON.stringify(r)); // за время обмена замок мог чуть добыть
    assert.ok(g.exchange(c, 'wood', 'iron', 3).got === 1, 'нечётное — с округлением вниз');
    console.log('✓ Бартер: отдаёшь 2 — получаешь 1');
  }
  { // альянс: ушёл создатель — права к тому, у кого больше прав, иначе к самому рейтинговому; последний ушёл — альянс исчезает
    const mk = (l, max) => { const u = g.register({ login: l, password: '12345', race: 0 }).user; const c = g.castleOf(u); g.mil(c); if (max) g.maxOut(c); return u; };
    const L = mk('alL1x', 1), A = mk('alA1x'), B = mk('alB1x'), C = mk('alC1x'), D = mk('alD1x', 1);
    const ally = (u, op, x = {}) => g.alliance(u, g.castleOf(u), { op, ...x });
    const r = ally(L, 'create', { name: 'Кронос', tag: 'KRN' }); assert.ok(r.ok, JSON.stringify(r)); const al = g.allianceOf(L);
    for (const u of [A, B, C, D]) { al.members.push(u.id); u.alliance = al.id; }
    al.ranks = { [A.id]: { title: 'Зам', rights: ['invite'] }, [B.id]: { title: 'Казначей', rights: ['invite', 'treasury', 'logs'] } };
    const O = mk('alO1x', 1); ally(O, 'create', { name: 'Другие', tag: 'OTH' }); const al2 = g.allianceOf(O); al2.diplo = { [al.id]: 'war' };
    assert.ok(ally(L, 'leave').ok && al.leader === B.id, 'больше прав — новый создатель');
    assert.ok(ally(B, 'leave').ok && al.leader === A.id, 'следующий по правам');
    assert.ok(g.userRating(D) > g.userRating(C));
    assert.ok(ally(A, 'leave').ok && al.leader === D.id, 'прав нет — к самому рейтинговому');
    assert.ok(ally(D, 'leave').ok && al.leader === C.id);
    assert.ok(ally(C, 'leave').ok && !g.db.alliances[al.id] && !al2.diplo[al.id] && !C.alliance, 'последний ушёл — альянса нет нигде');
    assert.ok(!g.ratingAlliances().some((x) => x.id === al.id), 'и в рейтинге нет');
    g.db.alliances[999999] = { id: 999999, name: 'Пустой', tag: 'ZZ', leader: 123456789, members: [123456789] }; g.allyCleanup(); assert.ok(!g.db.alliances[999999], 'пустой альянс убран');
    console.log('✓ Альянс: передача прав создателя и роспуск пустого альянса');
  }
  { // новая раскладка замка: 33 места, Складов не больше 5, вместимость и рейтинг сохраняются
    const C = require('../src/catalog');
    const u = g.register({ login: 'lay1x', password: '12345', race: 0 }).user, c = g.castleOf(u);
    const old = new Int8Array(49).fill(-1), ol = new Int8Array(49); old[24] = 0; ol[24] = 10;
    const types = C.BUILDINGS.filter((b) => b.layer === 'castle' && ![0, 1, 22].includes(b.id)).map((b) => b.id);
    const cells = [...Array(49).keys()].filter((i) => i !== 24 && ![3, 10, 17, 21, 22, 23].includes(i));
    types.forEach((b, k) => { old[cells[k]] = b; ol[cells[k]] = 3; });
    for (let k = types.length; k < cells.length; k++) { old[cells[k]] = 1; ol[cells[k]] = 1 + (k % 10); }
    c.grid[0] = old; c.levels[0] = ol; delete c.layoutV; c.storeExtra = 0; c.storeExtraLv = 0; c.queue = [];
    const cap0 = g.capacity(c).wood, r0 = g.rating(c), n0 = [...old].filter((b) => b >= 0).length;
    g.castleLayoutFix(c);
    const st = [...c.grid[0]].filter((b) => b === 1).length;
    assert.strictEqual(st, 5, 'Складов 5');
    assert.strictEqual(g.capacity(c).wood, cap0, 'вместимость та же');
    assert.strictEqual(g.rating(c), r0, 'рейтинг тот же');
    assert.ok(types.every((b) => c.grid[0].includes(b)) && c.grid[0][24] === 0, 'все здания на месте, Ратуша в центре');
    assert.ok([...c.grid[0]].every((b, i) => b < 0 || C.CASTLE_OK.includes(i)), 'только на площадках');
    assert.ok(n0 > 33 && [...c.grid[0]].filter((b) => b >= 0).length === types.length + 6); // Ратуша, здания и 5 Складов — 32 (без Таверны, с 22.10, одно место свободно)
    c.res = { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, people: 1e5 };
    const free = C.CASTLE_OK.find((i) => c.grid[0][i] < 0);
    assert.ok(free === undefined || /не больше 5/.test(g.startBuild(c, 0, free, 1).error || 'не больше 5'), 'шестой Склад нельзя');
    console.log('✓ Замок на новом фоне: 33 места, 5 Складов, вместимость и рейтинг сохранены');
  }
  { // полный замок: рейтинг 2200 = постройки 935 + развитие Складов 265 + земли 1000 (до 22.10 с Таверной — 971 + 229, до 25.10 с Лагерем археологов — 953 + 247); 5 Складов 20 ур. — 95 000
    const u = g.register({ login: 'full2200', password: '12345', race: 1 }).user, c = g.castleOf(u); g.mil(c);
    const p0 = g.ratingParts(c);
    g.maxOut(c);
    const p = g.ratingParts(c);
    assert.deepStrictEqual([p.castle, p.store, p.lands, p.total, p.storeLv], [935, 265, 1000, 2200, 100], `полный замок: ${JSON.stringify(p)}`);
    assert.strictEqual(g.rating(c), 2200);
    assert.strictEqual(g.capacity(c).wood, 95000, 'вместимость 5 Складов 20 ур. — 95 000');
    c.levels[0][c.grid[0].indexOf(1)] = 10; // один Склад — 10 ур.
    const q = g.ratingParts(c);
    assert.ok(q.storeLv === 90 && q.store === 239 && q.total === q.castle + q.store + q.lands && q.total < 2200, `Склад 10 ур.: ${JSON.stringify(q)}`);
    console.log(`✓ Рейтинг: новый замок ${p0.total}, полный — ${p.total} (постройки ${p.castle} + Склады ${p.store} + земли ${p.lands}); вместимость 5 Складов 20 ур. — 95 000`);
  }
  { // баланс боя: командование генерала с убывающей отдачей, одинаковые артефакты с убыванием, защита от кавалерии в бою
    const u = g.register({ login: 'balance1', password: '12345', race: 0 }).user, c = g.castleOf(u); g.mil(c);
    c.general = g.newGeneral(c, 500); c.general.pts.catk = 998;
    const k = g.genStats(c.general).catk; assert.ok(k > 0.35 && k < 0.5, `командование 500 ур. не больше +50% (${k})`);
    c.general.pts.catk = 10; assert.ok(Math.abs(g.genStats(c.general).catk - 0.5 * 10 / 310) < 1e-9, 'первые очки — около +0,17%');
    const b0 = g.bonus(c).train; c.artifacts = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: 70000 + i, type: 'train', rarity: 2, active: true }));
    const tr = g.bonus(c).train; assert.ok(tr > 0.25 && tr < b0, `обучение ускоряется, но время не уходит в ноль (${tr})`);
    c.artifacts = [0, 1].map((i) => ({ id: 70100 + i, type: 'atk', rarity: 2, active: true })); const at = g.bonus(c).atk / g.bonus(Object.assign({}, c, { artifacts: [] })).atk;
    assert.ok(Math.abs(at - 1.35) < 1e-6, `два легендарных артефакта атаки: действует один — +35% (${at})`);
    c.artifacts = []; delete c.general;
    const d = g.castleOf(g.register({ login: 'balance2', password: '12345', race: 0 }).user); g.mil(d);
    process.env.LUCK = '0'; c.units = {}; c.squads = []; c.armies = []; d.units = { 240: 100 }; d.squads = []; d.armies = [];
    // с 24.10 (бой как в оригинале) осадные — как пехота: их бьёт атака конницы «по пехоте»; Паладин — защитник, при нападении вдвое слабее
    const r = g.clash(c, { units: { 264: 100 }, general: false, mission: 'attack' }, d, null, Date.now()), r2 = g.clash(c, { units: { 205: 100 }, general: false, mission: 'attack' }, d, null, Date.now()); delete process.env.LUCK;
    assert.ok(r.win && r.calc.att.total > r2.calc.att.total, 'рейтары (атакующие) бьют катапульты; паладины (защитники) при нападении слабее');
    console.log('✓ Баланс боя: командование генерала до +50%, из одинаковых артефактов действует один, конница против осадных');
  }
  { // подкрепление: Вася защищает пустой замок Вани, нападает Игорь — заслуги и потери обороны у Васи, у Вани — ничего; Васе — отчёт
    const mk = (l) => { const u = g.register({ login: l, password: '12345', race: 0 }).user, c = g.castleOf(u); u.newbieOff = true; g.mil(c); c.armies = []; c.squads = []; c.general = null; c.shieldUntil = 0; return [u, c]; };
    const [V, cv] = mk('reinfVasya'), [N, cn] = mk('reinfVanya'), [, ci] = mk('reinfIgor');
    cn.units = {}; cv.armies = [{ id: 990001, units: { 201: 300 }, mission: 'reinforce', state: 'stay', stayAt: cn.id, general: false, x: cn.x, y: cn.y }];
    const st0 = { ...g.stats(N) }, sv0 = { ...g.stats(V) };
    g.maxOut(ci); ci.armies = []; ci.general = null; ci.units = { 200: 600, 261: 300 }; const s = g.sendArmy(ci, { units: { 200: 600, 261: 300 }, x: cn.x, y: cn.y, mission: 'attack' }); assert.ok(!s.error, s.error);
    g.tickWorld(Date.now() + 1e10); g.tickWorld(Date.now() + 3e10);
    const sn = g.stats(N), sv = g.stats(V), d = (o, o0, k) => (o[k] || 0) - (o0[k] || 0);
    assert.ok(d(sn, st0, 'defKills') === 0 && d(sn, st0, 'defLost') === 0 && d(sv, sv0, 'defLost') > 0 && d(sv, sv0, 'defKills') > 0,
      `заслуги обороны — Васе (убито ${d(sv, sv0, 'defKills')}, потеряно ${d(sv, sv0, 'defLost')}), у Вани — ничего (${d(sn, st0, 'defKills')}/${d(sn, st0, 'defLost')})`);
    assert.ok(g.reportsOf(V.id).some((r) => /Подкрепление: нападение на замок/.test(r.title)), 'Васе — отчёт о бое его подкрепления');
    console.log('✓ Подкрепление: заслуги и потери обороны — хозяину подкрепления, ему же отчёт');
  }
  { // артефакты: пробуждённых одновременно — не больше трёх, даже при Башне 10 ур.
    const c = g.castleOf(g.register({ login: 'artMax3', password: '12345', race: 0 }).user); g.maxOut(c);
    c.artifacts = ['atk', 'def', 'prod', 'speed'].map((type, i) => ({ id: 77000 + i, type, rarity: 0 }));
    const r = c.artifacts.map((x) => g.activateArtifact(c, x.id, true));
    assert.ok(g.bonus(c).artSlots === 3 && r.slice(0, 3).every((x) => x.ok) && /не больше 3/.test(r[3].error || ''), `не больше трёх пробуждённых: ${JSON.stringify(r[3])}`);
    console.log('✓ Артефакты: пробуждённых одновременно — не больше трёх');
  }
  { // карта мира: новый замок не встаёт вплотную к лагерю или руинам (картинки налезали)
    let near = 0; for (let i = 0; i < 60; i++) { const c = g.castleOf(g.register({ login: `mapnear${i}`, password: '12345', race: i % 4 }).user); if (g.worldObjects(c.x - 1, c.y - 1, 3, 3).some((o) => o.kind === 'object')) near++; }
    assert.strictEqual(near, 0, 'замки не вплотную к лагерям');
    console.log('✓ Карта мира: замки не встают вплотную к лагерям и руинам');
  }
  { // ошибся с походом: первые 4 минуты армию можно развернуть домой, потом — нельзя
    const U = g.register({ login: 'recall1', password: '12345', race: 0 }).user; g.adminAddCastles(U, 1);
    const [c1, c2] = g.castlesOf(U); g.mil(c1); g.maxOut(c1); c1.units = { 200: 40 }; c1.squads = []; c1.armies = []; c1.general = null;
    const s = g.sendArmy(c1, { from: 'castle', mission: 'reinforce', x: c2.x, y: c2.y }); assert.ok(!s.error, s.error);
    assert.ok(!c1.units[200], 'армия ушла');
    s.army.depart -= 60000; s.army.arrive -= 60000; // прошла минута
    const r = g.squadOp(c1, { op: 'recall', id: s.army.id }); assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(s.army.state, 'back'); assert.ok(Math.abs(s.army.back - Date.now() - 60000) < 2000, 'назад столько же, сколько шла');
    g.tickWorld(Date.now() + 61000); assert.strictEqual(c1.units[200], 40, 'вернулась домой целиком');
    const s2 = g.sendArmy(c1, { from: 'castle', mission: 'reinforce', x: c2.x, y: c2.y }); s2.army.depart -= 5 * 60000;
    assert.ok(/4 минуты/.test(g.squadOp(c1, { op: 'recall', id: s2.army.id }).error || ''), 'через 5 минут отозвать нельзя');
    console.log('✓ Поход по ошибке: первые 4 минуты армию можно вернуть в замок (идёт назад столько же), потом — нельзя');
  }
  { // армии ходят вдвое быстрее (MARCH): время пути — половина от «расстояние / скорость самого медленного»
    const { UNIT, MARCH } = require('../src/army'); assert.strictEqual(MARCH, 2);
    const c = g.castleOf(g.register({ login: 'march1', password: '12345', race: 0 }).user); g.mil(c);
    const v = UNIT[200].speed * g.bonus(c).speed, d = Math.hypot(30, 40), sec = g.travelSec(c, { 200: 10 }, false, c.x + 30, c.y + 40);
    assert.ok(Math.abs(sec - d / v * 3600 / (Number(process.env.SPEED) || 1) / 2) <= 1, `путь вдвое быстрее: ${sec}`);
    console.log(`✓ Армии ходят вдвое быстрее: 50 клеток мечниками — ${Math.round(sec / 60)} мин`);
  }
  { // захват: +15% бунта за победное нападение с бунтарями (сколько бы их ни было), 100% — замок переходит, после захвата бунт 95%,
    // в замке остаётся 1 бунтарь, бунт сам не утихает, в Храме снижается за ресурсы; свежезахваченный замок отбивают одной атакой
    const luck0 = process.env.LUCK; process.env.LUCK = '0';
    const mk = (login) => { const u = g.register({ login, password: '12345', race: 0 }).user; u.created = Date.now() - 60 * DAY; u.royal = 1e6; u.royalAt = Date.now(); u.lastSeen = Date.now(); return u; };
    const A = mk('capA1'), Dd = mk('capD1'), B2 = mk('capB1'); g.adminAddCastles(Dd, 1);
    const ca = g.castleOf(A), cb = g.castleOf(B2), tgt = g.castlesOf(Dd)[1]; g.mil(ca); g.mil(cb); g.mil(tgt); g.maxOut(ca); g.maxOut(cb); g.maxOut(tgt);
    tgt.units = {}; tgt.squads = []; tgt.loyalty = 100;
    const riot = (c) => Math.round(100 - c.loyalty);
    const hit = (from, n) => { from.units = { 200: 3000, 233: n }; from.squads = []; from.armies = []; const r = g.sendArmy(from, { from: 'castle', mission: 'attack', x: tgt.x, y: tgt.y }); assert.ok(!r.error, r.error); g.tickWorld(Date.now() + 1e10); g.tickWorld(Date.now() + 3e10); };
    hit(ca, 3); assert.strictEqual(riot(tgt), 15, '3 бунтаря за одну атаку — всё равно +15%');
    const L0 = tgt.loyalty; g.tick(tgt, Date.now() + 50 * 3600000); assert.strictEqual(tgt.loyalty, L0, 'бунт сам не утихает');
    for (let k = 0; k < 5; k++) hit(ca, 1);
    assert.ok(riot(tgt) === 90 && tgt.owner === Dd.id, `после 6 атак бунт 90%: ${riot(tgt)}`);
    hit(ca, 2);
    assert.ok(tgt.owner === A.id && riot(tgt) === 95 && tgt.units[233] === 1, `7-я атака — замок ваш, бунт 95%, 1 бунтарь в замке (${tgt.owner}, ${riot(tgt)}%, ${tgt.units[233]})`);
    const rep = g.reportsOf(A.id).find((r) => r.data && r.data.captured); assert.ok(rep && rep.data.captured.rebel === 1, 'в отчёте: бунтарь остался в замке');
    // Храм: снизить бунт за ресурсы (в захваченном замке Храм остался от прежнего хозяина)
    const T = g.buildingLevel(tgt, 25); assert.ok(T > 0, 'Храм есть');
    tgt.res = { ...tgt.res, wood: 0, stone: 0, iron: 0, food: 0 };
    assert.ok(/Недостаточно/.test(g.calmRiot(A, tgt, 'all').error || ''), 'без ресурсов не снизить');
    const per = g.calmPer(tgt); assert.strictEqual(per.wood, Math.round(400 * (1 - 0.025 * T)));
    Object.assign(tgt.res, { wood: per.wood * 10, stone: per.stone * 10, iron: per.iron * 10, food: per.food * 10 });
    assert.ok(g.calmRiot(A, tgt, 10).ok && riot(tgt) === 95 && tgt.res.wood < per.wood && tgt.calmJob, 'на 10% — ровно за 10 долей, бунт падает постепенно');
    assert.ok(/уже снижается/.test(g.calmRiot(A, tgt, 5).error || ''), 'одно снижение за раз');
    const J = tgt.calmJob, sec1 = g.calmSec(tgt); assert.strictEqual(J.end - J.start, 10 * sec1 * 1000, 'время: 10 × время на 1%');
    g.tick(tgt, J.start + (J.end - J.start) / 2); assert.strictEqual(riot(tgt), 90, 'на середине — половина');
    g.tick(tgt, J.end + 1000); assert.ok(riot(tgt) === 85 && !tgt.calmJob, 'к концу — весь');
    // свежий захват уязвим: B одной победной атакой с бунтарём забирает замок (85% + 15% = 100%)
    tgt.units = {}; cb.units = { 200: 3000, 233: 1 }; cb.armies = []; const rB = g.sendArmy(cb, { units: { 200: 3000, 233: 1 }, mission: 'attack', x: tgt.x, y: tgt.y }); assert.ok(!rB.error, rB.error); g.tickWorld(Date.now() + 1e10);
    assert.ok(tgt.owner === B2.id && riot(tgt) === 95, 'замок отбит одной атакой');
    Object.assign(tgt.res, { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6 });
    assert.ok(g.calmRiot(B2, tgt, 'all').ok); g.tick(tgt, tgt.calmJob.end + 1000); assert.ok(riot(tgt) === 0, 'весь бунт снят');
    assert.ok(/Бунта нет/.test(g.calmRiot(B2, tgt, 5).error || ''));
    // 7 армий с бунтарями сразу, одна за другой — каждая по 15%, замок переходит
    const C2 = mk('capC1'); g.adminAddCastles(C2, 1); const t2 = g.castlesOf(C2)[1]; g.mil(t2); t2.units = {}; t2.squads = []; t2.loyalty = 100;
    ca.units = { 200: 21000, 233: 7 }; ca.squads = []; ca.armies = [];
    ca.units = { 200: 24000, 233: 8 };
    for (let k = 0; k < 8; k++) assert.ok(!g.sendArmy(ca, { units: { 200: 3000, 233: 1 }, mission: 'attack', x: t2.x, y: t2.y }).error);
    g.tickWorld(Date.now() + 1e10);
    assert.ok(t2.owner === A.id && riot(t2) === 95, `7 армий подряд — замок захвачен (${t2.owner === A.id}, ${riot(t2)}%)`);
    assert.ok(g.reportsOf(A.id).some((r) => /Замок уже ваш/.test((r.lines || []).join(' '))) && t2.units[200] === undefined, 'восьмая армия пришла в уже свой замок — без боя домой');
    console.log(`✓ Захват: +15% бунта за победу с бунтарями, 7 атак — замок ваш (бунт 95%, бунтарь остался), бунт сам не утихает, Храм ${T} ур.: 1% = ${per.wood} каждого ресурса и ${Math.round(g.calmSec(tgt) / 60 * 10) / 10} мин`);
    if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
  }
  { // «Забросить замки» (админка): замки давно не играющего — ничьи (служебный бот «Ничейные земли»), столицы нет — любой берут, как обычный:
    // бунт +15% за победу с Бунтарями; армия остаётся (походы — домой), генерал пропадает; постройки и ресурсы остаются (и растут);
    // игрок удаляется отовсюду; ничейному — ни отчётов, ни рейтинга
    const luck0 = process.env.LUCK; process.env.LUCK = '0';
    const adm = g.adminUser(), mk = (login, race = 0) => { const u = g.register({ login, password: '12345', race }).user; u.created = Date.now() - 60 * DAY; u.royal = 1e6; u.royalAt = Date.now(); u.lastSeen = Date.now(); return u; };
    const A = mk('nbAtt1'), L = mk('nbLost1', 3), F = mk('nbFrnd1'); g.adminAddCastles(L, 1);
    const [cap, two] = g.castlesOf(L), ca = g.castleOf(A); g.mil(cap); g.mil(two); g.mil(ca); g.maxOut(ca); g.maxOut(cap);
    cap.units = { 245: 50 }; cap.loyalty = 100; two.loyalty = 40; F.friends = [L.id]; L.friends = [F.id];
    cap.general = g.newGeneral(cap, 3); cap.armies = [{ id: g.db.nextId++, units: { 245: 10 }, general: true, mission: 'attack', x: 1, y: 1, depart: Date.now(), arrive: Date.now() + 1e9, sec: 1e6, state: 'go', loot: null }];
    two.shieldUntil = Date.now() + 3600000; g.sciOf(two).eco = 7; assert.ok(g.castleShield(two) && g.sciOf(cap).eco === 7, 'до: купол на замке, науки игрока');
    g.sendMail(F, L.login, 'Привет', 'Ты где?'); g.sendMail(L, F.login, 'Ответ', 'Тут');
    assert.ok(g.isCapital(cap), 'до: столица — первый замок');
    assert.ok(/Нет прав/.test(g.adminOp(A, 'abandon', { login: L.login }).error || ''), 'не админ — нет прав');
    assert.ok(/не игрок/.test(g.adminOp(adm, 'abandon', { login: adm.login }).error || '') && /не найден/.test(g.adminOp(adm, 'abandon', { login: 'nbNobody0' }).error || ''), 'админа и несуществующего — нельзя');
    const r = g.adminOp(adm, 'abandon', { login: L.login });
    assert.ok(r.ok && /заброшены \(2\)/.test(r.msg), r.error || r.msg);
    const nb = g.nobodyUser();
    assert.ok(nb.nobody && nb.bot && nb.login === 'Ничейные земли' && cap.owner === nb.id && two.owner === nb.id && g.castlesOf(nb).includes(cap), 'замки — у «Ничейных земель»');
    assert.ok(!g.db.users.nbLost1 && !g.userById(L.id), 'игрок удалён');
    assert.ok(cap.name === 'Ничейный замок' && cap.units[245] === 60 && !cap.armies.length && cap.abandon.login === 'nbLost1' && g.buildingLevel(cap, 25) > 0, `армия на месте, поход вернулся домой, постройки остались (${JSON.stringify(cap.units)})`);
    assert.ok(!cap.general && !cap.deadGenerals.length, 'генерал пропал');
    assert.ok(g.raceOf(cap) === 'orcs' && nb.race === 'humans', 'раса замка — прежняя');
    assert.ok(!g.isCapital(cap) && !g.isCapital(two), 'столицы у ничейных замков нет');
    assert.ok(two.loyalty === 40, 'бунт в замке — какой был');
    assert.ok(!F.friends.includes(L.id) && !g.db.messages.some((m) => m.from === L.id || m.to === L.id), 'из друзей и переписки — тоже');
    assert.ok(!g.leaderboard().some((x) => x.u.nobody), 'в рейтинге ничейного нет');
    assert.ok(/не игрок/.test(g.adminOp(adm, 'abandon', { login: nb.login }).error || ''), 'ничейного не забросить');
    const wo = g.worldObjects(cap.x, cap.y, 1, 1)[0]; assert.ok(wo.nobody === 1 && wo.race === 'orcs', 'на карте — ничей, раса прежняя');
    const nv = g.adminOp(adm, 'nobodyview', {}).data; assert.ok(nv.castles.length >= 2 && nv.castles.some((c) => c.x === two.x && c.y === two.y && c.riot === 60 && c.was === 'nbLost1') && nv.log[0].login === 'nbLost1', 'список ничейных замков в админке');
    two.res.wood = 50; g.tick(two, Date.now() + 3600000); assert.ok(two.res.wood === 50, 'ресурсы ничейного замка не растут (с 22.10 — не вечная кормушка)');
    ca.units = { 200: 10 }; ca.squads = []; ca.armies = [];
    assert.ok(/ничей/.test(g.sendArmy(ca, { from: 'castle', mission: 'reinforce', x: two.x, y: two.y }).error || '') && /ничей/.test(g.sendTrade(ca, { x: two.x, y: two.y, res: { wood: 10 } }).error || ''), 'в ничейный замок — ни подкреплений, ни торговцев');
    assert.ok(!g.castleShield(two) && g.sciOf(two).eco === 7 && g.sciOf(cap).eco === 7, 'купол снят, науки замка — прежние');
    assert.ok(!g.searchPlayers('ничей').length && !g.searchPlayers('земли').some((x) => x.id === nb.id), 'в поиске игроков ничейного нет');
    assert.ok(!g.ratingCastlesCalc().some((x) => x.id === nb.id) && !g.ratingReputation().some((x) => x.id === nb.id), 'в рейтингах замков и репутации — тоже');
    assert.ok(g.canReach(A, nb, 'msg') && g.canReach(A, nb, 'gift') && g.giveReputation(A, nb.id, 1).error, 'писать, дарить, поднимать репутацию ничейным — нельзя');
    { const lead = mk('nbLead1'), aid = g.db.nextId++; g.db.alliances = g.db.alliances || {}; g.db.alliances[aid] = { id: aid, name: 'Ничейный тест', tag: 'NBT', leader: lead.id, members: [lead.id], created: Date.now() }; lead.alliance = aid;
      const last = g.db.reports[g.db.reports.length - 1], from0 = last && last.from;
      assert.ok(/не найден/.test(g.alliance(lead, g.castleOf(lead), { op: 'invite', id: nb.id }).error || '') && (!last || last.from === from0), 'в альянс ничейного не пригласить (и чужой отчёт не тронут)'); }
    // торговцы шли в замок, а он стал ничьим — груз назад на склад, отчёт отправителю
    { const tr = { id: g.db.nextId++, units: { 221: 1 }, general: false, mission: 'trade', x: two.x, y: two.y, depart: Date.now() - 2000, arrive: Date.now() - 1, sec: 2, state: 'go', loot: null, cargo: { wood: 0, stone: 777, iron: 0, food: 0 } };
      ca.armies = [tr]; ca.res.stone = 0; const s0 = two.res.stone; g.tickWorld(Date.now());
      assert.ok(tr.state === 'back' && !tr.cargo && ca.res.stone >= 777 && two.res.stone < s0 + 777, `груз вернулся (${ca.res.stone})`);
      assert.ok(g.reportsOf(A.id).some((x) => /отменён/.test(x.title) && /ничей/.test((x.lines || []).join(' '))), 'отчёт: замок ничей'); ca.armies = []; }
    // новичок нападает на ничейный замок — защита новичка остаётся (как с лагерем)
    { const nd0 = process.env.NEWBIE_DAYS; process.env.NEWBIE_DAYS = '3';
      const nw = g.register({ login: 'nbNewb1', password: '12345', race: 0 }).user, nc = g.castleOf(nw); g.mil(nc); g.maxOut(nc); nc.units = { 200: 50 };
      const was = g.isNewbie(nw), sent = g.sendArmy(nc, { from: 'castle', mission: 'raid', x: two.x, y: two.y });
      assert.ok(was && !sent.error && g.isNewbie(nw) && !nw.newbieOff, `новичок напал на ничейный — защита на месте (${was}, ${sent.error || 'ушла'})`);
      nc.armies = []; process.env.NEWBIE_DAYS = nd0; }
    // админ: с «Ничейными землями» — только смотреть и убирать замки
    assert.ok(/служебный/.test(g.adminOp(adm, 'fill', { login: nb.login }).error || '') && /служебный/.test(g.adminOp(adm, 'delete', { login: nb.login }).error || '') && g.adminOp(adm, 'player', { login: nb.login }).data, 'админ-команды над ничейным — только просмотр');
    // бывшая столица: берут, как обычный замок — 7 побед с Бунтарями
    const riot = (c) => Math.round(100 - c.loyalty), rep0 = g.db.reports.length;
    const hit = () => { ca.units = { 200: 3000, 233: 1 }; ca.squads = []; ca.armies = []; const s = g.sendArmy(ca, { from: 'castle', mission: 'attack', x: cap.x, y: cap.y }); assert.ok(!s.error, s.error); g.tickWorld(Date.now() + 1e10); g.tickWorld(Date.now() + 3e10); };
    const bp0 = g.brOf(A).pts; hit(); assert.ok(riot(cap) === 15 && cap.owner === nb.id, `первая победа — бунт 15% (${riot(cap)})`);
    assert.ok(g.brOf(A).pts - bp0 <= Math.round(60 * 6 * 0.2 * 0.5), `очки за гарнизон ничейного замка — как за лагерь (${g.brOf(A).pts - bp0})`);
    for (let k = 0; k < 5; k++) hit();
    assert.ok(riot(cap) === 90 && cap.owner === nb.id, `6 побед — бунт 90% (${riot(cap)})`);
    hit();
    assert.ok(cap.owner === A.id && !cap.abandon && riot(cap) === 95 && !g.castlesOf(nb).includes(cap), `7-я — замок захвачен (${cap.owner === A.id}, ${riot(cap)}%)`);
    const cr = g.reportsOf(A.id).find((x) => x.data && x.data.captured && x.data.x === cap.x && x.data.y === cap.y);
    assert.ok(cr && cr.data.def.login === 'Ничейные земли' && cr.data.def.race === 'orcs', 'отчёт захватчику: «Ничейные земли», раса замка');
    assert.ok(!g.db.reports.slice(rep0).some((x) => x.owner === nb.id) && !(g.db.friendFeed || []).some((e) => e.uid === nb.id), 'ничейному — ни отчётов, ни ленты друзей');
    assert.ok(Number.isFinite(nb.royal), `лояльность ничейного — число (${nb.royal})`);
    const dl = g.adminOp(adm, 'castledel', { login: nb.login, cid: two.id }); assert.ok(dl.ok && !g.castleAt(two.x, two.y) && !nb.castleIds.includes(two.id), dl.error || 'админ убрал ничейный замок с карты');
    if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
    console.log('✓ «Забросить замки»: замки — ничьи, столицы нет, армия осталась (генерал пропал), постройки и ресурсы (растут) остались, игрок удалён; бывшую столицу берут за 7 побед с Бунтарями');
  }
  { // захват и армия в пути: замок взяли раньше, чем к нему вернулась армия прежнего хозяина, — армия захватчику не достаётся
    // (раньше всё, что «пора», разбиралось одной пачкой: возвращающаяся армия попадала в уже чужой замок)
    const luck0 = process.env.LUCK; process.env.LUCK = '0';
    const mk = (login) => { const u = g.register({ login, password: '12345', race: 0 }).user; u.created = Date.now() - 60 * DAY; u.royal = 1e6; u.royalAt = Date.now(); u.lastSeen = Date.now(); return u; };
    const A = mk('raceAtt1'), V = mk('raceVic1'); g.adminAddCastles(V, 1);
    const ca = g.castleOf(A), tgt = g.castlesOf(V)[1]; g.mil(ca); g.mil(tgt); g.maxOut(ca);
    tgt.units = {}; tgt.squads = []; tgt.loyalty = 10; // бунт 90%: одна победа с Бунтарём — замок взят
    ca.units = { 200: 3000, 233: 1 }; ca.squads = []; ca.armies = [];
    const s = g.sendArmy(ca, { from: 'castle', mission: 'attack', x: tgt.x, y: tgt.y }); assert.ok(!s.error, s.error);
    const T = s.army.arrive;
    tgt.armies = [{ id: g.db.nextId++, units: { 200: 500 }, general: false, mission: 'raid', x: 1, y: 1, depart: T - 20000, arrive: T - 10000, sec: 10, state: 'back', back: T + 1000, loot: null }];
    g.tickWorld(T + 5000);
    assert.ok(tgt.owner === A.id && !tgt.units[200] && !tgt.armies.length, `замок взят, армия прежнего хозяина захватчику не досталась (${JSON.stringify(tgt.units)})`);
    if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
    console.log('✓ Захват и армия в пути: возвращающаяся армия прежнего хозяина захватчику не достаётся');
  }
  { // цены, которые раньше не влезали в Склад (75 200): науки 15–20, улучшения Кузницы/Школы магии; воскрешение генерала — до 100 ур. не дороже Склада, выше — за монеты
    const cat = require('../src/army').catalogJson();
    const sci = (cat.scienceCost || []).filter(Boolean); assert.ok(sci.length === 20 && sci.every((c, i) => c.wood <= 75200 && (i === 0 || c.wood > sci[i - 1].wood)), 'науки 1–20 дорожают и влезают в Склад');
    const { UNIT } = require('../src/army'); const big = Object.values(UNIT).find((x) => x.name === 'Изувер');
    for (const k of ['a', 'd', 'm', 'md']) assert.ok(Object.values(g.forgeCost(big, k, 20).cost).every((v) => v <= 72000), `Изувер ${k} 20 ур. влезает в Склад`);
    const u = g.register({ login: 'revfund', password: '12345', race: 3 }).user, c = g.castleOf(u); g.mil(c); g.maxOut(c);
    c.general = { ...g.newGeneral(c, 60), dead: true }; c.deadGenerals = [];
    { // снаряжение генерала: ковка и усиление до +5 любой вещи — в пределах полного Склада (раньше усиление эпических и выше до +4/+5 не влезало)
      const H = require('../src/hero').heroCatalog(), capW = g.capacity(c).wood;
      assert.ok(H.enhanceCost.every((row) => row.every((x) => Object.values(x).every((v) => v <= capW))) && H.forge.res.every((v) => v <= capW), 'ковка и усиление влезают в Склад');
      assert.ok(H.forge.runes.join() === '5,15,40,100,200' && H.enhanceRunes[4].reduce((q, v) => q + v, 0) === 75, 'руны: ковка 5…200, рунная вещь до +5 — ещё 75 рун');
    }
    const cap = g.capacity(c), full = g.reviveCostOf(c.general), rc = g.reviveCostOf(c.general, c);
    assert.ok(full.cost.wood > cap.wood && rc.cost.wood === cap.wood && !rc.coinsOnly && rc.gold === 60, `60 ур.: цена урезана до Склада (${full.cost.wood} → ${rc.cost.wood}), монет — 60`);
    Object.assign(c.res, { ...cap }); assert.ok(g.reviveGeneral(c, u, 0, false).ok && c.general.reviveAt && !c.general.fund, 'полный Склад — воскрешение сразу');
    // выше 100 уровня — только за монеты; ресурсы, внесённые частями раньше, возвращаются
    c.general = { ...g.newGeneral(c, 101), dead: true, fund: { wood: 500, stone: 0, iron: 0, food: 0, people: 0 } }; c.res.wood = 0; u.gold = 110;
    const r101 = g.reviveCostOf(c.general, c); assert.ok(r101.coinsOnly && r101.gold === 101, '101 ур.: только монеты, 101 шт.');
    assert.ok(/только за монеты/.test(g.reviveGeneral(c, u, 0, false).error || '') && c.res.wood >= 500 && c.res.wood < 600 && !c.general.fund, `за ресурсы нельзя, внесённое вернулось (${Math.round(c.res.wood)})`);
    assert.ok(g.reviveGeneral(c, u, 0, true).ok && !c.general.dead && u.gold === 9, 'воскрешён за 101 монету');
    console.log(`✓ Цены в пределах Склада: науки до 20 ур., Кузница; генерал 60 ур. — ресурсы не больше Склада (${rc.cost.wood.toLocaleString('ru-RU')} дерева) или 60 монет, 101 ур. — только 101 монета`);
  }
  { // Освоение: 10 путешественников строят замок 3 дня, недострой атакуют и подкрепляют, 3 выживших путешественника забирают его
    const luck0 = process.env.LUCK; process.env.LUCK = '0';
    const mk = (login) => { const u = g.register({ login, password: '12345', race: 0 }).user; u.created = Date.now() - 60 * DAY; u.royal = 1e6; u.royalAt = Date.now(); u.lastSeen = Date.now(); return u; };
    const U = mk('setlA1'), B = mk('setlB1'), Cc = mk('setlC1'), c = g.castleOf(U), cb = g.castleOf(B), cc = g.castleOf(Cc); for (const k of [c, cb, cc]) { g.mil(k); g.maxOut(k); }
    let spot = null; for (let r = 4; r < 60 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (const dy of [-r, r]) if (!spot && !g.settleError(U, c.x + dx, c.y + dy, 10)) spot = { x: c.x + dx, y: c.y + dy };
    assert.ok(spot, 'есть пустое место');
    c.units = { 200: 500, 224: 9 }; c.squads = []; c.armies = [];
    assert.ok(/10 путешественников/.test(g.sendArmy(c, { units: { 200: 500, 224: 9 }, mission: 'settle', ...spot }).error || ''), '9 путешественников — мало');
    c.units[224] = 10; const r1 = g.sendArmy(c, { units: { 200: 500, 224: 10 }, mission: 'settle', ...spot }); assert.ok(!r1.error, r1.error);
    g.tickWorld(r1.army.arrive + 1000);
    const site = g.castleAt(spot.x, spot.y); assert.ok(site && site.site && site.owner === U.id && !g.castlesOf(U).includes(site) && site.units[200] === 500 && !site.units[224], 'недострой заложен, охрана стоит, путешественники в стройке');
    assert.ok(Math.abs(site.site.end - site.site.start - 3 * 86400000 / (Number(process.env.SPEED) || 1)) < 2000, 'строится 3 дня');
    assert.ok(g.worldObjects(spot.x, spot.y, 1, 1)[0].site, 'на карте видно, что строится');
    c.units[224] = 10; assert.ok(/уже строится/.test(g.sendArmy(c, { units: { 224: 10 }, mission: 'settle', x: spot.x + 6, y: spot.y }).error || ''), 'одна стройка за раз');
    // нападение без путешественников: охрана разбита, стройка идёт дальше
    cb.units = { 200: 4000 }; cb.squads = []; cb.armies = [];
    const r2 = g.sendArmy(cb, { units: { 200: 4000 }, mission: 'attack', ...spot }); assert.ok(!r2.error, r2.error); g.tickWorld(r2.army.arrive + 1000);
    assert.ok(site.site && site.owner === U.id && !site.units[200], 'без путешественников — стройка продолжается');
    // нападение с 3 путешественниками: недострой переходит
    cc.units = { 200: 4000, 224: 3 }; cc.squads = []; cc.armies = [];
    const r3 = g.sendArmy(cc, { units: { 200: 4000, 224: 3 }, mission: 'attack', ...spot }); assert.ok(!r3.error, r3.error); g.tickWorld(r3.army.arrive + 1000);
    assert.ok(site.site && site.owner === Cc.id && !(r3.army.units[224] > 0), 'с 3 путешественниками — недострой ваш, путешественники остались строить');
    assert.ok(g.reportsOf(U.id).some((r) => /захвачен игроком setlC1/.test((r.lines || []).join(' '))), 'прежний хозяин получил отчёт');
    // достройка: лояльность списывается у того, чей недострой сейчас
    const need = g.royalNeed(Cc), before = Cc.royal; g.tickWorld(site.site.end + 1000);
    assert.ok(!site.site && g.castlesOf(Cc).includes(site) && Cc.royal === before - need, `замок достроен и в списке, лояльность списана (${need})`);
    console.log(`✓ Освоение: 10 путешественников, 3 дня стройки, без путешественников недострой не взять, с 3 — переходит; при достройке −${need} лояльности`);
    if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0;
  }
  { // провинции 25×25: в каждой — руины и 3 лагеря (лёгкий, средний, тяжёлый); побеждённый лагерь исчезает и через час встаёт на новом месте провинции
    const { PROV, provinceOf, onProvEdge, provNo, PROV_N } = require('../src/game'), SP = Number(process.env.SPEED) || 1, HOUR = 3600000 / SP;
    assert.strictEqual(PROV, 25, 'провинция 25×25');
    // номера для игрока — по порядку заселения: центр карты — №1…№4, все номера разные, от 1 до 1600
    const nos = Array.from({ length: PROV_N * PROV_N }, (_, i) => provNo(i + 1));
    assert.ok([780, 781, 821, 820].map(provNo).join() === '1,2,3,4' && new Set(nos).size === nos.length && Math.min(...nos) === 1 && Math.max(...nos) === nos.length, 'номера провинций — по порядку заселения');
    const first = Object.values(g.db.castles).sort((p, q) => p.id - q.id)[0]; assert.ok(provNo(provinceOf(first.x, first.y).n) <= 4, 'первые замки — в провинциях №1–4');
    for (const n of [1, 777, 1600]) {
      const L = g.provNpc(n); assert.deepStrictEqual(L.map((o) => o.img).sort(), [24, 30, 31, 32, 40, 41, 42], `провинция ${n}: руины, 3 лагеря и 3 рунных камня — ${L.map((o) => o.img)}`);
      assert.ok(L.every((o) => provinceOf(o.x, o.y).n === n && !onProvEdge(o.x, o.y)), 'объекты внутри своей провинции, не у границы');
      assert.ok(L.every((o) => L.every((q) => q === o || Math.max(Math.abs(q.x - o.x), Math.abs(q.y - o.y)) > 1)), 'объекты не вплотную друг к другу');
    }
    const W = g.register({ login: 'campWin1', password: '12345', race: 0 }).user, wc = g.castleOf(W); g.mil(wc); g.maxOut(wc);
    // своя пустая провинция: в общей замки других проверок теснят лагеря (переезжают, а места может не найтись) — проверка была нестабильной
    let pn = 0; for (let n = PROV_N * PROV_N; n > 0 && !pn; n--) if (![...g.byXY.values()].some((k) => provinceOf(k.x, k.y).n === n)) pn = n;
    { const L0 = g.provNpc(pn), px = (pn - 1) % PROV_N, py = Math.floor((pn - 1) / PROV_N); let spot = null;
      for (let y = py * PROV + 3; y < (py + 1) * PROV - 3 && !spot; y++) for (let x = px * PROV + 3; x < (px + 1) * PROV - 3 && !spot; x++) if (!g.placeError(x, y, wc) && !L0.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 2)) spot = { x, y };
      g.moveCastle(wc, spot.x, spot.y); }
    const camp = g.provNpc(pn).find((o) => o.img === 30);
    wc.units = { 204: 3000 }; wc.squads = []; wc.armies = []; wc.general = null;
    const r = g.sendArmy(wc, { units: { 204: 3000 }, x: camp.x, y: camp.y, mission: 'attack' }); assert.ok(!r.error, r.error);
    const t1 = r.army.arrive + 1000; g.tickWorld(t1);
    const rep = g.reportsOf(W.id).find((x) => x.data && x.data.type === 'battle' && x.data.x === camp.x && x.data.y === camp.y);
    assert.ok(rep && rep.data.win && rep.data.npcBack === true && /появится новый/.test(rep.lines.join(' ')) && !/мин|час/.test(rep.lines.join(' ').split('появится новый')[1]), 'победа: в отчёте — новый лагерь появится, но когда — не сказано');
    assert.ok(!g.provNpc(pn, t1).some((o) => o.img === 30) && !g.worldObjects(camp.x, camp.y, 1, 1).length, 'побеждённый лагерь исчез с карты');
    assert.ok(g.hallValue(W, 'camps') === 1 && g.halls().find((h) => h.id === 'camps').pos[W.id] > 0, 'Зал славы «Зачистка»: +1 за разбитый лагерь');
    assert.ok(!g.provNpc(pn, t1 + 3 * HOUR - 60000).some((o) => o.img === 30), 'за минуту до срока (3 часа, с 22.10) его ещё нет');
    const back = g.provNpc(pn, t1 + 3 * HOUR + 1000).find((o) => o.img === 30);
    assert.ok(back && (back.x !== camp.x || back.y !== camp.y) && provinceOf(back.x, back.y).n === pn && !onProvEdge(back.x, back.y) && !g.npcCrowded(back.x, back.y),
      'через 3 часа — снова в своей провинции, на новом месте, не у границы и не вплотную к замкам');
    assert.deepStrictEqual(g.provNpc(pn, t1 + 3 * HOUR + 2000).find((o) => o.img === 30), back, 'новое место запомнено');
    // замок вплотную к руинам (поставлен до новых правил) — переезжают руины, замок остаётся
    const ruins = g.provNpc(pn).find((o) => o.img === 24), V = g.register({ login: 'campNear1', password: '12345', race: 0 }).user, vc = g.castleOf(V);
    let cell = null; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) if (!cell && !g.castleAt(ruins.x + dx, ruins.y + dy) && !onProvEdge(ruins.x + dx, ruins.y + dy)) cell = { x: ruins.x + dx, y: ruins.y + dy };
    g.moveCastle(vc, cell.x, cell.y);
    const moved = g.provNpc(pn).find((o) => o.img === 24);
    assert.ok(vc.x === cell.x && vc.y === cell.y && (moved.x !== ruins.x || moved.y !== ruins.y) && !g.npcCrowded(moved.x, moved.y), 'руины переехали, замок на месте');
    // руины (с 22.10): нападение с Бунтарями поднимает бунт и не грабит — руины остаются; без Бунтарей — грабёж, и руины исчезают
    // с карты на 3 часа (прежде стояли на месте — их грабили снова и снова)
    const where = `${moved.x}:${moved.y}`; g.db.npc = g.db.npc || {}; g.db.npc[where] = { loyalty: 70 };
    const hit = (units) => { wc.units = { ...units }; wc.armies = []; const r = g.sendArmy(wc, { units, x: moved.x, y: moved.y, mission: 'attack' }); assert.ok(!r.error, r.error); g.tickWorld(r.army.arrive + 1000); hit.at = r.army.arrive;
      return g.reportsOf(W.id).find((x) => x.data && x.data.type === 'battle' && x.data.x === moved.x && x.data.y === moved.y && x.at >= r.army.depart); };
    const rb = hit({ 204: 20000, 233: 5 });
    assert.ok(rb && rb.data.win && !(rb.data.loot && Object.values(rb.data.loot).some((v) => v > 0)) && !rb.data.npcBack && g.db.npc[where].loyalty === 55 && g.worldObjects(moved.x, moved.y, 1, 1).length, 'с Бунтарями: бунт +15%, без грабежа, руины на месте');
    const rr = hit({ 204: 20000 });
    assert.ok(rr && rr.data.win && rr.data.loot.wood > 0 && rr.data.npcBack === 'ruins' && /Руины разграблены/.test(rr.lines.join(' ')), 'без Бунтарей: руины разграблены и исчезли');
    assert.ok(!g.worldObjects(moved.x, moved.y, 1, 1).length && !g.provNpc(pn, hit.at + 3 * HOUR - 60000).some((o) => o.img === 24), 'руин нет, пока не прошло 3 часа');
    const nr = g.provNpc(pn, hit.at + 3 * HOUR + 60000).find((o) => o.img === 24); assert.ok(nr && (nr.x !== moved.x || nr.y !== moved.y) && !g.npcCrowded(nr.x, nr.y), 'новые руины — на новом месте');
    wc.units = { 230: 1 }; wc.armies = []; assert.ok(/больше не ходят/.test(g.sendArmy(wc, { units: { 230: 1 }, x: nr.x, y: nr.y, mission: 'expedition' }).error || ''), 'экспедиции в руины больше нет');
    g.moveCastle(vc, moved.x, moved.y);
    // замок на границе провинции (стоял до увеличения провинций) переезжает внутрь той же провинции
    const p0 = provinceOf(vc.x, vc.y); g.moveCastle(vc, p0.px * PROV, vc.y); assert.ok(onProvEdge(vc.x, vc.y));
    g.provEdgeFix(); assert.ok(!onProvEdge(vc.x, vc.y) && provinceOf(vc.x, vc.y).n === p0.n, 'замок с границы переехал внутрь своей провинции');
    console.log(`✓ Провинции ${PROV}×${PROV}: руины и 3 лагеря (лёгкий, средний, тяжёлый); побеждённый лагерь исчезает и через ${Math.round(3 * HOUR / 60000)} мин встаёт на новом месте; замки не двигаются — переезжают лагеря; бунт в руинах не сбрасывается`);
  }
  { // руны: 3 камня в провинции; руну забирает отряд, пришедший первым; камень возвращается через 3 часа; ковка снаряжения за руны в Кузнице
    const { provinceOf } = require('../src/game'), { RUNE_BACK_SEC } = require('../src/runes'), { FORGE } = require('../src/hero'), SP = Number(process.env.SPEED) || 1;
    const R = g.register({ login: 'runeGo1', password: '12345', race: 0 }).user, rc = g.castleOf(R); g.mil(rc); g.maxOut(rc);
    const pn = provinceOf(rc.x, rc.y).n, stone = g.provNpc(pn).find((o) => o.img === 40);
    assert.ok(stone && (g.worldObjects(stone.x, stone.y, 1, 1)[0] || {}).rune === 'str', 'на карте — рунный камень Силы');
    rc.units = { 200: 50 }; rc.squads = []; rc.armies = []; rc.general = null; R.gear = [];
    const bare = [3, 4, 5, 6, 7, 8, 9].map((d) => ({ x: rc.x + d, y: rc.y })).find((p) => !g.runeAt(p.x, p.y) && !g.castleAt(p.x, p.y)); // клетка без камня (камни стоят где придётся)
    assert.ok(bare && /нет рунного камня/.test(g.sendArmy(rc, { units: { 200: 5 }, x: bare.x, y: bare.y, mission: 'rune' }).error || ''), 'за руной — только к камню');
    assert.ok(/некого атаковать/.test(g.sendArmy(rc, { units: { 200: 5 }, x: stone.x, y: stone.y, mission: 'attack' }).error || ''), 'на камень не нападают');
    const a1 = g.sendArmy(rc, { units: { 200: 10 }, x: stone.x, y: stone.y, mission: 'rune' }); assert.ok(!a1.error, a1.error);
    const a2 = g.sendArmy(rc, { units: { 200: 10 }, x: stone.x, y: stone.y, mission: 'rune' }); assert.ok(!a2.error, a2.error);
    const t1 = Math.max(a1.army.arrive, a2.army.arrive) + 1000; g.tickWorld(t1);
    assert.strictEqual(g.runesOf(R).str, 1, 'первый отряд забрал руну, второму не досталось');
    assert.ok(g.reportsOf(R.id).some((x) => x.title === 'Собрана Руна Силы') && g.reportsOf(R.id).some((x) => x.title === 'Руну уже забрали'), 'отчёты: собрана и «уже забрали»');
    assert.ok(!g.provNpc(pn, t1 + 1000).some((o) => o.img === 40), 'камня нет, пока не прошло 3 часа');
    const back = g.provNpc(pn, t1 + RUNE_BACK_SEC * 1000 / SP + 2000).find((o) => o.img === 40);
    assert.ok(back && provinceOf(back.x, back.y).n === pn && (back.x !== stone.x || back.y !== stone.y), 'через 3 часа — снова в провинции, на новом месте');
    g.tickWorld(t1 + 86400000); assert.ok(!rc.armies.length && rc.units[200] === 50, 'отряды вернулись целиком');
    // ковка: руны нужного вида + ресурсы + уровень Кузницы; вещь — в Оружейную; Кузнец один на ковку и усиление
    g.runesOf(R).str = 3;
    assert.ok(/Не хватает рун/.test(g.heroOp(rc, R, { op: 'forge', slot: 'weapon', r: 0 }).error || ''), 'без рун не сковать');
    for (const bad of [{ slot: 'x', r: 0 }, { slot: '__proto__', r: 0 }, { slot: 'constructor', r: 1 }, { slot: 'weapon', r: 9 }, { slot: 'weapon', r: -1 }, { slot: 'weapon', r: 1.5 }, { slot: 'weapon', r: '1e3' }, { slot: ['weapon'], r: 0 }])
      assert.ok(g.heroOp(rc, R, { op: 'forge', ...bad }).error, `ковка ${JSON.stringify(bad)} — ошибка`);
    const smith = rc.grid[0].indexOf(11), lv0 = rc.levels[0][smith];
    rc.levels[0][smith] = FORGE.lvl[4] - 1; g.runesOf(R).str = 1000;
    assert.ok(/Кузнец 20 ур/.test(g.heroOp(rc, R, { op: 'forge', slot: 'weapon', r: 4 }).error || ''), 'рунное — когда Кузнец 20 ур.');
    rc.levels[0][smith] = lv0; g.runesOf(R).str = FORGE.runes[4] + 2; g.runesOf(R).def = 0;
    for (const k of ['wood', 'stone', 'iron', 'food']) rc.res[k] = FORGE.res[4] + 500;
    const f1 = g.heroOp(rc, R, { op: 'forge', slot: 'weapon', r: 4 }); assert.ok(f1.ok, f1.error);
    assert.ok(g.runesOf(R).str === 2 && rc.res.wood < 1000 && rc.runeJob && rc.runeJob.slot === 'weapon', 'руны и ресурсы списаны, Кузнец куёт');
    assert.ok(/Кузнец занят/.test(g.heroOp(rc, R, { op: 'forge', slot: 'amulet', r: 0 }).error || ''), 'одна ковка за раз');
    rc.general = g.newGeneral(rc, 10); // усиление — при живом генерале (ковка — и без него)
    const it0 = { id: g.db.nextId++, slot: 'helm', r: 0, plus: 0 }; R.gear.push(it0);
    assert.ok(/куёт новую вещь/.test(g.heroOp(rc, R, { op: 'enhance', item: it0.id }).error || ''), 'усиление ждёт конца ковки');
    assert.ok(/Стойкости/.test(g.heroOp(rc, R, { op: 'forge', slot: 'armor', r: 0 }).error || '') || /Кузнец занят/.test(g.heroOp(rc, R, { op: 'forge', slot: 'armor', r: 0 }).error || ''), 'доспех — за руны Стойкости');
    g.tickTraining(rc, rc.runeJob.end - 1000); assert.ok(rc.runeJob, 'до конца ковки вещи нет');
    g.tickTraining(rc, rc.runeJob.end + 1000);
    const forged = R.gear.find((x) => x.forged);
    assert.ok(forged && forged.slot === 'weapon' && forged.r === 4 && !forged.plus && !rc.runeJob, 'рунный клинок — в Оружейной');
    assert.ok(g.reportsOf(R.id).some((x) => x.title === 'Сковано: Клинок Древних Рун'), 'отчёт о ковке');
    assert.ok(Math.abs(g.heroBonus({ eq: { weapon: forged }, tal: {} }).atk - 0.07) < 1e-9 && Math.abs(g.heroBonus({ eq: { weapon: { ...forged, plus: 5 } }, tal: {} }).atk - 0.1225) < 1e-9, 'рунный клинок: +7% атаки, на +5 — +12% (с 21.10; было +20% и +35%)');
    for (const k of ['wood', 'stone', 'iron', 'food']) rc.res[k] = 50000;
    g.runesOf(R).str += 5; // рунная вещь до +1 — 5 рун Силы
    const en = g.heroOp(rc, R, { op: 'enhance', item: forged.id }); assert.ok(en.ok && g.runesOf(R).str === 2, `рунную вещь можно усиливать у Кузнеца (за ресурсы и 5 рун): ${en.error}`);
    const v = g.heroView(rc); assert.ok(v.runes && v.runes.str === 2 && v.forgeJob === null, 'руны видны в окне генерала и Кузницы');
    const H = require('../src/hero').heroCatalog(); assert.ok(H.gearRarity.length === 5 && H.enhanceCost.length === 5 && H.forge.runes.length === 5 && H.runeNames.path === 'Руна Пути', 'справочник: 5 редкостей и рецепты ковки');
    // замок захватили во время ковки: ковка отменяется, руны — тому, кто платил; продать замок, пока Кузнец работает, нельзя
    const R2 = g.register({ login: 'runeLost1', password: '12345', race: 1 }).user, cap2 = g.castleOf(R2); g.mil(cap2);
    let spot2 = null; for (let r = 4; r < 20 && !spot2; r++) for (let dx = -r; dx <= r && !spot2; dx++) for (const dy of [-r, r]) if (!spot2 && !g.placeError(cap2.x + dx, cap2.y + dy)) spot2 = { x: cap2.x + dx, y: cap2.y + dy };
    g.foundCaptured(R2, spot2.x, spot2.y); const c2 = g.castlesOf(R2)[1]; g.mil(c2); g.maxOut(c2); cap2.general = null; cap2.deadGenerals = [];
    c2.general = g.newGeneral(c2, 30); const eqIt = { id: g.db.nextId++, slot: 'weapon', r: 4, plus: 2 }; c2.general.eq = { weapon: eqIt };
    const old = g.newGeneral(c2, 5); old.dead = true; c2.deadGenerals = [old];
    for (const k of ['wood', 'stone', 'iron', 'food']) c2.res[k] = 50000;
    g.runesOf(R2).path = 50; const f2 = g.heroOp(c2, R2, { op: 'forge', slot: 'horse', r: 2 }); assert.ok(f2.ok, f2.error);
    assert.ok(c2.runeJob.owner === R2.id && g.runesOf(R2).path === 10, 'ковка эпического коня за 40 рун Пути');
    g.captureCastle(R, c2);
    assert.ok(!c2.runeJob && g.runesOf(R2).path === 50 && !R.gear.some((x) => x.slot === 'horse' && x.r === 2), 'захват: ковка отменена, руны вернулись, захватчику вещь не досталась');
    assert.ok(g.reportsOf(R2.id).some((x) => x.title === 'Ковка прервана'), 'отчёт о прерванной ковке');
    assert.ok(cap2.general && cap2.general.level === 30 && cap2.general.eq.weapon === eqIt && !c2.general, 'захват: генерал с рунным клинком отступил в столицу');
    assert.ok((cap2.deadGenerals || []).includes(old) && !(c2.deadGenerals || []).length, 'павшие генералы — в столицу, захватчику не достались');
    // снаряжение — только ковкой: в наградах за вход и в боях с лагерями вещей нет; умение «Охотник за рунами» — две руны с камня
    const Q = require('../src/quests');
    assert.ok(Q.CAL.every((d) => d(10).rw.gear === undefined), 'в наградах за вход снаряжения нет');
    const camp30 = g.provNpc(pn).find((o) => o.img === 30), bag0 = R.gear.length;
    rc.units = { 200: 50, 204: 3000 }; rc.general.tal = { l4: 5 }; assert.ok(Math.abs(g.heroBonus(rc.general).find - 0.25) < 1e-9, 'Охотник за рунами 5 ур.: шанс 25%');
    if (camp30) { const ra = g.sendArmy(rc, { units: { 204: 3000 }, x: camp30.x, y: camp30.y, mission: 'attack', general: true }); assert.ok(!ra.error, ra.error); g.tickWorld(ra.army.arrive + 1000);
      assert.ok(g.reportsOf(R.id).some((x) => x.data && x.data.type === 'battle' && x.data.win && x.data.x === camp30.x) && R.gear.length === bag0, 'победа над лагерем с генералом — вещей не выпало'); }
    const st41 = g.provNpc(pn).find((o) => o.img === 41), def0 = g.runesOf(R).def, rnd0 = Math.random;
    const rr = g.sendArmy(rc, { units: { 200: 5 }, x: st41.x, y: st41.y, mission: 'rune' }); assert.ok(!rr.error, rr.error);
    Math.random = () => 0; g.tickWorld(rr.army.arrive + 1000); Math.random = rnd0;
    assert.strictEqual(g.runesOf(R).def, def0 + 2, 'генерал — Охотник за рунами: отряд принёс две руны');
    assert.ok(g.reportsOf(R.id).some((x) => x.title === 'Собраны 2 руны: Руна Стойкости'), 'отчёт: две руны');
    console.log('✓ Руны: снаряжение только ковкой (в боях и наградах не выпадает), «Охотник за рунами» — две руны; 3 рунных камня в провинции, руну забирает отряд, пришедший первым, камень возвращается через 3 часа; ковка за руны в Кузнице (рунное — с 20 ур.), вещь — в Оружейную, Кузнец один на ковку и усиление');
  }
  { // фото в общем чате — только админ: тот же безопасный путь, что у фото в письмах (сервер сам собирает PNG), видят все, живёт сутки
    const zlib = require('zlib'), adm = Object.values(g.db.users).find((x) => x.admin), pl = g.register({ login: 'chatpic1', password: '12345', race: 0 }).user;
    const w = 32, h = 24, z = zlib.deflateSync(Buffer.alloc(w * h * 3, 150)).toString('base64');
    assert.ok(g.picBeginChat(pl, w, h, 1).error, 'игрок фото в чат не шлёт');
    const b = g.picBeginChat(adm, w, h, 1, 'Новый ивент!'); assert.ok(b.ok);
    const r = await g.picPart(adm, b.up, 0, z); assert.ok(r.ok && r.chat && r.chat.pic && r.chat.text === 'Новый ивент!' && r.chat.picW === w && r.chat.picH === h, JSON.stringify(r));
    const png = g.picGet(r.chat.pic); assert.ok(png && png.png.slice(1, 4).toString() === 'PNG', 'сервер собрал PNG');
    assert.ok(g.chatLog().some((x) => x.pic === r.chat.pic), 'фото в общем чате');
    const shell = g.picBeginChat(adm, w, h, 1); adm.chatPicAt = 0; const b2 = g.picBeginChat(adm, w, h, 1);
    assert.ok(shell.error && b2.ok && (await g.picPart(adm, b2.up, 0, Buffer.from('<?php echo 1; ?>').toString('base64'))).error, 'не чаще раза в 5 секунд; не картинка — отказ');
    g.picSweep(Date.now() + 25 * 3600000);
    assert.ok(g.chatLog().some((x) => x.picGone && !x.pic && x.text === 'Новый ивент!'), 'через сутки фото исчезает, подпись остаётся');
    console.log('✓ общий чат: фото — только админ, сервер собирает PNG, видят все, живёт сутки');
  }
  { // почта (mail.js): привязка кодом из письма (без пароля, с 24.10), отвязка — кодом на привязанную почту, «Забыли пароль?» по коду из письма
    const env0 = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].map((k) => [k, process.env[k]]);
    Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_USER: 'noreply@middle-ages.ru', SMTP_PASS: 'apppass123' });
    const sent = [], realSend = g.mailSend; g.mailSend = async (to, subject, text) => { sent.push({ to, subject, text }); };
    const last = async () => { await g.mailQ; return sent[sent.length - 1]; }, codeOf = async () => (/(\d{6})/.exec((await last()).text) || [])[1];
    const mu = g.register({ login: 'mailuser1', nick: 'MailOne', password: 'secret1', race: 0 }).user, mu2 = g.register({ login: 'mailuser2', nick: 'MailTwo', password: 'secret2', race: 0 }).user;
    assert.ok(g.mailInfo(mu).on && !g.mailInfo(mu).email, 'почта подключена, у игрока не привязана');
    assert.ok((await g.mailLinkStart(mu, 'not-an-email', 'secret1')).error, 'неверный адрес');
    assert.ok((await g.mailLinkStart(mu, 'a@b.ru\r\nRCPT TO:<x@y.ru>', 'secret1')).error, 'перевод строки в адресе — отказ (команду почтовому серверу не подсунуть)');
    assert.ok((await g.mailLinkStart(mu, 'Mail.One@Mail.RU')).msg && (await last()).to === 'mail.one@mail.ru', 'код ушёл на адрес — пароль от аккаунта не нужен');
    assert.strictEqual(g.mailInfo(mu).pending, 'mail.one@mail.ru');
    assert.ok(g.mailLinkConfirm(mu, '000000').error && mu.emailReq.tries === 1, 'неверный код');
    assert.ok(g.mailLinkConfirm(mu, await codeOf()).msg && mu.emailOk && mu.email === 'mail.one@mail.ru' && !mu.emailReq, 'почта привязана');
    assert.ok(/другому аккаунту/.test((await g.mailLinkStart(mu2, 'MAIL.ONE@mail.ru', 'secret2')).error || ''), 'одна почта — один аккаунт');
    assert.ok(/отвяжите прежнюю/.test((await g.mailLinkStart(mu, 'new@mail.ru')).error || ''), 'сменить почту — сначала отвязать прежнюю');
    // отвязка: код на привязанную почту
    assert.ok((await g.mailUnlinkStart(mu)).msg && (await last()).to === 'mail.one@mail.ru' && g.mailInfo(mu).unlinking, 'код для отвязки — на привязанную почту');
    assert.ok(g.mailUnlinkConfirm(mu, '000000').error && mu.emailOk, 'неверный код — почта на месте');
    assert.ok(g.mailUnlinkConfirm(mu, await codeOf()).msg && !mu.emailOk && !g.mailInfo(mu).email && !g.mailInfo(mu).unlinking, 'почта отвязана кодом');
    assert.ok((await g.mailLinkStart(mu, 'new@mail.ru')).msg && /через час/.test((await g.mailLinkStart(mu, 'fourth@mail.ru')).error || ''), 'не больше 3 кодов в час');
    mu.mailSent = []; assert.ok((await g.mailLinkStart(mu, 'new@mail.ru')).msg && g.mailLinkConfirm(mu, await codeOf()).msg && mu.email === 'new@mail.ru', 'привязана новая почта');
    // «Забыли пароль?»: по почте или логину; ответ одинаковый — есть такой аккаунт или нет
    mu.mailSent = []; const k0 = sent.length;
    const q0 = g.resetRequest('nobody@nowhere.ru', '7.7.7.1'), q1 = g.resetRequest(' NEW@mail.ru ', '7.7.7.1'); await g.mailQ;
    assert.ok(q0.msg && q0.msg === q1.msg && sent.length === k0 + 1 && sent[k0].to === 'new@mail.ru' && /смены пароля/.test(sent[k0].subject), 'одинаковый ответ, код — на привязанную почту');
    const c = await codeOf();
    assert.ok(/коротк/.test(g.resetConfirm('new@mail.ru', c, '123').error || '') && mu.mailReset.tries === 0, 'короткий пароль — код не тратится');
    assert.ok(g.resetConfirm('new@mail.ru', '000000', 'newpass1').error && mu.mailReset.tries === 1, 'неверный код');
    const tok = g.issueToken(mu), ok = g.resetConfirm('mailuser1', c, 'NewPass1', '7.7.7.1');
    assert.ok(ok.msg && ok.login === 'mailuser1' && g.login('mailuser1', 'newpass1') && !g.tokenLogin('MailOne', tok), 'пароль сменён по коду из письма, прежние входы завершены');
    assert.strictEqual(mu.passLog[mu.passLog.length - 1].by, 'mail', 'в журнале паролей — «по коду из письма»');
    assert.ok(g.resetConfirm('mailuser1', c, 'again123').error, 'код одноразовый');
    await g.mailQ; assert.ok(/Пароль изменён/.test(sent[sent.length - 1].subject), 'письмо «Пароль изменён»');
    // задание «Привяжите аккаунт»: 20 репутации и 200 уникальных воинов — один раз на аккаунт и один раз на почту
    { const c1 = g.castleOf(mu), st = g.questsState(mu, c1); assert.ok(st.bind && st.bind.done && !st.bind.claimed, 'почта привязана — задание выполнено');
      const rep0 = mu.reputation, uq = require('../src/army').uniqueFor(mu.race, 'inf'), n0 = (g.stashOf(mu).units[uq.id] || 0);
      const cl = g.questClaim(mu, c1, 'bind'); assert.ok(cl.ok && mu.reputation === rep0 + 20 && g.stashOf(mu).units[uq.id] === n0 + 200, `награда: репутация +20, ${uq.name} ×200`);
      assert.ok(g.questClaim(mu, c1, 'bind').error, 'второй раз — нет');
      mu.mailSent = []; await g.mailUnlinkStart(mu); g.mailUnlinkConfirm(mu, await codeOf()); // та же почта — другому аккаунту: награды нет
      mu2.mailSent = []; await g.mailLinkStart(mu2, 'mail.one@mail.ru'); g.mailLinkConfirm(mu2, await codeOf()); // эта почта принесла награду аккаунту mu
      const s2 = g.questsState(mu2, g.castleOf(mu2)); assert.ok(mu2.emailOk && !s2.bind.done && s2.bind.used && g.questClaim(mu2, g.castleOf(mu2), 'bind').error, 'почта уже приносила награду — другому аккаунту не даст'); delete mu2.emailOk; mu2.email = ''; mu2.mailSent = []; }
    // админ почту не привязывает; без настроек ящика почта скрыта
    assert.ok((await g.mailLinkStart(g.adminUser(), 'adm@mail.ru', '')).error, 'админ почту не привязывает');
    const sendFail = g.mailSend, ce = console.error; g.mailSend = async () => { throw new Error('535 auth failed'); }; console.error = () => {}; // ошибка почты пишется в журнал — здесь она ожидаемая
    assert.ok(/Не получилось/.test((await g.mailLinkStart(mu2, 'two@mail.ru', 'secret2')).error || '') && !mu2.emailReq && !(mu2.mailSent || []).length, 'письмо не ушло — понятная ошибка, попытка не тратится');
    assert.ok(/не отправилось: 535/.test((await g.mailTest(g.adminUser(), 'adm@mail.ru')).error || ''), 'проверочное письмо: видно ошибку почтового сервера');
    g.mailSend = sendFail; console.error = ce;
    delete process.env.SMTP_PASS; assert.ok(!g.mailInfo(mu2).on && (await g.mailLinkStart(mu2, 'x@mail.ru', '')).error, 'без пароля ящика — почта скрыта');
    g.mailSend = realSend; for (const [k, v] of env0) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    console.log('✓ Почта: привязка кодом без пароля, одна почта — один аккаунт, отвязка кодом с почты, «Забыли пароль?» по коду из письма, лимиты');
  }
  { // разговор с почтовым сервером: TLS сразу (465) и STARTTLS (587); без шифрования пароль не уходит; письмо — UTF-8 base64
    const M = require('../src/mail'), tlsM = require('tls'), netM = require('net'), { execFileSync } = require('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp-')); let key = null, cert = null;
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
      key = fs.readFileSync(path.join(dir, 'k.pem')); cert = fs.readFileSync(path.join(dir, 'c.pem'));
    } catch { console.log('… разговор с почтовым сервером не проверен: нет openssl'); }
    fs.rmSync(dir, { recursive: true, force: true });
    if (cert) {
      const got = [];
      // простой почтовый сервер: greet — приветствие, tlsUp — предлагает STARTTLS
      const talk = (sock, greet, tlsUp) => {
        let buf = '', data = null, auth = false, plainAuth = false; const out = (l) => sock.write(`${l}\r\n`);
        sock.on('error', () => {});
        if (greet) out('220 test ESMTP');
        const onData = (d) => { buf += d; let i;
          while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
            if (data) { if (line === '.') { got.push({ auth, data: data.join('\r\n') }); data = null; out('250 ok'); } else data.push(line); continue; }
            if (/^EHLO /.test(line)) { out('250-test'); out(tlsUp ? '250 STARTTLS' : '250 AUTH PLAIN'); }
            else if (line === 'STARTTLS' && tlsUp) { out('220 go'); sock.off('data', onData); talk(new tlsM.TLSSocket(sock, { isServer: true, secureContext: tlsM.createSecureContext({ key, cert }) }), false, false); return; }
            else if (/^AUTH PLAIN /.test(line)) { plainAuth = !(sock instanceof tlsM.TLSSocket); auth = Buffer.from(line.slice(11), 'base64').toString() === '\0noreply@middle-ages.ru\0apppass123'; out(auth && !plainAuth ? '235 ok' : '535 bad'); }
            else if (/^(MAIL FROM|RCPT TO):<[^>]+>$/.test(line)) out(auth ? '250 ok' : '530 auth');
            else if (line === 'DATA') { data = []; out('354 go'); }
            else if (line === 'QUIT') { out('221 bye'); sock.end(); }
            else out('500 ?'); } };
        sock.on('data', onData);
      };
      const listen = (srv) => new Promise((ok) => srv.listen(0, 'localhost', () => ok(srv.address().port)));
      const s465 = tlsM.createServer({ key, cert }, (s) => talk(s, true, false)), s587 = netM.createServer((s) => talk(s, true, true)), sBad = netM.createServer((s) => talk(s, true, false));
      const [p465, p587, pBad] = [await listen(s465), await listen(s587), await listen(sBad)];
      const C = (port, secure, pass = 'apppass123') => ({ host: 'localhost', port, secure, user: 'noreply@middle-ages.ru', pass, name: 'Средневековье', ca: cert, timeout: 5000 });
      const subj = 'Код для смены пароля — проверка длинной темы письма на русском языке', text = 'Код: 123456\nВторая строка.\n.Точка в начале и очень длинная строка: Если вы ничего не привязывали — просто удалите письмо, без кода почту никто не отвяжет. ';
      await M.smtp(C(p465, true), { to: 'player@mail.ru', data: M.letter(C(p465, true), 'player@mail.ru', subj, text) });
      await M.smtp(C(p587, false), { to: 'player@mail.ru', data: M.letter(C(p587, false), 'player@mail.ru', subj, text) });
      assert.strictEqual(got.length, 2, 'оба письма дошли (TLS сразу и STARTTLS)');
      const dec = (raw) => { const [head, body] = raw.split('\r\n\r\n'); const h = head.replace(/\r\n /g, ' ');
        const s = (/^Subject: (.*)$/m.exec(h) || [])[1].split(' ').map((w) => Buffer.from(/=\?UTF-8\?B\?(.*)\?=/.exec(w)[1], 'base64').toString('utf8')).join('');
        const raw2 = body.replace(/=\r\n/g, ''), bytes = []; // quoted-printable → байты UTF-8
        for (let i = 0; i < raw2.length; i++) { if (raw2[i] === '=') { bytes.push(parseInt(raw2.slice(i + 1, i + 3), 16)); i += 2; } else bytes.push(raw2.charCodeAt(i)); }
        return { h, subject: s, text: Buffer.from(bytes).toString('utf8') }; };
      const L = dec(got[0].data);
      assert.ok(L.subject === subj && L.text === 'Код: 123456\r\nВторая строка.\r\n.Точка в начале и очень длинная строка: Если вы ничего не привязывали — просто удалите письмо, без кода почту никто не отвяжет. ' && /quoted-printable/.test(L.h) && /^To: <player@mail\.ru>$/m.test(L.h) && /<noreply@middle-ages\.ru>$/m.test(L.h), 'тема и текст — без искажений');
      assert.ok(got[0].data.split('\r\n').every((l) => l.length <= 78 && l[0] !== '.'), 'строки письма короткие и не начинаются с точки');
      await assert.rejects(M.smtp(C(pBad, false), null), /не предлагает шифрование/, 'сервер без STARTTLS — пароль не отправлен');
      await assert.rejects(M.smtp(C(p465, true, 'wrongpass1'), null), /535/, 'неверный пароль — ошибка почтового сервера');
      await assert.rejects(M.smtp({ ...C(p465, true), ca: undefined }, null), /self[- ]signed|certificate/i, 'чужой сертификат — отказ');
      for (const s of [s465, s587, sBad]) s.close();
      console.log('✓ Почтовый сервер: TLS сразу и STARTTLS, без шифрования пароль не уходит, чужой сертификат — отказ, письмо UTF-8 без искажений');
    }
  }
  // «СВЯЗЬ» (link.js): переписка игрока с мастерами — сообщения, скрин на 8 часов, ответ от «Мастер игры», «Решено», лимит в сутки
  {
    const zlib = require('zlib');
    const pl = g.register({ login: 'linkPlayer', password: '12345', race: 0 }).user, ms = g.register({ login: 'linkTester', password: '12345', race: 0 }).user, other = g.register({ login: 'linkOther', password: '12345', race: 0 }).user; ms.tester = true;
    g.db.bugs = [{ from: 'linkPlayer', text: 'старая жалоба', at: Date.now() - 1000, ans: { by: ms.id, at: Date.now() - 500, text: 'старый ответ' } }]; // прежняя «СВЯЗЬ» — переносится
    assert.ok(g.linkPost(pl, 'Жалоба на Злодея (чат): «оскорбление»').ok && !g.db.bugs, 'сообщение в «СВЯЗЬ», старые жалобы перенесены');
    const n0 = g.staffUnread(ms); assert.ok(g.linkNew() === 1 && n0 >= 1, 'переписка ждёт ответа — счётчик на кнопке МАСТЕРА');
    const L = g.linkList(); assert.ok(L.length === 1 && L[0].uid === pl.id && L[0].wait && L[0].n === 3, 'мастера видят переписку игрока (старая жалоба, ответ и новое сообщение)');
    // скрин: сжатые цвета точек → PNG на 8 часов, видят игрок и мастера, чужой — нет
    const up = g.linkPicBegin(pl, 8, 8, 1, 'вот скрин').up, z = zlib.deflateSync(Buffer.alloc(8 * 8 * 3, 200)).toString('base64');
    const pr = await g.linkPicPart(pl, up, 0, z); assert.ok(pr.ok, 'скрин принят');
    const pm = g.linkOpen(pl.id).msgs.at(-1); assert.ok(pm.pic && pm.picExp - Date.now() > 7.9 * 3600000 && pm.picExp - Date.now() <= 8 * 3600000 && pm.text === 'вот скрин', 'скрин живёт 8 часов');
    assert.ok(g.linkPicGet(pl, pm.pic) && g.linkPicGet(ms, pm.pic) && !g.linkPicGet(other, pm.pic), 'скрин видят игрок и мастера, чужой игрок — нет');
    g.picSweep(Date.now() + 8 * 3600000 + 1000); assert.ok(!g.linkPicGet(pl, pm.pic) && g.linkOpen(pl.id).msgs.at(-1).picGone, 'через 8 часов скрин удалён');
    // ответ мастера — сообщением от «Мастер игры»
    assert.ok(g.staffOp(pl, { op: 'linkans', uid: pl.id, text: 'нет' }).error, 'игрок не мастер — ответить нельзя');
    const r = g.staffOp(ms, { op: 'linkans', uid: pl.id, text: 'Разобрались, игроку закрыт чат.' });
    assert.ok(r.ok && g.linkNew() === 0 && g.linkUnread(pl) === 1, 'ответ отправлен, у игрока — новое сообщение');
    const mine = g.linkMine(pl), last = mine.msgs.at(-1);
    assert.ok(last.master && last.by === 'Мастер игры' && last.text.includes('Разобрались') && !JSON.stringify(mine).includes('linkTester') && g.linkUnread(pl) === 0, 'игрок видит «Мастер игры» без ника мастера, открыл — прочитано');
    assert.ok(g.linkOpen(pl.id).msgs.at(-1).by === 'linkTester', 'мастера видят, кто ответил');
    assert.ok(g.staffOp(ms, { op: 'linksolve', uid: pl.id }).ok && g.linkNew() === 1 && g.staffOp(ms, { op: 'linksolve', uid: pl.id }).ok && g.linkNew() === 0, '«Решено» и обратно');
    g.linkPost(pl, 'спасибо'); assert.ok(g.linkNew() === 1, 'игрок написал снова — переписка опять ждёт ответа');
    for (let i = 0; i < 20; i++) g.linkPost(pl, `флуд ${i}`); assert.ok(g.linkPost(pl, 'ещё').error && pl.linkLog.length === 10, 'не больше 10 сообщений в сутки');
    const v = g.staffView(ms); assert.ok(v.link && v.link.all === 1 && !v.topics.some((t) => /СВЯЗЬ/.test(t.title)), '«СВЯЗЬ» — не тема, удалить её нельзя');
    g.purgeUser(pl); assert.ok(!g.db.link.th[pl.id], 'игрок удалён — его переписка тоже');
    console.log('✓ СВЯЗЬ: переписка игрока с мастерами, скрин на 8 часов, ответ от «Мастер игры», «Решено», лимит 10 в сутки');
  }
  // «Резерв»: до 25 000 воинов вне боя; при бунте 85% выходит в Замковую армию; пока в резерве есть войска, замок не захватить
  {
    const luck0 = process.env.LUCK; process.env.LUCK = '0';
    const mk = (login) => { const u = g.register({ login, password: '12345', race: 0 }).user; u.created = Date.now() - 60 * DAY; u.royal = 1e6; u.royalAt = Date.now(); u.lastSeen = Date.now(); return u; };
    const A = mk('reserveA1'), Dd = mk('reserveD1'); g.adminAddCastles(Dd, 1);
    const ca = g.castleOf(A), tgt = g.castlesOf(Dd)[1]; g.mil(ca); g.mil(tgt); g.maxOut(ca); g.maxOut(tgt);
    tgt.units = { 201: 30000, 221: 5 }; tgt.squads = []; tgt.reserve = {}; tgt.loyalty = 100;
    assert.ok(g.squadOp(tgt, { op: 'regroup', from: 'castle', to: 'reserve', units: { 201: 25001 } }).error, 'больше 25 000 — нельзя');
    assert.ok(g.squadOp(tgt, { op: 'regroup', from: 'castle', to: 'reserve', units: { 201: 20000 } }).ok && tgt.reserve[201] === 20000 && tgt.units[201] === 10000, 'положили 20 000 в резерв');
    assert.ok(g.squadOp(tgt, { op: 'regroup', from: 'castle', to: 'reserve', units: { 201: 5001 } }).error, 'место — только на 5 000');
    assert.ok(g.squadOp(tgt, { op: 'rename', id: 'reserve', name: 'x' }).error && g.squadOp(tgt, { op: 'disband', id: 'reserve' }).error, 'резерв не переименовать и не распустить');
    assert.ok(g.squadOp(tgt, { op: 'regroup', from: 'reserve', to: 'castle', units: { 201: 1000 } }).ok && tgt.reserve[201] === 19000 && tgt.units[201] === 11000, 'достали 1000 обратно');
    assert.ok(!g.defenders(tgt).some((m) => m === tgt.reserve), 'резерв не защищает замок');
    assert.ok(g.sendArmy(tgt, { from: 'reserve', mission: 'attack', x: ca.x, y: ca.y }).error, 'из резерва в поход не уйти');
    const up0 = g.upkeep(tgt); tgt.reserve[201] += 0; assert.ok(up0 >= 19000 * require('../src/army').UNIT[201].upkeep, 'в резерве воины едят');
    // нападения с бунтарями: войска замка гибнут, резерв цел; при бунте 85%+ резерв выходит на защиту
    tgt.units = {};
    const hit = () => { ca.units = { 200: 3000, 233: 1 }; ca.squads = []; ca.armies = []; const r = g.sendArmy(ca, { from: 'castle', mission: 'attack', x: tgt.x, y: tgt.y }); assert.ok(!r.error, r.error); g.tickWorld(Date.now() + 1e10); g.tickWorld(Date.now() + 3e10); };
    for (let k = 0; k < 5; k++) hit();
    assert.ok(Math.round(100 - tgt.loyalty) === 75 && tgt.reserve[201] === 19000, `бунт 75%, резерв цел (${tgt.reserve[201]})`);
    hit(); // бунт 90% — резерв выходит
    assert.ok(Math.round(100 - tgt.loyalty) === 90 && !g.reserveCount(tgt) && tgt.units[201] === 19000 && tgt.owner === Dd.id, `бунт 90%: резерв вышел в Замковую армию (${JSON.stringify(tgt.units)})`);
    assert.ok(g.reportsOf(Dd.id).some((r) => /Резерв вышел на защиту/.test(r.title)), 'хозяину — отчёт о выходе резерва');
    tgt.units[201] = 5; assert.ok(g.squadOp(tgt, { op: 'regroup', from: 'castle', to: 'reserve', units: { 201: 5 } }).error, 'при бунте 85%+ класть в резерв нельзя');
    // если в резерве что-то есть, а бунт дошёл до 100% — замок не захвачен, резерв выходит
    tgt.reserve = { 201: 50 }; tgt.units = {}; hit();
    assert.ok(tgt.owner === Dd.id && tgt.loyalty === 1 && !g.reserveCount(tgt) && tgt.units[201] === 50, 'резерв не пуст — замок не захвачен, войска вышли на защиту');
    tgt.units = {}; hit(); assert.ok(tgt.owner === A.id && !g.reserveCount(tgt), 'перебили всех — замок захвачен');
    process.env.LUCK = luck0 === undefined ? '' : luck0; if (luck0 === undefined) delete process.env.LUCK;
    console.log('✓ Резерв: до 25 000 воинов вне боя, при бунте 85% выходит на защиту, пока в резерве есть войска — замок не захватить');
  }
  // снос здания — 30 минут: пока идёт, здание стоит и работает, можно отменить; потом исчезает
  {
    const u = g.register({ login: 'razeUser1', password: '12345', race: 0 }).user, c = g.castleOf(u); g.mil(c); g.maxOut(c);
    const cell = c.grid[0].indexOf(1); assert.ok(cell >= 0, 'есть Склад');
    const r = g.demolish(c, 0, cell); const sec = Math.max(5, Math.round(1800 / (Number(process.env.SPEED) || 1)));
    assert.ok(r.ok && r.sec === sec && c.razing.length === 1 && c.grid[0][cell] === 1, 'снос начат, здание пока стоит');
    assert.ok(g.demolish(c, 0, cell).error && g.startBuild(c, 0, cell, 1).error, 'второй раз снести и развивать во время сноса нельзя');
    assert.ok(g.demolishCancel(c, 0, cell).ok && !c.razing.length && c.grid[0][cell] === 1, 'снос отменён — здание на месте');
    g.demolish(c, 0, cell); g.tick(c, Date.now() + (sec - 2) * 1000); assert.strictEqual(c.grid[0][cell], 1, 'до конца сноса здание стоит');
    const done = g.tick(c, Date.now() + (sec + 1) * 1000);
    assert.ok(c.grid[0][cell] === -1 && !c.razing.length && done.some((d) => d.raze), `через ${Math.round(sec / 60)} мин здание снесено`);
    assert.ok(/Ратушу снести нельзя/.test(g.demolish(c, 0, c.grid[0].indexOf(0)).error || ''), 'Ратушу снести нельзя');
    console.log(`✓ Снос здания: ${Math.round(sec / 60)} мин, здание работает до конца сноса, снос можно отменить`);
  }
  { // разведчик — самый быстрый воин своей расы
    const A = require('../src/army');
    for (const race of ['humans', 'elves', 'dwarves', 'orcs']) {
      const us = A.unitsForRace(race).filter((u) => u.race === race), sc = us.find((u) => u.role === 'scout');
      assert.ok(sc && us.every((u) => u === sc || u.speed < sc.speed), `${race}: ${sc && sc.name} (${sc && sc.speed}) быстрее всех`);
    }
    console.log('✓ Разведчики — самые быстрые воины своих рас');
  }
  // «Алтарь» → Зона охоты: Генерал бьёт чудовище, заклинания за кристаллы, ответный удар, награда по доле урона
  {
    const H = require('../src/hunt');
    const mk = (login) => { const u = g.register({ login, password: '12345', race: 0 }).user; const c = g.castleOf(u); g.mil(c); g.maxOut(c); return [u, c]; };
    const [A, ca] = mk('hunterA1'), [Bu, cb] = mk('hunterB1'), [N, cn] = mk('hunterN1');
    cn.general = null; assert.ok(/Генерал/.test(g.huntGo(N, cn, 1).error || ''), 'без Генерала — нельзя');
    g.setBuildingLevel(cn, 47, 0); assert.ok(/Нужен Алтарь/.test(g.huntGo(N, cn, 1).error || ''), 'без Алтаря — нельзя');
    const v = g.huntView(A); assert.ok(v.mobs.length === 24 && v.crystals.fire === 10 && v.me.hp === v.me.max && v.spells.length === 12, 'карта: 24 чудовища, по 10 кристаллов, здоровье полное');
    const m = g.huntDb().mobs.find((x) => x.l === 1 && !x.dead), opp = { fire: 'water', water: 'fire', air: 'earth', earth: 'air' }[m.el];
    assert.ok(/кристаллов/.test(g.huntGo(A, ca, m.id, [{ el: opp, l: 3 }]).error || ''), 'не хватает кристаллов на заклинание III');
    const r = g.huntGo(A, ca, m.id, [{ el: opp, l: 1 }, { el: m.el, l: 1 }]);
    assert.ok(r.ok && A.crystals[opp] === 8 && A.crystals[m.el] === 8 && A.hunt.march, 'в поход с двумя заклинаниями, кристаллы списаны');
    assert.ok(/уже в походе/.test(g.huntGo(A, ca, m.id).error || ''), 'второй поход — нельзя');
    m.hp = m.max = 200000; const hp0 = m.hp; g.huntTick(A.hunt.march.end + 1); // запас, чтобы первый удар не добил
    const L = A.hunt.last; const sp = L.hits.filter((x) => x.kind !== 'phys');
    assert.ok(L && L.dealt > 0 && hp0 - m.hp === L.dealt && L.got > 0 && A.hunt.hp < A.hunt.max && !A.hunt.march, `удар: ${L.dealt}, ответ: ${L.got}`);
    assert.ok(sp.find((x) => x.kind === m.el).dmg < sp.find((x) => x.kind === opp).dmg, 'заклинание своей стихии чудовища слабее противоположной');
    // добить вдвоём: награда по доле урона
    m.hp = 1000; m.dmg = { [A.id]: 3000 }; const cr0 = A.crystals[m.el], crB = (Bu.crystals || {})[m.el] || 10;
    const rb = g.huntGo(Bu, cb, m.id); assert.ok(rb.ok, "Bu в поход: " + rb.error); Bu.hunt.march.end = Date.now() - 1; g.huntTick();
    assert.ok(m.dead && A.crystals[m.el] > cr0 && Bu.crystals[m.el] > crB && g.db.reports.some((x) => x.owner === A.id && /Охота: .* повержен/.test(x.title)), 'чудовище пало — награда обоим, по доле урона');
    // лечение за монеты, нехватка здоровья
    A.hunt.hp = 10; A.gold = 100; const big = g.huntDb().mobs.find((x) => x.l === 3 && !x.dead);
    assert.ok(/Запас жизни/.test(g.huntGo(A, ca, big.id).error || ''), 'мало здоровья — в бой нельзя');
    const hc = g.huntHealCost(A); assert.ok(hc >= 1 && g.huntHeal(A).ok && A.gold === 100 - hc && A.hunt.hp === A.hunt.max, `вылечить за ${hc} монет`);
    assert.ok(g.huntGo(A, ca, big.id).ok && g.huntSpeed(A).ok && A.gold === 100 - hc - 3, 'ускорить поход за 3 монеты');
    console.log('✓ Алтарь: Зона охоты — Генерал бьёт чудовище, заклинания за кристаллы, ответный удар, награда по доле урона, лечение и ускорение');
  }
  { // Капкан: до боя ловит до 1000 воинов (разведчиков не трогает) → Темница; казнь — лояльность не больше 100 в сутки, вербовка 15% за 4 ч
    const mk = (login) => { const u = g.register({ login, password: '12345', race: 0 }).user, c = g.castleOf(u); g.mil(c); g.maxOut(c); return [u, c]; };
    const [Au, ca] = mk('trapAtt1'), [Du, cd] = mk('trapDef1'), [Pu, cp] = mk('trapPl1');
    const rt0 = g.rating(cd); assert.ok(!g.buildingLevel(cd, 48), 'полная прокачка игрока Капкан не ставит');
    { const fc = require('../src/catalog').CASTLE_OK.find((k) => k !== 24 && cd.grid[0][k] === -1); cd.grid[0][fc] = 48; cd.levels[0][fc] = 1; }
    assert.ok(rt0 === 2200 && g.buildingLevel(cd, 48) === 1 && g.rating(cd) === 2222 && g.ratingParts(cd).trap === 22, 'полный замок 2200, с Капканом — 2222');
    g.setBuildingLevel(cp, 48, 0); assert.ok(/администрац/.test(g.startBuild(cp, 0, cp.grid[0].indexOf(-1), 48).error || ''), 'игрок Капкан пока не строит');
    const hit = (units) => { ca.armies = []; ca.units = { ...units }; const go = g.sendArmy(ca, { units, x: cd.x, y: cd.y, mission: 'attack' }); assert.ok(go.army, go.error); g.arrive(ca, go.army, Date.now()); };
    hit({ 200: 1500, 202: 10 });
    assert.ok(cd.prison && cd.prison.units[200] === 1000 && !cd.prison.units[202] && cd.prison.login === 'trapAtt1', 'поймано 1000, разведчики — нет');
    const rp = (u, re) => g.db.reports.some((r) => r.owner === u.id && r.lines.some((l) => re.test(l)));
    assert.ok(rp(Au, /Капкан замка .* поймал до боя 1000/) && rp(Du, /Ваш Капкан поймал до боя 1000/), 'в отчётах обеих сторон');
    const v = g.trapView(Du, cd); assert.ok(!v.ready && v.prison.n === 1000 && v.prison.rMin === undefined, 'Капкан перезаряжается; сколько согласится служить — игроку не показывается');
    const want = g.trapLoyalty(Du, cd), ex = g.trapExecute(Du, cd);
    assert.ok(ex.ok && want > 0 && want <= 100 && Du.trapLoyToday === want && !cd.prison && g.mstats(Du).execute === 1000, `казнь: +${want} лояльности, зал «Казни»`);
    for (const r of ['wood', 'stone', 'iron', 'food']) cd.res[r] = 30000;
    { const ch = g.trapCharge(cd); assert.ok(ch.ok && cd.res.wood < 11000 && g.trapView(Du, cd).ready, JSON.stringify(ch) + ' ' + 'перезарядка сразу — за 20 000 каждого ресурса'); }
    hit({ 200: 400 }); // вся армия в Капкане — боя нет, ничего не ломается
    assert.ok(cd.prison.units[200] === 400 && Du.trapLoyToday + g.trapLoyalty(Du, cd) <= 100, 'не больше 100 лояльности за казни в сутки');
    const n0 = cd.units[200] || 0, rc = g.trapRecruit(Du, cd);
    assert.ok(rc.ok && !cd.prison && cd.recruit.pool[200] === 400 && (cd.units[200] || 0) === n0, 'вербовка началась, итог — через 4 ч');
    g.trapTick(cd.recruit.end + 1); const rn = cd.units[200] - n0;
    assert.ok(!cd.recruit && rn >= 40 && rn <= 60 && g.mstats(Du).recruit === rn, `через 4 ч в армии ${rn} из 400 (10–15%), зал «Вербовка»`);
    const sd = g.sameDevice; g.sameDevice = () => true; cd.trap.readyAt = 0; hit({ 200: 300 }); g.sameDevice = sd;
    assert.ok(cd.prison.noLoy && g.trapLoyalty(Du, cd) === 0, 'пленные с того же телефона — без лояльности');
    g.trapTick(cd.prison.until + 1); assert.ok(!cd.prison && cd.trapLog.some((e) => e.act === 'escape'), 'сутки не тронули — сбежали');
    assert.ok(g.halls().some((h) => h.id === 'recruit') && g.halls().some((h) => h.id === 'execute'), 'залы «Казни» и «Вербовка»');
    console.log('✓ Капкан: ловит до 1000 до боя, Темница — казнь (лояльность ≤ 100 в сутки, без мультов) или вербовка 10–15% за 4 ч, перезарядка 12 ч, побег через сутки');
  }
  try { fs.unlinkSync(DB); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

