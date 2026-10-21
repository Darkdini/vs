'use strict';
// Герой-генерал: ветки умений (Завоеватель, Страж, Мародёр) и снаряжение (6 ячеек, 4 редкости + «рунное», усиление и ковка за руны в Кузнице).
// Очки умений — за уровни генерала (1 + каждые 3 уровня). Снаряжение только куёт Кузнец за руны (в боях и наградах не выпадает);
// усиление +1…+5 — за ресурсы и руны. Вещи лежат в Оружейной — одна на всё королевство, как и генерал (u.gear); надетые — у генерала (g.eq).
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
    { id: 'd4', name: 'Несокрушимый', max: 5, per: { survive: 0.08 }, need: 10, desc: '+8% шанс генерала уцелеть при разгроме (вместе со щитом — не больше 30%)' },
  ] },
  loot: { name: 'Мародёр', desc: 'Добыча и походы', list: [
    { id: 'l1', name: 'Жадность', max: 5, per: { loot: 0.04 }, need: 0, desc: '+4% к унесённой добыче' },
    { id: 'l2', name: 'Быстрый марш', max: 5, per: { speed: 0.03 }, need: 5, desc: '+3% к скорости армии с генералом' },
    { id: 'l3', name: 'Мастер набегов', max: 5, per: { raid: 0.06 }, need: 5, desc: '+6% к урону в Набеге' },
    { id: 'l4', name: 'Охотник за рунами', max: 5, per: { find: 0.05 }, need: 10, desc: '+5% шанс, что отряд за руной принесёт две руны' }, // снаряжение в боях не выпадает — только ковка за руны
  ] },
};
const TAL = Object.fromEntries(Object.entries(TALENTS).flatMap(([br, b]) => b.list.map((t) => [t.id, { ...t, br }])));
const TAL_RESET_GOLD = 50;
const talentPoints = (level) => Math.min(60, 1 + Math.floor((Math.max(1, level) - 1) / 3));

