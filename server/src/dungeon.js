'use strict';
// Подземелье (кнопка в здании «Экспедиция»): общая для всех карта с лагерями археологов пяти сложностей.
// Игрок отправляет в свободный лагерь отряд — археологов (хотя бы одного) и охрану. Отряд идёт до лагеря, бьёт охрану лагеря
// (как лагерь разбойников: крепнет вместе с прокачкой нападающего) и копает. Нашёл артефакт — не идёт домой, а ждёт в лагере,
// пока хозяин его не отзовёт: артефакт засчитывается, только когда отряд дошёл до замка. Пока отряд в лагере, на него может
// напасть любой игрок (в Подземелье нет ни купола, ни защиты новичка, ни союзов): победил — забрал артефакт и несёт его домой.
// Одновременно — не больше DUNG_MAX раскопок у игрока. Отряды — обычные походы замка (c.armies, mission 'dig' / 'dsteal',
// a.dung — номер лагеря): войска учитываются везде, где считаются армии в походе (содержание, проверки, удаление игрока).
// Состояния похода: go → (бой с охраной) dig → found → back; налёт: go → бой → back.

const Wd = require('./words');

const SPEED = Number(process.env.SPEED || 1);
const RES4 = ['wood', 'stone', 'iron', 'food'];
const DUNG_W = 50, DUNG_H = 50; // карта Подземелья, клеток
const DUNG_MAX = 3; // раскопок одновременно у игрока
const DUNG_GAP = 3; // лагеря не ближе 3 клеток друг к другу
const DUNG_BACK_SEC = 2 * 3600; // раскопанный лагерь появляется снова (в другом месте) через 2 часа
const DUNG_ARCH = 100; // +1% к находке за каждых 5 археологов, до 100 археологов (+20%)
const ARCH_ID = 230;
// сложности: count — сколько таких лагерей на карте, hours — раскопки, chance — шанс находки (+1% за 5 археологов, +2% за ур.
// Лагеря археологов, не больше DUNG_CAP), bias — сдвиг к редким, lvl — нужный уровень Экспедиции, def — охрана (в масштабе
// лагерей разбойников), die — сколько археологов гибнет в раскопках (обвалы, ловушки): от die до die + 10%, нашли или нет
const DUNG = [
  null,
  { name: 'Заброшенная стоянка', count: 40, hours: 1, chance: 0.25, bias: 0, lvl: 1, die: 0.05, def: { inf: 100, cav: 90, mag: 190 } },
  { name: 'Старый раскоп', count: 35, hours: 2, chance: 0.35, bias: 0.05, lvl: 2, die: 0.1, def: { inf: 400, cav: 360, mag: 650 } },
  { name: 'Засыпанный храм', count: 30, hours: 4, chance: 0.45, bias: 0.12, lvl: 4, die: 0.15, def: { inf: 1070, cav: 950, mag: 1600 } },
  { name: 'Рунные врата', count: 25, hours: 8, chance: 0.55, bias: 0.2, lvl: 6, die: 0.2, def: { inf: 3000, cav: 2700, mag: 4300 } },
  { name: 'Сокрытое святилище', count: 20, hours: 12, chance: 0.65, bias: 0.3, lvl: 8, die: 0.25, def: { inf: 6300, cav: 5750, mag: 8800 } },
];
const DUNG_CAP = 0.75; // находка — никогда не наверняка
// охрана лагеря — для боя (army.js clash: npc.dung — крепнет, как охрана лагерей разбойников, потери победителя вдвое меньше)
const GUARDS = DUNG.map((d, l) => (d ? { name: `Охрана: ${d.name}`, level: String(l), def: d.def, loot: { wood: 0, stone: 0, iron: 0, food: 0 }, dung: true } : null));
const travelSec = (l) => Math.max(30, Math.round((10 + 5 * l) * 60 / SPEED)); // путь до лагеря: 15–35 минут (не зависит от расстояния)
const digSec = (l) => Math.max(60, Math.round(DUNG[l].hours * 3600 / SPEED));
const LIVE = ['go', 'dig', 'found'];

