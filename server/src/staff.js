'use strict';
// «МАСТЕРА» — закрытый раздел общения админа и тестеров (Меню → «МАСТЕРА»), как группа в Telegram с темами:
// темы по конкретным проблемам, сообщения, фото на 24 часа (потом удаляются с сервера), опросы с голосованием.
// Видят и пишут только админ и действующие тестеры (closedtest.js). Фото — как в личных сообщениях (pics.js):
// браузер присылает сжатые цвета точек, сервер сам собирает PNG; отдаётся только по сессии участника.
const zlib = require('zlib');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const { encodePng } = require('./avatar');

const TOPICS_MAX = 200, MSGS_PER_TOPIC = 1000, SHOW = 150, TEXT_MAX = 2000, TITLE_MAX = 60;
const POLL_OPTS = 10, OPT_MAX = 80, PIC_LIFE = 24 * 3600000, PIC_SIDE = 1280, PIC_PART = 160 * 1024, PIC_PARTS = 24, PIC_DAY = 60;

function install(Game) {
  const P = Game.prototype;
  P.staffOk = function staffOk(u) { return !!u && !u.bot && (!!u.admin || (!!u.tester && !u.testerOff)); };
  P.staffDb = function staffDb() { return (this.db.staff = this.db.staff || { next: 1, topics: [], msgs: [] }); };
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
  const login = (g, id) => (g.userById(id) || {}).login || '—';
  const canMod = (u, owner) => !!u.admin || u.id === owner;

  P.staffPicDir = function staffPicDir() { return path.join(path.dirname(path.resolve(this.store.file)), 'staffpics'); };
  P.staffPicFile = function staffPicFile(id) { return /^[0-9a-f]{32}$/.test(String(id)) ? path.join(this.staffPicDir(), `${id}.png`) : null; };
  // уборка: фото старше суток удаляются с диска, в сообщении остаётся «фото удалено»
  P.staffSweep = function staffSweep(now = Date.now()) {
    const d = this.staffDb(); let changed = false;
    for (const m of d.msgs) if (m.pic && m.picExp <= now) { try { fs.unlinkSync(this.staffPicFile(m.pic)); } catch { /* уже нет */ } delete m.pic; m.picGone = true; changed = true; }
    if (changed) this.store.save();
  };
  const prevSweep = P.picSweep;
  P.picSweep = function picSweep(now) { if (prevSweep) prevSweep.call(this, now); this.staffSweep(now); };

  // непрочитанное: сообщения других участников новее отметки «прочитано» в теме
  P.staffUnread = function staffUnread(u, topicId) {
    if (!this.staffOk(u)) return 0;
    const d = this.staffDb(), read = u.staffRead || {}; let n = 0;
    for (const m of d.msgs) if ((topicId === undefined || m.t === topicId) && m.by !== u.id && m.id > (read[m.t] || 0) && d.topics.some((t) => t.id === m.t)) n++;
    return n;
  };
  P.staffView = function staffView(u) {
    const d = this.staffDb();
    const topics = d.topics.map((t) => {
      const ms = d.msgs.filter((m) => m.t === t.id), last = ms[ms.length - 1];
      return { id: t.id, title: t.title, by: login(this, t.by), at: t.at, pin: !!t.pin, closed: !!t.closed, count: ms.length, unread: this.staffUnread(u, t.id),
        last: last ? { at: last.at, by: login(this, last.by), text: last.poll ? `📊 ${last.poll.q}` : last.pic || last.picGone ? `📷 ${last.text || 'Фото'}` : last.text } : null, lastAt: last ? last.at : t.at };
    }).sort((a, b) => (b.pin - a.pin) || b.lastAt - a.lastAt);
    return { topics, admin: !!u.admin, members: Object.values(this.db.users).filter((x) => this.staffOk(x)).map((x) => ({ login: x.login, admin: !!x.admin, online: !!x.online && !x.admin })) };
  };
  const fmt = (g, u, m) => ({ id: m.id, by: login(g, m.by), byId: m.by, mine: m.by === u.id, admin: !!(g.userById(m.by) || {}).admin, at: m.at, text: m.text || '',
    pic: m.pic && m.picExp > Date.now() ? m.pic : null, picExp: m.pic ? m.picExp : 0, picGone: !!m.picGone, canDel: canMod(u, m.by),
    poll: m.poll ? { q: m.poll.q, multi: !!m.poll.multi, closed: !!m.poll.closed, canClose: canMod(u, m.by),
      total: Object.keys(m.poll.votes).length,
      opts: m.poll.opts.map((o, i) => { const who = Object.entries(m.poll.votes).filter(([, v]) => v.includes(i)).map(([id]) => login(g, Number(id))); return { text: o, n: who.length, who, mine: (m.poll.votes[u.id] || []).includes(i) }; }) } : null });
  // открыть тему: последние сообщения, отметка «прочитано»
  P.staffOpen = function staffOpen(u, topicId) {
    const d = this.staffDb(), t = d.topics.find((x) => x.id === Number(topicId)); if (!t) return { error: 'Тема не найдена.' };
    const ms = d.msgs.filter((m) => m.t === t.id);
    if (ms.length) { u.staffRead = u.staffRead || {}; u.staffRead[t.id] = ms[ms.length - 1].id; }
    return { topic: { id: t.id, title: t.title, by: login(this, t.by), at: t.at, pin: !!t.pin, closed: !!t.closed, canMod: canMod(u, t.by), admin: !!u.admin }, msgs: ms.slice(-SHOW).map((m) => fmt(this, u, m)), more: Math.max(0, ms.length - SHOW) };
  };
  const pushMsg = (g, t, msg) => {
    const d = g.staffDb(); d.msgs.push(msg);
    const ms = d.msgs.filter((m) => m.t === t.id); if (ms.length > MSGS_PER_TOPIC) { const drop = new Set(ms.slice(0, ms.length - MSGS_PER_TOPIC)); d.msgs = d.msgs.filter((m) => !drop.has(m)); }
  };
  P.staffOp = function staffOp(u, m) {
    if (!this.staffOk(u)) return { error: 'Раздел только для мастеров.' };
    const d = this.staffDb(), op = String(m.op || ''), now = Date.now();
    const topic = () => d.topics.find((x) => x.id === Number(m.topic));
    const msg = () => d.msgs.find((x) => x.id === Number(m.msg));
    const flood = () => { u.staffLog = (u.staffLog || []).filter((x) => x > now - 60000); if (u.staffLog.length >= 30) return 'Слишком часто — подождите минуту.'; u.staffLog.push(now); return null; };
    switch (op) {
      case 'newtopic': {
        const title = clean(m.title, TITLE_MAX), text = clean(m.text, TEXT_MAX); if (title.length < 2) return { error: 'Название темы — от 2 символов.' };
        const f = flood(); if (f) return { error: f };
        if (d.topics.length >= TOPICS_MAX) return { error: `Тем не больше ${TOPICS_MAX} — удалите старые.` };
        const t = { id: d.next++, title, by: u.id, at: now }; d.topics.push(t);
        if (text) pushMsg(this, t, { id: d.next++, t: t.id, by: u.id, at: now, text });
        this.store.save(); return { ok: true, topic: t.id, msg: 'Тема создана.' };
      }
      case 'post': {
        const t = topic(); if (!t) return { error: 'Тема не найдена.' }; if (t.closed && !u.admin) return { error: 'Тема закрыта.' };
        const text = clean(m.text, TEXT_MAX); if (!text) return { error: 'Пустое сообщение.' };
        const f = flood(); if (f) return { error: f };
        pushMsg(this, t, { id: d.next++, t: t.id, by: u.id, at: now, text }); this.store.save(); return { ok: true, topic: t.id };
      }
      case 'poll': {
        const t = topic(); if (!t) return { error: 'Тема не найдена.' }; if (t.closed && !u.admin) return { error: 'Тема закрыта.' };
        const q = clean(m.q, 200), opts = [...new Set([].concat(m.opts || []).map((o) => clean(o, OPT_MAX)).filter(Boolean))].slice(0, POLL_OPTS);
        if (q.length < 2) return { error: 'Напишите вопрос.' }; if (opts.length < 2) return { error: 'Нужно хотя бы 2 варианта ответа.' };
        const f = flood(); if (f) return { error: f };
        pushMsg(this, t, { id: d.next++, t: t.id, by: u.id, at: now, poll: { q, opts, multi: !!m.multi, votes: {} } }); this.store.save(); return { ok: true, topic: t.id };
      }
      case 'vote': { // голос: один вариант (повторное нажатие — снять) или несколько, если опрос с выбором нескольких
        const x = msg(); if (!x || !x.poll) return { error: 'Опрос не найден.' }; if (x.poll.closed) return { error: 'Голосование завершено.' };
        const i = Math.floor(Number(m.opt)); if (!(i >= 0 && i < x.poll.opts.length)) return { error: 'Нет такого варианта.' };
        const cur = x.poll.votes[u.id] || [];
        const next = cur.includes(i) ? cur.filter((v) => v !== i) : x.poll.multi ? [...cur, i] : [i];
        if (next.length) x.poll.votes[u.id] = next; else delete x.poll.votes[u.id];
        this.store.save(); return { ok: true, topic: x.t };
      }
      case 'pollclose': { const x = msg(); if (!x || !x.poll) return { error: 'Опрос не найден.' }; if (!canMod(u, x.by)) return { error: 'Завершить может автор или админ.' }; x.poll.closed = true; this.store.save(); return { ok: true, topic: x.t, msg: 'Голосование завершено.' }; }
      case 'del': {
        const x = msg(); if (!x) return { error: 'Сообщение не найдено.' }; if (!canMod(u, x.by)) return { error: 'Удалить может автор или админ.' };
        if (x.pic) { try { fs.unlinkSync(this.staffPicFile(x.pic)); } catch { /* нет */ } }
        d.msgs = d.msgs.filter((y) => y !== x); this.store.save(); return { ok: true, topic: x.t };
      }
      case 'topicdel': {
        const t = topic(); if (!t) return { error: 'Тема не найдена.' }; if (!canMod(u, t.by)) return { error: 'Удалить тему может автор или админ.' };
        for (const x of d.msgs) if (x.t === t.id && x.pic) { try { fs.unlinkSync(this.staffPicFile(x.pic)); } catch { /* нет */ } }
        d.msgs = d.msgs.filter((x) => x.t !== t.id); d.topics = d.topics.filter((x) => x !== t); this.store.save(); return { ok: true, msg: 'Тема удалена.', gone: t.id };
      }
      case 'pin': { const t = topic(); if (!t) return { error: 'Тема не найдена.' }; if (!u.admin) return { error: 'Закреплять может админ.' }; t.pin = !t.pin; this.store.save(); return { ok: true, topic: t.id, msg: t.pin ? 'Тема закреплена.' : 'Тема откреплена.' }; }
      case 'close': { const t = topic(); if (!t) return { error: 'Тема не найдена.' }; if (!canMod(u, t.by)) return { error: 'Закрыть может автор или админ.' }; t.closed = !t.closed; this.store.save(); return { ok: true, topic: t.id, msg: t.closed ? 'Тема закрыта: писать в неё нельзя.' : 'Тема открыта.' }; }
      default: return { error: 'Неизвестное действие.' };
    }
  };

  // фото к сообщению: begin → part… → сообщение с фото на 24 часа
  P.staffPicBegin = function staffPicBegin(u, topicId, w, h, n, text) {
    if (!this.staffOk(u)) return { error: 'Раздел только для мастеров.' };
    const t = this.staffDb().topics.find((x) => x.id === Number(topicId)); if (!t) return { error: 'Тема не найдена.' }; if (t.closed && !u.admin) return { error: 'Тема закрыта.' };
    w = Math.floor(Number(w)); h = Math.floor(Number(h)); n = Math.floor(Number(n));
    if (!(w >= 8 && h >= 8 && w <= PIC_SIDE && h <= PIC_SIDE) || !(n >= 1 && n <= PIC_PARTS)) return { error: 'Неверная картинка.' };
    const now = Date.now(); u.staffPics = (u.staffPics || []).filter((x) => x > now - 86400000);
    if (u.staffPics.length >= PIC_DAY) return { error: `Не больше ${PIC_DAY} фото в сутки.` };
    return { ok: true, up: { t: t.id, w, h, n, parts: [], text: clean(text, 300) } };
  };
  P.staffPicPart = async function staffPicPart(u, up, i, data) {
    i = Math.floor(Number(i));
    if (!up || i !== up.parts.length || typeof data !== 'string') return { error: 'Фото: неверная часть — отправьте заново.' };
    const buf = Buffer.from(data, 'base64'); if (!buf.length || buf.length > PIC_PART) return { error: 'Фото: слишком большая часть.' };
    up.parts.push(buf); if (up.parts.length < up.n) return { ok: true, more: true };
    const raw = await new Promise((res) => zlib.inflate(Buffer.concat(up.parts), { maxOutputLength: up.w * up.h * 3 + 1 }, (e, out) => res(e ? null : out)));
    if (!raw || raw.length !== up.w * up.h * 3) return { error: 'Фото повреждено — попробуйте другое.' };
    const rgba = Buffer.alloc(up.w * up.h * 4);
    for (let s = 0, d = 0; s < raw.length; s += 3, d += 4) { rgba[d] = raw[s]; rgba[d + 1] = raw[s + 1]; rgba[d + 2] = raw[s + 2]; rgba[d + 3] = 255; }
    const id = crypto.randomBytes(16).toString('hex'), now = Date.now();
    fs.mkdirSync(this.staffPicDir(), { recursive: true }); fs.writeFileSync(this.staffPicFile(id), encodePng(rgba, up.w, up.h));
    const d = this.staffDb(), t = d.topics.find((x) => x.id === up.t); if (!t) { try { fs.unlinkSync(this.staffPicFile(id)); } catch { /* нет */ } return { error: 'Тема удалена.' }; }
    pushMsg(this, t, { id: d.next++, t: t.id, by: u.id, at: now, text: up.text, pic: id, picExp: now + PIC_LIFE, w: up.w, h: up.h });
    u.staffPics = [...(u.staffPics || []), now]; this.store.save();
    return { ok: true, topic: t.id };
  };
  // файл фото — только участнику раздела и только пока фото живо
  P.staffPicGet = function staffPicGet(u, id) {
    if (!this.staffOk(u)) return null;
    const m = this.staffDb().msgs.find((x) => x.pic === String(id)); if (!m || m.picExp <= Date.now()) return null;
    try { return fs.readFileSync(this.staffPicFile(id)); } catch { return null; }
  };
}

module.exports = { install, PIC_LIFE, PIC_SIDE, PIC_PART };
