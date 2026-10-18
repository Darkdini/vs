'use strict';
// Мягкая модерация общего чата — чтобы не банить сразу (модераторы и администратор):
// • «Предупредить» (меню сообщения): пункт правил игры (rules.js); игрок видит окно «Предупреждение», пока не нажмёт «Понятно»
//   (не в игре — при следующем входе). Модератор видит, сколько предупреждений у игрока за неделю. Всё — в журнале модерации.
// • «Закрыть чат» на 5/10/15/30 минут: игроки не пишут и видят плашку с отсчётом; модераторы и админ пишут;
//   по таймеру чат открывается сам (index.js — chatCloseCheck), раньше — кнопкой «Открыть чат».
const { ruleAt, ruleLabel } = require('./rules');
const CLOSE_MIN = [5, 10, 15, 30];
const WEEK = 7 * 86400000;

function install(Game) {
  const P = Game.prototype;
  const userOf = (g, login) => g.db.users[String(login || '').trim()] || null;
  // как у бана в чате: админа — никто, старшего модератора — только админ, модератора — старший модератор или админ
  const protectedFrom = (me, t) => t.admin || (t.smod && !me.admin) || (t.mod && !me.admin && !me.smod);
  const weekOf = (t, now) => (t.warns || []).filter((x) => x.at > now - WEEK);

  // для меню сообщения у модератора: сколько предупреждений за неделю, последнее, есть ли бан в чате
  P.chatWarnInfo = function chatWarnInfo(user, login, now = Date.now()) {
    if (!this.canModerate(user)) return { error: 'Нет прав.' };
    const t = userOf(this, login); if (!t) return { error: 'Игрок не найден.' };
    const w = weekOf(t, now);
    return { login: t.login, warns: w.length, last: w.length ? w[w.length - 1] : null, chatBan: t.chatBan === -1 ? -1 : t.chatBan > now ? t.chatBan : 0 };
  };
  P.chatWarn = function chatWarn(user, login, rule, now = Date.now()) {
    if (!this.canModerate(user)) return { error: 'Нет прав.' };
    const t = userOf(this, login); if (!t) return { error: 'Игрок не найден.' };
    if (t === user) return { error: 'Себя предупредить нельзя.' };
    if (protectedFrom(user, t)) return { error: 'Этого игрока предупредить нельзя.' };
    if (!ruleAt(rule)) return { error: 'Выберите пункт правил.' };
    const last = (t.warns || []).slice(-1)[0]; if (last && now - last.at < 60000) return { error: 'Игрока только что предупредили — подождите минуту.' };
    const reason = ruleLabel(rule), w = { at: now, by: user.login, admin: !!user.admin, rule: Number(rule), why: reason };
    t.warns = [...(t.warns || []), w].slice(-20); t.warnPending = w;
    if (this.modLog) this.modLog(user, 'warn', t.login, `предупреждение: ${reason}`);
    this.store.save();
    return { ok: true, to: t, msg: `${t.login}: предупреждение отправлено (за неделю — ${weekOf(t, now).length}).` };
  };
  // игрок нажал «Понятно»
  P.chatWarnSeen = function chatWarnSeen(user) { if (user.warnPending) { delete user.warnPending; this.store.save(); } return { ok: true }; };

  P.chatClosedUntil = function chatClosedUntil(now = Date.now()) { const c = this.db.chatClosed; return c && c.until > now ? c.until : 0; };
  // minutes: 5/10/15/30 — закрыть (или продлить заново), 0 — открыть раньше срока
  P.chatClose = function chatClose(user, minutes, now = Date.now()) {
    if (!this.canModerate(user)) return { error: 'Нет прав.' };
    minutes = Number(minutes);
    if (minutes === 0) {
      if (!this.chatClosedUntil(now)) return { error: 'Чат и так открыт.' };
      delete this.db.chatClosed;
      if (this.modLog) this.modLog(user, 'chatclose', 'общий чат', 'открыт');
      const r = this.chatPost(user, '🔓 Чат снова открыт. Общаемся дружно!', { sys: 1 }, { sys: true });
      this.store.save(); return { ok: true, msg: 'Чат открыт.', until: 0, chat: r.msg || null };
    }
    if (!CLOSE_MIN.includes(minutes)) return { error: 'Закрыть чат можно на 5, 10, 15 или 30 минут.' };
    const until = now + minutes * 60000;
    this.db.chatClosed = { until, by: user.login, at: now };
    if (this.modLog) this.modLog(user, 'chatclose', 'общий чат', `закрыт на ${minutes} мин.`);
    const r = this.chatPost(user, `🔒 Чат закрыт на ${minutes} мин. Отдохните немного и успокойтесь — скоро откроем!`, { sys: 1 }, { sys: true });
    this.store.save(); return { ok: true, msg: `Чат закрыт на ${minutes} мин.`, until, chat: r.msg || null };
  };
  // раз в секунду (index.js): время вышло — чат открывается сам, в чат — сообщение
  P.chatCloseCheck = function chatCloseCheck(now = Date.now()) {
    const c = this.db.chatClosed; if (!c || c.until > now) return null;
    delete this.db.chatClosed;
    const by = userOf(this, c.by) || this.adminUser();
    const r = by ? this.chatPost(by, '🔓 Чат снова открыт. Общаемся дружно!', { sys: 1 }, { sys: true }) : {};
    this.store.save(); return { until: 0, chat: r.msg || null };
  };
}

module.exports = { install, CLOSE_MIN };
