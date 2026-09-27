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
  [214, 'Топорщик', 'dwarves', 'dwarv/fighter', 'atk_inf', B.BARRACKS, 1],
  [215, 'Арбалетчик', 'dwarves', 'dwarv/arbalet', 'ranged', B.BARRACKS, 3],
  [216, 'Жрец рун', 'dwarves', 'dwarv/elder', 'mage', B.MAGE_ACADEMY, 1],
  [217, 'Грифон', 'dwarves', 'dwarv/gryphon', 'heavy_cav', B.STABLE, 5],
  [218, 'Защитник гор', 'dwarves', 'dwarv/defender', 'def_inf', B.BARRACKS, 1],
  [219, 'Револьверщик', 'dwarves', 'dwarv/revolver', 'elite_inf', B.WORKSHOP, 5],
  [220, 'Йетти', 'dwarves', 'dwarv/yeti', 'legendary', B.PORTAL, 1],
  // орки: имена из оригинала (армия игрока в 3D-клиенте); статы — роли GDD (атака ×2.5, цена ×1.8, еда ×2),
  // Тиран — характеристики оригинала (атака 30, защита 30/30, маг. защита 20, груз 12, скорость 9)
  [245, 'Мародёр', 'orcs', 'human/swordman', 'atk_inf', B.BARRACKS, 1],
  [246, 'Урук-хай', 'orcs', 'dwarv/defender', 'def_inf', B.BARRACKS, 1],
  [250, 'Тиран', 'orcs', 'human/javelineer', 'tyrant', B.BARRACKS, 3],
  [248, 'Шаман', 'orcs', 'dwarv/elder', 'mage', B.MAGE_ACADEMY, 1],
  [247, 'Бугай', 'orcs', 'dwarv/fighter', 'elite_inf', B.BARRACKS, 10, { [B.SMITH]: 5 }],
  [249, 'Кулак Ярости', 'orcs', 'human/knight', 'heavy_cav', B.STABLE, 10, { [B.SMITH]: 10 }],
  [251, 'Изувер', 'orcs', 'dwarv/yeti', 'legendary', B.PORTAL, 1],
  [252, 'Орк загонщик', 'orcs', 'human/scout', 'scout', B.SPY, 1, {}, 'orc_scout'],
  // специальные — у каждой расы своя картинка (units/<раса>/torg.png и т.д.)
  [221, 'Торговец', 'all', 'torg', 'merchant', B.MARKET, 1],
  [224, 'Путешественник', 'all', 'traveler', 'settler', B.TRAVELER, 1],
  [227, 'Мудрец', 'all', 'wisdom', 'sage', B.SAGES, 1],
  [230, 'Археолог', 'all', 'arheolog', 'archaeologist', B.ARCH_CAMP, 1],
  [233, 'Бунтарь', 'all', 'buntar', 'rebel', B.HQ, 5],
  [236, 'Генерал', 'all', 'general', 'general', B.HQ, 1],
  // уникальные (units/unical)
  [239, 'Великан', 'all', 'unical/giant', 'giant', B.TAVERN, 1],
  [240, 'Катапульта', 'all', 'unical/katapulta', 'catapult', B.WORKSHOP, 5],
  [241, 'Око', 'all', 'unical/oko', 'eye', B.SPY, 1],
  [242, 'Тень', 'all', 'unical/shadow', 'shadow', B.SPY, 5],
  [243, 'Таран', 'all', 'unical/taran', 'ram', B.WORKSHOP, 1],
  [244, 'Валькирия', 'all', 'unical/valkiriya', 'valkyrie', B.TAVERN, 5],
];
// роли, которых нет в GDD, — свой баланс в том же формате
const CUSTOM = {
  // Орк загонщик — характеристики оригинала (атака 25, защита 20, скорость 14; цена без акции −50%)
  orc_scout: { type: 'cavalry', attack: 25, magicAttack: 0, defense: { infantry: 20, cavalry: 20, magic: 0 }, speed: 14, carry: 0, upkeepFoodPerHour: 1, population: 1, cost: { wood: 80, stone: 74, iron: 84, food: 170 }, trainTimeSec: 880 },
  tyrant: { type: 'infantry', attack: 30, magicAttack: 0, defense: { infantry: 30, cavalry: 30, magic: 20 }, speed: 9, carry: 12, upkeepFoodPerHour: 2, population: 1, cost: { wood: 120, stone: 120, iron: 120, food: 290 }, trainTimeSec: 700 },
  sage: { type: 'special', attack: 0, magicAttack: 0, defense: { infantry: 5, cavalry: 5, magic: 5 }, speed: 5, carry: 0, upkeepFoodPerHour: 1, population: 1, cost: { wood: 150, stone: 150, iron: 150, food: 300 }, trainTimeSec: 900 },
  giant: { type: 'infantry', attack: 180, magicAttack: 0, defense: { infantry: 120, cavalry: 100, magic: 40 }, speed: 5, carry: 150, upkeepFoodPerHour: 6, population: 5, cost: { wood: 1500, stone: 1500, iron: 2500, food: 1500 }, trainTimeSec: 7200 },
  valkyrie: { type: 'cavalry', attack: 150, magicAttack: 40, defense: { infantry: 90, cavalry: 110, magic: 80 }, speed: 12, carry: 120, upkeepFoodPerHour: 5, population: 4, cost: { wood: 1200, stone: 1000, iron: 2000, food: 1200 }, trainTimeSec: 6000 },
  eye: { type: 'cavalry', attack: 0, magicAttack: 0, defense: { infantry: 30, cavalry: 30, magic: 30 }, speed: 20, carry: 0, upkeepFoodPerHour: 2, population: 2, cost: { wood: 300, stone: 300, iron: 600, food: 200 }, trainTimeSec: 1500, spy: 2 },
  shadow: { type: 'infantry', attack: 110, magicAttack: 0, defense: { infantry: 20, cavalry: 20, magic: 60 }, speed: 15, carry: 30, upkeepFoodPerHour: 2, population: 2, cost: { wood: 500, stone: 400, iron: 800, food: 300 }, trainTimeSec: 2400 },
};

