'use strict';
// Задания: обучение (цепочка для новичка), ежедневные (3 в день + сундук) и поход «Тёмные земли» (логова с боссами рядом со столицей).
// Прогресс считается по состоянию замка (уровни зданий, генерал, артефакты) и по счётчикам игрока (stats: trained, wins, npcWins,
// loot, trades, expeds, built, upgrades, research, arts) — от значения на момент, когда задание стало активным.

const C = require('./catalog');
const RES4 = ['wood', 'stone', 'iron', 'food'];
const DAY = 86400000;
const b = (id) => `build/${({ 0: 'castle', 1: 'storage', 2: 'mbases', 3: 'baraks', 4: 'market', 5: 'farm_small', 11: 'smith', 15: 'university', 17: 'expedition', 18: 'art_tower', 39: 'magscool', 44: 'reasury', 6: 'house_small' })[id] || 'build'}.png`;
// награды заданий — ресурсы, уникальные воины расы (u: { inf, cav, mag }), опыт генерала (exp) и артефакты.
// Всё, кроме артефактов, падает в Кладовую игрока (stash.js) — общую на все замки. Золото и премиум — только донат, заданиями не раздаются.
const R = (n, extra = {}) => ({ wood: n, stone: n, iron: n, food: n, ...extra });

// ---------- обучение ----------
// need(g, u, c, base) → [есть, нужно]; base — счётчики игрока на момент начала задания
const TUT = [
  { id: 'store', title: 'Закрома королевства', text: 'Склад хранит добычу и урожай. Улучшите Склад до 3 уровня.', icon: b(1), need: (g, u, c) => [g.buildingLevel(c, 1), 3], reward: R(300) },
  { id: 'farm', title: 'Хлеб насущный', text: 'Без еды армия не выйдет в поход. Улучшите любой Огород на Землях до 3 уровня.', icon: b(5), need: (g, u, c) => [g.buildingLevel(c, 5), 3], reward: R(300) },
  { id: 'hut', title: 'Новые подданные', text: 'Хибары дают людей для стройки и войска. Улучшите Хибару до 3 уровня.', icon: b(6), need: (g, u, c) => [g.buildingLevel(c, 6), 3], reward: R(350) },
  { id: 'barracks', title: 'Казарма', text: 'Воинов обучают в Казарме. Постройте её.', icon: b(3), need: (g, u, c) => [g.buildingLevel(c, 3), 1], reward: R(400) },
  { id: 'train', title: 'Первые воины', text: 'Обучите 10 воинов любого рода войск.', icon: 'gfx3d/train/fill.png', unitIcon: true, need: (g, u, c, base) => [g.qstat(u, 'trained', base), 10], reward: R(400, { u: { inf: 5 } }) },
  { id: 'raid', title: 'Боевое крещение', text: 'На карте мира рядом с замком стоят лагеря разбойников. Одержите победу над любым лагерем (Набег или Нападение).', icon: 'ground/dikari.png', need: (g, u, c, base) => [g.qstat(u, 'npcWins', base), 1], reward: R(500, { u: { inf: 5 }, exp: 30 }) },
  { id: 'smith', title: 'Голос наковальни', text: 'Кузнец усиливает атаку и защиту воинов. Постройте Кузнеца.', icon: b(11), need: (g, u, c) => [g.buildingLevel(c, 11), 1], reward: R(500) },
  { id: 'forge', title: 'Острее клинки', text: 'Начните улучшение атаки или защиты любого воина в Кузнице.', icon: b(11), need: (g, u, c, base) => [g.qstat(u, 'upgrades', base), 1], reward: R(600, { u: { cav: 3 } }) },
  { id: 'fence', title: 'Каменный пояс', text: 'Стена усиливает защитников и сдерживает врага. Откройте Ратушу → «Стена» и развейте её до 3 уровня.', icon: 'fence/fence1.png', need: (g, u, c) => [g.buildingLevel(c, 22), 3], reward: R(700) },
  { id: 'market', title: 'Торговый путь', text: 'Постройте Рынок и отправьте торговцев с ресурсами в любой замок (можно другу).', icon: b(4), need: (g, u, c, base) => [g.qstat(u, 'trades', base), 1], reward: R(700, { exp: 50 }) },
  { id: 'univ', title: 'Свет знаний', text: 'Постройте Университет и начните изучать любую науку.', icon: b(15), need: (g, u, c, base) => [g.qstat(u, 'research', base), 1], reward: R(800, { u: { mag: 3 } }) },
  { id: 'general', title: 'Полководец', text: 'Генерал ведёт армию и усиливает её. Натренируйте генерала в Военном штабе.', icon: b(2), need: (g, u, c) => [c.general && !c.general.dead ? 1 : 0, 1], reward: R(900, { exp: 100 }) },
  { id: 'expcorp', title: 'Экспедиционный корпус', text: 'Постройте Экспедицию, обучите в ней археологов и отправьте их на поиски.', icon: b(17), need: (g, u, c, base) => [g.qstat(u, 'expeds', base), 1], reward: R(1000, { u: { cav: 5 } }) },
  { id: 'relic', title: 'Древняя реликвия', text: 'Найдите в экспедиции артефакт. Чем больше археологов, дальше экспедиция и выше Лагерь археологов — тем выше шанс.', icon: 'smallicon/artefacts/artefakt_dragon.png', need: (g, u, c, base) => [g.qstat(u, 'arts', base), 1], reward: R(1200, { u: { mag: 5 }, exp: 100 }) },
  { id: 'treasury', title: 'Хранитель сокровищ', text: 'Артефакты хранятся в Сокровищнице. Постройте её до 3 уровня.', icon: b(44), need: (g, u, c) => [g.buildingLevel(c, 44), 3], reward: R(1200) },
  { id: 'arttower', title: 'Сила реликвий', text: 'Постройте Башню артефактов и пробудите в ней артефакт — он будет действовать несколько часов, затем рассыплется.', icon: b(18), need: (g, u, c) => [(c.artifacts || []).some((a) => a.active) ? 1 : 0, 1], reward: R(1500, { art: 1, exp: 150 }) },
  { id: 'darklands', title: 'Тёмные земли зовут', text: 'Разорите первое логово похода «Тёмные земли» (вкладка «Поход»).', icon: 'ground/dikari.png', need: (g, u) => [Math.min(1, (g.qinit(u).camp || 0)), 1], reward: R(2000, { u: { inf: 10, cav: 5 }, exp: 200 }) },
  // продолжение обучения (добавлено позже — в конце, чтобы не сбить прогресс тех, кто уже проходит цепочку)
  { id: 'stash', title: 'Королевская кладовая', text: 'Награды заданий ждут в Кладовой (сундук справа вверху). Заберите из неё что-нибудь в замок.', icon: 'stash/btn.png', need: (g, u, c, base) => [g.qstat(u, 'stashTake', base), 1], reward: R(1000, { u: { cav: 5 } }) },
  { id: 'genpts', title: 'Опыт полководца', text: 'Откройте Военный штаб → Генерал и распределите очки опыта: атака, защита, командование.', icon: b(2), need: (g, u, c) => [c.general && !c.general.dead && Object.values(c.general.pts || {}).some((v) => v > 0) ? 1 : 0, 1], reward: R(1200, { exp: 150 }) },
  { id: 'talent', title: 'Путь героя', text: 'Изучите у генерала первое умение (Генерал → Умения): Завоеватель, Страж или Мародёр.', icon: 'hero/icon_point.png', need: (g, u, c) => [c.general && !c.general.dead && Object.values(c.general.tal || {}).some((v) => v > 0) ? 1 : 0, 1], reward: R(1300, { u: { mag: 5 } }) },
  { id: 'gear', title: 'Доспехи полководца', text: 'Наденьте на генерала любую вещь (Генерал → Снаряжение). Снаряжение добывается в логовах похода и в лагерях.', icon: 'hero/gear_helm_1.png', need: (g, u, c) => [c.general && !c.general.dead && Object.values(c.general.eq || {}).some(Boolean) ? 1 : 0, 1], reward: R(1500, { exp: 250 }) },
  { id: 'temple', title: 'Вера предков', text: 'Постройте Храм и примите религию: Свет, Природа или Война.', icon: 'build/temple.png', need: (g, u, c) => [c.religion ? 1 : 0, 1], reward: R(1800, { u: { inf: 10 } }) },
  { id: 'kills', title: 'Гроза врагов', text: 'Уничтожьте в боях 300 вражеских воинов (лагеря, логова и чужие замки — всё считается).', icon: 'gfx3d/rep/swords.png', need: (g, u, c, base) => [g.qstat(u, 'kills', base), 300], reward: R(2500, { u: { inf: 10, cav: 10, mag: 5 }, exp: 400 }) },
];

