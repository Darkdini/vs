'use strict';
// Задания: обучение (цепочка для новичка), ежедневные (3 в день + сундук) и поход «Тёмные земли» (логова с боссами рядом со столицей).
// Прогресс считается по состоянию замка (уровни зданий, генерал, артефакты) и по счётчикам игрока (stats: trained, wins, npcWins,
// loot, trades, expeds, built, upgrades, research, arts) — от значения на момент, когда задание стало активным.

const C = require('./catalog');
const RES4 = ['wood', 'stone', 'iron', 'food'];
const DAY = 86400000;
const b = (id) => `build/${({ 0: 'castle', 1: 'storage', 2: 'mbases', 3: 'baraks', 4: 'market', 5: 'farm_small', 11: 'smith', 15: 'university', 17: 'expedition', 18: 'art_tower', 39: 'magscool', 44: 'reasury', 6: 'house_small' })[id] || 'build'}.png`;
// награды заданий — только ресурсы и артефакты: золото и премиум покупаются (донат), заданиями не раздаются
const R = (n, gold = 0, extra = {}) => { const { premium, ...rest } = extra; void gold; void premium; return { wood: n, stone: n, iron: n, food: n, ...rest }; };

// ---------- обучение ----------
// need(g, u, c, base) → [есть, нужно]; base — счётчики игрока на момент начала задания
const TUT = [
  { id: 'store', title: 'Закрома королевства', text: 'Склад хранит добычу и урожай. Улучшите Склад до 3 уровня.', icon: b(1), need: (g, u, c) => [g.buildingLevel(c, 1), 3], reward: R(300) },
  { id: 'farm', title: 'Хлеб насущный', text: 'Без еды армия не выйдет в поход. Улучшите любой Огород на Землях до 3 уровня.', icon: b(5), need: (g, u, c) => [g.buildingLevel(c, 5), 3], reward: R(300) },
  { id: 'hut', title: 'Новые подданные', text: 'Хибары дают людей для стройки и войска. Улучшите Хибару до 3 уровня.', icon: b(6), need: (g, u, c) => [g.buildingLevel(c, 6), 3], reward: R(350) },
  { id: 'barracks', title: 'Казарма', text: 'Воинов обучают в Казарме. Постройте её.', icon: b(3), need: (g, u, c) => [g.buildingLevel(c, 3), 1], reward: R(400) },
  { id: 'train', title: 'Первые воины', text: 'Обучите 10 воинов любого рода войск.', icon: 'gfx3d/train/fill.png', unitIcon: true, need: (g, u, c, base) => [g.qstat(u, 'trained', base), 10], reward: R(400, 2) },
  { id: 'raid', title: 'Боевое крещение', text: 'На карте мира рядом с замком стоят лагеря разбойников. Одержите победу над любым лагерем (Набег или Нападение).', icon: 'ground/dikari.png', need: (g, u, c, base) => [g.qstat(u, 'npcWins', base), 1], reward: R(500, 3) },
  { id: 'smith', title: 'Голос наковальни', text: 'Кузнец усиливает атаку и защиту воинов. Постройте Кузнеца.', icon: b(11), need: (g, u, c) => [g.buildingLevel(c, 11), 1], reward: R(500) },
  { id: 'forge', title: 'Острее клинки', text: 'Начните улучшение атаки или защиты любого воина в Кузнице.', icon: b(11), need: (g, u, c, base) => [g.qstat(u, 'upgrades', base), 1], reward: R(600, 2) },
  { id: 'fence', title: 'Каменный пояс', text: 'Забор усиливает защитников и сдерживает врага. Постройте Забор 3 уровня.', icon: 'fence/fence1.png', need: (g, u, c) => [g.buildingLevel(c, 22), 3], reward: R(700) },
  { id: 'market', title: 'Торговый путь', text: 'Постройте Рынок и отправьте торговцев с ресурсами в любой замок (можно другу).', icon: b(4), need: (g, u, c, base) => [g.qstat(u, 'trades', base), 1], reward: R(700, 2) },
  { id: 'univ', title: 'Свет знаний', text: 'Постройте Университет и начните изучать любую науку.', icon: b(15), need: (g, u, c, base) => [g.qstat(u, 'research', base), 1], reward: R(800, 2) },
  { id: 'general', title: 'Полководец', text: 'Генерал ведёт армию и усиливает её. Натренируйте генерала в Военном штабе.', icon: b(2), need: (g, u, c) => [c.general && !c.general.dead ? 1 : 0, 1], reward: R(900, 3) },
  { id: 'expcorp', title: 'Экспедиционный корпус', text: 'Постройте Экспедицию, обучите в ней археологов и отправьте их на поиски.', icon: b(17), need: (g, u, c, base) => [g.qstat(u, 'expeds', base), 1], reward: R(1000, 3) },
  { id: 'relic', title: 'Древняя реликвия', text: 'Найдите в экспедиции артефакт. Чем больше археологов, дальше экспедиция и выше Лагерь археологов — тем выше шанс.', icon: 'smallicon/artefacts/artefakt_dragon.png', need: (g, u, c, base) => [g.qstat(u, 'arts', base), 1], reward: R(1200, 5) },
  { id: 'treasury', title: 'Хранитель сокровищ', text: 'Артефакты хранятся в Сокровищнице. Постройте её до 3 уровня.', icon: b(44), need: (g, u, c) => [g.buildingLevel(c, 44), 3], reward: R(1200) },
  { id: 'arttower', title: 'Сила реликвий', text: 'Постройте Башню артефактов и пробудите в ней артефакт — он будет действовать несколько часов, затем рассыплется.', icon: b(18), need: (g, u, c) => [(c.artifacts || []).some((a) => a.active) ? 1 : 0, 1], reward: R(1500, 5, { art: 1 }) },
  { id: 'darklands', title: 'Тёмные земли зовут', text: 'Разорите первое логово похода «Тёмные земли» (вкладка «Поход»).', icon: 'ground/dikari.png', need: (g, u) => [Math.min(1, (g.qinit(u).camp || 0)), 1], reward: R(2000, 10) },
];

