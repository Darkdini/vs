'use strict';
// Опрос в общем чате — только администратор (как опрос на форуме, forum.js: вопрос, 2–10 вариантов, несколько ответов,
// открытый или анонимный, срок). В чате — сообщение «📊 Опрос: …» с номером опроса; сам опрос хранится отдельно
// (чат помнит лишь последние 30 сообщений), последний открытый опрос закреплён вверху чата.
// Итоги игрок видит после своего голоса или завершения опроса, администратор — сразу и с именами.
const KEEP = 20;

function install(Game) {
  const P = Game.prototype;
  const find = (g, id) => (g.db.chatPolls || []).find((p) => p.id === Number(id)) || null;
  P.chatPollView = function chatPollView(id, user) { const p = find(this, id); return p ? { id: p.id, ...this.forumPollView(p, user, !!user.admin) } : null; };
  // закреплённый вверху чата: последний открытый опрос
  P.chatPollPin = function chatPollPin(now = Date.now()) { const l = (this.db.chatPolls || []).filter((p) => this.pollOpen(p, now)); return l.length ? l[l.length - 1].id : 0; };
  // опросы, на которые ссылаются сообщения чата, и закреплённый — для окна чата этого игрока
  P.chatPollViews = function chatPollViews(user) {
    const ids = new Set((this.db.chat || []).filter((m) => m.poll).map((m) => m.poll)), pin = this.chatPollPin(); if (pin) ids.add(pin);
    const out = {}; for (const id of ids) { const v = this.chatPollView(id, user); if (v) out[id] = v; }
    return { polls: out, pin };
  };
  P.chatPollOp = function chatPollOp(user, m) {
    if (m.op === 'create') {
      if (!user.admin) return { error: 'Опрос в чате создаёт только администратор.' };
      const pm = this.pollMake(m, user); if (pm.error) return pm;
      const poll = { id: this.db.nextId++, ...pm.poll };
      this.db.chatPolls = [...(this.db.chatPolls || []), poll].slice(-KEEP);
      const r = this.chatPost(user, `📊 Опрос: ${poll.q}`, { poll: poll.id }); if (r.error) return r;
      return { msg: r.msg, poll: poll.id };
    }
    const p = find(this, m.id); if (!p) return { error: 'Опрос не найден.' };
    if (m.op === 'vote' || m.op === 'unvote') { const r = this.pollVote(p, user, m.opts, m.op === 'unvote'); if (r.error) return r; this.store.save(); return { note: r.msg, poll: p.id }; }
    if (!user.admin) return { error: 'Нет прав.' };
    if (m.op === 'close') { p.closed = true; this.store.save(); return { note: 'Опрос завершён — итоги видны всем.', poll: p.id }; }
    if (m.op === 'del') { // удалить опрос и его сообщение из чата
      this.db.chatPolls = this.db.chatPolls.filter((x) => x !== p);
      const msg = (this.db.chat || []).find((x) => x.poll === p.id); if (msg) this.db.chat = this.db.chat.filter((x) => x !== msg);
      this.store.save(); return { note: 'Опрос удалён.', poll: p.id, gone: true, msgId: msg ? msg.id : 0 };
    }
    return { error: 'Неизвестная команда.' };
  };
}

module.exports = { install };
