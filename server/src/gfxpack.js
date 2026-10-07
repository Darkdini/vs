'use strict';
// Зашифрованные листы графики (tools/gfxpack.py): web/pk/<n>.bin + web/pk/index.json, ключ — в файле рядом с web/ (pk.key).
// Сервер отдаёт картинку из листа, если её запросили по обычному адресу (первый вход, пока помощник кэша sw.js не включился).
const fs = require('fs'), path = require('path');

function seedOf(key, n) {
  let h = 0x811C9DC5;
  for (const ch of Buffer.from(`${key}:${n}`)) h = Math.imul(h ^ ch, 0x01000193) >>> 0;
  return h || 1;
}
function decrypt(buf, key, n) {
  let s = seedOf(key, n);
  const out = Buffer.alloc(buf.length), full = buf.length & ~3;
  for (let i = 0; i < buf.length; i += 4) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    if (i < full) out.writeUInt32LE((buf.readUInt32LE(i) ^ s) >>> 0, i);
    else for (let k = 0; i + k < buf.length; k++) out[i + k] = buf[i + k] ^ ((s >>> (8 * k)) & 255);
  }
  return out;
}

function open(webRoot) {
  let index = null, key = null;
  try { index = JSON.parse(fs.readFileSync(path.join(webRoot, 'pk', 'index.json'), 'utf8')); key = fs.readFileSync(path.join(webRoot, '..', 'pk.key'), 'utf8').trim(); } catch { return null; }
  const plain = new Map(); // расшифрованные листы (в памяти, пока сервер работает)
  const bundle = (n) => { if (!plain.has(n)) plain.set(n, decrypt(fs.readFileSync(path.join(webRoot, 'pk', `${n}.bin`)), key, n)); return plain.get(n); };
  return {
    has: (rel) => !!index.files[rel],
    get(rel) {
      const e = index.files[rel]; if (!e) return null;
      const [n, off, len, mime] = e;
      return { body: bundle(n).subarray(off, off + len), mime, hash: `${index.bundles[n]}${off.toString(36)}` };
    },
  };
}

// есть ли картинка игры (на диске или в листе) — rel от папки web/
let IDX;
function exists(webRoot, rel) {
  if (fs.existsSync(path.join(webRoot, rel))) return true;
  if (IDX === undefined) { try { IDX = JSON.parse(fs.readFileSync(path.join(webRoot, 'pk', 'index.json'), 'utf8')).files; } catch { IDX = null; } }
  return !!(IDX && IDX[rel]);
}

module.exports = { open, decrypt, seedOf, exists };
