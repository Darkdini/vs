'use strict';
// Браузерный клиент: HTTP (страница + картинки) и WebSocket с JSON-командами.
// Один общий мир (Game) для всех подключённых браузеров.
// Без зависимостей: WebSocket (RFC 6455) реализован здесь же, только то, что нужно (текстовые кадры, ping, close).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const SEC = require('./security');
const SOC = require('./social');
const C = require('./catalog');
const G = require('./game');
const ARMY = require('./army');

const WEB_ROOT = path.join(__dirname, '..', '..', 'web');
const WS_MAX = 256 * 1024;
const MIME = { '.webmanifest': 'application/manifest+json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.apk': 'application/vnd.android.package-archive' };

// ---------- WebSocket ----------
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);
}

function wsFrame(opcode, payload) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 0xff])
      : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
  return Buffer.concat([head, payload]);
}

class WsReader {
  constructor() { this.buf = Buffer.alloc(0); this.parts = []; }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    // защита от переполнения памяти: сообщение больше WS_MAX (аватар ~49 КБ) — соединение рвётся
    if (this.buf.length > WS_MAX || this.parts.reduce((s, p) => s + p.length, 0) > WS_MAX) throw new Error('frame too big');
    const out = [];
    for (;;) {
      if (this.buf.length < 2) break;
      const fin = this.buf[0] & 0x80, opcode = this.buf[0] & 0x0f, masked = this.buf[1] & 0x80;
      let len = this.buf[1] & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) break; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) break; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) break;
      let data = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const mask = this.buf.subarray(off, off + 4);
        data = Buffer.from(data.map((b, i) => b ^ mask[i & 3]));
      }
      this.buf = this.buf.subarray(need);
      if (opcode === 0 || opcode === 1) {
        this.parts.push(data);
        if (fin) { out.push({ opcode: 1, data: Buffer.concat(this.parts) }); this.parts = []; }
      } else out.push({ opcode, data });
    }
    return out;
  }
}

// ---------- каталог для клиента ----------
// Справочник войск (баланс из дизайн-документа, data/units.json) — пока только для просмотра, тренировки на сервере нет
function armyJson() {
  try {
    const dir = path.join(__dirname, '..', '..', 'data');
    const units = JSON.parse(fs.readFileSync(path.join(dir, 'units.json'), 'utf8'));
    const blds = JSON.parse(fs.readFileSync(path.join(dir, 'buildings.json'), 'utf8')).buildings;
    return { races: units.races, units: units.units, buildingNames: Object.fromEntries(blds.map((b) => [b.id, b.name])) };
  } catch (e) { return null; }
}

// Всё, что нужно клиенту для таблиц по уровням: стоимость, время, добыча, вместимость, рейтинг.
// Время в таблицах клиент считает сам по тем же формулам (зависит от уровня Ратуши): rules.time + speed.
// версия сборки (файл VERSION кладётся в архив при сборке) — видна на экране входа и в консоли
const VERSION = (() => { try { return fs.readFileSync(path.join(__dirname, '..', '..', 'VERSION'), 'utf8').trim(); } catch { return 'dev'; } })();
function catalogJson() {
  return {
    version: VERSION,
    speed: G.SPEED,
    maxQueue: G.MAX_QUEUE,
    rules: {
      time: C.TIME, rating: C.RATING, store: G.STORE, baseRate: G.BASE_RATE, peopleFactor: G.PEOPLE_FACTOR, minBuildSec: 3,
    },
    buildings: C.BUILDINGS.map((b) => ({
      id: b.id, name: b.name, desc: b.desc, layer: b.layer, max: b.max || 20, unique: !!b.unique, req: b.req || {},
      produces: b.produces || null, tiers: b.tiers || null, about: b.about || '', hp: C.durability(b, 1), time: b.time || 0,
      costs: Array.from({ length: (b.max || 20) + 1 }, (_, l) => (l === 0 ? null : C.levelCost(b, l))),
    })),
    castlePath: C.CASTLE_PATH, prod: C.PROD, prodK: C.PROD_K, resSpeed: G.RES_SPEED,
    races: C.RACE_NAMES,
    raceOrder: C.RACES,
    units: C.UNITS,
    army: armyJson(),
    premiumPlans: require('./premium').PLANS, gifts: require('./social').GIFTS, repPerGold: require('./social').REP_PER_GOLD,
    mil: ARMY.catalogJson(), // юниты игры, науки, религии, артефакты, NPC-лагеря
    lands: { base: G.LANDS_BASE, decor: G.LANDS_DECOR, edge: G.LANDS_EDGE },
    landOptions: G.LANDS_BASE.map((row, y) => row.map((_, x) => G.landOptions(x, y))),
  };
}

// ---------- сессия браузера ----------
class WebSession {
  constructor(game, socket, log) {
    this.game = game; this.socket = socket; this.log = log; this.user = null;
  }

  send(obj) { if (!this.socket.destroyed) this.socket.write(wsFrame(1, Buffer.from(JSON.stringify(obj)))); }
  get castle() { return this.user && this.game.castleOf(this.user); }
  error(msg) { this.failed = true; this.send({ t: 'error', msg }); }
  toast(msg) { this.send({ t: 'toast', msg }); }

