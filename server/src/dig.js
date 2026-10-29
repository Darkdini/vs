'use strict';
// «Кладоискатель» (меню «Игры»): поле 5×5 — под каждой клеткой находка или ловушка. Игрок копает клетку за клеткой:
// находки копятся в «добыче», ловушка — игра окончена и вся добыча этой игры сгорает. «Забрать добычу» — в любой момент:
// всё найденное — в Кладовую. Раскопал все клетки без ловушек — добыча забирается сама.
// Бесплатно 3 игры в сутки (с премиумом 5), новые в полночь по Москве; начатая игра ждёт, пока её не закончат.
// На поле 5 ловушек и 1 клад (большой приз); сила призов — по уровню Ратуши столицы, как в «Сундучках». Золото не выпадает.
// Всё решает сервер: что под закрытыми клетками, клиент не знает. Каждая игра — очко в Зал Славы «Азарт»; клад объявляется в чате.

const MSK = 3 * 3600000;
const dayKey = (t) => new Date(t + MSK).toISOString().slice(0, 10);
const SIZE = 5, CELLS = SIZE * SIZE, TRAPS = 5, TRIES = 3, TRIES_PREM = 5;
const RES4 = ['wood', 'stone', 'iron', 'food'];
const RES_NAME = { wood: 'Дерево', stone: 'Камень', iron: 'Железо', food: 'Еда' };
// что лежит под безопасными клетками (кроме клада): 19 = 10 ресурсов одного вида + 4 «все ресурсы» + 4 опыта генерала + 1 руна
const KINDS = [...Array(10).fill('res'), ...Array(4).fill('all'), ...Array(4).fill('exp'), 'rune'];
const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');

