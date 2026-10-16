'use strict';
// «Колесо Фортуны» в общем чате — запускает только администратор (кнопка 🎰 в чате).
// Запуск: призы — золото, опыт генерала, воин-нежить из сундуков Лавки (выбранный или случайный), ресурсы; число ячеек колеса
// (золото, опыт и воин — по одной ячейке, остальные — ресурсы по очереди: дерево, камень, железо, еда) и время записи.
// Запись: «Участвую» — с одного телефона один аккаунт (id устройства), админ и боты не участвуют; колесо закреплено вверху чата.
// Время вышло (или админ нажал «Крутить сейчас») — сервер (crypto) выбирает победителя и ячейку и сразу начисляет приз
// (золото — в Казну, остальное — в Кладовую): обрыв связи или перезапуск сервера его не потеряют. В чат — «Колесо крутится»:
// полосы ников и призов собирает сервер, у всех они одинаковые: лента ников, лента призов, итог (web/wheel.js).
// Победителю — отчёт, когда прокрутка закончится (чтобы не испортить зрелище).
const crypto = require('crypto');
const { plural } = require('./words');

const KEEP = 20;               // сколько колёс помнить (чат помнит лишь последние 30 сообщений)
const STRIP = 40, AT = 34;     // в полосах 40 карточек, выигрыш — под номером 34 (с нуля)
const SPIN_MS = 12500;         // прокрутка у игроков: ники 0–5 с, призы 6,2–11,2 с, итог с 12,2 с (web/wheel.js: WH)
const MINS = [1, 2, 3, 5, 10]; // время записи, мин
const RES4 = ['wood', 'stone', 'iron', 'food'];
const RES_OF = { wood: 'дерева', stone: 'камня', iron: 'железа', food: 'еды' };
const DIRTY = new WeakSet();   // колёса, где прибавились участники, — число разошлётся на ближайшем тике (не на каждое нажатие)
const rnd = (n) => crypto.randomInt(n);
const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const fmt = (n) => Number(n).toLocaleString('ru-RU');

