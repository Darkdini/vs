'use strict';
// «Безопасность» для админа: подозрительные действия по IP-адресам — подбор паролей (особенно к админу),
// поиск дыр на сайте (запросы .php, .env, wp-admin, обход папок, попытки залить файл), флуд, слишком много соединений,
// подделанные запросы к серверу игры. Админ видит адреса и может заблокировать IP (сайт и игра для него закрыты).
// Адреса хранятся в базе (db.sec, не больше 500 самых свежих), блокировки — в db.ipBans.

const MAX_IPS = 500, MAX_SAMPLES = 6;
// автоблок: 3 запроса «поиск дыр» / «отправка файла» с одного адреса — IP закрыт на 30 дней (живой игрок таких запросов не делает).
// Не трогаем адреса, с которых уже входили игроки (у мобильного интернета адрес общий), и локальные адреса.
const AUTO_N = 3, AUTO_MS = 30 * 86400000;
const LOCAL = /^(127\.|::1$|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
// «прощупывание» сайта: так ищут уязвимости и пытаются залить скрипт (шелл)
const PROBE = /\.(php\d?|phtml|asp|aspx|jsp|cgi|pl|env|git|svn|sql|bak|old|swp|ini|conf|log|sh|tar|gz|rar|7z)(\/|$|\?)|wp-|wordpress|phpmyadmin|pma|admin\.php|xmlrpc|\/\.(?!well-known\/(?:acme|assetlinks|apple-app-site-association|security\.txt|change-password))|\.\.|\/etc\/|passwd|shell|cmd=|exec\(|eval\(|<script|base64|boaform|hnap|actuator|vendor\/|cgi-bin|owa\/|autodiscover|\.well-known\/(?!acme|assetlinks|apple-app-site-association|security\.txt|change-password)|solr|jenkins|manager\/html|config\.|server-status|console/i;
const KIND = { login: 'неверный пароль', admin: 'подбор пароля админа', lock: 'вход заблокирован', probe: 'поиск дыр на сайте', upload: 'попытка отправить файл/данные',
  flood: 'флуд запросами', conns: 'слишком много соединений', bad: 'подделанный запрос', origin: 'чужой сайт' };

function install(Game) {
  const P = Game.prototype;
  const SEC = (g) => { if (!g.db.sec) g.db.sec = {}; return g.db.sec; };
  P.secEvent = function secEvent(ip, kind, detail = '') {
    if (!ip) return;
    const s = SEC(this), now = Date.now();
    const x = s[ip] || (s[ip] = { ip, first: now, n: 0, kinds: {}, samples: [] });
    x.last = now; x.n++; x.kinds[kind] = (x.kinds[kind] || 0) + 1;
    const d = `${KIND[kind] || kind}${detail ? `: ${String(detail).slice(0, 80)}` : ''}`;
    if (!x.samples.includes(d)) { x.samples.push(d); if (x.samples.length > MAX_SAMPLES) x.samples.shift(); }
    if ((kind === 'probe' || kind === 'upload') && (x.kinds.probe || 0) + (x.kinds.upload || 0) >= AUTO_N) this.autoBan(ip, x);
    const ips = Object.keys(s); if (ips.length > MAX_IPS) { ips.sort((a, b) => s[a].last - s[b].last); for (const k of ips.slice(0, ips.length - MAX_IPS)) delete s[k]; }
  };
  P.secProbe = (url) => PROBE.test(url);
  P.playerIp = function playerIp(ip) { return Object.values(this.db.users).some((u) => !u.bot && (u.regIp === ip || (u.ips || []).some((y) => y.ip === ip))); };
  P.autoBan = function autoBan(ip, x) {
    const B = this.db.ipBans = this.db.ipBans || {};
    if (B[ip] || LOCAL.test(ip) || this.playerIp(ip)) return;
    const why = Object.entries(x.kinds).filter(([k]) => k === 'probe' || k === 'upload').map(([k, v]) => `${KIND[k]} ×${v}`).join(', ');
    B[ip] = { at: Date.now(), until: Date.now() + AUTO_MS, auto: true, why: `автоблок: ${why}` };
    if (this.store) this.store.save();
  };
  P.ipBanned = function ipBanned(ip) {
    const b = ip && this.db.ipBans && this.db.ipBans[ip]; if (!b) return false;
    if (b.until && b.until <= Date.now()) { delete this.db.ipBans[ip]; return false; } // срок автоблока вышел
    return true;
  };
  P.secNew = function secNew() { const seen = this.db.secSeen || 0; return Object.values(this.db.sec || {}).filter((x) => x.last > seen && (x.kinds.admin || x.kinds.probe || x.kinds.upload || x.n >= 10)).length; };
  // для админ-панели: самые «опасные» и свежие адреса
  P.secView = function secView(myIp) {
    for (const x of Object.values(this.db.sec || {})) if ((x.kinds.probe || 0) + (x.kinds.upload || 0) >= AUTO_N) this.autoBan(x.ip, x); // старые записи журнала — тоже под автоблок
    for (const ip of Object.keys(this.db.ipBans || {})) this.ipBanned(ip); // истёкшие снимаются
    const bans = this.db.ipBans || {}, seen = this.db.secSeen || 0;
    const score = (x) => (x.kinds.admin || 0) * 5 + (x.kinds.probe || 0) * 3 + (x.kinds.upload || 0) * 3 + (x.kinds.bad || 0) * 2 + (x.kinds.lock || 0) * 2 + (x.n || 0);
    const list = Object.values(this.db.sec || {}).map((x) => ({ ...x, kinds: Object.entries(x.kinds).map(([k, v]) => ({ k, t: KIND[k] || k, v })), score: score(x), banned: !!bans[x.ip], auto: !!(bans[x.ip] && bans[x.ip].auto), fresh: x.last > seen }))
      .sort((a, b) => b.last - a.last).slice(0, 200);
    this.db.secSeen = Date.now();
    return { me: myIp, list, bans: Object.entries(bans).map(([ip, b]) => ({ ip, ...b })).sort((a, b) => b.at - a.at) };
  };
  P.ipBan = function ipBan(ip, why, myIp) {
    ip = String(ip || '').trim(); if (!/^[0-9a-f.:]{3,45}$/i.test(ip)) return { error: 'Неверный IP.' };
    if (ip === myIp) return { error: 'Это ваш текущий адрес — себя не блокируем.' };
    (this.db.ipBans = this.db.ipBans || {})[ip] = { at: Date.now(), why: String(why || '').slice(0, 80) };
    return { ok: true, msg: `IP ${ip} заблокирован: сайт и игра для него закрыты.` };
  };
  P.ipUnban = function ipUnban(ip) { if (this.db.ipBans) delete this.db.ipBans[String(ip || '').trim()]; return { ok: true, msg: `IP ${ip} разблокирован.` }; };
}

module.exports = { install, PROBE, AUTO_N };
