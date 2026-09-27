'use strict';
// Тестовый сервер для оригинального J2ME-клиента «Третий Мир: Война Королей» (2009).
// Запуск:  node server/src/index.js        (порт 2500 — как в клиенте)
// Переменные окружения: PORT, HOST, SPEED (скорость мира), DB (путь к JSON), DEBUG=1 (hex-дамп пакетов)

const net = require('net');
const path = require('path');
const { FlapReader } = require('./protocol');
const { Game, Store } = require('./game');
const { Session } = require('./handlers');

const PORT = Number(process.env.PORT || 2500);
const HOST = process.env.HOST || '0.0.0.0';
const DEBUG = process.env.DEBUG === '1';
const DB = process.env.DB || path.join(__dirname, '..', 'data', 'db.json');

const store = new Store(DB);
const game = new Game(store);
const sessions = new Set();
Session.all = sessions;

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

// завершение строек: раз в секунду проверяем очереди онлайн-игроков
setInterval(() => { for (const s of sessions) { try { s.onTick(); } catch (e) { console.error(e); } } }, 1000);

server.listen(PORT, HOST, () => {
  console.log(`Третий Мир — тестовый сервер слушает ${HOST}:${PORT}, скорость x${process.env.SPEED || 10}, база ${DB}`);
});

const shutdown = () => { store.flush(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
