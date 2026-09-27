'use strict';
// «Кабинет» игрока, как в Android-клиенте «Третий Мир 3D»: профиль, репутация, друзья, земляки, поиск, блокнот,
// общий чат, Зал Славы (текущие топ-3 по категориям) и статистика боёв. Подключается к Game — см. install().

const C = require('./catalog');
const START_REP = 10; // стартовая репутация у всех игроков

// Залы Славы: категория → как считается; иконки — smallicon/bonus_status/<icon><gold|silver|bronze>.png клиента
const HALLS = {
  growth: { name: 'Развитие', icon: 'rang', desc: 'рейтинг развития замков' },
  loot: { name: 'Грабежи', icon: 'torba', desc: 'вынесено ресурсов в набегах и атаках' },
  doom: { name: 'Гибель', icon: 'Cross', desc: 'уничтожено вражеских войск (население)' },
  defense: { name: 'Защита', icon: 'medal', desc: 'уничтожено нападавших при обороне' },
  archaeology: { name: 'Археология', icon: 'coronal', desc: 'найдено артефактов' },
  rule: { name: 'Правление', icon: 'vesi', desc: 'репутация среди игроков' },
};
const PLACE_ICON = ['gold', 'silver', 'bronze'];

// подарки в профиле: игроки дарят друг другу за золото
const GIFTS = { diamond: { name: 'Большой диамант', img: 'gifts/diamond.jpg', gold: 3, premium: true } };
const GIFTS_DAY = 20;
const REP_PER_GOLD = 2; // 1 монета = 2 репутации // сколько подарков игрок может отправить за сутки

