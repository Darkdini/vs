'use strict';
// «Закрытый тест»: пока режим включён, в игру входят только админ и тестеры, регистрация закрыта.
// Тестеров создаёт админ (Админ-панель → 🧪 Тест): логин и пароль генерирует сервер и показывает админу один раз,
// в базе — только хэш пароля (как у всех). Тестера можно отключить, сбросить ему пароль или снять отметку.
// Обычный игрок, у которого уже есть аккаунт, при включённом режиме не войдёт, а открытые сессии закрываются (web.js).
const crypto = require('crypto');
const fs = require('fs');
const C = require('./catalog');
// «Закрыть игру» (технические работы; Админка, вверху): игрокам — заглушка «сервер временно не работает», входит только администратор.
// Закрывается на 8 или 24 часа — потом игра открывается сама (index.js → maintCheck), раньше — кнопкой «Открыть игру сейчас».
// Регистрация закрыта, открытые сессии игроков закрываются, экран входа у всех сразу меняется на заглушку (web.js).
// Мир при этом идёт как обычно: армии в пути дойдут, ресурсы растут. Для долгой остановки — выключить сервер (systemctl stop war)
// Время возвращения игрокам не пишется. Запуск сразу с закрытой игрой — файл maint.on рядом с базой (index.js → maintBoot)
const MAINT_TEXT = 'Сервер временно не работает. Идут технические работы — зайдите немного позже.';
const MAINT_HOURS = [8, 24], HOUR = 3600000;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789'; // без похожих символов (l/1, o/0): пароль удобно продиктовать
const gen = (n) => Array.from(crypto.randomBytes(n), (b) => ABC[b % ABC.length]).join('');

