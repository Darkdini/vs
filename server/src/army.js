'use strict';
// Военная часть и функции зданий: юниты, тренировка, генерал, армии и бой, торговля, альянсы, науки, религия,
// экспедиции и артефакты. Подключается к Game (game.js) как набор методов — см. install() внизу.
//
// Юниты — оригинальные из клиента «Третий Мир» (имена texts/strings.txt, картинки units/*), по 7 на расу
// + общие специальные и уникальные. Характеристики и цены берутся по роли из data/units.json (наш баланс, GDD §6),
// формулы боя — GDD §9 (docs/02-game-design.md).

const fs = require('fs');
const path = require('path');
const C = require('./catalog');

const SPEED = Number(process.env.SPEED || 1);
const GDD = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'units.json'), 'utf8'));
const RES4 = ['wood', 'stone', 'iron', 'food'];
const RACE_DIR = { humans: 'human', elves: 'elf', dwarves: 'dwarv', orcs: 'dwarv' }; // у орков своих спрайтов в клиенте нет — гномьи с зелёным оттенком (клиент)

// ---------- здания с функциями (id из клиента) ----------
const B = {
  TOWNHALL: 0, STORE: 1, HQ: 2, BARRACKS: 3, MARKET: 4, SMITH: 11, STABLE: 12, EMBASSY: 13, SAGES: 14, UNIVERSITY: 15,
  ARCH_CAMP: 16, EXPEDITION: 17, ART_TOWER: 18, TRADE_HALL: 19, MAGE_ACADEMY: 20, WATCHTOWER: 21, FENCE: 22, WORKSHOP: 23,
  TRAVELER: 24, TEMPLE: 25, CACHE: 26, PORTAL: 38, MAGIC_SCHOOL: 39, MASON: 40, BREWERY: 41, TAVERN: 42, ALCHEMY: 43,
  TREASURY: 44, SPY: 45,
};

// ---------- каталог юнитов ----------
// [id, имя, раса ('all' — любая), картинка units/<...>.png, роль из GDD, здание, уровень здания, доп. требования]
const UNIT_LIST = [
  [200, 'Мечник', 'humans', 'human/swordman', 'atk_inf', B.BARRACKS, 1],
  [201, 'Копейщик', 'humans', 'human/javelineer', 'def_inf', B.BARRACKS, 1],
  [202, 'Разведчик', 'humans', 'human/scout', 'scout', B.SPY, 1],
  [203, 'Чародей', 'humans', 'human/mage', 'mage', B.MAGE_ACADEMY, 1],
  [204, 'Рыцарь', 'humans', 'human/knight', 'elite_inf', B.BARRACKS, 10, { [B.SMITH]: 5 }],
  [205, 'Паладин', 'humans', 'human/paladin', 'heavy_cav', B.STABLE, 10, { [B.SMITH]: 10 }],
  [206, 'Джин', 'humans', 'human/jin', 'legendary', B.PORTAL, 1],
  [207, 'Эльф лучник', 'elves', 'elf/archer', 'ranged', B.BARRACKS, 1],
  [208, 'Танцующий', 'elves', 'elf/fighter', 'atk_inf', B.BARRACKS, 1],
  [209, 'Скаут', 'elves', 'elf/scout', 'scout', B.SPY, 1],
  [210, 'Созидающая', 'elves', 'elf/create', 'mage', B.MAGE_ACADEMY, 1],
  [211, 'Кентавр', 'elves', 'elf/kenaur', 'light_cav', B.STABLE, 3],
  [212, 'Единорог', 'elves', 'elf/edinorog', 'heavy_cav', B.STABLE, 10, { [B.SMITH]: 10 }],
  [213, 'Энт', 'elves', 'elf/ent', 'legendary', B.PORTAL, 1],
  // гномы — как в оригинале (скрины окна «Юнит»): имена, требования, характеристики — в ORIG ниже
  [214, 'Гном топорщик', 'dwarves', 'dwarv/hd/fighter', 'atk_inf', B.BARRACKS, 1],
  [215, 'Арбалетчик', 'dwarves', 'dwarv/hd/arbalet', 'ranged', B.BARRACKS, 3, { [B.SMITH]: 1 }],
  [255, 'Горный великан', 'dwarves', 'dwarv/hd/giant', 'def_inf', B.BARRACKS, 1, { [B.SMITH]: 3 }],
  [216, 'Жрец Рун', 'dwarves', 'dwarv/hd/elder', 'mage', B.MAGE_ACADEMY, 1, { [B.BARRACKS]: 5 }],
  [217, 'Грифон разведчик', 'dwarves', 'dwarv/hd/gryphon', 'scout', B.STABLE, 1, { [B.WORKSHOP]: 1, [B.SMITH]: 3, [B.SPY]: 1 }],
  [218, 'Защитник гор', 'dwarves', 'dwarv/hd/defender', 'heavy_cav', B.STABLE, 5, { [B.BARRACKS]: 7, [B.WORKSHOP]: 3, [B.SMITH]: 7 }],
  [256, 'Механический центурион', 'dwarves', 'dwarv/hd/centurion', 'elite_inf', B.MAGE_ACADEMY, 7, { [B.SMITH]: 5 }],
  [219, 'Револьверщик', 'dwarves', 'dwarv/hd/revolver', 'elite_inf', B.BARRACKS, 10, { [B.WORKSHOP]: 10, [B.SMITH]: 8 }],
  [220, 'Йетти', 'dwarves', 'dwarv/hd/yeti', 'legendary', B.MAGE_ACADEMY, 10, { [B.WORKSHOP]: 10 }],
  // орки: имена и характеристики — из оригинала (скрины окна тренировки, таблица ORIG ниже)
  [245, 'Мародёр', 'orcs', 'human/swordman', 'atk_inf', B.BARRACKS, 1],
  [247, 'Бугай', 'orcs', 'dwarv/fighter', 'def_inf', B.BARRACKS, 1],
  [246, 'Урук-хай', 'orcs', 'dwarv/defender', 'def_inf', B.BARRACKS, 3],
  [250, 'Тиран', 'orcs', 'human/javelineer', 'elite_inf', B.BARRACKS, 10, { [B.SMITH]: 5 }],
  [253, 'Осквернитель', 'orcs', 'human/mage', 'mage', B.MAGE_ACADEMY, 1],
  [254, 'Чернокнижник', 'orcs', 'elf/create', 'mage', B.MAGE_ACADEMY, 3],
  [248, 'Шаман', 'orcs', 'dwarv/elder', 'mage', B.MAGE_ACADEMY, 10, { [B.SMITH]: 5 }],
  [249, 'Кулак Ярости', 'orcs', 'human/knight', 'heavy_cav', B.STABLE, 10, { [B.SMITH]: 10 }],
  [251, 'Изувер', 'orcs', 'dwarv/yeti', 'legendary', B.PORTAL, 1],
  [252, 'Орк загонщик', 'orcs', 'human/scout', 'scout', B.SPY, 1],
  // специальные — у каждой расы своя картинка (units/<раса>/torg.png и т.д.)
  [221, 'Торговец', 'all', 'torg', 'merchant', B.MARKET, 1],
  [224, 'Путешественник', 'all', 'traveler', 'settler', B.TRAVELER, 5],
  [227, 'Ученый', 'all', 'wisdom', 'sage', B.SAGES, 1],
  [230, 'Археолог', 'all', 'arheolog', 'archaeologist', B.ARCH_CAMP, 1],
  [233, 'Бунтарь', 'all', 'buntar', 'rebel', B.TRAVELER, 10],
  [236, 'Генерал', 'all', 'general', 'general', B.HQ, 1],
  // уникальные (units/unical)
  [239, 'Великан', 'all', 'unical/giant', 'giant', B.TAVERN, 1],
  [240, 'Катапульта', 'all', 'unical/katapulta', 'catapult', B.WORKSHOP, 5],
  [241, 'Око', 'all', 'unical/oko', 'eye', B.SPY, 1],
  [242, 'Тень', 'all', 'unical/shadow', 'shadow', B.SPY, 5],
  [243, 'Таран', 'all', 'unical/taran', 'ram', B.WORKSHOP, 10, { [B.SMITH]: 10 }],
  [244, 'Валькирия', 'all', 'unical/valkiriya', 'valkyrie', B.TAVERN, 5],
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
// цена дерево/камень/железо/еда, людей, время (сек)
const ORIG = {
  245: { type: 'infantry', hp: 40, atk: 21, mag: 0, def: 16, mdef: 0, speed: 11, carry: 101, cost: [42, 40, 45, 90], pop: 3, time: 266 }, // Мародёр 4:26
  247: { type: 'infantry', hp: 50, atk: 21, mag: 0, def: 16, mdef: 0, speed: 6, carry: 31, cost: [37, 40, 42, 82], pop: 6, time: 362 }, // Бугай 6:02
  246: { type: 'infantry', hp: 60, atk: 18, mag: 0, def: 26, mdef: 8, speed: 6, carry: 40, cost: [45, 48, 50, 90], pop: 8, time: 420 }, // Урук-хай (скрина нет — между Бугаем и Тираном)
  250: { type: 'infantry', hp: 80, atk: 40, mag: 22, def: 50, mdef: 31, speed: 9, carry: 90, cost: [55, 52, 57, 110], pop: 26, time: 688 }, // Тиран 11:28
  253: { type: 'magic', hp: 25, atk: 0, mag: 11, def: 0, mdef: 26, speed: 7, carry: 60, cost: [42, 42, 45, 85], pop: 4, time: 288 }, // Осквернитель 4:48
  254: { type: 'magic', hp: 55, atk: 0, mag: 22, def: 0, mdef: 32, speed: 6, carry: 60, cost: [62, 40, 35, 107], pop: 12, time: 499 }, // 8:19
  248: { type: 'magic', hp: 120, atk: 40, mag: 60, def: 35, mdef: 60, speed: 9, carry: 70, cost: [82, 85, 87, 107], pop: 25, time: 810 }, // Шаман 13:30
  249: { type: 'infantry', hp: 140, atk: 27, mag: 13, def: 27, mdef: 13, speed: 4, carry: 70, cost: [340, 337, 332, 440], pop: 45, time: 1087 }, // Кулак Ярости 18:07
  252: { type: 'cavalry', hp: 25, atk: 25, mag: 0, def: 20, mdef: 0, speed: 14, carry: 0, cost: [40, 37, 42, 85], pop: 7, time: 440 }, // Орк загонщик 7:20
  // гномы (скрины окна «Юнит» оригинала)
  214: { type: 'infantry', hp: 20, atk: 20, mag: 0, def: 5, mdef: 0, speed: 11, carry: 55, cost: [55, 100, 70, 50], pop: 3, time: 1160 }, // Гном топорщик 19:20
  215: { type: 'infantry', hp: 25, atk: 15, mag: 0, def: 15, mdef: 0, speed: 7, carry: 47, cost: [70, 115, 85, 60], pop: 12, time: 1460 }, // Арбалетчик 24:20
  255: { type: 'infantry', hp: 30, atk: 5, mag: 0, def: 25, mdef: 0, speed: 7, carry: 70, cost: [77, 90, 85, 60], pop: 7, time: 1260 }, // Горный великан 21:00
  216: { type: 'magic', hp: 25, atk: 0, mag: 30, def: 0, mdef: 30, speed: 9, carry: 62, cost: [90, 145, 105, 50], pop: 15, time: 1620 }, // Жрец Рун 27:00
  217: { type: 'cavalry', hp: 25, atk: 20, mag: 0, def: 5, mdef: 0, speed: 13, carry: 0, cost: [55, 105, 70, 70], pop: 21, time: 2180 }, // Грифон разведчик 36:20
  218: { type: 'cavalry', hp: 60, atk: 56, mag: 5, def: 25, mdef: 0, speed: 8, carry: 86, cost: [100, 175, 95, 80], pop: 33, time: 2800 }, // Защитник гор 46:40
  256: { type: 'infantry', hp: 70, atk: 30, mag: 0, def: 45, mdef: 25, speed: 9, carry: 80, cost: [125, 185, 130, 85], pop: 53, time: 3000 }, // Механический центурион 50:00
  219: { type: 'infantry', hp: 80, atk: 40, mag: 20, def: 45, mdef: 5, speed: 9, carry: 78, cost: [165, 205, 175, 85], pop: 51, time: 3330 }, // Револьверщик 55:30
  220: { type: 'infantry', hp: 100, atk: 25, mag: 5, def: 20, mdef: 5, speed: 2, carry: 55, cost: [655, 750, 665, 620], pop: 89, time: 4640, bldDmg: 27 }, // Йетти 1:17:20
  // общие юниты (те же скрины): у Археолога и Ученого в оригинале скорость 0 — оставлена прежняя, иначе они не дойдут до цели
  224: { type: 'special', hp: 10, atk: 1, mag: 1, def: 1, mdef: 1, speed: 10, carry: 0, cost: [5000, 7500, 5000, 5000], pop: 3000, time: 136800 }, // Путешественник 38:00:00
  233: { type: 'special', hp: 10, atk: 2, mag: 2, def: 1, mdef: 1, speed: 9, carry: 0, cost: [12012, 13316, 10412, 24031], pop: 3026, time: 486000 }, // Бунтарь 135:00:00
  230: { type: 'special', hp: 0, atk: 0, mag: 0, def: 0, mdef: 0, keepSpeed: true, carry: 0, cost: [123, 141, 125, 250], pop: 12, time: 960 }, // Археолог 16:00
  227: { type: 'special', hp: 0, atk: 0, mag: 0, def: 0, mdef: 0, keepSpeed: true, carry: 0, cost: [36, 41, 29, 40], pop: 2, time: 1700 }, // Ученый 28:20
  243: { type: 'siege', hp: 60, atk: 0, mag: 0, def: 0, mdef: 0, speed: 7, carry: 0, cost: [97, 97, 96, 105], pop: 14, time: 1620, wallDmg: 50, oneUse: true }, // Таран 27:00
};
// остальные юниты (люди, эльфы, гномы, общие) переводятся из нашей GDD-таблицы в масштаб оригинала:
// атака/защита ×0.42 (Мечник 50 → 21, как Мародёр), цена ×0.5, время ×0.45
const SCALE = { stat: 0.42, cost: 0.5, time: 0.45 };
// население: базовые воины ×4, элита/маги/легендарные ×8 (как у орков оригинала: 3–8 и 25–45)
const POP_K = (role) => (['elite_inf', 'heavy_cav', 'legendary', 'mage', 'valkyrie', 'giant', 'shadow'].includes(role) ? 8 : 4);
// лимит тренировки: не больше TRAIN_DAY воинов на замок за последние 24 часа (Генерал не считается)
const TRAIN_DAY = Number(process.env.TRAIN_DAY || 400);
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
// Торговцы — как в оригинале: не тренируются и не воюют, их всегда 20 при построенном Рынке; скорость 20 полей/час,
// груз — 45 ед. за уровень Рынка (20 ур. — 900 ед.)
const MERCHANT_ID = 221, MERCHANTS = 20;
Object.assign(UNIT[MERCHANT_ID], { speed: 20, notrain: true, carry: 45 });
const GENERAL_ID = 236;
const unitsForRace = (race) => UNITS.filter((u) => u.race === race || u.race === 'all');
// генерал как в оригинале: за уровень — очки опыта, игрок распределяет их в окне «Генерал».
// Личная атака/защита — +1 за очко; командование атакой/защитой — +0,3% к армии; восстановление — быстрее воскрешение; карьера — больше опыта.
const GEN = { battleCap: 0.15, dayLevels: 1, perLevel: 2, maxLevel: 500, revive: 0.5, cmd: 0.003, heal: 0.02, career: 0.005, resetGold: 100 };
const GEN_STATS = ['atk', 'def', 'catk', 'cdef', 'heal', 'career'];
// звание генерала в скобках — сильнейший боевой юнит расы (у орков «Бугай» и т. п.)
const genKind = (race) => { const l = UNITS.filter((u) => u.race === race && ['infantry', 'cavalry'].includes(u.type)).sort((a, b) => b.attack - a.attack); return l[0] ? l[0].name : 'Генерал'; };
const unitImg = (u, race) => `units/${u.race === 'all' && !u.img.includes('/') ? `${RACE_DIR[race]}/${u.img}` : u.img}.png`;

// ---------- науки (Университет; иконки smallicon/*science.png) ----------
// у каждой науки: процент за уровень + вехи на 5/10/15/20 ур. с отдельным бонусом (они видны в «Информации о науке»)
const SCIENCES = {
  eco: { name: 'Экономика', icon: 'Ekoscience', flask: 'yellow', sub: 'Добыча ресурсов и торговля.', desc: '+3% добычи всех ресурсов за уровень', per: 0.03,
    about: 'Развитие земледелия, лесозаготовки, каменных работ и рудников. Каждый уровень увеличивает добычу всех ресурсов, а на 5, 10, 15 и 20 уровнях открываются хозяйственные улучшения.',
    eff: (l) => `Добыча ресурсов +${3 * l}%.`,
    miles: { 5: [{ tradeCarry: 0.1 }, 'Торговцы везут на 10% больше.'], 10: [{ hidden: 0.25 }, 'Тайник прячет на 25% больше.'], 15: [{ tradeCarry: 0.1 }, 'Торговцы везут ещё +10%.'], 20: [{ prod: 0.05 }, 'Мастерство хозяйства: добыча ещё +5%.'] } },
  eng: { name: 'Инженерия', icon: 'Engscience', flask: 'green', sub: 'Строительство и укрепления замка.', desc: '−3% времени строительства за уровень', per: 0.03,
    about: 'Наука о строительстве, чертежах и укреплениях. Каждый уровень сокращает время строительства, а на 5, 10, 15 и 20 уровнях укрепляет забор и ускоряет стройку.',
    eff: (l) => `Время строительства −${3 * l}%.`,
    miles: { 5: [{ wall: 0.1 }, 'Забор защищает на 10% сильнее.'], 10: [{ build: 0.05 }, 'Улучшенные чертежи: стройка ещё −5%.'], 15: [{ wall: 0.1 }, 'Забор защищает ещё +10%.'], 20: [{ build: 0.05 }, 'Мастерство архитекторов: стройка ещё −5%.'] } },
  fhi: { name: 'Физика', icon: 'Fhiscience', flask: 'blue', sub: 'Скорость армий и торговцев.', desc: '+4% скорости армий и торговцев за уровень', per: 0.04,
    about: 'Изучение механики, дорог и повозок. Каждый уровень ускоряет армии и торговцев в пути, а на 5, 10, 15 и 20 уровнях открываются дополнительные ускорения.',
    eff: (l) => `Скорость армий и торговцев +${4 * l}%.`,
    miles: { 5: [{ tradeSpeed: 0.1 }, 'Торговцы быстрее ещё на 10%.'], 10: [{ speed: 0.05 }, 'Лёгкие повозки: армии быстрее ещё на 5%.'], 15: [{ tradeSpeed: 0.1 }, 'Торговцы быстрее ещё на 10%.'], 20: [{ speed: 0.05 }, 'Мастерство дорог: армии быстрее ещё на 5%.'] } },
  war: { name: 'Военное дело', icon: 'Warscience', flask: 'red', sub: 'Армии, походы и подготовка войск.', desc: '+2% атаки и защиты войск за уровень', per: 0.02,
    about: 'Развитие вооружения и военной подготовки. Каждый уровень усиливает атаку и защиту всех войск замка, а на 5, 10, 15 и 20 уровнях открываются военные улучшения.',
    eff: (l) => `Атака и защита войск +${2 * l}%.`,
    miles: { 5: [{ atk: 0.03 }, 'Закалённые клинки: атака ещё +3%.'], 10: [{ def: 0.03 }, 'Прочные доспехи: защита ещё +3%.'], 15: [{ train: 0.05 }, 'Строевая подготовка: тренировка войск −5% времени.'], 20: [{ atk: 0.05, def: 0.05 }, 'Мастерство полководцев: атака и защита ещё +5%.'] } },
};
for (const s of Object.values(SCIENCES)) s.levels = Array.from({ length: 20 }, (_, i) => ({ l: i + 1, text: s.eff(i + 1), mile: s.miles[i + 1] ? s.miles[i + 1][1] : '' }));
// суммарные бонусы вех изученных наук
function scienceMiles(sci) {
  const m = { atk: 0, def: 0, prod: 0, speed: 0, build: 0, train: 0, wall: 0, hidden: 0, tradeCarry: 0, tradeSpeed: 0 };
  for (const [k, s] of Object.entries(SCIENCES)) for (const [l, [fx]] of Object.entries(s.miles)) if ((sci[k] || 0) >= Number(l)) for (const [f, v] of Object.entries(fx)) m[f] += v;
  return m;
}
const scienceCost = (lvl) => { const k = Math.round(400 * 1.45 ** lvl / 10) * 10; return { wood: k, stone: k, iron: k, food: k }; };
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
};
const RARITY = [{ name: 'обычный', bonus: 0.10 }, { name: 'редкий', bonus: 0.20 }, { name: 'легендарный', bonus: 0.35 }];