// ---------- советник-строитель: первые шаги с щедрыми наградами ----------
// Полоска «Задание: … [Выполнить]» над чатом (как в оригинале). Простые строительные задания; ресурсы — сразу в замок
// (что не влезло в Склад — в Кладовую, не пропадает). Цель — новичок не упирается в нехватку ресурсов в первые дни.
const A_ = (id, title, bid, lvl, res, extra = {}) => ({ id, title, bid, lvl, reward: R(res, extra) });
const ADV = [
  A_('a_th2', 'Улучшите Ратушу до 2 уровня', 0, 2, 500), A_('a_st2', 'Улучшите Склад до 2 уровня', 1, 2, 500),
  A_('a_wd2', 'Улучшите Дровосека до 2 уровня', 7, 2, 500), A_('a_sn2', 'Улучшите Каменьщика до 2 уровня', 8, 2, 500),
  A_('a_ir2', 'Улучшите Рудник до 2 уровня', 9, 2, 500), A_('a_fd2', 'Улучшите Огород до 2 уровня', 5, 2, 500),
  A_('a_ht2', 'Улучшите Хибару до 2 уровня', 6, 2, 600), A_('a_th3', 'Улучшите Ратушу до 3 уровня', 0, 3, 800),
  A_('a_st3', 'Улучшите Склад до 3 уровня', 1, 3, 800), A_('a_wd3', 'Улучшите Дровосека до 3 уровня', 7, 3, 800),
  A_('a_sn3', 'Улучшите Каменьщика до 3 уровня', 8, 3, 800), A_('a_ir3', 'Улучшите Рудник до 3 уровня', 9, 3, 800),
  A_('a_fd3', 'Улучшите Огород до 3 уровня', 5, 3, 800), A_('a_br1', 'Постройте Казарму', 3, 1, 1000, { u: { inf: 10 } }),
  A_('a_th4', 'Улучшите Ратушу до 4 уровня', 0, 4, 1200), A_('a_st4', 'Улучшите Склад до 4 уровня', 1, 4, 1200),
  A_('a_ht4', 'Улучшите Хибару до 4 уровня', 6, 4, 1200), A_('a_wd4', 'Улучшите Дровосека до 4 уровня', 7, 4, 1500),
  A_('a_sn4', 'Улучшите Каменьщика до 4 уровня', 8, 4, 1500), A_('a_ir4', 'Улучшите Рудник до 4 уровня', 9, 4, 1500),
  A_('a_th5', 'Улучшите Ратушу до 5 уровня', 0, 5, 2000), A_('a_st5', 'Улучшите Склад до 5 уровня', 1, 5, 2000),
  A_('a_th6', 'Улучшите Ратушу до 6 уровня', 0, 6, 3000, { u: { inf: 10, cav: 10, mag: 5 } }),
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
  { id: 'd_kills', title: 'Жатва битвы', text: (n) => `Уничтожьте в боях ${n} вражеских воинов.`, icon: 'gfx3d/rep/swords.png', stat: 'kills', n: (g, c) => 30 + 10 * Math.min(10, th(g, c)) },
  { id: 'd_online', title: 'Дозор', text: (n) => `Проведите в игре ${n} минут.`, icon: 'quest/scroll.png', stat: 'presence', n: () => 20 },
  { id: 'd_boss', title: 'Удар по чудовищу', text: () => 'Атакуйте мирового босса.', icon: 'boss/m_dragon.png', stat: 'bossDmg', n: () => 1, ok: (g) => !!g.bossNow() },
];

