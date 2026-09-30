'use strict';
// «Премиум Завоеватель» — как в оригинале: покупка за монеты (14 дней — 100, 30 дней — 150), звание VIP в профиле.
// Возможности (все 12, как в оригинале): 5 строек, отправка армий по расписанию, опыт генерала ×2, экспедиции без остановок,
// ритуалы/тренировка/усмирение во всех замках через окно «Королевство», +1 репутации себе, население +50%,
// сводка армий, уникальные подарки, цвет сообщений в диалогах и на форуме, звание VIP.
const PLANS = { 14: 100, 30: 150 };
const DAY = 86400000;
// цвета сообщений в диалогах и на форуме (премиум): индекс в палитре, 0 — обычный
const MSG_COLORS = ['', '#8b0000', '#1d4fa0', '#1f6b1f', '#6a1b9a', '#b35900', '#00695c', '#c2185b'];

function install(Game) {
  const P = Game.prototype;
  P.isPremium = function isPremium(u) { return !!u && (u.admin || (u.premium || 0) > Date.now()); };
  P.msgColor = function msgColor(u) { return this.isPremium(u) ? MSG_COLORS[u.msgColor] || '' : ''; };
  P.setMsgColor = function setMsgColor(user, i) {
    i = Math.floor(Number(i)); if (!(i >= 0 && i < MSG_COLORS.length)) return { error: 'Нет такого цвета.' };
    if (i && !this.isPremium(user)) return { error: 'Цвет сообщений доступен с премиумом.' };
    user.msgColor = i; this.store.save(); return { ok: true, msg: i ? 'Цвет сообщений сохранён.' : 'Обычный цвет сообщений.' };
  };
  // «Королевство» (премиум): все замки в одном окне — ресурсы, лояльность, тренировка, что можно обучать
  P.kingdom = function kingdom(user) {
    const { UNITS, UNIT, GENERAL_ID, unitsForRace } = require('./army');
    return this.castlesOf(user).map((c) => {
      this.tick(c); this.mil(c);
      const units = unitsForRace(this.raceOf(c)).filter((u) => u.id !== GENERAL_ID && !u.notrain && !this.unitLock(c, u)).map((u) => ({ id: u.id, name: u.name }));
      return { id: c.id, name: c.name, x: c.x, y: c.y, loyalty: Math.round(c.loyalty ?? 100), temple: this.buildingLevel(c, 25),
        res: { wood: Math.floor(c.res.wood), stone: Math.floor(c.res.stone), iron: Math.floor(c.res.iron), food: Math.floor(c.res.food), people: Math.floor(c.res.people) },
        training: c.training.map((t) => ({ unit: (UNIT[t.unit] || {}).name || '?', left: t.count - t.done, end: t.start + t.each * t.count })), units };
    });
  };
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

module.exports = { install, PLANS, MSG_COLORS };
