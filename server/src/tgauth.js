'use strict';
// Telegram-бот игроков: привязка аккаунта и восстановление пароля.
// • Привязка: в Профиле «Привязать Telegram» → ссылка t.me/<бот>?start=<одноразовый код> → игрок жмёт «Старт» → бот пишет «Аккаунт привязан».
// • «Забыли пароль?» в окне входа: логин → бот присылает 6-значный код (15 минут, 5 попыток) → игрок вводит код и НОВЫЙ пароль.
//   Пароль бот не присылает и сервер его нигде не хранит — только код (в базе — его хеш), так пароль не остаётся в истории чата.
// • После смены пароля все входы завершаются, бот сообщает «Пароль изменён».
// Настройка: TG_AUTH_TOKEN — токен отдельного бота (не того, что шлёт копии базы), deploy/tgauth.sh. Без токена — функция скрыта.
// Администратор так пароль не восстанавливает (его пароль — только на сервере: admin.sh / ADMIN_RESET).
const https = require('https');
const crypto = require('crypto');

const LINK_MS = 15 * 60000, CODE_MS = 15 * 60000, CODE_TRIES = 5, REQ_PER_HOUR = 3, HOUR = 3600000;
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const token = () => process.env.TG_AUTH_TOKEN || '';
const enabled = () => !!token();

// запрос к Bot API (JSON); в тестах подменяется через Game.prototype.tgApi
function api(method, body, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {}));
    const req = https.request({ host: 'api.telegram.org', path: `/bot${token()}/${method}`, method: 'POST', timeout: timeoutMs, headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      let s = ''; res.setEncoding('utf8'); res.on('data', (d) => { s += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* не JSON */ } if (j && j.ok) resolve(j.result); else reject(new Error((j && j.description) || `HTTP ${res.statusCode}`)); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject); req.end(data);
  });
}