// ---------- еженедельные ----------
const WEEKLY = [
  { id: 'w_train', title: 'Набор в войско', text: (n) => `Обучите за неделю ${n} воинов.`, icon: b(3), stat: 'trained', n: (g, c) => 150 + 50 * Math.min(10, th(g, c)) },
  { id: 'w_npc', title: 'Очистка дорог', text: (n) => `Победите в ${n} боях с лагерями.`, icon: 'ground/dikari.png', stat: 'npcWins', n: () => 15 },
  { id: 'w_loot', title: 'Казна полна', text: (n) => `Унесите из походов ${n} ресурсов.`, icon: 'res/wood.png', stat: 'loot', n: (g, c) => 10000 * th(g, c) },
  { id: 'w_built', title: 'Великая стройка', text: (n) => `Завершите ${n} построек или улучшений.`, icon: b(10), stat: 'built', n: () => 15 },
  { id: 'w_kills', title: 'Гроза королевств', text: (n) => `Уничтожьте в боях ${n} вражеских воинов.`, icon: 'gfx3d/rep/swords.png', stat: 'kills', n: (g, c) => 300 + 60 * Math.min(10, th(g, c)) },
  { id: 'w_wins', title: 'Полководец недели', text: (n) => `Одержите ${n} побед в боях.`, icon: 'gfx3d/rep/swords.png', stat: 'wins', n: () => 20 },
  { id: 'w_exped', title: 'Охотник за древностями', text: (n) => `Отправьте ${n} экспедиций.`, icon: b(17), stat: 'expeds', n: () => 5, ok: (g, c) => g.buildingLevel(c, 17) > 0 },
  { id: 'w_up', title: 'Мастерская', text: (n) => `Начните ${n} улучшений в Кузнице или Школе магии.`, icon: b(11), stat: 'upgrades', n: () => 5, ok: (g, c) => g.buildingLevel(c, 11) > 0 || g.buildingLevel(c, 39) > 0 },
  { id: 'w_online', title: 'Верный правитель', text: (n) => `Проведите в игре ${n} минут за неделю.`, icon: 'quest/scroll.png', stat: 'presence', n: () => 180 },
];