// ---------- NPC-объекты мира: охрана и добыча ----------
// img — тайл клиента; def — сила охраны против пехоты/кавалерии/магии; loot — запас ресурсов (восстанавливается)
const NPC = {
  // охрана — в том же масштабе, что и юниты (×0.42 от прежних значений)
  25: { name: 'Дикари', def: { inf: 250, cav: 210, mag: 105 }, loot: { wood: 600, stone: 600, iron: 400, food: 900 } },
  26: { name: 'Лесорубы', def: { inf: 150, cav: 170, mag: 65 }, loot: { wood: 2500, stone: 200, iron: 100, food: 400 } },
  27: { name: 'Рудник троллей', def: { inf: 1050, cav: 925, mag: 380 }, loot: { wood: 300, stone: 2500, iron: 4000, food: 500 } },
  // лагеря разбойников — боты трёх уровней сложности; добыча скромная (не заменяет свою экономику)
  30: { name: 'Лагерь разбойников (лёгкий)', level: 'Лёгкий', def: { inf: 90, cav: 80, mag: 40 }, loot: { wood: 250, stone: 250, iron: 150, food: 300 } },
  31: { name: 'Лагерь разбойников (средний)', level: 'Средний', def: { inf: 450, cav: 400, mag: 180 }, loot: { wood: 500, stone: 500, iron: 350, food: 600 } },
  32: { name: 'Лагерь разбойников (тяжёлый)', level: 'Тяжёлый', def: { inf: 1500, cav: 1350, mag: 600 }, loot: { wood: 900, stone: 900, iron: 700, food: 1000 } },
  24: { name: 'Заброшенный замок', def: { inf: 2520, cav: 2310, mag: 1050 }, loot: { wood: 4000, stone: 4000, iron: 4000, food: 4000 }, ruins: true },
};
const NPC_REGEN_SEC = 3600;
const NEWBIE_RATING = Number(process.env.NEWBIE_RATING || 100); // защита новичка: на слабых игроков нападать нельзя

// Центр разведки: какой уровень здания открывает пункт и какая доля разведчиков должна выжить
const SPY_OPEN = {
  armies: { name: 'Армий в замке', level: 1, survive: 0, cond: 'выжил хотя-бы 1 разведчик' },
  res: { name: 'Ресурсов', level: 4, survive: 0.5, cond: 'выжило больше 50% разведчиков' },
  build: { name: 'Зданий', level: 8, survive: 0.7, cond: 'выжило больше 70% разведчиков' },
  riot: { name: 'Бунта', level: 12, survive: 0.85, cond: 'выжило больше 85% разведчиков' },
  reinf: { name: 'Подкреплений', level: 16, survive: 0.9, cond: 'выжило больше 90% разведчиков' },
};
const MISSIONS = { raid: 'Набег', attack: 'Нападение', reinforce: 'Подкрепление', scout: 'Разведка', expedition: 'Экспедиция', trade: 'Торговля' };