// ---------- снаряжение ----------
const GEAR_RARITY = [
  { name: 'обычное', color: '#d8d8d8' }, { name: 'редкое', color: '#4aa8ff' },
  { name: 'эпическое', color: '#c06bff' }, { name: 'легендарное', color: '#ffb52e' },
  { name: 'рунное', color: '#35e0cf' }, // только ковкой в Кузнице за руны (runes.js) — не падает в лагерях и логовах
];
// оружие, доспех и амулет с 21.10 втрое слабее (по решению владельца): рунная вещь +5 — атака и защита армии +12%, магия +16%
// (было +35% и +45%: генерал 1 ур. с рунным мечом давал армии ×1,35 — больше всей науки «Военное дело»)
const GEAR = {
  weapon: { name: 'Оружие', key: 'atk', val: [0.01, 0.02, 0.035, 0.05, 0.07], items: ['Железный меч', 'Клинок ветерана', 'Рунный меч', 'Меч Короля-Дракона', 'Клинок Древних Рун'], txt: 'атака армии', rune: 'str' },
  helm: { name: 'Шлем', key: 'exp', val: [0.05, 0.10, 0.17, 0.25, 0.32], items: ['Кожаный шлем', 'Шлем сотника', 'Крылатый шлем', 'Корона полководца', 'Рунный венец Странника'], txt: 'опыт генерала', rune: 'path' },
  armor: { name: 'Доспех', key: 'def', val: [0.01, 0.02, 0.035, 0.05, 0.07], items: ['Кольчуга', 'Латы стража', 'Зачарованные латы', 'Доспех Бессмертных', 'Рунные латы Великана'], txt: 'защита армии', rune: 'def' },
  shield: { name: 'Щит', key: 'survive', val: [0.05, 0.10, 0.16, 0.25, 0.32], items: ['Деревянный щит', 'Окованный щит', 'Щит с гербом', 'Эгида Древних', 'Рунная эгида Стража'], txt: 'шанс генерала уцелеть', rune: 'def' },
  amulet: { name: 'Амулет', key: 'mag', val: [0.014, 0.028, 0.045, 0.07, 0.09], items: ['Оберег', 'Амулет мага', 'Око бури', 'Сердце феникса', 'Амулет Рунного пламени'], txt: 'магическая атака', rune: 'str' },
  horse: { name: 'Конь', key: 'speed', val: [0.04, 0.08, 0.12, 0.18, 0.24], items: ['Гнедой конь', 'Боевой скакун', 'Вороной в броне', 'Огненный жеребец', 'Рунный скакун Ветров'], txt: 'скорость армии', rune: 'path' },
};
const SLOTS = Object.keys(GEAR);
// SURVIVE_MAX — шанс генерала уцелеть при разгроме (умение «Несокрушимый» и щит вместе): не больше 30% (с 21.10; было 60%)
const GEAR_MAX_PLUS = 5, GEAR_BAG = 24, SURVIVE_MAX = 0.3;
const gearVal = (it) => GEAR[it.slot].val[it.r] * (1 + 0.15 * (it.plus || 0));
// усиление: ресурсов — не больше ENH_RES_MAX каждого (влезает в полный Склад, 95 000), плюс руны вида вещи: (редкость+1) × (шаг+1) —
// рунная вещь до +5: 5+10+15+20+25 = 75 рун. Руны дают Сундук дня и камни на карте — топ-генерал собирается не сразу
const ENH_RES_MAX = 90000;
const enhanceCost = (it) => Object.fromEntries(RES4.map((r) => [r, Math.min(ENH_RES_MAX, Math.round(1500 * (it.r + 1) * ((it.plus || 0) + 1) ** 2))]));
const enhanceRunes = (it) => (it.r + 1) * ((it.plus || 0) + 1);
const sellPrice = (it) => Object.fromEntries(RES4.map((r) => [r, Math.round(400 * (it.r + 1) * ((it.plus || 0) + 1))]));
// время усиления у Кузнеца: до +1 — 10 мин … до +5 — 4 ч; редкие вещи дольше (×1, ×1,5, ×2, ×2,5). Одна вещь за раз.
const ENH_MIN = [10, 30, 60, 120, 240];
const enhanceSec = (it) => Math.round(ENH_MIN[Math.min(ENH_MIN.length - 1, it.plus || 0)] * 60 * (1 + 0.5 * it.r) / Number(process.env.SPEED || 1));
const gearName = (it) => `${GEAR[it.slot].items[it.r]}${it.plus ? ` +${it.plus}` : ''}`;
// ковка за руны (Кузница): по редкости — сколько рун нужного вида (GEAR[slot].rune), ресурсов каждого вида, минут работы
// и какой уровень Кузницы нужен. Рунное (5-я редкость) — только так. Кузнец делает одно дело: ковка или усиление.
// полный рунный комплект (6 вещей): 1200 рун — по 400 каждого вида; ресурсы — в пределах полного Склада
const FORGE = { runes: [5, 15, 40, 100, 200], res: [2000, 6000, 15000, 40000, 90000], min: [30, 120, 360, 720, 1440], lvl: [1, 5, 10, 15, 20] };
const forgeSec = (r) => Math.max(10, Math.round(FORGE.min[r] * 60 / Number(process.env.SPEED || 1)));

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
  // Оружейная — одна на королевство (у игрока): видна из любого замка, при захвате замка не теряется
  P.heroGear = function heroGear(castle) {
    const u = this.userById(castle.owner); if (!u) { if (!castle.gear) castle.gear = []; return castle.gear; }
    if (!u.gear) u.gear = [];
    return u.gear;
  };
  // переезд: Оружейные замков (castle.gear) — в общую Оружейную королевства
  P.heroGearMerge = function heroGearMerge() {
    let n = 0;
    for (const c of Object.values(this.db.castles)) {
      if (!Array.isArray(c.gear) || !c.gear.length) { delete c.gear; continue; }
      const u = this.userById(c.owner); if (!u) continue;
      (u.gear = u.gear || []).push(...c.gear); n += c.gear.length; delete c.gear;
    }
    if (n) this.store.save();
    return n;
  };
  // вещь сейчас у Кузнеца в каком-то замке королевства
  const atSmith = (g, castle, id) => g.castlesOf(g.userById(castle.owner) || { castleIds: [castle.id] }).find((c) => c.gearJob && c.gearJob.item === id);

  // новая вещь: rarity — фиксированная или случайная (сдвиг bias повышает шанс редких). В игре вещи только куются за руны (runeForge);
  // rollGear и giveGear остались для проверок (server/test)
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
      if (atSmith(this, castle, it.id)) return { error: 'Вещь сейчас у Кузнеца — дождитесь конца усиления.' };
      const p = sellPrice(it), cap = this.capacity(castle);
      bag.splice(bag.indexOf(it), 1);
      for (const r of RES4) castle.res[r] = Math.max(castle.res[r], Math.min(cap[r], castle.res[r] + p[r]));
      this.store.save(); return { ok: true, msg: `«${gearName(it)}» разобрано на ресурсы.` };
    }
    if (m.op === 'forge') return this.runeForge(castle, user, m.slot, m.r);
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
      else { if ((user.gold || 0) < TAL_RESET_GOLD) return { error: `Нужно монет: ${TAL_RESET_GOLD}.` }; this.goldChange(user, -TAL_RESET_GOLD, 'Сброс умений генерала'); }
      g.tal = {};
    } else if (m.op === 'equip') {
      const it = findBag(m.item); if (!it) return { error: 'Вещь не найдена.' };
      bag.splice(bag.indexOf(it), 1);
      if (g.eq[it.slot]) bag.push(g.eq[it.slot]);
      g.eq[it.slot] = it;
    } else if (m.op === 'unequip') {
      const it = g.eq[m.slot]; if (!it) return { error: 'Ячейка пуста.' };
      if (bag.length >= GEAR_BAG) return { error: 'Оружейная полна.' };
      bag.push(it); delete g.eq[m.slot];
    } else if (m.op === 'enhance') {
      const it = findBag(m.item) || Object.values(g.eq).find((x) => x && x.id === Number(m.item)); if (!it) return { error: 'Вещь не найдена.' };
      if ((it.plus || 0) >= GEAR_MAX_PLUS) return { error: 'Вещь усилена до предела.' };
      if (!this.buildingLevel(castle, 11)) return { error: 'Нужен Кузнец (здание).' };
      if (castle.gearJob) return { error: 'Кузнец уже усиливает другую вещь — дождитесь конца.' };
      if (castle.runeJob) return { error: 'Кузнец куёт новую вещь — дождитесь конца.' };
      const busy = atSmith(this, castle, it.id); if (busy) return { error: `Эта вещь уже у Кузнеца в замке «${busy.name}».` };
      const c = enhanceCost(it), { RUNE_NAME } = require('./runes'), rk = GEAR[it.slot].rune, rn = enhanceRunes(it), have = this.runesOf(user);
      if (have[rk] < rn) return { error: `Не хватает рун: нужно ${rn} «${RUNE_NAME[rk]}», у вас ${have[rk]}.` };
      for (const r of RES4) if (castle.res[r] < c[r]) return { error: 'Недостаточно ресурсов.' };
      for (const r of RES4) castle.res[r] -= c[r];
      have[rk] -= rn;
      const now = Date.now(), sec = enhanceSec(it);
      castle.gearJob = { item: it.id, plus: (it.plus || 0) + 1, start: now, end: now + sec * 1000, owner: user.id, rk, rn }; // руны вернутся, если работу прервут
      this.store.save(); return { ok: true, msg: `Кузнец взялся за «${gearName(it)}» — будет +${castle.gearJob.plus}.` };
    } else return { error: 'Неизвестное действие.' };
    this.store.save(); return { ok: true };
  };

  // усиление у Кузнеца закончилось: вещь (в Оружейной, на генерале или у павшего) получает +1
  P.heroGearTick = function heroGearTick(castle, now = Date.now()) {
    const j = castle.gearJob; if (!j || j.end > now) return;
    const u = this.userById(castle.owner), cs = u ? this.castlesOf(u) : [castle];
    const all = [...this.heroGear(castle), ...cs.flatMap((c) => [...Object.values((c.general && c.general.eq) || {}), ...(c.deadGenerals || []).flatMap((d) => Object.values(d.eq || {}))])];
    const it = all.find((x) => x && x.id === j.item);
    if (it) { it.plus = Math.max(it.plus || 0, j.plus); this.event(castle.owner, `Кузнец усилил: «${gearName(it)}».`); }
    castle.gearJob = null;
  };
  // ковка новой вещи за руны: slot — ячейка, r — редкость (0…4)
  P.runeForge = function runeForge(castle, user, slot, r0) {
    const r = Number(r0);
    if (!SLOTS.includes(slot) || !Number.isInteger(r) || r < 0 || r >= GEAR_RARITY.length) return { error: 'Нет такой вещи.' }; // только свои ячейки (не __proto__ и т. п.)
    const L = this.buildingLevel(castle, 11); if (!L) return { error: 'Нужен Кузнец (здание).' }; // здание 11 в замке называется «Кузнец»
    if (L < FORGE.lvl[r]) return { error: `Ковать ${GEAR_RARITY[r].name} снаряжение можно, когда Кузнец ${FORGE.lvl[r]} ур.` };
    if (castle.runeJob || castle.gearJob) return { error: 'Кузнец занят — дождитесь конца работы.' };
    const bag = this.heroGear(castle); if (bag.length >= GEAR_BAG) return { error: `Оружейная полна (${GEAR_BAG}) — наденьте или разберите вещи.` };
    const { RUNE_NAME } = require('./runes'), key = GEAR[slot].rune, have = this.runesOf(user), need = FORGE.runes[r];
    if (have[key] < need) return { error: `Не хватает рун: нужно ${need} «${RUNE_NAME[key]}», у вас ${have[key]}.` };
    this.tick(castle);
    for (const k of RES4) if (castle.res[k] < FORGE.res[r]) return { error: 'Недостаточно ресурсов.' };
    for (const k of RES4) castle.res[k] -= FORGE.res[r];
    have[key] -= need;
    const now = Date.now();
    castle.runeJob = { slot, r, start: now, end: now + forgeSec(r) * 1000, owner: user.id }; // owner — кто платил рунами: ему и вещь
    this.store.save();
    return { ok: true, msg: `Кузнец начал ковать «${GEAR[slot].items[r]}».` };
  };
  // ковка закончилась: новая вещь — в Оружейную (место было свободно, когда ковка началась; если его заняли — всё равно кладём)
  P.heroRuneTick = function heroRuneTick(castle, now = Date.now()) {
    const j = castle.runeJob; if (!j || j.end > now) return;
    castle.runeJob = null;
    const u = this.userById(j.owner) || this.userById(castle.owner);
    if (!u || !SLOTS.includes(j.slot)) return;
    const it = { id: this.db.nextId++, slot: j.slot, r: j.r, plus: 0, forged: true };
    (u.gear = u.gear || []).push(it);
    this.addStat && this.addStat(u.id, 'gear', 1);
    this.report(u.id, `Сковано: ${gearName(it)}`, [`Кузнец замка «${castle.name}» сковал ${GEAR[it.slot].name.toLowerCase()} «${gearName(it)}» (${GEAR_RARITY[it.r].name}).`,
      `+${Math.round(gearVal(it) * 1000) / 10}% — ${GEAR[it.slot].txt}. Вещь лежит в Оружейной генерала — наденьте её в окне «Снаряжение».`], 'rune');
  };
  // замок захватили: Кузнец бросает работу — ковка отменяется, руны возвращаются тому, кто их потратил; усиление отменяется
  P.smithAbandon = function smithAbandon(castle, prev) {
    const j = castle.runeJob, e = castle.gearJob; castle.runeJob = null; castle.gearJob = null;
    const { RUNE_NAME } = require('./runes');
    if (e && e.rn && RUNE_NAME[e.rk]) { // усиление прервано — руны назад тому, кто платил
      const u = this.userById(e.owner) || prev;
      if (u) { this.runesOf(u)[e.rk] += e.rn; this.report(u.id, 'Усиление прервано', [`Замок «${castle.name}» захвачен — Кузнец не докончил усиление.`, `${e.rn} × ${RUNE_NAME[e.rk]} вернулись к вам. Ресурсы остались в замке.`], 'rune'); }
    }
    if (!j || !SLOTS.includes(j.slot)) return;
    const u = this.userById(j.owner) || prev; if (!u) return;
    const key = GEAR[j.slot].rune, n = FORGE.runes[j.r] || 0;
    this.runesOf(u)[key] += n;
    this.report(u.id, 'Ковка прервана', [`Замок «${castle.name}» захвачен — Кузнец не докончил «${GEAR[j.slot].items[j.r]}».`, `${n} × ${RUNE_NAME[key]} вернулись к вам. Ресурсы остались в замке.`], 'rune');
  };
  P.heroView = function heroView(castle) {
    const g = castle.general, u = this.userById(castle.owner);
    const v = { gear: this.heroGear(castle), bagMax: GEAR_BAG, job: castle.gearJob || null, forgeJob: castle.runeJob || null, runes: u ? this.runesOf(u) : {} };
    if (g && !g.dead) { norm(g); Object.assign(v, { tal: g.tal, eq: g.eq, talPts: talentPoints(g.level), talFree: talentPoints(g.level) - spent(g), talResets: g.talResets, bonus: this.heroBonus(g) }); }
    return v;
  };
}

