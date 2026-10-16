'use strict';
// Почта игроков: привязка адреса кодом и восстановление пароля по коду на почту.
// • Привязка: Кабинет → Профиль → «Привязать почту» → адрес → письмо с 6-значным кодом (15 минут, 5 попыток) → код → почта привязана.
//   Одна почта — один аккаунт. Привязать, сменить или отвязать почту — только с паролем от аккаунта (кто украл вход в игру,
//   не привяжет свою почту, чтобы потом сменить пароль); при смене и отвязке на прежний адрес уходит письмо.
// • «Забыли пароль?» в окне входа: логин или почта → код приходит на привязанную почту (и в Telegram, если он привязан, — tgauth.js)
//   → код + НОВЫЙ пароль. Пароль письмом не шлётся, в базе — только хеш кода.
// • Письма уходят с ящика игры на её домене (например noreply@middle-ages.ru в Яндекс 360 или VK WorkSpace) по SMTP и только
//   через шифрованное соединение: SMTP_HOST, SMTP_PORT (465 — сразу TLS, 587 — STARTTLS), SMTP_USER (адрес ящика),
//   SMTP_PASS (пароль приложения), SMTP_NAME (имя отправителя). Настройка на сервере — deploy/mail.sh. Без них привязка почты скрыта.
// Администратор так пароль не восстанавливает (его пароль — только на сервере: admin.sh / ADMIN_RESET).
const tls = require('tls'), net = require('net'), crypto = require('crypto');

const CODE_MS = 15 * 60000, CODE_TRIES = 5, SEND_PER_HOUR = 3, ALL_PER_HOUR = 200, FAILS_PER_DAY = 10, PW_TRIES = 5, HOUR = 3600000;
// адрес почты — латиницей, как в Яндексе, Mail.ru, Gmail; без пробелов, переводов строки и <> (иначе можно подсунуть команду почтовому серверу)
const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/i;
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const norm = (s) => String(s || '').trim().toLowerCase();
const cfg = () => { const port = Number(process.env.SMTP_PORT) || 465; // secure — TLS сразу (обычно порт 465), иначе STARTTLS
  return { host: process.env.SMTP_HOST || '', port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === '1' : port === 465, user: norm(process.env.SMTP_USER), pass: process.env.SMTP_PASS || '',
    name: process.env.SMTP_NAME || 'Средневековье' }; };
const enabled = () => { const c = cfg(); return !!(c.host && c.pass && EMAIL.test(c.user)); };
// адрес для чужих глаз: n***a@mail.ru
const mask = (e) => { const [a, d] = String(e).split('@'); return `${a.slice(0, 1)}***${a.length > 1 ? a.slice(-1) : ''}@${d}`; };

