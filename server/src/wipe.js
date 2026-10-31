'use strict';
// «Обнуление армий» (с 31.10, по голосованию игроков: ранги и награды были завышены) — разовое действие админа.
// У всех игроков (и у админа): из воинов остаются только бунтари и путешественники (собираются в замковую армию);
// остальных нет нигде — замковая армия, «Резерв», отряды, походы и подкрепления, тренировка (отменяется, ресурсы — в Кладовую),
// Лазарет, Кладовая, Темница, Подземелье, охота. Караваны с ресурсами и Освоение идут дальше. Генерал — 1 уровень (опыт, очки, умения — с нуля); имя, воин и всё снаряжение остаются,
// снаряжение павших генералов — в Оружейную. Здания, ресурсы, монеты, рейтинг, науки, руны, артефакты — не трогаются.
// Перед обнулением — копия базы (backups/…-wipe.json.gz).
const RES4 = ['wood', 'stone', 'iron', 'food'];

function install(Game) {
  const P = Game.prototype;
  const A = () => require('./army');
  const total = (u) => Object.values(u || {}).reduce((s, n) => s + (n > 0 ? n : 0), 0);
  const KEEP = new Set([224, 233]); // Путешественник и Бунтарь — остаются (по слову хозяина)
  const pick = (o) => Object.fromEntries(Object.entries(o || {}).filter(([id, n]) => KEEP.has(Number(id)) && n > 0));
  const add = (to, o) => { for (const [id, n] of Object.entries(o)) to[id] = (to[id] || 0) + n; };

  P.wipeArmies = function wipeArmies(admin, now = Date.now()) {
    const { UNIT, GENERAL_ID } = A();
    if (this.store.flush) this.store.flush();
    const backup = this.store.backup ? this.store.backup('wipe') : null;
    const users = Object.values(this.db.users).filter((u) => !u.bot);
    let units = 0, gens = 0;
    for (const u of users) {
      const cs = this.castlesOf(u); if (!cs.length && !(u.stash && total(u.stash.units))) continue;
      let lost = 0; const refund = { wood: 0, stone: 0, iron: 0, food: 0 }, gearBack = [];
      let main = null, mainCastle = null, hadGen = false;
      for (const c of cs) {
        this.mil(c);
        // остаются только бунтари и путешественники (KEEP): со всего — в замковую армию; торговцы считаются от Рынка, их не трогаем
        const home = {}; for (const src of [c.units, c.reserve, ...c.squads.map((q) => q.units)]) { lost += total(src) - total(pick(src)); add(home, pick(src)); }
        c.units = home; c.reserve = {}; c.squads = [];
        // караваны с ресурсами (торговля) и Освоение (путешественники строят замок) — идут дальше; из остальных походов
        // бунтари и путешественники сразу возвращаются домой, прочие воины распущены
        const keepA = [];
        for (const a of c.armies || []) {
          if (a.mission === 'trade') { keepA.push(a); continue; }
          lost += total(a.units) - total(pick(a.units));
          if (a.mission === 'settle') { a.units = pick(a.units); a.general = false; keepA.push(a); continue; }
          add(c.units, pick(a.units));
        }
        c.armies = keepA;
        // тренировка: бунтари и путешественники доучиваются; остальное отменяется, ресурсы за ещё не обученных — в Кладовую
        c.training = (c.training || []).filter((t) => {
          if (t.unit === GENERAL_ID) { hadGen = true; return false; } /* генерал взамен — сразу 1 уровня */
          if (KEEP.has(Number(t.unit))) return true;
          const left = Math.max(0, (t.count || 0) - (t.done || 0)), uu = UNIT[t.unit];
          if (left && uu && uu.cost) for (const r of RES4) refund[r] += (uu.cost[r] || 0) * left;
          return false;
        });
        lost += total(c.wounded) - total(pick(c.wounded)); c.wounded = pick(c.wounded);
        c.healing = (c.healing || []).filter((t) => { if (KEEP.has(Number(t.unit))) return true; lost += Math.max(0, (t.count || 0) - (t.done || 0)); return false; });
        if (c.prison) { c.prison = null; } if (c.recruit) { c.recruit = null; }
        // генералы: главный — живой (или первый павший/воскрешаемый); снаряжение остальных — в Оружейную
        for (const g of [c.general, ...(c.deadGenerals || [])].filter(Boolean)) {
          hadGen = true;
          if (!main || (main.dead && !g.dead)) { if (main) gearBack.push(...Object.values(main.eq || {})); main = g; mainCastle = c; }
          else gearBack.push(...Object.values(g.eq || {}));
        }
        c.general = null; c.deadGenerals = [];
      }
      if (u.stash && u.stash.units) { lost += total(u.stash.units) - total(pick(u.stash.units)); u.stash.units = pick(u.stash.units); }
      if (u.hunt) { u.hunt.march = null; }
      // Подземелье: занятые этим игроком лагеря освобождаются (его отряды распущены)
      for (const camp of (this.db.dungeon && this.db.dungeon.camps) || []) if (camp.occ && camp.occ.uid !== undefined && cs.some((c) => c.id === camp.occ.cid)) camp.occ = null;
      if (hadGen && cs.length) {
        const c = mainCastle || cs[0], g = this.newGeneral(c, 1);
        if (main) { g.name = main.name || g.name; g.kind = main.kind || g.kind; g.kindId = main.kindId; g.eq = main.eq || {}; }
        g.tal = {}; c.general = g; gens++;
        if (gearBack.length) this.heroGear(c).push(...gearBack);
      }
      if (RES4.some((r) => refund[r] > 0) && this.stashAdd) this.stashAdd(u, refund);
      units += lost;
      u.snap = null; // «Подозрительное» (anomaly.js): новый замер с нуля
      this.event(u.id, `Обнуление армий (по итогам голосования игроков): все войска распущены, кроме бунтарей и путешественников${hadGen ? ', генерал снова 1 уровня — снаряжение осталось' : ''}. Здания, ресурсы, монеты, руны и артефакты не тронуты.${RES4.some((r) => refund[r] > 0) ? ' Ресурсы за отменённую тренировку — в Кладовой.' : ''}`);
    }
    (this.db.wipeLog = this.db.wipeLog || []).push({ at: now, by: admin ? admin.login : '', units, gens, players: users.length });
    this.store.save();
    return { ok: true, units, gens, players: users.length, backup };
  };
}

module.exports = { install };
