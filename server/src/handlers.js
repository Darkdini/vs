'use strict';
// Обработка SNAC-команд клиента. Номера групп/подгрупп восстановлены по декомпиляции клиента (см. docs/04-protocol.md).

const P = require('./protocol');
const { u8, u16, u32, i8, tlv, cat, snac, tlvMap, decodeText } = P;
const { Window, messageBox, ticker, INPUT } = require('./ui');
const C = require('./catalog');
const { VIEW, GRID, landOptions } = require('./game');

const CLIENT_VERSION = '28092009x3';
const fs = require('fs');
const path = require('path');
const ASSETS = process.env.ASSETS || path.join(__dirname, '..', 'assets', 'images');

const fmtTime = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const costLine = (cost) => C.RES.filter((r) => cost[r] > 0).map((r) => `{i${C.RES_ICON[r]}}${cost[r]}`).join(' ');
const str = (buf) => (buf ? decodeText(buf) : '');
const cellParam = (view, cell, building) => ((view & 0xff) << 24) | ((cell & 0xffff) << 8) | (building & 0xff);

class Session {
  constructor(game, sock, log) {
    this.game = game; this.sock = sock; this.log = log;
    this.user = null; this.view = VIEW.CASTLE; this.world = null;
  }

  send(buf) { if (!this.sock.destroyed) this.sock.write(buf); }
  get castle() { return this.user && this.game.castleOf(this.user); }

  // ---------------- соединение ----------------
  hello() { this.send(snac(1, 1, 0)); } // сервер начинает: SNAC(1,0) на канале 1

  handle(p) {
    const key = `${p.group},${p.sub}`;
    if (p.channel === 4) { this.log('client disconnect packet'); this.sock.end(); return; }
    if (p.group === undefined) return;
    if (p.channel === 1 || key === '4,8') return this.handleSystem(p, key);
    if (key === '10,27') return this.sendImages(p.data); // картинки нужны уже на форме входа
    if (!this.user) return this.send(messageBox('Сначала войдите в игру.'));
    const fn = ROUTES[key];
    if (fn) return fn.call(this, p, tlvMap(p.data));
    this.log(`unhandled SNAC(${key}) data=${p.data.toString('hex')}`);
    this.send(messageBox(`Раздел пока не реализован на тестовом сервере (${key}).`));
  }

  handleSystem(p, key) {
    switch (key) {
      case '1,1': // (1,1) TLV-less: sub 0 — версия, sub 1 — размер экрана
        return;
      case '1,0': { // версия клиента → показываем форму входа
        const ver = p.data.toString('latin1');
        this.log(`client version ${ver}${ver === CLIENT_VERSION ? '' : ' (неожиданная)'}`);
        return this.send(snac(1, 4, 0));
      }
      case '4,5': { // вход
        const t = tlvMap(p.data);
        const user = this.game.login(str(t[1]), str(t[2]));
        if (!user) return this.send(messageBox('Неверный логин или пароль.'));
        this.user = user;
        this.log(`login ok: ${user.login} (#${user.id})`);
        return this.send(snac(1, 4, 5, u32(user.id)));
      }
      case '4,7': { // регистрация
        const t = tlvMap(p.data);
        const res = this.game.register({ login: str(t[1]), password: str(t[2]), email: str(t[3]), race: str(t[4]) });
        if (res.error) return this.send(messageBox(res.error));
        this.log(`registered ${res.user.login} race=${res.user.race}`);
        this.send(snac(1, 4, 0)); // назад к форме входа
        return this.send(messageBox(`Аккаунт "${res.user.login}" создан (${C.RACE_NAMES[res.user.race]}). Теперь войдите.`));
      }
      case '4,8': // «?» подсказки в форме регистрации
        return this.send(messageBox('Логин 3–10 символов, пароль от 3 символов. E-mail и контрольный вопрос на тестовом сервере не проверяются.'));
      case '4,12': // сохранённый id клиента — игнорируем
        return;
      default:
        this.log(`unhandled system SNAC(${key}) data=${p.data.toString('hex')}`);
        return this.send(messageBox(`Команда ${key} не поддерживается.`));
    }
  }

