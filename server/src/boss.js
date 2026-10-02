'use strict';
// Мировой босс: раз в неделю (суббота, 18:00 МСК) на карте появляется чудовище на 48 часов. Его бьёт весь сервер —
// армиями (Нападение или Набег, набег — половина урона). Здоровье общее и не восстанавливается.
// Бой — тот же общий удар (army.js clash): босс — «гарнизон» из частей по SEG здоровья, его сила удара постоянна.
// Итог (босс повержен или время вышло): награды по месту в таблице урона — ресурсы, снаряжение генерала, артефакт.
// Если босс ушёл непобеждённым — награды вдвое меньше. Золото босс не даёт.

const RES4 = ['wood', 'stone', 'iron', 'food'];
const DAY = 86400000, LIFE = 2 * DAY, SEG = 1000;
const BOSSES = [
  { kind: 'dragon', name: 'Древний дракон Игнис', desc: 'Пробудился в огненных горах и жжёт всё на своём пути.', bite: 0.4, def: 32, mdef: 18 },
  { kind: 'troll', name: 'Тролль-вожак Грох', desc: 'Каменная шкура держит удары, но магия его жжёт.', bite: 0.3, def: 45, mdef: 10 },
  { kind: 'lich', name: 'Король-лич Морвейн', desc: 'Мёртвый король с армией теней. Магия против него слаба.', bite: 0.35, def: 20, mdef: 45 },
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
      if (x < 2 || y < 2 || x >= W - 2 || y >= W - 2 || this.worldObjects(x, y, 1, 1).length) continue;
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
    const hp = Math.min(5e6, 300000 + 30000 * active);
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
    if (b && (b.hp <= 0 || now >= b.end)) this.bossFinish(now);
    else if (!b && now >= s.next) this.bossSpawn(now);
  };

  // итог: места по урону, награды в столицу, отчёт каждому участнику
  P.bossFinish = function bossFinish(now = Date.now()) {
    const s = state(this), b = s.cur; if (!b || b.done) return;
    b.done = true; const killed = b.hp <= 0, total = Object.values(b.dmg).reduce((q, v) => q + v, 0) || 1;
    const rows = Object.entries(b.dmg).map(([id, d]) => ({ id: Number(id), d })).sort((p, q) => q.d - p.d);
    rows.forEach((r, i) => {
      const u = this.userById(r.id), cap = u && this.castlesOf(u)[0]; if (!cap) return;
      const place = i + 1, share = r.d / total, k = killed ? 1 : 0.5;
      const res = Math.round((2000 + 80000 * share + (place === 1 ? 20000 : place <= 3 ? 10000 : place <= 10 ? 4000 : 0)) * k);
      const capy = this.capacity(cap); for (const x of RES4) cap.res[x] = Math.min(capy[x], cap.res[x] + res);
      const lines = [`${b.name} ${killed ? 'повержен!' : 'ушёл непобеждённым — награды вдвое меньше.'}`, `Ваше место: ${place} из ${rows.length}. Урон: ${r.d.toLocaleString('ru-RU')} (${(share * 100).toFixed(1)}%).`, `Ресурсы: по ${res.toLocaleString('ru-RU')} каждого.`];
      let rar = place === 1 ? 3 : place <= 3 ? 2 : place <= 10 ? 1 : share >= 0.005 && Math.random() < 0.5 ? 0 : -1;
      if (!killed) rar = place <= 10 ? rar - 1 : -1;
      if (rar >= 0) lines.push(this.giveGear(cap, this.rollGear(0, rar)));
      if (killed && b.killer === r.id) lines.push(`Последний удар — ваш! ${this.giveGear(cap, this.rollGear(0, 2))}`);
      if (killed && place <= 3) { this.mil(cap); const types = Object.keys(require('./army').ART_TYPES); cap.artifacts.push({ id: this.db.nextId++, type: types[Math.floor(Math.random() * types.length)], rarity: place === 1 ? 2 : 1, active: false, found: now }); lines.push('Артефакт за место в тройке лучших — в Сокровищнице.'); }
      this.addStat(r.id, 'bossDmg', r.d);
      this.report(r.id, `Мировой босс: ${place}-е место`, lines, 'battle');
    });
    s.last = { name: b.name, kind: b.kind, killed, top: rows.slice(0, 10).map((r) => ({ login: (this.userById(r.id) || {}).login || '?', d: r.d })), at: now };
    this.bossNews(killed ? `🏆 ${b.name} повержен! Лучший урон: ${s.last.top[0] ? s.last.top[0].login : '—'}. Награды разосланы в отчётах.` : `${b.name} ушёл непобеждённым. Участники получили половину наград.`);
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
    const lost = Math.min(segs, (R.garrison[0] || {}).lost || 0), dmg = Math.min(b.hp, lost * SEG);
    b.hp -= dmg; b.dmg[c.owner] = (b.dmg[c.owner] || 0) + dmg; b.hits[c.owner] = (b.hits[c.owner] || 0) + 1;
    if (b.hp <= 0 && !b.killer) b.killer = c.owner;
    const alive = Object.values(a.units).some((n) => n > 0), lostN = Object.values(R.aLost).reduce((q, n) => q + n, 0);
    const lines = [`${a.mission === 'raid' ? 'Набег' : 'Нападение'} на ${b.name} (${b.x}:${b.y}).`, `Урон по боссу: ${dmg.toLocaleString('ru-RU')} (${(dmg / b.maxHp * 100).toFixed(2)}% здоровья).`,
      b.hp > 0 ? `У босса осталось ${b.hp.toLocaleString('ru-RU')} из ${b.maxHp.toLocaleString('ru-RU')}.` : 'Босс повержен! Ваш удар — последний.',
      `Ваши потери: ${lostN} из ${before} воинов.`, `Ваш урон за всё время: ${b.dmg[c.owner].toLocaleString('ru-RU')}.`];
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
    return { next: s.next, last: s.last, boss: b ? { kind: b.kind, name: b.name, desc: (BOSSES.find((x) => x.kind === b.kind) || {}).desc, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, end: b.end, top: top(b.dmg), mine: b.dmg[user.id] || 0, players: Object.keys(b.dmg).length } : null };
  };
}

module.exports = { install, BOSSES, nextSaturday };
