'use strict';
// Чистая база для закрытого теста (вызывается из fresh-test.sh): node src/fresh.js <путь к db.json> [сколько тестеров]
// База создаётся заново (файла быть не должно), режим «Закрытый тест» сразу включён, N тестеров с разными расами.
// Логины и пароли печатаются ОДИН раз в консоль; в базе — только хэши. Админа создаст сервер при запуске (admin.env).
const fs = require('fs');
const DB = process.argv[2], N = Math.max(1, Math.min(50, Number(process.argv[3]) || 5));
if (!DB) { console.error('Укажите путь к базе: node src/fresh.js /opt/war/game-data/db.json 5'); process.exit(1); }
if (fs.existsSync(DB)) { console.error(`База ${DB} уже есть — чистая база создаётся только на пустом месте.`); process.exit(1); }
process.env.NO_BACKUP = '1';
const { Game, Store } = require('./game');
const g = new Game(new Store(DB));
g.db.closedTest = true;
const out = [];
for (let i = 1; i <= N; i++) { const r = g.testerCreate({ nick: `Tester${i}`, race: (i - 1) % 4, note: `тестер ${i}` }); if (r.error) { console.error(r.error); process.exit(1); } out.push(r); }
g.store.flush ? g.store.flush() : g.store.save();
console.log(`\nЧистая база: ${DB}\nЗакрытый тест: ВКЛЮЧЁН (входят только тестеры и админ, регистрации нет)\n`);
console.log('Тестеры (пароли показываются только сейчас — сохраните):');
for (const t of out) console.log(`  ${t.nick.padEnd(8)}  логин: ${t.acct}   пароль: ${t.pass}`);
console.log('\nЗабытый пароль — Админ-панель → 🧪 Тест → «Новый пароль».');
process.exit(0);