function install(Game) {
  const P = Game.prototype;
  const A = () => require('./army');

  // карта: при первом обращении — лагеря по всей карте, не ближе DUNG_GAP клеток друг к другу
  P.dung = function dung() {
    if (this.db.dungeon && Array.isArray(this.db.dungeon.camps)) return this.db.dungeon;
    const d = (this.db.dungeon = { camps: [] });
    let id = 1;
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
  // лагерь раскопан (артефакт унесли или не нашли) — исчезает и через DUNG_BACK_SEC появляется в другом месте
  P.dungGone = function dungGone(camp, now) { camp.occ = null; camp.gone = now + Math.round(DUNG_BACK_SEC / SPEED * 1000); };
  P.dungActive = function dungActive(u) {
    let n = 0; for (const c of this.castlesOf(u)) for (const a of c.armies || []) if (a.mission === 'dig' && LIVE.includes(a.state)) n++;
    return n;
  };
  P.dungChance = function dungChance(castle, l, arch) {
    return Math.min(DUNG_CAP, DUNG[l].chance + 0.01 * Math.floor(Math.min(DUNG_ARCH, arch) / 5) + 0.02 * this.buildingLevel(castle, A().B.ARCH_CAMP));
  };

  // выбранные игроком войска из Замковой армии: { id: n } → проверенные; ok(role, unit) — кто может идти
  const pickUnits = (g, castle, pick, ok) => {
    const { UNIT, GENERAL_ID } = A(), out = {};
    if (!pick || typeof pick !== 'object' || Array.isArray(pick)) return { error: 'Выберите войска.' };
    for (const [id, v] of Object.entries(pick)) {
      const n = Math.floor(Number(v)); if (!(n > 0)) continue;
      const u = Object.prototype.hasOwnProperty.call(UNIT, id) ? UNIT[id] : null;
      if (!u || Number(id) === GENERAL_ID || !ok(u)) return { error: u ? `${u.name} в Подземелье не ходит.` : 'Неизвестный воин.' };
      if ((castle.units[id] || 0) < n) return { error: `Не хватает: ${u.name}.` };
      out[id] = n;
    }
    if (!Object.keys(out).length) return { error: 'Выберите войска.' };
    return { units: out };
  };
  const NOGO = ['merchant', 'sage', 'settler', 'scout', 'eye', 'rebel']; // торговцы, учёные, путешественники, разведчики, бунтари — не в Подземелье
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
    const p = pickUnits(this, castle, pick, (x) => !NOGO.includes(x.role) && !x.oneUse); if (p.error) return p;
    if (!(p.units[ARCH_ID] > 0)) return { error: 'Нужен хотя бы один археолог — копают они.' };
    take(castle, p.units);
    const a = march(this, castle, p.units, 'dig', camp);
    camp.occ = { cid: castle.id, aid: a.id, uid: castle.owner };
    this.addStat(castle.owner, 'expeds', 1);
    this.store.save();
    return { ok: true, msg: `Отряд вышел к лагерю «${DUNG[camp.l].name}», будет на месте через ${Math.round(a.sec / 60) || 1} мин.` };
  };
  // налёт на чужой отряд в лагере: отнять артефакт (или прогнать копающих)
  P.dungAttack = function dungAttack(castle, campId, pick) {
    this.tick(castle); this.mil(castle);
    const { B } = A();
    if (!this.buildingLevel(castle, B.HQ)) return { error: 'Нужен Военный штаб.' };
    const camp = this.dungCamp(campId); if (!camp) return { error: 'Этого лагеря уже нет.' };
    const o = this.dungOcc(camp); if (!o) return { error: 'В лагере никого нет — нападать не на кого.' };
    if (o.c.owner === castle.owner) return { error: 'Это ваш отряд.' };
    if (o.a.state === 'go') return { error: 'Отряд ещё в пути к лагерю — нападать пока не на кого.' };
    const p = pickUnits(this, castle, pick, (x) => !NOGO.includes(x.role) && x.role !== 'archaeologist' && !x.oneUse); if (p.error) return p;
    take(castle, p.units);
    const a = march(this, castle, p.units, 'dsteal', camp);
    this.store.save();
    return { ok: true, msg: `Отряд вышел к лагерю «${DUNG[camp.l].name}», нападёт через ${Math.round(a.sec / 60) || 1} мин.` };
  };
  // отозвать свой отряд из лагеря: с артефактом или без — домой
  P.dungRecall = function dungRecall(castle, aid) {
    const a = (castle.armies || []).find((x) => x.id === Number(aid) && x.mission === 'dig' && ['dig', 'found'].includes(x.state));
    if (!a) return { error: 'Отряд не найден.' };
    const now = Date.now(), camp = this.dung().camps.find((q) => q.id === a.dung);
    if (camp && camp.occ && camp.occ.aid === a.id) { if (a.state === 'found') this.dungGone(camp, now); else camp.occ = null; } // бросили раскопки — лагерь свободен
    this.goBack(castle, a, now);
    this.store.save();
    return { ok: true, msg: a.art ? 'Отряд несёт артефакт домой.' : 'Отряд возвращается домой.' };
  };

  // отряд дошёл до лагеря (army.js arrive)
  P.dungArrive = function dungArrive(c, a, t) {
    const camp = this.dung().camps.find((q) => q.id === a.dung && !q.gone);
    const name = camp ? DUNG[camp.l].name : 'лагерь';
    if (a.mission === 'dig') {
      if (!camp || !camp.occ || camp.occ.aid !== a.id) { this.report(c.owner, 'Раскопки: лагеря нет', [`Лагеря «${name}» на месте уже нет — отряд возвращается домой.`], 'expedition'); return this.goBack(c, a, t); }
      const was = { ...a.units }, R = this.clash(c, a, null, GUARDS[camp.l], t);
      const lines = [`Отряд дошёл до лагеря «${name}» (${camp.l} ур.) и вступил в бой с охраной.`, `Отряд: ${unitsLine(was, R.aLost)}.`];
      if (R.calc.wounded) lines.push(`Ранены и ушли в Лазарет: ${Wd.warriors(R.calc.wounded)}.`);
      if (!R.win || !(a.units[ARCH_ID] > 0)) {
        lines.push(R.win ? 'Охрана разбита, но археологов не осталось — копать некому. Отряд возвращается домой.' : 'Охрана сильнее — отряд разбит. Лагерь остался свободным.');
        camp.occ = null; this.report(c.owner, `Раскопки: ${R.win ? 'копать некому' : 'отряд разбит'}`, lines, 'battle');
        return this.goBack(c, a, t);
      }
      a.state = 'dig'; a.digAt = t; a.digEnd = t + digSec(camp.l) * 1000;
      lines.push(`Охрана разбита. Археологи начали раскопки — ${Math.round(digSec(camp.l) / 60)} мин.`);
      this.report(c.owner, `Раскопки начались: ${name}`, lines, 'expedition');
      return;
    }
    // налёт
    const o = camp && this.dungOcc(camp);
    if (!o || o.c.owner === c.owner || o.a.state === 'go') {
      this.report(c.owner, 'Налёт в Подземелье: никого нет', [`В лагере «${name}» уже никого нет — отряд возвращается домой.`], 'battle');
      return this.goBack(c, a, t);
    }
    this.dungBattle(c, a, o.c, o.a, camp, t);
  };
  // бой в лагере: нападающий (c, a) против отряда (dc, d). Отряд защищается без Забора и без помощи замка; свои бонусы (науки,
  // ранг, артефакты, Кузница) — у обоих
  P.dungBattle = function dungBattle(c, a, dc, d, camp, t) {
    const bD = this.bonus(dc);
    const D = { id: -1, owner: dc.owner, name: 'Лагерь', site: true, units: d.units, squads: [], general: null, armies: [], forge: dc.forge || {},
      grid: [new Int8Array(49).fill(-1), new Int8Array(225).fill(-1)], levels: [new Int8Array(49), new Int8Array(225)],
      sim: { bonus: { def: bD.def, magic: bD.magic, wall: 0, wallPer: 0 }, genDef: 0, hero: null } };
    const aWas = { ...a.units }, dWas = { ...d.units };
    const R = this.clash(c, a, D, null, t);
    const dWnd = this.toInfirmary(dc, R.dLost); // павшие защитники — ранеными в Лазарет своего замка
    for (const id of Object.keys(d.units)) if (!(d.units[id] > 0)) delete d.units[id];
    const att = this.ownerOf(c), def = this.ownerOf(dc), name = DUNG[camp.l].name, art = d.art;
    const sides = [`Нападение: ${att.login} — ${unitsLine(aWas, R.aLost)}.`, `Отряд в лагере: ${def.login} — ${unitsLine(dWas, R.dLost)}.`,
      `Сила нападения ${R.calc.att.total.toLocaleString('ru-RU')} против защиты ${R.calc.def.total.toLocaleString('ru-RU')}.`];
    const aL = [`Ваш отряд напал на лагерь «${name}» (${camp.l} ур.).`, ...sides], dL = [`На ваш отряд в лагере «${name}» (${camp.l} ур.) напал ${att.login}.`, ...sides];
    if (R.calc.wounded) aL.push(`Ранены и ушли в Лазарет: ${Wd.warriors(R.calc.wounded)}.`);
    if (dWnd) dL.push(`Ранены и ушли в Лазарет: ${Wd.warriors(dWnd)}.`);
    const alive = Object.values(d.units).some((n) => n > 0);
    if (R.win) {
      if (art) { a.art = art; delete d.art; aL.push(`Победа! Отряд забрал артефакт (${artName(art)}) и несёт его домой. Засчитается, когда дойдёт до замка.`); dL.push(`Отряд разбит, артефакт (${artName(art)}) отняли.`); this.dungGone(camp, t); }
      else { aL.push('Победа! Копавший отряд разбит, лагерь свободен.'); dL.push('Отряд разбит, раскопки сорваны. Лагерь свободен.'); camp.occ = null; }
      if (alive) this.goBack(dc, d, t); else dc.armies = dc.armies.filter((x) => x !== d);
    } else {
      aL.push('Поражение — отряд в лагере устоял.'); dL.push(art ? 'Ваш отряд отбился и стережёт артефакт. Отзовите его, пока не напали снова.' : 'Ваш отряд отбился и продолжает раскопки.');
      if (d.state === 'dig' && !(d.units[ARCH_ID] > 0)) { dL.push('Но археологов не осталось — раскопки брошены, отряд возвращается домой.'); camp.occ = null; this.goBack(dc, d, t); }
      else if (!alive) { camp.occ = null; dc.armies = dc.armies.filter((x) => x !== d); }
    }
    this.report(c.owner, R.win ? `Налёт в Подземелье: победа${art ? ', артефакт ваш' : ''}` : 'Налёт в Подземелье: поражение', aL, 'battle');
    this.report(dc.owner, R.win ? `Подземелье: на отряд напали${art ? ', артефакт отняли' : ''}` : 'Подземелье: отряд отбился', dL, 'battle');
    this.goBack(c, a, t);
  };
  // раскопки закончились: нашли — ждут отзыва, нет — домой с черепками (по чуть-чуть ресурсов)
  P.dungDug = function dungDug(c, a, camp, t) {
    const D = DUNG[camp.l], arch = a.units[ARCH_ID] || 0;
    const chance = this.dungChance(c, camp.l, arch); // шанс — по тем, кто начал копать
    // обвалы и ловушки: гибнет часть археологов (насовсем, не в Лазарет)
    const dead = Math.min(arch, Math.round(arch * (D.die + Math.random() * 0.1)));
    const lost = dead ? `${pick(['Обвал в галерее', 'Древняя ловушка', 'Ядовитый газ из гробницы', 'Проснувшаяся стража склепа'])}: ${Wd.plural(dead, 'погиб', 'погибли', 'погибло')} ${Wd.num(dead, 'археолог', 'археолога', 'археологов')} из ${arch}.` : 'Все археологи живы.';
    if (dead) { a.units[ARCH_ID] -= dead; if (!a.units[ARCH_ID]) delete a.units[ARCH_ID]; }
    if (Math.random() < chance) {
      const { ART_TYPES } = A(), type = pick(Object.keys(ART_TYPES)), roll = Math.random() + D.bias + 0.02 * this.buildingLevel(c, A().B.ARCH_CAMP);
      a.art = { type, rarity: roll > 0.95 ? 2 : roll > 0.7 ? 1 : 0 }; a.state = 'found';
      this.report(c.owner, `Подземелье: найден артефакт!`, [`Археологи в лагере «${D.name}» нашли артефакт: ${artName(a.art)}.`, lost,
        'Отряд ждёт в лагере. Отзовите его домой — артефакт засчитается, когда отряд дойдёт до замка.', 'Пока отряд в лагере, на него могут напасть и отнять артефакт.'], 'expedition');
      return;
    }
    const g = Math.round((50 + Math.random() * 150) * camp.l);
    a.loot = Object.fromEntries(RES4.map((r) => [r, g]));
    this.dungGone(camp, t); this.goBack(c, a, t);
    this.report(c.owner, `Подземелье: артефакта нет`, [`В лагере «${D.name}» артефакт не нашли, зато принесут черепки и старые монеты — по ${g} каждого ресурса.`, lost, 'Отряд возвращается домой.'], 'expedition');
  };
  // отряд с артефактом дошёл до замка (army.js returnHome)
  P.dungHome = function dungHome(c, a) {
    const art = a.art; delete a.art; if (!art) return;
    this.addStat(c.owner, 'arts', 1 + art.rarity * 2);
    this.report(c.owner, 'Артефакт из Подземелья доставлен', [this.artFound(c, art.type, art.rarity, Date.now())], 'expedition');
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
        if (me) { r.o.aid = o.a.id; r.o.units = o.a.units; }
      }
      return r;
    });
    const mine = [];
    for (const c of this.castlesOf(user)) for (const a of c.armies || []) if (a.dung) mine.push({ id: a.id, cid: c.id, castle: c.name, mission: a.mission, state: a.state, camp: a.dung, l: a.dl,
      arrive: a.arrive, back: a.back, digEnd: a.digEnd || 0, art: a.art ? artName(a.art) : null, units: a.units });
    const L = this.buildingLevel(castle, B.EXPEDITION), camp = this.buildingLevel(castle, B.ARCH_CAMP);
    return { w: DUNG_W, h: DUNG_H, now, camps, mine, max: DUNG_MAX, active: this.dungActive(user), exp: L, archCamp: camp, arch: DUNG_ARCH,
      kinds: DUNG.map((k, l) => (k ? { l, name: k.name, lvl: k.lvl, dig: digSec(l), go: travelSec(l), chance: Math.round(Math.min(DUNG_CAP, k.chance + 0.02 * camp) * 100), cap: Math.round(DUNG_CAP * 100), die: Math.round(k.die * 100) } : null)) };
  };
  P.dungName = function dungName(l) { return DUNG[l] ? DUNG[l].name : 'Подземелье'; };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const artName = (art) => { const { ART_TYPES, RARITY } = A(); return `${ART_TYPES[art.type].name}, ${RARITY[art.rarity].name}`; };
  const unitsLine = (units, lost) => { const { UNIT } = A(); return Object.entries(units).filter(([id, n]) => UNIT[id] && n > 0).map(([id, n]) => `${UNIT[id].name} ${n}${lost && lost[id] ? ` (−${lost[id]})` : ''}`).join(', ') || '—'; };
}

module.exports = { install, DUNG, DUNG_MAX, DUNG_W, DUNG_H, GUARDS };
