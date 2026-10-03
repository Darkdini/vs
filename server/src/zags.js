'use strict';
// ЗАГС, как в оригинале: предложение о браке (10 золота, при отказе не возвращается), свадьба, страница пары
// (дата брака, место в рейтинге, голоса, подарки паре, комментарии), рейтинг семейных пар и «Последние браки».
// Рейтинг пары поднимается за золото: 1 монета = 1 голос. Предложения живут 2 недели.
// Браки — db.marriages { id: { id, king, queen, at, votes, gifts, comments } }, у супругов u.marriage = id;
// предложения — db.proposals [{ id, from, to, role, text, at }] (role — кем будет отправитель: king / queen).

const PROPOSE_GOLD = 10, PROPOSE_LIFE = 14 * 86400000, MAX_OUT = 5;
const COMMENT_KEEP = 100, COMMENT_GAP = 15000, VOTE_MAX = 100000;
const ROLE = { king: 'Король', queen: 'Королева' };

function install(Game) {
  const P = Game.prototype;
  const MAR = (g) => { if (!g.db.marriages) g.db.marriages = {}; return g.db.marriages; };
  const PROPS = (g) => { const now = Date.now(); g.db.proposals = (g.db.proposals || []).filter((p) => p.at > now - PROPOSE_LIFE && g.userById(p.from) && g.userById(p.to)); return g.db.proposals; };
  // брак игрока (если супруг удалён — брак распадается)
  P.marriageOf = function marriageOf(u) {
    if (!u || !u.marriage) return null;
    const m = MAR(this)[u.marriage];
    if (!m || !this.userById(m.king) || !this.userById(m.queen)) { if (m) delete MAR(this)[m.id]; delete u.marriage; return null; }
    return m;
  };
  P.pairRating = function pairRating() {
    return this.cached('pairs', 15000, () => Object.values(MAR(this)).filter((m) => this.userById(m.king) && this.userById(m.queen))
      .sort((a, b) => (b.votes || 0) - (a.votes || 0) || a.at - b.at));
  };
  P.pairPlace = function pairPlace(m) { return m ? this.pairRating().indexOf(m) + 1 : 0; };
  const pairRow = (g, m) => { const k = g.userById(m.king), q = g.userById(m.queen);
    return { id: m.id, king: { id: k.id, login: k.login }, queen: { id: q.id, login: q.login }, votes: m.votes || 0, at: m.at }; };
  // строка «Женат на Королеве …» для профиля
  P.marriageLine = function marriageLine(u) {
    const m = this.marriageOf(u); if (!m) return null;
    const king = m.king === u.id, s = this.userById(king ? m.queen : m.king);
    return { id: m.id, role: king ? 'king' : 'queen', spouse: { id: s.id, login: s.login }, votes: m.votes || 0, place: this.pairPlace(m) };
  };

  // предложение о браке
  P.propose = function propose(user, toLogin, text, role) {
    const to = this.db.users[String(toLogin || '').trim()];
    if (!to || to.bot) return { error: 'Игрок не найден.' };
    if (to.id === user.id) return { error: 'Нельзя сделать предложение самому себе.' };
    const deny = this.canReach && this.canReach(user, to, 'propose'); if (deny) return { error: deny };
    if (!ROLE[role]) return { error: 'Выберите, кем Вы будете в браке.' };
    text = String(text || '').trim().slice(0, 300);
    if (!text) return { error: 'Напишите признание в любви.' };
    if (this.marriageOf(user)) return { error: 'Вы уже состоите в браке.' };
    if (this.marriageOf(to)) return { error: `${to.login} уже состоит в браке.` };
    const ps = PROPS(this);
    if (ps.some((p) => p.from === user.id && p.to === to.id)) return { error: 'Вы уже отправили предложение этому игроку — дождитесь ответа.' };
    if (ps.filter((p) => p.from === user.id).length >= MAX_OUT) return { error: `Не больше ${MAX_OUT} предложений одновременно.` };
    if ((user.gold || 0) < PROPOSE_GOLD) return { error: `Нужно ${PROPOSE_GOLD} золота (у вас ${user.gold || 0}).` };
    this.goldChange(user, -PROPOSE_GOLD, `ЗАГС: предложение о браке игроку ${to.login}`);
    ps.push({ id: this.db.nextId++, from: user.id, to: to.id, role, text, at: Date.now() });
    this.sendMail(user, to.login, 'Предложение о браке', `💍 ${ROLE[role]} ${user.login} делает Вам предложение руки и сердца!\n«${text}»\nПринять или отклонить: Кабинет → ЗАГС → Предложение.`);
    this.event(to.id, `💍 ${user.login} делает Вам предложение руки и сердца! ЗАГС → Предложение.`);
    this.store.save();
    return { ok: true, msg: `Предложение отправлено игроку ${to.login}. Ждите ответа!` };
  };
  P.proposals = function proposals(user) {
    const ps = PROPS(this), row = (p, other) => { const o = this.userById(other); return { id: p.id, user: { id: o.id, login: o.login, race: o.race, avatar: o.avatar || 0 }, role: p.role, text: p.text, at: p.at, exp: p.at + PROPOSE_LIFE }; };
    return { in: ps.filter((p) => p.to === user.id).reverse().map((p) => row(p, p.from)), out: ps.filter((p) => p.from === user.id).reverse().map((p) => row(p, p.to)), married: !!this.marriageOf(user), price: PROPOSE_GOLD };
  };
  // ответ на предложение: yes — свадьба, no — отказ; отправитель может отозвать своё (cancel)
  P.proposalAnswer = function proposalAnswer(user, id, op) {
    const ps = PROPS(this), p = ps.find((x) => x.id === Number(id));
    if (!p || (op === 'cancel' ? p.from !== user.id : p.to !== user.id)) return { error: 'Предложение не найдено — возможно, оно уже неактуально.' };
    const from = this.userById(p.from), to = this.userById(p.to);
    const drop = () => { this.db.proposals = ps.filter((x) => x !== p); };
    if (op === 'cancel') { drop(); this.store.save(); return { ok: true, msg: `Предложение игроку ${to.login} отозвано.` }; }
    if (op === 'no') {
      drop(); this.event(from.id, `${to.login} отклонил(а) Ваше предложение о браке.`);
      this.sendMail(to, from.login, 'Предложение о браке', 'К сожалению, я отклоняю Ваше предложение о браке.');
      this.store.save(); return { ok: true, msg: `Вы отклонили предложение игрока ${from.login}.` };
    }
    if (op !== 'yes') return { error: 'Неверный запрос.' };
    if (this.marriageOf(to)) return { error: 'Вы уже состоите в браке.' };
    if (this.marriageOf(from)) { drop(); this.store.save(); return { error: `${from.login} уже состоит в браке — предложение снято.` }; }
    const m = { id: this.db.nextId++, king: p.role === 'king' ? from.id : to.id, queen: p.role === 'king' ? to.id : from.id, at: Date.now(), votes: 0, gifts: [], comments: [] };
    MAR(this)[m.id] = m; from.marriage = m.id; to.marriage = m.id;
    this.db.proposals = ps.filter((x) => x.from !== from.id && x.from !== to.id); // свои исходящие у обоих снимаются
    const k = this.userById(m.king), q = this.userById(m.queen);
    this.event(from.id, `💍 ${to.login} принял(а) Ваше предложение! Совет Вам да любовь!`);
    this.sendMail(to, from.login, 'Свадьба!', `💍 Я согласен(на)! Королева ${q.login} и Король ${k.login} теперь семья. Совет нам да любовь!`);
    this.cache = {}; this.store.save();
    return { ok: true, msg: `Поздравляем! Королева ${q.login} заключила брак с Королем ${k.login}! Совет Вам, да любовь!`, pair: m.id };
  };
  P.divorce = function divorce(user) {
    const m = this.marriageOf(user); if (!m) return { error: 'Вы не состоите в браке.' };
    const other = this.userById(m.king === user.id ? m.queen : m.king);
    delete MAR(this)[m.id]; delete user.marriage; delete other.marriage;
    this.event(other.id, `💔 ${user.login} расторг(ла) брак с Вами.`);
    this.cache = {}; this.store.save();
    return { ok: true, msg: `Брак с ${other.login} расторгнут.` };
  };

  // страница пары
  P.pairPage = function pairPage(viewer, id) {
    const m = MAR(this)[Number(id)];
    if (!m || !this.userById(m.king) || !this.userById(m.queen)) return { error: 'Пара не найдена — возможно, брак расторгнут.' };
    const one = (uid) => { const u = this.userById(uid); return { id: u.id, login: u.login, race: u.race, avatar: u.avatar || 0 }; };
    return { id: m.id, king: one(m.king), queen: one(m.queen), at: m.at, votes: m.votes || 0, place: this.pairPlace(m), mine: m.king === viewer.id || m.queen === viewer.id,
      gifts: (m.gifts || []).slice(-60).reverse().map((g) => ({ gift: g.gift, from: (this.userById(g.from) || { login: '—' }).login, fromId: g.from, at: g.at })),
      comments: (m.comments || []).slice().reverse().map((c) => { const u = this.userById(c.from); return { id: c.id, from: u ? u.login : '—', fromId: c.from, text: c.text, at: c.at,
        del: c.from === viewer.id || m.king === viewer.id || m.queen === viewer.id || !!viewer.admin || !!viewer.mod }; }) };
  };
  // «Проголосовать» / «Поднять рейтинг паре»: 1 монета = 1 голос
  P.pairVote = function pairVote(user, id, coins) {
    const m = MAR(this)[Number(id)]; if (!m) return { error: 'Пара не найдена.' };
    coins = Math.floor(Number(coins));
    if (!(coins >= 1) || coins > VOTE_MAX) return { error: 'Укажите количество монет.' };
    if ((user.gold || 0) < coins) return { error: `Не хватает золота (у вас ${user.gold || 0}).` };
    const k = this.userById(m.king), q = this.userById(m.queen);
    this.goldChange(user, -coins, `ЗАГС: рейтинг пары ${k.login} и ${q.login} +${coins}`);
    m.votes = (m.votes || 0) + coins; this.cache = {};
    for (const u of [k, q]) if (u.id !== user.id) this.event(u.id, `${user.login} поднял(а) рейтинг Вашей пары на ${coins}!`);
    this.store.save();
    return { ok: true, msg: `Рейтинг пары +${coins} (теперь ${m.votes}).` };
  };
  // подарок паре («Поздравить пару!») — подарки из того же набора, что и в профиле
  P.pairGift = function pairGift(user, id, giftId) {
    const m = MAR(this)[Number(id)]; if (!m) return { error: 'Пара не найдена.' };
    const { GIFTS } = require('./social'), g = GIFTS[giftId]; if (!g) return { error: 'Нет такого подарка.' };
    if (g.premium && !this.isPremium(user)) return { error: 'Это уникальный подарок — дарить его можно только с премиумом.' };
    if ((user.gold || 0) < g.gold) return { error: `Нужно ${g.gold} золота (у вас ${user.gold || 0}).` };
    const k = this.userById(m.king), q = this.userById(m.queen);
    this.goldChange(user, -g.gold, `ЗАГС: подарок «${g.name}» паре ${k.login} и ${q.login}`);
    (m.gifts = m.gifts || []).push({ gift: giftId, from: user.id, at: Date.now() }); if (m.gifts.length > 200) m.gifts.splice(0, m.gifts.length - 200);
    for (const u of [k, q]) if (u.id !== user.id) this.event(u.id, `🎁 ${user.login} поздравил(а) Вашу пару: ${g.name}!`);
    this.store.save();
    return { ok: true, msg: `Подарок «${g.name}» вручён паре ${k.login} и ${q.login}.` };
  };
  P.pairComment = function pairComment(user, id, text) {
    const m = MAR(this)[Number(id)]; if (!m) return { error: 'Пара не найдена.' };
    if (user.chatBan === -1 || user.chatBan > Date.now()) return { error: 'Вам запрещено писать сообщения.' };
    text = String(text || '').trim().slice(0, 300); if (!text) return { error: 'Пустой комментарий.' };
    const now = Date.now(); if (user.pairComAt && now - user.pairComAt < COMMENT_GAP) return { error: 'Не так часто — подождите несколько секунд.' };
    user.pairComAt = now;
    (m.comments = m.comments || []).push({ id: this.db.nextId++, from: user.id, text, at: now }); if (m.comments.length > COMMENT_KEEP) m.comments.splice(0, m.comments.length - COMMENT_KEEP);
    this.store.save(); return { ok: true };
  };
  P.pairCommentDel = function pairCommentDel(user, id, cid) {
    const m = MAR(this)[Number(id)]; if (!m) return { error: 'Пара не найдена.' };
    const c = (m.comments || []).find((x) => x.id === Number(cid)); if (!c) return { error: 'Комментарий не найден.' };
    if (!(c.from === user.id || m.king === user.id || m.queen === user.id || user.admin || user.mod)) return { error: 'Нет прав.' };
    m.comments = m.comments.filter((x) => x !== c); this.store.save(); return { ok: true };
  };
  // главная ЗАГСа: последние браки; рейтинг пар — страницами
  P.zagsHome = function zagsHome(user) {
    const last = Object.values(MAR(this)).filter((m) => this.userById(m.king) && this.userById(m.queen)).sort((a, b) => b.at - a.at).slice(0, 20).map((m) => pairRow(this, m));
    return { last, my: this.marriageLine(user), incoming: PROPS(this).filter((p) => p.to === user.id).length };
  };
  P.pairsList = function pairsList() { return this.pairRating().slice(0, 500).map((m) => pairRow(this, m)); };
  P.zagsNew = function zagsNew(user) { return (this.db.proposals || []).filter((p) => p.to === user.id && p.at > Date.now() - PROPOSE_LIFE).length; };
}

module.exports = { install, PROPOSE_GOLD, PROPOSE_LIFE };
