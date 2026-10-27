'use strict';
// «Пригласить друга» (Кабинет → Профиль, плитка в Кабинете): у каждого игрока своя ссылка на игру …/?ref=<код>.
// Друг открывает ссылку и регистрируется (web.js register → inviteBind) — в его аккаунте запоминается, кто пригласил.
// Когда рейтинг друга дойдёт до INV.rating, пригласивший получает подарок: Премиум на INV.days дня и INV.gold монет
// (письмо от Советника, inviteScan раз в 5 минут — index.js). Не больше INV.perMonth подарков за календарный месяц (по Москве):
// сверх — подарок ждёт следующего месяца и приходит сам. Приглашённый сверх обычного подарка новичку ничего не получает.
// Защита от мультов: друг играет с телефона пригласившего (общий id устройства, security.js) — подарка за него нет;
// общий Wi‑Fi (семья) — не помеха. Друга, которого пригласили, сменить нельзя: только при регистрации.
const crypto = require('crypto');
const W = require('./words');

const INV = { rating: 1000, days: 3, gold: 5, perMonth: 10 };
const DAY = 86400000;
const ABC = 'abcdefghijkmnpqrstuvwxyz23456789'; // без похожих 0/o и 1/l: код могут переписывать с экрана
const CODE_RE = /^[a-z0-9]{8}$/;
const newCode = () => Array.from({ length: 8 }, () => ABC[crypto.randomInt(ABC.length)]).join('');
const monthKey = (t) => new Date(t + 3 * 3600000).toISOString().slice(0, 7); // календарный месяц по Москве

function install(Game) {
  const P = Game.prototype;
  // код ссылки игрока: создаётся при первом открытии окна и дальше не меняется
  P.inviteCode = function inviteCode(user) {
    const codes = (this.db.invCodes = this.db.invCodes || {});
    if (user.invCode && codes[user.invCode] === user.id) return user.invCode;
    let code = newCode(); while (codes[code]) code = newCode();
    codes[code] = user.id; user.invCode = code; this.store.save();
    return code;
  };
  // чья ссылка (форма регистрации: «Вас пригласил …»); боты, «Ничейные земли» и заблокированные не приглашают
  P.inviteWho = function inviteWho(code) {
    code = String(code || '').toLowerCase(); if (!CODE_RE.test(code)) return null;
    const id = (this.db.invCodes || {})[code], u = id && this.userById(id);
    return u && !u.bot && !u.nobody && this.banExpired(u) ? u : null;
  };
  // регистрация по ссылке (после trackLogin — устройство нового игрока уже записано): с телефона пригласившего — сразу «без подарка»
  P.inviteBind = function inviteBind(user, code, now = Date.now()) {
    const by = this.inviteWho(code); if (!by || by === user || user.invBy) return null;
    user.invBy = by.id; user.invAt = now;
    if (this.sameDevice(by, user)) user.invSame = 1;
    this.store.save();
    return by;
  };
  const giftsThisMonth = (by, now) => { const mk = monthKey(now); return (by.invGot || []).filter((x) => monthKey(x.at) === mk).length; };
  const giftText = () => `Премиум на ${W.num(INV.days, 'день', 'дня', 'дней')} и ${W.coins(INV.gold)}`;
  // подарок пригласившему: Премиум (продлевает текущий) и монеты — через Казну; письмо от Советника и уведомление
  P.inviteGive = function inviteGive(by, u, now = Date.now()) {
    by.premium = Math.max(by.premium || 0, now) + INV.days * DAY;
    this.goldChange(by, INV.gold, `Подарок за приглашённого друга ${u.login}`);
    (by.invGot = by.invGot || []).push({ at: now, id: u.id }); if (by.invGot.length > 50) by.invGot.shift();
    u.invGift = now; delete u.invCap;
    const msg = `Ваш друг ${u.login} развился: его рейтинг дошёл до ${INV.rating.toLocaleString('ru-RU')}. Спасибо, что пригласили его в Средневековье! В подарок — ${giftText()}.`;
    const adm = this.adminUser ? this.adminUser() : null;
    if (adm && adm !== by) this.sendMail(adm, by.login, `Подарок за друга: ${giftText()}`, msg);
    this.event(by.id, `🎁 ${msg}`);
  };
  // раз в 5 минут (index.js): друзья, дошедшие до рейтинга INV.rating, — подарок пригласившему
  P.inviteScan = function inviteScan(now = Date.now()) {
    let n = 0;
    for (const u of Object.values(this.db.users)) {
      if (!u.invBy || u.invGift || u.invSame || u.invGone) continue;
      const by = this.userById(u.invBy);
      if (!by) { u.invGone = 1; n++; continue; } // пригласивший удалён — подарка не будет
      if (this.sameDevice(by, u)) { u.invSame = 1; n++; continue; } // друг зашёл с телефона пригласившего — мульт
      if (this.userRating(u) < INV.rating) continue;
      if (!this.banExpired(by) || !this.banExpired(u)) continue; // заблокирован кто-то из двоих — подарок ждёт
      if (giftsThisMonth(by, now) >= INV.perMonth) { if (u.invCap !== monthKey(now)) { u.invCap = monthKey(now); n++; } continue; } // лимит месяца
      this.inviteGive(by, u, now); n++;
    }
    if (n) this.store.save();
    return n;
  };
  // окно «Пригласить друга»: код ссылки, условия, сколько подарков в этом месяце, приглашённые и их рейтинг
  P.inviteView = function inviteView(user, now = Date.now()) {
    const code = this.inviteCode(user);
    const list = Object.values(this.db.users).filter((u) => u.invBy === user.id).sort((a, b) => (b.invAt || 0) - (a.invAt || 0)).slice(0, 100)
      .map((u) => ({ nick: u.login, at: u.invAt || 0, rating: Math.floor(this.userRating(u)), giftAt: u.invGift || 0,
        st: u.invGift ? 'gift' : u.invSame ? 'same' : u.invCap ? 'cap' : 'wait' }));
    return { code, ...INV, month: giftsThisMonth(user, now), list };
  };
}

module.exports = { install, INV };
