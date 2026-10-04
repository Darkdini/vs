'use strict';
// «Боевой ранг», как в оригинале: 78 рангов — 13 званий по 6 ступеней (0–5 звёзд). Очки — за уничтоженных воинов противника
// (население погибших юнитов): в нападениях и набегах на игроков и в защите своего замка — полностью, лагеря разбойников — вполовину.
// Если противник слабее больше чем на 5 рангов — очков меньше (за избиение новичков ранг почти не растёт).
// Ранг обновляется 1-го числа каждого месяца; за каждый открытый ранг — награда в Кладовую (армия, ресурсы, на новом звании опыт генерала).
// Пока ранг держится — постоянный бонус: урон и защита воинов до +20%, прирост ресурсов до +30% (на Легенде 5★).

const TITLES = ['Новобранец', 'Рекрут', 'Боец', 'Воин', 'Чемпион', 'Полководец', 'Мастер войны', 'Вершитель', 'Завоеватель', 'Покоритель', 'Триумфатор', 'Герой', 'Легенда'];
// очки для ранга (как в оригинале)
const NEED = [20, 60, 80, 100, 100, 110, 320, 600, 1150, 1210, 1220, 1900, 4550, 4580, 4770, 5190, 7890, 11900, 20810, 25450, 27290, 27530, 28000, 28410,
  30330, 89420, 92280, 93520, 122850, 126550, 129120, 158500, 162700, 165360, 201440, 202940, 206620, 267010, 274530, 279430, 343060, 348880,
  354800, 522080, 531440, 551020, 579840, 602780, 617480, 637260, 653280, 671740, 687120, 720240, 744840, 764120, 781000, 799520, 816760, 835120,
  866080, 897560, 915800, 934760, 954160, 971620, 990920, 1128880, 1297360, 1306380, 1325940, 1329080, 1359080, 2786340, 3000000, 3500000, 4000000, 5000000];
const N = NEED.length, MAX_ATK = 0.20, MAX_PROD = 0.30, NPC_K = 0.5;
// Как в оригинале: очки копятся без ограничений, а ранг обновляется раз в месяц — 1-го числа (по Москве);
// тогда же выдаются награды за все открытые за месяц ранги. Очки — половина населения уничтоженных воинов (прокачка не быстрая).
const PTS_K = 0.5, START_MAX = 11, MSK = 3 * 3600000;
const monthKey = (t) => new Date(t + MSK).toISOString().slice(0, 7);
const nextMonth = (t) => { const d = new Date(t + MSK); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - MSK; };

const rankIdx = (pts) => { let i = -1; while (i + 1 < N && pts >= NEED[i + 1]) i++; return i; }; // -1 — ещё без ранга
const rankInfo = (i) => (i < 0 ? { idx: -1, title: 'Без ранга', icon: 1, stars: 0 } : { idx: i, title: TITLES[Math.floor(i / 6)], icon: Math.floor(i / 6) + 1, stars: i % 6 });
const bonusAt = (i) => { const f = i < 0 ? 0 : (i + 1) / N; return { atk: +(MAX_ATK * f).toFixed(3), prod: +(MAX_PROD * f).toFixed(3) }; };
// награда за открытие ранга i: армия 300 × номер ранга (поровну пехота, конница, маги своей расы) и ресурсы по 500 × номер ранга;
// на новом звании ещё опыт генерала
const prizeAt = (i) => { const n = i + 1; return { army: 300 * n, res: 500 * n, exp: i % 6 === 0 && i > 0 ? 100 * (Math.floor(i / 6) + 1) : 0 }; };
// воины награды: первая пехота с атакой, первая конница (не разведчик) и первый маг расы
const prizeUnits = (race) => {
  const list = require('./army').unitsForRace(race).filter((x) => !x.quest);
  const inf = list.find((x) => x.type === 'infantry' && x.role === 'atk_inf') || list.find((x) => x.type === 'infantry');
  const cav = list.find((x) => x.type === 'cavalry' && !['scout', 'eye'].includes(x.role));
  const mag = list.find((x) => x.type === 'magic');
  return [inf, cav, mag].filter(Boolean).map((x) => x.id);
};