  pushState() {
    const c = this.castle; this.game.tick(c);
    const u = this.user;
    this.send({
      t: 'state',
      now: Date.now(),
      user: { id: u.id, login: u.login, race: u.race, raceName: C.RACE_NAMES[u.race], premium: u.premium || 0, gold: u.gold || 0, goldLog: (u.goldLog || []).slice(-50).reverse(), admin: !!u.admin, mod: !!u.mod, multiNew: u.admin ? (this.game.db.multiLog || []).filter((x) => x.at > (u.multiSeen || 0)).length : 0 },
      castle: {
        id: c.id, name: c.name, x: c.x, y: c.y, grid: { 0: Array.from(c.grid[0]), 1: Array.from(c.grid[1]) }, levels: { 0: Array.from(c.levels[0]), 1: Array.from(c.levels[1]) },
        res: c.res, rate: this.game.rates(c), cap: this.game.capacity(c),
        queue: c.queue.map((q) => ({ view: q.view, cell: q.cell, building: q.building, level: q.level, start: q.start, end: q.end })),
        rating: this.game.rating(c), townhall: this.game.buildingLevel(c, 0),
        mil: this.game.milState(c, u),
        loyalty: Math.round(c.loyalty ?? 100), capital: this.game.isCapital(c),
      },
      castles: this.game.castlesOf(u).map((k, i) => ({ id: k.id, name: k.name, x: k.x, y: k.y, capital: i === 0, active: k.id === c.id, rating: this.game.rating(k), loyalty: Math.round(k.loyalty ?? 100) })),
      unread: (this.game.db.messages || []).filter((m) => m.to === u.id && !m.read).length, newsUnread: this.game.newsUnread(u), newsFirst: this.game.newsFirst(u),
      moves: this.game.moveCounts(u),
    });
  }

  onTick() {
    if (!this.user) return;
    const done = this.game.tick(this.castle);
    if (!done.length) return;
    for (const d of done) this.toast(`Готово: ${C.BY_ID[d.building].name} ${d.level} ур.`);
    this.pushState();
  }

  notifyMail(fromLogin) { this.toast(`Новое письмо от ${fromLogin}`); this.pushState(); }
  notify(msg) { this.toast(msg); this.pushState(); } // события игры: тренировка, бой, возврат армии, отчёты
  sendChat(msg) { this.send({ t: 'chatmsg', msg }); }

  result(r) { if (r && r.error) this.error(r.error); this.pushState(); }

  handle(msg) {
    // защита от подмены запросов: только объект с командой-строкой; ключи и значения вида __proto__/constructor/toString отвергаются
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return this.error('Неверный запрос.');
    if (hasEvil(msg, 0)) return this.error('Неверный запрос.');
    // от флуда: не больше 25 запросов в секунду с соединения, при 200+ за 10 секунд соединение рвётся
    if (!RATE_OFF) {
      const now = Date.now(); this.rl = (this.rl || []).filter((t) => t > now - 10000); this.rl.push(now);
      if (this.rl.length > 200) { this.log(`flood ${this.ip} ${this.user ? this.user.login : ''}`); return this.socket.destroy(); }
      if (this.rl.filter((t) => t > now - 1000).length > 25) return this.error('Слишком часто — подождите секунду.');
    }
    const fn = Object.prototype.hasOwnProperty.call(API, msg.t) ? API[msg.t] : null;
    if (!fn) return this.error(`Неизвестная команда ${msg.t}`);
    if (!['register', 'login', 'hello', 'captcha', 'ping'].includes(msg.t) && !this.user) return this.error('Сначала войдите.');
    this.failed = false;
    fn.call(this, msg);
    // лояльность населения (Резиденция) растёт за действия, а не за онлайн
    if (!this.failed && this.user && ROYAL_ACTIONS.has(msg.t)) this.game.royalGain(this.user);
    // Зал Славы «Присутствие»: минуты в игре (пауза больше 5 минут не считается)
    if (this.user) { const t = Date.now(), last = this.actAt || t; this.actAt = t; this.presMs = (this.presMs || 0) + Math.min(t - last, 300000);
      if (this.presMs >= 60000) { const m = Math.floor(this.presMs / 60000); this.presMs -= m * 60000; this.game.addStat(this.user.id, 'presence', m); } }
  }
}
const RATE_OFF = process.env.RATE_OFF === '1'; // только для автотестов
const PROTO_NAMES = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
function hasEvil(v, depth) {
  if (depth > 8) return true;
  if (typeof v === 'string') return PROTO_NAMES.has(v);
  if (v && typeof v === 'object') for (const k of Object.keys(v)) if (PROTO_NAMES.has(k) || hasEvil(v[k], depth + 1)) return true;
  return false;
}
const ROYAL_ACTIONS = new Set(['forge', 'ritual', 'calm', 'build', 'train', 'send', 'research', 'exchange', 'squad', 'artifact', 'religion']);

