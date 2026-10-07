'use strict';
// «Закрытый тест»: пока режим включён, в игру входят только админ и тестеры, регистрация закрыта.
// Тестеров создаёт админ (Админ-панель → 🧪 Тест): логин и пароль генерирует сервер и показывает админу один раз,
// в базе — только хэш пароля (как у всех). Тестера можно отключить, сбросить ему пароль или снять отметку.
// Обычный игрок, у которого уже есть аккаунт, при включённом режиме не войдёт, а открытые сессии закрываются (web.js).
const crypto = require('crypto');
const C = require('./catalog');
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789'; // без похожих символов (l/1, o/0): пароль удобно продиктовать
const gen = (n) => Array.from(crypto.randomBytes(n), (b) => ABC[b % ABC.length]).join('');

function install(Game) {
  const P = Game.prototype;
  P.closedOn = function closedOn() { return !!this.db.closedTest; };
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
