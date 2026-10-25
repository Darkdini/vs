'use strict';
// «Капкан» (здание 48) с Темницей. Пока проверяет админ: строит только админ (catalog: adminOnly — убрать, чтобы открыть всем).
// • Нападение или набег чужой армии: до боя Капкан ловит до 1000 воинов (поровну из каждого вида; генерала, разведчиков
//   и невоенных не трогает) — они сидят в Темнице и в бою не участвуют. Потом Капкан перезаряжается 12 ч (сразу — за ресурсы).
// • Пока в Темнице пленные — Капкан не ловит. Пленных не тронули 24 ч — сбегают.
// • Казнить — всех сразу: лояльность населения по ценности пленных (1000 воинов средней цены — +100), не больше 100 в сутки;
//   за пленных с того же телефона или из своего альянса лояльности нет (против накрутки). Зал славы «Казни».
// • Завербовать — через 4 ч в армию встают случайно от 10% до 15% пленных (из каждого вида), остальные пропадают. Зал славы «Вербовка».
const SPEED = Number(process.env.SPEED || 1);
const TRAP = 48;
const T = { catch: 1000, rechargeSec: 12 * 3600, keepSec: 24 * 3600, recruitSec: 4 * 3600, recruitMin: 0.10, recruitMax: 0.15, loy: 100, loyDay: 100, charge: 20000 };
const DAY = 86400000;
const dayKey = (t) => Math.floor((t + 3 * 3600000) / DAY); // сутки — по Москве, как у лояльности (royal.js)
const ms = (s) => Math.max(10, Math.round(s / SPEED)) * 1000;
const RES4 = ['wood', 'stone', 'iron', 'food'];

