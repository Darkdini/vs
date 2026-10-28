'use strict';
const Wd = require('./words'); // слова после чисел: 1 воин, 2 воина, 5 воинов
// Военная часть и функции зданий: юниты, тренировка, генерал, армии и бой, торговля, альянсы, науки, религия,
// экспедиции и артефакты. Подключается к Game (game.js) как набор методов — см. install() внизу.
//
// Юниты: по 10 боевых и 5 особых на расу, картинки — units/<раса>/hd/*.png, общие уникальные — units/unical/hd
// + общие специальные и уникальные. Характеристики и цены берутся по роли из data/units.json (наш баланс по ролям и расам,
// его собирает tools/gen_units.py); формулы боя — ниже, в clash().

const fs = require('fs');
const path = require('path');
const C = require('./catalog');

const SPEED = Number(process.env.SPEED || 1);
const GDD = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'units.json'), 'utf8'));
const RES4 = ['wood', 'stone', 'iron', 'food'];
const RACE_DIR = { humans: 'human/hd', elves: 'elf/hd', dwarves: 'dwarv/hd', orcs: 'orc/hd' }; // портреты рас (свои у каждой)

// ---------- здания с функциями (id из клиента) ----------
const B = {
  TOWNHALL: 0, STORE: 1, HQ: 2, BARRACKS: 3, MARKET: 4, SMITH: 11, STABLE: 12, EMBASSY: 13, SAGES: 14, UNIVERSITY: 15,
  EXPEDITION: 17, ART_TOWER: 18, TRADE_HALL: 19, MAGE_ACADEMY: 20, WATCHTOWER: 21, FENCE: 22, WORKSHOP: 23,
  TRAVELER: 24, TEMPLE: 25, CACHE: 26, PORTAL: 38, MAGIC_SCHOOL: 39, MASON: 40, INFIRMARY: 41, TAVERN: 42, ALCHEMY: 43,
  TREASURY: 44, SPY: 45,
};

