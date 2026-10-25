'use strict';
// «Алтарь» (здание 47) → «Зона охоты»: общая карта, где Генералы игроков охотятся на чудовищ четырёх стихий (огонь, вода,
// воздух, земля) трёх уровней. У чудовища общий запас здоровья — его бьют все по очереди; когда оно пало, награду (кристаллы
// стихий, ресурсы, иногда руны, опыт Генералу) делят по доле нанесённого урона. Монет и премиума охота не даёт.
// Охотник — Генерал королевства: своё здоровье охотника (восстанавливается само, сразу — за монеты). Перед ударом можно взять
// до двух боевых заклинаний (платятся кристаллами); заклинание своей стихии против чудовища со слабой защитой от неё бьёт сильнее.
// Поход к чудовищу — по таймеру (ускорить вдвое — за монеты); бой — когда Генерал дошёл (huntTick, раз в секунду).
const SPEED = Number(process.env.SPEED || 1);
const ALTAR = 47;
const EL = ['fire', 'water', 'air', 'earth'];
const EL_NAME = { fire: 'Огонь', water: 'Вода', air: 'Воздух', earth: 'Земля' };
const OPP = { fire: 'water', water: 'fire', air: 'earth', earth: 'air' }; // против своей противоположности чудовище беззащитно
const MOB_NAME = {
  fire: ['Огненный дракончик', 'Огненный дракон', 'Владыка пламени'],
  water: ['Водный змей', 'Морской змей', 'Повелитель глубин'],
  air: ['Грифон бури', 'Грозовой грифон', 'Владыка небес'],
  earth: ['Каменный голем', 'Мшистый голем', 'Древний голем'],
};
// уровень чудовища: здоровье, удар по охотнику, защита от простого удара, сколько кристаллов на всех, ресурсов на всех, опыт
const MOB = [null,
  { hp: 12000, hit: 250, phys: 0.2, cry: 12, res: 6000, exp: 60 },
  { hp: 90000, hit: 800, phys: 0.4, cry: 40, res: 30000, exp: 250 },
  { hp: 260000, hit: 2000, phys: 0.6, cry: 100, res: 90000, exp: 700, rune: 0.5 },
];
const MOB_COUNT = [0, 3, 2, 1]; // на каждую стихию: 3 малых, 2 средних, 1 большое
const RESPAWN_SEC = 10 * 60; // павшее чудовище появляется снова (в другом месте) через 10 минут
const CALM_SEC = 3600; // если чудовище никто не бил час — здоровье полное, счёт урона сброшен
// заклинания: стихия × уровень (I–III); цена — кристаллы своей стихии; урон — от и до (растёт с уровнем Генерала)
const SPELL = [null, { cost: 2, min: 800, max: 2400 }, { cost: 8, min: 2600, max: 7800 }, { cost: 20, min: 7000, max: 21000 }];
const SPELL_NAME = { fire: 'Огненный шар', water: 'Ледяное копьё', air: 'Сила Ветра', earth: 'Каменная глыба' };
const MAP_W = 941, MAP_H = 1672; // карта охоты — картинка gfx/hunt/bg.webp, координаты в её точках
const START_CRY = 10; // первому охотнику — по 10 кристаллов каждой стихии, чтобы попробовать заклинания
const HEAL_FULL_SEC = 2 * 3600; // здоровье охотника полностью восстанавливается за 2 часа
const roman = (l) => ['', 'I', 'II', 'III'][l];
const rnd = (a, b) => a + Math.random() * (b - a);

