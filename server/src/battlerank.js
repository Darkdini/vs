'use strict';
// «Боевой ранг», как в оригинале: 78 рангов — 13 званий по 6 ступеней (0–5 звёзд). Очки — за уничтоженных воинов противника
// (население погибших юнитов): в нападениях и набегах на игроков и в защите своего замка — полностью, лагеря разбойников — вполовину.
// Если противник слабее больше чем на 5 рангов — очков меньше (за избиение новичков ранг почти не растёт).
// За открытие каждого ранга — награда в Кладовую (ресурсы, на новом звании ещё уникальные воины и опыт генерала).
// Пока ранг держится — постоянный бонус: урон и защита воинов до +20%, прирост ресурсов до +30% (на Легенде 5★).

const TITLES = ['Новобранец', 'Рекрут', 'Боец', 'Воин', 'Чемпион', 'Полководец', 'Мастер войны', 'Вершитель', 'Завоеватель', 'Покоритель', 'Триумфатор', 'Герой', 'Легенда'];
// очки для ранга (как в оригинале)
const NEED = [20, 60, 80, 100, 100, 110, 320, 600, 1150, 1210, 1220, 1900, 4550, 4580, 4770, 5190, 7890, 11900, 20810, 25450, 27290, 27530, 28000, 28410,
  30330, 89420, 92280, 93520, 122850, 126550, 129120, 158500, 162700, 165360, 201440, 202940, 206620, 267010, 274530, 279430, 343060, 348880,
  354800, 522080, 531440, 551020, 579840, 602780, 617480, 637260, 653280, 671740, 687120, 720240, 744840, 764120, 781000, 799520, 816760, 835120,
  866080, 897560, 915800, 934760, 954160, 971620, 990920, 1128880, 1297360, 1306380, 1325940, 1329080, 1359080, 2786340, 3000000, 3500000, 4000000, 5000000];
const N = NEED.length, MAX_ATK = 0.20, MAX_PROD = 0.30, NPC_K = 0.5;

const rankIdx = (pts) => { let i = -1; while (i + 1 < N && pts >= NEED[i + 1]) i++; return i; }; // -1 — ещё без ранга
const rankInfo = (i) => (i < 0 ? { idx: -1, title: 'Без ранга', icon: 1, stars: 0 } : { idx: i, title: TITLES[Math.floor(i / 6)], icon: Math.floor(i / 6) + 1, stars: i % 6 });
const bonusAt = (i) => { const f = i < 0 ? 0 : (i + 1) / N; return { atk: +(MAX_ATK * f).toFixed(3), prod: +(MAX_PROD * f).toFixed(3) }; };
// награда за открытие ранга i
const prizeAt = (i) => {
  const t = Math.floor(i / 6), r = Math.round(200 * (1 + i) ** 1.35 / 10) * 10, rw = { wood: r, stone: r, iron: r, food: r };
  if (i % 6 === 0 && i > 0) { const k = 1 + t; rw.u = { inf: k, cav: k, mag: k }; rw.exp = 50 * (t + 1); }
  return rw;
};

function install(Game) {
  const P = Game.prototype;
  // при первом обращении — стартовые очки по уже набитой статистике боёв (без наград за прошлые ранги)
  P.brOf = function brOf(u) {
    if (!u.br) { const s = this.stats(u), pts = Math.round((s.kills || 0) + (s.defKills || 0)); u.br = { pts, claimed: rankIdx(pts) }; }
    return u.br;
  };
  P.brRank = function brRank(u) { return u ? rankIdx(this.brOf(u).pts) : -1; };
  P.brBonus = function brBonus(u) { return bonusAt(u ? this.brRank(u) : -1); };
  // очки за бой: who — кто получает, vs — противник (null для лагеря разбойников)
  P.brAdd = function brAdd(whoId, pts, vsId) {
    const u = this.userById(whoId); if (!u || u.bot || !(pts > 0)) return;
    let k = vsId === null ? NPC_K : 1;
    if (vsId) { const v = this.userById(vsId), d = this.brRank(u) - (v ? this.brRank(v) : -1); if (d > 5) k *= Math.max(0.1, 1 - 0.15 * (d - 5)); }
    const b = this.brOf(u); b.pts += Math.round(pts * k);
    const now = rankIdx(b.pts);
    while (b.claimed < now) { // все новые ранги — по награде
      b.claimed++; const i = b.claimed, inf = rankInfo(i), got = this.stashAdd(u, prizeAt(i));
      this.report(u.id, `Боевой ранг: ${inf.title} ${'★'.repeat(inf.stars) || '☆'} (${i + 1}-й)!`, [`Награда в Кладовую: ${got.join(', ')}.`, `Бонус ранга: урон и защита воинов +${Math.round(bonusAt(i).atk * 100)}%, прирост ресурсов +${Math.round(bonusAt(i).prod * 100)}%.`], 'rank');
    }
  };
  P.brView = function brView(viewer, u) {
    const b = this.brOf(u), i = rankIdx(b.pts), cur = rankInfo(i), next = i + 1 < N ? NEED[i + 1] : null, prev = i >= 0 ? NEED[i] : 0;
    return { login: u.login, self: viewer.id === u.id, pts: b.pts, ...cur, next, prev, bonus: bonusAt(i), titles: TITLES,
      table: NEED.map((need, k) => ({ ...rankInfo(k), need, prize: prizeAt(k), bonus: bonusAt(k) })) };
  };
}

module.exports = { install, TITLES, NEED, rankIdx, rankInfo, bonusAt, prizeAt };