function install(Game) {
  const P = Game.prototype;

  P.stats = function stats(user) {
    if (!user.stats) user.stats = { loot: 0, kills: 0, defKills: 0, arts: 0 };
    return user.stats;
  };
  P.addStat = function addStat(userId, key, v) { const u = this.userById(userId); if (u && v > 0) { this.stats(u)[key] += Math.round(v); } };

  P.hallValue = function hallValue(u, hall) {
    const s = this.stats(u);
    switch (hall) {
      case 'growth': return this.userRating(u);
      case 'loot': return s.loot;
      case 'doom': return s.kills;
      case 'defense': return s.defKills;
      case 'archaeology': return s.arts;
      case 'rule': return u.reputation ?? START_REP;
      default: return 0;
    }
  };
  // текущие призёры каждого зала
  P.halls = function halls() { return this.cached('halls', 60000, () => this.hallsCalc()); }; // кэш 1 мин
  P.hallsCalc = function hallsCalc() {
    const users = Object.values(this.db.users);
    return Object.entries(HALLS).map(([id, h]) => {
      const top = users.map((u) => ({ id: u.id, login: u.login, value: this.hallValue(u, id) }))
        .filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 3);
      return { id, ...h, top };
    });
  };
  P.medalsOf = function medalsOf(userId) {
    const out = [];
    for (const h of this.halls()) h.top.forEach((x, i) => { if (x.id === userId) out.push({ hall: h.id, name: h.name, place: i + 1, icon: `smallicon/bonus_status/${h.icon}${PLACE_ICON[i] === 'silver' && h.icon === 'medal' ? 'siver' : PLACE_ICON[i]}.png` }); });
    return out;
  };

  // место в общем рейтинге
  P.rankOf = function rankOf(userId) {
    const rank = this.cached('rank', 15000, () => new Map(this.leaderboard().map((x, i) => [x.u.id, i + 1])));
    return rank.get(userId) || 0;
  };

  // полный профиль для окна «Профиль»
  P.sendGift = function sendGift(user, toId, giftId, text) {
    const g = GIFTS[giftId]; if (!g) return { error: 'Нет такого подарка.' };
    const to = this.userById(Number(toId)); if (!to) return { error: 'Игрок не найден.' };
    const now = Date.now();
    user.giftLog = (user.giftLog || []).filter((t) => t > now - 86400000);
    if (user.giftLog.length >= GIFTS_DAY) return { error: `Не больше ${GIFTS_DAY} подарков в сутки.` };
    if ((user.gold || 0) < g.gold) return { error: `Нужно ${g.gold} золота (у вас ${user.gold || 0}).` };
    user.gold -= g.gold; user.giftLog.push(now);
    (to.gifts = to.gifts || []).push({ gift: giftId, from: user.id, at: now, text: String(text || '').trim().slice(0, 100) });
    if (to.gifts.length > 200) to.gifts = to.gifts.slice(-200);
    if (to.id !== user.id) this.event(to.id, `${user.login} подарил Вам: ${g.name}!`);
    this.store.save();
    return { ok: true, msg: `Подарок «${g.name}» отправлен игроку ${to.login}.` };
  };
  P.profileOf = function profileOf(u, viewer) {
    const al = this.allianceOf(u);
    return {
      id: u.id, login: u.login, race: u.race, raceName: C.RACE_NAMES[u.race], created: u.created, lastSeen: u.id === viewer.id || viewer.admin ? u.lastSeen || u.created : null, // кто когда в игре — видно только себе и админу
      rating: this.userRating(u), rank: this.rankOf(u.id), reputation: u.reputation ?? START_REP,
      title: u.admin ? 'Администратор' : null,
      alliance: al ? { name: al.name, tag: al.tag, role: al.leader === u.id ? 'Глава' : 'Участник' } : null,
      medals: this.medalsOf(u.id),
      castles: this.castlesOf(u).map((k, i) => ({ id: k.id, name: k.name, x: k.x, y: k.y, capital: i === 0, rating: this.rating(k) })),
      self: u.id === viewer.id,
      friend: (viewer.friends || []).includes(u.id),
      repToday: ((viewer.repGiven || {})[u.id] || 0) > Date.now() - 86400000,
      about: u.about || '', avatar: u.avatar || 0, gold: u.id === viewer.id ? u.gold || 0 : undefined,
      gifts: (u.gifts || []).slice(-50).reverse().map((g) => ({ gift: g.gift, from: (this.userById(g.from) || { login: '—' }).login, fromId: g.from, at: g.at, text: g.text || '' })),
      online: u.id === viewer.id || viewer.admin ? !!u.online : false,
    };
  };

  // «Поднять Репутацию»: за золото, 1 монета = REP_PER_GOLD репутации
  P.giveReputation = function giveReputation(from, toId, coins) {
    const to = this.userById(Number(toId));
    if (!to) return { error: 'Игрок не найден.' };
    if (to.id === from.id) return { error: 'Себе репутацию поднять нельзя.' };
    coins = Math.floor(Number(coins));
    if (!(coins >= 1) || coins > 100000) return { error: 'Укажите количество монет.' };
    if ((from.gold || 0) < coins) return { error: `Не хватает золота (у вас ${from.gold || 0}).` };
    from.gold -= coins;
    const add = coins * REP_PER_GOLD;
    to.reputation = (to.reputation ?? START_REP) + add;
    this.cache = {};
    this.store.save();
    this.event(to.id, `${from.login} поднял вам репутацию на ${add}!`);
    return { ok: true, add, rep: to.reputation };
  };

  P.friendOp = function friendOp(user, op, id) {
    user.friends = user.friends || [];
    const other = this.userById(Number(id));
    if (!other) return { error: 'Игрок не найден.' };
    if (op === 'add') {
      if (other.id === user.id) return { error: 'Это вы.' };
      if (!user.friends.includes(other.id)) user.friends.push(other.id);
      this.event(other.id, `${user.login} добавил вас в друзья.`);
    } else user.friends = user.friends.filter((f) => f !== other.id);
    this.store.save();
    return { ok: true };
  };
  P.playerRow = function playerRow(u, from) {
    const c = this.castlesOf(u)[0]; // столица
    const row = { id: u.id, login: u.login, race: u.race, raceName: C.RACE_NAMES[u.race], rating: this.userRating(u), x: c.x, y: c.y };
    if (from) row.dist = Math.round(Math.hypot(c.x - from.x, c.y - from.y) * 10) / 10;
    return row;
  };
  P.friendsOf = function friendsOf(user) { return (user.friends || []).map((id) => this.userById(id)).filter(Boolean).map((u) => this.playerRow(u)); };
  P.searchPlayers = function searchPlayers(q) {
    q = String(q || '').trim().toLowerCase();
    const list = q ? Object.values(this.db.users).filter((u) => u.login.includes(q)) : this.leaderboard().slice(0, 30).map((x) => x.u);
    return list.slice(0, 30).map((u) => this.playerRow(u));
  };
  // земляки — игроки в радиусе от замка
  P.nearby = function nearby(user, radius = 25) { // земляки — по индексу карты вокруг замка
    const c = this.castleOf(user), seen = new Set([user.id]), out = [];
    for (let y = c.y - radius; y <= c.y + radius; y++) for (let x = c.x - radius; x <= c.x + radius; x++) {
      const k = this.castleAt(x, y); if (!k || seen.has(k.owner)) continue; seen.add(k.owner);
      const u = this.userById(k.owner); if (u) out.push(this.playerRow(u, c));
    }
    return out.filter((r) => r.dist <= radius).sort((a, b) => a.dist - b.dist).slice(0, 30);
  };

  // общий чат (последние 100 сообщений)
  P.chatPost = function chatPost(user, text) {
    text = String(text || '').trim().slice(0, 300);
    if (!text) return { error: 'Пустое сообщение.' };
    this.db.chat = this.db.chat || [];
    const m = { id: this.db.nextId++, from: user.login, fromId: user.id, text, at: Date.now() };
    this.db.chat.push(m);
    if (this.db.chat.length > 100) this.db.chat.splice(0, this.db.chat.length - 100);
    this.store.save();
    return { msg: m };
  };
  P.chatLog = function chatLog() { return (this.db.chat || []).slice(-50); };

  P.setNotes = function setNotes(user, text) { user.notes = String(text || '').slice(0, 5000); this.store.save(); return { ok: true }; };
  P.setAbout = function setAbout(user, text) { user.about = String(text || '').slice(0, 500); this.store.save(); return { ok: true }; };

  // рейтинги по разделам «Рейтинг»
  P.ratingCastles = function ratingCastles() { return this.cached('rc', 15000, () => this.ratingCastlesCalc()); };
  P.ratingCastlesCalc = function ratingCastlesCalc() {
    return Object.values(this.db.castles).map((c) => { const u = this.userById(c.owner); return { id: u.id, login: u.login, name: c.name, x: c.x, y: c.y, rating: this.rating(c) }; })
      .sort((a, b) => b.rating - a.rating).slice(0, 50);
  };
  P.ratingAlliances = function ratingAlliances() {
    return Object.values(this.db.alliances || {}).map((a) => ({ id: a.id, name: a.name, tag: a.tag, members: a.members.length,
      rating: a.members.reduce((s, id) => { const u = this.userById(id); return s + (u ? this.userRating(u) : 0); }, 0) }))
      .sort((a, b) => b.rating - a.rating);
  };
  P.ratingReputation = function ratingReputation() {
    return Object.values(this.db.users).map((u) => ({ id: u.id, login: u.login, raceName: C.RACE_NAMES[u.race], rating: u.reputation ?? START_REP }))
      .sort((a, b) => b.rating - a.rating).slice(0, 50);
  };
}

module.exports = { REP_PER_GOLD, GIFTS, install, HALLS };