// ---------- ежедневные ----------
// n(c) — сколько нужно (растёт с Ратушей), когда — доступно ли (например, экспедиция только с Экспедицией)
const th = (g, c) => Math.max(1, g.buildingLevel(c, 0));
const DAILY = [
  { id: 'd_train', title: 'Пополнение', text: (n) => `Обучите ${n} воинов.`, icon: b(3), stat: 'trained', n: (g, c) => 10 + 5 * Math.min(10, th(g, c)) },
  { id: 'd_npc', title: 'Гроза разбойников', text: (n) => `Победите в ${n} боях с лагерями.`, icon: 'ground/dikari.png', stat: 'npcWins', n: () => 2 },
  { id: 'd_loot', title: 'Богатая добыча', text: (n) => `Унесите из походов ${n} ресурсов.`, icon: 'res/wood.png', stat: 'loot', n: (g, c) => 1500 * th(g, c) },
  { id: 'd_built', title: 'Стройка века', text: (n) => `Завершите ${n} построек или улучшений.`, icon: b(10), stat: 'built', n: () => 3 },
  { id: 'd_trade', title: 'Караван', text: () => 'Отправьте торговцев с ресурсами.', icon: b(4), stat: 'trades', n: () => 1, ok: (g, c) => g.buildingLevel(c, 4) > 0 },
  { id: 'd_exped', title: 'Раскопки', text: () => 'Отправьте экспедицию в руины.', icon: b(17), stat: 'expeds', n: () => 1, ok: (g, c) => g.buildingLevel(c, 17) > 0 },
  { id: 'd_up', title: 'Мастерство', text: () => 'Начните улучшение в Кузнице или Школе магии.', icon: b(39), stat: 'upgrades', n: () => 1, ok: (g, c) => g.buildingLevel(c, 11) > 0 || g.buildingLevel(c, 39) > 0 },
  { id: 'd_win', title: 'Слава оружия', text: (n) => `Одержите ${n} побед в боях.`, icon: 'gfx3d/rep/swords.png', stat: 'wins', n: () => 3 },
];

