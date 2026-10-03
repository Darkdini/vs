'use strict';
// «Орёл-решка» (меню «Игры») — игра между игроками на ресурсы, не на золото.
// Игрок бросает вызов: ставит ресурс из замка, где сейчас находится (ставка сразу списывается), и выбирает сторону монеты.
// Вызов виден всем (или только названному игроку). Принявший ставит столько же того же ресурса и получает другую сторону;
// монета подбрасывается, победитель забирает оба банка в Кладовую. Вызов живёт сутки, потом ставка возвращается.
// Ограничения: ставка 100…1 000 (и не больше Склада), не больше 3 вызовов и 3 игр в сутки
// (чтобы не перекачивать ресурсы между своими аккаунтами). Выигрыши — в Зал Славы «Большой куш». Выигрыш, отменённая и истёкшая ставка — в Кладовую.

const MSK = 3 * 3600000, DAY = 86400000;
const dayKey = (t) => new Date(t + MSK).toISOString().slice(0, 10);
const RES4 = ['wood', 'stone', 'iron', 'food'];
const RES_NAME = { wood: 'дерева', stone: 'камня', iron: 'железа', food: 'еды' };
const SIDE = { eagle: 'Орёл', tails: 'Решка' };
const MIN_BET = 100, MAX_BET = 1000, MAX_OPEN = 3, DAY_BETS = 3, DAY_GAMES = 3, PAIR_DAY = 3, LIFE = DAY;

