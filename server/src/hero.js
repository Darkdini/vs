'use strict';
// Герой-генерал: ветки умений (Завоеватель, Страж, Мародёр) и снаряжение (6 ячеек, 4 редкости, усиление в Кузнице).
// Очки умений — за уровни генерала (1 + каждые 3 уровня). Снаряжение падает в лагерях и логовах (только если генерал в походе),
// изредка — из Сундука дня. Вещи лежат в Оружейной замка (castle.gear), надетые — у генерала (g.eq).
// Бонусы героя (heroBonus) учитываются в бою (army.js clash/arrive), в скорости марша и в опыте генерала.

const RES4 = ['wood', 'stone', 'iron', 'food'];

// ---------- умения ----------
// need — сколько очков уже вложено в ветку, чтобы открыть умение
const TALENTS = {
  atk: { name: 'Завоеватель', desc: 'Сила удара армии', list: [
    { id: 'a1', name: 'Натиск', max: 5, per: { atk: 0.02 }, need: 0, desc: '+2% к атаке армии с генералом' },
    { id: 'a2', name: 'Боевая магия', max: 5, per: { mag: 0.03 }, need: 5, desc: '+3% к магической атаке армии с генералом' },
    { id: 'a3', name: 'Осадный мастер', max: 5, per: { ram: 0.1 }, need: 5, desc: '+10% к урону таранов по стене' },
    { id: 'a4', name: 'Ярость', max: 5, per: { fury: 0.03 }, need: 10, desc: '+3% к атаке в Нападении (не в набеге)' },
  ] },
  def: { name: 'Страж', desc: 'Живучесть и оборона', list: [
    { id: 'd1', name: 'Стойкость', max: 5, per: { def: 0.02 }, need: 0, desc: '+2% к защите армии генерала (в походе и дома)' },
    { id: 'd2', name: 'Полевой лекарь', max: 5, per: { heal: 0.03 }, need: 5, desc: '3% павших в походе воинов выживают' },
    { id: 'd3', name: 'Бастион', max: 5, per: { wall: 0.05 }, need: 5, desc: '+5% к силе Забора, когда генерал дома' },
    { id: 'd4', name: 'Несокрушимый', max: 5, per: { survive: 0.08 }, need: 10, desc: '+8% шанс генерала уцелеть при разгроме' },
  ] },
  loot: { name: 'Мародёр', desc: 'Добыча и походы', list: [
    { id: 'l1', name: 'Жадность', max: 5, per: { loot: 0.04 }, need: 0, desc: '+4% к унесённой добыче' },
    { id: 'l2', name: 'Быстрый марш', max: 5, per: { speed: 0.03 }, need: 5, desc: '+3% к скорости армии с генералом' },
    { id: 'l3', name: 'Мастер набегов', max: 5, per: { raid: 0.06 }, need: 5, desc: '+6% к урону в Набеге' },
    { id: 'l4', name: 'Охотник за трофеями', max: 5, per: { find: 0.02 }, need: 10, desc: '+2% шанс найти снаряжение в лагерях' },
  ] },
};
const TAL = Object.fromEntries(Object.entries(TALENTS).flatMap(([br, b]) => b.list.map((t) => [t.id, { ...t, br }])));
const TAL_RESET_GOLD = 50;
const talentPoints = (level) => Math.min(60, 1 + Math.floor((Math.max(1, level) - 1) / 3));

// ---------- снаряжение ----------
const GEAR_RARITY = [
  { name: 'обычное', color: '#d8d8d8' }, { name: 'редкое', color: '#4aa8ff' },
  { name: 'эпическое', color: '#c06bff' }, { name: 'легендарное', color: '#ffb52e' },
];
const GEAR = {
  weapon: { name: 'Оружие', key: 'atk', val: [0.03, 0.06, 0.10, 0.15], items: ['Железный меч', 'Клинок ветерана', 'Рунный меч', 'Меч Короля-Дракона'], txt: 'атака армии' },
  helm: { name: 'Шлем', key: 'exp', val: [0.05, 0.10, 0.17, 0.25], items: ['Кожаный шлем', 'Шлем сотника', 'Крылатый шлем', 'Корона полководца'], txt: 'опыт генерала' },
  armor: { name: 'Доспех', key: 'def', val: [0.03, 0.06, 0.10, 0.15], items: ['Кольчуга', 'Латы стража', 'Зачарованные латы', 'Доспех Бессмертных'], txt: 'защита армии' },
  shield: { name: 'Щит', key: 'survive', val: [0.05, 0.10, 0.16, 0.25], items: ['Деревянный щит', 'Окованный щит', 'Щит с гербом', 'Эгида Древних'], txt: 'шанс генерала уцелеть' },
  amulet: { name: 'Амулет', key: 'mag', val: [0.04, 0.08, 0.13, 0.20], items: ['Оберег', 'Амулет мага', 'Око бури', 'Сердце феникса'], txt: 'магическая атака' },
  horse: { name: 'Конь', key: 'speed', val: [0.04, 0.08, 0.12, 0.18], items: ['Гнедой конь', 'Боевой скакун', 'Вороной в броне', 'Огненный жеребец'], txt: 'скорость армии' },
};
const SLOTS = Object.keys(GEAR);
const GEAR_MAX_PLUS = 5, GEAR_BAG = 24, SURVIVE_MAX = 0.6;
const gearVal = (it) => GEAR[it.slot].val[it.r] * (1 + 0.15 * (it.plus || 0));
const enhanceCost = (it) => Object.fromEntries(RES4.map((r) => [r, Math.round(1500 * (it.r + 1) * ((it.plus || 0) + 1) ** 2)]));
const sellPrice = (it) => Object.fromEntries(RES4.map((r) => [r, Math.round(400 * (it.r + 1) * ((it.plus || 0) + 1))]));
// время усиления у Кузнеца: до +1 — 10 мин … до +5 — 4 ч; редкие вещи дольше (×1, ×1,5, ×2, ×2,5). Одна вещь за раз.
const ENH_MIN = [10, 30, 60, 120, 240];
const enhanceSec = (it) => Math.round(ENH_MIN[Math.min(ENH_MIN.length - 1, it.plus || 0)] * 60 * (1 + 0.5 * it.r) / Number(process.env.SPEED || 1));
const gearName = (it) => `${GEAR[it.slot].items[it.r]}${it.plus ? ` +${it.plus}` : ''}`;

