'use strict';
// Новости от администрации (Инфо → Новости): список, чтение, комментарии. Публикует админ (админка → Мир).
// Непрочитанная новость показывается фиолетовым конвертом в верхней панели; после прочтения конверт исчезает,
// а новость остаётся в списке. Комментировать могут все, удалять комментарии — модераторы.

const PAGE = 8, TITLE_MAX = 80, TEXT_MAX = 4000, COMMENT_MAX = 300, COMMENT_GAP_MS = 10000;
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').slice(0, n).trim();

function install(Game) {
  const P = Game.prototype;
  P.newsDb = function newsDb() { return (this.db.news = this.db.news || []); };
  // сколько новостей игрок ещё не читал (не считаются опубликованные до его регистрации)
  // доклад советника при входе: игроков в игре, нападения и отчёты за время отсутствия, новые подарки, непрочитанные письма и новости
  P.welcomeInfo = function welcomeInfo(u, since) {
    const players = Object.values(this.db.users).filter((x) => !x.bot && !x.banned).length;
    const mine = (this.db.reports || []).filter((r) => r.owner === u.id && !r.read);
    const attacks = mine.filter((r) => r.at > since && r.data && r.data.type === 'battle' && r.data.side === 'def').length;
    const mail = (this.db.messages || []).filter((x) => x.to === u.id && !x.read).length;
    const gifts = (u.gifts || []).filter((x) => x.at > since).length;
    const b = this.bossNow(), bs = this.db.boss; // мировой босс: где он сейчас или когда появится
    const boss = b ? { on: true, kind: b.kind, name: b.name, x: b.x, y: b.y, end: b.end, pct: Math.round(b.hp / b.maxHp * 100) } : bs && bs.next ? { on: false, next: bs.next } : null;
    return { players, reports: mine.length, attacks, mail, gifts, news: this.newsUnread(u), boss };
  };
  P.newsUnread = function newsUnread(u) {
    const seen = new Set(u.newsRead || []);
    return this.newsDb().filter((n) => !n.deleted && n.at >= (u.created || 0) - 1000 && !seen.has(n.id)).length;
  };
  // самая свежая непрочитанная новость — её открывает фиолетовый конверт
  P.newsFirst = function newsFirst(u) {
    const seen = new Set(u.newsRead || []);
    const n = this.newsDb().filter((x) => !x.deleted && x.at >= (u.created || 0) - 1000 && !seen.has(x.id)).pop();
    return n ? n.id : 0;
  };
  // открыл новости с фиолетового конверта — все текущие новости считаются прочитанными (конверт исчезает)
  P.newsReadAll = function newsReadAll(u) {
    const seen = new Set(u.newsRead || []);
    for (const n of this.newsDb()) if (!n.deleted) seen.add(n.id);
    u.newsRead = [...seen].slice(-500); this.store.save();
  };
  P.newsList = function newsList(u, page = 0) {
    const all = this.newsDb().filter((n) => !n.deleted).slice().reverse(), seen = new Set(u.newsRead || []);
    const pages = Math.max(1, Math.ceil(all.length / PAGE)), pg = Math.max(0, Math.min(pages - 1, Math.floor(Number(page)) || 0));
    return { page: pg, pages, list: all.slice(pg * PAGE, pg * PAGE + PAGE).map((n) => ({ id: n.id, title: n.title, at: n.at, read: seen.has(n.id), comments: n.comments.filter((c) => !c.deleted).length })) };
  };
  P.newsGet = function newsGet(u, id) {
    const n = this.newsDb().find((x) => x.id === Number(id) && !x.deleted); if (!n) return { error: 'Новость не найдена.' };
    if (!(u.newsRead || []).includes(n.id)) { (u.newsRead = u.newsRead || []).push(n.id); if (u.newsRead.length > 500) u.newsRead.shift(); this.store.save(); }
    return { id: n.id, title: n.title, text: n.text, at: n.at, canMod: this.canModerate(u),
      comments: n.comments.filter((c) => !c.deleted).slice(-100).map((c) => ({ id: c.id, by: c.by, byId: c.byId, text: c.text, at: c.at })) };
  };
  P.newsOp = function newsOp(u, m) {
    const db = this.newsDb(), now = Date.now();
    switch (m.op) {
      case 'publish': {
        if (!u.admin) return { error: 'Публикует только администратор.' };
        const title = clean(m.title, TITLE_MAX), text = String(m.text || '').replace(/[<>]/g, '').slice(0, TEXT_MAX).trim();
        if (title.length < 3 || !text) return { error: 'Нужны заголовок (от 3 символов) и текст.' };
        const n = { id: this.db.nextId++, title, text, at: now, by: u.login, comments: [] }; db.push(n);
        if (db.length > 300) db.shift();
        this.store.save(); return { msg: 'Новость опубликована — игроки увидят фиолетовый конверт.', id: n.id };
      }
      case 'delete': {
        if (!u.admin) return { error: 'Удаляет только администратор.' };
        const n = db.find((x) => x.id === Number(m.id)); if (!n) return { error: 'Новость не найдена.' };
        n.deleted = true; this.store.save(); return { msg: 'Новость удалена.' };
      }
      case 'comment': {
        const n = db.find((x) => x.id === Number(m.id) && !x.deleted); if (!n) return { error: 'Новость не найдена.' };
        const text = clean(m.text, COMMENT_MAX); if (!text) return { error: 'Пустой комментарий.' };
        const ban = this.forumBanned ? this.forumBanned(u) : null; if (ban) return { error: ban };
        if (!this.canModerate(u) && u.newsCmtAt && now - u.newsCmtAt < COMMENT_GAP_MS) return { error: 'Не так часто — подождите несколько секунд.' };
        n.comments.push({ id: this.db.nextId++, by: u.login, byId: u.id, text, at: now }); u.newsCmtAt = now;
        if (n.comments.length > 500) n.comments.shift();
        this.store.save(); return { msg: 'Комментарий добавлен.', id: n.id };
      }
      case 'cmtdel': {
        if (!this.canModerate(u)) return { error: 'Нет прав модератора.' };
        const n = db.find((x) => x.id === Number(m.id)); const c = n && n.comments.find((x) => x.id === Number(m.comment));
        if (!c) return { error: 'Комментарий не найден.' };
        c.deleted = true; this.store.save(); return { msg: 'Комментарий удалён.', id: n.id };
      }
      default: return { error: 'Неизвестная команда.' };
    }
  };
}
module.exports = { install };
