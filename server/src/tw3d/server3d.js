'use strict';
// Сервер для Android-клиента «Третий Мир 3D» (порт 5005). Игровой мир — общий с J2ME- и веб-клиентом (Game).
//
// Интерфейс строится окнами из текстовой разметки клиента (сообщение win.ADDDIL со строкой):
//   {картинка}               — изображение ('!' в начале — файл из assets клиента, например {!Style/Glass.png})
//   {s.кат.команда(1,'x');}текст{;}  — ссылка: по нажатию клиент шлёт СЕРВЕРУ сообщение кат.команда(аргументы)
//   {g.win.CLOSE();}текст{;} — ссылка, выполняемая в самом клиенте (закрыть окно)
//   \n — новая строка, \t — табуляция
// Ввод текста: сообщение INPTXT со списком [кат ответа, команда ответа, текст, макс. длина, флаги(65536 — пароль)].

const net = require('net');
const C = require('../catalog');
const { VIEW, landOptions } = require('../game');
const P = require('./protocol');

const N = P.nameHash;
const RES = [['wood', 'Дерево'], ['stone', 'Камень'], ['iron', 'Железо'], ['food', 'Еда'], ['people', 'Люди']];
// команды, которые клиент шлёт нам (кат.команда); имена ≤ 6 символов
const CMD = {
  START: `${N('USER')}:${N('START')}`,
};
const PASSWORD_FLAG = 65536;

const link = (text, cat, cmd, ...args) => {
  const a = args.map((x) => (typeof x === 'number' ? String(x) : `'${String(x).replace(/'/g, '')}'`)).join(',');
  return `{s.${cat}.${cmd}(${a});}${text}{;}`;
};
const closeLink = (text = 'Закрыть') => `{g.win.CLOSE();}${text}{;}`;
const fmt = (sec) => { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; };

class Session3D {
  constructor(game, sock, log) {
    this.game = game; this.sock = sock; this.log = log;
    this.user = null; this.pending = {}; this.windows = 0;
  }

  get castle() { return this.user && this.game.castleOf(this.user); }
  write(buf) { if (!this.sock.destroyed) this.sock.write(buf); }
  send(cat, cmd, arg) { this.write(P.message(cat, cmd, arg)); }

  // ----- окна -----
  window(markup) {
    this.closeAll();
    this.send('win', 'ADDDIL', markup);
    this.windows++;
  }
  closeAll() { while (this.windows > 0) { this.send('win', 'CLOSE', null); this.windows--; } }
  ask(replyCmd, title, { password = false, max = 20, value = '' } = {}) {
    this.send('app', 'INPTXT', [N('app'), N(replyCmd), value || title, max, password ? PASSWORD_FLAG : 0]);
  }

  // ----- входящие -----
  handle(msg) {
    const key = `${msg.cat}:${msg.cmd}`;
    const name = `${P.nameOf(msg.cat)}.${P.nameOf(msg.cmd)}`;
    this.log(`<< ${name} ${JSON.stringify(msg.arg)}`);
    if (key === CMD.START) return this.welcome();
    if (msg.cat !== N('app') && msg.cat !== N('bld')) return this.log(`   (пропущено: ${name})`);
    const fn = ACTIONS[P.nameOf(msg.cmd).toLowerCase()];
    if (!fn) return this.window(`Команда ${name} пока не поддерживается.\n\n${closeLink()}`);
    fn.call(this, msg.arg);
  }

  welcome(note = '') {
    this.user = null;
    this.window([
      '{!Style/Glass.png}',
      'Война Королей',
      'Тестовый сервер',
      note ? `\n${note}` : '',
      '',
      link('Войти', 'app', 'login'),
      '',
      link('Регистрация', 'app', 'reg'),
    ].join('\n'));
  }

  // ----- экран замка -----
  castleScreen(note = '') {
    const c = this.castle; this.game.tick(c);
    const rate = this.game.rates(c), cap = this.game.capacity(c);
    const lines = [`${c.name} (X:${c.x} Y:${c.y})`, `Игрок: ${this.user.login}, ${C.RACE_NAMES[this.user.race]}. Рейтинг: ${this.game.rating(c)}`, ''];
    if (note) lines.push(note, '');
    for (const [k, t] of RES) lines.push(`${t}: ${Math.floor(c.res[k])} / ${cap[k]}  (+${rate[k]}/ч)`);
    lines.push('');
    if (c.queue.length) {
      lines.push('Стройки:');
      for (const q of c.queue) lines.push(`  ${C.BY_ID[q.building].name} -> ${q.level} ур., осталось ${fmt((q.end - Date.now()) / 1000)}`);
      lines.push('');
    }
    lines.push(link('Здания замка', 'bld', 'list', 0), link('Земли', 'bld', 'list', 1), link('Обновить', 'app', 'home'), link('Выход', 'app', 'logout'));
    this.window(lines.join('\n'));
  }