function install(Game) {
  const P = Game.prototype;
  P.closedOn = function closedOn() { return !!this.db.closedTest; };
  // закрыта, пока не вышел срок (until); без срока — закрыта прежней версией, до кнопки «Открыть игру сейчас»
  P.maintOn = function maintOn(now = Date.now()) { const m = this.db.maint; return !!(m && m.on && (!m.until || now < m.until)); };
  P.maintMsg = function maintMsg() { return MAINT_TEXT; };
  P.maintView = function maintView() { const m = this.db.maint || {}, on = this.maintOn(); return { on, at: m.at || 0, until: on ? m.until || 0 : 0, hours: MAINT_HOURS, msg: this.maintMsg() }; };
  // закрыть на hours часов (0 — открыть); уже закрытая — «закрыта с» прежнее, срок — от сейчас
  P.maintSet = function maintSet(hours, by, now = Date.now()) {
    this.db.maint = hours ? { on: true, at: this.maintOn(now) ? this.db.maint.at : now, by, until: now + hours * HOUR } : { on: false, at: now, by };
  };
  // раз в секунду (index.js): срок вышел — игра открывается сама; true — разослать всем (web.js maintCast)
  P.maintCheck = function maintCheck(now = Date.now()) {
    const m = this.db.maint; if (!m || !m.on || !m.until || now < m.until) return false;
    this.maintSet(0, 'срок', now); this.store.save(); return true;
  };
  // при запуске сервера: есть файл maint.on (echo 8 или echo 24 > /opt/war/game-data/maint.on) — игра закрыта с первой секунды
  // на столько часов (пустой файл — на 8), игроки не успеют войти; файл удаляется
  P.maintBoot = function maintBoot(file, now = Date.now()) {
    if (!fs.existsSync(file)) return 0;
    let h = 0; try { h = parseInt(fs.readFileSync(file, 'utf8'), 10); } catch { /* не прочитать — 8 часов */ }
    if (!MAINT_HOURS.includes(h)) h = MAINT_HOURS[0];
    this.maintSet(h, 'maint.on', now); this.store.flush();
    try { fs.unlinkSync(file); } catch (e) { console.error(`Не удалось удалить ${file} (${e.message}) — удалите вручную, иначе игра будет закрываться при каждом запуске`); }
    return h;
  };
  // можно ли войти: режим выключен, или админ, или действующий тестер
  P.closedAllows = function closedAllows(u) { return !this.closedOn() || !!(u && (u.admin || (u.tester && !u.testerOff))); };
  P.closedView = function closedView() {
    const list = Object.values(this.db.users).filter((u) => u.tester).map((u) => ({ login: u.login, acct: u.acct, race: C.RACE_NAMES[u.race] || u.race, off: !!u.testerOff,
      online: !!u.online, created: u.created, lastSeen: u.lastSeen || 0, note: u.testerNote || '' })).sort((a, b) => b.created - a.created);
    return { on: this.closedOn(), list };
  };
  // новый тестер: логин test_xxxx (или свой), ник — свой или как логин, пароль — случайный (возвращается один раз, в базе — хэш)
  P.testerCreate = function testerCreate({ acct, nick, race, note } = {}) {
    nick = String(nick || '').trim(); note = String(note || '').replace(/[<>]/g, '').trim().slice(0, 60);
    acct = String(acct || '').trim().toLowerCase();
    if (!acct) { do acct = `test_${gen(4)}`; while (this.db.accts[acct]); }
    const pass = gen(10);
    const r = this.register({ login: acct, nick: nick || acct.replace(/[^a-zа-яё0-9_]/gi, '').slice(0, 10), password: pass, race: Number(race) || 0 });
    if (r.error) return r;
    r.user.tester = true; r.user.testerNote = note; this.store.save();
    return { acct, nick: r.user.login, pass };
  };
  const findTester = (g, login) => { const l = String(login || '').trim().toLowerCase(); return Object.values(g.db.users).find((u) => u.tester && (u.login.toLowerCase() === l || u.acct === l)); };
  // команды админ-панели: test… (остальное — admin.js)
  const prev = P.adminOp;
  P.adminOp = function adminOp(user, op, arg = {}) {
    if (op === 'maint') { // закрыть игру: on=1 и hours — 8 или 24; on=0 — открыть; без on — только показать
      if (!user || !user.admin) return { error: 'Нет прав.' };
      if (arg.on !== undefined) {
        const h = Number(arg.on) ? Number(arg.hours) : 0;
        if (Number(arg.on) && !MAINT_HOURS.includes(h)) return { error: 'Закрыть игру можно на 8 или на 24 часа.' };
        this.maintSet(h, user.login); this.store.save();
      }
      return { data: this.maintView() };
    }
    if (!String(op || '').startsWith('test')) return prev.call(this, user, op, arg);
    if (!user || !user.admin) return { error: 'Нет прав.' };
    const db = this.db;
    switch (op) {
      case 'testview': return { data: this.closedView() };
      case 'testmode': db.closedTest = !!arg.on; this.store.save();
        return { data: { ...this.closedView(), msg: db.closedTest ? 'Закрытый тест включён: входят только тестеры и админ, регистрация закрыта.' : 'Закрытый тест выключен: игра открыта для всех.' } };
      case 'testadd': { const r = this.testerCreate(arg); if (r.error) return r; return { data: { ...this.closedView(), created: r, msg: `Тестер создан: ${r.nick}` } }; }
      case 'testpass': { // новый пароль тестеру (старый перестаёт работать, все его входы завершаются)
        const u = findTester(this, arg.login); if (!u) return { error: 'Тестер не найден.' };
        const pass = gen(10); this.setPasswordReset(u, pass, arg.ip || '');
        return { data: { ...this.closedView(), created: { acct: u.acct, nick: u.login, pass }, msg: `Новый пароль для ${u.login}` }, kick: u.id };
      }
      case 'testoff': case 'teston': { // временно отключить доступ / вернуть
        const u = findTester(this, arg.login); if (!u) return { error: 'Тестер не найден.' };
        if (op === 'testoff') u.testerOff = true; else delete u.testerOff;
        this.store.save();
        return { data: { ...this.closedView(), msg: `${u.login}: доступ ${op === 'testoff' ? 'отключён' : 'включён'}.` } };
      }
      case 'testmark': { // сделать тестером уже существующего игрока (по нику) или снять отметку
        const u = this.db.users[String(arg.login || '').trim()] || Object.values(db.users).find((x) => x.login.toLowerCase() === String(arg.login || '').trim().toLowerCase());
        if (!u || u.bot) return { error: 'Игрок не найден.' };
        if (u.admin) return { error: 'Админ входит и так.' };
        if (arg.on) { u.tester = true; delete u.testerOff; } else { delete u.tester; delete u.testerOff; }
        this.store.save();
        return { data: { ...this.closedView(), msg: `${u.login}: ${arg.on ? 'теперь тестер' : 'больше не тестер'}.` } };
      }
      default: return { error: 'Неизвестная команда.' };
    }
  };
}

module.exports = { install };
