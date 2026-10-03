'use strict';
// «Биржа Замков» (Кабинет → Биржа): игрок выставляет на продажу свой замок (не столицу) за золото — цена от 300.
// Покупатель платит золото, продавец его получает, замок переходит к покупателю со зданиями, ресурсами, стеной и
// артефактами и армией, что стоит в замке (Замковая армия и отряды Штаба). Генерал один на все замки: замок с генералом продать нельзя — сначала его переводят подкреплением в другой свой замок.
// Продавать можно, когда из замка никто не в походе и не идёт обучение. Лот живёт 7 дней, его можно снять.

const MIN_PRICE = 300, MAX_PRICE = 1000000, MAX_LOTS = 3, LIFE = 7 * 86400000;

function install(Game) {
  const P = Game.prototype;
  const lots = (g) => { if (!g.db.castleMarket) g.db.castleMarket = []; return g.db.castleMarket; };
  const fmt = (n) => Number(n).toLocaleString('ru-RU');
  // лот действителен, пока замок есть и всё ещё у продавца, и не истёк срок
  P.marketSweep = function marketSweep(now = Date.now()) {
    const l = lots(this), keep = l.filter((x) => { const c = this.db.castles[x.castle]; return c && c.owner === x.seller && x.at + LIFE > now && this.userById(x.seller); });
    for (const x of l) if (!keep.includes(x) && this.userById(x.seller)) this.event(x.seller, `Биржа Замков: лот «${x.name}» снят${x.at + LIFE <= now ? ' — прошло 7 дней' : ''}.`);
    const changed = keep.length !== l.length; this.db.castleMarket = keep; if (changed) this.store.save();
    return keep;
  };
  // почему замок нельзя продать прямо сейчас (null — можно)
  const busy = (g, c) => {
    if ((c.armies || []).length) return 'из замка армии в походе — дождитесь возвращения';
    if ((c.training || []).length) return 'в замке идёт обучение войск';
    if ((c.expeds || []).length) return 'из замка ушла экспедиция';
    // генерал один на все замки: продавать можно только замок без генерала — сначала переведите его подкреплением в другой свой замок
    if (c.general && !c.general.dead) return 'в замке Ваш генерал — сначала переведите его в другой свой замок (Поход → Подкрепление с генералом)';
    if (c.general && c.general.dead) return 'в замке павший генерал — сначала воскресите его в Штабе и переведите в другой свой замок';
    if (g.castlesOf(g.userById(c.owner)).some((k) => (k.armies || []).some((a) => a.general && a.x === c.x && a.y === c.y))) return 'генерал идёт в этот замок подкреплением — дождитесь, пока он прибудет, и переведите его в другой замок';
    return null;
  };
  const info = (g, c) => {
    const lv = (id) => g.buildingLevel(c, id), B = require('./army').B;
    return { id: c.id, name: c.name, x: c.x, y: c.y, rating: g.rating(c), townhall: lv(B.TOWNHALL), wall: c.wall || 0,
      buildings: c.grid[0].filter((b) => b >= 0).length + c.grid[1].filter((b) => b >= 0).length,
      res: Object.fromEntries(['wood', 'stone', 'iron', 'food'].map((r) => [r, Math.floor(c.res[r] || 0)])), arts: (c.artifacts || []).length,
      army: Object.values(c.units || {}).reduce((a, n) => a + (n > 0 ? n : 0), 0) + (c.squads || []).reduce((a, q) => a + Object.values(q.units || {}).reduce((b, n) => b + (n > 0 ? n : 0), 0), 0) };
  };
  P.marketState = function marketState(u, now = Date.now()) {
    const l = this.marketSweep(now), cs = this.castlesOf(u);
    return {
      // подробности (армия, ресурсы, здания, стена, артефакты) — только тем, кому хватает золота на покупку; остальным — имя, место и рейтинг (они и так видны на карте)
      lots: l.filter((x) => x.seller !== u.id).map((x) => { const c = this.db.castles[x.castle], full = (u.gold || 0) >= x.price;
        return { id: x.id, price: x.price, at: x.at, seller: { id: x.seller, login: this.userById(x.seller).login }, hidden: !full,
          castle: full ? info(this, c) : { id: c.id, name: c.name, x: c.x, y: c.y, rating: this.rating(c) } }; }),
      mine: l.filter((x) => x.seller === u.id).map((x) => ({ id: x.id, price: x.price, at: x.at, exp: x.at + LIFE, castle: info(this, this.db.castles[x.castle]) })),
      // свои замки для продажи: все, кроме столицы и уже выставленных
      sell: cs.slice(1).filter((c) => !l.some((x) => x.castle === c.id)).map((c) => ({ ...info(this, c), busy: busy(this, c) })),
      gold: u.gold || 0, min: MIN_PRICE, castles: cs.length,
    };
  };
  P.marketSell = function marketSell(u, castleId, price, now = Date.now()) {
    const cs = this.castlesOf(u), c = cs.find((k) => k.id === Number(castleId));
    if (!c) return { error: 'Это не ваш замок.' };
    if (c === cs[0]) return { error: 'Столицу продать нельзя.' };
    price = Math.floor(Number(price));
    if (!(price >= MIN_PRICE)) return { error: `Цена — от ${MIN_PRICE} золота.` };
    if (price > MAX_PRICE) return { error: `Цена — не больше ${fmt(MAX_PRICE)} золота.` };
    const l = this.marketSweep(now);
    if (l.some((x) => x.castle === c.id)) return { error: 'Этот замок уже на Бирже.' };
    if (l.filter((x) => x.seller === u.id).length >= MAX_LOTS) return { error: `Не больше ${MAX_LOTS} замков на Бирже одновременно.` };
    const why = busy(this, c); if (why) return { error: `Сейчас продать нельзя: ${why}.` };
    l.push({ id: this.db.nextId++, castle: c.id, name: c.name, seller: u.id, price, at: now });
    this.store.save();
    return { ok: true, msg: `Замок «${c.name}» выставлен на Биржу за ${fmt(price)} золота.` };
  };
  P.marketCancel = function marketCancel(u, id) {
    const l = lots(this), x = l.find((k) => k.id === Number(id) && k.seller === u.id);
    if (!x) return { error: 'Лот не найден.' };
    this.db.castleMarket = l.filter((k) => k !== x); this.store.save();
    return { ok: true, msg: `Замок «${x.name}» снят с Биржи.` };
  };
  P.marketBuy = function marketBuy(u, id, now = Date.now()) {
    const l = this.marketSweep(now), x = l.find((k) => k.id === Number(id));
    if (!x) return { error: 'Замок уже продан или снят с Биржи.' };
    if (x.seller === u.id) return { error: 'Это Ваш замок.' };
    const c = this.db.castles[x.castle], seller = this.userById(x.seller);
    if ((u.gold || 0) < x.price) return { error: `Нужно ${fmt(x.price)} золота (у вас ${fmt(u.gold || 0)}).` };
    const sc = this.castlesOf(seller);
    if (sc[0] === c) return { error: 'Столицу продать нельзя — лот снят.' };
    this.tick(c); this.mil(c);
    const why = busy(this, c); if (why) return { error: `Сейчас купить нельзя: у продавца ${why}.` };
    // армия замка (Замковая армия и отряды в Штабе) уходит вместе с замком; генерала в замке нет (busy), павшие прежние генералы — в столицу продавца; чужие подкрепления — домой
    if ((c.deadGenerals || []).length) { const cap = sc[0]; cap.deadGenerals = [...(cap.deadGenerals || []), ...c.deadGenerals]; c.deadGenerals = []; }
    for (const gst of this.guestsOf(c)) this.goBack(gst.c, gst.a, now);
    c.general = null;
    // замок — покупателю
    seller.castleIds = sc.filter((k) => k !== c).map((k) => k.id);
    if (seller.castleId === c.id) seller.castleId = seller.castleIds[0];
    c.owner = u.id;
    u.castleIds = [...this.castlesOf(u).map((k) => k.id), c.id];
    this.db.castleMarket = l.filter((k) => k !== x);
    this.goldChange(u, -x.price, `Биржа замков: покупка «${c.name}» у ${seller.login}`);
    this.goldChange(seller, x.price, `Биржа замков: продажа «${c.name}» игроку ${u.login}`);
    this.addStat(u.id, 'capRating', this.rating(c)); // Развитие не учитывает рейтинг купленных замков
    this.report(seller.id, `Биржа Замков: замок «${c.name}» продан игроку ${u.login} за ${fmt(x.price)} золота`, [`Золото +${fmt(x.price)} — в Казне.`, 'Армия ушла вместе с замком.'], 'market');
    this.cache = {}; this.store.save();
    return { ok: true, msg: `Замок «${c.name}» теперь Ваш! Списано ${fmt(x.price)} золота.`, castle: { id: c.id, x: c.x, y: c.y }, seller };
  };
}

module.exports = { install, MIN_PRICE, MAX_LOTS };
