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

// виды уведомлений: [ключ, название, пояснение]
const NOTIFY = [['attack', 'Нападение на замок', 'видит Караульная башня — приходит, даже если вы в игре'], ['battle', 'Отчёты о боях и разведке', ''], ['home', 'Армия вернулась домой', ''],
  ['build', 'Стройка завершена', ''], ['mail', 'Новое письмо', '']];
const NOTIFY_HOUR = 20;
const LINK_MS = 15 * 60000, CODE_MS = 15 * 60000, CODE_TRIES = 5, REQ_PER_HOUR = 3, HOUR = 3600000;
// неверных кодов «Забыли пароль?» на аккаунт за сутки: без этого перебор 6-значного кода (5 попыток × 3 кода в час) за год угадывал с шансом ~15%
const FAILS_PER_DAY = 10;
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const token = () => process.env.TG_AUTH_TOKEN || '';
const enabled = () => !!token();
// куда слать запросы Bot API: обычно api.telegram.org. Сервер игры в стране, где Telegram заблокирован (Россия, 2026), —
// через зарубежный сервер-посредник (deploy/tg-relay.sh): TG_API=https://<посредник> в game.env (deploy/tgapi.sh). Только https.
let badApi = '';
const apiTarget = (base = process.env.TG_API) => {
  if (base) {
    try { const u = new URL(base); if (u.protocol === 'https:' && !u.search && !u.hash) return { host: u.hostname, port: Number(u.port) || 443, prefix: u.pathname.replace(/\/+$/, '') }; } catch { /* неверный адрес */ }
    if (badApi !== base) { badApi = base; console.error(`TG_API: «${base}» — не https-адрес, запросы идут напрямую в api.telegram.org`); }
  }
  return { host: 'api.telegram.org', port: 443, prefix: '' };
};

// запрос к Bot API (JSON); в тестах подменяется через Game.prototype.tgApi
function api(method, body, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {})), t = apiTarget();
    const req = https.request({ host: t.host, port: t.port, path: `${t.prefix}/bot${token()}/${method}`, method: 'POST', timeout: timeoutMs, headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      let s = ''; res.setEncoding('utf8'); res.on('data', (d) => { s += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* не JSON */ } if (j && j.ok) resolve(j.result); else reject(new Error((j && j.description) || `HTTP ${res.statusCode}`)); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject); req.end(data);
  });
}

