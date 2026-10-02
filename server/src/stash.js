'use strict';
// Кладовая игрока: сюда падают награды заданий, похода «Тёмные земли» и мирового босса — ресурсы, уникальные воины,
// опыт генерала. Кладовая одна на все замки игрока: награды копятся в ней, а забирает он их (ползунок «Извлечь») в тот замок,
// где сейчас находится. Ресурсы — не больше, чем вмещает Склад этого замка, остальное ждёт и не пропадает.

const RES4 = ['wood', 'stone', 'iron', 'food'];
const RES_NAME = { wood: 'Дерево', stone: 'Камень', iron: 'Железо', food: 'Еда' };

function install(Game) {
  const P = Game.prototype;
  const ARMY = () => require('./army');
  P.stashOf = function stashOf(u) {
    if (!u.stash) u.stash = { res: {}, units: {}, exp: 0 };
    // перенос из прежних кладовых замков (была своя у каждого замка) — в общую
    for (const c of this.castlesOf(u)) if (c.stash) {
      for (const [k, v] of Object.entries(c.stash.res || {})) u.stash.res[k] = (u.stash.res[k] || 0) + v;
      for (const [k, v] of Object.entries(c.stash.units || {})) u.stash.units[k] = (u.stash.units[k] || 0) + v;
      u.stash.exp = (u.stash.exp || 0) + (c.stash.exp || 0); delete c.stash;
    }
    return u.stash;
  };
  // награда в Кладовую: { wood, stone, iron, food, u: { inf, cav, mag } (уникальные воины расы), units: { id: n }, exp }
  // → список строк «что получено» для сообщения
  P.stashAdd = function stashAdd(u, rw) {
    const s = this.stashOf(u), got = [], race = u.race;
    for (const r of RES4) if (rw[r] > 0) { s.res[r] = (s.res[r] || 0) + Math.floor(rw[r]); }
    if (RES4.some((r) => rw[r] > 0)) got.push('ресурсы');
    const add = (id, n) => { if (!(n > 0)) return; s.units[id] = (s.units[id] || 0) + Math.floor(n); got.push(`${ARMY().UNIT[id].name} ×${Math.floor(n)}`); };
    for (const [slot, n] of Object.entries(rw.u || {})) { const u = ARMY().uniqueFor(race, slot); if (u) add(u.id, n); }
    for (const [id, n] of Object.entries(rw.units || {})) if (ARMY().UNIT[id]) add(Number(id), n);
    if (rw.exp > 0) { s.exp = (s.exp || 0) + Math.floor(rw.exp); got.push(`опыт генерала ${Math.floor(rw.exp)}`); }
    return got;
  };
  P.stashCount = function stashCount(u) {
    const s = this.stashOf(u);
    return RES4.filter((r) => s.res[r] > 0).length + Object.values(s.units).filter((n) => n > 0).length + (s.exp > 0 ? 1 : 0);
  };
  // для окна: сколько лежит и сколько можно забрать прямо сейчас в замок c (где игрок сейчас)
  P.stashView = function stashView(u, c) {
    const s = this.stashOf(u), cap = this.capacity(c), g = c.general && !c.general.dead;
    const res = RES4.filter((r) => s.res[r] > 0).map((r) => ({ kind: 'res', key: r, name: RES_NAME[r], n: s.res[r], max: Math.max(0, Math.min(s.res[r], Math.floor(cap[r] - c.res[r]))) }));
    const units = Object.entries(s.units).filter(([, n]) => n > 0).map(([id, n]) => ({ kind: 'unit', key: Number(id), name: ARMY().UNIT[id].name, n, max: n, quest: !!ARMY().UNIT[id].quest }));
    const exp = s.exp > 0 ? [{ kind: 'exp', key: 'exp', name: 'Опыт генерала', n: s.exp, max: g ? s.exp : 0 }] : [];
    return [...res, ...units, ...exp];
  };
  P.stashTake = function stashTake(u, c, kind, key, n) {
    if (!c || c.owner !== u.id) return { error: 'Это не ваш замок.' };
    this.tick(c); this.mil(c);
    const s = this.stashOf(u); n = Math.floor(Number(n));
    if (!(n > 0)) return { error: 'Укажите количество.' };
    if (kind === 'res') {
      if (!RES4.includes(key) || !(s.res[key] > 0)) return { error: 'Этого нет в Кладовой.' };
      const free = Math.floor(this.capacity(c)[key] - c.res[key]);
      if (free <= 0) return { error: 'В замке хранится максимальное количество — улучшите Склад или потратьте ресурсы.' };
      const k = Math.min(n, s.res[key], free); s.res[key] -= k; c.res[key] += k; if (!s.res[key]) delete s.res[key];
      return { ok: true, msg: `Из Кладовой в «${c.name}»: ${RES_NAME[key]} +${k}.` };
    }
    if (kind === 'unit') {
      const id = Number(key), have = s.units[id] || 0, un = ARMY().UNIT[id];
      if (!un || have <= 0) return { error: 'Этого нет в Кладовой.' };
      const k = Math.min(n, have); s.units[id] -= k; if (!s.units[id]) delete s.units[id];
      c.units[id] = (c.units[id] || 0) + k;
      return { ok: true, msg: `${un.name} ×${k} — в замке «${c.name}».` };
    }
    if (kind === 'exp') {
      const g = c.general;
      if (!g || g.dead) return { error: 'Нет живого генерала в этом замке.' };
      if (!(s.exp > 0)) return { error: 'Опыта в Кладовой нет.' };
      const k = Math.min(n, s.exp); s.exp -= k;
      this.normGeneral(g, c);
      const { GEN } = ARMY(), from = g.level; g.exp += k;
      while (g.level < GEN.maxLevel && g.exp >= this.generalNeed(g.level)) { g.level++; g.free += GEN.perLevel; }
      return { ok: true, msg: `Генерал «${g.name}»: +${k} опыта${g.level > from ? `, теперь ${g.level} уровень (+${(g.level - from) * GEN.perLevel} очк.)` : ''}.` };
    }
    return { error: 'Неверный запрос.' };
  };
}

module.exports = { install };
