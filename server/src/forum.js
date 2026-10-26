'use strict';
// Общий форум всех игроков (Почта → Форум), как в оригинале:
// разделы → темы → сообщения. Темы создают только модераторы (админ, модераторы форума, модераторы раздела),
// отвечают игроки с рейтингом от 300 (social.js talkLow; модераторы — всегда). Модераторы закрепляют/закрывают/удаляют темы,
// удаляют сообщения и запрещают писать на форуме.
// Опрос в теме (как в Telegram): создаёт модератор — вопрос, 2–10 вариантов, «несколько ответов», «показывать, кто как
// голосовал», срок. Игрок голосует один раз (голос можно отменить, пока опрос открыт); итоги видны после голоса или
// завершения, модераторам — сразу; кто за что голосовал — в открытом опросе всем, в анонимном — только администратору.

const SECTIONS = ['Помощь новичкам. Обсуждение игровых моментов', 'Альянсы', 'Общение', 'Спорт'];
// убранные разделы: их темы (если были) переезжают в «Общение», назначенные в них модераторы снимаются
const REMOVED = ['Пресс-служба союзов', 'Hi-Tech технологии', 'Музыка', 'Клуб по интересам'];
const TOPICS_PAGE = 10, POSTS_PAGE = 10;
const TITLE_MAX = 80, TEXT_MAX = 1500, POST_GAP_MS = 10000;
const POLL_Q = 200, POLL_OPT = 100, POLL_MIN = 2, POLL_MAX = 10, POLL_DAYS = [0, 1, 3, 7], POLL_VOTERS = 40;