  // Клиент просит картинки, которых нет в jar: SNAC(10,27) = список u16 id.
  // Ответ SNAC(10,17): TLV4 — не кэшировать в памяти телефона, TLV5 — [png][u16 id], TLV6 — не перерисовывать форму.
  sendImages(data) {
    const parts = [tlv(4)];
    for (let off = 0; off + 2 <= data.length; off += 2) {
      const id = data.readUInt16BE(off);
      const file = path.join(ASSETS, `${id}.png`);
      const png = fs.existsSync(file) ? fs.readFileSync(file) : fs.readFileSync(path.join(ASSETS, 'placeholder.png'));
      this.log(`image #${id} -> ${fs.existsSync(file) ? file : 'placeholder'}`);
      parts.push(tlv(5, cat(png, u16(id))));
    }
    if (this.user) parts.push(tlv(6));
    this.send(snac(2, 10, 17, cat(...parts)));
  }

  // ---------------- пакеты состояния ----------------
  pushResources() {
    const c = this.castle; this.game.tick(c);
    const rate = this.game.rates(c), cap = this.game.capacity(c);
    const order = ['wood', 'stone', 'iron', 'food', 'people'];
    // клиент подписывает все пять значений «в час» (для людей его локальная интерполяция делит на 86400,
    // но сервер всё равно присылает точные остатки при каждом обновлении)
    const rates = order.map((r) => u16(Math.min(65535, rate[r])));
    this.send(snac(2, 10, 6, cat(
      tlv(10, cat(...order.map((r) => u32(Math.floor(c.res[r]))))),
      tlv(11, cat(...rates)),
      tlv(12, cat(...order.map((r) => u32(cap[r])))),
    )));
  }

  progressRecords(view) {
    const c = this.castle, now = Date.now(), size = GRID[view];
    return cat(...c.queue.filter((q) => q.view === view).map((q) => cat(
      u8(q.level > 1 ? 1 : 0), u16(q.building), u16(q.cell % size), u16(Math.floor(q.cell / size)),
      u16(Math.max(1, Math.round((q.end - q.start) / 1000))), u16(Math.round((now - q.start) / 1000)),
    )));
  }

  pushGrid(view) {
    const c = this.castle; this.game.tick(c);
    this.view = view;
    const building = new Set(c.queue.filter((q) => q.view === view && q.level === 1).map((q) => q.cell));
    const grid = c.grid[view].map((b, i) => {
      if (building.has(i)) return -2;
      return b < 0 ? -1 : C.displayId(C.BY_ID[b], c.levels[view][i]);
    });
    this.send(snac(2, 10, 1, cat(
      tlv(6, u8(this.game.buildingLevel(c, 22) > 0 ? 1 : 0)), // забор/стены вокруг замка
      tlv(8, u8(view)), tlv(7, u8(1)),
      tlv(9, cat(...grid.map((b) => i8(b)))),
      tlv(10, this.progressRecords(view)),
    )));
  }

  notifyMail(fromLogin) { this.send(ticker(`Новое письмо от ${fromLogin}`, 0x66ccff)); this.pushStatusBar(); }

  pushStatusBar() {
    const unread = (this.game.db.messages || []).filter((m) => m.to === this.user.id && !m.read).length;
    this.send(snac(2, 10, 10, cat(
      tlv(0, u16(2)),
      tlv(1, cat(u16(4), u16(4), u16(Math.floor(this.castle.res.people)), u16(1))),
      tlv(2, cat(u16(unread ? 419 : 420), u16(420), u16(unread), u16(1))),
    )));
  }

  enterGame() {
    this.send(snac(2, 10, 11, tlv(0, process.env.TZ_LABEL || 'GMT+03:00')));
    this.send(snac(2, 10, 0));
    this.pushResources();
    this.pushGrid(VIEW.CASTLE);
    this.pushStatusBar();
    this.send(ticker(`Добро пожаловать, ${this.user.login}! Тестовый сервер, скорость x${require('./game').SPEED}.`));
  }

  // вызывается по таймеру: завершённые стройки
  onTick() {
    if (!this.user) return;
    const done = this.game.tick(this.castle);
    if (!done.length) return;
    for (const d of done) this.send(ticker(`Готово: ${C.BY_ID[d.building].name} ${d.level} ур.`, 0x99ff99));
    this.pushResources();
    if (this.view !== VIEW.WORLD) this.pushGrid(this.view);
  }

