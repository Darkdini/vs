'use strict';
// «Лавка Короля»: покупки за золото (золото — только с доната).
// • Ускорения стройки: «−1 час» (SPEED_HOUR монет) и «Достроить сейчас» (1 монета за каждые 15 минут, не меньше FINISH_MIN).
// • Сундуки ресурсов: ресурсы падают в Кладовую (одна на все замки), игрок забирает их в нужный замок сам;
//   не больше DAY_LIMIT сундуков в сутки (по Москве), чтобы золото не заменяло игру.
// • Рамки аватара (FRAMES): покупаются навсегда, надеть / снять — бесплатно.
// Пока лавка не открыта для всех (SHOP_OPEN=1 в game.env), ею пользуется только администратор.
// Каждая покупка — в журнале золота игрока (Казна → История), админ видит её в карточке игрока.
const C = require('./catalog');

const SPEED_HOUR = 5, FINISH_STEP = 15 * 60000, FINISH_MIN = 2, DAY_LIMIT = 5, HOUR = 3600000;
const CHESTS = {
  chest_s: { name: 'Малый сундук ресурсов', gold: 10, res: { wood: 10000, stone: 10000, iron: 10000, food: 10000 } },
  chest_l: { name: 'Большой сундук ресурсов', gold: 40, res: { wood: 50000, stone: 50000, iron: 50000, food: 50000 } },
  wagon: { name: 'Продовольственный обоз', gold: 15, res: { food: 30000 } },
};
const FRAMES = {
  silver: { name: 'Серебряная рамка', gold: 30 },
  gold: { name: 'Золотая рамка', gold: 60 },
  fire: { name: 'Огненная рамка', gold: 100 },
};
const shopOpen = () => process.env.SHOP_OPEN === '1';
const mskDay = (t) => new Date(t + 3 * HOUR).toISOString().slice(0, 10);
const finishCost = (left) => Math.max(FINISH_MIN, Math.ceil(left / FINISH_STEP));
const qKey = (q) => (q.wall ? 'wall' : `${q.view}:${q.cell}`);

function install(Game) {
  const P = Game.prototype;
  const bought = (u, now) => { const s = u.shopDay; return s && s.day === mskDay(now) ? s.n : 0; };

  P.shopAllowed = function shopAllowed(u) { return !!(u && (u.admin || shopOpen())); };
  P.shopInfo = function shopInfo(u, now = Date.now()) {
    return { open: shopOpen(), speedHour: SPEED_HOUR, finishStep: FINISH_STEP / 60000, finishMin: FINISH_MIN, dayLimit: DAY_LIMIT, chestsLeft: DAY_LIMIT - bought(u, now),
      chests: Object.entries(CHESTS).map(([id, c]) => ({ id, name: c.name, gold: c.gold, res: c.res })),
      frames: Object.entries(FRAMES).map(([id, f]) => ({ id, name: f.name, gold: f.gold, own: (u.frames || []).includes(id) })), frame: u.frame || '' };
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

  // сундук ресурсов — в Кладовую
  P.shopChest = function shopChest(u, id, now = Date.now()) {
    const c = CHESTS[id]; if (!c) return { error: 'Нет такого товара.' };
    if (bought(u, now) >= DAY_LIMIT) return { error: `Сегодня уже куплено ${DAY_LIMIT} сундуков — следующие завтра.` };
    if ((u.gold || 0) < c.gold) return { error: `Не хватает монет: нужно ${c.gold}, у вас ${u.gold || 0}.` };
    this.goldChange(u, -c.gold, `Лавка: ${c.name} → Кладовая`);
    this.stashAdd(u, c.res);
    u.shopDay = { day: mskDay(now), n: bought(u, now) + 1 };
    this.store.save();
    return { msg: `${c.name} — в Кладовой! Заберите ресурсы в нужный замок: кнопка «Кладовая».`, stash: true };
  };

  // рамка аватара: купить (навсегда, сразу надевается) / надеть / снять (id = '')
  P.shopFrame = function shopFrame(u, id, use) {
    id = String(id || '');
    if (use) {
      if (id && !(u.frames || []).includes(id)) return { error: 'Эта рамка ещё не куплена.' };
      u.frame = id; this.store.save(); return { msg: id ? `Надета: ${FRAMES[id].name}.` : 'Рамка снята.' };
    }
    const f = FRAMES[id]; if (!f) return { error: 'Нет такой рамки.' };
    if ((u.frames || []).includes(id)) return { error: 'Эта рамка уже ваша — нажмите «Надеть».' };
    if ((u.gold || 0) < f.gold) return { error: `Не хватает монет: нужно ${f.gold}, у вас ${u.gold || 0}.` };
    this.goldChange(u, -f.gold, `Лавка: ${f.name}`);
    (u.frames = u.frames || []).push(id); u.frame = id; this.store.save();
    return { msg: `${f.name} — ваша навсегда и уже надета. Её видят все в профиле, переписке и ЗАГСе.` };
  };
}

module.exports = { install, FRAMES, CHESTS, SPEED_HOUR, FINISH_MIN, DAY_LIMIT, finishCost };
