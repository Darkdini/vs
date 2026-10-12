'use strict';
// Защита регистрации и учёт мультов.
// • Капча: картинка SVG с примером (цифры повёрнуты и сдвинуты, шум) — ответ хранится только на сервере, одноразовый, 5 минут.
// • Лимиты: регистраций с одного IP — 3 в час и 10 в сутки, всего на сервере — 30 в минуту; ошибок входа с IP — 20 за 10 минут.
// • Мульты: у каждого игрока запоминаются IP и id устройства (случайный id, который браузер хранит у себя);
//   админ видит группы аккаунтов с общим IP или общим устройством. Сам сервер никого не банит:
//   при появлении аккаунта на уже знакомом устройстве админам приходит оповещение, а решение принимает админ.
const crypto = require('crypto');

const LIM = { regHour: 3, regDay: 10, regMinuteAll: 30, failWindow: 600000, failMax: 3, failLoginMax: 10, lockMs: 180000 };
const locks = new Map(); // ключ → время, до которого вход закрыт
const hits = new Map(); // ключ → массив времени событий
let hitN = 0;
function hit(key, now = Date.now()) {
  const a = (hits.get(key) || []).filter((t) => t > now - 86400000); a.push(now); hits.set(key, a);
  if (++hitN % 2000 === 0) for (const [k, v] of hits) if (!v.some((t) => t > now - 86400000)) hits.delete(k); // старые адреса не копятся в памяти
}
// частота действий игрока (письма, чат, пересылка отчётов, рассылка и форум альянса, баг-репорты):
// без этого один игрок мог слать по 25 писем в секунду — база росла на сотни мегабайт в час, получатель тонул в письмах.
// limits — [[сколько, за сколько мс], ...]; админ не ограничен
const acts = new Map();
function tooOften(user, key, limits, now = Date.now()) {
  if (!user || user.admin) return null;
  const k = `${key}:${user.id}`, span = Math.max(...limits.map((l) => l[1])), a = (acts.get(k) || []).filter((t) => t > now - span);
  for (const [n, ms] of limits) if (a.filter((t) => t > now - ms).length >= n) { acts.set(k, a); return ms >= 3600000 ? 'Лимит на сегодня исчерпан — попробуйте позже.' : 'Не так часто — подождите немного.'; }
  a.push(now); acts.set(k, a);
  if (acts.size > 20000) for (const [kk, v] of acts) if (!v.some((t) => t > now - 86400000)) acts.delete(kk);
  return null;
}
const RATE = { // [сколько, за сколько мс]
  mail: [[1, 2000], [40, 3600000], [300, 86400000]],
  chat: [[1, 1500], [15, 60000]],
  bug: [[1, 20000], [20, 86400000]],
  repfwd: [[1, 3000], [50, 86400000]],
  allymail: [[1, 60000], [20, 86400000]],
  allypost: [[1, 5000], [200, 86400000]],
};
function count(key, ms, now = Date.now()) { return (hits.get(key) || []).filter((t) => t > now - ms).length; }