function install(Game) {
  const P = Game.prototype;
  // при первом обращении — стартовые очки по уже набитой статистике боёв, но не выше Рекрута 5★ (без наград за прошлые ранги)
  P.brOf = function brOf(u, now = Date.now()) {
    if (!u.br || u.br.v !== 3) { const s = this.stats(u), pts = Math.min(NEED[START_MAX], Math.round((s.kills || 0) + (s.defKills || 0))); u.br = { v: 3, pts, claimed: rankIdx(pts), month: monthKey(now) }; }
    const b = u.br, m = monthKey(now);
    if (b.month !== m) { b.month = m; this.brMonth(u, b); } // наступил новый месяц — ранг обновляется, награды за новые ранги
    return b;
  };
  // награда ранга → в Кладовую: армия поровну пехота / конница / маги расы игрока, ресурсы, опыт
  P.brPrize = function brPrize(u, i) {
    const p = prizeAt(i), units = {}, ids = prizeUnits(u.race);
    ids.forEach((id, k) => { units[id] = Math.floor(p.army / ids.length) + (k < p.army % ids.length ? 1 : 0); });
    return { army: p.army, res: p.res, exp: p.exp, rw: { wood: p.res, stone: p.res, iron: p.res, food: p.res, units, exp: p.exp } };
  };
  P.brMonth = function brMonth(u, b) {
    const to = rankIdx(b.pts); if (to <= b.claimed) return;
    const lines = []; let army = 0, res = 0, exp = 0;
    for (let i = b.claimed + 1; i <= to; i++) { const p = this.brPrize(u, i); this.stashAdd(u, p.rw); army += p.army; res += p.res; exp += p.exp; const inf = rankInfo(i); lines.push(`${i + 1}. ${inf.title} ${'★'.repeat(inf.stars) || '☆'} — армия ${p.army}, ресурсы по ${p.res}${p.exp ? `, опыт генерала +${p.exp}` : ''}`); }
    b.claimed = to; const inf = rankInfo(to), bo = bonusAt(to);
    this.report(u.id, `Боевой ранг за месяц: ${inf.title} ${'★'.repeat(inf.stars) || '☆'} (${to + 1}-й)!`, [...lines, `Всего в Кладовую: армия ${army}, ресурсы по ${res}${exp ? `, опыт генерала +${exp}` : ''}.`, `Бонус ранга: урон и защита воинов +${Math.round(bo.atk * 1000) / 10}%, прирост ресурсов +${Math.round(bo.prod * 1000) / 10}%.`], 'rank');
  };
  P.brRank = function brRank(u) { return u ? this.brOf(u).claimed : -1; };
  P.brBonus = function brBonus(u) { return bonusAt(u ? this.brRank(u) : -1); };
  // очки за бой: who — кто получает, vs — противник (null для лагеря разбойников)
  P.brAdd = function brAdd(whoId, pts, vsId, now = Date.now()) {
    const u = this.userById(whoId); if (!u || u.bot || !(pts > 0)) return;
    const b = this.brOf(u, now);
    let k = PTS_K * (vsId === null ? NPC_K : 1);
    if (vsId) { const v = this.userById(vsId), d = b.claimed - (v ? this.brRank(v) : -1); if (d > 5) k *= Math.max(0.1, 1 - 0.15 * (d - 5)); }
    b.pts += Math.round(pts * k);
  };
  P.brView = function brView(viewer, u) {
    const b = this.brOf(u), i = b.claimed, cur = rankInfo(i), next = i + 1 < N ? NEED[i + 1] : null, prev = i >= 0 ? NEED[i] : 0;
    return { login: u.login, self: viewer.id === u.id, pts: b.pts, ...cur, next, prev, bonus: bonusAt(i), titles: TITLES, pending: rankIdx(b.pts), units: prizeUnits(u.race), pendingInfo: rankInfo(rankIdx(b.pts)), update: nextMonth(Date.now()),
      table: NEED.map((need, k) => ({ ...rankInfo(k), need, prize: prizeAt(k), bonus: bonusAt(k) })) };
  };
}

module.exports = { install, TITLES, NEED, rankIdx, rankInfo, bonusAt, prizeAt };
