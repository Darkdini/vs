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
    process.exitCode = 0;
  } catch (e) { console.error('FAIL:', e.message); process.exitCode = 1; }
  srv.once('exit', () => { for (const f of [DB, `${DB}.tmp`]) fs.rmSync(f, { force: true }); process.exit(process.exitCode); }); srv.kill();
});
setTimeout(() => { console.error('FAIL: timeout'); srv.kill(); process.exit(1); }, 30000).unref();
