'use strict';
// «Мои друзья» как в оригинале: дружба взаимная — заявка приходит отчётом «Принять / Отклонить»,
// после принятия игроки видят друг друга в «Мои друзья» (онлайн/оффлайн, рейтинг, репутация).
// Лента — события друзей: захватил / потерял замок, получил подарок, медаль Зала славы, новая дружба.
// Дни рождения — день и месяц из «Личной информации»; у друзей в этот день: «Сегодня день рождения у игрока …».
// Администратор для всех «оффлайн» (как и в списке онлайна).
const FRIENDS_MAX = 200, IN_MAX = 100, SENT_DAY = 30, FEED_MAX = 5000, FEED_SHOW = 60;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const C = require('./catalog');

function install(Game) {
  const P = Game.prototype;
  // переход со старых «односторонних» друзей: взаимные остаются друзьями, остальные становятся заявками
  P.friendsInit = function friendsInit() {
    if (this.db.friendsV2) return; this.db.friendsV2 = 1;
    const users = Object.values(this.db.users);
    const old = new Map(users.map((u) => [u.id, new Set(u.friends || [])]));
    for (const u of users) {
      const mine = old.get(u.id); if (!mine.size) continue;
      u.friends = [...mine].filter((id) => old.has(id) && old.get(id).has(u.id));
      for (const id of mine) if (!u.friends.includes(id)) { const o = this.userById(id); if (o && !(o.friendIn || []).includes(u.id)) (o.friendIn = o.friendIn || []).push(u.id); }
    }
  };
  const has = (u, id) => (u.friends || []).includes(id);
  P.friendsNew = function friendsNew(u) { this.friendsInit(); return (u.friendIn || []).length; };
  P.isFriend = function isFriend(a, b) { this.friendsInit(); return !!a && !!b && has(a, b.id); };
  // состояние для кнопки в профиле: друг / заявка отправлена / ждёт вашего ответа / нет
  P.friendState = function friendState(viewer, u) {
    this.friendsInit();
    if (!viewer || !u || viewer.id === u.id) return null;
    if (has(viewer, u.id)) return 'friend';
    if ((u.friendIn || []).includes(viewer.id)) return 'sent';
    if ((viewer.friendIn || []).includes(u.id)) return 'in';
    return null;
  };
  const unreq = (to, fromId) => { if (to.friendIn) to.friendIn = to.friendIn.filter((x) => x !== fromId); };
  // отметить в отчётах-заявках, чем закончилось (кнопки пропадают)
  P.friendReqMark = function friendReqMark(ownerId, fromId, state) {
    for (const r of this.db.reports || []) if (r.owner === ownerId && r.data && r.data.type === 'friendreq' && r.data.from && r.data.from.id === fromId && !r.data.state) r.data.state = state;
  };
  P.friendFeed = function friendFeed(uid, text, now = Date.now()) {
    const f = (this.db.friendFeed = this.db.friendFeed || []);
    f.push({ uid, text, at: now }); if (f.length > FEED_MAX) f.splice(0, f.length - FEED_MAX);
  };
  const link = (u) => u.login;
  P.friendOp = function friendOp(user, op, id) {
    this.friendsInit();
    const other = this.userById(Number(id));
    if (!other || other.bot) return { error: 'Игрок не найден.' };
    if (other.id === user.id) return { error: 'Это вы.' };
    user.friends = user.friends || []; other.friends = other.friends || [];
    if (op === 'add') {
      if (has(user, other.id)) return { error: `${other.login} уже в друзьях.` };
      if ((user.friendIn || []).includes(other.id)) return this.friendOp(user, 'accept', other.id); // встречная заявка — сразу дружба
      if ((other.friendIn || []).includes(user.id)) return { error: 'Заявка уже отправлена — ждите ответа.' };
      const deny = this.canReach && this.canReach(user, other, 'friend'); if (deny) return { error: deny };
      if (user.friends.length >= FRIENDS_MAX) return { error: `Друзей может быть не больше ${FRIENDS_MAX}.` };
      const now = Date.now(); user.friendSent = (user.friendSent || []).filter((t) => t > now - 86400000);
      if (user.friendSent.length >= SENT_DAY) return { error: `Не больше ${SENT_DAY} заявок в дружбу в сутки.` };
      user.friendSent.push(now);
      other.friendIn = (other.friendIn || []).filter((x) => x !== user.id); other.friendIn.push(user.id);
      if (other.friendIn.length > IN_MAX) other.friendIn.splice(0, other.friendIn.length - IN_MAX);
      this.report(other.id, `${user.login} хочет добавить Вас в друзья`, [`Игрок ${user.login} предлагает дружбу.`], 'friend',
        { type: 'friendreq', from: { id: user.id, login: user.login, race: user.race, rating: this.userRating(user) } });
      if (this.tgNotify) this.tgNotify(other.id, 'mail', `🤝 ${user.login} хочет добавить Вас в друзья. Ответьте в игре: «События» → отчёт.`);
      this.store.save();
      return { ok: true, msg: `Заявка в друзья отправлена игроку ${other.login}.` };
    }
    if (op === 'accept') {
      if (!(user.friendIn || []).includes(other.id)) return has(user, other.id) ? { error: `${other.login} уже в друзьях.` } : { error: 'Заявка уже недействительна.' };
      if (user.friends.length >= FRIENDS_MAX || other.friends.length >= FRIENDS_MAX) return { error: `Друзей может быть не больше ${FRIENDS_MAX}.` };
      unreq(user, other.id); unreq(other, user.id);
      if (!has(user, other.id)) user.friends.push(other.id);
      if (!has(other, user.id)) other.friends.push(user.id);
      this.friendReqMark(user.id, other.id, 'accepted');
      this.report(other.id, `${user.login} принял(а) Вашу дружбу!`, [`Игрок ${user.login} принял(а) Ваше предложение дружбы. Теперь вы друзья.`], 'friend',
        { type: 'friendok', from: { id: user.id, login: user.login, race: user.race, rating: this.userRating(user) } });
      if (this.tgNotify) this.tgNotify(other.id, 'mail', `🤝 ${user.login} принял(а) Вашу дружбу!`);
      const now = Date.now(); this.friendFeed(user.id, `${link(user)} и ${link(other)} теперь друзья`, now);
      this.store.save();
      return { ok: true, msg: `${other.login} теперь Ваш друг!` };
    }
    if (op === 'decline') {
      if (!(user.friendIn || []).includes(other.id)) return { error: 'Заявка уже недействительна.' };
      unreq(user, other.id); this.friendReqMark(user.id, other.id, 'declined');
      this.store.save();
      return { ok: true, msg: 'Заявка отклонена.' };
    }
    if (op === 'cancel') { unreq(other, user.id); this.friendReqMark(other.id, user.id, 'cancelled'); this.store.save(); return { ok: true, msg: 'Заявка отозвана.' }; }
    if (op === 'del') {
      if (!has(user, other.id)) return { error: `${other.login} не в друзьях.` };
      user.friends = user.friends.filter((f) => f !== other.id); other.friends = other.friends.filter((f) => f !== user.id);
      this.store.save();
      return { ok: true, msg: `${other.login} удалён(а) из друзей.` };
    }
    return { error: 'Неизвестное действие.' };
  };

  // день рождения: «ДД.ММ» (без года), пусто — убрать
  P.setBirthday = function setBirthday(u, day, month) {
    day = Math.floor(Number(day)); month = Math.floor(Number(month));
    if (!day && !month) { delete u.bday; this.store.save(); return { ok: true, msg: 'День рождения убран.' }; }
    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= DAYS_IN[month - 1])) return { error: 'Укажите день и месяц.' };
    u.bday = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
    this.store.save();
    return { ok: true, msg: `День рождения: ${day} ${MONTHS[month - 1]}.` };
  };
  P.bdayText = (b) => { if (!b) return ''; const [d, m] = b.split('.').map(Number); return `${d} ${MONTHS[m - 1]}`; };
  const mskToday = (now) => { const d = new Date(now + 3 * 3600000); return { d: d.getUTCDate(), m: d.getUTCMonth() + 1 }; };

  P.friendsView = function friendsView(user, now = Date.now()) {
    this.friendsInit();
    const fr = (user.friends || []).map((id) => this.userById(id)).filter(Boolean);
    const row = (u) => ({ id: u.id, login: u.login, race: u.race, raceName: C.RACE_NAMES[u.race], avatar: u.avatar || 0, frame: u.frame || '',
      rating: this.userRating(u), rep: u.reputation ?? 10, online: !!u.online && !u.admin, bday: u.bday ? this.bdayText(u.bday) : '' });
    const list = fr.map(row).sort((a, b) => (b.online - a.online) || b.rating - a.rating);
    const ids = new Set([user.id, ...fr.map((u) => u.id)]); // в ленте — и свои события
    const feed = (this.db.friendFeed || []).filter((e) => ids.has(e.uid)).slice(-FEED_SHOW).reverse().map((e) => ({ uid: e.uid, text: e.text, at: e.at }));
    const t = mskToday(now), key = `${String(t.d).padStart(2, '0')}.${String(t.m).padStart(2, '0')}`;
    // дни рождения: сегодня — отдельно, дальше — ближайшие по календарю
    const until = (b) => { const [d, m] = b.split('.').map(Number); const y = new Date(now + 3 * 3600000).getUTCFullYear();
      let x = Date.UTC(y, m - 1, d) - Date.UTC(y, t.m - 1, t.d); if (x < 0) x += 365 * 86400000; return Math.round(x / 86400000); };
    const bdays = fr.filter((u) => u.bday).map((u) => ({ ...row(u), today: u.bday === key, days: until(u.bday) })).sort((a, b) => a.days - b.days);
    const incoming = (user.friendIn || []).map((id) => this.userById(id)).filter(Boolean).map(row);
    return { myBday: user.bday || '', list, feed, bdays, today: bdays.filter((b) => b.today).length, incoming, max: FRIENDS_MAX };
  };
  // старый список «Друзья» (окно игроков) — теперь взаимные друзья
  P.friendsOf = function friendsOf(user) { this.friendsInit(); return (user.friends || []).map((id) => this.userById(id)).filter(Boolean).map((u) => ({ ...this.playerRow(u), online: !!u.online && !u.admin })); };
}

module.exports = { install, MONTHS };
