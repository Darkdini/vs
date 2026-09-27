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

const SPEED = Number(process.env.SPEED || 10);
const GDD = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'units.json'), 'utf8'));
const RES4 = ['wood', 'stone', 'iron', 'food'];
const RACE_DIR = { humans: 'human', elves: 'elf', dwarves: 'dwarv' };

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
  [202, 'Разведчик', 'humans', 'human/scout', 'scout', B.STABLE, 1],
  [203, 'Чародей', 'humans', 'human/mage', 'mage', B.MAGE_ACADEMY, 1],
  [204, 'Рыцарь', 'humans', 'human/knight', 'elite_inf', B.BARRACKS, 10, { [B.SMITH]: 5 }],
  [205, 'Паладин', 'humans', 'human/paladin', 'heavy_cav', B.STABLE, 10, { [B.SMITH]: 10 }],
  [206, 'Джин', 'humans', 'human/jin', 'legendary', B.PORTAL, 1],
  [207, 'Эльф лучник', 'elves', 'elf/archer', 'ranged', B.BARRACKS, 1],
  [208, 'Танцующий', 'elves', 'elf/fighter', 'atk_inf', B.BARRACKS, 1],
  [209, 'Скаут', 'elves', 'elf/scout', 'scout', B.STABLE, 1],
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
  sage: { type: 'special', attack: 0, magicAttack: 0, defense: { infantry: 5, cavalry: 5, magic: 5 }, speed: 5, carry: 0, upkeepFoodPerHour: 1, population: 1, cost: { wood: 150, stone: 150, iron: 150, food: 300 }, trainTimeSec: 900 },
  giant: { type: 'infantry', attack: 180, magicAttack: 0, defense: { infantry: 120, cavalry: 100, magic: 40 }, speed: 5, carry: 150, upkeepFoodPerHour: 6, population: 5, cost: { wood: 1500, stone: 1500, iron: 2500, food: 1500 }, trainTimeSec: 7200 },
  valkyrie: { type: 'cavalry', attack: 150, magicAttack: 40, defense: { infantry: 90, cavalry: 110, magic: 80 }, speed: 12, carry: 120, upkeepFoodPerHour: 5, population: 4, cost: { wood: 1200, stone: 1000, iron: 2000, food: 1200 }, trainTimeSec: 6000 },
  eye: { type: 'cavalry', attack: 0, magicAttack: 0, defense: { infantry: 30, cavalry: 30, magic: 30 }, speed: 20, carry: 0, upkeepFoodPerHour: 2, population: 2, cost: { wood: 300, stone: 300, iron: 600, food: 200 }, trainTimeSec: 1500, spy: 2 },
  shadow: { type: 'infantry', attack: 110, magicAttack: 0, defense: { infantry: 20, cavalry: 20, magic: 60 }, speed: 15, carry: 30, upkeepFoodPerHour: 2, population: 2, cost: { wood: 500, stone: 400, iron: 800, food: 300 }, trainTimeSec: 2400 },
};