function install(Game, helpers) {
  const P = Game.prototype;
  const { buildTime } = helpers;

  // ----- состояние замка (добавляется лениво, старые базы подхватываются) -----
  P.mil = function mil(castle) {
    if (!castle.units) castle.units = {};
    if (!castle.training) castle.training = [];
    if (!castle.armies) castle.armies = [];
    if (!castle.sciences) castle.sciences = { eco: 0, eng: 0, fhi: 0, war: 0 };
    if (!castle.artifacts) castle.artifacts = [];
    if (castle.general === undefined) castle.general = null;
    if (castle.general) this.normGeneral(castle.general, castle);
    if (castle.research === undefined) castle.research = null;
    if (castle.religion === undefined) castle.religion = null;
    if (!castle.forge) castle.forge = {}; // Кузница: { unitId: { a: ур. атаки, d: ур. защиты } }
    if (castle.forgeJob === undefined) castle.forgeJob = null;
    if (castle.magicJob === undefined) castle.magicJob = null;
    if (!castle.squads) castle.squads = []; // отряды в замке («Армия: …»); castle.units — «Замковая армия»
    if (castle.loyalty === undefined) { castle.loyalty = 100; castle.loyAt = Date.now(); }
    // старые замки: стартовый Огород стоял на траве (7:7) — переносим на землю (3:5), как в оригинале
    if (!castle.farmFix) { castle.farmFix = 1; const g = castle.grid[1], lv = castle.levels[1], a = 7 * 15 + 7, b = 5 * 15 + 3;
      if (g[a] === 5 && g[b] < 0 && !(castle.queue || []).some((q) => q.view === 1 && (q.cell === a || q.cell === b))) { g[b] = 5; lv[b] = lv[a]; g[a] = -1; lv[a] = 0; } }
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
    return { total, away, free: Math.max(0, total - away), reserved: 0, carry: UNIT[MERCHANT_ID].carry * lvl, speed: UNIT[MERCHANT_ID].speed, level: lvl }; // как в оригинале: 20 ур. — 900 ед., 20 полей/час
  };
  // «Передать»: торговцы везут ресурсы в замок; сколько торговцев — по грузу
  P.sendTrade = function sendTrade(castle, { x, y, res }) {
    this.tick(castle);
    const m = this.merchants(castle);
    if (!m.level) return { error: `В замке «${castle.name}» нет Рынка — ресурсы возят торговцы с Рынка. Постройте его или отправьте из замка, где Рынок есть.` };
    x = Math.round(Number(x)); y = Math.round(Number(y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Укажите координаты замка.' };
    if (x === castle.x && y === castle.y) return { error: 'Это этот же замок.' };
    const target = this.castleAt(x, y); if (!target) return { error: 'Торговцы везут ресурсы только в замок.' };
    const cargo = {}; let total = 0;
    for (const r of RES4) { const v = Math.max(0, Math.floor(Number((res || {})[r]) || 0)); if (castle.res[r] < v) return { error: 'Недостаточно ресурсов.' }; cargo[r] = v; total += v; }
    if (!total) return { error: 'Укажите, сколько везти.' };
    const need = Math.ceil(total / m.carry);
    if (need > m.free) return { error: `Нужно торговцев: ${need}, свободных: ${m.free} (каждый везёт ${m.carry}).` };
    for (const r of RES4) castle.res[r] -= cargo[r];
    const units = { [MERCHANT_ID]: need }, sec = Math.max(5, Math.round(Math.hypot(x - castle.x, y - castle.y) / m.speed * 3600 / SPEED)), now = Date.now();
    const army = { id: this.db.nextId++, units, general: false, mission: 'trade', x, y, depart: now, arrive: now + sec * 1000, sec, state: 'go', loot: null, cargo, squad: null, portal: false };
    castle.armies.push(army); this.store.save();
    return { army, sec, need };
  };
  P.ownerOf = function ownerOf(castle) { return this.userById(castle.owner); };
  P.raceOf = function raceOf(castle) { const u = this.ownerOf(castle); return u ? u.race : 'humans'; };
  P.event = function event(userId, msg) { (this.events = this.events || []).push({ userId, msg }); };
  P.drainEvents = function drainEvents() { const e = this.events || []; this.events = []; return e; };

  // ----- бонусы от зданий, наук, религии, артефактов -----
  P.bonus = function bonus(castle) {
    this.mil(castle);
    const L = (id) => this.buildingLevel(castle, id);
    const sci = castle.sciences, templeL = L(B.TEMPLE), rel = castle.religion;
    const art = { atk: 0, def: 0, prod: 0, speed: 0, train: 0 };
    for (const a of castle.artifacts) if (a.active) art[a.type] += RARITY[a.rarity].bonus;
    const gen = castle.general && !castle.general.dead && !castle.general.away && castle.general.pts ? castle.general.pts.cdef : 0;
    const race = this.raceOf(castle);
    const wallPer = { humans: 0.03, elves: 0.035, dwarves: 0.02, orcs: 0.025 }[race] || 0.03;
    const ms = scienceMiles(sci);
    return {
      atk: (1 + SCIENCES.war.per * sci.war) * (1 + 0.01 * L(B.BREWERY)) * (1 + (rel === 'war' ? 0.01 * templeL : 0)) * (1 + art.atk) * (1 + ms.atk),
      def: (1 + SCIENCES.war.per * sci.war) * (1 + (rel === 'light' ? 0.01 * templeL : 0)) * (1 + art.def) * (1 + GEN.cmd * gen) * (1 + ms.def),
      magic: 1 + 0.02 * L(B.MAGIC_SCHOOL),
      prod: (1 + SCIENCES.eco.per * sci.eco) * (1 + (rel === 'nature' ? 0.01 * templeL : 0)) * (1 + art.prod) * (1 + ms.prod),
      speed: (1 + SCIENCES.fhi.per * sci.fhi) * (1 + art.speed) * (1 + ms.speed),
      train: (1 - 0.02 * L(B.ALCHEMY)) * (1 - art.train) * (1 - ms.train),
      build: (1 - SCIENCES.eng.per * sci.eng) * (1 - ms.build),
      wall: L(B.FENCE), wallPer: wallPer * (1 + ms.wall),
      hidden: L(B.CACHE) ? Math.round(200 * 1.3 ** (L(B.CACHE) - 1) * (race === 'dwarves' ? 2 : 1) * (1 + ms.hidden)) : 0,
      watch: L(B.WATCHTOWER), spyCenter: L(B.SPY), mason: L(B.MASON),
      tradeCarry: 1 + 0.1 * L(B.TRADE_HALL) + ms.tradeCarry, tradeSpeed: 1 + 0.1 * L(B.TRADE_HALL) + ms.tradeSpeed,
      marketRate: L(B.MARKET) ? Math.min(1, 0.7 + 0.015 * L(B.MARKET)) : 0,
      artSlots: L(B.ART_TOWER) ? 1 + Math.floor(L(B.ART_TOWER) / 3) : 0,
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
    for (const a of castle.armies) add(a.units);
    if (castle.general && !castle.general.dead) s += UNIT[GENERAL_ID].upkeep;
    return s;
  };

  // ----- тренировка -----
  P.trainTime = function trainTime(castle, unit) {
    const bl = Math.max(1, this.buildingLevel(castle, unit.building));
    void bl; // уровень здания открывает юнитов, но не ускоряет тренировку (как в оригинале: Орк загонщик — 14:40 и на 20 ур.)
    return Math.max(1, Math.round(unit.time * this.bonus(castle).train / SPEED));
  };
  P.unitLock = function unitLock(castle, unit) {
    const race = this.raceOf(castle);
    if (unit.race !== 'all' && unit.race !== race) return 'Юнит другой расы.';
    if (this.buildingLevel(castle, unit.building) < unit.level) return `Нужно: ${C.BY_ID[unit.building].name} ${unit.level} ур.`;
    for (const [id, l] of Object.entries(unit.req)) if (this.buildingLevel(castle, Number(id)) < l) return `Нужно: ${C.BY_ID[id].name} ${l} ур.`;
    return null;
  };
  P.trainedToday = function trainedToday(castle, now = Date.now()) {
    castle.trainLog = (castle.trainLog || []).filter((x) => x.at > now - 86400000);
    return castle.trainLog.reduce((s, x) => s + x.n, 0);
  };
  P.train = function train(castle, unitId, count) {
    this.tick(castle);
    const unit = UNIT[unitId]; count = Math.floor(Number(count));
    if (!unit) return { error: 'Неизвестный юнит.' };
    if (unit.notrain) return { error: 'Торговцы не тренируются — их 20 на Рынке.' };
    if (!(count > 0)) return { error: 'Укажите количество.' };
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
    this.store.save();
    return { job };
  };
  P.tickTraining = function tickTraining(castle, now) {
    this.mil(castle);
    // лояльность восстанавливается: (2 + ур. Храма) в час × скорость мира, до 100
    if (castle.loyalty < 100 && !this.rulerAway(this.ownerOf(castle), now)) castle.loyalty = Math.min(100, castle.loyalty + (2 + this.buildingLevel(castle, B.TEMPLE)) * SPEED * Math.max(0, now - castle.loyAt) / 3600000);
    castle.loyAt = now;
    const owner = castle.owner;
    castle.training = castle.training.filter((t) => {
      const ready = Math.max(0, Math.min(t.count, Math.floor((now - t.start) / t.each)));
      if (ready > t.done) {
        const n = ready - t.done; t.done = ready;
        if (t.unit === GENERAL_ID) castle.general = this.newGeneral(castle, 1);
        else castle.units[t.unit] = (castle.units[t.unit] || 0) + n;
        if (t.done === t.count) this.event(owner, `Готово: ${UNIT[t.unit].name} ×${t.count}`);
      }
      return t.done < t.count;
    });
    // генерал воскрес
    const g = castle.general;
    if (g && g.dead && g.reviveAt && g.reviveAt <= now) { g.dead = false; delete g.reviveAt; delete g.reviveStart; this.event(owner, 'Генерал снова в строю.'); }
    // улучшение в Кузнице
    const fj = castle.forgeJob;
    if (fj && fj.end <= now) {
      const f = castle.forge[fj.unit] || (castle.forge[fj.unit] = { a: 0, d: 0 });
      f[fj.kind] = fj.level;
      this.event(owner, `Кузница: ${UNIT[fj.unit].name} — ${fj.kind === 'a' ? 'атака' : 'защита'} ${fj.level} ур.`);
      castle.forgeJob = null;
    }
    // улучшение в Школе магии
    const mj = castle.magicJob;
    if (mj && mj.end <= now) {
      const f = castle.forge[mj.unit] || (castle.forge[mj.unit] = { a: 0, d: 0 });
      f[mj.kind] = mj.level;
      this.event(owner, `Школа магии: ${UNIT[mj.unit].name} — ${mj.kind === 'm' ? 'магическая атака' : 'магическая защита'} ${mj.level} ур.`);
      castle.magicJob = null;
    }
    // исследование
    if (castle.research && castle.research.end <= now) {
      castle.sciences[castle.research.sci] = castle.research.level;
      this.event(owner, `Изучено: ${SCIENCES[castle.research.sci].name} ${castle.research.level} ур.`);
      castle.research = null;
    }
  };

  // ----- Кузница: улучшение атаки/защиты каждого юнита (+1 к базовому параметру за уровень, до уровня Кузнеца) -----
  P.forgeLvl = function forgeLvl(castle, id, kind) { const f = castle.forge && castle.forge[id]; return f ? f[kind] || 0 : 0; };
  P.forgeUnits = function forgeUnits(castle) {
    return unitsForRace(this.raceOf(castle)).filter((u) => (u.race !== 'all' || ['catapult', 'ram'].includes(u.role)) && u.id !== GENERAL_ID);
  };
  P.forgeCost = function forgeCost(u, level) {
    const k = 2 + level; // дороже с каждым уровнем
    return { cost: Object.fromEntries(RES4.map((r) => [r, Math.round(u.cost[r] * k)])), sec: Math.max(5, Math.round(u.time * (1 + level / 2) / SPEED)) };
  };
  P.forgeOp = function forgeOp(castle, { unit, kind }) {
    this.tick(castle); this.mil(castle);
    const L = this.buildingLevel(castle, B.SMITH), u = UNIT[unit];
    if (!L) return { error: 'Нужен Кузнец.' };
    if (!u || !this.forgeUnits(castle).includes(u)) return { error: 'Этот юнит нельзя улучшить.' };
    if (!['a', 'd'].includes(kind)) return { error: 'Неверный параметр.' };
    if (castle.forgeJob) return { error: 'Кузница занята другим улучшением.' };
    const next = this.forgeLvl(castle, u.id, kind) + 1;
    if (next > 20) return { error: 'Достигнут максимум (20).' };
    if (next > L) return { error: `Нужен Кузнец ${next} ур.` };
    const { cost, sec } = this.forgeCost(u, next);
    for (const r of RES4) if (castle.res[r] < cost[r]) return { error: 'Недостаточно ресурсов.' };
    for (const r of RES4) castle.res[r] -= cost[r];
    castle.forgeJob = { unit: u.id, kind, level: next, start: Date.now(), end: Date.now() + sec * 1000 };
    this.store.save();
    return { ok: true };
  };

  // ----- Школа магии: как Кузница, но магическая атака (m, только у магов) и магическая защита (md, у всех) -----
  // +1 к базовому параметру за уровень, до уровня Школы магии (макс. 20); одновременно одно улучшение
  P.magicKinds = (u) => (u.magic > 0 ? ['m', 'md'] : ['md']);
  P.magicOp = function magicOp(castle, { unit, kind }) {
    this.tick(castle); this.mil(castle);
    const L = this.buildingLevel(castle, B.MAGIC_SCHOOL), u = UNIT[unit];
    if (!L) return { error: 'Нужна Школа магии.' };
    if (!u || !this.forgeUnits(castle).includes(u)) return { error: 'Этот юнит нельзя улучшить.' };
    if (!this.magicKinds(u).includes(kind)) return { error: u.magic > 0 || kind !== 'm' ? 'Неверный параметр.' : 'У этого юнита нет магической атаки.' };
    if (castle.magicJob) return { error: 'Школа магии занята другим улучшением.' };
    const next = this.forgeLvl(castle, u.id, kind) + 1;
    if (next > 20) return { error: 'Достигнут максимум (20).' };
    if (next > L) return { error: `Нужна Школа магии ${next} ур.` };
    const { cost, sec } = this.forgeCost(u, next);
    for (const r of RES4) if (castle.res[r] < cost[r]) return { error: 'Недостаточно ресурсов.' };
    for (const r of RES4) castle.res[r] -= cost[r];
    castle.magicJob = { unit: u.id, kind, level: next, start: Date.now(), end: Date.now() + sec * 1000 };
    this.store.save();
    return { ok: true };
  };

  // ----- генерал -----
  P.generalNeed = (level) => 50 * level * level; // всего опыта для следующего уровня: 10 ур. — 5 000, 100 ур. — 500 000, 500 ур. — 12,5 млн
  P.newGeneral = function newGeneral(castle, level = 1) {
    return this.normGeneral({ name: 'Генерал', level, exp: level > 1 ? this.generalNeed(level - 1) : 0, expV: 2, dead: false }, castle);
  };
  // дополняет старые записи генерала полями нового окна (очки, имя, сбросы)
  P.normGeneral = function normGeneral(g, castle) {
    if (!g.pts) { g.pts = Object.fromEntries(GEN_STATS.map((k) => [k, 0])); g.free = GEN.perLevel * Math.max(0, g.level - 1); }
    if (g.expV !== 2) { g.exp = Math.round((g.exp || 0) / 2); g.expV = 2; } // шкала опыта ×0,5 (новая кривая уровней), уровень не меняется
    if (g.free === undefined) g.free = 0;
    if (!g.name) g.name = 'Генерал';
    if (g.level > GEN.maxLevel) g.level = GEN.maxLevel;
    if (g.resets === undefined) g.resets = 1;
    if (!g.kind && castle) g.kind = genKind(this.raceOf(castle));
    return g;
  };
  P.genStats = function genStats(g) {
    const base = UNIT[GENERAL_ID];
    return { atk: base.attack + g.pts.atk, def: base.def.inf + g.pts.def, catk: GEN.cmd * g.pts.catk, cdef: GEN.cmd * g.pts.cdef,
      heal: GEN.heal * g.pts.heal, career: GEN.career * g.pts.career };
  };
  // опыт генерала за бой. Чтобы генерал не качался «за пару секунд», действуют ограничения:
  //  • за один бой — не больше 15% опыта текущего уровня (минимум 7 боёв на уровень);
  //  • за сутки — не больше опыта на 1 уровень (≈ 30 уровней в месяц при активной войне, 500 ур. — больше года);
  //  • карьера (+0,5% за очко) и премиум (×2) увеличивают и опыт, и оба лимита.
  P.addGeneralExp = function addGeneralExp(castle, exp) {
    const g = castle.general; if (!g || g.dead || !(exp > 0)) return null;
    this.normGeneral(g, castle);
    const mult = (1 + GEN.career * g.pts.career) * (this.isPremium(this.userById(castle.owner)) ? 2 : 1);
    const span = this.generalNeed(g.level) - (g.level > 1 ? this.generalNeed(g.level - 1) : 0);
    const day = new Date().toISOString().slice(0, 10);
    if (!g.day || g.day.d !== day) g.day = { d: day, exp: 0 };
    const battleCap = Math.max(20, Math.ceil(span * GEN.battleCap * mult)), dayCap = Math.ceil(span * GEN.dayLevels * mult);
    const raw = Math.round(exp * mult), got = Math.max(0, Math.min(raw, battleCap, dayCap - g.day.exp));
    const capped = got < raw ? (g.day.exp + got >= dayCap ? 'day' : 'battle') : null;
    g.day.exp += got; if (got > 0) this.addStat(castle.owner, 'genExp', got);
    const from = g.level; g.exp += got;
    while (g.level < GEN.maxLevel && g.exp >= this.generalNeed(g.level)) { g.level++; g.free += GEN.perLevel; }
    if (g.level > from) this.event(castle.owner, `Генерал «${g.name}» достиг ${g.level} уровня! +${(g.level - from) * GEN.perLevel} очк. опыта`);
    return { got, from, level: g.level, name: g.name, capped };
  };
  // опыт за бой (до карьеры, премиума и лимитов):
  //  • основа — население убитых врагов / 10;
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
  const genLine = (who, r, e) => (r ? `${who} «${r.name}» получил ${r.got.toLocaleString('ru-RU')} опыта${e.weak ? ' (слабый противник ×0,25)' : ''}${e.repeat ? ` (${e.repeat + 1}-й бой с этим игроком за сутки)` : ''}${r.capped === 'battle' ? ' — лимит за бой' : r.capped === 'day' ? ' — дневной лимит опыта исчерпан' : ''}${r.level > r.from ? `. Новый уровень: ${r.level}!` : ''}` : null);
  // окно «Генерал»: rename, dist (распределить очки), reset (сбросить очки), kill (убить)
  P.generalOp = function generalOp(castle, user, { op, name, pts } = {}) {
    this.tick(castle); this.mil(castle);
    const g = castle.general;
    if (op === 'revive') return this.reviveGeneral(castle);
    if (!g) return { error: 'Генерала нет.' };
    if (op === 'rename') {
      name = String(name || '').trim().slice(0, 20); if (!name) return { error: 'Введите имя.' };
      g.name = name;
    } else if (op === 'dist') {
      const add = Object.fromEntries(GEN_STATS.map((k) => [k, Math.max(0, Math.floor(Number(pts && pts[k]) || 0))]));
      const sum = GEN_STATS.reduce((s, k) => s + add[k], 0);
      if (!sum) return { error: 'Укажите, сколько очков куда распределить.' };
      if (sum > g.free) return { error: `Свободных очков только ${g.free}.` };
      for (const k of GEN_STATS) g.pts[k] += add[k];
      g.free -= sum;
    } else if (op === 'reset') {
      const spent = GEN_STATS.reduce((s, k) => s + g.pts[k], 0);
      if (!spent) return { error: 'Очки ещё не распределены.' };
      if (g.resets > 0) g.resets--;
      else { if ((user.gold || 0) < GEN.resetGold) return { error: `Нужно ${GEN.resetGold} золота.` }; this.goldChange(user, -GEN.resetGold, 'Сброс очков генерала'); }
      for (const k of GEN_STATS) g.pts[k] = 0;
      g.free += spent;
    } else if (op === 'kill') {
      if (g.away) return { error: 'Генерал в походе.' };
      castle.general = null;
    } else return { error: 'Неизвестное действие.' };
    this.store.save();
    return { ok: true };
  };
  P.reviveGeneral = function reviveGeneral(castle) {
    this.tick(castle);
    const g = castle.general;
    if (!g || !g.dead) return { error: 'Генерал жив.' };
    if (g.reviveAt) return { error: 'Воскрешение уже идёт.' };
    const cost = UNIT[GENERAL_ID].cost, k = GEN.revive * g.level; // чем выше уровень, тем дороже
    for (const r of RES4) if (castle.res[r] < cost[r] * k) return { error: 'Недостаточно ресурсов.' };
    for (const r of RES4) castle.res[r] -= Math.round(cost[r] * k);
    g.reviveStart = Date.now();
    g.reviveAt = Date.now() + Math.max(5, Math.round(Math.min(g.level, 100) * 3600 / SPEED / (1 + GEN.heal * g.pts.heal))) * 1000;
    this.store.save();
    return { ok: true };
  };

  // ----- марши -----
  // castleAt(x, y) — индекс по координатам в game.js
  P.travelSec = function travelSec(castle, units, general, x, y, merchants = false) {
    const speeds = Object.keys(units).filter((id) => units[id] > 0).map((id) => UNIT[id].speed);
    if (general) speeds.push(UNIT[GENERAL_ID].speed);
    if (!speeds.length) return 0;
    const b = this.bonus(castle);
    const v = Math.min(...speeds) * b.speed * (merchants ? b.tradeSpeed : 1);
    return Math.max(5, Math.round(Math.hypot(x - castle.x, y - castle.y) / v * 3600 / SPEED));
  };
  // отправка: from = 'castle' (вся Замковая армия) или id отряда (весь отряд), как в оригинале; либо units — выборочно.
  // portal — через Портал (в 4 раза быстрее), at — расписание отправки (время, мс)
  P.sendArmy = function sendArmy(castle, { units = {}, general = false, x, y, mission, res = null, from = null, portal = false, at = 0 }) {
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
      const fits = { scout: (r) => ['scout', 'eye'].includes(r), expedition: (r) => r === 'archaeologist', trade: (r) => r === 'merchant' }[mission]
        || ((r) => !['merchant', 'archaeologist', 'sage', 'settler'].includes(r));
      units = Object.fromEntries(Object.entries(units).filter(([u]) => UNIT[u] && fits(UNIT[u].role)));
      if (!['attack', 'raid', 'reinforce'].includes(mission)) general = false;
    }
    x = Math.round(Number(x)); y = Math.round(Number(y));
    if (!MISSIONS[mission]) return { error: 'Неизвестная миссия.' };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Укажите координаты цели.' };
    if (x === castle.x && y === castle.y) return { error: 'Это ваш замок.' };
    if (!this.buildingLevel(castle, B.HQ) && mission !== 'trade') return { error: 'Нужен Военный штаб.' };
    const clean = {};
    for (const [id, n0] of Object.entries(units)) {
      const n = Math.floor(Number(n0)); if (!(n > 0)) continue;
      if (!UNIT[id] || ((squad ? squad.units : castle.units)[id] || 0) < n) return { error: `Не хватает: ${UNIT[id] ? UNIT[id].name : id}.` };
      clean[id] = n;
    }
    const roles = Object.keys(clean).map((id) => UNIT[id].role);
    const g = castle.general;
    if (general && (!g || g.dead || g.away)) return { error: 'Генерал недоступен.' };
    if (!roles.length && !general) return { error: from ? 'В этой армии нет войск.' : 'Выберите войска.' };
    if (portal && !this.buildingLevel(castle, B.PORTAL)) return { error: 'Нужен Портал.' };
    const target = this.castleAt(x, y);
    const obj = target ? null : this.worldObjects(x, y, 1, 1)[0];
    let cargo = null;
    if (mission === 'scout' && roles.some((r) => !['scout', 'eye'].includes(r))) return { error: 'В разведку идут только разведчики (и Око).' };
    if (mission === 'expedition') {
      if (!this.buildingLevel(castle, B.EXPEDITION)) return { error: 'Нужна Экспедиция.' };
      if (!obj || !NPC[obj.img] || !NPC[obj.img].ruins) return { error: 'Экспедиции идут в руины (Заброшенный замок).' };
      if (roles.some((r) => r !== 'archaeologist')) return { error: 'В экспедицию идут только археологи.' };
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
    if (mission === 'reinforce' && !target) return { error: 'Подкрепление отправляют в замок.' };
    if (mission === 'reinforce' && roles.some((r) => r === 'merchant')) return { error: 'Торговцы не воюют.' };
    if (target && target.owner === castle.owner && !['trade', 'reinforce'].includes(mission)) return { error: 'Это ваш замок.' };
    // генерал идёт в подкреплении только в свой замок (перевод генерала); в замке может быть лишь один генерал
    if (general && mission === 'reinforce') {
      if (!target || target.owner !== castle.owner) { if (!from) return { error: 'Генерал идёт подкреплением только в свой замок.' }; general = false; }
      else {
        if (target.general) return { error: `В замке «${target.name}» уже есть генерал — в замке может быть только один.` };
        if (castle.armies.some((x) => x.general && x.mission === 'reinforce' && x.x === target.x && x.y === target.y)) return { error: 'Генерал уже идёт в этот замок.' };
      }
    }
    const me = this.ownerOf(castle);
    if (target && ['attack', 'raid', 'scout'].includes(mission) && !me.admin && this.rating(target) < NEWBIE_RATING) return { error: `Игрок под защитой новичка (рейтинг ниже ${NEWBIE_RATING}).` };
    if (!target && (!obj || (!NPC[obj.img] && mission !== 'scout'))) return { error: 'Здесь некого атаковать.' };
    const src = squad ? squad.units : castle.units;
    for (const [id, n] of Object.entries(clean)) { src[id] -= n; if (!src[id]) delete src[id]; }
    if (squad) { // то, что не пошло в поход, остаётся в Замковой армии
      for (const [u, n] of Object.entries(squad.units)) if (n > 0) castle.units[u] = (castle.units[u] || 0) + n;
      castle.squads = castle.squads.filter((q) => q !== squad);
    }
    let sec = this.travelSec(castle, clean, general, x, y, mission === 'trade');
    if (portal) sec = Math.max(5, Math.round(sec / 4));
    const now = Date.now(), start = at && Number(at) > now + 3000 ? Number(at) : now;
    const army = { id: this.db.nextId++, units: clean, general: !!general, mission, x, y, depart: start, arrive: start + sec * 1000, sec, state: start > now ? 'wait' : 'go', loot: null, cargo,
      squad: squad ? { id: squad.id, name: squad.name } : from === 'castle' ? { id: 0, name: 'Замковая армия' } : null, portal: !!portal };
    if (general) { g.away = army.id; delete g.squad; }
    castle.armies.push(army);
    if (army.state === 'go') this.warnIncoming(castle, army);
    this.store.save();
    return { army, sec };
  };

  // ----- мир: армии прибывают и возвращаются (вызывается раз в секунду для всех замков) -----
  P.tickWorld = function tickWorld(now = Date.now()) {
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
      if (a.state === 'go') this.arrive(c, a, a.arrive);
      else this.returnHome(c, a);
    }
    if (due.length) this.store.save();
    return due.length;
  };
  P.returnHome = function returnHome(c, a) {
    this.tick(c);
    this.mil(c);
    const units = Object.fromEntries(Object.entries(a.units).filter(([id, n]) => n > 0 && Number(id) !== MERCHANT_ID)); // торговцы просто возвращаются на Рынок
    if (a.squad && a.squad.id) { // отряд возвращается отдельной армией
      c.squads.push({ id: a.squad.id, name: a.squad.name, units });
      if (a.general && c.general && c.general.away === a.id) { delete c.general.away; c.general.squad = a.squad.id; }
    } else {
      for (const [id, n] of Object.entries(units)) c.units[id] = (c.units[id] || 0) + n;
      if (a.general && c.general && c.general.away === a.id) delete c.general.away;
    }
    const cap = this.capacity(c);
    if (a.loot) for (const r of RES4) c.res[r] = Math.min(cap[r], c.res[r] + (a.loot[r] || 0));
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
      if (target.general) { delete c.general.away; } // в замке уже появился генерал — наш остаётся дома
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
  // сила нападения: сырая сумма атак по родам войск (с Кузницей), затем бонусы (наука, пивоварня, храм, артефакты, командование генерала)
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
    if (withGeneral && c.general && !c.general.dead) { const gs = this.genStats(c.general); gl = c.general.level; cmd = gs.catk; genAtk = gs.atk; inf += gs.atk; mag += UNIT[GENERAL_ID].magic; }
    const k = b.atk * (1 + cmd);
    return { inf: inf * k, cav: cav * k, mag: mag * b.magic * b.atk, gl,
      raw: { inf: Math.round(inf), cav: Math.round(cav), mag: Math.round(mag), gen: Math.round(genAtk) }, bonusPct: Math.round((k - 1) * 100), magicPct: Math.round((b.magic * b.atk - 1) * 100) };
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
    for (const m of this.defenders(d)) for (const [id, n] of Object.entries(m)) add(id, n);
    if (d.general && !d.general.dead && !d.general.away) { add(GENERAL_ID, 1); phys += d.general.pts.def * (pInf + pCav); }
    const rawPhys = phys, rawMag = mag, wallK = 1 + b.wallPer * b.wall;
    phys = (phys * b.def + 10 * b.wall) * wallK;
    return { phys, mag: mag * b.def * b.magic, raw: { phys: Math.round(rawPhys), mag: Math.round(rawMag) }, bonusPct: Math.round((b.def - 1) * 100), magicPct: Math.round((b.def * b.magic - 1) * 100),
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

  // отчёт: title и lines — текстом, data — для оформленного окна отчёта в клиенте (стороны, потери, добыча, захват)
  P.report = function report(userId, title, lines, kind = 'battle', data = null) {
    this.db.reports = this.db.reports || [];
    this.db.reports.push({ id: this.db.nextId++, owner: userId, at: Date.now(), kind, title, lines, data, read: false });
    if (this.db.reports.length > 2000) this.db.reports.splice(0, this.db.reports.length - 2000);
    this.event(userId, title);
  };

  // прибытие армии к цели
  P.arrive = function arrive(c, a, t) {
    const att = this.ownerOf(c);
    const target = this.castleAt(a.x, a.y);
    const where = `${a.x}:${a.y}`;
    if (a.mission === 'trade') {
      if (target) { this.tick(target); const cap = this.capacity(target); for (const r of RES4) target.res[r] = Math.min(cap[r], target.res[r] + a.cargo[r]); }
      const to = target && this.ownerOf(target);
      this.report(c.owner, `Торговцы доставили ресурсы в ${target ? target.name : where}`, [`Груз: дерево ${a.cargo.wood}, камень ${a.cargo.stone}, железо ${a.cargo.iron}, еда ${a.cargo.food}`], 'trade');
      if (to && to.id !== c.owner) this.report(to.id, `Получены ресурсы от ${att.login}`, [`Дерево ${a.cargo.wood}, камень ${a.cargo.stone}, железо ${a.cargo.iron}, еда ${a.cargo.food}`], 'trade');
      a.cargo = null; return this.goBack(c, a, t);
    }
    if (a.mission === 'expedition') return this.expedition(c, a, t);
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
    const obj = target ? null : this.worldObjects(a.x, a.y, 1, 1)[0];
    const npc = obj && NPC[obj.img];
    const A = this.armyPower(c, a.units, a.general);
    const aTot = A.inf + A.cav + A.mag || 1;
    const pInf = A.inf + A.cav ? A.inf / (A.inf + A.cav) : 1, pCav = 1 - pInf;
    let D;
    if (target) { this.tick(target); this.mil(target); D = this.defensePower(target, pInf, pCav); }
    else D = { phys: npc.def.inf * pInf + npc.def.cav * pCav, mag: npc.def.mag };
    const Aphys = A.inf + A.cav;
    const Dsum = D.phys * (Aphys / aTot) + D.mag * (A.mag / aTot) || 1;
    // удача атаки ±10% (как «Удача атаки -5 %» в отчёте оригинала); LUCK=0 — без случайности (тесты)
    const luck = process.env.LUCK === '0' ? 0 : Math.round(Math.random() * 20 - 10);
    const aSum = aTot * (1 + luck / 100);
    let aLoss, dLoss;
    const calc = { rule: a.mission === 'attack' ? 'attack' : 'raid', luck,
      shares: { inf: Math.round(A.inf / aTot * 100), cav: Math.round(A.cav / aTot * 100), mag: Math.round(A.mag / aTot * 100) },
      att: { raw: A.raw, bonusPct: A.bonusPct, magicPct: A.magicPct, noLuck: Math.round(aTot), total: Math.round(aSum) },
      def: target ? { raw: D.raw, bonusPct: D.bonusPct, magicPct: D.magicPct, wall: D.wall, wallPct: D.wallPct, wallFlat: D.wallFlat, total: Math.round(Dsum) } : { npc: true, total: Math.round(Dsum) } };
    if (a.mission === 'attack') {
      if (aSum > Dsum) { aLoss = (Dsum / aSum) ** 1.5; dLoss = 1; } else { aLoss = 1; dLoss = (aSum / Dsum) ** 1.5; }
    } else { const q = (aSum / Dsum) ** 1.5; aLoss = 1 / (1 + q); dLoss = q / (1 + q); }
    const aBefore = { ...a.units };
    const aLost = applyLoss(a.units, aLoss);
    let dLost = {}, dBefore = {};
    let dAll = {};
    if (target) {
      for (const m of this.defenders(target)) {
        const l = applyLoss(m, dLoss);
        for (const [id, n] of Object.entries(l)) dLost[id] = (dLost[id] || 0) + n;
        for (const id of Object.keys(m)) { if (m[id]) dAll[id] = (dAll[id] || 0) + m[id]; else delete m[id]; }
      }
      dBefore = dAll;
    }
    const win = aSum > Dsum;
    calc.aLossPct = Math.round(aLoss * 100); calc.dLossPct = Math.round(dLoss * 100);
    const aliveAfter = Object.values(a.units).some((n) => n > 0);
    // генералы
    const genA = [], genD = [];
    if (a.general && c.general) {
      if (!aliveAfter && aLoss >= 1) { c.general.dead = true; delete c.general.away; a.general = false; genA.push('Генерал пал в бою — опыт не получен.'); }
      else {
        const e = this.battleExp({ killedPop: popOf(dLost), win, mission: a.mission, npc: target ? null : npc, dLoss, mine: c, enemy: target });
        const l = genLine('Генерал', this.addGeneralExp(c, e.exp), e); if (l) genA.push(l);
      }
    }
    if (target && target.general && !target.general.dead && !target.general.away) {
      if (dLoss >= 1 && !Object.keys(dAll).length) { target.general.dead = true; genD.push('Ваш генерал пал, защищая замок.'); }
      else {
        const e = this.battleExp({ killedPop: popOf(aLost), win: !win, mission: 'attack', mine: target, enemy: c });
        const l = genLine('Ваш генерал', this.addGeneralExp(target, e.exp), e); if (l) genD.push(l);
      }
    }
    // добыча
    let loot = null;
    if (aliveAfter) {
      let carry = Object.entries(a.units).reduce((s, [id, n]) => s + UNIT[id].carry * n, 0);
      calc.carry = carry;
      loot = { wood: 0, stone: 0, iron: 0, food: 0 };
      let avail;
      if (target) { const hid = this.bonus(target).hidden; calc.hidden = hid; avail = Object.fromEntries(RES4.map((r) => [r, Math.max(0, Math.floor(target.res[r]) - hid)])); }
      else {
        const st = (this.db.npc = this.db.npc || {})[where];
        avail = st && st.until > t ? { wood: 0, stone: 0, iron: 0, food: 0 } : { ...npc.loot };
      }
      // выносим равномерно
      let left = RES4.filter((r) => avail[r] > 0);
      while (carry > 0 && left.length) {
        const share = Math.max(1, Math.floor(carry / left.length));
        for (const r of left) { const v = Math.min(share, avail[r], carry); loot[r] += v; avail[r] -= v; carry -= v; }
        left = left.filter((r) => avail[r] > 0);
      }
      if (target) for (const r of RES4) target.res[r] -= loot[r];
      else if (RES4.some((r) => loot[r] > 0)) this.db.npc[where] = { until: t + NPC_REGEN_SEC / SPEED * 1000 };
    }
    // осада: тараны ломают Забор, катапульты — здания (только атака и победа)
    const siege = []; let siegeN = 0;
    if (target && a.mission === 'attack' && win) {
      const b = this.bonus(target);
      let ram = (a.units[243] || 0) * UNIT[243].attack;
      let wallL = b.wall;
      while (wallL > 0 && ram >= Math.round(2 * 1.25 ** wallL)) { ram -= Math.round(2 * 1.25 ** wallL); wallL--; }
      if (wallL < b.wall) { this.setBuildingLevel(target, B.FENCE, wallL); siege.push(`Забор: ${b.wall} → ${wallL} ур.`); siegeN += b.wall - wallL; }
      let cat = (a.units[240] || 0) * UNIT[240].attack / (1 + 0.05 * b.mason);
      const cells = Array.from(target.grid[0], (id, i) => [id, i]).filter(([id, i]) => id > 0 && target.levels[0][i] > 0);
      if (cat > 0 && cells.length) {
        const [bid, cell] = cells[Math.floor(Math.random() * cells.length)];
        let L = target.levels[0][cell]; const L0 = L;
        while (L > 0 && cat >= Math.round(3 * 1.25 ** L)) { cat -= Math.round(3 * 1.25 ** L); L--; }
        if (L < L0) { target.levels[0][cell] = L; if (!L) target.grid[0][cell] = -1; siege.push(`${C.BY_ID[bid].name}: ${L0} → ${L} ур.`); siegeN += L0 - L; }
      }
    }
    // бунтари: выжившие в победной атаке снижают лояльность, при 0 — захват (GDD §10–11)
    let loyalty = null, captured = null, capitalBlocked = false, royalBlocked = null;
    const rebels = a.mission === 'attack' && win ? (a.units[233] || 0) : 0;
    if (rebels) {
      let drop = 0;
      for (let k = 0; k < Math.min(rebels, 10); k++) drop += 20 + Math.floor(Math.random() * 11);
      if (target && this.isCapital(target)) capitalBlocked = true;
      else if (target) {
        const from = Math.round(target.loyalty); target.loyalty = Math.max(0, target.loyalty - drop); target.loyAt = t;
        loyalty = { from, to: Math.round(target.loyalty) };
        if (target.loyalty <= 0) {
          if (this.royalCanCapture(att)) { this.royalSpend(att); captured = this.captureCastle(att, target); }
          else { target.loyalty = 1; royalBlocked = { have: Math.floor(att.royal), need: this.royalNeed(att), wait: this.royalWaitDays(att) }; } // не хватает лояльности населения (Резиденция)
        }
      } else if (npc && npc.ruins) {
        const st = (this.db.npc = this.db.npc || {})[where] || (this.db.npc[where] = {});
        const from = Math.round(st.loyalty ?? 100); st.loyalty = Math.max(0, from - drop);
        loyalty = { from, to: st.loyalty };
        if (st.loyalty <= 0) {
          if (this.royalCanCapture(att)) { this.royalSpend(att); delete this.db.npc[where]; captured = this.foundCaptured(att, a.x, a.y); }
          else { st.loyalty = 1; royalBlocked = { have: Math.floor(att.royal), need: this.royalNeed(att), wait: this.royalWaitDays(att) }; }
        }
      }
    }
    a.loot = loot;
    // статистика для Зала Славы (social.js)
    if (loot) this.addStat(c.owner, 'loot', RES4.reduce((q, k) => q + loot[k], 0));
    this.addStat(c.owner, 'kills', target ? popOf(dLost) : (npc ? Math.round(npc.def.inf / 20 * dLoss) : 0));
    if (target) { this.addStat(target.owner, 'defKills', popOf(aLost)); this.addStat(target.owner, 'defLost', popOf(dLost)); this.addStat(c.owner, 'attLost', popOf(aLost)); }
    if (siegeN) this.addStat(c.owner, 'ruins', siegeN);
    const defUser = target && this.ownerOf(target);
    const tname = target ? `${target.name} (${captured ? captured.prevLogin : defUser.login})` : `${npc.name} ${where}`;
    const side = (units, lost) => Object.fromEntries(Object.entries(units).map(([id, n]) => [id, { was: n + (lost[id] || 0), lost: lost[id] || 0 }]).filter(([, v]) => v.was > 0));
    const genDied = !!(c.general && c.general.dead && a.general === false && aLoss >= 1);
    const data = {
      type: 'battle', mission: a.mission, win, x: a.x, y: a.y, luck, calc, power: { att: Math.round(aSum), def: Math.round(Dsum) },
      att: { id: att.id, login: att.login, race: att.race, castle: c.name, cx: c.x, cy: c.y, rating: this.rating(c), lossRes: lossRes(aLost), units: side(a.units, aLost), general: a.general || genDied ? (c.general ? c.general.level : 0) : 0, generalDied: genDied },
      def: target ? { id: captured ? captured.prevOwner : defUser.id, login: captured ? captured.prevLogin : defUser.login, race: captured ? captured.prevRace : defUser.race, castle: target.name, rating: this.rating(target), lossRes: lossRes(dLost), units: side(dAll, dLost), wall: this.bonus(target).wall }
        : { npc: npc.name, img: obj.img, lossPct: Math.round(dLoss * 100) },
      loot, siege, loyalty, capitalBlocked, royalBlocked, captured: captured ? { name: captured.name, x: a.x, y: a.y } : null,
    };
    const lines = [
      `${MISSIONS[a.mission]} на ${tname}. ${win ? 'Победа!' : 'Поражение.'}`,
      `Сила: атака ${Math.round(aSum)} против обороны ${Math.round(Dsum)}`,
      `Ваши войска: ${unitsLine(a.units, aLost)}${a.general ? ` + генерал ${c.general ? c.general.level : ''} ур.` : ''}`,
      target ? `Защитники: ${unitsLine(dAll, dLost)}` : `Охрана лагеря потеряла ${Math.round(dLoss * 100)}%`,
      loot ? `Добыча: дерево ${loot.wood}, камень ${loot.stone}, железо ${loot.iron}, еда ${loot.food}` : 'Добычи нет — армия погибла.',
      ...siege,
    ];
    if (loyalty) lines.push(`Лояльность: ${loyalty.from} → ${loyalty.to}`);
    if (royalBlocked) lines.push(royalBlocked.wait ? `Захват не удался: первый замок можно захватить только через ${royalBlocked.wait} дн. игры.` : `Захват не удался: не хватает лояльности населения (есть ${royalBlocked.have}, нужно ${royalBlocked.need}) — см. Резиденцию.`);
    if (capitalBlocked) lines.push('Столицу захватить нельзя — бунтари бессильны.');
    if (captured) lines.push(`Замок захвачен! Теперь это ваш замок «${captured.name}».`);
    if (genDied) lines.push('Генерал пал в бою — воскресите его в Военном штабе.');
    lines.push(...genA.filter((x) => !genDied || !/пал в бою/.test(x)));
    const title = captured ? `Захват: ${captured.name} ${where} — замок ваш!` : `${MISSIONS[a.mission]}: ${tname} — ${win ? 'победа' : 'поражение'}`;
    this.report(c.owner, title, lines, 'battle', { ...data, side: 'att' });
    if (target) {
      this.report(captured ? captured.prevOwner : target.owner, captured ? `Ваш замок ${target.name} захвачен игроком ${att.login}!` : `На ваш замок напал ${att.login}: ${win ? 'поражение' : 'отбились'}`, [
        `${MISSIONS[a.mission]} от ${att.login} (${c.name}).`,
        `Атакующие: ${unitsLine(a.units, aLost)}`,
        `Ваши войска: ${unitsLine(dAll, dLost)}`,
        loot ? `Унесено: дерево ${loot.wood}, камень ${loot.stone}, железо ${loot.iron}, еда ${loot.food}` : 'Враг разбит, ничего не унесено.',
        ...siege, ...(loyalty ? [`Лояльность: ${loyalty.from} → ${loyalty.to}`] : []), ...genD,
      ], 'battle', { ...data, side: 'def' });
    }
    this.goBack(c, a, t);
  };

  // захват чужого (не столичного) замка: переходит к нападающему, войска и очереди прежнего хозяина пропадают
  P.captureCastle = function captureCastle(att, castle) {
    const prev = this.ownerOf(castle);
    this.royalLoss(prev); // население расстроено: −10% лояльности
    prev.castleIds = this.castlesOf(prev).filter((k) => k !== castle).map((k) => k.id);
    if (prev.castleId === castle.id) prev.castleId = prev.castleIds[0];
    castle.owner = att.id;
    for (const g of this.guestsOf(castle)) this.goBack(g.c, g.a, Date.now()); // чужие подкрепления уходят домой
    castle.units = {}; castle.squads = []; castle.training = []; castle.armies = []; castle.general = null; castle.research = null;
    castle.loyalty = 30; castle.loyAt = Date.now();
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
    this.mil(castle); castle.loyalty = 30;
    att.castleIds = [...this.castlesOf(att).map((k) => k.id), castle.id];
    this.store.save();
    return { name: castle.name };
  };

  P.setBuildingLevel = function setBuildingLevel(castle, id, level) {
    castle.grid[0].forEach((b, i) => { if (b === id) { castle.levels[0][i] = level; if (!level) castle.grid[0][i] = -1; } });
  };

  // разведка: бой разведчиков (GDD 9.6)
  // что узнаёт разведка (Центр разведки → «Возможности»): открывается уровнем Центра, видно, если выжила нужная доля разведчиков
  P.scout = function scout(c, a, t, target) {
    const sent = Object.values(a.units).reduce((s, n) => s + n, 0) || 1;
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
    const lines = [`Разведка ${target ? target.name : where}. Потери: ${unitsLine(a.units, lost)}`];
    if (!alive) lines.push('Разведчики не вернулись.');
    else if (target) {
      const b = this.bonus(target), lvl = this.buildingLevel(c, B.SPY) || 1;
      const alivePart = Object.values(a.units).reduce((s, n) => s + n, 0) / sent;
      const can = (k) => lvl >= SPY_OPEN[k].level && alivePart > SPY_OPEN[k].survive;
      lines.push(`Выжило разведчиков: ${Math.round(alivePart * 100)}%. Центр разведки ${lvl} ур.`);
      if (can('armies')) {
        lines.push(`Армии в замке: ${unitsLine(mergeUnits([target.units, ...target.squads.map((q) => q.units)]))}`);
        if (target.general && !target.general.dead) lines.push(`Генерал ${target.general.level} ур.`);
      }
      if (can('res')) lines.push(`Ресурсы: дерево ${Math.floor(target.res.wood)}, камень ${Math.floor(target.res.stone)}, железо ${Math.floor(target.res.iron)}, еда ${Math.floor(target.res.food)}`);
      if (can('build')) {
        const list = []; target.grid[0].forEach((id, i) => { if (id >= 0 && target.levels[0][i]) list.push(`${C.BY_ID[id].name} ${target.levels[0][i]}`); });
        lines.push(`Здания: ${list.join(', ') || '—'}. Забор ${b.wall} ур., Тайник прячет ${b.hidden}.`);
      }
      if (can('riot')) lines.push(`Бунт: лояльность замка ${Math.round(target.loyalty ?? 100)}${this.isCapital(target) ? ' (столица — захватить нельзя)' : ''}`);
      if (can('reinf')) { const g = this.guestsOf(target); lines.push(`Подкрепления: ${g.length ? g.map((x) => `${this.ownerOf(x.c).login}: ${unitsLine(x.a.units)}`).join('; ') : 'нет'}`); }
      const hidden = Object.keys(SPY_OPEN).filter((k) => !can(k)).map((k) => SPY_OPEN[k].name);
      if (hidden.length) lines.push(`Не удалось узнать: ${hidden.join(', ')}.`);
    } else {
      const obj = this.worldObjects(a.x, a.y, 1, 1)[0];
      const npc = obj && NPC[obj.img];
      lines.push(npc ? `${npc.name}: охрана ~${npc.def.inf}, запас ${RES4.map((r) => npc.loot[r]).join('/')}` : 'Здесь пусто.');
      if (npc && npc.ruins) lines.push(`Лояльность руин: ${Math.round(((this.db.npc || {})[where] || {}).loyalty ?? 100)} — захват атакой с Бунтарями.`);
    }
    const me = this.ownerOf(c), tu = target && this.ownerOf(target);
    const sdata = { type: 'scout', ok: alive, x: a.x, y: a.y,
      att: { id: me.id, login: me.login, castle: c.name, cx: c.x, cy: c.y, rating: this.rating(c), sent, lost: Object.values(lost).reduce((q, n) => q + n, 0) },
      def: target ? { id: tu.id, login: tu.login, castle: target.name, rating: this.rating(target) } : { npc: ((NPC[(this.worldObjects(a.x, a.y, 1, 1)[0] || {}).img] || {}).name) || 'Пустошь' },
      info: lines.slice(1) };
    this.report(c.owner, `Разведка ${target ? target.name : where}${alive ? '' : ' — провал'}`, lines, 'scout', sdata);
    if (target && lossFrac > 0) this.report(target.owner, 'Замечены вражеские разведчики', [`Разведчики игрока ${this.ownerOf(c).login} у вашего замка. Уничтожено: ${Math.round(lossFrac * 100)}%.`], 'scout');
    this.goBack(c, a, t);
  };

  // экспедиция археологов в руины (GDD 13.1)
  P.expedition = function expedition(c, a, t) {
    const n = a.units[230] || 0;
    const chance = 0.2 + 0.05 * n + 0.03 * this.buildingLevel(c, B.ARCH_CAMP) + 0.02 * this.buildingLevel(c, B.EXPEDITION);
    const lines = [`Раскопки в руинах ${a.x}:${a.y}, археологов: ${n}. Шанс находки ${Math.round(Math.min(0.95, chance) * 100)}%.`];
    if (Math.random() < chance) {
      const types = Object.keys(ART_TYPES), type = types[Math.floor(Math.random() * types.length)];
      const roll = Math.random() + 0.02 * this.buildingLevel(c, B.ARCH_CAMP), rarity = roll > 0.95 ? 2 : roll > 0.7 ? 1 : 0;
      const art = { id: this.db.nextId++, type, rarity, active: false, found: t };
      c.artifacts.push(art);
      this.addStat(c.owner, 'arts', 1 + rarity * 2); // качество: обычный 1, редкий 3, легендарный 5
      lines.push(`Найден артефакт: ${ART_TYPES[type].name} (${RARITY[rarity].name}, +${RARITY[rarity].bonus * 100}% — ${ART_TYPES[type].desc}).`);
      if (c.artifacts.length > this.bonus(c).artStore) lines.push('Сокровищница переполнена — постройте/развейте Сокровищницу.');
    } else lines.push('Ничего не найдено.');
    this.report(c.owner, `Экспедиция ${a.x}:${a.y}`, lines, 'expedition');
    this.goBack(c, a, t);
  };

  P.activateArtifact = function activateArtifact(castle, id, on) {
    this.mil(castle);
    const a = castle.artifacts.find((x) => x.id === Number(id)); if (!a) return { error: 'Артефакт не найден.' };
    if (on) {
      const slots = this.bonus(castle).artSlots;
      if (!slots) return { error: 'Нужна Башня артефактов.' };
      if (castle.artifacts.filter((x) => x.active).length >= slots) return { error: `Активных артефактов не больше ${slots} (растёт с Башней).` };
    }
    if (on && !a.active) this.addStat(castle.owner, 'boost', 1); // Зал Славы «Усиление»
    a.active = !!on; this.store.save();
    return { ok: true };
  };

  // входящие армии к замку
  // Караульная башня (хоть в одном замке королевства): видны армии, идущие на замки короля, кроме разведки;
  // без башни видны только торговцы и подкрепления союзников
  P.hasWatch = function hasWatch(user) { return !!user && this.castlesOf(user).some((c) => this.buildingLevel(c, B.WATCHTOWER) > 0); };
  P.incoming = function incoming(castle) {
    const out = [], watch = this.hasWatch(this.ownerOf(castle));
    for (const c of Object.values(this.db.castles)) {
      if (c === castle || !c.armies) continue;
      for (const a of c.armies) {
        if (a.state !== 'go' || a.x !== castle.x || a.y !== castle.y || a.mission === 'scout') continue;
        const friendly = a.mission === 'trade' || a.mission === 'reinforce';
        if (!friendly && !watch) continue;
        out.push({ from: this.ownerOf(c).login, castle: c.name, to: castle.name, mission: a.mission, arrive: a.arrive, units: friendly ? a.units : null });
      }
    }
    return out.sort((p, q) => p.arrive - q.arrive);
  };
  // «Передвижения армий» королевства (окно Караульной башни): свои армии из всех замков и идущие на все замки
  P.kingdomMoves = function kingdomMoves(user) {
    const mine = [], inc = [];
    for (const c of this.castlesOf(user)) {
      for (const a of c.armies || []) mine.push({ castle: c.name, mission: a.mission, x: a.x, y: a.y, state: a.state, depart: a.depart, arrive: a.arrive, back: a.back, stayName: a.state === 'stay' && this.db.castles[a.stayAt] ? this.db.castles[a.stayAt].name : null, n: Object.values(a.units).reduce((s, k) => s + k, 0) });
      inc.push(...this.incoming(c));
    }
    return { mine, incoming: inc.sort((p, q) => p.arrive - q.arrive) };
  };
  // счётчики армий для верхней панели: свои подкрепления (и идущие к нам), свои нападения, нападения на нас (видит Караульная башня)
  P.moveCounts = function moveCounts(user) {
    let reinf = 0, att = 0, inc = 0, home = 0;
    for (const c of this.castlesOf(user)) {
      for (const a of c.armies || []) if (a.state === 'back') home++; // возвращаются домой после нападения, набега, разведки, торговли
      for (const a of c.armies || []) if (a.state === 'go' || a.state === 'wait') {
        if (a.mission === 'reinforce') reinf++; else if (['attack', 'raid', 'scout'].includes(a.mission)) att++;
      }
      for (const a of this.incoming(c)) if (a.mission === 'reinforce') reinf++; else if (['attack', 'raid'].includes(a.mission)) inc++;
    }
    return { reinf, att, inc, home };
  };
  // оповещение при выходе армии: нападение/набег на замок короля с Караульной башней
  P.warnIncoming = function warnIncoming(c, a) {
    if (!['attack', 'raid'].includes(a.mission)) return;
    const t = this.castleAt(a.x, a.y), owner = t && this.ownerOf(t);
    if (!t || t.owner === c.owner || !this.hasWatch(owner)) return;
    const min = Math.max(1, Math.round((a.arrive - Date.now()) / 60000));
    this.event(owner.id, `Караульная башня: ${MISSIONS[a.mission]} на «${t.name}» от ${this.ownerOf(c).login}, прибытие через ${min} мин.`);
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
    castle.res[to] = Math.min(this.capacity(castle)[to], castle.res[to] + got);
    this.store.save();
    return { got };
  };

  // ----- наука -----
  P.research = function research(castle, sci) {
    this.tick(castle);
    if (!SCIENCES[sci]) return { error: 'Неизвестная наука.' };
    const uni = this.buildingLevel(castle, B.UNIVERSITY);
    if (!uni) return { error: 'Нужен Университет.' };
    if (castle.research) return { error: 'Уже идёт исследование.' };
    const next = castle.sciences[sci] + 1;
    if (next > uni) return { error: `Уровень науки не выше уровня Университета (${uni}).` };
    const cost = scienceCost(next);
    for (const r of RES4) if (castle.res[r] < cost[r]) return { error: 'Недостаточно ресурсов.' };
    for (const r of RES4) castle.res[r] -= cost[r];
    const sages = castle.units[227] || 0;
    const sec = Math.max(3, Math.round(scienceTime(next) * Math.max(0.5, 1 - 0.02 * sages) / SPEED));
    castle.research = { sci, level: next, start: Date.now(), end: Date.now() + sec * 1000 };
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
  P.allianceOf = function allianceOf(user) { return user && user.alliance && (this.db.alliances || {})[user.alliance]; };
  const ALLY_MAX = 50; // не больше 50 игроков в альянсе
  P.allianceSlots = function allianceSlots(al) {
    const leader = this.userById(al.leader), lc = leader && this.castleOf(leader);
    return Math.min(ALLY_MAX, 5 * Math.max(1, lc ? this.buildingLevel(lc, B.EMBASSY) : 1)); // 5 мест за уровень центра главы, максимум 50 (10 ур.)
  };
  P.joinAlliance = function joinAlliance(user, al) {
    if (al.members.length >= this.allianceSlots(al)) return { error: `В альянсе нет мест (${this.allianceSlots(al)}).` };
    al.members.push(user.id); user.alliance = al.id;
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
      if (!emb) return { error: 'Нужен Дипломатический центр.' };
      if (cur) return { error: 'Сначала выйдите из текущего альянса.' };
      return this.joinAlliance(user, A[id]);
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
    if (['invite', 'approve', 'reject', 'kick', 'award'].includes(op)) {
      if (!cur) return { error: 'Вы не в альянсе.' };
      const right = { invite: 'invite', approve: 'invite', reject: 'invite', kick: 'kick', award: 'rights' }[op];
      if (!this.allyCan(cur, user.id, right)) return { error: 'Нет прав на это действие.' };
      const t = login !== undefined ? this.db.users[String(login).trim()] : this.userById(id);
      if (!t) return { error: 'Игрок не найден.' };
      if (op === 'invite') {
        if (t.alliance) return { error: 'Игрок уже в альянсе.' };
        t.invites = t.invites || [];
        if (!t.invites.includes(cur.id)) t.invites.push(cur.id);
        this.event(t.id, `Приглашение в альянс [${cur.tag}] — Дипломатический центр → Приглашения.`);
        this.store.save(); return { ok: true, msg: `Приглашение отправлено: ${t.login}.` };
      }
      if (op === 'reject') { cur.requests = (cur.requests || []).filter((x) => x !== t.id); this.store.save(); return { ok: true }; }
      if (op === 'approve') {
        cur.requests = (cur.requests || []).filter((x) => x !== t.id);
        if (t.alliance) { this.store.save(); return { error: 'Игрок уже в другом альянсе.' }; }
        return this.joinAlliance(t, cur);
      }
      if (op === 'award') { // медаль за заслуги от альянса (не больше 5 в сутки от главы)
        if (!cur.members.includes(t.id)) return { error: 'Игрок не в вашем альянсе.' };
        kind = ['gold', 'silver', 'bronze'].includes(kind) ? kind : 'bronze';
        const now = Date.now(); user.awardLog = (user.awardLog || []).filter((x) => x > now - 86400000);
        if (user.awardLog.length >= 5) return { error: 'Не больше 5 наград в сутки.' };
        user.awardLog.push(now);
        (t.allyAwards = t.allyAwards || []).push({ kind, tag: cur.tag, by: user.login, at: now, text: String(text || '').trim().slice(0, 80) });
        this.event(t.id, `Альянс [${cur.tag}] наградил Вас медалью за заслуги!`);
        this.store.save(); return { ok: true, msg: `Медаль вручена: ${t.login}.` };
      }
      if (op === 'kick') {
        if (t.id === user.id || !cur.members.includes(t.id)) return { error: 'Нельзя исключить.' };
        if (t.id === cur.leader) return { error: 'Создателя исключить нельзя.' };
        cur.members = cur.members.filter((m) => m !== t.id); delete t.alliance; if (cur.ranks) delete cur.ranks[t.id];
        this.allyLog(cur, `${user.login} исключил ${t.login}`);
        this.event(t.id, `Вас исключили из альянса [${cur.tag}].`); this.store.save(); return { ok: true };
      }
    }
    if (op === 'leave') {
      if (!cur) return { error: 'Вы не в альянсе.' };
      cur.members = cur.members.filter((m) => m !== user.id); delete user.alliance; if (cur.ranks) delete cur.ranks[user.id];
      this.allyLog(cur, `${user.login} покинул альянс`);
      if (!cur.members.length) delete this.db.alliances[cur.id]; else if (cur.leader === user.id) cur.leader = cur.members[0];
      this.store.save(); return { ok: true };
    }
    if (!emb) return { error: 'Нужен Дипломатический центр.' };
    if (cur) return { error: 'Сначала выйдите из текущего альянса.' };
    tag = String(tag || '').trim().toUpperCase().slice(0, 5);
    if (op === 'create') {
      name = String(name || '').trim().slice(0, 24);
      if (name.length < 3 || tag.length < 2) return { error: 'Название от 3 символов, тег 2–5.' };
      if (Object.values(this.db.alliances).some((x) => x.tag === tag)) return { error: 'Такой тег уже занят.' };
      const id = this.db.nextId++;
      this.db.alliances[id] = { id, name, tag, leader: user.id, members: [user.id], created: Date.now() };
      user.alliance = id; user.invites = []; this.store.save(); return { ok: true };
    }
    if (op === 'join') {
      const al = Object.values(this.db.alliances).find((x) => x.tag === tag);
      if (!al) return { error: 'Альянс не найден.' };
      return this.joinAlliance(user, al);
    }
    return { error: 'Неизвестное действие.' };
  };

  // ----- админ: полная прокачка -----
  P.maxOut = function maxOut(castle) {
    this.mil(castle);
    const race = this.raceOf(castle);
    const castleBuildings = C.BUILDINGS.filter((b) => b.layer === 'castle' && b.id !== 0 && b.id !== 1);
    const cells = [...Array(49).keys()].filter((i) => i !== 24 && !C.CASTLE_PATH.includes(i)); // тропинка — пустая
    castle.grid[0] = new Int8Array(49).fill(-1); castle.levels[0] = new Int8Array(49);
    castle.grid[0][24] = 0; castle.levels[0][24] = C.BY_ID[0].max;
    let k = 0;
    for (const b of castleBuildings) { const i = cells[k++]; castle.grid[0][i] = b.id; castle.levels[0][i] = b.max; }

    while (k < cells.length) { const i = cells[k++]; castle.grid[0][i] = 1; castle.levels[0][i] = C.BY_ID[1].max; } // оставшиеся клетки — тоже склады (повторяться может только Склад)
    for (let i = 0; i < 225; i++) {
      const opts = helpers.landOptions(i % 15, Math.floor(i / 15));
      if (!opts.length) { castle.grid[1][i] = -1; castle.levels[1][i] = 0; continue; }
      const id = opts.length > 1 ? opts[i % opts.length] : opts[0];
      castle.grid[1][i] = id; castle.levels[1][i] = 20;
    }
    castle.queue = [];
    for (const u of unitsForRace(race)) if (u.id !== GENERAL_ID) castle.units[u.id] = Math.max(castle.units[u.id] || 0, u.role === 'merchant' ? 200 : u.race === 'all' && !['giant', 'valkyrie', 'ram', 'catapult', 'eye', 'shadow'].includes(u.role) ? 20 : 1000);
    castle.general = this.newGeneral(castle, 100); // полная прокачка: очки уже распределены
    Object.assign(castle.general.pts, { atk: 20, def: 20, catk: 80, cdef: 60, heal: 10, career: 8 }); castle.general.free = 0;
    castle.sciences = { eco: 20, eng: 20, fhi: 20, war: 20 };
    for (const u of this.forgeUnits(castle)) castle.forge[u.id] = { a: 20, d: 20 }; // Кузница 20/20
    castle.religion = castle.religion || 'war';
    if (castle.artifacts.length < 4) for (const type of ['atk', 'def', 'prod', 'speed']) castle.artifacts.push({ id: this.db.nextId++, type, rarity: 2, active: true, found: Date.now() });
    const cap = this.capacity(castle);
    for (const r of C.RES) castle.res[r] = cap[r];
    castle.resAt = Date.now();
    this.store.save();
  };
  // админ и его команды — server/src/admin.js

  // ----- армии в замке: переформирование, переименование, роспуск, генерал, отзыв подкрепления -----
  P.squadOp = function squadOp(castle, { op, from, to, units = {}, id, name, general = false }) {
    this.tick(castle); this.mil(castle);
    const pick = (k) => (k === 'castle' ? { units: castle.units, castle: true } : castle.squads.find((q) => q.id === Number(k)));
    if (op === 'regroup') { // перенести войска из from в to ('castle', id отряда или 'new')
      const src = pick(from); if (!src) return { error: 'Армия не найдена.' };
      let dst = to === 'new' ? null : pick(to);
      if (to !== 'new' && !dst) return { error: 'Армия не найдена.' };
      const move = {};
      for (const [u, n0] of Object.entries(units)) { const n = Math.floor(Number(n0)); if (!(n > 0)) continue; if ((src.units[u] || 0) < n) return { error: `Не хватает: ${UNIT[u] ? UNIT[u].name : u}.` }; move[u] = n; }
      const g = castle.general, genHere = !!(general && g && !g.dead && !g.away && (src.castle ? !g.squad : g.squad === src.id));
      if (general && !genHere) return { error: 'Генерала нет в этой армии.' };
      if (!Object.keys(move).length && !genHere) return { error: 'Укажите, сколько войск перевести.' };
      if (!dst) {
        if (castle.squads.length >= 20) return { error: 'Не больше 20 армий в замке.' };
        const sid = this.db.nextId++;
        dst = { id: sid, name: `${castle.id}.${sid}`, units: {} }; castle.squads.push(dst);
      }
      if (dst === src) return { error: 'Выберите другую армию.' };
      for (const [u, n] of Object.entries(move)) { src.units[u] -= n; if (!src.units[u]) delete src.units[u]; dst.units[u] = (dst.units[u] || 0) + n; }
      if (genHere) { if (dst.castle) delete g.squad; else g.squad = dst.id; } // генерал переходит вместе с войсками (или один)
      if (!src.castle && !Object.keys(src.units).length && !(g && g.squad === src.id)) castle.squads = castle.squads.filter((q) => q !== src); // пустой отряд распускается
      this.store.save(); return { ok: true, id: dst.castle ? 'castle' : dst.id };
    }
    if (op === 'rename') {
      const q = pick(id); if (!q || q.castle) return { error: 'Армия не найдена.' };
      name = String(name || '').trim().slice(0, 20); if (!name) return { error: 'Введите название.' };
      q.name = name; this.store.save(); return { ok: true };
    }
    if (op === 'disband') { // распустить отряд в Замковую армию
      const q = pick(id); if (!q || q.castle) return { error: 'Армия не найдена.' };
      for (const [u, n] of Object.entries(q.units)) castle.units[u] = (castle.units[u] || 0) + n;
      if (castle.general && castle.general.squad === q.id) delete castle.general.squad;
      castle.squads = castle.squads.filter((x) => x !== q); this.store.save(); return { ok: true };
    }
    if (op === 'general') { // генерал переходит в армию id ('castle' — в Замковую)
      const g = castle.general; if (!g || g.dead || g.away) return { error: 'Генерал недоступен.' };
      if (id === 'castle') delete g.squad; else { const q = pick(id); if (!q || q.castle) return { error: 'Армия не найдена.' }; g.squad = q.id; }
      this.store.save(); return { ok: true };
    }
    if (op === 'recall') { // отозвать подкрепление домой
      const a = castle.armies.find((x) => x.id === Number(id) && x.state === 'stay'); if (!a) return { error: 'Армия не найдена.' };
      this.goBack(castle, a, Date.now()); a.back = Date.now() + (a.sec || 60) * 1000; this.store.save(); return { ok: true };
    }
    return { error: 'Неизвестное действие.' };
  };

  // ----- всё военное/функциональное состояние замка для клиента -----
  P.milState = function milState(castle, user) {
    this.mil(castle);
    const b = this.bonus(castle);
    const al = this.allianceOf(user);
    return {
      trainDay: { used: this.trainedToday(castle), max: TRAIN_DAY, next: (castle.trainLog || [])[0] ? castle.trainLog[0].at + 86400000 : 0 },
      units: castle.units, training: castle.training.map((t) => ({ id: t.id, unit: t.unit, building: t.building, count: t.count, done: t.done, each: t.each, start: t.start })),
      general: castle.general && this.generalView(castle), armies: castle.armies.map((a) => ({ id: a.id, units: a.units, general: a.general, mission: a.mission, x: a.x, y: a.y, depart: a.depart, arrive: a.arrive, back: a.back, state: a.state, loot: a.loot, cargo: a.cargo, squad: a.squad, portal: a.portal,
        stayName: a.state === 'stay' && this.db.castles[a.stayAt] ? this.db.castles[a.stayAt].name : null })),
      squads: castle.squads, merchants: this.merchants(castle),
      guests: this.guestsOf(castle).map((g) => ({ id: g.a.id, from: this.ownerOf(g.c).login, castle: g.c.name, units: g.a.units })),
      incoming: this.incoming(castle), sciences: castle.sciences, research: castle.research, religion: castle.religion,
      artifacts: castle.artifacts, upkeep: Math.round(this.upkeep(castle) * SPEED),
      bonus: { atk: b.atk, def: b.def, magic: b.magic, prod: b.prod, speed: b.speed, train: b.train, build: b.build, wall: b.wall, wallPer: b.wallPer, hidden: b.hidden, marketRate: b.marketRate, artSlots: b.artSlots, artStore: b.artStore, tradeCarry: b.tradeCarry },
      alliance: al ? { id: al.id, name: al.name, tag: al.tag, leader: al.leader, leaderLogin: (this.userById(al.leader) || {}).login, lead: al.leader === user.id, slots: this.allianceSlots(al),
        members: al.members.map((id) => { const m = this.userById(id); return m ? m.login : '?'; }),
        info: al.members.map((id) => { const m = this.userById(id); return m ? { id, login: m.login, rating: this.userRating(m), rep: m.reputation ?? 10 } : null; }).filter(Boolean),
        score: this.allianceScore(al),
        requests: this.allyCan(al, user.id, 'invite') ? (al.requests || []).map((id) => { const m = this.userById(id); return m ? { id, login: m.login, rating: this.userRating(m) } : null; }).filter(Boolean) : [] } : null,
      invites: (user.invites || []).map((id) => this.db.alliances && this.db.alliances[id]).filter(Boolean).map((a) => ({ id: a.id, name: a.name, tag: a.tag })),
      forge: castle.forge, forgeJob: castle.forgeJob, magicJob: castle.magicJob, magicNext: Object.fromEntries(this.forgeUnits(castle).map((u) => [u.id, Object.fromEntries(this.magicKinds(u).map((k) => [k, this.forgeCost(u, this.forgeLvl(castle, u.id, k) + 1)]))])), forgeUnits: this.forgeUnits(castle).map((u) => ({ id: u.id, ...this.forgeCost(u, 0), next: { a: this.forgeCost(u, this.forgeLvl(castle, u.id, 'a') + 1), d: this.forgeCost(u, this.forgeLvl(castle, u.id, 'd') + 1) } })),
      admin: !!user.admin, royal: this.royalView(user, castle), watch: this.hasWatch(user),
      unreadReports: (this.db.reports || []).filter((r) => r.owner === user.id && !r.read).length,
    };
  };

  P.generalView = function generalView(castle) {
    const g = castle.general, gs = this.genStats(g), q = g.squad && castle.squads.find((x) => x.id === g.squad), a = g.away && castle.armies.find((x) => x.id === g.away);
    const where = a ? `армия в походе (${MISSIONS[a.mission]} ${a.x}:${a.y})` : q ? `Армия: ${q.name}` : 'Замковая армия';
    const health = g.dead ? (g.reviveAt && g.reviveStart ? Math.min(99, Math.floor((Date.now() - g.reviveStart) / (g.reviveAt - g.reviveStart) * 100)) : 0) : 100;
    const span = this.generalNeed(g.level) - (g.level > 1 ? this.generalNeed(g.level - 1) : 0), mult = (1 + GEN.career * g.pts.career) * (this.isPremium(this.userById(castle.owner)) ? 2 : 1);
    const today = new Date().toISOString().slice(0, 10), dayExp = g.day && g.day.d === today ? g.day.exp : 0;
    const lim = { battle: Math.max(20, Math.ceil(span * GEN.battleCap * mult)), day: Math.ceil(span * GEN.dayLevels * mult), dayExp };
    return { ...g, foes: undefined, lim, stats: gs, need: this.generalNeed(g.level), prevNeed: g.level > 1 ? this.generalNeed(g.level - 1) : 0, where: `${where}, замок ${castle.name}`, health,
      reviveCost: Object.fromEntries(RES4.map((r) => [r, Math.round(UNIT[GENERAL_ID].cost[r] * GEN.revive * g.level)])), resetGold: GEN.resetGold, perLevel: GEN.perLevel };
  };

  // цвет строки в списке отчётов: зелёный — успех, красный — неудача, коричневый — прочее
  P.reportTone = function reportTone(r) {
    const d = r.data;
    if (d && d.type === 'battle') return (d.side === 'att' ? d.win : !d.win) ? 'win' : 'lose';
    if (d && d.type === 'scout') return d.ok ? 'win' : 'lose';
    if (r.kind === 'scout' || /напал|захвачен/.test(r.title)) return 'lose';
    return 'info';
  };
  P.reportDelete = function reportDelete(user, ids) {
    const set = new Set((ids || []).map(Number));
    const before = (this.db.reports || []).length;
    this.db.reports = (this.db.reports || []).filter((r) => !(r.owner === user.id && (ids === 'read' ? r.read : set.has(r.id))));
    this.store.save();
    return { n: before - this.db.reports.length };
  };
  // переслать отчёт другому игроку — копия с пометкой отправителя
  P.reportForward = function reportForward(user, id, login) {
    const r = (this.db.reports || []).find((y) => y.id === Number(id) && this.canSeeReport(user, y));
    if (!r) return { error: 'Отчёт не найден.' };
    const to = Object.prototype.hasOwnProperty.call(this.db.users, String(login || '').trim()) ? this.db.users[String(login || '').trim()] : null;
    if (!to) return { error: 'Игрок не найден.' };
    if (to.id === user.id) return { error: 'Нельзя переслать самому себе.' };
    this.db.reports.push({ ...JSON.parse(JSON.stringify(r)), id: this.db.nextId++, owner: to.id, at: Date.now(), read: false, from: user.login, title: `${r.title} (от ${user.login})` });
    this.event(to.id, `${user.login} переслал вам отчёт`);
    this.store.save();
    return { msg: `Отчёт переслан игроку ${to.login}.` };
  };
  P.reportsOf = function reportsOf(userId) { return (this.db.reports || []).filter((r) => r.owner === userId).slice(-50).reverse(); };

  void buildTime;
}

const catalogJson = () => ({
  units: UNITS, generalId: GENERAL_ID, sciences: SCIENCES, religions: RELIGIONS, artifacts: ART_TYPES, rarity: RARITY,
  npc: NPC, missions: MISSIONS, raceDir: RACE_DIR, spyOpen: SPY_OPEN, scienceCost: Array.from({ length: 21 }, (_, l) => (l ? scienceCost(l) : null)),
  scienceTime: Array.from({ length: 21 }, (_, l) => (l ? scienceTime(l) : 0)),
});

module.exports = { NEWBIE_RATING, install, UNITS, UNIT, B, GENERAL_ID, GEN, SCIENCES, RELIGIONS, NPC, MISSIONS, unitsForRace, unitImg, catalogJson };