function install(Game) {
  const P = Game.prototype;
  P.tgApi = api;
  P.tgSay = function tgSay(chat, text) { return this.tgApi('sendMessage', { chat_id: chat, text }).catch((e) => console.error('бот Telegram:', e.message)); };
  P.tgBotName = function tgBotName() { return process.env.TG_AUTH_BOT || this.tgBot || ''; };
  P.tgAuthInfo = function tgAuthInfo(u) { return { on: enabled() && !!this.tgBotName(), bot: this.tgBotName(), linked: !!(u && u.tg), name: u && u.tg ? u.tg.name : '' }; };

  // ссылка для привязки: одноразовый код, 15 минут
  P.tgLinkStart = function tgLinkStart(u, now = Date.now()) {
    if (!enabled() || !this.tgBotName()) return { error: 'Бот Telegram пока не подключён администрацией.' };
    if (u.admin) return { error: 'Аккаунт администратора к Telegram не привязывается.' };
    const code = crypto.randomBytes(12).toString('hex'); u.tgLink = { h: sha(code), exp: now + LINK_MS }; this.store.save();
    return { url: `https://t.me/${this.tgBotName()}?start=${code}` };
  };
  P.tgUnlink = function tgUnlink(u) {
    if (!u.tg) return { error: 'Telegram не привязан.' };
    const chat = u.tg.chat; delete u.tg; this.store.save();
    this.tgSay(chat, `Аккаунт «${u.login}» отвязан от этого Telegram.`);
    return { msg: 'Telegram отвязан.' };
  };

  // сообщение боту (из опроса getUpdates)
  P.tgOnMessage = function tgOnMessage(msg, now = Date.now()) {
    if (!msg || !msg.chat || msg.chat.type !== 'private') return;
    const chat = msg.chat.id, text = String(msg.text || '').trim(), from = msg.from || {};
    const name = from.username ? `@${from.username}` : [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Telegram';
    const m = /^\/start\s+([0-9a-f]{24})$/.exec(text);
    if (m) {
      const h = sha(m[1]), u = Object.values(this.db.users).find((x) => x.tgLink && x.tgLink.h === h);
      if (!u || u.tgLink.exp < now) return this.tgSay(chat, 'Ссылка устарела. Откройте в игре Профиль → «Привязать Telegram» ещё раз.');
      delete u.tgLink;
      for (const x of Object.values(this.db.users)) if (x !== u && x.tg && x.tg.chat === chat) { delete x.tg; } // один Telegram — один аккаунт
      u.tg = { chat, name, at: now }; this.store.save();
      return this.tgSay(chat, `✅ Аккаунт «${u.login}» привязан. Если забудете пароль — в окне входа нажмите «Забыли пароль?», и я пришлю код.`);
    }
    const u = Object.values(this.db.users).find((x) => x.tg && x.tg.chat === chat);
    return this.tgSay(chat, u ? `Этот Telegram привязан к аккаунту «${u.login}». Забыли пароль — в окне входа игры нажмите «Забыли пароль?».`
      : 'Привязать аккаунт: в игре Профиль → «Привязать Telegram».');
  };

  // «Забыли пароль?» шаг 1: прислать код. Ответ всегда одинаковый — по нему нельзя узнать, есть ли такой логин
  P.tgResetRequest = function tgResetRequest(login, ip = '', now = Date.now()) {
    if (!enabled()) return { error: 'Восстановление через Telegram пока не подключено — напишите администрации.' };
    const k = this.db.accts[String(login || '').trim().toLowerCase()], u = k && this.db.users[k];
    const same = { msg: 'Если к этому аккаунту привязан Telegram, бот прислал код. Код действует 15 минут.' };
    const rl = this.tgResetRl = this.tgResetRl || new Map(), key = `ip:${ip}`, hits = (rl.get(key) || []).filter((t) => t > now - HOUR);
    if (hits.length >= REQ_PER_HOUR * 3) return { error: 'Слишком много запросов — попробуйте через час.' };
    hits.push(now); rl.set(key, hits);
    if (!u || u.bot || u.admin || !u.tg) return same;
    const sent = (u.tgSent || []).filter((t) => t > now - HOUR); if (sent.length >= REQ_PER_HOUR) return same; // не чаще 3 кодов в час на аккаунт
    const code = String(crypto.randomInt(100000, 1000000));
    u.tgSent = [...sent, now]; u.tgReset = { h: sha(`${u.id}:${code}`), exp: now + CODE_MS, tries: 0 }; this.store.save();
    this.tgSay(u.tg.chat, `🔑 Код для смены пароля в «Война Королей» (аккаунт «${u.login}»): ${code}\nДействует 15 минут. Никому его не сообщайте — администрация код никогда не спрашивает.\nЕсли это были не вы — просто ничего не делайте, пароль останется прежним.`);
    return same;
  };
  // шаг 2: код + новый пароль
  P.tgResetConfirm = function tgResetConfirm(login, code, newPass, ip = '', now = Date.now()) {
    const k = this.db.accts[String(login || '').trim().toLowerCase()], u = k && this.db.users[k], r = u && u.tgReset;
    const bad = { error: 'Неверный или устаревший код.' };
    if (!u || !r || r.exp < now) return bad;
    if (r.tries >= CODE_TRIES) { delete u.tgReset; this.store.save(); return { error: 'Слишком много неверных попыток — запросите новый код.' }; }
    const a = Buffer.from(sha(`${u.id}:${String(code || '').trim()}`)), b = Buffer.from(r.h);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { r.tries++; this.store.save(); return bad; }
    const p = String(newPass || '').toLowerCase();
    if (p.length < 5) return { error: 'Новый пароль слишком короткий (минимум 5 символов).' };
    if (p.length > 40) return { error: 'Новый пароль слишком длинный.' };
    this.setPasswordReset(u, p, ip); delete u.tgReset; this.store.save();
    if (u.tg) this.tgSay(u.tg.chat, `✅ Пароль аккаунта «${u.login}» изменён. Все прежние входы завершены. Если это были не вы — сразу напишите администрации.`);
    return { msg: 'Пароль изменён — войдите с новым паролем.', login: u.acct, uid: u.id };
  };

  // опрос бота (long polling): только исходящие запросы, входящий порт не нужен
  P.tgPollStart = function tgPollStart() {
    if (!enabled() || this.tgPolling) return;
    this.tgPolling = true; let offset = 0, wait = 1000;
    this.tgApi('getMe', {}).then((me) => { this.tgBot = me.username; }).catch((e) => console.error('бот Telegram (getMe):', e.message));
    const loop = () => {
      if (!enabled()) { this.tgPolling = false; return; }
      this.tgApi('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, 60000).then((ups) => {
        wait = 1000;
        for (const up of ups || []) { offset = Math.max(offset, up.update_id + 1); try { this.tgOnMessage(up.message); } catch (e) { console.error(e); } }
        setImmediate(loop);
      }).catch((e) => { console.error('бот Telegram:', e.message); wait = Math.min(wait * 2, 60000); setTimeout(loop, wait).unref(); });
    };
    loop();
  };
}

module.exports = { install, enabled, sha, CODE_TRIES };