function install(Game) {
  const P = Game.prototype;
  P.tgApi = api;
  // очередь отправки: Telegram пускает ~30 сообщений в секунду — шлём не больше 20 в секунду (рассылки администрации)
  P.tgSay = function tgSay(chat, text) {
    const q = this.tgQ = this.tgQ || [];
    return new Promise((resolve) => {
      q.push({ chat, text, resolve });
      if (this.tgQT) return;
      const pump = () => { const batch = q.splice(0, 20);
        for (const m of batch) this.tgApi('sendMessage', { chat_id: m.chat, text: m.text }).then(m.resolve, (e) => { console.error('бот Telegram:', e.message); m.resolve(null); });
        this.tgQT = q.length ? setTimeout(pump, 1000) : null; };
      pump();
    });
  };
  P.tgBotName = function tgBotName() { return process.env.TG_AUTH_BOT || this.tgBot || ''; };
  P.tgAuthInfo = function tgAuthInfo(u) { return { on: enabled() && !!this.tgBotName(), bot: this.tgBotName(), linked: !!(u && u.tg), name: u && u.tg ? u.tg.name : '', unlinking: !!(u && u.tg && u.tgUnlinkReq && u.tgUnlinkReq.exp > Date.now()),
    notify: NOTIFY.map(([k, t, d]) => ({ k, t, d, on: !(u && u.tgOff && u.tgOff[k]) })) }; };
  // уведомления в Telegram (тем, кто привязал): kind — из NOTIFY, игрок выключает каждое в Профиле.
  // Нападение приходит всегда (если включено), остальное — только когда игрок не в игре. Не больше NOTIFY_HOUR сообщений в час.
  P.tgNotify = function tgNotify(userId, kind, text, now = Date.now()) {
    if (!enabled()) return false;
    const u = this.userById(userId); if (!u || !u.tg || u.bot || (u.tgOff && u.tgOff[kind])) return false;
    if (kind !== 'attack' && u.online) return false;
    const sent = (u.tgNotes || []).filter((t) => t > now - HOUR); if (sent.length >= NOTIFY_HOUR) return false;
    u.tgNotes = [...sent, now];
    this.tgSay(u.tg.chat, text); return true;
  };
  P.tgNotifySet = function tgNotifySet(u, kind, on) {
    if (!NOTIFY.some(([k]) => k === kind)) return { error: 'Нет такого уведомления.' };
    u.tgOff = u.tgOff || {}; if (on) delete u.tgOff[kind]; else u.tgOff[kind] = true; this.store.save(); return { ok: true };
  };
  // готовые стройки (раз в 30 с): по каждому замку — одно сообщение со всеми законченными стройками
  P.tgBuildScan = function tgBuildScan(now = Date.now()) {
    if (!enabled()) return 0; let n = 0;
    const C = require('./catalog');
    for (const c of Object.values(this.db.castles)) {
      const done = (c.queue || []).filter((q) => q.end <= now && !q.tgSent); if (!done.length) continue;
      for (const q of done) q.tgSent = true;
      const list = done.map((q) => `${(C.BY_ID[q.building] || {}).name || 'Здание'} ${q.level} ур.`).join(', ');
      if (this.tgNotify(c.owner, 'build', `🏗 «${c.name}»: построено — ${list}.`, now)) n++;
    }
    return n;
  };

  // ссылка для привязки: одноразовый код, 15 минут
  P.tgLinkStart = function tgLinkStart(u, now = Date.now()) {
    if (!enabled() || !this.tgBotName()) return { error: 'Бот Telegram пока не подключён администрацией.' };
    if (u.admin) return { error: 'Аккаунт администратора к Telegram не привязывается.' };
    const code = crypto.randomBytes(12).toString('hex'); u.tgLink = { h: sha(code), exp: now + LINK_MS }; this.store.save();
    return { url: `https://t.me/${this.tgBotName()}?start=${code}` };
  };
  // отвязка — только по коду из Telegram: кто-то зашёл в аккаунт — без телефона хозяина он Telegram не отвяжет
  P.tgUnlinkStart = function tgUnlinkStart(u, now = Date.now()) {
    if (!u.tg) return { error: 'Telegram не привязан.' };
    const sent = (u.tgSent || []).filter((t) => t > now - HOUR); if (sent.length >= REQ_PER_HOUR) return { error: 'Слишком много кодов — попробуйте через час.' };
    const code = String(crypto.randomInt(100000, 1000000));
    u.tgSent = [...sent, now]; u.tgUnlinkReq = { h: sha(`un:${u.id}:${code}`), exp: now + CODE_MS, tries: 0 }; this.store.save();
    this.tgSay(u.tg.chat, `⚠ Запрос на ОТВЯЗКУ Telegram от аккаунта «${u.login}». Код подтверждения: ${code}\nДействует 15 минут.\nЕсли это не вы — никому не сообщайте код и сразу смените пароль в игре.`);
    return { msg: 'Бот прислал код в Telegram — введите его, чтобы отвязать.' };
  };
  P.tgUnlink = function tgUnlink(u, code, now = Date.now()) {
    const r = u.tgUnlinkReq; if (!u.tg) return { error: 'Telegram не привязан.' };
    if (!r || r.exp < now) return { error: 'Код устарел — запросите новый.' };
    if (r.tries >= CODE_TRIES) { delete u.tgUnlinkReq; this.store.save(); return { error: 'Слишком много неверных попыток — запросите новый код.' }; }
    const a = Buffer.from(sha(`un:${u.id}:${String(code || '').trim()}`)), b = Buffer.from(r.h);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { r.tries++; this.store.save(); return { error: 'Неверный код.' }; }
    const chat = u.tg.chat; delete u.tg; delete u.tgUnlinkReq; this.store.save();
    this.tgSay(chat, `Аккаунт «${u.login}» отвязан от этого Telegram.`);
    return { msg: 'Telegram отвязан.' };
  };

  // сообщение боту (из опроса getUpdates)
  P.tgOnMessage = function tgOnMessage(msg, now = Date.now()) {
    if (!msg || !msg.chat || msg.chat.type !== 'private') return;
    const chat = msg.chat.id, text = String(msg.text || '').trim(), from = msg.from || {};
    if (msg.successful_payment) return this.payDone(msg, now); // оплата звёздами (tgpay.js)
    if (msg.refunded_payment) return this.payRefund(msg, now);
    if (/^\/paysupport(@\w+)?$/.test(text)) return this.paySupport(chat);
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
    this.tgSay(u.tg.chat, `🔑 Код для смены пароля в игре «Средневековье» (аккаунт «${u.login}»): ${code}\nДействует 15 минут. Никому его не сообщайте — администрация код никогда не спрашивает.\nЕсли это были не вы — просто ничего не делайте, пароль останется прежним.`);
    return same;
  };
  // шаг 2: код + новый пароль
  P.tgResetConfirm = function tgResetConfirm(login, code, newPass, ip = '', now = Date.now()) {
    const k = this.db.accts[String(login || '').trim().toLowerCase()], u = k && this.db.users[k], r = u && u.tgReset;
    const bad = { error: 'Неверный или устаревший код.' };
    if (!u || !r || r.exp < now) return bad;
    u.tgResetFails = (u.tgResetFails || []).filter((t) => t > now - 24 * HOUR);
    if (u.tgResetFails.length >= FAILS_PER_DAY) { delete u.tgReset; this.store.save(); return { error: 'Слишком много неверных кодов за сутки — попробуйте завтра.' }; }
    if (r.tries >= CODE_TRIES) { delete u.tgReset; this.store.save(); return { error: 'Слишком много неверных попыток — запросите новый код.' }; }
    const a = Buffer.from(sha(`${u.id}:${String(code || '').trim()}`)), b = Buffer.from(r.h);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { r.tries++; u.tgResetFails.push(now); this.store.save(); return bad; }
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
      this.tgApi('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'pre_checkout_query'] }, 60000).then((ups) => {
        wait = 1000;
        for (const up of ups || []) { offset = Math.max(offset, up.update_id + 1); try { if (up.pre_checkout_query) this.payPreCheckout(up.pre_checkout_query); else this.tgOnMessage(up.message); } catch (e) { console.error(e); } }
        setImmediate(loop);
      }).catch((e) => { console.error('бот Telegram:', e.message); wait = Math.min(wait * 2, 60000); setTimeout(loop, wait).unref(); });
    };
    loop();
  };
}

module.exports = { install, enabled, sha, CODE_TRIES, NOTIFY, apiTarget };