function buildUnit([id, name, race, img, role, building, level, req = {}]) {
  const src = CUSTOM[role] || GDD.units.find((u) => u.race === (race === 'all' ? 'humans' : race) && u.role === role);
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
const NEWBIE_RATING = Number(process.env.NEWBIE_RATING || 300); // защита новичка: на слабых игроков нападать нельзя

const MISSIONS = { attack: 'Атака', raid: 'Набег', scout: 'Разведка', expedition: 'Экспедиция', trade: 'Торговля' };

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
    if (castle.research === undefined) castle.research = null;
    if (castle.religion === undefined) castle.religion = null;
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
    const gen = castle.general && !castle.general.dead && !castle.general.away ? castle.general.level : 0;
    const race = this.raceOf(castle);
    const wallPer = { humans: 0.03, elves: 0.035, dwarves: 0.02 }[race] || 0.03;
    return {
      atk: (1 + 0.015 * L(B.SMITH)) * (1 + SCIENCES.war.per * sci.war) * (1 + 0.01 * L(B.BREWERY)) * (1 + (rel === 'war' ? 0.01 * templeL : 0)) * (1 + art.atk),
      def: (1 + 0.015 * L(B.SMITH)) * (1 + SCIENCES.war.per * sci.war) * (1 + (rel === 'light' ? 0.01 * templeL : 0)) * (1 + art.def) * (1 + 0.01 * gen),
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
    for (const a of castle.armies) add(a.units);
    if (castle.general && !castle.general.dead) s += UNIT[GENERAL_ID].upkeep;
    return s;
  };

  // ----- тренировка -----
  P.trainTime = function trainTime(castle, unit) {
    const bl = Math.max(1, this.buildingLevel(castle, unit.building));
    return Math.max(1, Math.round(unit.time * 0.9 ** (bl - 1) * this.bonus(castle).train / SPEED));
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
    if (castle.loyalty < 100) castle.loyalty = Math.min(100, castle.loyalty + (2 + this.buildingLevel(castle, B.TEMPLE)) * SPEED * Math.max(0, now - castle.loyAt) / 3600000);
    castle.loyAt = now;
    const owner = castle.owner;
    castle.training = castle.training.filter((t) => {
      const ready = Math.max(0, Math.min(t.count, Math.floor((now - t.start) / t.each)));
      if (ready > t.done) {
        const n = ready - t.done; t.done = ready;
        if (t.unit === GENERAL_ID) castle.general = { level: 1, exp: 0, dead: false };
        else castle.units[t.unit] = (castle.units[t.unit] || 0) + n;
        if (t.done === t.count) this.event(owner, `Готово: ${UNIT[t.unit].name} ×${t.count}`);
      }
      return t.done < t.count;
    });
    // генерал воскрес
    const g = castle.general;
    if (g && g.dead && g.reviveAt && g.reviveAt <= now) { g.dead = false; delete g.reviveAt; this.event(owner, 'Генерал снова в строю.'); }
    // исследование
    if (castle.research && castle.research.end <= now) {
      castle.sciences[castle.research.sci] = castle.research.level;
      this.event(owner, `Изучено: ${SCIENCES[castle.research.sci].name} ${castle.research.level} ур.`);
      castle.research = null;
    }
  };

  // ----- генерал -----
  P.generalNeed = (level) => 100 * level * level;
  P.addGeneralExp = function addGeneralExp(castle, exp) {
    const g = castle.general; if (!g || g.dead) return;
    g.exp += Math.round(exp);
    while (g.level < 20 && g.exp >= this.generalNeed(g.level)) { g.level++; this.event(castle.owner, `Генерал достиг ${g.level} уровня!`); }
  };
  P.reviveGeneral = function reviveGeneral(castle) {
    this.tick(castle);
    const g = castle.general;
    if (!g || !g.dead) return { error: 'Генерал жив.' };
    if (g.reviveAt) return { error: 'Воскрешение уже идёт.' };
    const cost = UNIT[GENERAL_ID].cost, k = 0.5 * g.level;
    for (const r of RES4) if (castle.res[r] < cost[r] * k) return { error: 'Недостаточно ресурсов.' };
    for (const r of RES4) castle.res[r] -= Math.round(cost[r] * k);
    g.reviveAt = Date.now() + Math.max(5, Math.round(g.level * 3600 / SPEED)) * 1000;
    this.store.save();
    return { ok: true };
  };

  // ----- марши -----
  P.castleAt = function castleAt(x, y) { return Object.values(this.db.castles).find((c) => c.x === x && c.y === y); };
  P.travelSec = function travelSec(castle, units, general, x, y, merchants = false) {
    const speeds = Object.keys(units).filter((id) => units[id] > 0).map((id) => UNIT[id].speed);
    if (general) speeds.push(UNIT[GENERAL_ID].speed);
    if (!speeds.length) return 0;
    const b = this.bonus(castle);
    const v = Math.min(...speeds) * b.speed * (merchants ? b.tradeSpeed : 1);
    return Math.max(5, Math.round(Math.hypot(x - castle.x, y - castle.y) / v * 3600 / SPEED));
  };
  P.sendArmy = function sendArmy(castle, { units = {}, general = false, x, y, mission, res = null }) {
    this.tick(castle);
    x = Math.round(Number(x)); y = Math.round(Number(y));
    if (!MISSIONS[mission]) return { error: 'Неизвестная миссия.' };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Укажите координаты цели.' };
    if (x === castle.x && y === castle.y) return { error: 'Это ваш замок.' };
    if (!this.buildingLevel(castle, B.HQ) && mission !== 'trade') return { error: 'Нужен Военный штаб.' };
    const clean = {};
    for (const [id, n0] of Object.entries(units)) {
      const n = Math.floor(Number(n0)); if (!(n > 0)) continue;
      if (!UNIT[id] || (castle.units[id] || 0) < n) return { error: `Не хватает: ${UNIT[id] ? UNIT[id].name : id}.` };
      clean[id] = n;
    }
    const roles = Object.keys(clean).map((id) => UNIT[id].role);
    const g = castle.general;
    if (general && (!g || g.dead || g.away)) return { error: 'Генерал недоступен.' };
    if (!roles.length && !general) return { error: 'Выберите войска.' };
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
    if (target && target.owner === castle.owner && mission !== 'trade') return { error: 'Это ваш замок.' };
    const me = this.ownerOf(castle);
    if (target && ['attack', 'raid', 'scout'].includes(mission) && !me.admin && this.rating(target) < NEWBIE_RATING) return { error: `Игрок под защитой новичка (рейтинг ниже ${NEWBIE_RATING}).` };
    if (!target && (!obj || (!NPC[obj.img] && mission !== 'scout'))) return { error: 'Здесь некого атаковать.' };
    for (const [id, n] of Object.entries(clean)) { castle.units[id] -= n; if (!castle.units[id]) delete castle.units[id]; }
    const sec = this.travelSec(castle, clean, general, x, y, mission === 'trade');
    const now = Date.now();
    const army = { id: this.db.nextId++, units: clean, general: !!general, mission, x, y, depart: now, arrive: now + sec * 1000, state: 'go', loot: null, cargo };
    if (general) g.away = army.id;
    castle.armies.push(army);
    this.store.save();
    return { army, sec };
  };

  // ----- мир: армии прибывают и возвращаются (вызывается раз в секунду для всех замков) -----
  P.tickWorld = function tickWorld(now = Date.now()) {
    const due = [];
    for (const c of Object.values(this.db.castles)) {
      this.mil(c);
      for (const a of c.armies) if ((a.state === 'go' && a.arrive <= now) || (a.state === 'back' && a.back <= now)) due.push([c, a]);
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
    for (const [id, n] of Object.entries(a.units)) if (n > 0) c.units[id] = (c.units[id] || 0) + n;
    if (a.general && c.general && c.general.away === a.id) delete c.general.away;
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
      if (u.type === 'cavalry') cav += u.attack * n; else inf += u.attack * n;
      mag += u.magic * n;
    }
    let gl = 0;
    if (withGeneral && c.general && !c.general.dead) { gl = c.general.level; inf += UNIT[GENERAL_ID].attack; mag += UNIT[GENERAL_ID].magic; }
    const k = b.atk * (1 + 0.01 * gl);
    return { inf: inf * k, cav: cav * k, mag: mag * b.magic * b.atk, gl };
  };
  // сила обороны замка против атаки с долями пехоты/кавалерии
  P.defensePower = function defensePower(d, pInf, pCav) {
    const b = this.bonus(d);
    let phys = 0, mag = 0;
    const add = (id, n) => { const u = UNIT[id]; if (!u || !n) return; phys += (u.def.inf * pInf + u.def.cav * pCav) * n; mag += u.def.mag * n; };
    for (const [id, n] of Object.entries(d.units)) add(id, n);
    if (d.general && !d.general.dead && !d.general.away) add(GENERAL_ID, 1);
    phys = (phys * b.def + 10 * b.wall) * (1 + b.wallPer * b.wall);
    return { phys, mag: mag * b.def * b.magic };
  };
  const applyLoss = (units, frac) => {
    const lost = {};
    for (const [id, n] of Object.entries(units)) { const l = Math.min(n, Math.round(n * frac)); lost[id] = l; units[id] = n - l; }
    return lost;
  };
  const unitsLine = (units, lost) => Object.entries(units).filter(([id]) => UNIT[id]).map(([id, n]) => `${UNIT[id].name}: ${n + (lost ? lost[id] || 0 : 0)}${lost && lost[id] ? ` (−${lost[id]})` : ''}`).join(', ') || '—';
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
    if (target) { dBefore = { ...target.units }; dLost = applyLoss(target.units, dLoss); for (const id of Object.keys(target.units)) if (!target.units[id]) delete target.units[id]; }
    const win = aSum > Dsum;
    const aliveAfter = Object.values(a.units).some((n) => n > 0);
    // генералы
    if (a.general && c.general) {
      if (!aliveAfter && aLoss >= 1) { c.general.dead = true; delete c.general.away; a.general = false; }
      else this.addGeneralExp(c, target ? popOf(dLost) * 10 : (npc ? Math.round(npc.def.inf / 20 * dLoss) : 0));
    }
    if (target && target.general && !target.general.dead && !target.general.away) {
      if (dLoss >= 1 && !Object.keys(target.units).length) target.general.dead = true; else this.addGeneralExp(target, popOf(aLost) * 10);
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
      const cells = target.grid[0].map((id, i) => [id, i]).filter(([id, i]) => id > 0 && target.levels[0][i] > 0);
      if (cat > 0 && cells.length) {
        const [bid, cell] = cells[Math.floor(Math.random() * cells.length)];
        let L = target.levels[0][cell]; const L0 = L;
        while (L > 0 && cat >= Math.round(3 * 1.25 ** L)) { cat -= Math.round(3 * 1.25 ** L); L--; }
        if (L < L0) { target.levels[0][cell] = L; if (!L) target.grid[0][cell] = -1; siege.push(`${C.BY_ID[bid].name}: ${L0} → ${L} ур.`); }
      }
    }
    // бунтари: выжившие в победной атаке снижают лояльность, при 0 — захват (GDD §10–11)
    let loyalty = null, captured = null, capitalBlocked = false;
    const rebels = a.mission === 'attack' && win ? (a.units[233] || 0) : 0;
    if (rebels) {
      let drop = 0;
      for (let k = 0; k < Math.min(rebels, 10); k++) drop += 20 + Math.floor(Math.random() * 11);
      if (target && this.isCapital(target)) capitalBlocked = true;
      else if (target) {
        const from = Math.round(target.loyalty); target.loyalty = Math.max(0, target.loyalty - drop); target.loyAt = t;
        loyalty = { from, to: Math.round(target.loyalty) };
        if (target.loyalty <= 0) captured = this.captureCastle(att, target);
      } else if (npc && npc.ruins) {
        const st = (this.db.npc = this.db.npc || {})[where] || (this.db.npc[where] = {});
        const from = Math.round(st.loyalty ?? 100); st.loyalty = Math.max(0, from - drop);
        loyalty = { from, to: st.loyalty };
        if (st.loyalty <= 0) { delete this.db.npc[where]; captured = this.foundCaptured(att, a.x, a.y); }
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
      def: target ? { login: captured ? captured.prevLogin : defUser.login, race: captured ? captured.prevRace : defUser.race, castle: target.name, units: side(target.units, dLost), wall: this.bonus(target).wall }
        : { npc: npc.name, img: obj.img, lossPct: Math.round(dLoss * 100) },
      loot, siege, loyalty, capitalBlocked, captured: captured ? { name: captured.name, x: a.x, y: a.y } : null,
    };
    const lines = [
      `${MISSIONS[a.mission]} на ${tname}. ${win ? 'Победа!' : 'Поражение.'}`,
      `Сила: атака ${Math.round(aSum)} против обороны ${Math.round(Dsum)}`,
      `Ваши войска: ${unitsLine(a.units, aLost)}${a.general ? ` + генерал ${c.general ? c.general.level : ''} ур.` : ''}`,
      target ? `Защитники: ${unitsLine(target.units, dLost)}` : `Охрана лагеря потеряла ${Math.round(dLoss * 100)}%`,
      loot ? `Добыча: дерево ${loot.wood}, камень ${loot.stone}, железо ${loot.iron}, еда ${loot.food}` : 'Добычи нет — армия погибла.',
      ...siege,
    ];
    if (loyalty) lines.push(`Лояльность: ${loyalty.from} → ${loyalty.to}`);
    if (capitalBlocked) lines.push('Столицу захватить нельзя — бунтари бессильны.');
    if (captured) lines.push(`Замок захвачен! Теперь это ваш замок «${captured.name}».`);
    if (genDied) lines.push('Генерал пал в бою — воскресите его в Военном штабе.');
    const title = captured ? `Захват: ${captured.name} ${where} — замок ваш!` : `${MISSIONS[a.mission]}: ${tname} — ${win ? 'победа' : 'поражение'}`;
    this.report(c.owner, title, lines, 'battle', { ...data, side: 'att' });
    if (target) {
      this.report(captured ? captured.prevOwner : target.owner, captured ? `Ваш замок ${target.name} захвачен игроком ${att.login}!` : `На ваш замок напал ${att.login}: ${win ? 'поражение' : 'отбились'}`, [
        `${MISSIONS[a.mission]} от ${att.login} (${c.name}).`,
        `Атакующие: ${unitsLine(a.units, aLost)}`,
        `Ваши войска: ${unitsLine(target.units, dLost)}`,
        loot ? `Унесено: дерево ${loot.wood}, камень ${loot.stone}, железо ${loot.iron}, еда ${loot.food}` : 'Враг разбит, ничего не унесено.',
        ...siege, ...(loyalty ? [`Лояльность: ${loyalty.from} → ${loyalty.to}`] : []),
      ], 'battle', { ...data, side: 'def' });
    }
    this.goBack(c, a, t);
  };

  // захват чужого (не столичного) замка: переходит к нападающему, войска и очереди прежнего хозяина пропадают
  P.captureCastle = function captureCastle(att, castle) {
    const prev = this.ownerOf(castle);
    prev.castleIds = this.castlesOf(prev).filter((k) => k !== castle).map((k) => k.id);
    if (prev.castleId === castle.id) prev.castleId = prev.castleIds[0];
    castle.owner = att.id;
    castle.units = {}; castle.training = []; castle.armies = []; castle.general = null; castle.research = null;
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
  P.scout = function scout(c, a, t, target) {
    const spies = Object.entries(a.units).reduce((s, [id, n]) => s + n * (UNIT[id].spy || 1), 0);
    let dPow = 0;
    if (target) {
      this.tick(target); this.mil(target);
      const b = this.bonus(target);
      const own = Object.entries(target.units).reduce((s, [id, n]) => s + n * (UNIT[id] ? UNIT[id].spy : 0), 0);
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
      const b = this.bonus(target);
      lines.push(`Ресурсы: дерево ${Math.floor(target.res.wood)}, камень ${Math.floor(target.res.stone)}, железо ${Math.floor(target.res.iron)}, еда ${Math.floor(target.res.food)}`);
      lines.push(`Войска: ${unitsLine(target.units)}`);
      lines.push(`Забор ${b.wall} ур., Тайник прячет ${b.hidden}, рейтинг ${this.rating(target)}`);
      if (target.general && !target.general.dead) lines.push(`Генерал ${target.general.level} ур.`);
      lines.push(`Лояльность замка: ${Math.round(target.loyalty ?? 100)}${this.isCapital(target) ? ' (столица — захватить нельзя)' : ''}`);
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
  P.incoming = function incoming(castle) {
    const out = [], watch = this.bonus(castle).watch;
    for (const c of Object.values(this.db.castles)) {
      if (c === castle || !c.armies) continue;
      for (const a of c.armies) {
        if (a.state !== 'go' || a.x !== castle.x || a.y !== castle.y) continue;
        out.push({ from: this.ownerOf(c).login, mission: a.mission, arrive: a.arrive, units: watch >= 5 || a.mission === 'trade' ? a.units : null });
      }
    }
    return out.sort((p, q) => p.arrive - q.arrive);
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

  // ----- альянсы (Посольство) -----
  P.allianceOf = function allianceOf(user) { return user && user.alliance && (this.db.alliances || {})[user.alliance]; };
  P.alliance = function alliance(user, castle, { op, name, tag }) {
    this.db.alliances = this.db.alliances || {};
    const emb = this.buildingLevel(castle, B.EMBASSY);
    const cur = this.allianceOf(user);
    if (op === 'leave') {
      if (!cur) return { error: 'Вы не в альянсе.' };
      cur.members = cur.members.filter((m) => m !== user.id); delete user.alliance;
      if (!cur.members.length) delete this.db.alliances[cur.id]; else if (cur.leader === user.id) cur.leader = cur.members[0];
      this.store.save(); return { ok: true };
    }
    if (!emb) return { error: 'Нужно Посольство.' };
    if (cur) return { error: 'Сначала выйдите из текущего альянса.' };
    tag = String(tag || '').trim().toUpperCase().slice(0, 5);
    if (op === 'create') {
      if (emb < 3) return { error: 'Создать альянс можно с Посольством 3 ур.' };
      name = String(name || '').trim().slice(0, 24);
      if (name.length < 3 || tag.length < 2) return { error: 'Название от 3 символов, тег 2–5.' };
      if (Object.values(this.db.alliances).some((x) => x.tag === tag)) return { error: 'Такой тег уже занят.' };
      const id = this.db.nextId++;
      this.db.alliances[id] = { id, name, tag, leader: user.id, members: [user.id], created: Date.now() };
      user.alliance = id; this.store.save(); return { ok: true };
    }
    if (op === 'join') {
      const al = Object.values(this.db.alliances).find((x) => x.tag === tag);
      if (!al) return { error: 'Альянс не найден.' };
      const leader = this.userById(al.leader), lc = leader && this.castleOf(leader);
      const slots = 3 * Math.max(1, lc ? this.buildingLevel(lc, B.EMBASSY) : 1);
      if (al.members.length >= slots) return { error: `В альянсе нет мест (${slots}).` };
      al.members.push(user.id); user.alliance = al.id; this.store.save(); return { ok: true };
    }
    return { error: 'Неизвестное действие.' };
  };

  // ----- админ: полная прокачка -----
  P.maxOut = function maxOut(castle) {
    this.mil(castle);
    const race = this.raceOf(castle);
    const castleBuildings = C.BUILDINGS.filter((b) => b.layer === 'castle' && b.id !== 0);
    const cells = [...Array(49).keys()].filter((i) => i !== 24);
    castle.grid[0] = Array(49).fill(-1); castle.levels[0] = Array(49).fill(0);
    castle.grid[0][24] = 0; castle.levels[0][24] = C.BY_ID[0].max;
    let k = 0;
    for (const b of castleBuildings) { const i = cells[k++]; castle.grid[0][i] = b.id; castle.levels[0][i] = b.max; }
    while (k < cells.length) { const i = cells[k++]; castle.grid[0][i] = 1; castle.levels[0][i] = C.BY_ID[1].max; } // остальное — склады
    for (let i = 0; i < 225; i++) {
      const opts = helpers.landOptions(i % 15, Math.floor(i / 15));
      if (!opts.length) { castle.grid[1][i] = -1; castle.levels[1][i] = 0; continue; }
      const id = opts.length > 1 ? opts[i % opts.length] : opts[0];
      castle.grid[1][i] = id; castle.levels[1][i] = 20;
    }
    castle.queue = [];
    for (const u of unitsForRace(race)) if (u.id !== GENERAL_ID) castle.units[u.id] = Math.max(castle.units[u.id] || 0, u.role === 'merchant' ? 200 : u.race === 'all' && !['giant', 'valkyrie', 'ram', 'catapult', 'eye', 'shadow'].includes(u.role) ? 20 : 1000);
    castle.general = { level: 20, exp: this.generalNeed(20), dead: false };
    castle.sciences = { eco: 20, eng: 20, fhi: 20, war: 20 };
    castle.religion = castle.religion || 'war';
    if (castle.artifacts.length < 4) for (const type of ['atk', 'def', 'prod', 'speed']) castle.artifacts.push({ id: this.db.nextId++, type, rarity: 2, active: true, found: Date.now() });
    const cap = this.capacity(castle);
    for (const r of C.RES) castle.res[r] = cap[r];
    castle.resAt = Date.now();
    this.store.save();
  };
  P.ensureAdmin = function ensureAdmin(pass = process.env.ADMIN_PASS || 'admin') {
    let u = this.db.users.admin;
    if (!u) {
      const r = this.register({ login: 'admin', password: pass, race: 0 });
      if (r.error) return null;
      u = r.user; u.admin = true;
      const c = this.castleOf(u); c.name = 'Королевский замок';
      this.maxOut(c);
    }
    u.admin = true;
    return u;
  };
  P.adminOp = function adminOp(user, op, arg = {}) {
    if (!user.admin) return { error: 'Нет прав.' };
    const c = this.castleOf(user); this.mil(c);
    const now = Date.now();
    if (op === 'fill') { this.tick(c); const cap = this.capacity(c); for (const r of C.RES) c.res[r] = cap[r]; }
    else if (op === 'finish') {
      for (const q of c.queue) q.end = now;
      for (const t of c.training) { t.start = now - t.each * t.count; }
      if (c.research) c.research.end = now;
      for (const a of c.armies) { if (a.state === 'go') { const d = a.arrive - a.depart; a.arrive = now; a.depart = now - d; } else a.back = now; }
      if (c.general && c.general.reviveAt) c.general.reviveAt = now;
      this.tick(c); this.tickWorld(now);
      for (const a of c.armies) if (a.state === 'back') a.back = now; // и сразу домой
      this.tickWorld(now);
    } else if (op === 'units') { for (const u of unitsForRace(this.raceOf(c))) if (u.id !== GENERAL_ID) c.units[u.id] = (c.units[u.id] || 0) + (Number(arg.n) || 100); }
    else if (op === 'max') this.maxOut(c);
    else if (op === 'maxuser') { // прокачать другого игрока (для тестов боёв)
      const u = this.db.users[String(arg.login || '').trim().toLowerCase()];
      if (!u) return { error: 'Игрок не найден.' };
      this.maxOut(this.castleOf(u));
    }
    else return { error: 'Неизвестная команда.' };
    this.store.save();
    return { ok: true };
  };

  // ----- всё военное/функциональное состояние замка для клиента -----
  P.milState = function milState(castle, user) {
    this.mil(castle);
    const b = this.bonus(castle);
    const al = this.allianceOf(user);
    return {
      units: castle.units, training: castle.training.map((t) => ({ id: t.id, unit: t.unit, building: t.building, count: t.count, done: t.done, each: t.each, start: t.start })),
      general: castle.general, armies: castle.armies.map((a) => ({ id: a.id, units: a.units, general: a.general, mission: a.mission, x: a.x, y: a.y, depart: a.depart, arrive: a.arrive, back: a.back, state: a.state, loot: a.loot, cargo: a.cargo })),
      incoming: this.incoming(castle), sciences: castle.sciences, research: castle.research, religion: castle.religion,
      artifacts: castle.artifacts, upkeep: Math.round(this.upkeep(castle) * SPEED),
      bonus: { atk: b.atk, def: b.def, magic: b.magic, prod: b.prod, speed: b.speed, train: b.train, build: b.build, wall: b.wall, wallPer: b.wallPer, hidden: b.hidden, marketRate: b.marketRate, artSlots: b.artSlots, artStore: b.artStore, tradeCarry: b.tradeCarry },
      alliance: al ? { id: al.id, name: al.name, tag: al.tag, leader: al.leader, members: al.members.map((id) => { const m = this.userById(id); return m ? m.login : '?'; }) } : null,
      admin: !!user.admin,
      unreadReports: (this.db.reports || []).filter((r) => r.owner === user.id && !r.read).length,
    };
  };

  P.reportsOf = function reportsOf(userId) { return (this.db.reports || []).filter((r) => r.owner === userId).slice(-50).reverse(); };

  void buildTime;
}

const catalogJson = () => ({
  units: UNITS, generalId: GENERAL_ID, sciences: SCIENCES, religions: RELIGIONS, artifacts: ART_TYPES, rarity: RARITY,
  npc: NPC, missions: MISSIONS, raceDir: RACE_DIR, scienceCost: Array.from({ length: 21 }, (_, l) => (l ? scienceCost(l) : null)),
  scienceTime: Array.from({ length: 21 }, (_, l) => (l ? scienceTime(l) : 0)),
});

module.exports = { install, UNITS, UNIT, B, GENERAL_ID, SCIENCES, RELIGIONS, NPC, MISSIONS, unitsForRace, unitImg, catalogJson };