function buildUnit([id, name, race, img, role, building, level, req = {}, stats]) {
  const src = CUSTOM[stats] || CUSTOM[role] || GDD.units.find((u) => u.race === (race === 'all' ? 'humans' : race) && u.role === role);
  return {
    id, name, race, img, role, type: src.type, attack: src.attack, magic: src.magicAttack || 0,
    def: { inf: src.defense.infantry, cav: src.defense.cavalry, mag: src.defense.magic },
    speed: src.speed, carry: src.carry, upkeep: src.upkeepFoodPerHour, pop: src.population,
    cost: { wood: src.cost.wood, stone: src.cost.stone, iron: src.cost.iron, food: src.cost.food },
    time: src.trainTimeSec, building, level, req, spy: role === 'scout' ? 1 : src.spy || 0,
  };
}
const UNITS = UNIT_LIST.map(buildUnit);
const UNIT = Object.fromEntries(UNITS.map((u) => [u.id, u]));
const GENERAL_ID = 236;
const unitsForRace = (race) => UNITS.filter((u) => u.race === race || u.race === 'all');
// генерал как в оригинале: за уровень — очки опыта, игрок распределяет их в окне «Генерал».
// Личная атака/защита — +1 за очко; командование атакой/защитой — +0,3% к армии; восстановление — быстрее воскрешение; карьера — больше опыта.
const GEN = { perLevel: 2, maxLevel: 500, revive: 0.5, cmd: 0.003, heal: 0.02, career: 0.005, resetGold: 100 };
const GEN_STATS = ['atk', 'def', 'catk', 'cdef', 'heal', 'career'];
// звание генерала в скобках — сильнейший боевой юнит расы (у орков «Бугай» и т. п.)
const genKind = (race) => { const l = UNITS.filter((u) => u.race === race && ['infantry', 'cavalry'].includes(u.type)).sort((a, b) => b.attack - a.attack); return l[0] ? l[0].name : 'Генерал'; };
const unitImg = (u, race) => `units/${u.race === 'all' && !u.img.includes('/') ? `${RACE_DIR[race]}/${u.img}` : u.img}.png`;

