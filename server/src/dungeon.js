'use strict';
// Подземелье (кнопка в здании «Экспедиция»): общая для всех карта с лагерями археологов пяти сложностей.
// В лагерь идёт отряд из археологов (копают) и Стражей глубин (охрана) — только они, обычные войска в Подземелье не ходят.
// Отряд бьёт охрану лагеря и копает; находка не наверняка, часть археологов гибнет. Нашли — отряд ждёт в лагере, пока хозяин
// не нажмёт «Забрать»: находка сразу в замке (артефакт — в Башне артефактов / Сокровищнице), отряд идёт домой. До этого любой
// игрок может напасть Стражами и отнять находку (в Подземелье нет ни купола, ни защиты новичка, ни союзов; только игроков с
// одного телефона нападать друг на друга не пускает — защита от мультов). У каждой сложности свои находки (DUNG[l].finds).
// Отряды — обычные походы замка (c.armies, mission 'dig' / 'dsteal', a.dung — номер лагеря): войска учитываются везде,
// где считаются армии в походе. Состояния: go → (бой с охраной) dig → found → back; налёт: go → бой → back.

const Wd = require('./words');

const SPEED = Number(process.env.SPEED || 1);
const RES4 = ['wood', 'stone', 'iron', 'food'];
const DUNG_W = 66, DUNG_H = 66; // карта Подземелья, клеток (250 лагерей)
const DUNG_MAX = 3; // раскопок одновременно у игрока
const DUNG_GAP = 3; // лагеря не ближе 3 клеток друг к другу
const DUNG_BACK_SEC = 2 * 3600; // раскопанный лагерь появляется снова (в другом месте) через 2 часа
const ARCH_ID = 230, GUARD_ID = 231; // Археолог, Страж глубин
const RAID_K = 1.5; // в налёт — Стражей не больше полутора лимитов лагеря: отнять у полной охраны можно, но дорого
const COIN_DAY = 24 * 3600 * 1000; // «Монета Древних Королей» — не чаще раза в сутки на игрока (иначе вместо неё репутация)
// сложности: count — лагерей на карте; hours — раскопки; limit — археологов (и Стражей) в отряде не больше; шанс находки —
// k × √(археологи / limit) + 0,5% за ур. Лагеря археологов (до +10%), не больше cap (с 24.10 — ниже и по уровням: внизу находки
// сильнее и реже; полный отряд при Лагере 20 ур. — 55/50/40/35/25%; один археолог «для галочки» — почти ноль); die — доля гибнущих археологов (от die до die + 10%,
// каждый погибает со своим шансом — без округления, гибнет и единственный); игроку доля не показывается, только итог в отчёте;
// lvl — нужный уровень Экспедиции; def — охрана лагеря (сила против пехоты; Страж бьёт на 25);
// finds — что можно найти: [вид, вес] — art:<тип> артефакт, exp — опыт генерала, res — клад ресурсов, rep — репутация, coin — монета
const DUNG = [
  null,
  { name: 'Заброшенная стоянка', count: 50, hours: 2, limit: 100, die: 0.05, lvl: 1, def: 300, k: 0.45, cap: 0.55, finds: [['art:cloak', 1], ['art:eye', 1]] },
  { name: 'Старый раскоп', count: 50, hours: 3, limit: 300, die: 0.1, lvl: 2, def: 1200, k: 0.4, cap: 0.5, finds: [['art:claw', 2], ['exp', 3]] },
  { name: 'Засыпанный храм', count: 50, hours: 4, limit: 400, die: 0.15, lvl: 4, def: 3000, k: 0.3, cap: 0.4, finds: [['art:seal', 1], ['art:heart', 1]] },
  { name: 'Рунные врата', count: 50, hours: 5.5, limit: 450, die: 0.2, lvl: 6, def: 5500, k: 0.25, cap: 0.35, finds: [['art:hand', 1], ['res', 2]] },
  { name: 'Сокрытое святилище', count: 50, hours: 7, limit: 500, die: 0.25, lvl: 8, def: 8000, k: 0.15, cap: 0.25, finds: [['coin', 1], ['rep', 3]] },
];
const CAMP_PER = 0.005, CAMP_MAX = 0.1; // прибавка шанса за уровень Лагеря археологов и её предел; находка — никогда не наверняка
// охрана лагеря — для боя (army.js clash: npc.dung — крепнет вместе с бонусами нападающего, как охрана лагерей разбойников)
const GUARD_HPK = [0, 0.49, 0.21, 0.2, 0.2, 0.2]; // здоровье охраны в бою как в оригинале (с 24.10): Стражей для победы нужно столько же, сколько прежде
const GUARDS = DUNG.map((d, l) => (d ? { name: `Охрана: ${d.name}`, level: String(l), hpK: GUARD_HPK[l], def: { inf: d.def, cav: d.def, mag: Math.round(d.def / 2) }, loot: { wood: 0, stone: 0, iron: 0, food: 0 }, dung: true } : null));
const travelSec = (l) => Math.max(30, Math.round((10 + 5 * l) * 60 / SPEED)); // путь до лагеря: 15–35 минут (не зависит от расстояния)
const digSec = (l) => Math.max(60, Math.round(DUNG[l].hours * 3600 / SPEED));
const LIVE = ['go', 'dig', 'found'];

