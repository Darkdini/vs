'use strict';
// «Боевой ранг», как в оригинале: 78 рангов — 13 званий по 6 ступеней (0–5 звёзд). Очки — за уничтоженных воинов противника
// (население погибших юнитов): в нападениях и набегах на игроков и в защите своего замка — полностью, лагеря разбойников — вполовину.
// Если противник слабее больше чем на 5 рангов — очков меньше (за избиение новичков ранг почти не растёт).
// Ранг растёт сразу, как набраны очки (звание видно в профиле и на значке); за каждый новый ранг — сундук с наградой:
// игрок забирает его сам в окне «Боевой ранг» (армия, ресурсы, на новом звании опыт генерала — в Кладовую).
// Пока ранг держится — постоянный бонус: урон и защита воинов до +20%, прирост ресурсов до +30% (на Легенде 5★).

const TITLES = ['Новобранец', 'Рекрут', 'Боец', 'Воин', 'Чемпион', 'Полководец', 'Мастер войны', 'Вершитель', 'Завоеватель', 'Покоритель', 'Триумфатор', 'Герой', 'Легенда'];
// стоимость каждого ранга (как в оригинале): чтобы взять следующий ранг, нужно набрать ещё столько очков; порог ранга — сумма (CUM).
// До 20.10 эти числа по ошибке служили самими порогами — звёзды внутри звания доставались почти даром (+240 очков вместо 27 530)
const NEED = [20, 60, 80, 100, 100, 110, 320, 600, 1150, 1210, 1220, 1900, 4550, 4580, 4770, 5190, 7890, 11900, 20810, 25450, 27290, 27530, 28000, 28410,
  30330, 89420, 92280, 93520, 122850, 126550, 129120, 158500, 162700, 165360, 201440, 202940, 206620, 267010, 274530, 279430, 343060, 348880,
  354800, 522080, 531440, 551020, 579840, 602780, 617480, 637260, 653280, 671740, 687120, 720240, 744840, 764120, 781000, 799520, 816760, 835120,
  866080, 897560, 915800, 934760, 954160, 971620, 990920, 1128880, 1297360, 1306380, 1325940, 1329080, 1359080, 2786340, 3000000, 3500000, 4000000, 5000000];
const N = NEED.length, MAX_ATK = 0.20, MAX_PROD = 0.30, NPC_K = 0.5;
const CUM = NEED.reduce((a, x) => { a.push((a.length ? a[a.length - 1] : 0) + x); return a; }, []); // пороги рангов: 20, 80, 160, 260…
// Очки — население уничтоженных воинов, без дневных ограничений; ранг — сразу по очкам (rankIdx). b.claimed — до какого ранга
// сундуки наград уже забраны (раньше ранг и награды обновлялись 1-го числа месяца — теперь сразу)
const PTS_K = 1, START_MAX = 11;
const fmtN = (n) => Number(n).toLocaleString('ru-RU'); // 8 400, 14 000