// ---------- календарь входа: 28 дней ----------
// t — уровень Ратуши (награды растут вместе с замком); gear — редкость вещи генерала (0 обычная, 1 редкая, 2 эпическая)
const CAL = Array.from({ length: 28 }, (_, i) => (t) => {
  const d = i + 1, wk = Math.ceil(d / 7);
  if (d === 28) return { big: 3, rw: R(8000 + 2000 * t, { art: 2, u: { inf: 20, cav: 20, mag: 15 }, exp: 600 * t, gear: 2 }) };
  if (d % 7 === 0) return { big: wk === 2 ? 2 : 1, rw: wk === 2 ? R(3000 + 800 * t, { u: { inf: 10, cav: 10, mag: 5 }, exp: 300 * t, gear: 1 }) : R(3000 + 800 * t, { art: wk === 3 ? 1 : 0, u: { inf: 10, cav: 8, mag: 5 }, exp: 200 * t }) };
  const kind = d % 3, k = 1 + (wk - 1) * 0.25;
  if (kind === 1) return { rw: R(Math.round((600 + 250 * t) * k)) };
  if (kind === 2) return { rw: { exp: Math.round(60 * t * k), u: { [['inf', 'cav', 'mag'][Math.floor(d / 3) % 3]]: Math.round((3 + t / 2) * k) } } };
  return { rw: R(Math.round((400 + 150 * t) * k), { exp: Math.round(40 * t * k) }) };
});