function install(Game) {
  const P = Game.prototype;
  const ARMY = () => require('./army');
  const undead = () => Object.values(ARMY().UNIT).filter((u) => u.undead).map((u) => u.id);
  const list = (g) => (g.db.wheels = g.db.wheels || []);
  const find = (g, id) => list(g).find((w) => w.id === Number(id)) || null;

  P.wheelPrize = function wheelPrize(c) {
    if (c.k === 'gold') return `${fmt(c.n)} ${plural(c.n, 'золото', 'золота', 'золота')}`;
    if (c.k === 'exp') return `${fmt(c.n)} опыта генерала`;
    if (c.k === 'unit') { const u = ARMY().UNIT[c.id]; return `${u ? u.name : 'Воин'} ×${c.n}`; }
    return `${fmt(c.n)} ${RES_OF[c.k] || ''}`.trim();
  };
  P.wheelActive = function wheelActive() { return list(this).find((w) => w.st === 'join' || w.st === 'spin') || null; };

  // запуск: проверка чисел, ячейки вперемешку, сообщение «🎰 Колесо Фортуны» в чат
  P.wheelCreate = function wheelCreate(user, m, now = Date.now()) {
    if (!user.admin) return { error: 'Колесо Фортуны запускает только администратор.' };
    if (this.wheelActive()) return { error: 'Колесо уже запущено — дождитесь итога или отмените его.' };
    const gold = int(m.gold, 0, 1000), exp = int(m.exp, 0, 1000000), res = int(m.res, 0, 1000000), cells = int(m.cells, 4, 20), mins = MINS.includes(Number(m.mins)) ? Number(m.mins) : null;
    if (gold === null) return { error: 'Золото — от 0 до 1000.' };
    if (exp === null) return { error: 'Опыт генерала — от 0 до 1 000 000.' };
    if (res === null) return { error: 'Ресурсы — от 0 до 1 000 000.' };
    if (cells === null) return { error: 'Ячеек — от 4 до 20.' };
    if (mins === null) return { error: 'Время записи — 1, 2, 3, 5 или 10 минут.' };
    const ids = undead(); let unit = 0;
    if (m.unit === 'rand') unit = ids[rnd(ids.length)]; // «случайный» — выбирается при запуске, и в колесе все видят, какой
    else if (Number(m.unit)) { unit = Number(m.unit); if (!ids.includes(unit)) return { error: 'Такого воина в сундуках нет.' }; }
    const rare = [...(gold ? [{ k: 'gold', n: gold }] : []), ...(exp ? [{ k: 'exp', n: exp }] : []), ...(unit ? [{ k: 'unit', id: unit, n: 1 }] : [])];
    const all = [...rare, ...Array.from({ length: res ? cells - rare.length : 0 }, (_, i) => ({ k: RES4[i % 4], n: res }))];
    if (all.length < 2) return { error: 'В колесе нужно хотя бы 2 ячейки — добавьте призы.' };
    for (let i = all.length - 1; i > 0; i--) { const j = rnd(i + 1); [all[i], all[j]] = [all[j], all[i]]; }
    const w = { id: this.db.nextId++, at: now, by: user.login, byId: user.id, st: 'join', until: now + mins * 60000, cells: all, joined: [], devs: {} };
    const r = this.chatPost(user, '🎰 Колесо Фортуны — жмите «Участвую»!', { wheel: w.id, wph: 'join' }, { sys: true });
    if (r.error) return r;
    list(this).push(w); this.db.wheels = list(this).slice(-KEEP);
    this.store.save();
    return { ok: true, w, msg: r.msg };
  };

  // «Участвую»: пока идёт запись; с одного телефона (id устройства) — один аккаунт
  P.wheelJoin = function wheelJoin(user, id, dev, now = Date.now()) {
    const w = find(this, id); if (!w) return { error: 'Розыгрыш не найден.' };
    if (w.st !== 'join' || now >= w.until) return { error: 'Запись на этот розыгрыш закрыта.' };
    if (user.admin) return { error: 'Администратор в розыгрыше не участвует.' };
    if (user.bot) return { error: 'Нет прав.' };
    if (w.joined.includes(user.id)) return { error: 'Вы уже участвуете — ждите розыгрыша.' };
    dev = /^[a-f0-9]{16,40}$/.test(String(dev || '')) ? String(dev) : '';
    if (dev && w.devs[dev] && w.devs[dev] !== user.id) return { error: 'С этого телефона в розыгрыше уже участвует другой аккаунт.' };
    if (w.joined.length >= 10000) return { error: 'Мест больше нет.' };
    if (dev) w.devs[dev] = user.id;
    w.joined.push(user.id); DIRTY.add(w); this.store.save();
    return { ok: true, msg: 'Вы участвуете! Розыгрыш начнётся, когда закончится запись.' };
  };

  // розыгрыш: победитель и ячейка, приз сразу, полосы для прокрутки, сообщение «Колесо Фортуны крутится!»
  P.wheelSpin = function wheelSpin(w, now = Date.now()) {
    const ids = w.joined.filter((id) => { const u = this.userById(id); return u && !u.banned && !u.bot && !u.admin; });
    if (!ids.length) { Object.assign(w, { st: 'cancel', why: 'empty', end: now }); this.store.save(); return [{ view: w.id }]; }
    const win = ids[rnd(ids.length)], cell = rnd(w.cells.length), u = this.userById(win), c = w.cells[cell];
    if (c.k === 'gold') this.goldChange(u, c.n, `Колесо Фортуны: +${c.n}`);
    else if (c.k === 'exp') this.stashAdd(u, { exp: c.n });
    else if (c.k === 'unit') this.stashAdd(u, { units: { [c.id]: c.n } });
    else this.stashAdd(u, { [c.k]: c.n });
    const strip1 = Array.from({ length: STRIP }, (_, i) => (i === AT ? win : ids[rnd(ids.length)]));
    const strip2 = Array.from({ length: STRIP }, (_, i) => (i === AT ? cell : rnd(w.cells.length)));
    Object.assign(w, { st: 'spin', spinAt: now, n: ids.length, win, winLogin: u.login, cell, strip1, strip2, jit1: rnd(61) - 30, jit2: rnd(61) - 30 });
    const r = this.chatPost(this.userById(w.byId) || this.adminUser() || u, '🎰 Колесо Фортуны крутится!', { wheel: w.id, wph: 'spin' }, { sys: true });
    w.msg = r.msg ? r.msg.id : 0;
    (this.db.wheelLog = this.db.wheelLog || []).push({ at: now, id: w.id, by: w.by, n: ids.length, win: u.login, prize: this.wheelPrize(c) });
    if (this.db.wheelLog.length > 200) this.db.wheelLog.splice(0, this.db.wheelLog.length - 200);
    this.store.save();
    return [{ view: w.id }, ...(r.msg ? [{ chat: r.msg }] : [])];
  };

  // раз в секунду (index.js): конец записи — розыгрыш; конец прокрутки — отчёт победителю; новые участники — их число всем
  P.wheelCheck = function wheelCheck(now = Date.now()) {
    const out = [];
    for (const w of list(this)) {
      if (w.st === 'join' && now >= w.until) out.push(...this.wheelSpin(w, now));
      else if (w.st === 'join' && DIRTY.has(w)) { DIRTY.delete(w); out.push({ cnt: w.id, n: w.joined.length }); }
      else if (w.st === 'spin' && now >= w.spinAt + SPIN_MS) {
        const c = w.cells[w.cell], name = this.wheelPrize(c); w.st = 'done';
        const m = (this.db.chat || []).find((x) => x.id === w.msg); if (m) m.text = `🏆 Колесо Фортуны: ${w.winLogin} выигрывает ${name}!`;
        if (this.userById(w.win)) this.report(w.win, `🎰 Колесо Фортуны: ваш выигрыш — ${name}!`, [`Вы победили в розыгрыше «Колесо Фортуны» (участников: ${w.n}).`,
          c.k === 'gold' ? 'Золото уже в Казне.' : 'Приз — в Кладовой: откройте её и заберите в замок.'], 'shop');
        this.store.save(); out.push({ view: w.id });
      }
    }
    return out;
  };

  // команды админа: запуск, «Крутить сейчас», отмена до розыгрыша; out — что разослать всем (web.js: wheelCast)
  P.wheelOp = function wheelOp(user, m, now = Date.now()) {
    if (m.op === 'create') { const r = this.wheelCreate(user, m, now); if (r.error) return r; return { note: 'Колесо Фортуны запущено!', out: [{ view: r.w.id, made: 1 }, { chat: r.msg }] }; }
    if (!user.admin) return { error: 'Нет прав.' };
    const w = find(this, m.id); if (!w) return { error: 'Розыгрыш не найден.' };
    if (m.op === 'spin') { if (w.st !== 'join') return { error: 'Запись уже закрыта.' }; return { out: this.wheelSpin(w, now) }; }
    if (m.op === 'cancel') {
      if (w.st !== 'join') return { error: 'Отменить можно только до розыгрыша.' };
      Object.assign(w, { st: 'cancel', why: 'admin', end: now }); this.store.save();
      return { note: 'Розыгрыш отменён — призов никто не получил.', out: [{ view: w.id }] };
    }
    return { error: 'Неизвестная команда.' };
  };

  // для игрока: до розыгрыша — призы, число участников, «вы участвуете»; после — полосы, победитель, приз
  P.wheelView = function wheelView(id, user) {
    const w = find(this, id); if (!w) return null;
    const cells = w.cells.map((c) => { if (c.k !== 'unit') return c; const u = ARMY().UNIT[c.id] || {}; return { ...c, name: u.name || 'Воин', img: u.img || '' }; });
    const v = { id: w.id, st: w.st, until: w.until, n: w.st === 'spin' || w.st === 'done' ? w.n : w.joined.length, mine: w.joined.includes(user.id), cells, why: w.why || '' };
    if (w.st !== 'spin' && w.st !== 'done') return v;
    const people = {};
    for (const pid of new Set(w.strip1)) { const u = this.userById(pid); people[pid] = u ? { login: u.login, race: u.race, av: u.avatar || 0, fr: u.frame || '' } : { login: '—', race: '', av: 0, fr: '' }; }
    return { ...v, spinAt: w.spinAt, strip1: w.strip1, strip2: w.strip2, jit1: w.jit1, jit2: w.jit2, at: AT, people, win: w.win, cell: w.cell, prize: this.wheelPrize(w.cells[w.cell]) };
  };
  // для окна чата: колёса из сообщений и закреп (идёт запись)
  P.chatWheelViews = function chatWheelViews(user) {
    const act = this.wheelActive(), ids = new Set((this.db.chat || []).filter((m) => m.wheel).map((m) => m.wheel));
    if (act) ids.add(act.id);
    const wheels = {}; for (const id of ids) { const v = this.wheelView(id, user); if (v) wheels[id] = v; }
    return { wheels, wpin: act && act.st === 'join' ? act.id : 0 };
  };
}

module.exports = { install, SPIN_MS, STRIP, AT, MINS };