function install(Game) {
  const P = Game.prototype;
  const bets = (g) => { if (!g.db.coinBets) g.db.coinBets = []; return g.db.coinBets; };
  const day = (u, now) => { const d = dayKey(now); if (!u.coin || u.coin.day !== d) u.coin = { day: d, bets: 0, games: 0, pairs: {} }; return u.coin; };
  const fmt = (n) => Number(n).toLocaleString('ru-RU');
  // возврат ставки — в Кладовую (как и выигрыш)
  const back = (g, u, b) => { g.stashAdd(u, { [b.res]: b.amount }); return `${fmt(b.amount)} ${RES_NAME[b.res]} — в Кладовой`; };
  const refund = (g, b, why) => { const u = g.userById(b.from); if (!u) return; g.event(u.id, `Орёл-решка: ${why} — ${back(g, u, b)}.`); };
  P.coinSweep = function coinSweep(now = Date.now()) {
    const l = bets(this), keep = [];
    for (const b of l) if (b.at + LIFE <= now || !this.userById(b.from)) { refund(this, b, 'вызов никто не принял за сутки'); } else keep.push(b);
    if (keep.length !== l.length) { this.db.coinBets = keep; this.store.save(); }
  };
  const row = (g, b, viewer) => { const f = g.userById(b.from), t = b.to ? g.userById(b.to) : null;
    return { id: b.id, from: { id: f.id, login: f.login }, to: t ? { id: t.id, login: t.login } : null, res: b.res, amount: b.amount, side: b.side, at: b.at, exp: b.at + LIFE, mine: b.from === viewer.id }; };
  P.coinState = function coinState(u, castle, now = Date.now()) {
    this.coinSweep(now);
    const d = day(u, now), cap = castle ? this.capacity(castle) : {};
    const l = bets(this).filter((b) => !b.to || b.to === u.id || b.from === u.id);
    return { open: l.filter((b) => b.from !== u.id).map((b) => row(this, b, u)), mine: l.filter((b) => b.from === u.id).map((b) => row(this, b, u)),
      history: (u.coinLog || []).slice(-15).reverse(), left: { bets: Math.max(0, DAY_BETS - d.bets), games: Math.max(0, DAY_GAMES - d.games) },
      have: castle ? Object.fromEntries(RES4.map((r) => [r, Math.floor(castle.res[r] || 0)])) : {}, max: castle ? Object.fromEntries(RES4.map((r) => [r, Math.floor(cap[r] || 0)])) : {},
      min: MIN_BET, maxBet: MAX_BET, castle: castle ? castle.name : '' };
  };
  P.coinBet = function coinBet(u, castle, res, amount, side, toLogin, now = Date.now()) {
    if (!castle || castle.owner !== u.id) return { error: 'Это не ваш замок.' };
    if (!RES4.includes(res)) return { error: 'Выберите ресурс.' };
    if (!SIDE[side]) return { error: 'Выберите сторону монеты: Орёл или Решка.' };
    amount = Math.floor(Number(amount));
    this.tick(castle);
    const cap = Math.floor(this.capacity(castle)[res]);
    if (!(amount >= MIN_BET)) return { error: `Ставка — не меньше ${MIN_BET}.` };
    if (amount > MAX_BET) return { error: `Ставка — не больше ${fmt(MAX_BET)}.` };
    if (amount > cap) return { error: `Ставка — не больше вместимости Склада (${fmt(cap)}).` };
    if ((castle.res[res] || 0) < amount) return { error: `В замке «${castle.name}» не хватает ${RES_NAME[res]} (есть ${fmt(Math.floor(castle.res[res] || 0))}).` };
    let to = null;
    if (toLogin && String(toLogin).trim()) {
      to = this.db.users[String(toLogin).trim()];
      if (!to || to.bot) return { error: 'Игрок не найден.' };
      if (to.id === u.id) return { error: 'С собой не сыграть.' };
    }
    this.coinSweep(now);
    const d = day(u, now);
    if (d.bets >= DAY_BETS) return { error: `Не больше ${DAY_BETS} вызовов в сутки.` };
    if (bets(this).filter((b) => b.from === u.id).length >= MAX_OPEN) return { error: `Не больше ${MAX_OPEN} открытых вызовов одновременно.` };
    castle.res[res] -= amount; d.bets++;
    const b = { id: this.db.nextId++, from: u.id, to: to ? to.id : null, res, amount, side, at: now, castle: castle.id };
    bets(this).push(b);
    if (to) this.event(to.id, `🪙 ${u.login} вызывает Вас в «Орёл-решку»: ${fmt(amount)} ${RES_NAME[res]}! Игры → Орёл-решка.`);
    this.store.save();
    return { ok: true, msg: `Вызов брошен: ${fmt(amount)} ${RES_NAME[res]}, Вы — ${SIDE[side]}.${to ? ` Ждём ответа ${to.login}.` : ' Ждём соперника.'}`, to };
  };
  P.coinCancel = function coinCancel(u, id) {
    const l = bets(this), b = l.find((x) => x.id === Number(id) && x.from === u.id);
    if (!b) return { error: 'Вызов не найден — возможно, его уже приняли.' };
    this.db.coinBets = l.filter((x) => x !== b);
    const msg = back(this, u, b); this.store.save();
    return { ok: true, msg: `Вызов отменён: ${msg}.` };
  };
  P.coinAccept = function coinAccept(u, castle, id, now = Date.now(), flip = Math.random()) {
    if (!castle || castle.owner !== u.id) return { error: 'Это не ваш замок.' };
    this.coinSweep(now);
    const l = bets(this), b = l.find((x) => x.id === Number(id));
    if (!b) return { error: 'Вызов уже принят или отменён.' };
    if (b.from === u.id) return { error: 'Это Ваш вызов.' };
    if (b.to && b.to !== u.id) return { error: 'Этот вызов брошен другому игроку.' };
    const f = this.userById(b.from), du = day(u, now), df = day(f, now);
    if (du.games >= DAY_GAMES) return { error: `Не больше ${DAY_GAMES} игр в сутки — приходите завтра.` };
    if (df.games >= DAY_GAMES) return { error: `${f.login} уже сыграл(а) ${DAY_GAMES} раза сегодня — вызов ждёт до завтра.` };
    if ((du.pairs[f.id] || 0) >= PAIR_DAY) return { error: `С игроком ${f.login} — не больше ${PAIR_DAY} игр в сутки.` };
    this.tick(castle);
    if ((castle.res[b.res] || 0) < b.amount) return { error: `Нужно ${fmt(b.amount)} ${RES_NAME[b.res]} в замке «${castle.name}» (есть ${fmt(Math.floor(castle.res[b.res] || 0))}).` };
    castle.res[b.res] -= b.amount;
    this.db.coinBets = l.filter((x) => x !== b);
    const coin = flip < 0.5 ? 'eagle' : 'tails', win = coin === b.side ? f : u, lose = win === f ? u : f, pot = b.amount * 2;
    this.stashAdd(win, { [b.res]: pot });
    du.games++; df.games++; du.pairs[f.id] = (du.pairs[f.id] || 0) + 1; df.pairs[u.id] = (df.pairs[u.id] || 0) + 1;
    this.addStat(win.id, 'jackpot', b.amount); this.addStat(u.id, 'gamble', 1); this.addStat(f.id, 'gamble', 1);
    const log = (x, other, won) => { (x.coinLog = x.coinLog || []).push({ at: now, vs: other.login, vsId: other.id, res: b.res, amount: b.amount, coin, won }); if (x.coinLog.length > 30) x.coinLog.splice(0, x.coinLog.length - 30); };
    log(win, lose, true); log(lose, win, false);
    this.event(f.id, `🪙 ${u.login} принял(а) Ваш вызов: выпал ${SIDE[coin]} — ${win === f ? `Вы выиграли ${fmt(pot)} ${RES_NAME[b.res]} (в Кладовой)!` : `Вы проиграли ${fmt(b.amount)} ${RES_NAME[b.res]}.`}`);
    this.store.save();
    return { ok: true, coin, won: win === u, res: b.res, amount: b.amount, pot, vs: f.login, side: b.side === 'eagle' ? 'tails' : 'eagle', other: f };
  };
}

module.exports = { install, MAX_BET, MIN_BET, DAY_BETS, DAY_GAMES, PAIR_DAY, MAX_OPEN };
