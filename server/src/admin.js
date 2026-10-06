'use strict';
// Администратор: 20 замков на полной прокачке и все админ-команды (отдельное окно «Админ-панель» в клиенте).
// Подключается к Game после army.js и social.js — см. install().

const C = require('./catalog');
const { UNIT, GENERAL_ID, GEN, unitsForRace } = require('./army');

const ADMIN_NICK = 'Советник';
const ADMIN_CASTLES = Number(process.env.ADMIN_CASTLES || 20);
const START_REP = 10; // стартовая репутация (как в social.js)
const RES4 = ['wood', 'stone', 'iron', 'food'];

function install(Game) {
  const P = Game.prototype;
  const findUser = (g, login) => { const k = String(login || '').trim(); return Object.prototype.hasOwnProperty.call(g.db.users, k) ? g.db.users[k] : undefined; };

  // админ: создаётся при старте. По умолчанию — как обычный игрок: 1 замок, всё с нуля.
  // ADMIN_FULL=1 (автотесты) — ADMIN_CASTLES замков на полной прокачке, миллион золота.
  // ник админа в игре — «Советник»; вход — по логину admin (или секретному ADMIN_LOGIN)
  P.adminUser = function adminUser() { const k = this.db.accts && this.db.accts.admin; return (k && this.db.users[k]) || this.db.users[ADMIN_NICK] || this.db.users.admin || null; };
  P.ensureAdmin = function ensureAdmin(pass = process.env.ADMIN_PASS) {
    const FULL = process.env.ADMIN_FULL === '1';
    let u = this.adminUser();
    if (u && u.login !== ADMIN_NICK && !Object.prototype.hasOwnProperty.call(this.db.users, ADMIN_NICK)) { // старая база: ник admin → Советник (логин для входа — прежний)
      delete this.db.users[u.login]; u.login = ADMIN_NICK; this.db.users[ADMIN_NICK] = u; if (u.acct) this.db.accts[u.acct] = ADMIN_NICK;
    }
    if (!u) {
      // без ADMIN_PASS генерируется случайный пароль и пишется в консоль и файл рядом с базой
      if (!pass) {
        pass = require('crypto').randomBytes(6).toString('base64url').toLowerCase();
        try { require('fs').mkdirSync(require('path').dirname(this.store.file), { recursive: true }); require('fs').writeFileSync(require('path').join(require('path').dirname(this.store.file), 'ADMIN_PASSWORD.txt'), `admin / ${pass}\n`, { mode: 0o600 }); } catch { /* нет доступа к папке */ }
        this.adminNewPass = pass;
      }
      const r = this.register({ login: 'admin', nick: ADMIN_NICK, password: pass, race: 0, system: true });
      if (r.error) return null;
      u = r.user;
      if (FULL) { const c = this.castleOf(u); c.name = 'Королевский замок'; this.maxOut(c); }
    } else if (!FULL && !u.freshStart && (u.adminGold || this.castlesOf(u).length > 1)) this.adminFresh(u); // прокачанный админ из старой базы → с нуля (один раз)
    // сброс пароля админа при запуске: ADMIN_PASS=новый ADMIN_RESET=1 sh ~/game/start.sh
    if (pass && process.env.ADMIN_RESET === '1' && !this.passOk(u, pass)) { const cr = require('crypto'), salt = cr.randomBytes(8).toString('hex'); u.pass = `${salt}:${cr.scryptSync(String(pass).toLowerCase(), salt, 32).toString('hex')}`; u.tokens = []; require('./game').passLogPush(u, 'server'); this.adminReset = true; }
    u.admin = true;
    // администратор — только этот аккаунт: права, выданные раньше другим игрокам, снимаются при запуске
    for (const x of Object.values(this.db.users)) if (x !== u && x.admin) { x.admin = false; x.tokens = []; }
    if (FULL) {
      if (!u.adminGold) { u.gold = Math.max(u.gold || 0, 1000000); u.adminGold = true; } // миллион золота админу — один раз
      if (!u.royal) { u.royal = 1000000; u.royalAt = Date.now(); u.captures = u.captures || ADMIN_CASTLES - 1; }
      this.adminAddCastles(u, ADMIN_CASTLES - this.castlesOf(u).length);
    } else u.freshStart = true;
    this.store.save();
    return u;
  };
  // админ с нуля: все его замки (и войска в них) убираются, вместо них — один новый стартовый замок; золото и лояльность как у новичка
  P.adminFresh = function adminFresh(u) {
    for (const c of this.castlesOf(u)) this.removeCastle(c);
    const c = this.createCastle(u);
    u.castleId = c.id; u.castleIds = [c.id];
    u.gold = 0; u.adminGold = false; u.royal = 0; u.royalAt = Date.now(); u.captures = 0;
    u.freshStart = true; this.adminWasReset = true;
    return c;
  };

  // смена расы игрока (и админа): юниты чужой расы убираются из замков, отрядов, армий и очереди тренировки
  P.adminSetRace = function adminSetRace(u, race) {
    if (!C.RACE_NAMES[race]) return { error: 'Неизвестная раса.' };
    if (u.race === race) return { error: `Раса и так — ${C.RACE_NAMES[race]}.` };
    const ok = (id) => { const x = UNIT[id]; return !x || x.race === 'all' || x.race === race || Number(id) === GENERAL_ID; };
    const clean = (units) => { for (const id of Object.keys(units || {})) if (!ok(id)) delete units[id]; };
    for (const c of this.castlesOf(u)) {
      this.mil(c);
      clean(c.units); c.squads.forEach((q) => clean(q.units)); c.armies.forEach((a) => clean(a.units));
      c.training = c.training.filter((t) => ok(t.unit));
    }
    u.race = race;
    return { ok: true };
  };
  // игрок (или админ) — как сразу после регистрации: один новый стартовый замок, золото 0, репутация 10; ник, пароль, раса, премиум и союз остаются
  P.adminResetPlayer = function adminResetPlayer(u) {
    for (const c of this.castlesOf(u)) this.removeCastle(c);
    const c = this.createCastle(u);
    u.castleId = c.id; u.castleIds = [c.id];
    u.gold = 0; u.reputation = START_REP; u.royal = 0; u.royalAt = Date.now(); u.captures = 0;
    if (u.admin) { u.adminGold = true; u.freshStart = true; }
    return c;
  };

  // новые замки рядом со столицей (свободные клетки по спирали), сразу на полной прокачке
  P.adminAddCastles = function adminAddCastles(user, n) {
    const cap = this.castlesOf(user)[0];
    let r = 2, a = 0, made = 0;
    while (made < n && r < 200) {
      const x = cap.x + Math.round(Math.cos(a) * r), y = cap.y + Math.round(Math.sin(a) * r);
      a += 0.5; if (a > Math.PI * 2) { a = 0; r += 2; }
      let near = false; for (let dx = -2; dx <= 2 && !near; dx++) for (let dy = -2; dy <= 2; dy++) if (this.castleAt(x + dx, y + dy)) { near = true; break; } // не вплотную к другим замкам
      if (near) continue;
      const c = this.createCastle(user, { x, y });
      c.name = `Королевский замок ${this.castlesOf(user).length + 1}`;
      user.castleIds = [...this.castlesOf(user).map((k) => k.id), c.id];
      this.maxOut(c);
      made++;
    }
    return made;
  };

  P.playerInfo = function playerInfo(u) {
    const cs = this.castlesOf(u);
    return { id: u.id, login: u.login, acct: u.acct || '', email: u.email || '', race: C.RACE_NAMES[u.race], castles: cs.length, rating: this.userRating(u), gold: u.gold || 0,
      online: !!u.online, banned: !!u.banned, admin: !!u.admin, mod: !!u.mod, smod: !!u.smod, created: u.created, lastSeen: u.lastSeen || u.created, x: cs[0] && cs[0].x, y: cs[0] && cs[0].y };
  };

  // все админ-команды. arg.login — над каким игроком (пусто — над собой); arg.all — над всеми его замками
  P.adminOp = function adminOp(user, op, arg = {}) {
    if (!user.admin) return { error: 'Нет прав.' };
    const target = arg.login ? findUser(this, arg.login) : user;
    if (!target) return { error: 'Игрок не найден.' };
    const castles = arg.all ? this.castlesOf(target) : [this.castleOf(target)];
    const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);
    const now = Date.now();
    // админ что-то меняет у игрока — «Подозрительное» (anomaly.js) начнёт замер заново, без ложной тревоги
    if (!['player', 'players', 'stats', 'alerts', 'mods', 'multis', 'bugs', 'passcheck', 'armyinfo', 'sec', 'ipban', 'ipunban', 'secclear', 'alertsclear', 'tgbackup'].includes(op)) target.admTouch = now;
    let data = null, msg = 'Готово.';
    switch (op) {
      // --- ресурсы, золото ---
      case 'fill': for (const c of castles) { this.tick(c); const cap = this.capacity(c); for (const r of C.RES) c.res[r] = cap[r]; } msg = 'Склады заполнены.'; break;
      case 'res': for (const c of castles) { this.tick(c); const cap = this.capacity(c); for (const r of C.RES) c.res[r] = Math.min(cap[r], Math.max(0, c.res[r] + num(arg.n, 10000))); } msg = `Ресурсы ${num(arg.n, 10000) >= 0 ? '+' : ''}${num(arg.n, 10000)}.`; break;
      case 'gold': {
        const n = num(arg.n, 1000);
        this.goldChange(target, n, n >= 0 ? 'Пополнение казны администрацией' : 'Списание администрацией');
        if (n > 0) this.sendMail(user, target.login, 'Казна пополнена', `Ваша казна пополнена ${n} монетами.`);
        this.event(target.id, n >= 0 ? `Ваша казна пополнена ${n} монетами.` : `С вашей казны списано ${-n} монет.`);
        msg = `${target.login}: монет ${target.gold}.`; break;
      }
      // --- стройки и время ---
      case 'finish':
        for (const c of castles) {
          this.mil(c);
          for (const q of c.queue) q.end = now;
          for (const t of c.training) t.start = now - t.each * t.count;
          if (c.research) c.research.end = now;
          for (const j of Object.values(c.upJobs || {})) j.end = now;
          if (c.gearJob) c.gearJob.end = now;
          for (const a of c.armies) { if (a.state === 'go') { const d = a.arrive - a.depart; a.arrive = now; a.depart = now - d; } else a.back = now; }
          if (c.general && c.general.reviveAt) c.general.reviveAt = now;
          for (const d of c.deadGenerals || []) if (d.reviveAt) d.reviveAt = now;
          if (c.general && c.general.dead && !c.general.reviveAt) { c.general.dead = false; delete c.general.away; }
          this.tick(c);
        }
        this.tickWorld(now);
        for (const c of castles) for (const a of c.armies) if (a.state === 'back') a.back = now; // и сразу домой
        this.tickWorld(now); msg = 'Всё завершено.'; break;
      case 'max': for (const c of castles) this.maxOut(c); msg = `Прокачано замков: ${castles.length}.`; break;
      case 'castles': { const n = Math.max(1, Math.min(50, num(arg.n, 1))), made = this.adminAddCastles(target, n); msg = `${target.login}: выдано полных замков — ${made}.`; if (target !== user && made) this.event(target.id, `Администрация выдала вам ${made === 1 ? 'полностью прокачанный замок' : `полностью прокачанные замки (${made})`}! Смотрите «Мои замки».`); break; }
      // --- армия ---
      case 'army': {
        const n = num(arg.n, 1000), list = arg.unit ? [UNIT[arg.unit]].filter(Boolean) : unitsForRace(target.race).filter((u) => u.id !== GENERAL_ID && !u.notrain);
        for (const c of castles) { this.mil(c); for (const u of list) { c.units[u.id] = Math.max(0, (c.units[u.id] || 0) + n); if (!c.units[u.id]) delete c.units[u.id]; } }
        msg = `Войска ${n >= 0 ? '+' : ''}${n} (${list.length} видов).`; break;
      }
      // выдать армию игроку по нику: только юниты его расы (без генерала и торговцев), в выбранный замок (по умолчанию — столица)
      case 'armyinfo': {
        const list = unitsForRace(target.race).filter((u) => u.id !== GENERAL_ID && !u.notrain);
        data = { login: target.login, race: target.race, raceName: C.RACE_NAMES[target.race] || target.race, units: list.map((u) => u.id),
          castles: this.castlesOf(target).map((c, i) => ({ id: c.id, name: c.name, x: c.x, y: c.y, capital: i === 0 })) };
        break;
      }
      case 'givearmy': {
        const allowed = new Set(unitsForRace(target.race).filter((u) => u.id !== GENERAL_ID && !u.notrain).map((u) => u.id));
        const c = this.castlesOf(target).find((k) => k.id === Number(arg.castle)) || this.castlesOf(target)[0];
        if (!c) return { error: 'У игрока нет замков.' };
        this.mil(c);
        const got = [];
        for (const [id, v] of Object.entries(arg.units && typeof arg.units === 'object' ? arg.units : {})) {
          const n = Math.floor(Number(v)), uid = Number(id);
          if (!allowed.has(uid) || !Number.isFinite(n) || n <= 0) continue;
          const k = Math.min(n, 1000000);
          c.units[uid] = (c.units[uid] || 0) + k; got.push(`${UNIT[uid].name} ×${k}`);
        }
        if (!got.length) return { error: 'Укажите количество хотя бы для одного юнита.' };
        msg = `${target.login} (${c.name}): ${got.join(', ')}.`;
        if (target !== user) this.event(target.id, `Администрация выдала войска в замок «${c.name}»: ${got.join(', ')}.`);
        break;
      }
      case 'noarmy': for (const c of castles) { this.mil(c); c.units = {}; } msg = 'Войска убраны.'; break;
      case 'general': {
        const lvl = Math.max(1, Math.min(GEN.maxLevel, num(arg.level, 100)));
        for (const c of castles) { this.mil(c); const old = c.general; c.general = this.newGeneral(c, lvl); if (old) { c.general.name = old.name || c.general.name; c.general.squad = old.squad; c.general.away = old.away; } }
        msg = `Генерал ${lvl} ур.`; break;
      }
      case 'boss': { const b = this.bossSpawn(now, arg.n !== undefined && arg.n !== '' ? num(arg.n, 0) : undefined); msg = `Босс «${b.name}» появился в ${b.x}:${b.y}.`; break; }
      case 'gear': for (const c of castles) { this.mil(c); for (const slot of require('./hero').SLOTS) for (let r = 0; r < 4; r++) { if (this.heroGear(c).length >= 24) break; this.heroGear(c).push({ id: this.db.nextId++, slot, r, plus: 0 }); } } msg = 'Выдано снаряжение генерала (все ячейки, 4 редкости).'; break;
      case 'arts': for (const c of castles) { this.mil(c); for (const type of ['atk', 'def', 'prod', 'speed', 'train']) c.artifacts.push({ id: this.db.nextId++, type, rarity: 2, active: false, found: now }); } msg = 'Выдано 5 легендарных артефактов.'; break;
      case 'sciences': for (const c of castles) { this.mil(c); c.sciences = Object.assign(this.sciOf(c), { eco: 20, eng: 20, fhi: 20, war: 20 }); } msg = 'Все науки 20 ур.'; break;
      case 'loyalty': for (const c of castles) { this.mil(c); c.loyalty = Math.max(0, Math.min(100, num(arg.value, 100))); c.loyAt = now; } msg = `Лояльность ${num(arg.value, 100)}.`; break;
      // --- игроки ---
      case 'stats': data = this.adminStats(Number(arg.online) || 0); break;
      case 'alerts': { // «Подозрительное»: последние тревоги; открыв список, админ их «видел»
        const l = (this.db.alerts || []).slice(-150).reverse(); data = l.map((x) => ({ ...x })); for (const x of this.db.alerts || []) x.seen = true; break;
      }
      case 'alertsclear': this.db.alerts = []; msg = 'Список подозрительного очищен.'; break;
      case 'sec': data = { ...this.secView(arg.ip), tg: this.tgBackupInfo() }; break; // «Безопасность» (secwatch.js); arg.ip — адрес самого админа (от web.js)
      case 'ipban': { const r = this.ipBan(arg.target, arg.why, arg.ip); if (r.error) return r; msg = r.msg; break; }
      case 'ipunban': msg = this.ipUnban(arg.target).msg; break;
      case 'tgbackup': { if (!this.tgBackupInfo().on) return { error: 'Копия в Telegram не настроена: на сервере sh /opt/war/game/tgbackup.sh' }; this.tgBackupSend('manual').then((r) => { if (this.event) this.event(user.id, r.error || r.msg); }); msg = 'Отправляю копию в Telegram…'; break; } // tgbackup.js
      case 'secclear': this.db.sec = {}; msg = 'Журнал адресов очищен (блокировки остались).'; break; // статистика (metrics.js); онлайн сейчас — от web.js
      case 'mods': // модераторы форума (общие) и модераторы разделов форума
        data = { mods: Object.values(this.db.users).filter((u) => u.mod && !u.admin).map((u) => ({ login: u.login, online: !!u.online })),
          sections: this.forumDb().sections.filter((s) => s.mods.length).map((s) => ({ name: s.name, mods: s.mods.map((id) => (this.userById(id) || {}).login).filter(Boolean) })) };
        break;
      case 'players': { // первые 100 по рейтингу (+ поиск по части логина)
        const q = String(arg.q || '').trim().toLowerCase();
        data = (q ? Object.values(this.db.users).filter((u) => u.login.toLowerCase().includes(q)) : this.leaderboard().slice(0, 100).map((x) => x.u)).slice(0, 100).map((u) => this.playerInfo(u));
        break;
      }
      case 'bots': { // заселить мир ботами (проверка нагрузки): игроки с замками и случайным развитием
        const n = Math.max(1, Math.min(100000, num(arg.n, 1000))), t0 = Date.now();
        const races = C.RACES; let made = 0;
        for (let i = 0; i < n; i++) {
          const id = this.db.nextId++, login = `bot${id}`;
          if (this.db.users[login]) continue;
          const u = { id, login, pass: 'bot:-', race: races[i % races.length], created: now, castleId: null, bot: true };
          this.db.users[login] = u; this.byId.set(id, u);
          const c = this.createCastle(u); u.castleId = c.id; u.castleIds = [c.id];
          const lv = 1 + Math.floor(Math.random() * 12);
          c.levels[0][24] = lv; c.levels[0][8] = Math.max(1, lv - 2); // Ратуша и Склад
          for (let k = 0; k < c.grid[1].length; k++) if (c.grid[1][k] >= 0) c.levels[1][k] = Math.max(1, Math.min(require('./catalog').LANDS_MAX, Math.ceil(Math.random() * lv / 4)));
          made++;
        }
        this.cache = {};
        msg = `Создано ботов: ${made} за ${((Date.now() - t0) / 1000).toFixed(1)} с. Игроков всего: ${Object.keys(this.db.users).length}.`; break;
      }
      case 'player': data = { ...this.playerInfo(target), goldLog: (target.goldLog || []).slice(-30).reverse(), alerts: (this.db.alerts || []).filter((x) => x.uid === target.id).slice(-10).reverse(), passLog: (target.passLog || []).map((x, i, l) => ({ at: x.at, by: x.by, ip: x.ip || '', current: i === l.length - 1 })).reverse(), dev: this.devReport(target), nickLog: (target.nickLog || []).slice(-10).reverse(), ips: (target.ips || []).slice().reverse(), devs: (target.devs || []).map((d) => d.dev.slice(0, 8) + (this.db.devBans && this.db.devBans[d.dev] ? ' [бан]' : '')), regIp: target.regIp || '', castlesList: this.castlesOf(target).map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y, rating: this.rating(c), loyalty: Math.round(c.loyalty ?? 100) })) }; break;
      case 'royal': this.royalTick(target); target.royal = Math.max(0, target.royal + num(arg.n, 10000)); msg = `Лояльность населения: ${Math.floor(target.royal)}.`; break;
      case 'rep': target.reputation = Math.max(0, (target.reputation ?? START_REP) + num(arg.n, 10)); msg = `Репутация: ${target.reputation}.`; break;
      case 'ban': if (target.admin) return { error: 'Админа заблокировать нельзя.' }; target.banned = true; target.online = false; msg = `${target.login} заблокирован.`; break;
      case 'unban': target.banned = false; msg = `${target.login} разблокирован.`; break;
      case 'pass': {
        const p = String(arg.password || '').toLowerCase();
        if (p.length < 5) return { error: 'Пароль минимум 5 символов.' };
        const crypto = require('crypto'), salt = crypto.randomBytes(8).toString('hex');
        target.pass = `${salt}:${crypto.scryptSync(p, salt, 32).toString('hex')}`; target.tokens = []; require('./game').passLogPush(target, `admin ${user.login}`, arg.ip || '');
        msg = `Пароль ${target.login} изменён, все сессии завершены. Сообщите игроку новый пароль.`; break;
      }
      // проверка пароля, который называет игрок: совпадает ли с текущим или одним из прежних (сам пароль не хранится и не показывается)
      case 'passcheck': {
        const p = String(arg.password || '').toLowerCase(); if (!p) return { error: 'Введите пароль, который назвал игрок.' };
        const { checkPassword } = require('./game');
        const log = target.passLog && target.passLog.length ? target.passLog : [{ at: target.created || 0, by: 'reg', h: target.pass }];
        const hits = log.map((x, i) => ({ x, i })).filter(({ x }) => x.h && checkPassword(p, x.h)).map(({ x, i }) => ({ from: x.at, to: i + 1 < log.length ? log[i + 1].at : 0, current: i === log.length - 1, by: x.by }));
        data = { hits, login: target.login }; msg = hits.length ? `Совпадает: ${hits.map((h) => (h.current ? 'текущий пароль' : 'прежний пароль')).join(', ')}.` : 'Не совпадает ни с текущим, ни с прежними паролями.'; break;
      }
      case 'smod': if (target.admin) return { error: 'Админ и так может всё.' }; target.smod = arg.on === undefined ? !target.smod : !!Number(arg.on); if (target.smod) target.mod = true; msg = `${target.login} — ${target.smod ? 'старший модератор' : 'больше не старший модератор'}.`; this.event(target.id, target.smod ? 'Вас назначили старшим модератором. Панель — Меню → «Модерация».' : 'Вы больше не старший модератор.'); break;
      case 'mod': if (target.admin) return { error: 'Админ и так может всё.' }; target.mod = arg.on === undefined ? !target.mod : !!Number(arg.on); if (!target.mod) target.smod = false; msg = `${target.login} — ${target.mod ? 'модератор форума' : 'больше не модератор'}.`; if (target.mod) this.event(target.id, 'Вас назначили модератором форума.'); break;
      case 'race': { const r = this.adminSetRace(target, String(arg.race || '')); if (r.error) return r; msg = `${target.login}: раса — ${C.RACE_NAMES[target.race]}.`; break; }
      // --- один замок игрока (arg.cid): сброс к стартовому виду на том же месте или удаление ---
      case 'castlereset': case 'castledel': {
        const cs = this.castlesOf(target), i = cs.findIndex((k) => k.id === Number(arg.cid)), c = cs[i];
        if (!c) return { error: 'Замок не найден.' };
        if (op === 'castledel' && cs.length < 2) return { error: 'Это единственный замок игрока — используйте «Сброс на старт» или «Удалить игрока».' };
        for (const g of this.guestsOf(c)) this.goBack(g.c, g.a, now); // чужие подкрепления — домой
        this.removeCastle(c);
        if (op === 'castledel') {
          target.castleIds = cs.filter((k) => k !== c).map((k) => k.id);
          if (target.castleId === c.id) target.castleId = target.castleIds[0];
          msg = `Замок «${c.name}» (X:${c.x} Y:${c.y}) удалён.`;
          if (target !== user) this.event(target.id, `Администрация удалила Ваш замок «${c.name}».`);
        } else {
          const n = this.createCastle(target, { x: c.x, y: c.y }); n.name = c.name; this.mil(n);
          target.castleIds = cs.map((k) => (k === c ? n.id : k.id));
          if (target.castleId === c.id) target.castleId = n.id;
          msg = `Замок «${c.name}» сброшен к стартовому виду.`;
          if (target !== user) this.event(target.id, `Администрация вернула Ваш замок «${c.name}» в начальное состояние.`);
        }
        this.cache = {};
        break;
      }
      case 'reset': { this.adminResetPlayer(target); msg = `${target.login}: замок сброшен, как после регистрации.`; if (target !== user) this.event(target.id, 'Администрация вернула ваш замок в начальное состояние.'); break; }
      case 'delete': {
        if (target.admin) return { error: 'Админа удалить нельзя.' };
        this.removeAvatar(target);
        for (const c of this.castlesOf(target)) this.removeCastle(c);
        for (const al of Object.values(this.db.alliances || {})) al.members = al.members.filter((m) => m !== target.id);
        delete this.db.users[target.login]; if (target.acct) delete this.db.accts[target.acct]; this.byId.delete(target.id); msg = `Игрок ${target.login} удалён.`; break;
      }
      case 'rename': {
        const c = this.castleAt(num(arg.x, NaN), num(arg.y, NaN)) || this.castleOf(target);
        const name = String(arg.name || '').trim().slice(0, 24); if (!name) return { error: 'Введите имя.' };
        c.name = name; msg = `Замок переименован: ${name}.`; break;
      }
      case 'move': { // перенести активный замок игрока в свободную клетку
        const x = num(arg.x, NaN), y = num(arg.y, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Укажите X и Y.' };
        if (this.castleAt(x, y)) return { error: 'Клетка занята замком.' };
        this.moveCastle(this.castleOf(target), x, y); msg = `Замок перенесён на ${x}:${y}.`; break;
      }
      // --- мир, связь ---
      case 'goldall': { // подарок от администрации: всем игрокам (кроме ботов и админа) по n золота, в Казну, с письмом
        const n = Math.floor(Number(arg.n)); if (!(n >= 1 && n <= 1000)) return { error: 'Сумма — от 1 до 1000 золота каждому.' };
        const why = String(arg.why || '').replace(/[<>]/g, '').trim().slice(0, 100) || 'Подарок от администрации';
        let k = 0; for (const u of Object.values(this.db.users)) { if (u.bot || u.admin) continue; this.goldChange(u, n, `${why} (+${n})`); this.event(u.id, `🎁 ${why}: +${n} золота в Казну!`); k++; }
        (this.db.goldAll = this.db.goldAll || []).push({ at: Date.now(), n, why, players: k }); msg = `Выдано по ${n} золота: ${k} игрокам (всего ${n * k}).`;
        data = { msg, last: this.db.goldAll.slice(-5).reverse() }; break; // итог — прямо в админке (строку над картой закрывает окно)
      }
      case 'goldallget': { data = { msg: '', last: (this.db.goldAll || []).slice(-5).reverse() }; break;
      }
      case 'mailall': {
        const text = String(arg.text || '').trim(); if (!text) return { error: 'Введите текст.' };
        for (const u of Object.values(this.db.users)) if (u.id !== user.id) { this.sendMail(user, u.login, String(arg.subject || 'Сообщение администрации'), text); this.event(u.id, 'Новое письмо от администрации.'); }
        msg = 'Письмо разослано всем.'; break;
      }
      case 'chat': { const r = this.chatPost(user, `[Администрация] ${String(arg.text || '')}`); if (r.error) return r; data = r.msg; msg = 'Отправлено в чат.'; break; }
      case 'noavatar': this.removeAvatar(target); msg = `Аватар ${target.login} удалён.`; break;
      case 'season': { const w = this.seasonClose(); msg = `Месяц подведён досрочно, награждено: ${w.length}.`; break; }
      case 'multis': {
        const seen = user.multiSeen || 0; user.multiSeen = now;
        data = { groups: this.multis(), log: (this.db.multiLog || []).slice(-50).reverse().map((x) => ({ ...x, dev: x.dev.slice(0, 8), fresh: x.at > seen })) };
        break;
      }
      // бан устройства: с него нельзя ни войти, ни зарегистрироваться (решает только админ)
      case 'devban': case 'devunban': {
        const dev = String(arg.dev || ''); if (!/^[a-f0-9]{16,40}$/.test(dev)) return { error: 'Нет такого устройства.' };
        const fp = /^[a-f0-9]{8,40}$/.test(String(arg.fp || '')) ? String(arg.fp) : ''; // «отпечаток» железа — бан переживёт очистку данных и другой браузер
        this.db.devBans = this.db.devBans || {}; this.db.fpBans = this.db.fpBans || {};
        if (op === 'devban') {
          this.db.devBans[dev] = { at: now, by: user.login }; if (fp) this.db.fpBans[fp] = { at: now, by: user.login };
          for (const u of Object.values(this.db.users)) if (!u.admin && ((u.devs || []).some((x) => x.dev === dev) || (fp && (u.devInfo || []).some((x) => x.fp === fp)))) u.online = false;
          msg = `Устройство ${dev.slice(0, 8)}${fp ? ' и его железо' : ''} заблокировано.`;
        } else { delete this.db.devBans[dev]; if (fp) delete this.db.fpBans[fp]; msg = `Устройство ${dev.slice(0, 8)} разблокировано.`; }
        break;
      }
      case 'banmany': {
        let n = 0;
        for (const l of [].concat(arg.logins || []).slice(0, 100)) { const u = findUser(this, l); if (u && !u.admin && !u.banned) { u.banned = true; u.online = false; n++; } }
        msg = `Заблокировано аккаунтов: ${n}.`; break;
      }
      case 'npc': this.db.npc = {}; msg = 'Лагеря и руины восстановлены.'; break;
      case 'reports': this.db.reports = (this.db.reports || []).filter((r) => r.owner !== target.id); msg = 'Отчёты очищены.'; break;
      case 'bugs': data = (this.db.bugs || []).slice(-50).reverse(); break;
      case 'bugsclear': this.db.bugs = []; msg = 'Список ошибок очищен.'; break;
      default: return { error: 'Неизвестная команда.' };
    }
    this.store.save();
    return { ok: true, msg, data };
  };
}

module.exports = { ADMIN_NICK, install };