const rankIdx = (pts) => { let i = -1; while (i + 1 < N && pts >= CUM[i + 1]) i++; return i; }; // -1 — ещё без ранга
const oldIdx = (pts) => { let i = -1; while (i + 1 < N && pts >= NEED[i + 1]) i++; return i; }; // прежние пороги — только для перехода (brOf)
const rankInfo = (i) => (i < 0 ? { idx: -1, title: 'Без ранга', icon: 1, stars: 0 } : { idx: i, title: TITLES[Math.floor(i / 6)], icon: Math.floor(i / 6) + 1, stars: i % 6 });
const bonusAt = (i) => { const f = i < 0 ? 0 : (i + 1) / N; return { atk: +(MAX_ATK * f).toFixed(3), prod: +(MAX_PROD * f).toFixed(3) }; };
// награда за открытие ранга i: армия 150 × номер ранга (поровну пехота, конница, маги своей расы) и ресурсы по 250 × номер ранга;
// на новом звании ещё опыт генерала 50 × номер звания (все награды — вдвое меньше прежних 300 / 500 / 100)
const prizeAt = (i) => { const n = i + 1; return { army: 150 * n, res: 250 * n, exp: i % 6 === 0 && i > 0 ? 50 * (Math.floor(i / 6) + 1) : 0 }; };
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
  P.brOf = function brOf(u) {
    // переход на правильные пороги (v4): набранный ранг остаётся, очки сверх его порога идут в счёт следующего ранга
    if (u.br && u.br.v === 3) { const i = oldIdx(u.br.pts); if (i >= 0) u.br.pts = CUM[i] + (u.br.pts - NEED[i]); u.br.v = 4; }
    if (!u.br || u.br.v !== 4) { const s = this.stats(u), pts = Math.min(CUM[START_MAX], Math.round((s.kills || 0) + (s.defKills || 0))); u.br = { v: 4, pts, claimed: rankIdx(pts) }; }
    return u.br;
  };
  // сундуков с наградой ждёт: новые ранги, за которые награда ещё не забрана
  P.brChests = function brChests(u) { const b = this.brOf(u); return Math.max(0, rankIdx(b.pts) - b.claimed); };
  // награда ранга → в Кладовую: армия поровну пехота / конница / маги расы игрока, ресурсы, опыт
  P.brPrize = function brPrize(u, i) {
    const p = prizeAt(i), units = {}, ids = prizeUnits(u.race);
    ids.forEach((id, k) => { units[id] = Math.floor(p.army / ids.length) + (k < p.army % ids.length ? 1 : 0); });
    return { army: p.army, res: p.res, exp: p.exp, rw: { wood: p.res, stone: p.res, iron: p.res, food: p.res, units, exp: p.exp } };
  };
  // забрать сундуки наград: upto — до какого ранга (по умолчанию все открытые); награды — в Кладовую
  P.brClaim = function brClaim(u, upto) {
    const b = this.brOf(u), to = rankIdx(b.pts), last = Math.min(to, Number.isInteger(upto) ? upto : to);
    if (last <= b.claimed) return { error: to > b.claimed ? 'Сначала заберите награды за прежние ранги.' : 'Новых наград нет — повышайте ранг в боях.' };
    let army = 0, res = 0, exp = 0;
    for (let i = b.claimed + 1; i <= last; i++) { const p = this.brPrize(u, i); this.stashAdd(u, p.rw); army += p.army; res += p.res; exp += p.exp; }
    const n = last - b.claimed; b.claimed = last; this.store.save();
    const inf = rankInfo(last);
    return { ok: true, msg: `${n > 1 ? `Награды за ${n} ${require('./words').plural(n, 'ранг', 'ранга', 'рангов')}` : `Награда за ранг ${last + 1}. ${inf.title}`} — в Кладовой: армия ${fmtN(army)}, ресурсы по ${fmtN(res)}${exp ? `, опыт генерала +${fmtN(exp)}` : ''}.` };
  };
  P.brRank = function brRank(u) { return u ? rankIdx(this.brOf(u).pts) : -1; }; // ранг — сразу по очкам
  P.brBonus = function brBonus(u) { return bonusAt(u ? this.brRank(u) : -1); };
  // очки за бой: who — кто получает, vs — противник (null для лагеря разбойников)
  P.brAdd = function brAdd(whoId, pts, vsId) {
    const u = this.userById(whoId); if (!u || u.bot || !(pts > 0)) return;
    const b = this.brOf(u), was = rankIdx(b.pts);
    let k = PTS_K * (vsId === null ? NPC_K : 1);
    if (vsId) { const v = this.userById(vsId), d = was - (v ? this.brRank(v) : -1); if (d > 5) k *= Math.max(0.1, 1 - 0.15 * (d - 5)); }
    b.pts += Math.round(pts * k);
    const now = rankIdx(b.pts);
    if (now > was && this.event) { const inf = rankInfo(now); this.event(u.id, `⚔ Боевой ранг повышен: ${now + 1}. ${inf.title} ${'★'.repeat(inf.stars) || '☆'}! Заберите сундук с наградой в окне «Боевой ранг».`); }
  };
  P.brView = function brView(viewer, u) {
    const b = this.brOf(u), i = rankIdx(b.pts), cur = rankInfo(i), next = i + 1 < N ? CUM[i + 1] : null, prev = i >= 0 ? CUM[i] : 0, self = viewer.id === u.id;
    return { login: u.login, self, pts: b.pts, ...cur, next, prev, bonus: bonusAt(i), titles: TITLES, claimed: b.claimed, chests: self ? Math.max(0, i - b.claimed) : 0, units: prizeUnits(u.race),
      table: CUM.map((need, k) => ({ ...rankInfo(k), need, prize: prizeAt(k), bonus: bonusAt(k) })) };
  };
}

module.exports = { install, TITLES, NEED, CUM, rankIdx, rankInfo, bonusAt, prizeAt };
