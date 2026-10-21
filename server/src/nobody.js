'use strict';
// «Забросить замки» (Админ-панель → Игрок): игрок давно не играет — вместо бана его замки становятся ничьими и их можно захватить,
// а сам игрок исчезает отовсюду, как при «Удалить» (admin.js purgeUser): рейтинги, альянс, друзья, переписка, отчёты.
// Ничейные замки («Ничейный замок») держит служебный бот «Ничейные земли» (u.nobody): столицы у него нет — захватить можно любой замок, как обычный:
// победные нападения с Бунтарями, бунт +15% за каждое (army.js), нужна лояльность населения (royal.js).
// Армия остаётся и защищает замок (походы сразу возвращаются домой); генералы, стройки и очереди пропадают вместе с игроком;
// постройки и ресурсы остаются, ресурсы растут как обычно.
// Раса замка остаётся прежней (castle.abandon.race). Отчёты, лента друзей и лояльность ничейному владельцу не ведутся.
const NOBODY = 'Ничейные земли', CASTLE = 'Ничейный замок', NO_OWNER = 'Ничейные земли — у них нет хозяина.';
const RES4 = ['wood', 'stone', 'iron', 'food'];
// что админ может делать с «Ничейными землями»: смотреть, осматривать замки, убрать или сбросить ничейный замок
const NOBODY_OPS = ['player', 'inspect', 'armyinfo', 'castledel', 'castlereset'];