function captcha() {
  const a = 2 + crypto.randomInt(18), b = 1 + crypto.randomInt(9), plus = crypto.randomInt(2) === 0;
  const text = `${plus ? a : a + b} ${plus ? '+' : '−'} ${b} =`, answer = plus ? a + b : a;
  const W = 200, H = 64, rnd = (n) => crypto.randomInt(n);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="8" fill="#f3e2c0"/>`;
  for (let i = 0; i < 7; i++) s += `<path d="M${rnd(W)} ${rnd(H)} Q${rnd(W)} ${rnd(H)} ${rnd(W)} ${rnd(H)}" stroke="hsl(${rnd(360)},45%,45%)" stroke-width="${1 + rnd(2)}" fill="none" opacity=".6"/>`;
  for (let i = 0; i < 40; i++) s += `<circle cx="${rnd(W)}" cy="${rnd(H)}" r="${1 + rnd(2)}" fill="hsl(${rnd(360)},40%,40%)" opacity=".5"/>`;
  let x = 12;
  for (const ch of text) {
    if (ch === ' ') { x += 8; continue; }
    const y = 40 + rnd(12) - 6, r = rnd(50) - 25, sz = 26 + rnd(10);
    s += `<text x="${x}" y="${y}" font-size="${sz}" font-family="Georgia,serif" font-weight="700" fill="hsl(${rnd(360)},55%,${22 + rnd(15)}%)" transform="rotate(${r} ${x + 8} ${y - 10})">${ch}</text>`;
    x += 16 + rnd(8);
  }
  for (let i = 0; i < 3; i++) s += `<path d="M0 ${rnd(H)} C${rnd(W)} ${rnd(H)} ${rnd(W)} ${rnd(H)} ${W} ${rnd(H)}" stroke="#5a2a10" stroke-width="1.5" fill="none" opacity=".45"/>`;
  s += '</svg>';
  return { answer, img: `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}` };
}

function install(Game) {
  const P = Game.prototype;
  const cleanDev = (d) => (/^[a-f0-9]{16,40}$/.test(String(d || '')) ? String(d) : '');
  // запомнить, откуда вошёл игрок (последние 20 IP и 10 устройств)
  P.trackLogin = function trackLogin(user, ip, dev) {
    const now = Date.now(); dev = cleanDev(dev);
    if (dev && !user.bot && !(user.devs || []).some((x) => x.dev === dev)) this.multiAlert(user, dev);
    user.ips = (user.ips || []).filter((x) => x.ip !== ip); user.ips.push({ ip, at: now }); if (user.ips.length > 20) user.ips.shift();
    if (dev) { user.devs = (user.devs || []).filter((x) => x.dev !== dev); user.devs.push({ dev, at: now }); if (user.devs.length > 10) user.devs.shift(); }
  };
  // новый аккаунт на устройстве, где уже играют другие, — запись в журнал и оповещение всем админам
  P.multiAlert = function multiAlert(user, dev) {
    const others = Object.values(this.db.users).filter((u) => u !== user && !u.bot && (u.devs || []).some((x) => x.dev === dev)).map((u) => u.login);
    if (!others.length) return;
    const log = this.db.multiLog = this.db.multiLog || [];
    log.push({ at: Date.now(), login: user.login, with: others.slice(0, 10), dev }); if (log.length > 200) log.shift();
    for (const a of Object.values(this.db.users)) if (a.admin) this.event(a.id, `⚠ Возможный мульт: ${user.login} — одно устройство с ${others.slice(0, 3).join(', ')}${others.length > 3 ? '…' : ''}`);
  };
  // подробные данные устройства (присылает клиент после входа): модель, система, браузер, экран, железо, «отпечаток» железа
  const str = (v, n = 120) => String(v == null ? '' : v).replace(/[<>\u0000-\u001f]/g, '').slice(0, n);
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
  function parseUA(ua) {
    const r = { os: '', browser: '', model: '' };
    let m;
    if ((m = /Android\s+([\d.]+)/.exec(ua))) { r.os = `Android ${m[1]}`; const mm = /Android[^;)]*;\s*(?:[a-z]{2}[-_][A-Za-z]{2};\s*)?([^;)]+?)(?:\s+Build\/|\))/.exec(ua); if (mm && !/^(K|wv|Linux)$/.test(mm[1].trim())) r.model = mm[1].trim(); }
    else if ((m = /(iPhone|iPad)[^)]*OS ([\d_]+)/.exec(ua))) { r.os = `iOS ${m[2].replace(/_/g, '.')}`; r.model = m[1]; }
    else if ((m = /Windows NT ([\d.]+)/.exec(ua))) r.os = `Windows ${{ '10.0': '10/11', '6.3': '8.1', '6.1': '7' }[m[1]] || m[1]}`;
    else if (/Mac OS X/.test(ua)) r.os = 'macOS'; else if (/Linux/.test(ua)) r.os = 'Linux';
    if (/WarKingsApp/.test(ua)) r.browser = 'Приложение (APK)';
    else if ((m = /YaBrowser\/([\d.]+)/.exec(ua))) r.browser = `Яндекс ${m[1].split('.')[0]}`;
    else if ((m = /SamsungBrowser\/([\d.]+)/.exec(ua))) r.browser = `Samsung ${m[1].split('.')[0]}`;
    else if ((m = /OPR\/([\d.]+)/.exec(ua))) r.browser = `Opera ${m[1].split('.')[0]}`;
    else if ((m = /Firefox\/([\d.]+)/.exec(ua))) r.browser = `Firefox ${m[1].split('.')[0]}`;
    else if ((m = /Edg\/([\d.]+)/.exec(ua))) r.browser = `Edge ${m[1].split('.')[0]}`;
    else if ((m = /Chrome\/([\d.]+)/.exec(ua))) r.browser = `${/; wv\)/.test(ua) ? 'WebView ' : 'Chrome '}${m[1].split('.')[0]}`;
    else if (/Safari/.test(ua)) r.browser = 'Safari';
    return r;
  }
  P.devInfo = function devInfo(user, ip, m) {
    const dev = cleanDev(m.dev); if (!dev) return;
    const ua = str(m.ua, 400), pu = parseUA(ua), now = Date.now();
    const list = user.devInfo = (user.devInfo || []).filter((x) => x.dev !== dev || (x._keep = true));
    const old = (user.devInfo || []).find((x) => x._keep) || null; if (old) delete old._keep;
    const d = old || { dev, first: now, count: 0, ips: [] };
    Object.assign(d, { fp: /^[a-f0-9]{8,40}$/.test(String(m.fp || '')) ? String(m.fp) : '', ua, os: pu.os + (m.osv && !/iOS/.test(pu.os) ? '' : ''), osv: str(m.osv, 20),
      model: str(m.model, 60) || pu.model, browser: pu.browser, app: !!m.app, plat: str(m.plat, 40), scr: str(m.scr, 20), dpr: num(m.dpr), cores: num(m.cores), mem: num(m.mem),
      touch: num(m.touch), lang: str(m.lang, 20), tz: str(m.tz, 40), gpu: str(m.gpu, 100), last: now });
    d.count = (d.count || 0) + 1;
    d.ips = [...new Set([ip, ...(d.ips || [])])].slice(0, 10);
    if (!old) list.push(d);
    user.devInfo = list.filter((x) => !x._keep).slice(-10);
    if (d.fp && !user.bot) this.fpAlert(user, d.fp);
    // железо в бане — блокируется и этот id устройства (игрок очистил данные / сменил браузер)
    const banned = !user.admin && d.fp && this.db.fpBans && this.db.fpBans[d.fp];
    if (banned) { this.db.devBans = this.db.devBans || {}; this.db.devBans[dev] = { at: now, by: `железо ${d.fp.slice(0, 8)}` }; }
    this.store.save();
    return banned ? 'banned' : '';
  };
  // тот же «отпечаток» железа, но другой id устройства — аккаунт с того же телефона после очистки данных / из другого браузера
  P.fpAlert = function fpAlert(user, fp) {
    const others = Object.values(this.db.users).filter((u) => u !== user && !u.bot && (u.devInfo || []).some((x) => x.fp === fp)).map((u) => u.login);
    if (!others.length) return;
    user.fpSeen = user.fpSeen || [];
    if (user.fpSeen.includes(fp)) return; user.fpSeen.push(fp);
    const log = this.db.multiLog = this.db.multiLog || [];
    log.push({ at: Date.now(), login: user.login, with: others.slice(0, 10), dev: `отпечаток ${fp.slice(0, 8)}` }); if (log.length > 200) log.shift();
    for (const a of Object.values(this.db.users)) if (a.admin) this.event(a.id, `⚠ Возможный мульт: ${user.login} — то же железо телефона, что у ${others.slice(0, 3).join(', ')}${others.length > 3 ? '…' : ''}`);
  };
  // всё об устройствах игрока для админки + совпадения с другими аккаунтами (по id устройства, отпечатку железа, IP)
  P.devReport = function devReport(user) {
    const users = Object.values(this.db.users).filter((u) => u !== user && !u.bot);
    const byDev = (dev) => users.filter((u) => (u.devs || []).some((x) => x.dev === dev) || (u.devInfo || []).some((x) => x.dev === dev)).map((u) => u.login);
    const byFp = (fp) => (fp ? users.filter((u) => (u.devInfo || []).some((x) => x.fp === fp)).map((u) => u.login) : []);
    const ips = (user.ips || []).map((x) => x.ip);
    const byIp = [...new Set(users.filter((u) => (u.ips || []).some((x) => ips.includes(x.ip)) || (u.regIp && ips.includes(u.regIp))).map((u) => u.login))];
    const known = new Set((user.devInfo || []).map((x) => x.dev));
    const devices = [...(user.devInfo || []).slice().reverse().map((d) => ({ ...d, banned: !!(this.db.devBans && this.db.devBans[d.dev]), fpBanned: !!(d.fp && this.db.fpBans && this.db.fpBans[d.fp]), sameDev: byDev(d.dev), sameFp: byFp(d.fp) })),
      ...(user.devs || []).filter((x) => !known.has(x.dev)).map((x) => ({ dev: x.dev, last: x.at, old: true, banned: !!(this.db.devBans && this.db.devBans[x.dev]), sameDev: byDev(x.dev), sameFp: [] }))];
    return { devices, ips: (user.ips || []).slice().reverse(), regIp: user.regIp || '', sameIp: byIp.slice(0, 50) };
  };
  P.tooOften = function tooOftenP(user, kind) { return tooOften(user, kind, RATE[kind]); };
  P.devBanned = function devBanned(dev) { dev = cleanDev(dev); return !!(dev && this.db.devBans && this.db.devBans[dev]); };
  // токены сессий: в базе хранится только SHA-256 токена, живёт 30 дней (каждый вход продлевает до 90), у игрока не больше 5 устройств
  const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  P.issueToken = function issueToken(user) {
    const t = crypto.randomBytes(24).toString('hex'), now = Date.now();
    user.tokens = (user.tokens || []).filter((x) => x.exp > now); user.tokens.push({ h: sha(t), exp: now + 30 * 86400000 });
    if (user.tokens.length > 5) user.tokens.shift();
    this.store.save(); return t;
  };
  P.tokenLogin = function tokenLogin(login, token) {
    const k = String(login || '').trim(); // «admin» — прежний ник админа (сохранённые входы «Запомнить меня»)
    const u = Object.prototype.hasOwnProperty.call(this.db.users, k) ? this.db.users[k] : k.toLowerCase() === 'admin' ? this.adminUser() : null;
    if (!u || !/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
    const h = Buffer.from(sha(token)), now = Date.now();
    const t = (u.tokens || []).find((x) => x.exp > now && crypto.timingSafeEqual(Buffer.from(x.h), h)); if (!t) return null;
    // «Запомнить меня» не протухает, пока игрок заходит: каждый вход продлевает сохранённый вход на 90 дней
    if (t.exp - now < 89 * 86400000) { t.exp = now + 90 * 86400000; this.store.save(); }
    return u;
  };
  P.dropToken = function dropToken(user, token) { if (user && token) { user.tokens = (user.tokens || []).filter((x) => x.h !== sha(token)); this.store.save(); } };
  P.regAllowed = function regAllowed(ip) {
    if (count(`reg:${ip}`, 3600000) >= LIM.regHour) return 'С вашего адреса слишком много регистраций. Попробуйте через час.';
    if (count(`reg:${ip}`, 86400000) >= LIM.regDay) return 'С вашего адреса слишком много регистраций сегодня.';
    if (count('reg:*', 60000) >= LIM.regMinuteAll) return 'Сервер перегружен регистрациями — попробуйте через минуту.';
    return null;
  };
  P.regDone = function regDone(ip) { hit(`reg:${ip}`); hit('reg:*'); };
  // от подбора пароля: 3 неверных входа с адреса → вход закрыт на 3 минуты; 10 неверных на один логин с любых адресов → этот логин на 3 минуты
  const lockLeft = (k, now) => Math.max(0, (locks.get(k) || 0) - now);
  P.loginBlocked = (ip, login, now = Date.now()) => Math.ceil(Math.max(lockLeft(`ip:${ip}`, now), lockLeft(`lg:${String(login || '').toLowerCase()}`, now)) / 1000);
  P.loginFailed = (ip, login, now = Date.now()) => {
    const lg = String(login || '').toLowerCase().slice(0, 20);
    hit(`fail:${ip}`, now); hit(`faillg:${lg}`, now);
    if (count(`fail:${ip}`, LIM.failWindow, now) >= LIM.failMax) { locks.set(`ip:${ip}`, now + LIM.lockMs); hits.delete(`fail:${ip}`); }
    if (count(`faillg:${lg}`, LIM.failWindow, now) >= LIM.failLoginMax) { locks.set(`lg:${lg}`, now + LIM.lockMs); hits.delete(`faillg:${lg}`); }
    return P.loginBlocked(ip, lg, now);
  };
  P.loginOk = (ip) => hits.delete(`fail:${ip}`);
  P.loginTriesLeft = (ip, now = Date.now()) => Math.max(0, LIM.failMax - count(`fail:${ip}`, LIM.failWindow, now));
  // группы подозрительных аккаунтов: общий id устройства или общий IP
  P.multis = function multis() {
    const byDev = new Map(), byIp = new Map();
    for (const u of Object.values(this.db.users)) {
      if (u.bot) continue;
      for (const d of u.devs || []) (byDev.get(d.dev) || byDev.set(d.dev, new Set()).get(d.dev)).add(u);
      for (const x of u.ips || []) (byIp.get(x.ip) || byIp.set(x.ip, new Set()).get(x.ip)).add(u);
    }
    const info = (u) => ({ login: u.login, rating: this.userRating(u), lastSeen: u.lastSeen || u.created, banned: !!u.banned, admin: !!u.admin });
    const groups = [];
    const bans = this.db.devBans || {};
    for (const [dev, set] of byDev) if (set.size > 1 || bans[dev]) groups.push({ kind: 'dev', key: dev.slice(0, 8), dev, devBanned: !!bans[dev], strong: true, users: [...set].map(info) });
    for (const [ip, set] of byIp) if (set.size > 1) groups.push({ kind: 'ip', key: ip, strong: false, users: [...set].map(info) });
    return groups.sort((a, b) => (b.strong - a.strong) || (b.users.length - a.users.length)).slice(0, 100);
  };
}

module.exports = { install, captcha, LIM, tooOften, RATE };
