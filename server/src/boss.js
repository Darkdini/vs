'use strict';
// Мировой босс: появляется, когда его вызывает администратор (админ-панель → «Мировой босс»), на 48 часов. Его бьют альянсы — созывом:
// руководство альянса объявляет созыв на 15 минут, участники отправляют в него войска и генерала; когда время выходит, армии складываются
// и бьют босса одним ударом. Каждая часть бьёт со своими Кузницей, наукой и генералом; урон созыва делится по вкладу, потери — у каждой части свои.
// Бой — тот же общий удар (army.js clashHp): босс — «гарнизон» из частей по SEG здоровья, его сила удара постоянна.
// Итог (повержен или ушёл): награды в Кладовую всем, кто нанёс урон: 1-е место — 20 000 каждого ресурса, 10 репутации, 100 лояльности населения;
// если босс повержен — вчетверо больше; остальным — меньше, по доле урона от 1-го места. Если повержен — первым трём ещё медаль. Золото босс не даёт.
// Здоровье — 1,5 млн + 150 тыс. за каждого активного игрока (до 30 млн).

const RES4 = ['wood', 'stone', 'iron', 'food'];
const DAY = 86400000, LIFE = 2 * DAY, SEG = 1000;
// награда 1-го места по урону (босс ушёл); повержен — ×KILL_X; остальным — доля от урона 1-го места
const REWARD = { res: 20000, rep: 10, royal: 100 }, KILL_X = 4;
// созыв длится RALLY_SEC (с учётом скорости мира). Один удар созыва снимает не больше HIT_MAX здоровья за каждого игрока в нём, всего — не больше HIT_CAP
const RALLY_SEC = 900, HIT_MAX = 0.05, HIT_CAP = 0.25;
// сила босса: за удар он забирает не меньше kill каждой части армии, в ярости (меньше RAGE здоровья) — в полтора раза больше
const RAGE = 0.3, RAGE_K = 1.5;
const SLAYER = { dragon: 'Драконоборец', troll: 'Сокрушитель троллей', lich: 'Изгоняющий тьму' };
const BOSSES = [
  { kind: 'dragon', name: 'Древний дракон Игнис', desc: 'Пробудился в огненных горах и жжёт всё на своём пути.', bite: 0.4, def: 32, mdef: 18, kill: 0.15 },
  { kind: 'troll', name: 'Тролль-вожак Грох', desc: 'Каменная шкура держит удары, но магия его жжёт.', bite: 0.3, def: 45, mdef: 10, kill: 0.12 },
  { kind: 'lich', name: 'Король-лич Морвейн', desc: 'Мёртвый король с армией теней. Магия против него слаба.', bite: 0.35, def: 20, mdef: 45, kill: 0.15 },
];
const fmt = (n) => Math.round(n).toLocaleString('ru-RU'), pctTxt = (k) => `${(k * 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
const SPEED = () => require('./game').SPEED || 1; // require здесь — game.js грузит этот модуль
// следующая суббота 15:00 UTC (18:00 МСК)
function nextSaturday(now) {
  const d = new Date(now); d.setUTCHours(15, 0, 0, 0);
  const add = (6 - d.getUTCDay() + 7) % 7; d.setUTCDate(d.getUTCDate() + add);
  if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 7);
  return d.getTime();
}
// награда за место: доля share (урон / урон 1-го места), повержен — ×KILL_X
function rewardFor(share, killed) {
  const k = share * (killed ? KILL_X : 1), res = Math.round(REWARD.res * k);
  return { wood: res, stone: res, iron: res, food: res, rep: Math.round(REWARD.rep * k), royal: Math.round(REWARD.royal * k) };
}

function install(Game) {
  const P = Game.prototype;
  const state = (g) => { if (!g.db.boss) g.db.boss = { cur: null, next: nextSaturday(Date.now()), n: 0, last: null }; return g.db.boss; };
  const login = (g, id) => (g.userById(id) || {}).login || '?';
  const armyN = (units) => Object.values(units).reduce((q, n) => q + n, 0);

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
      if (k < 1500 && !require('./game').meadowAt(x, y)) continue; // на лугу
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
    s.cur = { id: this.db.nextId++, kind: K.kind, name: K.name, ...spot, hp, maxHp: hp, start: now, end: now + LIFE, dmg: {}, hits: {}, ally: {}, rallies: {}, done: false };
    s.next = nextSaturday(now + LIFE);
    this.bossNews(`🐉 На карте мира появился ${K.name} (${spot.x}:${spot.y})! У королей 48 часов, чтобы сразить его созывом альянса. Награды — по нанесённому урону.`);
    this.store.save();
    return s.cur;
  };
  // оповестить всех игроков (события → всплывающие сообщения у тех, кто в игре)
  P.bossNews = function bossNews(msg) { for (const u of Object.values(this.db.users)) if (!u.bot) this.event(u.id, msg); };

  P.bossCheck = function bossCheck(now = Date.now()) {
    const b = this.bossNow();
    if (b && (b.hp <= 0 || now >= b.end)) this.bossFinish(now); // сам не появляется — только по команде админа
  };

  // итог: места по урону, награды в Кладовую, отчёт каждому участнику; созывы, что ещё собирались, распускаются
  P.bossFinish = function bossFinish(now = Date.now()) {
    const s = state(this), b = s.cur; if (!b || b.done) return;
    b.done = true; const killed = b.hp <= 0, total = Object.values(b.dmg).reduce((q, v) => q + v, 0) || 1;
    for (const r of Object.values(b.rallies || {})) this.rallyStrike(b, r, now);
    const rows = Object.entries(b.dmg).filter(([, d]) => d > 0).map(([id, d]) => ({ id: Number(id), d })).sort((p, q) => q.d - p.d), first = rows.length ? rows[0].d : 1;
    rows.forEach((r, i) => {
      const u = this.userById(r.id); if (!u) return;
      const place = i + 1, pr = rewardFor(r.d / first, killed);
      const lines = [`${b.name} ${killed ? 'повержен!' : 'ушёл непобеждённым.'}`, `Ваше место: ${place} из ${rows.length}. Урон: ${fmt(r.d)} (${pctTxt(r.d / total)}).`];
      this.stashAdd(u, pr); u.reputation = (u.reputation ?? 10) + pr.rep;
      lines.push(`Награда — в Кладовой: ${fmt(pr.wood)} каждого ресурса, ${pr.royal} лояльности населения; репутация +${pr.rep}.${place > 1 ? ` (${Math.round(r.d / first * 100)}% от награды 1-го места — по урону.)` : ''}`);
      if (killed && place <= 3) { (u.bossBadges = u.bossBadges || []).push({ kind: b.kind, name: b.name, at: now, place, killed: true }); lines.push(`Медаль «${['Золото', 'Серебро', 'Бронза'][place - 1]}: ${b.name}» — в Вашем профиле.`); }
      this.report(r.id, `Мировой босс: ${place}-е место`, lines, 'battle');
    });
    const allies = Object.entries(b.ally || {}).map(([id, d]) => ({ tag: ((this.db.alliances || {})[id] || {}).tag || '?', d })).sort((p, q) => q.d - p.d).slice(0, 5);
    s.last = { name: b.name, kind: b.kind, killed, top: rows.slice(0, 10).map((r) => ({ login: login(this, r.id), d: r.d })), allies, at: now };
    this.bossNews(killed ? `🏆 ${b.name} повержен! Лучший урон: ${s.last.top[0] ? s.last.top[0].login : '—'}. Награды — в Кладовой, подробности в отчётах.`
      : `${b.name} ушёл непобеждённым. Награды по урону — в Кладовой, подробности в отчётах.`);
    this.store.save();
  };

  // удар одной части созыва (армия a из замка c): бой с «гарнизоном» босса со своими бонусами и потери (не меньше доли kill);
  // возвращает урон без предела — предел у созыва целиком
  const strike = (g, c, a, b, t) => {
    const K = BOSSES.find((x) => x.kind === b.kind) || BOSSES[0], segs = Math.max(1, Math.ceil(b.hp / SEG));
    // ответный удар — доля силы самой армии (bite): большая армия теряет столько же процентов, сколько маленькая
    const { UNIT } = require('./army'), raw = Object.entries(a.units).reduce((q, [id, n]) => q + ((UNIT[id] && UNIT[id].attack) || 0) * n, 0) || 1;
    const npc = { name: b.name, boss: true, garrison: [{ key: 'boss', name: b.name, n: segs, hp: SEG, atk: raw * K.bite / segs, mag: 0, def: K.def, mdef: K.mdef, type: 'infantry' }] };
    const before = armyN(a.units);
    const R = g.clashHp(c, a, null, npc, t);
    const lost = Math.min(segs, (R.garrison[0] || {}).lost || 0);
    const rage = b.hp / b.maxHp < RAGE, need = Math.round(before * K.kill * (rage ? RAGE_K : 1));
    const extra = need - armyN(R.aLost);
    if (extra > 0) { // босс выкашивает часть армии при любом её размере
      const ids = Object.keys(a.units).filter((id) => a.units[id] > 0 && !(UNIT[id] && UNIT[id].oneUse)).sort((p, q) => a.units[q] - a.units[p]), left = ids.reduce((q, id) => q + a.units[id], 0);
      const take = ids.map((id) => [id, Math.min(a.units[id], Math.floor(extra * a.units[id] / Math.max(1, left)))]);
      let rest = Math.min(extra, left) - take.reduce((q, [, n]) => q + n, 0);
      for (const tk of take) { if (rest <= 0) break; const add = Math.min(rest, a.units[tk[0]] - tk[1]); tk[1] += add; rest -= add; }
      for (const [id, n] of take) if (n > 0) { a.units[id] -= n; R.aLost[id] = (R.aLost[id] || 0) + n; }
    }
    g.addStat(c.owner, 'attLost', Object.entries(R.aLost).reduce((q, [id, n]) => q + ((UNIT[id] && UNIT[id].pop) || 0) * n, 0)); // Зал Гибели: потери в бою с боссом
    return { raw: lost * SEG, before, lostN: armyN(R.aLost), rage };
  };

  // созыв: объявляет руководство альянса (право «Созыв на мирового босса»), один на альянс; длится RALLY_SEC
  P.rallyStart = function rallyStart(user, now = Date.now()) {
    const b = this.bossNow(); if (!b) return { error: 'Сейчас мирового босса нет.' };
    const al = this.allianceOf(user); if (!al) return { error: 'Мирового босса бьют альянсами — вступите в альянс.' };
    if (!this.allyCan(al, user.id, 'rally')) return { error: 'Созыв объявляет руководство альянса (право «Созыв на мирового босса»).' };
    b.rallies = b.rallies || {};
    if (b.rallies[al.id]) return { error: 'Созыв уже идёт — отправляйте в него войска.' };
    const sec = Math.round(RALLY_SEC / SPEED()), end = now + sec * 1000;
    if (end > b.end) return { error: `${b.name} уйдёт раньше, чем закончится созыв.` };
    const r = { id: this.db.nextId++, ally: al.id, tag: al.tag, by: user.id, start: now, end };
    b.rallies[al.id] = r;
    const msg = `⚔ ${user.login} объявил созыв на «${b.name}»! ${Math.round(sec / 60)} мин — отправьте войска: Мировой босс → «В созыв».`;
    for (const id of al.members) if (id !== user.id) { this.event(id, msg); if (this.tgNotify) this.tgNotify(id, 'battle', msg); } // и в Telegram, у кого привязан
    this.store.save();
    return { ok: true, rally: r };
  };
  // идущий созыв альянса игрока — в него можно отправить войска (army.js sendArmy, миссия rally)
  P.rallyOf = function rallyOf(user, now = Date.now()) {
    const b = this.bossNow(), al = this.allianceOf(user), r = b && al && b.rallies && b.rallies[al.id];
    return r && r.end > now ? { r, b } : null;
  };
  // армии созыва: идут к боссу и ещё не ударили
  const rallyParts = (g, r) => { const out = []; for (const c of Object.values(g.db.castles)) for (const a of c.armies || []) if (a.rally === r.id && a.mission === 'rally' && a.state === 'go') out.push([c, a]); return out; };
  // созывы, у которых вышло время, бьют (вызывается из army.js tickWorld — до прибытия армий)
  P.rallyTick = function rallyTick(now = Date.now()) {
    const b = this.bossNow(); if (!b || !b.rallies) return;
    for (const r of Object.values(b.rallies)) if (r.end <= now) this.rallyStrike(b, r, now);
  };
  // удар созыва: части складываются в одну армию; урон — сумма частей, не больше предела; каждому — свой вклад, свои потери и отчёт
  P.rallyStrike = function rallyStrike(b, r, now = Date.now()) {
    delete b.rallies[r.ally];
    const t = Math.min(r.end, now), parts = rallyParts(this, r), alive = !b.done && b.hp > 0; // босс уже повержен или ушёл (bossFinish) — созыв распускается
    const home = (c, a) => { // армия созыва идёт домой быстрым маршем
      const left = Object.values(a.units).some((n) => n > 0) || (a.general && c.general && !c.general.dead);
      if (!left) { c.armies = c.armies.filter((x) => x !== a); if (a.general && c.general) delete c.general.away; return; }
      a.state = 'back'; a.arrive = t; a.back = t + (a.ret || 60) * 1000;
    };
    if (!parts.length) { this.report(r.by, `Созыв на «${b.name}» не состоялся`, ['Никто не отправил войска в созыв.'], 'battle'); this.store.save(); return; }
    if (!alive) {
      for (const [c, a] of parts) { this.report(c.owner, `Созыв на «${b.name}» не состоялся`, [`${b.name} уже ${b.hp <= 0 ? 'повержен' : 'ушёл'} — армия возвращается домой.`], 'battle'); home(c, a); }
      this.store.save(); return;
    }
    const hits = parts.map(([c, a]) => { const sent = armyN(a.units); return { c, a, sent, gen: !!a.general, ...strike(this, c, a, b, t) }; });
    const players = new Set(hits.map((h) => h.c.owner)).size, capK = Math.min(HIT_CAP, HIT_MAX * players), cap = Math.round(b.maxHp * capK);
    const raw = hits.reduce((q, h) => q + h.raw, 0), total = Math.min(b.hp, raw, cap), k = raw > 0 ? total / raw : 0;
    let given = 0; hits.forEach((h, i) => { h.dmg = i === hits.length - 1 ? total - given : Math.floor(h.raw * k); given += h.dmg; });
    b.hp -= total; b.ally = b.ally || {}; b.ally[r.ally] = (b.ally[r.ally] || 0) + total;
    for (const h of hits) { b.dmg[h.c.owner] = (b.dmg[h.c.owner] || 0) + h.dmg; b.hits[h.c.owner] = (b.hits[h.c.owner] || 0) + 1; }
    if (b.hp <= 0 && !b.killer) b.killer = hits.slice().sort((p, q) => q.dmg - p.dmg)[0].c.owner;
    // армия созыва целиком: кто сколько прислал (одного игрока из разных замков — вместе)
    const by = new Map(); for (const h of hits) { const v = by.get(h.c.owner) || { n: 0, gen: 0 }; v.n += h.sent; v.gen += h.gen ? 1 : 0; by.set(h.c.owner, v); }
    const comp = [...by].map(([id, v]) => `${login(this, id)} — ${fmt(v.n)}${v.gen ? ' и генерал' : ''}`).join(', '), sum = hits.reduce((q, h) => q + h.sent, 0);
    for (const h of hits) {
      const { c, a } = h, lines = [`Созыв альянса [${r.tag}] на ${b.name} (${b.x}:${b.y}): армии ${players} ${players === 1 ? 'игрока' : 'игроков'} сложились — ${fmt(sum)} воинов вместе.`,
        `Армия созыва: ${comp}.`,
        `Урон созыва: ${fmt(total)} (${pctTxt(total / b.maxHp)} здоровья).${raw > cap && cap < b.hp + total ? ` За один удар созыв из ${players} ${players === 1 ? 'игрока' : 'игроков'} снимает не больше ${Math.round(capK * 100)}% здоровья босса (каждый игрок +${Math.round(HIT_MAX * 100)}%, всего до ${Math.round(HIT_CAP * 100)}%).` : ''}`,
        `Ваш вклад: ${fmt(h.dmg)} (${total ? Math.round(h.dmg / total * 100) : 0}% урона созыва — по силе Ваших войск).`,
        b.hp > 0 ? `У босса осталось ${fmt(b.hp)} из ${fmt(b.maxHp)}.` : `${b.name} повержен!`,
        `Ваши потери: ${fmt(h.lostN)} из ${fmt(h.before)} воинов.${h.rage ? ` ${b.name} в ярости — бьёт в полтора раза сильнее!` : ''}`, `Ваш урон за всё время: ${fmt(b.dmg[c.owner])}.`];
      if (a.general && c.general && !c.general.dead) {
        if (!Object.values(a.units).some((n) => n > 0)) {
          if (Math.random() < this.heroBonus(c.general).survive) lines.push('Армия разбита, но генерал уцелел.');
          else { c.general.dead = true; delete c.general.away; a.general = false; this.heroStrip(c, c.general); lines.push('Генерал пал в бою — снаряжение вернулось в Оружейную.'); }
        } else { const ge = this.addGeneralExp(c, Math.round(h.dmg / 40)); if (ge && ge.got) lines.push(`Генерал получил ${fmt(ge.got)} опыта.`); }
      }
      this.addStat(c.owner, 'kills', Math.round(h.dmg / 100)); this.addStat(c.owner, 'bossDmg', h.dmg); // задание «Удар по чудовищу» — сразу после удара созыва
      this.report(c.owner, `Созыв на мирового босса: урон ${fmt(total)}`, lines, 'battle');
      home(c, a);
    }
    if (b.hp <= 0) this.bossFinish(t);
    this.store.save();
  };

  // окно босса для клиента: здоровье, места по урону, альянсы, созыв своего альянса
  P.bossView = function bossView(user) {
    const s = state(this), b = this.bossNow(), al = this.allianceOf(user), now = Date.now();
    const top = (d) => Object.entries(d).map(([id, v]) => ({ login: login(this, Number(id)), d: v })).sort((p, q) => q.d - p.d).slice(0, 10);
    const r = b && al && b.rallies && b.rallies[al.id];
    let rally = null;
    if (r && r.end > now) {
      const parts = rallyParts(this, r).map(([c, a]) => ({ login: login(this, c.owner), n: armyN(a.units), gen: !!a.general, mine: c.owner === user.id }));
      rally = { end: r.end, by: login(this, r.by), parts, total: parts.reduce((q, p) => q + p.n, 0), players: new Set(parts.map((p) => p.login)).size };
    }
    const rules = { min: Math.round(RALLY_SEC / SPEED() / 60), hit: HIT_MAX, cap: HIT_CAP, ...REWARD, killX: KILL_X };
    return { last: s.last, rules, ally: al ? { tag: al.tag, can: this.allyCan(al, user.id, 'rally') } : null, rally,
      boss: b ? { kind: b.kind, name: b.name, desc: (BOSSES.find((x) => x.kind === b.kind) || {}).desc, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, end: b.end, top: top(b.dmg), mine: b.dmg[user.id] || 0, players: Object.keys(b.dmg).length,
        allies: Object.entries(b.ally || {}).map(([id, d]) => ({ tag: ((this.db.alliances || {})[id] || {}).tag || '?', d })).sort((p, q) => q.d - p.d).slice(0, 5) } : null };
  };
}

module.exports = { install, BOSSES, SLAYER, REWARD, KILL_X, RALLY_SEC, HIT_MAX, HIT_CAP, rewardFor, nextSaturday };