function install(Game) {
  const P = Game.prototype;
  // служебный владелец ничейных замков — создаётся при первом «Забросить»; ник с пробелом игроку не взять (badnames.js)
  P.nobodyUser = function nobodyUser() {
    const had = this.userById(this.db.nobodyId); if (had && had.nobody) return had;
    let login = NOBODY; for (let k = 2; Object.prototype.hasOwnProperty.call(this.db.users, login); k++) login = `${NOBODY} ${k}`;
    const u = { id: this.db.nextId++, login, pass: 'bot:-', race: 'humans', created: Date.now(), castleId: null, castleIds: [], bot: true, nobody: true, royal: 0, royalAt: Date.now() };
    this.db.users[login] = u; this.byId.set(u.id, u); this.db.nobodyId = u.id;
    return u;
  };
  P.isNobody = function isNobody(u) { if (u && typeof u !== 'object') u = this.userById(Number(u)); return !!(u && u.nobody); };

  // замки игрока — ничьи (армия остаётся их защищать, генерал пропадает), игрок — удалён отовсюду. Недострои (Освоение) просто исчезают.
  // Возвращает, сколько замков заброшено
  P.abandonUser = function abandonUser(t, now = Date.now()) {
    const nb = this.nobodyUser(), list = [];
    for (const c of this.castlesOf(t)) {
      if (c.site) { this.dropCastle(c, now); continue; }
      for (const g of this.guestsOf(c)) { // чужие подкрепления — домой
        this.goBack(g.c, g.a, now);
        this.report(g.c.owner, `Подкрепление возвращается из ${c.name}`, [`Хозяин замка «${c.name}» (${c.x}:${c.y}) пропал, замок теперь ничей — Ваша армия возвращается домой.`], 'reinforce');
      }
      if (this.smithAbandon) this.smithAbandon(c, t);
      this.tick(c); this.mil(c);
      c.abandon = { at: now, login: t.login, race: t.race, name: c.name };
      c.owner = nb.id; c.name = CASTLE;
      for (const a of c.armies) { // походы — сразу домой: войска в замок, груз торговцев — на склад (как при отзыве)
        for (const [id, n] of Object.entries(a.units || {})) if (n > 0) c.units[id] = (c.units[id] || 0) + n;
        if (a.cargo) for (const r of RES4) c.res[r] += a.cargo[r] || 0;
      }
      c.armies = []; c.general = null; c.deadGenerals = []; c.training = []; c.research = null; c.queue = []; c.expeds = []; c.upJobs = {}; // генерал — пропал
      delete c.wounded; delete c.healing; delete c.calmJob; delete c.shieldUntil; delete c.forgeJob; delete c.magicJob; delete c.magicJobs; // купол снят — замок можно брать сразу
      nb.castleIds.push(c.id); list.push({ x: c.x, y: c.y });
    }
    t.castleIds = []; t.castleId = null;
    this.purgeUser(t, now);
    const log = (this.db.abandoned = this.db.abandoned || []); log.push({ at: now, login: t.login, castles: list }); if (log.length > 50) log.splice(0, log.length - 50);
    this.store.save();
    return list.length;
  };
  // для админки: ничейные замки на карте и кого забросили
  P.nobodyView = function nobodyView() {
    const nb = this.userById(this.db.nobodyId), cs = nb && nb.nobody ? this.castlesOf(nb) : [];
    return { castles: cs.map((c) => ({ x: c.x, y: c.y, rating: this.rating(c), riot: Math.round(100 - (c.loyalty ?? 100)), was: (c.abandon || {}).login || '', at: (c.abandon || {}).at || 0 })),
      log: (this.db.abandoned || []).slice(-10).reverse() };
  };

  // у ничейного владельца нет столицы: захватить можно любой его замок
  const capital = P.isCapital;
  P.isCapital = function isCapital(castle) { const u = this.userById(castle.owner); return !!u && !u.nobody && capital.call(this, castle); };
  // ничейный замок — прежней расы (вид на карте, воины в отчётах)
  const baseRace = P.raceOf;
  P.raceOf = function raceOf(castle) { const u = this.userById(castle.owner); return u && u.nobody && castle.abandon ? castle.abandon.race : baseRace.call(this, castle); };
  // захватили ничейный замок — он как любой захваченный (имя прежнее, хозяин может переименовать); в отчёте — его прежняя раса
  const capture = P.captureCastle;
  P.captureCastle = function captureCastle(att, castle) {
    const ab = this.isNobody(castle.owner) && castle.abandon, r = capture.call(this, att, castle);
    if (ab) { r.prevRace = ab.race; delete castle.abandon; }
    return r;
  };
  // ничейному владельцу — ни отчётов (их общий лимит — 2000 на сервер), ни ленты друзей, ни лояльности населения
  const baseReport = P.report;
  P.report = function report(userId, ...rest) { if (this.isNobody(userId)) return; return baseReport.call(this, userId, ...rest); };
  const feed = P.friendFeed;
  P.friendFeed = function friendFeed(uid, ...rest) { if (this.isNobody(uid)) return; return feed.call(this, uid, ...rest); };
  const royal = P.royalTick;
  P.royalTick = function royalTick(user, ...rest) { if (user && user.nobody) return 0; return royal.call(this, user, ...rest); };
  // в ничейный замок не везут ресурсы и не шлют подкрепление (его можно только захватить)
  const nobodyAt = (g, x, y) => { const t = g.castleAt(Math.round(Number(x)), Math.round(Number(y))); return !!t && g.isNobody(t.owner); };
  const trade = P.sendTrade;
  P.sendTrade = function sendTrade(castle, o = {}) { if (nobodyAt(this, o.x, o.y)) return { error: 'Замок ничей — везти ресурсы некому.' }; return trade.call(this, castle, o); };
  const baseSend = P.sendArmy;
  P.sendArmy = function sendArmy(castle, o = {}) {
    const nb = nobodyAt(this, o.x, o.y);
    if (o.mission === 'reinforce' && nb) return { error: 'Замок ничей — подкрепление в него не отправить. Его можно захватить: нападения с Бунтарями.' };
    const me = nb && this.userById(castle.owner), off = me && me.newbieOff, r = baseSend.call(this, castle, o);
    if (me && !off && me.newbieOff) { delete me.newbieOff; this.cache = {}; } // нападение на ничейный замок — как на лагерь: защита новичка остаётся
    return r;
  };
  const loss = P.royalLoss;
  P.royalLoss = function royalLoss(user, ...rest) { if (user && user.nobody) return; return loss.call(this, user, ...rest); };
  // науки ничейного замка — какие были у прежнего хозяина (у «Ничейных земель» общих наук нет)
  const baseSci = P.sciOf;
  P.sciOf = function sciOf(castle) { const u = this.userById(castle.owner); if (u && u.nobody) return castle.sciences || { eco: 0, eng: 0, fhi: 0, war: 0 }; return baseSci.call(this, castle); };
  // шли в замок, а он стал ничьим: торговцы везут груз назад (сразу на склад, как при отзыве), подкрепление возвращается
  const baseArrive = P.arrive;
  P.arrive = function arrive(c, a, t) {
    const target = (a.mission === 'trade' || a.mission === 'reinforce') && this.castleAt(a.x, a.y);
    if (target && target.owner !== c.owner && this.isNobody(target.owner)) {
      if (a.cargo) { for (const r of RES4) c.res[r] += a.cargo[r] || 0; a.cargo = null; }
      this.report(c.owner, `Поход в ${target.name} отменён`, [`Замок ${target.x}:${target.y} ничей — хозяин его забросил. ${a.mission === 'trade' ? 'Торговцы вернули груз на склад.' : 'Подкрепление возвращается домой.'}`], a.mission === 'trade' ? 'trade' : 'reinforce');
      return this.goBack(c, a, t);
    }
    return baseArrive.call(this, c, a, t);
  };
  // письма, подарки, премиум, «Орёл-решка», ЗАГС, дружба — ничейным землям нельзя (privacy.js)
  const reach = P.canReach;
  P.canReach = function canReach(from, to, ...rest) { if (to && to.nobody) return NO_OWNER; return reach.call(this, from, to, ...rest); };
  const rep = P.giveReputation;
  P.giveReputation = function giveReputation(from, toId, ...rest) { if (this.isNobody(toId)) return { error: NO_OWNER }; return rep.call(this, from, toId, ...rest); };
  // очки боевого ранга за гарнизон ничейного замка — как за лагерь (battlerank.js NPC_K, без поправки на ранг соперника):
  // иначе новичок низкого ранга, разбив большой гарнизон, сразу получал десятки тысяч очков
  const baseBr = P.brAdd;
  P.brAdd = function brAdd(whoId, pts, vsId, ...rest) { return baseBr.call(this, whoId, pts, vsId && this.isNobody(vsId) ? null : vsId, ...rest); };
  // рейтинг игроков — без ничейного владельца
  const board = P.leaderboard;
  P.leaderboard = function leaderboard() { return board.call(this).filter((x) => !x.u.nobody); };

  // команды админ-панели: abandon (над игроком arg.login), nobodyview (список ничейных замков)
  const prev = P.adminOp;
  P.adminOp = function adminOp(user, op, arg = {}) {
    if (op !== 'abandon' && op !== 'nobodyview') {
      const k0 = String(arg.login || '').trim(), t0 = k0 && Object.prototype.hasOwnProperty.call(this.db.users, k0) ? this.db.users[k0] : null;
      if (t0 && t0.nobody && user && user.admin) {
        if (!NOBODY_OPS.includes(op)) return { error: 'Это «Ничейные земли» — служебный владелец ничейных замков: можно только смотреть, осматривать, сбросить или убрать замок.' };
        if (op === 'castledel') { // ничейный замок убрать с карты можно и последний
          const c = this.castlesOf(t0).find((x) => x.id === Number(arg.cid)); if (!c) return { error: 'Замок не найден.' };
          this.dropCastle(c); t0.castleIds = t0.castleIds.filter((id) => id !== c.id); this.cache = {}; this.store.save();
          return { ok: true, msg: `Ничейный замок ${c.x}:${c.y} убран с карты.` };
        }
        if (op === 'castlereset') { // сброшенный ничейный замок остаётся прежней расы
          const old = this.castlesOf(t0).find((x) => x.id === Number(arg.cid)), ab = old && old.abandon, r = prev.call(this, user, op, arg);
          const n = ab && this.castleAt(old.x, old.y); if (n) n.abandon = ab;
          return r;
        }
      }
      return prev.call(this, user, op, arg);
    }
    if (!user || !user.admin) return { error: 'Нет прав.' };
    if (op === 'nobodyview') return { ok: true, data: this.nobodyView() };
    const k = String(arg.login || '').trim(), t = Object.prototype.hasOwnProperty.call(this.db.users, k) ? this.db.users[k] : null;
    if (!t) return { error: 'Игрок не найден.' };
    if (t.admin || t.bot) return { error: 'Это не игрок — забросить нельзя.' };
    const n = this.abandonUser(t);
    return { ok: true, msg: `Замки игрока ${t.login} заброшены (${n}) — теперь ничьи, их можно захватить. Игрок удалён.` };
  };
}

module.exports = { install, NOBODY, CASTLE };
