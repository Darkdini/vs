'use strict';
// «Боевой ранг», как в оригинале: 78 рангов — 13 званий по 6 ступеней (0–5 звёзд). Очки — за уничтоженных воинов противника
// (пятая часть населения погибших юнитов, PTS_K): в нападениях и набегах на игроков и в защите своего замка, лагеря разбойников — ещё вполовину.
// Раненые (ушли в Лазарет или выздоровели дома) — за четверть, мирные юниты (торговцы, путешественники, учёные, археологи, бунтари) —
// без очков: это считает army.js (rankPop). Если противник слабее больше чем на 5 рангов — очков меньше (за избиение новичков ранг
// почти не растёт); повторные бои с тем же игроком за сутки — каждый следующий вдвое меньше (против «качания» ранга вдвоём).
// Ранг растёт сразу, как набраны очки (звание видно в профиле и на значке); за каждый новый ранг — сундук с наградой:
// игрок забирает его сам в окне «Боевой ранг» (армия, ресурсы и опыт генерала — в Кладовую). На первом ранге каждого нового
// звания (7, 13, 19, …) — сундук звания: сверх обычного руны, а со звания «Чемпион» — нежить и артефакты (TITLE_PRIZE).
// Сезоны (с 29.10): раз в календарный месяц админ начинает новый сезон — у всех ранги и очки с нуля, сундуки за ранги можно
// получить снова; несобранные сундуки уходят в Кладовую, лучший ранг остаётся рекордом, топ-10 — в «Прошлых сезонах».
// Пока ранг держится — постоянный бонус: урон и защита воинов до +10% (с 21.10; было до +20% — по решению владельца),
// прирост ресурсов до +30% (на Легенде 5★).

const TITLES = ['Новобранец', 'Рекрут', 'Боец', 'Воин', 'Чемпион', 'Полководец', 'Мастер войны', 'Вершитель', 'Завоеватель', 'Покоритель', 'Триумфатор', 'Герой', 'Легенда'];
// очки для ранга (как в оригинале)
const NEED = [20, 60, 80, 100, 100, 110, 320, 600, 1150, 1210, 1220, 1900, 4550, 4580, 4770, 5190, 7890, 11900, 20810, 25450, 27290, 27530, 28000, 28410,
  30330, 89420, 92280, 93520, 122850, 126550, 129120, 158500, 162700, 165360, 201440, 202940, 206620, 267010, 274530, 279430, 343060, 348880,
  354800, 522080, 531440, 551020, 579840, 602780, 617480, 637260, 653280, 671740, 687120, 720240, 744840, 764120, 781000, 799520, 816760, 835120,
  866080, 897560, 915800, 934760, 954160, 971620, 990920, 1128880, 1297360, 1306380, 1325940, 1329080, 1359080, 2786340, 3000000, 3500000, 4000000, 5000000];
const N = NEED.length, MAX_ATK = 0.10, MAX_PROD = 0.30, NPC_K = 0.5;
// Очки — население уничтоженных воинов, без дневных ограничений; ранг — сразу по очкам (rankIdx). b.claimed — до какого ранга
// сундуки наград уже забраны (раньше ранг и награды обновлялись 1-го числа месяца — теперь сразу)
// PTS_K: очки за бой — пятая часть населения погибших (до 20.10 — всё население: ранг рос слишком быстро)
const PTS_K = 0.2, START_MAX = 11, DAY = 86400000;
const fmtN = (n) => Number(n).toLocaleString('ru-RU'); // 8 400, 14 000
// сезоны — по календарным месяцам Москвы
const MSK = 3 * 3600000, monthMsk = (t) => new Date(t + MSK).toISOString().slice(0, 7);
const nextMonthMsk = (t) => { const d = new Date(t + MSK); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - MSK; };
const fmtDay = (t) => new Date(t + MSK).toISOString().slice(0, 10).split('-').reverse().join('.'); // 01.11.2026

