'use strict';
// Чтение файлов из jar (zip) без зависимостей: оригинальная графика берётся прямо из клиента пользователя
// и отдаётся браузеру по /orig/<путь>. В репозиторий оригинальные картинки не попадают.

const fs = require('fs');
const zlib = require('zlib');

function openJar(file) {
  const buf = fs.readFileSync(file);
  // End Of Central Directory: сигнатура 0x06054b50 в последних 64 КБ
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip/jar file');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.set(name, { method, csize, local });
    off += 46 + nameLen + extraLen + commentLen;
  }
  const cache = new Map();
  return {
    names: () => [...entries.keys()],
    read(name) {
      if (cache.has(name)) return cache.get(name);
      const e = entries.get(name);
      if (!e) return null;
      const lnameLen = buf.readUInt16LE(e.local + 26);
      const lextraLen = buf.readUInt16LE(e.local + 28);
      const start = e.local + 30 + lnameLen + lextraLen;
      const raw = buf.subarray(start, start + e.csize);
      const data = e.method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
      cache.set(name, data);
      return data;
    },
  };
}

module.exports = { openJar };
