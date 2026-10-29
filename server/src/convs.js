'use strict';
// «Беседы» в «Сообщениях» (с 29.10): групповая переписка — до 15 человек вместе с создателем.
// Создать — с рейтингом от 300 (social.js talkLow; админ, модераторы и тестеры — всегда), своих бесед — не больше 5,
// всего бесед у игрока — не больше 15. Приглашает только создатель, по нику; приглашённый сам вступает или отказывается —
// без спроса никого не добавляют (чёрный список и «кто пишет мне» — privacy.js canReach, как для личных сообщений).
// Пишут все участники: текст (мат — звёздочками, кому закрыт чат — не пишет) и фото на 2 часа (pics.js picBeginConv).
// Выйти может любой; вышел создатель — беседа переходит к тому, кто в ней дольше всех; никого не осталось — она удаляется.
// Создатель ещё переименовывает, исключает, отзывает приглашения и удаляет беседу. «В игре» ли участники — не показывается.
const { censorMat } = require('./matfilter');

const MAX_MEMBERS = 15, OWN_MAX = 5, IN_MAX = 15, TITLE_MAX = 40, TEXT_MAX = 1000, MSGS_KEEP = 500, SHOW = 60;

function install(Game) {
  const P = Game.prototype;
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const cleanText = (s) => String(s || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, TEXT_MAX);
  const muted = (u) => u.chatBan === -1 || u.chatBan > Date.now();
  const mutedMsg = (u) => (u.chatBan === -1 ? 'Вам запрещено писать в чат навсегда — и в беседах тоже.' : `Вам запрещено писать в чат ещё ${Math.ceil((u.chatBan - Date.now()) / 60000)} мин — и в беседах тоже.`);

  // db.convs = { next, list: { [id]: { id, title, owner, members: [uid], joined: { uid: at }, invites: [{ uid, by, at }],
  //   msgs: [{ id, by (0 — служебное), at, text, pic, picExp, w, h, picGone }], read: { uid: номер последнего прочитанного }, at, created } } }
  P.convDb = function convDb() { return (this.db.convs = this.db.convs || { next: 1, list: {} }); };
  P.convGet = function convGet(id) { return Object.prototype.hasOwnProperty.call(this.convDb().list, String(id)) ? this.convDb().list[String(id)] : null; };
  const isMember = (c, u) => !!c && c.members.includes(u.id);
  const userByNick = (g, nick) => {
    const k = String(nick || '').trim(); if (!k) return null;
    const exact = Object.prototype.hasOwnProperty.call(g.db.users, k) ? g.db.users[k] : null;
    return exact || Object.values(g.db.users).find((x) => x.login.toLowerCase() === k.toLowerCase()) || null;
  };
  const sys = (g, c, text) => push(g, c, { by: 0, text });
  const push = (g, c, m) => {
    const msg = { id: g.convDb().next++, at: Date.now(), ...m };
    c.msgs.push(msg); c.at = msg.at;
    if (c.msgs.length > MSGS_KEEP) for (const x of c.msgs.splice(0, c.msgs.length - MSGS_KEEP)) if (x.pic && g.picDrop) g.picDrop(x.pic);
    return msg;
  };
  const drop = (g, c) => { for (const x of c.msgs) if (x.pic && g.picDrop) g.picDrop(x.pic); delete g.convDb().list[c.id]; };
  const memberOf = (g, u) => Object.values(g.convDb().list).filter((c) => c.members.includes(u.id));
  const login = (g, id) => (g.userById(id) || {}).login || '—';
  // ушёл участник (вышел, исключён, удалён): создатель — следующему по стажу, никого — беседа удаляется
  const removeMember = (g, c, uid) => {
    c.members = c.members.filter((x) => x !== uid); delete c.read[uid]; delete c.joined[uid];
    if (!c.members.length) { drop(g, c); return 'gone'; }
    if (c.owner === uid) {
      c.owner = [...c.members].sort((a, b) => (c.joined[a] || 0) - (c.joined[b] || 0))[0]; // приглашения остаются — отозвать их может новый создатель
      sys(g, c, `Беседа перешла к ${login(g, c.owner)}.`);
      return 'owner';
    }
    return 'left';
  };

  P.convCreate = function convCreate(u, title) {
    if (!u || u.bot) return { error: 'Нельзя.' };
    if (this.talkLow && this.talkLow(u)) return { error: this.talkLowMsg(u, 'Создавать беседы') };
    const t = censorMat(clean(title, TITLE_MAX)); if (!t) return { error: 'Назовите беседу.' };
    const mine = memberOf(this, u);
    if (mine.filter((c) => c.owner === u.id).length >= OWN_MAX) return { error: `Своих бесед — не больше ${OWN_MAX}. Удалите ненужную или выйдите из неё.` };
    if (mine.length >= IN_MAX) return { error: `Бесед у игрока — не больше ${IN_MAX}.` };
    const D = this.convDb(), now = Date.now(), id = D.next++;
    const c = { id, title: t, owner: u.id, members: [u.id], joined: { [u.id]: now }, invites: [], msgs: [], read: {}, at: now, created: now };
    D.list[id] = c;
    const m = sys(this, c, `${u.login} создал(а) беседу «${t}».`); c.read[u.id] = m.id;
    this.store.save(); return { ok: true, conv: c };
  };
  P.convInvite = function convInvite(u, id, nick) {
    const c = this.convGet(id); if (!c || !isMember(c, u)) return { error: 'Беседа не найдена.' };
    if (c.owner !== u.id) return { error: 'Приглашать может только создатель беседы.' };
    const t = userByNick(this, nick);
    if (!t || t.bot || t.nobody) return { error: 'Игрок не найден.' };
    if (t.id === u.id) return { error: 'Вы уже в беседе.' };
    if (c.members.includes(t.id)) return { error: `${t.login} уже в беседе.` };
    if (c.invites.some((x) => x.uid === t.id)) return { error: `${t.login} уже приглашён(а) — ждём ответа.` };
    if (c.members.length + c.invites.length >= MAX_MEMBERS) return { error: `В беседе — не больше ${MAX_MEMBERS} человек вместе с приглашёнными.` };
    const deny = this.canReach ? this.canReach(u, t, 'msg') : null; if (deny) return { error: deny };
    const lim = this.tooOften ? this.tooOften(u, 'convinv') : null; if (lim) return { error: lim };
    c.invites.push({ uid: t.id, by: u.id, at: Date.now() });
    sys(this, c, `${u.login} пригласил(а) ${t.login}.`);
    this.event(t.id, `💬 ${u.login} приглашает Вас в беседу «${c.title}». Ответить — в «Сообщениях».`);
    if (this.tgNotify) this.tgNotify(t.id, 'mail', `💬 ${u.login} приглашает Вас в беседу «${c.title}». Ответить — в игре: Сообщения.`);
    this.store.save(); return { ok: true, msg: `Приглашение отправлено: ${t.login}.`, to: t, conv: c };
  };
  // ответ на приглашение: yes — вступить, иначе — отказаться
  P.convAnswer = function convAnswer(u, id, yes) {
    const c = this.convGet(id); const inv = c && c.invites.find((x) => x.uid === u.id);
    if (!inv) return { error: 'Приглашение уже недействительно.' };
    if (yes && memberOf(this, u).length >= IN_MAX) return { error: `Бесед у игрока — не больше ${IN_MAX}. Выйдите из какой-нибудь.` };
    c.invites = c.invites.filter((x) => x !== inv);
    if (!yes) { sys(this, c, `${u.login} отказался(ась) от приглашения.`); this.store.save(); return { ok: true, msg: 'Приглашение отклонено.' }; }
    c.members.push(u.id); c.joined[u.id] = Date.now();
    const m = sys(this, c, `${u.login} вступил(а) в беседу.`); c.read[u.id] = m.id; // старые сообщения — уже прочитаны
    this.store.save(); return { ok: true, msg: `Вы в беседе «${c.title}».`, conv: c };
  };
  P.convLeave = function convLeave(u, id) {
    const c = this.convGet(id); if (!c || !isMember(c, u)) return { error: 'Беседа не найдена.' };
    const title = c.title; sys(this, c, `${u.login} вышел(а) из беседы.`);
    const r = removeMember(this, c, u.id);
    this.store.save(); return { ok: true, msg: `Вы вышли из беседы «${title}».`, gone: r === 'gone', conv: r === 'gone' ? null : c };
  };
  P.convKick = function convKick(u, id, uid) {
    const c = this.convGet(id); if (!c || !isMember(c, u)) return { error: 'Беседа не найдена.' };
    if (c.owner !== u.id) return { error: 'Исключать может только создатель беседы.' };
    uid = Number(uid); if (uid === u.id || !c.members.includes(uid)) return { error: 'Участник не найден.' };
    sys(this, c, `${u.login} исключил(а) ${login(this, uid)}.`); removeMember(this, c, uid);
    this.event(uid, `💬 Вас исключили из беседы «${c.title}».`);
    this.store.save(); return { ok: true, msg: 'Участник исключён.', conv: c, out: uid };
  };
  P.convCancel = function convCancel(u, id, uid) {
    const c = this.convGet(id); if (!c || !isMember(c, u)) return { error: 'Беседа не найдена.' };
    if (c.owner !== u.id) return { error: 'Отзывать приглашения может только создатель беседы.' };
    const inv = c.invites.find((x) => x.uid === Number(uid)); if (!inv) return { error: 'Приглашение не найдено.' };
    c.invites = c.invites.filter((x) => x !== inv); sys(this, c, `${u.login} отозвал(а) приглашение для ${login(this, inv.uid)}.`);
    this.store.save(); return { ok: true, msg: 'Приглашение отозвано.', conv: c };
  };
  P.convRename = function convRename(u, id, title) {
    const c = this.convGet(id); if (!c || !isMember(c, u)) return { error: 'Беседа не найдена.' };
    if (c.owner !== u.id) return { error: 'Переименовать может только создатель беседы.' };
    const t = censorMat(clean(title, TITLE_MAX)); if (!t) return { error: 'Назовите беседу.' };
    if (t === c.title) return { error: 'Название то же.' };
    c.title = t; sys(this, c, `${u.login} переименовал(а) беседу: «${t}».`);
    this.store.save(); return { ok: true, msg: 'Беседа переименована.', conv: c };
  };
  P.convDelete = function convDelete(u, id) {
    const c = this.convGet(id); if (!c || !isMember(c, u)) return { error: 'Беседа не найдена.' };
    if (c.owner !== u.id) return { error: 'Удалить беседу может только её создатель. Выйти — может любой.' };
    const was = [...c.members, ...c.invites.map((x) => x.uid)];
    for (const uid of c.members) if (uid !== u.id) this.event(uid, `💬 Беседа «${c.title}» удалена создателем.`);
    drop(this, c); this.store.save(); return { ok: true, msg: 'Беседа удалена.', was };
  };
  // проверки перед сообщением или фото: участник и не запрещено писать (запрет чата действует и здесь)
  P.convCanPost = function convCanPost(u, id) {
    const c = this.convGet(id); if (!c || !isMember(c, u)) return { error: 'Беседа не найдена.' };
    if (muted(u)) return { error: mutedMsg(u) };
    return { ok: true, conv: c };
  };
  P.convPost = function convPost(u, id, text) {
    const ok = this.convCanPost(u, id); if (ok.error) return ok;
    const t = cleanText(text); if (!t) return { error: 'Пустое сообщение.' };
    const lim = this.tooOften ? this.tooOften(u, 'conv') : null; if (lim) return { error: lim };
    const c = ok.conv, m = push(this, c, { by: u.id, text: censorMat(t) }); c.read[u.id] = m.id;
    this.store.save(); return { ok: true, conv: c, m };
  };
  // фото (pics.js собрал PNG и сохранил): сообщение с ним; подпись необязательна
  P.convPostPic = function convPostPic(u, id, pic, picExp, w, h, text) {
    const ok = this.convCanPost(u, id); if (ok.error) return ok;
    const c = ok.conv, m = push(this, c, { by: u.id, text: censorMat(cleanText(text).slice(0, 200)), pic, picExp, w, h }); c.read[u.id] = m.id;
    this.store.save(); return { ok: true, conv: c, m };
  };
  // видит ли игрок фото беседы (участник)
  P.convPicSees = function convPicSees(u, convId) { return isMember(this.convGet(convId), u); };

  const unreadOf = (c, uid) => c.msgs.filter((m) => m.by && m.by !== uid && m.id > (c.read[uid] || 0)).length;
  // список в «Сообщениях»: мои беседы (свежие сверху) и приглашения
  P.convList = function convList(u) {
    const D = this.convDb();
    const convs = memberOf(this, u).sort((a, b) => b.at - a.at).map((c) => {
      const last = [...c.msgs].reverse().find((m) => m.by) || c.msgs[c.msgs.length - 1];
      return { id: c.id, title: c.title, n: c.members.length, own: c.owner === u.id, unread: unreadOf(c, u.id), at: c.at,
        last: last ? { by: last.by ? (last.by === u.id ? 'Вы' : login(this, last.by)) : '', text: last.pic && !last.text ? '📷 Фото' : last.text || (last.pic ? '📷 Фото' : '') } : null };
    });
    const invites = Object.values(D.list).map((c) => { const inv = c.invites.find((x) => x.uid === u.id); return inv ? { id: c.id, title: c.title, from: login(this, inv.by), n: c.members.length, at: inv.at } : null; }).filter(Boolean).sort((a, b) => b.at - a.at);
    return { convs, invites, canCreate: !(this.talkLow && this.talkLow(u)), ownMax: OWN_MAX, max: MAX_MEMBERS };
  };
  // на конверте: новые сообщения во всех беседах и приглашения
  P.convUnread = function convUnread(u) {
    let n = 0; for (const c of Object.values((this.db.convs || {}).list || {})) { if (c.members.includes(u.id)) n += unreadOf(c, u.id); else if (c.invites.some((x) => x.uid === u.id)) n++; }
    return n;
  };
  // окно беседы: участники, приглашённые (видят все), сообщения (последние more); открыл — прочитано
  P.convView = function convView(u, id, more) {
    const c = this.convGet(id); if (!c || !isMember(c, u)) return { error: 'Беседа не найдена.' };
    const lim = Math.min(MSGS_KEEP, Math.max(SHOW, Math.floor(Number(more)) || SHOW)), msgs = c.msgs.slice(-lim);
    if (c.msgs.length) c.read[u.id] = c.msgs[c.msgs.length - 1].id;
    const now = Date.now(), people = {};
    const person = (id2) => { if (!id2 || people[id2]) return; const x = this.userById(id2); people[id2] = x ? { login: x.login, race: x.race, avatar: x.avatar || 0 } : { login: '—', race: 'humans', avatar: 0 }; };
    for (const m of msgs) person(m.by); for (const id2 of c.members) person(id2);
    return { id: c.id, title: c.title, owner: c.owner, own: c.owner === u.id, max: MAX_MEMBERS,
      members: [...c.members].sort((a, b) => (b === c.owner) - (a === c.owner) || (c.joined[a] || 0) - (c.joined[b] || 0)).map((x) => ({ id: x, owner: x === c.owner })),
      invites: c.invites.map((x) => ({ id: x.uid, login: login(this, x.uid) })),
      people, more: c.msgs.length > lim, muted: muted(u) ? mutedMsg(u) : '',
      msgs: msgs.map((m) => ({ id: m.id, by: m.by, at: m.at, text: m.text || '', mine: m.by === u.id,
        ...(m.pic && m.picExp > now && this.picGet && this.picGet(m.pic) ? { pic: m.pic, picExp: m.picExp } : m.pic || m.picGone ? { picGone: true } : {}) })) };
  };
  // кому слать живые обновления: участники и (для списка) приглашённые
  P.convWho = function convWho(c) { return c ? [...c.members, ...c.invites.map((x) => x.uid)] : []; };

  // удаление игрока (admin.js purgeUser): из всех бесед и приглашений; его беседы — следующему по стажу
  const prevPurge = P.purgeUser;
  P.purgeUser = function purgeUser(t, now) {
    for (const c of Object.values(this.convDb().list)) {
      c.invites = c.invites.filter((x) => x.uid !== t.id);
      if (c.members.includes(t.id)) { sys(this, c, `${t.login} больше нет в игре.`); removeMember(this, c, t.id); }
    }
    return prevPurge.call(this, t, now);
  };
}

module.exports = { install, MAX_MEMBERS, OWN_MAX, IN_MAX };
