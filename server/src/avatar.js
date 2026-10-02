'use strict';
// Аватары игроков — безопасно: файл пользователя на сервер НЕ попадает.
// Браузер сам уменьшает картинку до 96×96 и присылает только сырые пиксели RGBA (ровно 36 864 байта).
// Сервер проверяет длину и сам собирает из пикселей новый PNG (zlib из Node) — внутри не может оказаться
// ни скрипта, ни шелла, ни «полиглота»: чужих байтов в файле нет, только цвета точек.
// Имя файла — только номер игрока (<id>.png), путь пользователь не выбирает. Отдаётся как image/png с nosniff и CSP.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const AVA = 96, RAW = AVA * AVA * 4, COOLDOWN_MS = 10000;

// CRC32 для чанков PNG
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // 8 бит, RGBA
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); // фильтр 0 на строку
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function install(Game) {
  // «Мне нравится!» у аватарки (как в оригинале): один голос от игрока за каждую аватарку, список проголосовавших
  Game.prototype.avaLike = function avaLike(user, id) {
    const u = this.userById(Number(id)); if (!u || !u.avatar) return { error: 'У игрока нет аватарки.' };
    if (u.id === user.id) return { error: 'За свою аватарку голосовать нельзя.' };
    u.avaLikes = u.avaLikes || [];
    if (u.avaLikes.includes(user.id)) return { error: 'Вы уже голосовали за эту аватарку.' };
    u.avaLikes.push(user.id); this.store.save(); return { ok: true, msg: 'Голос отправлен.' };
  };
  Game.prototype.avaLikes = function avaLikes(user, id) {
    const u = this.userById(Number(id)); if (!u) return { error: 'Игрок не найден.' };
    return { id: u.id, login: u.login, mine: (u.avaLikes || []).includes(user.id), list: (u.avaLikes || []).slice().reverse().map((x) => this.userById(x)).filter(Boolean)
      .map((v) => ({ id: v.id, login: v.login, race: v.race, avatar: v.avatar || 0, rating: this.userRating(v), rep: v.reputation ?? 10 })) };
  };

  const P = Game.prototype;
  // папка avatars рядом с файлом базы (data/avatars), вне папки web
  P.avatarDir = function avatarDir() { return path.join(path.dirname(path.resolve(this.store.file)), 'avatars'); };
  P.avatarFile = function avatarFile(id) { return path.join(this.avatarDir(), `${Math.floor(Number(id))}.png`); };

  P.setAvatar = function setAvatar(user, px) {
    if (typeof px !== 'string' || px.length > Math.ceil(RAW / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+=*$/.test(px)) return { error: 'Неверные данные картинки.' };
    const rgba = Buffer.from(px, 'base64');
    if (rgba.length !== RAW) return { error: `Картинка должна быть ${AVA}×${AVA}.` };
    const now = Date.now();
    if (user.avatarAt && now - user.avatarAt < COOLDOWN_MS) return { error: 'Слишком часто — подождите несколько секунд.' };
    fs.mkdirSync(this.avatarDir(), { recursive: true });
    const file = this.avatarFile(user.id), tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, encodePng(rgba, AVA, AVA));
    fs.renameSync(tmp, file);
    user.avatar = now; user.avatarAt = now; user.avaLikes = []; // новая аватарка — голоса «Мне нравится» заново
    this.store.save();
    return { ok: true };
  };
  P.removeAvatar = function removeAvatar(user) {
    try { fs.unlinkSync(this.avatarFile(user.id)); } catch { /* уже нет */ }
    delete user.avatar; user.avaLikes = [];
    this.store.save();
    return { ok: true };
  };
}

module.exports = { install, AVA, RAW, encodePng };
