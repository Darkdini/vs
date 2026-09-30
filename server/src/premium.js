'use strict';
// «Премиум Завоеватель» — как в оригинале: покупка за монеты (14 дней — 100, 30 дней — 150), звание VIP в профиле.
// Работающие возможности: 5 строек одновременно, отправка армий по расписанию, опыт генерала ×2,
// +1 репутации при повышении себе, население +50% во всех замках.
const PLANS = { 14: 100, 30: 150 };
const DAY = 86400000;

function install(Game) {
  const P = Game.prototype;
  P.isPremium = function isPremium(u) { return !!u && (u.admin || (u.premium || 0) > Date.now()); };
  P.buyPremium = function buyPremium(user, days, toLogin) {
    days = Number(days); const cost = PLANS[days]; if (!cost) return { error: 'Нет такого срока.' };
    const to = toLogin ? this.db.users[String(toLogin).trim()] : user;
    if (!to) return { error: 'Игрок не найден.' };
    if ((user.gold || 0) < cost) return { error: `Не хватает монет: нужно ${cost}, у вас ${user.gold || 0}. Пополните казну.` };
    this.goldChange(user, -cost, to === user ? `Премиум Завоеватель на ${days} дн.` : `Премиум Завоеватель на ${days} дн. в подарок игроку ${to.login}`);
    to.premium = Math.max(to.premium || 0, Date.now()) + days * DAY;
    if (to !== user) { this.event(to.id, `${user.login} подарил Вам Премиум Завоеватель на ${days} дн.!`); this.sendMail(user, to.login, 'Подарок: Премиум', `Вам подарен Премиум Завоеватель на ${days} дней.`); }
    this.store.save();
    return { ok: true, msg: to === user ? `Премиум активен до ${new Date(to.premium).toLocaleDateString('ru-RU')}.` : `Премиум подарен игроку ${to.login}.` };
  };
}

module.exports = { install, PLANS };