  // ---------------- окна ----------------
  emptyCellWindow(view, x, y) {
    const c = this.castle, size = GRID[view], cell = y * size + x;
    const options = view === VIEW.LANDS
      ? landOptions(x, y)
      : C.BUILDINGS.filter((b) => b.layer === 'castle' && !(b.unique && this.game.buildingLevel(c, b.id) > 0)).map((b) => b.id);
    const w = new Window().title(view === VIEW.LANDS ? 'Земли: строительство' : 'Замок: строительство');
    if (!options.length) {
      w.text('Здесь строить нельзя (дорога или берег).', 1).endRow();
    }
    for (const id of options) {
      const def = C.BY_ID[id];
      const cost = C.levelCost(def, 1);
      const time = require('./game').buildTime(def, 1, this.game.buildingLevel(c, 0));
      const missing = Object.entries(def.req || {}).filter(([r, l]) => this.game.buildingLevel(c, Number(r)) < l)
        .map(([r, l]) => `${C.BY_ID[r].name} ${l}`);
      w.image(100 + C.displayId(def, 1)).text(`${def.name}\n${costLine(cost)} {i5}${fmtTime(time)}${missing.length ? `\nНужно: ${missing.join(', ')}` : ''}`).endRow();
      if (!missing.length) w.buttonParam('Построить', 10, 2, 1, cellParam(view, cell, id)).endRow();
    }
    w.buttonLocal('Закрыть').endRow();
    this.send(w.packet());
  }

  buildingWindow(view, cell) {
    const c = this.castle, b = c.grid[view][cell], lvl = c.levels[view][cell], def = C.BY_ID[b];
    if (!def) return this.send(messageBox('Пусто.'));
    const w = new Window().title(`${def.name} — ${lvl} ур.`);
    w.image(100 + C.displayId(def, lvl)).text(def.desc).endRow();
    if (def.produces) {
      const now = C.PROD[lvl], next = C.PROD[lvl + 1];
      w.text(`Добыча: {i${C.RES_ICON[def.produces]}} ${now}${next ? ` → ${next}` : ''} ед/час (без учёта скорости мира)`).endRow();
    }
    if (b === 1) w.text(`Вместимость склада: ${Math.round(1000 * 1.25 ** lvl)} каждого ресурса`).endRow();
    if (lvl < (def.max || 20)) {
      const cost = C.levelCost(def, lvl + 1);
      const time = require('./game').buildTime(def, lvl + 1, this.game.buildingLevel(c, 0));
      w.text(`Улучшение до ${lvl + 1} ур.:\n${costLine(cost)} {i5}${fmtTime(time)}`).endRow();
      w.buttonParam('Развить', 10, 2, 1, cellParam(view, cell, b)).endRow();
    } else {
      w.text('Максимальный уровень.').endRow();
    }
    if (b === 3 || b === 12 || b === 20 || b === 23) {
      const units = C.UNITS[this.user.race] || [];
      w.separator().text('Войска (тренировка пока не реализована):').endRow();
      for (const [img, name] of units) w.image(img).text(name).endRow();
    }
    w.buttonLocal('Закрыть').endRow();
    this.send(w.packet());
  }

  worldPacket(cx, cy) {
    const x0 = cx - 3, y0 = cy - 3;
    this.world = { cx, cy };
    const objs = this.game.worldObjects(x0, y0, 7, 7).map((o) => {
      const name = cat(`${o.kind === 'castle' ? 'Замок' : o.name}:${o.name}`), nick = cat(`Игрок:${o.owner || '-'}`), ally = cat('Альянс:-');
      return tlv(17, cat(u32(o.ownerId || 0), u16(o.x), u16(o.y), u16(o.kind === 'castle' ? 0 : 1), u16(o.img), u16(o.rating || 0),
        u8(name.length), u8(nick.length), u8(ally.length), name, nick, ally, o.race ? C.RACE_NAMES[o.race] : ''));
    });
    return snac(2, 10, 8, cat(tlv(16, cat(u16(x0), u16(y0))), ...objs, tlv(18, cat(u16(cx), u16(cy)))));
  }

