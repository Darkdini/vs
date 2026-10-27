'use strict';
// «Лавка Короля»: покупки за золото (золото — только с доната). Окно — как «Магазин» оригинала: плитки разделов.
// • Ресурсы: S…XXXL (1 000…50 000) одного ресурса и пакеты «все четыре» — не больше DAY_LIMIT покупок в сутки (по Москве);
//   ресурсы — сразу в замок до вместимости Складов, остаток — в Кладовую (не пропадает).
// • Сокровища: сундуки 9…1999 монет со случайным набором «от … до …»: ресурсы, руны, артефакты, лояльность, опыт генерала,
//   репутация. Всё в Кладовую; руны — к рунам игрока; артефакт — в Сокровищницу столицы (полна — разбит на осколки в Кладовую).
// • Телепорт: в провинцию на случайное свободное место (MOVE_PROV_GOLD) или на выбранные координаты (MOVE_GOLD) —
//   только на свободное место (game.placeError), когда армии дома и к замку никто не идёт.
// • Ускорения стройки: «−1 час» (SPEED_HOUR монет) и «Достроить сейчас» (FINISH_PER монеты за каждые 15 минут, не меньше FINISH_MIN).
// • Лояльность (праздники Резиденции, royal.js) и своя репутация (social.js) — те же правила, что в своих окнах.
// • Рамки аватара (FRAMES): покупаются навсегда, надеть / снять — бесплатно.
// Пока лавка не открыта для всех (SHOP_OPEN=1 в game.env), ею пользуется только администратор.
// Каждая покупка — в журнале золота игрока (Казна → История), админ видит её в карточке игрока.
const C = require('./catalog');

const SPEED_HOUR = 15, FINISH_STEP = 15 * 60000, FINISH_PER = 3, FINISH_MIN = 6, MOVE_GOLD = 500, MOVE_PROV_GOLD = 250, DAY_LIMIT = 2, HOUR = 3600000;
const RES4 = ['wood', 'stone', 'iron', 'food'];
const RES_NAME = { wood: 'Дерево', stone: 'Камень', iron: 'Железо', food: 'Еда' };
// размеры: [название, сколько ресурса, цена одного ресурса]; пакет — все четыре ресурса по столько же за PACK_GOLD
const RES_SIZES = [['S', 1000, 1], ['M', 5000, 5], ['L', 10000, 9], ['XL', 15000, 13], ['XXL', 30000, 22], ['XXXL', 50000, 35]];
const PACK_GOLD = [3, 13, 24, 35, 65, 110];
// сундуки «Сокровищ»: что внутри — [вид, от, до]. res — каждого ресурса, runes — каждой из трёх рун,
// art0/art1/art2 — артефакты (обычный / редкий / легендарный), royal — лояльность населения, exp — опыт генерала, rep — репутация
// предметы сундука: [вид, от, до] или [вид, от, до, шанс]; uNNN — воины-нежить (army.js UNDEAD) в Кладовую; runes — всего рун, вид случайный
const TREASURES = {
  t1: { name: 'Дубовый сундук', img: 'chest1', gold: 9, items: [['res', 1000, 4000], ['runes', 1, 2], ['royal', 10, 40], ['exp', 20, 60]] },
  t2: { name: 'Кованый сундук', img: 'chest2', gold: 49, items: [['res', 4000, 12000], ['u320', 1, 2], ['runes', 2, 4], ['art0', 1, 1], ['royal', 40, 120], ['exp', 60, 250]] },
  t3: { name: 'Серебряный сундук', img: 'chest3', gold: 99, items: [['res', 8000, 25000], ['u320', 4, 10], ['runes', 3, 6], ['art0', 1, 2], ['royal', 80, 200], ['exp', 150, 500], ['rep', 5, 20]] },
  t4: { name: 'Изумрудный сундук', img: 'chest4', gold: 199, items: [['res', 15000, 40000], ['u320', 6, 16], ['u321', 2, 4], ['runes', 5, 10], ['art0', 1, 2], ['art1', 1, 1], ['royal', 150, 400], ['exp', 300, 1500], ['rep', 20, 60]] },
  t5: { name: 'Сундук Чёрной Короны', img: 'chest5', gold: 499, items: [['res', 35000, 90000], ['u320', 16, 40], ['u321', 4, 10], ['u322', 2, 6], ['runes', 10, 20], ['art0', 1, 3], ['art1', 1, 2], ['art2', 1, 1], ['royal', 400, 1000], ['exp', 1000, 4000], ['rep', 50, 200]] },
  t6: { name: 'Сапфировый сундук Короля', img: 'chest6', gold: 999, items: [['res', 60000, 160000], ['u320', 30, 80], ['u321', 8, 20], ['u322', 6, 16], ['u323', 1, 1, 0.5], ['runes', 20, 40], ['art1', 1, 3], ['art2', 1, 2], ['royal', 800, 2500], ['exp', 3000, 10000], ['rep', 150, 600]] },
  t7: { name: 'Сокровище Дракона', img: 'chest7', gold: 1999, items: [['res', 120000, 300000], ['u320', 60, 160], ['u321', 16, 40], ['u322', 12, 30], ['u323', 2, 3], ['runes', 40, 80], ['art1', 2, 4], ['art2', 1, 3], ['royal', 2000, 6000], ['exp', 8000, 25000], ['rep', 400, 1500]] },
};
const FRAMES = {
  silver: { name: 'Серебряная рамка', gold: 90 },
  gold: { name: 'Золотая рамка', gold: 180 },
  fire: { name: 'Огненная рамка', gold: 300 },
};
const shopOpen = () => process.env.SHOP_OPEN === '1';
const mskDay = (t) => new Date(t + 3 * HOUR).toISOString().slice(0, 10);
const finishCost = (left) => Math.max(FINISH_MIN, Math.ceil(left / FINISH_STEP) * FINISH_PER);
const qKey = (q) => (q.wall ? 'wall' : `${q.view}:${q.cell}`);
const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');
const { plural } = require('./words');
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const G = () => require('./game'), A = () => require('./army'); // позже: game.js подключает лавку при загрузке