// ---------- SMTP: письмо через почтовый сервер ящика игры ----------
// ответы сервера: «250-…» — продолжение, «250 …» — последняя строка ответа
function replies(sock) {
  let buf = '', lines = [], err = null; const ready = [], wait = [];
  const give = (r) => { const w = wait.shift(); if (w) w.ok(r); else ready.push(r); };
  const onData = (d) => {
    buf += d.toString('utf8'); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); lines.push(line);
      if (/^\d{3}( |$)/.test(line)) { give({ code: Number(line.slice(0, 3)), text: lines.map((l) => l.slice(4)).join(' ').trim() }); lines = []; }
    }
    if (buf.length > 65536) onEnd(new Error('почтовый сервер прислал слишком длинную строку'));
  };
  const onEnd = (e) => { err = err || (e instanceof Error ? e : new Error('почтовый сервер закрыл соединение')); while (wait.length) wait.shift().no(err); };
  sock.on('data', onData); sock.on('error', onEnd); sock.on('close', onEnd);
  return {
    next: () => new Promise((ok, no) => { if (ready.length) ok(ready.shift()); else if (err) no(err); else wait.push({ ok, no }); }),
    stop: () => { sock.off('data', onData); sock.off('error', onEnd); sock.off('close', onEnd); },
  };
}
const tlsOpts = (c) => ({ servername: c.host, minVersion: 'TLSv1.2', ...(c.ca ? { ca: c.ca } : {}) }); // ca — только в тестах (свой сертификат)
function open(c) {
  return new Promise((ok, no) => {
    const s = c.secure ? tls.connect({ host: c.host, port: c.port, ...tlsOpts(c) }) : net.connect({ host: c.host, port: c.port });
    const t = setTimeout(() => s.destroy(new Error('почтовый сервер не отвечает')), c.timeout || 20000);
    s.once(c.secure ? 'secureConnect' : 'connect', () => { clearTimeout(t); s.removeListener('error', no); ok(s); });
    s.once('error', (e) => { clearTimeout(t); no(e); });
  });
}
// разговор с почтовым сервером; mail — { to, data } или null (только проверка входа: deploy/mail.sh)
// Пароль ящика уходит только по шифрованному соединению: secure (порт 465) — TLS сразу, иначе — STARTTLS (без него — отказ)
async function smtp(c, mail) {
  let s = await open(c), rd = replies(s);
  const guard = (x) => x.setTimeout(c.timeout || 20000, () => x.destroy(new Error('почтовый сервер не отвечает')));
  guard(s);
  const say = async (line, codes) => {
    if (line !== null) s.write(`${line}\r\n`);
    const r = await rd.next();
    if (!codes.includes(r.code)) throw new Error(`почтовый сервер: ${r.code} ${r.text}`.slice(0, 300));
    return r;
  };
  try {
    const helo = `EHLO ${c.user.split('@')[1] || 'localhost'}`;
    await say(null, [220]);
    const eh = await say(helo, [250]);
    if (!c.secure) {
      if (!/STARTTLS/i.test(eh.text)) throw new Error('почтовый сервер не предлагает шифрование (STARTTLS) — пароль не отправлен');
      await say('STARTTLS', [220]); rd.stop(); s.on('error', () => {}); // ошибки «нижнего» соединения — без падения игры: дальше говорит TLS
      s = await new Promise((ok, no) => { const t = tls.connect({ socket: s, ...tlsOpts(c) }, () => { t.removeListener('error', no); ok(t); }); t.once('error', no); });
      rd = replies(s); guard(s);
      await say(helo, [250]);
    }
    await say(`AUTH PLAIN ${Buffer.from(`\0${c.user}\0${c.pass}`).toString('base64')}`, [235]);
    if (mail) {
      await say(`MAIL FROM:<${c.user}>`, [250]);
      await say(`RCPT TO:<${mail.to}>`, [250, 251]);
      await say('DATA', [354]);
      await say(`${mail.data}\r\n.`, [250]);
    }
    await say('QUIT', [221]).catch(() => {});
  } finally { rd.stop(); s.on('error', () => {}); s.end(); setTimeout(() => s.destroy(), 1000).unref(); } // поздняя ошибка соединения не уронит игру
}
// письмо: обычный текст UTF-8 (base64 — строки письма не начинаются с точки); тема и имя — кусками по 30 байт (RFC 2047),
// каждая строка короче 78 знаков
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const words = (s) => { const out = []; let cur = ''; for (const ch of String(s)) { if (Buffer.byteLength(cur + ch) > 30) { out.push(cur); cur = ''; } cur += ch; } if (cur) out.push(cur); return out.map((w) => `=?UTF-8?B?${b64(w)}?=`).join('\r\n '); };
function letter(c, to, subject, text) {
  return [`From: ${words(c.name)}\r\n <${c.user}>`, `To: <${to}>`, `Subject: ${words(subject)}`, `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${c.user.split('@')[1]}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    b64(String(text).replace(/\r?\n/g, '\r\n')).replace(/.{1,76}/g, (x) => `${x}\r\n`).replace(/\r\n$/, '')].join('\r\n');
}
const sign = '\n\nАдминистрация никогда не спрашивает коды и пароли.\n— Игра «Средневековье»';

function install(Game) {
  const P = Game.prototype;
  // отправка одного письма; в тестах подменяется (как tgApi в tgauth.js)
  P.mailSend = function mailSend(to, subject, text) { const c = cfg(); return smtp(c, { to, data: letter(c, to, subject, text) }); };
  // письма уходят по одному; на весь сервер — не больше ALL_PER_HOUR в час (почтовый сервис иначе примет ящик за рассылку спама)
  P.mailOut = function mailOut(to, subject, text, now = Date.now()) {
    this.mailHour = (this.mailHour || []).filter((t) => t > now - HOUR);
    if (this.mailHour.length >= ALL_PER_HOUR) { console.error('почта: лимит писем в час исчерпан'); return Promise.resolve(false); }
    this.mailHour.push(now);
    const job = (this.mailQ || Promise.resolve()).then(() => this.mailSend(to, subject, `${text}${sign}`)).then(() => true, (e) => { console.error('почта:', e.message); return false; });
    this.mailQ = job; return job;
  };
  P.mailOwner = function mailOwner(addr, except) { return Object.values(this.db.users).find((x) => x !== except && x.emailOk && x.email === addr) || null; };
  // блок «Почта» в Профиле
  P.mailInfo = function mailInfo(u, now = Date.now()) {
    const r = u && u.emailReq && u.emailReq.exp > now ? u.emailReq : null;
    return { on: enabled(), email: u && u.emailOk ? u.email : '', pending: r ? r.addr : '',
      suggest: u && !u.emailOk ? [u.email, u.acct].find((x) => EMAIL.test(x || '')) || '' : '' };
  };
  // пароль от аккаунта для смены/отвязки почты: не больше PW_TRIES неверных за 10 минут
  const pwCheck = (g, u, pass, now) => {
    u.mailPwFails = (u.mailPwFails || []).filter((t) => t > now - 600000);
    if (u.mailPwFails.length >= PW_TRIES) return 'Слишком много попыток с неверным паролем — подождите 10 минут.';
    if (g.passOk(u, pass)) { delete u.mailPwFails; return null; }
    u.mailPwFails.push(now); g.store.save(); return 'Неверный пароль от аккаунта.';
  };

  // привязка, шаг 1: код на новый адрес — только с паролем от аккаунта
  P.mailLinkStart = async function mailLinkStart(u, addr, pass, now = Date.now()) {
    if (!enabled()) return { error: 'Почта пока не подключена администрацией.' };
    if (u.admin) return { error: 'Аккаунт администратора к почте не привязывается.' };
    addr = norm(addr);
    if (addr.length > 100 || !EMAIL.test(addr)) return { error: 'Проверьте адрес почты: например name@mail.ru (латиницей).' };
    if (u.emailOk && u.email === addr) return { error: 'Эта почта уже привязана.' };
    const pe = pwCheck(this, u, pass, now); if (pe) return { error: pe };
    if (this.mailOwner(addr, u)) return { error: 'Эта почта уже привязана к другому аккаунту.' };
    const sent = (u.mailSent || []).filter((t) => t > now - HOUR); if (sent.length >= SEND_PER_HOUR) return { error: 'Слишком много кодов — попробуйте через час.' };
    const code = String(crypto.randomInt(100000, 1000000));
    u.mailSent = [...sent, now]; u.emailReq = { addr, h: sha(`ml:${u.id}:${addr}:${code}`), exp: now + CODE_MS, tries: 0 }; this.store.save();
    const ok = await this.mailOut(addr, 'Код для привязки почты', `Здравствуйте, ${u.login}!\n\nКод для привязки этой почты к аккаунту «${u.login}» в игре «Средневековье»: ${code}\nКод действует 15 минут. Введите его в игре: Кабинет → Профиль.\n\nЕсли вы ничего не привязывали — просто удалите письмо.`, now);
    if (!ok) { if (u.emailReq && u.emailReq.addr === addr) delete u.emailReq; u.mailSent = (u.mailSent || []).filter((t) => t !== now); this.store.save(); return { error: 'Не получилось отправить письмо — попробуйте позже.' }; }
    return { msg: `Код отправлен на ${addr}. Не пришло — загляните в папку «Спам».` };
  };
  // шаг 2: код из письма
  P.mailLinkConfirm = function mailLinkConfirm(u, code, now = Date.now()) {
    const r = u.emailReq;
    if (!r || r.exp < now) return { error: 'Код устарел — запросите новый.' };
    if (r.tries >= CODE_TRIES) { delete u.emailReq; this.store.save(); return { error: 'Слишком много неверных попыток — запросите новый код.' }; }
    if (!same(sha(`ml:${u.id}:${r.addr}:${String(code || '').trim()}`), r.h)) { r.tries++; this.store.save(); return { error: 'Неверный код.' }; }
    if (this.mailOwner(r.addr, u)) { delete u.emailReq; this.store.save(); return { error: 'Эта почта уже привязана к другому аккаунту.' }; }
    const old = u.emailOk ? u.email : '';
    u.email = r.addr; u.emailOk = true; u.emailAt = now; delete u.emailReq; this.store.save();
    if (old && old !== u.email) this.mailOut(old, 'Почта аккаунта изменена', `Почта аккаунта «${u.login}» в игре «Средневековье» изменена на ${mask(u.email)}.\nЕсли это были не вы — сразу напишите администрации игры.`, now);
    return { msg: `Почта ${u.email} привязана. Забудете пароль — код придёт сюда.` };
  };
  P.mailCancel = function mailCancel(u) { delete u.emailReq; this.store.save(); return { msg: 'Привязка отменена.' }; };
  // отвязка — с паролем от аккаунта; на прежний адрес — письмо
  P.mailUnlink = function mailUnlink(u, pass, now = Date.now()) {
    if (!u.emailOk) return { error: 'Почта не привязана.' };
    const e = pwCheck(this, u, pass, now); if (e) return { error: e };
    const old = u.email; delete u.emailOk; delete u.emailAt; delete u.mailReset; u.email = ''; this.store.save();
    this.mailOut(old, 'Почта отвязана', `Почта отвязана от аккаунта «${u.login}» в игре «Средневековье».\nЕсли это были не вы — сразу напишите администрации игры.`, now);
    return { msg: 'Почта отвязана.' };
  };

  // аккаунт по логину для входа или по привязанной почте
  P.userByLoginOrMail = function userByLoginOrMail(who) {
    const k = norm(who); if (!k || k.length > 100) return null;
    const a = this.db.accts[k]; if (a && this.db.users[a]) return this.db.users[a];
    return EMAIL.test(k) ? this.mailOwner(k, null) : null;
  };
  // «Забыли пароль?» шаг 1: код — на привязанную почту и в Telegram (что привязано). Ответ всегда одинаковый:
  // по нему нельзя узнать, есть ли такой аккаунт и что к нему привязано
  P.resetRequest = function resetRequest(who, ip = '', now = Date.now()) {
    const mailOn = enabled(), tgOn = require('./tgauth').enabled();
    if (!mailOn && !tgOn) return { error: 'Восстановление пароля пока не подключено — напишите администрации.' };
    const rl = this.mailResetRl = this.mailResetRl || new Map(), key = `ip:${ip}`, hits = (rl.get(key) || []).filter((t) => t > now - HOUR);
    if (hits.length >= SEND_PER_HOUR * 3) return { error: 'Слишком много запросов — попробуйте через час.' };
    hits.push(now); rl.set(key, hits);
    if (rl.size > 20000) for (const [k, v] of rl) if (!v.some((t) => t > now - HOUR)) rl.delete(k);
    const u = this.userByLoginOrMail(who);
    if (u && mailOn) this.mailResetRequest(u, now);
    if (u && tgOn) this.tgResetRequest(u.acct, ip, now);
    return { msg: `${mailOn && tgOn ? 'Если к аккаунту привязаны почта или Telegram, мы прислали код.' : mailOn ? 'Если к аккаунту привязана почта, мы прислали на неё код.'
      : 'Если к аккаунту привязан Telegram, бот прислал код.'} Код действует 15 минут.` };
  };
  P.mailResetRequest = function mailResetRequest(u, now = Date.now()) {
    if (!enabled() || !u || u.bot || u.admin || !u.emailOk) return false;
    const sent = (u.mailSent || []).filter((t) => t > now - HOUR); if (sent.length >= SEND_PER_HOUR) return false; // не чаще 3 кодов в час на аккаунт
    const code = String(crypto.randomInt(100000, 1000000));
    u.mailSent = [...sent, now]; u.mailReset = { h: sha(`mr:${u.id}:${code}`), exp: now + CODE_MS, tries: 0 }; this.store.save();
    this.mailOut(u.email, 'Код для смены пароля', `Код для смены пароля аккаунта «${u.login}» в игре «Средневековье»: ${code}\nКод действует 15 минут. Введите его в окне входа вместе с новым паролем.\n\nЕсли вы не просили сменить пароль — просто удалите письмо: без кода пароль никто не сменит.`, now);
    return true;
  };
  // шаг 2: код (из письма или из Telegram) + новый пароль
  P.resetConfirm = function resetConfirm(who, code, newPass, ip = '', now = Date.now()) {
    const p = String(newPass || '').toLowerCase();
    if (p.length < 5) return { error: 'Новый пароль слишком короткий (минимум 5 символов).' };
    if (p.length > 40) return { error: 'Новый пароль слишком длинный.' };
    const u = this.userByLoginOrMail(who);
    if (u && u.mailReset && u.mailReset.exp > now) {
      const r = this.mailResetConfirm(u, code, p, ip, now);
      if (!r.error || !(u.tgReset && u.tgReset.exp > now)) return r;
    }
    return this.tgResetConfirm(u ? u.acct : who, code, p, ip, now);
  };
  P.mailResetConfirm = function mailResetConfirm(u, code, p, ip = '', now = Date.now()) {
    const r = u.mailReset, bad = { error: 'Неверный или устаревший код.' };
    if (!r || r.exp < now) return bad;
    // неверных кодов на аккаунт за сутки: без этого перебор 6-значного кода (5 попыток × 3 кода в час) за год угадывал бы с шансом ~15%
    u.mailResetFails = (u.mailResetFails || []).filter((t) => t > now - 24 * HOUR);
    if (u.mailResetFails.length >= FAILS_PER_DAY) { delete u.mailReset; this.store.save(); return { error: 'Слишком много неверных кодов за сутки — попробуйте завтра.' }; }
    if (r.tries >= CODE_TRIES) { delete u.mailReset; this.store.save(); return { error: 'Слишком много неверных попыток — запросите новый код.' }; }
    if (!same(sha(`mr:${u.id}:${String(code || '').trim()}`), r.h)) { r.tries++; u.mailResetFails.push(now); this.store.save(); return bad; }
    this.setPasswordReset(u, p, ip, 'mail'); delete u.mailReset; delete u.tgReset; this.store.save();
    this.mailOut(u.email, 'Пароль изменён', `Пароль аккаунта «${u.login}» в игре «Средневековье» изменён по коду из письма. Все прежние входы завершены.\nЕсли это были не вы — сразу напишите администрации игры.`, now);
    return { msg: 'Пароль изменён — войдите с новым паролем.', login: u.acct, uid: u.id };
  };

  // админка → «Безопасность»: подключена ли почта, проверочное письмо (ошибку почтового сервера видно сразу)
  P.mailStatus = function mailStatus() {
    const c = cfg(); return { on: enabled(), from: c.user, host: c.host, port: c.port, hour: (this.mailHour || []).length, bound: Object.values(this.db.users).filter((u) => u.emailOk).length };
  };
  P.mailTest = async function mailTest(admin, addr) {
    if (!admin || !admin.admin) return { error: 'Нет прав.' };
    if (!enabled()) return { error: 'Почта не подключена: на сервере выполните sh /opt/war/game/mail.sh' };
    addr = norm(addr); if (!EMAIL.test(addr)) return { error: 'Проверьте адрес почты.' };
    try { await this.mailSend(addr, 'Проверка почты игры', `Это проверочное письмо из админки игры «Средневековье».\nЕсли вы его видите — письма игрокам с кодами доходят.${sign}`); }
    catch (e) { return { error: `Письмо не отправилось: ${e.message}` }; }
    return { msg: `Проверочное письмо отправлено на ${addr}. Не видно — загляните в «Спам».` };
  };
}

// проверка входа в почтовый сервер с настройками из окружения (deploy/mail.sh): письмо не отправляется
if (require.main === module && process.argv[2] === 'check') {
  smtp(cfg(), null).then(() => { console.log(`✓ Вход в почтовый сервер ${cfg().host} — успешно.`); process.exit(0); }, (e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}

module.exports = { install, enabled, EMAIL, smtp, letter, mask, CODE_TRIES };
