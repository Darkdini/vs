'use strict';
// «Боевой ранг», как в оригинале: 78 рангов — 13 званий по 6 ступеней (0–5 звёзд). Очки — за уничтоженных воинов противника
// (население погибших юнитов): в нападениях и набегах на игроков и в защите своего замка — полностью, лагеря разбойников — вполовину.
// Если противник слабее больше чем на 5 рангов — очков меньше (за избиение новичков ранг почти не растёт).
// Темп: не больше 10 000 очков и одного ранга в сутки (лишние очки не пропадают — ранг догонит в следующие дни).
// За открытие каждого ранга — награда в Кладовую (ресурсы, на новом звании ещё уникальные воины и опыт генерала).
// Пока ранг держится — постоянный бонус: урон и защита воинов до +20%, прирост ресурсов до +30% (на Легенде 5★).

const TITLES = ['Новобранец', 'Рекрут', 'Боец', 'Воин', 'Чемпион', 'Полководец', 'Мастер войны', 'Вершитель', 'Завоеватель', 'Покоритель', 'Триумфатор', 'Герой', 'Легенда'];
// очки для ранга (как в оригинале)
const NEED = [20, 60, 80, 100, 100, 110, 320, 600, 1150, 1210, 1220, 1900, 4550, 4580, 4770, 5190, 7890, 11900, 20810, 25450, 27290, 27530, 28000, 28410,
  30330, 89420, 92280, 93520, 122850, 126550, 129120, 158500, 162700, 165360, 201440, 202940, 206620, 267010, 274530, 279430, 343060, 348880,
  354800, 522080, 531440, 551020, 579840, 602780, 617480, 637260, 653280, 671740, 687120, 720240, 744840, 764120, 781000, 799520, 816760, 835120,
  866080, 897560, 915800, 934760, 954160, 971620, 990920, 1128880, 1297360, 1306380, 1325940, 1329080, 1359080, 2786340, 3000000, 3500000, 4000000, 5000000];
const N = NEED.length, MAX_ATK = 0.20, MAX_PROD = 0.30, NPC_K = 0.5;
// чтобы ранги не прокачали за пару дней: не больше DAY_PTS очков в сутки, новый ранг — не чаще раза в RANK_GAP дня,
// с одним и тем же противником засчитываются только PAIR_DAY боя в сутки; старая статистика даёт не выше START_MAX ранга.
// Так Боец — через ~2 месяца, Чемпион — ~3 месяца, Мастер войны — ~4 месяца, Триумфатор — ~6,5 месяца, Герой — ~9 месяцев.
const DAY_PTS = 5000, PAIR_DAY = 3, START_MAX = 11, RANK_GAP = 3, // новый ранг — не чаще раза в 3 дня
  MSK = 3 * 3600000;
const dayKey = (t) => new Date(t + MSK).toISOString().slice(0, 10);

const rankIdx = (pts) => { let i = -1; while (i + 1 < N && pts >= NEED[i + 1]) i++; return i; }; // -1 — ещё без ранга
const rankInfo = (i) => (i < 0 ? { idx: -1, title: 'Без ранга', icon: 1, stars: 0 } : { idx: i, title: TITLES[Math.floor(i / 6)], icon: Math.floor(i / 6) + 1, stars: i % 6 });
const bonusAt = (i) => { const f = i < 0 ? 0 : (i + 1) / N; return { atk: +(MAX_ATK * f).toFixed(3), prod: +(MAX_PROD * f).toFixed(3) }; };
// награда за открытие ранга i: армия 300 × номер ранга (поровну пехота, конница, маги своей расы) и ресурсы по 500 × номер ранга;
// на новом звании ещё опыт генерала
const prizeAt = (i) => { const n = i + 1; return { army: 300 * n, res: 500 * n, exp: i % 6 === 0 && i > 0 ? 100 * (Math.floor(i / 6) + 1) : 0 }; };
const ARMY_ROLES = ['atk_inf', 'light_cav', 'mage'];