const rankIdx = (pts) => { let i = -1; while (i + 1 < N && pts >= NEED[i + 1]) i++; return i; }; // -1 — ещё без ранга
const rankInfo = (i) => (i < 0 ? { idx: -1, title: 'Без ранга', icon: 1, stars: 0 } : { idx: i, title: TITLES[Math.floor(i / 6)], icon: Math.floor(i / 6) + 1, stars: i % 6 });
const bonusAt = (i) => { const f = i < 0 ? 0 : (i + 1) / N; return { atk: +(MAX_ATK * f).toFixed(3), prod: +(MAX_PROD * f).toFixed(3) }; };
// награда за открытие ранга i: армия 15 × номер ранга (поровну пехота, конница, маги своей расы; до 21.10 — 150 × номер: армия
// из сундуков росла в разы быстрее обучения — по решению владельца в 10 раз меньше), ресурсы по 250 × номер ранга
// и опыт генерала 50 × номер ранга — за каждый ранг (было 100 × номер — вдвое меньше по решению владельца;
// ещё раньше, до 20.10, опыт давали только на новом звании: 50 × номер звания)
// сундук звания — на первом ранге каждого нового звания (7. Рекрут, 13. Боец, … 73. Легенда): сверх обычной награды руны,
// нежить (320 Скелет-латник, 321 Рыцарь смерти, 322 Лич, 323 Костяной дракон) и артефакты: 0 — обычный, 1 — редкий, 2 — легендарный.
// Ключ — номер звания (2 — Рекрут … 13 — Легенда). Картинка сундука в таблице — богаче с каждым званием (gfx/shop/chest2…7)
const TITLE_PRIZE = {
  2: { runes: 3 }, 3: { runes: 5 }, 4: { runes: 8, arts: [0] },
  5: { runes: 10, units: { 320: 5 }, arts: [0] }, 6: { runes: 12, units: { 320: 10 }, arts: [1] },
  7: { runes: 15, units: { 321: 5 }, arts: [1] }, 8: { runes: 20, units: { 321: 10, 322: 5 }, arts: [1] },
  9: { runes: 25, units: { 322: 10 }, arts: [2] }, 10: { runes: 30, units: { 323: 1 }, arts: [2] },
  11: { runes: 35, units: { 323: 2 }, arts: [2] }, 12: { runes: 40, units: { 323: 3 }, arts: [2, 2] },
  13: { runes: 50, units: { 323: 5 }, arts: [2, 2] },
};
const titleAt = (i) => (i > 0 && i % 6 === 0 ? TITLE_PRIZE[i / 6 + 1] || null : null); // i — индекс ранга (0 — 1-й ранг)
const chestImg = (i) => (titleAt(i) ? `shop/chest${Math.min(7, Math.floor((i / 6 + 1) / 2) + 1)}.png` : 'quest/chest.png');
const prizeAt = (i) => { const n = i + 1; return { army: 15 * n, res: 250 * n, exp: 50 * n, title: titleAt(i), chest: chestImg(i) }; };
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
    // 20.10 пороги ненадолго считались суммами стоимостей рангов (v4) — назад на прежние: ранг тот же, очки сверх его порога сохраняются
    if (u.br && u.br.v === 4) { let i = -1, sum = 0; while (i + 1 < N && u.br.pts >= sum + NEED[i + 1]) sum += NEED[++i]; if (i >= 0) u.br.pts = NEED[i] + (u.br.pts - sum); u.br.v = 3; }
    if (u.admin && u.br && (u.br.pts || u.br.claimed >= 0)) { u.br.pts = 0; u.br.claimed = -1; delete u.br.foes; } // у Советника ранга нет (с 24.10; набитый раньше — сброшен)
    if (!u.br || u.br.v !== 3) { const s = this.stats(u), pts = Math.min(NEED[START_MAX], Math.round((s.kills || 0) + (s.defKills || 0))); u.br = { v: 3, pts, claimed: rankIdx(pts) }; }
    return u.br;
  };
  // сундуков с наградой ждёт: новые ранги, за которые награда ещё не забрана
  P.brChests = function brChests(u) { const b = this.brOf(u); return Math.max(0, rankIdx(b.pts) - b.claimed); };
  // награда ранга → в Кладовую: армия поровну пехота / конница / маги расы игрока, ресурсы, опыт
  P.brPrize = function brPrize(u, i) {
    const p = prizeAt(i), units = {}, ids = prizeUnits(u.race), t = p.title || {};
    ids.forEach((id, k) => { units[id] = Math.floor(p.army / ids.length) + (k < p.army % ids.length ? 1 : 0); });
    for (const [id, n] of Object.entries(t.units || {})) units[id] = (units[id] || 0) + n; // нежить сундука звания
    return { army: p.army, res: p.res, exp: p.exp, runes: t.runes || 0, arts: t.arts || [], undead: t.units || {}, rw: { wood: p.res, stone: p.res, iron: p.res, food: p.res, units, exp: p.exp } };
  };
  // руны сундука звания: n штук, вид каждой случайный (как в сундуках «Сокровищ»)
  const giveRunes = (g, u, n) => {
    const { RUNE_KEYS } = require('./runes'), have = g.runesOf(u);
    for (let j = 0; j < n; j++) { const k = RUNE_KEYS[Math.floor(Math.random() * RUNE_KEYS.length)]; have[k] = (have[k] || 0) + 1; }
    return `${n} ${require('./words').plural(n, 'руна', 'руны', 'рун')}`;
  };
  // артефакт сундука звания — в Сокровищницу столицы; полна — разбит на осколки: ресурсы в Кладовую (как в сундуках «Сокровищ»)
  const giveArt = (g, u, rarity) => {
    const Ar = require('./army'), cap = g.castlesOf(u)[0], type = Ar.ART_BASIC[Math.floor(Math.random() * Ar.ART_BASIC.length)];
    const name = `«${Ar.ART_TYPES[type].name}» (${Ar.RARITY[rarity].name})`;
    if (cap) g.mil(cap);
    if (cap && cap.artifacts.length < g.bonus(cap).artStore) { cap.artifacts.push({ id: g.db.nextId++, type, rarity, active: false, found: Date.now() }); return `артефакт ${name} — в Сокровищнице`; }
    const k = Ar.ART_BREAK[rarity]; g.stashAdd(u, { wood: k, stone: k, iron: k, food: k });
    return `артефакт ${name} разбит на осколки (Сокровищница полна): по ${fmtN(k)} каждого ресурса — в Кладовую`;
  };
  // забрать сундуки наград: upto — до какого ранга (по умолчанию все открытые); награды — в Кладовую
  P.brClaim = function brClaim(u, upto) {
    if (this.db.brOff && !u.admin) return { error: 'Боевой ранг: идут технические работы.' };
    const b = this.brOf(u), to = rankIdx(b.pts), last = Math.min(to, Number.isInteger(upto) ? upto : to);
    if (last <= b.claimed) return { error: to > b.claimed ? 'Сначала заберите награды за прежние ранги.' : 'Новых наград нет — повышайте ранг в боях.' };
    let army = 0, res = 0, exp = 0; const extra = []; // сундуки званий: руны, нежить, артефакты
    for (let i = b.claimed + 1; i <= last; i++) {
      const p = this.brPrize(u, i); this.stashAdd(u, p.rw); army += p.army; res += p.res; exp += p.exp;
      if (!titleAt(i)) continue;
      const got = [], AU = require('./army').UNIT;
      if (p.runes) got.push(giveRunes(this, u, p.runes));
      for (const [id, k] of Object.entries(p.undead)) got.push(`${AU[id].name} ×${fmtN(k)}`);
      for (const r of p.arts) got.push(giveArt(this, u, r));
      extra.push(`Сундук звания «${TITLES[Math.floor(i / 6)]}»: ${got.join(', ')}.`);
    }
    const n = last - b.claimed; b.claimed = last; this.store.save();
    const inf = rankInfo(last);
    return { ok: true, msg: `${n > 1 ? `Награды за ${n} ${require('./words').plural(n, 'ранг', 'ранга', 'рангов')}` : `Награда за ранг ${last + 1}. ${inf.title}`} — в Кладовой: армия ${fmtN(army)}, ресурсы по ${fmtN(res)}${exp ? `, опыт генерала +${fmtN(exp)}` : ''}.${extra.length ? ` ${extra.join(' ')}` : ''}` };
  };
  P.brRank = function brRank(u) { return u && !u.admin ? rankIdx(this.brOf(u).pts) : -1; }; // ранг — сразу по очкам; у Советника (админа) ранга нет — и бонуса тоже
  P.brBonus = function brBonus(u) { return bonusAt(u ? this.brRank(u) : -1); };
  // очки за бой: who — кто получает, vs — противник (null для лагеря разбойников). С тем же игроком за сутки (b.foes — когда
  // были бои) каждый следующий бой вдвое меньше: второй — половина, третий — четверть (как опыт генерала, army.js battleExp)
  P.brAdd = function brAdd(whoId, pts, vsId, time = Date.now()) {
    if (this.db.brOff) return; /* боевой ранг выключен админом («технические работы») — очки не идут */
    const u = this.userById(whoId); if (!u || u.bot || u.admin || !(pts > 0)) return; // Советник (админ) ранга не набирает
    const b = this.brOf(u), was = rankIdx(b.pts);
    let k = PTS_K * (vsId === null ? NPC_K : 1);
    if (vsId) {
      const v = this.userById(vsId), d = was - (v ? this.brRank(v) : -1); if (d > 5) k *= Math.max(0.1, 1 - 0.15 * (d - 5));
      const foes = b.foes = b.foes || {}, key = String(vsId);
      for (const id of Object.keys(foes)) { foes[id] = foes[id].filter((t) => t > time - DAY); if (!foes[id].length) delete foes[id]; }
      k /= 2 ** (foes[key] || []).length; (foes[key] = foes[key] || []).push(time);
    }
    b.pts += Math.round(pts * k);
    const now = rankIdx(b.pts);
    if (now > was && this.event) { const inf = rankInfo(now); this.event(u.id, `⚔ Боевой ранг повышен: ${now + 1}. ${inf.title} ${'★'.repeat(inf.stars) || '☆'}! Заберите сундук с наградой в окне «Боевой ранг».`); }
  };
  P.brView = function brView(viewer, u) {
    const b = this.brOf(u), i = rankIdx(b.pts), cur = rankInfo(i), next = i + 1 < N ? NEED[i + 1] : null, prev = i >= 0 ? NEED[i] : 0, self = viewer.id === u.id, s = this.brSeason();
    // рекорд — лучший ранг за все сезоны (в прошлом сезоне или нынешний, если он выше)
    const best = b.best && b.best.idx >= i ? { ...rankInfo(b.best.idx), season: b.best.season } : i >= 0 ? { ...rankInfo(i), season: s.n } : null;
    return { login: u.login, self, pts: b.pts, ...cur, next, prev, bonus: bonusAt(i), titles: TITLES, claimed: b.claimed, chests: self ? Math.max(0, i - b.claimed) : 0, units: prizeUnits(u.race),
      season: { n: s.n, start: s.start }, best,
      table: NEED.map((need, k) => ({ ...rankInfo(k), need, prize: prizeAt(k), bonus: bonusAt(k) })) };
  };
  // вкладка «Топ»: игроки по очкам ранга (больше очков — выше), по 10 на страницу; без ботов, Советника (админ) и заблокированных;
  // me — место смотрящего (0 — ещё нет очков). Список пересчитывается не чаще раза в 15 с
  P.brRanked = function brRanked() {
    return Object.values(this.db.users).filter((u) => u.br && !u.bot && !u.admin && !u.banned)
      .map((u) => ({ u, pts: this.brOf(u).pts })).filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts || a.u.id - b.u.id);
  };
  P.brTop = function brTop(viewer, page) {
    const all = this.cached('brtop', 15000, () => this.brRanked()), s = this.brSeason();
    const pages = Math.max(1, Math.ceil(all.length / 10)), pg = Math.min(Math.max(0, Math.floor(Number(page)) || 0), pages - 1);
    return { page: pg, pages, total: all.length, me: all.findIndex((x) => x.u.id === viewer.id) + 1, season: { n: s.n, start: s.start }, hist: (this.db.brHistory || []).length,
      list: all.slice(pg * 10, pg * 10 + 10).map(({ u, pts }, k) => ({ place: pg * 10 + k + 1, id: u.id, login: u.login, pts, ...rankInfo(rankIdx(pts)) })) };
  };

  // ----- сезоны: раз в календарный месяц (по Москве) админ подводит итоги и начинает новый сезон -----
  P.brSeason = function brSeason() { if (!this.db.brSeason) this.db.brSeason = { n: 1, start: Date.now(), resetAt: 0 }; return this.db.brSeason; };
  // 0 — новый сезон начать можно; иначе — время, с которого можно (1-е число следующего месяца по Москве)
  P.brSeasonWait = function brSeasonWait(now = Date.now()) { const s = this.brSeason(); return !s.resetAt || monthMsk(s.resetAt) !== monthMsk(now) ? 0 : nextMonthMsk(s.resetAt); };
  // новый сезон: несобранные сундуки за ранги — в Кладовую (письмом — что пришло), лучший ранг — рекорд (b.best), топ-10 — в историю;
  // у всех очки и ранги с нуля, сундуки за ранги можно получить снова, бонус ранга — тоже с нуля
  P.brSeasonNew = function brSeasonNew(now = Date.now()) {
    const s = this.brSeason(), wait = this.brSeasonWait(now);
    if (wait) return { error: `Новый сезон в этом месяце уже начат (${fmtDay(s.resetAt)}). Следующий — с ${fmtDay(wait)}.` };
    const top = this.brRanked().slice(0, 10).map(({ u, pts }, k) => ({ place: k + 1, id: u.id, login: u.login, pts, ...rankInfo(rankIdx(pts)) }));
    const from = this.adminUser ? this.adminUser() : null;
    let players = 0, delivered = 0;
    for (const u of Object.values(this.db.users)) {
      if (u.bot || u.admin || u.nobody) continue;
      const b = this.brOf(u), i = rankIdx(b.pts);
      if (i > b.claimed) {
        const r = this.brClaim(u);
        if (r.ok) { delivered++; if (from) this.sendMail(from, u.login, 'Боевой ранг: новый сезон', `Сезон ${s.n} боевого ранга закончен — ранги начинаются заново.\n\nНесобранные награды за ранги уже в Кладовой:\n${r.msg}`); }
      }
      if (i >= 0 && (!b.best || i > b.best.idx)) b.best = { idx: i, season: s.n, at: now };
      if (b.pts > 0) players++;
      b.pts = 0; b.claimed = -1; delete b.foes;
      if (this.event) this.event(u.id, `⚔ Начался ${s.n + 1}-й сезон боевого ранга: у всех ранги с нуля, сундуки за ранги — снова. В бой!`);
    }
    (this.db.brHistory = this.db.brHistory || []).push({ n: s.n, start: s.start, end: now, players, top });
    if (this.db.brHistory.length > 24) this.db.brHistory.shift();
    this.db.brSeason = { n: s.n + 1, start: now, resetAt: now };
    this.cache = {}; this.store.save();
    return { ok: true, n: s.n, players, delivered, top };
  };
  // «Прошлые сезоны» во вкладке «Топ»: топ-10 каждого (новые сверху)
  P.brHistoryView = function brHistoryView() { return (this.db.brHistory || []).slice().reverse(); };
  // админка → «Мир» → «Боевой ранг: сезоны»
  P.brSeasonAdmin = function brSeasonAdmin(now = Date.now()) {
    const s = this.brSeason(), all = this.brRanked();
    const wait = this.brSeasonWait(now);
    return { off: !!this.db.brOff, n: s.n, start: s.start, resetAt: s.resetAt, wait, waitDay: wait ? fmtDay(wait) : '', players: all.length, // waitDay — дата по Москве
      top: all.slice(0, 3).map(({ u, pts }, k) => ({ place: k + 1, login: u.login, pts, ...rankInfo(rankIdx(pts)) })) };
  };
  const prevOp = P.adminOp;
  P.adminOp = function adminOp(user, op, arg = {}) {
    if (op !== 'brseason' && op !== 'brseasonnew' && op !== 'brtoggle') return prevOp.call(this, user, op, arg);
    if (!user || !user.admin) return { error: 'Нет прав.' };
    if (op === 'brtoggle') { // выключить / включить боевой ранг: выключен — очки не идут, сундуки не выдаются, игрокам — «технические работы»
      this.db.brOff = !this.db.brOff; this.store.save();
      return { ok: true, msg: this.db.brOff ? 'Боевой ранг выключен: очки не начисляются, игроки видят «технические работы».' : 'Боевой ранг снова включён.', data: this.brSeasonAdmin() };
    }
    if (op === 'brseasonnew') {
      const r = this.brSeasonNew(); if (r.error) return r;
      return { ok: true, data: { ...this.brSeasonAdmin(), msg: `Сезон ${r.n} подведён: в рейтинге было ${r.players}, несобранные сундуки отданы в Кладовую ${r.delivered} ${require('./words').plural(r.delivered, 'игроку', 'игрокам', 'игрокам')}. Начат сезон ${r.n + 1}.` } };
    }
    return { ok: true, data: this.brSeasonAdmin() };
  };
}

module.exports = { install, TITLES, NEED, TITLE_PRIZE, rankIdx, rankInfo, bonusAt, prizeAt };
