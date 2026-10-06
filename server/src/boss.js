'use strict';
// Мировой босс: появляется, когда его вызывает администратор (админ-панель → «Мировой босс»), на 48 часов. Его бьёт весь сервер —
// армиями (Нападение или Набег, набег — половина урона). Здоровье общее и не восстанавливается.
// Бой — тот же общий удар (army.js clash): босс — «гарнизон» из частей по SEG здоровья, его сила удара постоянна.
// Итог: если босс повержен — 12 лучших по урону получают репутацию и лояльность населения (PRIZE), первые три — ещё медаль.
// Ушёл непобеждённым — наград нет. Золото босс не даёт.
// Здоровье — 1,5 млн + 150 тыс. за каждого активного игрока (до 30 млн).

const RES4 = ['wood', 'stone', 'iron', 'food'];
const DAY = 86400000, LIFE = 2 * DAY, SEG = 1000;
// награды: только если босс повержен, 1–12 место по урону (репутация сразу, лояльность — в Кладовую)
// 1–12 место; первые три — ещё медаль (золото, серебро, бронза) в профиль
const PRIZE = [[150, 700], [100, 500], [50, 300], [30, 200], [30, 200], [30, 200], [20, 150], [20, 150], [20, 150], [10, 100], [10, 100], [10, 100]].map(([rep, royal]) => ({ rep, royal }));
// сила босса: за удар он забирает не меньше kill армии (набег — вдвое меньше), в ярости (меньше RAGE здоровья) — в полтора раза больше;
// один удар снимает не больше HIT_MAX здоровья — одному игроку босса не свалить, нужен весь сервер
const HIT_MAX = 0.05, RAGE = 0.3, RAGE_K = 1.5;
const SLAYER = { dragon: 'Драконоборец', troll: 'Сокрушитель троллей', lich: 'Изгоняющий тьму' };
const BOSSES = [
  { kind: 'dragon', name: 'Древний дракон Игнис', desc: 'Пробудился в огненных горах и жжёт всё на своём пути.', bite: 0.4, def: 32, mdef: 18, kill: 0.15 },
  { kind: 'troll', name: 'Тролль-вожак Грох', desc: 'Каменная шкура держит удары, но магия его жжёт.', bite: 0.3, def: 45, mdef: 10, kill: 0.12 },
  { kind: 'lich', name: 'Король-лич Морвейн', desc: 'Мёртвый король с армией теней. Магия против него слаба.', bite: 0.35, def: 20, mdef: 45, kill: 0.15 },
];
// следующая суббота 15:00 UTC (18:00 МСК)
function nextSaturday(now) {
  const d = new Date(now); d.setUTCHours(15, 0, 0, 0);
  const add = (6 - d.getUTCDay() + 7) % 7; d.setUTCDate(d.getUTCDate() + add);
  if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 7);
  return d.getTime();
}

