'use strict';
// «Лавка Короля»: покупки за золото (золото — только с доната).
// • Ускорения стройки: «−1 час» (SPEED_HOUR монет) и «Достроить сейчас» (1 монета за каждые 15 минут, не меньше FINISH_MIN).
// • Сундуки ресурсов: ресурсы в текущий замок — только до вместимости Склада (сверх не кладём, золото за пустое не берём);
//   не больше DAY_LIMIT сундуков в сутки (по Москве), чтобы золото не заменяло игру.
// Каждая покупка — в журнале золота игрока (Казна → История), админ видит её в карточке игрока.
const C = require('./catalog');

const SPEED_HOUR = 5, FINISH_STEP = 15 * 60000, FINISH_MIN = 2, DAY_LIMIT = 5, HOUR = 3600000;
const R4 = { wood: 1, stone: 1, iron: 1, food: 1 };
const CHESTS = {
  chest_s: { name: 'Малый сундук ресурсов', gold: 10, res: { wood: 10000, stone: 10000, iron: 10000, food: 10000 } },
  chest_l: { name: 'Большой сундук ресурсов', gold: 40, res: { wood: 50000, stone: 50000, iron: 50000, food: 50000 } },
  wagon: { name: 'Продовольственный обоз', gold: 15, res: { food: 30000 } },
};
const mskDay = (t) => new Date(t + 3 * HOUR).toISOString().slice(0, 10);
const finishCost = (left) => Math.max(FINISH_MIN, Math.ceil(left / FINISH_STEP));
const qKey = (q) => (q.wall ? 'wall' : `${q.view}:${q.cell}`);

function install(Game) {
  const P = Game.prototype;
  const bought = (u, now) => { const s = u.shopDay; return s && s.day === mskDay(now) ? s.n : 0; };

  P.shopInfo = function shopInfo(u, castle, now = Date.now()) {
    let room = null; // сколько ещё влезет в Склады текущего замка — чтобы не купить сундук «в пустоту»
    if (castle && castle.owner === u.id) { this.tick(castle, now); const cap = this.capacity(castle); room = {}; for (const r of Object.keys(R4)) room[r] = Math.max(0, Math.floor(cap[r] - castle.res[r])); }
    return { room, speedHour: SPEED_HOUR, finishStep: FINISH_STEP / 60000, finishMin: FINISH_MIN, dayLimit: DAY_LIMIT, chestsLeft: DAY_LIMIT - bought(u, now),
      chests: Object.entries(CHESTS).map(([id, c]) => ({ id, name: c.name, gold: c.gold, res: c.res })) };
  };

  // ускорить стройку: key — «view:cell» или «wall»; mode — hour | finish
  P.shopSpeed = function shopSpeed(u, castle, key, mode, now = Date.now()) {
    if (!castle || castle.owner !== u.id) return { error: 'Это не ваш замок.' };
    this.tick(castle, now);
    const q = castle.queue.find((x) => qKey(x) === String(key));
    if (!q) return { error: 'Эта стройка уже закончилась.' };
    const left = q.end - now; if (left <= 0) return { error: 'Эта стройка уже закончилась.' };
    const def = C.BY_ID[q.building], what = `${def ? def.name : 'Стройка'} ${q.level} ур.`;
    let cost, msg;
    if (mode === 'hour') {
      if (left <= HOUR) return { error: 'Осталось меньше часа — «Достроить сейчас» выйдет дешевле.' };
      cost = SPEED_HOUR; msg = `${what}: стройка ускорена на 1 час.`;
    } else if (mode === 'finish') { cost = finishCost(left); msg = `${what}: достроено!`; } else return { error: 'Неизвестное ускорение.' };
    if ((u.gold || 0) < cost) return { error: `Не хватает монет: нужно ${cost}, у вас ${u.gold || 0}.` };
    this.goldChange(u, -cost, mode === 'hour' ? `Лавка: ускорение на 1 час — ${what}` : `Лавка: достроить сейчас — ${what}`);
    q.end = mode === 'hour' ? q.end - HOUR : now;
    this.tick(castle, now); this.store.save();
    return { msg, cost };
  };

  // сундук ресурсов в текущий замок
  P.shopChest = function shopChest(u, castle, id, now = Date.now()) {
    const c = CHESTS[id]; if (!c) return { error: 'Нет такого товара.' };
    if (!castle || castle.owner !== u.id) return { error: 'Это не ваш замок.' };
    if (bought(u, now) >= DAY_LIMIT) return { error: `Сегодня уже куплено ${DAY_LIMIT} сундуков — следующие завтра.` };
    if ((u.gold || 0) < c.gold) return { error: `Не хватает монет: нужно ${c.gold}, у вас ${u.gold || 0}.` };
    this.tick(castle, now);
    const cap = this.capacity(castle), add = {};
    for (const r of Object.keys(R4)) { const n = c.res[r] || 0; add[r] = Math.max(0, Math.min(n, Math.floor(cap[r] - castle.res[r]))); }
    if (!Object.values(add).some((v) => v > 0)) return { error: 'Склады уже полны — ресурсы некуда положить.' };
    this.goldChange(u, -c.gold, `Лавка: ${c.name} → «${castle.name}»`);
    for (const r of Object.keys(add)) castle.res[r] += add[r];
    u.shopDay = { day: mskDay(now), n: bought(u, now) + 1 };
    this.store.save();
    const NM = { wood: 'дерева', stone: 'камня', iron: 'железа', food: 'еды' }, got = Object.entries(add).filter(([, v]) => v > 0).map(([r, v]) => `${v.toLocaleString('ru-RU')} ${NM[r]}`).join(', ');
    const cut = Object.keys(R4).some((r) => (c.res[r] || 0) > add[r]);
    return { msg: `${c.name}: получено ${got}.${cut ? ' Остальное не влезло в Склады.' : ''}`, add };
  };
}

module.exports = { install, CHESTS, SPEED_HOUR, FINISH_MIN, DAY_LIMIT, finishCost };