function install(Game) {
  const P = Game.prototype;
  const bought = (u, now) => { const s = u.shopDay; return s && s.day === mskDay(now) ? s.n : 0; };
  const noGold = (u, cost) => ((u.gold || 0) < cost ? { error: `Не хватает монет: нужно ${cost}, у вас ${u.gold || 0}.` } : null);

  P.shopAllowed = function shopAllowed(u) { return !!(u && (u.admin || shopOpen())); };
  P.shopInfo = function shopInfo(u, now = Date.now()) {
    const fest = require('./royal').FESTIVALS;
    return { open: shopOpen(), speedHour: SPEED_HOUR, finishStep: FINISH_STEP / 60000, finishPer: FINISH_PER, finishMin: FINISH_MIN,
      moveGold: MOVE_GOLD, moveProvGold: MOVE_PROV_GOLD, dayLimit: DAY_LIMIT, resLeft: Math.max(0, DAY_LIMIT - bought(u, now)),
      sizes: RES_SIZES.map(([k, n, gold], i) => ({ k, n, gold, pack: PACK_GOLD[i] })),
      treasures: Object.entries(TREASURES).map(([id, t]) => ({ id, name: t.name, img: t.img, gold: t.gold, items: t.items })),
      frames: Object.entries(FRAMES).map(([id, f]) => ({ id, name: f.name, gold: f.gold, own: (u.frames || []).includes(id) })), frame: u.frame || '',
      rep: u.reputation ?? 10, repPerGold: require('./social').REP_PER_GOLD, royal: Math.floor(this.royalTick ? this.royalTick(u, now) : u.royal || 0),
      fests: Object.entries(fest).map(([id, f]) => ({ id, name: f.name, desc: f.desc, cost: f.cost || null, gold: f.gold || 0, gain: f.gain,
        readyAt: ((u.festAt || {})[id] || 0) + 86400000 })) };
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
    const no = noGold(u, cost); if (no) return no;
    this.goldChange(u, -cost, mode === 'hour' ? `Лавка: ускорение на 1 час — ${what}` : `Лавка: достроить сейчас — ${what}`);
    q.end = mode === 'hour' ? q.end - HOUR : now;
    this.tick(castle, now); this.store.save();
    return { msg, cost };
  };

  // ресурсы: res — wood | stone | iron | food | pack (все четыре), size — 0…5 (S…XXXL); в замок до вместимости Складов, остаток — в Кладовую
  P.shopRes = function shopRes(u, castle, res, size, now = Date.now()) {
    if (!castle || castle.owner !== u.id) return { error: 'Это не ваш замок.' };
    const i = Number(size), s = Number.isInteger(i) ? RES_SIZES[i] : null, pack = res === 'pack';
    if (!s || (!pack && !RES4.includes(res))) return { error: 'Нет такого товара.' };
    if (bought(u, now) >= DAY_LIMIT) return { error: `Ресурсы — не больше ${DAY_LIMIT} ${plural(DAY_LIMIT, 'покупки', 'покупок', 'покупок')} в сутки. Следующая — завтра.` };
    const cost = pack ? PACK_GOLD[i] : s[2], no = noGold(u, cost); if (no) return no;
    const what = pack ? `пакет ${s[0]}: все ресурсы по ${fmt(s[1])}` : `${RES_NAME[res]} ${s[0]}: ${fmt(s[1])}`;
    this.goldChange(u, -cost, `Лавка: ${what}`);
    this.tick(castle, now);
    const cap = this.capacity(castle), rest = {}; let inCastle = 0, toStash = 0;
    for (const r of pack ? RES4 : [res]) {
      const k = Math.max(0, Math.min(s[1], Math.floor(cap[r] - castle.res[r]))); castle.res[r] += k; inCastle += k;
      if (s[1] > k) { rest[r] = s[1] - k; toStash += s[1] - k; }
    }
    if (toStash) this.stashAdd(u, rest);
    u.shopDay = { day: mskDay(now), n: bought(u, now) + 1 };
    this.store.save();
    return { msg: `Куплено: ${what}. ${toStash ? (inCastle ? `В замок ${fmt(inCastle)}, остальное (${fmt(toStash)}) — в Кладовую.` : 'Склады полны — всё в Кладовую.') : 'Всё в замке.'}`, inCastle, toStash };
  };

  // сундук «Сокровищ»: каждый предмет — случайно от … до …; отчёт со списком находок
  P.shopTreasure = function shopTreasure(u, id) {
    const t = Object.prototype.hasOwnProperty.call(TREASURES, id) ? TREASURES[id] : null; if (!t) return { error: 'Нет такого товара.' };
    const no = noGold(u, t.gold); if (no) return no;
    this.goldChange(u, -t.gold, `Лавка: ${t.name}`);
    const lines = [], stash = {}, Ar = A(), cap = this.castlesOf(u)[0];
    if (cap) this.mil(cap);
    for (const [k, min, max, p] of t.items) {
      if (p && Math.random() >= p) continue; // предмет с шансом — не выпал
      const n = k === 'res' ? Math.round(rnd(min, max) / 100) * 100 : rnd(min, max);
      if (k[0] === 'u') { const id = Number(k.slice(1)); (stash.units = stash.units || {})[id] = (stash.units[id] || 0) + n; lines.push(`${Ar.UNIT[id].name} ×${n} — в Кладовой.`); }
      else if (k === 'res') { for (const r of RES4) stash[r] = (stash[r] || 0) + n; lines.push(`Ресурсы: по ${fmt(n)} каждого — в Кладовой.`); }
      else if (k === 'runes') { // всего n рун, вид каждой случайный — как в Сундуке дня
        const { RUNE_KEYS, RUNE_NAME } = require('./runes'), have = this.runesOf(u), got = {};
        for (let j = 0; j < n; j++) { const rk = RUNE_KEYS[rnd(0, RUNE_KEYS.length - 1)]; have[rk]++; got[rk] = (got[rk] || 0) + 1; }
        lines.push(`Руны (${n}): ${Object.entries(got).map(([rk, m]) => `${RUNE_NAME[rk]} ×${m}`).join(', ')}.`);
      }
      else if (k === 'royal') { stash.royal = n; lines.push(`Лояльность населения +${fmt(n)} — в Кладовой.`); }
      else if (k === 'exp') { stash.exp = n; lines.push(`Опыт генерала +${fmt(n)} — в Кладовой.`); }
      else if (k === 'rep') { this.repAdd(u, n, 'Лавка Короля: сундук «Сокровища»'); lines.push(`Репутация +${fmt(n)}.`); }
      else { // артефакты: в Сокровищницу столицы; полна — разбит на осколки (ресурсы в Кладовую)
        const rarity = Number(k.slice(3));
        for (let j = 0; j < n; j++) {
          const type = Ar.ART_BASIC[rnd(0, Ar.ART_BASIC.length - 1)], name = `${Ar.ART_TYPES[type].name} (${Ar.RARITY[rarity].name})`;
          if (cap && cap.artifacts.length < this.bonus(cap).artStore) { cap.artifacts.push({ id: this.db.nextId++, type, rarity, active: false, found: Date.now() }); lines.push(`Артефакт: ${name} — в Сокровищнице замка «${cap.name}».`); }
          else { const g = Ar.ART_BREAK[rarity]; for (const r of RES4) stash[r] = (stash[r] || 0) + g; lines.push(`Артефакт: ${name} — Сокровищница полна, разбит на осколки: по ${fmt(g)} каждого ресурса в Кладовую.`); }
        }
      }
    }
    this.stashAdd(u, stash);
    this.cache = {}; this.report(u.id, `Сокровища: ${t.name}`, [`Открыт «${t.name}» за ${t.gold} монет. Внутри:`, ...lines], 'shop');
    this.store.save();
    return { msg: `«${t.name}» открыт! Что выпало — ниже и в отчёте.`, lines };
  };

  // переезд: общие проверки и сам перенос
  const moveCheck = (g, u, castle) => {
    if (!castle || castle.owner !== u.id) return 'Это не ваш замок.';
    if ((castle.armies || []).some((a) => a.state !== 'stay')) return 'Дождитесь, пока армии этого замка вернутся домой.';
    if (Object.values(g.db.castles).some((k) => k !== castle && (k.armies || []).some((a) => a.x === castle.x && a.y === castle.y && (a.state === 'go' || a.state === 'wait')))) return 'К замку идёт чужая армия — переезд невозможен, пока она не дойдёт.';
    return null;
  };
  const moveDo = (g, u, castle, x, y, cost, how) => {
    const ox = castle.x, oy = castle.y;
    g.goldChange(u, -cost, `Лавка: переезд «${castle.name}» ${ox}:${oy} → ${x}:${y}${how}`);
    g.moveCastle(castle, x, y);
    for (const k of Object.values(g.db.castles)) for (const a of k.armies || []) if (a.x === ox && a.y === oy) { a.x = x; a.y = y; } // подкрепления, что стоят в замке, — с ним
    g.cache = {}; g.store.save();
    return { msg: `«${castle.name}» переехал на ${x}:${y}.` };
  };
  // переезд замка на координаты (x, y) — только на свободное место
  P.shopMove = function shopMove(u, castle, x, y) {
    const bad0 = moveCheck(this, u, castle); if (bad0 === 'Это не ваш замок.') return { error: bad0 };
    x = Number(x); y = Number(y);
    if (castle.x === x && castle.y === y) return { error: 'Замок уже стоит здесь.' };
    const bad = this.placeError(x, y, castle) || bad0; if (bad) return { error: bad };
    const no = noGold(u, MOVE_GOLD); if (no) return no;
    return moveDo(this, u, castle, x, y, MOVE_GOLD, '');
  };
  // телепорт в провинцию (номер — как видит игрок): случайное свободное место
  P.shopMoveProv = function shopMoveProv(u, castle, no) {
    const bad0 = moveCheck(this, u, castle); if (bad0) return { error: bad0 };
    const { PROV, PROV_N, PROV_EDGE, WORLD, provNo } = G(), k = Math.floor(Number(no));
    let n = 0; if (k >= 1 && k <= PROV_N * PROV_N) for (let i = 1; i <= PROV_N * PROV_N && !n; i++) if (provNo(i) === k) n = i;
    if (!n) return { error: `Нет провинции №${Number.isFinite(k) ? k : '?'} — номера от 1 до ${PROV_N * PROV_N}.` };
    const nm = noGold(u, MOVE_PROV_GOLD); if (nm) return nm;
    const px = (n - 1) % PROV_N, py = Math.floor((n - 1) / PROV_N), x0 = px * PROV + PROV_EDGE, y0 = py * PROV + PROV_EDGE;
    const w = Math.min(PROV - 2 * PROV_EDGE, WORLD - x0), h = Math.min(PROV - 2 * PROV_EDGE, WORLD - y0);
    let spot = null;
    for (let i = 0; i < 400 && !spot && w > 0 && h > 0; i++) { const X = x0 + Math.floor(Math.random() * w), Y = y0 + Math.floor(Math.random() * h); if ((X !== castle.x || Y !== castle.y) && !this.placeError(X, Y, castle)) spot = { x: X, y: Y }; }
    if (!spot) return { error: `В провинции №${k} нет свободного места — выберите другую.` };
    return moveDo(this, u, castle, spot.x, spot.y, MOVE_PROV_GOLD, ` (провинция №${k})`);
  };

  // рамка аватара: купить (навсегда, сразу надевается) / надеть / снять (id = '')
  P.shopFrame = function shopFrame(u, id, use) {
    id = String(id || '');
    if (use) {
      if (id && !(u.frames || []).includes(id)) return { error: 'Эта рамка ещё не куплена.' };
      u.frame = id; this.store.save(); return { msg: id ? `Надета: ${FRAMES[id].name}.` : 'Рамка снята.' };
    }
    const f = Object.prototype.hasOwnProperty.call(FRAMES, id) ? FRAMES[id] : null; if (!f) return { error: 'Нет такой рамки.' };
    if ((u.frames || []).includes(id)) return { error: 'Эта рамка уже ваша — нажмите «Надеть».' };
    const no = noGold(u, f.gold); if (no) return no;
    this.goldChange(u, -f.gold, `Лавка: ${f.name}`);
    (u.frames = u.frames || []).push(id); u.frame = id; this.store.save();
    return { msg: `${f.name} — ваша навсегда и уже надета. Её видят все в профиле, переписке и ЗАГСе.` };
  };
}

module.exports = { install, FRAMES, TREASURES, RES_SIZES, PACK_GOLD, SPEED_HOUR, FINISH_MIN, MOVE_GOLD, MOVE_PROV_GOLD, DAY_LIMIT, finishCost };
