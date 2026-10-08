'use strict';
// Защита сети: IP за прокси нельзя подделать заголовком CF-Connecting-IP, чужой сайт (Origin) не откроет WebSocket,
// с одного адреса — не больше WS_PER_IP соединений.
const assert = require('assert');
const http = require('http'), os = require('os'), path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const PORT = 27000 + Math.floor(Math.random() * 1000);
const DB = path.join(os.tmpdir(), `tw-net-guard-${process.pid}-${Date.now().toString(36)}.json`);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], { env: { ...process.env, WEB_PORT: String(PORT), HOST: '127.0.0.1', DB, NO_BACKUP: '1', TRUST_PROXY: '1', WS_PER_IP: '3', ADMIN_PASS: 'admin' }, stdio: ['ignore', 'pipe', 'inherit'] });
const up = (headers) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', Host: `127.0.0.1:${PORT}`, ...headers } });
  req.on('upgrade', (res, socket) => resolve({ ok: true, socket })); req.on('response', () => resolve({ ok: false })); req.on('error', () => resolve({ ok: false })); req.end();
});
srv.stdout.on('data', async (d) => {
  if (!String(d).includes('Откройте в Chrome')) return;
  try {
    assert.ok(!(await up({ Origin: 'https://evil.example' })).ok, 'чужой сайт не подключается');
    const own = await up({ Origin: `http://127.0.0.1:${PORT}` }); assert.ok(own.ok, 'своя страница подключается'); own.socket.destroy();
    // три соединения с «адреса» 10.0.0.1 (его дописал прокси последним), четвёртое — нет; подделка CF-Connecting-IP не помогает
    const ss = [];
    for (let i = 0; i < 3; i++) { const r = await up({ 'X-Forwarded-For': `1.1.1.${i}, 10.0.0.1`, 'CF-Connecting-IP': `9.9.9.${i}` }); assert.ok(r.ok); ss.push(r.socket); }
    assert.ok(!(await up({ 'X-Forwarded-For': '5.5.5.5, 10.0.0.1', 'CF-Connecting-IP': '8.8.8.8' })).ok, 'IP — последний в X-Forwarded-For, подделка не обходит лимит');
    assert.ok((await up({ 'X-Forwarded-For': '10.0.0.2' })).ok, 'другой адрес подключается');
    ss.forEach((s) => s.destroy());
    console.log('✓ Сеть: чужой Origin отклонён, IP не подделать заголовком, лимит соединений с адреса');
    // кадры WebSocket: незамаскированный, большой до входа, поток ping — соединение рвётся; обычный — работает
    const frame = (op, payload, mask = true, fin = true) => { const len = payload.length, m = Buffer.from([7, 1, 9, 3]), b0 = (fin ? 0x80 : 0) | op;
      const head = len < 126 ? [b0, (mask ? 0x80 : 0) | len] : len < 65536 ? [b0, (mask ? 0x80 : 0) | 126, len >> 8, len & 255] : null;
      return Buffer.concat([Buffer.from(head), mask ? m : Buffer.alloc(0), mask ? Buffer.from(payload.map((x, i) => x ^ m[i & 3])) : payload]); };
    const conn = async (ip) => { const r = await up({ 'X-Forwarded-For': ip }); const st = { closed: false, data: Buffer.alloc(0), socket: r.socket };
      r.socket.on('close', () => { st.closed = true; }); r.socket.on('data', (d) => { st.data = Buffer.concat([st.data, d]); }); return st; };
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const okc = await conn('10.1.0.1'); okc.socket.write(frame(1, Buffer.from('{"t":"hello"}'))); await wait(300);
    assert.ok(!okc.closed && /"t":"catalog"/.test(okc.data.toString()), 'обычный кадр — ответ приходит');
    for (let i = 0; i < 5; i++) okc.socket.write(frame(9, Buffer.from('p'))); await wait(200); assert.ok(!okc.closed, '5 ping — соединение живо'); okc.socket.destroy();
    const unm = await conn('10.1.0.2'); unm.socket.write(frame(1, Buffer.from('{"t":"hello"}'), false)); await wait(300); assert.ok(unm.closed, 'незамаскированный кадр — соединение закрыто');
    const big = await conn('10.1.0.3'); big.socket.write(frame(1, Buffer.from(`{"t":"hello","x":"${'a'.repeat(20000)}"}`))); await wait(300); assert.ok(big.closed, 'до входа сообщение больше 16 КБ — закрыто');
    const flood = await conn('10.1.0.4'); for (let i = 0; i < 15; i++) flood.socket.write(frame(9, Buffer.from('p'))); await wait(300); assert.ok(flood.closed, 'поток ping — закрыто');
    const bigPing = await conn('10.1.0.5'); bigPing.socket.write(frame(9, Buffer.alloc(200, 1))); await wait(300); assert.ok(bigPing.closed, 'ping длиннее 125 байт — закрыто');
    const frag = await conn('10.1.0.6'); frag.socket.write(Buffer.concat([frame(1, Buffer.from('{"t":'), true, false), frame(0, Buffer.from('"hello"}'))])); await wait(300);
    assert.ok(!frag.closed && /"t":"catalog"/.test(frag.data.toString()), 'сообщение из двух частей — работает');
    const many = await conn('10.1.0.7'); many.socket.write(Buffer.concat([frame(1, Buffer.from('{'), true, false), ...Array.from({ length: 5000 }, () => frame(0, Buffer.from(' '), true, false))])); await wait(300);
    assert.ok(many.closed, '5000 частей по 1 байту — закрыто');
    console.log('✓ Кадры WebSocket: без маски, большие до входа, поток и длинные ping, тысячи мелких частей — соединение рвётся');
    process.exitCode = 0;
  } catch (e) { console.error('FAIL:', e.message); process.exitCode = 1; }
  srv.once('exit', () => { for (const f of [DB, `${DB}.tmp`]) fs.rmSync(f, { force: true }); process.exit(process.exitCode); }); srv.kill();
});
setTimeout(() => { console.error('FAIL: timeout'); srv.kill(); process.exit(1); }, 30000).unref();