function install(Game) {
  const P = Game.prototype;
  const A = () => require('./army');
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const st = (u, now = Date.now()) => {
    const d = dayKey(now);
    if (!u.dig || typeof u.dig !== 'object') u.dig = { day: d, used: 0, game: null };
    if (u.dig.day !== d) { u.dig.day = d; u.dig.used = 0; }
    return u.dig;
  };
  // сила призов — по уровню Ратуши столицы (1…20+), как в «Сундучках»
  const power = (g, u) => { const c = g.castlesOf(u)[0]; return Math.max(1, c ? g.buildingLevel(c, A().B.TOWNHALL) : 1); };
  // находка: { kind, text, rw (для stashAdd), runes }
  const prize = (kind, L) => {
    const base = 200 + L * 90;
    if (kind === 'klad') { const n = base * 2; return { kind, text: `Клад! Все ресурсы по ${fmt(n)} и 2 руны`, rw: Object.fromEntries(RES4.map((r) => [r, n])), runes: 2 }; }
    if (kind === 'all') { const n = Math.round(base * 0.5); return { kind, text: `Все ресурсы по ${fmt(n)}`, rw: Object.fromEntries(RES4.map((r) => [r, n])) }; }
    if (kind === 'exp') { const n = 20 + L * 6; return { kind, text: `Опыт генерала +${fmt(n)}`, rw: { exp: n } }; }
    if (kind === 'rune') return { kind, text: 'Руна', runes: 1 };
    const r = RES4[rnd(0, 3)], n = Math.round(base * (0.6 + Math.random() * 1.4) / 10) * 10;
    return { kind, res: r, text: `${RES_NAME[r]} +${fmt(n)}`, rw: { [r]: n } };
  };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // для клиента: открытые клетки (после конца игры — все), добыча, итог
  const view = (g, u, now = Date.now()) => {
    const s = st(u, now), max = g.isPremium(u) ? TRIES_PREM : TRIES, gm = s.game;
    const out = { size: SIZE, traps: TRAPS, left: Math.max(0, max - s.used), max, nextAt: Date.parse(`${s.day}T00:00:00Z`) - MSK + 86400000, game: null };
    if (gm) {
      const show = (i) => gm.open[i] || gm.over;
      out.game = { over: !!gm.over, lost: !!gm.lost, taken: !!gm.taken, boom: gm.boom ?? -1, dug: gm.open.filter(Boolean).length,
        cells: gm.cells.map((c, i) => (show(i) ? { open: !!gm.open[i], kind: c.kind, res: c.res || null, text: c.text } : null)),
        bag: gm.bag.map((i) => gm.cells[i].text) };
    }
    return out;
  };
  P.digState = function digState(u, now = Date.now()) { return view(this, u, now); };
  // новая игра — одна попытка; начатая и не законченная ждёт
  P.digStart = function digStart(u, now = Date.now()) {
    const s = st(u, now), max = this.isPremium(u) ? TRIES_PREM : TRIES;
    if (s.game && !s.game.over) return { error: 'Игра уже идёт — копайте или заберите добычу.' };
    if (s.used >= max) return { error: `Игры на сегодня закончились — новые в полночь${this.isPremium(u) ? '' : ' (с премиумом — 5 в день)'}.` };
    const L = power(this, u), kinds = shuffle(['klad', ...Array(TRAPS).fill('trap'), ...KINDS]);
    s.used++;
    s.game = { at: now, open: Array(CELLS).fill(false), bag: [], over: false, cells: kinds.map((k) => (k === 'trap' ? { kind: 'trap', text: 'Ловушка!' } : prize(k, L))) };
    this.addStat(u.id, 'gamble', 1); // Зал Славы «Азарт»
    this.store.save();
    return { ok: true, state: view(this, u, now) };
  };
  // добыча — в Кладовую (руны — в мешочек рун); клад — объявление в чате
  const take = (g, u, gm) => {
    const rw = {}; let runes = 0, klad = false;
    for (const i of gm.bag) {
      const c = gm.cells[i];
      for (const [k, v] of Object.entries(c.rw || {})) rw[k] = (rw[k] || 0) + v;
      runes += c.runes || 0; if (c.kind === 'klad') klad = true;
    }
    if (Object.keys(rw).length) g.stashAdd(u, rw);
    if (runes) { const { RUNE_KEYS } = require('./runes'), have = g.runesOf(u); for (let j = 0; j < runes; j++) { const k = RUNE_KEYS[rnd(0, RUNE_KEYS.length - 1)]; have[k] = (have[k] || 0) + 1; } }
    gm.over = true; gm.taken = true;
    let chat = null;
    if (klad) {
      g.db.chat = g.db.chat || [];
      g.db.chat.push({ id: g.db.nextId++, from: '🗝 Кладоискатель', fromId: 0, text: `${u.login} нашёл(ла) клад в «Кладоискателе»!`, at: Date.now(), rep: 0, role: 'sys', color: '' });
      const keep = require('./social').CHAT_KEEP; if (g.db.chat.length > keep) g.db.chat.splice(0, g.db.chat.length - keep);
      chat = g.db.chat[g.db.chat.length - 1];
    }
    return chat;
  };
  // копнуть клетку: находка — в добычу; ловушка — игра окончена, добыча сгорает; все безопасные раскопаны — добыча забирается сама
  P.digCell = function digCell(u, cell, now = Date.now()) {
    const s = st(u, now), gm = s.game, i = Math.floor(Number(cell));
    if (!gm || gm.over) return { error: 'Начните новую игру.' };
    if (!(i >= 0 && i < CELLS)) return { error: 'Нет такой клетки.' };
    if (gm.open[i]) return { error: 'Здесь уже копали.' };
    gm.open[i] = true;
    const c = gm.cells[i]; let msg, chat = null;
    if (c.kind === 'trap') { gm.over = true; gm.lost = true; gm.boom = i; msg = gm.bag.length ? `Ловушка! Добыча этой игры сгорела (${gm.bag.length} ${require('./words').plural(gm.bag.length, 'находка', 'находки', 'находок')}).` : 'Ловушка! Игра окончена.'; }
    else {
      gm.bag.push(i); msg = c.text;
      if (gm.open.filter(Boolean).length >= CELLS - TRAPS) { chat = take(this, u, gm); msg = `${c.text}. Раскопано всё поле — вся добыча в Кладовой!`; }
    }
    this.store.save();
    return { ok: true, msg, kind: c.kind, note: c.kind === 'trap' || c.kind === 'klad' || !!gm.taken, chat, state: view(this, u, now) }; // note — показать всплывающим сообщением
  };
  P.digTake = function digTake(u, now = Date.now()) {
    const s = st(u, now), gm = s.game;
    if (!gm || gm.over) return { error: 'Начните новую игру.' };
    if (!gm.bag.length) return { error: 'Добычи пока нет — копайте!' };
    const n = gm.bag.length, chat = take(this, u, gm); this.store.save();
    return { ok: true, msg: `Добыча — в Кладовой: ${n} ${require('./words').plural(n, 'находка', 'находки', 'находок')}.`, note: true, chat, state: view(this, u, now) };
  };
}

module.exports = { install, SIZE, TRAPS, TRIES, TRIES_PREM };