const heroCatalog = () => ({ talents: TALENTS, gear: GEAR, gearRarity: GEAR_RARITY, gearMaxPlus: GEAR_MAX_PLUS, talResetGold: TAL_RESET_GOLD,
  enhanceSec: GEAR_RARITY.map((_, r) => Array.from({ length: GEAR_MAX_PLUS }, (__, p) => enhanceSec({ r, plus: p }))),
  enhanceCost: GEAR_RARITY.map((_, r) => Array.from({ length: GEAR_MAX_PLUS }, (__, p) => enhanceCost({ r, plus: p }))),
  enhanceRunes: GEAR_RARITY.map((_, r) => Array.from({ length: GEAR_MAX_PLUS }, (__, p) => enhanceRunes({ r, plus: p }))),
  sellPrice: GEAR_RARITY.map((_, r) => Array.from({ length: GEAR_MAX_PLUS + 1 }, (__, p) => sellPrice({ r, plus: p }))),
  forge: { runes: FORGE.runes, res: FORGE.res, sec: FORGE.runes.map((_, r) => forgeSec(r)), lvl: FORGE.lvl, runeBack: Math.round(require('./runes').RUNE_BACK_SEC / Number(process.env.SPEED || 1)) },
  runeNames: require('./runes').RUNE_NAME });

module.exports = { install, TALENTS, GEAR, GEAR_RARITY, SLOTS, FORGE, talentPoints, gearVal, gearName, heroCatalog };
