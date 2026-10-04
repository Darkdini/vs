'use strict';
// Новости от администрации (Инфо → Новости): список, чтение, комментарии. Публикует админ (админка → Мир).
// Непрочитанная новость показывается фиолетовым конвертом в верхней панели; после прочтения конверт исчезает,
// а новость остаётся в списке. Комментировать могут все, удалять комментарии — модераторы.

const PAGE = 8, TITLE_MAX = 80, TEXT_MAX = 4000, COMMENT_MAX = 300, COMMENT_GAP_MS = 10000;
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').slice(0, n).trim();
// скриншоты к новости: как фото в сообщениях — браузер шлёт только сжатые цвета точек (RGB, deflate), сервер сам собирает новый PNG
// (чужих байтов в файле нет — ни скрипта, ни шелла). Имя файла — случайное (128 бит), хранится в data/news/<id>.png навсегда.
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const NP_SIDE = 1280, NP_PART = 160 * 1024, NP_PARTS = 24, NP_MAX = 4;
const NP_LIFE = 90 * 86400000, NP_ORPHAN = 86400000; // скриншот живёт 3 месяца; загруженный, но не опубликованный — сутки

function install(Game) {
  const P = Game.prototype;
  P.newsPicDir = function newsPicDir() { return path.join(path.dirname(path.resolve(this.store.file)), 'news'); };
  P.newsPicFile = function newsPicFile(id) { return /^[0-9a-f]{32}$/.test(String(id)) ? path.join(this.newsPicDir(), `${id}.png`) : null; };
  // загрузка скриншота (только админ / старший модератор — кто публикует): begin → part… → id картинки
  P.newsPicBegin = function newsPicBegin(u, w, h, n) {
    if (!u.admin && !u.smod) return { error: 'Нет прав.' };
    w = Math.floor(Number(w)); h = Math.floor(Number(h)); n = Math.floor(Number(n));
    if (!(w >= 8 && h >= 8 && w <= NP_SIDE && h <= NP_SIDE) || !(n >= 1 && n <= NP_PARTS)) return { error: 'Неверная картинка.' };
    return { ok: true, up: { w, h, n, parts: [] } };
  };
  P.newsPicPart = async function newsPicPart(u, up, i, data) {
    i = Math.floor(Number(i));
    if (!up || i !== up.parts.length || typeof data !== 'string') return { error: 'Скриншот: неверная часть — загрузите заново.' };
    const buf = Buffer.from(data, 'base64'); if (!buf.length || buf.length > NP_PART) return { error: 'Скриншот: слишком большая часть.' };
    up.parts.push(buf); if (up.parts.length < up.n) return { ok: true, more: true };
    const raw = await new Promise((res) => zlib.inflate(Buffer.concat(up.parts), { maxOutputLength: up.w * up.h * 3 + 1 }, (e, out) => res(e ? null : out)));
    if (!raw || raw.length !== up.w * up.h * 3) return { error: 'Скриншот повреждён — попробуйте другой.' };
    const rgba = Buffer.alloc(up.w * up.h * 4);
    for (let s = 0, d = 0; s < raw.length; s += 3, d += 4) { rgba[d] = raw[s]; rgba[d + 1] = raw[s + 1]; rgba[d + 2] = raw[s + 2]; rgba[d + 3] = 255; }
    const id = crypto.randomBytes(16).toString('hex');
    fs.mkdirSync(this.newsPicDir(), { recursive: true }); fs.writeFileSync(this.newsPicFile(id), require('./avatar').encodePng(rgba, up.w, up.h));
    return { ok: true, id, w: up.w, h: up.h };
  };
  // уборка: файлы старше 3 месяцев (и неопубликованные старше суток) удаляются, из новостей пропадают ссылки на них
  P.newsPicSweep = function newsPicSweep(now = Date.now()) {
    let files = []; try { files = fs.readdirSync(this.newsPicDir()).filter((f) => /^[0-9a-f]{32}\.png$/.test(f)); } catch { return 0; }
    const used = new Set(); for (const n of this.newsDb()) for (const p of n.pics || []) used.add(p);
    let gone = 0;
    for (const f of files) {
      const id = f.slice(0, 32), file = this.newsPicFile(id); let at = now; try { at = fs.statSync(file).mtimeMs; } catch { continue; }
      if (now - at > NP_LIFE || (!used.has(id) && now - at > NP_ORPHAN)) { try { fs.unlinkSync(file); gone++; } catch { /* уже нет */ } }
    }
    let changed = false;
    for (const n of this.newsDb()) if (n.pics && n.pics.length) { const keep = n.pics.filter((p) => fs.existsSync(this.newsPicFile(p))); if (keep.length !== n.pics.length) { n.pics = keep; changed = true; } }
    if (changed) this.store.save();
    return gone;
  };
  P.newsDb = function newsDb() { return (this.db.news = this.db.news || []); };
  // сколько новостей игрок ещё не читал (не считаются опубликованные до его регистрации)
  // доклад советника при входе (число игроков онлайн добавляет web.js), нападения и отчёты за время отсутствия, новые подарки, непрочитанные письма и новости
  P.welcomeInfo = function welcomeInfo(u, since) {
    const mine = (this.db.reports || []).filter((r) => r.owner === u.id && !r.read);
    const attacks = mine.filter((r) => r.at > since && r.data && r.data.type === 'battle' && r.data.side === 'def').length;
    const mail = (this.db.messages || []).filter((x) => x.to === u.id && !x.read).length;
    const gifts = (u.gifts || []).filter((x) => x.at > since).length;
    const b = this.bossNow(), bs = this.db.boss; // мировой босс: где он сейчас или когда появится
    void bs; const boss = b ? { on: true, kind: b.kind, name: b.name, x: b.x, y: b.y } : null;
    return { reports: mine.length, attacks, mail, gifts, news: this.newsUnread(u), boss };
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
    return { id: n.id, title: n.title, text: n.text, at: n.at, pics: n.pics || [], canMod: this.canModerate(u),
      comments: n.comments.filter((c) => !c.deleted).slice(-100).map((c) => ({ id: c.id, by: c.by, byId: c.byId, text: c.text, at: c.at })) };
  };
  P.newsOp = function newsOp(u, m) {
    const db = this.newsDb(), now = Date.now();
    switch (m.op) {
      case 'publish': {
        if (!u.admin && !u.smod) return { error: 'Публикует администратор или старший модератор.' };
        const title = clean(m.title, TITLE_MAX), text = String(m.text || '').replace(/[<>]/g, '').slice(0, TEXT_MAX).trim();
        if (title.length < 3 || !text) return { error: 'Нужны заголовок (от 3 символов) и текст.' };
        const pics = [...new Set([].concat(m.pics || []).map(String))].filter((p) => { const f = this.newsPicFile(p); return f && fs.existsSync(f); }).slice(0, NP_MAX); // только загруженные на сервер
        const n = { id: this.db.nextId++, title, text, at: now, by: u.login, comments: [], ...(pics.length ? { pics } : {}) }; db.push(n);
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
