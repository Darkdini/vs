'use strict';
// «Безопасность» для админа: подозрительные действия по IP-адресам — подбор паролей (особенно к админу),
// поиск дыр на сайте (запросы .php, .env, wp-admin, обход папок, попытки залить файл), флуд, слишком много соединений,
// подделанные запросы к серверу игры. Админ видит адреса и может заблокировать IP (сайт и игра для него закрыты).
// Адреса хранятся в базе (db.sec, не больше 500 самых свежих), блокировки — в db.ipBans.

const MAX_IPS = 500, MAX_SAMPLES = 6;
// «прощупывание» сайта: так ищут уязвимости и пытаются залить скрипт (шелл)
const PROBE = /\.(php\d?|phtml|asp|aspx|jsp|cgi|pl|env|git|svn|sql|bak|old|swp|ini|conf|log|sh|tar|gz|rar|7z)(\/|$|\?)|wp-|wordpress|phpmyadmin|pma|admin\.php|xmlrpc|\/\.|\.\.|\/etc\/|passwd|shell|cmd=|exec|eval\(|<script|base64|boaform|hnap|actuator|vendor\/|cgi-bin|owa\/|autodiscover|\.well-known\/(?!acme)|solr|jenkins|manager\/html|config\.|server-status|console/i;
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
    const ips = Object.keys(s); if (ips.length > MAX_IPS) { ips.sort((a, b) => s[a].last - s[b].last); for (const k of ips.slice(0, ips.length - MAX_IPS)) delete s[k]; }
  };
  P.secProbe = (url) => PROBE.test(url);
  P.ipBanned = function ipBanned(ip) { return !!(ip && this.db.ipBans && this.db.ipBans[ip]); };
  P.secNew = function secNew() { const seen = this.db.secSeen || 0; return Object.values(this.db.sec || {}).filter((x) => x.last > seen && (x.kinds.admin || x.kinds.probe || x.kinds.upload || x.n >= 10)).length; };
  // для админ-панели: самые «опасные» и свежие адреса
  P.secView = function secView(myIp) {
    const bans = this.db.ipBans || {}, seen = this.db.secSeen || 0;
    const score = (x) => (x.kinds.admin || 0) * 5 + (x.kinds.probe || 0) * 3 + (x.kinds.upload || 0) * 3 + (x.kinds.bad || 0) * 2 + (x.kinds.lock || 0) * 2 + (x.n || 0);
    const list = Object.values(this.db.sec || {}).map((x) => ({ ...x, kinds: Object.entries(x.kinds).map(([k, v]) => ({ k, t: KIND[k] || k, v })), score: score(x), banned: !!bans[x.ip], fresh: x.last > seen }))
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

module.exports = { install, PROBE };