function install(Game) {
  const P = Game.prototype;
  const A = () => require('./army');

  // карта: при первом обращении — лагеря по всей карте, не ближе DUNG_GAP клеток друг к другу.
  // Карта прежней версии (150 лагерей 50×50) — перестраивается, отряды в ней доживают своё (dungOcc отпустит их лагеря)
  P.dung = function dung() {
    const d0 = this.db.dungeon;
    if (d0 && Array.isArray(d0.camps) && d0.v === 2) return d0;
    const d = (this.db.dungeon = { v: 2, camps: [] });
    let id = Math.max(0, ...((d0 && d0.camps) || []).map((q) => q.id)) + 1;
    if (d0) { // отряды на старой карте — домой; найденный там артефакт засчитается, когда отряд дойдёт до замка (dungHome)
      const now = Date.now();
      for (const c of Object.values(this.db.castles)) for (const a of c.armies || []) if (a.dung && (a.state === 'dig' || a.state === 'found')) {
        this.report(c.owner, 'Подземелье обновилось', ['Карта Подземелья обновилась — ваш отряд возвращается домой.', ...(a.art ? ['Найденный артефакт он несёт с собой.'] : [])], 'expedition');
        this.goBack(c, a, now);
      }
    }
    for (let l = 1; l < DUNG.length; l++) for (let k = 0; k < DUNG[l].count; k++) {
      const c = { id: id++, l, x: 0, y: 0, occ: null, gone: 0 };
      if (this.dungPlace(c)) d.camps.push(c);
    }
    return d;
  };
  // новое место лагеря: случайная клетка, свободная от других лагерей
  P.dungPlace = function dungPlace(camp) {
    const others = (this.db.dungeon ? this.db.dungeon.camps : []).filter((q) => q !== camp && !q.gone);
    const ok = (x, y) => others.every((q) => Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) >= DUNG_GAP);
    for (let i = 0; i < 200; i++) {
      const x = 1 + Math.floor(Math.random() * (DUNG_W - 2)), y = 1 + Math.floor(Math.random() * (DUNG_H - 2));
      if (ok(x, y)) { camp.x = x; camp.y = y; return true; }
    }
    // карта почти заполнена — перебрать все клетки с случайного места
    const N = (DUNG_W - 2) * (DUNG_H - 2), s0 = Math.floor(Math.random() * N);
    for (let k = 0; k < N; k++) { const i = (s0 + k) % N, x = 1 + (i % (DUNG_W - 2)), y = 1 + Math.floor(i / (DUNG_W - 2)); if (ok(x, y)) { camp.x = x; camp.y = y; return true; } }
    return false;
  };
  // отряд, который стоит (или идёт) в лагере; ушёл, погиб, замок захвачен или удалён — лагерь свободен
  P.dungOcc = function dungOcc(camp) {
    const o = camp.occ; if (!o) return null;
    const c = this.db.castles[o.cid], a = c && c.owner === o.uid && (c.armies || []).find((x) => x.id === o.aid);
    if (a && a.dung === camp.id && a.mission === 'dig' && LIVE.includes(a.state)) return { c, a };
    camp.occ = null; return null;
  };
  P.dungCamp = function dungCamp(id) { return this.dung().camps.find((q) => q.id === Number(id) && !q.gone) || null; };
  // лагерь раскопан (находку забрали, отняли или не нашли) — исчезает и через DUNG_BACK_SEC появляется в другом месте
  P.dungGone = function dungGone(camp, now) { camp.occ = null; camp.gone = now + Math.round(DUNG_BACK_SEC / SPEED * 1000); };
  P.dungActive = function dungActive(u) {
    let n = 0; for (const c of this.castlesOf(u)) for (const a of c.armies || []) if (a.mission === 'dig' && LIVE.includes(a.state)) n++;
    return n;
  };
  P.dungChance = function dungChance(castle, l, arch) {
    const k = DUNG[l]; return Math.min(k.cap, k.k * Math.sqrt(Math.min(1, Math.max(0, arch) / k.limit)) + Math.min(CAMP_MAX, CAMP_PER * this.buildingLevel(castle, A().B.ARCH_CAMP)));
  };
  // игроки с одного телефона (возможные мульты) друг на друга в Подземелье не нападают: иначе свой второй аккаунт копал бы для главного
  P.sameDevice = function sameDevice(u1, u2) {
    if (!u1 || !u2 || u1 === u2) return false;
    const d1 = new Set((u1.devs || []).map((x) => x.dev).filter(Boolean));
    return (u2.devs || []).some((x) => x.dev && d1.has(x.dev));
  };

  // выбранные игроком из Замковой армии археологи и Стражи: { id: n } → проверенные (не больше лимита каждого вида)
  const pickUnits = (castle, pick, ids, cap) => {
    const { UNIT } = A(), out = {};
    if (!pick || typeof pick !== 'object' || Array.isArray(pick)) return { error: 'Выберите отряд.' };
    for (const [id, v] of Object.entries(pick)) {
      const n = Math.floor(Number(v)); if (!(n > 0)) continue;
      if (!ids.includes(Number(id))) return { error: `${Object.prototype.hasOwnProperty.call(UNIT, id) ? UNIT[id].name : 'Этот воин'} в Подземелье не ходит — только археологи и Стражи глубин.` };
      if ((castle.units[id] || 0) < n) return { error: `Не хватает: ${UNIT[id].name}.` };
      if (n > cap) return { error: `${UNIT[id].name}: в этот лагерь — не больше ${cap}.` };
      out[id] = n;
    }
    if (!Object.keys(out).length) return { error: 'Выберите отряд.' };
    return { units: out };
  };
  const take = (castle, units) => { for (const [id, n] of Object.entries(units)) { castle.units[id] -= n; if (!castle.units[id]) delete castle.units[id]; } };
  const march = (g, castle, units, mission, camp) => {
    const now = Date.now(), sec = travelSec(camp.l);
    const a = { id: g.db.nextId++, units, general: false, mission, x: castle.x, y: castle.y, dung: camp.id, dl: camp.l, depart: now, arrive: now + sec * 1000, sec, state: 'go', loot: null, cargo: null, squad: null, portal: false };
    castle.armies.push(a);
    return a;
  };

  // отправить отряд на раскопки в свободный лагерь
  P.dungGo = function dungGo(castle, campId, pick) {
    this.tick(castle); this.mil(castle);
    const { B } = A(), u = this.ownerOf(castle);
    const L = this.buildingLevel(castle, B.EXPEDITION); if (!L) return { error: 'Нужна Экспедиция.' };
    const camp = this.dungCamp(campId); if (!camp) return { error: 'Этого лагеря уже нет.' };
    if (L < DUNG[camp.l].lvl) return { error: `«${DUNG[camp.l].name}» — с Экспедиции ${DUNG[camp.l].lvl} ур.` };
    if (this.dungOcc(camp)) return { error: 'Лагерь занят — здесь уже копают.' };
    if (this.dungActive(u) >= DUNG_MAX) return { error: `Одновременно раскопок — не больше ${DUNG_MAX}.` };
    const p = pickUnits(castle, pick, [ARCH_ID, GUARD_ID], DUNG[camp.l].limit); if (p.error) return p;
    if (!(p.units[ARCH_ID] > 0)) return { error: 'Нужен хотя бы один археолог — копают они.' };
    take(castle, p.units);
    const a = march(this, castle, p.units, 'dig', camp);
    camp.occ = { cid: castle.id, aid: a.id, uid: castle.owner };
    this.addStat(castle.owner, 'expeds', 1);
    this.store.save();
    return { ok: true, msg: `Отряд вышел к лагерю «${DUNG[camp.l].name}», будет на месте через ${Math.round(a.sec / 60) || 1} мин.` };
  };
  // налёт Стражами на чужой отряд в лагере: отнять находку (или сорвать раскопки)
  P.dungAttack = function dungAttack(castle, campId, pick) {
    this.tick(castle); this.mil(castle);
    const { B } = A();
    if (!this.buildingLevel(castle, B.EXPEDITION)) return { error: 'Нужна Экспедиция.' };
    const camp = this.dungCamp(campId); if (!camp) return { error: 'Этого лагеря уже нет.' };
    const o = this.dungOcc(camp); if (!o) return { error: 'В лагере никого нет — нападать не на кого.' };
    if (o.c.owner === castle.owner) return { error: 'Это ваш отряд.' };
    if (o.a.state === 'go') return { error: 'Отряд ещё в пути к лагерю — нападать пока не на кого.' };
    if (this.sameDevice(this.ownerOf(castle), this.ownerOf(o.c))) return { error: 'Нападать на игрока, который играет с вашего телефона, нельзя.' };
    const p = pickUnits(castle, pick, [GUARD_ID], Math.round(DUNG[camp.l].limit * RAID_K)); if (p.error) return p;
    take(castle, p.units);
    const a = march(this, castle, p.units, 'dsteal', camp);
    this.store.save();
    return { ok: true, msg: `Стражи вышли к лагерю «${DUNG[camp.l].name}», нападут через ${Math.round(a.sec / 60) || 1} мин.` };
  };
  // бросить раскопки (пока не нашли) — отряд домой, лагерь свободен
  P.dungRecall = function dungRecall(castle, aid) {
    const a = (castle.armies || []).find((x) => x.id === Number(aid) && x.mission === 'dig' && x.state === 'dig');
    if (!a) return { error: 'Отряд не найден.' };
    const camp = this.dung().camps.find((q) => q.id === a.dung);
    if (camp && camp.occ && camp.occ.aid === a.id) camp.occ = null;
    this.goBack(castle, a, Date.now());
    this.store.save();
    return { ok: true, msg: 'Раскопки брошены — отряд возвращается домой.' };
  };
  // «Забрать»: находка — сразу в замок отряда (артефакт — в Сокровищницу, к Башне артефактов), отряд идёт домой, лагерь исчезает
  P.dungClaim = function dungClaim(castle, aid) {
    const a = (castle.armies || []).find((x) => x.id === Number(aid) && x.mission === 'dig' && x.state === 'found');
    if (!a) return { error: 'Находки нет — отряд не найден.' };
    this.tick(castle); this.mil(castle);
    const f = findOf(a);
    if (f && f.k === 'art' && castle.artifacts.length >= this.bonus(castle).artStore) return { error: `Сокровищница замка «${castle.name}» полна. Пробудите или разбейте артефакт — тогда заберите находку.` };
    const lines = this.dungGive(castle, f, a.dl); delete a.find; delete a.art;
    const now = Date.now(), camp = this.dung().camps.find((q) => q.id === a.dung);
    if (camp && camp.occ && camp.occ.aid === a.id) this.dungGone(camp, now);
    this.goBack(castle, a, now);
    this.report(castle.owner, `Подземелье: находка в замке — ${findName(f)}`, [...lines, 'Отряд возвращается домой.'], 'expedition');
    this.store.save();
    return { ok: true, msg: `${findName(f)} — в замке «${castle.name}».` };
  };
  // выдать находку в замок c; force — Сокровищница полна: артефакт разбит на осколки (так приходит отнятое в налёте)
  P.dungGive = function dungGive(c, f, l = 1) {
    const { ART_TYPES, ART_BREAK } = A(), u = this.ownerOf(c);
    if (!f) return ['Находки нет.'];
    this.addStat(c.owner, 'arts', l);
    if (f.k === 'art') {
      if (f.rarity !== undefined && !ART_TYPES[f.type].special) return [this.artFound(c, f.type, f.rarity, Date.now())]; // находка прежней версии
      if (c.artifacts.length < this.bonus(c).artStore) { c.artifacts.push({ id: this.db.nextId++, type: f.type, active: false, found: Date.now() }); return [`«${ART_TYPES[f.type].name}» — в Сокровищнице. Пробудите его в Башне артефактов: ${ART_TYPES[f.type].desc}.`]; }
      const g = ART_BREAK[0]; if (u) this.stashAdd(u, Object.fromEntries(RES4.map((r) => [r, g])));
      return [`«${ART_TYPES[f.type].name}»: Сокровищница полна — артефакт разбит на осколки, по ${g} каждого ресурса в Кладовую.`];
    }
    if (f.k === 'exp') { if (u) this.stashAdd(u, { exp: f.n }); return [`Хроники Ветерана: +${f.n} опыта генерала — в Кладовой, передайте генералу.`]; }
    if (f.k === 'res') { if (u) this.stashAdd(u, f.res); return [`Клад: ${RES4.map((r) => f.res[r]).join(' / ')} (дерево, камень, железо, еда) — в Кладовой.`]; }
    if (f.k === 'rep') { if (u) u.reputation = (u.reputation ?? 10) + f.n; return [`Лавры древних: репутация +${f.n}.`]; }
    return ['Находка рассыпалась в пыль.'];
  };

  // отряд дошёл до лагеря (army.js arrive)
  P.dungArrive = function dungArrive(c, a, t) {
    const camp = this.dung().camps.find((q) => q.id === a.dung && !q.gone);
    const name = camp ? DUNG[camp.l].name : 'лагерь';
    if (a.mission === 'dig') {
      if (!camp || !camp.occ || camp.occ.aid !== a.id) { this.report(c.owner, 'Раскопки: лагеря нет', [`Лагеря «${name}» на месте уже нет — отряд возвращается домой.`], 'expedition'); return this.goBack(c, a, t); }
      // с охраной бьются Стражи; археологи стоят позади: гибнут, только если отряд разбит
      const was = { ...a.units }, arch = a.units[ARCH_ID] || 0; delete a.units[ARCH_ID];
      const R = Object.keys(a.units).length ? this.clash(c, a, null, GUARDS[camp.l], t) : { win: false, aLost: {}, calc: { wounded: 0 } };
      if (R.win) a.units[ARCH_ID] = arch; else if (arch) R.aLost = { ...R.aLost, [ARCH_ID]: arch };
      const lines = [`Отряд дошёл до лагеря «${name}» (${camp.l} ур.) и вступил в бой с охраной.`, `Отряд: ${unitsLine(was, R.aLost)}.`];
      if (R.calc.wounded) lines.push(`Ранены и ушли в Лазарет: ${Wd.warriors(R.calc.wounded)}.`);
      if (!R.win || !(a.units[ARCH_ID] > 0)) {
        lines.push(R.win ? 'Охрана разбита, но археологов не осталось — копать некому. Отряд возвращается домой.' : 'Охрана сильнее — отряд разбит. Берите больше Стражей глубин. Лагерь остался свободным.');
        camp.occ = null; this.report(c.owner, `Раскопки: ${R.win ? 'копать некому' : 'отряд разбит'}`, lines, 'battle');
        return this.goBack(c, a, t);
      }
      a.state = 'dig'; a.digAt = t; a.digEnd = t + digSec(camp.l) * 1000;
      lines.push(`Охрана разбита. Археологи начали раскопки — ${Wd.num(Math.round(digSec(camp.l) / 60), 'минута', 'минуты', 'минут')}.`);
      this.report(c.owner, `Раскопки начались: ${name}`, lines, 'expedition');
      return;
    }
    // налёт
    const o = camp && this.dungOcc(camp);
    if (!o || o.c.owner === c.owner || o.a.state === 'go' || this.sameDevice(this.ownerOf(c), this.ownerOf(o.c))) {
      this.report(c.owner, 'Налёт в Подземелье: никого нет', [`В лагере «${name}» уже никого нет — Стражи возвращаются домой.`], 'battle');
      return this.goBack(c, a, t);
    }
    this.dungBattle(c, a, o.c, o.a, camp, t);
  };
  // бой в лагере: нападающий (c, a) против отряда (dc, d). Отряд защищается без Забора и без помощи замка; свои бонусы (науки,
  // ранг, артефакты) — у обоих
  P.dungBattle = function dungBattle(c, a, dc, d, camp, t) {
    const bD = this.bonus(dc);
    const D = { id: -1, owner: dc.owner, name: 'Лагерь', site: true, dung: true, units: d.units, squads: [], general: null, armies: [], forge: dc.forge || {},
      grid: [new Int8Array(49).fill(-1), new Int8Array(225).fill(-1)], levels: [new Int8Array(49), new Int8Array(225)],
      sim: { bonus: { def: bD.def, magic: bD.magic, wall: 0, wallPer: 0 }, genDef: 0, hero: null } };
    const aWas = { ...a.units }, dWas = { ...d.units };
    const R = this.clash(c, a, D, null, t);
    const dWnd = this.toInfirmary(dc, R.dLost); // павшие защитники — ранеными в Лазарет своего замка
    for (const id of Object.keys(d.units)) if (!(d.units[id] > 0)) delete d.units[id];
    const att = this.ownerOf(c), def = this.ownerOf(dc), name = DUNG[camp.l].name, f = findOf(d);
    const sides = [`Нападение: ${att.login} — ${unitsLine(aWas, R.aLost)}.`, `Отряд в лагере: ${def.login} — ${unitsLine(dWas, R.dLost)}.`,
      `Сила нападающих ${R.calc.att.str.toLocaleString('ru-RU')} против защитников ${R.calc.def.str.toLocaleString('ru-RU')}.`];
    const aL = [`Ваши Стражи напали на лагерь «${name}» (${camp.l} ур.).`, ...sides], dL = [`На ваш отряд в лагере «${name}» (${camp.l} ур.) напал ${att.login}.`, ...sides];
    if (R.calc.wounded) aL.push(`Ранены и ушли в Лазарет: ${Wd.warriors(R.calc.wounded)}.`);
    if (dWnd) dL.push(`Ранены и ушли в Лазарет: ${Wd.warriors(dWnd)}.`);
    const alive = Object.values(d.units).some((n) => n > 0);
    if (R.win) {
      if (f) { a.find = f; delete d.find; delete d.art; aL.push(`Победа! Стражи отняли находку (${findName(f)}) и несут её домой — она будет вашей, когда отряд дойдёт до замка.`); dL.push(`Отряд разбит, находку (${findName(f)}) отняли.`); this.dungGone(camp, t); }
      else { aL.push('Победа! Копавший отряд разбит, лагерь свободен.'); dL.push('Отряд разбит, раскопки сорваны. Лагерь свободен.'); camp.occ = null; }
      if (alive) this.goBack(dc, d, t); else dc.armies = dc.armies.filter((x) => x !== d);
    } else {
      aL.push('Поражение — отряд в лагере устоял.'); dL.push(f ? 'Ваш отряд отбился и стережёт находку. Заберите её, пока не напали снова.' : 'Ваш отряд отбился и продолжает раскопки.');
      if (d.state === 'dig' && !(d.units[ARCH_ID] > 0)) { dL.push('Но археологов не осталось — раскопки брошены, отряд возвращается домой.'); camp.occ = null; this.goBack(dc, d, t); }
      else if (!alive) { if (f) this.dungGone(camp, t); else camp.occ = null; dc.armies = dc.armies.filter((x) => x !== d); }
    }
    this.report(c.owner, R.win ? `Налёт в Подземелье: победа${f ? ', находка ваша' : ''}` : 'Налёт в Подземелье: поражение', aL, 'battle');
    this.report(dc.owner, R.win ? `Подземелье: на отряд напали${f ? ', находку отняли' : ''}` : 'Подземелье: отряд отбился', dL, 'battle');
    this.goBack(c, a, t);
  };
  // раскопки закончились: гибнет часть археологов; нашли — отряд ждёт «Забрать», нет — домой
  P.dungDug = function dungDug(c, a, camp, t) {
    const D = DUNG[camp.l], arch = a.units[ARCH_ID] || 0;
    const chance = this.dungChance(c, camp.l, arch); // шанс — по тем, кто начал копать
    // обвалы и ловушки: гибнет часть археологов (насовсем, не в Лазарет)
    const rate = D.die + Math.random() * 0.1; let dead = 0;
    for (let i = 0; i < arch; i++) if (Math.random() < rate) dead++;
    const lost = dead ? `При раскопках ${Wd.plural(dead, 'погиб', 'погибли', 'погибло')} ${Wd.num(dead, 'археолог', 'археолога', 'археологов')} из ${arch} (${pick(['обвал в галерее', 'древняя ловушка', 'ядовитый газ из гробницы', 'проснувшаяся стража склепа'])}).` : 'Все археологи живы.';
    if (dead) { a.units[ARCH_ID] -= dead; if (!a.units[ARCH_ID]) delete a.units[ARCH_ID]; }
    if (Math.random() < chance) {
      a.find = this.dungRoll(this.ownerOf(c), camp.l, t); a.state = 'found';
      this.report(c.owner, `Подземелье: ваши археологи нашли ${findName(a.find)}!`, [`Лагерь «${D.name}» (${camp.l} ур.): находка — ${findName(a.find)}.`, lost,
        'Отряд ждёт в лагере. Откройте Подземелье, нажмите на лагерь и «Забрать» — находка сразу окажется в замке.', 'Пока отряд в лагере, на него могут напасть и отнять находку.'], 'expedition');
      return;
    }
    this.dungGone(camp, t); this.goBack(c, a, t);
    this.report(c.owner, 'Подземелье: ничего не нашли', [`Лагерь «${D.name}» (${camp.l} ур.): находок нет.`, lost, 'Отряд возвращается домой.'], 'expedition');
  };
  // что нашли в лагере уровня l: по весам DUNG[l].finds; монета — не чаще раза в сутки на игрока, иначе репутация
  P.dungRoll = function dungRoll(u, l, t) {
    const F = DUNG[l].finds, sum = F.reduce((q, [, w]) => q + w, 0);
    let r = Math.random() * sum, k = F[F.length - 1][0];
    for (const [key, w] of F) { if (r < w) { k = key; break; } r -= w; }
    if (k === 'coin' && u && t - (u.dungCoinAt || 0) < COIN_DAY) k = 'rep';
    if (k === 'coin') { if (u) u.dungCoinAt = t; return { k: 'art', type: 'coin' }; }
    if (k.startsWith('art:')) return { k: 'art', type: k.slice(4) };
    if (k === 'exp') return { k: 'exp', n: 100 + Math.floor(Math.random() * 201) };
    if (k === 'res') return { k: 'res', res: Object.fromEntries(RES4.map((x) => [x, 1000 + Math.floor(Math.random() * 2001)])) };
    return { k: 'rep', n: 1 + Math.floor(Math.random() * 3) };
  };
  // отряд с отнятой находкой дошёл до замка (army.js returnHome)
  P.dungHome = function dungHome(c, a) {
    const f = findOf(a); delete a.find; delete a.art; if (!f) return;
    this.tick(c); this.mil(c);
    this.report(c.owner, `Подземелье: добыча налёта в замке — ${findName(f)}`, this.dungGive(c, f, a.dl || 1), 'expedition');
  };
  // раз в секунду (army.js tickWorld): раскопки закончились, лагеря вернулись на карту
  P.dungTick = function dungTick(now = Date.now()) {
    if (!this.db.dungeon) return;
    for (const camp of this.db.dungeon.camps) {
      if (camp.gone) { if (camp.gone <= now) { camp.gone = 0; if (!this.dungPlace(camp)) camp.gone = now + 600000; } continue; }
      const o = this.dungOcc(camp);
      if (o && o.a.state === 'dig' && o.a.digEnd <= now) { this.dungDug(o.c, o.a, camp, o.a.digEnd); this.store.save(); }
    }
  };

  // для клиента: карта (лагеря и кто в них) и свои отряды
  P.dungView = function dungView(castle, user) {
    const { B } = A(), d = this.dung(), now = Date.now();
    const rough = (n) => (n < 10 ? n : Math.round(n / 10 ** (String(n).length - 2)) * 10 ** (String(n).length - 2));
    const camps = d.camps.filter((q) => !q.gone).map((q) => {
      const o = this.dungOcc(q), r = { id: q.id, x: q.x, y: q.y, l: q.l };
      if (o) {
        const me = o.c.owner === user.id, n = Object.values(o.a.units).reduce((s, k) => s + k, 0);
        r.o = { login: (this.ownerOf(o.c) || {}).login || '?', me, s: o.a.state, e: o.a.state === 'go' ? o.a.arrive : o.a.state === 'dig' ? o.a.digEnd : 0, n: me ? n : rough(n) };
        if (me) Object.assign(r.o, { aid: o.a.id, units: o.a.units, find: o.a.state === 'found' ? findView(findOf(o.a)) : null });
      }
      return r;
    });
    const mine = [];
    for (const c of this.castlesOf(user)) for (const a of c.armies || []) if (a.dung) mine.push({ id: a.id, cid: c.id, castle: c.name, mission: a.mission, state: a.state, camp: a.dung, l: a.dl,
      arrive: a.arrive, back: a.back, digEnd: a.digEnd || 0, find: findView(findOf(a)), units: a.units });
    const L = this.buildingLevel(castle, B.EXPEDITION), ac = this.buildingLevel(castle, B.ARCH_CAMP);
    return { w: DUNG_W, h: DUNG_H, now, camps, mine, max: DUNG_MAX, active: this.dungActive(user), exp: L, archCamp: ac, raidK: RAID_K, have: { arch: castle.units[ARCH_ID] || 0, guard: castle.units[GUARD_ID] || 0 },
      kinds: DUNG.map((k, l) => (k ? { l, name: k.name, lvl: k.lvl, dig: digSec(l), go: travelSec(l), limit: k.limit, guard: Math.ceil(k.def / A().UNIT[GUARD_ID].attack) } : null)) }; // что можно найти, шанс и потери — не отдаются: секрет
  };
  P.dungName = function dungName(l) { return DUNG[l] ? DUNG[l].name : 'Подземелье'; };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // находка отряда (a.art — у отрядов прежней версии: обычный артефакт с редкостью)
  const findOf = (a) => a.find || (a.art ? { k: 'art', type: a.art.type, rarity: a.art.rarity } : null);
  const findName = (f) => { if (!f) return 'ничего'; const { ART_TYPES, RARITY } = A();
    if (f.k === 'art') return `«${ART_TYPES[f.type].name}»${f.rarity !== undefined && RARITY[f.rarity] && !ART_TYPES[f.type].special ? ` (${RARITY[f.rarity].name})` : ''}`;
    return f.k === 'exp' ? `«Хроники Ветерана» (+${f.n} опыта генерала)` : f.k === 'res' ? '«Клад»' : f.k === 'rep' ? `«Лавры древних» (репутация +${f.n})` : 'находка'; };
  const findView = (f) => (f ? { k: f.k, type: f.type || null, n: f.n || 0, res: f.res || null, name: findName(f) } : null);
  const unitsLine = (units, lost) => { const { UNIT } = A(); return Object.entries(units).filter(([id, n]) => UNIT[id] && n > 0).map(([id, n]) => `${UNIT[id].name} ${n}${lost && lost[id] ? ` (−${lost[id]})` : ''}`).join(', ') || '—'; };
}

module.exports = { install, DUNG, DUNG_MAX, DUNG_W, DUNG_H, GUARDS, ARCH_ID, GUARD_ID };