function install(Game) {
  const P = Game.prototype;
  const norm = (g) => { if (!g.tal) g.tal = {}; if (!g.eq) g.eq = {}; if (g.talResets === undefined) g.talResets = 1; return g; };
  const spentIn = (g, br) => TALENTS[br].list.reduce((s, t) => s + (g.tal[t.id] || 0), 0);
  const spent = (g) => Object.keys(TALENTS).reduce((s, br) => s + spentIn(g, br), 0);

  // суммарные бонусы героя: умения + снаряжение
  P.heroBonus = function heroBonus(g) {
    const h = { atk: 0, mag: 0, def: 0, ram: 0, fury: 0, heal: 0, wall: 0, survive: 0, loot: 0, speed: 0, raid: 0, find: 0, exp: 0 };
    if (!g || g.dead) return h;
    norm(g);
    for (const [id, n] of Object.entries(g.tal)) { const t = TAL[id]; if (t && n > 0) for (const [k, v] of Object.entries(t.per)) h[k] += v * n; }
    for (const it of Object.values(g.eq)) if (it && GEAR[it.slot]) h[GEAR[it.slot].key] += gearVal(it);
    h.survive = Math.min(SURVIVE_MAX, h.survive);
    return h;
  };
  P.heroGear = function heroGear(castle) { if (!castle.gear) castle.gear = []; return castle.gear; };

  // новая вещь: rarity — фиксированная или случайная (сдвиг bias повышает шанс редких)
  P.rollGear = function rollGear(bias = 0, rarity) {
    let r = rarity;
    if (r === undefined) { const x = Math.random() * (1 - Math.min(0.5, bias)); r = x < 0.01 ? 3 : x < 0.06 ? 2 : x < 0.30 ? 1 : 0; }
    return { id: this.db.nextId++, slot: SLOTS[Math.floor(Math.random() * SLOTS.length)], r, plus: 0 };
  };
  // положить вещь в Оружейную; если полна — вещь потеряна. Возвращает строку для отчёта.
  P.giveGear = function giveGear(castle, it) {
    const bag = this.heroGear(castle);
    if (bag.length >= GEAR_BAG) return `Найдено снаряжение «${gearName(it)}», но Оружейная полна (${GEAR_BAG}) — его пришлось бросить.`;
    bag.push(it); this.addStat && this.addStat(castle.owner, 'gear', 1);
    return `Трофей: ${GEAR[it.slot].name.toLowerCase()} «${gearName(it)}» (${GEAR_RARITY[it.r].name}) — в Оружейной генерала.`;
  };
  // при гибели/удалении генерала надетое возвращается в Оружейную
  P.heroStrip = function heroStrip(castle, g) {
    if (!g || !g.eq) return;
    const bag = this.heroGear(castle);
    for (const s of SLOTS) if (g.eq[s]) { bag.push(g.eq[s]); delete g.eq[s]; }
  };

  P.heroOp = function heroOp(castle, user, m) {
    const g = castle.general;
    const bag = this.heroGear(castle);
    const findBag = (id) => bag.find((x) => x.id === Number(id));
    if (m.op === 'sell') {
      const it = findBag(m.item); if (!it) return { error: 'Вещь не найдена.' };
      if (castle.gearJob && castle.gearJob.item === it.id) return { error: 'Вещь сейчас у Кузнеца — дождитесь конца усиления.' };
      const p = sellPrice(it), cap = this.capacity(castle);
      castle.gear = bag.filter((x) => x !== it);
      for (const r of RES4) castle.res[r] = Math.max(castle.res[r], Math.min(cap[r], castle.res[r] + p[r]));
      this.store.save(); return { ok: true, msg: `«${gearName(it)}» разобрано на ресурсы.` };
    }
    if (!g || g.dead) return { error: 'Нужен живой генерал.' };
    norm(g);
    if (m.op === 'talent') {
      const t = TAL[m.id]; if (!t) return { error: 'Нет такого умения.' };
      const free = talentPoints(g.level) - spent(g);
      if (free <= 0) return { error: 'Нет свободных очков умений — растите уровень генерала.' };
      if ((g.tal[t.id] || 0) >= t.max) return { error: 'Умение уже изучено полностью.' };
      if (spentIn(g, t.br) < t.need) return { error: `Откроется, когда в ветку «${TALENTS[t.br].name}» вложено ${t.need} очков.` };
      g.tal[t.id] = (g.tal[t.id] || 0) + 1;
    } else if (m.op === 'talreset') {
      if (!spent(g)) return { error: 'Умения ещё не изучены.' };
      if (g.talResets > 0) g.talResets--;
      else { if ((user.gold || 0) < TAL_RESET_GOLD) return { error: `Нужно ${TAL_RESET_GOLD} золота.` }; this.goldChange(user, -TAL_RESET_GOLD, 'Сброс умений генерала'); }
      g.tal = {};
    } else if (m.op === 'equip') {
      const it = findBag(m.item); if (!it) return { error: 'Вещь не найдена.' };
      castle.gear = bag.filter((x) => x !== it);
      if (g.eq[it.slot]) castle.gear.push(g.eq[it.slot]);
      g.eq[it.slot] = it;
    } else if (m.op === 'unequip') {
      const it = g.eq[m.slot]; if (!it) return { error: 'Ячейка пуста.' };
      if (bag.length >= GEAR_BAG) return { error: 'Оружейная полна.' };
      bag.push(it); delete g.eq[m.slot];
    } else if (m.op === 'enhance') {
      const it = findBag(m.item) || Object.values(g.eq).find((x) => x && x.id === Number(m.item)); if (!it) return { error: 'Вещь не найдена.' };
      if ((it.plus || 0) >= GEAR_MAX_PLUS) return { error: 'Вещь усилена до предела.' };
      if (!this.buildingLevel(castle, 11)) return { error: 'Нужна Кузница.' };
      if (castle.gearJob) return { error: 'Кузнец уже усиливает другую вещь — дождитесь конца.' };
      const c = enhanceCost(it);
      for (const r of RES4) if (castle.res[r] < c[r]) return { error: 'Недостаточно ресурсов.' };
      for (const r of RES4) castle.res[r] -= c[r];
      const now = Date.now(), sec = enhanceSec(it);
      castle.gearJob = { item: it.id, plus: (it.plus || 0) + 1, start: now, end: now + sec * 1000 };
      this.store.save(); return { ok: true, msg: `Кузнец взялся за «${gearName(it)}» — будет +${castle.gearJob.plus}.` };
    } else return { error: 'Неизвестное действие.' };
    this.store.save(); return { ok: true };
  };

  // усиление у Кузнеца закончилось: вещь (в Оружейной, на генерале или у павшего) получает +1
  P.heroGearTick = function heroGearTick(castle, now = Date.now()) {
    const j = castle.gearJob; if (!j || j.end > now) return;
    const all = [...this.heroGear(castle), ...Object.values((castle.general && castle.general.eq) || {}), ...(castle.deadGenerals || []).flatMap((d) => Object.values(d.eq || {}))];
    const it = all.find((x) => x && x.id === j.item);
    if (it) { it.plus = Math.max(it.plus || 0, j.plus); this.event(castle.owner, `Кузнец усилил: «${gearName(it)}».`); }
    castle.gearJob = null;
  };
  P.heroView = function heroView(castle) {
    const g = castle.general;
    const v = { gear: this.heroGear(castle), bagMax: GEAR_BAG, job: castle.gearJob || null };
    if (g && !g.dead) { norm(g); Object.assign(v, { tal: g.tal, eq: g.eq, talPts: talentPoints(g.level), talFree: talentPoints(g.level) - spent(g), talResets: g.talResets, bonus: this.heroBonus(g) }); }
    return v;
  };
}

const heroCatalog = () => ({ talents: TALENTS, gear: GEAR, gearRarity: GEAR_RARITY, gearMaxPlus: GEAR_MAX_PLUS, talResetGold: TAL_RESET_GOLD,
  enhanceSec: Array.from({ length: 4 }, (_, r) => Array.from({ length: GEAR_MAX_PLUS }, (_, p) => enhanceSec({ r, plus: p }))),
  enhanceCost: SLOTS.length && Array.from({ length: 4 }, (_, r) => Array.from({ length: GEAR_MAX_PLUS }, (_, p) => enhanceCost({ r, plus: p }))),
  sellPrice: Array.from({ length: 4 }, (_, r) => Array.from({ length: GEAR_MAX_PLUS + 1 }, (_, p) => sellPrice({ r, plus: p }))) });

module.exports = { install, TALENTS, GEAR, GEAR_RARITY, SLOTS, talentPoints, gearVal, gearName, heroCatalog };
