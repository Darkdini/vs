'use strict';
// «СВЯЗЬ» — переписка игрока с мастерами игры (админ и тестеры), как личные сообщения.
// У игрока: «Сообщения» → строка «📮 СВЯЗЬ — Мастер игры» всегда сверху (её нельзя удалить); он пишет жалобу или вопрос
// и может приложить скрин — скрин живёт 8 часов, потом удаляется с сервера. «Сообщить об ошибке» и «Пожаловаться» в чате
// попадают сюда же. Ответ мастера приходит игроку сообщением от «Мастер игры» — ник мастера игрок не видит.
// У мастеров: МАСТЕРА → «СВЯЗЬ» — список переписок (сверху ждущие ответа), ответ, «✔ Решено»; кто ответил — видят только мастера.
// Скрин — как фото в «МАСТЕРАХ» (staff.js): браузер присылает сжатые цвета точек, сервер сам собирает PNG.
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const { assemblePng, PIC_SIDE, PIC_PART } = require('./staff');

const PIC_LIFE = 8 * 3600000, PIC_PARTS = 24, TEXT_MAX = 2000, MSGS_KEEP = 300, SHOW = 100;
const DAY_MSGS = 10, DAY_PICS = 5, DAY = 86400000;
const MASTER = 'Мастер игры';