  profileWindow(user) {
    const c = this.game.castleOf(user);
    const pop = this.game.rating(c);
    const w = new Window().title(user.id === this.user.id ? 'Кабинет' : `Игрок ${user.login}`);
    w.text(`Игрок: ${user.login}\nРаса: ${C.RACE_NAMES[user.race]}\nАльянс: -\nРейтинг: ${pop} очк.\nЗамков: 1\nВ игре с: ${new Date(user.created).toLocaleDateString('ru-RU')}`).endRow();
    w.text(`${c.name}  X:${c.x} Y:${c.y}`).endRow();
    if (user.id !== this.user.id) w.buttonParam('Сообщение', 10, 20, 1, user.id).endRow();
    w.buttonLocal('Закрыть').endRow();
    this.send(w.packet());
  }
}

// ---------------- маршруты (канал 2) ----------------
const ROUTES = {
  '10,0'() { this.enterGame(); },
  // переключение вида: TLV type = 0 замок, 1 земли
  '10,4'(p, t) { this.pushGrid(t[1] ? VIEW.LANDS : VIEW.CASTLE); this.pushResources(); },
  // клик по пустой клетке: u16 x, u16 y
  '10,5'(p) { this.emptyCellWindow(this.view, p.data.readUInt16BE(0), p.data.readUInt16BE(2)); },
  // клик по зданию: u16 индекс клетки
  '10,7'(p) { this.buildingWindow(this.view, p.data.readUInt16BE(0)); },
  // клик по стройке: u16 индекс клетки
  '10,3'(p) {
    const cell = p.data.readUInt16BE(0), q = this.castle.queue.find((i) => i.view === this.view && i.cell === cell);
    if (!q) return this.send(messageBox('Стройка уже завершена.', 1));
    this.send(messageBox(`${C.BY_ID[q.building].name}: ${q.level} ур.\nОсталось ${fmtTime((q.end - Date.now()) / 1000)}`));
  },
  // кнопка «Построить/Развить»: TLV1 = u32 (view<<24 | cell<<8 | building)
  '10,2'(p, t) {
    const v = t[1].readUInt32BE(0), view = v >>> 24, cell = (v >>> 8) & 0xffff, building = v & 0xff;
    const res = this.game.startBuild(this.castle, view, cell, building);
    if (res.error) return this.send(messageBox(res.error, 1));
    this.pushGrid(view);
    this.send(snac(2, 10, 2, cat(tlv(3, u16(0)), tlv(4, u16(cell)), tlv(5, u16(0)), tlv(10, this.progressRecords(view)))));
    this.pushResources();
  },
  '10,6'() { this.pushResources(); },
  // карта мира
  '10,8'() { const c = this.castle; this.view = VIEW.WORLD; this.send(this.worldPacket(c.x, c.y)); },
  '10,18'(p) { this.send(this.worldPacket(p.data.readUInt16BE(0), p.data.readUInt16BE(2))); },
  '10,36'(p) {
    const x = p.data.readUInt16BE(0), y = p.data.readUInt16BE(2);
    this.send(new Window().title(`Клетка X:${x} Y:${y}`).text('Свободная земля или объект карты. Нападение, разведка и основание замков появятся в следующих версиях сервера.').endRow().buttonLocal('Закрыть').endRow().packet());
  },
  // кнопки из окна замка на карте: TLV1 сообщение, TLV2 торговля, TLV3 войска (u32 id игрока)
  '10,20'(p, t) {
    if (t[1]) {
      const u = this.game.userById(t[1].readUInt32BE(0));
      return this.send(snac(2, 11, 7, tlv(1, cat(u8(cat(u ? u.login : '').length), u ? u.login : '', u8(0)))));
    }
    this.send(messageBox('Торговля и войска пока не реализованы.'));
  },
  '10,35'() { this.send(messageBox('Быстрые действия (клавиша 0) пока не реализованы.')); },

  // ----- главное меню (класс b клиента): Bug!, Кабинет, Почта*, Локации*, Рейтинг, Справка, Бонус, Выход -----
  // (* — подменю клиента: Почта шлёт 11,6 с папкой; Локации — 10,4 / 10,8)
  '11,16'() { // Bug!
    this.send(new Window().title('Сообщить об ошибке')
      .text('Опишите, что произошло:').endRow()
      .textarea(1, '', true).endRow()
      .buttonSubmit('Отправить', 11, 19, [1]).endRow()
      .buttonLocal('Отмена').endRow().packet());
  },
  '11,19'(p, t) {
    const db = this.game.db; db.bugs = db.bugs || [];
    db.bugs.push({ from: this.user.login, text: str(t[1]), at: Date.now() });
    this.game.store.save();
    this.log(`BUG REPORT: ${str(t[1])}`);
    this.send(messageBox('Спасибо! Сообщение сохранено на сервере.', 1));
  },
  '11,18'() { this.profileWindow(this.user); }, // Кабинет
  '11,15'(p, t) { const id = t[10] ? t[10].readUInt32BE(0) : this.user.id; const u = this.game.userById(id); if (u) this.profileWindow(u); },
  '11,17'() { // Рейтинг
    const rows = Object.values(this.game.db.users).map((u) => ({ u, r: this.game.rating(this.game.castleOf(u)) }))
      .sort((a, b) => b.r - a.r).slice(0, 20);
    const w = new Window().title('Рейтинг игроков');
    rows.forEach(({ u, r }, i) => w.text(`${i + 1}. {u11|15|10|${u.id}|${u.login}} - ${r}`).endRow());
    this.send(w.buttonLocal('Закрыть').endRow().packet());
  },
  '10,22'() { // Справка
    this.send(new Window().title('Справка').text('Тестовый сервер "Война Королей".\nКлавиши: 2/4/6/8 - курсор, 5 - выбрать, * - Замок/Земли/Мир, # - ресурсы, 0 - действия, правая софт-клавиша - меню.\nСтроить: наведите курсор на пустую клетку замка или земель и нажмите 5.').endRow().buttonLocal('Закрыть').endRow().packet());
  },
  '10,24'() { this.send(messageBox('Бонусы и развлечения пока не реализованы.', 2)); },
  // список писем (TLV0 = u16 папка или пустой) / открыть письмо (TLV1 = u32 id)
  '11,6'(p, t) {
    const db = this.game.db; db.messages = db.messages || [];
    if (t[2] || t[6] || t[7] || t[10]) return this.send(messageBox('Удаление, ответ и пересылка писем пока не реализованы.'));
    if (t[1] && t[1].length === 4) {
      const m = db.messages.find((x) => x.id === t[1].readUInt32BE(0) && (x.to === this.user.id || x.from === this.user.id));
      if (!m) return this.send(messageBox('Письмо не найдено.'));
      if (m.to === this.user.id) { m.read = true; this.game.store.save(); }
      const from = this.game.userById(m.from);
      return this.send(snac(2, 11, 5, cat(tlv(1, from ? from.login : '?'), tlv(2, m.subject), tlv(3, m.text),
        tlv(4, new Date(m.at).toLocaleString('ru-RU')), tlv(6, u32(m.from)))));
    }
    const folder = t[0] && t[0].length === 2 ? t[0].readUInt16BE(0) : 0; // 0 входящие, 1 исходящие, 2 отчёты
    if (folder === 2) return this.send(snac(2, 11, 6, tlv(4, cat(u16(0), u16(0), u16(0))))); // отчётов пока нет
    const outbox = folder === 1;
    const list = this.game.mailList(this.user.id, folder).slice(0, 10);
    const recs = list.map((m) => {
      const other = this.game.userById(outbox ? m.to : m.from);
      const a = cat(other ? other.login : '?'), s = cat(m.subject || '(без темы)'), d = cat(new Date(m.at).toLocaleString('ru-RU'));
      return tlv(5, cat(u32(m.id), u16(a.length), a, u16(s.length), s, u16(d.length), d, u16(m.read || outbox ? 1 : 0)));
    });
    this.send(snac(2, 11, 6, cat(tlv(4, cat(u16(list.length), u16(list.length), u16(0))), ...recs)));
  },
  // отправить письмо: TLV1 кому, TLV3 тема, TLV4 текст
  '11,5'(p, t) {
    const res = this.game.sendMail(this.user, str(t[1]), str(t[3]), str(t[4]));
    if (res.error) return this.send(messageBox(res.error));
    this.send(messageBox('Сообщение отправлено.', 1));
    for (const s of Session.all || []) if (s.user && s.user.id === res.to.id && s.notifyMail) s.notifyMail(this.user.login);
  },
  '11,26'() { this.send(messageBox('Поиск пока не реализован.')); },
  '11,9'() { this.send(messageBox('Альянсы пока не реализованы.')); },
};

module.exports = { Session, ROUTES };