const API = {
  hello() { this.send({ t: 'catalog', catalog: catalogJson() }); },
  // капча для регистрации: новая при каждом запросе и после каждой попытки
  captcha() { const c = SEC.captcha(); this.captchaAns = { a: c.answer, exp: Date.now() + 300000 }; this.send({ t: 'captcha', img: c.img }); },
  register(m) {
    const test = process.env.NO_CAPTCHA === '1'; // только для автотестов
    if (this.game.devBanned(m.dev)) return this.error('Регистрация с этого устройства запрещена администрацией.');
    const lim = !test && this.game.regAllowed(this.ip); if (lim) return this.error(lim);
    const c = this.captchaAns; this.captchaAns = null;
    const ok = test || (c && c.exp > Date.now() && Number(String(m.captcha || '').trim()) === c.a);
    if (!ok) { API.captcha.call(this); return this.error('Неверный ответ на пример — попробуйте ещё раз.'); }
    const res = this.game.register({ login: m.login, password: m.password, email: m.email, race: m.race });
    if (res.error) { API.captcha.call(this); return this.error(res.error); }
    this.game.regDone(this.ip);
    res.user.regIp = this.ip; this.game.trackLogin(res.user, this.ip, m.dev); res.user.regDev = String(m.dev || '').slice(0, 40);
    this.log(`web registered ${res.user.login}`);
    this.send({ t: 'registered', login: res.user.login });
  },
  login(m) {
    const lockMsg = (sec) => this.send({ t: 'loginlock', sec, msg: `Слишком много неудачных попыток входа. Попробуйте через ${Math.ceil(sec / 60)} мин.` });
    const wait = m.token ? 0 : this.game.loginBlocked(this.ip, m.login); if (wait) { this.log(`вход ${String(m.login || '').slice(0, 20)}: заблокирован ещё ${wait} с (адрес ${this.ip})`); return lockMsg(wait); }
    // вход по паролю или по токену «Запомнить меня» (пароль в браузере не хранится)
    const u = m.token ? this.game.tokenLogin(m.login, m.token) : this.game.login(m.login, m.password);
    if (!u && m.token) return this.error('Сессия устарела — войдите заново.');
    if (!u) {
      const known = Object.prototype.hasOwnProperty.call(this.game.db.users, String(m.login || '').trim().toLowerCase());
      this.log(`вход ${JSON.stringify(String(m.login || '').slice(0, 20))}: ${known ? `неверный пароль (${String(m.password || '').length} симв.)` : 'нет такого игрока'}`);
      const w = this.game.loginFailed(this.ip, m.login); if (w) return lockMsg(w);
      const left = this.game.loginTriesLeft(this.ip);
      return this.error(`Неверный логин или пароль. Осталось попыток: ${left}.`);
    }
    if (!m.token) this.game.loginOk(this.ip);
    this.game.trackLogin(u, this.ip, m.dev); this.dev = m.dev;
    if (!u.admin && this.game.devBanned(m.dev)) return this.error('Это устройство заблокировано администрацией.');
    if (u.banned) return this.error('Аккаунт заблокирован администрацией.');
    this.user = u; u.online = true; u.lastSeen = Date.now();
    this.log(`web login ${u.login}`);
    this.token = m.token ? String(m.token) : this.game.issueToken(u);
    this.send({ t: 'auth', login: u.login, token: this.token });
    if (u.admin && !m.token && String(m.password || '').toLowerCase() === 'admin') this.toast('⚠ У админа стандартный пароль «admin» — смените его: Админ-панель → Цель → Сменить пароль.');
    this.pushState();
  },
  logout() { this.game.dropToken(this.user, this.token); this.user.online = false; this.user = null; this.send({ t: 'loggedout' }); },
  sync() { this.pushState(); },
  ping() { this.send({ t: 'pong' }); }, // проверка живости соединения (клиент после сворачивания приложения)
  switch(m) { const r = this.game.switchCastle(this.user, m.id); if (r.error) return this.error(r.error); this.toast(`Замок: ${this.castle.name}`); this.pushState(); },
  build(m) {
    const res = this.game.startBuild(this.castle, Number(m.view), Number(m.cell), Number(m.building));
    if (res.error) return this.error(res.error);
    this.pushState();
  },
  avatar(m) {
    const r = m.op === 'del' ? this.game.removeAvatar(this.user) : this.game.setAvatar(this.user, m.px);
    if (r.error) return this.error(r.error);
    this.toast(m.op === 'del' ? 'Аватар удалён.' : 'Аватар сохранён.');
    API.profile.call(this, { id: this.user.id, acct: m.acct, refresh: 1 });
  },
  ritual(m) { const r = this.game.ritual(this.user, this.castle, m.id); if (r.msg) this.toast(r.msg); this.result(r); },
  calm() { const r = this.game.calmRiot(this.user, this.castle); if (r.msg) this.toast(r.msg); this.result(r); },
  forge(m) { this.result(this.game.forgeOp(this.castle, { unit: Number(m.unit), kind: m.kind })); },
  ally(m) {
    // модератор форума / админ может открыть форум любого альянса (m.ally) — только просмотр и удаление
    const mod = this.game.canModerate(this.user), foreign = mod && m.ally && Number(m.ally) !== this.user.alliance;
    const al = foreign ? (this.game.db.alliances || {})[m.ally] : this.game.allianceOf(this.user);
    if (!al) return this.error(foreign ? 'Альянс не найден.' : 'Вы не в альянсе.');
    if (foreign && !['get', 'topicget', 'topicop', 'postdel'].includes(m.op)) return this.error('В чужом альянсе модератор может только удалять.');
    if (m.op === 'get') return this.send({ t: 'ally', data: this.game.allyView(this.user, al) });
    if (m.op === 'topicget') return this.send({ t: 'allytopic', data: this.game.allyTopic(this.user, al, m.topic) });
    const r = this.game.allyOp(this.user, this.castle, m, al);
    if (r.error) return this.error(r.error);
    if (r.msg) this.toast(r.msg);
    const al2 = foreign ? al : this.game.allianceOf(this.user);
    if (al2 && m.op === 'postdel') this.send({ t: 'allytopic', data: this.game.allyTopic(this.user, al2, m.topic) });
    if (al2) this.send({ t: 'ally', data: this.game.allyView(this.user, al2) });
    if (al2 && (m.op === 'post' || m.op === 'topic')) this.send({ t: 'allytopic', data: this.game.allyTopic(this.user, al2, m.topic || r.topic) });
    this.pushState();
  },
  moves() { this.send({ t: 'moves', data: this.game.kingdomMoves(this.user) }); },
  festival(m) { const r = this.game.festival(this.user, this.castle, m.id); if (r.msg) this.toast(r.msg); this.result(r); },
  demolish(m) {
    const r = this.game.demolish(this.castle, Number(m.view), Number(m.cell));
    if (r.error) return this.error(r.error);
    this.toast(`Здание разрушено: ${r.name}`); this.pushState();
  },
  world(m) {
    const c = this.castle, R = 7;
    const lim = (v) => Math.max(R, Math.min(G.WORLD - 1 - R, Math.round(v))); // не за край карты
    const cx = lim(Number.isFinite(m.cx) ? m.cx : c.x), cy = lim(Number.isFinite(m.cy) ? m.cy : c.y);
    this.send({ t: 'world', cx, cy, radius: R, objects: this.game.worldObjects(cx - R, cy - R, 2 * R + 1, 2 * R + 1), home: { x: c.x, y: c.y } });
  },
  gift(m) {
    const r = this.game.sendGift(this.user, m.to, m.gift, m.text);
    if (r.error) return this.error(r.error);
    this.toast(r.msg);
    const to = this.game.userById(Number(m.to));
    for (const s of WebSession.all || []) if (s.user && to && s.user.id === to.id) { s.pushState(); if (s.dialogWith === this.user.id) API.dialog.call(s, { id: this.user.id, keep: 1 }); } // получателю — оповещение и сообщение сразу
    this.send({ t: 'profile', refresh: true, profile: this.game.profileOf(to, this.user) });
  },
  profile(m) {
    const u = this.game.userById(Number(m.id) || this.user.id);
    if (!u) return this.error('Игрок не найден.');
    const profile = this.game.profileOf(u, this.user);
    if (m.acct && u.id === this.user.id) { // «Кабинет → Профиль»: настройки своего аккаунта
      const c = this.castle, v = this.user.violations || 0;
      profile.acct = { castleName: c.name, castleDesc: c.desc || '', premium: this.game.isPremium(this.user), violations: v, uid: this.user.id };
    }
    this.send({ t: 'profile', acct: !!profile.acct, refresh: !!m.refresh, profile });
  },
  passwd(m) {
    const r = this.game.changePassword(this.user, m.old, m.new); if (r.error) return this.error(r.error);
    this.token = this.game.issueToken(this.user);
    this.send({ t: 'auth', login: this.user.login, token: this.token }); // новый токен «Запомнить меня»
    this.toast('Пароль изменён. На других устройствах нужно войти заново.');
  },
  castleinfo(m) { const r = this.game.castleInfo(this.user, m.name, m.desc); if (r.error) return this.error(r.error); this.toast('Замок переименован.'); API.profile.call(this, { id: this.user.id, acct: 1, refresh: 1 }); },
  // ---- кабинет (server/src/social.js) ----
  rep(m) {
    const r = this.game.giveReputation(this.user, m.id, m.coins); if (r.error) return this.error(r.error);
    this.toast(`Репутация +${r.add} (теперь ${r.rep}).`); this.pushState();
    this.send({ t: 'profile', refresh: true, profile: this.game.profileOf(this.game.userById(Number(m.id)), this.user) });
  },
  friend(m) { const r = this.game.friendOp(this.user, m.op, m.id); if (r.error) return this.error(r.error); this.toast(m.op === 'add' ? 'Добавлен в друзья.' : 'Удалён из друзей.'); API.friends.call(this); },
  friends() { this.send({ t: 'players', kind: 'friends', list: this.game.friendsOf(this.user) }); },
  search(m) { this.send({ t: 'players', kind: 'search', q: m.q || '', list: this.game.searchPlayers(m.q) }); },
  nearby() { this.send({ t: 'players', kind: 'nearby', list: this.game.nearby(this.user) }); },
  notes(m) { if (typeof m.text === 'string') { this.game.setNotes(this.user, m.text); this.toast('Блокнот сохранён.'); } this.send({ t: 'notes', text: this.user.notes || '' }); },
  about(m) { this.game.setAbout(this.user, m.text); this.toast('Сохранено.'); },
  chat(m) {
    const r = this.game.chatPost(this.user, m.text); if (r.error) return this.error(r.error);
    for (const s of WebSession.all || []) if (s.user && s.sendChat) s.sendChat(r.msg);
  },
  premium(m) { const r = this.game.buyPremium(this.user, m.days, m.to); if (r.error) return this.error(r.error); this.toast(r.msg); this.pushState(); },
  chatmod(m) {
    const r = m.op === 'del' ? this.game.chatDelete(this.user, m.id) : this.game.chatBanUser(this.user, m.login, m.hours);
    if (r.error) return this.error(r.error);
    if (m.op === 'del') for (const s of WebSession.all || []) if (s.user) s.send({ t: 'chatdel', id: Number(m.id) });
    this.toast(r.msg || 'Сообщение удалено.');
  },
  chatlog() { this.send({ t: 'chatlog', list: this.game.chatLog() }); },
  // «Игроки (N)» в главном чате: кто сейчас в игре (только ники)
  chatusers() {
    const seen = new Map();
    for (const s of WebSession.all || []) if (s.user && !s.user.bot) seen.set(s.user.id, { id: s.user.id, login: s.user.login, rep: s.user.reputation ?? 10 });
    this.send({ t: 'chatusers', list: [...seen.values()].sort((a, b) => a.login.localeCompare(b.login)) });
  },
  ratings(m) {
    const k = m.kind;
    const list = k === 'castles' ? this.game.ratingCastles() : k === 'alliances' ? this.game.ratingAlliances() : k === 'reputation' ? this.game.ratingReputation() : null;
    if (!list) return API.rating.call(this);
    this.send({ t: 'ratings', kind: k, list });
  },
  // общий форум: просмотр (sections/topics/posts/favs) и действия (topic/post/fav/topicop/postdel/ban/secmod)
  forum(m) {
    const g = this.game, u = this.user, op = String(m.op || '');
    const view = (v) => { if (v && v.error) return this.error(v.error); return v; };
    if (op === 'sections') return this.send({ t: 'forum', view: 'sections', data: g.forumSections(u) });
    if (op === 'topics') { const v = view(g.forumTopics(u, m.section, m.page)); if (v) this.send({ t: 'forum', view: 'topics', data: v }); return; }
    if (op === 'posts') { const v = view(g.forumPosts(u, m.topic, m.page)); if (v) this.send({ t: 'forum', view: 'posts', data: v }); return; }
    if (op === 'favs') return this.send({ t: 'forum', view: 'favs', data: g.forumFavs(u) });
    const r = g.forumOp(u, m);
    if (r.error) return this.error(r.error);
    if (r.msg) this.toast(r.msg);
    if (op === 'topic' || op === 'post') { const v = g.forumPosts(u, r.topic, -1); if (!v.error) this.send({ t: 'forum', view: 'posts', data: v, replace: op === 'topic' ? 0 : 1, scroll: op === 'post' ? 1 : 0 }); return; }
    if (op === 'secmod') return this.send({ t: 'forum', view: 'sections', data: g.forumSections(u), replace: 1 });
    if (r.topic) { const v = g.forumPosts(u, r.topic, m.page); if (!v.error) this.send({ t: 'forum', view: 'posts', data: v, replace: 1 }); else if (r.section) this.send({ t: 'forum', view: 'topics', data: g.forumTopics(u, r.section, 0), replace: 1 }); }
  },
  // чьи места показывать: свой зал или игрока, из профиля которого открыт Зал славы
  allyinfo(m) { const al = Object.prototype.hasOwnProperty.call(this.game.db.alliances || {}, String(m.id)) ? this.game.db.alliances[m.id] : null; if (!al) return this.error('Альянс не найден.'); this.send({ t: 'allyinfo', ally: this.game.allyPublic(al), mine: this.user.alliance === al.id }); },
  hallWho(m) { const u = m.who !== undefined && this.game.userById(Number(m.who)); return u || this.user; },
  hall(m) { const r = this.game.hallPage(API.hallWho.call(this, m), String(m.id || ''), m.page); if (r.error) return this.error(r.error); this.send({ t: 'hall', hall: r }); },
  halls(m = {}) { const who = API.hallWho.call(this, m), me = who.id, list = this.game.halls().map(({ all, ...h }) => ({ ...h, pos: h.pos[me] || 0, mine: this.game.hallValue(who, h.id), top: h.top })), s = this.game.season(); this.send({ t: 'halls', who: { id: who.id, login: who.login, self: who.id === this.user.id, admin: !!who.admin }, list, pages: SOC.HALL_PAGES, season: { key: s.key, end: s.end }, last: (this.game.db.hallHistory || []).slice(-1)[0] || null }); },
  rating() {
    const rows = this.game.leaderboard().slice(0, 500).map(({ u, r }) => ({ id: u.id, login: u.login, race: C.RACE_NAMES[u.race], raceId: u.race, rating: r }));
    this.send({ t: 'rating', rows });
  },
  mail(m) {
    const folder = Number(m.folder) || 0;
    const list = this.game.mailList(this.user.id, folder).map((x) => {
      const other = this.game.userById(folder === 1 ? x.to : x.from);
      return { id: x.id, other: other ? other.login : '?', subject: x.subject, at: x.at, read: x.read };
    });
    this.send({ t: 'mail', folder, list });
  },
  // «Сообщения» как в оригинале: список переписок (последнее сообщение от каждого собеседника) и диалог с одним игроком
  // новости от администрации: список / чтение / публикация / комментарии
  news(m) {
    const g = this.game, u = this.user, op = String(m.op || 'list');
    if (op === 'list') return this.send({ t: 'news', view: 'list', data: g.newsList(u, m.page) });
    if (op === 'get') { const r = g.newsGet(u, m.id); if (r.error) return this.error(r.error); this.send({ t: 'news', view: 'item', data: r }); return this.pushState(); }
    const r = g.newsOp(u, m); if (r.error) return this.error(r.error); this.toast(r.msg);
    if (op === 'comment' || op === 'cmtdel') { const it = g.newsGet(u, r.id); if (!it.error) this.send({ t: 'news', view: 'item', data: it, scroll: op === 'comment' ? 1 : 0 }); }
    if (op === 'publish' || op === 'delete') { for (const s of WebSession.all || []) if (s.user) s.pushState(); }
    if (op !== 'publish') this.send({ t: 'news', view: 'list', data: g.newsList(u, 0), quiet: 1 });
  },
  dialogclose() { this.dialogWith = undefined; },
  dialogs(m) {
    const me = this.user.id, by = new Map();
    for (const x of this.game.db.messages || []) {
      if (x.to !== me && x.from !== me) continue;
      const o = x.from === me ? x.to : x.from, d = by.get(o) || { unread: 0 };
      if (x.to === me && !x.read) d.unread++;
      d.last = x; by.set(o, d);
    }
    const list = [...by.entries()].map(([id, d]) => { const u = this.game.userById(id); return u ? { id, login: u.login, race: u.race, avatar: u.avatar || 0,
      text: d.last.text || d.last.subject || '', at: d.last.at, mine: d.last.from === me, unread: d.unread } : null; }).filter(Boolean).sort((a, b) => b.at - a.at);
    const page = Math.max(0, Math.floor(Number(m.page)) || 0), pages = Math.max(1, Math.ceil(list.length / 10)), pg = Math.min(page, pages - 1);
    const filter = m.filter === 'unread' ? list.filter((x) => x.unread) : list;
    this.send({ t: 'dialogs', page: pg, pages: Math.max(1, Math.ceil(filter.length / 10)), filter: m.filter || 'all', list: filter.slice(pg * 10, pg * 10 + 10), total: list.length });
  },
  dialog(m) {
    const me = this.user.id, key = String(m.with || '').trim().toLowerCase();
    const o = Number(m.id) ? this.game.userById(Number(m.id)) : Object.prototype.hasOwnProperty.call(this.game.db.users, key) ? this.game.db.users[key] : null;
    if (!o) return this.error('Игрок не найден.');
    if (!m.keep || this.dialogWith === undefined) this.dialogWith = o.id;
    const all = (this.game.db.messages || []).filter((x) => (x.from === me && x.to === o.id) || (x.from === o.id && x.to === me));
    let changed = false; for (const x of all) if (x.to === me && !x.read) { x.read = true; changed = true; }
    if (changed) { this.game.store.save(); this.pushState(); }
    const lim = Math.min(all.length, Math.max(30, Math.floor(Number(m.more)) || 30));
    this.send({ t: 'dialog', with: { id: o.id, login: o.login, race: o.race, avatar: o.avatar || 0 }, more: all.length > lim,
      list: all.slice(-lim).map((x) => ({ id: x.id, mine: x.from === me, subject: x.subject, text: x.text, at: x.at })), keep: !!m.keep });
  },
  read(m) {
    const x = (this.game.db.messages || []).find((y) => y.id === Number(m.id) && (y.to === this.user.id || y.from === this.user.id));
    if (!x) return this.error('Письмо не найдено.');
    if (x.to === this.user.id && !x.read) { x.read = true; this.game.store.save(); }
    const from = this.game.userById(x.from), to = this.game.userById(x.to);
    this.send({ t: 'letter', letter: { id: x.id, from: from && from.login, to: to && to.login, subject: x.subject, text: x.text, at: x.at } });
  },
  sendmail(m) {
    if (!String(m.text || '').trim()) return this.error('Пустое сообщение.');
    const res = this.game.sendMail(this.user, m.to, m.subject, m.text);
    if (res.error) return this.error(res.error);
    if (m.dialog) API.dialog.call(this, { id: res.to.id, keep: 1 }); else this.toast('Сообщение отправлено.');
    for (const s of WebSession.all || []) if (s.user && s.user.id === res.to.id) { if (s.dialogWith === this.user.id) API.dialog.call(s, { id: this.user.id, keep: 1 }); else if (s.notifyMail) s.notifyMail(this.user.login); }
  },
  // ---- функции зданий и армия (server/src/army.js) ----
  train(m) { this.result(this.game.train(this.castle, Number(m.unit), Number(m.count))); },
  send(m) {
    const r = this.game.sendArmy(this.castle, { units: m.units || {}, general: !!m.general, x: m.x, y: m.y, mission: m.mission, res: m.res, from: m.from, portal: !!m.portal, at: Number(m.at) || 0 });
    if (!r.error && m.mission === 'trade') this.toast(`Торговцы (${r.need}) отправились к ${m.x}:${m.y}`);
    else if (!r.error) this.toast(r.army.state === 'wait' ? `Поход запланирован: ${ARMY.MISSIONS[m.mission]} ${m.x}:${m.y}` : `Армия выступила: ${ARMY.MISSIONS[m.mission]} ${m.x}:${m.y}`);
    this.result(r);
  },
  squad(m) { this.result(this.game.squadOp(this.castle, m)); },
  general(m) { this.result(this.game.generalOp(this.castle, this.user, { op: m.op, name: m.name, pts: m.pts })); },
  exchange(m) { const r = this.game.exchange(this.castle, m.from, m.to, m.amount); if (!r.error) this.toast(`Обмен: получено ${r.got}`); this.result(r); },
  research(m) { this.result(this.game.research(this.castle, m.sci)); },
  religion(m) { this.result(this.game.setReligion(this.castle, m.id)); },
  artifact(m) { this.result(this.game.activateArtifact(this.castle, m.id, !!m.on)); },
  alliance(m) {
    const r = this.game.alliance(this.user, this.castle, m);
    if (r && r.msg) this.toast(r.msg);
    this.result(r);
    if (r && r.ok && ['approve', 'kick', 'invite'].includes(m.op)) for (const s of WebSession.all || []) if (s !== this && s.user) s.pushState(); // новичку/исключённому — сразу новое состояние
  },
  alliances() {
    // «Альянсы, подходящие вам»: где есть свободные места, крупные сверху
    const list = Object.values(this.game.db.alliances || {}).map((a) => ({ id: a.id, name: a.name, tag: a.tag, members: a.members.length, slots: this.game.allianceSlots(a), score: this.game.allianceScore(a),
      leader: (this.game.userById(a.leader) || {}).login, ad: a.ad || '', requested: (a.requests || []).includes(this.user.id) })).sort((x, y) => y.members - x.members);
    this.send({ t: 'alliances', list });
  },
  reports() { this.send({ t: 'reports', list: this.game.reportsOf(this.user.id).map((x) => ({ id: x.id, at: x.at, kind: x.kind, title: x.title, read: x.read, tone: this.game.reportTone(x), from: x.from })) }); },
  repdel(m) { const r = this.game.reportDelete(this.user, m.ids === 'read' ? 'read' : [].concat(m.ids || [])); this.toast(r.n ? `Удалено отчётов: ${r.n}` : 'Нечего удалять.'); API.reports.call(this); this.pushState(); },
  repfwd(m) { const r = this.game.reportForward(this.user, m.id, m.to); if (r.error) return this.error(r.error); this.toast(r.msg); },
  report(m) {
    const x = (this.game.db.reports || []).find((y) => y.id === Number(m.id) && this.game.canSeeReport(this.user, y));
    if (!x) return this.error('Отчёт не найден.');
    if (!x.read && x.owner === this.user.id) { x.read = true; this.game.store.save(); }
    this.send({ t: 'report', report: x });
    this.pushState();
  },
  admin(m) {
    const r = this.game.adminOp(this.user, m.op, m);
    if (r.error) return this.error(r.error);
    if (r.data) this.send({ t: 'admininfo', op: m.op, data: r.data });
    else this.toast(r.msg || 'Готово.');
    if (m.op === 'chat' && r.data) for (const s of WebSession.all || []) if (s.user && s.sendChat) s.sendChat(r.data);
    if (m.op === 'banmany' || m.op === 'devban') for (const s of WebSession.all || []) if (s.user && !s.user.admin && (s.user.banned || this.game.devBanned(s.dev))) s.socket.destroy();
    if (m.login) for (const s of WebSession.all || []) if (s.user && s.user.login === String(m.login).toLowerCase() && s !== this) { if (m.op === 'ban' || m.op === 'delete') s.socket.destroy(); else s.pushState(); }
    this.pushState();
  },
  bug(m) {
    const db = this.game.db; db.bugs = db.bugs || [];
    db.bugs.push({ from: this.user.login, text: String(m.text || ''), at: Date.now(), via: 'web' });
    this.game.store.save();
    this.log(`BUG REPORT (web): ${m.text}`);
    this.toast('Спасибо! Сообщение сохранено.');
  },
};

