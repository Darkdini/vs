'use strict';
// Тестовый сервер для оригинального J2ME-клиента «Третий Мир: Война Королей» (2009).
// Запуск:  node server/src/index.js        (порт 2500 — как в клиенте)
// Переменные окружения: PORT, HOST, SPEED (скорость мира), DB (путь к JSON), DEBUG=1 (hex-дамп пакетов),
// WEB_PORT (браузерный клиент, 8080), PORT3D (Android 3D-клиент, 5005), CLIENT_JAR (оригинальный jar — источник графики для браузера)

const net = require('net');
const path = require('path');
const { FlapReader } = require('./protocol');
const { Game, Store } = require('./game');
const { Session } = require('./handlers');
const { startWeb, WebSession } = require('./web');
const { startServer3D } = require('./tw3d/server3d');

const PORT = Number(process.env.PORT || 2500);
const HOST = process.env.HOST || '0.0.0.0';
const DEBUG = process.env.DEBUG === '1';
const DB = process.env.DB || path.join(__dirname, '..', 'data', 'db.json');

const store = new Store(DB);
const game = new Game(store);
const sessions = new Set();
Session.all = sessions;
WebSession.all = sessions; // уведомления о письмах ходят между J2ME- и браузерными игроками

const server = net.createServer((sock) => {
  const tag = `${sock.remoteAddress}:${sock.remotePort}`;
  const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${tag} ${msg}`);
  const reader = new FlapReader();
  const session = new Session(game, sock, log);
  sessions.add(session);
  sock.setNoDelay(true);
  log('connected');

  if (DEBUG) {
    const write = sock.write.bind(sock);
    sock.write = (buf) => { log(`<< ${buf.toString('hex')}`); return write(buf); };
  }

  sock.on('data', (chunk) => {
    if (DEBUG) log(`>> ${chunk.toString('hex')}`);
    let packets;
    try { packets = reader.push(chunk); } catch (e) { log(`protocol error: ${e.message}`); sock.destroy(); return; }
    for (const p of packets) {
      if (DEBUG) log(`   ch${p.channel} SNAC(${p.group},${p.sub}) ${p.data ? p.data.length : 0}b`);
      try { session.handle(p); } catch (e) { log(`handler error: ${e.stack}`); }
    }
  });
  sock.on('error', (e) => log(`socket error: ${e.message}`));
  sock.on('close', () => { sessions.delete(session); log(`closed${session.user ? ` (${session.user.login})` : ''}`); });

  session.hello();
});

// раз в секунду: армии в мире (прибытие, бой, возврат), очереди онлайн-игроков, уведомления
setInterval(() => {
  try { game.tickWorld(); } catch (e) { console.error(e); }
  for (const s of sessions) { try { s.onTick(); } catch (e) { console.error(e); } }
  for (const ev of game.drainEvents()) for (const s of sessions) if (s.user && s.user.id === ev.userId && s.notify) s.notify(ev.msg);
}, 1000);

// администратор: логин admin, пароль ADMIN_PASS (по умолчанию admin) — замок на полной прокачке
const admin = game.ensureAdmin();
if (admin) console.log('Админ: логин admin (пароль — ADMIN_PASS, по умолчанию admin)');

server.listen(PORT, HOST, () => {
  console.log(`Третий Мир — тестовый сервер слушает ${HOST}:${PORT}, скорость x${process.env.SPEED || 10}, база ${DB}`);
});

// браузерный клиент (web/) на отдельном HTTP-порту; WEB_PORT=0 — выключить
const WEB_PORT = Number(process.env.WEB_PORT === undefined ? 8080 : process.env.WEB_PORT);
const JAR = process.env.CLIENT_JAR || (() => { // оригинальный jar рядом с сервером — берём из него графику
  const dir = path.join(__dirname, '..', 'client');
  const f = require('fs').existsSync(dir) && require('fs').readdirSync(dir).find((n) => n.endsWith('.jar'));
  return f ? path.join(dir, f) : null;
})();
// Android-клиент «Третий Мир 3D» (протокол v56); PORT3D=0 — выключить
const PORT3D = Number(process.env.PORT3D === undefined ? 5005 : process.env.PORT3D);
if (PORT3D) startServer3D(game, sessions, { port: PORT3D, host: HOST, debug: DEBUG, log: (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`) });
if (WEB_PORT) startWeb(game, sessions, { port: WEB_PORT, host: HOST, jarPath: JAR, log: (m) => console.log(m) });

const shutdown = () => { store.flush(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
