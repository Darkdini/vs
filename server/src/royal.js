'use strict';
// «Лояльность населения» королевства (окно Резиденции) — как в оригинале:
// копится за действия игрока (стройка, тренировка, походы, науки, торговля, праздники), а не за время онлайн;
// тратится на каждый захват/основание замка. Баланс: первый дополнительный замок — не раньше чем через месяц активной игры.
//  • за действие +10, но не больше ROYAL.dayCap за сутки (400); плюс +50 в сутки, пока правитель заходит в игру;
//  • следующий замок стоит ROYAL.cost × (сколько замков уже есть): 13 500 за второй = 30 дней × (400 + 50);
//  • 7 дней без входа — прирост останавливается; 2 недели — лояльность падает по 100 в сутки;
//    3 недели — население бунтует: лояльность замков падает на 5% в сутки (до 5%);
//  • отняли замок — лояльность населения −10%.
//  • Храм (как в оригинале): +1 ед. в 2 часа = +12 в сутки за каждый замок с Храмом; ритуалы в Храме дают бонус лояльности
//    +N% ко всему приросту (не больше 5% за уровень лучшего Храма) на сутки; «Бунт» — усмирить бунт в замке за ресурсы;
//  • первый захват — не раньше 30-го дня игры, даже если лояльности хватает (строгий баланс).

const DAY = 86400000;
const ROYAL = { templeDaily: 12, ritualPerLevel: 0.05, firstCaptureDays: 30, calmGain: 15, calmHours: 6, perAction: 10, dayCap: 400, passive: 50, cost: 13500, stopDays: 7, decayDays: 14, decayPerDay: 100, riotDays: 21, riotPerDay: 5, riotMin: 5, lossPct: 0.1 };
// праздники в Резиденции: ресурсы → лояльность (входит в тот же дневной лимит), каждый — раз в сутки
const FESTIVALS = {
  fair: { name: 'Ярмарка', desc: 'Народные гуляния на площади.', cost: { wood: 1000, stone: 1000, iron: 1000, food: 2000 }, gain: 60 },
  tournament: { name: 'Рыцарский турнир', desc: 'Состязание лучших воинов королевства.', cost: { wood: 4000, stone: 4000, iron: 6000, food: 6000 }, gain: 150 },
  feast: { name: 'Королевский пир', desc: 'Пир для всего замка за счёт казны.', gold: 50, gain: 100 },
};
// ритуалы в Храме: бонус к приросту лояльности населения на сутки (один и тот же — не чаще раза в сутки)
const RITUALS = {
  prayer: { name: 'Молебен', desc: 'Жрецы молятся о благополучии королевства.', cost: { wood: 2000, stone: 2000, iron: 2000, food: 3000 }, pct: 0.05, hours: 24 },
  sacrifice: { name: 'Жертвоприношение', desc: 'Щедрые дары богам от имени правителя.', cost: { wood: 6000, stone: 6000, iron: 8000, food: 8000 }, pct: 0.1, hours: 24 },
  mystery: { name: 'Великое таинство', desc: 'Торжественная служба для всего королевства.', gold: 100, pct: 0.2, hours: 24 },
};
const CALM_COST = { wood: 3000, stone: 3000, iron: 3000, food: 3000 };
const dayKey = (t) => Math.floor(t / DAY);