  buildingsScreen(view) {
    const c = this.castle, size = view === VIEW.CASTLE ? 7 : 15;
    const lines = [view === VIEW.CASTLE ? 'Здания замка' : 'Земли', ''];
    c.grid[view].forEach((b, i) => {
      if (b < 0) return;
      const def = C.BY_ID[b], lvl = c.levels[view][i];
      const busy = c.queue.some((q) => q.view === view && q.cell === i);
      lines.push(`${def.name} ${lvl} ур. ${busy ? '(строится)' : link('[развить]', 'bld', 'up', view, i)}`);
    });
    lines.push('', 'Построить новое:');
    const empty = c.grid[view].map((b, i) => i).filter((i) => c.grid[view][i] < 0 && !c.queue.some((q) => q.view === view && q.cell === i));
    const offers = new Map(); // здание -> первая подходящая клетка
    for (const cell of empty) {
      const opts = view === VIEW.LANDS ? landOptions(cell % 15, Math.floor(cell / 15))
        : C.BUILDINGS.filter((d) => d.layer === 'castle' && !(d.unique && this.game.buildingLevel(c, d.id) > 0)).map((d) => d.id);
      for (const id of opts) if (!offers.has(id)) offers.set(id, cell);
    }
    for (const [id, cell] of offers) {
      const cost = C.levelCost(C.BY_ID[id], 1);
      lines.push(`${link(C.BY_ID[id].name, 'bld', 'new', view, cell, id)}  ${cost.wood}д ${cost.stone}к ${cost.iron}ж ${cost.food}е`);
    }
    lines.push('', link('Назад', 'app', 'home'));
    this.window(lines.join('\n'));
    this.size = size;
  }
}

const argList = (a) => (Array.isArray(a) ? a : a === null || a === undefined ? [] : [a]);

// команды app.* и bld.* (по имени команды, в нижнем регистре)
const ACTIONS = {
  login() { this.pending = {}; this.ask('lname', 'Логин'); },
  lname(v) { this.pending.login = String(v || '').trim(); this.ask('lpass', 'Пароль', { password: true }); },
  lpass(v) {
    const u = this.game.login(this.pending.login, String(v || ''));
    if (!u) return this.welcome('Неверный логин или пароль.');
    this.user = u;
    this.log(`login ok: ${u.login}`);
    this.castleScreen(`Добро пожаловать, ${u.login}!`);
  },
  reg() { this.pending = {}; this.ask('rname', 'Новый логин (3-10 символов)'); },
  rname(v) { this.pending.login = String(v || '').trim(); this.ask('rpass', 'Пароль', { password: true }); },
  rpass(v) {
    this.pending.password = String(v || '');
    this.window(['Выберите расу:', '', link('Люди', 'app', 'race', 0), link('Эльфы', 'app', 'race', 1), link('Гномы', 'app', 'race', 2)].join('\n'));
  },
  race(v) {
    const res = this.game.register({ login: this.pending.login, password: this.pending.password, race: argList(v)[0] });
    if (res.error) return this.welcome(res.error);
    this.log(`registered ${res.user.login}`);
    this.user = res.user;
    this.castleScreen(`Аккаунт создан. Добро пожаловать, ${res.user.login}!`);
  },
  home() { if (!this.user) return this.welcome(); this.castleScreen(); },
  logout() { this.welcome('Вы вышли из игры.'); },
  list(v) { if (!this.user) return this.welcome(); this.buildingsScreen(argList(v)[0] === 1 ? VIEW.LANDS : VIEW.CASTLE); },
  new(v) {
    if (!this.user) return this.welcome();
    const [view, cell, building] = argList(v);
    const r = this.game.startBuild(this.castle, view, cell, building);
    this.castleScreen(r.error ? `Не получилось: ${r.error}` : `Стройка начата: ${C.BY_ID[building].name}.`);
  },
  up(v) {
    if (!this.user) return this.welcome();
    const [view, cell] = argList(v);
    const r = this.game.startBuild(this.castle, view, cell, this.castle.grid[view][cell]);
    this.castleScreen(r.error ? `Не получилось: ${r.error}` : 'Улучшение начато.');
  },
};

function startServer3D(game, sessions, { port, host, log, debug }) {
  const server = net.createServer((sock) => {
    const tag = `3d ${sock.remoteAddress}:${sock.remotePort}`;
    const slog = (m) => log(`${tag} ${m}`);
    const parser = new P.StreamParser();
    const s = new Session3D(game, sock, slog);
    sessions.add(s);
    s.notifyMail = (from) => s.user && s.castleScreen(`Новое письмо от ${from}.`);
    s.onTick = () => {
      if (!s.user) return;
      const done = game.tick(s.castle);
      if (done.length) s.castleScreen(done.map((d) => `Готово: ${C.BY_ID[d.building].name} ${d.level} ур.`).join('\n'));
    };
    sock.setNoDelay(true);
    slog('connected');
    if (debug) { const w = sock.write.bind(sock); sock.write = (b) => { slog(`>> ${b.toString('hex')}`); return w(b); }; }
    sock.on('data', (chunk) => {
      if (debug) slog(`<< ${chunk.toString('hex')}`);
      let items;
      try { items = parser.push(chunk); } catch (e) { slog(`ошибка разбора: ${e.message}`); return sock.destroy(); }
      for (const it of items) {
        try {
          if (it.handshake) {
            slog(`handshake: клиент v${it.handshake[0]}/${it.handshake[1]}`);
            s.write(Buffer.from([P.PROTO, P.PROTO]));
            continue;
          }
          if (it.channel !== 0) { slog(`канал ${it.channel}: ${it.payload.length} байт (пока не обрабатывается)`); continue; }
          const { reader } = P.decodePayload(it.payload);
          s.handle(reader.message());
        } catch (e) { slog(`ошибка обработки: ${e.stack}`); }
      }
    });
    sock.on('error', (e) => slog(`socket error: ${e.message}`));
    sock.on('close', () => { sessions.delete(s); slog('closed'); });
  });
  server.listen(port, host, () => log(`3D-клиент (Android): порт ${port}`));
  return server;
}

module.exports = { startServer3D, Session3D };