function install(Game) {
  const P = Game.prototype;
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
  const login = (g, id) => (g.userById(id) || {}).login || '—';

  // db.link = { next, th: { [id игрока]: { msgs: [{ id, by, m (ответ мастера), at, text, pic, picExp, w, h, picGone }], wait, at, readP } } }
  P.linkDb = function linkDb() {
    const L = (this.db.link = this.db.link || { next: 1, th: {} });
    if (this.db.bugs) { // жалобы прежней «СВЯЗИ» (db.bugs) → переписки
      for (const b of this.db.bugs) {
        const w = (b.uid && this.userById(b.uid)) || Object.values(this.db.users).find((y) => y.login === b.from); if (!w) continue;
        const th = this.linkThread(w.id);
        th.msgs.push({ id: L.next++, by: w.id, at: b.at, text: String(b.text || '') });
        if (b.ans) th.msgs.push({ id: L.next++, by: b.ans.by, m: 1, at: b.ans.at, text: b.ans.text });
        th.wait = !b.ans && !b.closed; th.at = Math.max(th.at || 0, b.ans ? b.ans.at : b.at);
      }
      for (const th of Object.values(L.th)) { th.msgs.sort((a, b) => a.at - b.at); th.readP = L.next; } // старые ответы игрок уже видел отчётом
      delete this.db.bugs; delete this.db.bugNext;
    }
    return L;
  };
  P.linkThread = function linkThread(uid) { const th = this.db.link.th; return (th[uid] = th[uid] || { msgs: [], wait: false, at: 0, readP: 0 }); };
  P.linkPicDir = function linkPicDir() { return path.join(path.dirname(path.resolve(this.store.file)), 'linkpics'); };
  P.linkPicFile = function linkPicFile(id) { return /^[0-9a-f]{32}$/.test(String(id)) ? path.join(this.linkPicDir(), `${id}.png`) : null; };
  const dropPic = (g, m) => { if (m.pic) { try { fs.unlinkSync(g.linkPicFile(m.pic)); } catch { /* уже нет */ } delete m.pic; m.picGone = true; } };
  // уборка: скрины старше 8 часов удаляются с диска, в сообщении остаётся «скрин удалён»
  const prevSweep = P.picSweep;
  P.picSweep = function picSweep(now = Date.now()) {
    if (prevSweep) prevSweep.call(this, now);
    let changed = false;
    for (const th of Object.values(this.linkDb().th)) for (const m of th.msgs) if (m.pic && m.picExp <= now) { dropPic(this, m); changed = true; }
    if (changed) this.store.save();
  };

  const push = (g, uid, msg) => {
    const th = g.linkThread(uid); th.msgs.push(msg); th.at = msg.at;
    if (th.msgs.length > MSGS_KEEP) for (const m of th.msgs.splice(0, th.msgs.length - MSGS_KEEP)) dropPic(g, m);
    return th;
  };
  // лимит игрока: не больше 10 сообщений (и 5 скринов) в сутки
  const dayLeft = (u, key, max, now) => { u[key] = (u[key] || []).filter((x) => x > now - DAY); return u[key].length < max; };
  // порог рейтинга (social.js talkLow) — кроме ответа мастеру, который уже написал игроку
  P.linkLow = function linkLow(u) { const th = this.linkDb().th[u.id]; return !!(this.talkLow && this.talkLow(u)) && !(th && th.msgs.some((x) => x.m)); };
  P.linkPost = function linkPost(u, text) {
    if (!u || u.bot) return { error: 'Нельзя.' };
    text = clean(text, TEXT_MAX); if (!text) return { error: 'Напишите, что случилось.' };
    const now = Date.now(); this.linkDb();
    if (this.linkLow(u)) return { error: this.talkLowMsg(u, 'Писать мастерам и сообщать об ошибках') };
    if (!dayLeft(u, 'linkLog', DAY_MSGS, now)) return { error: `В «СВЯЗЬ» — не больше ${DAY_MSGS} сообщений в сутки. Мастера ответят на уже присланное.` };
    u.linkLog.push(now);
    const th = push(this, u.id, { id: this.db.link.next++, by: u.id, at: now, text }); th.wait = true;
    this.store.save(); return { ok: true };
  };
  P.linkPicBegin = function linkPicBegin(u, w, h, n, text) {
    if (!u || u.bot) return { error: 'Нельзя.' };
    if (this.linkLow(u)) return { error: this.talkLowMsg(u, 'Писать мастерам и сообщать об ошибках') };
    w = Math.floor(Number(w)); h = Math.floor(Number(h)); n = Math.floor(Number(n));
    if (!(w >= 8 && h >= 8 && w <= PIC_SIDE && h <= PIC_SIDE) || !(n >= 1 && n <= PIC_PARTS)) return { error: 'Неверная картинка.' };
    const now = Date.now();
    if (!dayLeft(u, 'linkLog', DAY_MSGS, now)) return { error: `В «СВЯЗЬ» — не больше ${DAY_MSGS} сообщений в сутки.` };
    if (!dayLeft(u, 'linkPics', DAY_PICS, now)) return { error: `Не больше ${DAY_PICS} скринов в сутки.` };
    return { ok: true, up: { w, h, n, parts: [], text: clean(text, 300) } };
  };
  P.linkPicPart = async function linkPicPart(u, up, i, data) {
    i = Math.floor(Number(i));
    if (!up || i !== up.parts.length || typeof data !== 'string') return { error: 'Скрин: неверная часть — отправьте заново.' };
    const buf = Buffer.from(data, 'base64'); if (!buf.length || buf.length > PIC_PART) return { error: 'Скрин: слишком большая часть.' };
    up.parts.push(buf); if (up.parts.length < up.n) return { ok: true, more: true };
    const png = await assemblePng(up); if (!png) return { error: 'Скрин повреждён — попробуйте другой.' };
    const id = crypto.randomBytes(16).toString('hex'), now = Date.now();
    fs.mkdirSync(this.linkPicDir(), { recursive: true }); fs.writeFileSync(this.linkPicFile(id), png);
    this.linkDb(); u.linkLog = [...(u.linkLog || []), now]; u.linkPics = [...(u.linkPics || []), now];
    const th = push(this, u.id, { id: this.db.link.next++, by: u.id, at: now, text: up.text, pic: id, picExp: now + PIC_LIFE, w: up.w, h: up.h }); th.wait = true;
    this.store.save(); return { ok: true };
  };
  // файл скрина — игроку, который его прислал, и мастерам; только пока скрин жив
  P.linkPicGet = function linkPicGet(u, id) {
    if (!u) return null;
    for (const [uid, th] of Object.entries(this.linkDb().th)) {
      const m = th.msgs.find((x) => x.pic === String(id)); if (!m) continue;
      if (m.picExp <= Date.now() || (Number(uid) !== u.id && !this.staffOk(u))) return null;
      try { return fs.readFileSync(this.linkPicFile(id)); } catch { return null; }
    }
    return null;
  };

  // удаление игрока (admin.js purgeUser): его переписка «СВЯЗЬ» и скрины — тоже
  const prevPurge = P.purgeUser;
  P.purgeUser = function purgeUser(t, now) {
    const th = this.linkDb().th[t.id]; if (th) { for (const m of th.msgs) dropPic(this, m); delete this.db.link.th[t.id]; }
    return prevPurge.call(this, t, now);
  };

  const out = (m, staff, g) => ({ id: m.id, master: !!m.m, at: m.at, text: m.text || '', by: m.m ? (staff ? login(g, m.by) : MASTER) : null,
    pic: m.pic && m.picExp > Date.now() ? m.pic : null, picExp: m.pic ? m.picExp : 0, picGone: !!m.picGone });
  // игрок: своя переписка; открыл — ответы мастеров прочитаны
  P.linkMine = function linkMine(u) {
    const th = this.linkDb().th[u.id], msgs = th ? th.msgs : [];
    if (th && msgs.length) th.readP = msgs[msgs.length - 1].id;
    return { msgs: msgs.slice(-SHOW).map((m) => out(m, false, this)), more: Math.max(0, msgs.length - SHOW), life: PIC_LIFE / 3600000 };
  };
  P.linkUnread = function linkUnread(u) { const th = ((this.db.link || {}).th || {})[u.id]; return th ? th.msgs.filter((m) => m.m && m.id > (th.readP || 0)).length : 0; };
  P.linkNew = function linkNew() { return Object.values(this.linkDb().th).filter((t) => t.wait).length; };
  P.linkCount = function linkCount() { return Object.values(this.linkDb().th).filter((t) => t.msgs.length).length; };
  // мастера: список переписок — сверху ждущие ответа, потом свежие
  P.linkList = function linkList() {
    return Object.entries(this.linkDb().th).filter(([, t]) => t.msgs.length).map(([uid, t]) => {
      const last = t.msgs[t.msgs.length - 1];
      return { uid: Number(uid), login: login(this, Number(uid)), gone: !this.userById(Number(uid)), wait: !!t.wait, at: t.at, n: t.msgs.length,
        last: { master: !!last.m, text: last.pic || last.picGone ? `📷 ${last.text || 'Скрин'}` : last.text } };
    }).sort((a, b) => (b.wait - a.wait) || b.at - a.at);
  };
  P.linkOpen = function linkOpen(uid) {
    const t = this.linkDb().th[Number(uid)]; if (!t) return { error: 'Переписка не найдена.' };
    return { uid: Number(uid), login: login(this, Number(uid)), gone: !this.userById(Number(uid)), wait: !!t.wait, msgs: t.msgs.slice(-SHOW).map((m) => out(m, true, this)), more: Math.max(0, t.msgs.length - SHOW) };
  };
  // действия мастера (staffOp → op 'link…'): ответ — сообщением от «Мастер игры»; «Решено» — переписка больше не ждёт ответа
  P.linkStaffOp = function linkStaffOp(u, m) {
    const uid = Number(m.uid), t = this.linkDb().th[uid];
    switch (String(m.op)) {
      case 'linkans': {
        if (!t) return { error: 'Переписка не найдена.' };
        const w = this.userById(uid); if (!w) return { error: 'Игрока уже нет в игре.' };
        const text = clean(m.text, TEXT_MAX); if (!text) return { error: 'Напишите ответ.' };
        push(this, uid, { id: this.db.link.next++, by: u.id, m: 1, at: Date.now(), text }); t.wait = false;
        this.event(uid, `✉ ${MASTER} ответил(а) вам в «СВЯЗИ» (Сообщения).`);
        if (this.tgNotify) this.tgNotify(uid, 'mail', `✉ ${MASTER} ответил(а) на ваше обращение. Прочитать — в игре: Сообщения → СВЯЗЬ.`);
        this.store.save(); return { ok: true, link: uid, msg: 'Ответ отправлен игроку.' };
      }
      case 'linksolve': {
        if (!t) return { error: 'Переписка не найдена.' };
        t.wait = !t.wait; this.store.save(); return { ok: true, link: uid, msg: t.wait ? 'Переписка снова ждёт ответа.' : 'Отмечено: решено.' };
      }
      default: return { error: 'Неизвестное действие.' };
    }
  };
}

module.exports = { install, PIC_LIFE };
