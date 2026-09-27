'use strict';
// Смоук-тест: поднимает сервер и повторяет байт-в-байт то, что шлёт оригинальный клиент
// (по декомпиляции: классы g, ag, k, q). Запуск: node server/test/smoke.js

const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { spawn } = require('child_process');
const P = require('../src/protocol');

const PORT = 25000 + Math.floor(Math.random() * 1000);
const DB = path.join(os.tmpdir(), `tw-smoke-${process.pid}.json`);

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB, SPEED: '2000' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve) => child.stdout.on('data', (d) => { if (String(d).includes('слушает')) resolve(child); }));
}

class Client {
  constructor() { this.reader = new P.FlapReader(); this.queue = []; this.waiters = []; }
  connect() {
    return new Promise((resolve) => {
      this.sock = net.connect(PORT, '127.0.0.1', resolve);
      this.sock.on('data', (d) => { for (const p of this.reader.push(d)) { this.queue.push(p); this.flush(); } });
    });
  }
  flush() {
    for (const w of [...this.waiters]) {
      const i = this.queue.findIndex(w.match);
      if (i >= 0) { const [p] = this.queue.splice(i, 1); this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(p); }
    }
  }
  expect(channel, group, sub, pred = () => true, ms = 3000) {
    return new Promise((resolve, reject) => {
      const match = (p) => p.channel === channel && p.group === group && p.sub === sub && pred(p);
      const w = { match, resolve };
      this.waiters.push(w); this.flush();
      setTimeout(() => reject(new Error(`timeout waiting ch${channel} SNAC(${group},${sub})`)), ms);
    });
  }
  // как d.d() в клиенте: seq всегда 1
  send(channel, group, sub, data = Buffer.alloc(0)) { this.sock.write(P.snac(channel, group, sub, data)); }
}

const findTlvs = (buf, type) => P.parseTlvs(buf).filter((t) => t.type === type);
const windowText = (p) => P.parseTlvs(p.data).map((t) => P.decodeText(t.value)).join(' | ');