function install(Game) {
  const P = Game.prototype;
  const seenAt = (u) => u.lastSeen || u.created || Date.now();

  // прирост в сутки от Храмов: 12 ед. за каждый замок с Храмом
  P.templeRoyal = function templeRoyal(user) { return this.castlesOf(user).filter((c) => this.buildingLevel(c, 25) > 0).length * ROYAL.templeDaily; };
  // бонус лояльности от ритуалов (действующих), не больше 5% за уровень лучшего Храма
  P.ritualCap = function ritualCap(user) { return ROYAL.ritualPerLevel * Math.max(0, ...this.castlesOf(user).map((c) => this.buildingLevel(c, 25))); };
  P.ritualBonus = function ritualBonus(user, now = Date.now()) {
    user.rituals = (user.rituals || []).filter((r) => r.until > now);
    return Math.min(this.ritualCap(user), user.rituals.reduce((s, r) => s + r.pct, 0));
  };
  P.royalNeed = function royalNeed(user) { return ROYAL.cost * this.castlesOf(user).length; };

  // ленивый пересчёт по суткам: пассивный прирост, падение и бунт при отсутствии правителя
  P.royalTick = function royalTick(user, now = Date.now()) {
    if (user.royal === undefined) { user.royal = 0; user.royalAt = now; }
    const days = Math.min(400, Math.floor((now - (user.royalAt || now)) / DAY));
    for (let k = 1; k <= days; k++) {
      const t = user.royalAt + k * DAY, away = (t - seenAt(user)) / DAY;
      if (away < ROYAL.stopDays) user.royal += Math.round((ROYAL.passive + this.templeRoyal(user)) * (1 + this.ritualBonus(user, t)));
      else if (away > ROYAL.decayDays) user.royal = Math.max(0, user.royal - ROYAL.decayPerDay);
      if (away > ROYAL.riotDays) for (const c of this.castlesOf(user)) { this.mil(c); c.loyalty = Math.max(ROYAL.riotMin, Math.min(c.loyalty, 100) - ROYAL.riotPerDay); c.loyAt = t; }
    }
    if (days > 0) user.royalAt += days * DAY;
    return user.royal;
  };
  // правитель давно не заходил — лояльность замков сама не восстанавливается (army.js tickTraining)
  P.rulerAway = function rulerAway(user, now = Date.now()) { return !!user && (now - seenAt(user)) / DAY > ROYAL.riotDays; };

  // очки за действие (с дневным лимитом)
  P.royalGain = function royalGain(user, pts = ROYAL.perAction, now = Date.now()) {
    this.royalTick(user, now);
    const d = dayKey(now);
    if (user.royalDay !== d) { user.royalDay = d; user.royalToday = 0; }
    const add = Math.max(0, Math.min(pts, ROYAL.dayCap - user.royalToday));
    user.royal += Math.round(add * (1 + this.ritualBonus(user, now))); user.royalToday += add; // лимит — на сами действия, бонус ритуалов сверху
    return add;
  };
  // сколько дней ещё ждать до права на первый захват (строго: не раньше 30-го дня игры)
  P.royalWaitDays = function royalWaitDays(user, now = Date.now()) { return user.admin || (user.captures || 0) > 0 ? 0 : Math.max(0, Math.ceil(ROYAL.firstCaptureDays - (now - (user.created || now)) / DAY)); };
  P.royalCanCapture = function royalCanCapture(user) { return !this.royalWaitDays(user) && this.royalTick(user) >= this.royalNeed(user); };
  P.royalSpend = function royalSpend(user) {
    const need = this.royalNeed(user);
    user.royal = Math.max(0, this.royalTick(user) - need);
    user.captures = (user.captures || 0) + 1;
  };
  P.royalLoss = function royalLoss(user) { this.royalTick(user); user.royal = Math.floor(user.royal * (1 - ROYAL.lossPct)); };

  P.royalView = function royalView(user, castle) {
    this.royalTick(user);
    const need = this.royalNeed(user), now = Date.now();
    return {
      royal: Math.floor(user.royal), castles: this.castlesOf(user).length, captures: user.captures || 0, unfinished: 0,
      left: Math.max(0, need - Math.floor(user.royal)), need, capital: this.isCapital(castle),
      perDay: ROYAL.passive + this.templeRoyal(user), temples: this.templeRoyal(user), wait: this.royalWaitDays(user, now),
      bonus: this.ritualBonus(user, now), bonusCap: this.ritualCap(user),
      rituals: Object.entries(RITUALS).map(([id, r]) => { const act = (user.rituals || []).find((x) => x.id === id && x.until > now); return { id, ...r, until: act ? act.until : 0 }; }),
      calmCost: CALM_COST, calmGain: ROYAL.calmGain, calmAt: ((castle.calmAt || 0) + ROYAL.calmHours * 3600000),
      today: user.royalDay === dayKey(now) ? user.royalToday : 0, dayCap: ROYAL.dayCap, rules: ROYAL,
      festivals: Object.entries(FESTIVALS).map(([id, f]) => ({ id, ...f, ready: !((user.festAt || {})[id] > now - DAY), readyAt: ((user.festAt || {})[id] || 0) + DAY })),
    };
  };

  P.ritual = function ritual(user, castle, id) {
    const r = RITUALS[id]; if (!r) return { error: 'Нет такого ритуала.' };
    if (!this.buildingLevel(castle, 25)) return { error: 'Нужен Храм.' };
    const now = Date.now(); this.ritualBonus(user, now);
    if (user.rituals.some((x) => x.id === id)) return { error: 'Этот ритуал ещё действует.' };
    this.tick(castle);
    if (r.cost) for (const k of Object.keys(r.cost)) if (castle.res[k] < r.cost[k]) return { error: 'Недостаточно ресурсов.' };
    if (r.gold && (user.gold || 0) < r.gold) return { error: `Нужно ${r.gold} золота.` };
    if (r.cost) for (const k of Object.keys(r.cost)) castle.res[k] -= r.cost[k];
    if (r.gold) user.gold -= r.gold;
    user.rituals.push({ id, pct: r.pct, until: now + r.hours * 3600000 });
    this.store.save();
    return { ok: true, msg: `${r.name}: бонус лояльности +${Math.round(this.ritualBonus(user, now) * 100)}% на сутки.` };
  };
  // «Бунт»: усмирить население замка за ресурсы (+15 к лояльности замка, раз в 6 часов)
  P.calmRiot = function calmRiot(user, castle) {
    if (!this.buildingLevel(castle, 25)) return { error: 'Нужен Храм.' };
    this.tick(castle); this.mil(castle);
    const now = Date.now();
    if (castle.loyalty >= 100) return { error: 'Бунта нет.' };
    if ((castle.calmAt || 0) + ROYAL.calmHours * 3600000 > now) return { error: 'Усмирять можно раз в 6 часов.' };
    for (const k of Object.keys(CALM_COST)) if (castle.res[k] < CALM_COST[k]) return { error: 'Недостаточно ресурсов.' };
    for (const k of Object.keys(CALM_COST)) castle.res[k] -= CALM_COST[k];
    castle.loyalty = Math.min(100, castle.loyalty + ROYAL.calmGain); castle.calmAt = now;
    this.store.save();
    return { ok: true, msg: `Бунт усмирён: лояльность замка ${Math.round(castle.loyalty)}%.` };
  };

  P.festival = function festival(user, castle, id) {
    const f = FESTIVALS[id]; if (!f) return { error: 'Нет такого праздника.' };
    if (!this.buildingLevel(castle, 46)) return { error: 'Нужна Резиденция.' };
    const now = Date.now(); user.festAt = user.festAt || {};
    if (user.festAt[id] > now - DAY) return { error: 'Этот праздник уже был сегодня.' };
    this.tick(castle);
    if (f.cost) for (const r of Object.keys(f.cost)) if (castle.res[r] < f.cost[r]) return { error: 'Недостаточно ресурсов.' };
    if (f.gold && (user.gold || 0) < f.gold) return { error: `Нужно ${f.gold} золота.` };
    if (f.cost) for (const r of Object.keys(f.cost)) castle.res[r] -= f.cost[r];
    if (f.gold) user.gold -= f.gold;
    user.festAt[id] = now;
    const got = this.royalGain(user, f.gain, now);
    this.store.save();
    return { ok: true, msg: `${f.name}: лояльность населения +${got}${got < f.gain ? ' (дневной лимит)' : ''}.` };
  };
}

module.exports = { install, ROYAL, FESTIVALS, RITUALS };