// ---------- поход «Тёмные земли»: логова с боссами ----------
// охрана: стеки воинов (как охрана лагерей), последний — босс; логово стоит рядом со столицей, у каждого игрока своё
const S_ = (name, type, hp, atk, mag, def, mdef, n) => ({ key: name, name, type, hp, atk, mag, def, mdef, n });
const CAMP = [
  { title: 'Волчье логово', text: 'Стая волков режет скот у стен. Её ведёт Вожак — матёрый зверь с шрамом через морду.', img: 'quest/lair_wolf.png', boss: 'quest/boss_wolf.png',
    g: [S_('Волк', 'cavalry', 30, 10, 0, 6, 2, 12), S_('Вожак стаи', 'cavalry', 400, 30, 0, 20, 5, 1)], reward: R(1500, 5) },
  { title: 'Разбойничий брод', text: 'Атаман Кривой Нож собрал шайку и берёт мзду с каждого каравана.', img: 'quest/lair_bandit.png', boss: 'quest/boss_bandit.png',
    g: [S_('Разбойник', 'infantry', 45, 14, 0, 12, 3, 30), S_('Лучник', 'infantry', 30, 12, 0, 6, 3, 15), S_('Атаман Кривой Нож', 'infantry', 900, 45, 0, 35, 10, 1)], reward: R(2500, 5) },
  { title: 'Курган мертвецов', text: 'В кургане проснулись мертвецы. Против их колдуна железо почти бессильно — нужна магия.', img: 'quest/lair_barrow.png', boss: 'units/unical/shadow.png',
    g: [S_('Мертвец', 'infantry', 60, 16, 0, 30, 2, 50), S_('Призрак', 'magic', 40, 0, 18, 40, 10, 20), S_('Колдун кургана', 'magic', 1200, 0, 60, 60, 25, 1)], reward: R(4000, 8, { art: 0 }) },
  { title: 'Тролличья топь', text: 'Болотные тролли перекрыли дорогу. Шкура толстая, удар — как таран.', img: 'quest/lair_swamp.png', boss: 'quest/boss_troll.png',
    g: [S_('Тролль', 'infantry', 220, 40, 0, 45, 15, 25), S_('Болотный шаман', 'magic', 35, 0, 14, 5, 20, 20), S_('Король троллей', 'infantry', 4000, 120, 0, 80, 30, 1)], reward: R(6000, 10) },
  { title: 'Крепость отступников', text: 'Орки-отступники засели в старой крепости за частоколом. Без таранов к ним не подступиться.', img: 'quest/lair_orc.png', boss: 'units/orc/hd/tyrant.png',
    g: [S_('Орк-отступник', 'infantry', 100, 30, 0, 35, 8, 120), S_('Наездник на варге', 'cavalry', 90, 40, 0, 25, 8, 60), S_('Вождь Гром-Гар', 'infantry', 8000, 220, 0, 120, 40, 1)], reward: R(9000, 15, { art: 1 }) },
  { title: 'Башня некроманта', text: 'Некромант Мор-Аэль поднимает армию тьмы. Его чары сжигают пехоту целыми рядами.', img: 'quest/lair_necro.png', boss: 'units/orc/hd/warlock.png',
    g: [S_('Скелет', 'infantry', 70, 25, 0, 40, 5, 200), S_('Тёмный маг', 'magic', 50, 0, 35, 10, 45, 80), S_('Некромант Мор-Аэль', 'magic', 10000, 0, 300, 150, 120, 1)], reward: R(14000, 20) },
  { title: 'Логово дракона', text: 'Древний дракон Игнитар проснулся под горой. Его пламя видно из столицы. Это последнее испытание Тёмных земель.', img: 'quest/lair_dragon.png', boss: 'quest/boss_dragon.png',
    g: [S_('Драконид', 'cavalry', 160, 60, 10, 60, 30, 150), S_('Кобольд-жрец', 'magic', 60, 0, 40, 20, 50, 100), S_('Дракон Игнитар', 'cavalry', 30000, 600, 200, 250, 150, 1)], reward: R(25000, 50, { art: 2, premium: 3 }) },
];
const CAMP_GARRISON = (k) => CAMP[k] && { name: `Логово: ${CAMP[k].title}`, garrison: CAMP[k].g.map((x) => ({ ...x })), def: { inf: 0, cav: 0, mag: 0 },
  loot: { wood: 400 * (k + 1), stone: 400 * (k + 1), iron: 300 * (k + 1), food: 500 * (k + 1) }, lair: k };

