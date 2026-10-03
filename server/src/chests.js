'use strict';
// «Сундучки» (меню «Игры»): на столе 3 закрытых сундука — игрок открывает один, после чего показываются и два других.
// Бесплатно 3 попытки в сутки (с премиумом 5), обновление в полночь по Москве. Призы — в Кладовую (ресурсы, опыт генерала,
// уникальные воины расы), очень редко — артефакт в Сокровищницу. Золото не выпадает (золото — только донат).
// Серия дней: играл 7 дней подряд — открывается Золотой сундук с гарантированным редким призом; пропуск — серия сгорает.
// Каждая игра — очко в Зал Славы «Азарт». Крупные выигрыши объявляются в общем чате.

const MSK = 3 * 3600000;
const dayKey = (t) => new Date(t + MSK).toISOString().slice(0, 10);
const TRIES = 3, TRIES_PREM = 5, STREAK = 7;
const RES4 = ['wood', 'stone', 'iron', 'food'];
const RES_NAME = { wood: 'Дерево', stone: 'Камень', iron: 'Железо', food: 'Еда' };
const SLOT_NAME = { inf: 'пехота', cav: 'кавалерия', mag: 'маги' };

function install(Game) {
  const P = Game.prototype;
  const A = () => require('./army');
  const st = (u, now = Date.now()) => {
    const d = dayKey(now);
    if (!u.chests) u.chests = { day: d, used: 0, streak: 0, last: null, gold: false };
    const s = u.chests;
    if (s.day !== d) { s.day = d; s.used = 0; }
    if (s.last && s.last !== d && s.last !== dayKey(now - 86400000)) { s.streak = 0; s.gold = false; } // пропустил день — серия сгорает
    return s;
  };
  // сила призов — по уровню Ратуши столицы (1…20+)
  const power = (g, u) => { const c = g.castlesOf(u)[0]; return Math.max(1, c ? g.buildingLevel(c, A().B.TOWNHALL) : 1); };
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  // один приз: { kind, text, rw (для stashAdd), art (редкость артефакта), rare }
  const prize = (g, u, L, golden = false) => {
    const roll = Math.random() * 100;
    const base = 200 + L * 90;
    if (golden) { // золотой сундук: гарантированно редкое
      if (roll < 40) { return { kind: 'art', art: 1, text: 'Артефакт (редкий)', rare: true }; }
      if (roll < 75) { const slot = ['inf', 'cav', 'mag'][rnd(0, 2)], n = 3 + Math.floor(L / 3); return { kind: 'unit', rw: { u: { [slot]: n } }, text: `${unitName(u, slot)} ×${n}`, rare: true }; }
      const n = base * 2; return { kind: 'res', rw: Object.fromEntries(RES4.map((r) => [r, n])), text: `Все ресурсы по ${n.toLocaleString('ru-RU')}`, rare: true };
    }
    if (roll < 2) return { kind: 'art', art: 0, text: 'Артефакт!', rare: true };
    if (roll < 10) { const slot = ['inf', 'cav', 'mag'][rnd(0, 2)], n = 1 + Math.floor(L / 5); return { kind: 'unit', rw: { u: { [slot]: n } }, text: `${unitName(u, slot)} ×${n}`, rare: true }; }
    if (roll < 25) { const n = 20 + L * 6; return { kind: 'exp', rw: { exp: n }, text: `Опыт генерала +${n}` }; }
    if (roll < 40) { const n = Math.round(base * 0.5); return { kind: 'res', rw: Object.fromEntries(RES4.map((r) => [r, n])), text: `Все ресурсы по ${n.toLocaleString('ru-RU')}` }; }
    const r = RES4[rnd(0, 3)], n = Math.round(base * (0.6 + Math.random() * 1.4));
    return { kind: 'res', res: r, rw: { [r]: n }, text: `${RES_NAME[r]} +${n.toLocaleString('ru-RU')}` };
  };
  const unitName = (u, slot) => { const x = A().uniqueFor(u.race, slot); return x ? x.name : `Уникальные воины (${SLOT_NAME[slot]})`; };
  const give = (g, u, p) => {
    if (p.rw) g.stashAdd(u, p.rw);
    if (p.art !== undefined) { const c = g.castlesOf(u)[0]; g.mil(c); const types = Object.keys(A().ART_TYPES); c.artifacts.push({ id: g.db.nextId++, type: types[rnd(0, types.length - 1)], rarity: p.art, active: false, found: Date.now() }); }
  };
  const announce = (g, u, text) => {
    g.db.chat = g.db.chat || [];
    g.db.chat.push({ id: g.db.nextId++, from: '🎁 Сундучки', fromId: 0, text: `${u.login} открыл(а) сундучок и нашёл(ла): ${text}!`, at: Date.now(), rep: 0, role: 'sys', color: '' });
    if (g.db.chat.length > 30) g.db.chat.splice(0, g.db.chat.length - 30);
    return g.db.chat[g.db.chat.length - 1];
  };
  P.chestsState = function chestsState(u, now = Date.now()) {
    const s = st(u, now), max = this.isPremium(u) ? TRIES_PREM : TRIES;
    const today = s.last === s.day; // уже играл сегодня — серия засчитана
    return { left: Math.max(0, max - s.used), max, streak: s.streak, need: STREAK, today, gold: !!s.gold, nextAt: Date.parse(`${s.day}T00:00:00Z`) - MSK + 86400000 };
  };
  // открыть сундук pick (0..2); golden — Золотой сундук за серию
  P.chestOpen = function chestOpen(u, pick, golden = false, now = Date.now()) {
    const s = st(u, now), max = this.isPremium(u) ? TRIES_PREM : TRIES, L = power(this, u);
    let chat = null;
    if (golden) {
      if (!s.gold) return { error: `Золотой сундук открывается за ${STREAK} дней игры подряд.` };
      const p = prize(this, u, L, true); give(this, u, p); s.gold = false; s.streak = 0;
      this.addStat(u.id, 'gamble', 1); chat = announce(this, u, `${p.text} в Золотом сундуке`);
      this.store.save();
      return { ok: true, golden: true, prize: p.text, kind: p.kind, chat, state: this.chestsState(u, now) };
    }
    pick = Math.floor(Number(pick));
    if (!(pick >= 0 && pick <= 2)) return { error: 'Выберите сундук.' };
    if (s.used >= max) return { error: `Попытки на сегодня закончились — новые в полночь${this.isPremium(u) ? '' : ' (с премиумом — 5 в день)'}.` };
    if (s.last !== s.day) { s.streak = s.last === dayKey(now - 86400000) ? s.streak + 1 : 1; s.last = s.day; if (s.streak >= STREAK) s.gold = true; }
    s.used++;
    const all = [0, 1, 2].map(() => prize(this, u, L));
    const p = all[pick]; give(this, u, p);
    this.addStat(u.id, 'gamble', 1);
    if (p.rare) chat = announce(this, u, p.text);
    this.store.save();
    return { ok: true, pick, prizes: all.map((x) => ({ text: x.text, kind: x.kind, res: x.res, rare: !!x.rare })), prize: p.text, chat, state: this.chestsState(u, now) };
  };
}

module.exports = { install, TRIES, TRIES_PREM, STREAK };
