'use strict';
// «Пригласить друга» (Кабинет → Профиль, плитка в Кабинете): у каждого игрока своя ссылка на игру …/?ref=<код>.
// Друг открывает ссылку и регистрируется (web.js register → inviteBind) — в его аккаунте запоминается, кто пригласил.
// Два подарка (с 27.10), оба — письмом от Советника, монеты — через Казну; проверка inviteScan раз в 5 минут (index.js):
//  • рейтинг друга дошёл до INV.friendRating — сам друг получает INV.friendGold монет;
//  • рейтинг друга дошёл до INV.rating — пригласивший получает Премиум на INV.days дня и INV.gold монет.
// Пригласившему — не больше INV.perMonth подарков за календарный месяц (по Москве): сверх — подарок ждёт следующего месяца и приходит сам.
// Защита от мультов: друг играет с телефона пригласившего (общий id устройства, security.js) — подарков нет ни ему, ни за него;
// общий Wi‑Fi (семья) — не помеха. Заблокирован кто-то из двоих — подарки ждут. Кто пригласил, меняется только при регистрации.
const crypto = require('crypto');
const W = require('./words');

const INV = { rating: 1500, days: 3, gold: 5, perMonth: 10, friendRating: 1000, friendGold: 5 };
const DAY = 86400000;
const ABC = 'abcdefghijkmnpqrstuvwxyz23456789'; // без похожих 0/o и 1/l: код могут переписывать с экрана
const CODE_RE = /^[a-z0-9]{8}$/;
const newCode = () => Array.from({ length: 8 }, () => ABC[crypto.randomInt(ABC.length)]).join('');
const monthKey = (t) => new Date(t + 3 * 3600000).toISOString().slice(0, 7); // календарный месяц по Москве
const fmt = (n) => n.toLocaleString('ru-RU');

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
  // чья ссылка; боты, «Ничейные земли» и заблокированные не приглашают
  P.inviteWho = function inviteWho(code) {
    code = String(code || '').toLowerCase(); if (!CODE_RE.test(code)) return null;
    const id = (this.db.invCodes || {})[code], u = id && this.userById(id);
    return u && !u.bot && !u.nobody && this.banExpired(u) ? u : null;
  };
  // форма регистрации (до входа): «Вас пригласил …» и подарок новичку за рейтинг
  P.inviteRef = function inviteRef(code) { const u = this.inviteWho(code); return { nick: u ? u.login : '', need: INV.friendRating, gold: INV.friendGold }; };
  // регистрация по ссылке (после trackLogin — устройство нового игрока уже записано): с телефона пригласившего — сразу «без подарков»
  P.inviteBind = function inviteBind(user, code, now = Date.now()) {
    const by = this.inviteWho(code); if (!by || by === user || user.invBy) return null;
    user.invBy = by.id; user.invAt = now;
    if (this.sameDevice(by, user)) user.invSame = 1;
    this.store.save();
    return by;
  };
  const giftsThisMonth = (by, now) => { const mk = monthKey(now); return (by.invGot || []).filter((x) => monthKey(x.at) === mk).length; };
  const giftText = () => `Премиум на ${W.num(INV.days, 'день', 'дня', 'дней')} и ${W.coins(INV.gold)}`;
  const mail = (g, to, subject, msg) => { const adm = g.adminUser ? g.adminUser() : null; if (adm && adm !== to) g.sendMail(adm, to.login, subject, msg); g.event(to.id, `🎁 ${msg}`); };
  // подарок самому другу за рейтинг INV.friendRating: монеты — через Казну
  P.inviteSelfGive = function inviteSelfGive(u, by, now = Date.now()) {
    this.goldChange(u, INV.friendGold, `Подарок за развитие: рейтинг ${fmt(INV.friendRating)} (по приглашению ${by.login})`);
    u.invSelf = now;
    mail(this, u, `Подарок за развитие: ${W.coins(INV.friendGold)}`,
      `Ваш рейтинг дошёл до ${fmt(INV.friendRating)} — вы отлично развиваетесь! Вас пригласил в игру ${by.login}, и вам за это подарок — ${W.coins(INV.friendGold)}.`);
  };
  // подарок пригласившему за рейтинг друга INV.rating: Премиум (продлевает текущий) и монеты — через Казну
  P.inviteGive = function inviteGive(by, u, now = Date.now()) {
    by.premium = Math.max(by.premium || 0, now) + INV.days * DAY;
    this.goldChange(by, INV.gold, `Подарок за приглашённого друга ${u.login}`);
    (by.invGot = by.invGot || []).push({ at: now, id: u.id }); if (by.invGot.length > 50) by.invGot.shift();
    u.invGift = now; delete u.invCap;
    mail(this, by, `Подарок за друга: ${giftText()}`,
      `Ваш друг ${u.login} развился: его рейтинг дошёл до ${fmt(INV.rating)}. Спасибо, что пригласили его в Средневековье! В подарок — ${giftText()}.`);
  };
  // раз в 5 минут (index.js): подарки другу (рейтинг INV.friendRating) и пригласившему (рейтинг друга INV.rating)
  P.inviteScan = function inviteScan(now = Date.now()) {
    let n = 0;
    for (const u of Object.values(this.db.users)) {
      if (!u.invBy || u.invSame || u.invGone || (u.invGift && u.invSelf)) continue;
      const by = this.userById(u.invBy);
      if (!by) { u.invGone = 1; n++; continue; } // пригласивший удалён — подарков нет
      if (this.sameDevice(by, u)) { u.invSame = 1; n++; continue; } // друг зашёл с телефона пригласившего — мульт: подарков нет
      const r = this.userRating(u);
      if (r < INV.friendRating || !this.banExpired(by) || !this.banExpired(u)) continue; // заблокирован кто-то из двоих — подарки ждут
      if (!u.invSelf) { this.inviteSelfGive(u, by, now); n++; }
      if (u.invGift || r < INV.rating) continue;
      if (giftsThisMonth(by, now) >= INV.perMonth) { if (u.invCap !== monthKey(now)) { u.invCap = monthKey(now); n++; } continue; } // лимит месяца
      this.inviteGive(by, u, now); n++;
    }
    if (n) this.store.save();
    return n;
  };
  // окно «Пригласить друга»: код ссылки, условия, сколько подарков в этом месяце, приглашённые и их рейтинг;
  // me — если самого игрока пригласили: кто и получен ли его подарок
  P.inviteView = function inviteView(user, now = Date.now()) {
    const code = this.inviteCode(user);
    const list = Object.values(this.db.users).filter((u) => u.invBy === user.id).sort((a, b) => (b.invAt || 0) - (a.invAt || 0)).slice(0, 100)
      .map((u) => ({ nick: u.login, at: u.invAt || 0, rating: Math.floor(this.userRating(u)), giftAt: u.invGift || 0,
        st: u.invGift ? 'gift' : u.invSame ? 'same' : u.invCap ? 'cap' : 'wait' }));
    const by = user.invBy && this.userById(user.invBy);
    const me = by ? { by: by.login, got: user.invSelf || 0, same: !!user.invSame, rating: Math.floor(this.userRating(user)) } : null;
    return { code, ...INV, month: giftsThisMonth(user, now), list, me };
  };
}

module.exports = { install, INV };