function install(Game) {
  const P = Game.prototype;
  const clean = (s, n) => String(s || '').replace(/[<>]/g, '').replace(/\s+$/g, '').slice(0, n).trim();

  P.forumDb = function forumDb() {
    if (!this.db.forum) this.db.forum = { sections: SECTIONS.map((name, i) => ({ id: i + 1, name, mods: [], topics: [] })), nextId: 1 };
    const f = this.db.forum, gone = f.sections.filter((s) => REMOVED.includes(s.name));
    if (gone.length) {
      const to = f.sections.find((s) => s.name === 'Общение') || f.sections.find((s) => !gone.includes(s));
      for (const s of gone) to.topics.push(...s.topics);
      f.sections = f.sections.filter((s) => !gone.includes(s)); this.store.save();
    }
    return f;
  };
  P.forumSection = function forumSection(id) { return this.forumDb().sections.find((s) => s.id === Number(id)) || null; };
  P.forumTopic = function forumTopic(id) {
    for (const s of this.forumDb().sections) { const t = s.topics.find((x) => x.id === Number(id)); if (t) return { s, t }; }
    return null;
  };
  // модератор раздела: админ, модератор форума или назначенный в этот раздел
  P.forumCanMod = function forumCanMod(user, sec) { return !!(user && (user.admin || user.mod || (sec && sec.mods.includes(user.id)))); };
  P.forumBanned = function forumBanned(user) {
    if (user.forumBan === -1) return 'Вам запрещено писать на форуме навсегда.';
    if (user.forumBan > Date.now()) return `Вам запрещено писать на форуме ещё ${Math.ceil((user.forumBan - Date.now()) / 60000)} мин.`;
    return null;
  };
  const lastOf = (t) => { const p = t.posts.filter((x) => !x.deleted); return p[p.length - 1] || null; };
  // опрос для окна темы: голоса — { id игрока: [номера вариантов] }; итоги — после своего голоса, после завершения, модератору — всегда
  const pollOpen = (p, now = Date.now()) => !p.closed && !(p.until && p.until <= now);
  P.pollOpen = pollOpen;
  // новый опрос из формы (форум и общий чат — chatpoll.js): проверка вопроса, вариантов и срока
  P.pollMake = function pollMake(m, user, now = Date.now()) {
    const q = clean(m.q, POLL_Q); if (q.length < 3) return { error: 'Вопрос — от 3 символов.' };
    const opts = [].concat(m.opts || []).slice(0, POLL_MAX + 5).map((x) => clean(x, POLL_OPT)).filter(Boolean);
    if (opts.length < POLL_MIN) return { error: `Нужно хотя бы ${POLL_MIN} варианта ответа.` };
    if (opts.length > POLL_MAX) return { error: `Не больше ${POLL_MAX} вариантов ответа.` };
    if (new Set(opts.map((x) => x.toLowerCase())).size !== opts.length) return { error: 'Варианты ответа повторяются.' };
    const days = Number(m.days) || 0; if (!POLL_DAYS.includes(days)) return { error: 'Неверный срок опроса.' };
    return { poll: { q, opts, multi: !!m.multi, public: !!m.public, until: days ? now + days * 86400000 : 0, closed: false, at: now, by: user.login, byId: user.id, votes: {} } };
  };
  // голос в опросе (форум и чат): один раз, несколько вариантов — если разрешено; отмена — пока опрос открыт
  P.pollVote = function pollVote(p, user, opts, undo, now = Date.now()) {
    if (!pollOpen(p, now)) return { error: 'Опрос завершён.' };
    if (user.bot) return { error: 'Нет прав.' };
    if (undo) { if (!p.votes[user.id]) return { error: 'Вы ещё не голосовали.' }; delete p.votes[user.id]; return { msg: 'Голос отменён.' }; }
    if (p.votes[user.id]) return { error: 'Вы уже проголосовали — чтобы переголосовать, отмените голос.' };
    const pick = [...new Set([].concat(opts || []).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < p.opts.length).sort((a, b) => a - b);
    if (!pick.length) return { error: 'Выберите вариант ответа.' };
    if (!p.multi && pick.length > 1) return { error: 'Можно выбрать только один вариант.' };
    p.votes[user.id] = pick; return { msg: 'Голос принят.' };
  };
  P.forumPollView = function forumPollView(p, user, mod) {
    const open = pollOpen(p), mine = p.votes[user.id] || null, ids = Object.keys(p.votes), total = ids.length;
    const results = !!mine || !open || mod, who = p.public || user.admin;
    const count = p.opts.map(() => 0), voters = p.opts.map(() => []);
    for (const id of ids) for (const i of p.votes[id]) { count[i]++; if (who && results && voters[i].length < POLL_VOTERS) { const v = this.userById(Number(id)); if (v) voters[i].push(v.login); } }
    return { q: p.q, multi: !!p.multi, public: !!p.public, until: p.until || 0, open, total, results, mine, canVote: open && !mine && !user.bot,
      opts: p.opts.map((text, i) => ({ text, ...(results ? { n: count[i], pct: total ? Math.round(count[i] / total * 100) : 0 } : {}), mine: !!(mine && mine.includes(i)),
        ...(who && results ? { voters: voters[i], more: Math.max(0, count[i] - voters[i].length) } : {}) })) };
  };

  // список разделов
  P.forumSections = function forumSections(user) {
    return this.forumDb().sections.map((s) => ({ id: s.id, name: s.name, topics: s.topics.filter((t) => !t.deleted).length,
      mods: s.mods.map((id) => (this.userById(id) || {}).login).filter(Boolean), canMod: this.forumCanMod(user, s) }));
  };
  // темы раздела: закреплённые сверху, дальше — по последнему сообщению
  P.forumTopics = function forumTopics(user, secId, page = 0) {
    const s = this.forumSection(secId); if (!s) return { error: 'Раздел не найден.' };
    const mod = this.forumCanMod(user, s);
    const all = s.topics.filter((t) => !t.deleted || mod).slice()
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ((lastOf(b) || b).at - (lastOf(a) || a).at));
    const pages = Math.max(1, Math.ceil(all.length / TOPICS_PAGE)), pg = Math.max(0, Math.min(pages - 1, Math.floor(Number(page)) || 0));
    const fav = new Set(user.forumFav || []);
    return { id: s.id, name: s.name, canMod: mod, page: pg, pages,
      topics: all.slice(pg * TOPICS_PAGE, pg * TOPICS_PAGE + TOPICS_PAGE).map((t) => { const l = lastOf(t);
        return { id: t.id, title: t.title, by: t.by, byId: t.byId, replies: Math.max(0, t.posts.filter((x) => !x.deleted).length - 1), last: l ? { at: l.at, by: l.by } : null,
          pinned: !!t.pinned, closed: !!t.closed, deleted: !!t.deleted, fav: fav.has(t.id), poll: !!t.poll }; }) };
  };
  // сообщения темы (по умолчанию — последняя страница)
  P.forumPosts = function forumPosts(user, topicId, page) {
    const f = this.forumTopic(topicId); if (!f) return { error: 'Тема не найдена.' };
    const { s, t } = f, mod = this.forumCanMod(user, s);
    if (t.deleted && !mod) return { error: 'Тема удалена.' };
    const low = !mod && this.talkLow && this.talkLow(user) ? this.talkLowMsg(user, 'Писать на форуме') : null; // рейтинг ниже 300 — вместо формы ответа табличка
    const list = t.posts.filter((p) => !p.deleted || mod);
    const pages = Math.max(1, Math.ceil(list.length / POSTS_PAGE));
    const pg = page === undefined || page === null || page === -1 ? pages - 1 : Math.max(0, Math.min(pages - 1, Math.floor(Number(page)) || 0));
    return { id: t.id, title: t.title, section: { id: s.id, name: s.name }, closed: !!t.closed, pinned: !!t.pinned, deleted: !!t.deleted, canMod: mod,
      poll: t.poll ? this.forumPollView(t.poll, user, mod) : null,
      fav: (user.forumFav || []).includes(t.id), canPost: !t.closed && !t.deleted && !this.forumBanned(user) && !low, ban: this.forumBanned(user) || low, page: pg, pages,
      posts: list.slice(pg * POSTS_PAGE, pg * POSTS_PAGE + POSTS_PAGE).map((p) => { const u = this.userById(p.byId);
        return { id: p.id, by: p.by, byId: p.byId, at: p.at, text: p.text, color: p.color || '', deleted: !!p.deleted, reply: p.reply || null, role: u ? (u.admin ? 'admin' : u.mod || s.mods.includes(u.id) ? 'mod' : '') : '',
          race: u ? u.race : '', ava: (u && u.avatar) || 0 }; }) }; // аватарка автора (своя или портрет расы) — как в переписке
  };

  P.forumOp = function forumOp(user, m) {
    const fd = this.forumDb(), now = Date.now();
    switch (m.op) {
      case 'topic': { // новая тема — только модераторы
        const s = this.forumSection(m.section); if (!s) return { error: 'Раздел не найден.' };
        if (!this.forumCanMod(user, s)) return { error: 'Темы создают только модераторы.' };
        const title = clean(m.title, TITLE_MAX), text = clean(m.text, TEXT_MAX);
        if (title.length < 3) return { error: 'Название темы — от 3 символов.' };
        if (!text) return { error: 'Напишите первое сообщение темы.' };
        const t = { id: fd.nextId++, title, by: user.login, byId: user.id, at: now, pinned: false, closed: false, deleted: false, posts: [{ id: fd.nextId++, by: user.login, byId: user.id, at: now, text, color: this.msgColor(user) }] };
        s.topics.push(t); this.store.save();
        return { msg: 'Тема создана.', topic: t.id };
      }
      case 'post': { // ответ — любой игрок, кроме запрещённых
        const f = this.forumTopic(m.topic); if (!f || f.t.deleted) return { error: 'Тема не найдена.' };
        if (f.t.closed) return { error: 'Тема закрыта.' };
        const ban = this.forumBanned(user); if (ban) return { error: ban };
        if (!this.forumCanMod(user, f.s) && this.talkLow && this.talkLow(user)) return { error: this.talkLowMsg(user, 'Писать на форуме') }; // рейтинг от 300
        if (!this.forumCanMod(user, f.s) && user.forumLast && now - user.forumLast < POST_GAP_MS) return { error: 'Не так часто — подождите несколько секунд.' };
        const text = clean(m.text, TEXT_MAX); if (!text) return { error: 'Пустое сообщение.' };
        // «Ответить» у сообщения: ответ помнит, кому (ник и начало его сообщения), автору — уведомление
        const to = m.reply ? f.t.posts.find((p) => p.id === Number(m.reply) && !p.deleted) : null;
        const reply = to ? { id: to.id, by: to.by, text: to.text.length > 90 ? `${to.text.slice(0, 90)}…` : to.text } : undefined;
        f.t.posts.push({ id: fd.nextId++, by: user.login, byId: user.id, at: now, text, color: this.msgColor(user), ...(reply ? { reply } : {}) }); user.forumLast = now;
        if (to && to.byId !== user.id && this.event) this.event(to.byId, `💬 ${user.login} ответил(а) вам на форуме в теме «${f.t.title}».`);
        if (f.t.posts.length > 5000) f.t.posts.splice(1, f.t.posts.length - 5000);
        this.store.save();
        return { msg: 'Сообщение добавлено.', topic: f.t.id };
      }
      case 'fav': { // избранные темы (звёздочка)
        const f = this.forumTopic(m.topic); if (!f) return { error: 'Тема не найдена.' };
        const fav = new Set(user.forumFav || []);
        if (fav.has(f.t.id)) fav.delete(f.t.id); else fav.add(f.t.id);
        user.forumFav = [...fav].slice(-50); this.store.save();
        return { msg: fav.has(f.t.id) ? 'Тема добавлена в избранное.' : 'Тема убрана из избранного.', topic: f.t.id };
      }
      case 'topicop': { // закрепить / закрыть / удалить / восстановить
        const f = this.forumTopic(m.topic); if (!f) return { error: 'Тема не найдена.' };
        if (!this.forumCanMod(user, f.s)) return { error: 'Нет прав модератора.' };
        const a = m.act, t = f.t;
        if (a === 'pin') t.pinned = !t.pinned; else if (a === 'close') t.closed = !t.closed;
        else if (a === 'delete') t.deleted = true; else if (a === 'restore') t.deleted = false;
        else if (a === 'rename') { const title = clean(m.title, TITLE_MAX); if (title.length < 3) return { error: 'Название темы — от 3 символов.' }; t.title = title; }
        else return { error: 'Неизвестное действие.' };
        this.store.save();
        return { msg: { pin: t.pinned ? 'Тема закреплена.' : 'Тема откреплена.', close: t.closed ? 'Тема закрыта.' : 'Тема открыта.', delete: 'Тема удалена.', restore: 'Тема восстановлена.', rename: 'Тема переименована.' }[a], topic: t.id, section: f.s.id };
      }
      case 'postdel': { // удалить / восстановить сообщение
        const f = this.forumTopic(m.topic); if (!f) return { error: 'Тема не найдена.' };
        if (!this.forumCanMod(user, f.s)) return { error: 'Нет прав модератора.' };
        const p = f.t.posts.find((x) => x.id === Number(m.post)); if (!p) return { error: 'Сообщение не найдено.' };
        p.deleted = !p.deleted; this.store.save();
        return { msg: p.deleted ? 'Сообщение удалено.' : 'Сообщение восстановлено.', topic: f.t.id };
      }
      case 'ban': { // запрет писать на форуме: часы, 0 — снять, -1 — навсегда
        const f = m.topic ? this.forumTopic(m.topic) : null;
        if (!this.forumCanMod(user, f && f.s)) return { error: 'Нет прав модератора.' };
        const t = this.userById(Number(m.id)); if (!t) return { error: 'Игрок не найден.' };
        if (t.admin || (t.smod && !user.admin) || (t.mod && !user.admin && !user.smod)) return { error: 'Модератора запретить нельзя.' };
        const h = Number(m.hours); if (!Number.isFinite(h)) return { error: 'Укажите срок.' };
        t.forumBan = h === 0 ? 0 : h < 0 ? -1 : now + Math.min(h, 24 * 365) * 3600000;
        if (h !== 0) { t.violations = (t.violations || 0) + 1; this.event(t.id, h < 0 ? 'Вам запрещено писать на форуме навсегда.' : `Вам запрещено писать на форуме на ${h} ч.`); }
        this.store.save();
        return { msg: h === 0 ? `${t.login}: запрет снят.` : `${t.login}: запрет на форуме ${h < 0 ? 'навсегда' : `на ${h} ч.`}` };
      }
      case 'pollcreate': { // опрос в теме — только модераторы; в теме один опрос
        const f = this.forumTopic(m.topic); if (!f || f.t.deleted) return { error: 'Тема не найдена.' };
        if (!this.forumCanMod(user, f.s)) return { error: 'Опрос создают только модераторы.' };
        if (f.t.poll) return { error: 'В теме уже есть опрос — сначала удалите его.' };
        const pm = this.pollMake(m, user, now); if (pm.error) return pm;
        f.t.poll = pm.poll; this.store.save();
        return { msg: 'Опрос создан.', topic: f.t.id };
      }
      case 'pollvote': case 'pollunvote': { // голос (один раз; несколько вариантов — если разрешено) и отмена голоса, пока опрос открыт
        const f = this.forumTopic(m.topic); if (!f || f.t.deleted || !f.t.poll) return { error: 'Опрос не найден.' };
        const r = this.pollVote(f.t.poll, user, m.opts, m.op === 'pollunvote', now); if (r.error) return r;
        this.store.save(); return { msg: r.msg, topic: f.t.id };
      }
      case 'pollclose': case 'polldel': { // завершить (итоги остаются) / удалить опрос — модераторы
        const f = this.forumTopic(m.topic); if (!f || !f.t.poll) return { error: 'Опрос не найден.' };
        if (!this.forumCanMod(user, f.s)) return { error: 'Нет прав модератора.' };
        if (m.op === 'polldel') { delete f.t.poll; this.store.save(); return { msg: 'Опрос удалён.', topic: f.t.id }; }
        f.t.poll.closed = true; this.store.save();
        return { msg: 'Опрос завершён — итоги видны всем.', topic: f.t.id };
      }
      case 'secmod': { // назначить / снять модератора раздела — только админ
        if (!user.admin) return { error: 'Назначает только администратор.' };
        const s = this.forumSection(m.section); if (!s) return { error: 'Раздел не найден.' };
        const key = String(m.login || '').trim();
        const t = Object.prototype.hasOwnProperty.call(this.db.users, key) ? this.db.users[key] : null; if (!t) return { error: 'Игрок не найден.' };
        if (s.mods.includes(t.id)) s.mods = s.mods.filter((x) => x !== t.id);
        else { s.mods.push(t.id); this.event(t.id, `Вас назначили модератором раздела форума «${s.name}».`); }
        this.store.save();
        return { msg: `${t.login}: ${s.mods.includes(t.id) ? 'модератор' : 'больше не модератор'} раздела «${s.name}».` };
      }
      default: return { error: 'Неизвестная команда форума.' };
    }
  };
  // избранные темы игрока
  P.forumFavs = function forumFavs(user) {
    return (user.forumFav || []).map((id) => this.forumTopic(id)).filter((f) => f && !f.t.deleted)
      .map(({ s, t }) => { const l = lastOf(t); return { id: t.id, title: t.title, section: s.name, replies: Math.max(0, t.posts.filter((x) => !x.deleted).length - 1), last: l ? { at: l.at, by: l.by } : null }; });
  };
}

module.exports = { install, SECTIONS };