// ---------- каталог юнитов ----------
// [id, имя, раса ('all' — любая), картинка units/<...>.png, роль из GDD, здание, уровень здания, доп. требования]
const UNIT_LIST = [
  // люди — как в оригинале (скрины окна «Юнит»): имена, требования, характеристики — в ORIG ниже
  [200, 'Мечник', 'humans', 'human/hd/swordman', 'atk_inf', B.BARRACKS, 1],
  [201, 'Копейщик', 'humans', 'human/hd/javelineer', 'def_inf', B.BARRACKS, 3, { [B.SMITH]: 1 }],
  [261, 'Кирасир', 'humans', 'human/hd/cuirassier', 'light_cav', B.STABLE, 1],
  [202, 'Разведчик', 'humans', 'human/hd/scout', 'scout', B.SPY, 1, { [B.TOWNHALL]: 5, [B.SMITH]: 2, [B.STABLE]: 1 }], // тренируется в Центре разведки
  [203, 'Чародей', 'humans', 'human/hd/mage', 'mage', B.MAGE_ACADEMY, 1, { [B.BARRACKS]: 1 }],
  [204, 'Рыцарь', 'humans', 'human/hd/knight', 'heavy_cav', B.BARRACKS, 10, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [264, 'Рейтар', 'humans', 'human/hd/reiter', 'heavy_cav', B.STABLE, 7, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [262, 'Ведьмак', 'humans', 'human/hd/witcher', 'mage', B.MAGE_ACADEMY, 3, { [B.SMITH]: 1 }],
  [263, 'Варлок', 'humans', 'human/hd/mage', 'mage', B.MAGE_ACADEMY, 10, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }], // картинка пока — Чародея
  [205, 'Паладин', 'humans', 'human/hd/paladin', 'heavy_cav', B.STABLE, 3, { [B.SMITH]: 1 }],
  [260, 'Колосс', 'humans', 'human/hd/colossus', 'elite_inf', B.MAGE_ACADEMY, 7, { [B.SMITH]: 3, [B.MAGIC_SCHOOL]: 7 }], // список на скрине может быть обрезан
  [259, 'Нурух', 'humans', 'human/hd/nuruh', 'legendary', B.WORKSHOP, 10],
  [206, 'Джин', 'humans', 'human/hd/jin', 'legendary', B.PORTAL, 1], // на скринах оригинала нет — оставлен как был
  // эльфы — как в оригинале (скрины окна «Юнит»): имена, требования, характеристики — в ORIG ниже
  [207, 'Лучник', 'elves', 'elf/hd/archer', 'ranged', B.BARRACKS, 1],
  [208, 'Мастер клинка', 'elves', 'elf/hd/fighter', 'atk_inf', B.BARRACKS, 3, { [B.SMITH]: 1 }],
  [257, 'Химера', 'elves', 'elf/hd/chimera', 'atk_inf', B.SMITH, 3],
  [209, 'Скаут', 'elves', 'elf/hd/scout', 'scout', B.SPY, 1, { [B.STABLE]: 1, [B.SMITH]: 3 }], // тренируется в Центре разведки
  [210, 'Созидающая', 'elves', 'elf/hd/create', 'mage', B.MAGE_ACADEMY, 1, { [B.BARRACKS]: 1 }],
  [265, 'Страж границ', 'elves', 'elf/hd/warden', 'elite_inf', B.BARRACKS, 10, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [266, 'Эльфийский всадник', 'elves', 'elf/hd/rider', 'light_cav', B.STABLE, 1],
  [267, 'Повелитель стихий', 'elves', 'elf/hd/elemental', 'mage', B.MAGE_ACADEMY, 3, { [B.SMITH]: 1 }],
  [268, 'Дух леса', 'elves', 'elf/hd/spirit', 'mage', B.MAGE_ACADEMY, 10, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [258, 'Зверь', 'elves', 'elf/hd/beast', 'elite_inf', B.BARRACKS, 10, { [B.SMITH]: 5 }],
  [212, 'Единорог', 'elves', 'elf/hd/edinorog', 'heavy_cav', B.STABLE, 3, { [B.SMITH]: 1 }],
  [211, 'Кентавр', 'elves', 'elf/hd/kenaur', 'light_cav', B.STABLE, 7, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [213, 'Энт', 'elves', 'elf/hd/ent', 'legendary', B.WORKSHOP, 10],
  // гномы — как в оригинале (скрины окна «Юнит»): имена, требования, характеристики — в ORIG ниже
  [214, 'Топорщик', 'dwarves', 'dwarv/hd/fighter', 'atk_inf', B.BARRACKS, 1],
  [215, 'Арбалетчик', 'dwarves', 'dwarv/hd/arbalet', 'ranged', B.BARRACKS, 3, { [B.SMITH]: 1 }],
  [255, 'Горный великан', 'dwarves', 'dwarv/hd/giant', 'def_inf', B.BARRACKS, 1, { [B.SMITH]: 3 }],
  [216, 'Жрец Рун', 'dwarves', 'dwarv/hd/elder', 'mage', B.MAGE_ACADEMY, 1, { [B.BARRACKS]: 1 }],
  [217, 'Грифон разведчик', 'dwarves', 'dwarv/hd/gryphon', 'scout', B.SPY, 1, { [B.STABLE]: 1, [B.WORKSHOP]: 1, [B.SMITH]: 3 }], // тренируется в Центре разведки
  [218, 'Защитник гор', 'dwarves', 'dwarv/hd/defender', 'heavy_cav', B.STABLE, 1],
  [269, 'Грифоний наездник', 'dwarves', 'dwarv/hd/gryphon', 'light_cav', B.STABLE, 3, { [B.SMITH]: 1 }], // картинка пока — Грифона
  [270, 'Топтун', 'dwarves', 'dwarv/hd/stomper', 'heavy_cav', B.STABLE, 7, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [271, 'Громовержец', 'dwarves', 'dwarv/hd/thunder', 'mage', B.MAGE_ACADEMY, 3, { [B.SMITH]: 1 }],
  [256, 'Механический центурион', 'dwarves', 'dwarv/hd/centurion', 'elite_inf', B.MAGE_ACADEMY, 10, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [219, 'Револьверщик', 'dwarves', 'dwarv/hd/revolver', 'elite_inf', B.BARRACKS, 10, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [220, 'Йети', 'dwarves', 'dwarv/hd/yeti', 'legendary', B.WORKSHOP, 10],
  // орки — как в оригинале (скрины окна «Юнит»): имена, требования, характеристики — в ORIG ниже
  [245, 'Мародёр', 'orcs', 'orc/hd/marauder', 'atk_inf', B.BARRACKS, 1],
  [247, 'Бугай', 'orcs', 'orc/hd/bugai', 'def_inf', B.BARRACKS, 3, { [B.SMITH]: 1 }],
  [252, 'Орк загонщик', 'orcs', 'orc/hd/hunter', 'scout', B.SPY, 1, { [B.BARRACKS]: 5, [B.MAGE_ACADEMY]: 1 }], // тренируется в Центре разведки
  [253, 'Осквернитель', 'orcs', 'orc/hd/defiler', 'mage', B.MAGE_ACADEMY, 1, { [B.BARRACKS]: 1 }],
  [246, 'Урук-хай', 'orcs', 'orc/hd/uruk', 'def_inf', B.BARRACKS, 10, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [272, 'Варг', 'orcs', 'orc/hd/warg', 'light_cav', B.STABLE, 1],
  [273, 'Загонщик', 'orcs', 'orc/hd/hunter', 'light_cav', B.STABLE, 3, { [B.SMITH]: 1 }],
  [274, 'Потрошитель', 'orcs', 'orc/hd/ripper', 'heavy_cav', B.STABLE, 7, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [275, 'Заклинатель', 'orcs', 'orc/hd/caster', 'mage', B.MAGE_ACADEMY, 3, { [B.SMITH]: 1 }],
  [254, 'Варлок', 'orcs', 'orc/hd/warlock', 'mage', B.STABLE, 5, { [B.BARRACKS]: 7, [B.WORKSHOP]: 3, [B.SMITH]: 7 }],
  [250, 'Тиран', 'orcs', 'orc/hd/tyrant', 'elite_inf', B.BARRACKS, 10, { [B.SMITH]: 10 }],
  [248, 'Шаман', 'orcs', 'orc/hd/shaman', 'mage', B.MAGE_ACADEMY, 10, { [B.WORKSHOP]: 7, [B.SMITH]: 5 }],
  [249, 'Кулак Ярости', 'orcs', 'orc/hd/fist', 'legendary', B.WORKSHOP, 10],
  [251, 'Изувер', 'orcs', 'orc/hd/butcher', 'legendary', B.PORTAL, 1], // на скринах оригинала нет — оставлен как был
  // специальные — у каждой расы своя картинка (units/<раса>/torg.png и т.д.)
  [221, 'Торговец', 'all', 'torg', 'merchant', B.MARKET, 1],
  [224, 'Путешественник', 'all', 'traveler', 'settler', B.TRAVELER, 5],
  [227, 'Ученый', 'all', 'wisdom', 'sage', B.SAGES, 1],
  [230, 'Археолог', 'all', 'arheolog', 'archaeologist', B.EXPEDITION, 1], // тренируются в Экспедиции и уходят оттуда на поиски
  [233, 'Бунтарь', 'all', 'buntar', 'rebel', B.TRAVELER, 10],
  [231, 'Страж глубин', 'all', 'unical/hd/dguard', 'dguard', B.EXPEDITION, 2], // охрана археологов: тренируется в Экспедиции, ходит только в Подземелье (dungeon.js)
  [236, 'Генерал', 'all', 'general', 'general', B.HQ, 1],
  // уникальные (units/unical)
  [239, 'Великан', 'all', 'unical/hd/giant', 'giant', B.TAVERN, 1],
  [240, 'Катапульта', 'all', 'unical/hd/katapulta', 'catapult', B.WORKSHOP, 5],
  [241, 'Око', 'all', 'unical/hd/oko', 'eye', B.SPY, 1],
  [242, 'Тень', 'all', 'unical/hd/shadow', 'shadow', B.SPY, 5],
  [243, 'Таран', 'all', 'unical/hd/taran', 'ram', B.WORKSHOP, 10, { [B.SMITH]: 10 }],
  [244, 'Валькирия', 'all', 'unical/hd/valkiriya', 'valkyrie', B.TAVERN, 5],
];
// роли, которых нет в GDD, — свой баланс в том же формате
const CUSTOM = {
  sage: { type: 'special', attack: 0, magicAttack: 0, defense: { infantry: 5, cavalry: 5, magic: 5 }, speed: 5, carry: 0, upkeepFoodPerHour: 1, population: 1, cost: { wood: 150, stone: 150, iron: 150, food: 300 }, trainTimeSec: 900 },
  giant: { type: 'infantry', attack: 180, magicAttack: 0, defense: { infantry: 120, cavalry: 100, magic: 40 }, speed: 5, carry: 150, upkeepFoodPerHour: 6, population: 5, cost: { wood: 1500, stone: 1500, iron: 2500, food: 1500 }, trainTimeSec: 7200 },
  valkyrie: { type: 'cavalry', attack: 150, magicAttack: 40, defense: { infantry: 90, cavalry: 110, magic: 80 }, speed: 12, carry: 120, upkeepFoodPerHour: 5, population: 4, cost: { wood: 1200, stone: 1000, iron: 2000, food: 1200 }, trainTimeSec: 6000 },
  eye: { type: 'cavalry', attack: 0, magicAttack: 0, defense: { infantry: 30, cavalry: 30, magic: 30 }, speed: 20, carry: 0, upkeepFoodPerHour: 2, population: 2, cost: { wood: 300, stone: 300, iron: 600, food: 200 }, trainTimeSec: 1500, spy: 2 },
  shadow: { type: 'infantry', attack: 110, magicAttack: 0, defense: { infantry: 20, cavalry: 20, magic: 60 }, speed: 15, carry: 30, upkeepFoodPerHour: 2, population: 2, cost: { wood: 500, stone: 400, iron: 800, food: 300 }, trainTimeSec: 2400 },
};

// характеристики оригинала (окно «Постройка юнитов»): ❤ здоровье, ⚔ атака, маг. атака, 🛡 защита, маг. защита, скорость, груз;
// цена дерево/камень/железо/еда, людей, время (сек); разведчики (202, 209, 217, 252) — самые быстрые воины своей расы:
// на 2 клетки в час быстрее самого быстрого (с 25.10)
const ORIG = {
  // орки (скрины окна «Юнит» оригинала) — значения один в один
  245: { type: 'infantry', hp: 40, atk: 15, mag: 0, def: 10, mdef: 0, speed: 11, carry: 101, cost: [85, 80, 90, 180], pop: 6, time: 1440 }, // Мародер 24:00
  247: { type: 'infantry', hp: 50, atk: 20, mag: 0, def: 15, mdef: 0, speed: 6, carry: 31, cost: [75, 80, 85, 165], pop: 12, time: 1960 }, // Бугай 32:40
  252: { type: 'cavalry', hp: 25, atk: 15, mag: 0, def: 10, mdef: 0, speed: 26, carry: 0, cost: [80, 75, 85, 170], pop: 15, time: 2380 }, // Орк загонщик 39:40
  253: { type: 'magic', hp: 25, atk: 0, mag: 10, def: 0, mdef: 25, speed: 7, carry: 60, cost: [85, 85, 90, 170], pop: 9, time: 1560 }, // Осквернитель 26:00
  246: { type: 'cavalry', hp: 100, atk: 50, mag: 10, def: 45, mdef: 15, speed: 12, carry: 60, cost: [100, 95, 105, 220], pop: 39, time: 3480 }, // Урук-хай 58:00
  254: { type: 'magic', hp: 55, atk: 0, mag: 15, def: 0, mdef: 25, speed: 6, carry: 60, cost: [125, 80, 70, 215], pop: 24, time: 2700 }, // Варлок 45:00
  250: { type: 'infantry', hp: 80, atk: 20, mag: 10, def: 30, mdef: 20, speed: 9, carry: 90, cost: [110, 105, 115, 220], pop: 53, time: 3720 }, // Тиран 1:02:00
  248: { type: 'magic', hp: 120, atk: 20, mag: 40, def: 15, mdef: 40, speed: 9, carry: 70, cost: [165, 170, 175, 215], pop: 51, time: 4380 }, // Шаман 1:13:00
  249: { type: 'infantry', hp: 140, atk: 25, mag: 5, def: 25, mdef: 5, speed: 4, carry: 70, cost: [680, 675, 665, 880], pop: 91, time: 5880, bldDmg: 32 }, // Кулак Ярости 1:38:00
  // люди (скрины окна «Юнит» оригинала) — значения один в один
  200: { type: 'infantry', hp: 25, atk: 10, mag: 0, def: 10, mdef: 0, speed: 7, carry: 62, cost: [70, 80, 95, 50], pop: 3, time: 720 }, // Мечник 12:00
  201: { type: 'infantry', hp: 20, atk: 10, mag: 0, def: 15, mdef: 0, speed: 6, carry: 47, cost: [95, 75, 120, 50], pop: 9, time: 1099 }, // Копейщик 18:19
  261: { type: 'cavalry', hp: 25, atk: 15, mag: 0, def: 20, mdef: 0, speed: 10, carry: 90, cost: [75, 80, 97, 60], pop: 5, time: 840 }, // Кирасир 14:00
  202: { type: 'cavalry', hp: 25, atk: 10, mag: 0, def: 10, mdef: 0, speed: 24, carry: 0, cost: [90, 100, 70, 55], pop: 15, time: 1200 }, // Разведчик 20:00
  203: { type: 'magic', hp: 25, atk: 0, mag: 30, def: 0, mdef: 15, speed: 8, carry: 70, cost: [85, 95, 125, 70], pop: 12, time: 1099 }, // Чародей 18:19
  204: { type: 'cavalry', hp: 50, atk: 45, mag: 0, def: 10, mdef: 5, speed: 9, carry: 101, cost: [140, 110, 195, 65], pop: 30, time: 2400 }, // Рыцарь 40:00
  205: { type: 'cavalry', hp: 65, atk: 50, mag: 5, def: 35, mdef: 30, speed: 11, carry: 86, cost: [125, 135, 230, 75], pop: 45, time: 2440 }, // Паладин 40:40
  260: { type: 'infantry', hp: 75, atk: 15, mag: 15, def: 35, mdef: 25, speed: 9, carry: 75, cost: [140, 115, 200, 70], pop: 33, time: 2640 }, // Колосс 44:00
  259: { type: 'infantry', hp: 100, atk: 25, mag: 5, def: 25, mdef: 5, speed: 3, carry: 78, cost: [675, 660, 745, 595], pop: 79, time: 4260, bldDmg: 29 }, // Нурух 1:11:00
  // эльфы (скрины окна «Юнит» оригинала) — значения один в один
  207: { type: 'infantry', hp: 30, atk: 8, mag: 0, def: 20, mdef: 0, speed: 6, carry: 47, cost: [95, 80, 70, 50], pop: 6, time: 990 }, // Эльф лучник 16:30
  208: { type: 'infantry', hp: 25, atk: 10, mag: 0, def: 15, mdef: 0, speed: 8, carry: 55, cost: [120, 100, 60, 50], pop: 12, time: 1580 }, // Танцующий с клинками 26:20
  257: { type: 'infantry', hp: 30, atk: 20, mag: 0, def: 10, mdef: 0, speed: 10, carry: 70, cost: [97, 77, 78, 60], pop: 9, time: 1080 }, // Химера 18:00
  209: { type: 'cavalry', hp: 20, atk: 10, mag: 0, def: 15, mdef: 0, speed: 22, carry: 0, cost: [105, 70, 45, 30], pop: 9, time: 1920 }, // Скаут 32:00
  210: { type: 'magic', hp: 35, atk: 0, mag: 20, def: 0, mdef: 35, speed: 7, carry: 62, cost: [135, 100, 85, 60], pop: 27, time: 1540 }, // Созидающая 25:40
  211: { type: 'cavalry', hp: 60, atk: 40, mag: 0, def: 30, mdef: 0, speed: 12, carry: 94, cost: [175, 105, 135, 80], pop: 39, time: 2640 }, // Кентавр 44:00
  258: { type: 'infantry', hp: 70, atk: 60, mag: 0, def: 40, mdef: 0, speed: 9, carry: 80, cost: [185, 110, 140, 90], pop: 48, time: 2880 }, // Зверь 48:00
  212: { type: 'cavalry', hp: 65, atk: 20, mag: 30, def: 35, mdef: 50, speed: 9, carry: 78, cost: [210, 130, 140, 110], pop: 45, time: 3520 }, // Единорог 58:40
  213: { type: 'infantry', hp: 100, atk: 25, mag: 5, def: 20, mdef: 10, speed: 4, carry: 47, cost: [720, 655, 645, 410], pop: 87, time: 4720, bldDmg: 33 }, // Энт 1:18:40
  // гномы (скрины окна «Юнит» оригинала)
  214: { type: 'infantry', hp: 20, atk: 20, mag: 0, def: 5, mdef: 0, speed: 11, carry: 55, cost: [55, 100, 70, 50], pop: 3, time: 1160 }, // Гном топорщик 19:20
  215: { type: 'infantry', hp: 25, atk: 15, mag: 0, def: 15, mdef: 0, speed: 7, carry: 47, cost: [70, 115, 85, 60], pop: 12, time: 1460 }, // Арбалетчик 24:20
  255: { type: 'infantry', hp: 30, atk: 5, mag: 0, def: 25, mdef: 0, speed: 7, carry: 70, cost: [77, 90, 85, 60], pop: 7, time: 1260 }, // Горный великан 21:00
  216: { type: 'magic', hp: 25, atk: 0, mag: 30, def: 0, mdef: 30, speed: 9, carry: 62, cost: [90, 145, 105, 50], pop: 15, time: 1620 }, // Жрец Рун 27:00
  217: { type: 'cavalry', hp: 25, atk: 20, mag: 0, def: 5, mdef: 0, speed: 20, carry: 0, cost: [55, 105, 70, 70], pop: 21, time: 2180 }, // Грифон разведчик 36:20
  218: { type: 'cavalry', hp: 60, atk: 56, mag: 5, def: 25, mdef: 0, speed: 8, carry: 86, cost: [100, 175, 95, 80], pop: 33, time: 2800 }, // Защитник гор 46:40
  256: { type: 'infantry', hp: 70, atk: 30, mag: 0, def: 45, mdef: 25, speed: 9, carry: 80, cost: [125, 185, 130, 85], pop: 53, time: 3000 }, // Механический центурион 50:00
  219: { type: 'infantry', hp: 80, atk: 40, mag: 20, def: 45, mdef: 5, speed: 9, carry: 78, cost: [165, 205, 175, 85], pop: 51, time: 3330 }, // Револьверщик 55:30
  220: { type: 'infantry', hp: 100, atk: 25, mag: 5, def: 20, mdef: 5, speed: 2, carry: 55, cost: [655, 750, 665, 620], pop: 89, time: 4640, bldDmg: 27 }, // Йети 1:17:20
  // общие юниты (те же скрины), значения один в один; у Путешественника орков другая цена (raceOvr ниже)
  224: { type: 'special', hp: 10, atk: 1, mag: 1, def: 1, mdef: 1, speed: 10, carry: 0, cost: [5000, 7500, 5000, 5000], pop: 3000, time: 136800 }, // Путешественник 38:00:00
  233: { type: 'special', hp: 10, atk: 2, mag: 2, def: 1, mdef: 1, speed: 9, carry: 0, cost: [12012, 13316, 10412, 24031], pop: 3026, time: 486000 }, // Бунтарь 135:00:00
  230: { type: 'special', hp: 0, atk: 0, mag: 0, def: 0, mdef: 0, speed: 0, carry: 0, cost: [123, 141, 125, 250], pop: 12, time: 960 }, // Археолог 16:00
  231: { type: 'infantry', hp: 70, atk: 25, mag: 0, def: 30, mdef: 20, speed: 10, carry: 0, cost: [180, 120, 280, 140], pop: 6, time: 1440 }, // Страж глубин 12:00 — одинаковый у всех рас
  227: { type: 'special', hp: 0, atk: 0, mag: 0, def: 0, mdef: 0, speed: 0, carry: 0, cost: [36, 41, 29, 40], pop: 2, time: 1700 }, // Ученый 28:20
  243: { type: 'siege', hp: 60, atk: 0, mag: 0, def: 0, mdef: 0, speed: 7, carry: 0, cost: [97, 97, 96, 105], pop: 14, time: 1620, wallDmg: 50, oneUse: true }, // Таран 27:00
};
// остальные юниты (люди, эльфы, гномы, общие) переводятся из нашей GDD-таблицы в масштаб оригинала:
// атака/защита ×0.42 (Мечник 50 → 21, как Мародёр), цена ×0.5, время ×0.45
const SCALE = { stat: 0.42, cost: 0.5, time: 0.45 };
// население: базовые воины ×4, элита/маги/легендарные ×8 (как у орков оригинала: 3–8 и 25–45)
const POP_K = (role) => (['elite_inf', 'heavy_cav', 'legendary', 'mage', 'valkyrie', 'giant', 'shadow'].includes(role) ? 8 : 4);
// лимита тренировки в сутки нет (снят по решению владельца); при желании задаётся TRAIN_DAY в окружении сервера
const TRAIN_DAY = Number(process.env.TRAIN_DAY) || Infinity;
function buildUnit([id, name, race, img, role, building, level, req = {}, stats], noOrig = false) {
  const base = { id, name, race, img, role, building, level, req, spy: role === 'scout' ? 1 : 0 };
  const o = !noOrig && ORIG[id];
  if (o) {
    const gdd = o.keepSpeed ? buildUnit([id, name, race, img, role, building, level, req, stats], true) : null;
    return { ...base, type: o.type, hp: o.hp, attack: o.atk, magic: o.mag, def: { inf: o.def, cav: o.def, mag: o.mdef }, speed: gdd ? gdd.speed : o.speed, carry: o.carry,
      upkeep: Math.max(1, Math.round(o.pop / 3)), pop: o.pop, cost: { wood: o.cost[0], stone: o.cost[1], iron: o.cost[2], food: o.cost[3] }, time: o.time,
      ...(o.wallDmg ? { wallDmg: o.wallDmg } : {}), ...(o.bldDmg ? { bldDmg: o.bldDmg } : {}), ...(o.oneUse ? { oneUse: true } : {}) };
  }
  const src = CUSTOM[stats] || CUSTOM[role] || GDD.units.find((u) => u.race === (race === 'all' ? 'humans' : race) && u.role === role);
  const st = (v) => Math.round((v || 0) * SCALE.stat);
  return {
    ...base, type: src.type, attack: st(src.attack), magic: st(src.magicAttack),
    def: { inf: st(src.defense.infantry), cav: st(src.defense.cavalry), mag: st(src.defense.magic) },
    hp: Math.max(10, Math.round((st(src.defense.infantry) + st(src.defense.cavalry)) * 1.2 + 10 * (src.population || 1))),
    speed: src.speed, carry: src.carry, upkeep: src.upkeepFoodPerHour, pop: Math.max(1, (src.population || 1) * POP_K(role)),
    cost: Object.fromEntries(['wood', 'stone', 'iron', 'food'].map((r) => [r, Math.max(5, Math.round(src.cost[r] * SCALE.cost))])),
    time: Math.max(30, Math.round(src.trainTimeSec * SCALE.time)), spy: role === 'scout' ? 1 : src.spy || 0,
  };
}
const UNITS = UNIT_LIST.map((x) => buildUnit(x));
const UNIT = Object.fromEntries(UNITS.map((u) => [u.id, u]));
const DGUARD_ID = 231; UNIT[DGUARD_ID].dungOnly = true; // Страж глубин: только Подземелье — не нападает, не защищает замок, не ходит подкреплением
// Торговцы — как в оригинале: не тренируются и не воюют, их всегда 20 при построенном Рынке; скорость 60 полей/час (втрое быстрее оригинала),
// груз — 25 ед. за уровень Рынка (20 ур. — 500 ед.). С 28.10, по решению владельца: при полном развитии (Рынок 20, Торговая палата 20,
// наука «Экономика» с вехами 5 и 15) торговец везёт 750, все 20 — 15 000 за раз (и в кладовую альянса, и игрокам); было 1 480 и 29 600
const MERCHANT_ID = 221, MERCHANTS = 20;
const TRADE_CARRY = 0.015; // Торговая палата: +1,5% к грузу торговцев за уровень (20 ур. — +30%; было +2,2%); до 22.10 груз давала Таверна
Object.assign(UNIT[MERCHANT_ID], { speed: 60, notrain: true, carry: 25 }); // торговцы втрое быстрее оригинала (было 20 полей/час)
// как в оригинале: в Центре разведки тренируется только разведчик своей расы, Портал воинов не тренирует — он ускоряет походы.
// Око и Тень (были в Центре разведки), Джин и Изувер (были в Портале) больше не тренируются; у кого уже есть — остаются в армии
// старые воины рас вне списка «Справки» (Тиран, Варлок орков, Колосс, Зверь, Химера, Горный великан) — тоже больше не тренируются
// Великан и Валькирия (были в Таверне, с 22.10 её нет) — тоже
const RETIRED = [241, 242, 206, 251, 250, 254, 260, 258, 257, 255, 239, 244];
for (const id of RETIRED) Object.assign(UNIT[id], { notrain: true, retired: true });
const GENERAL_ID = 236;
const TRADE_MAX = Math.max(5, Math.round(600 / SPEED)); // торговцы идут не дольше 10 минут куда угодно
const OWN_TRADE = 3; // торговцы между своими замками — втрое быстрее (180 полей/час)
const RESERVE_MAX = 25000, RESERVE_LOY = 15; // «Резерв» замка: до 25 000 воинов вне боя; бунт 85% и выше (лояльность ≤ 15) — резерв сам выходит в Замковую армию
const RIOT_STEP = 15, RIOT_CAPTURED = 95; // бунт: +15% за каждое победное нападение с бунтарями (сколько бы их ни было в одной армии; армии подряд — каждая по 15%); после захвата в замке бунт 95%
const MARCH = 2; // все армии и торговцы ходят вдвое быстрее (походы, возврат, подкрепления) — экспедиций не касается
const CAMP_FAST = 3; // набеги и нападения на лагеря разбойников (и логово «Тёмных земель») — втрое быстрее, туда и обратно
const RECALL_MS = 4 * 60 * 1000; // армию, отправленную по ошибке, можно вернуть в первые 4 минуты (реальные, не зависят от скорости мира)
// Все четыре расы — по «Справке» (окно «Юнит»): тип, жизнь, атака на пехоту / магов / конницу, груз, скорость, цена и время.
// Бой у нас свой: атака (у магов — магия) = среднее трёх атак; защита — прежняя (у новых — как у похожих).
// Цена и время тренировки — ×4 к «Справке» (tc/tt); Кузница, наём генерала и воскрешение считаются по прежней цене (refCost).
const SPRAVKA_K = 4;
const CARRY_K = 10; // груз — ×10 к «Справке» (там 3–31 ед.: добычу лагерей было нечем унести)
const WRECK_K = 4; // разрушители зданий (Йети, Энт, Нурух, Кулак ярости — в Мастерской): ещё вчетверо дороже и дольше
const SPRAVKA = {
  // id: [тип, жизнь, [пех, маг, кон], груз, скорость, [дерево, камень, железо, еда], время сек, доп.]
  200: ['infantry', 36, [4, 18, 0], 3, 17, [8, 3, 10, 5], 60], // Мечник
  201: ['infantry', 54, [13, 27, 1], 7, 13, [16, 6, 22, 12], 90], // Копейщик
  204: ['infantry', 94, [31, 63, 12], 10, 11, [25, 9, 33, 18], 105], // Рыцарь
  261: ['cavalry', 66, [33, 1, 8], 3, 22, [11, 4, 15, 8], 90], // Кирасир
  205: ['cavalry', 88, [44, 2, 22], 6, 18, [22, 8, 29, 15], 120], // Паладин
  264: ['cavalry', 148, [99, 19, 49], 9, 15, [32, 11, 43, 23], 135, { def: 40, mdef: 20, pop: 50 }], // Рейтар
  203: ['magic', 80, [2, 10, 40], 9, 11, [15, 5, 19, 10], 120], // Чародей
  262: ['magic', 100, [2, 25, 50], 15, 9, [27, 9, 36, 19], 150, { def: 5, mdef: 25, pop: 18 }], // Ведьмак
  263: ['magic', 165, [22, 55, 110], 23, 8, [39, 13, 52, 28], 165, { def: 15, mdef: 40, pop: 30 }], // Варлок
  259: ['cavalry', 56, [28, 1, 14], 0, 10, [16, 6, 21, 11], 120, { bldDmg: 50, oneUse: true }], // Нурух — исчезает после боя
  207: ['infantry', 40, [5, 20, 1], 3, 15, [10, 8, 3, 5], 60], // Лучник
  208: ['infantry', 60, [15, 30, 1], 7, 12, [22, 16, 6, 12], 90], // Мастер клинка
  265: ['infantry', 105, [35, 70, 14], 10, 10, [33, 25, 9, 18], 105, { def: 45, mdef: 15, pop: 45 }], // Страж границ
  266: ['cavalry', 54, [27, 1, 6], 4, 20, [15, 11, 4, 8], 90, { def: 15, mdef: 0, pop: 8 }], // Эльфийский всадник
  212: ['cavalry', 72, [36, 1, 18], 7, 16, [29, 22, 8, 15], 120], // Единорог
  211: ['cavalry', 121, [81, 16, 40], 10, 14, [43, 32, 11, 23], 135], // Кентавр
  210: ['magic', 88, [2, 11, 44], 9, 10, [19, 15, 5, 10], 120], // Созидающая
  267: ['magic', 110, [2, 27, 55], 19, 8, [36, 27, 9, 19], 150, { def: 5, mdef: 40, pop: 27 }], // Повелитель стихий
  268: ['magic', 181, [24, 60, 121], 23, 7, [52, 39, 13, 28], 165, { def: 20, mdef: 50, pop: 45 }], // Дух леса
  213: ['magic', 70, [1, 17, 35], 0, 10, [26, 19, 7, 14], 150, { bldDmg: 63, oneUse: true }], // Энт — исчезает после боя
  214: ['infantry', 44, [5, 22, 1], 4, 14, [3, 10, 8, 5], 60], // Топорщик
  215: ['infantry', 66, [16, 33, 1], 8, 11, [6, 22, 16, 12], 90], // Арбалетчик
  219: ['infantry', 115, [38, 77, 15], 12, 9, [9, 33, 25, 18], 105], // Револьверщик
  218: ['cavalry', 60, [30, 1, 7], 4, 18, [4, 15, 11, 8], 90], // Защитник гор
  269: ['cavalry', 80, [40, 2, 20], 8, 14, [8, 29, 22, 15], 120, { def: 25, mdef: 5, pop: 15 }], // Грифоний наездник
  270: ['cavalry', 135, [90, 18, 45], 11, 13, [11, 43, 32, 23], 135, { def: 40, mdef: 20, pop: 45 }], // Топтун
  216: ['magic', 72, [1, 9, 36], 10, 9, [5, 19, 15, 10], 120], // Жрец рун
  271: ['magic', 90, [2, 22, 45], 19, 7, [9, 36, 27, 19], 150, { def: 5, mdef: 30, pop: 25 }], // Громовержец
  256: ['magic', 148, [19, 49, 99], 31, 6, [13, 52, 39, 28], 165], // Механический центурион
  220: ['infantry', 42, [10, 21, 1], 0, 10, [5, 16, 12, 9], 90, { bldDmg: 37, oneUse: true }], // Йети — исчезает после боя
  245: ['infantry', 32, [4, 16, 0], 3, 18, [5, 3, 5, 8], 48], // Мародёр
  247: ['infantry', 48, [12, 24, 1], 4, 14, [10, 6, 11, 18], 72], // Бугай
  246: ['infantry', 84, [28, 56, 11], 7, 12, [15, 10, 16, 28], 84], // Урук-хай
  272: ['cavalry', 48, [24, 1, 6], 3, 24, [7, 4, 7, 12], 72, { def: 15, mdef: 0, pop: 6 }], // Варг
  273: ['cavalry', 64, [32, 1, 16], 4, 19, [13, 8, 14, 24], 96, { def: 25, mdef: 5, pop: 15 }], // Загонщик
  274: ['cavalry', 108, [72, 14, 36], 7, 17, [19, 12, 21, 36], 108, { def: 40, mdef: 20, pop: 45 }], // Потрошитель
  253: ['magic', 64, [1, 8, 32], 6, 12, [9, 6, 9, 16], 96], // Осквернитель
  275: ['magic', 80, [2, 20, 40], 10, 10, [16, 10, 17, 30], 120, { def: 5, mdef: 25, pop: 18 }], // Заклинатель
  248: ['magic', 132, [17, 44, 88], 20, 8, [23, 15, 25, 44], 132], // Шаман
  249: ['infantry', 33, [8, 16, 1], 0, 10, [7, 5, 8, 13], 72, { bldDmg: 30, oneUse: true }], // Кулак ярости — исчезает после боя
};
for (const [id, [type, hp, a3, carry, speed, cost, sec, x = {}]] of Object.entries(SPRAVKA)) {
  const u = UNIT[id]; if (!u) continue;
  const avg = Math.round((a3[0] + a3[1] + a3[2]) / 3);
  Object.assign(u, { type, hp, carry: carry * CARRY_K, speed, attack: type === 'magic' ? 0 : avg, magic: type === 'magic' ? avg : 0, a3: { inf: a3[0], cav: a3[2], mag: a3[1] },
    tc: Object.fromEntries(RES4.map((r, i) => [r, cost[i] * SPRAVKA_K * (x.bldDmg ? WRECK_K : 1)])), tt: sec * SPRAVKA_K * (x.bldDmg ? WRECK_K : 1) });
  if (x.def !== undefined) u.def = { inf: x.def, cav: x.def, mag: x.mdef };
  if (x.pop) Object.assign(u, { pop: x.pop, upkeep: Math.max(1, Math.round(x.pop / 3)) });
  if (x.bldDmg) u.bldDmg = x.bldDmg;
  if (x.oneUse) u.oneUse = true;
}
// разрушители зданий (Мастерская): цена в сумме у всех 780 (в ресурсах своей расы), 20 мин; сила равная по сумме,
// но у каждой расы свой упор: люди — быстрее и крепче в защите, эльфы — живучий маг, гномы — бронированный, орки — бьют сильнее
// оценка: жизнь + 3×атака + 1,5×средняя защита + урон зданиям + 2×скорость ≈ 180 у всех
const WRECK = { total: 780, time: 1200, pop: 85, units: {
  259: { hp: 48, pow: 13, def: 24, mdef: 6, bldDmg: 44, speed: 11 }, // Нурух
  213: { hp: 59, pow: 12, def: 20, mdef: 10, bldDmg: 42, speed: 9 }, // Энт
  220: { hp: 52, pow: 12, def: 26, mdef: 5, bldDmg: 46, speed: 9 }, // Йети
  249: { hp: 45, pow: 15, def: 20, mdef: 5, bldDmg: 48, speed: 10 }, // Кулак ярости
} };
for (const [id, w] of Object.entries(WRECK.units)) {
  const u = UNIT[id], sum = RES4.reduce((q, r) => q + u.tc[r], 0);
  const cost = Object.fromEntries(RES4.map((r) => [r, Math.round(u.tc[r] * WRECK.total / sum)]));
  Object.assign(u, { hp: w.hp, attack: u.type === 'magic' ? 0 : w.pow, magic: u.type === 'magic' ? w.pow : 0, def: { inf: w.def, cav: w.def, mag: w.mdef },
    bldDmg: w.bldDmg, speed: w.speed, pop: WRECK.pop, upkeep: Math.round(WRECK.pop / 3), tc: cost, tt: WRECK.time, a3: { inf: w.pow, cav: w.pow, mag: w.pow } });
}
// специализация (значок в «Справке», с 24.10): A — атакующий (🪓, в обороне бьёт вдвое слабее), D — защитник (🛡, при нападении — вдвое
// слабее), U — универсал (бьёт в полную силу всегда); кого нет в списке — универсал
const SPEC = {
  200: 'A', 201: 'U', 204: 'D', 261: 'U', 205: 'D', 264: 'A', 203: 'D', 262: 'A', 263: 'U', 259: 'A', // люди
  207: 'D', 208: 'A', 265: 'U', 266: 'A', 212: 'U', 211: 'D', 210: 'U', 267: 'D', 268: 'A', 213: 'A', // эльфы
  214: 'U', 215: 'D', 219: 'A', 218: 'D', 269: 'A', 270: 'U', 216: 'A', 271: 'U', 256: 'D', 220: 'A', // гномы
  245: 'U', 247: 'D', 246: 'A', 272: 'D', 273: 'A', 274: 'U', 253: 'A', 275: 'U', 248: 'D', 249: 'A', // орки
};
const SPEC_K = 0.5;
const FORGE_K = 0.05; // Кузница и Школа магии: +5% урона (атака, маг. атака) или здоровья (защита — против воинов, маг. защита — против магов) за уровень
const CLS = (t) => (t === 'cavalry' ? 'cav' : t === 'magic' ? 'mag' : 'inf'); // род войск для ударов: осадные и мирные — как пехота
// охрана лагерей, руин, Подземелья и логов: урон — атака и магия поровну по всем родам; защита — множитель здоровья (1 + защита / NPC_ARM)
const NPC_DMG = 1, NPC_ARM = 20;
for (const u of UNITS) u.spec = SPEC[u.id] || 'U';
// три атаки воина: по пехоте, по коннице, по магам (у кого их нет в «Справке» — атака и магия поровну по всем)
const a3Of = (u) => { if (u.a3) return u.a3; const v = (u.attack || 0) + (u.magic || 0); return { inf: v, cav: v, mag: v }; };
// уникальные воины — только награда заданий и походов (в Кладовой), не тренируются. На 20% сильнее своего прообраза расы
// (здоровье, атака, магия, защита), скорость, груз, население и содержание — как у прообраза. Картинка — gfx/units/uniq/<key>.png,
// пока её нет — картинка прообраза. slot: inf / cav / mag — так задания выдают их любой расе.
const UNIQUE = [
  [300, 'Гвардеец короны', 'humans', 200, 'inf', 'h_guard'], [301, 'Королевский кирасир', 'humans', 261, 'cav', 'h_cuir'], [302, 'Придворный чародей', 'humans', 203, 'mag', 'h_mage'],
  [303, 'Страж рощи', 'elves', 208, 'inf', 'e_guard'], [304, 'Лунный кентавр', 'elves', 211, 'cav', 'e_cent'], [305, 'Хранительница рощи', 'elves', 210, 'mag', 'e_mage'],
  [306, 'Громовой топорщик', 'dwarves', 214, 'inf', 'd_axe'], [307, 'Чемпион гор', 'dwarves', 218, 'cav', 'd_champ'], [308, 'Рунный мастер', 'dwarves', 216, 'mag', 'd_rune'],
  [309, 'Кровавый мародёр', 'orcs', 245, 'inf', 'o_mar'], [310, 'Вожак урук-хаев', 'orcs', 246, 'cav', 'o_uruk'], [311, 'Тёмный осквернитель', 'orcs', 253, 'mag', 'o_defl'],
];
const UNIQ_K = 1.2;
for (const [id, name, race, base, slot, key] of UNIQUE) {
  const b = UNIT[base], k = (v) => Math.round(v * UNIQ_K);
  const img = require('./gfxpack').exists(path.join(__dirname, '..', '..', 'web'), `gfx/units/uniq/${key}.png`) ? `uniq/${key}` : b.img;
  const u = { ...b, id, name, race, img, base, slot, quest: true, notrain: true, hp: k(b.hp), attack: k(b.attack), magic: k(b.magic), def: { inf: k(b.def.inf), cav: k(b.def.cav), mag: k(b.def.mag) },
    a3: Object.fromEntries(Object.entries(a3Of(b)).map(([c, v]) => [c, k(v)])) };
  UNITS.push(u); UNIT[id] = u;
}
// нежить — только из сундуков Лавки (Сокровища), служит любой расе. Сильнее любого воина игры: атака (у Лича — магия), защита и здоровье
// выше, чем у самых сильных (Изувер: атака 263, здоровье 227; Джин: защита 63). Не тренируется, не ест, не лечится в Лазарете,
// генералом не становится (как уникальные воины заданий — quest). Картинка — gfx/units/undead/<key>.png
const UNDEAD = [
  // id, имя, картинка, род войск, здоровье, атака, магия, защита [пехота, кавалерия, магия], скорость, груз, население
  [320, 'Скелет-латник', 'skeleton', 'infantry', 250, 280, 0, [70, 70, 55], 8, 100, 75],
  [321, 'Рыцарь смерти', 'death_knight', 'cavalry', 320, 340, 45, [80, 85, 60], 14, 150, 90],
  [322, 'Лич', 'lich', 'magic', 260, 40, 300, [70, 70, 90], 8, 60, 75],
  [323, 'Костяной дракон', 'bone_dragon', 'cavalry', 1000, 650, 160, [130, 130, 110], 16, 300, 200],
];
for (const [id, name, key, type, hp, attack, magic, [inf, cav, mag], speed, carry, pop] of UNDEAD) {
  const u = { id, name, race: 'all', img: `undead/${key}`, role: 'undead', building: null, level: 0, req: {}, spy: 0, type, hp, attack, magic, def: { inf, cav, mag },
    speed, carry, upkeep: 0, pop, cost: { wood: 0, stone: 0, iron: 0, food: 0 }, time: 0, undead: true, quest: true, notrain: true };
  UNITS.push(u); UNIT[id] = u;
}
const uniqueFor = (race, slot) => UNITS.find((u) => u.quest && u.race === race && u.slot === slot);
// у общих юнитов цена бывает разной по расам (скрины оригинала): Путешественник у орков — 5000/5000/5000/7500
UNIT[224].raceOvr = { orcs: { cost: { wood: 5000, stone: 5000, iron: 5000, food: 7500 } }, elves: { cost: { wood: 7500, stone: 5000, iron: 5000, food: 5000 } } };
UNIT[233].raceOvr = { elves: { cost: { wood: 13316, stone: 10412, iron: 12012, food: 24031 } }, humans: { cost: { wood: 10412, stone: 12012, iron: 13316, food: 24031 } } }; // Бунтарь у эльфов и людей
// цена и время тренировки всех воинов — вдвое меньше оригинала (и у разных рас — тоже). refCost / refTime — прежние:
// от них считаются Кузница, наём и воскрешение генерала (их не меняли); лечение в Лазарете — четверть новой цены
const halfCost = (c) => Object.fromEntries(Object.entries(c).map(([r, v]) => [r, Math.round(v / 2)]));
for (const u of UNITS) { if (!u.spec) u.spec = 'U'; if (!u.a3) u.a3 = { ...a3Of(u) }; } // всем — специализация и три атаки (нежить, генерал, общие воины)
for (const u of UNITS) if (u.id !== GENERAL_ID && !u.undead) {
  if (u.tc) { Object.assign(u, { refCost: u.cost, refTime: u.time, cost: u.tc, time: u.tt }); delete u.tc; delete u.tt; continue; } // «Справка» ×4
  Object.assign(u, { refCost: u.cost, refTime: u.time, cost: halfCost(u.cost), time: Math.round(u.time / 2) });
  for (const o of Object.values(u.raceOvr || {})) if (o.cost) Object.assign(o, { refCost: o.cost, cost: halfCost(o.cost) });
}
const ORDER_MAX = { 224: 3, 233: 3 }; // Путешественник, Бунтарь: не больше 3 за один заказ (оригинал: «Количество: … /3»)
const raceUnit = (u, race) => (u && u.raceOvr && u.raceOvr[race] ? { ...u, ...u.raceOvr[race] } : u);
const unitsForRace = (race) => UNITS.filter((u) => u.race === race || u.race === 'all');
// генерал как в оригинале: за уровень — очки опыта, игрок распределяет их в окне «Генерал».
// С 27.10 генерал — из воина и бьётся как этот воин (новая боевая система, «Справка → Генерал» оригинала): род войск, удары по пехоте,
// коннице и магам, специализация и здоровье — воина (как на скринах оригинала: генерал из Мечника бьёт 4/0/18, как Мечник).
// Личная атака — +2,5% к ударам за очко; Личной защиты нет. Командование атакой/защитой — армии, где генерал (cmdBonus, с убывающей
// отдачей); восстановление — воскрешение быстрее на 1% за очко; карьера — +0,5% опыта за очко. Как в оригинале: чем сильнее воин
// (среди воинов своей расы, genPow), тем выше потолки командования, восстановления и карьеры, но тем медленнее опыт и дольше воскрешение (GEN_RANGE)
const GEN = { battleCap: 0.15, dayLevels: 1, perLevel: 2, maxLevel: 500, revive: 0.5, cmdK: 300, heal: 0.01, career: 0.005, resetGold: 5, atkPt: 0.025, a3K: 1, hpK: 1 }; // a3K, hpK — удары и здоровье генерала к воину
// от слабейшего воина расы к сильнейшему: потолок командования, очков восстановления и карьеры; множитель опыта; время воскрешения
const GEN_RANGE = { cmd: [0.3, 0.5], heal: [30, 50], career: [60, 100], xp: [1.5, 1], revive: [0.75, 1.25] };
const genLerp = ([a, b], s) => a + (b - a) * s;
// с 25 уровня прокачка тяжелее и дороже: каждый уровень требует больше опыта (+25% за каждый уровень сверх 24-го:
// 25-й — ×1,25, 30-й — ×2,5, 40-й — ×5 к прежней шкале), за бой — не больше 10% уровня, за сутки — не больше полуровня.
// Игрокам лимиты не показываются (ни в окне «Генерал», ни в отчётах)
const GEN_HARD = { from: 25, k: 0.25, battle: 0.10, day: 0.5 };
// воскрешение генерала: REVIVE_GOLD монет за уровень (100 ур. — 100 монет; до 21.10 — 3 монеты за каждые 25 уровней, 100 ур. — 12:
// смерть ничего не стоила); выше REVIVE_RES_MAX уровня — только за монеты
const REVIVE_GOLD = 1, REVIVE_RES_MAX = 100;
// время воскрешения за ресурсы — (уровень + 10) × 3 минуты: 10 ур. — 1 ч, 100 ур. — 5,5 ч (с 21.10 втрое дольше)
const REVIVE_MIN = 10, REVIVE_TIME_K = 3;
const GEN_HIRE_SEC = 1800, GEN_HIRE_K = 2.5, REKIND_SEC = 1800; // найм генерала: полчаса + время воина ×2,5 (Мечник — 1 ч, Мародер — 1,5 ч); смена воина — полчаса
const REKIND_GOLD = 50; // смена воина генерала — 50 монет (с 27.10, по решению владельца; было — ресурсами, как найм)
// здоровье генерала (с 27.10, по решению владельца): в бою он теряет столько процентов здоровья, сколько потеряла его армия (в нападении,
// набеге, обороне, созыве на босса), и восстанавливает GEN_HP_REGEN% в час — всем одинаково. Здоровье кончилось — генерал гибнет
// (шанс уцелеть — «Несокрушимый» и щит, как раньше: тогда остаётся 1%). Генерал защитника в набеге не гибнет — здоровье не ниже 1%
const GEN_HP_REGEN = 8;
// командование генерала (атакой/защитой): первые очки — около +0,17%, дальше отдача убывает: 100 очков — +12,5%, 300 — +25%,
// 1000 (500 ур.) — +38%, не больше +50% (с 21.10 вдвое меньше — по решению владельца: вместе с наукой, рангом, артефактами и
// снаряжением генерал давал армии ×2,8). Ещё раньше росло без предела (+299% на 500 ур.) и решало любой бой.
// С 27.10 потолок — от воина генерала: +30% у слабейшего воина расы, +50% у сильнейшего (max); числа выше — для сильнейшего
const cmdBonus = (pts, max) => (pts > 0 ? max * pts / (pts + GEN.cmdK) : 0);
// артефакты одного вида: действует только самый сильный (с 21.10 — по решению владельца; до этого второй — наполовину, третий —
// на четверть…: 4 легендарных давали +66%; ещё раньше 7 легендарных — +245%, а «ускорение обучения» уводило время ниже нуля)
const artEffects = (arts) => { const eff = new Map(), by = {};
  for (const a of arts || []) if (a.active && RARITY[a.rarity]) (by[a.type] = by[a.type] || []).push(a);
  for (const list of Object.values(by)) list.sort((x, y) => RARITY[y.rarity].bonus - RARITY[x.rarity].bonus).forEach((a, i) => eff.set(a.id, i ? 0 : RARITY[a.rarity].bonus));
  return eff; };
const GEN_STATS = ['atk', 'catk', 'cdef', 'heal', 'career']; // Личной защиты (def) с 27.10 нет
// генералом может стать воин своей расы, кроме уникальных, воинов Портала, разведчиков, бунтарей, осадных и мирных
const GEN_SKIP = ['scout', 'eye', 'rebel', 'ram', 'catapult', 'merchant', 'settler', 'sage', 'archaeologist'];
const genEligible = (u) => !!u && ['humans', 'elves', 'dwarves', 'orcs'].includes(u.race) && !u.quest && u.building !== B.PORTAL && !GEN_SKIP.includes(u.role);
// сила воина для генерала: 0 — слабейший воин своей расы, 1 — сильнейший (средний удар × здоровье, по логарифму)
const GEN_POW = (() => {
  const v = (u) => Math.max(1, (u.a3.inf + u.a3.cav + u.a3.mag) / 3 * (u.hp || 1)), out = {};
  for (const race of ['humans', 'elves', 'dwarves', 'orcs']) {
    const l = UNITS.filter((u) => u.race === race && genEligible(u)); if (!l.length) continue;
    const lo = Math.log(Math.min(...l.map(v))), hi = Math.log(Math.max(...l.map(v)));
    for (const u of l) out[u.id] = hi > lo ? Math.round((Math.log(v(u)) - lo) / (hi - lo) * 100) / 100 : 0.5;
  }
  return out;
})();
const genPow = (u) => (u && GEN_POW[u.id] !== undefined ? GEN_POW[u.id] : 0.5);
// что воин даёт генералу (без очков): удары, здоровье, род войск, специализация, потолки, множитель опыта, время воскрешения
const genProfile = (u) => {
  const s = genPow(u), A = a3Of(u);
  return { pow: s, a3: { inf: Math.round(A.inf * GEN.a3K), cav: Math.round(A.cav * GEN.a3K), mag: Math.round(A.mag * GEN.a3K) }, hp: Math.round((u.hp || 50) * GEN.hpK),
    cls: CLS(u.type), mage: u.type === 'magic', spec: u.spec || 'U', cmdMax: Math.round(genLerp(GEN_RANGE.cmd, s) * 1000) / 1000, healMax: Math.round(genLerp(GEN_RANGE.heal, s)),
    careerMax: Math.round(genLerp(GEN_RANGE.career, s)), xp: Math.round(genLerp(GEN_RANGE.xp, s) * 100) / 100, revive: Math.round(genLerp(GEN_RANGE.revive, s) * 100) / 100 };
};
// звание генерала в скобках — сильнейший боевой юнит расы (у орков «Бугай» и т. п.); этот же воин — у старых генералов без воина
const genKindUnit = (race) => UNITS.filter((u) => u.race === race && !u.quest && !u.notrain && ['infantry', 'cavalry'].includes(u.type)).sort((a, b) => b.attack - a.attack)[0] || null;
const genKind = (race) => { const u = genKindUnit(race); return u ? u.name : 'Генерал'; };
const unitImg = (u, race) => `units/${u.race === 'all' && !u.img.includes('/') ? `${RACE_DIR[race]}/${u.img}` : u.img}.png`;

// ---------- науки (Университет; иконки smallicon/*science.png) ----------
// у каждой науки: процент за уровень + вехи на 5/10/15/20 ур. с отдельным бонусом (они видны в «Информации о науке»)
const SCIENCES = {
  eco: { name: 'Экономика', icon: 'hd/sci_eco', flask: 'yellow', sub: 'Добыча ресурсов и торговля.', desc: '+0,87% добычи ресурсов и +0,37% людей за уровень', per: 0.0087, // вся наука (20 ур. + «Мастерство хозяйства» +5%) — ×1,233: полные земли 852 → 1050 в час, как в оригинале
    about: 'Развитие земледелия, лесозаготовки, каменных работ и рудников. Каждый уровень увеличивает добычу всех ресурсов, а на 5, 10, 15 и 20 уровнях открываются хозяйственные улучшения.',
    eff: (l) => `Добыча ресурсов +${(0.87 * l).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%, людей +${(0.37 * l).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%.`,
    miles: { 5: [{ tradeCarry: 0.1 }, 'Торговцы везут на 10% больше.'], 10: [{ hidden: 0.25 }, 'Тайник прячет на 25% больше.'], 15: [{ tradeCarry: 0.1 }, 'Торговцы везут ещё +10%.'], 20: [{ prod: 0.05 }, 'Мастерство хозяйства: добыча ещё +5%.'] } },
  // наука пересчитана (была слишком сильной): полностью изученная даёт умеренный бонус, вехи — небольшие и не про бой
  eng: { name: 'Инженерия', icon: 'hd/sci_eng', flask: 'green', sub: 'Строительство и укрепления замка.', desc: '−1% времени строительства за уровень', per: 0.01,
    about: 'Наука о строительстве, чертежах и укреплениях. Каждый уровень сокращает время строительства, а на 5, 10, 15 и 20 уровнях укрепляет забор и ускоряет стройку.',
    eff: (l) => `Время строительства −${l}%.`,
    miles: { 5: [{ wall: 0.05 }, 'Забор защищает на 5% сильнее.'], 10: [{ build: 0.025 }, 'Улучшенные чертежи: стройка ещё −2,5%.'], 15: [{ wall: 0.05 }, 'Забор защищает ещё +5%.'], 20: [{ build: 0.025 }, 'Мастерство архитекторов: стройка ещё −2,5%.'] } },
  fhi: { name: 'Физика', icon: 'hd/sci_phy', flask: 'blue', sub: 'Скорость армий и торговцев.', desc: '+1,25% скорости армий и торговцев за уровень', per: 0.0125,
    about: 'Изучение механики, дорог и повозок. Каждый уровень ускоряет армии и торговцев в пути, а на 5, 10, 15 и 20 уровнях открываются дополнительные ускорения.',
    eff: (l) => `Скорость армий и торговцев +${(1.25 * l).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%.`,
    miles: { 5: [{ tradeSpeed: 0.05 }, 'Торговцы быстрее ещё на 5%.'], 10: [{ speed: 0.025 }, 'Лёгкие повозки: армии быстрее ещё на 2,5%.'], 15: [{ tradeSpeed: 0.05 }, 'Торговцы быстрее ещё на 5%.'], 20: [{ speed: 0.025 }, 'Мастерство дорог: армии быстрее ещё на 2,5%.'] } },
  // военное дело: 20 ур. — ровно +26% атаки и защиты (максимум); вехи — только про тренировку войск
  war: { name: 'Военное дело', icon: 'hd/sci_war', flask: 'red', sub: 'Армии, походы и подготовка войск.', desc: '+1,3% атаки и защиты войск за уровень', per: 0.013,
    about: 'Развитие вооружения и военной подготовки. Каждый уровень усиливает атаку и защиту всех войск замка (на 20 уровне — +26%), а на 5, 10, 15 и 20 уровнях ускоряется подготовка войск.',
    eff: (l) => `Атака и защита войск +${(1.3 * l).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%.`,
    miles: { 5: [{ train: 0.02 }, 'Строевая подготовка: тренировка войск −2% времени.'], 10: [{ train: 0.02 }, 'Опытные наставники: тренировка ещё −2%.'], 15: [{ train: 0.03 }, 'Военные лагеря: тренировка ещё −3%.'], 20: [{ train: 0.03 }, 'Мастерство полководцев: тренировка ещё −3%.'] } },
};
for (const s of Object.values(SCIENCES)) s.levels = Array.from({ length: 20 }, (_, i) => ({ l: i + 1, text: s.eff(i + 1), mile: s.miles[i + 1] ? s.miles[i + 1][1] : '' }));
// суммарные бонусы вех изученных наук
function scienceMiles(sci) {
  const m = { atk: 0, def: 0, prod: 0, speed: 0, build: 0, train: 0, wall: 0, hidden: 0, tradeCarry: 0, tradeSpeed: 0 };
  for (const [k, s] of Object.entries(SCIENCES)) for (const [l, [fx]] of Object.entries(s.miles)) if ((sci[k] || 0) >= Number(l)) for (const [f, v] of Object.entries(fx)) m[f] += v;
  return m;
}
// цена науки: до 13 ур. — 400 × 1,45^ур.; с 14 ур. — от 55 000 до 73 000 (+3 000 за уровень), чтобы влезать в Склад (полный — 95 000);
// дальше дороже становится время (scienceTime)
const scienceCost = (lvl) => { const k = lvl <= 13 ? Math.round(400 * 1.45 ** lvl / 10) * 10 : 55000 + (lvl - 14) * 3000; return { wood: k, stone: k, iron: k, food: k }; };
const scienceTime = (lvl) => Math.round(600 * 1.35 ** lvl);

// ---------- религии (Храм) ----------
const RELIGIONS = {
  light: { name: 'Свет', desc: '+1% к защите за уровень Храма' },
  nature: { name: 'Природа', desc: '+1% к добыче всех ресурсов за уровень Храма' },
  war: { name: 'Война', desc: '+1% к атаке за уровень Храма' },
};

// ---------- артефакты (Экспедиция → Сокровищница → Башня артефактов) ----------
const ART_TYPES = {
  atk: { name: 'Меч героя', desc: 'атака войск' },
  def: { name: 'Щит предков', desc: 'защита войск' },
  prod: { name: 'Рог изобилия', desc: 'добыча ресурсов' },
  speed: { name: 'Крылатые сапоги', desc: 'скорость армий' },
  train: { name: 'Свиток мастера', desc: 'скорость тренировки' },
  // артефакты Подземелья (dungeon.js): у каждого своё действие и срок (hours), без редкости; def — защитный: его нельзя пробудить,
  // когда на замок уже идёт вражеская армия; пробудить тот же вид снова можно лишь через ART_CD часов после прошлого пробуждения
  cloak: { name: 'Покров Безмолвия', desc: 'замок нельзя разведать: чужая разведка проваливается', hours: 8, special: true, def: true },
  eye: { name: 'Око Призрака', desc: 'ваши разведчики невидимы: противник не узнаёт о разведке', hours: 12, special: true },
  claw: { name: 'Коготь Полководца', desc: 'атака генерала ×2', hours: 12, special: true },
  // seal, heart, hand — «стена» (wall): в замке одновременно действует только один из них (с 24.10 — вместе делали замок неприступным)
  seal: { name: 'Печать Нерушимости', desc: 'разрушители (тараны, катапульты, ломающие здания воины) бьют по замку вдвое слабее', hours: 12, special: true, def: true, wall: true },
  heart: { name: 'Сердце Твердыни', desc: 'защита Забора ×1,5', hours: 12, special: true, def: true, wall: true },
  hand: { name: 'Длань Хранителя', desc: '+15% к защите войск в замке', hours: 12, special: true, def: true, wall: true },
  coin: { name: 'Монета Древних Королей', desc: 'пробудите — получите 1 монету', special: true, coin: true },
};
const ART_BASIC = ['atk', 'def', 'prod', 'speed', 'train']; // обычные артефакты (с редкостью) — для сундуков, заданий и Лавки
const ART_ACTIVE_MAX = 3; // пробуждённых артефактов в замке одновременно — не больше трёх (Башня артефактов 6 ур. и выше)
const ART_CD = 24; // часов между пробуждениями артефактов Подземелья одного вида в одном замке
const RARITY = [{ name: 'обычный', bonus: 0.10 }, { name: 'редкий', bonus: 0.20 }, { name: 'легендарный', bonus: 0.35 }];
// пробуждённый артефакт действует ограниченное время (часы по редкости, делятся на скорость мира), затем рассыпается
const ART_HOURS = [12, 24, 48];
// спящий артефакт можно разбить на осколки: место в Сокровищнице освобождается, взамен — немного каждого ресурса (по редкости)
const ART_BREAK = [300, 800, 2000];
// экспедиции из здания «Экспедиция»: археологи уходят на время; дальше — выше шанс и редкость, но опаснее
// шанс находки: chance + EXPED_PER за археолога + 3% за ур. Лагеря археологов + 2% за ур. Экспедиции, не больше EXPED_CAP
// (было 25/40/55%, +2% за археолога, до 95% — новички набирали слишком много артефактов)
const EXPED = {
  near: { name: 'Окрестные руины', hours: 2, chance: 0.15, bias: 0, risk: 0, lvl: 1, desc: 'Ближние развалины. Безопасно, но находки скромные.' },
  city: { name: 'Древний город', hours: 6, chance: 0.3, bias: 0.12, risk: 0.1, lvl: 3, desc: 'Засыпанные песком улицы. Бывают обвалы — часть археологов может не вернуться.' },
  tomb: { name: 'Затерянная гробница', hours: 12, chance: 0.45, bias: 0.25, risk: 0.25, lvl: 6, desc: 'Ловушки и проклятия древних королей. Здесь чаще всего находят легендарные реликвии.' },
};
const EXPED_PER = 0.01, EXPED_CAP = 0.8;
// раскопки в руинах на карте (Заброшенный замок): 10% + 1% за археолога + бонусы зданий, не больше 50% (было 20% + 5%, до 95%)
const RUINS = { chance: 0.1, per: 0.01, cap: 0.5 };
const rndPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const EXPED_MAXN = 20; // больше 20 археологов в одну экспедицию — без толку

// ---------- NPC-объекты мира: охрана и добыча ----------
// img — тайл клиента; def — сила охраны против пехоты/кавалерии/магии; loot — запас ресурсов (восстанавливается)
const NPC = {
  // охрана — в том же масштабе, что и юниты (сила атаки воина: мечник 10, рыцарь 45)
  // лагеря разбойников — боты трёх уровней сложности, в каждой провинции по одному (game.js PROV_NPC); добыча скромная (не заменяет свою экономику).
  // Были слишком слабые (тяжёлый — ~150 мечников): охрана ×3 / ×6 / ×10, руины — ×4.
  // В бою с лагерем и руинами потери победителя вдвое меньше (CAMP_LOSS), павшие уходят в Лазарет.
  // Добыча с 21.10 в 4 раза меньше (тяжёлый лагерь — 40 000 вместо 160 000, руины — 27 500 вместо 110 000): лагеря каждый час
  // давали больше своей экономики — по решению владельца; лагеря и руины возвращаются через 3 часа (с 22.10; был час)
  // 22.10 охрана подогнана под новых юнитов (Справка, перенос ×10): армия своего уровня (смешанная: пехота, конница, маги) грабит с прибылью около +20%;
  // шаманов (mag) больше — иначе маги грабили с +60%, а пехота в минус
  30: { name: 'Лагерь разбойников (лёгкий)', level: 'Лёгкий', cntK: 0.9, def: { inf: 100, cav: 90, mag: 190 }, loot: { wood: 250, stone: 250, iron: 175, food: 325 } },
  31: { name: 'Лагерь разбойников (средний)', level: 'Средний', cntK: 0.53, def: { inf: 1070, cav: 950, mag: 1600 }, loot: { wood: 1875, stone: 1875, iron: 1500, food: 2250 } },
  32: { name: 'Лагерь разбойников (тяжёлый)', level: 'Тяжёлый', cntK: 0.24, def: { inf: 6300, cav: 5750, mag: 8800 }, loot: { wood: 10000, stone: 10000, iron: 8750, food: 11250 } },
  24: { name: 'Заброшенный замок', cntK: 0.24, def: { inf: 4450, cav: 4050, mag: 6150 }, loot: { wood: 6875, stone: 6875, iron: 6875, food: 6875 }, ruins: true },
};
const NPC_REGEN_SEC = 3 * 3600; // запас руин восстанавливается за 3 часа (с 22.10; было час) — игроку время не показывается
// в бою с лагерем разбойников и руинами победитель терял вдвое меньше; с 24.10 (бой как в оригинале) победитель и так теряет меньше —
// множитель 1 (cntK у лагерей — численность охраны: смешанная армия своего уровня грабит с прибылью около +20%, как прежде)
const CAMP_LOSS = 1;
const CAMPS = [30, 31, 32]; // лагеря разбойников: лёгкий, средний, тяжёлый
// бой (как в Travian): сила атаки против защиты, смешанной по составу нападающих; лечение раненых дома
const HEAL_HOME = 0.25; // раненые защитники в своём замке: четверть павших выздоравливает (если замок устоял или это набег)
// Лазарет (здание 41, бывшая Пивоварня): свои павшие в нападениях и набегах из этого замка и при его обороне попадают сюда ранеными —
// INFIRM_CAP мест за уровень (10 ур. — 10 000); лечение — за HEAL_K цены тренировки (четверть; до 20.10 — половина), сразу (если хватает ресурсов),
// вне дневного лимита TRAIN_DAY. Ранеными становится INFIRM_SHARE павших — половина, вторая половина гибнет насовсем (с 21.10 — по
// решению владельца: раньше в Лазарет шли все павшие, и разбитая армия возвращалась почти целиком)
const INFIRM_CAP = 1000, HEAL_K = 0.25, INFIRM_SHARE = 0.5;
// очки боевого ранга: мирные юниты — без очков, раненые (в Лазарет и выздоровевшие дома) — за четверть (army.js rankPop)
const RANK_NONE = ['merchant', 'settler', 'sage', 'archaeologist', 'rebel'], RANK_WOUND = 0.25;
const ROW = { infantry: 3, cavalry: 2, magic: 1, siege: 1, special: 1 }, DMG = 2, ROUT = 0.3; // бой с боссом (clashHp): ряды строя, множитель урона, бегство
// Новые правила боя (проба, включает администратор: db.battleRules.on; P.newBattle): Кузница и Школа магии — у всех воинов
// до 20 уровня по каждому параметру (с 25.10; раньше — не больше половины старого параметра, у Шамана атака стояла на 6);
// тараны ломают Забор, только если нападение победило; подкрепления — со своими бонусами (от чужого замка — Забор и защита замка);
// против магии у кого нет защиты от магии — ¾ обычной защиты (было ½); удача нападающего ±5% (было ±10%)
const FORGE_TOP = 19; // +19 улучшений — 20-й уровень (уровень показывается с 1)
const forgeCaps = () => ({ a: FORGE_TOP, d: FORGE_TOP, m: FORGE_TOP, md: FORGE_TOP });
const DEF_RANK_K = 0; // очки боевого ранга — только за нападения и набеги: защитнику за разбитых нападающих — ничего (с 24.10)
const DEF_HOME = 1.1; // замок помогает своим защитникам (и подкреплениям в нём): защита ×1,1 (с 24.10; до 23.10 — ×1,75, потом ×1,25: обычный игрок брал замок соседа лишь армией в 1,5–2,5 раза больше и терял почти всю)
// Забор: +% к защите за уровень по расе (с 24.10 — вдвое меньше: на 20 ур. было +40–70%)
const WALL_PER = { humans: 0.015, elves: 0.0175, dwarves: 0.01, orcs: 0.0125 };
const LOSS_POW = 1.5; // бой как в Travian: потери победителя = (слабая сторона / сильная)^1,5
const wallHp = (L) => Math.round(40 * 1.2 ** L); // прочность одного уровня Забора (таран — 50 урона)
const bldHp = (bid, L) => Math.round(((C.BY_ID[bid] && C.BY_ID[bid].hp) || 600) * (0.5 + 0.1 * L)); // прочность уровня здания
// охрана лагерей, руин и Подземелья (с 24.10) — обычные воины из тренировок (разбойничья шайка из разных рас): пехота, конница и маги
// по уровню лагеря; численность — из прежней силы охраны (def), здоровье подогнано множителем hpK. Логова «Тёмных земель» — свои чудища (quests.js)
const BANDITS = [
  { upTo: 500, inf: 245, cav: 272, mag: 203 }, // Мародёр, Варг, Чародей
  { upTo: 3000, inf: 201, cav: 218, mag: 271 }, // Копейщик, Защитник гор, Громовержец
  { upTo: Infinity, inf: 204, cav: 270, mag: 267 }, // Рыцарь, Топтун, Повелитель стихий
];
function npcGarrison(npc) {
  if (!npc) return [];
  if (npc.garrison) return npc.garrison.map((g) => ({ ...g }));
  const t = BANDITS.find((b) => npc.def.inf < b.upTo);
  const k = npc.cntK || 1; // cntK — численность подогнана под прежнюю сложность (здоровье у воинов — обычное)
  return [['inf', t.inf, npc.def.inf / 20], ['cav', t.cav, npc.def.cav / 20], ['mag', t.mag, npc.def.mag / 30]]
    .map(([, id, n]) => ({ key: id, unitId: id, name: UNIT[id].name, n: Math.max(1, Math.round(n * k)) }));
}
const NEWBIE_RATING = Number(process.env.NEWBIE_RATING || 100); // (прежнее правило по рейтингу — больше не используется)
// защита новичка: ровно NEWBIE_DAYS дней с регистрации (по умолчанию 3); нападёт сам на игрока — защита снимается

// Центр разведки: какой уровень здания открывает пункт и какая доля разведчиков должна выжить
const UP = {
  a: { name: 'атака', bld: B.SMITH, c: 0.88, g: 1.2355 }, d: { name: 'защита', bld: B.SMITH, c: 0.8756, g: 1.2185 },
  m: { name: 'магическая атака', bld: B.MAGIC_SCHOOL, c: 0.86, g: 1.25 }, md: { name: 'магическая защита', bld: B.MAGIC_SCHOOL, c: 1.01, g: 1.209 },
};
const UP_CAP = 72000; // улучшение не дороже 72 000 одного ресурса — влезает в Склад (полный — 95 000)
const SPY_OPEN = {
  armies: { name: 'Армий в замке', level: 1, survive: 0, cond: 'выжил хотя бы 1 разведчик' },
  res: { name: 'Ресурсов', level: 4, survive: 0.5, cond: 'выжило больше 50% разведчиков' },
  build: { name: 'Зданий', level: 8, survive: 0.7, cond: 'выжило больше 70% разведчиков' },
  riot: { name: 'Бунта', level: 12, survive: 0.85, cond: 'выжило больше 85% разведчиков' },
  reinf: { name: 'Подкреплений', level: 16, survive: 0.9, cond: 'выжило больше 90% разведчиков' },
};
const HOSTILE = ['attack', 'raid', 'scout']; // враждебные походы — не на союзников по альянсу
const MISSIONS = { raid: 'Набег', attack: 'Нападение', reinforce: 'Подкрепление', scout: 'Разведка', expedition: 'Экспедиция', trade: 'Торговля', settle: 'Освоение', rally: 'Созыв', rune: 'Сбор руны', dig: 'Раскопки', dsteal: 'Налёт в Подземелье' }; // dig, dsteal — Подземелье (dungeon.js)
// «Освоение»: 10 путешественников идут на пустую клетку и строят там замок 3 дня (недострой виден на карте, его можно атаковать
// и подкреплять; победное нападение, в котором выжили 3 путешественника, забирает недострой). Лояльность населения (Резиденция)
// должна позволять новый замок; списывается она, когда замок достроен, — у того, чей он в этот момент
const SETTLE_N = 10, SETTLE_TAKE = 3, SETTLE_SEC = Math.round(3 * 86400 / SPEED), TRAVELER_ID = 224;

function install(Game, helpers) {
  const P = Game.prototype;
  const { buildTime } = helpers;

  // ----- состояние замка (добавляется лениво, старые базы подхватываются) -----
  // науки игрока: одни на все замки, хранятся у игрока; при первом обращении — лучший уровень из всех его замков (прежние науки каждого замка)
  // защита новичка: NEWBIE_DAYS дней с регистрации (у всех, кто зарегистрировался позже, — сама); админ и боты — без неё
  P.newbieUntil = function newbieUntil(u) { const d = Number(process.env.NEWBIE_DAYS ?? 3); return !u || u.admin || u.bot || u.newbieOff || !d ? 0 : (u.created || 0) + d * 86400000; };
  P.isNewbie = function isNewbie(u, now = Date.now()) { return this.newbieUntil(u) > now; };
  P.newbieLeftText = function newbieLeftText(u, now = Date.now()) { const ms = this.newbieUntil(u) - now, h = Math.ceil(ms / 3600000); return h >= 24 ? `${Math.floor(h / 24)} дн. ${h % 24} ч.` : `${Math.max(1, h)} ч.`; };
  P.sciOf = function sciOf(castle) {
    const u = this.userById(castle.owner), z = { eco: 0, eng: 0, fhi: 0, war: 0 };
    if (!u) return castle.sciences || z;
    if (!u.sciences) { u.sciences = z; for (const c of this.castlesOf(u)) for (const k of Object.keys(z)) u.sciences[k] = Math.max(u.sciences[k], (c.sciences && c.sciences[k]) || 0); }
    return u.sciences;
  };
  P.mil = function mil(castle) {
    if (!castle.units) castle.units = {};
    if (!castle.training) castle.training = [];
    if (!castle.armies) castle.armies = [];
    castle.sciences = this.sciOf(castle); // науки — общие на все замки игрока (изучаются в столице)
    if (!castle.artifacts) castle.artifacts = [];
    if (!castle.expeds) castle.expeds = [];
    { const now = Date.now(); // пробуждённые артефакты: срок действия; истёкшие рассыпаются
      for (const a of castle.artifacts) if (a.active && !a.until) a.until = now + ((ART_TYPES[a.type] || {}).hours || ART_HOURS[a.rarity || 0]) * 3600000 / SPEED;
      const gone = castle.artifacts.filter((a) => a.active && a.until <= now);
      if (gone.length) { castle.artifacts = castle.artifacts.filter((a) => !gone.includes(a)); for (const a of gone) this.event(castle.owner, `Сила артефакта «${ART_TYPES[a.type].name}» иссякла — он рассыпался в пыль.`); } }
    if (castle.general === undefined) castle.general = null;
    if (castle.general) this.normGeneral(castle.general, castle);
    if (castle.research === undefined) castle.research = null;
    if (castle.religion === undefined) castle.religion = null;
    if (!castle.forge) castle.forge = {}; // Кузница: { unitId: { a: ур. атаки, d: ур. защиты } }
    // улучшения Кузницы (a, d) и Школы магии (m, md): по одному на параметр одновременно, как в оригинале
    if (!castle.upJobs) castle.upJobs = {};
    for (const j of [castle.forgeJob, castle.magicJob, ...Object.values(castle.magicJobs || {})]) if (j) castle.upJobs[j.kind] = j;
    delete castle.forgeJob; delete castle.magicJob; delete castle.magicJobs;
    if (!castle.squads) castle.squads = []; // отряды в замке («Армия: …»); castle.units — «Замковая армия»
    if (!castle.reserve) castle.reserve = {}; // «Резерв»: войска не защищают замок, не гибнут, разведка их не видит
    if (castle.loyalty === undefined) { castle.loyalty = 100; castle.loyAt = Date.now(); }
    // торговцы больше не юниты армии — убрать старые записи из войск и очередей
    if (castle.units[MERCHANT_ID]) delete castle.units[MERCHANT_ID];
    for (const q of castle.squads) delete q.units[MERCHANT_ID];
    if (castle.training.some((t) => t.unit === MERCHANT_ID)) castle.training = castle.training.filter((t) => t.unit !== MERCHANT_ID);
    return castle;
  };
  // торговцы замка: всего 20 при Рынке, в пути — те, что везут ресурсы
  P.merchants = function merchants(castle) {
    this.mil(castle);
    const lvl = this.buildingLevel(castle, B.MARKET), total = lvl ? MERCHANTS : 0;
    const away = (castle.armies || []).filter((a) => a.mission === 'trade').reduce((s, a) => s + (a.units[MERCHANT_ID] || 0), 0);
    const b = this.bonus(castle); // Торговая палата и науки: груз и скорость
    return { total, away, free: Math.max(0, total - away), reserved: 0, carry: Math.round(UNIT[MERCHANT_ID].carry * lvl * b.tradeCarry), speed: Math.round(UNIT[MERCHANT_ID].speed * b.tradeSpeed * 10) / 10, level: lvl }; // как в оригинале: 20 ур. — 900 ед.; скорость — 60 полей/час
  };
  // «Передать»: торговцы везут ресурсы в замок; сколько торговцев — по грузу
  // allyStore — id альянса: груз — в его кладовую (ally.js: везут к столице создателя альянса, по прибытии — allyStoreArrive)
  P.sendTrade = function sendTrade(castle, { x, y, res, allyStore }) {
    this.tick(castle);
    const m = this.merchants(castle);
    if (!m.level) return { error: `В замке «${castle.name}» нет Рынка — ресурсы возят торговцы с Рынка. Постройте его или отправьте из замка, где Рынок есть.` };
    x = Math.round(Number(x)); y = Math.round(Number(y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Укажите координаты замка.' };
    if (x === castle.x && y === castle.y && !allyStore) return { error: 'Это этот же замок.' };
    const target = this.castleAt(x, y); if (!target) return { error: 'Торговцы везут ресурсы только в замок.' };
    const cargo = {}; let total = 0;
    for (const r of RES4) { const v = Math.max(0, Math.floor(Number((res || {})[r]) || 0)); if (castle.res[r] < v) return { error: 'Недостаточно ресурсов.' }; cargo[r] = v; total += v; }
    if (!total) return { error: 'Укажите, сколько везти.' };
    const need = Math.ceil(total / m.carry);
    if (need > m.free) return { error: `Нужно торговцев: ${need}, свободных: ${m.free} (каждый везёт ${m.carry}).` };
    for (const r of RES4) castle.res[r] -= cargo[r];
    const own = target.owner === castle.owner ? OWN_TRADE : 1; // между своими замками — ещё втрое быстрее
    const units = { [MERCHANT_ID]: need }, sec = Math.min(TRADE_MAX, Math.max(5, Math.round(Math.hypot(x - castle.x, y - castle.y) / (m.speed * own * MARCH) * 3600 / SPEED))), now = Date.now(); // не дольше 10 минут в одну сторону
    const army = { id: this.db.nextId++, units, general: false, mission: 'trade', x, y, depart: now, arrive: now + sec * 1000, sec, state: 'go', loot: null, cargo, squad: null, portal: false, ...(allyStore ? { allyStore } : {}) };
    castle.armies.push(army); if (!allyStore) this.addStat(castle.owner, 'trades', 1); this.store.save();
    return { army, sec, need };
  };
  P.ownerOf = function ownerOf(castle) { return this.userById(castle.owner); };
  // действует ли в замке пробуждённый артефакт Подземелья этого вида (cloak, eye, claw, seal, heart, hand)
  P.artOn = function artOn(castle, type, now = Date.now()) { return !!castle && (castle.artifacts || []).some((a) => a.active && a.type === type && (a.until || 0) > now); };
  // идёт ли на замок чужая армия (нападение, набег, разведка) — тогда защитный артефакт Подземелья не пробудить
  P.hostileIncoming = function hostileIncoming(castle) {
    for (const c of Object.values(this.db.castles)) if (c.owner !== castle.owner) for (const a of c.armies || []) if (a.state === 'go' && !a.dung && a.x === castle.x && a.y === castle.y && ['attack', 'raid', 'scout'].includes(a.mission)) return true;
    return false;
  };
  P.raceOf = function raceOf(castle) { const u = this.ownerOf(castle); return u ? u.race : 'humans'; };
  P.event = function event(userId, msg) { (this.events = this.events || []).push({ userId, msg }); };
  P.drainEvents = function drainEvents() { const e = this.events || []; this.events = []; return e; };

  // ----- бонусы от зданий, наук, религии, артефактов -----
  P.bonus = function bonus(castle) {
    this.mil(castle);
    const L = (id) => this.buildingLevel(castle, id);
    const sci = this.sciOf(castle), templeL = L(B.TEMPLE), rel = castle.religion;
    const art = { atk: 0, def: 0, prod: 0, speed: 0, train: 0 };
    const eff = artEffects(castle.artifacts); for (const a of castle.artifacts) if (a.active && eff.has(a.id)) art[a.type] += eff.get(a.id);
    const race = this.raceOf(castle); // командование генерала здесь не считается (с 27.10): оно — армии, где генерал (clash, defensePower)
    const wallPer = WALL_PER[race] || WALL_PER.humans;
    const ms = scienceMiles(sci);
    const br = this.brBonus ? this.brBonus(this.ownerOf(castle)) : { atk: 0, prod: 0 }; // боевой ранг
    return {
      atk: (1 + SCIENCES.war.per * sci.war) * (1 + (rel === 'war' ? 0.01 * templeL : 0)) * (1 + art.atk) * (1 + ms.atk) * (1 + br.atk),
      def: (1 + SCIENCES.war.per * sci.war) * (1 + (rel === 'light' ? 0.01 * templeL : 0)) * (1 + art.def) * (1 + ms.def) * (1 + br.atk),
      magic: 1 + 0.02 * L(B.MAGIC_SCHOOL),
      prod: (1 + SCIENCES.eco.per * sci.eco) * (1 + (rel === 'nature' ? 0.01 * templeL : 0)) * (1 + art.prod) * (1 + ms.prod) * (1 + br.prod),
      speed: (1 + SCIENCES.fhi.per * sci.fhi) * (1 + art.speed) * (1 + ms.speed),
      train: (1 - 0.02 * L(B.ALCHEMY)) * (1 - art.train) * (1 - ms.train),
      build: (1 - SCIENCES.eng.per * sci.eng) * (1 - ms.build),
      wall: L(B.FENCE), wallPer: wallPer * (1 + ms.wall) * (this.artOn(castle, 'heart') ? 1.5 : 1), // «Сердце Твердыни» — защита Забора ×1,5
      hidden: L(B.CACHE) ? Math.round(200 * 1.3 ** (L(B.CACHE) - 1) * (race === 'dwarves' ? 2 : 1) * (1 + ms.hidden)) : 0,
      watch: L(B.WATCHTOWER), spyCenter: L(B.SPY), mason: L(B.MASON),
      tradeCarry: 1 + TRADE_CARRY * L(B.TRADE_HALL) + ms.tradeCarry, tradeSpeed: 1 + 0.05 * L(B.TRADE_HALL) + ms.tradeSpeed, // Торговая палата: +5% скорости торговцев за уровень (20 ур. — вдвое быстрее)
      marketRate: L(B.MARKET) ? 0.5 : 0, // бартер: отдаёшь 2 — получаешь 1 (уровень Рынка не влияет)
      artSlots: L(B.ART_TOWER) ? Math.min(ART_ACTIVE_MAX, 1 + Math.floor(L(B.ART_TOWER) / 3)) : 0, // одновременно — не больше трёх пробуждённых (с 24.10)
      artStore: L(B.TREASURY) ? 3 + L(B.TREASURY) : 3,
    };
  };

  // содержание войск (еда в час, без скорости мира)
  P.upkeep = function upkeep(castle) {
    this.mil(castle);
    let s = 0;
    const add = (units) => { for (const [id, n] of Object.entries(units)) s += (UNIT[id] ? UNIT[id].upkeep : 0) * n; };
    add(castle.units);
    for (const q of castle.squads) add(q.units);
    add(castle.reserve); // в резерве воины едят как обычно
    for (const a of castle.armies) add(a.units);
    if (castle.general && !castle.general.dead) s += UNIT[GENERAL_ID].upkeep;
    return s;
  };

  // «Резерв»: сколько воинов; выход на защиту — при бунте 85% и выше, отчёт хозяину
  P.reserveCount = function reserveCount(castle) { return Object.values(castle.reserve || {}).reduce((a, n) => a + (n > 0 ? n : 0), 0); };
  P.reserveOut = function reserveOut(castle) {
    const n = this.reserveCount(castle); if (!n) return 0;
    const units = castle.reserve; castle.reserve = {};
    for (const [id, k] of Object.entries(units)) if (k > 0) castle.units[id] = (castle.units[id] || 0) + k;
    this.report(castle.owner, `Резерв вышел на защиту замка «${castle.name}»`, [`Бунт в замке ${Math.round(100 - castle.loyalty)}% — до захвата одно нападение.`,
      `Все войска резерва (${Wd.warriors(n)}) вышли в Замковую армию и защищают замок: ${unitsLine(units)}.`, 'Чтобы захватить замок, врагу придётся их перебить.'], 'battle');
    return n;
  };

  // ----- тренировка -----
  P.trainTime = function trainTime(castle, unit) {
    const bl = Math.max(1, this.buildingLevel(castle, unit.building));
    void bl; // уровень здания открывает юнитов, но не ускоряет тренировку (как в оригинале: Орк загонщик — 14:40 и на 20 ур.)
    return Math.max(1, Math.round(unit.time * this.bonus(castle).train / SPEED));
  };
  // ----- Лазарет (здание 41): раненые и лечение -----
  // кто попадает в Лазарет: воины с ценой тренировки (не тараны и прочие одноразовые, не уникальные воины заданий, не генерал);
  // снятые с тренировки (Око, Тень, Джин, Изувер) у тех, у кого остались, лечатся как раньше
  const healable = (id) => { const u = UNIT[id]; return !!(u && u.cost && !u.oneUse && (!u.notrain || u.retired) && Number(id) !== GENERAL_ID); };
  P.infirmCap = function infirmCap(castle) { return INFIRM_CAP * this.buildingLevel(castle, B.INFIRMARY); };
  // занято мест: раненые (и очередь лечения прежней версии, пока замок не обновился)
  P.infirmUsed = function infirmUsed(castle) {
    return Object.values(castle.wounded || {}).reduce((q, n) => q + n, 0) + (castle.healing || []).reduce((q, j) => q + j.count - j.done, 0);
  };
  // павшие lost { id: n } — половина (INFIRM_SHARE, с округлением вниз) ранеными в Лазарет замка, пока есть места; остальные погибли.
  // Возвращает, сколько попало; into { id: n } — сколько каких попало (очки боевого ранга за раненых — четверть)
  P.toInfirmary = function toInfirmary(castle, lost, into) {
    if (!castle || !lost) return 0;
    let free = this.infirmCap(castle) - this.infirmUsed(castle), n = 0;
    for (const [id, k] of Object.entries(lost)) {
      if (free <= 0) break; if (!(k > 0) || !healable(id)) continue;
      const t = Math.min(Math.floor(k * INFIRM_SHARE), free); if (!t) continue;
      castle.wounded = castle.wounded || {}; castle.wounded[id] = (castle.wounded[id] || 0) + t; free -= t; n += t;
      if (into) into[id] = (into[id] || 0) + t;
    }
    return n;
  };
  // лечение: цена — HEAL_K от тренировки, ждать не нужно
  P.healCostOf = function healCostOf(castle, id, n) { const u = raceUnit(UNIT[id], this.raceOf(castle)); return Object.fromEntries(RES4.map((r) => [r, Math.round((u.cost[r] || 0) * n * HEAL_K)])); };
  // цена лечения одного раненого без округления: клиент считает цену любого количества так же, как healCostOf
  P.healOneOf = function healOneOf(castle, id) { const u = raceUnit(UNIT[id], this.raceOf(castle)); return Object.fromEntries(RES4.map((r) => [r, (u.cost[r] || 0) * HEAL_K])); };
  // скольких раненых этого вида хватит ресурсов вылечить сейчас
  P.healAfford = function healAfford(castle, id) {
    const fits = (n) => { const c = this.healCostOf(castle, id, n); return RES4.every((r) => castle.res[r] >= c[r]); };
    let lo = 0, hi = (castle.wounded || {})[id] || 0;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid - 1; }
    return lo;
  };
  // вылечить: pick { id: n } или всех (pick пустой) — сразу в Замковую армию; Казармы не заняты, дневной лимит тренировки не тратится
  P.healWounded = function healWounded(castle, pick) {
    this.tick(castle);
    if (!this.buildingLevel(castle, B.INFIRMARY)) return { error: 'Нужен Лазарет.' };
    const w = castle.wounded || {}, src = pick && typeof pick === 'object' && Object.keys(pick).length ? pick : w, list = [];
    for (const [id, n0] of Object.entries(src)) { const n = Math.min(Math.floor(Number(n0)) || 0, w[id] || 0); if (n > 0 && healable(id)) list.push([id, n]); }
    if (!list.length) return { error: 'Раненых нет.' };
    const cost = { wood: 0, stone: 0, iron: 0, food: 0 };
    for (const [id, n] of list) { const c = this.healCostOf(castle, id, n); for (const r of RES4) cost[r] += c[r]; }
    if (RES4.some((r) => castle.res[r] < cost[r])) { // одного вида — подсказать, на скольких хватит
      if (list.length > 1) return { error: 'Недостаточно ресурсов.' };
      const a = this.healAfford(castle, list[0][0]);
      return { error: a ? `Недостаточно ресурсов — хватит на ${a}.` : 'Недостаточно ресурсов даже на одного раненого.' };
    }
    for (const r of RES4) castle.res[r] -= cost[r];
    for (const [id, n] of list) { castle.units[id] = (castle.units[id] || 0) + n; w[id] -= n; if (!w[id]) delete w[id]; }
    const total = list.reduce((q, [, n]) => q + n, 0);
    castle.wounded = w; this.addStat(castle.owner, 'healed', total); this.store.save(); // для «Подозрительного»: вылеченные — законный прирост армии
    return { ok: true, msg: `Лекари вылечили раненых: ${total}. Они уже в Замковой армии.`, cost };
  };
  P.unitLock = function unitLock(castle, unit) {
    const race = this.raceOf(castle);
    if (unit.race !== 'all' && unit.race !== race) return 'Юнит другой расы.';
    if (this.buildingLevel(castle, unit.building) < unit.level) return `Нужно: ${(C.BY_ID[unit.building] || { name: 'здание' }).name} ${unit.level} ур.`;
    for (const [id, l] of Object.entries(unit.req)) if (this.buildingLevel(castle, Number(id)) < l) return `Нужно: ${C.BY_ID[id].name} ${l} ур.`;
    return null;
  };
  P.trainedToday = function trainedToday(castle, now = Date.now()) {
    castle.trainLog = (castle.trainLog || []).filter((x) => x.at > now - 86400000);
    return castle.trainLog.reduce((s, x) => s + x.n, 0);
  };
  P.train = function train(castle, unitId, count) {
    this.tick(castle);
    const unit = raceUnit(UNIT[unitId], this.raceOf(castle)); count = Math.floor(Number(count));
    if (!unit) return { error: 'Неизвестный юнит.' };
    if (unit.notrain) return { error: unit.retired ? (unit.building === B.PORTAL ? 'Портал воинов не тренирует — он ускоряет походы.' : 'В Центре разведки тренируются только разведчики.') : unit.undead ? 'Нежить не тренируется — она приходит из сундуков Лавки (Кладовая).' : unit.quest ? 'Уникальные воины не тренируются — их дают задания (Кладовая).' : 'Торговцы не тренируются — их 20 на Рынке.' };
    if (!(count > 0)) return { error: 'Укажите количество.' };
    if (ORDER_MAX[unit.id] && count > ORDER_MAX[unit.id]) return { error: `${unit.name}: не больше ${ORDER_MAX[unit.id]} за один заказ.` };
    const lock = this.unitLock(castle, unit); if (lock) return { error: lock };
    if (unit.id === GENERAL_ID) {
      if (castle.general || castle.training.some((t) => t.unit === GENERAL_ID)) return { error: 'Генерал в замке может быть только один.' };
      count = 1;
    }
    const used = this.trainedToday(castle);
    if (unit.id !== GENERAL_ID && used + count > TRAIN_DAY) return { error: `За сутки можно обучить не больше ${TRAIN_DAY} воинов в замке. Осталось: ${Math.max(0, TRAIN_DAY - used)}.` };
    for (const r of RES4) if (castle.res[r] < unit.cost[r] * count) return { error: 'Недостаточно ресурсов.' };
    if (castle.res.people < unit.pop * count) return { error: 'Не хватает людей (растут с Хибарами).' };
    for (const r of RES4) castle.res[r] -= unit.cost[r] * count;
    castle.res.people -= unit.pop * count;
    const each = this.trainTime(castle, unit) * 1000, now = Date.now();
    const last = castle.training.filter((t) => t.building === unit.building).reduce((m, t) => Math.max(m, t.start + t.each * t.count), now);
    const job = { id: this.db.nextId++, unit: unit.id, building: unit.building, count, done: 0, each, start: last };
    castle.training.push(job);
    if (unit.id !== GENERAL_ID) (castle.trainLog = castle.trainLog || []).push({ at: now, n: count });
    if (unit.id !== GENERAL_ID) this.addStat(castle.owner, 'trained', count); // задания
    this.store.save();
    return { job };
  };
  P.tickTraining = function tickTraining(castle, now) {
    this.mil(castle);
    // бунт (100 − лояльность) сам не утихает — снизить его можно только в Храме за ресурсы, он падает постепенно (royal.js calmRiot)
    if (castle.calmJob && this.calmTick) this.calmTick(castle, now);
    castle.loyAt = now;
    const owner = castle.owner;
    castle.training = castle.training.filter((t) => {
      const ready = Math.max(0, Math.min(t.count, Math.floor((now - t.start) / t.each)));
      if (ready > t.done) {
        const n = ready - t.done; t.done = ready;
        if (t.unit === GENERAL_ID) { castle.general = this.newGeneral(castle, 1); if (t.kindId && UNIT[t.kindId]) { castle.general.kind = UNIT[t.kindId].name; castle.general.kindId = t.kindId; } }
        else castle.units[t.unit] = (castle.units[t.unit] || 0) + n;
        if (t.done === t.count) this.event(owner, t.unit === GENERAL_ID ? 'Генерал готов!' : `Готово: ${UNIT[t.unit].name} ×${t.count}`);
      }
      return t.done < t.count;
    });
    if (castle.healing) { // Лазарет: очередь лечения прежней версии — лечение теперь сразу, оплаченные встают в строй
      for (const t of castle.healing) if (t.count > t.done) { castle.units[t.unit] = (castle.units[t.unit] || 0) + t.count - t.done; this.addStat(owner, 'healed', t.count - t.done); this.event(owner, `Лазарет: вылечены ${UNIT[t.unit] ? UNIT[t.unit].name : 'воины'} ×${t.count}`); }
      delete castle.healing;
    }
    // генерал воскрес
    const g = castle.general;
    if (g && g.dead && g.reviveAt && g.reviveAt <= now) { g.dead = false; delete g.reviveAt; delete g.reviveStart; this.event(owner, 'Генерал снова в строю.'); }
    for (const d of castle.deadGenerals || []) if (d.reviveAt && d.reviveAt <= now && !castle.general) { // воскрешённый из списка павших — снова генерал замка
      castle.deadGenerals = castle.deadGenerals.filter((x) => x !== d); d.dead = false; delete d.reviveAt; delete d.reviveStart; delete d.away; delete d.squad; castle.general = d; this.event(owner, 'Генерал снова в строю.'); }
    // генерал сменил воина: полчаса переобучения прошли (уровень, опыт, очки и снаряжение — прежние)
    for (const x of [castle.general, ...(castle.deadGenerals || [])]) if (x && x.rekind && x.rekind.end <= now) {
      const ku = UNIT[x.rekind.kindId]; delete x.rekind; if (!ku) continue;
      x.kindId = ku.id; x.kind = ku.name; this.event(owner, `Генерал «${x.name}» переобучен: теперь он из воина «${ku.name}».`);
      if (x.pts) { const p = genProfile(ku); for (const [k, cap] of [['heal', p.healMax], ['career', p.careerMax]]) if (x.pts[k] > cap) { x.free = (x.free || 0) + x.pts[k] - cap; x.pts[k] = cap; } } // у нового воина потолок ниже — лишние очки снова свободные
    }
    // экспедиции из здания вернулись
    if (castle.expeds && castle.expeds.some((x) => x.end <= now)) { const done = castle.expeds.filter((x) => x.end <= now); castle.expeds = castle.expeds.filter((x) => x.end > now); for (const x of done) this.expedBack(castle, x); }
    // улучшение в Кузнице
    if (castle.gearJob && this.heroGearTick) this.heroGearTick(castle, now);
    if (castle.runeJob && this.heroRuneTick) this.heroRuneTick(castle, now); // ковка за руны
    for (const [k, j] of Object.entries(castle.upJobs || {})) {
      if (!j || j.end > now) continue;
      const f = castle.forge[j.unit] || (castle.forge[j.unit] = { a: 0, d: 0 });
      f[j.kind] = j.level;
      castle.res.people += j.people || 0; // люди возвращаются после улучшения
      this.event(owner, `${UP[j.kind].bld === B.SMITH ? 'Кузница' : 'Школа магии'}: ${UNIT[j.unit].name} — ${UP[j.kind].name} ${j.level + 1} ур.`);
      delete castle.upJobs[k];
    }
    // исследование
    if (castle.research && castle.research.end <= now) {
      const sc = this.sciOf(castle); sc[castle.research.sci] = Math.max(sc[castle.research.sci] || 0, castle.research.level); castle.sciences = sc;
      this.event(owner, `Изучено: ${SCIENCES[castle.research.sci].name} ${castle.research.level} ур.`);
      castle.research = null;
    }
  };

  // ----- Кузница: улучшение атаки/защиты каждого юнита (+1 к базовому параметру за уровень, до уровня Кузнеца) -----
  P.forgeLvl = function forgeLvl(castle, id, kind) { const f = castle.forge && castle.forge[id]; return f ? f[kind] || 0 : 0; };
  // Кузница и Школа магии — только воины рас; Бунтарь, Путешественник, Катапульта и Таран (общие) — без улучшений (с 23.10)
  P.forgeUnits = function forgeUnits(castle) {
    const ord = [B.BARRACKS, B.STABLE, B.MAGE_ACADEMY, B.SPY, B.WORKSHOP]; // порядок как в оригинале: Казарма, Конюшня, Академия, разведчик, разрушитель; снятые — в конце
    const k = (u) => (u.retired ? 100 : 0) + (ord.includes(u.building) ? ord.indexOf(u.building) : 50);
    return unitsForRace(this.raceOf(castle)).filter((u) => u.race !== 'all' && u.id !== GENERAL_ID && !u.quest && (!u.retired || (castle.units[u.id] || 0) > 0)).sort((x, y) => k(x) - k(y) || x.level - y.level); // старых — только если они есть в замке
  };
  // Кузница и Школа магии — как в оригинале. Уровень параметра показывается с 1 (без улучшений — 1), каждое улучшение +1 к базе.
  // Стоимость улучшения до уровня T (показываемого) = цена юнита × c·g^T, люди — население юнита × тот же множитель × 0,97,
  // время (T+2)×30 мин. Коэффициенты подобраны по скринам (Мародер, Шаман — Кузница; Тиран, Урук-хай — Школа магии).
  P.forgeCost = function forgeCost(u, kind, T) {
    const f = UP[kind].c * UP[kind].g ** T;
    return { cost: Object.fromEntries(RES4.map((r) => [r, Math.min(UP_CAP, Math.round((u.refCost || u.cost)[r] * f))])), people: Math.round(u.pop * f * 0.97), sec: Math.max(5, Math.round((T + 2) * 1800 / SPEED)) };
  };
  // Школа магии — как в оригинале: все воины расы (как в Кузнице), у каждого магическая атака и магическая защита (с 23.10; раньше — только маги)
  P.magicUnits = function magicUnits(castle) { return this.forgeUnits(castle); };
  P.upgradeOp = function upgradeOp(castle, { unit, kind }) {
    this.tick(castle); this.mil(castle);
    const up = UP[kind]; if (!up) return { error: 'Неверный параметр.' };
    const L = this.buildingLevel(castle, up.bld), u = UNIT[unit];
    if (!L) return { error: up.bld === B.SMITH ? 'Нужен Кузнец.' : 'Нужна Школа магии.' };
    const list = up.bld === B.SMITH ? this.forgeUnits(castle) : this.magicUnits(castle);
    if (!u || !list.includes(u)) return { error: 'Этот юнит нельзя улучшить.' };
    if (castle.upJobs[kind]) return { error: 'Уже проводится улучшение данного параметра для другого юнита!' };
    const s = this.forgeLvl(castle, u.id, kind), T = s + 2; // показываемый уровень после улучшения
    if (T > 20) return { error: 'Достигнут максимальный уровень (20).' };
    if (T > L) return { error: `Нужен уровень здания ${T}.` };
    const { cost, people, sec } = this.forgeCost(u, kind, T);
    for (const r of RES4) if (castle.res[r] < cost[r]) return { error: 'Недостаточно ресурсов.' };
    if (castle.res.people < people) return { error: 'Не хватает людей.' };
    for (const r of RES4) castle.res[r] -= cost[r];
    castle.res.people -= people;
    castle.upJobs[kind] = { unit: u.id, kind, level: s + 1, people, start: Date.now(), end: Date.now() + sec * 1000 };
    this.addStat(castle.owner, 'upgrades', 1);
    this.store.save();
    return { ok: true, msg: `Начато улучшение на уровень ${T} !` };
  };
  P.forgeOp = function forgeOp(castle, m) { return ['a', 'd'].includes(m.kind) ? this.upgradeOp(castle, m) : { error: 'Неверный параметр.' }; };
  P.magicOp = function magicOp(castle, m) { return ['m', 'md'].includes(m.kind) ? this.upgradeOp(castle, m) : { error: 'Неверный параметр.' }; };

  // ----- генерал -----
  // всего опыта для следующего уровня: до 24 ур. — 50 × уровень² (10 ур. — 5 000, 24 ур. — 28 800); дальше каждый уровень дороже (GEN_HARD):
  // уровень L стоит 50 × (2L − 1) × (1 + 0,25 × (L − 24)); сумма — по формуле, без перебора (уровни бывают и выше 500 — старые записи)
  P.generalNeed = (level) => { const m = Math.max(0, level - (GEN_HARD.from - 1)); return Math.round(50 * level * level + 50 * GEN_HARD.k * (m * (m + 1) * (2 * m + 1) / 3 + 47 * m * (m + 1) / 2)); };
  P.newGeneral = function newGeneral(castle, level = 1) {
    return this.normGeneral({ name: 'Генерал', level, exp: level > 1 ? this.generalNeed(level - 1) : 0, expV: 3, dead: false }, castle);
  };
  // дополняет старые записи генерала полями нового окна (очки, имя, сбросы)
  P.normGeneral = function normGeneral(g, castle) {
    if (!g.pts) { g.pts = Object.fromEntries(GEN_STATS.map((k) => [k, 0])); g.free = GEN.perLevel * Math.max(0, g.level - 1); }
    if (!g.expV || g.expV < 2) { g.exp = Math.round((g.exp || 0) / 2); g.expV = 2; } // шкала опыта ×0,5 (новая кривая уровней), уровень не меняется
    if (g.expV === 2) { // с 25 уровня уровни дороже (GEN_HARD): уровень и доля полоски опыта сохраняются
      if (g.level >= GEN_HARD.from) {
        const o0 = 50 * (g.level - 1) ** 2, o1 = 50 * g.level ** 2, f = Math.max(0, Math.min(0.999, ((g.exp || 0) - o0) / Math.max(1, o1 - o0)));
        const n0 = this.generalNeed(g.level - 1), n1 = this.generalNeed(g.level); g.exp = Math.round(n0 + f * (n1 - n0));
      }
      g.expV = 3;
    }
    if (g.free === undefined) g.free = 0;
    if (!g.name) g.name = 'Генерал';
    if (g.level > GEN.maxLevel) g.level = GEN.maxLevel;
    if (g.resets === undefined) g.resets = 1;
    if (!(g.kindId && UNIT[g.kindId]) && castle) { const ku = genKindUnit(this.raceOf(castle)); if (ku) { g.kindId = ku.id; g.kind = ku.name; } } // старые записи — воин по умолчанию
    if (!g.kind && castle) g.kind = genKind(this.raceOf(castle));
    if ((g.genV || 0) < 2) { // 27.10: генерал — по своему воину, Личной защиты нет: все распределённые очки снова свободные (распределить заново)
      const spent = Object.values(g.pts).reduce((q, v) => q + (Number(v) || 0), 0);
      g.pts = Object.fromEntries(GEN_STATS.map((k) => [k, 0])); g.free += spent; g.genV = 2;
    }
    return g;
  };
  // воин генерала (у записи без воина — общий «Генерал»)
  const genWarrior = (g) => (g && UNIT[g.kindId] && genEligible(UNIT[g.kindId]) ? UNIT[g.kindId] : UNIT[GENERAL_ID]);
  // характеристики генерала: от воина (genProfile) и очков. a3 — удары по пехоте/коннице/магам, atk — средний удар, def/mdef — защита
  // от воинов и магов (для боя с боссом и силы обороны), catk/cdef — командование армией, где генерал; heal, career — доли
  // здоровье генерала сейчас, 0–100 (GEN_HP_REGEN): у павшего — 0, у записи без здоровья (новый, воскрешённый, до 27.10) — 100
  P.genHp = function genHp(g, now = Date.now()) {
    if (!g || g.dead) return 0;
    if (!(g.hp >= 0)) return 100;
    return Math.min(100, g.hp + GEN_HP_REGEN * SPEED * Math.max(0, now - (g.hpAt || now)) / 3600000);
  };
  // рана в бою: share — доля потерь армии генерала (0–1). fatal — здоровье кончилось (гибель решает вызывающий: шанс уцелеть);
  // noKill — генерал защитника в набеге: не ниже 1%
  P.genWound = function genWound(g, share, noKill = false, now = Date.now()) {
    const was = this.genHp(g, now), lost = Math.round(Math.max(0, Math.min(1, Number(share) || 0)) * 1000) / 10;
    const left = Math.round((was - lost) * 10) / 10, fatal = left <= 0 && !noKill;
    g.hp = left > 0 ? left : noKill ? 1 : 0; g.hpAt = now;
    return { was: Math.floor(was), lost, left: g.hp, fatal };
  };
  const hpTxt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const genDie = (g) => { g.dead = true; delete g.hp; delete g.hpAt; }; // павший воскресает с полным здоровьем
  P.genStats = function genStats(g) {
    const u = genWarrior(g), p = genProfile(u), pts = g.pts || {}, k = 1 + GEN.atkPt * (pts.atk || 0), D = u.def || { inf: 0, cav: 0, mag: 0 };
    const a3 = { inf: p.a3.inf * k, cav: p.a3.cav * k, mag: p.a3.mag * k };
    return { ...p, kindId: u.id, a3, atk: (a3.inf + a3.cav + a3.mag) / 3, def: (D.inf + D.cav) / 2 * GEN.a3K, mdef: D.mag * GEN.a3K,
      catk: cmdBonus(pts.catk || 0, p.cmdMax), cdef: cmdBonus(pts.cdef || 0, p.cmdMax), heal: GEN.heal * Math.min(p.healMax, pts.heal || 0), career: GEN.career * Math.min(p.careerMax, pts.career || 0) };
  };
  // опыт генерала за бой. Чтобы генерал не качался «за пару секунд», действуют ограничения (игрокам не показываются):
  //  • за один бой — не больше 15% опыта текущего уровня (минимум 7 боёв на уровень), с 25 ур. — 10%;
  //  • за сутки — не больше опыта на 1 уровень, с 25 ур. — на полуровня (и сами уровни там дороже — GEN_HARD); лимит твёрдый
  //    (с 24.10): карьера, премиум и Шлем ускоряют набор, но лимит не поднимают; опыт из Кладовой — в тот же лимит (genDayLeft);
  //  • карьера (+0,5% за очко), премиум (×2) и Шлем увеличивают опыт за бой и лимит за бой;
  //  • воин генерала (с 27.10): генерал из слабого воина набирает опыт быстрее (до ×1,5) — и за бой, и за сутки.
  // сколько опыта генерал ещё может получить сегодня (бои и Кладовая вместе)
  P.genDayLeft = function genDayLeft(g) {
    const span = this.generalNeed(g.level) - (g.level > 1 ? this.generalNeed(g.level - 1) : 0), day = new Date().toISOString().slice(0, 10);
    if (!g.day || g.day.d !== day) g.day = { d: day, exp: 0 };
    return Math.max(0, Math.ceil(span * (g.level >= GEN_HARD.from ? GEN_HARD.day : GEN.dayLevels) * genProfile(genWarrior(g)).xp) - g.day.exp);
  };
  P.addGeneralExp = function addGeneralExp(castle, exp) {
    const g = castle.general; if (!g || g.dead || !(exp > 0)) return null;
    this.normGeneral(g, castle);
    const gs = this.genStats(g), mult = (1 + gs.career) * (this.isPremium(this.userById(castle.owner)) ? 2 : 1) * (1 + this.heroBonus(g).exp) * gs.xp;
    const span = this.generalNeed(g.level) - (g.level > 1 ? this.generalNeed(g.level - 1) : 0);
    const left = this.genDayLeft(g), hard = g.level >= GEN_HARD.from;
    const battleCap = Math.max(20, Math.ceil(span * (hard ? GEN_HARD.battle : GEN.battleCap) * mult));
    const raw = Math.round(exp * mult), got = Math.max(0, Math.min(raw, battleCap, left));
    const capped = got < raw ? (got >= left ? 'day' : 'battle') : null;
    g.day.exp += got; if (got > 0) this.addStat(castle.owner, 'genExp', got);
    const from = g.level; g.exp += got;
    while (g.level < GEN.maxLevel && g.exp >= this.generalNeed(g.level)) { g.level++; g.free += GEN.perLevel; }
    if (g.level > from) this.event(castle.owner, `Генерал «${g.name}» достиг ${g.level} уровня! +${(g.level - from) * GEN.perLevel} очк. опыта`);
    return { got, from, level: g.level, name: g.name, capped };
  };
  // опыт за бой (до карьеры, премиума и лимитов):
  //  • основа — население одолённых врагов / 10: тяжёлый бой тоже даёт опыт, свои потери его не отнимают (по решению владельца;
  //    27.10 ненадолго было «за перевес в потерях», как в оригинале, — генерал в тяжёлом бою оставался без опыта);
  //  • победа ×1.5, поражение ×0.5; набег ×0.75;
  //  • лагеря и руины — по силе охраны;
  //  • слабый противник (рейтинг меньше 30% от вашего) — ×0.25;
  //  • повторные бои с тем же игроком за сутки — каждый следующий вдвое меньше (против ферм и мультов).
  P.battleExp = function battleExp({ killedPop, win, mission, npc, dLoss, mine, enemy }) {
    let exp = npc ? (npc.def.inf + npc.def.cav) / 40 * dLoss : killedPop / 10;
    exp *= win ? 1.5 : 0.5;
    if (mission === 'raid') exp *= 0.75;
    let weak = false, repeat = 0;
    if (!npc && mine && enemy) {
      const r1 = this.rating(mine), r2 = this.rating(enemy); if (r1 > 0 && r2 < r1 * 0.3) { exp *= 0.25; weak = true; }
      const g = mine.general;
      if (g) {
        const now = Date.now(), key = String(enemy.owner);
        g.foes = g.foes || {}; g.foes[key] = (g.foes[key] || []).filter((t) => t > now - 86400000);
        repeat = g.foes[key].length; g.foes[key].push(now);
        for (const k of Object.keys(g.foes)) if (!g.foes[k].length) delete g.foes[k];
        exp /= 2 ** repeat;
      }
    }
    return { exp: Math.round(exp), weak, repeat };
  };
  const genLine = (who, r, e) => (r ? `${who} «${r.name}» получил ${r.got.toLocaleString('ru-RU')} опыта${e.weak ? ' (слабый противник ×0,25)' : ''}${e.repeat ? ` (${e.repeat + 1}-й бой с этим игроком за сутки)` : ''}${r.level > r.from ? `. Новый уровень: ${r.level}!` : ''}` : null);
  // окно «Генерал»: rename, dist (распределить очки), reset (сбросить очки), kill (убить), rekind (сменить воина)
  P.generalOp = function generalOp(castle, user, { op, name, pts, idx, gold, unit } = {}) {
    this.tick(castle); this.mil(castle);
    const g = castle.general;
    if (op === 'revive') return this.reviveGeneral(castle, user, idx, !!gold);
    if (op === 'delete') return this.deleteDeadGeneral(castle, idx);
    if (op === 'train') return this.trainGeneral(castle, Number(unit));
    if (!g) return { error: 'Генерала нет.' };
    if (op === 'rekind') return this.rekindGeneral(castle, Number(unit), user);
    if (op === 'rename') {
      name = String(name || '').trim().slice(0, 20); if (!name) return { error: 'Введите имя.' };
      g.name = name;
    } else if (op === 'dist') {
      const add = Object.fromEntries(GEN_STATS.map((k) => [k, Math.max(0, Math.floor(Number(pts && pts[k]) || 0))]));
      const sum = GEN_STATS.reduce((s, k) => s + add[k], 0);
      if (!sum) return { error: 'Укажите, сколько очков куда распределить.' };
      if (sum > g.free) return { error: `Свободных очков только ${g.free}.` };
      const gp = genProfile(genWarrior(g)); // потолки — от воина генерала
      if (add.heal && g.pts.heal + add.heal > gp.healMax) return { error: `Скорость восстановления у этого генерала — не больше ${gp.healMax} очков (воскрешение быстрее на ${gp.healMax}%). Можно добавить ещё ${Math.max(0, gp.healMax - g.pts.heal)}.` };
      if (add.career && g.pts.career + add.career > gp.careerMax) return { error: `Карьера у этого генерала — не больше ${gp.careerMax} очков (опыт +${Math.round(gp.careerMax * GEN.career * 100)}%). Можно добавить ещё ${Math.max(0, gp.careerMax - g.pts.career)}.` };
      for (const k of GEN_STATS) g.pts[k] += add[k];
      g.free -= sum;
    } else if (op === 'reset') { // первый сброс — бесплатно, дальше — GEN.resetGold монет (5 — с 27.10, по решению владельца; было 100)
      const spent = GEN_STATS.reduce((s, k) => s + g.pts[k], 0);
      if (!spent) return { error: 'Очки ещё не распределены.' };
      if (g.resets > 0) g.resets--;
      else { if ((user.gold || 0) < GEN.resetGold) return { error: `Нужно монет: ${GEN.resetGold}.` }; this.goldChange(user, -GEN.resetGold, 'Сброс очков генерала'); }
      for (const k of GEN_STATS) g.pts[k] = 0;
      g.free += spent;
    } else if (op === 'kill') {
      if (g.away) return { error: 'Генерал в походе.' };
      this.heroStrip(castle, g); castle.general = null;
    } else return { error: 'Неизвестное действие.' };
    this.store.save();
    return { ok: true };
  };
  // ----- генерал как в оригинале: павшие генералы списком (воскресить за ресурсы или золото, удалить),
  // тренировка нового — из юнита Замковой армии («Генерал (Мародер)»). Цены по скринам оригинала:
  // тренировка = цена юнита ×20 (ресурсы и люди), время — полчаса + время юнита ×2,5; воскрешение = цена юнита ×10×уровень (с долей опыта),
  // люди ×уровень, время — (уровень + 10) минут (Скорость восстановления — на 1% быстрее за очко), или монеты (сразу).
  const genUnit = (g) => UNIT[g.kindId] || UNIT[GENERAL_ID];
  P.genLevelF = function genLevelF(g) {
    const need = this.generalNeed(g.level), prev = g.level > 1 ? this.generalNeed(g.level - 1) : 0;
    return g.level + Math.max(0, Math.min(0.999, (g.exp - prev) / Math.max(1, need - prev)));
  };
  // воскрешение: до REVIVE_RES_MAX уровня — за ресурсы (не больше вместимости Склада замка) или монеты, выше — только за монеты; монеты — по REVIVE_GOLD за каждые 25 уровней
  P.reviveCostOf = function reviveCostOf(g, castle) {
    const u = genUnit(g), L = this.genLevelF(g), cap = castle ? this.capacity(castle) : null, lim = (k, v) => (cap ? Math.min(v, cap[k]) : v), gp = genProfile(genWarrior(g)); // сильный воин воскресает дольше (×0,75…×1,25)
    return { cost: Object.fromEntries(RES4.map((r) => [r, lim(r, Math.round((u.refCost || u.cost)[r] * 10 * L))])), people: lim('people', Math.round(u.pop * L)), sec: Math.round((g.level + REVIVE_MIN) * 60 * REVIVE_TIME_K * gp.revive * (1 - GEN.heal * Math.min(gp.healMax, (g.pts && g.pts.heal) || 0))),
      gold: REVIVE_GOLD * Math.max(1, g.level), coinsOnly: g.level > REVIVE_RES_MAX };
  };
  // ресурсы, внесённые частями до новых правил, возвращаются в замок
  // внесённое в фонд воскрешения — назад в замок, но не выше Склада: лишнее — в Кладовую (раньше замок переполнялся сверх Склада)
  const refundFund = (game, castle, g) => {
    if (!g.fund) return; const cap = game.capacity(castle), over = {};
    for (const k of Object.keys(g.fund)) {
      const v = g.fund[k] || 0, put = Math.min(v, Math.max(0, Math.floor((cap[k] ?? Infinity) - (castle.res[k] || 0))));
      castle.res[k] = (castle.res[k] || 0) + put; if (v > put && k !== 'people') over[k] = v - put;
    }
    delete g.fund;
    const u = Object.keys(over).length && game.userById(castle.owner); if (u && game.stashAdd) game.stashAdd(u, over);
  };
  P.deadList = function deadList(castle) { return [...(castle.general && castle.general.dead ? [castle.general] : []), ...(castle.deadGenerals || [])]; };
  // генерал — один на всё королевство: где он сейчас, кроме замка except — живой (дома или в походе), в тренировке или воскрешается
  P.generalHome = function generalHome(ownerId, except = null) {
    const u = this.userById(ownerId); if (!u) return null;
    for (const c of this.castlesOf(u)) {
      if (c === except) continue;
      if (c.general && !c.general.dead) return { castle: c, what: c.general.away ? 'away' : 'home', g: c.general };
      if ((c.training || []).some((t) => t.unit === GENERAL_ID)) return { castle: c, what: 'train' };
      if (this.deadList(c).some((d) => d.reviveAt)) return { castle: c, what: 'revive' };
    }
    return null;
  };
  const genElseMsg = (h) => (h.what === 'train' ? `Генерал уже тренируется в замке «${h.castle.name}» — генерал один на всё королевство.`
    : h.what === 'revive' ? `Генерал воскрешается в замке «${h.castle.name}» — генерал один на всё королевство.`
      : `Генерал один на всё королевство — он в замке «${h.castle.name}». Перевести его сюда: Поход → Подкрепление с генералом.`);
  P.genTrainUnits = function genTrainUnits(castle) {
    const race = this.raceOf(castle);
    // генералом не может стать разведчик, бунтарь, таран (и прочие особые/осадные), юниты Портала
    return UNITS.filter((u) => u.race === race && !u.quest && u.building !== B.PORTAL && !['scout', 'eye', 'rebel', 'ram', 'catapult', 'merchant', 'settler', 'sage', 'archaeologist'].includes(u.role) && (castle.units[u.id] || 0) > 0);
  };
  P.genTrainCost = (u) => ({ cost: Object.fromEntries(RES4.map((r) => [r, (u.refCost || u.cost)[r] * 20])), people: u.pop * 20, sec: GEN_HIRE_SEC + Math.round((u.refTime || u.time) * GEN_HIRE_K) }); // по прежней цене воина
  P.reviveGeneral = function reviveGeneral(castle, user, idx = 0, gold = false) {
    this.tick(castle);
    const list = this.deadList(castle), g = list[Number(idx) || 0];
    if (!g) return { error: 'Генерал не найден.' };
    if (g.reviveAt) return { error: 'Воскрешение уже идёт.' };
    if (g !== castle.general && castle.general) return { error: 'В замке уже есть генерал.' };
    if (list.some((x) => x.reviveAt)) return { error: 'Уже воскрешается другой генерал.' };
    if (castle.training.some((t) => t.unit === GENERAL_ID)) return { error: 'Идёт тренировка генерала.' };
    const gh = this.generalHome(castle.owner, castle); if (gh) return { error: genElseMsg(gh) };
    const c = this.reviveCostOf(g, castle);
    if (gold) {
      if ((user.gold || 0) < c.gold) return { error: `Нужно ${c.gold} монет.` };
      this.goldChange(user, -c.gold, `Воскрешение генерала (${g.kind})`);
      refundFund(this, castle, g);
      if (g !== castle.general) { castle.deadGenerals = castle.deadGenerals.filter((x) => x !== g); castle.general = g; }
      g.dead = false; delete g.reviveAt; delete g.reviveStart; delete g.away; this.store.save();
      return { ok: true, msg: 'Генерал воскрешён!' };
    }
    if (c.coinsOnly) { refundFund(this, castle, g); this.store.save(); return { error: `Генерала выше ${REVIVE_RES_MAX} уровня можно воскресить только за монеты.` }; }
    // ресурсы можно вносить частями (g.fund), когда собрано всё — воскрешение начинается
    const fund = g.fund = g.fund || { wood: 0, stone: 0, iron: 0, food: 0, people: 0 }, need = { ...Object.fromEntries(RES4.map((r) => [r, c.cost[r]])), people: c.people };
    const keys = [...RES4, 'people'], left = (k) => Math.max(0, need[k] - (fund[k] || 0));
    if (!keys.every((k) => castle.res[k] >= left(k))) {
      let put = 0; for (const k of keys) { const v = Math.floor(Math.min(castle.res[k], left(k))); if (v > 0) { castle.res[k] -= v; fund[k] = (fund[k] || 0) + v; put += v; } }
      if (!put) return { error: 'Недостаточно ресурсов.' };
      this.store.save();
      return { ok: true, msg: `Ресурсы внесены. Осталось собрать: ${keys.map((k) => left(k)).map((v) => v.toLocaleString('ru-RU')).join(' / ')}.` };
    }
    for (const k of keys) castle.res[k] -= left(k);
    delete g.fund;
    g.reviveStart = Date.now();
    g.reviveAt = Date.now() + Math.max(5, Math.round(c.sec / SPEED)) * 1000;
    this.store.save();
    return { ok: true, msg: 'Воскрешение генерала начато!' };
  };
  P.deleteDeadGeneral = function deleteDeadGeneral(castle, idx = 0) {
    const list = this.deadList(castle), g = list[Number(idx) || 0];
    if (!g) return { error: 'Генерал не найден.' };
    this.heroStrip(castle, g);
    if (g === castle.general) castle.general = null; else castle.deadGenerals = castle.deadGenerals.filter((x) => x !== g);
    this.store.save(); return { ok: true, msg: 'Генерал удалён.' };
  };
  P.trainGeneral = function trainGeneral(castle, unitId) {
    this.tick(castle); this.mil(castle);
    if (castle.general && !castle.general.dead) return { error: 'В замке уже есть генерал.' };
    if (castle.training.some((t) => t.unit === GENERAL_ID)) return { error: 'Генерал уже тренируется.' };
    if (this.deadList(castle).some((x) => x.reviveAt)) return { error: 'Идёт воскрешение генерала.' };
    const gh = this.generalHome(castle.owner, castle); if (gh) return { error: genElseMsg(gh) };
    const u = UNIT[unitId]; if (!u || !this.genTrainUnits(castle).includes(u)) return { error: 'Выберите юнита из замковой армии.' };
    const c = this.genTrainCost(u);
    for (const r of RES4) if (castle.res[r] < c.cost[r]) return { error: 'Недостаточно ресурсов.' };
    if (castle.res.people < c.people) return { error: 'Не хватает людей.' };
    for (const r of RES4) castle.res[r] -= c.cost[r];
    castle.res.people -= c.people;
    castle.units[u.id] -= 1; if (!castle.units[u.id]) delete castle.units[u.id];
    if (castle.general && castle.general.dead) { (castle.deadGenerals = castle.deadGenerals || []).push(castle.general); castle.general = null; } // павший остаётся в списке
    const each = Math.max(1, Math.round(c.sec / SPEED)) * 1000;
    castle.training.push({ id: this.db.nextId++, unit: GENERAL_ID, kindId: u.id, building: B.HQ, count: 1, done: 0, each, start: Date.now() });
    this.store.save();
    return { ok: true, msg: 'Тренировка генерала начата!' };
  };
  // сменить воина: уровень, опыт, очки и снаряжение остаются; цена — как найм нового генерала (воин из армии уходит), переобучение — полчаса.
  // Сила генерала от воина не зависит — только облик и цена воскрешения ресурсами
  P.rekindGeneral = function rekindGeneral(castle, unitId, user) {
    const g = castle.general;
    if (!g) return { error: 'Генерала нет.' };
    if (g.dead) return { error: 'Генерал погиб — сначала воскресите его.' };
    if (g.away) return { error: 'Генерал в походе.' };
    if (g.rekind) return { error: 'Генерал уже переобучается.' };
    const u = UNIT[unitId]; if (!u || !this.genTrainUnits(castle).includes(u)) return { error: 'Выберите юнита из замковой армии.' };
    if (u.id === g.kindId) return { error: 'Генерал уже из этого воина.' };
    const owner = user || this.ownerOf(castle);
    if (!owner || (owner.gold || 0) < REKIND_GOLD) return { error: `Нужно монет: ${REKIND_GOLD}.` };
    this.goldChange(owner, -REKIND_GOLD, `Смена воина генерала: «${u.name}»`);
    castle.units[u.id] -= 1; if (!castle.units[u.id]) delete castle.units[u.id];
    g.rekind = { kindId: u.id, end: Date.now() + Math.max(1, Math.round(REKIND_SEC / SPEED)) * 1000 };
    this.store.save();
    return { ok: true, msg: `Генерал переобучается в воина «${u.name}» — полчаса. Уровень, опыт, очки и снаряжение останутся.` };
  };

  // ----- марши -----
  // castleAt(x, y) — индекс по координатам в game.js
  // время пути для окна «Поход» — то же, что при отправке: travelSec (скорость войск, наука, снаряжение генерала, торговцы),
  // лагерь разбойников и логово похода — втрое быстрее, Портал — вчетверо; армия не создаётся
  P.marchEta = function marchEta(castle, m) {
    const x = Math.round(Number(m.x)), y = Math.round(Number(m.y)), mission = String(m.mission || '');
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { sec: null };
    const units = {};
    for (const [id, n] of Object.entries(m.units && typeof m.units === 'object' ? m.units : {})) if (Object.prototype.hasOwnProperty.call(UNIT, id) && Number(n) > 0) units[id] = Math.floor(Number(n));
    const general = !!m.general && !!castle.general && !castle.general.dead;
    if (!Object.keys(units).length && !general) return { sec: null };
    let sec = this.travelSec(castle, units, general, x, y, mission === 'trade');
    const target = this.castleAt(x, y), obj = target ? null : this.worldObjects(x, y, 1, 1)[0];
    const lair = !target && !obj && ['attack', 'raid'].includes(mission) ? this.lairAt(castle.owner, x, y) : null;
    if ((lair || (obj && CAMPS.includes(obj.img))) && ['attack', 'raid'].includes(mission)) sec = Math.max(5, Math.round(sec / CAMP_FAST));
    if (m.portal && this.buildingLevel(castle, B.PORTAL)) sec = Math.max(5, Math.round(sec / 4));
    return { sec };
  };
  P.travelSec = function travelSec(castle, units, general, x, y, merchants = false) {
    const speeds = Object.keys(units).filter((id) => units[id] > 0 && UNIT[id].speed > 0).map((id) => UNIT[id].speed);
    if (general) speeds.push(UNIT[GENERAL_ID].speed);
    if (!speeds.length) speeds.push(5); // у юнитов со скоростью 0 (как в оригинале) — временно 5 полей/час, пока не поправим ходьбу
    const b = this.bonus(castle);
    const v = Math.min(...speeds) * b.speed * (merchants ? b.tradeSpeed : 1) * (general && castle.general ? 1 + this.heroBonus(castle.general).speed : 1);
    return Math.max(5, Math.round(Math.hypot(x - castle.x, y - castle.y) / (v * MARCH) * 3600 / SPEED));
  };
  // отправка: from = 'castle' (вся Замковая армия) или id отряда (весь отряд), как в оригинале; либо units — выборочно.
  // portal — через Портал (в 4 раза быстрее), at — расписание отправки (время, мс)
  P.sendArmy = function sendArmy(castle, { units = {}, general = false, x, y, mission, res = null, from = null, portal = false, at = 0, pick = null, pickGen = false, dropShield = false }) {
    // до списания войск: без премиума расписание недоступно
    if (at && Number(at) > Date.now() + 3000 && !this.isPremium(this.userById(castle.owner))) return { error: 'Расписание отправки доступно с премиумом.' };
    if (mission === 'trade') return this.sendTrade(castle, { x, y, res });
    this.tick(castle); this.mil(castle);
    let squad = null;
    if (from !== null && from !== undefined && from !== '') {
      if (from === 'castle') { units = { ...castle.units }; general = !!(castle.general && !castle.general.dead && !castle.general.away && !castle.general.squad); }
      else {
        squad = castle.squads.find((q) => q.id === Number(from));
        if (!squad) return { error: 'Армия не найдена.' };
        units = { ...squad.units }; general = !!(castle.general && castle.general.squad === squad.id && !castle.general.dead);
      }
      // армия идёт целиком, но в поход берутся только подходящие юниты — остальные остаются в замке
      const fits = { scout: (r) => ['scout', 'eye'].includes(r), expedition: (r) => r === 'archaeologist', trade: (r) => r === 'merchant', settle: (r) => !['merchant', 'archaeologist', 'sage'].includes(r), attack: (r) => !['merchant', 'archaeologist', 'sage'].includes(r) }[mission]
        || ((r) => !['merchant', 'archaeologist', 'sage', 'settler'].includes(r));
      units = Object.fromEntries(Object.entries(units).filter(([u]) => UNIT[u] && fits(UNIT[u].role) && !UNIT[u].dungOnly)); // Страж глубин — только в Подземелье
      if (pick && typeof pick === 'object') { // игрок выбрал, сколько каких юнитов взять (остальные остаются в замке)
        units = Object.fromEntries(Object.entries(units).map(([u, n]) => [u, Math.min(n, Math.max(0, Math.floor(Number(pick[u]) || 0)))]).filter(([, n]) => n > 0));
        general = general && !!pickGen;
      }
      if (!['attack', 'raid', 'reinforce', 'rally'].includes(mission)) general = false;
    }
    x = Math.round(Number(x)); y = Math.round(Number(y));
    if (!MISSIONS[mission]) return { error: 'Неизвестная миссия.' };
    if (mission === 'dig' || mission === 'dsteal') return { error: 'В Подземелье отряды отправляют из здания «Экспедиция».' };
    // созыв на мирового босса (boss.js): войска идут в общую армию альянса и бьют вместе, когда созыв закончится
    const rally = mission === 'rally' ? this.rallyOf && this.rallyOf(this.ownerOf(castle)) : null;
    if (mission === 'rally') { if (!rally) return { error: 'Созыва нет: его объявляет руководство альянса в окне мирового босса.' }; x = rally.b.x; y = rally.b.y; at = 0; portal = false; }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Укажите координаты цели.' };
    if (x === castle.x && y === castle.y) return { error: 'Это ваш замок.' };
    if (!this.buildingLevel(castle, B.HQ) && mission !== 'trade') return { error: 'Нужен Военный штаб.' };
    const clean = {};
    for (const [id, n0] of Object.entries(units)) {
      const n = Math.floor(Number(n0)); if (!(n > 0)) continue;
      if (!UNIT[id] || ((squad ? squad.units : castle.units)[id] || 0) < n) return { error: `Не хватает: ${UNIT[id] ? UNIT[id].name : id}.` };
      if (UNIT[id].dungOnly) return { error: `${UNIT[id].name} ходит только в Подземелье.` };
      clean[id] = n;
    }
    const roles = Object.keys(clean).map((id) => UNIT[id].role);
    const g = castle.general;
    if (mission === 'rune') general = false; // за руной идёт отряд, генерал остаётся
    if (general && (!g || g.dead || g.away)) return { error: 'Генерал недоступен.' };
    if (!roles.length && !general) return { error: pick ? 'Выберите, каких и сколько войск отправить.' : from ? 'В этой армии нет войск.' : 'Выберите войска.' };
    if (portal && !this.buildingLevel(castle, B.PORTAL)) return { error: 'Нужен Портал.' };
    const target = this.castleAt(x, y);
    const obj = target ? null : this.worldObjects(x, y, 1, 1)[0];
    let cargo = null;
    if (target && HOSTILE.includes(mission) && this.sameAlliance(castle.owner, target.owner)) return { error: 'Это замок Вашего альянса — нападать, грабить и разведывать нельзя. Можно отправить подкрепление или ресурсы.' };
    if (mission === 'scout' && roles.some((r) => !['scout', 'eye'].includes(r))) return { error: 'В разведку идут только разведчики (и Око).' };
    if (mission === 'expedition') {
      // раскопки в руинах убраны (с 22.10): археологи ходили без боя и без предела — вечный поиск артефактов; армии, ушедшие раньше, доходят как прежде
      return { error: 'В руины экспедиции больше не ходят — отправляйте археологов из здания «Экспедиция».' };
    }
    if (mission === 'trade') {
      if (!target) return { error: 'Торговцы везут ресурсы только в замок.' };
      if (roles.some((r) => r !== 'merchant')) return { error: 'Ресурсы возят торговцы.' };
      cargo = {}; let total = 0;
      for (const r of RES4) { const v = Math.max(0, Math.floor(Number((res || {})[r]) || 0)); if (castle.res[r] < v) return { error: 'Недостаточно ресурсов.' }; cargo[r] = v; total += v; }
      if (!total) return { error: 'Укажите, сколько везти.' };
      const cap = (clean[221] || 0) * UNIT[221].carry * this.bonus(castle).tradeCarry;
      if (total > cap) return { error: `Торговцы унесут только ${Math.floor(cap)}.` };
      for (const r of RES4) castle.res[r] -= cargo[r];
    }
    if (['attack', 'raid'].includes(mission) && roles.some((r) => r === 'merchant')) return { error: 'Торговцы не воюют.' };
    if (mission === 'rune') { // «Сбор руны» (runes.js): цель — рунный камень; руну забирает тот, кто дошёл первым
      if (target || !this.runeAt(x, y)) return { error: 'Здесь нет рунного камня. Руны стоят на карте мира — по три в каждой провинции.' };
      if (roles.some((r) => r === 'merchant')) return { error: 'Торговцы руны не собирают — отправьте воинов.' };
    }
    if (mission === 'reinforce' && !target) return { error: 'Подкрепление отправляют в замок.' };
    if (mission === 'reinforce' && roles.some((r) => r === 'merchant')) return { error: 'Торговцы не воюют.' };
    if (target && target.owner === castle.owner && !['trade', 'reinforce'].includes(mission)) return { error: 'Это ваш замок.' };
    // генерал идёт в подкреплении только в свой замок (перевод генерала); в замке может быть лишь один генерал
    if (general && mission === 'reinforce') {
      if (!target || target.owner !== castle.owner) { if (!from) return { error: 'Генерал идёт подкреплением только в свой замок.' }; general = false; }
      else {
        if (target.general && !target.general.dead) return { error: `В замке «${target.name}» уже есть генерал.` };
        if (castle.armies.some((x) => x.general && x.mission === 'reinforce' && x.x === target.x && x.y === target.y)) return { error: 'Генерал уже идёт в этот замок.' };
      }
    }
    const me = this.ownerOf(castle);
    if (mission === 'settle') { const e = this.settleError(me, x, y, clean[TRAVELER_ID] || 0); if (e) return { error: e }; }
    if (target && target.site && mission === 'raid') return { error: 'Набег на недострой ничего не даст — там нечего грабить. Нападение или подкрепление.' };
    // под куполом армии не воюют: клиент предупреждает, что купол сгорит, и с согласия игрока (dropShield) купола снимаются — только если поход состоится
    const domed = ['attack', 'raid', 'scout', 'rally'].includes(mission) && this.userShielded(me);
    if (domed && !dropShield) return { error: this.shieldedMsg(me), domed: this.domesText(me) };
    if (target && target.owner !== castle.owner && this.castleShield(target)) return { error: mission === 'reinforce' ? 'Замок под защитой — подкрепление в него отправить нельзя.' : 'Замок под защитой — нападать и разведывать его нельзя.' };
    if (target && ['attack', 'raid', 'scout'].includes(mission) && !me.admin && this.isNewbie(this.ownerOf(target))) return { error: `Игрок под защитой новичка ещё ${this.newbieLeftText(this.ownerOf(target))}.` };
    if (target && ['attack', 'raid'].includes(mission) && this.isNewbie(me)) { me.newbieOff = true; this.cache = {}; } // новичок напал сам — его защита снимается
    const lair = !target && !obj && ['attack', 'raid'].includes(mission) ? this.lairAt(castle.owner, x, y) : null; // логово похода «Тёмные земли»
    if (!target && !obj && !lair && ['attack', 'raid'].includes(mission) && this.bossAt(x, y)) return { error: 'Мирового босса бьют созывом альянса: руководство объявляет созыв в окне босса, участники отправляют туда войска.' };
    if (!['settle', 'rally', 'rune'].includes(mission) && !target && !lair && (!obj || (!NPC[obj.img] && mission !== 'scout'))) return { error: 'Здесь некого атаковать.' };
    if (domed) this.shieldDropAll(me); // все проверки пройдены — купола сняты насовсем
    const src = squad ? squad.units : castle.units;
    for (const [id, n] of Object.entries(clean)) { src[id] -= n; if (!src[id]) delete src[id]; }
    if (squad) { // то, что не пошло в поход, остаётся в Замковой армии
      for (const [u, n] of Object.entries(squad.units)) if (n > 0) castle.units[u] = (castle.units[u] || 0) + n;
      castle.squads = castle.squads.filter((q) => q !== squad);
    }
    let sec = this.travelSec(castle, clean, general, x, y, mission === 'trade');
    if ((lair || (obj && CAMPS.includes(obj.img))) && ['attack', 'raid'].includes(mission)) sec = Math.max(5, Math.round(sec / CAMP_FAST));
    // созыв: армия встаёт в созыв и бьёт, когда он закончится; домой — быстрым маршем: вчетверо быстрее и не дольше 15 минут
    const ret = rally ? Math.max(20, Math.min(Math.round(sec / 4), Math.round(900 / SPEED))) : 0;
    if (rally) sec = Math.max(1, Math.ceil((rally.r.end - Date.now()) / 1000));
    if (portal) sec = Math.max(5, Math.round(sec / 4));
    const now = Date.now(), start = at && Number(at) > now + 3000 ? Number(at) : now;
    const army = { id: this.db.nextId++, units: clean, general: !!general, mission, x, y, depart: start, arrive: start + sec * 1000, sec, state: start > now ? 'wait' : 'go', loot: null, cargo,
      squad: squad ? { id: squad.id, name: squad.name } : from === 'castle' ? { id: 0, name: 'Замковая армия' } : null, portal: !!portal };
    if (rally) Object.assign(army, { arrive: rally.r.end, rally: rally.r.id, ret }); // ударит вместе со всем созывом, домой — быстрым маршем (ret, с)
    if (general) { g.away = army.id; delete g.squad; }
    castle.armies.push(army);
    if (mission === 'expedition') this.addStat(castle.owner, 'expeds', 1);
    if (army.state === 'go') this.warnIncoming(castle, army);
    this.store.save();
    return { army, sec, dropped: domed || undefined };
  };

  // ----- мир: армии прибывают и возвращаются (вызывается раз в секунду для всех замков) -----
  P.tickWorld = function tickWorld(now = Date.now()) {
    this.sitesTick(now); // недострои: достроены?
    if (this.dungTick) this.dungTick(now); // Подземелье: раскопки закончились, лагеря вернулись (dungeon.js)
    if (this.trapTick) this.trapTick(now); // Темница: вербовка закончилась, пленные сбежали (trap.js)
    if (this.huntTick) this.huntTick(now); // Зона охоты: Генералы дошли до чудовищ — удар (hunt.js)
    if (this.rallyTick) this.rallyTick(now); // созывы на мирового босса: время вышло — армии складываются и бьют (boss.js), до прибытия остальных армий
    const due = [];
    for (const c of Object.values(this.db.castles)) {
      if (!c.armies || !c.armies.length) continue; // замки без армий в пути 
      for (const a of c.armies) {
        if (a.state === 'wait' && a.depart <= now) { a.state = 'go'; this.warnIncoming(c, a); } // расписание: время выхода наступило
        if ((a.state === 'go' && a.arrive <= now) || (a.state === 'back' && a.back <= now)) due.push([c, a]);
      }
    }
    due.sort((p, q) => (p[1].state === 'go' ? p[1].arrive : p[1].back) - (q[1].state === 'go' ? q[1].arrive : q[1].back));
    for (const [c, a] of due) {
      // пока разбирали список, армии уже нет у её замка (замок захватили, удалили, армию отозвали) — её не обрабатываем:
      // иначе возвращающаяся армия прежнего хозяина доставалась захватчику (после перезапуска сервера все события идут пачкой)
      if (this.db.castles[c.id] !== c || !(c.armies || []).includes(a)) continue;
      if (a.state === 'go') this.arrive(c, a, a.arrive);
      else this.returnHome(c, a);
    }
    if (due.length) this.store.save();
    return due.length;
  };
  P.returnHome = function returnHome(c, a) {
    if (this.tgNotify && a.mission !== 'trade') { const n = Object.values(a.units).reduce((q, k) => q + k, 0), loot = a.loot ? Object.values(a.loot).reduce((q, k) => q + (k || 0), 0) : 0;
      this.tgNotify(c.owner, 'home', `🏰 Армия вернулась в «${c.name}»: ${Wd.warriors(n)}${a.general ? ' и генерал' : ''}${loot ? `, добыча ${Wd.resources(Math.floor(loot))}` : ''}.`); }
    this.tick(c);
    this.mil(c);
    if ((a.find || a.art) && this.dungHome) this.dungHome(c, a); // находка, отнятая в Подземелье, — в замок (dungeon.js)
    const units = Object.fromEntries(Object.entries(a.units).filter(([id, n]) => n > 0 && Number(id) !== MERCHANT_ID)); // торговцы просто возвращаются на Рынок
    if (a.squad && a.squad.id) { // отряд возвращается отдельной армией
      c.squads.push({ id: a.squad.id, name: a.squad.name, units });
      if (a.general && c.general && c.general.away === a.id) { delete c.general.away; c.general.squad = a.squad.id; }
    } else {
      for (const [id, n] of Object.entries(units)) c.units[id] = (c.units[id] || 0) + n;
      if (a.general && c.general && c.general.away === a.id) delete c.general.away;
    }
    const cap = this.capacity(c);
    // добыча — в замок до вместимости Складов, сверх — пропадает (с игроков, лагерей и руин одинаково; в Кладовую не идёт)
    if (a.loot) for (const r of RES4) c.res[r] = Math.max(c.res[r], Math.min(cap[r], c.res[r] + (a.loot[r] || 0)));
    c.armies = c.armies.filter((x) => x !== a);
    const lootTxt = a.loot ? ` Добыча: ${RES4.map((r) => a.loot[r] || 0).join('/')}` : '';
    this.event(c.owner, `Армия вернулась (${MISSIONS[a.mission]}).${lootTxt}`);
  };
  // подкрепление в свой замок: армия становится отдельной армией нового замка, генерал — генералом этого замка
  P.transferArmy = function transferArmy(c, a, target) {
    this.mil(target);
    const units = Object.fromEntries(Object.entries(a.units).filter(([, n]) => n > 0));
    let gName = null;
    const sid = this.db.nextId++, name = a.squad && a.squad.id ? a.squad.name : `${target.id}.${sid}`;
    if (Object.keys(units).length || a.general) target.squads.push({ id: sid, name, units });
    if (a.general && c.general && c.general.away === a.id) {
      if (target.general && target.general.dead) { (target.deadGenerals = target.deadGenerals || []).push(target.general); target.general = null; } // павший — в список павших замка
      if (target.general) { delete c.general.away; } // в замке уже есть живой генерал — наш остаётся дома
      else { const g = c.general; delete g.away; g.squad = sid; target.general = g; c.general = null; gName = g.name; }
    }
    c.armies = c.armies.filter((x) => x !== a);
    this.report(c.owner, `Армия переведена в замок «${target.name}»`, [`Армия «${name}» прибыла в ваш замок ${target.name} (${target.x}:${target.y}) и теперь в его Военном штабе.`,
      `Войска: ${unitsLine(units)}`, ...(gName ? [`Генерал «${gName}» теперь служит в замке «${target.name}». Переформируйте его в любую армию в Военном штабе.`] : [])], 'reinforce');
    this.store.save();
  };
  P.goBack = function goBack(c, a, t) {
    const alive = Object.values(a.units).some((n) => n > 0) || (a.general && c.general && !c.general.dead);
    if (!alive) { c.armies = c.armies.filter((x) => x !== a); if (a.general && c.general) delete c.general.away; return; }
    a.state = 'back';
    a.back = t + (a.arrive - a.depart);
  };

  // сила атаки армии
  // сила нападения: сырая сумма атак по родам войск (с Кузницей), затем бонусы (наука, храм, артефакты, командование генерала)
  P.armyPower = function armyPower(c, units, withGeneral) {
    const b = this.bonus(c);
    let inf = 0, cav = 0, mag = 0;
    for (const [id, n] of Object.entries(units)) {
      const u = UNIT[id]; if (!u || !n) continue;
      const atk = u.attack ? u.attack + this.forgeLvl(c, id, 'a') : 0; // Кузница: +1 к базовой атаке за уровень
      if (u.type === 'cavalry') cav += atk * n; else inf += atk * n;
      mag += (u.magic ? u.magic + this.forgeLvl(c, id, 'm') : 0) * n; // Школа магии: +1 к магической атаке за уровень
    }
    let gl = 0, cmd = 0, genAtk = 0;
    if (withGeneral && c.general && !c.general.dead) { const gs = this.genStats(c.general), ga = gs.atk * (this.artOn(c, 'claw') ? 2 : 1); gl = c.general.level; cmd = gs.catk; genAtk = ga; if (gs.mage) mag += ga; else if (gs.cls === 'cav') cav += ga; else inf += ga; } // генерал — как его воин: маг, всадник или пехотинец
    const k = b.atk * (1 + cmd), km = b.magic * b.atk * (1 + cmd); // командование — и магам (как в бою, с 27.10)
    return { inf: inf * k, cav: cav * k, mag: mag * km, gl,
      raw: { inf: Math.round(inf), cav: Math.round(cav), mag: Math.round(mag), gen: Math.round(genAtk) }, bonusPct: Math.round((k - 1) * 100), magicPct: Math.round((km - 1) * 100) };
  };
  // сила обороны замка против атаки с долями пехоты/кавалерии
  // армии, стоящие в замке d подкреплением (из других замков)
  P.guestsOf = function guestsOf(d) {
    const out = [];
    for (const c of Object.values(this.db.castles)) if (c.armies && c.armies.length) for (const a of c.armies) if (a.state === 'stay' && a.stayAt === d.id) out.push({ c, a });
    return out;
  };
  // все войска, защищающие замок: Замковая армия, отряды в замке, подкрепления
  P.defenders = function defenders(d) { this.mil(d); return [d.units, ...d.squads.map((q) => q.units), ...this.guestsOf(d).map((g) => g.a.units)]; };
  // сила обороны: защита войск против того рода атаки, которым идут на замок (доли pInf/pCav), бонусы, затем Забор (+% и +10 за уровень)
  P.defensePower = function defensePower(d, pInf, pCav) {
    const b = this.bonus(d);
    let phys = 0, mag = 0;
    const add = (id, n) => { const u = UNIT[id]; if (!u || !n) return; const fd = this.forgeLvl(d, id, 'd'); phys += ((u.def.inf + fd) * pInf + (u.def.cav + fd) * pCav) * n; mag += (u.def.mag + this.forgeLvl(d, id, 'md')) * n; }; // Школа магии: +1 к маг. защите
    for (const m of this.defenders(d)) for (const [id, n] of Object.entries(m)) if (!(UNIT[id] && UNIT[id].dungOnly)) add(id, n);
    let gk = 1; // генерал дома: его защита (от воина) и командование защитой — всем защитникам замка
    if (d.general && !d.general.dead && !d.general.away) { const gs = this.genStats(d.general); phys += gs.def * (pInf + pCav); mag += gs.mdef; gk = 1 + gs.cdef; }
    const rawPhys = phys, rawMag = mag, wallK = 1 + b.wallPer * b.wall;
    phys = (phys * b.def * gk + 10 * b.wall) * wallK;
    return { phys, mag: mag * b.def * gk * b.magic, raw: { phys: Math.round(rawPhys), mag: Math.round(rawMag) }, bonusPct: Math.round((b.def * gk - 1) * 100), magicPct: Math.round((b.def * gk * b.magic - 1) * 100),
      wall: b.wall, wallPct: Math.round((wallK - 1) * 100), wallFlat: 10 * b.wall };
  };
  // потери: доля frac от каждого вида войск; дробная часть — с соответствующей вероятностью
  // (иначе отряд из 1–2 воинов при потерях 40% не терял бы никого)
  const applyLoss = (units, frac) => {
    const lost = {};
    for (const [id, n] of Object.entries(units)) {
      const x = n * frac; let l = Math.floor(x); if (process.env.LUCK !== '0' ? Math.random() < x - l : x - l >= 0.5) l++;
      l = Math.min(n, l); lost[id] = l; units[id] = n - l;
    }
    return lost;
  };
  const unitsLine = (units, lost) => Object.entries(units).filter(([id]) => UNIT[id]).map(([id, n]) => `${UNIT[id].name}: ${n + (lost ? lost[id] || 0 : 0)}${lost && lost[id] ? ` (−${lost[id]})` : ''}`).join(', ') || '—';
  const mergeUnits = (maps) => { const o = {}; for (const m of maps) for (const [id, n] of Object.entries(m)) if (n > 0) o[id] = (o[id] || 0) + n; return o; };
  // потери в ресурсах: стоимость погибших юнитов + население
  const lossRes = (lost) => { const o = { wood: 0, stone: 0, iron: 0, food: 0, people: 0 };
    for (const [id, n] of Object.entries(lost)) { const u = UNIT[id]; if (!u || !n) continue; RES4.forEach((r, i) => { o[r] += ((Array.isArray(u.cost) ? u.cost[i] : (u.cost || {})[r]) || 0) * n; }); o.people += (u.pop || 0) * n; }
    return o; };
  const popOf = (units) => Object.entries(units).reduce((s, [id, n]) => s + (UNIT[id] ? UNIT[id].pop * n : 0), 0);
  // население павших для очков боевого ранга (с 21.10): торговцы, путешественники, учёные, археологи и бунтари очков не дают
  // (путешественник «весит» 3 000 — вдвоём качали ранг, убивая их друг у друга); раненые — ушедшие в Лазарет (wnd) и выздоровевшие
  // дома (heal) — за четверть
  const rankPop = (lost, wnd = {}, heal = {}) => Object.keys({ ...lost, ...heal }).reduce((s, id) => {
    const u = UNIT[id]; if (!u || RANK_NONE.includes(u.role)) return s;
    const n = lost[id] || 0, w = Math.min(n, wnd[id] || 0);
    return s + u.pop * (n - w + RANK_WOUND * (w + (heal[id] || 0)));
  }, 0);

  // отчёт: title и lines — текстом, data — для оформленного окна отчёта в клиенте (стороны, потери, добыча, захват)
  P.report = function report(userId, title, lines, kind = 'battle', data = null) {
    this.db.reports = this.db.reports || [];
    this.db.reports.push({ id: this.db.nextId++, owner: userId, at: Date.now(), kind, title, lines, data, read: false });
    if (this.db.reports.length > 2000) this.db.reports.splice(0, this.db.reports.length - 2000);
    this.event(userId, title);
    if (this.tgNotify && ['battle', 'scout', 'expedition'].includes(kind)) this.tgNotify(userId, 'battle', `📜 ${title}`);
  };

  // ===== бой как в оригинале (с 24.10; раньше — «как в Travian»: сила атаки против защиты) =====
  // У воина три атаки — по пехоте, по коннице и по магам («Справка») — и здоровье; защиты нет. Свой удар воин делит между родами войск
  // противника в той доле, сколько у каждого рода здоровья: пехота бьёт магов, маги — конницу, конница — пехоту (так в «Справке»).
  // Специализация: атакующие (A) в обороне бьют вдвое слабее, защитники (D) при нападении — вдвое слабее, универсалы — в полную силу.
  // Бой идёт раундами, обе стороны бьют одновременно; урон / здоровье = павшие. Нападение — до гибели одной из сторон (проигравший гибнет
  // весь); набег — короткая стычка: пока одна из сторон не потеряет половину здоровья. Урон: Кузница «атака» и Школа магии «маг. атака» —
  // +5% за уровень, науки, генерал, удача, боевой дух; здоровье: Кузница «защита» — +5% против воинов, «маг. защита» — +5% против магов,
  // науки, Забор, сам замок (DEF_HOME). Тараны бьют Забор до боя и после него исчезают.
  P.newBattle = function newBattle() { return !!(this.db.battleRules && this.db.battleRules.on); }; // новые правила (проба администратора): удача ±5%, Кузница — не больше половины базы
  P.clash = function clash(c, a, target, npc, t) {
    const att = this.ownerOf(c), bA = this.bonus(c), nb = this.newBattle();
    const luck = process.env.LUCK === '0' ? 0 : nb ? Math.round(Math.random() * 10 - 5) : Math.round(Math.random() * 20 - 10);
    // боевой дух: сильный против намного более слабого бьёт хуже (до −50%)
    let morale = 1;
    const defUser = target && this.ownerOf(target);
    if (defUser && att && defUser.id !== att.id) { const aR = this.userRating(att), dR = Math.max(1, this.userRating(defUser)); if (aR > dR) morale = Math.max(0.5, (dR / aR) ** 0.3); }
    const raid = a.mission === 'raid';
    // воин в бою: a — урон по пехоте/коннице/магам (с Кузницей и специализацией), hpP / hpM — множители здоровья против воинов / против магов
    const stack = (m, id, n, own, castle, side, extra) => { const u = UNIT[id]; if (!u || !n) return null; const cap = nb ? forgeCaps(u) : null;
      const f = (k) => { const v = castle && u.race !== 'all' ? this.forgeLvl(castle, id, k) : 0; return cap ? Math.min(v, cap[k]) : v; }; // общие воины (Бунтарь, Путешественник, Катапульта, Таран) — без улучшений
      const sp = side === 'att' ? (u.spec === 'D' ? SPEC_K : 1) : (u.spec === 'A' ? SPEC_K : 1), dm = (1 + FORGE_K * (f('a') + f('m'))) * sp, A3 = a3Of(u);
      return { m, id, n, own, cls: CLS(u.type), mage: u.type === 'magic', hp: u.hp || 10, a: { inf: A3.inf * dm, cav: A3.cav * dm, mag: A3.mag * dm },
        hpP: 1 + FORGE_K * f('d'), hpM: 1 + FORGE_K * f('md'), shield: !u.oneUse, ...extra }; };
    // генерал в строю — как его воин (с 27.10): род войск, удары по пехоте/коннице/магам, здоровье и специализация воина (удары — с Личной
    // атакой); принимает часть ударов (его гибель решается после боя). claw — «Коготь Полководца»: удары генерала ×2
    const genStack = (gs, side, claw) => { const k = (claw ? 2 : 1) * (side === 'att' ? (gs.spec === 'D' ? SPEC_K : 1) : (gs.spec === 'A' ? SPEC_K : 1));
      return { m: null, gen: true, id: GENERAL_ID, n: 1, own: false, cls: gs.cls || 'inf', mage: !!gs.mage, hp: gs.hp || UNIT[GENERAL_ID].hp, a: { inf: gs.a3.inf * k, cav: gs.a3.cav * k, mag: gs.a3.mag * k }, hpP: 1, hpM: 1, shield: true }; };
    // нападающие
    const A = Object.entries(a.units).map(([id, n]) => stack(a.units, id, n, false, c, 'att')).filter(Boolean);
    // командование генерала — армии, где он (с 27.10): урон всей армии (и магов) и её защита; раньше защита шла от генерала, сидящего дома
    let genA = 0, cmd = 0, cmdD = 0; if (a.general && c.general && !c.general.dead) { const gs = this.genStats(c.general), st = genStack(gs, 'att', this.artOn(c, 'claw')); genA = (st.a.inf + st.a.cav + st.a.mag) / 3; cmd = gs.catk; cmdD = gs.cdef; A.push(st); }
    // умения и снаряжение генерала (hero.js): у нападающего — если генерал в этой армии, у защитника — если генерал дома
    const hA = a.general && c.general && !c.general.dead ? this.heroBonus(c.general) : null;
    const hD = target && target.sim ? target.sim.hero : target && target.general && !target.general.dead && !target.general.away ? this.heroBonus(target.general) : null; // target.sim — замок симулятора (simBattle)
    const hAtk = hA ? 1 + hA.atk + (a.mission === 'attack' ? hA.fury : 0) : 1, raidK = raid && hA ? 1 + hA.raid : 1;
    const kA = bA.atk * (1 + cmd) * hAtk * morale * (1 + luck / 100) * raidK, kmA = bA.magic * bA.atk * (1 + cmd) * (hA ? 1 + hA.mag : 1) * morale * (1 + luck / 100) * raidK;
    const aHp = bA.def * (hA ? 1 + hA.def : 1) * (1 + cmdD), aMHp = aHp * bA.magic;
    for (const s of A) { const k = s.mage ? kmA : kA; s.a = { inf: s.a.inf * k, cav: s.a.cav * k, mag: s.a.mag * k }; s.hpP *= aHp; s.hpM *= aMHp; }
    // защитники: Замковая армия и отряды (свои), подкрепления (со своими бонусами; от замка — Забор и сам замок), генерал; у NPC — охрана
    const D = []; let bD = null, wallL = 0, wall0 = 0;
    const siege = []; let siegeN = 0;
    if (target) {
      bD = target.sim ? target.sim.bonus : this.bonus(target); wall0 = wallL = bD.wall;
      // тараны: урон по стене (со скринов) до боя
      let ram = Object.entries(a.units).reduce((q, [id, n]) => q + ((UNIT[id] && UNIT[id].wallDmg) || 0) * n, 0);
      if (hA) ram *= 1 + hA.ram;
      if (this.artOn(target, 'seal') && ram) { if (a.mission === 'attack') siege.push('«Печать Нерушимости»: тараны бьют вдвое слабее'); ram /= 2; } // разрушители вдвое слабее
      if (ram && a.mission === 'attack') { while (wallL > 0 && ram >= wallHp(wallL)) { ram -= wallHp(wallL); wallL--; } }
      if (wallL < wall0 && !nb) { this.setBuildingLevel(target, B.FENCE, wallL); siege.push(`Забор: ${wall0} → ${wallL} ур. (тараны)`); siegeN += wall0 - wallL; } // новые правила — только после победы (ниже)
      const wallK = 1 + bD.wallPer * (hD ? 1 + hD.wall : 1) * wallL, hDd = hD ? 1 + hD.def : 1;
      const home = !target.site ? DEF_HOME * (this.artOn(target, 'hand') ? 1.15 : 1) : 1; // недострой — ещё не крепость; «Длань Хранителя» — +15% к защите войск в замке
      // у «замка-симуляции» (симулятор, лагерь Подземелья) бонуса атаки нет — 1
      // генерал защитника — дома: бьётся в строю как его воин, его командование атакой и защитой — всем защитникам замка (с 27.10)
      const gD = target.sim ? target.sim.gen || null : target.general && !target.general.dead && !target.general.away ? this.genStats(target.general) : null;
      const cA = 1 + ((gD && gD.catk) || 0), cH = 1 + ((gD && gD.cdef) || 0);
      const put = (s, b) => { if (!s) return; const ba = b.atk ?? 1, bm = b.magic ?? 1, k = (s.mage ? bm * ba : ba) * cA, hk = (b.def ?? 1) * wallK * hDd * home * cH; s.a = { inf: s.a.inf * k, cav: s.a.cav * k, mag: s.a.mag * k }; s.hpP *= hk; s.hpM *= hk * bm; D.push(s); };
      for (const m of [target.units, ...target.squads.map((q) => q.units)]) for (const [id, n] of Object.entries(m)) { if (UNIT[id] && UNIT[id].dungOnly && !target.dung) continue; put(stack(m, id, n, true, target, 'def'), bD); } // Страж глубин замок не защищает
      for (const g of this.guestsOf(target)) { const gb = this.bonus(g.c); for (const [id, n] of Object.entries(g.a.units)) put(stack(g.a.units, id, n, false, g.c, 'def', { guest: g }), gb); }
      if (gD && gD.a3) put(genStack(gD, 'def', false), bD);
    } else for (const g of npcGarrison(npc)) {
      if (g.unitId) { const s = stack(null, g.unitId, g.n, false, null, 'def', { npc: g }); s.hpP *= npc.hpK || 1; s.hpM *= npc.hpK || 1; D.push(s); continue; } // воины из тренировок (лагеря, руины, Подземелье)
      const v = (g.atk || 0) + (g.mag || 0); D.push({ m: null, id: g.key, n: g.n, own: false, npc: g, cls: CLS(g.type), mage: g.type === 'magic', hp: g.hp, a: { inf: v * NPC_DMG, cav: v * NPC_DMG, mag: v * NPC_DMG }, hpP: (1 + (g.def || 0) / NPC_ARM) * (npc.hpK || 1), hpM: (1 + (g.mdef || 0) / NPC_ARM) * (npc.hpK || 1), shield: true }); }
    const sum = (L, f) => L.reduce((q, s) => q + f(s), 0);
    const avg = (s) => (s.a.inf + s.a.cav + s.a.mag) / 3;
    const isCamp = !target && npc && ([30, 31, 32, 24].some((k) => NPC[k] === npc) || !!npc.dung); // лагеря, руины и охрана Подземелья (не логова «Тёмных земель»)
    // лагеря и руины (с 22.10): охрана крепнет вместе с бонусами нападающего — Кузница, науки, ранг, генерал, снаряжение (урону — здоровьем, здоровью — уроном).
    // Иначе прокачанный замок грабил лагеря почти без потерь; прокачка помогает, но меньше
    if (isCamp) {
      const base = sum(A, (s) => (s.gen ? 0 : s.n * ((a3Of(UNIT[s.id]).inf + a3Of(UNIT[s.id]).cav + a3Of(UNIT[s.id]).mag) / 3))) + genA;
      const buff = Math.max(1, (sum(A, (s) => s.n * avg(s)) / (1 + luck / 100) / morale) / (base || 1));
      // и здоровье нападающих (Кузница «защита», науки, генерал): охрана бьёт во столько же раз сильнее
      const hpBuff = Math.max(1, sum(A, (s) => (s.gen || !s.shield ? 0 : s.n * s.hp * (s.hpP + s.hpM) / 2)) / (sum(A, (s) => (s.gen || !s.shield ? 0 : s.n * s.hp)) || 1));
      for (const s of D) { s.hpP *= buff; s.hpM *= buff; s.a = { inf: s.a.inf * hpBuff, cav: s.a.cav * hpBuff, mag: s.a.mag * hpBuff }; }
    }
    // сила сторон для отчёта: урон за удар (воины / маги) и здоровье
    const powOf = (L, mage) => sum(L, (s) => (s.mage === mage ? s.n * avg(s) : 0));
    const PA = powOf(A, false), MA = powOf(A, true), PD = powOf(D, false), MD = powOf(D, true);
    // ---- раунды ----
    const n0 = new Map([...A, ...D].map((s) => [s, s.n]));
    const troops = (L) => sum(L, (s) => (s.gen || !s.shield ? 0 : s.n));
    const hpLeft = (L) => sum(L, (s) => (s.gen || !s.shield ? 0 : s.n * s.hp)), hpA0 = hpLeft(A), hpD0 = hpLeft(D);
    const ehp = (L) => sum(L, (s) => (s.gen || !s.shield ? 0 : s.n * s.hp * (s.hpP + s.hpM) / 2)), ehpA0 = ehp(A), ehpD0 = ehp(D); // здоровье с бонусами — для силы в отчёте
    const strike = (X, Y) => { // кого убьёт сторона X у стороны Y полным ударом
      const hpC = { inf: 0, cav: 0, mag: 0 }; for (const s of Y) if (s.shield && s.n > 0) hpC[s.cls] += s.n * s.hp;
      const all = hpC.inf + hpC.cav + hpC.mag, kill = new Map(); if (!all) return kill;
      const dP = { inf: 0, cav: 0, mag: 0 }, dM = { inf: 0, cav: 0, mag: 0 };
      for (const s of X) if (s.n > 0) for (const k of ['inf', 'cav', 'mag']) if (hpC[k]) (s.mage ? dM : dP)[k] += s.n * s.a[k] * hpC[k] / all;
      for (const s of Y) if (s.shield && s.n > 0) { const part = s.n * s.hp / hpC[s.cls]; kill.set(s, part * (dP[s.cls] / (s.hp * s.hpP) + dM[s.cls] / (s.hp * s.hpM))); }
      return kill;
    };
    let rounds = 0, still = false;
    if (troops(A) >= 0.5 && troops(D) >= 0.5) for (; rounds < 5000; rounds++) {
      const kD = strike(A, D), kA = strike(D, A);
      const fr = (km, L) => { const tot = troops(L); let k = 0; for (const [s, v] of km) if (!s.gen) k += v; return tot > 0 ? k / tot : 0; };
      const f = Math.max(fr(kD, D), fr(kA, A)); if (!(f > 1e-12)) { still = true; break; } // никто никого не может ранить
      const step = Math.min(1, 0.02 / f); // раунд — не больше 2% войска стороны: бой почти непрерывный, исход не зависит от размера раунда
      for (const [s, v] of kD) s.n = Math.max(0, s.n - v * step);
      for (const [s, v] of kA) s.n = Math.max(0, s.n - v * step);
      if (troops(A) < 0.5 || troops(D) < 0.5) break;
      if (raid && (1 - hpLeft(A) / hpA0 >= 0.5 || 1 - hpLeft(D) / hpD0 >= 0.5)) break;
    }
    const lostHpA = hpA0 ? 1 - hpLeft(A) / hpA0 : 0, lostHpD = hpD0 ? 1 - hpLeft(D) / hpD0 : 1;
    const deadA = hpA0 > 0 && troops(A) < 0.5, deadD = troops(D) < 0.5;
    // исход: нападение — пока одна сторона не погибнет (если раунды кончились — проигравший тот, кто потерял большую долю); набег — кто потерял меньше
    const win = !hpA0 ? false : deadD && !deadA ? true : deadA ? false : still && !raid ? false : lostHpA < lostHpD;
    const isCampK = isCamp ? CAMP_LOSS : 1;
    const roll = (v) => { let l = Math.floor(v); if (process.env.LUCK !== '0' ? Math.random() < v - l : v - l >= 0.5) l++; return l; };
    const lostOf = (s, all) => Math.min(n0.get(s), all ? n0.get(s) : roll(n0.get(s) - s.n));
    // нападение: проигравший гибнет весь (если бой не встал: никто никого не ранит — тогда никто и не гибнет); тараны и разрушители — одноразовые (ниже)
    const wipeA = !raid && !win && !still, wipeD = !raid && win;
    const aLostN = new Map(A.filter((s) => !s.gen).map((s) => [s, s.shield ? Math.min(n0.get(s), roll((wipeA ? n0.get(s) : n0.get(s) - s.n) * (win ? isCampK : 1))) : 0]));
    const dLostN = new Map(D.filter((s) => !s.gen).map((s) => [s, lostOf(s, wipeD)]));
    for (const s of A) s.n = n0.get(s); for (const s of D) s.n = n0.get(s); // дальше — исходная численность (потери — в aLostN / dLostN)
    if (nb && target && wallL < wall0 && win) { this.setBuildingLevel(target, B.FENCE, wallL); siege.push(`Забор: ${wall0} → ${wallL} ур. (тараны)`); siegeN += wall0 - wallL; } // новые правила: тараны — только при победе
    const AL = A.filter((s) => !s.gen), DL = D.filter((s) => !s.gen);
    const aShare = sum(AL, (s) => aLostN.get(s) * s.hp) / (sum(AL, (s) => s.n * s.hp) || 1), dShare = DL.length ? sum(DL, (s) => dLostN.get(s) * s.hp) / (sum(DL, (s) => s.n * s.hp) || 1) : 1;
    const routed = 0;
    // применяем потери; раненые защитники в своём замке частично выздоравливают
    const aLost = {}, dLost = {}, dAll = {}, dOwn = {}; // dOwn — павшие свои защитники замка (без подкреплений)
    let saved = 0; // умение «Полевой лекарь»: часть павших в походе выживает (тараны одноразовые — нет)
    for (const s of AL) { let l = aLostN.get(s); if (l && hA && hA.heal && !UNIT[s.id].oneUse) { const h = Math.floor(l * hA.heal); l -= h; saved += h; } if (l) { s.m[s.id] -= l; aLost[s.id] = (aLost[s.id] || 0) + l; } }
    let healed = 0; const dHeal = {}; // dHeal — выздоровевшие дома защитники { id: n }
    for (const s of DL) {
      let l = dLostN.get(s); if (!l) { if (s.m) dAll[s.id] = (dAll[s.id] || 0) + s.n; continue; }
      // выздоровление дома — только если замок устоял или это набег: нападение, взявшее верх, губит защитников целиком (с 24.10;
      // раньше четверть павших вставала и в проигранном бою — «выжили обе стороны»). Раненые всё равно идут в свой Лазарет (ниже)
      if (s.own && !target.site && !(win && a.mission === 'attack')) { const h = Math.floor(l * HEAL_HOME); l -= h; healed += h; if (h) dHeal[s.id] = (dHeal[s.id] || 0) + h; }
      if (s.own && l) dOwn[s.id] = (dOwn[s.id] || 0) + l;
      if (s.m) { s.m[s.id] -= l; if (!s.m[s.id]) delete s.m[s.id]; }
      dLost[s.id] = (dLost[s.id] || 0) + l;
      if (s.m && s.m[s.id]) dAll[s.id] = (dAll[s.id] || 0) + s.m[s.id];
    }
    // подкрепления (с 24.10): у каждого — свои павшие и доля в обороне (по силе удара) — для Зала Славы, отчёта и Лазарета их хозяина
    const guests = []; const powD = sum(DL, (s) => s.n * avg(s)) || 1;
    for (const s of DL) if (s.guest) {
      let x = guests.find((q) => q.g === s.guest); if (!x) guests.push(x = { g: s.guest, lost: {}, share: 0 });
      const l = dLostN.get(s); if (l) x.lost[s.id] = (x.lost[s.id] || 0) + l; x.share += s.n * avg(s) / powD;
    }
    // тараны одноразовые: после боя их больше нет
    const ramsUsed = Object.entries(a.units).filter(([id]) => UNIT[id] && UNIT[id].oneUse).reduce((q, [id, n]) => { if (n) { aLost[id] = (aLost[id] || 0) + n; a.units[id] = 0; } return q + n; }, 0);
    for (const id of Object.keys(a.units)) if (!a.units[id]) delete a.units[id];
    // Лазарет: павшие — ранеными в Лазарет замка, откуда вышла армия, и замка защитников (с мировым боссом — нет: там потери задаёт босс);
    // aWnd / dWnd — сколько каких попало (для очков боевого ранга)
    const aWnd = {}, dWnd = {};
    const wounded = npc && npc.boss ? 0 : this.toInfirmary(c, aLost, aWnd), dWounded = target ? this.toInfirmary(target, dOwn, dWnd) : 0;
    const cnt = (L) => sum(L, (s) => s.n) || 1;
    const aLoss = sum(AL, (s) => aLostN.get(s)) / cnt(AL), dLoss = DL.length ? sum(DL, (s) => dLostN.get(s)) / cnt(DL) : 1;
    const wallK = bD ? 1 + bD.wallPer * (hD ? 1 + hD.wall : 1) * wallL : 1;
    const calc = { rule: a.mission === 'attack' ? 'attack' : 'raid', model: 4, luck, morale: Math.round(morale * 100), rounds,
      att: { phys: Math.round(PA), mag: Math.round(MA), gen: Math.round(genA), bonusPct: Math.round((kA / (1 + luck / 100) / morale / raidK - 1) * 100), total: Math.round(PA + MA), hp: Math.round(hpA0), str: Math.round(Math.sqrt((PA + MA) * ehpA0)), hpLostPct: Math.round(aShare * 100) },
      def: { npc: !target, phys: Math.round(PD), mag: Math.round(MD), bonusPct: bD ? Math.round((bD.def - 1) * 100) : 0, wall: wallL, wall0, wallPct: Math.round((wallK - 1) * 100), total: Math.round(PD + MD), hp: Math.round(hpD0), str: Math.round(Math.sqrt((PD + MD) * ehpD0)), hpLostPct: Math.round(dShare * 100) },
      aLossPct: Math.round(aLoss * 100), dLossPct: Math.round(dLoss * 100), routed, healed, ramsUsed, saved, wounded, dWounded };
    const garrison = target ? null : DL.map((s) => ({ id: s.npc.unitId || null, name: s.npc.name, n: s.n, lost: dLostN.get(s) }));
    return { garrison, guests, win, luck, calc, aLost, dLost, dAll, aWnd, dWnd, dHeal, aLoss: aShare >= 1 ? 1 : aLoss, dLoss: dShare >= 1 || !DL.length ? 1 : dLoss, siege, siegeN };
  };

  // «Сравнить бой» (админка, проба новых правил): вся армия столицы att нападает (или набег) на столицу def — по прежним и по новым
  // правилам. В игре ничего не меняется: бой идёт на копиях замков и подкреплений, без удачи
  P.battleCompare = function battleCompare(att, def, { mission = 'attack', general = true } = {}) {
    const ca = this.castleOf(att), cd = this.castleOf(def);
    if (!ca || !cd) return { error: 'Замок не найден.' };
    if (att.id === def.id) return { error: 'Нападающий и защитник — один и тот же игрок.' };
    mission = mission === 'raid' ? 'raid' : 'attack';
    this.tick(ca); this.mil(ca); this.tick(cd); this.mil(cd);
    const cnt = (o) => Object.values(o || {}).reduce((q, n) => q + (n > 0 ? n : 0), 0);
    const rules = this.db.battleRules, luck = process.env.LUCK;
    const one = (on) => {
      const A = structuredClone(ca), D = structuredClone(cd), guests = this.guestsOf(cd).map((x) => ({ c: x.c, a: structuredClone(x.a) }));
      this.guestsOf = (tg) => (tg === D ? guests : P.guestsOf.call(this, tg));
      this.db.battleRules = { ...(rules || {}), on };
      const a = { units: { ...A.units }, mission, general: !!(general && A.general && !A.general.dead && !A.general.away) };
      const gN = guests.reduce((q, x) => q + cnt(x.a.units), 0), sent = cnt(a.units), had = cnt(D.units) + D.squads.reduce((q, x) => q + cnt(x.units), 0) + gN; // до боя
      const R = this.clash(A, a, D, null, Date.now());
      return { win: R.win, ap: R.calc.att.str, dp: R.calc.def.str, morale: R.calc.morale, sent, aLost: cnt(R.aLost), wounded: R.calc.wounded || 0, saved: R.calc.saved || 0,
        had, dLost: cnt(R.dLost), dWounded: R.calc.dWounded || 0, healed: R.calc.healed || 0, guests: gN, wall0: R.calc.def.wall0, wall: g2wall(D) };
    };
    const g2wall = (D) => this.buildingLevel(D, B.FENCE);
    try { process.env.LUCK = '0'; return { att: att.login, def: def.login, mission, general: !!general, old: one(false), new: one(true) }; } finally {
      delete this.guestsOf; if (rules === undefined) delete this.db.battleRules; else this.db.battleRules = rules;
      if (luck === undefined) delete process.env.LUCK; else process.env.LUCK = luck;
    }
  };

  // бой по здоровью (прежняя модель) — только для мирового босса (boss.js): урон по сегментам его здоровья
  P.clashHp = function clashHp(c, a, target, npc, t) {
    const att = this.ownerOf(c), bA = this.bonus(c), nb = this.newBattle();
    const luck = process.env.LUCK === '0' ? 0 : nb ? Math.round(Math.random() * 10 - 5) : Math.round(Math.random() * 20 - 10);
    // боевой дух: сильный против намного более слабого бьёт хуже (до −50%)
    let morale = 1;
    const defUser = target && this.ownerOf(target);
    if (defUser && att && defUser.id !== att.id) { const aR = this.userRating(att), dR = Math.max(1, this.userRating(defUser)); if (aR > dR) morale = Math.max(0.5, (dR / aR) ** 0.3); }
    const stack = (m, id, n, own, castle, extra) => { const u = UNIT[id]; if (!u || !n) return null; const cap = nb ? forgeCaps(u) : null;
      const f = (k) => { const v = castle && u.race !== 'all' ? this.forgeLvl(castle, id, k) : 0; return cap ? Math.min(v, cap[k]) : v; }; // новые правила: Кузница — не больше половины базы; общие воины (Бунтарь, Путешественник, Катапульта, Таран) — без улучшений
      return { m, id, n, own, hp: u.hp || 50, atk: (u.attack || 0) + f('a'), cav: u.type === 'cavalry', mag: (u.magic || 0) + f('m'), def: (u.def ? u.def.inf : 0) + f('d'), defC: (u.def ? u.def.cav : 0) + f('d'), mdef: (u.def ? u.def.mag : 0) + f('md'), row: ROW[u.type] || 1, ...extra }; };
    // генерал в строю: принимает часть удара защитой и здоровьем своего воина (гибель генерала решается отдельно — после боя)
    const genStack = (gs) => ({ m: null, gen: true, id: GENERAL_ID, n: 1, own: false, hp: gs.hp, atk: 0, mag: 0, def: gs.def, defC: gs.def, mdef: gs.mdef, row: ROW[{ inf: 'infantry', cav: 'cavalry', mag: 'magic' }[gs.cls]] || 1 });
    // нападающие
    let A = Object.entries(a.units).map(([id, n]) => stack(a.units, id, n, false, c)).filter(Boolean);
    let genA = 0, cmd = 0, cmdD = 0; if (a.general && c.general && !c.general.dead) { const gs = this.genStats(c.general); genA = gs.atk * (this.artOn(c, 'claw') ? 2 : 1); cmd = gs.catk; cmdD = gs.cdef; A.push(genStack(gs)); } // командование — армии, где генерал
    // умения и снаряжение генерала (hero.js): у нападающего — если генерал в этой армии, у защитника — если генерал дома
    const hA = a.general && c.general && !c.general.dead ? this.heroBonus(c.general) : null;
    const hD = target && target.general && !target.general.dead && !target.general.away ? this.heroBonus(target.general) : null;
    const hAtk = hA ? 1 + hA.atk + (a.mission === 'attack' ? hA.fury : 0) : 1;
    const kA = bA.atk * (1 + cmd) * hAtk * morale * (1 + luck / 100), kmA = bA.magic * bA.atk * (1 + cmd) * (hA ? 1 + hA.mag : 1) * morale * (1 + luck / 100);
    // защитники: Замковая армия и отряды (свои), подкрепления (со своей Кузницей), генерал; у NPC — охрана лагеря
    let D = [], bD = null, wallL = 0, wall0 = 0, genD = 0, gsD = null;
    const siege = []; let siegeN = 0;
    if (target) {
      bD = this.bonus(target); wall0 = wallL = bD.wall;
      // тараны: урон по стене (со скринов) до боя
      let ram = Object.entries(a.units).reduce((q, [id, n]) => q + ((UNIT[id] && UNIT[id].wallDmg) || 0) * n, 0);
      if (hA) ram *= 1 + hA.ram;
      if (this.artOn(target, 'seal') && ram) { if (a.mission === 'attack') siege.push('«Печать Нерушимости»: тараны бьют вдвое слабее'); ram /= 2; } // разрушители вдвое слабее
      if (ram && a.mission === 'attack') { while (wallL > 0 && ram >= wallHp(wallL)) { ram -= wallHp(wallL); wallL--; } }
      if (wallL < wall0) { this.setBuildingLevel(target, B.FENCE, wallL); siege.push(`Забор: ${wall0} → ${wallL} ур. (тараны)`); siegeN += wall0 - wallL; }
      for (const m of [target.units, ...target.squads.map((q) => q.units)]) for (const [id, n] of Object.entries(m)) { if (UNIT[id] && UNIT[id].dungOnly && !target.dung) continue; const s = stack(m, id, n, true, target); if (s) D.push(s); } // Страж глубин замок не защищает
      for (const g of this.guestsOf(target)) for (const [id, n] of Object.entries(g.a.units)) { const s = stack(g.a.units, id, n, false, g.c); if (s) D.push(s); }
      if (target.general && !target.general.dead && !target.general.away) { gsD = this.genStats(target.general); genD = gsD.atk; D.push(genStack(gsD)); } // генерал дома: в строю и командует защитниками
    } else for (const g of npcGarrison(npc)) D.push({ m: null, id: g.key, n: g.n, own: false, npc: g, hp: g.hp, atk: g.atk, mag: g.mag, def: g.def, mdef: g.mdef, row: ROW[g.type] || 1 });
    const wallK = bD ? 1 + bD.wallPer * (hD ? 1 + hD.wall : 1) * wallL : 1, hDd = hD ? 1 + hD.def : 1;
    const cA = 1 + (gsD ? gsD.catk : 0), cH = 1 + (gsD ? gsD.cdef : 0); // командование генерала защитника
    const kD = bD ? bD.atk * cA : 1, kmD = bD ? bD.magic * bD.atk * cA : 1, dK = bD ? bD.def * wallK * hDd * cH : 1, mdK = bD ? bD.def * bD.magic * hDd * cH : 1;
    const aDK = bA.def * (hA ? 1 + hA.def : 1) * (1 + cmdD), aMdK = bA.def * bA.magic * (hA ? 1 + hA.def : 1) * (1 + cmdD);
    // урон сторон
    const sum = (L, f) => L.reduce((q, s) => q + f(s), 0);
    const RK = a.mission === 'raid' ? 0.5 * (hA ? 1 + hA.raid : 1) : 1; // набег — короткая стычка: урон вдвое меньше
    const PA = (sum(A, (s) => s.n * s.atk) + genA) * kA * DMG * RK, MA = sum(A, (s) => s.n * s.mag) * kmA * DMG * RK;
    const PD = (sum(D, (s) => s.n * s.atk) + genD) * kD * DMG * RK, MD = sum(D, (s) => s.n * s.mag) * kmD * DMG * RK;
    const nA = sum(A, (s) => (s.atk ? s.n : 0)) || 1, nD = sum(D, (s) => (s.atk ? s.n : 0)) || 1;
    const nAm = sum(A, (s) => (s.mag ? s.n : 0)) || 1, nDm = sum(D, (s) => (s.mag ? s.n : 0)) || 1;
    // распределение урона по стекам (с перераспределением лишнего, если стек погиб целиком)
    const hit = (dmg, ref, L, armor, byRow) => {
      const kill = new Map(L.map((s) => [s, 0]));
      let left = dmg;
      for (let pass = 0; pass < 4 && left > 1e-6; pass++) {
        const alive = L.filter((s) => s.n - kill.get(s) > 1e-9); if (!alive.length) break;
        const W = sum(alive, (s) => (s.n - kill.get(s)) * s.hp * (byRow ? s.row : 1)); let spent = 0;
        for (const s of alive) {
          const share = left * (s.n - kill.get(s)) * s.hp * (byRow ? s.row : 1) / W, ar = armor(s), f = ref / (ref + ar);
          const k = Math.min(s.n - kill.get(s), share * f / s.hp); kill.set(s, kill.get(s) + k); spent += k * s.hp / f;
        }
        left -= spent;
      }
      return kill;
    };
    const wallFlat = bD ? 0.5 * wallL : 0;
    // защита от рода атаки противника: доля урона кавалерии бьёт по защите от кавалерии, остальное — по защите от пехоты
    const cavShare = (L, gen) => { const all = sum(L, (s) => s.n * s.atk) + gen; return all > 0 ? sum(L, (s) => (s.cav ? s.n * s.atk : 0)) / all : 0; };
    const pcA = cavShare(A, genA), pcD = cavShare(D, genD), arm = (s, pc) => s.def * (1 - pc) + (s.defC ?? s.def) * pc; // у охраны лагерей нет отдельной защиты от кавалерии — обычная
    const killD = hit(PA, PA / nA / DMG / RK || 1, D, (s) => (arm(s, pcA) + wallFlat) * dK, true), killDm = hit(MA, MA / nAm / DMG / RK || 1, D, (s) => s.mdef * mdK, false);
    const killA = hit(PD, PD / nD / DMG / RK || 1, A, (s) => arm(s, pcD) * aDK, true), killAm = hit(MD, MD / nDm / DMG / RK || 1, A, (s) => s.mdef * aMdK, false);
    const roll = (x) => { let l = Math.floor(x); if (process.env.LUCK !== '0' ? Math.random() < x - l : x - l >= 0.5) l++; return l; };
    const lostOf = (s, k1, k2) => Math.min(s.n, roll(k1.get(s) + k2.get(s)));
    const hpOf = (L) => sum(L.filter((s) => !s.gen), (s) => s.n * s.hp) || 1; // генерал в долю потерь не входит
    const aLostN = new Map(A.map((s) => [s, lostOf(s, killA, killAm)])), dLostN = new Map(D.map((s) => [s, lostOf(s, killD, killDm)]));
    for (const s of [...A, ...D]) if (s.gen) { aLostN.delete(s); dLostN.delete(s); }
    A = A.filter((s) => !s.gen); D = D.filter((s) => !s.gen); // дальше — только войска
    const aShare = sum(A, (s) => aLostN.get(s) * s.hp) / hpOf(A), dShare = D.length ? sum(D, (s) => dLostN.get(s) * s.hp) / hpOf(D) : 1;
    const win = !D.length || aShare < dShare || (aShare >= 1 ? false : dShare >= 1);
    // нападение отбито у защитника — бегство: из уцелевших защитников гибнет ещё ROUT
    let routed = 0;
    if (win && a.mission === 'attack' && target) for (const s of D) { const r = roll((s.n - dLostN.get(s)) * ROUT); dLostN.set(s, dLostN.get(s) + r); routed += r; }
    // применяем потери; раненые защитники в своём замке частично выздоравливают
    const aLost = {}, dLost = {}, dAll = {}, dOwn = {}; // dOwn — павшие свои защитники замка (без подкреплений)
    let saved = 0; // умение «Полевой лекарь»: часть павших в походе выживает (тараны одноразовые — нет)
    for (const s of A) { let l = aLostN.get(s); if (l && hA && hA.heal && !UNIT[s.id].oneUse) { const h = Math.floor(l * hA.heal); l -= h; saved += h; } if (l) { s.m[s.id] -= l; aLost[s.id] = (aLost[s.id] || 0) + l; } }
    let healed = 0;
    for (const s of D) {
      let l = dLostN.get(s); if (!l) { if (s.m) dAll[s.id] = (dAll[s.id] || 0) + s.n; continue; }
      if (s.own) { const h = Math.floor(l * HEAL_HOME); l -= h; healed += h; }
      if (s.own && l) dOwn[s.id] = (dOwn[s.id] || 0) + l;
      if (s.m) { s.m[s.id] -= l; if (!s.m[s.id]) delete s.m[s.id]; }
      dLost[s.id] = (dLost[s.id] || 0) + l;
      if (s.m && s.m[s.id]) dAll[s.id] = (dAll[s.id] || 0) + s.m[s.id];
    }
    // тараны одноразовые: после боя их больше нет
    const ramsUsed = Object.entries(a.units).filter(([id]) => UNIT[id] && UNIT[id].oneUse).reduce((q, [id, n]) => { if (n) { aLost[id] = (aLost[id] || 0) + n; a.units[id] = 0; } return q + n; }, 0);
    for (const id of Object.keys(a.units)) if (!a.units[id]) delete a.units[id];
    // Лазарет: павшие — ранеными в Лазарет замка, откуда вышла армия, и замка защитников (с мировым боссом — нет: там потери задаёт босс)
    const wounded = npc && npc.boss ? 0 : this.toInfirmary(c, aLost), dWounded = target ? this.toInfirmary(target, dOwn) : 0;
    const cnt = (L) => sum(L, (s) => s.n) || 1;
    const aLoss = sum(A, (s) => aLostN.get(s)) / cnt(A), dLoss = D.length ? sum(D, (s) => dLostN.get(s)) / cnt(D) : 1;
    const calc = { rule: a.mission === 'attack' ? 'attack' : 'raid', model: 2, luck, morale: Math.round(morale * 100),
      att: { phys: Math.round(PA / DMG / RK), mag: Math.round(MA / DMG / RK), gen: Math.round(genA), bonusPct: Math.round((kA / (1 + luck / 100) / morale - 1) * 100), total: Math.round((PA + MA) / DMG / RK), hpLostPct: Math.round(aShare * 100) },
      def: { npc: !target, phys: Math.round(PD / DMG / RK), mag: Math.round(MD / DMG / RK), bonusPct: bD ? Math.round((bD.def - 1) * 100) : 0, wall: wallL, wall0, wallPct: Math.round((wallK - 1) * 100), total: Math.round((PD + MD) / DMG / RK), hpLostPct: Math.round(dShare * 100) },
      aLossPct: Math.round(aLoss * 100), dLossPct: Math.round(dLoss * 100), routed, healed, ramsUsed, saved, wounded, dWounded };
    const garrison = target ? null : D.map((s) => ({ name: s.npc.name, n: s.n, lost: dLostN.get(s) }));
    return { garrison, win, luck, calc, aLost, dLost, dAll, aLoss: aShare >= 1 ? 1 : aLoss, dLoss: dShare >= 1 ? 1 : dLoss, siege, siegeN };
  };

  // прибытие армии к цели
  P.arrive = function arrive(c, a, t) {
    if (a.dung) return this.dungArrive(c, a, t); // Подземелье: раскопки или налёт (dungeon.js)
    const att = this.ownerOf(c);
    const target = this.castleAt(a.x, a.y);
    const where = `${a.x}:${a.y}`;
    if (a.mission === 'trade') {
      if (a.allyStore && this.allyStoreArrive) return this.allyStoreArrive(c, a, t); // взнос в кладовую альянса (ally.js)
      if (target) { this.tick(target); const cap = this.capacity(target); for (const r of RES4) target.res[r] = Math.max(target.res[r], Math.min(cap[r], target.res[r] + a.cargo[r])); }
      const to = target && this.ownerOf(target);
      this.report(c.owner, `Торговцы доставили ресурсы в ${target ? target.name : where}`, [`Груз: дерево ${a.cargo.wood}, камень ${a.cargo.stone}, железо ${a.cargo.iron}, еда ${a.cargo.food}`], 'trade');
      if (to && to.id !== c.owner) this.report(to.id, `Получены ресурсы от ${att.login}`, [`Дерево ${a.cargo.wood}, камень ${a.cargo.stone}, железо ${a.cargo.iron}, еда ${a.cargo.food}`], 'trade');
      a.cargo = null; return this.goBack(c, a, t);
    }
    if (a.mission === 'expedition') return this.expedition(c, a, t);
    if (a.mission === 'rune') return this.runeArrive(c, a, t); // отряд у рунного камня (runes.js)
    if (a.mission === 'settle') return this.settleArrive(c, a, t);
    if (target && HOSTILE.includes(a.mission) && target.owner === c.owner) { // пока шли, замок уже захватили (предыдущие армии) — без боя домой
      this.report(c.owner, `Поход на ${target.name} отменён`, ['Замок уже ваш — армия вернулась домой без боя.'], 'battle');
      return this.goBack(c, a, t);
    }
    if (target && HOSTILE.includes(a.mission) && this.sameAlliance(c.owner, target.owner)) { // пока шли, стали союзниками — без боя домой
      this.report(c.owner, `Поход на ${target.name} отменён`, [`${(this.ownerOf(target) || {}).login || 'Игрок'} — в Вашем альянсе: нападать на союзников нельзя. Армия вернулась домой.`], 'battle');
      return this.goBack(c, a, t);
    }
    if (target && target.owner !== c.owner && (HOSTILE.includes(a.mission) || a.mission === 'reinforce') && this.castleShield(target)) {
      this.report(c.owner, `Поход на ${target.name} отменён`, ['Замок под защитой — армия вернулась домой без боя.'], 'battle');
      return this.goBack(c, a, t);
    }
    if (a.mission === 'reinforce') { // подкрепление встаёт в замке и защищает его, пока его не отзовут
      if (!target) return this.goBack(c, a, t);
      if (target.owner === c.owner) return this.transferArmy(c, a, target); // в свой замок — армия (и генерал) переходят в его Военный штаб
      a.state = 'stay'; a.stayAt = target.id;
      const to = this.ownerOf(target);
      this.report(c.owner, `Подкрепление прибыло в ${target.name}`, [`Армия встала в замке ${target.name} (${a.x}:${a.y}) и защищает его. Отозвать — «Армии в замке».`, `Войска: ${unitsLine(a.units)}`], 'reinforce');
      if (to && to.id !== c.owner) this.report(to.id, `Подкрепление от ${att.login}`, [`В ваш замок ${target.name} прибыло подкрепление игрока ${att.login}.`, `Войска: ${unitsLine(a.units)}`], 'reinforce');
      return;
    }
    if (a.mission === 'scout') return this.scout(c, a, t, target);

    // бой: атака или набег
    if (a.mission === 'rally' || (!target && this.bossAt(a.x, a.y))) { // созыв уже ударил или распущен; одиночный поход на босса (отправлен до созывов) — домой
      this.report(c.owner, 'Поход на мирового босса', [a.mission === 'rally' ? 'Созыв не состоялся — армия возвращается домой.' : 'Мирового босса бьют созывом альянса — армия возвращается домой.'], 'battle');
      return this.goBack(c, a, t);
    }
    const lair = target ? null : this.lairAt(c.owner, a.x, a.y);
    const obj = target ? null : lair ? { img: 32 } : this.worldObjects(a.x, a.y, 1, 1)[0];
    const npc = lair ? lair.npc : obj && NPC[obj.img];
    if (!target && !npc) { this.report(c.owner, `Поход ${where}: цель исчезла`, ['Армия вернулась домой.'], 'battle'); return this.goBack(c, a, t); }
    if (target) { this.tick(target); this.mil(target); }
    const trap = target && this.trapCatch ? this.trapCatch(target, c, a, att, t) : null; // Капкан ловит часть армии до боя (trap.js)
    const R = this.clash(c, a, target, npc, t);
    const { win, luck, calc, aLost, dLost, dAll } = R;
    const aLoss = R.aLoss, dLoss = R.dLoss;
    const aliveAfter = Object.values(a.units).some((n) => n > 0);
    if (win) { this.addStat(c.owner, 'wins', 1); if (!target) this.addStat(c.owner, 'npcWins', 1); if (lair) this.lairWon(c.owner, lair.k); } // задания
    // снаряжение генерала в боях не выпадает — его куёт Кузнец за руны (hero.js runeForge)
    // генералы
    // уровень генерала защитника, если он был в бою: жив и дома (воскрешающийся павший не сражается — до 24.10 отчёт всё равно показывал его «в строю»)
    const genInD = target && target.general && !target.general.dead && !target.general.away ? target.general.level : 0, genNameD = genInD ? target.general.name : '';
    const genA = [], genD = []; let genExpA = 0, genExpD = 0, genDiedA = false, genDiedD = false, genSavedA = false, genSavedD = false; // опыт генералов — в отчёт числом
    // что генерал дал в этом бою — в отчёт (с 27.10): командование, умения и снаряжение, потеря здоровья
    const genInfo = (g, hb, w, attack) => { const gs = this.genStats(g), r1 = (v) => Math.round(v * 1000) / 10;
      return { catk: r1(gs.catk), cdef: Math.round((1 + gs.cdef) * 100) / 100, atk: r1(hb.atk + (attack ? hb.fury : 0)), def: r1(hb.def), mag: r1(hb.mag), hpLost: w.lost, hpLeft: g.dead ? 0 : Math.floor(g.hp) }; };
    let genInfoA = null, genInfoD = null;
    // генерал гибнет, когда армия разбита в бою: нападение проиграно (или не уцелел никто) — даже если «Полевой лекарь» кого-то спас
    // (до 21.10 спасённые воины спасали и генерала — он не погибал почти никогда); шанс уцелеть — умения и снаряжение (не больше 30%)
    const wipedA = aLoss >= 1 && (!win || !aliveAfter);
    // здоровье (с 27.10): генерал теряет столько процентов здоровья, сколько потеряла его армия; кончилось — гибнет (армия разбита — всегда)
    if (a.general && c.general) {
      const hb = this.heroBonus(c.general), w = this.genWound(c.general, wipedA ? 1 : aLoss);
      if (w.fatal && Math.random() < hb.survive) { genSavedA = true; c.general.hp = 1; genA.push(wipedA ? 'Армия разбита, но генерал чудом уцелел и вернулся домой (умения и снаряжение). Здоровье — 1%.' : `Армия потеряла ${hpTxt(w.lost)}% — у генерала кончилось здоровье, но он чудом уцелел (умения и снаряжение). Здоровье — 1%.`); }
      else if (w.fatal) { genDie(c.general); genDiedA = true; delete c.general.away; a.general = false; this.heroStrip(c, c.general); genA.push(wipedA ? 'Генерал пал в бою — опыт не получен. Его снаряжение вернулось в Оружейную.' : `Генерал пал: армия потеряла ${hpTxt(w.lost)}%, а здоровья у него было ${w.was}%. Опыт не получен, снаряжение вернулось в Оружейную.`); }
      else {
        const e = this.battleExp({ killedPop: popOf(dLost), win, mission: a.mission, npc: target ? null : npc, dLoss, mine: c, enemy: target });
        const ge = this.addGeneralExp(c, e.exp); genExpA = ge ? ge.got : 0; const l = genLine('Генерал', ge, e); if (l) genA.push(l);
        if (w.lost > 0) genA.push(`Здоровье генерала: −${hpTxt(w.lost)}%, осталось ${hpTxt(w.left)}% (восстанавливается на ${GEN_HP_REGEN}% в час).`);
      }
      genInfoA = genInfo(c.general, hb, w, a.mission === 'attack');
    }
    // генерал защитника гибнет, когда оборона проиграла нападение — даже если часть защитников потом выздоровела дома (HEAL_HOME;
    // до 21.10 выздоровевшие спасали и генерала). Набег — короткая стычка: генерал не гибнет, как и войска целиком
    // здоровье генерала защитника — так же, по потерям защитников (с 27.10); в набеге он не гибнет — не ниже 1%
    if (target && target.general && !target.general.dead && !target.general.away) {
      const wipedD = win && a.mission === 'attack' && dLoss >= 1, w = this.genWound(target.general, wipedD ? 1 : dLoss, a.mission !== 'attack'), hbD = this.heroBonus(target.general);
      if (w.fatal && Math.random() >= hbD.survive) { genDie(target.general); this.heroStrip(target, target.general); genD.push(wipedD ? 'Ваш генерал пал, защищая замок.' : `Ваш генерал пал, защищая замок: защитники потеряли ${hpTxt(w.lost)}%, а здоровья у него было ${w.was}%.`); genDiedD = true; }
      // уцелел по шансу «Несокрушимого» и снаряжения — как у нападающего: без опыта и с пояснением в отчёте (раньше — молча «в строю»)
      else if (w.fatal) { genSavedD = true; target.general.hp = 1; genD.push(wipedD ? 'Оборона разбита, но ваш генерал чудом уцелел (умения и снаряжение) — опыт не получен. Здоровье — 1%.' : `Защитники потеряли ${hpTxt(w.lost)}% — у генерала кончилось здоровье, но он чудом уцелел (умения и снаряжение). Опыт не получен, здоровье — 1%.`); }
      else {
        const e = this.battleExp({ killedPop: popOf(aLost), win: !win, mission: 'attack', mine: target, enemy: c });
        const ge = this.addGeneralExp(target, e.exp); genExpD = ge ? ge.got : 0; const l = genLine('Ваш генерал', ge, e); if (l) genD.push(l);
        if (w.lost > 0) genD.push(`Здоровье генерала: −${hpTxt(w.lost)}%, осталось ${hpTxt(w.left)}% (восстанавливается на ${GEN_HP_REGEN}% в час).`);
      }
      genInfoD = genInfo(target.general, hbD, w, false);
    }
    // добыча
    let loot = null;
    // руины: нападение с Бунтарями поднимает бунт и не грабит (руины остаются для захвата); без Бунтарей — грабёж, и руины исчезают
    const ruinRiot = !target && !lair && npc && npc.ruins && a.mission === 'attack' && (a.units[233] || 0) > 0;
    if (aliveAfter && win) {
      let carry = Object.entries(a.units).reduce((s, [id, n]) => s + UNIT[id].carry * n, 0);
      if (a.general && c.general && !c.general.dead) carry = Math.floor(carry * (1 + this.heroBonus(c.general).loot)); // умение «Жадность»
      calc.carry = carry;
      loot = { wood: 0, stone: 0, iron: 0, food: 0 };
      let avail;
      if (target) { const hid = this.bonus(target).hidden; calc.hidden = hid; avail = Object.fromEntries(RES4.map((r) => [r, Math.max(0, Math.floor(target.res[r]) - hid)])); }
      else {
        const st = (this.db.npc = this.db.npc || {})[where];
        avail = (st && st.until > t) || ruinRiot ? { wood: 0, stone: 0, iron: 0, food: 0 } : { ...npc.loot };
      }
      // выносим равномерно
      let left = RES4.filter((r) => avail[r] > 0);
      while (carry > 0 && left.length) {
        const share = Math.max(1, Math.floor(carry / left.length));
        for (const r of left) { const v = Math.min(share, avail[r], carry); loot[r] += v; avail[r] -= v; carry -= v; }
        left = left.filter((r) => avail[r] > 0);
      }
      if (target) for (const r of RES4) target.res[r] -= loot[r];
      else if (npc.ruins && RES4.some((r) => loot[r] > 0)) this.db.npc[where] = { ...this.db.npc[where], until: t + NPC_REGEN_SEC / SPEED * 1000 }; // запас руин восстанавливается за 3 часа; бунт в руинах при этом не сбрасывается (раньше сбрасывался)
    }
    // осада: стена и тараны — до боя (в clash), здания ломают после победы Йети, Энт, Нурух, Кулак Ярости (урон по зданиям) и катапульты
    const siege = [...R.siege]; let siegeN = R.siegeN;
    if (target && !target.site && a.mission === 'attack' && win && this.artOn(target, 'seal') && Object.keys(a.units).some((id) => UNIT[id] && UNIT[id].bldDmg || Number(id) === 240)) siege.push('«Печать Нерушимости»: разрушители бьют по зданиям вдвое слабее');
    if (target && !target.site && a.mission === 'attack' && win) {
      const bD = this.bonus(target), bA = this.bonus(c);
      let dmg = Object.entries(a.units).reduce((q, [id, n]) => q + ((UNIT[id] && UNIT[id].bldDmg) || 0) * n, 0) * bA.atk;
      dmg += (a.units[240] || 0) * (UNIT[240] ? UNIT[240].attack : 0) * 4;
      dmg /= 1 + 0.05 * bD.mason; // Каменотёс бережёт здания
      if (this.artOn(target, 'seal')) dmg /= 2; // «Печать Нерушимости»
      const cells = Array.from(target.grid[0], (id, i) => [id, i]).filter(([id, i]) => id > 0 && id !== B.FENCE && target.levels[0][i] > 0);
      for (let k = 0; dmg >= 1 && cells.length && k < 3; k++) { // до трёх случайных зданий
        const [bid, cell] = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
        let part = k === 2 || !cells.length ? dmg : dmg / 2; dmg -= part;
        let L = target.levels[0][cell]; const L0 = L;
        while (L > 0 && part >= bldHp(bid, L)) { part -= bldHp(bid, L); L--; }
        dmg += part; // остаток урона — следующему зданию
        if (L < L0) { target.levels[0][cell] = L; if (!L) target.grid[0][cell] = -1; siege.push(`${C.BY_ID[bid].name}: ${L0} → ${L} ур.`); siegeN += L0 - L; }
      }
    }
    // бунтари: каждое победное нападение, в котором выжил хоть один бунтарь, поднимает бунт в замке на 15% (сколько бы бунтарей ни было
    // в этой армии); несколько армий подряд — каждая по 15%; бунт 100% — замок переходит к нападающему, один бунтарь остаётся в нём
    let loyalty = null, captured = null, capitalBlocked = false, royalBlocked = null, rebelStay = null;
    const rebels = a.mission === 'attack' && win && !(target && target.site) ? (a.units[233] || 0) : 0; // у недостроя бунта нет
    // недострой: победа и 3 выживших путешественника — стройка переходит к нападающему
    let siteTaken = null;
    if (target && target.site && a.mission === 'attack' && win && (a.units[TRAVELER_ID] || 0) >= SETTLE_TAKE) siteTaken = this.siteTakeover(att, target, a);
    if (rebels) {
      const drop = RIOT_STEP;
      if (target && this.isCapital(target)) capitalBlocked = true;
      else if (target) {
        const from = Math.round(target.loyalty); target.loyalty = Math.max(0, target.loyalty - drop); target.loyAt = t;
        if (target.loyalty <= 0 && this.reserveCount(target)) target.loyalty = 1; // в резерве ещё есть войска — сперва их надо перебить
        loyalty = { from, to: Math.round(target.loyalty) };
        if (target.loyalty <= RESERVE_LOY) this.reserveOut(target);
        if (target.loyalty <= 0) {
          if (this.royalCanCapture(att)) { this.royalSpend(att); captured = this.captureCastle(att, target); captured.rebel = 1; rebelStay = target; }
          else { target.loyalty = 1; royalBlocked = { have: Math.floor(att.royal), need: this.royalNeed(att), wait: this.royalWaitDays(att) }; } // не хватает лояльности населения (Резиденция)
        }
      } else if (npc && npc.ruins) {
        const st = (this.db.npc = this.db.npc || {})[where] || (this.db.npc[where] = {});
        const from = Math.round(st.loyalty ?? 100); st.loyalty = Math.max(0, from - drop);
        loyalty = { from, to: st.loyalty };
        if (st.loyalty <= 0) {
          if (this.royalCanCapture(att)) { this.royalSpend(att); this.npcGone(a.x, a.y, t); captured = this.foundCaptured(att, a.x, a.y); captured.rebel = 1; rebelStay = this.castleAt(a.x, a.y); } // новые руины появятся в провинции через 3 часа
          else { st.loyalty = 1; royalBlocked = { have: Math.floor(att.royal), need: this.royalNeed(att), wait: this.royalWaitDays(att) }; }
        }
      }
    }
    a.loot = loot;
    // лагерь разбойников побеждён (или руины разграблены — с 22.10, без Бунтарей) — исчезает с карты и через 3 часа появляется на новом месте
    // той же провинции (game.js npcGone); прежде руины стояли на месте, и их грабили снова и снова
    const ruinGone = win && npc && npc.ruins && !ruinRiot && !captured && obj && this.worldObjects(a.x, a.y, 1, 1).length;
    const npcBack = win && !target && !lair && obj && (CAMPS.includes(obj.img) || ruinGone) ? this.npcGone(a.x, a.y, t) : null;
    if (win && !target && !lair && obj && CAMPS.includes(obj.img)) this.addStat(c.owner, 'camps', 1); // Зал славы «Зачистка»
    // статистика для Зала Славы (social.js)
    if (loot) this.addStat(c.owner, 'loot', RES4.reduce((q, k) => q + loot[k], 0));
    this.addStat(c.owner, 'kills', target ? popOf(dLost) : (npc ? Math.round(npc.def.inf / 20 * dLoss) : 0));
    // оборона: убитые враги делятся между хозяином замка и подкреплениями по доле в обороне; павшие — у того, чьи они (с 24.10;
    // раньше всё — хозяину замка, даже если его защищали только чужие войска)
    if (target) {
      const gl = R.guests || [], ownLost = { ...dLost };
      for (const x of gl) for (const [id, n] of Object.entries(x.lost)) { ownLost[id] -= n; if (!(ownLost[id] > 0)) delete ownLost[id]; }
      const ownShare = Math.max(0, 1 - gl.reduce((q, x) => q + x.share, 0));
      this.addStat(target.owner, 'defKills', Math.round(popOf(aLost) * ownShare)); this.addStat(target.owner, 'defLost', popOf(ownLost)); this.addStat(target.owner, 'attLost', popOf(ownLost));
      for (const x of gl) {
        const o = x.g.c.owner, lp = popOf(x.lost);
        this.addStat(o, 'defKills', Math.round(popOf(aLost) * x.share)); this.addStat(o, 'defLost', lp); this.addStat(o, 'attLost', lp);
        const wnd = this.toInfirmary(x.g.c, x.lost), du = this.ownerOf(target); // раненые — в Лазарет замка, откуда пришло подкрепление
        this.report(o, `Подкрепление: ${a.mission === 'raid' ? 'набег' : 'нападение'} на замок «${target.name}»`, [
          `Игрок ${att.login} ${a.mission === 'raid' ? 'совершил набег на' : 'напал на'} замок «${target.name}» (${du ? du.login : '—'}), где стоит ваше подкрепление из замка «${x.g.c.name}».`,
          win ? 'Защита проиграла.' : 'Защита устояла.', `Ваше подкрепление: ${unitsLine(x.g.a.units, x.lost)}`,
          ...(wnd ? [`В Лазарет замка «${x.g.c.name}» отправлено раненых: ${wnd}.`] : []),
        ], 'battle');
        if (!Object.values(x.g.a.units).some((n) => n > 0) && !x.g.a.general) x.g.c.armies = x.g.c.armies.filter((q) => q !== x.g.a); // подкрепление погибло целиком
      }
    }
    this.addStat(c.owner, 'attLost', popOf(aLost)); // Зал Гибели: все потери — нападения на замки и NPC, защита своего замка (выше), бой с боссом (boss.js)
    if (this.brAdd) { // боевой ранг (battlerank.js): мирные юниты очков не дают, раненые — за четверть
      // защитнику — ничего (DEF_RANK_K = 0): ранг — только за нападения и набеги; иначе разбитые о замок армии «качали» ему ранг
      if (target) { this.brAdd(c.owner, rankPop(dLost, R.dWnd, R.dHeal), target.owner); this.brAdd(target.owner, rankPop(aLost, R.aWnd) * DEF_RANK_K, c.owner); }
      else if (npc) this.brAdd(c.owner, Math.round(npc.def.inf / 20 * dLoss), null);
    }
    if (siegeN) this.addStat(c.owner, 'ruins', siegeN);
    const took = siteTaken && siteTaken.taken ? siteTaken : null;
    const defUser = target && (took ? this.userById(took.prevOwner) : this.ownerOf(target));
    const tname = target ? `${took ? took.prevName : target.name} (${captured ? captured.prevLogin : defUser.login})` : `${npc.name} ${where}`;
    const side = (units, lost) => Object.fromEntries([...new Set([...Object.keys(units), ...Object.keys(lost)])].map((id) => [id, { was: (units[id] || 0) + (lost[id] || 0), lost: lost[id] || 0 }]).filter(([, v]) => v.was > 0)); // и погибшие целиком (тараны одноразовые)
    const genDied = genDiedA; // пал в этом бою: армия разбита или кончилось здоровье (с 27.10)
    const data = {
      type: 'battle', mission: a.mission, win, x: a.x, y: a.y, luck, calc,
      att: { id: att.id, login: att.login, race: att.race, castle: c.name, army: a.squad ? a.squad.name : 'Замковая армия', cx: c.x, cy: c.y, rating: this.rating(c), lossRes: lossRes(aLost), units: side(a.units, aLost), general: a.general || genDied ? (c.general ? c.general.level : 0) : 0, genName: (a.general || genDied) && c.general ? c.general.name : '', generalDied: genDied, generalSaved: genSavedA, genExp: genExpA, gen: genInfoA },
      def: target ? { id: captured ? captured.prevOwner : defUser.id, login: captured ? captured.prevLogin : defUser.login, race: captured ? captured.prevRace : defUser.race, castle: took ? took.prevName : target.name, rating: this.rating(target), lossRes: lossRes(dLost), units: side(dAll, dLost), wall: this.bonus(target).wall, general: genInD, genName: genNameD, generalDied: genDiedD, generalSaved: genSavedD, genExp: genExpD, gen: genInfoD }
        : { npc: npc.name, img: obj.img, lossPct: Math.round(dLoss * 100), garrison: R.garrison },
      site: target && target.site ? { end: target.site.end } : null, siteTaken: siteTaken ? (took ? { x: a.x, y: a.y } : { blocked: siteTaken.blocked }) : null,
      loot, siege, loyalty, capitalBlocked, royalBlocked, captured: captured ? { name: captured.name, x: a.x, y: a.y, rebel: captured.rebel || 0 } : null,
      npcBack: npcBack ? (npc.ruins ? 'ruins' : true) : null, // лагерь разбит (руины разграблены); когда появится новый — игроку не говорим
    };
    const lines = [
      `${MISSIONS[a.mission]} на ${tname}. ${win ? 'Победа!' : 'Поражение.'}`,
      `Ваши войска: ${unitsLine(a.units, aLost)}${a.general ? ` + генерал ${c.general ? c.general.level : ''} ур.` : ''}`,
      target ? `Защитники: ${unitsLine(dAll, dLost)}` : `Охрана лагеря потеряла ${Math.round(dLoss * 100)}%`,
      loot ? `Добыча: дерево ${loot.wood}, камень ${loot.stone}, железо ${loot.iron}, еда ${loot.food}` : 'Добычи нет — армия погибла.',
      ...siege,
    ];
    if (trap) lines.splice(1, 0, `Капкан замка ${target.name} поймал до боя ${trap.n} воинов (${this.trapLine(trap.units)}) — они в Темнице.`);
    if (loyalty) lines.push(`Бунт в замке: ${100 - loyalty.from}% → ${100 - loyalty.to}%`);
    if (npcBack) lines.push(npc.ruins ? 'Руины разграблены и исчезли с карты — со временем в этой провинции появятся новые.' : 'Лагерь разбит и исчез с карты — со временем в этой провинции появится новый.');
    if (ruinRiot && win) lines.push('Бунтари поднимают бунт в руинах — руины не грабят.');
    if (took) lines.push(`Недострой захвачен! Ваши путешественники (${SETTLE_TAKE}) продолжают стройку — замок будет готов через ${Math.max(1, Math.round((target.site.end - t) / 3600000))} ч.`);
    else if (siteTaken && siteTaken.blocked) lines.push(`Недострой не захвачен: ${siteTaken.blocked}`);
    else if (target && target.site && a.mission === 'attack' && win) lines.push(`Охрана недостроя разбита, но стройка продолжается: чтобы забрать её, нужно, чтобы в победном нападении выжили ${SETTLE_TAKE} путешественника.`);
    if (royalBlocked) lines.push(royalBlocked.wait ? `Захват не удался: первый замок можно захватить только через ${royalBlocked.wait} дн. игры.` : `Захват не удался: не хватает лояльности населения (есть ${royalBlocked.have}, нужно ${royalBlocked.need}) — см. Резиденцию.`);
    if (capitalBlocked) lines.push('Столицу захватить нельзя — бунтари бессильны.');
    if (captured) lines.push(`Замок захвачен! Теперь это ваш замок «${captured.name}».`);
    if (captured && this.friendFeed) {
      this.friendFeed(att.id, `${att.login} захватил(а) замок «${captured.name}» (X:${a.x}, Y:${a.y})`, t);
      if (captured.prevOwner) this.friendFeed(captured.prevOwner, `${captured.prevLogin} потерял(а) замок «${captured.name}» (X:${a.x}, Y:${a.y})`, t);
    }
    if (genDied) lines.push('Генерал пал в бою — воскресите его в Военном штабе.');
    lines.push(...genA.filter((x) => !genDied || !/пал в бою/.test(x)));
    if (calc.wounded) lines.push(`В Лазарет отправлено раненых: ${calc.wounded} (ранеными становится половина павших) — вылечите их там за четверть цены.`);
    if (calc.saved) lines.push(`Полевой лекарь спас ${Wd.ofWarriors(calc.saved)}.`);
    const title = `Атака на ${target ? (captured ? captured.prevLogin : defUser.login) : npc.name}`; // как в оригинале: «Атака на <игрок>» / «Оборона от <игрок>»
    // чужой генерал в отчёте (с 27.10, по решению владельца): противник видит только, что генерал был, и его имя;
    // уровень, что с ним стало, опыт, командование, снаряжение и здоровье — только хозяину генерала
    const foe = (sd) => (sd && sd.general ? { ...sd, general: 1, genHidden: true, generalDied: undefined, generalSaved: undefined, genExp: undefined, gen: undefined } : sd);
    this.report(c.owner, title, lines, 'battle', { ...data, def: foe(data.def), side: 'att' });
    if (target) {
      this.report(captured ? captured.prevOwner : took ? took.prevOwner : target.owner, `Оборона от ${att.login}`, [
        `${MISSIONS[a.mission]} от ${att.login} (${c.name}).`,
        ...(trap ? [`Ваш Капкан поймал до боя ${trap.n} воинов (${this.trapLine(trap.units)}) — они в Темнице: казните или завербуйте их за сутки.`] : []),
        `Атакующие: ${unitsLine(a.units, aLost)}`,
        `Ваши войска: ${unitsLine(dAll, dLost)}`,
        loot ? `Унесено: дерево ${loot.wood}, камень ${loot.stone}, железо ${loot.iron}, еда ${loot.food}` : 'Враг разбит, ничего не унесено.',
        ...siege, ...(loyalty ? [`Бунт в замке: ${100 - loyalty.from}% → ${100 - loyalty.to}%`] : []), ...(took ? [`Ваш недострой ${a.x}:${a.y} захвачен игроком ${att.login}.`] : []), ...genD,
        ...(calc.dWounded && !captured ? [`В Лазарет отправлено раненых: ${calc.dWounded} (ранеными становится половина павших) — вылечите их там за четверть цены.`] : []),
      ], 'battle', { ...data, att: foe(data.att), side: 'def' });
    }
    if (took) { a.units[TRAVELER_ID] -= SETTLE_TAKE; if (!a.units[TRAVELER_ID]) delete a.units[TRAVELER_ID]; } // путешественники остаются строить
    if (rebelStay) { a.units[233]--; if (!a.units[233]) delete a.units[233]; rebelStay.units[233] = (rebelStay.units[233] || 0) + 1; } // один бунтарь остаётся в захваченном замке
    this.goBack(c, a, t);
  };

  // ----- Освоение: недострой (замок с пометкой site), в список замков владельца попадает, только когда достроен -----
  P.siteOf = function siteOf(user) { return (this.db.siteIds || []).map((id) => this.db.castles[id]).find((k) => k && k.site && k.owner === user.id) || null; };
  // может ли игрок начать / забрать стройку: лояльность населения позволяет новый замок, своей стройки ещё нет
  P.settleBlock = function settleBlock(user) {
    if (this.siteOf(user)) return 'У вас уже строится замок — сначала достройте его.';
    const wait = this.royalWaitDays(user); if (wait) return `Новый замок — не раньше ${wait} дн. игры (лояльность населения, Резиденция).`;
    if (this.royalTick(user) < this.royalNeed(user)) return `Не хватает лояльности населения для нового замка: есть ${Math.floor(user.royal)}, нужно ${this.royalNeed(user)} (Резиденция).`;
    return null;
  };
  P.settleError = function settleError(user, x, y, travelers, self = null) { // self — сама пришедшая армия (её не считать «уже идущей»)
    if (travelers < SETTLE_N) return `Для освоения в армии должно быть ${SETTLE_N} путешественников (сейчас ${travelers}).`;
    const block = this.settleBlock(user); if (block) return block;
    if (this.castlesOf(user).some((c) => (c.armies || []).some((a) => a !== self && a.mission === 'settle' && a.state !== 'back'))) return 'Путешественники уже идут осваивать место.';
    const pe = this.placeError(x, y); if (pe) return pe;
    if (this.worldObjects(x, y, 1, 1).length || this.objNear(x, y)) return 'Место занято лагерем или руинами (или рядом с ними) — выберите пустую клетку.';
    if (this.lairAt && this.lairAt(user.id, x, y)) return 'Здесь логово — выберите пустую клетку.';
    return null;
  };
  // путешественники пришли: закладка замка; остальная армия остаётся охранять стройку
  P.settleArrive = function settleArrive(c, a, t) {
    const att = this.ownerOf(c), err = this.settleError(att, a.x, a.y, a.units[TRAVELER_ID] || 0, a);
    if (err) { this.report(c.owner, `Освоение ${a.x}:${a.y} не удалось`, [err, 'Армия вернулась домой.'], 'battle'); return this.goBack(c, a, t); }
    const site = this.createCastle(att, { x: a.x, y: a.y });
    site.name = `Недострой ${att.login}`; site.res = { wood: 0, stone: 0, iron: 0, food: 0, people: 0 }; site.resAt = t;
    site.site = { start: t, end: t + SETTLE_SEC * 1000, by: att.id };
    this.mil(site); site.loyalty = 100;
    const units = { ...a.units }; units[TRAVELER_ID] -= SETTLE_N; for (const id of Object.keys(units)) if (!(units[id] > 0)) delete units[id];
    site.units = units;
    (this.db.siteIds = this.db.siteIds || []).push(site.id);
    c.armies = c.armies.filter((x) => x !== a);
    const days = Math.round(SETTLE_SEC / 86400 * 10) / 10;
    this.report(c.owner, `Освоение: стройка замка ${a.x}:${a.y}`, [`Путешественники (${SETTLE_N}) начали строить замок на ${a.x}:${a.y}. Он будет готов через ${days < 1 ? `${Math.round(SETTLE_SEC / 3600)} ч` : `${days} дн.`}.`,
      Object.keys(units).length ? `Стройку охраняют: ${unitsLine(units)}.` : 'Стройку никто не охраняет — пришлите подкрепление.', 'Недострой видно на карте: его можно атаковать. Победное нападение, в котором выживут 3 путешественника, заберёт стройку себе.'], 'reinforce', { type: 'settle', x: a.x, y: a.y, end: site.site.end });
    this.store.save();
  };
  // время вышло: замок достроен — переходит в список замков того, чей он сейчас (с него списывается лояльность населения)
  P.sitesTick = function sitesTick(now = Date.now()) {
    const ids = this.db.siteIds; if (!ids || !ids.length) return;
    for (const id of [...ids]) {
      const k = this.db.castles[id];
      if (!k || !k.site) { this.db.siteIds = this.db.siteIds.filter((v) => v !== id); continue; }
      if (k.site.end > now) continue;
      const u = this.ownerOf(k);
      if (!u || !this.royalCanCapture(u)) {
        if (u && !k.site.waitNote) { k.site.waitNote = 1; this.report(u.id, `Замок ${k.x}:${k.y} достроен, но не хватает лояльности`, [`Стройка закончена, но лояльности населения (Резиденция) не хватает на новый замок: есть ${Math.floor(u.royal || 0)}, нужно ${this.royalNeed(u)}.`, 'Замок станет вашим, как только лояльности хватит. Пока его можно атаковать.'], 'reinforce'); }
        continue;
      }
      this.royalSpend(u);
      delete k.site; k.name = `Замок ${u.login} ${this.castlesOf(u).length + 1}`; k.loyalty = 100;
      u.castleIds = [...this.castlesOf(u).map((x) => x.id), k.id];
      this.db.siteIds = this.db.siteIds.filter((v) => v !== id);
      this.report(u.id, `Замок построен: ${k.name}`, [`Путешественники достроили замок на ${k.x}:${k.y}. Теперь это ваш замок «${k.name}» — он в списке «Замки».`], 'reinforce', { type: 'settled', x: k.x, y: k.y });
      if (this.friendFeed) this.friendFeed(u.id, `${u.login} основал(а) новый замок «${k.name}» (X:${k.x}, Y:${k.y})`, now);
      this.store.save();
    }
  };
  // нападение на недострой выиграно и выжили 3 путешественника — стройка переходит к нападающему (если ему позволяет лояльность)
  P.siteTakeover = function siteTakeover(att, site, a) {
    const block = this.settleBlock(att); if (block) return { blocked: block };
    const prev = this.ownerOf(site);
    for (const g of this.guestsOf(site)) this.goBack(g.c, g.a, Date.now()); // чужие подкрепления уходят домой
    const prevName = site.name;
    site.owner = att.id; site.units = {}; site.squads = []; site.reserve = {}; site.general = null; site.name = `Недострой ${att.login}`; delete site.site.waitNote;
    return { taken: true, prevOwner: prev ? prev.id : 0, prevLogin: prev ? prev.login : '', prevRace: prev ? prev.race : 'humans', prevName }; // 3 путешественника остаются строить (снимаются с армии после отчёта)
  };

  // захват чужого (не столичного) замка: переходит к нападающему, войска и очереди прежнего хозяина пропадают
  P.captureCastle = function captureCastle(att, castle) {
    const prev = this.ownerOf(castle);
    this.royalLoss(prev); // население расстроено: −10% лояльности
    prev.castleIds = this.castlesOf(prev).filter((k) => k !== castle).map((k) => k.id);
    if (prev.castleId === castle.id) prev.castleId = prev.castleIds[0];
    if (this.smithAbandon) this.smithAbandon(castle, prev); // ковка за руны отменяется, руны — прежнему хозяину
    delete castle.wounded; delete castle.healing; // раненые прежнего хозяина в Лазарете не достаются захватчику
    castle.owner = att.id;
    for (const g of this.guestsOf(castle)) this.goBack(g.c, g.a, Date.now()); // чужие подкрепления уходят домой
    // генерал королевства не пропадает и не достаётся захватчику: живой (дома или в походе) отступает в столицу прежнего хозяина
    // со всем снаряжением, павшие — в список павших столицы (воскресить можно там же)
    const capital = this.castlesOf(prev)[0];
    if (capital && capital !== castle) {
      for (const gn of [...(castle.general ? [castle.general] : []), ...(castle.deadGenerals || [])]) {
        delete gn.away; delete gn.squad;
        if (!gn.dead && !capital.general) { capital.general = gn; this.event(prev.id, `Генерал ${gn.name || ''} отступил из «${castle.name}» в столицу «${capital.name}».`); }
        else { gn.dead = true; (capital.deadGenerals = capital.deadGenerals || []).push(gn); }
      }
    } else if (castle.general && this.heroStrip) this.heroStrip({ owner: prev.id }, castle.general); // некуда отступить — хотя бы вещи остаются в Оружейной прежнего хозяина (замок уже не его)
    castle.deadGenerals = [];
    castle.units = {}; castle.squads = []; castle.reserve = {}; castle.razing = []; castle.training = []; castle.armies = []; castle.general = null; castle.research = null;
    delete castle.calmJob; castle.loyalty = 100 - RIOT_CAPTURED; castle.loyAt = Date.now(); // после захвата в замке бунт 95%: хозяин снижает его в Храме за ресурсы
    att.castleIds = [...this.castlesOf(att).map((k) => k.id), castle.id];
    this.addStat(att.id, 'capRating', this.rating(castle)); // Развитие не учитывает рейтинг захваченных замков
    this.store.save();
    return { name: castle.name, prevOwner: prev.id, prevLogin: prev.login, prevRace: prev.race };
  };
  // захват руин (Заброшенный замок) — на их месте появляется новый замок нападающего
  P.foundCaptured = function foundCaptured(att, x, y) {
    const n = this.castlesOf(att).length + 1;
    const castle = this.createCastle(att, { x, y });
    castle.name = `Замок ${att.login} ${n}`;
    this.mil(castle); castle.loyalty = 100 - RIOT_CAPTURED;
    att.castleIds = [...this.castlesOf(att).map((k) => k.id), castle.id];
    this.store.save();
    return { name: castle.name };
  };

  P.setBuildingLevel = function setBuildingLevel(castle, id, level) {
    if (id === B.FENCE) { castle.wall = level; return; } // стена — без клетки (game.js fixWall)
    castle.grid[0].forEach((b, i) => { if (b === id) { castle.levels[0][i] = level; if (!level) castle.grid[0][i] = -1; } });
  };

  // разведка: бой разведчиков
  // что узнаёт разведка (Центр разведки → «Возможности»): открывается уровнем Центра, видно, если выжила нужная доля разведчиков
  P.scout = function scout(c, a, t, target) {
    const sent = Object.values(a.units).reduce((s, n) => s + n, 0) || 1;
    const ghost = this.artOn(c, 'eye'); // «Око Призрака»: противник не узнаёт о разведке
    if (target && this.artOn(target, 'cloak')) { // «Покров Безмолвия»: замок скрыт — разведка проваливается, разведчики возвращаются ни с чем
      const me = this.ownerOf(c), tu = this.ownerOf(target);
      const lines = [`Разведка ${target.name}: замок окутан «Покровом Безмолвия» — разведчики ничего не увидели и возвращаются домой.`];
      this.report(c.owner, `Разведка ${target.name} — неудача`, lines, 'scout', { type: 'scout', ok: false, x: a.x, y: a.y, att: { id: me.id, login: me.login, castle: c.name, cx: c.x, cy: c.y, rating: this.rating(c), sent, lost: 0 },
        def: { id: tu.id, login: tu.login, castle: target.name, rating: this.rating(target) }, info: lines, sim: null });
      if (!ghost) this.report(target.owner, 'Разведка отражена', [`Разведчики игрока ${me.login} пытались разведать «${target.name}», но «Покров Безмолвия» скрыл замок.`], 'scout');
      return this.goBack(c, a, t);
    }
    const spies = Object.entries(a.units).reduce((s, [id, n]) => s + n * (UNIT[id].spy || 1), 0);
    let dPow = 0;
    if (target) {
      this.tick(target); this.mil(target);
      const b = this.bonus(target);
      const all = mergeUnits(this.defenders(target));
      const own = Object.entries(all).reduce((s, [id, n]) => s + n * (UNIT[id] ? UNIT[id].spy : 0), 0);
      dPow = own * 20 * (1 + 0.05 * b.watch + 0.05 * b.spyCenter);
    }
    const aPow = spies * 35;
    const lossFrac = dPow ? Math.min(1, (dPow / aPow) ** 1.5) : 0;
    const lost = applyLoss(a.units, lossFrac);
    const alive = Object.values(a.units).some((n) => n > 0);
    const where = `${a.x}:${a.y}`;
    let sim = null; // данные для симулятора боя (кнопка «В симулятор» в отчёте)
    const lines = [`Разведка ${target ? target.name : where}. Потери: ${unitsLine(a.units, lost)}`];
    if (!alive) lines.push('Разведчики не вернулись.');
    else if (target && this.spyShield(this.ownerOf(target))) {
      lines.push('Контрразведка противника: склады, постройки, армии и их расположение скрыты. Узнать ничего не удалось.');
    } else if (target) {
      const b = this.bonus(target), lvl = this.buildingLevel(c, B.SPY) || 1;
      const alivePart = Object.values(a.units).reduce((s, n) => s + n, 0) / sent;
      const can = (k) => lvl >= SPY_OPEN[k].level && alivePart > SPY_OPEN[k].survive;
      lines.push(`Выжило разведчиков: ${Math.round(alivePart * 100)}%. Центр разведки ${lvl} ур.`);
      sim = { uid: target.owner, race: this.raceOf(target) }; // для симулятора боя — только то, что разведчики увидели
      if (this.brBonus) { const ru = this.ownerOf(target), i = this.brRank(ru); if (i >= 0) sim.rank = { idx: i, title: require('./battlerank').rankInfo(i).title, def: this.brBonus(ru).atk }; } // боевой ранг виден всем (профиль) — учитывается всегда
      if (can('armies')) {
        sim.units = mergeUnits([target.units, ...target.squads.map((q) => q.units)]); for (const id of Object.keys(sim.units)) if (UNIT[id] && UNIT[id].dungOnly) delete sim.units[id]; // Стражи глубин замок не защищают
        const g = target.general; if (g && !g.dead && !g.away) { const hb = this.heroBonus(g); sim.gen = { level: g.level, kindId: genWarrior(g).id, pts: { atk: g.pts.atk || 0, catk: g.pts.catk || 0, cdef: g.pts.cdef || 0 }, hdef: hb.def, hwall: hb.wall }; } // симулятор пересчитает генерала по воину и очкам
        lines.push(`Армии в замке: ${unitsLine(mergeUnits([target.units, ...target.squads.map((q) => q.units)]))}`);
        if (target.general && !target.general.dead) lines.push(`Генерал ${target.general.level} ур.`);
      }
      if (can('res')) sim.res = Object.fromEntries(RES4.map((r) => [r, Math.floor(target.res[r])]));
      if (can('res')) lines.push(`Ресурсы: дерево ${Math.floor(target.res.wood)}, камень ${Math.floor(target.res.stone)}, железо ${Math.floor(target.res.iron)}, еда ${Math.floor(target.res.food)}`);
      if (can('build')) {
        const list = []; target.grid[0].forEach((id, i) => { if (id >= 0 && target.levels[0][i]) list.push(`${C.BY_ID[id].name} ${target.levels[0][i]}`); });
        lines.push(`Здания: ${list.join(', ') || '—'}. Забор ${b.wall} ур., Тайник прячет ${b.hidden}.`);
        Object.assign(sim, { wall: b.wall, wallPer: b.wallPer, defK: b.def, atkK: b.atk, magK: b.magic, hidden: b.hidden }); // atkK — урон защитников (бой как в оригинале)
        sim.forge = Object.fromEntries(Object.entries(target.forge || {}).filter(([, f]) => f && (f.a || f.d || f.m || f.md)).map(([id, f]) => [id, { a: f.a || 0, d: f.d || 0, m: f.m || 0, md: f.md || 0 }])); // Кузница и Школа магии: урон и здоровье воинов
      }
      if (can('riot')) lines.push(`Бунт в замке: ${Math.round(100 - (target.loyalty ?? 100))}%${this.isCapital(target) ? ' (столица — захватить нельзя)' : ''}`);
      if (can('reinf')) { const g = this.guestsOf(target); sim.reinf = mergeUnits(g.map((x) => x.a.units)); lines.push(`Подкрепления: ${g.length ? g.map((x) => `${this.ownerOf(x.c).login}: ${unitsLine(x.a.units)}`).join('; ') : 'нет'}`); }
      const hidden = Object.keys(SPY_OPEN).filter((k) => !can(k)).map((k) => SPY_OPEN[k].name);
      if (hidden.length) lines.push(`Не удалось узнать: ${hidden.join(', ')}.`);
    } else {
      const obj = this.worldObjects(a.x, a.y, 1, 1)[0];
      const npc = obj && NPC[obj.img];
      if (npc) sim = { npc: obj.img };
      lines.push(npc ? `${npc.name}: охрана ~${npc.def.inf}, запас ${RES4.map((r) => npc.loot[r]).join('/')}` : 'Здесь пусто.');
      if (npc && npc.ruins) lines.push(`Бунт в руинах: ${Math.round(100 - (((this.db.npc || {})[where] || {}).loyalty ?? 100))}% — захват нападением с Бунтарями (+${RIOT_STEP}% за победу, при 100% руины ваши).`);
    }
    const me = this.ownerOf(c), tu = target && this.ownerOf(target);
    const sdata = { type: 'scout', ok: alive, x: a.x, y: a.y,
      att: { id: me.id, login: me.login, castle: c.name, cx: c.x, cy: c.y, rating: this.rating(c), sent, lost: Object.values(lost).reduce((q, n) => q + n, 0) },
      def: target ? { id: tu.id, login: tu.login, castle: target.name, rating: this.rating(target) } : { npc: ((NPC[(this.worldObjects(a.x, a.y, 1, 1)[0] || {}).img] || {}).name) || 'Пустошь' },
      info: lines.slice(1), sim: alive ? sim : null };
    this.report(c.owner, `Разведка ${target ? target.name : where}${alive ? '' : ' — провал'}`, lines, 'scout', sdata);
    if (target && lossFrac > 0 && !ghost) this.report(target.owner, 'Замечены вражеские разведчики', [`Разведчики игрока ${this.ownerOf(c).login} у вашего замка. Уничтожено: ${Math.round(lossFrac * 100)}%.`], 'scout');
    this.goBack(c, a, t);
  };

  // ----- симулятор боя (кнопка «В симулятор» в отчёте разведки) -----
  // Бой считается той же формулой (clash), но на копии своего замка и на «замке-симуляции» из данных разведки: войска не гибнут,
  // ресурсы не тратятся, удача 0. Своё (армия, генерал, Кузница, науки, ранг, артефакты) — настоящее; у противника — то, что передал
  // клиент (по умолчанию — из разведки). p = { units, general, mission, def: { npc } | { race, uid, units, reinf, wall, wallPer, defK, atkK, magK, gen, res, hidden } }
  P.simBattle = function simBattle(c, p = {}) {
    this.tick(c); this.mil(c);
    const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    const clean = (o) => {
      const r = {};
      if (o && typeof o === 'object' && !Array.isArray(o)) for (const [id, n0] of Object.entries(o)) { const n = Math.floor(num(n0, 0, 1e7, 0)); if (n > 0 && Object.prototype.hasOwnProperty.call(UNIT, id) && Number(id) !== GENERAL_ID && !UNIT[id].dungOnly) r[id] = n; }
      return r;
    };
    const units = clean(p.units); if (!Object.keys(units).length) return { error: 'Укажите, какие войска отправить.' };
    const mission = p.mission === 'raid' ? 'raid' : 'attack', d = p.def && typeof p.def === 'object' ? p.def : {};
    const A = structuredClone(c), general = !!(p.general && A.general && !A.general.dead && !A.general.away);
    let D = null, npc = null, mkD = null; // mkD — новый «замок-симуляция» (бой вычитает павших)
    if (d.npc !== undefined && d.npc !== null) { npc = [30, 31, 32, 24].includes(Number(d.npc)) ? NPC[Number(d.npc)] : null; if (!npc) return { error: 'Такого лагеря нет.' }; }
    else {
      const race = ['humans', 'elves', 'dwarves', 'orcs'].includes(d.race) ? d.race : 'humans', wall = Math.round(num(d.wall, 0, 20, 0)), g = d.gen && typeof d.gen === 'object' ? d.gen : null;
      const uid = Number(d.uid) !== c.owner && this.userById(Number(d.uid)) ? Number(d.uid) : 0; // настоящий противник — для боевого духа (сильный бьёт слабого хуже)
      const forge = {}; if (d.forge && typeof d.forge === 'object') for (const [id, f] of Object.entries(d.forge)) if (Object.prototype.hasOwnProperty.call(UNIT, id) && f && typeof f === 'object') forge[id] = { a: Math.round(num(f.a, 0, 100, 0)), d: Math.round(num(f.d, 0, 100, 0)), m: Math.round(num(f.m, 0, 100, 0)), md: Math.round(num(f.md, 0, 100, 0)) };
      mkD = () => ({ id: -1, owner: uid, name: 'Симулятор', units: mergeUnits([clean(d.units), clean(d.reinf)]), squads: [], general: null, wall, armies: [], forge,
        grid: [new Int8Array(49).fill(-1), new Int8Array(225).fill(-1)], levels: [new Int8Array(49), new Int8Array(225)],
        sim: { bonus: { def: num(d.defK, 1, 5, 1), atk: num(d.atkK, 1, 5, 1), magic: num(d.magK, 1, 3, 1), wall, wallPer: num(d.wallPer, 0, 0.2, WALL_PER[race]) },
          gen: g ? this.genStats({ kindId: Number(g.kindId) || 0, pts: Object.fromEntries(['atk', 'catk', 'cdef'].map((k) => [k, Math.round(num(g.pts && g.pts[k], 0, 2 * GEN.maxLevel, 0))])) }) : null, // генерал противника — по воину и очкам из разведки
          hero: g ? { def: num(g.hdef, 0, 2, 0), wall: num(g.hwall, 0, 2, 0) } : null } });
      D = mkD();
    }
    const luck0 = process.env.LUCK; process.env.LUCK = '0';
    let R; const a = { units: { ...units }, mission, general }, d0 = D ? { ...D.units } : null; // d0 — войска противника до боя (clash вычитает павших)
    // генерал: сколько силы атаки он добавляет — тот же бой с генералом и без (у кого генерал дома)
    const genOk = !!(A.general && !A.general.dead && !A.general.away);
    let genGain = null;
    try {
      R = this.clash(A, a, D, npc, Date.now());
      if (genOk) { const R2 = this.clash(structuredClone(c), { units: { ...units }, mission, general: !general }, mkD ? mkD() : null, npc, Date.now()); const w = general ? R.calc.att.str : R2.calc.att.str, wo = general ? R2.calc.att.str : R.calc.att.str; genGain = wo ? Math.round((w / wo - 1) * 1000) / 10 : 0; }
    } finally { if (luck0 === undefined) delete process.env.LUCK; else process.env.LUCK = luck0; }
    const costOf = (id) => Object.values(UNIT[id].cost || {}).reduce((q, v) => q + v, 0);
    const att = Object.entries(units).map(([id, n]) => ({ id: Number(id), was: n, lost: R.aLost[id] || 0, wounded: R.aWnd[id] || 0 }));
    const def = npc ? (R.garrison || []).map((x) => ({ name: x.name, was: x.n, lost: x.lost }))
      : Object.entries(d0).map(([id, n]) => ({ id: Number(id), was: n, lost: R.dLost[id] || 0 }));
    let carry = R.win ? Object.entries(a.units).reduce((q, [id, n]) => q + (UNIT[id].carry || 0) * n, 0) : 0;
    if (carry && general) carry = Math.floor(carry * (1 + this.heroBonus(A.general).loot));
    // цена потерь: погибшие — по цене тренировки, раненые — по цене лечения в Лазарете
    const lossCost = att.reduce((q, x) => q + (x.lost - x.wounded) * costOf(x.id) + x.wounded * costOf(x.id) * HEAL_K, 0);
    const res = d.res && typeof d.res === 'object' ? d.res : null, hid = Math.floor(num(d.hidden, 0, 1e9, 0));
    const stock = npc ? RES4.reduce((q, r) => q + npc.loot[r], 0) : res ? RES4.reduce((q, r) => q + Math.max(0, Math.floor(num(res[r], 0, 1e9, 0)) - hid), 0) : null;
    const loot = stock === null ? null : Math.min(carry, stock);
    // ap, dp — сила сторон: √(урон × здоровье)
    return { ok: true, win: R.win, mission, ap: R.calc.att.str, dp: R.calc.def.str, morale: R.calc.morale, att, def, npc: npc ? npc.name : null,
      atkPct: R.calc.att.bonusPct, defPct: R.calc.def.bonusPct, myRank: this.brBonus ? Math.round(this.brBonus(this.ownerOf(c)).atk * 1000) / 10 : 0, // бонусы в расчёте (ранг — в них)
      wall: R.calc.def.wall0, wallTo: R.calc.def.wall < R.calc.def.wall0 ? R.calc.def.wall : null, wounded: R.calc.wounded, // wallTo — Забор в бою после таранов
      carry, stock, loot, lossCost: Math.round(lossCost),
      profit: loot === null ? null : Math.round(loot - lossCost), general, genGain, genLevel: genOk ? A.general.level : null };
  };

  // экспедиция археологов в руины
  P.expedition = function expedition(c, a, t) {
    const n = a.units[230] || 0;
    const chance = Math.min(RUINS.cap, RUINS.chance + RUINS.per * n + 0.05 * this.buildingLevel(c, B.EXPEDITION));
    const lines = [`Раскопки в руинах ${a.x}:${a.y}, археологов: ${n}. Шанс находки ${Math.round(chance * 100)}%.`];
    if (Math.random() < chance) {
      const types = ART_BASIC, type = types[Math.floor(Math.random() * types.length)];
      const roll = Math.random() + 0.02 * this.buildingLevel(c, B.EXPEDITION), rarity = roll > 0.95 ? 2 : roll > 0.7 ? 1 : 0;
      this.addStat(c.owner, 'arts', 1 + rarity * 2); // качество: обычный 1, редкий 3, легендарный 5
      lines.push(this.artFound(c, type, rarity, t));
    } else lines.push('Ничего не найдено.');
    this.report(c.owner, `Экспедиция ${a.x}:${a.y}`, lines, 'expedition');
    this.goBack(c, a, t);
  };

  // ----- экспедиции из здания «Экспедиция» -----
  P.expedInfo = function expedInfo(castle) {
    const L = this.buildingLevel(castle, B.EXPEDITION), camp = L; // прибавка Лагеря археологов (с 25.10 его нет) — от уровня Экспедиции
    return { slots: L ? 1 + Math.floor(L / 4) : 0, maxN: EXPED_MAXN, have: castle.units[230] || 0,
      kinds: Object.entries(EXPED).map(([k, e]) => ({ k, name: e.name, desc: e.desc, sec: Math.max(10, Math.round(e.hours * 3600 / SPEED)), lvl: e.lvl, open: L >= e.lvl, risk: Math.round(e.risk * 100),
        base: Math.round((e.chance + 0.03 * camp + 0.02 * L) * 100), per: Math.round(EXPED_PER * 100), cap: Math.round(EXPED_CAP * 100), rare: Math.round(Math.min(1, 0.3 + e.bias + 0.02 * camp) * 100), legend: Math.round(Math.min(1, 0.05 + e.bias + 0.02 * camp) * 100) })) };
  };
  // с 24.10 археологи копают только в Подземелье (dungeon.js); ушедшие раньше экспедиции возвращаются как прежде (expedBack)
  P.expedGo = function expedGo() { return { error: 'Археологи теперь копают только в Подземелье — кнопка «Подземелье» в Экспедиции.' }; };
  P.expedBack = function expedBack(castle, x) {
    const e = EXPED[x.kind], L = this.buildingLevel(castle, B.EXPEDITION), camp = L; // прибавка Лагеря археологов (с 25.10 его нет) — от уровня Экспедиции
    const lines = [`«${e.name}»: ушло археологов ${x.n}.`];
    let lost = 0; for (let i = 0; i < x.n; i++) if (Math.random() < e.risk) lost++;
    if (lost) lines.push(rndPick(['Обвал в галерее', 'Древняя ловушка', 'Проклятие гробницы', 'Нападение песчаных гиен']) + `: не вернулось ${lost}.`);
    const back = x.n - lost; if (back) castle.units[230] = (castle.units[230] || 0) + back;
    const chance = Math.min(EXPED_CAP, e.chance + EXPED_PER * x.n + 0.03 * camp + 0.02 * L);
    if (back && Math.random() < chance) {
      const type = rndPick(ART_BASIC), roll = Math.random() + e.bias + 0.02 * camp, rarity = roll > 0.95 ? 2 : roll > 0.7 ? 1 : 0;
      this.addStat(castle.owner, 'arts', 1 + rarity * 2);
      lines.push(this.artFound(castle, type, rarity, Date.now()));
    } else if (back) {
      const g = Math.round((50 + Math.random() * 150) * (1 + Object.keys(EXPED).indexOf(x.kind))); const cap = this.capacity(castle);
      for (const r of RES4) castle.res[r] = Math.max(castle.res[r], Math.min(cap[r], castle.res[r] + g));
      lines.push(`Артефактов не нашли, зато принесли черепки и старые монеты — по ${g} каждого ресурса.`);
    } else lines.push('Никто не вернулся…');
    this.report(castle.owner, `Экспедиция вернулась: ${e.name}`, lines, 'expedition');
  };

  // находка археологов: в Сокровищницу; полна — артефакт разбит на осколки (ресурсы — в Кладовую, ничего не пропадает)
  P.artFound = function artFound(castle, type, rarity, t) {
    const what = `${ART_TYPES[type].name} (${RARITY[rarity].name}, +${RARITY[rarity].bonus * 100}% — ${ART_TYPES[type].desc})`;
    if (castle.artifacts.length < this.bonus(castle).artStore) {
      castle.artifacts.push({ id: this.db.nextId++, type, rarity, active: false, found: t });
      return `Найден артефакт: ${what}. Он в Сокровищнице — пробудите его в Башне артефактов.`;
    }
    const g = ART_BREAK[rarity] || ART_BREAK[0], u = this.userById(castle.owner);
    if (u) this.stashAdd(u, Object.fromEntries(RES4.map((r) => [r, g])));
    return `Найден артефакт: ${what}, но Сокровищница полна — он разбит на осколки: по ${g.toLocaleString('ru-RU')} каждого ресурса в Кладовую. Развейте Сокровищницу или разбейте ненужные артефакты.`;
  };
  P.activateArtifact = function activateArtifact(castle, id, on) {
    this.mil(castle);
    const a = castle.artifacts.find((x) => x.id === Number(id)); if (!a) return { error: 'Артефакт не найден.' };
    if (on && !(ART_TYPES[a.type] || {}).coin) { // монете место в Башне не нужно
      const slots = this.bonus(castle).artSlots;
      if (!slots) return { error: 'Нужна Башня артефактов.' };
      if (castle.artifacts.filter((x) => x.active).length >= slots) return { error: `Активных артефактов не больше ${slots} (растёт с Башней).` };
    }
    if (!on) return { error: 'Пробуждённый артефакт не усыпить — его сила иссякнет сама.' };
    if (a.active) return { error: 'Артефакт уже пробуждён.' };
    const T = ART_TYPES[a.type] || {}, now = Date.now();
    if (T.coin) { // «Монета Древних Королей»: пробудили — монета у игрока, артефакт исчез
      const u = this.ownerOf(castle); castle.artifacts.splice(castle.artifacts.indexOf(a), 1); this.goldChange(u, 1, 'Подземелье: «Монета Древних Королей» пробуждена'); this.addStat(castle.owner, 'boost', 1); this.store.save();
      return { ok: true, msg: '«Монета Древних Королей» пробуждена: +1 монета.' };
    }
    if (T.special) { // артефакты Подземелья: перезарядка вида и защитные — не во время чужого похода на замок
      const cd = (castle.artCd || {})[a.type] || 0;
      if (cd > now) return { error: `«${T.name}» можно пробудить снова через ${Math.ceil((cd - now) / 3600000)} ч.` };
      if (T.def && this.hostileIncoming(castle)) return { error: 'На замок уже идёт вражеская армия — защитный артефакт сейчас не пробудить.' };
      const other = T.wall && castle.artifacts.find((x) => x.active && x !== a && (ART_TYPES[x.type] || {}).wall && (x.until || 0) > now);
      if (other) return { error: `В замке уже действует «${ART_TYPES[other.type].name}» — защитные артефакты Подземелья не складываются, одновременно только один.` };
      castle.artCd = { ...(castle.artCd || {}), [a.type]: now + ART_CD * 3600000 / SPEED };
    }
    // действует один артефакт каждого вида (artEffects): такой же или сильнее уже пробуждён — новый не добавил бы силы
    if (castle.artifacts.some((x) => x.active && x.type === a.type && (x.rarity || 0) >= (a.rarity || 0))) return { error: 'Артефакт этого вида уже пробуждён (такой же или сильнее) — одновременно действует только один артефакт каждого вида.' };
    this.addStat(castle.owner, 'boost', 1); // Зал Славы «Усиление»
    const hours = T.hours || ART_HOURS[a.rarity || 0];
    a.active = true; a.until = now + hours * 3600000 / SPEED; this.store.save();
    return { ok: true, msg: `«${T.name}» пробуждён на ${hours} ч. Потом он рассыплется.` };
  };
  // разбить спящий артефакт: ресурсы — в замок до вместимости Складов, остаток — в Кладовую (не пропадает)
  P.breakArtifact = function breakArtifact(castle, id) {
    this.tick(castle); this.mil(castle);
    const a = castle.artifacts.find((x) => x.id === Number(id)); if (!a) return { error: 'Артефакт не найден.' };
    if (a.active) return { error: 'Пробуждённый артефакт не разбить — его сила иссякнет сама.' };
    const g = ART_BREAK[a.rarity] || ART_BREAK[0], cap = this.capacity(castle), rest = {};
    castle.artifacts.splice(castle.artifacts.indexOf(a), 1);
    for (const r of RES4) { const k = Math.max(0, Math.min(g, Math.floor(cap[r] - castle.res[r]))); castle.res[r] += k; if (g > k) rest[r] = g - k; }
    const u = this.userById(castle.owner), stash = Object.keys(rest).length > 0 && !!u;
    if (stash) this.stashAdd(u, rest);
    this.store.save();
    return { ok: true, msg: `«${ART_TYPES[a.type].name}» разбит на осколки: +${g.toLocaleString('ru-RU')} каждого ресурса${stash ? ' (что не влезло в Склады — в Кладовой)' : ''}.` };
  };

  // входящие армии к замку
  // Караульная башня (хоть в одном замке королевства): видны армии, идущие на замки короля, кроме разведки;
  // без башни видны только торговцы и подкрепления союзников
  P.hasWatch = function hasWatch(user) { return !!user && this.castlesOf(user).some((c) => this.buildingLevel(c, B.WATCHTOWER) > 0); };
  // уровень башни (лучшая в королевстве) решает, что видно о вражеской армии:
  // 1+ — кто, куда и когда; 3+ — примерная численность; 6+ — точная численность; 10+ — идёт ли с армией генерал.
  // Состав войск чужой армии не виден никогда (с 27.10, по решению владельца; раньше — с 10 ур.)
  P.watchLevel = function watchLevel(user) { return user ? Math.max(0, ...this.castlesOf(user).map((c) => this.buildingLevel(c, B.WATCHTOWER))) : 0; };
  // сведения о вражеской армии: Караульная башня (у неё 1 уровень) замечает армию, а подробности даёт лучший Центр разведки
  // королевства: 3 ур. — примерная численность, 6 — точная, 10 — идёт ли генерал (состав войск — никогда)
  P.watchIntel = function watchIntel(user) { return this.hasWatch(user) ? Math.max(0, ...this.castlesOf(user).map((c) => this.buildingLevel(c, B.SPY))) : 0; };
  const roughly = (n) => { if (n < 10) return n; const p = 10 ** (Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; };
  P.incoming = function incoming(castle) {
    const owner = this.ownerOf(castle), out = [], watch = this.hasWatch(owner), wl = watch ? this.watchIntel(owner) : 0;
    for (const c of Object.values(this.db.castles)) {
      if (c === castle || !c.armies) continue;
      for (const a of c.armies) {
        if (a.state !== 'go' || a.x !== castle.x || a.y !== castle.y || a.mission === 'scout' || a.dung || a.allyStore) continue; // взнос в кладовую альянса едет не в этот замок
        const friendly = a.mission === 'trade' || a.mission === 'reinforce';
        if (!friendly && !watch) continue;
        const n = Object.values(a.units).reduce((q, k) => q + k, 0);
        out.push({ id: a.id, from: this.ownerOf(c).login, castle: c.name, to: castle.name, tx: castle.x, ty: castle.y, fx: c.x, fy: c.y, mission: a.mission, depart: a.depart, arrive: a.arrive, units: friendly ? a.units : null,
          size: friendly || wl >= 6 ? n : wl >= 3 ? roughly(n) : null, exact: friendly || wl >= 6, general: friendly || wl >= 10 ? !!a.general : null });
      }
    }
    return out.sort((p, q) => p.arrive - q.arrive);
  };
  // что стоит в клетке (x, y) — для «Куда идёт армия»: замок с владельцем, лагерь/руины, мировой босс или пустая клетка
  P.placeName = function placeName(x, y) {
    const k = this.castleAt(x, y); if (k) { const o = this.userById(k.owner); return `${k.name}${o ? ` (${o.login})` : ''}`; }
    const b = this.bossAt && this.bossAt(x, y); if (b) return b.name;
    const ob = this.worldObjects(x, y, 1, 1).find((q) => q.kind === 'object'); return ob ? ob.name : 'пустая клетка';
  };
  // «Передвижения армий» королевства (окно Караульной башни): свои армии из всех замков и идущие на все замки
  P.kingdomMoves = function kingdomMoves(user) {
    const mine = [], inc = [];
    for (const c of this.castlesOf(user)) {
      for (const a of c.armies || []) mine.push({ id: a.id, castle: c.name, cx: c.x, cy: c.y, mission: a.mission, x: a.x, y: a.y, state: a.state, depart: a.depart, arrive: a.arrive, back: a.back, sec: a.sec,
        stayName: a.state === 'stay' && this.db.castles[a.stayAt] ? this.db.castles[a.stayAt].name : null, n: Object.values(a.units).reduce((s, k) => s + k, 0),
        units: a.units, general: !!a.general, army: a.squad ? a.squad.name : a.dung ? 'Отряд' : 'Армия', to: a.dung ? `Подземелье: ${this.dungName(a.dl)}` : this.placeName(a.x, a.y), dung: a.dung || 0, digEnd: a.digEnd || 0, art: !!(a.find || a.art),
        recalled: a.recalled ?? null, recallUntil: (a.state === 'go' || a.state === 'wait') && a.mission !== 'expedition' ? a.depart + RECALL_MS : 0 });
      inc.push(...this.incoming(c).filter((a) => a.from !== user.login)); // свои армии между своими замками — уже в списке «свои»
    }
    return { mine, incoming: inc.sort((p, q) => p.arrive - q.arrive) };
  };
  // счётчики армий для верхней панели: свои подкрепления (и идущие к нам), свои нападения, нападения на нас (видит Караульная башня)
  P.moveCounts = function moveCounts(user) {
    let reinf = 0, att = 0, inc = 0, home = 0;
    for (const c of this.castlesOf(user)) {
      for (const a of c.armies || []) if (a.state === 'back') home++; // возвращаются домой после нападения, набега, разведки, торговли
      for (const a of c.armies || []) if (a.state === 'go' || a.state === 'wait') {
        if (a.mission === 'reinforce' || a.mission === 'settle') reinf++; else if (['attack', 'raid', 'scout'].includes(a.mission)) att++; // settle — путешественники идут строить замок
      }
      for (const a of this.incoming(c)) if (a.from === user.login) continue; else if (a.mission === 'reinforce') reinf++; else if (['attack', 'raid'].includes(a.mission)) inc++;
    }
    return { reinf, att, inc, home };
  };
  // оповещение при выходе армии: нападение/набег на замок короля с Караульной башней
  P.warnIncoming = function warnIncoming(c, a) {
    if (!['attack', 'raid'].includes(a.mission)) return;
    const t = this.castleAt(a.x, a.y), owner = t && this.ownerOf(t);
    if (!t || t.owner === c.owner || !this.hasWatch(owner)) return;
    const min = Math.max(1, Math.round((a.arrive - Date.now()) / 60000));
    const x = this.incoming(t).find((q) => q.id === a.id), size = x && x.size != null ? `, войск ${x.exact ? '' : '≈ '}${x.size.toLocaleString('ru-RU')}` : '';
    this.event(owner.id, `⚔ Караульная башня: ${MISSIONS[a.mission]} на «${t.name}» от ${this.ownerOf(c).login}${size}, прибытие через ${min} мин.`);
    if (this.tgNotify) this.tgNotify(owner.id, 'attack', `⚔ ${MISSIONS[a.mission]} на ваш замок «${t.name}» (${t.x}:${t.y})! Идёт ${this.ownerOf(c).login}${size}, прибытие через ${min} мин.`);
  };

  // ----- рынок -----
  P.exchange = function exchange(castle, from, to, amount) {
    this.tick(castle);
    amount = Math.floor(Number(amount));
    const rate = this.bonus(castle).marketRate;
    if (!rate) return { error: 'Нужен Рынок.' };
    if (!RES4.includes(from) || !RES4.includes(to) || from === to) return { error: 'Выберите разные ресурсы.' };
    if (!(amount > 0) || castle.res[from] < amount) return { error: 'Недостаточно ресурсов.' };
    const got = Math.floor(amount * rate);
    castle.res[from] -= amount;
    castle.res[to] = Math.max(castle.res[to], Math.min(this.capacity(castle)[to], castle.res[to] + got));
    this.store.save();
    return { got };
  };

  // ----- наука -----
  P.research = function research(castle, sci) {
    this.tick(castle);
    if (!SCIENCES[sci]) return { error: 'Неизвестная наука.' };
    const uni = this.buildingLevel(castle, B.UNIVERSITY);
    if (!uni) return { error: 'Нужен Университет.' };
    if (!this.isCapital(castle)) return { error: 'Науки изучаются в столице — они действуют сразу во всех Ваших замках.' };
    if (castle.research) return { error: 'Уже идёт исследование.' };
    castle.sciences = this.sciOf(castle);
    const next = castle.sciences[sci] + 1;
    if (next > uni) return { error: `Уровень науки не выше уровня Университета (${uni}).` };
    const cost = scienceCost(next);
    for (const r of RES4) if (castle.res[r] < cost[r]) return { error: 'Недостаточно ресурсов.' };
    for (const r of RES4) castle.res[r] -= cost[r];
    const sages = castle.units[227] || 0;
    const sec = Math.max(3, Math.round(scienceTime(next) * Math.max(0.5, 1 - 0.02 * sages) / SPEED));
    castle.research = { sci, level: next, start: Date.now(), end: Date.now() + sec * 1000 };
    this.addStat(castle.owner, 'research', 1);
    this.store.save();
    return { ok: true };
  };

  P.setReligion = function setReligion(castle, id) {
    if (!RELIGIONS[id]) return { error: 'Неизвестная религия.' };
    if (!this.buildingLevel(castle, B.TEMPLE)) return { error: 'Нужен Храм.' };
    if (castle.religion) return { error: 'Религия уже принята.' };
    castle.religion = id; this.store.save();
    return { ok: true };
  };

  // ----- альянсы (Дипломатический центр): приглашения, заявки, создание, управление -----
  // игроки одного альянса не нападают друг на друга (нападение, набег, разведка) — только подкрепление и ресурсы
  P.sameAlliance = function sameAlliance(aId, bId) { if (aId === bId) return false; const a = this.userById(aId), b = this.userById(bId); return !!(a && b && a.alliance && a.alliance === b.alliance); };
  P.allianceOf = function allianceOf(user) { return user && user.alliance && (this.db.alliances || {})[user.alliance]; };
  const ALLY_MAX = 50; // не больше 50 игроков в альянсе
  const ALLY_CREATE_LVL = 10; // создать альянс — только с Дипломатическим центром 10 ур. (вступить можно с любым)
  P.allianceSlots = function allianceSlots(al) {
    const leader = this.userById(al.leader), lc = leader && this.castleOf(leader);
    return Math.min(ALLY_MAX, 5 * Math.max(1, lc ? this.buildingLevel(lc, B.EMBASSY) : 1)); // 5 мест за уровень центра главы, максимум 50 (10 ур.)
  };
  P.joinAlliance = function joinAlliance(user, al) {
    if (al.members.length >= this.allianceSlots(al)) return { error: `В альянсе нет мест (${this.allianceSlots(al)}).` };
    al.members.push(user.id); user.alliance = al.id;
    user.allyRead = { mail: this.db.nextId - 1, news: this.db.nextId - 1 }; // прежние рассылки и новости альянса новичку — не «новые» (ally.js allyFresh)
    this.allyLog(al, `${user.login} вступил в альянс`);
    user.invites = []; // вступил — остальные приглашения больше не нужны
    for (const a of Object.values(this.db.alliances)) if (a.requests) a.requests = a.requests.filter((id) => id !== user.id);
    for (const id of al.members) if (id !== user.id) this.event(id, `${user.login} вступил в альянс [${al.tag}].`);
    this.store.save(); return { ok: true };
  };
  P.alliance = function alliance(user, castle, { op, name, tag, id, login, kind, text }) {
    this.db.alliances = this.db.alliances || {};
    const emb = this.buildingLevel(castle, B.EMBASSY);
    const cur = this.allianceOf(user), A = this.db.alliances;
    id = Number(id);
    // приглашения игроку
    if (op === 'decline') { user.invites = (user.invites || []).filter((x) => x !== id); this.store.save(); return { ok: true }; }
    if (op === 'declineall') { user.invites = []; this.store.save(); return { ok: true }; }
    if (op === 'accept') {
      if (!(user.invites || []).includes(id) || !A[id]) { user.invites = (user.invites || []).filter((x) => x !== id); return { error: 'Приглашение устарело.' }; }
      if (cur) return { error: 'Сначала выйдите из текущего альянса.' };
      return this.joinAlliance(user, A[id]); // по приглашению — без Дипломатического центра
    }
    if (op === 'request') { // заявка на вступление («Альянсы» → «Вступить»)
      if (!emb) return { error: 'Нужен Дипломатический центр.' };
      if (cur) return { error: 'Вы уже в альянсе.' };
      const al = A[id]; if (!al) return { error: 'Альянс не найден.' };
      al.requests = al.requests || [];
      if (!al.requests.includes(user.id)) { al.requests.push(user.id); this.event(al.leader, `Заявка в альянс от ${user.login}.`); }
      this.store.save(); return { ok: true, msg: `Заявка отправлена в [${al.tag}].` };
    }
    // управление своим альянсом (глава)
    if (['invite', 'uninvite', 'approve', 'reject', 'kick', 'award'].includes(op)) {
      if (!cur) return { error: 'Вы не в альянсе.' };
      const right = { invite: 'invite', uninvite: 'invite', approve: 'invite', reject: 'invite', kick: 'kick', award: 'rights' }[op];
      if (!this.allyCan(cur, user.id, right)) return { error: 'Нет прав на это действие.' };
      const t = login !== undefined ? this.db.users[String(login).trim()] : this.userById(id);
      if (!t) return { error: 'Игрок не найден.' };
      if (op === 'invite') {
        if (t.bot) return { error: 'Игрок не найден.' }; // боты и «Ничейные земли» (nobody.js): им и отчёт-приглашение не пишется
        if (t.alliance) return { error: 'Игрок уже в альянсе.' };
        t.invites = t.invites || [];
        if (!t.invites.includes(cur.id)) t.invites.push(cur.id);
        (t.inviteBy = t.inviteBy || {})[cur.id] = user.login; // кто пригласил — в карточке приглашения
        // отчёт-приглашение: игрок вступает прямо из отчёта (новый отчёт — с конвертом в верхней панели)
        this.report(t.id, `Приглашение в альянс [${cur.tag}]`, [`${user.login} приглашает вас в альянс «${cur.name}» [${cur.tag}].`], 'invite',
          { type: 'invite', ally: { id: cur.id, name: cur.name, tag: cur.tag }, from: { id: user.id, login: user.login } });
        const rr = this.db.reports[this.db.reports.length - 1]; rr.from = user.login;
        this.store.save(); return { ok: true, msg: `Приглашение отправлено: ${t.login}.` };
      }
      if (op === 'uninvite') { t.invites = (t.invites || []).filter((x) => x !== cur.id); this.store.save(); return { ok: true, msg: `Приглашение для ${t.login} отозвано.` }; }
      if (op === 'reject') { cur.requests = (cur.requests || []).filter((x) => x !== t.id); this.store.save(); return { ok: true }; }
      if (op === 'approve') {
        cur.requests = (cur.requests || []).filter((x) => x !== t.id);
        if (t.alliance) { this.store.save(); return { error: 'Игрок уже в другом альянсе.' }; }
        return this.joinAlliance(t, cur);
      }
      if (op === 'award') { // медаль за заслуги от альянса (не больше 5 в сутки от главы) — за монеты казны альянса (ally.js MEDAL_COST)
        if (!cur.members.includes(t.id)) return { error: 'Игрок не в вашем альянсе.' };
        if (t.id === user.id) return { error: 'Себе медаль из казны вручить нельзя.' };
        kind = ['gold', 'silver', 'bronze'].includes(kind) ? kind : 'bronze';
        const now = Date.now(); user.awardLog = (user.awardLog || []).filter((x) => x > now - 86400000);
        if (user.awardLog.length >= 5) return { error: 'Не больше 5 наград в сутки.' };
        const cost = require('./ally').MEDAL_COST[kind], name = { gold: 'золотая', silver: 'серебряная', bronze: 'бронзовая' }[kind];
        if ((cur.treasury || 0) < cost) return { error: `Медаль (${name}) стоит ${Wd.coinsAcc(cost)} из казны альянса, в казне — ${Wd.coins(cur.treasury || 0)}.` };
        cur.treasury -= cost; user.awardLog.push(now);
        this.allyLog(cur, `${user.login} вручил медаль (${name}) ${t.login}: ${Wd.coinsAcc(cost)} из казны`, 'store', { op: '-', gold: cost, by: user.login, to: t.login, via: 'medal', what: `${name} медаль` });
        (t.allyAwards = t.allyAwards || []).push({ kind, tag: cur.tag, by: user.login, at: now, text: String(text || '').trim().slice(0, 80) });
        this.event(t.id, `Альянс [${cur.tag}] наградил Вас медалью за заслуги!`);
        this.store.save(); return { ok: true, msg: `Медаль вручена: ${t.login}.` };
      }
      if (op === 'kick') {
        if (t.id === user.id || !cur.members.includes(t.id)) return { error: 'Нельзя исключить.' };
        if (t.id === cur.leader) return { error: 'Создателя исключить нельзя.' };
        this.allyLog(cur, `${user.login} исключил ${t.login}`);
        this.allyRemoveMember(cur, t.id);
        this.event(t.id, `Вас исключили из альянса [${cur.tag}].`); this.store.save(); return { ok: true };
      }
    }
    if (op === 'leave') {
      if (!cur) return { error: 'Вы не в альянсе.' };
      this.allyLog(cur, `${user.login} покинул альянс`);
      const left = this.allyRemoveMember(cur, user.id);
      this.store.save(); return { ok: true, msg: left ? 'Вы покинули альянс.' : `Вы покинули альянс — в нём никого не осталось, альянс [${cur.tag}] распущен.` };
    }
    if (!emb) return { error: 'Нужен Дипломатический центр.' };
    if (cur) return { error: 'Сначала выйдите из текущего альянса.' };
    tag = String(tag || '').trim().toUpperCase().slice(0, 5);
    if (op === 'create') {
      if (emb < ALLY_CREATE_LVL && !user.admin) return { error: `Создать альянс можно, когда Дипломатический центр ${ALLY_CREATE_LVL} уровня (у вас — ${emb}).` };
      name = String(name || '').trim().slice(0, 24);
      if (name.length < 3 || tag.length < 2) return { error: 'Название от 3 символов, тег 2–5.' };
      if (Object.values(this.db.alliances).some((x) => x.tag === tag)) return { error: 'Такой тег уже занят.' };
      const id = this.db.nextId++;
      this.db.alliances[id] = { id, name, tag, leader: user.id, members: [user.id], created: Date.now() };
      user.alliance = id; user.invites = []; user.allyRead = { mail: id, news: id }; this.store.save(); return { ok: true };
    }
    if (op === 'join') { // по тегу — тоже только заявка: вступает тот, кого одобрит глава (раньше по тегу вступали сразу, без одобрения)
      const al = Object.values(this.db.alliances).find((x) => x.tag === String(tag || '').trim().toUpperCase());
      if (!al) return { error: 'Альянс не найден.' };
      return this.alliance(user, castle, { op: 'request', id: al.id });
    }
    return { error: 'Неизвестное действие.' };
  };

  // переезд: генерал — один на королевство. Раньше он был в каждом замке; у кого их несколько — остаётся один: живой сильнейший
  // (уровень, потом опыт), иначе — идущее воскрешение, иначе — тренировка. Остальные уходят со службы (снаряжение — в Оружейную
  // их замка), воскрешения и тренировки отменяются; цена найма или воскрешения возвращается в Кладовую. Игроку — отчёт.
  P.generalOneFix = function generalOneFix() {
    let n = 0;
    for (const u of Object.values(this.db.users)) {
      const cs = this.castlesOf(u); if (cs.length < 2) continue;
      const alive = cs.filter((c) => c.general && !c.general.dead).sort((a, b) => (b.general.level - a.general.level) || ((b.general.exp || 0) - (a.general.exp || 0)));
      const revs = [], trains = [];
      for (const c of cs) { for (const d of this.deadList(c)) if (d.reviveAt) revs.push([c, d]); if ((c.training || []).some((t) => t.unit === GENERAL_ID)) trains.push(c); }
      if (alive.length + revs.length + trains.length <= 1) continue;
      const refund = { wood: 0, stone: 0, iron: 0, food: 0, units: {} }, lines = [];
      const back = (kindId) => { const ku = UNIT[kindId]; if (!ku) return; const tc = this.genTrainCost(ku); for (const r of RES4) refund[r] += tc.cost[r]; refund.units[ku.id] = (refund.units[ku.id] || 0) + 1; };
      let kept = alive.length ? `генерал «${alive[0].general.name}» (${alive[0].general.level} ур.) в замке «${alive[0].name}»` : '';
      for (const c of alive.slice(1)) {
        const g = c.general; this.heroStrip(c, g);
        for (const a of c.armies || []) if (a.general && g.away === a.id) a.general = false; // армия в пути идёт дальше без генерала
        back(g.kindId); c.general = null; n++;
        lines.push(`Генерал «${g.name}» (${g.level} ур.) из замка «${c.name}» ушёл со службы — его снаряжение в Оружейной.`);
      }
      for (const [c, d] of revs) {
        if (!kept) { kept = `воскрешение генерала «${d.name}» в замке «${c.name}»`; continue; }
        const rc = this.reviveCostOf(d, c); delete d.reviveAt; delete d.reviveStart; n++;
        if (rc.coinsOnly) this.goldChange(u, rc.gold, 'Возврат: воскрешение генерала отменено (генерал один на королевство)');
        else for (const r of RES4) refund[r] += rc.cost[r];
        lines.push(`Воскрешение генерала «${d.name}» в замке «${c.name}» отменено.`);
      }
      for (const c of trains) {
        c.training = c.training.filter((t) => {
          if (t.unit !== GENERAL_ID) return true;
          if (!kept) { kept = `тренировка генерала в замке «${c.name}»`; return true; }
          back(t.kindId); n++; lines.push(`Тренировка генерала в замке «${c.name}» отменена.`); return false;
        });
      }
      if (!lines.length) continue;
      const got = this.stashAdd(u, refund);
      this.report(u.id, 'Генерал — один на всё королевство', [`Остаётся ${kept}. Переводить генерала между замками: Поход → Подкрепление с генералом.`,
        ...lines, ...(got.length ? [`Цена найма возвращена в Кладовую: ${got.join(', ')}.`] : [])], 'general');
    }
    if (n) this.store.save();
    return n;
  };

  // ----- админ: полная прокачка -----
  P.maxOut = function maxOut(castle) {
    this.mil(castle);
    const race = this.raceOf(castle);
    const own = this.ownerOf(castle), castleBuildings = C.BUILDINGS.filter((b) => b.layer === 'castle' && b.id !== 0 && b.id !== 1 && b.id !== B.FENCE && (!b.adminOnly || (own && own.admin))
      && (b.id !== C.RATING.trapId || (own && own.admin))); // здания на проверке (catalog adminOnly) — только админу; Капкан (с 28.10 его строят все) полная прокачка ставит только админу, игроки строят сами
    castle.wall = (C.BY_ID[B.FENCE] || {}).max || 20; // стена — без клетки
    const cells = C.CASTLE_OK.filter((i) => i !== 24); castle.layoutV = 2; castle.storeExtra = 0; castle.storeExtraLv = 0;
    castle.grid[0] = new Int8Array(49).fill(-1); castle.levels[0] = new Int8Array(49);
    castle.grid[0][24] = 0; castle.levels[0][24] = C.BY_ID[0].max;
    let k = 0;
    for (const b of castleBuildings) { const i = cells[k++]; castle.grid[0][i] = b.id; castle.levels[0][i] = b.max; }

    for (let n = 0; n < C.STORE_MAX && k < cells.length; n++) { const i = cells[k++]; castle.grid[0][i] = 1; castle.levels[0][i] = C.BY_ID[1].max; } // 5 Складов; лишние площадки (с 22.10 Таверны нет) свободны
    const LN = C.LANDS_N; castle.grid[1] = new Int8Array(LN * LN).fill(-1); castle.levels[1] = new Int8Array(LN * LN);
    for (let i = 0; i < LN * LN; i++) {
      const opts = helpers.landOptions(i % LN, Math.floor(i / LN));
      if (!opts.length) { castle.grid[1][i] = -1; castle.levels[1][i] = 0; continue; }
      const id = opts.length > 1 ? opts[i % opts.length] : opts[0];
      castle.grid[1][i] = id; castle.levels[1][i] = C.LANDS_MAX;
    }
    castle.queue = [];
    for (const u of unitsForRace(race)) if (u.id !== GENERAL_ID && !u.undead) castle.units[u.id] = Math.max(castle.units[u.id] || 0, u.role === 'merchant' ? 200 : u.race === 'all' && !['giant', 'valkyrie', 'ram', 'catapult', 'eye', 'shadow'].includes(u.role) ? 20 : 1000);
    if (!this.generalHome(castle.owner, castle)) { // генерал один на королевство: если он в другом замке — здесь не появляется
      castle.general = this.newGeneral(castle, 100); // полная прокачка: очки уже распределены
      Object.assign(castle.general.pts, { atk: 20, catk: 90, cdef: 70, heal: 10, career: 8 }); castle.general.free = 0;
    }
    castle.sciences = Object.assign(this.sciOf(castle), { eco: 20, eng: 20, fhi: 20, war: 20 });
    for (const u of this.forgeUnits(castle)) castle.forge[u.id] = { a: 19, d: 19, m: 19, md: 19 }; // Кузница и Школа магии — 20 ур. (уровень показывается с 1)
    castle.religion = castle.religion || 'war';
    if (castle.artifacts.length < 4) for (const type of ['atk', 'def', 'prod', 'speed']) castle.artifacts.push({ id: this.db.nextId++, type, rarity: 2, active: true, found: Date.now() });
    const cap = this.capacity(castle);
    for (const r of C.RES) castle.res[r] = cap[r];
    castle.resAt = Date.now();
    this.store.save();
  };
  // админ и его команды — server/src/admin.js

  // ----- армии в замке: переформирование, переименование, роспуск, генерал, отзыв подкрепления -----
  P.squadOp = function squadOp(castle, { op, from, to, units = {}, id, name, general = false }) { // eslint-disable-line
    this.tick(castle); this.mil(castle);
    const pick = (k) => (k === 'castle' ? { units: castle.units, castle: true } : k === 'reserve' ? { units: castle.reserve, reserve: true } : castle.squads.find((q) => q.id === Number(k)));
    if (op === 'regroup') { // перенести войска из from в to ('castle', 'reserve', id отряда или 'new')
      const src = pick(from); if (!src) return { error: 'Армия не найдена.' };
      let dst = to === 'new' ? null : pick(to);
      if (to !== 'new' && !dst) return { error: 'Армия не найдена.' };
      const move = {};
      for (const [u, n0] of Object.entries(units)) { const n = Math.floor(Number(n0)); if (!(n > 0)) continue; if ((src.units[u] || 0) < n) return { error: `Не хватает: ${UNIT[u] ? UNIT[u].name : u}.` }; move[u] = n; }
      const g = castle.general, genHere = !!(general && g && !g.dead && !g.away && !src.reserve && (src.castle ? !g.squad : g.squad === src.id));
      if (general && !genHere) return { error: dst && dst.reserve ? 'Генерала в резерв не положить.' : 'Генерала нет в этой армии.' };
      if (dst && dst.reserve) { // в резерв: только воины, до 25 000, и не когда замок на грани захвата
        if (castle.loyalty <= RESERVE_LOY) return { error: `Бунт в замке ${Math.round(100 - castle.loyalty)}% — резерв закрыт: войска нужны на защите. Успокойте бунт в Храме.` };
        const bad = Object.keys(move).find((u) => !UNIT[u] || ['merchant'].includes(UNIT[u].role) || UNIT[u].dungOnly);
        if (bad) return { error: `${UNIT[bad] ? UNIT[bad].name : 'Этот юнит'} в резерв не идёт — только воины.` };
        const n = Object.values(move).reduce((a, k) => a + k, 0), have = this.reserveCount(castle);
        if (have + n > RESERVE_MAX) return { error: `В резерве место только для ${Math.max(0, RESERVE_MAX - have)} воинов (всего ${RESERVE_MAX}).` };
      }
      if (!Object.keys(move).length && !genHere) return { error: 'Укажите, сколько войск перевести.' };
      if (!dst) {
        if (castle.squads.length >= 20) return { error: 'Не больше 20 армий в замке.' };
        const sid = this.db.nextId++;
        const nm = String(name || '').replace(/[<>]/g, '').trim().slice(0, 20);
        dst = { id: sid, name: nm || `${castle.id}.${sid}`, units: {} }; castle.squads.push(dst);
      }
      if (dst === src || (dst.reserve && src.reserve)) return { error: 'Выберите другую армию.' };
      for (const [u, n] of Object.entries(move)) { src.units[u] -= n; if (!src.units[u]) delete src.units[u]; dst.units[u] = (dst.units[u] || 0) + n; }
      if (genHere) { if (dst.castle) delete g.squad; else g.squad = dst.id; } // генерал переходит вместе с войсками (или один)
      if (!src.castle && !src.reserve && !Object.keys(src.units).length && !(g && g.squad === src.id)) castle.squads = castle.squads.filter((q) => q !== src); // пустой отряд распускается
      this.store.save(); return { ok: true, id: dst.castle ? 'castle' : dst.id };
    }
    if (op === 'rename') {
      const q = pick(id); if (!q || q.castle || q.reserve) return { error: 'Армия не найдена.' };
      name = String(name || '').trim().slice(0, 20); if (!name) return { error: 'Введите название.' };
      q.name = name; this.store.save(); return { ok: true };
    }
    if (op === 'disband') { // распустить отряд в Замковую армию
      const q = pick(id); if (!q || q.castle || q.reserve) return { error: 'Армия не найдена.' };
      for (const [u, n] of Object.entries(q.units)) castle.units[u] = (castle.units[u] || 0) + n;
      if (castle.general && castle.general.squad === q.id) delete castle.general.squad;
      castle.squads = castle.squads.filter((x) => x !== q); this.store.save(); return { ok: true };
    }
    if (op === 'general') { // генерал переходит в армию id ('castle' — в Замковую)
      const g = castle.general; if (!g || g.dead || g.away) return { error: 'Генерал недоступен.' };
      if (id === 'castle') delete g.squad; else { const q = pick(id); if (!q || q.castle || q.reserve) return { error: 'Армия не найдена.' }; g.squad = q.id; }
      this.store.save(); return { ok: true };
    }
    if (op === 'recall' && castle.armies.some((x) => x.id === Number(id) && (x.state === 'go' || x.state === 'wait'))) { // ошибся с походом: первые 4 минуты армию можно вернуть
      const a = castle.armies.find((x) => x.id === Number(id)), now = Date.now();
      if (a.mission === 'expedition') return { error: 'Экспедицию отозвать нельзя.' };
      if (a.cargo) { for (const r of RES4) castle.res[r] += a.cargo[r] || 0; a.cargo = null; } // торговцы везут груз обратно — сразу на склад
      if (a.state === 'wait') { this.returnHome(castle, a); this.store.save(); return { ok: true }; } // по расписанию ещё не вышла — сразу дома
      if (now - a.depart > RECALL_MS) return { error: 'Отозвать можно только в первые 4 минуты похода.' };
      const k = Math.max(0, Math.min(1, (now - a.depart) / Math.max(1, a.arrive - a.depart)));
      Object.assign(a, { state: 'back', recalled: k, arrive: now, back: now + (now - a.depart) }); // идёт назад столько же, сколько успела пройти
      this.store.save(); return { ok: true };
    }
    if (op === 'recall') { // отозвать подкрепление домой
      const a = castle.armies.find((x) => x.id === Number(id) && x.state === 'stay'); if (!a) return { error: 'Армия не найдена.' };
      this.goBack(castle, a, Date.now()); a.back = Date.now() + (a.sec || 60) * 1000; this.store.save(); return { ok: true };
    }
    // хозяин замка отправляет чужое подкрепление домой: уходит своим ходом, как при отзыве владельцем; владельцу — отчёт
    if (op === 'sendhome') {
      const g = this.guestsOf(castle).find((x) => x.a.id === Number(id)); if (!g) return { error: 'Подкрепление не найдено.' };
      const now = Date.now(), host = this.ownerOf(castle), own = this.ownerOf(g.c), units = { ...g.a.units };
      this.goBack(g.c, g.a, now); if (g.a.state === 'back') g.a.back = now + (g.a.sec || 60) * 1000;
      if (own) this.report(own.id, `Подкрепление возвращается из ${castle.name}`, [`${host ? host.login : 'Хозяин замка'} отправил ваше подкрепление из замка ${castle.name} домой.`, `Войска: ${unitsLine(units)}`], 'reinforce');
      this.store.save(); return { ok: true, msg: `Подкрепление ${own ? `игрока ${own.login} ` : ''}отправлено домой.` };
    }
    return { error: 'Неизвестное действие.' };
  };

  // ----- всё военное/функциональное состояние замка для клиента -----
  P.milState = function milState(castle, user) {
    this.mil(castle);
    const b = this.bonus(castle);
    const al = this.allianceOf(user);
    return {
      trainDay: Number.isFinite(TRAIN_DAY) ? { used: this.trainedToday(castle), max: TRAIN_DAY, next: (castle.trainLog || [])[0] ? castle.trainLog[0].at + 86400000 : 0 } : null,
      units: castle.units, training: castle.training.map((t) => ({ id: t.id, unit: t.unit, building: t.building, count: t.count, done: t.done, each: t.each, start: t.start })),
      general: castle.general && !castle.general.dead && this.generalView(castle),
      deadGenerals: this.deadList(castle).map((g) => ({ name: g.name, kind: g.kind, kindId: g.kindId, level: g.level, reviveAt: g.reviveAt || 0, ...this.reviveCostOf(g, castle), fund: g.fund || null })),
      genElse: castle.general && !castle.general.dead ? null : (() => { const h = this.generalHome(castle.owner, castle); return h ? { id: h.castle.id, castle: h.castle.name, what: h.what, name: h.g ? h.g.name : '', level: h.g ? h.g.level : 0 } : null; })(),
      genTrain: (() => { const t = castle.training.find((x) => x.unit === GENERAL_ID); return t ? { kind: (UNIT[t.kindId] || {}).name || 'Генерал', kindId: t.kindId, end: t.start + t.each } : null; })(),
      genUnits: this.genTrainUnits(castle).map((u) => ({ id: u.id, ...this.genTrainCost(u) })), /* что воин даст генералу, игроку не показывается (по решению владельца) */ armies: castle.armies.map((a) => ({ id: a.id, units: a.units, general: a.general, mission: a.mission, x: a.x, y: a.y, depart: a.depart, arrive: a.arrive, back: a.back, state: a.state, loot: a.loot, cargo: a.cargo, squad: a.squad, portal: a.portal, dung: a.dung || 0, digEnd: a.digEnd || 0, art: !!(a.find || a.art),
        stayName: a.state === 'stay' && this.db.castles[a.stayAt] ? this.db.castles[a.stayAt].name : null })),
      squads: castle.squads, reserve: { units: castle.reserve, max: RESERVE_MAX, closed: castle.loyalty <= RESERVE_LOY }, merchants: this.merchants(castle),
      infirm: this.buildingLevel(castle, B.INFIRMARY) ? { cap: this.infirmCap(castle), used: this.infirmUsed(castle), // Лазарет: раненые и цена лечения
        wounded: Object.entries(castle.wounded || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ id: Number(id), n, cost: this.healCostOf(castle, id, n), one: this.healOneOf(castle, id) })) } : null, // cost — за всех n, ровно столько спишет healWounded; one — цена одного без округления
      guests: this.guestsOf(castle).map((g) => ({ id: g.a.id, from: this.ownerOf(g.c).login, castle: g.c.name, units: g.a.units })),
      incoming: this.incoming(castle), sciences: castle.sciences, sciCapital: this.isCapital(castle), research: castle.research, religion: castle.religion,
      hero: this.heroView(castle), artifacts: (() => { const eff = artEffects(castle.artifacts); return castle.artifacts.map((a) => (a.active && eff.has(a.id) ? { ...a, eff: eff.get(a.id) } : a)); })(), expeds: castle.expeds, expedInfo: this.expedInfo(castle), artCd: castle.artCd || {}, upkeep: Math.round(this.upkeep(castle) * SPEED),
      bonus: { atk: b.atk, def: b.def, magic: b.magic, prod: b.prod, speed: b.speed, train: b.train, build: b.build, wall: b.wall, wallPer: b.wallPer, hidden: b.hidden, marketRate: b.marketRate, artSlots: b.artSlots, artStore: b.artStore, tradeCarry: b.tradeCarry },
      alliance: al ? { id: al.id, name: al.name, tag: al.tag, leader: al.leader, leaderLogin: (this.userById(al.leader) || {}).login, lead: al.leader === user.id, slots: this.allianceSlots(al),
        members: al.members.map((id) => { const m = this.userById(id); return m ? m.login : '?'; }),
        info: al.members.map((id) => { const m = this.userById(id); return m ? { id, login: m.login, rating: this.userRating(m), rep: m.reputation ?? 10 } : null; }).filter(Boolean),
        score: this.allianceScore(al),
        requests: this.allyCan(al, user.id, 'invite') ? (al.requests || []).map((id) => { const m = this.userById(id); return m ? { id, login: m.login, rating: this.userRating(m) } : null; }).filter(Boolean) : [] } : null,
      invites: (user.invites || []).map((id) => this.db.alliances && this.db.alliances[id]).filter(Boolean).map((a) => ({ id: a.id, name: a.name, tag: a.tag,
        members: a.members.length, slots: this.allianceSlots(a), leader: (this.userById(a.leader) || {}).login || '?', score: this.allianceScore(a), by: (user.inviteBy || {})[a.id] || '' })),
      // отправленные приглашения своего альянса (для окна «Приглашения» у того, кто может приглашать)
      invited: al && this.allyCan(al, user.id, 'invite') ? Object.values(this.db.users).filter((u) => (u.invites || []).includes(al.id)).map((u) => ({ id: u.id, login: u.login, rating: this.userRating(u) })) : [],
      forge: castle.forge, forgeCap: null, upJobs: castle.upJobs, forgeUnits: this.forgeUnits(castle).map((u) => u.id), magicUnits: this.magicUnits(castle).map((u) => u.id),
      upNext: Object.fromEntries([...new Set([...this.forgeUnits(castle), ...this.magicUnits(castle)])].map((u) => [u.id, Object.fromEntries(['a', 'd', 'm', 'md'].map((k) => [k, this.forgeCost(u, k, this.forgeLvl(castle, u.id, k) + 2)]))])),
      admin: !!user.admin, royal: this.royalView(user, castle), watch: this.hasWatch(user), watchLevel: this.watchIntel(user), // watchLevel — уровень сведений (Центр разведки), не самой башни
      stash: this.stashCount(user), // значок «Кладовая»: сколько видов наград ждёт
      worldBoss: (() => { const b = this.bossNow(), ro = b && this.rallyOf(user); return b ? { kind: b.kind, name: b.name, x: b.x, y: b.y, end: b.end, hp: b.hp, maxHp: b.maxHp, rally: ro ? ro.r.end : 0 } : null; })(), // кнопка мирового босса
      threats: this.castlesOf(user).flatMap((c) => this.incoming(c)).filter((a) => a.mission === 'attack' || a.mission === 'raid').sort((p, q) => p.arrive - q.arrive), // значок «на вас идёт армия»
      unreadReports: (this.db.reports || []).filter((r) => r.owner === user.id && !r.read).length,
    };
  };

  P.generalView = function generalView(castle) {
    const g = castle.general, gs = this.genStats(g), q = g.squad && castle.squads.find((x) => x.id === g.squad), a = g.away && castle.armies.find((x) => x.id === g.away);
    const where = a ? `в походе (${MISSIONS[a.mission]} ${a.x}:${a.y})` : q ? q.name : 'Замковая армия'; // «Находится в армии» и «Размещение» — отдельными строками, как в оригинале
    // здоровье: у павшего — как идёт воскрешение, у живого — после боёв (genHp), полностью восстановится к hpFull
    const hp = this.genHp(g), health = g.dead ? (g.reviveAt && g.reviveStart ? Math.min(99, Math.floor((Date.now() - g.reviveStart) / (g.reviveAt - g.reviveStart) * 100)) : 0) : Math.floor(hp);
    const hpFull = !g.dead && hp < 100 ? Date.now() + Math.ceil((100 - hp) / (GEN_HP_REGEN * SPEED) * 3600000) : 0;
    // лимиты опыта игроку не отправляются (их нет и в окне): day и foes — служебные
    return { ...g, foes: undefined, day: undefined, stats: gs, need: this.generalNeed(g.level), prevNeed: g.level > 1 ? this.generalNeed(g.level - 1) : 0, where, place: castle.name, health, hpFull, hpRegen: GEN_HP_REGEN,
      reviveCost: Object.fromEntries(RES4.map((r) => [r, Math.round(UNIT[GENERAL_ID].cost[r] * GEN.revive * g.level)])), resetGold: GEN.resetGold, perLevel: GEN.perLevel, rekindSec: REKIND_SEC, rekindGold: REKIND_GOLD,
      healMax: gs.healMax, careerMax: gs.careerMax, cmdMax: gs.cmdMax, atkPt: GEN.atkPt, healPt: GEN.heal, careerPt: GEN.career }; // потолки — от воина генерала
  };

  // цвет строки в списке отчётов: зелёный — успех, красный — неудача, коричневый — прочее
  P.reportTone = function reportTone(r) {
    const d = r.data;
    if (d && d.type === 'battle') return (d.side === 'att' ? d.win : !d.win) ? 'win' : 'lose';
    if (d && d.type === 'scout') return d.ok ? 'win' : 'lose';
    if (d && d.type === 'invite') return 'win'; // приглашение в альянс — зелёное
    if (r.kind === 'market' || r.kind === 'rank') return 'win'; // Биржа Замков: замок продан
    if (r.kind === 'scout' || /напал|захвачен/.test(r.title)) return 'lose';
    return 'info';
  };
  // удалить отчёты: ids — номера или (конверт в списке) 'all' / 'read' / 'new' — все, прочитанные, новые;
  // пересланные в личку копии (fwd) живут при письме — их тут не удалить
  P.reportDelete = function reportDelete(user, ids) {
    const mode = ['all', 'read', 'new'].includes(ids) ? ids : null, set = new Set(mode ? [] : [].concat(ids || []).map(Number));
    const hit = (r) => (mode === 'all' || (mode === 'read' && r.read) || (mode === 'new' && !r.read) || set.has(r.id));
    const before = (this.db.reports || []).length;
    this.db.reports = (this.db.reports || []).filter((r) => !(r.owner === user.id && !r.fwd && hit(r)));
    this.store.save();
    return { n: before - this.db.reports.length };
  };
  // конверт → «Отметить как прочитанные»: все свои отчёты
  P.reportReadAll = function reportReadAll(user) {
    let n = 0;
    for (const r of this.db.reports || []) if (r.owner === user.id && !r.read) { r.read = true; n++; }
    if (n) this.store.save();
    return { n };
  };
  // список «Отчёты» по страницам, как в оригинале: по 10, новые сверху
  P.reportsPage = function reportsPage(userId, page) {
    const all = (this.db.reports || []).filter((r) => r.owner === userId && !r.fwd).reverse(), pages = Math.max(1, Math.ceil(all.length / 10));
    const pg = Math.min(Math.max(0, Math.floor(Number(page)) || 0), pages - 1);
    return { list: all.slice(pg * 10, pg * 10 + 10), page: pg, pages, total: all.length };
  };
  // переслать отчёт другому игроку — как в оригинале, в личные сообщения: письмо «Вам прислали отчёт» с кнопкой-названием.
  // Копия отчёта (fwd) — у получателя; в списке «Отчёты» её нет, открывается из переписки (получателем и отправителем)
  P.reportForward = function reportForward(user, id, login) {
    const r = (this.db.reports || []).find((y) => y.id === Number(id) && this.canSeeReport(user, y));
    if (!r) return { error: 'Отчёт не найден.' };
    const k = String(login || '').trim(), byKey = Object.prototype.hasOwnProperty.call(this.db.users, k) ? this.db.users[k] : null;
    const to = byKey || (k ? Object.values(this.db.users).find((x) => x.login.toLowerCase() === k.toLowerCase()) : null);
    if (!to || to.bot) return { error: 'Игрок не найден.' };
    if (to.id === user.id) return { error: 'Нельзя переслать самому себе.' };
    const deny = this.canReach ? this.canReach(user, to, 'msg') : null; if (deny) return { error: deny }; // чёрный список — как для писем
    const lim = this.tooOften(user, 'repfwd'); if (lim) return { error: lim }; // не чаще раза в 3 с и 50 в сутки
    const copy = { ...JSON.parse(JSON.stringify(r)), id: this.db.nextId++, owner: to.id, at: Date.now(), read: true, from: user.login, fromId: user.id, fwd: true };
    this.db.reports.push(copy);
    if (this.db.reports.length > 2000) this.db.reports.splice(0, this.db.reports.length - 2000); // как у обычных отчётов: пересылкой база больше не растёт без конца
    const sent = this.sendMail(user, to.login, 'Отчёт', `📜 Отчёт: ${r.title}`); // текст — для списка диалогов и Telegram
    if (sent.error) { this.db.reports = this.db.reports.filter((x) => x !== copy); return sent; }
    sent.message.rep = copy.id; sent.message.repTitle = r.title;
    this.store.save();
    return { msg: `Отчёт переслан игроку ${to.login} — он придёт ему в личные сообщения.`, to };
  };
  P.reportsOf = function reportsOf(userId) { return (this.db.reports || []).filter((r) => r.owner === userId && !r.fwd).slice(-50).reverse(); };

  void buildTime;
}

const catalogJson = () => ({
  units: UNITS, generalId: GENERAL_ID, sciences: SCIENCES, religions: RELIGIONS, artifacts: ART_TYPES, rarity: RARITY, artBreak: ART_BREAK,
  npc: NPC, missions: MISSIONS, settleN: SETTLE_N, settleTake: SETTLE_TAKE, settleDays: Math.round(SETTLE_SEC / 86400 * 10) / 10, raceDir: RACE_DIR, spyOpen: SPY_OPEN, scienceCost: Array.from({ length: 21 }, (_, l) => (l ? scienceCost(l) : null)),
  scienceTime: Array.from({ length: 21 }, (_, l) => (l ? scienceTime(l) : 0)),
  hero: require('./hero').heroCatalog(),
});

module.exports = { ART_BASIC, ART_CD, DGUARD_ID, MERCHANT_ID, SPRAVKA, CAMP_FAST, MARCH, RIOT_STEP, RIOT_CAPTURED, uniqueFor, EXPED, ART_HOURS, NEWBIE_RATING, install, UNITS, UNIT, B, GENERAL_ID, GEN, SCIENCES, RELIGIONS, NPC, MISSIONS, unitsForRace, unitImg, catalogJson, ART_TYPES, RARITY, ART_BREAK, EXPED_PER, EXPED_CAP, RUINS };
