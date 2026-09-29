'use strict';
// «Война Королей» — сервер браузерной игры. Отдаёт клиент (web/) и говорит с ним по WebSocket (web.js).
// Запуск: npm start (из папки server) → http://localhost:8080
// Переменные окружения: WEB_PORT/PORT (8080), HOST (0.0.0.0), SPEED (скорость мира, 1 — как в оригинале), DB (файл базы),
// ADMIN_LOGIN (секретный логин админа), ADMIN_PASS (пароль админа), TRUST_PROXY=1 (за Cloudflare Tunnel / nginx)

const path = require('path');
const { Game, Store } = require('./game');
const { startWeb, WebSession } = require('./web');

const HOST = process.env.HOST || '0.0.0.0';
const WEB_PORT = Number(process.env.WEB_PORT || process.env.PORT || 8080); // PORT задают хостинги (Render, Railway и т.п.)
const DB = process.env.DB || path.join(__dirname, '..', 'data', 'db.json');

const store = new Store(DB);
const game = new Game(store);
const sessions = new Set();
WebSession.all = sessions;

// раз в секунду: армии в мире (прибытие, бой, возврат), очереди онлайн-игроков, уведомления
setInterval(() => {
  try { game.tickWorld(); game.seasonCheck(); } catch (e) { console.error(e); }
  for (const s of sessions) { try { s.onTick(); } catch (e) { console.error(e); } }
  for (const ev of game.drainEvents()) for (const s of sessions) if (s.user && s.user.id === ev.userId && s.notify) s.notify(ev.msg);
}, 1000);

// администратор: в игре — admin (вход под ADMIN_LOGIN, если задан), пароль ADMIN_PASS; 1 замок с нуля (ADMIN_FULL=1 — полная прокачка)
if (game.ensureAdmin()) {
  if (game.adminWasReset) console.log('Админ начат с нуля: один новый замок без развития.');
  if (game.adminReset) console.log('Пароль admin сброшен на заданный в ADMIN_PASS.');
  else if (game.adminNewPass) console.log(`Создан админ: логин admin, пароль ${game.adminNewPass} (записан в ${path.join(path.dirname(DB), 'ADMIN_PASSWORD.txt')} — смените его в Админ-панели)`);
  else if (game.login('admin', 'admin')) console.log('ВНИМАНИЕ: у admin стандартный пароль «admin» — смените его: Админ-панель → Цель (пусто) → Сменить пароль');
}

startWeb(game, sessions, { port: WEB_PORT, host: HOST, log: (m) => console.log(m) });
console.log(`Война Королей: скорость мира x${process.env.SPEED || 1}, база ${DB}`);

// pid рядом с базой — по нему update.sh аккуратно останавливает сервер (SIGTERM → сохранение базы)
const PID = path.join(path.dirname(path.resolve(DB)), 'server.pid');
try { require('fs').writeFileSync(PID, String(process.pid)); } catch { /* нет доступа */ }
const shutdown = () => { store.flush(); try { require('fs').unlinkSync(PID); } catch { /* уже нет */ } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
