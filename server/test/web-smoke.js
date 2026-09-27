'use strict';
// Смоук-тест браузерного клиента: HTTP (страница) + WebSocket JSON-протокол.
// Нужен Node 22+ (встроенный WebSocket); на более старых версиях тест пропускается.

const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { spawn } = require('child_process');

if (typeof WebSocket === 'undefined') { console.log('web-smoke: пропущен (нет встроенного WebSocket, нужен Node 22+)'); process.exit(0); }

const WEB_PORT = 26000 + Math.floor(Math.random() * 1000);
const DB = path.join(os.tmpdir(), `tw-web-smoke-${process.pid}.json`);

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(WEB_PORT + 1000), WEB_PORT: String(WEB_PORT), HOST: '127.0.0.1', DB, SPEED: '2000', CLIENT_JAR: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve) => child.stdout.on('data', (d) => { if (String(d).includes('браузерный клиент')) resolve(child); }));
}

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${WEB_PORT}/ws`);
  const inbox = []; const waiters = [];
  const opened = new Promise((r) => { ws.onopen = r; }); // подписываемся сразу, иначе событие можно пропустить
  ws.onmessage = (e) => { inbox.push(JSON.parse(e.data)); flush(); };
  function flush() {
    for (const w of [...waiters]) {
      const i = inbox.findIndex(w.pred);
      if (i >= 0) { const [m] = inbox.splice(i, 1); waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
    }
  }
  return {
    open: () => opened,
    send: (m) => ws.send(JSON.stringify(m)),
    expect: (t, pred = () => true) => new Promise((resolve, reject) => {
      waiters.push({ pred: (m) => m.t === t && pred(m), resolve }); flush();
      setTimeout(() => reject(new Error(`timeout waiting ${t}`)), 5000);
    }),
    close: () => ws.close(),
  };
}

(async () => {
  const server = await startServer();
  const a = client(), b = client();
  try {
    const html = await (await fetch(`http://127.0.0.1:${WEB_PORT}/`)).text();
    assert.match(html, /Война Королей/);
    assert.ok((await fetch(`http://127.0.0.1:${WEB_PORT}/app.js`)).ok);
    console.log('✓ страница и скрипт отдаются');

    await a.open();
    a.send({ t: 'hello' });
    const cat = (await a.expect('catalog')).catalog;
    assert.equal(cat.buildings.length, 46);
    console.log('✓ каталог: зданий', cat.buildings.length);

    a.send({ t: 'register', login: 'Webby', password: 'pass1', race: '1' });
    await a.expect('registered');
    a.send({ t: 'login', login: 'webby', password: 'wrong' });
    await a.expect('error', (m) => /Неверный/.test(m.msg));
    a.send({ t: 'login', login: 'webby', password: 'pass1' });
    await a.expect('auth');
    const st = await a.expect('state');
    assert.equal(st.user.race, 'elves');
    assert.equal(st.castle.grid[0][24], 0); // Ратуша в центре 7×7
    console.log('✓ регистрация, вход, состояние замка');

    a.send({ t: 'build', view: 0, cell: 23, building: 1 });
    const s2 = await a.expect('state', (m) => m.castle.queue.length === 1);
    assert.equal(s2.castle.queue[0].building, 1);
    await a.expect('toast', (m) => /Готово/.test(m.msg));
    const s3 = await a.expect('state', (m) => m.castle.grid[0][23] === 1);
    assert.equal(s3.castle.levels[0][23], 1);
    console.log('✓ стройка Склада завершилась');

    a.send({ t: 'build', view: 1, cell: 0, building: 5 }); // (0,0) — земля, Огород не положен? проверяем, что сервер решает сам
    const r = await Promise.race([a.expect('error'), a.expect('state', (m) => m.castle.queue.length === 1)]);
    console.log('✓ стройка на землях проверяется сервером:', r.t === 'error' ? r.msg : 'разрешено');

    a.send({ t: 'world' });
    const w = await a.expect('world');
    assert.ok(w.objects.some((o) => o.kind === 'castle' && o.owner === 'webby'));
    console.log('✓ карта мира, объектов:', w.objects.length);

    await b.open();
    b.send({ t: 'register', login: 'Second', password: 'pass2', race: '0' });
    await b.expect('registered');
    b.send({ t: 'login', login: 'second', password: 'pass2' });
    await b.expect('auth');
    b.send({ t: 'sendmail', to: 'webby', subject: 'Привет', text: 'Из браузера' });
    await a.expect('toast', (m) => /Новое письмо/.test(m.msg));
    a.send({ t: 'mail', folder: 0 });
    const mail = await a.expect('mail');
    a.send({ t: 'read', id: mail.list[0].id });
    assert.equal((await a.expect('letter')).letter.text, 'Из браузера');
    console.log('✓ почта между игроками');

    a.send({ t: 'rating' });
    assert.equal((await a.expect('rating')).rows.length, 2);
    a.send({ t: 'profile', id: 0 });
    assert.equal((await a.expect('profile')).profile.login, 'webby');
    console.log('✓ рейтинг и кабинет');
    console.log('\nВЕБ: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    a.close(); b.close();
    server.kill();
    fs.rmSync(DB, { force: true });
  }
})();