// заголовки безопасности: скрипты только свои (внедрённый <img onerror> или <script> не выполнится), страницу нельзя встроить в чужой сайт
const SEC_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
};
// статика из памяти: файл читается и сжимается один раз, пока не изменится на диске
const STATIC = new Map();
function staticFile(file) {
  let st; try { st = fs.statSync(file); } catch { return null; }
  if (st.isDirectory()) return null;
  const key = `${st.size}-${st.mtimeMs}`, hit = STATIC.get(file);
  if (hit && hit.key === key) return hit;
  const ext = path.extname(file), body = fs.readFileSync(file);
  const f = { key, body, type: MIME[ext] || 'application/octet-stream', etag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`, img: ['.png', '.webp', '.jpg'].includes(ext),
    gz: ['.html', '.js', '.css', '.svg', '.json', '.webmanifest'].includes(ext) && body.length > 1024 ? zlib.gzipSync(body) : null };
  STATIC.set(file, f);
  return f;
}

function startWeb(game, sessions, { port, host, log }) {
  const server = http.createServer((req, res) => {
    let url; try { url = decodeURIComponent(req.url.split('?')[0]); } catch { url = '/'; }
    const ava = /^\/avatar\/(\d{1,9})\.png$/.exec(url); // аватары: только цифры → data/avatars/<id>.png (PNG собран сервером)
    if (ava) {
      let body; try { body = fs.readFileSync(game.avatarFile(ava[1])); } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('no avatar'); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'public, max-age=86400' });
      return res.end(body);
    }
    // админ-панель (admin.js) получает только админ с действующей сессией: остальным её код не виден даже в F12
    if (url === '/admin.js') {
      const q = new URLSearchParams(req.url.split('?')[1] || ''), au = game.tokenLogin(q.get('l'), q.get('t'));
      if (!au || !au.admin) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      const f = staticFile(path.join(WEB_ROOT, 'admin.js'));
      if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': 'no-store', ...SEC_HEADERS }); return res.end(f.body);
    }
    const file = path.normalize(path.join(WEB_ROOT, url === '/' ? 'index.html' : url));
    const f = (file === WEB_ROOT || file.startsWith(WEB_ROOT + path.sep)) && staticFile(file);
    if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    // картинки браузер держит в кэше сутки; код и стили — всегда сверяет по ETag (ответ 304 без тела)
    const head = { 'Content-Type': f.type, ETag: f.etag, 'Cache-Control': f.img ? 'public, max-age=86400' : 'no-cache', ...SEC_HEADERS };
    if (file.endsWith('.apk')) head['Content-Disposition'] = 'attachment; filename="war-kings.apk"'; // приложение для Android — скачивается файлом
    if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, head); return res.end(); }
    if (f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.writeHead(200, { ...head, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }); return res.end(f.gz); }
    res.writeHead(200, head); res.end(f.body);
  });

  server.on('upgrade', (req, socket) => {
    if (req.url !== '/ws' || req.headers.upgrade.toLowerCase() !== 'websocket') return socket.destroy();
    wsAccept(req, socket);
    const tag = `web ${socket.remoteAddress}:${socket.remotePort}`;
    const slog = (m) => log(`${tag} ${m}`);
    const session = new WebSession(game, socket, slog);
    // IP игрока: заголовкам прокси верим только при TRUST_PROXY=1 (Cloudflare Tunnel / nginx), иначе их можно подделать и обойти блокировку входа
    const direct = String(socket.remoteAddress || '').replace(/^::ffff:/, '');
    session.ip = process.env.TRUST_PROXY === '1' ? (String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || direct) : direct;
    sessions.add(session);
    const reader = new WsReader();
    socket.on('data', (chunk) => {
      let frames;
      try { frames = reader.push(chunk); } catch { slog('слишком большое сообщение — соединение закрыто'); return socket.destroy(); }
      for (const f of frames) {
        if (f.opcode === 8) { socket.end(wsFrame(8, Buffer.alloc(0))); return; }
        if (f.opcode === 9) { socket.write(wsFrame(10, f.data)); continue; }
        if (f.opcode !== 1) continue;
        let msg;
        try { msg = JSON.parse(f.data.toString('utf8')); } catch (e) { session.error('bad json'); continue; }
        try { session.handle(msg); } catch (e) { slog(`handler error: ${e.stack}`); session.error('Ошибка сервера.'); }
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => { sessions.delete(session); if (session.user) { session.user.online = [...sessions].some((s) => s.user === session.user); session.user.lastSeen = Date.now(); } });
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`\n✗ Порт ${port} занят — уже запущен другой сервер игры (старая версия?). Остановите его: закройте ту сессию Termux или выполните  pkill -f "^node src/index.js$"  и запустите снова.\n`);
    else console.error(e);
    process.exit(3);
  });
  server.listen(port, host, () => log(`Готово! Версия ${VERSION}. Откройте в Chrome: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`));
  return server;
}

module.exports = { startWeb, WebSession };
