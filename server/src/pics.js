'use strict';
// Фото в личных сообщениях — живут 10 минут, потом удаляются (в базе не хранятся, только в памяти сервера).
// Безопасно, как аватары: файл игрока на сервер НЕ попадает. Браузер сам уменьшает картинку (до 960 точек по стороне)
// и присылает только сжатые цвета точек (RGB, deflate) частями по ~150 КБ. Сервер распаковывает с жёстким
// ограничением размера, проверяет, что точек ровно ширина×высота, и сам собирает новый PNG — чужих байтов в нём нет.
// Адрес картинки — случайный (128 бит): /pic/<id>.png, видят только участники переписки (ссылку больше никто не получает).

const zlib = require('zlib');
const crypto = require('crypto');
const { encodePng } = require('./avatar');

const LIFE_MS = 10 * 60000, MAX_SIDE = 960, MAX_PART = 160 * 1024, MAX_PARTS = 14, MAX_TOTAL_MB = 150;
const PER_DAY = 40, GAP_MS = 15000;
const PICS = new Map(); // id → { png, from, to, exp }
let used = 0;

const sweep = (g, now = Date.now()) => {
  for (const [id, p] of PICS) if (p.exp <= now) { used -= p.png.length; PICS.delete(id); }
  for (const m of g.db.messages || []) if (m.pic && !PICS.has(m.pic)) { delete m.pic; m.picGone = true; }
};

function install(Game) {
  const P = Game.prototype;
  P.picGet = (id) => { const p = PICS.get(String(id)); return p && p.exp > Date.now() ? p : null; };
  P.picSweep = function picSweep(now) { sweep(this, now); };
  // начало загрузки: проверки до приёма данных
  P.picBegin = function picBegin(user, toLogin, w, h, n) {
    const to = this.db.users[String(toLogin || '').trim()];
    if (!to) return { error: 'Получатель не найден.' };
    if (to.id === user.id) return { error: 'Себе фото не отправить.' };
    const deny = this.canReach && this.canReach(user, to, 'msg'); if (deny) return { error: deny };
    w = Math.floor(Number(w)); h = Math.floor(Number(h)); n = Math.floor(Number(n));
    if (!(w >= 8 && h >= 8 && w <= MAX_SIDE && h <= MAX_SIDE) || !(n >= 1 && n <= MAX_PARTS)) return { error: 'Неверная картинка.' };
    const now = Date.now();
    user.picLog = (user.picLog || []).filter((t) => t > now - 86400000);
    if (user.picLog.length >= PER_DAY) return { error: `Не больше ${PER_DAY} фото в сутки.` };
    if (user.picLog.length && now - user.picLog[user.picLog.length - 1] < GAP_MS) return { error: 'Фото — не чаще раза в 15 секунд.' };
    sweep(this, now);
    if (used > MAX_TOTAL_MB * 1048576) return { error: 'Сервер сейчас занят фото — попробуйте через пару минут.' };
    return { ok: true, up: { to: to.id, toLogin: to.login, w, h, n, parts: [], size: 0, at: now } };
  };
  // часть данных; когда пришли все — распаковка, проверка, PNG, сообщение
  P.picPart = async function picPart(user, up, i, data) {
    i = Math.floor(Number(i));
    if (!up || i !== up.parts.length || typeof data !== 'string') return { error: 'Фото: неверная часть — отправьте заново.' };
    const buf = Buffer.from(data, 'base64');
    if (!buf.length || buf.length > MAX_PART) return { error: 'Фото: слишком большая часть.' };
    up.parts.push(buf); up.size += buf.length;
    if (up.parts.length < up.n) return { ok: true, more: true };
    const raw = await new Promise((res) => zlib.inflate(Buffer.concat(up.parts), { maxOutputLength: up.w * up.h * 3 + 1 }, (e, out) => res(e ? null : out)));
    if (!raw || raw.length !== up.w * up.h * 3) return { error: 'Фото повреждено — попробуйте другое.' };
    const rgba = Buffer.alloc(up.w * up.h * 4);
    for (let s = 0, d = 0; s < raw.length; s += 3, d += 4) { rgba[d] = raw[s]; rgba[d + 1] = raw[s + 1]; rgba[d + 2] = raw[s + 2]; rgba[d + 3] = 255; }
    const png = encodePng(rgba, up.w, up.h);
    const id = crypto.randomBytes(16).toString('hex'), now = Date.now();
    PICS.set(id, { png, from: user.id, to: up.to, exp: now + LIFE_MS }); used += png.length;
    user.picLog = [...(user.picLog || []), now];
    const r = this.sendMail(user, up.toLogin, 'Фото', '[фото]');
    if (r.error) { PICS.delete(id); used -= png.length; return r; }
    r.message.pic = id; r.message.picExp = now + LIFE_MS; this.store.save();
    return { ok: true, to: r.to };
  };
}

module.exports = { install, LIFE_MS, MAX_SIDE, MAX_PART };
