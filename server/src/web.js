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
const C = require('./catalog');
const G = require('./game');
const ARMY = require('./army');

const WEB_ROOT = path.join(__dirname, '..', '..', 'web');
const WS_MAX = 256 * 1024;
const MIME = { '.webmanifest': 'application/manifest+json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

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
function catalogJson() {
  return {
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
      unread: (this.game.db.messages || []).filter((m) => m.to === u.id && !m.read).length,
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
    if (!['register', 'login', 'hello', 'captcha'].includes(msg.t) && !this.user) return this.error('Сначала войдите.');
    this.failed = false;
    fn.call(this, msg);
    // лояльность населения (Резиденция) растёт за действия, а не за онлайн
    if (!this.failed && this.user && ROYAL_ACTIONS.has(msg.t)) this.game.royalGain(this.user);
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
    const wait = m.token ? 0 : this.game.loginBlocked(this.ip, m.login); if (wait) return lockMsg(wait);
    // вход по паролю или по токену «Запомнить меня» (пароль в браузере не хранится)
    const u = m.token ? this.game.tokenLogin(m.login, m.token) : this.game.login(m.login, m.password);
    if (!u && m.token) return this.error('Сессия устарела — войдите заново.');
    if (!u) {
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
    this.send({ t: 'profile', refresh: true, profile: this.game.profileOf(this.user, this.user) });
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
    for (const s of WebSession.all || []) if (s.user && to && s.user.id === to.id) s.pushState(); // получателю — оповещение сразу
    this.send({ t: 'profile', refresh: true, profile: this.game.profileOf(to, this.user) });
  },
  profile(m) {
    const u = this.game.userById(Number(m.id) || this.user.id);
    if (!u) return this.error('Игрок не найден.');
    this.send({ t: 'profile', profile: this.game.profileOf(u, this.user) });
  },
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
  halls() { const list = this.game.halls(), s = this.game.season(); this.send({ t: 'halls', list, season: { key: s.key, end: s.end }, last: (this.game.db.hallHistory || []).slice(-1)[0] || null }); },
  rating() {
    const rows = this.game.leaderboard().slice(0, 50).map(({ u, r }) => ({ id: u.id, login: u.login, race: C.RACE_NAMES[u.race], raceId: u.race, rating: r }));
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
  read(m) {
    const x = (this.game.db.messages || []).find((y) => y.id === Number(m.id) && (y.to === this.user.id || y.from === this.user.id));
    if (!x) return this.error('Письмо не найдено.');
    if (x.to === this.user.id && !x.read) { x.read = true; this.game.store.save(); }
    const from = this.game.userById(x.from), to = this.game.userById(x.to);
    this.send({ t: 'letter', letter: { id: x.id, from: from && from.login, to: to && to.login, subject: x.subject, text: x.text, at: x.at } });
  },
  sendmail(m) {
    const res = this.game.sendMail(this.user, m.to, m.subject, m.text);
    if (res.error) return this.error(res.error);
    this.toast('Сообщение отправлено.');
    for (const s of WebSession.all || []) if (s.user && s.user.id === res.to.id && s.notifyMail) s.notifyMail(this.user.login);
  },
  // ---- функции зданий и армия (server/src/army.js) ----
  train(m) { this.result(this.game.train(this.castle, Number(m.unit), Number(m.count))); },
  send(m) {
    const r = this.game.sendArmy(this.castle, { units: m.units || {}, general: !!m.general, x: m.x, y: m.y, mission: m.mission, res: m.res, from: m.from, portal: !!m.portal, at: Number(m.at) || 0 });
    if (!r.error) this.toast(r.army.state === 'wait' ? `Поход запланирован: ${ARMY.MISSIONS[m.mission]} ${m.x}:${m.y}` : `Армия выступила: ${ARMY.MISSIONS[m.mission]} ${m.x}:${m.y}`);
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
  reports() { this.send({ t: 'reports', list: this.game.reportsOf(this.user.id).map((x) => ({ id: x.id, at: x.at, kind: x.kind, title: x.title, read: x.read })) }); },
  report(m) {
    const x = (this.game.db.reports || []).find((y) => y.id === Number(m.id) && y.owner === this.user.id);
    if (!x) return this.error('Отчёт не найден.');
    if (!x.read) { x.read = true; this.game.store.save(); }
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
    const file = path.normalize(path.join(WEB_ROOT, url === '/' ? 'index.html' : url));
    const f = (file === WEB_ROOT || file.startsWith(WEB_ROOT + path.sep)) && staticFile(file);
    if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    // картинки браузер держит в кэше сутки; код и стили — всегда сверяет по ETag (ответ 304 без тела)
    const head = { 'Content-Type': f.type, ETag: f.etag, 'Cache-Control': f.img ? 'public, max-age=86400' : 'no-cache', ...SEC_HEADERS };
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
    session.ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(socket.remoteAddress || '').replace(/^::ffff:/, '');
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

  server.listen(port, host, () => log(`браузерный клиент: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
  return server;
}

module.exports = { startWeb, WebSession };