// ---------- поход «Тёмные земли»: логова с боссами ----------
// охрана: стеки воинов (как охрана лагерей), последний — босс; логово стоит рядом со столицей, у каждого игрока своё
const S_ = (name, type, hp, atk, mag, def, mdef, n) => ({ key: name, name, type, hp, atk, mag, def, mdef, n });
const CAMP = [
  { title: 'Волчье логово', text: 'Стая волков режет скот у стен. Её ведёт Вожак — матёрый зверь с шрамом через морду.', img: 'quest/lair_wolf.png', boss: 'quest/boss_wolf.png',
    g: [S_('Волк', 'cavalry', 30, 10, 0, 6, 2, 12), S_('Вожак стаи', 'cavalry', 400, 30, 0, 20, 5, 1)], reward: R(1500, { u: { inf: 10 }, exp: 150 }) },
  { title: 'Разбойничий брод', text: 'Атаман Кривой Нож собрал шайку и берёт мзду с каждого каравана.', img: 'quest/lair_bandit.png', boss: 'quest/boss_bandit.png',
    g: [S_('Разбойник', 'infantry', 45, 14, 0, 12, 3, 30), S_('Лучник', 'infantry', 30, 12, 0, 6, 3, 15), S_('Атаман Кривой Нож', 'infantry', 900, 45, 0, 35, 10, 1)], reward: R(2500, { u: { inf: 15, cav: 5 }, exp: 250 }) },
  { title: 'Курган мертвецов', text: 'В кургане проснулись мертвецы. Против их колдуна железо почти бессильно — нужна магия.', img: 'quest/lair_barrow.png', boss: 'units/unical/shadow.png',
    g: [S_('Мертвец', 'infantry', 60, 16, 0, 30, 2, 50), S_('Призрак', 'magic', 40, 0, 18, 40, 10, 20), S_('Колдун кургана', 'magic', 1200, 0, 60, 60, 25, 1)], reward: R(4000, { art: 0, u: { mag: 10 }, exp: 400 }) },
  { title: 'Тролличья топь', text: 'Болотные тролли перекрыли дорогу. Шкура толстая, удар — как таран.', img: 'quest/lair_swamp.png', boss: 'quest/boss_troll.png',
    g: [S_('Тролль', 'infantry', 220, 40, 0, 45, 15, 25), S_('Болотный шаман', 'magic', 35, 0, 14, 5, 20, 20), S_('Король троллей', 'infantry', 4000, 120, 0, 80, 30, 1)], reward: R(6000, { u: { inf: 20, cav: 10 }, exp: 600 }) },
  { title: 'Крепость отступников', text: 'Орки-отступники засели в старой крепости за частоколом. Без таранов к ним не подступиться.', img: 'quest/lair_orc.png', boss: 'units/orc/hd/tyrant.png',
    g: [S_('Орк-отступник', 'infantry', 100, 30, 0, 35, 8, 120), S_('Наездник на варге', 'cavalry', 90, 40, 0, 25, 8, 60), S_('Вождь Гром-Гар', 'infantry', 8000, 220, 0, 120, 40, 1)], reward: R(9000, { art: 1, u: { cav: 20, mag: 10 }, exp: 900 }) },
  { title: 'Башня некроманта', text: 'Некромант Мор-Аэль поднимает армию тьмы. Его чары сжигают пехоту целыми рядами.', img: 'quest/lair_necro.png', boss: 'units/orc/hd/warlock.png',
    g: [S_('Скелет', 'infantry', 70, 25, 0, 40, 5, 200), S_('Тёмный маг', 'magic', 50, 0, 35, 10, 45, 80), S_('Некромант Мор-Аэль', 'magic', 10000, 0, 300, 150, 120, 1)], reward: R(14000, { u: { inf: 30, mag: 20 }, exp: 1400 }) },
  { title: 'Логово дракона', text: 'Древний дракон Игнитар проснулся под горой. Его пламя видно из столицы. Это последнее испытание Тёмных земель.', img: 'quest/lair_dragon.png', boss: 'quest/boss_dragon.png',
    g: [S_('Драконид', 'cavalry', 160, 60, 10, 60, 30, 150), S_('Кобольд-жрец', 'magic', 60, 0, 40, 20, 50, 100), S_('Дракон Игнитар', 'cavalry', 30000, 600, 200, 250, 150, 1)], reward: R(25000, { art: 2, u: { inf: 50, cav: 30, mag: 30 }, exp: 3000 }) },
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
  const dailyReward = (g, c) => R(300 + 150 * th(g, c), { exp: 20 * th(g, c) });

  // еженедельные: 3 задания на неделю (с понедельника, по Москве) + сундук недели, награды крупнее
  P.qweekly = function qweekly(u, c) {
    const q = this.qinit(u), week = Math.floor((Date.now() + 3 * 3600000 + 3 * DAY) / (7 * DAY)); // неделя с понедельника
    if (!q.weekly || q.weekly.week !== week) {
      const pool = WEEKLY.filter((d) => !d.ok || d.ok(this, c));
      let seed = (u.id * 2246822519 + week * 3266489917) >>> 0; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
      const pick = []; while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      q.weekly = { week, base: snap(this, u), list: pick.map((d) => ({ id: d.id, need: d.n(this, c), claimed: false })), chest: false };
    }
    return q.weekly;
  };
  // род воинов в награде — по заданию (что показано в окне, то и выдаётся)
  const weeklyReward = (g, c, id) => { const t = th(g, c), k = WEEKLY.findIndex((w) => w.id === id); return R(1500 + 600 * t, { u: { [['inf', 'cav', 'mag'][Math.max(0, k) % 3]]: 5 + t }, exp: 120 * t }); };

  // календарь входа: 28 дней, одна награда в сутки; пропуск дня не сбрасывает прогресс. Каждый 7-й день — редкая награда.
  const dayKey = () => Math.floor((Date.now() + 3 * 3600000) / DAY);
  P.calInfo = function calInfo(u, c) {
    const q = this.qinit(u); if (!q.cal) q.cal = { n: 0, last: 0, cycle: 1 };
    const t = th(this, c);
    return { n: q.cal.n, cycle: q.cal.cycle, ready: q.cal.last !== dayKey(), days: CAL.map((d, i) => ({ i, ...d(t), taken: i < q.cal.n })) };
  };


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

  // ресурсы, воины и опыт — в Кладовую игрока (забрать можно в любой свой замок, лишнее не пропадает); артефакт — в Сокровищницу
  const give = (g, u, c, rw) => {
    const got = g.stashAdd(u, rw);
    if (rw.art !== undefined) { g.mil(c); const types = Object.keys(require('./army').ART_TYPES); const type = types[Math.floor(Math.random() * types.length)]; c.artifacts.push({ id: g.db.nextId++, type, rarity: rw.art, active: false, found: Date.now() }); got.push('артефакт'); }
    return got;
  };
  const gotMsg = (got) => (got.length ? ` В Кладовую: ${got.filter((x) => x !== 'артефакт').join(', ')}.${got.includes('артефакт') ? ' Артефакт — в Сокровищнице!' : ''}` : '');

  // советник-строитель: текущий шаг (у опытных игроков — Ратуша 6+ на старте — цепочка сразу пройдена)
  P.advState = function advState(u, c) {
    const q = this.qinit(u);
    if (q.adv === undefined) q.adv = this.buildingLevel(c, 0) >= 6 ? ADV.length : 0;
    const t = ADV[q.adv]; if (!t) return { finished: true, total: ADV.length };
    const have = this.buildingLevel(c, t.bid), def = C.BY_ID[t.bid];
    return { idx: q.adv, total: ADV.length, id: t.id, title: t.title, bid: t.bid, layer: def ? def.layer : 'castle', have: Math.min(have, t.lvl), need: t.lvl, done: have >= t.lvl, reward: t.reward };
  };
  // ресурсы — сразу в замок (до вместимости Склада), остаток и воины — в Кладовую
  const giveNow = (g, u, c, rw) => {
    g.tick(c); const cap = g.capacity(c), rest = {}; let inCastle = 0;
    for (const r of RES4) if (rw[r]) { const k = Math.max(0, Math.min(rw[r], Math.floor(cap[r] - c.res[r]))); c.res[r] += k; inCastle += k; if (rw[r] - k > 0) rest[r] = rw[r] - k; }
    const toStash = { ...rest, ...(rw.u ? { u: rw.u } : {}), ...(rw.exp ? { exp: rw.exp } : {}) };
    const got = Object.keys(toStash).length ? g.stashAdd(u, toStash) : [];
    return { inCastle, stash: got };
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
    const w = this.qweekly(u, c);
    const weekly = w.list.map((x) => { const def = WEEKLY.find((y) => y.id === x.id); if (!def) return null; const have = this.qstat(u, def.stat, w.base); return { id: x.id, title: def.title, text: def.text(x.need), icon: def.icon, have: Math.min(have, x.need), need: x.need, done: have >= x.need, claimed: x.claimed, reward: weeklyReward(this, c, x.id) }; }).filter(Boolean);
    const wchest = { ready: weekly.length > 0 && weekly.every((x) => x.claimed) && !w.chest, taken: w.chest, ends: (w.week + 1) * 7 * DAY - 3 * DAY - 3 * 3600000 };
    const cal = this.calInfo(u, c);
    const ready = (tut.done ? 1 : 0) + daily.filter((x) => x.done && !x.claimed).length + (daily.every((x) => x.claimed) && !d.chest ? 1 : 0) + (camp.won ? 1 : 0)
      + weekly.filter((x) => x.done && !x.claimed).length + (wchest.ready ? 1 : 0) + (cal.ready ? 1 : 0);
    return { tut, daily, chest: { ready: daily.every((x) => x.claimed) && !d.chest, taken: d.chest }, camp, weekly, wchest, cal, ready };
  };

  P.questClaim = function questClaim(u, c, kind, id) {
    const q = this.qinit(u), st = this.questsState(u, c);
    if (kind === 'tut') {
      if (!st.tut.done) return { error: 'Задание ещё не выполнено.' };
      const got = give(this, u, c, TUT[q.tut].reward);
      q.tut++; q.base = snap(this, u); q.baseFor = q.tut; this.store.save();
      return { ok: true, msg: `Задание «${st.tut.title}» выполнено!${gotMsg(got)}` };
    }
    if (kind === 'daily') {
      const x = q.daily.list.find((y) => y.id === id), v = st.daily.find((y) => y.id === id);
      if (!x || !v || !v.done || x.claimed) return { error: 'Награду пока нельзя забрать.' };
      const got = give(this, u, c, v.reward); x.claimed = true; this.store.save();
      return { ok: true, msg: `Задание «${v.title}» выполнено!${gotMsg(got)}` };
    }
    if (kind === 'chest') {
      if (!st.chest.ready) return { error: 'Сундук откроется, когда все три задания дня выполнены.' };
      const art = Math.random() < 0.25, t = th(this, c); q.daily.chest = true;
      const slot = ['inf', 'cav', 'mag'][Math.floor(Math.random() * 3)];
      const got = give(this, u, c, R(400 + 200 * t, { u: { [slot]: 3 + Math.floor(t / 2) }, exp: 40 * t, ...(art ? { art: 0 } : {}) }));
      const gear = Math.random() < 0.15 && this.heroGear(c).length < 24 ? this.giveGear(c, this.rollGear(0, Math.random() < 0.8 ? 0 : 1)) : null; // изредка — снаряжение генерала
      this.store.save();
      return { ok: true, msg: `Сундук дня открыт!${gotMsg(got)}${gear ? ' И снаряжение генерала!' : ''}` };
    }
    if (kind === 'adv') {
      const a = this.advState(u, c); if (a.finished || !a.done) return { error: 'Задание советника ещё не выполнено.' };
      const r = giveNow(this, u, c, ADV[q.adv].reward); q.adv++; this.store.save();
      return { ok: true, msg: `Советник: «${a.title}» — выполнено!${r.inCastle ? ' Ресурсы — в замке.' : ''}${r.stash.length ? ` В Кладовую: ${r.stash.join(', ')}.` : ''}` };
    }
    if (kind === 'weekly') {
      const x = q.weekly.list.find((y) => y.id === id), v = st.weekly.find((y) => y.id === id);
      if (!x || !v || !v.done || x.claimed) return { error: 'Награду пока нельзя забрать.' };
      const got = give(this, u, c, weeklyReward(this, c, id)); x.claimed = true; this.store.save();
      return { ok: true, msg: `Задание недели «${v.title}» выполнено!${gotMsg(got)}` };
    }
    if (kind === 'wchest') {
      if (!st.wchest.ready) return { error: 'Сундук недели откроется, когда все три задания недели выполнены.' };
      q.weekly.chest = true; const t = th(this, c);
      const got = give(this, u, c, R(3000 + 1000 * t, { u: { inf: 5 + t, cav: 5 + t, mag: 3 + t }, exp: 250 * t, art: Math.random() < 0.5 ? 1 : 0 }));
      const gear = this.heroGear(c).length < 24 ? this.giveGear(c, this.rollGear(0, Math.random() < 0.3 ? 2 : 1)) : null;
      this.store.save();
      return { ok: true, msg: `Сундук недели открыт!${gotMsg(got)}${gear ? ' И снаряжение генерала!' : ''}` };
    }
    if (kind === 'cal') {
      const cal = st.cal; if (!cal.ready) return { error: 'Награда за сегодня уже получена — приходите завтра!' };
      const d = cal.days[cal.n], rw = { ...d.rw }, gear = rw.gear; delete rw.gear;
      const got = give(this, u, c, rw);
      const g2 = gear !== undefined && this.heroGear(c).length < 24 ? this.giveGear(c, this.rollGear(0, gear)) : null;
      q.cal.last = dayKey(); q.cal.n++; if (q.cal.n >= CAL.length) { q.cal.n = 0; q.cal.cycle++; }
      this.store.save();
      return { ok: true, msg: `Награда за вход — день ${d.i + 1}!${gotMsg(got)}${g2 ? ' И снаряжение генерала!' : ''}` };
    }
    if (kind === 'camp') {
      if (!q.campWon) return { error: 'Сначала разорите логово.' };
      const k = q.camp, got = give(this, u, c, CAMP[k].reward);
      q.camp++; q.campWon = false; q.lair = null; this.store.save();
      return { ok: true, msg: `«${CAMP[k].title}» — награда получена!${gotMsg(got)}` };
    }
    return { error: 'Неизвестное задание.' };
  };
}

module.exports = { install, TUT, ADV, DAILY, WEEKLY, CAL, CAMP, CAMP_GARRISON };