function install(Game) {
  const P = Game.prototype;
  // при первом обращении — стартовые очки по уже набитой статистике боёв, но не выше Рекрута 5★ (без наград за прошлые ранги)
  P.brOf = function brOf(u, now = Date.now()) {
    if (!u.br || u.br.v !== 2) { const s = this.stats(u), pts = Math.min(NEED[START_MAX], Math.round((s.kills || 0) + (s.defKills || 0))); u.br = { v: 2, pts, claimed: rankIdx(pts), day: '', got: 0, pairs: {}, upDay: '' }; }
    const b = u.br, d = dayKey(now);
    if (b.day !== d) { b.day = d; b.got = 0; b.pairs = {}; }
    if (rankIdx(b.pts) > b.claimed && gapOk(b, d)) this.brUp(u, b, d); // накопленные очки — следующий ранг, когда прошло 3 дня
    return b;
  };
  const gapOk = (b, d) => !b.upDay || (Date.parse(d) - Date.parse(b.upDay)) / 86400000 >= RANK_GAP;
  // награда ранга → в Кладовую: армия поровну пехота / конница / маги расы игрока, ресурсы, опыт
  P.brPrize = function brPrize(u, i) {
    const p = prizeAt(i), list = require('./army').unitsForRace(u.race), units = {};
    const ids = ARMY_ROLES.map((r) => (list.find((x) => x.role === r) || {}).id).filter(Boolean);
    ids.forEach((id, k) => { units[id] = Math.floor(p.army / ids.length) + (k < p.army % ids.length ? 1 : 0); });
    return this.stashAdd(u, { wood: p.res, stone: p.res, iron: p.res, food: p.res, units, exp: p.exp });
  };
  P.brUp = function brUp(u, b, d) {
    b.claimed++; b.upDay = d;
    const i = b.claimed, inf = rankInfo(i), got = this.brPrize(u, i);
    this.report(u.id, `Боевой ранг: ${inf.title} ${'★'.repeat(inf.stars) || '☆'} (${i + 1}-й)!`, [`Награда в Кладовую: ${got.join(', ')}.`, `Бонус ранга: урон и защита воинов +${Math.round(bonusAt(i).atk * 100)}%, прирост ресурсов +${Math.round(bonusAt(i).prod * 100)}%.`, 'Новый ранг — не чаще раза в 3 дня.'], 'rank');
  };
  P.brRank = function brRank(u) { return u ? this.brOf(u).claimed : -1; };
  P.brBonus = function brBonus(u) { return bonusAt(u ? this.brRank(u) : -1); };
  // очки за бой: who — кто получает, vs — противник (null для лагеря разбойников)
  P.brAdd = function brAdd(whoId, pts, vsId, now = Date.now()) {
    const u = this.userById(whoId); if (!u || u.bot || !(pts > 0)) return;
    const b = this.brOf(u, now);
    let k = vsId === null ? NPC_K : 1;
    if (vsId) {
      b.pairs[vsId] = (b.pairs[vsId] || 0) + 1; if (b.pairs[vsId] > PAIR_DAY) return; // с одним противником — 3 боя в сутки
      const v = this.userById(vsId), d = b.claimed - (v ? this.brRank(v) : -1); if (d > 5) k *= Math.max(0.1, 1 - 0.15 * (d - 5));
    }
    const add = Math.min(Math.round(pts * k), DAY_PTS - b.got); if (add <= 0) return;
    b.got += add; b.pts += add;
    if (rankIdx(b.pts) > b.claimed && gapOk(b, b.day)) this.brUp(u, b, b.day);
  };
  P.brView = function brView(viewer, u) {
    const b = this.brOf(u), i = b.claimed, cur = rankInfo(i), next = i + 1 < N ? NEED[i + 1] : null, prev = i >= 0 ? NEED[i] : 0;
    return { login: u.login, self: viewer.id === u.id, pts: b.pts, ...cur, next, prev, bonus: bonusAt(i), titles: TITLES, today: b.got, dayMax: DAY_PTS, wait: rankIdx(b.pts) > b.claimed, gap: RANK_GAP,
      table: NEED.map((need, k) => ({ ...rankInfo(k), need, prize: prizeAt(k), bonus: bonusAt(k) })) };
  };
}

module.exports = { DAY_PTS, PAIR_DAY, install, TITLES, NEED, rankIdx, rankInfo, bonusAt, prizeAt };
