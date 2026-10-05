'use strict';
// Резервная копия базы — вне сервера: раз в сутки файл базы (gzip) отправляется в Telegram ботом администратора.
// Сервер сломался / хостинг удалил VPS — копия останется в чате с ботом.
// Настройка (deploy/tgbackup.sh пишет это в game-data/game.env): TG_BACKUP_TOKEN — токен бота от @BotFather,
// TG_BACKUP_CHAT — id чата, TG_BACKUP_PASS — пароль шифрования (необязательно; с ним файл — AES-256-GCM, без пароля его не открыть),
// TG_BACKUP_HOUR — час отправки по времени сервера (по умолчанию 4). Расшифровка: node src/tgbackup.js decrypt <файл.enc> <пароль>.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');
const crypto = require('crypto');

const MAGIC = Buffer.from('WARBK1');
const TG_MAX = 49 * 1024 * 1024; // бот может отправить файл до 50 МБ
const cfg = () => ({ token: process.env.TG_BACKUP_TOKEN || '', chat: process.env.TG_BACKUP_CHAT || '', pass: process.env.TG_BACKUP_PASS || '', hour: Number(process.env.TG_BACKUP_HOUR ?? 4) });
const enabled = () => { const c = cfg(); return !!(c.token && c.chat); };

function encrypt(buf, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(pass, salt, 32);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function decrypt(buf, pass) {
  if (!buf.subarray(0, 6).equals(MAGIC)) throw new Error('это не зашифрованная копия игры');
  const salt = buf.subarray(6, 22), iv = buf.subarray(22, 34), tag = buf.subarray(34, 50), key = crypto.scryptSync(pass, salt, 32);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  try { return Buffer.concat([d.update(buf.subarray(50)), d.final()]); } catch { throw new Error('неверный пароль или файл повреждён'); }
}

// запрос к Bot API: multipart/form-data с одним файлом (без сторонних библиотек)
function tgSend(token, method, fields, file) {
  return new Promise((resolve, reject) => {
    const b = `----war${crypto.randomBytes(8).toString('hex')}`, parts = [];
    for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    if (file) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="document"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), file.data, Buffer.from('\r\n'));
    parts.push(Buffer.from(`--${b}--\r\n`));
    const body = Buffer.concat(parts);
    const req = https.request({ host: 'api.telegram.org', path: `/bot${token}/${method}`, method: 'POST', timeout: 120000, headers: { 'Content-Type': `multipart/form-data; boundary=${b}`, 'Content-Length': body.length } }, (res) => {
      let s = ''; res.setEncoding('utf8'); res.on('data', (d) => { s += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* не JSON */ } if (j && j.ok) resolve(j.result); else reject(new Error((j && j.description) || `HTTP ${res.statusCode}`)); });
    });
    req.on('timeout', () => req.destroy(new Error('Telegram не ответил за 2 минуты')));
    req.on('error', reject); req.end(body);
  });
}

function install(Game) {
  const P = Game.prototype;
  const st = (g) => { if (!g.db.tgBackup) g.db.tgBackup = { lastOk: 0, lastTry: 0, err: '', size: 0 }; return g.db.tgBackup; };
  P.tgBackupInfo = function tgBackupInfo() { const s = st(this), c = cfg(); return { on: enabled(), enc: !!c.pass, hour: c.hour, lastOk: s.lastOk, lastTry: s.lastTry, err: s.err, size: s.size, busy: !!this.tgBusy }; };
  // отправить копию сейчас; why — подпись (auto / вручную)
  P.tgBackupSend = async function tgBackupSend(why = 'auto') {
    const c = cfg(), s = st(this);
    if (!enabled()) return { error: 'Копия в Telegram не настроена: sh /opt/war/game/tgbackup.sh' };
    if (this.tgBusy) return { error: 'Копия уже отправляется.' };
    this.tgBusy = true; s.lastTry = Date.now();
    try {
      this.store.flush();
      let data = zlib.gzipSync(fs.readFileSync(this.store.file), { level: 9 });
      const d = new Date(), p2 = (n) => String(n).padStart(2, '0'), stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
      let name = `db-${stamp}.json.gz`; if (c.pass) { data = encrypt(data, c.pass); name += '.enc'; }
      if (data.length > TG_MAX) throw new Error(`копия ${(data.length / 1048576).toFixed(1)} МБ — больше лимита Telegram 50 МБ`);
      const users = Object.values(this.db.users).filter((u) => !u.bot).length, ver = (() => { try { return fs.readFileSync(path.join(__dirname, '..', '..', 'VERSION'), 'utf8').trim(); } catch { return 'dev'; } })();
      const caption = `🗄 Копия базы «Война Королей»${why === 'auto' ? '' : ' (вручную)'}\n${stamp.replace('_', ' ')} · игроков ${users} · ${(data.length / 1024).toFixed(0)} КБ · версия ${ver}${c.pass ? '\n🔒 зашифрована паролем' : ''}`;
      await tgSend(c.token, 'sendDocument', { chat_id: c.chat, caption, disable_notification: why === 'auto' ? 'true' : 'false' }, { name, data });
      s.lastOk = Date.now(); s.err = ''; s.size = data.length; this.store.save();
      return { msg: `Копия отправлена в Telegram (${(data.length / 1024).toFixed(0)} КБ).` };
    } catch (e) {
      s.err = String(e.message || e).slice(0, 200); this.store.save(); console.error('копия в Telegram:', s.err);
      return { error: `Не отправилось: ${s.err}` };
    } finally { this.tgBusy = false; }
  };
  // раз в 10 минут: пора ли отправлять (в заданный час, раз в сутки; если пропущено больше 26 часов — сразу)
  P.tgBackupCheck = function tgBackupCheck(now = Date.now()) {
    if (!enabled() || this.tgBusy) return false;
    const s = st(this), c = cfg(), since = now - (s.lastOk || 0);
    if (s.lastTry && now - s.lastTry < 30 * 60000 && s.err) return false; // после ошибки — не чаще раза в 30 минут
    const due = since >= 26 * 3600000 || (since >= 20 * 3600000 && new Date(now).getHours() === c.hour);
    if (due) this.tgBackupSend('auto');
    return due;
  };
}

module.exports = { install, encrypt, decrypt, enabled };

// расшифровка копии: node src/tgbackup.js decrypt <файл.json.gz.enc> <пароль>  → рядом файл .json.gz
if (require.main === module) {
  const [cmd, file, pass] = process.argv.slice(2);
  if (cmd !== 'decrypt' || !file || !pass) { console.log('node src/tgbackup.js decrypt <файл.enc> <пароль>'); process.exit(1); }
  try {
    const out = file.replace(/\.enc$/, '') + (file.endsWith('.enc') ? '' : '.gz');
    const gz = decrypt(fs.readFileSync(file), pass); zlib.gunzipSync(gz); fs.writeFileSync(out, gz);
    console.log(`✓ Расшифровано: ${out}`);
  } catch (e) { console.error(`Ошибка: ${e.message}`); process.exit(1); }
}