// ---------- науки (Университет; иконки smallicon/*science.png) ----------
const SCIENCES = {
  eco: { name: 'Экономика', icon: 'Ekoscience', desc: '+3% добычи всех ресурсов за уровень', per: 0.03 },
  eng: { name: 'Инженерия', icon: 'Engscience', desc: '−3% времени строительства за уровень', per: 0.03 },
  fhi: { name: 'Физика', icon: 'Fhiscience', desc: '+4% скорости армий и торговцев за уровень', per: 0.04 },
  war: { name: 'Военное дело', icon: 'Warscience', desc: '+2% атаки и защиты войск за уровень', per: 0.02 },
};
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
  25: { name: 'Дикари', def: { inf: 600, cav: 500, mag: 250 }, loot: { wood: 600, stone: 600, iron: 400, food: 900 } },
  26: { name: 'Лесорубы', def: { inf: 350, cav: 400, mag: 150 }, loot: { wood: 2500, stone: 200, iron: 100, food: 400 } },
  27: { name: 'Рудник троллей', def: { inf: 2500, cav: 2200, mag: 900 }, loot: { wood: 300, stone: 2500, iron: 4000, food: 500 } },
  24: { name: 'Заброшенный замок', def: { inf: 6000, cav: 5500, mag: 2500 }, loot: { wood: 4000, stone: 4000, iron: 4000, food: 4000 }, ruins: true },
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
    if (!castle.squads) castle.squads = []; // отряды в замке («Армия: …»); castle.units — «Замковая армия»
    if (castle.loyalty === undefined) { castle.loyalty = 100; castle.loyAt = Date.now(); }
    return castle;
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
    return {
      atk: (1 + SCIENCES.war.per * sci.war) * (1 + 0.01 * L(B.BREWERY)) * (1 + (rel === 'war' ? 0.01 * templeL : 0)) * (1 + art.atk),
      def: (1 + SCIENCES.war.per * sci.war) * (1 + (rel === 'light' ? 0.01 * templeL : 0)) * (1 + art.def) * (1 + GEN.cmd * gen),
      magic: 1 + 0.02 * L(B.MAGIC_SCHOOL),
      prod: (1 + SCIENCES.eco.per * sci.eco) * (1 + (rel === 'nature' ? 0.01 * templeL : 0)) * (1 + art.prod),
      speed: (1 + SCIENCES.fhi.per * sci.fhi) * (1 + art.speed),
      train: (1 - 0.02 * L(B.ALCHEMY)) * (1 - art.train),
      build: 1 - SCIENCES.eng.per * sci.eng,
      wall: L(B.FENCE), wallPer,
      hidden: L(B.CACHE) ? Math.round(200 * 1.3 ** (L(B.CACHE) - 1)) * (race === 'dwarves' ? 2 : 1) : 0,
      watch: L(B.WATCHTOWER), spyCenter: L(B.SPY), mason: L(B.MASON),
      tradeCarry: 1 + 0.1 * L(B.TRADE_HALL), tradeSpeed: 1 + 0.1 * L(B.TRADE_HALL),
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
  P.train = function train(castle, unitId, count) {
    this.tick(castle);
    const unit = UNIT[unitId]; count = Math.floor(Number(count));
    if (!unit) return { error: 'Неизвестный юнит.' };
    if (!(count > 0)) return { error: 'Укажите количество.' };
    const lock = this.unitLock(castle, unit); if (lock) return { error: lock };
    if (unit.id === GENERAL_ID) {
      if (castle.general || castle.training.some((t) => t.unit === GENERAL_ID)) return { error: 'Генерал в замке может быть только один.' };
      count = 1;
    }
    for (const r of RES4) if (castle.res[r] < unit.cost[r] * count) return { error: 'Недостаточно ресурсов.' };
    if (castle.res.people < unit.pop * count) return { error: 'Не хватает людей (растут с Хибарами).' };
    for (const r of RES4) castle.res[r] -= unit.cost[r] * count;
    castle.res.people -= unit.pop * count;
    const each = this.trainTime(castle, unit) * 1000, now = Date.now();
    const last = castle.training.filter((t) => t.building === unit.building).reduce((m, t) => Math.max(m, t.start + t.each * t.count), now);
    const job = { id: this.db.nextId++, unit: unit.id, building: unit.building, count, done: 0, each, start: last };
    castle.training.push(job);
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

  // ----- генерал -----
  P.generalNeed = (level) => 100 * level * level;
  P.newGeneral = function newGeneral(castle, level = 1) {
    return this.normGeneral({ name: 'Генерал', level, exp: level > 1 ? this.generalNeed(level - 1) : 0, dead: false }, castle);
  };
  // дополняет старые записи генерала полями нового окна (очки, имя, сбросы)
  P.normGeneral = function normGeneral(g, castle) {
    if (!g.pts) { g.pts = Object.fromEntries(GEN_STATS.map((k) => [k, 0])); g.free = GEN.perLevel * Math.max(0, g.level - 1); }
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
  P.addGeneralExp = function addGeneralExp(castle, exp) {
    const g = castle.general; if (!g || g.dead) return;
    this.normGeneral(g, castle);
    g.exp += Math.round(exp * (1 + GEN.career * g.pts.career));
    while (g.level < GEN.maxLevel && g.exp >= this.generalNeed(g.level)) { g.level++; g.free += GEN.perLevel; this.event(castle.owner, `Генерал достиг ${g.level} уровня!`); }
  };
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
      else { if ((user.gold || 0) < GEN.resetGold) return { error: `Нужно ${GEN.resetGold} золота.` }; user.gold -= GEN.resetGold; }
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
      if (mission !== 'attack' && mission !== 'raid') general = false;
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
    const units = Object.fromEntries(Object.entries(a.units).filter(([, n]) => n > 0));
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
  P.goBack = function goBack(c, a, t) {
    const alive = Object.values(a.units).some((n) => n > 0) || (a.general && c.general && !c.general.dead);
    if (!alive) { c.armies = c.armies.filter((x) => x !== a); if (a.general && c.general) delete c.general.away; return; }
    a.state = 'back';
    a.back = t + (a.arrive - a.depart);
  };

  // сила атаки армии
  P.armyPower = function armyPower(c, units, withGeneral) {
    const b = this.bonus(c);
    let inf = 0, cav = 0, mag = 0;
    for (const [id, n] of Object.entries(units)) {
      const u = UNIT[id]; if (!u || !n) continue;
      const atk = u.attack ? u.attack + this.forgeLvl(c, id, 'a') : 0; // Кузница: +1 к базовой атаке за уровень
      if (u.type === 'cavalry') cav += atk * n; else inf += atk * n;
      mag += u.magic * n;
    }
    let gl = 0;
    let cmd = 0;
    if (withGeneral && c.general && !c.general.dead) { const gs = this.genStats(c.general); gl = c.general.level; cmd = gs.catk; inf += gs.atk; mag += UNIT[GENERAL_ID].magic; }
    const k = b.atk * (1 + cmd);
    return { inf: inf * k, cav: cav * k, mag: mag * b.magic * b.atk, gl };
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
  P.defensePower = function defensePower(d, pInf, pCav) {
    const b = this.bonus(d);
    let phys = 0, mag = 0;
    const add = (id, n) => { const u = UNIT[id]; if (!u || !n) return; const fd = this.forgeLvl(d, id, 'd'); phys += ((u.def.inf + fd) * pInf + (u.def.cav + fd) * pCav) * n; mag += u.def.mag * n; };
    for (const m of this.defenders(d)) for (const [id, n] of Object.entries(m)) add(id, n);
    if (d.general && !d.general.dead && !d.general.away) { add(GENERAL_ID, 1); phys += d.general.pts.def * (pInf + pCav); }
    phys = (phys * b.def + 10 * b.wall) * (1 + b.wallPer * b.wall);
    return { phys, mag: mag * b.def * b.magic };
  };
  const applyLoss = (units, frac) => {
    const lost = {};
    for (const [id, n] of Object.entries(units)) { const l = Math.min(n, Math.round(n * frac)); lost[id] = l; units[id] = n - l; }
    return lost;
  };
  const unitsLine = (units, lost) => Object.entries(units).filter(([id]) => UNIT[id]).map(([id, n]) => `${UNIT[id].name}: ${n + (lost ? lost[id] || 0 : 0)}${lost && lost[id] ? ` (−${lost[id]})` : ''}`).join(', ') || '—';
  const mergeUnits = (maps) => { const o = {}; for (const m of maps) for (const [id, n] of Object.entries(m)) if (n > 0) o[id] = (o[id] || 0) + n; return o; };
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
    const aSum = aTot;
    let aLoss, dLoss;
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
    const aliveAfter = Object.values(a.units).some((n) => n > 0);
    // генералы
    if (a.general && c.general) {
      if (!aliveAfter && aLoss >= 1) { c.general.dead = true; delete c.general.away; a.general = false; }
      else this.addGeneralExp(c, target ? popOf(dLost) * 10 : (npc ? Math.round(npc.def.inf / 20 * dLoss) : 0));
    }
    if (target && target.general && !target.general.dead && !target.general.away) {
      if (dLoss >= 1 && !Object.keys(dAll).length) target.general.dead = true; else this.addGeneralExp(target, popOf(aLost) * 10);
    }
    // добыча
    let loot = null;
    if (aliveAfter) {
      let carry = Object.entries(a.units).reduce((s, [id, n]) => s + UNIT[id].carry * n, 0);
      loot = { wood: 0, stone: 0, iron: 0, food: 0 };
      let avail;
      if (target) { const hid = this.bonus(target).hidden; avail = Object.fromEntries(RES4.map((r) => [r, Math.max(0, Math.floor(target.res[r]) - hid)])); }
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
    const siege = [];
    if (target && a.mission === 'attack' && win) {
      const b = this.bonus(target);
      let ram = (a.units[243] || 0) * UNIT[243].attack;
      let wallL = b.wall;
      while (wallL > 0 && ram >= Math.round(2 * 1.25 ** wallL)) { ram -= Math.round(2 * 1.25 ** wallL); wallL--; }
      if (wallL < b.wall) { this.setBuildingLevel(target, B.FENCE, wallL); siege.push(`Забор: ${b.wall} → ${wallL} ур.`); }
      let cat = (a.units[240] || 0) * UNIT[240].attack / (1 + 0.05 * b.mason);
      const cells = Array.from(target.grid[0], (id, i) => [id, i]).filter(([id, i]) => id > 0 && target.levels[0][i] > 0);
      if (cat > 0 && cells.length) {
        const [bid, cell] = cells[Math.floor(Math.random() * cells.length)];
        let L = target.levels[0][cell]; const L0 = L;
        while (L > 0 && cat >= Math.round(3 * 1.25 ** L)) { cat -= Math.round(3 * 1.25 ** L); L--; }
        if (L < L0) { target.levels[0][cell] = L; if (!L) target.grid[0][cell] = -1; siege.push(`${C.BY_ID[bid].name}: ${L0} → ${L} ур.`); }
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
    if (target) this.addStat(target.owner, 'defKills', popOf(aLost));
    const defUser = target && this.ownerOf(target);
    const tname = target ? `${target.name} (${captured ? captured.prevLogin : defUser.login})` : `${npc.name} ${where}`;
    const side = (units, lost) => Object.fromEntries(Object.entries(units).map(([id, n]) => [id, { was: n + (lost[id] || 0), lost: lost[id] || 0 }]).filter(([, v]) => v.was > 0));
    const genDied = !!(c.general && c.general.dead && a.general === false && aLoss >= 1);
    const data = {
      type: 'battle', mission: a.mission, win, x: a.x, y: a.y, power: { att: Math.round(aSum), def: Math.round(Dsum) },
      att: { login: att.login, race: att.race, castle: c.name, units: side(a.units, aLost), general: a.general || genDied ? (c.general ? c.general.level : 0) : 0, generalDied: genDied },
      def: target ? { login: captured ? captured.prevLogin : defUser.login, race: captured ? captured.prevRace : defUser.race, castle: target.name, units: side(dAll, dLost), wall: this.bonus(target).wall }
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
    const title = captured ? `Захват: ${captured.name} ${where} — замок ваш!` : `${MISSIONS[a.mission]}: ${tname} — ${win ? 'победа' : 'поражение'}`;
    this.report(c.owner, title, lines, 'battle', { ...data, side: 'att' });
    if (target) {
      this.report(captured ? captured.prevOwner : target.owner, captured ? `Ваш замок ${target.name} захвачен игроком ${att.login}!` : `На ваш замок напал ${att.login}: ${win ? 'поражение' : 'отбились'}`, [
        `${MISSIONS[a.mission]} от ${att.login} (${c.name}).`,
        `Атакующие: ${unitsLine(a.units, aLost)}`,
        `Ваши войска: ${unitsLine(dAll, dLost)}`,
        loot ? `Унесено: дерево ${loot.wood}, камень ${loot.stone}, железо ${loot.iron}, еда ${loot.food}` : 'Враг разбит, ничего не унесено.',
        ...siege, ...(loyalty ? [`Лояльность: ${loyalty.from} → ${loyalty.to}`] : []),
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
    this.report(c.owner, `Разведка ${target ? target.name : where}${alive ? '' : ' — провал'}`, lines, 'scout');
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
      this.addStat(c.owner, 'arts', 1);
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
  P.allianceSlots = function allianceSlots(al) {
    const leader = this.userById(al.leader), lc = leader && this.castleOf(leader);
    return 3 * Math.max(1, lc ? this.buildingLevel(lc, B.EMBASSY) : 1); // 3 места за уровень центра главы (10 ур. — 30)
  };
  P.joinAlliance = function joinAlliance(user, al) {
    if (al.members.length >= this.allianceSlots(al)) return { error: `В альянсе нет мест (${this.allianceSlots(al)}).` };
    al.members.push(user.id); user.alliance = al.id;
    user.invites = []; // вступил — остальные приглашения больше не нужны
    for (const a of Object.values(this.db.alliances)) if (a.requests) a.requests = a.requests.filter((id) => id !== user.id);
    for (const id of al.members) if (id !== user.id) this.event(id, `${user.login} вступил в альянс [${al.tag}].`);
    this.store.save(); return { ok: true };
  };
  P.alliance = function alliance(user, castle, { op, name, tag, id, login }) {
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
    if (['invite', 'approve', 'reject', 'kick'].includes(op)) {
      if (!cur) return { error: 'Вы не в альянсе.' };
      if (cur.leader !== user.id) return { error: 'Это может только глава альянса.' };
      const t = login !== undefined ? this.db.users[String(login).trim().toLowerCase()] : this.userById(id);
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
      if (op === 'kick') {
        if (t.id === user.id || !cur.members.includes(t.id)) return { error: 'Нельзя исключить.' };
        cur.members = cur.members.filter((m) => m !== t.id); delete t.alliance;
        this.event(t.id, `Вас исключили из альянса [${cur.tag}].`); this.store.save(); return { ok: true };
      }
    }
    if (op === 'leave') {
      if (!cur) return { error: 'Вы не в альянсе.' };
      cur.members = cur.members.filter((m) => m !== user.id); delete user.alliance;
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
    const cells = [...Array(49).keys()].filter((i) => i !== 24);
    castle.grid[0] = new Int8Array(49).fill(-1); castle.levels[0] = new Int8Array(49);
    castle.grid[0][24] = 0; castle.levels[0][24] = C.BY_ID[0].max;
    let k = 0;
    for (const b of castleBuildings) { const i = cells[k++]; castle.grid[0][i] = b.id; castle.levels[0][i] = b.max; }
    for (let n = 0; n < 20 && k < cells.length; n++) { const i = cells[k++]; castle.grid[0][i] = 1; castle.levels[0][i] = C.BY_ID[1].max; } // 20 складов = 100 200
    while (k < cells.length) { const i = cells[k++]; castle.grid[0][i] = 14; castle.levels[0][i] = C.BY_ID[14].max; } // оставшиеся клетки — Дом мудрецов
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
  P.squadOp = function squadOp(castle, { op, from, to, units = {}, id, name }) {
    this.tick(castle); this.mil(castle);
    const pick = (k) => (k === 'castle' ? { units: castle.units, castle: true } : castle.squads.find((q) => q.id === Number(k)));
    if (op === 'regroup') { // перенести войска из from в to ('castle', id отряда или 'new')
      const src = pick(from); if (!src) return { error: 'Армия не найдена.' };
      let dst = to === 'new' ? null : pick(to);
      if (to !== 'new' && !dst) return { error: 'Армия не найдена.' };
      const move = {};
      for (const [u, n0] of Object.entries(units)) { const n = Math.floor(Number(n0)); if (!(n > 0)) continue; if ((src.units[u] || 0) < n) return { error: `Не хватает: ${UNIT[u] ? UNIT[u].name : u}.` }; move[u] = n; }
      if (!Object.keys(move).length) return { error: 'Укажите, сколько войск перевести.' };
      if (!dst) {
        if (castle.squads.length >= 20) return { error: 'Не больше 20 армий в замке.' };
        const sid = this.db.nextId++;
        dst = { id: sid, name: `${castle.id}.${sid}`, units: {} }; castle.squads.push(dst);
      }
      if (dst === src) return { error: 'Выберите другую армию.' };
      for (const [u, n] of Object.entries(move)) { src.units[u] -= n; if (!src.units[u]) delete src.units[u]; dst.units[u] = (dst.units[u] || 0) + n; }
      if (!src.castle && !Object.keys(src.units).length) castle.squads = castle.squads.filter((q) => q !== src); // пустой отряд распускается
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
      units: castle.units, training: castle.training.map((t) => ({ id: t.id, unit: t.unit, building: t.building, count: t.count, done: t.done, each: t.each, start: t.start })),
      general: castle.general && this.generalView(castle), armies: castle.armies.map((a) => ({ id: a.id, units: a.units, general: a.general, mission: a.mission, x: a.x, y: a.y, depart: a.depart, arrive: a.arrive, back: a.back, state: a.state, loot: a.loot, cargo: a.cargo, squad: a.squad, portal: a.portal,
        stayName: a.state === 'stay' && this.db.castles[a.stayAt] ? this.db.castles[a.stayAt].name : null })),
      squads: castle.squads,
      guests: this.guestsOf(castle).map((g) => ({ id: g.a.id, from: this.ownerOf(g.c).login, castle: g.c.name, units: g.a.units })),
      incoming: this.incoming(castle), sciences: castle.sciences, research: castle.research, religion: castle.religion,
      artifacts: castle.artifacts, upkeep: Math.round(this.upkeep(castle) * SPEED),
      bonus: { atk: b.atk, def: b.def, magic: b.magic, prod: b.prod, speed: b.speed, train: b.train, build: b.build, wall: b.wall, wallPer: b.wallPer, hidden: b.hidden, marketRate: b.marketRate, artSlots: b.artSlots, artStore: b.artStore, tradeCarry: b.tradeCarry },
      alliance: al ? { id: al.id, name: al.name, tag: al.tag, leader: al.leader, leaderLogin: (this.userById(al.leader) || {}).login, lead: al.leader === user.id, slots: this.allianceSlots(al),
        members: al.members.map((id) => { const m = this.userById(id); return m ? m.login : '?'; }),
        requests: al.leader === user.id ? (al.requests || []).map((id) => { const m = this.userById(id); return m ? { id, login: m.login, rating: this.userRating(m) } : null; }).filter(Boolean) : [] } : null,
      invites: (user.invites || []).map((id) => this.db.alliances && this.db.alliances[id]).filter(Boolean).map((a) => ({ id: a.id, name: a.name, tag: a.tag })),
      forge: castle.forge, forgeJob: castle.forgeJob, forgeUnits: this.forgeUnits(castle).map((u) => ({ id: u.id, ...this.forgeCost(u, 0), next: { a: this.forgeCost(u, this.forgeLvl(castle, u.id, 'a') + 1), d: this.forgeCost(u, this.forgeLvl(castle, u.id, 'd') + 1) } })),
      admin: !!user.admin, royal: this.royalView(user, castle), watch: this.hasWatch(user),
      unreadReports: (this.db.reports || []).filter((r) => r.owner === user.id && !r.read).length,
    };
  };

  P.generalView = function generalView(castle) {
    const g = castle.general, gs = this.genStats(g), q = g.squad && castle.squads.find((x) => x.id === g.squad), a = g.away && castle.armies.find((x) => x.id === g.away);
    const where = a ? `армия в походе (${MISSIONS[a.mission]} ${a.x}:${a.y})` : q ? `Армия: ${q.name}` : 'Замковая армия';
    const health = g.dead ? (g.reviveAt && g.reviveStart ? Math.min(99, Math.floor((Date.now() - g.reviveStart) / (g.reviveAt - g.reviveStart) * 100)) : 0) : 100;
    return { ...g, stats: gs, need: this.generalNeed(g.level), prevNeed: g.level > 1 ? this.generalNeed(g.level - 1) : 0, where: `${where}, замок ${castle.name}`, health,
      reviveCost: Object.fromEntries(RES4.map((r) => [r, Math.round(UNIT[GENERAL_ID].cost[r] * GEN.revive * g.level)])), resetGold: GEN.resetGold, perLevel: GEN.perLevel };
  };

  P.reportsOf = function reportsOf(userId) { return (this.db.reports || []).filter((r) => r.owner === userId).slice(-50).reverse(); };

  void buildTime;
}

const catalogJson = () => ({
  units: UNITS, generalId: GENERAL_ID, sciences: SCIENCES, religions: RELIGIONS, artifacts: ART_TYPES, rarity: RARITY,
  npc: NPC, missions: MISSIONS, raceDir: RACE_DIR, spyOpen: SPY_OPEN, scienceCost: Array.from({ length: 21 }, (_, l) => (l ? scienceCost(l) : null)),
  scienceTime: Array.from({ length: 21 }, (_, l) => (l ? scienceTime(l) : 0)),
});

module.exports = { install, UNITS, UNIT, B, GENERAL_ID, GEN, SCIENCES, RELIGIONS, NPC, MISSIONS, unitsForRace, unitImg, catalogJson };
