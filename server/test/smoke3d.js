'use strict';
// Смоук-тест протокола Android-клиента «Третий Мир 3D» (v56): повторяет байты клиента по декомпиляции
// (h.b — рукопожатие и рамка, o.a — канал сообщений, y.c — сериализация, H.b — ответ на INPTXT).

const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { spawn } = require('child_process');
const P = require('../src/tw3d/protocol');

const REAL_USER_START = '0041000000000080808011b64d831edd736617000000096639a00041006e00640072006f006900640020007c00200043006c00690065006e0074002000760065007200730069006f006e00200032002e0030002e00310031003266399c005800690061006f006d006900200020007c00200020003200330030003600450050004e00360030004700200020007c00200020003100366609000004c46609000009f3663984006e0075006c006c6631016631016609000068db663984006e0075006c006c';
const REAL_GCM = '007e812e00000000008080800051bf99de63bf66390e00650071006d004100340038005300530054004e00430051004b004c005a0076004f0052006a006c00720050003a00410050004100390031006200470046002d00370052004a005300570070004c004d0035007800710036004b004a0070006e0039007000560057004b006c00680030006e0046006f005f0064004f004b006c006c006d005900320058007000550035007a0078006b004b006d003300310034004e006b0052005000780049007a003400640077004f006900410038005f0055005a006500770034004400360078007100550070007a006500340053004300690048004e005f00730037005600630078004d00320032006e006b00720032004500630052005900440053004700590036003300720072003700740063';
const PORT3D = 28000 + Math.floor(Math.random() * 1000);
const DB = path.join(os.tmpdir(), `tw-3d-smoke-${process.pid}.json`);

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT3D + 1000), PORT3D: String(PORT3D), WEB_PORT: '0', HOST: '127.0.0.1', DB, SPEED: '2000' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve) => child.stdout.on('data', (d) => { if (String(d).includes('3D-клиент')) resolve(child); }));
}

// как h.b.i(): [канал][varint(len+1)][false][заголовок y.c.a()][тело]
function clientPacket(cat, cmd, arg) {
  const body = new P.Writer().i32(P.nameHash(cat)).i32(P.nameHash(cmd)).value(arg).bytes();
  const payload = Buffer.concat([Buffer.from([0]), P.EMPTY_HEADER, body]);
  return Buffer.concat([new P.Writer().u8(0).varint(payload.length).bytes(), payload]);
}

class Client {
  constructor() { this.buf = Buffer.alloc(0); this.msgs = []; this.waiters = []; this.hs = null; }
  connect() {
    return new Promise((resolve) => {
      this.sock = net.connect(PORT3D, '127.0.0.1', () => { this.sock.write(Buffer.from([56, 15])); resolve(); });
      this.sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    });
  }
  parse() {
    if (!this.hs) { if (this.buf.length < 2) return; this.hs = [this.buf[0], this.buf[1]]; this.buf = this.buf.subarray(2); }
    for (;;) {
      if (this.buf.length && this.buf[0] === 0xff) { this.pongs = (this.pongs || 0) + 1; this.buf = this.buf.subarray(1); continue; }
      if (this.buf.length < 2) return;
      const r = new P.Reader(this.buf);
      const ch = r.u8(), len = r.varint();
      if (this.buf.length < r.off + len) return;
      const payload = this.buf.subarray(r.off, r.off + len);
      this.buf = this.buf.subarray(r.off + len);
      const { reader } = P.decodePayload(payload);
      const m = reader.message();
      this.msgs.push({ ch, name: `${P.nameOf(m.cat)}.${P.nameOf(m.cmd)}`, arg: m.arg });
      this.flush();
    }
  }
  flush() {
    for (const w of [...this.waiters]) {
      const i = this.msgs.findIndex(w.pred);
      if (i >= 0) { const [m] = this.msgs.splice(i, 1); this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
    }
  }
  expect(name, pred = () => true) {
    return new Promise((resolve, reject) => {
      this.waiters.push({ pred: (m) => m.name === name && pred(m), resolve }); this.flush();
      setTimeout(() => reject(new Error(`timeout waiting ${name}`)), 4000);
    });
  }
  send(cat, cmd, arg) { this.sock.write(clientPacket(cat, cmd, arg)); }
  // нажатие ссылки {s.кат.команда(args);} из окна
  click(markup, text) {
    const re = new RegExp(`\\{s\\.(\\w+)\\.(\\w+)\\(([^)]*)\\);\\}${text.replace(/[[\]]/g, '\\$&')}\\{;\\}`);
    const m = markup.match(re);
    assert.ok(m, `ссылка «${text}» не найдена в окне:\n${markup}`);
    const args = m[3] === '' ? null : m[3].split(',').map((a) => (a.startsWith("'") ? a.slice(1, -1) : Number(a)));
    this.send(m[1], m[2], args === null ? null : args.length === 1 ? args[0] : args);
  }
}

(async () => {
  const server = await startServer();
  const c = new Client();
  try {
    await c.connect();
    // настоящий USER.START с телефона (Xiaomi, клиент 2.0.112): список скриптовых значений (тип 102)
    c.sock.write(Buffer.concat([Buffer.from([0xff]), Buffer.from(REAL_USER_START, 'hex'), Buffer.from(REAL_GCM, 'hex')])); // + ping и токен GCM
    const win = await c.expect('WIN.ADDDIL');
    assert.deepEqual(c.hs, [56, 56]);
    assert.equal(c.pongs, 1);
    assert.match(win.arg, /Регистрация/);
    console.log('✓ рукопожатие v56 и приветственное окно');

    c.click(win.arg, 'Регистрация');
    let ask = await c.expect('APP.INPTXT');
    assert.equal(ask.arg.length, 5);
    c.send('app', P.nameOf(ask.arg[1]), 'Mobile');         // ответ поля ввода (H.b)
    ask = await c.expect('APP.INPTXT', (m) => m.arg[4] === 65536);
    c.send('app', P.nameOf(ask.arg[1]), 'pass3d');
    const raceWin = await c.expect('WIN.ADDDIL', (m) => /расу/.test(m.arg));
    c.click(raceWin.arg, 'Гномы');
    let castle = await c.expect('WIN.ADDDIL', (m) => /Рейтинг/.test(m.arg));
    assert.match(castle.arg, /Гномы/);
    console.log('✓ регистрация через окна и поле ввода');

    c.click(castle.arg, 'Земли');
    const lands = await c.expect('WIN.ADDDIL', (m) => /Построить новое/.test(m.arg));
    c.click(lands.arg, 'Огород');
    castle = await c.expect('WIN.ADDDIL', (m) => /Стройка начата/.test(m.arg));
    const done = await c.expect('WIN.ADDDIL', (m) => /Готово: Огород/.test(m.arg));
    assert.ok(done);
    console.log('✓ стройка через окна 3D-клиента');

    c.click(done.arg, 'Выход');
    const w2 = await c.expect('WIN.ADDDIL', (m) => /Войти/.test(m.arg));
    c.click(w2.arg, 'Войти');
    ask = await c.expect('APP.INPTXT');
    c.send('app', P.nameOf(ask.arg[1]), 'mobile');
    ask = await c.expect('APP.INPTXT');
    c.send('app', P.nameOf(ask.arg[1]), 'pass3d');
    await c.expect('WIN.ADDDIL', (m) => /Добро пожаловать, mobile/.test(m.arg));
    console.log('✓ повторный вход');
    console.log('\n3D: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    c.sock && c.sock.destroy();
    server.kill();
    fs.rmSync(DB, { force: true });
  }
})();
