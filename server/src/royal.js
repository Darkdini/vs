'use strict';
// «Лояльность населения» королевства (окно Резиденции) — как в оригинале:
// копится за действия игрока (стройка, тренировка, походы, науки, торговля, праздники), а не за время онлайн;
// тратится на каждый захват/основание замка. Баланс: первый дополнительный замок — не раньше чем через месяц активной игры.
//  • за действие +10, но не больше ROYAL.dayCap за сутки (400); плюс +50 в сутки, пока правитель заходит в игру;
//  • следующий замок стоит ROYAL.cost × (сколько замков уже есть): 13 500 за второй = 30 дней × (400 + 50);
//  • 7 дней без входа — прирост останавливается; 2 недели — лояльность падает по 100 в сутки;
//    3 недели — население бунтует: лояльность замков падает на 5% в сутки (до 5%);
//  • отняли замок — лояльность населения −10%.
//  • Храм во втором и следующих замках ускоряет прирост: +10 в сутки за каждый уровень Храма (сверх дневного лимита);
//    Храм столицы не считается — поэтому первый захват всё равно не раньше месяца.

const DAY = 86400000;
const ROYAL = { templePerLevel: 10, perAction: 10, dayCap: 400, passive: 50, cost: 13500, stopDays: 7, decayDays: 14, decayPerDay: 100, riotDays: 21, riotPerDay: 5, riotMin: 5, lossPct: 0.1 };
// праздники в Резиденции: ресурсы → лояльность (входит в тот же дневной лимит), каждый — раз в сутки
const FESTIVALS = {
  fair: { name: 'Ярмарка', desc: 'Народные гуляния на площади.', cost: { wood: 1000, stone: 1000, iron: 1000, food: 2000 }, gain: 60 },
  tournament: { name: 'Рыцарский турнир', desc: 'Состязание лучших воинов королевства.', cost: { wood: 4000, stone: 4000, iron: 6000, food: 6000 }, gain: 150 },
  feast: { name: 'Королевский пир', desc: 'Пир для всего замка за счёт казны.', gold: 50, gain: 100 },
};
const dayKey = (t) => Math.floor(t / DAY);

function install(Game) {
  const P = Game.prototype;
  const seenAt = (u) => u.lastSeen || u.created || Date.now();

  // прирост в сутки от Храмов во всех замках, кроме столицы
  P.templeRoyal = function templeRoyal(user) { return this.castlesOf(user).slice(1).reduce((s, c) => s + ROYAL.templePerLevel * this.buildingLevel(c, 25), 0); };
  P.royalNeed = function royalNeed(user) { return ROYAL.cost * this.castlesOf(user).length; };

  // ленивый пересчёт по суткам: пассивный прирост, падение и бунт при отсутствии правителя
  P.royalTick = function royalTick(user, now = Date.now()) {
    if (user.royal === undefined) { user.royal = 0; user.royalAt = now; }
    const days = Math.min(400, Math.floor((now - (user.royalAt || now)) / DAY));
    for (let k = 1; k <= days; k++) {
      const t = user.royalAt + k * DAY, away = (t - seenAt(user)) / DAY;
      if (away < ROYAL.stopDays) user.royal += ROYAL.passive + this.templeRoyal(user);
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
    user.royal += add; user.royalToday += add;
    return add;
  };
  P.royalCanCapture = function royalCanCapture(user) { return this.royalTick(user) >= this.royalNeed(user); };
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
      perDay: ROYAL.passive + this.templeRoyal(user), temples: this.templeRoyal(user),
      today: user.royalDay === dayKey(now) ? user.royalToday : 0, dayCap: ROYAL.dayCap, rules: ROYAL,
      festivals: Object.entries(FESTIVALS).map(([id, f]) => ({ id, ...f, ready: !((user.festAt || {})[id] > now - DAY), readyAt: ((user.festAt || {})[id] || 0) + DAY })),
    };
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

module.exports = { install, ROYAL, FESTIVALS };