function install(Game) {
  const P = Game.prototype;
  const state = (g) => { if (!g.db.boss) g.db.boss = { cur: null, next: nextSaturday(Date.now()), n: 0, last: null }; return g.db.boss; };

  P.bossNow = function bossNow() { const s = state(this); return s.cur && !s.cur.done ? s.cur : null; };
  P.bossAt = function bossAt(x, y) { const b = this.bossNow(); return b && b.x === x && b.y === y ? b : null; };

  // где появиться: свободный луг возле «середины» заселённых мест
  P.bossSpot = function bossSpot() {
    const cs = Object.values(this.db.castles); const W = require('./game').WORLD || 1000;
    const med = (arr) => { const s = arr.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : W / 2; };
    const cx = med(cs.map((c) => c.x)), cy = med(cs.map((c) => c.y));
    for (let k = 0; k < 2000; k++) {
      const r = 4 + Math.floor(k / 40), a = Math.random() * Math.PI * 2, x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      if (x < 2 || y < 2 || x >= W - 2 || y >= W - 2 || require('./game').onProvEdge(x, y) || this.worldObjects(x, y, 1, 1).length) continue;
      let near = false; for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (this.castleAt(x + dx, y + dy)) { near = true; break; } // не вплотную к замкам
      if (near) continue;
      if (k < 1500 && !require('./game').meadowAt(x, y)) continue; // на лугу (require здесь — game.js грузит этот модуль)
      return { x, y };
    }
    return { x: Math.round(cx), y: Math.round(cy) };
  };

  P.bossSpawn = function bossSpawn(now = Date.now(), kindIdx) {
    const s = state(this);
    if (this.bossNow()) this.bossFinish(now);
    const K = BOSSES[kindIdx !== undefined ? kindIdx % BOSSES.length : s.n % BOSSES.length]; s.n++;
    const active = Object.values(this.db.users).filter((u) => !u.bot && !u.banned && (u.lastSeen || u.created || 0) > now - 7 * DAY).length;
    const hp = Math.min(30e6, 1500000 + 150000 * active);
    const spot = this.bossSpot();
    s.cur = { id: this.db.nextId++, kind: K.kind, name: K.name, ...spot, hp, maxHp: hp, start: now, end: now + LIFE, dmg: {}, hits: {}, done: false };
    s.next = nextSaturday(now + LIFE);
    this.bossNews(`🐉 На карте мира появился ${K.name} (${spot.x}:${spot.y})! У королей 48 часов, чтобы сразить его. Награды — по нанесённому урону.`);
    this.store.save();
    return s.cur;
  };
  // оповестить всех игроков (события → всплывающие сообщения у тех, кто в игре)
  P.bossNews = function bossNews(msg) { for (const u of Object.values(this.db.users)) if (!u.bot) this.event(u.id, msg); };

  P.bossCheck = function bossCheck(now = Date.now()) {
    const s = state(this), b = this.bossNow();
    void s;
    if (b && (b.hp <= 0 || now >= b.end)) this.bossFinish(now); // сам не появляется — только по команде админа
  };

  // итог: места по урону, награды в столицу, отчёт каждому участнику
  P.bossFinish = function bossFinish(now = Date.now()) {
    const s = state(this), b = s.cur; if (!b || b.done) return;
    b.done = true; const killed = b.hp <= 0, total = Object.values(b.dmg).reduce((q, v) => q + v, 0) || 1;
    const rows = Object.entries(b.dmg).map(([id, d]) => ({ id: Number(id), d })).sort((p, q) => q.d - p.d);
    rows.forEach((r, i) => {
      const u = this.userById(r.id); if (!u) return;
      const place = i + 1, share = r.d / total;
      const lines = [`${b.name} ${killed ? 'повержен!' : 'ушёл непобеждённым — наград нет.'}`, `Ваше место: ${place} из ${rows.length}. Урон: ${r.d.toLocaleString('ru-RU')} (${(share * 100).toFixed(1)}%).`];
      const pr = killed && PRIZE[place - 1];
      if (pr) { // награды — только тройке лучших и только если босс повержен
        u.reputation = (u.reputation ?? 10) + pr.rep;
        this.stashAdd(u, { royal: pr.royal });
        lines.push(`Награда за ${place}-е место: +${pr.rep} репутации, ${pr.royal} лояльности населения — в Кладовой.`);
        if (place <= 3) { (u.bossBadges = u.bossBadges || []).push({ kind: b.kind, name: b.name, at: now, place, killed: true }); lines.push(`Медаль «${['Золото', 'Серебро', 'Бронза'][place - 1]}: ${b.name}» — в Вашем профиле.`); }
      } else if (killed) lines.push(`Награды получают ${PRIZE.length} лучших по урону.`);
      this.addStat(r.id, 'bossDmg', r.d);
      this.report(r.id, `Мировой босс: ${place}-е место`, lines, 'battle');
    });
    s.last = { name: b.name, kind: b.kind, killed, top: rows.slice(0, 10).map((r) => ({ login: (this.userById(r.id) || {}).login || '?', d: r.d })), at: now };
    this.bossNews(killed ? `🏆 ${b.name} повержен! Лучший урон: ${s.last.top[0] ? s.last.top[0].login : '—'}. Награды разосланы в отчётах.` : `${b.name} ушёл непобеждённым. Наград нет.`);
    this.store.save();
  };

  // удар армии по боссу: общий удар (clash) против «гарнизона» босса, армия возвращается домой
  P.bossFight = function bossFight(c, a, t, b) {
    const K = BOSSES.find((x) => x.kind === b.kind) || BOSSES[0], segs = Math.max(1, Math.ceil(b.hp / SEG));
    // ответный удар — доля силы самой армии (bite): большая армия теряет столько же процентов, сколько маленькая
    const { UNIT } = require('./army'), raw = Object.entries(a.units).reduce((q, [id, n]) => q + ((UNIT[id] && UNIT[id].attack) || 0) * n, 0) || 1;
    const npc = { name: b.name, boss: true, garrison: [{ key: 'boss', name: b.name, n: segs, hp: SEG, atk: raw * K.bite / segs, mag: 0, def: K.def, mdef: K.mdef, type: 'infantry' }] };
    const before = Object.values(a.units).reduce((q, n) => q + n, 0);
    const R = this.clash(c, a, null, npc, t);
    const lost = Math.min(segs, (R.garrison[0] || {}).lost || 0), cap = Math.round(b.maxHp * HIT_MAX), dmg = Math.min(b.hp, lost * SEG, cap);
    // потери не меньше доли kill: босс выкашивает часть армии при любом её размере
    const rage = b.hp / b.maxHp < RAGE, need = Math.round(before * K.kill * (a.mission === 'raid' ? 0.5 : 1) * (rage ? RAGE_K : 1));
    const extra = need - Object.values(R.aLost).reduce((q, n) => q + n, 0);
    if (extra > 0) {
      const ids = Object.keys(a.units).filter((id) => a.units[id] > 0 && !(UNIT[id] && UNIT[id].oneUse)).sort((p, q) => a.units[q] - a.units[p]), left = ids.reduce((q, id) => q + a.units[id], 0);
      const take = ids.map((id) => [id, Math.min(a.units[id], Math.floor(extra * a.units[id] / Math.max(1, left)))]);
      let rest = Math.min(extra, left) - take.reduce((q, [, n]) => q + n, 0);
      for (const tk of take) { if (rest <= 0) break; const add = Math.min(rest, a.units[tk[0]] - tk[1]); tk[1] += add; rest -= add; }
      for (const [id, n] of take) if (n > 0) { a.units[id] -= n; R.aLost[id] = (R.aLost[id] || 0) + n; }
    }
    this.addStat(c.owner, 'attLost', Object.entries(R.aLost).reduce((q, [id, n]) => q + ((UNIT[id] && UNIT[id].pop) || 0) * n, 0)); // Зал Гибели: потери в бою с боссом
    b.hp -= dmg; b.dmg[c.owner] = (b.dmg[c.owner] || 0) + dmg; b.hits[c.owner] = (b.hits[c.owner] || 0) + 1;
    if (b.hp <= 0 && !b.killer) b.killer = c.owner;
    const alive = Object.values(a.units).some((n) => n > 0), lostN = Object.values(R.aLost).reduce((q, n) => q + n, 0);
    const lines = [`${a.mission === 'raid' ? 'Набег' : 'Нападение'} на ${b.name} (${b.x}:${b.y}).`, `Урон по боссу: ${dmg.toLocaleString('ru-RU')} (${(dmg / b.maxHp * 100).toFixed(2)}% здоровья).`,
      b.hp > 0 ? `У босса осталось ${b.hp.toLocaleString('ru-RU')} из ${b.maxHp.toLocaleString('ru-RU')}.` : 'Босс повержен! Ваш удар — последний.',
      `Ваши потери: ${lostN} из ${before} воинов.${rage ? ` ${b.name} в ярости — бьёт в полтора раза сильнее!` : ''}`, ...(dmg === cap && lost * SEG > cap ? [`Больше ${Math.round(HIT_MAX * 100)}% здоровья босса за один удар не снять.`] : []), `Ваш урон за всё время: ${b.dmg[c.owner].toLocaleString('ru-RU')}.`];
    if (a.general && c.general && !c.general.dead) {
      if (!alive) {
        if (Math.random() < this.heroBonus(c.general).survive) lines.push('Армия разбита, но генерал уцелел.');
        else { c.general.dead = true; delete c.general.away; a.general = false; this.heroStrip(c, c.general); lines.push('Генерал пал в бою — снаряжение вернулось в Оружейную.'); }
      } else { const r = this.addGeneralExp(c, Math.round(dmg / 40)); if (r && r.got) lines.push(`Генерал получил ${r.got.toLocaleString('ru-RU')} опыта.`); }
    }
    this.addStat(c.owner, 'kills', Math.round(dmg / 100));
    this.report(c.owner, `Мировой босс: урон ${dmg.toLocaleString('ru-RU')}`, lines, 'battle');
    if (b.hp <= 0) this.bossFinish(t);
    if (!alive) { c.armies = c.armies.filter((x) => x !== a); if (a.general && c.general) delete c.general.away; return; }
    return this.goBack(c, a, t);
  };

  // окно босса для клиента
  P.bossView = function bossView(user) {
    const s = state(this), b = this.bossNow();
    const top = (d) => Object.entries(d).map(([id, v]) => ({ login: (this.userById(Number(id)) || {}).login || '?', d: v })).sort((p, q) => q.d - p.d).slice(0, 10);
    return { last: s.last, boss: b ? { kind: b.kind, name: b.name, desc: (BOSSES.find((x) => x.kind === b.kind) || {}).desc, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, end: b.end, top: top(b.dmg), mine: b.dmg[user.id] || 0, players: Object.keys(b.dmg).length } : null };
  };
}

module.exports = { install, BOSSES, SLAYER, PRIZE, nextSaturday };