(async () => {
  const server = await startServer();
  const c = new Client();
  try {
    await c.connect();
    await c.expect(1, 1, 0);                                               // hello
    c.send(1, 1, 1, Buffer.concat([P.u16(240), P.u16(320)]));             // размер экрана
    c.send(1, 1, 0, Buffer.from('28092009x3'));                           // версия
    await c.expect(1, 4, 0);                                               // → форма входа
    console.log('✓ handshake');

    // регистрация: кнопка формы, канал 1, SNAC(4,7), поля 1..8 строками
    const fields = { 1: 'Tester', 2: 'Secret', 3: 't@t.ru', 4: '2', 5: '', 6: '1', 7: 'q', 8: 'a' };
    c.send(1, 4, 7, Buffer.concat(Object.entries(fields).map(([k, v]) => P.tlv(Number(k), v))));
    await c.expect(1, 4, 0);
    const reg = await c.expect(2, 12, 0);
    assert.match(windowText(reg), /создан/);
    console.log('✓ registration:', windowText(reg).replace(/^\S+\s/, ''));

    // неверный пароль
    c.send(1, 4, 5, Buffer.concat([P.tlv(1, 'tester'), P.tlv(2, 'wrong')]));
    assert.match(windowText(await c.expect(2, 12, 0)), /Неверный/);
    console.log('✓ wrong password rejected');

    // вход: клиент переводит логин и пароль в нижний регистр
    c.send(1, 4, 5, Buffer.concat([P.tlv(1, 'tester'), P.tlv(2, 'secret')]));
    const ok = await c.expect(1, 4, 5);
    assert.equal(ok.data.length, 4);
    console.log('✓ login, user id', ok.data.readUInt32BE(0));

    c.send(2, 10, 0);
    await c.expect(2, 10, 0);
    const res = await c.expect(2, 10, 6);
    const amounts = findTlvs(res.data, 10)[0].value;
    console.log('✓ resources wood/stone/iron/food/people =', [0, 4, 8, 12, 16].map((o) => amounts.readUInt32BE(o)).join('/'));
    const grid = await c.expect(2, 10, 1);
    const cells = findTlvs(grid.data, 9)[0].value;
    assert.equal(cells.length, 49);
    assert.equal(cells.readInt8(3 * 7 + 3), 0); // Ратуша
    console.log('✓ castle grid 7x7, Ратуша at (3,3)');
    await c.expect(2, 10, 10);

    // земли
    c.send(2, 10, 4, P.tlv(1));
    const lands = await c.expect(2, 10, 1, (p) => findTlvs(p.data, 8)[0].value[0] === 1);
    assert.equal(findTlvs(lands.data, 9)[0].value.length, 225);
    console.log('✓ lands grid 15x15');

    // клик по пустой клетке земель (5,8) — трава → Огород/Хибара
    c.send(2, 10, 5, Buffer.concat([P.u16(5), P.u16(8)]));
    const win = await c.expect(2, 12, 0, (p) => findTlvs(p.data, 10).length > 0);
    const buttons = findTlvs(win.data, 10).filter((t) => t.value[2] === 2);
    assert.ok(buttons.length > 0, 'no build buttons');
    const param = buttons[0].value.readUInt32BE(9);
    console.log('✓ build menu:', windowText(win).slice(0, 80), '…');

    // нажатие «Построить»: кнопка mode 2 → SNAC(10,2) + TLV1(u32 param)
    c.send(2, 10, 2, P.tlv(1, P.u32(param)));
    const started = await c.expect(2, 10, 2);
    assert.equal(findTlvs(started.data, 5)[0].value.readUInt16BE(0), 0);
    console.log('✓ construction started');

    const done = await c.expect(2, 12, 0, (p) => /Готово/.test(windowText(p)), 15000);
    console.log('✓', windowText(done).replace(/^\S+\s/, ''));

    // карта мира
    c.send(2, 10, 8);
    const world = await c.expect(2, 10, 8);
    console.log('✓ world map objects:', findTlvs(world.data, 17).length);

    // меню: Рейтинг (11,17) и Bug! (11,16)
    c.send(2, 11, 17, P.tlv(0));
    assert.match(windowText(await c.expect(2, 12, 0, (p) => /Рейтинг/.test(windowText(p)))), /tester/);
    console.log('✓ rating window');
    c.send(2, 11, 16, P.tlv(0));
    await c.expect(2, 12, 0, (p) => /ошибке/.test(windowText(p)));
    c.send(2, 11, 19, P.tlv(1, 'Тест бага'));
    await c.expect(2, 12, 0, (p) => /Спасибо/.test(windowText(p)));
    console.log('✓ bug report');

    // кабинет (профиль)
    c.send(2, 11, 18, P.tlv(0));
    assert.match(windowText(await c.expect(2, 12, 0, (p) => /Кабинет/.test(windowText(p)))), /Кабинет/);
    console.log('✓ profile window');

    // второй игрок пишет письмо первому
    const c2 = new Client();
    await c2.connect();
    await c2.expect(1, 1, 0);
    c2.send(1, 1, 0, Buffer.from('28092009x3'));
    await c2.expect(1, 4, 0);
    c2.send(1, 4, 7, Buffer.concat([P.tlv(1, 'Second'), P.tlv(2, 'pass2'), P.tlv(4, '0')]));
    await c2.expect(1, 4, 0);
    c2.send(1, 4, 5, Buffer.concat([P.tlv(1, 'second'), P.tlv(2, 'pass2')]));
    await c2.expect(1, 4, 5);
    c2.send(2, 10, 0);
    await c2.expect(2, 10, 0);
    c2.send(2, 11, 5, Buffer.concat([P.tlv(1, 'tester'), P.tlv(3, 'Привет'), P.tlv(4, 'Союз?')]));
    await c2.expect(2, 12, 0, (p) => /отправлено/.test(windowText(p)));
    await c.expect(2, 12, 0, (p) => /Новое письмо/.test(windowText(p)));
    c.send(2, 11, 6, P.tlv(0, P.u16(0)));                                   // папка «Входящие»
    const inbox = await c.expect(2, 11, 6);
    const rec = findTlvs(inbox.data, 5)[0].value;
    c.send(2, 11, 6, P.tlv(1, P.u32(rec.readUInt32BE(0))));                // открыть письмо (ссылка {u11|6|1|id|…})
    const letter = await c.expect(2, 11, 5);
    assert.equal(P.decodeText(findTlvs(letter.data, 3)[0].value), 'Союз?');
    console.log('✓ mail between two players');
    c2.sock.destroy();

    console.log('\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    c.sock && c.sock.destroy();
    server.kill();
    fs.rmSync(DB, { force: true });
  }
})();
