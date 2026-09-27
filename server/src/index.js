'use strict';
// «Война Королей» — сервер браузерной игры. Отдаёт клиент (web/) и говорит с ним по WebSocket (web.js).
// Запуск: npm start (из папки server) → http://localhost:8080
// Переменные окружения: WEB_PORT (8080), HOST (0.0.0.0), SPEED (скорость мира, 10), DB (файл базы), ADMIN_PASS (пароль admin)

const path = require('path');
const { Game, Store } = require('./game');
const { startWeb, WebSession } = require('./web');

const HOST = process.env.HOST || '0.0.0.0';
const WEB_PORT = Number(process.env.WEB_PORT || 8080);
const DB = process.env.DB || path.join(__dirname, '..', 'data', 'db.json');

const store = new Store(DB);
const game = new Game(store);
const sessions = new Set();
WebSession.all = sessions;

// раз в секунду: армии в мире (прибытие, бой, возврат), очереди онлайн-игроков, уведомления
setInterval(() => {
  try { game.tickWorld(); } catch (e) { console.error(e); }
  for (const s of sessions) { try { s.onTick(); } catch (e) { console.error(e); } }
  for (const ev of game.drainEvents()) for (const s of sessions) if (s.user && s.user.id === ev.userId && s.notify) s.notify(ev.msg);
}, 1000);

// администратор: логин admin, пароль ADMIN_PASS (по умолчанию admin) — замок на полной прокачке
if (game.ensureAdmin()) console.log('Админ: логин admin, пароль', process.env.ADMIN_PASS ? '(из ADMIN_PASS)' : 'admin');

startWeb(game, sessions, { port: WEB_PORT, host: HOST, log: (m) => console.log(m) });
console.log(`Война Королей: скорость мира x${process.env.SPEED || 10}, база ${DB}`);

const shutdown = () => { store.flush(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