function install(Game) {
  const P = Game.prototype;
  P.qinit = function qinit(u) {
    if (!u.quests) u.quests = { tut: 0, base: {}, daily: null, camp: 0, campWon: false };
    return u.quests;
  };
  P.qstat = function qstat(u, key, base) { const v = (this.stats(u)[key] || 0); return Math.max(0, v - ((base && base[key]) || 0)); };
  const snap = (g, u) => ({ ...g.stats(u) });

  // ежедневные: новый набор каждые сутки (по Москве), 3 задания из подходящих
  P.qdaily = function qdaily(u, c) {
    const q = this.qinit(u), day = Math.floor((Date.now() + 3 * 3600000) / DAY);
    if (!q.daily || q.daily.day !== day) {
      const pool = DAILY.filter((d) => !d.ok || d.ok(this, c));
      let seed = (u.id * 2654435761 + day * 40503) >>> 0; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
      const pick = []; while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      q.daily = { day, base: snap(this, u), list: pick.map((d) => ({ id: d.id, need: d.n(this, c), claimed: false })), chest: false };
    }
    return q.daily;
  };
  const dailyReward = (g, c) => R(300 + 150 * th(g, c));

  // логово похода: пустая клетка у столицы, своя для каждой главы
  P.lairOf = function lairOf(u) {
    const q = this.qinit(u), k = q.camp; if (k >= CAMP.length) return null;
    const cap = this.castlesOf(u)[0]; if (!cap) return null;
    if (!q.lair || q.lair.k !== k || q.lair.cap !== cap.id) {
      const W = require('./game').WORLD || 1000;
      for (let r = 3 + k; r < 40; r++) {
        let found = null;
        for (let i = 0; i < 16 && !found; i++) {
          const a = (u.id * 0.7 + k * 1.3 + i * Math.PI / 8), x = Math.round(cap.x + Math.cos(a) * r), y = Math.round(cap.y + Math.sin(a) * r);
          if (x < 0 || y < 0 || x >= W || y >= W || this.castleAt(x, y) || this.worldObjects(x, y, 1, 1).length) continue;
          found = { x, y };
        }
        if (found) { q.lair = { k, cap: cap.id, ...found }; break; }
      }
    }
    return q.lair ? { ...q.lair, npc: CAMP_GARRISON(k) } : null;
  };
  // логово по координатам — для похода и боя (только своё)
  P.lairAt = function lairAt(userId, x, y) { const u = this.userById(userId); if (!u) return null; const l = this.lairOf(u); return l && l.x === x && l.y === y && !this.qinit(u).campWon ? l : null; };
  P.lairWon = function lairWon(userId, k) { const u = this.userById(userId); if (!u) return; const q = this.qinit(u); if (q.camp === k) { q.campWon = true; this.event(u.id, `Логово «${CAMP[k].title}» разорено! Заберите награду в Заданиях.`); } };

  const give = (g, u, c, rw, why) => {
    const cap = g.capacity(c), got = [];
    for (const r of RES4) if (rw[r]) { c.res[r] = Math.min(cap[r], c.res[r] + rw[r]); }
    if (rw.art !== undefined) { g.mil(c); const types = Object.keys(require('./army').ART_TYPES); const type = types[Math.floor(Math.random() * types.length)]; c.artifacts.push({ id: g.db.nextId++, type, rarity: rw.art, active: false, found: Date.now() }); got.push('артефакт'); }
    return got;
  };

  // состояние для окна «Задания»
  P.questsState = function questsState(u, c) {
    const q = this.qinit(u);
    if (!q.base || q.baseFor !== q.tut) { q.base = snap(this, u); q.baseFor = q.tut; }
    const t = TUT[q.tut];
    const tut = t ? (() => { const [have, need] = t.need(this, u, c, q.base); return { idx: q.tut, total: TUT.length, id: t.id, title: t.title, text: t.text, icon: t.icon, have: Math.min(have, need), need, done: have >= need, reward: t.reward }; })() : { idx: TUT.length, total: TUT.length, finished: true };
    const d = this.qdaily(u, c);
    const daily = d.list.map((x) => { const def = DAILY.find((y) => y.id === x.id); const have = this.qstat(u, def.stat, d.base); return { id: x.id, title: def.title, text: def.text(x.need), icon: def.icon, have: Math.min(have, x.need), need: x.need, done: have >= x.need, claimed: x.claimed, reward: dailyReward(this, c) }; });
    const lair = this.lairOf(u), k = q.camp;
    const camp = k >= CAMP.length ? { finished: true, total: CAMP.length } : { k, total: CAMP.length, title: CAMP[k].title, text: CAMP[k].text, img: CAMP[k].img, boss: CAMP[k].boss, x: lair && lair.x, y: lair && lair.y, won: !!q.campWon,
      guard: CAMP[k].g.map((s) => ({ name: s.name, n: s.n, hp: s.hp, atk: s.atk, mag: s.mag, def: s.def, mdef: s.mdef, boss: s.n === 1 })), reward: CAMP[k].reward };
    const ready = (tut.done ? 1 : 0) + daily.filter((x) => x.done && !x.claimed).length + (daily.every((x) => x.claimed) && !d.chest ? 1 : 0) + (camp.won ? 1 : 0);
    return { tut, daily, chest: { ready: daily.every((x) => x.claimed) && !d.chest, taken: d.chest }, camp, ready };
  };

  P.questClaim = function questClaim(u, c, kind, id) {
    const q = this.qinit(u), st = this.questsState(u, c);
    if (kind === 'tut') {
      if (!st.tut.done) return { error: 'Задание ещё не выполнено.' };
      const got = give(this, u, c, TUT[q.tut].reward, `Задание «${TUT[q.tut].title}»`);
      q.tut++; q.base = snap(this, u); q.baseFor = q.tut; this.store.save();
      return { ok: true, msg: `Задание «${st.tut.title}» выполнено!${got.length ? ' Получен артефакт!' : ''}` };
    }
    if (kind === 'daily') {
      const x = q.daily.list.find((y) => y.id === id), v = st.daily.find((y) => y.id === id);
      if (!x || !v || !v.done || x.claimed) return { error: 'Награду пока нельзя забрать.' };
      give(this, u, c, v.reward, `Ежедневное задание «${v.title}»`); x.claimed = true; this.store.save();
      return { ok: true, msg: `Задание «${v.title}» выполнено!` };
    }
    if (kind === 'chest') {
      if (!st.chest.ready) return { error: 'Сундук откроется, когда все три задания дня выполнены.' };
      const art = Math.random() < 0.25; q.daily.chest = true;
      give(this, u, c, { ...R(400 + 200 * th(this, c)), ...(art ? { art: 0 } : {}) }, 'Сундук дня'); this.store.save();
      return { ok: true, msg: art ? 'Сундук дня: ресурсы и артефакт!' : 'Сундук дня: ресурсы!' };
    }
    if (kind === 'camp') {
      if (!q.campWon) return { error: 'Сначала разорите логово.' };
      const k = q.camp, got = give(this, u, c, CAMP[k].reward, `Поход «Тёмные земли»: ${CAMP[k].title}`);
      q.camp++; q.campWon = false; q.lair = null; this.store.save();
      return { ok: true, msg: `«${CAMP[k].title}» — награда получена!${got.length ? ' Артефакт в Сокровищнице!' : ''}` };
    }
    return { error: 'Неизвестное задание.' };
  };
}

module.exports = { install, TUT, DAILY, CAMP, CAMP_GARRISON };