function install(Game) {
  const P = Game.prototype;
  P.huntDb = function huntDb() {
    const H = (this.db.hunt = this.db.hunt || { next: 1, mobs: [] });
    const now = Date.now();
    for (const el of EL) for (let l = 1; l <= 3; l++) { // поддерживать число чудовищ; павшие возвращаются через 10 минут
      const have = H.mobs.filter((m) => m.el === el && m.l === l && (!m.dead || m.back > now)).length;
      for (let i = have; i < MOB_COUNT[l]; i++) H.mobs.push(this.huntSpawn(H, el, l));
    }
    H.mobs = H.mobs.filter((m) => !m.dead || m.back > now);
    for (const m of H.mobs) if (!m.dead && m.hp < m.max && now - (m.hitAt || 0) > CALM_SEC * 1000) { m.hp = m.max; m.dmg = {}; }
    return H;
  };
  P.huntSpawn = function huntSpawn(H, el, l) {
    let x = 0, y = 0;
    for (let t = 0; t < 40; t++) { // не ближе 110 точек к другим чудовищам
      x = Math.round(rnd(90, MAP_W - 90)); y = Math.round(rnd(160, MAP_H - 120));
      if (!H.mobs.some((m) => !m.dead && Math.hypot(m.x - x, m.y - y) < 110)) break;
    }
    return { id: H.next++, el, l, x, y, hp: MOB[l].hp, max: MOB[l].hp, dmg: {}, hitAt: 0 };
  };
  // защита чудовища от стихий: своя — 90%, противоположная — 0%, остальные — 50% (у больших чуть больше)
  const resOf = (m) => Object.fromEntries(EL.map((e) => [e, e === m.el ? 0.9 : e === OPP[m.el] ? 0 : 0.5 + 0.1 * (m.l - 1)]));
  P.huntGeneral = function huntGeneral(u) { const h = this.generalHome(u.id); return h && h.g && !h.g.dead ? h : null; };
  P.huntOf = function huntOf(u, now = Date.now()) {
    const gh = this.huntGeneral(u), lvl = gh ? gh.g.level : 1, max = 2000 + 120 * lvl;
    if (!u.hunt) u.hunt = { hp: max, hpAt: now, x: Math.round(rnd(80, MAP_W - 80)), y: Math.round(rnd(MAP_H * 0.55, MAP_H - 80)) };
    if (!u.crystals) u.crystals = Object.fromEntries(EL.map((e) => [e, START_CRY]));
    const h = u.hunt; h.max = max;
    const dt = Math.max(0, now - (h.hpAt || now)); h.hp = Math.min(max, h.hp + max * dt / (HEAL_FULL_SEC / SPEED * 1000)); h.hpAt = now;
    return h;
  };
  P.huntAtk = function huntAtk(u) { const gh = this.huntGeneral(u); return gh ? 300 + 60 * gh.g.level : 0; }; // простой удар Генерала
  const spellDmg = (el, l, glvl) => { const s = SPELL[l], k = 1 + 0.02 * glvl; return [Math.round(s.min * k), Math.round(s.max * k)]; };
  const mobView = (m, uid) => ({ id: m.id, el: m.el, l: m.l, name: `${MOB_NAME[m.el][m.l - 1]} ${roman(m.l)}`, x: m.x, y: m.y, hp: Math.ceil(m.hp), max: m.max,
    hit: MOB[m.l].hit, res: resOf(m), phys: MOB[m.l].phys, mine: Math.round((m.dmg || {})[uid] || 0), dead: !!m.dead });
  P.huntView = function huntView(u) {
    const H = this.huntDb(), h = this.huntOf(u), gh = this.huntGeneral(u), now = Date.now();
    const glvl = gh ? gh.g.level : 0;
    const others = Object.values(this.db.users).filter((x) => x !== u && x.hunt && !x.bot && (x.hunt.march || now - (x.hunt.seen || 0) < 6 * 3600000)).slice(0, 40)
      .map((x) => ({ login: x.login, race: x.race, x: x.hunt.x, y: x.hunt.y, march: x.hunt.march ? { mob: x.hunt.march.mob, start: x.hunt.march.start, end: x.hunt.march.end } : null, last: x.hunt.last && now - x.hunt.last.at < 15000 ? x.hunt.last : null }));
    h.seen = now;
    return { w: MAP_W, h: MAP_H, mobs: H.mobs.filter((m) => !m.dead).map((m) => mobView(m, u.id)),
      me: { login: u.login, race: u.race, x: h.x, y: h.y, hp: Math.floor(h.hp), max: h.max, march: h.march || null, last: h.last || null, atk: this.huntAtk(u), general: gh ? { name: gh.g.name, level: glvl } : null },
      crystals: u.crystals, gold: u.gold || 0, hunters: others,
      spells: EL.flatMap((el) => [1, 2, 3].map((l) => ({ el, l, name: `${SPELL_NAME[el]} ${roman(l)}`, cost: SPELL[l].cost, dmg: spellDmg(el, l, glvl) }))),
      healCost: this.huntHealCost(u), speedCost: 3, el: EL_NAME };
  };
  P.huntHealCost = function huntHealCost(u) { const h = this.huntOf(u); return h.hp >= h.max ? 0 : Math.max(1, Math.ceil((1 - h.hp / h.max) * 10)); };
  // в поход: чудовище, до двух заклинаний [{ el, l }]; здоровья охотника должно хватить на ответный удар
  P.huntGo = function huntGo(u, castle, mobId, spells) {
    if (!castle || !this.buildingLevel(castle, ALTAR)) return { error: 'Нужен Алтарь.' };
    const gh = this.huntGeneral(u); if (!gh) return { error: 'Охотится Генерал — наймите его в Военном штабе (или дождитесь, пока он воскреснет).' };
    const H = this.huntDb(), h = this.huntOf(u), m = H.mobs.find((x) => x.id === Number(mobId) && !x.dead);
    if (!m) return { error: 'Чудовище уже пало — выберите другое.' };
    if (h.march) return { error: 'Генерал уже в походе.' };
    if (h.hp < MOB[m.l].hit) return { error: 'Запас жизни Генерала слишком мал, чтобы сразиться с этим чудовищем.', heal: this.huntHealCost(u) };
    const pick = [].concat(spells || []).slice(0, 2).map((s) => ({ el: String(s && s.el), l: Math.floor(Number(s && s.l)) })).filter((s) => EL.includes(s.el) && SPELL[s.l]);
    const need = {}; for (const s of pick) need[s.el] = (need[s.el] || 0) + SPELL[s.l].cost;
    for (const [el, n] of Object.entries(need)) if ((u.crystals[el] || 0) < n) return { error: `Не хватает кристаллов: ${EL_NAME[el]} — нужно ${n}, у вас ${u.crystals[el] || 0}.` };
    for (const [el, n] of Object.entries(need)) u.crystals[el] -= n;
    const now = Date.now(), sec = Math.max(4, Math.round((8 + Math.hypot(m.x - h.x, m.y - h.y) / 60) / SPEED));
    h.march = { mob: m.id, spells: pick, start: now, end: now + sec * 1000 };
    this.store.save();
    return { ok: true, sec, msg: `Генерал выступил на охоту: ${MOB_NAME[m.el][m.l - 1]} ${roman(m.l)}.` };
  };
  P.huntSpeed = function huntSpeed(u) {
    const h = this.huntOf(u); if (!h.march) return { error: 'Генерал не в походе.' };
    if ((u.gold || 0) < 3) return { error: 'Не хватает монет: нужно 3.' };
    const now = Date.now(), left = h.march.end - now; if (left < 2000) return { error: 'Генерал уже на месте.' };
    this.goldChange(u, -3, 'Алтарь: ускорить поход на охоту'); h.march.end = now + Math.round(left / 2);
    this.store.save(); return { ok: true, msg: 'Поход ускорен вдвое.' };
  };
  P.huntHeal = function huntHeal(u) {
    const cost = this.huntHealCost(u); if (!cost) return { error: 'Генерал здоров.' };
    if ((u.gold || 0) < cost) return { error: `Не хватает монет: нужно ${cost}.` };
    this.goldChange(u, -cost, 'Алтарь: вылечить Генерала'); const h = this.huntOf(u); h.hp = h.max;
    this.store.save(); return { ok: true, msg: 'Генерал здоров и готов к охоте.' };
  };
  // Генерал дошёл: удар (простой + заклинания с учётом защиты), ответный удар чудовища; пало — награды по доле урона
  P.huntStrike = function huntStrike(u, now = Date.now()) {
    const H = this.huntDb(), h = this.huntOf(u, now), mv = h.march; h.march = null;
    const m = H.mobs.find((x) => x.id === mv.mob && !x.dead);
    if (!m) { h.last = { at: now, mob: mv.mob, gone: true }; this.event(u.id, 'Охота: чудовище уже пало, Генерал вернулся.'); return null; }
    const gh = this.huntGeneral(u), glvl = gh ? gh.g.level : 1, res = resOf(m);
    const hits = [{ kind: 'phys', dmg: Math.round(this.huntAtk(u) * rnd(0.85, 1.15) * (1 - MOB[m.l].phys)) }];
    for (const s of mv.spells || []) { const [a, b] = spellDmg(s.el, s.l, glvl); hits.push({ kind: s.el, l: s.l, dmg: Math.round(rnd(a, b) * (1 - res[s.el])) }); }
    const dealt = Math.min(Math.ceil(m.hp), hits.reduce((q, x) => q + x.dmg, 0));
    m.hp -= dealt; m.hitAt = now; m.dmg[u.id] = (m.dmg[u.id] || 0) + dealt;
    const got = Math.round(MOB[m.l].hit * rnd(0.85, 1.15)); h.hp = Math.max(0, h.hp - got);
    const killed = m.hp <= 0;
    h.last = { at: now, mob: m.id, el: m.el, l: m.l, hits, dealt, got, killed };
    if (killed) this.huntKill(m, now);
    else this.event(u.id, `Охота: Генерал нанёс ${dealt} урона (${MOB_NAME[m.el][m.l - 1]} ${roman(m.l)}), получил ${got}.`);
    return h.last;
  };
  P.huntKill = function huntKill(m, now) {
    m.dead = true; m.back = now + Math.round(RESPAWN_SEC / SPEED * 1000);
    const total = Object.values(m.dmg).reduce((a, b) => a + b, 0) || 1, M = MOB[m.l], name = `${MOB_NAME[m.el][m.l - 1]} ${roman(m.l)}`;
    for (const [uid, d] of Object.entries(m.dmg)) {
      const u = this.userById(Number(uid)); if (!u) continue;
      const share = d / total, lines = [`${name} пал. Ваш урон: ${Math.round(d)} (${Math.round(share * 100)}%).`], got = [];
      const cry = Math.max(1, Math.round(M.cry * share)); u.crystals = u.crystals || {}; u.crystals[m.el] = (u.crystals[m.el] || 0) + cry; got.push(`кристаллы (${EL_NAME[m.el]}) +${cry}`);
      const other = EL.filter((e) => e !== m.el)[Math.floor(Math.random() * 3)], c2 = Math.round(cry / 3); if (c2) { u.crystals[other] = (u.crystals[other] || 0) + c2; got.push(`кристаллы (${EL_NAME[other]}) +${c2}`); }
      const gh = this.huntGeneral(u), castle = gh ? gh.castle : this.castlesOf(u)[0];
      if (castle) { // ресурсы — в замок Генерала, до вместимости Складов
        this.tick(castle); const cap = this.capacity(castle), per = Math.round(M.res * share / 4);
        for (const r of ['wood', 'stone', 'iron', 'food']) castle.res[r] = Math.max(castle.res[r], Math.min(cap[r], castle.res[r] + per));
        got.push(`ресурсы по ${per} (в замок «${castle.name}»)`);
      }
      if (M.rune && share >= 0.2 && Math.random() < M.rune && this.runesOf) { const k = ['str', 'def', 'path'][Math.floor(Math.random() * 3)]; this.runesOf(u)[k]++; got.push('руна'); }
      if (gh && this.addGeneralExp) { const e = this.addGeneralExp(gh.castle, Math.round(M.exp * share)); if (e && e.got) got.push(`опыт Генералу +${e.got}`); }
      lines.push(`Награда: ${got.join(', ')}.`);
      this.report(u.id, `Охота: ${name} повержен`, lines, 'battle');
    }
  };
  P.huntTick = function huntTick(now = Date.now()) {
    for (const u of Object.values(this.db.users)) if (u.hunt && u.hunt.march && u.hunt.march.end <= now) { this.huntStrike(u, now); this.store.save(); }
  };
}

module.exports = { install, ALTAR, EL, MOB, SPELL, MAP_W, MAP_H };