function install(Game) {
  const P = Game.prototype;
  const A = () => require('./army');
  const costOf = (u) => RES4.reduce((s, r) => s + ((u.cost && u.cost[r]) || 0), 0);
  // кого Капкан может поймать: воины (не генерал, не разведчики, не мирные — учёные, археологи, путешественники)
  const catchable = (id) => { const u = A().UNIT[id]; return !!u && Number(id) !== A().GENERAL_ID && !u.spy && u.type !== 'special' && (u.attack > 0 || u.magic > 0); };
  // «средняя цена» воина — медиана по всем тренируемым воинам (для лояльности от казни)
  let REF = 0;
  const refCost = () => REF || (REF = (() => { const c = Object.keys(A().UNIT).filter(catchable).map((id) => costOf(A().UNIT[id])).filter((v) => v > 0).sort((a, b) => a - b); return c[Math.floor(c.length / 2)] || 1; })());
  const line = (units) => Object.entries(units).filter(([, n]) => n > 0).map(([id, n]) => `${(A().UNIT[id] || {}).name || 'воин'}: ${n}`).join(', ') || '—';
  const total = (units) => Object.values(units || {}).reduce((s, n) => s + n, 0);

  // кого завербуют: доля pct от всех пленных (округление вниз), поровну из каждого вида
  const recruitOf = (units, pct) => {
    const all = total(units), want = Math.floor(all * pct), out = {}; let left = want;
    const ids = Object.keys(units).sort((x, y) => units[y] - units[x]);
    for (const id of ids) { out[id] = Math.floor(units[id] * pct); left -= out[id]; }
    for (const id of ids) { if (left <= 0) break; if (out[id] < units[id]) { out[id]++; left--; } }
    for (const id of ids) if (!out[id]) delete out[id];
    return out;
  };
  P.trapOf = function trapOf(castle) { return this.buildingLevel(castle, TRAP) > 0; };
  // до боя: Капкан ловит часть армии нападающего (army.js arrive); возвращает пойманных или null
  P.trapCatch = function trapCatch(target, c, a, att, t = Date.now()) {
    if (!['attack', 'raid'].includes(a.mission) || target.owner === c.owner || !this.trapOf(target)) return null;
    const tr = (target.trap = target.trap || {});
    if ((tr.readyAt || 0) > t || (target.prison && total(target.prison.units))) return null;
    const ids = Object.keys(a.units).filter((id) => a.units[id] > 0 && catchable(id)), have = ids.reduce((s, id) => s + a.units[id], 0);
    if (!have) return null;
    const want = Math.min(T.catch, have), got = {};
    let left = want;
    ids.forEach((id) => { const n = Math.min(a.units[id], Math.floor(want * a.units[id] / have)); got[id] = n; left -= n; }); // поровну из каждого вида
    for (const id of ids.sort((x, y) => a.units[y] - a.units[x])) { if (left <= 0) break; const n = Math.min(left, a.units[id] - got[id]); got[id] += n; left -= n; }
    for (const id of ids) { a.units[id] -= got[id]; if (!got[id]) delete got[id]; }
    const def = this.ownerOf(target), mates = !!(att.alliance && def && att.alliance === def.alliance), multi = !!(def && this.sameDevice && this.sameDevice(att, def));
    target.prison = { units: got, from: att.id, login: att.login, at: t, until: t + ms(T.keepSec), noLoy: mates || multi };
    tr.readyAt = t + ms(T.rechargeSec); tr.caught = (tr.caught || 0) + total(got);
    this.trapLog(target, { at: t, act: 'catch', from: att.login, n: total(got), noLoy: target.prison.noLoy });
    return { units: got, n: total(got) };
  };
  // журнал Капкана — для админки «Осмотр» (последние 30 событий)
  P.trapLog = function trapLog(castle, e) { (castle.trapLog = castle.trapLog || []).push(e); if (castle.trapLog.length > 30) castle.trapLog.splice(0, castle.trapLog.length - 30); };

  // сколько лояльности даст казнь сейчас (с учётом дневного предела)
  P.trapLoyalty = function trapLoyalty(user, castle, now = Date.now()) {
    const p = castle.prison; if (!p || p.noLoy) return 0;
    const value = Object.entries(p.units).reduce((s, [id, n]) => s + n * costOf(A().UNIT[id] || {}), 0);
    const raw = Math.min(T.loy, Math.round(T.loy * value / (T.catch * refCost())));
    const today = user.trapLoyDay === dayKey(now) ? user.trapLoyToday || 0 : 0;
    return Math.max(0, Math.min(raw, T.loyDay - today));
  };
  P.trapExecute = function trapExecute(user, castle, now = Date.now()) {
    const p = castle.prison; if (!this.trapOf(castle) || !p || !total(p.units)) return { error: 'Темница пуста.' };
    const n = total(p.units), loy = this.trapLoyalty(user, castle, now);
    if (loy > 0) {
      if (user.trapLoyDay !== dayKey(now)) { user.trapLoyDay = dayKey(now); user.trapLoyToday = 0; }
      user.trapLoyToday += loy; if (this.royalTick) this.royalTick(user, now); user.royal = (user.royal || 0) + loy;
      this.addStat(user.id, 'loyal', loy);
    }
    this.addStat(user.id, 'execute', n);
    this.trapLog(castle, { at: now, act: 'execute', from: p.login, n, loy });
    castle.prison = null; this.store.save();
    return { ok: true, msg: `Казнено пленных: ${n}.${loy ? ` Лояльность населения +${loy}.` : p.noLoy ? ' Лояльности нет: пленные — с вашего телефона или из вашего альянса.' : ' Лояльность за казни сегодня уже получена (не больше 100 в сутки).'}` };
  };
  P.trapRecruit = function trapRecruit(user, castle, now = Date.now()) {
    const p = castle.prison; if (!this.trapOf(castle) || !p || !total(p.units)) return { error: 'Темница пуста.' };
    if (castle.recruit) return { error: 'Вербовка уже идёт.' };
    const all = total(p.units);
    castle.recruit = { pool: { ...p.units }, from: p.login, end: now + ms(T.recruitSec) }; // сколько согласится (10–15%) — решится в конце
    castle.prison = null; this.store.save();
    return { ok: true, msg: `Вербовка ${all} пленных началась: через ${Math.round(T.recruitSec / SPEED / 3600 * 10) / 10} ч станет известно, сколько согласятся служить вам (от ${Math.round(T.recruitMin * 100)}% до ${Math.round(T.recruitMax * 100)}%). Остальные пропадут.` };
  };
  // перезарядить сразу — за ресурсы замка
  P.trapCharge = function trapCharge(castle, now = Date.now()) {
    const tr = castle.trap || {}; if (!this.trapOf(castle)) return { error: 'Нужен Капкан.' };
    if ((tr.readyAt || 0) <= now) return { error: 'Капкан и так заряжен.' };
    this.tick(castle);
    if (RES4.some((r) => (castle.res[r] || 0) < T.charge)) return { error: `Не хватает ресурсов: нужно по ${T.charge.toLocaleString('ru-RU')} каждого.` };
    for (const r of RES4) castle.res[r] -= T.charge;
    tr.readyAt = now; this.store.save();
    return { ok: true, msg: 'Капкан заряжен.' };
  };
  P.trapView = function trapView(user, castle, now = Date.now()) {
    const tr = castle.trap || {}, p = castle.prison && total(castle.prison.units) ? castle.prison : null;
    return { ready: (tr.readyAt || 0) <= now, readyAt: tr.readyAt || 0, caught: tr.caught || 0, charge: T.charge, catchN: T.catch,
      recruitSec: Math.round(T.recruitSec / SPEED), loyDay: T.loyDay, pctMin: Math.round(T.recruitMin * 100), pctMax: Math.round(T.recruitMax * 100),
      prison: p ? { units: p.units, n: total(p.units), login: p.login, at: p.at, until: p.until, noLoy: !!p.noLoy, loy: this.trapLoyalty(user, castle, now), rMin: Math.floor(total(p.units) * T.recruitMin), rMax: Math.floor(total(p.units) * T.recruitMax) } : null,
      recruit: castle.recruit ? { units: castle.recruit.pool, n: total(castle.recruit.pool), end: castle.recruit.end, from: castle.recruit.from } : null };
  };
  // раз в секунду (army.js tickWorld): вербовка закончилась, пленные сбежали
  P.trapTick = function trapTick(now = Date.now()) {
    for (const c of Object.values(this.db.castles)) {
      if (c.recruit && c.recruit.end <= now) {
        const r = c.recruit, pct = T.recruitMin + Math.random() * (T.recruitMax - T.recruitMin), units = recruitOf(r.pool, pct), n = total(units), all = total(r.pool); c.recruit = null;
        for (const [id, k] of Object.entries(units)) c.units[id] = (c.units[id] || 0) + k;
        this.addStat(c.owner, 'recruit', n); this.addStat(c.owner, 'recruited', n); // «Вербовка» и законный прирост армии (anomaly.js)
        this.trapLog(c, { at: now, act: 'recruit', from: r.from, n, of: all });
        this.event(c.owner, n ? `Темница: служить вам согласились ${n} из ${all} пленных (${line(units)}) — они в армии замка «${c.name}». Остальные пропали.` : `Темница: из ${all} пленных служить не согласился никто.`);
        this.store.save();
      }
      if (c.prison && c.prison.until <= now) {
        const n = total(c.prison.units); this.trapLog(c, { at: now, act: 'escape', from: c.prison.login, n }); c.prison = null;
        if (n) this.event(c.owner, `Темница замка «${c.name}»: ${n} пленных сбежали — с ними ничего не сделали за сутки.`);
        this.store.save();
      }
    }
  };
  P.trapLine = (units) => line(units);
}

module.exports = { install, TRAP, T };
