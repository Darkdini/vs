'use strict';
// «Приватность» (Почта → Приват.): кто может писать игроку в личку — все, только друзья, друзья и альянс, только альянс;
// чёрный список — эти игроки не могут писать, присылать фото, дарить подарки, звать в ЗАГС и бросать личный вызов
// в «Орёл-решку», а их сообщения в общем чате у игрока скрыты. Администрация и модераторы пишут всегда.

const WHO = { all: 'Все игроки', friends: 'Только друзья', friendsAlly: 'Друзья и альянс', ally: 'Только альянс' };
const BLACK_MAX = 100;

function install(Game) {
  const P = Game.prototype;
  P.privacyOf = (u) => { if (!u.privacy) u.privacy = { who: 'all', black: [] }; return u.privacy; };
  // можно ли from обратиться к to: kind 'msg' — личка и фото (настройка «кто пишет» + чёрный список), иначе — только чёрный список
  P.canReach = function canReach(from, to, kind = 'msg') {
    if (!from || !to || from.id === to.id || from.admin || from.mod) return null;
    const p = this.privacyOf(to);
    if (p.black.includes(from.id)) return `${to.login} ограничил(а) общение с Вами.`;
    if (kind !== 'msg' || p.who === 'all') return null;
    const friend = (to.friends || []).includes(from.id), al = this.allianceOf(to), ally = !!al && al === this.allianceOf(from);
    if (p.who === 'friends' && !friend) return `${to.login} принимает личные сообщения только от друзей.`;
    if (p.who === 'ally' && !ally) return `${to.login} принимает личные сообщения только от своего альянса.`;
    if (p.who === 'friendsAlly' && !friend && !ally) return `${to.login} принимает личные сообщения только от друзей и альянса.`;
    return null;
  };
  P.privacyView = function privacyView(u) {
    const p = this.privacyOf(u);
    return { who: p.who, options: WHO, black: p.black.map((id) => this.userById(id)).filter(Boolean).map((x) => ({ id: x.id, login: x.login, race: x.race, avatar: x.avatar || 0 })) };
  };
  P.privacySet = function privacySet(u, who) {
    if (!WHO[who]) return { error: 'Неверная настройка.' };
    this.privacyOf(u).who = who; this.store.save();
    return { ok: true, msg: `Личные сообщения: ${WHO[who].toLowerCase()}.` };
  };
  P.blackAdd = function blackAdd(u, who) {
    const t = Number(who) ? this.userById(Number(who)) : this.db.users[String(who || '').trim()];
    if (!t || t.bot) return { error: 'Игрок не найден.' };
    if (t.id === u.id) return { error: 'Себя в чёрный список не добавить.' };
    if (t.admin || t.mod) return { error: 'Администрацию и модераторов в чёрный список не добавить.' };
    const p = this.privacyOf(u);
    if (p.black.includes(t.id)) return { error: `${t.login} уже в чёрном списке.` };
    if (p.black.length >= BLACK_MAX) return { error: `В чёрном списке — не больше ${BLACK_MAX} игроков.` };
    p.black.push(t.id); this.store.save();
    return { ok: true, msg: `${t.login} — в чёрном списке.` };
  };
  P.blackDel = function blackDel(u, id) {
    const p = this.privacyOf(u), t = this.userById(Number(id));
    p.black = p.black.filter((x) => x !== Number(id)); this.store.save();
    return { ok: true, msg: `${t ? t.login : 'Игрок'} убран(а) из чёрного списка.` };
  };
}

module.exports = { install, WHO };
