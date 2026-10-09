'use strict';
// Ратуша → «Защита» (как в оригинале), покупается за золото на 1 / 3 / 7 дней:
// • Контрразведка — разведчики врага ничего не узнают (склады, постройки, армии и их расположение скрыты); разведчики при этом не гибнут.
// • Защита замка — текущий замок нельзя атаковать, грабить и разведывать; в него нельзя отправить подкрепление.
// • Защита королевства — то же для всех замков игрока.
// Пока действует защита замка или королевства, армии игрока не ведут боевых действий (нападение, набег, разведка).
// Включить защиту нельзя, пока армии игрока в боевом походе или на защищаемый замок уже идёт вражеская армия.
// Срок продлевается: новая покупка прибавляется к оставшемуся времени. На карте мира защищённый замок — под золотым куполом.
// Купол (защиту замка или королевства) игрок может снять сам — в Ратуше → Защита или прямо при отправке нападения:
// его предупреждают, что купол не восстановится — оставшееся время сгорает, защиту придётся купить заново.
const DAY = 86400000;
const KINDS = {
  spy: { name: 'Контрразведка', price: { 1: 15, 3: 39, 7: 81 } },
  castle: { name: 'Защита замка', price: { 1: 15, 3: 39, 7: 81 } },
  kingdom: { name: 'Защита королевства', price: { 1: 60, 3: 156, 7: 324 } },
};
const HOSTILE = ['attack', 'raid', 'scout'];

function install(Game) {
  const P = Game.prototype;
  const left = (t, now) => Math.max(0, (t || 0) - now);
  P.spyShield = function spyShield(u, now = Date.now()) { return !!u && left(u.shieldSpy, now) > 0; };
  // защищён ли замок (своя защита замка или защита королевства владельца)
  P.castleShield = function castleShield(c, now = Date.now()) {
    if (!c) return 0; const u = this.userById(c.owner);
    return Math.max(left(c.shieldUntil, now), left(u && u.shieldKingdom, now)) > 0 ? Math.max(c.shieldUntil || 0, (u && u.shieldKingdom) || 0) : 0;
  };
  // защита хотя бы одного замка игрока — его армии не воюют
  P.userShielded = function userShielded(u, now = Date.now()) {
    if (!u) return false; if (left(u.shieldKingdom, now)) return true;
    return this.castlesOf(u).some((c) => left(c.shieldUntil, now) > 0);
  };
  const dur = (ms) => { const m = Math.max(1, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60); return d ? `${d} дн ${h} ч` : h ? `${h} ч ${m % 60} мин` : `${m} мин`; };
  // какие купола держат армии игрока: «защита королевства (ещё 1 дн 3 ч), купол на замке «…» (ещё 5 ч 10 мин)»
  P.domesText = function domesText(u, now = Date.now()) {
    const out = [];
    if (left(u.shieldKingdom, now)) out.push(`защита королевства (ещё ${dur(left(u.shieldKingdom, now))})`);
    for (const c of this.castlesOf(u)) if (left(c.shieldUntil, now)) out.push(`купол на замке «${c.name}» (ещё ${dur(left(c.shieldUntil, now))})`);
    return out.join(', ');
  };
  P.shieldedMsg = function shieldedMsg(u, now = Date.now()) {
    return `У Вас действует ${this.domesText(u, now)}. Пока купол надет, армии не нападают, не грабят и не разведывают. `
      + 'Чтобы напасть, купол нужно снять (Ратуша → Защита) — он не восстановится: оставшееся время сгорит, защиту придётся купить заново.';
  };
  // снять все купола игрока (он согласился при отправке нападения): время сгорает
  P.shieldDropAll = function shieldDropAll(u) {
    u.shieldKingdom = 0; for (const c of this.castlesOf(u)) c.shieldUntil = 0;
    this.cache = {}; this.store.save();
  };
  P.shieldInfo = function shieldInfo(u, castle, now = Date.now()) {
    return { kinds: Object.entries(KINDS).map(([k, x]) => ({ k, name: x.name, price: x.price })),
      spy: left(u.shieldSpy, now) ? u.shieldSpy : 0, castle: left(castle.shieldUntil, now) ? castle.shieldUntil : 0, kingdom: left(u.shieldKingdom, now) ? u.shieldKingdom : 0, gold: u.gold || 0 };
  };
  // включить защиту сейчас можно? (армии игрока не в боевом походе, на защищаемые замки не идёт враг)
  const canShield = (g, u, castle, kind) => {
    const mine = g.castlesOf(u);
    if (mine.some((c) => (c.armies || []).some((a) => HOSTILE.includes(a.mission) && (a.state === 'go' || a.state === 'wait'))))
      return 'Ваши армии в боевом походе — защиту можно включить, когда они дойдут до цели.';
    const guard = kind === 'castle' ? [castle] : mine;
    for (const k of Object.values(g.db.castles)) for (const a of k.armies || [])
      if (HOSTILE.includes(a.mission) && (a.state === 'go' || a.state === 'wait') && guard.some((x) => x.x === a.x && x.y === a.y) && k.owner !== u.id)
        return 'На замок уже идёт вражеская армия — защиту сейчас включить нельзя.';
    return '';
  };
  // снять купол насовсем (игрок предупреждён в окне): оставшееся время сгорает
  P.shieldOff = function shieldOff(u, castle, kind, now = Date.now()) {
    if (!castle || castle.owner !== u.id) return { error: 'Это не ваш замок.' };
    if (kind === 'castle') { if (!left(castle.shieldUntil, now)) return { error: 'Защита замка не действует.' }; castle.shieldUntil = 0; }
    else if (kind === 'kingdom') { if (!left(u.shieldKingdom, now)) return { error: 'Защита королевства не действует.' }; u.shieldKingdom = 0; }
    else return { error: 'Снять можно защиту замка или королевства.' };
    this.cache = {}; this.store.save();
    const still = this.domesText(u, now);
    return { msg: `Купол снят — оставшееся время сгорело, защиту можно купить заново. ${
      still ? `Но ещё действует ${still} — армии не воюют, пока надет хоть один купол.` : 'Армии снова могут воевать, но и ваши замки теперь можно атаковать.'}` };
  };
  P.shieldBuy = function shieldBuy(u, castle, kind, days, now = Date.now()) {
    const K = KINDS[kind]; days = Number(days); const price = K && K.price[days];
    if (!K || !price) return { error: 'Нет такой защиты.' };
    if (!castle || castle.owner !== u.id) return { error: 'Это не ваш замок.' };
    if (kind !== 'spy') { const e = canShield(this, u, castle, kind); if (e) return { error: e }; }
    if ((u.gold || 0) < price) return { error: `Не хватает монет: нужно ${price}, у вас ${u.gold || 0}.` };
    const add = days * DAY;
    if (kind === 'spy') u.shieldSpy = Math.max(u.shieldSpy || 0, now) + add;
    else if (kind === 'castle') castle.shieldUntil = Math.max(castle.shieldUntil || 0, now) + add;
    else u.shieldKingdom = Math.max(u.shieldKingdom || 0, now) + add;
    this.goldChange(u, -price, `${K.name} на ${days} дн.${kind === 'castle' ? ` — «${castle.name}»` : ''}`);
    this.cache = {}; this.store.save();
    const until = kind === 'spy' ? u.shieldSpy : kind === 'castle' ? castle.shieldUntil : u.shieldKingdom;
    return { msg: `${K.name} включена до ${new Date(until).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (МСК).` };
  };
}

module.exports = { install, KINDS };
