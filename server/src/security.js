'use strict';
// Защита регистрации и учёт мультов.
// • Капча: картинка SVG с примером (цифры повёрнуты и сдвинуты, шум) — ответ хранится только на сервере, одноразовый, 5 минут.
// • Лимиты: регистраций с одного IP — 3 в час и 10 в сутки, всего на сервере — 30 в минуту; ошибок входа с IP — 20 за 10 минут.
// • Мульты: у каждого игрока запоминаются IP и id устройства (случайный id, который браузер хранит у себя);
//   админ видит группы аккаунтов с общим IP или общим устройством. Сам сервер никого не банит:
//   при появлении аккаунта на уже знакомом устройстве админам приходит оповещение, а решение принимает админ.
const crypto = require('crypto');

const LIM = { regHour: 3, regDay: 10, regMinuteAll: 30, failWindow: 600000, failMax: 20 };
const hits = new Map(); // ключ → массив времени событий
function hit(key, now = Date.now()) { const a = (hits.get(key) || []).filter((t) => t > now - 86400000); a.push(now); hits.set(key, a); }
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
  P.devBanned = function devBanned(dev) { dev = cleanDev(dev); return !!(dev && this.db.devBans && this.db.devBans[dev]); };
  // токены сессий: в базе хранится только SHA-256 токена, живёт 30 дней, у игрока не больше 5 устройств
  const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  P.issueToken = function issueToken(user) {
    const t = crypto.randomBytes(24).toString('hex'), now = Date.now();
    user.tokens = (user.tokens || []).filter((x) => x.exp > now); user.tokens.push({ h: sha(t), exp: now + 30 * 86400000 });
    if (user.tokens.length > 5) user.tokens.shift();
    this.store.save(); return t;
  };
  P.tokenLogin = function tokenLogin(login, token) {
    const u = Object.prototype.hasOwnProperty.call(this.db.users, String(login || '').toLowerCase()) ? this.db.users[String(login).toLowerCase()] : null;
    if (!u || !/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
    const h = Buffer.from(sha(token)), now = Date.now();
    return (u.tokens || []).some((x) => x.exp > now && crypto.timingSafeEqual(Buffer.from(x.h), h)) ? u : null;
  };
  P.dropToken = function dropToken(user, token) { if (user && token) { user.tokens = (user.tokens || []).filter((x) => x.h !== sha(token)); this.store.save(); } };
  P.regAllowed = function regAllowed(ip) {
    if (count(`reg:${ip}`, 3600000) >= LIM.regHour) return 'С вашего адреса слишком много регистраций. Попробуйте через час.';
    if (count(`reg:${ip}`, 86400000) >= LIM.regDay) return 'С вашего адреса слишком много регистраций сегодня.';
    if (count('reg:*', 60000) >= LIM.regMinuteAll) return 'Сервер перегружен регистрациями — попробуйте через минуту.';
    return null;
  };
  P.regDone = function regDone(ip) { hit(`reg:${ip}`); hit('reg:*'); };
  P.loginBlocked = (ip) => count(`fail:${ip}`, LIM.failWindow) >= LIM.failMax;
  P.loginFailed = (ip) => hit(`fail:${ip}`);
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

module.exports = { install, captcha, LIM };
