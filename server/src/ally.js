'use strict';
// Альянс как в оригинале: карточка (название, ранг, рейтинг, состав, верховенство), управление с правами,
// звания и погоны, устав, описание, дипломатия, казна и кладовая, рассылки, реклама, форум, новости, логи.
// Основные операции (создать, пригласить, заявки, исключить, покинуть) — P.alliance в army.js.

const START_REP = 10;
// права (окно «Назначение прав»)
const RIGHTS = { mail: 'Рассылка уведомлений', invite: 'Приглашение в альянс', kick: 'Исключение из альянса', rights: 'Назначение прав',
  desc: 'Изменение описания', news: 'Новости и форум', diplo: 'Дипломатия', treasury: 'Казначейство', logs: 'Чтение логов', albums: 'Альбомы' };
const DIPLO = { ally: 'Союз', nap: 'Пакт о ненападении', war: 'Война' };
const RES4 = ['wood', 'stone', 'iron', 'food'];
const clean = (s, n) => String(s || '').trim().slice(0, n);

function install(Game) {
  const P = Game.prototype;

  P.allyCan = function allyCan(al, uid, right) {
    if (!al) return false;
    if (al.leader === uid) return true;
    const r = (al.ranks || {})[uid];
    return !!(r && r.rights && r.rights.includes(right));
  };
  P.allyLog = function allyLog(al, text, kind = 'log') {
    const key = kind === 'store' ? 'slog' : 'log';
    (al[key] = al[key] || []).push({ at: Date.now(), text });
    if (al[key].length > 300) al[key].splice(0, al[key].length - 300);
  };
  P.allyRank = function allyRank(al) {
    if (!al) return 0;
    return this.ratingAlliances().findIndex((a) => a.id === al.id) + 1;
  };
  P.allyTitle = function allyTitle(al, uid) {
    if (al.leader === uid) return { title: 'Создатель альянса', ep: 4 };
    const r = (al.ranks || {})[uid];
    return r ? { title: r.title || 'Участник', ep: r.ep || 0 } : { title: 'Участник', ep: 0 };
  };

  // полная карточка альянса для окна «Альянс»
  P.allyView = function allyView(user, al) {
    const me = user.id, can = (r) => this.allyCan(al, me, r), now = Date.now();
    const members = al.members.map((id) => { const m = this.userById(id); if (!m) return null;
      const t = this.allyTitle(al, id); return { id, login: m.login, rating: this.userRating(m), rep: m.reputation ?? START_REP, score: this.userRating(m) + (m.reputation ?? START_REP), ...t,
        rights: id === al.leader ? Object.keys(RIGHTS) : ((al.ranks || {})[id] || {}).rights || [] }; }).filter(Boolean).sort((a, b) => b.score - a.score);
    const A = this.db.alliances || {};
    const reports = can('logs') ? (this.db.reports || []).filter((r) => al.members.includes(r.owner) && ['battle', 'scout'].includes(r.kind)).slice(-100).reverse()
      .map((r) => ({ id: r.id, login: (this.userById(r.owner) || {}).login, title: r.title, at: r.at })) : [];
    return {
      id: al.id, tag: al.tag, name: al.name, desc: al.desc || '', charter: al.charter || '', ad: al.ad || '', created: al.created,
      rank: this.allyRank(al), score: this.allianceScore(al), leader: al.leader, leaderLogin: (this.userById(al.leader) || {}).login, slots: this.allianceSlots(al),
      members, my: { lead: al.leader === me, rights: Object.keys(RIGHTS).filter(can) },
      requests: can('invite') ? (al.requests || []).map((id) => { const m = this.userById(id); return m ? { id, login: m.login, rating: this.userRating(m) } : null; }).filter(Boolean) : [],
      invited: can('invite') ? Object.values(this.db.users).filter((u) => (u.invites || []).includes(al.id)).map((u) => u.login) : [],
      treasury: al.treasury || 0, storage: al.storage || { wood: 0, stone: 0, iron: 0, food: 0 },
      diplo: Object.entries(al.diplo || {}).map(([id, st]) => (A[id] ? { id: Number(id), tag: A[id].tag, name: A[id].name, status: st, statusName: DIPLO[st] } : null)).filter(Boolean),
      news: (al.news || []).slice().reverse(),
      forum: (al.forum || []).filter((t) => !t.deleted || can('news')).map((t) => ({ id: t.id, title: t.title, by: t.by, at: t.at, pinned: !!t.pinned, closed: !!t.closed, deleted: !!t.deleted,
        replies: t.posts.length, last: t.posts[t.posts.length - 1] })).sort((a, b) => (b.pinned - a.pinned) || ((b.last ? b.last.at : b.at) - (a.last ? a.last.at : a.at))),
      log: can('logs') ? (al.log || []).slice(-100).reverse() : [], slog: can('logs') ? (al.slog || []).slice(-100).reverse() : [], reports,
      rightsList: RIGHTS, now,
    };
  };
  P.allyTopic = function allyTopic(user, al, id) {
    const t = (al.forum || []).find((x) => x.id === Number(id)); if (!t || (t.deleted && !this.allyCan(al, user.id, 'news'))) return null;
    return { id: t.id, title: t.title, closed: !!t.closed, pinned: !!t.pinned, posts: t.posts.map((p) => { const u = this.userById(p.byId); return { ...p, rep: u ? u.reputation ?? START_REP : START_REP }; }) };
  };

  // все операции окна «Альянс»
  P.allyOp = function allyOp(user, castle, m) {
    const al = this.allianceOf(user); if (!al) return { error: 'Вы не в альянсе.' };
    const can = (r) => this.allyCan(al, user.id, r), need = (r) => (can(r) ? null : { error: `Нет права: ${RIGHTS[r]}.` });
    const find = (login) => this.db.users[String(login || '').trim().toLowerCase()];
    const member = (login) => { const t = find(login); return t && al.members.includes(t.id) ? t : null; };
    const now = Date.now();
    const done = (msg) => { this.store.save(); return { ok: true, msg }; };
    switch (m.op) {
      case 'rank': { // звание, погоны и права участника
        const e = need('rights'); if (e) return e;
        const t = member(m.login); if (!t) return { error: 'Игрок не в альянсе.' };
        if (t.id === al.leader) return { error: 'Права создателя изменить нельзя.' };
        const rights = (Array.isArray(m.rights) ? m.rights : []).filter((r) => RIGHTS[r]);
        (al.ranks = al.ranks || {})[t.id] = { title: clean(m.title, 24) || 'Участник', ep: Math.max(0, Math.min(3, Number(m.ep) || 0)), rights };
        this.allyLog(al, `${user.login} назначил ${t.login}: «${al.ranks[t.id].title}»`);
        return done(`Права назначены: ${t.login}.`);
      }
      case 'desc': {
        const e = need('desc'); if (e) return e;
        const tag = clean(m.tag, 5).toUpperCase(), name = clean(m.name, 24);
        if (tag.length < 2 || name.length < 3) return { error: 'Короткое название 2–5 символов, полное — от 3.' };
        if (Object.values(this.db.alliances).some((x) => x !== al && x.tag === tag)) return { error: 'Такое короткое название уже занято.' };
        al.tag = tag; al.name = name; al.desc = clean(m.desc, 1000);
        this.allyLog(al, `${user.login} изменил описание альянса`);
        return done('Описание изменено.');
      }
      case 'charter': { const e = need('desc'); if (e) return e; al.charter = clean(m.text, 3000); return done('Устав сохранён.'); }
      case 'ad': { const e = need('invite'); if (e) return e; al.ad = clean(m.text, 300); return done(al.ad ? 'Реклама размещена.' : 'Реклама снята.'); }
      case 'mail': {
        const e = need('mail'); if (e) return e;
        const text = clean(m.text, 2000); if (!text) return { error: 'Введите текст.' };
        for (const id of al.members) { const u = this.userById(id); if (u && u.id !== user.id) { this.sendMail(user, u.login, `Рассылка альянса [${al.tag}]`, text); this.event(u.id, `Рассылка альянса [${al.tag}] от ${user.login}.`); } }
        return done('Рассылка отправлена всем участникам.');
      }
      case 'gold': { // казна: взнос (любой) или выдача (казначейство)
        const n = Math.floor(Number(m.n)); if (!(n > 0)) return { error: 'Укажите количество.' };
        if (m.to) {
          const e = need('treasury'); if (e) return e;
          const t = member(m.to); if (!t) return { error: 'Игрок не в альянсе.' };
          if ((al.treasury || 0) < n) return { error: 'В казне столько нет.' };
          al.treasury -= n; t.gold = (t.gold || 0) + n;
          this.allyLog(al, `${user.login} выдал из казны ${t.login}: ${n} золота`, 'store');
          return done(`Выдано ${n} золота: ${t.login}.`);
        }
        if ((user.gold || 0) < n) return { error: 'Не хватает золота.' };
        user.gold -= n; al.treasury = (al.treasury || 0) + n;
        this.allyLog(al, `${user.login} внёс в казну ${n} золота`, 'store');
        return done(`Внесено в казну: ${n} золота.`);
      }
      case 'store': { // кладовая: взнос ресурсов из своего замка или выдача участнику
        al.storage = al.storage || { wood: 0, stone: 0, iron: 0, food: 0 };
        const res = Object.fromEntries(RES4.map((r) => [r, Math.max(0, Math.floor(Number((m.res || {})[r]) || 0))]));
        if (!RES4.some((r) => res[r])) return { error: 'Укажите ресурсы.' };
        const line = RES4.filter((r) => res[r]).map((r) => `${{ wood: 'дерево', stone: 'камень', iron: 'железо', food: 'еда' }[r]} ${res[r]}`).join(', ');
        if (m.to) {
          const e = need('treasury'); if (e) return e;
          const t = member(m.to); if (!t) return { error: 'Игрок не в альянсе.' };
          for (const r of RES4) if (al.storage[r] < res[r]) return { error: 'В кладовой столько нет.' };
          const c = this.castleOf(t); this.tick(c); const cap = this.capacity(c);
          for (const r of RES4) { al.storage[r] -= res[r]; c.res[r] = Math.min(cap[r], c.res[r] + res[r]); }
          this.allyLog(al, `${user.login} выдал из кладовой ${t.login}: ${line}`, 'store');
          return done(`Выдано из кладовой: ${t.login}.`);
        }
        this.tick(castle);
        for (const r of RES4) if (castle.res[r] < res[r]) return { error: 'В замке столько нет.' };
        for (const r of RES4) { castle.res[r] -= res[r]; al.storage[r] += res[r]; }
        this.allyLog(al, `${user.login} внёс в кладовую: ${line}`, 'store');
        return done('Ресурсы внесены в кладовую.');
      }
      case 'diplo': {
        const e = need('diplo'); if (e) return e;
        const other = Object.values(this.db.alliances).find((x) => x.tag === clean(m.tag, 5).toUpperCase());
        if (!other || other === al) return { error: 'Альянс не найден.' };
        al.diplo = al.diplo || {};
        if (!DIPLO[m.status]) delete al.diplo[other.id]; else al.diplo[other.id] = m.status;
        this.allyLog(al, `${user.login}: [${other.tag}] — ${DIPLO[m.status] || 'отношения сброшены'}`);
        this.allyLog(other, `[${al.tag}] объявил: ${DIPLO[m.status] || 'отношения сброшены'}`);
        return done(`[${other.tag}]: ${DIPLO[m.status] || 'нейтралитет'}.`);
      }
      case 'transfer': { // «Сместить Создателя»: создатель передаёт альянс, или офицер с правами — если создателя нет 14 дней
        const t = member(m.login); if (!t) return { error: 'Игрок не в альянсе.' };
        const lead = this.userById(al.leader), away = lead ? (now - (lead.lastSeen || lead.created || now)) / 86400000 : 99;
        if (al.leader !== user.id && !(can('rights') && away > 14)) return { error: 'Сместить создателя можно, если его нет в игре больше 14 дней.' };
        const old = al.leader; al.leader = t.id; if (al.ranks) delete al.ranks[t.id];
        (al.ranks = al.ranks || {})[old] = { title: 'Бывший создатель', ep: 3, rights: Object.keys(RIGHTS) };
        this.allyLog(al, `Новый создатель альянса: ${t.login}`);
        return done(`Создатель альянса: ${t.login}.`);
      }
      case 'topic': {
        const title = clean(m.title, 60), text = clean(m.text, 2000); if (!title || !text) return { error: 'Введите тему и текст.' };
        const t = { id: this.db.nextId++, title, by: user.login, byId: user.id, at: now, posts: [{ by: user.login, byId: user.id, at: now, text }] };
        (al.forum = al.forum || []).push(t);
        return { ...done('Тема создана.'), topic: t.id };
      }
      case 'post': {
        const t = (al.forum || []).find((x) => x.id === Number(m.topic)); if (!t || t.deleted) return { error: 'Тема не найдена.' };
        if (t.closed && !can('news')) return { error: 'Тема закрыта.' };
        const text = clean(m.text, 2000); if (!text) return { error: 'Введите текст.' };
        t.posts.push({ by: user.login, byId: user.id, at: now, text }); if (t.posts.length > 500) t.posts.shift();
        return done('Сообщение добавлено.');
      }
      case 'topicop': {
        const e = need('news'); if (e) return e;
        const t = (al.forum || []).find((x) => x.id === Number(m.topic)); if (!t) return { error: 'Тема не найдена.' };
        if (m.act === 'pin') t.pinned = !t.pinned; else if (m.act === 'close') t.closed = !t.closed;
        else if (m.act === 'delete') t.deleted = true; else if (m.act === 'restore') t.deleted = false; else return { error: 'Неизвестное действие.' };
        return done('Готово.');
      }
      case 'news': {
        const e = need('news'); if (e) return e;
        if (m.del) { al.news = (al.news || []).filter((x) => x.id !== Number(m.del)); return done('Новость удалена.'); }
        const title = clean(m.title, 80), text = clean(m.text, 2000); if (!title || !text) return { error: 'Введите тему и текст новости.' };
        (al.news = al.news || []).push({ id: this.db.nextId++, title, text, by: user.login, at: now }); if (al.news.length > 100) al.news.shift();
        for (const id of al.members) if (id !== user.id) this.event(id, `Новость альянса [${al.tag}]: ${title}`);
        return done('Новость добавлена.');
      }
      default: return { error: 'Неизвестное действие.' };
    }
  };
}

module.exports = { install, RIGHTS, DIPLO };
