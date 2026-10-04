'use strict';
// «Старший модератор»: помощник администратора — следит за порядком и за модераторами, экономику игры не трогает.
// Назначает и снимает только администратор (админ-панель → игрок → «Старший модератор»).
// Может: всё, что модератор (чат, форумы, новости — комментарии), плюс назначать/снимать модераторов, запрет в чате модераторам,
// блокировка аккаунта на 1/3/7 дней с причиной, «Нарушения», сброс ника / названий замков / аватара, переименование альянса и сброс описания,
// публикация новостей, просмотр журнала мультов и сведений об игроке (ники, входы, IP), журнал модерации.
// НЕ может: золото, премиум, ресурсы, войска, замки, босс, вечная блокировка. Администратора — ни наказать, ни посмотреть:
// он не виден в журнале мультов, в списках и в сведениях; любое действие над ним отклоняется. Другого старшего модератора — тоже нельзя.

const BAN_DAYS = [1, 3, 7], LOG_KEEP = 500;
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

function install(Game) {
  const P = Game.prototype;
  P.modLog = function modLog(by, op, target, text) { log(this, by, op, target, text); }; // запись в журнал модерации (и из чата, форума)
  P.isSmod = function isSmod(u) { return !!(u && (u.admin || u.smod)); };
  const log = (g, by, op, target, text) => { const l = g.db.modLog = g.db.modLog || []; l.push({ at: Date.now(), by: by.login, op, target: target || '', text: text || '' }); if (l.length > LOG_KEEP) l.splice(0, l.length - LOG_KEEP); };
  // цель действия: игрок есть, не администратор (никогда), не старший модератор (если действует не админ), не сам себе
  const victim = (g, me, login) => {
    const t = g.db.users[String(login || '').trim()];
    if (!t || t.bot) return { error: 'Игрок не найден.' };
    if (t.admin) return { error: 'Администратора нельзя ни наказать, ни посмотреть.' };
    if (t.smod && !me.admin) return { error: 'Старшего модератора может наказать только администратор.' };
    if (t.id === me.id) return { error: 'Это Вы.' };
    return { t };
  };
  // временная блокировка истекла — снимается при входе
  P.banExpired = function banExpired(u, now = Date.now()) { if (u.banned && u.banUntil && u.banUntil <= now) { u.banned = false; delete u.banUntil; delete u.banWhy; this.store.save(); } return !u.banned; };

  P.smodView = function smodView(me) {
    if (!this.isSmod(me)) return { error: 'Нет прав.' };
    const users = Object.values(this.db.users).filter((u) => !u.bot && !u.admin);
    // журнал мультов без администратора: его в группах не видно; группа из одного игрока не показывается
    const multis = (this.multis ? this.multis() : []).map((g) => ({ kind: g.kind, key: g.kind === 'ip' ? g.key : g.key, users: g.users.filter((x) => !x.admin) })).filter((g) => g.users.length > 1).slice(0, 60);
    return {
      mods: users.filter((u) => u.mod && !u.smod).map((u) => ({ login: u.login, online: !!u.online })),
      smods: users.filter((u) => u.smod).map((u) => ({ login: u.login, online: !!u.online })),
      banned: users.filter((u) => u.banned).map((u) => ({ login: u.login, until: u.banUntil || 0, why: u.banWhy || '' })),
      chatBanned: users.filter((u) => u.chatBan === -1 || u.chatBan > Date.now()).map((u) => ({ login: u.login, until: u.chatBan })),
      multis, log: (this.db.modLog || []).slice(-80).reverse(), banDays: BAN_DAYS,
    };
  };
  P.smodPlayer = function smodPlayer(me, login) {
    if (!this.isSmod(me)) return { error: 'Нет прав.' };
    const v = victim(this, me, login); if (v.error && !/Это Вы/.test(v.error)) return v;
    const t = v.t || me, al = this.allianceOf(t);
    return { id: t.id, login: t.login, race: t.race, created: t.created, lastSeen: t.lastSeen || t.created, online: !!t.online, mod: !!t.mod, smod: !!t.smod,
      banned: !!t.banned, banUntil: t.banUntil || 0, banWhy: t.banWhy || '', chatBan: t.chatBan || 0, forumBan: t.forumBan || 0, violations: t.violations || 0,
      alliance: al ? { id: al.id, tag: al.tag, name: al.name } : null, avatar: t.avatar || 0, nickLog: (t.nickLog || []).slice(-10).reverse(),
      ips: (t.ips || []).slice(-5).reverse().map((x) => ({ ip: x.ip, at: x.at })), castles: this.castlesOf(t).map((c) => ({ name: c.name, x: c.x, y: c.y, rating: this.rating(c) })) };
  };

  P.smodOp = function smodOp(me, m) {
    if (!this.isSmod(me)) return { error: 'Нет прав.' };
    const op = String(m.op || '');
    if (op === 'allyname' || op === 'allydesc') {
      const A = this.db.alliances || {}, q = String(m.id || '').trim().toUpperCase(), al = A[Number(q)] || Object.values(A).find((x) => x.tag === q); if (!al) return { error: 'Альянс не найден (тег или номер).' };
      if (op === 'allydesc') { al.desc = ''; al.charter = ''; al.ad = ''; log(this, me, op, `[${al.tag}]`, 'описание сброшено'); this.store.save(); return { msg: `[${al.tag}]: описание и устав сброшены.` }; }
      const tag = clean(m.tag, 5).toUpperCase(), name = clean(m.name, 24);
      if (tag.length < 2 || name.length < 3) return { error: 'Тег — 2–5 символов, название — от 3.' };
      if (Object.values(this.db.alliances).some((a) => a !== al && (a.tag === tag || a.name.toLowerCase() === name.toLowerCase()))) return { error: 'Такой тег или название уже заняты.' };
      log(this, me, op, `[${al.tag}] ${al.name}`, `→ [${tag}] ${name}`); al.tag = tag; al.name = name; this.cache = {}; this.store.save();
      return { msg: `Альянс переименован: [${tag}] ${name}.` };
    }
    const v = victim(this, me, m.login); if (v.error) return v; const t = v.t;
    switch (op) {
      case 'mod': { // назначить / снять модератора (старшего — только администратор)
        const on = !!Number(m.on); t.mod = on; if (!on) t.smod = false;
        this.event(t.id, on ? 'Вас назначили модератором.' : 'Вы больше не модератор.'); log(this, me, op, t.login, on ? 'назначен модератором' : 'снят с модераторов');
        this.store.save(); return { msg: `${t.login} — ${on ? 'модератор' : 'больше не модератор'}.` };
      }
      case 'ban': {
        const d = Number(m.days); if (!BAN_DAYS.includes(d)) return { error: 'Блокировка — на 1, 3 или 7 дней.' };
        const why = clean(m.why, 120); if (why.length < 3) return { error: 'Укажите причину.' };
        if (t.banned && !t.banUntil) return { error: 'Игрок заблокирован администратором навсегда.' };
        t.banned = true; t.banUntil = Date.now() + d * 86400000; t.banWhy = why; t.banBy = me.login; t.online = false; t.violations = (t.violations || 0) + 1;
        log(this, me, op, t.login, `на ${d} дн.: ${why}`); this.store.save(); return { msg: `${t.login} заблокирован на ${d} дн.`, kick: t.id };
      }
      case 'unban': {
        if (!t.banned) return { error: 'Игрок не заблокирован.' };
        if (!t.banUntil && !me.admin) return { error: 'Вечную блокировку снимает только администратор.' };
        t.banned = false; delete t.banUntil; delete t.banWhy; log(this, me, op, t.login, 'разблокирован'); this.store.save(); return { msg: `${t.login} разблокирован.` };
      }
      case 'chat': { // запрет в чате (в т. ч. модератору); часы, 0 — снять
        const h = Number(m.hours); if (!Number.isFinite(h) || h < 0 || h > 24 * 30) return { error: 'Срок — от 0 до 720 часов.' };
        t.chatBan = h === 0 ? 0 : Date.now() + h * 3600000; if (h) t.violations = (t.violations || 0) + 1;
        this.event(t.id, h ? `Вам запрещено писать в чат на ${h} ч. (старший модератор ${me.login}).` : 'Запрет в чате снят.');
        log(this, me, op, t.login, h ? `чат на ${h} ч.` : 'запрет в чате снят'); this.store.save(); return { msg: h ? `${t.login}: запрет в чате на ${h} ч.` : `${t.login}: запрет в чате снят.` };
      }
      case 'viol': {
        const n = Math.max(0, (t.violations || 0) + (Number(m.d) > 0 ? 1 : -1)); t.violations = n;
        log(this, me, op, t.login, `нарушений: ${n}`); this.store.save(); return { msg: `${t.login}: нарушений ${n}.` };
      }
      case 'nick': { // сброс неприличного ника на «ИгрокN»
        let nick = `Игрок${t.id % 100000}`; for (let k = 1; Object.prototype.hasOwnProperty.call(this.db.users, nick); k++) nick = `Игрок${(t.id + k) % 100000}`;
        const old = t.login; (t.nickLog = t.nickLog || []).push({ at: Date.now(), from: old, to: nick, by: me.login });
        delete this.db.users[old]; this.db.users[nick] = t; this.db.accts[t.acct] = nick; t.login = nick; this.cache = {};
        this.event(t.id, `Ваш ник сброшен модерацией: ${old} → ${nick}. Вход — по прежнему логину.`);
        log(this, me, op, old, `ник сброшен → ${nick}`); this.store.save(); return { msg: `Ник сброшен: ${old} → ${nick}.` };
      }
      case 'castles': { // названия и описания замков — по умолчанию
        const cs = this.castlesOf(t); cs.forEach((c, i) => { c.name = i ? `Замок ${t.login} ${i + 1}` : `Замок ${t.login}`; c.desc = ''; }); this.cache = {};
        log(this, me, op, t.login, `названия замков сброшены (${cs.length})`); this.store.save(); return { msg: `${t.login}: названия замков сброшены.` };
      }
      case 'avatar': {
        if (!t.avatar) return { error: 'У игрока нет аватарки.' };
        this.removeAvatar(t); log(this, me, op, t.login, 'аватар удалён'); return { msg: `${t.login}: аватар удалён.` };
      }
      default: return { error: 'Неизвестное действие.' };
    }
  };
}

module.exports = { install, BAN_DAYS };
