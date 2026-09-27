'use strict';
// Браузерный клиент: HTTP (страница + картинки) и WebSocket с JSON-командами.
// Работает с тем же объектом Game, что и сервер для J2ME-клиента, — мир общий.
// Без зависимостей: WebSocket (RFC 6455) реализован здесь же, только то, что нужно (текстовые кадры, ping, close).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./catalog');
const G = require('./game');
const { openJar } = require('./jarassets');

const WEB_ROOT = path.join(__dirname, '..', '..', 'web');
const OWN_ASSETS = path.join(__dirname, '..', 'assets', 'images');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

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
function catalogJson() {
  return {
    speed: G.SPEED,
    maxQueue: G.MAX_QUEUE,
    buildings: C.BUILDINGS.map((b) => ({
      id: b.id, name: b.name, desc: b.desc, layer: b.layer, max: b.max || 20, unique: !!b.unique, req: b.req || {},
      produces: b.produces || null, tiers: b.tiers || null,
      costs: Array.from({ length: (b.max || 20) + 1 }, (_, l) => (l === 0 ? null : C.levelCost(b, l))),
    })),
    prod: C.PROD,
    races: C.RACE_NAMES,
    raceOrder: C.RACES,
    units: C.UNITS,
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
  error(msg) { this.send({ t: 'error', msg }); }
  toast(msg) { this.send({ t: 'toast', msg }); }

  pushState() {
    const c = this.castle; this.game.tick(c);
    const u = this.user;
    this.send({
      t: 'state',
      now: Date.now(),
      user: { id: u.id, login: u.login, race: u.race, raceName: C.RACE_NAMES[u.race] },
      castle: {
        id: c.id, name: c.name, x: c.x, y: c.y, grid: c.grid, levels: c.levels,
        res: c.res, rate: this.game.rates(c), cap: this.game.capacity(c),
        queue: c.queue.map((q) => ({ view: q.view, cell: q.cell, building: q.building, level: q.level, start: q.start, end: q.end })),
        rating: this.game.rating(c), townhall: this.game.buildingLevel(c, 0),
      },
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

  handle(msg) {
    const fn = API[msg.t];
    if (!fn) return this.error(`Неизвестная команда ${msg.t}`);
    if (!['register', 'login', 'hello'].includes(msg.t) && !this.user) return this.error('Сначала войдите.');
    fn.call(this, msg);
  }
}

const API = {
  hello() { this.send({ t: 'catalog', catalog: catalogJson() }); },
  register(m) {
    const res = this.game.register({ login: m.login, password: m.password, email: m.email, race: m.race });
    if (res.error) return this.error(res.error);
    this.log(`web registered ${res.user.login}`);
    this.send({ t: 'registered', login: res.user.login });
  },
  login(m) {
    const u = this.game.login(m.login, m.password);
    if (!u) return this.error('Неверный логин или пароль.');
    this.user = u;
    this.log(`web login ${u.login}`);
    this.send({ t: 'auth' });
    this.pushState();
  },
  sync() { this.pushState(); },
  build(m) {
    const res = this.game.startBuild(this.castle, Number(m.view), Number(m.cell), Number(m.building));
    if (res.error) return this.error(res.error);
    this.pushState();
  },
  world(m) {
    const c = this.castle, R = 7;
    const cx = Number.isFinite(m.cx) ? m.cx : c.x, cy = Number.isFinite(m.cy) ? m.cy : c.y;
    this.send({ t: 'world', cx, cy, radius: R, objects: this.game.worldObjects(cx - R, cy - R, 2 * R + 1, 2 * R + 1), home: { x: c.x, y: c.y } });
  },
  profile(m) {
    const u = this.game.userById(Number(m.id) || this.user.id);
    if (!u) return this.error('Игрок не найден.');
    const c = this.game.castleOf(u);
    this.send({ t: 'profile', profile: { id: u.id, login: u.login, race: C.RACE_NAMES[u.race], created: u.created, rating: this.game.rating(c), castles: [{ name: c.name, x: c.x, y: c.y }], self: u.id === this.user.id } });
  },
  rating() {
    const rows = Object.values(this.game.db.users).map((u) => ({ id: u.id, login: u.login, race: C.RACE_NAMES[u.race], rating: this.game.rating(this.game.castleOf(u)) }))
      .sort((a, b) => b.rating - a.rating).slice(0, 50);
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
  bug(m) {
    const db = this.game.db; db.bugs = db.bugs || [];
    db.bugs.push({ from: this.user.login, text: String(m.text || ''), at: Date.now(), via: 'web' });
    this.game.store.save();
    this.log(`BUG REPORT (web): ${m.text}`);
    this.toast('Спасибо! Сообщение сохранено.');
  },
};

function startWeb(game, sessions, { port, host, jarPath, log }) {
  let jar = null;
  if (jarPath) {
    try { jar = openJar(jarPath); log(`графика оригинального клиента: ${jarPath} (${jar.names().length} файлов)`); }
    catch (e) { log(`не удалось открыть CLIENT_JAR=${jarPath}: ${e.message} — будет упрощённая графика`); }
  }

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
    if (url === '/api/assets') return send(200, MIME['.json'], JSON.stringify({ original: !!jar }));
    if (url.startsWith('/orig/')) { // картинки из jar пользователя
      const data = jar && jar.read(url.slice(6));
      return data ? send(200, 'image/png', data) : send(404, 'text/plain', 'no image');
    }
    if (url.startsWith('/img/')) { // наши картинки (server/assets/images)
      const f = path.join(OWN_ASSETS, path.basename(url));
      return fs.existsSync(f) ? send(200, 'image/png', fs.readFileSync(f)) : send(404, 'text/plain', 'no image');
    }
    const file = path.normalize(path.join(WEB_ROOT, url === '/' ? 'index.html' : url));
    if (!file.startsWith(WEB_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, 'text/plain', 'not found');
    send(200, MIME[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
  });

  server.on('upgrade', (req, socket) => {
    if (req.url !== '/ws' || req.headers.upgrade.toLowerCase() !== 'websocket') return socket.destroy();
    wsAccept(req, socket);
    const tag = `web ${socket.remoteAddress}:${socket.remotePort}`;
    const slog = (m) => log(`${tag} ${m}`);
    const session = new WebSession(game, socket, slog);
    sessions.add(session);
    const reader = new WsReader();
    socket.on('data', (chunk) => {
      for (const f of reader.push(chunk)) {
        if (f.opcode === 8) { socket.end(wsFrame(8, Buffer.alloc(0))); return; }
        if (f.opcode === 9) { socket.write(wsFrame(10, f.data)); continue; }
        if (f.opcode !== 1) continue;
        let msg;
        try { msg = JSON.parse(f.data.toString('utf8')); } catch (e) { session.error('bad json'); continue; }
        try { session.handle(msg); } catch (e) { slog(`handler error: ${e.stack}`); session.error('Ошибка сервера.'); }
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => sessions.delete(session));
  });

  server.listen(port, host, () => log(`браузерный клиент: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
  return server;
}

module.exports = { startWeb, WebSession };
