'use strict';
// Оболочка как в Android-клиенте «Третий Мир 3D»: конверты наверху, панель локаций справа, внизу «Меню» — чат с часами —
// шестерёнка; меню — полоса из 7 кнопок (Кабинет, Локации, Альянс, Почта, Игры, Инфо, Рейтинг) и окно-список над ней;
// окна — пергамент с красными лентами, внизу ◀ и ✕. Стили окон — из APK клиента (web/gfx3d).

const G3 = 'gfx3d/';
const me = () => S.st.user.id;
const ribbon = (t) => `<div class="ribbon">${esc(t)}</div>`;
const soonWin = (title) => () => `${ribbon(title)}<div class="parch-note">Этот раздел появится в следующих версиях сервера.</div>`;
const openSoon = (title) => openSheet(soonWin(title));
const raceIcon = (race) => gimg(RACE_IMG[race] || 'units/human/general.png', 'rico');

// ---------- меню ----------
const M3 = (n) => `gfx3d/menu3/${n}.png`; // иконки плиток меню — как в оригинале
const MENUS = {
  cabinet: { label: 'Кабинет', icon: 'menu2/cabinet.png', items: () => [
    ...(S.st.user.admin ? [['Админка', 'admin_badge_s.png', () => openSheet(adminHtml)]] : []),
    ['Задания', M3('quests'), () => openQuests()],
    ['Профиль', M3('profile'), () => openAccount()],
    ['Советник', `units/${S.cat.mil.raceDir[S.st.user.race]}/wisdom.png${S.st.user.race === 'orcs' ? '?orc' : ''}`, () => openSheet(advisorWin)],
    ['Казна', M3('treasury'), () => openSheet(treasuryWin)],
    ['Премиум', M3('premium'), () => openPremium()],
    ['Королевство', M3('loyalty'), () => openKingdom()],
    ['Ресурсы', M3('resources'), () => openSheet(resSheet)],
    ['Подарки', M3('gifts'), () => openSoon('Подарки')],
    [S.st.user.zagsNew ? `ЗАГС (${S.st.user.zagsNew})` : 'ЗАГС', 'zags/rings.png', () => openZags()],
    ['Репутация', M3('reputation'), () => openRating('reputation')],
    ['Авторитет', M3('authority'), () => openSoon('Авторитет города')],
    ['События', 'gfx3d/mail/events.png', () => openReports()],
    ['Друзья', M3('friends'), () => openPlayers('friends')],
    ['Поиск', M3('search'), () => openPlayers('search')],
    ['Земляки', 'ground/castle_small.png', () => openPlayers('nearby')],
    ['Биржа', 'ground/castle_old.png', () => openSoon('Биржа Замков')],
    ['Блокнот', M3('files'), () => { S.notes = null; send({ t: 'notes' }); openSheet(notesWin); }],
    ['Настройки', M3('settings'), () => openSheet(settingsWin)],
  ] },
  locations: { label: 'Локации', icon: 'menu2/locations.png', items: () => [
    ['Замок', 'gfx3d/locs2/castle.png', () => setTab('castle')],
    ['Земли', 'gfx3d/locs2/lands.png', () => setTab('lands')],
    ['Мир', 'gfx3d/locs2/world.png', () => setTab('world')],
    ['Мои замки', 'gfx3d/locs2/castles.png', () => openSheet(castlesWin)],
    ['Штаб', 'build/mbases.png', () => ACTS.hq()],
    ['Генерал', 'units/human/general.png', () => openGeneral()],
    ['Армии', 'build/baraks.png', () => openSheet(armiesWin)],
    ['Поход', 'smallicon/swordred.png', () => openArmySheet({})],
    ['Ресурсы', 'gfx3d/locs2/res.png', () => openSheet(resSheet)],
    ['Здания', 'build/build.png', () => openSheet(() => ribbon('Здания замка') + summaryHtml(VIEW.CASTLE))],
    ['Постройки', 'build/farm_big.png', () => openSheet(() => ribbon('Постройки на землях') + summaryHtml(VIEW.LANDS))],
  ] },
  alliance: { label: 'Альянс', icon: 'menu2/alliance.png', note: () => (MY().alliance ? '' : 'Вы не состоите в альянсе.'), items: () => [
    ...(!MY().alliance && (MY().invites || []).length ? [[`Приглашения (${MY().invites.length})`, 'gfx3d/rep/envnew.svg', () => openInvites()]] : []),
    [MY().alliance ? 'Мой альянс' : 'Вступить', MY().alliance ? 'gfx3d/rating/ally.png' : M3('fort'), () => { if (MY().alliance) return openAlly(); const i = S.st.castle.grid[0].indexOf(13); if (i < 0) return toast('Нужен Дипломатический центр — постройте его в замке.', 'err'); openCell(VIEW.CASTLE, i); }],
    ['Рейтинг', 'gfx3d/rating/castle.png', () => openRating('alliances')],
    ['Справка', M3('help'), () => openSheet(helpWin)],
  ] },
  mail: { label: 'Почта', icon: 'menu2/mail.png', items: () => [
    ['Новое', 'gfx3d/mail/new.png', () => { const who = prompt('Кому написать? Ник игрока:'); if (who && who.trim()) openDialog(who.trim()); }],
    ['Сообщения', 'gfx3d/mail/msgs.png', () => ACTS.mail()],
    ['Отчеты', 'gfx3d/mail/reports.png', () => openReports()],
    ['Приват.', 'gfx3d/mail/privacy.png', () => openSoon('Приватность')],
    ['Форум', 'gfx3d/mail/forum.png', () => openForum()],
    ['Чат', 'gfx3d/mail/chat.png', () => openChat()],
    ['Блоги', M3('blogs'), () => openSoon('Блог')],
    ['Горн', M3('horn'), () => openReports()],
  ] },
  games: { label: 'Игры', icon: 'menu2/games.png', items: () => [
    ['Сундучки', M3('chests'), () => openChests()],
  ] },
  info: { label: 'Инфо', icon: 'menu2/info.png', items: () => [
    ['Новости', M3('news'), () => openNews()],
    ['Поддержка', M3('support'), () => ACTS.bug()],
    ['Справка', M3('help'), () => openSheet(helpWin)],
    ['Контакты', 'gfx3d/prof/msg.png', () => openSheet(contactsWin)],
    ['Обзор', M3('overview'), () => openSheet(menuDescWin)],
    ['Звуки', 'gfx3d/sound/music.svg', () => openSound()],
  ] },
  rating: { label: 'Рейтинг', icon: 'menu2/rating.png', items: () => [
    ['Зал Славы', 'gfx3d/rating/hof.png', () => openHalls()],
    ['Игрок', 'gfx3d/rating/player.png', () => openRating('players')],
    ['Замок', 'gfx3d/rating/castle.png', () => openRating('castles')],
    ['Альянс', 'gfx3d/rating/ally.png', () => openRating('alliances')],
    ['Знаменитость', 'gfx3d/rating/fame.png', () => openSoon('Знаменитость')],
    ['Авторитет', 'gfx3d/rating/auth.png', () => openRating('reputation')],
    ['Семейные пары', 'gfx3d/rating/pairs.png', () => openPairs()],
    ['Империи', 'gfx3d/rating/empire.png', () => openSoon('Империи')],
    ['Археология', M3('archaeology'), () => openSoon('Археология')],
  ] },
};
S.menu = null;
function renderMenu() {
  const m = MENUS[S.menu];
  const items = m.items();
  S.menuItems = items;
  // плитки 3 в ряд (как в оригинале), последний ряд добивается пустыми ячейками; ✕ — красная лента сверху
  const pad = (3 - (items.length % 3)) % 3, note = m.note ? m.note() : '';
  $('#menuWin').innerHTML = `<button class="mclosex" data-mclose aria-label="Закрыть"></button><div class="mscroll">${note ? `<div class="mnote">${esc(note)}</div>` : ''}<div class="ptiles pbig mgrid">${items.map((it, i) =>
    `<button class="ptile" data-mi="${i}"><img src="${it[1].startsWith('gfx3d/') ? it[1] : GFX + it[1]}" alt=""><span${it[0].length > 10 ? ' class="long"' : ''}>${esc(it[0])}</span></button>`).join('')}${'<i class="ptile empty"></i>'.repeat(pad)}</div></div>`;
  // иконки нижней полосы — из оригинального клиента (web/gfx3d/menu)
  $('#menubar').innerHTML = Object.entries(MENUS).map(([k, v]) => `<button data-menu="${k}" class="${k === S.menu ? 'on' : ''}"><img src="${G3}${v.icon}" alt=""><span>${v.label}</span></button>`).join('');
}
function openMenu(k = 'cabinet') {
  S.menu = k; renderMenu(); $('#menu').classList.remove('hidden');
  pushOverlay();
}
function closeMenu(fromPop) { if (!S.menu) return; S.menu = null; $('#menu').classList.add('hidden'); if (!fromPop) popOverlay(); }
$('#btnMenu').addEventListener('click', () => (S.menu ? closeMenu() : openMenu()));
$('#menu').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) { if (e.target.id === 'menu') closeMenu(); return; }
  if (b.dataset.menu) { if (b.dataset.menu === S.menu) return closeMenu(); S.menu = b.dataset.menu; return renderMenu(); } // повторное нажатие — закрыть
  if (b.dataset.mclose !== undefined) return closeMenu();
  if (b.dataset.mi !== undefined) {
    const it = S.menuItems[Number(b.dataset.mi)];
    closeMenu(true); // запись в истории остаётся за окном, которое откроет пункт
    it[2]();
    popOverlay(); // окна не открылось (сменили локацию) — запись убирается
  }
});

// ---------- верх, панель локаций, низ ----------
$('#btnMail').addEventListener('click', () => ACTS.mail());
$('#btnRep').addEventListener('click', () => openReports());
// уровни зданий в замке: галочка в «Настройках» (запоминается на устройстве)
$('#sheetBody').addEventListener('change', (e) => {
  if (e.target.dataset.showlvl === undefined) return;
  S.showLvl = e.target.checked; try { localStorage.setItem('showLvl', S.showLvl ? '1' : '0'); } catch {}
  toast(S.showLvl ? 'Уровни зданий показаны' : 'Уровни зданий скрыты'); if (typeof isoDraw === 'function') isoDraw();
});
$('#btnNews').addEventListener('click', () => { const id = S.st.newsFirst; $('#btnNews').classList.add('hidden'); if (id) openNewsItem(id, true); else openNews(); }); // непрочитанная новость открывается сразу
$('#locsTab').addEventListener('click', () => $('#locs').classList.toggle('open'));
$('#locs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-loc]'); if (!b) return;
  const k = b.dataset.loc;
  if (['castle', 'lands', 'world'].includes(k)) return setTab(k);
  if (k === 'castles') return openSheet(castlesWin);
  if (k === 'res') return openSheet(resSheet);
});
$('#chatline').addEventListener('click', () => openChat());
$('#btnGear').addEventListener('click', () => openSheet(settingsWin));

// ---------- чат ----------
S.chat = [];
function chatLine() {
  const m = S.chat[S.chat.length - 1];
  $('#chatmsg').innerHTML = m ? `<b>${esc(m.from)}</b> ${repIcons(m.rep)} ${chatText(m)}` : '<span class="muted">Чат пуст — напишите первым</span>';
}
// «Главный чат» как в оригинале: Выход / Игроки (N), сообщения «ЧЧ:ММ [ник] текст», смайлы, поле ввода внизу.
// Нажатие на ник — обращение «ник, » в поле ввода; сообщения, где упомянут я, подсвечены.
// смайлы чата: новые (gfx3d/smiles, код :имя:) и старые пиксельные (код :s-имя: и прежние коды — для старых сообщений)
const SMILES = ['angel','beer','devil','worry','heart','tongue','kiss','cool','laugh','wink','rose','handshake','cry','hmm','smile','blush','wow','love','angry','confused','dislike','like','coins','swords','shield','lips','ghost','cheers','crown','cup','flower','tulip','sun','gift','cake','strawberry','apple','banana','watermelon','orange','cherry','poop','chicken','goat','bear','cat','panda','butterfly','bomb','pizza'];
const OLD_SMILES = ['smile', 'sad', 'wok', 'angry', 'heart', 'kiss', 'notund', 'Uvula'];
const SMILE_SET = new Set(SMILES);
const smileSrc = (k) => (SMILE_SET.has(k) ? `gfx3d/smiles/${k}.png` : `${GFX}smallicon/smiles/${k}.png`);
// текст сообщения чата; премиум-цвет — только допустимые значения #rrggbb
const chatText = (m) => (/^#[0-9a-f]{6}$/i.test(m.color || '') ? `<span class="ccol" style="color:${m.color}">${smiles(esc(m.text))}</span>` : smiles(esc(m.text)));
const smiles = (html) => html.replace(/:([A-Za-z]{2,12}):/g, (m, k) => (SMILE_SET.has(k) || OLD_SMILES.includes(k) ? `<img class="csm" src="${smileSrc(k)}" alt="">` : m));
S.chatUsers = null; S.smileOpen = false;
function openChat() { send({ t: 'chatlog' }); send({ t: 'chatusers' }); S.smileOpen = false; openSheet(chatWin); setTimeout(() => { const l = $('#chatList'); if (l) l.scrollTop = l.scrollHeight; }, 50); }
function chatWin() {
  const my = S.st.user.login.toLowerCase();
  const n = S.chatUsers ? S.chatUsers.length : '…';
  return `${ribbon('Главный чат')}
    <div class="chattop"><button class="lbar" data-chatexit><img src="${GFX}chat/exit.png" alt=""> Выход</button><button class="lbar" data-chatusers><img src="${GFX}chat/players.png" alt=""> Игроки (${n})</button></div>
    <div id="chatList" class="chatlist ${S.smileOpen ? 'short' : ''}">${S.chat.slice(-30).reverse().map((m) => { const hit = m.fromId !== me() && m.text.toLowerCase().includes(my);
      return `<div class="cm ${hit ? 'hit' : ''} ${m.fromId === me() ? 'mine' : ''}" data-chatpop="${m.fromId}" data-nick="${esc(m.from)}" data-mid="${m.id}"><small>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small> <b>[${esc(m.from)}]</b>${m.role ? ` <img class="admbadge s" src="${GFX}${m.role === 'admin' ? 'admin_badge_s.png' : 'chat/moder.png'}" alt="">` : ''}${m.rep >= 10 ? ` ${repIcons(m.rep)}` : ''} ${chatText(m)}</div>`; }).join('') || '<p class="parch-note">Сообщений пока нет — напишите первым.</p>'}</div>
    ${S.smileOpen ? `<div class="smilebox">${SMILES.map((k) => `<button data-smile="${k}"><img src="${smileSrc(k)}" alt=""></button>`).join('')}</div>` : ''}
    ${S.chatPop ? `<div class="cpop-bg" data-cpopclose><div class="cpop"><button class="cpop-x" data-cpopclose aria-label="Закрыть">✕</button><div class="cpop-nick">${esc(S.chatPop.nick)}</div>
      <div class="cpop-grid"><button class="ptile" data-cpop="reply"><img src="${GFX}chat/reply.png" alt=""><span>Обратиться</span></button>
      <button class="ptile" data-cpop="profile"><img src="${GFX}chat/profile.png" alt=""><span>Профиль</span></button>
      <button class="ptile" data-cpop="report"><img src="${GFX}chat/report.png" alt=""><span>Жалоба</span></button>
      <button class="ptile" data-cpop="private"><img src="${GFX}chat/private.png" alt=""><span>Лично</span></button></div>
      ${S.st.user.admin || S.st.user.mod ? `<div class="cpop-mod">Модерация:</div><div class="cpop-grid">
        <button class="ptile" data-cpop="del"><img src="${GFX}chat/delete.png" alt=""><span>Удалить</span></button>
        <button class="ptile" data-cpop="ban"><img src="${GFX}chat/ban.png" alt=""><span>Бан в чате</span></button></div>
        ${S.chatPop.ban ? `<div class="cpop-ban">${[[1, '1 час'], [2, '2 часа'], [8, '8 часов'], [-1, 'Навсегда'], [0, 'Снять бан']].map(([h, t]) => `<button class="pbtn" data-cban="${h}">${t}</button>`).join('')}</div>` : ''}` : ''}</div></div>` : ''}
    <form class="chatbar" data-form="chat"><button type="button" class="smilebtn" data-smiletoggle aria-label="Смайлы"><img src="${GFX}chat/smiles.png" alt=""></button><input name="text" maxlength="300" autocomplete="off" value="${esc(S.chatDraft || '')}"><button class="sendbtn" aria-label="Отправить"><img src="${GFX}chat/send.png" alt=""></button></form>`;
}
// обновить только ленту сообщений (поле ввода не трогаем — можно печатать, пока приходят сообщения)
function chatListUpdate() {
  const l = $('#chatList'); if (!l) return;
  const tmp = document.createElement('div'); tmp.innerHTML = chatWin();
  const nl = tmp.querySelector('#chatList'); if (nl) { l.innerHTML = nl.innerHTML; l.scrollTop = l.scrollHeight; }
}
function chatUsersWin() {
  const l = S.chatUsers; if (!l) return `${ribbon('Игроки в игре')}<p class="parch-note">Загрузка…</p>`;
  return `${ribbon(`Игроки в игре (${l.length})`)}${l.map((u) => `<button class="rrow" data-cprof="${u.id}"><span class="rn"><b>${esc(u.login)} ${repIcons(u.rep)}</b></span></button>`).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-cban],[data-cpop],[data-cpopclose],[data-chatpop],[data-chatexit],[data-chatusers],[data-smile],[data-smiletoggle]'); if (!t) return;
  const d = t.dataset, inp = $('.chatbar input');
  if (d.cban !== undefined) { const pp = S.chatPop; S.chatPop = null; send({ t: 'chatmod', op: 'ban', login: pp.nick, hours: Number(d.cban) }); return refreshSheet(); }
  if (d.cpopclose !== undefined && (e.target === t || t.classList.contains('cpop-x'))) { S.chatPop = null; return refreshSheet(); }
  if (d.cpopclose !== undefined) return;
  if (d.chatpop) { if (inp) S.chatDraft = inp.value; S.chatPop = { id: Number(d.chatpop), nick: d.nick, mid: Number(d.mid) }; return refreshSheet(); }
  if (d.cpop) {
    const pp = S.chatPop;
    if (d.cpop === 'ban') { pp.ban = !pp.ban; return refreshSheet(); }
    S.chatPop = null;
    if (d.cpop === 'del') { if (confirm('Удалить сообщение?')) send({ t: 'chatmod', op: 'del', id: pp.mid }); return refreshSheet(); }
    if (d.cpop === 'profile') { refreshSheet(); return send({ t: 'profile', id: pp.id }); }
    if (d.cpop === 'private') { refreshSheet(); return openDialog(pp.nick); }
    if (d.cpop === 'report') {
      const msg = S.chat.find((x) => x.id === pp.mid);
      if (confirm(`Пожаловаться администрации на ${pp.nick}?`)) send({ t: 'bug', text: `Жалоба на ${pp.nick} (чат): «${msg ? msg.text : ''}»` });
      return refreshSheet();
    }
    if (d.cpop === 'reply') S.chatDraft = `${pp.nick}, `;
  }
  if (d.chatexit !== undefined) return closeSheet();
  if (d.chatusers !== undefined) { send({ t: 'chatusers' }); return openSheet(chatUsersWin); }
  if (inp && !d.cpop) S.chatDraft = inp.value;
  if (d.smile) { S.chatDraft = `${S.chatDraft || ''}:${d.smile}:`; S.smileOpen = false; }
  if (d.smiletoggle !== undefined) S.smileOpen = !S.smileOpen;
  refreshSheet(); const l = $('#chatList'); if (l) l.scrollTop = l.scrollHeight;
  const i2 = $('.chatbar input'); if (i2 && !d.smiletoggle) { i2.focus(); i2.setSelectionRange(i2.value.length, i2.value.length); }
});
$('#sheetBody').addEventListener('input', (e) => { if (e.target.closest('.chatbar')) S.chatDraft = e.target.value; });

// ---------- профиль (как «Профиль» в клиенте: пергамент, красные ленты) ----------
// аватар игрока (PNG 96×96, собранный сервером) или картинка расы
// своей аватарки нет — портрет расы (gfx/auth/race_*.webp, те же, что при регистрации)
const raceAva = (race, cls = '') => `<img class="${cls} raceava" src="${GFX}auth/race_${['humans', 'elves', 'dwarves', 'orcs'].includes(race) ? race : 'humans'}.webp" alt="">`;
const avatarImg = (p, cls = '') => (p.avatar ? `<img class="${cls}" src="avatar/${p.id}.png?v=${p.avatar}" alt="">` : raceAva(p.race, cls));
function profileWin(p) {
  const tile = (key, icon, text, off) => `<button class="ptile ${off ? 'off' : ''}" data-ptile="${key}" data-pid="${p.id}"><img src="${icon.startsWith('gfx3d/') ? icon : GFX + icon}" alt=""><span>${text}</span></button>`;
  // Зал Славы как в оригинале: в «Информации» — ряд значков (по лучшему месту в каждой категории),
  // в разделе ниже — последние 5 медалей крупно и «Посмотреть» (все медали с датами)
  const best = []; const seen = {};
  const fresh = p.medals.filter((m) => m.at > Date.now() - 30 * 86400000); // строка под репутацией — только медали последнего месяца
  for (const m of fresh.sort((a, b) => a.place - b.place || b.at - a.at)) if (!seen[m.hall]) { seen[m.hall] = 1; best.push(m); }
  const mtitle = (m) => `Зал «${esc(m.name)}» — ${['I', 'II', 'III'][m.place - 1]} место за ${monthName(m.month)}, получено ${fmtDay(m.at)}`;
  const medals = best.length ? `<span class="hofrow">${best.map((m) => `<img class="medal" src="${medalSrc(m.icon)}" alt="" title="${mtitle(m)}" data-medal="${m.at}:${m.hall}">`).join('')}</span>` : '<span class="muted">нет</span>';
  // разделы профиля компактно: ряд значков (до 12, дальше «+N»); нажатие на заголовок или ряд — полный список
  const row = (list, f) => `<div class="prow">${list.slice(0, 12).map(f).join('')}${list.length > 12 ? `<b>+${list.length - 12}</b>` : ''}</div>`;
  const hof = p.medals.length ? `<div data-mymedals>${ribbon(`Зал Славы - ${p.medals.length} ›`)}${row(p.medals, (m) => `<img class="pmed" src="${medalSrc(m.icon)}" alt="" title="${mtitle(m)}">`)}</div>`
    : `${ribbon('Зал Славы')}<div class="parch-note">Пока нет — медали получают топ-3 игрока каждой категории в конце соревновательного месяца.</div>`;
  // Награждения: медали от альянса за заслуги
  const aw = p.awards || [];
  const awards = aw.length ? `<div data-plist="awards">${ribbon(`Награждения - ${aw.length} ›`)}${row(aw, (m) => `<img class="pmed" src="${GFX}smallicon/status/${m.kind}.png" alt="">`)}</div>` : '';
  const gifts = p.gifts || [];
  const giftsRow = gifts.length ? `<div data-plist="gifts">${ribbon(`Подарки - ${gifts.length} ›`)}${row(gifts, (g) => `<img class="pgi" src="${GFX}${(S.cat.gifts[g.gift] || {}).img}" alt="">`)}</div>` : `${ribbon('Подарки - 0')}<div class="parch-note">Подарков пока нет.</div>`;
  // значки убийцы мирового босса (boss.js)
  const bb = p.bossBadges || [], SLAY = { dragon: 'Драконоборец', troll: 'Сокрушитель троллей', lich: 'Изгоняющий тьму' };
  // в профиле — только ряд значков; нажатие на заголовок или значки — полный список (bossBadgesWin)
  S.bossBadgesOf = { login: p.login, list: bb, slay: SLAY };
  const slayer = bb.length ? `<div data-bbl>${ribbon(`Победы над боссами - ${bb.length} ›`)}<div class="bbadges">${bb.slice(0, 12).map((m) => bossMedal(m)).join('')}${bb.length > 12 ? `<b>+${bb.length - 12}</b>` : ''}</div></div>` : '';
  return `${ribbon('Профиль')}
    <div class="pauth"><img class="pcrown" src="gfx3d/prof/crown.png" alt=""><div>Авторитет Вашего города:<br><img class="pking" src="gfx3d/prof/king.png" alt=""> Здесь может быть Ваше имя!</div></div>
    <button class="pbar" data-soon="Авторитет города">Стать Авторитетом!</button>
    ${ribbon('Информация')}
    <div class="pinfo"><div class="avatar ${p.avatar ? 'avaclick' : ''}" ${p.avatar ? `data-avaview="${p.id}"` : ''}>${avatarImg(p)}</div><div>
      Никнейм: <b>${esc(p.login)}</b><br>Ранг: ${p.rank}<br>Рейтинг: ${fmtFull(p.rating)}<br>Раса: ${raceIcon(p.race)} ${esc(p.raceName)}</div></div>
    <button class="pline plink2" data-reptable>Репутация (${fmtFull(p.reputation)}): ${repIcons(p.reputation)}</button>
    ${best.length ? `<div class="pline">Зал Славы: ${medals}</div>` : ''}
    ${(p.titles || []).length ? `<div class="ptitle">Звание: ${p.titles.map((t) => `${t === 'Администратор' ? `<img class="admbadge" src="${GFX}admin_badge.png" alt="">` : t === 'Модератор форума' ? `<img class="admbadge" src="${GFX}mod_badge.png" alt="">` : `<img class="admbadge crownp" src="${GFX}premium_crown.png" alt="">`} ${esc(t)}`).join(', ')}</div>` : ''}
    ${p.marriage ? `<div class="pline zmar"><img class="zring" src="${GFX}zags/rings.png" alt=""> ${p.marriage.role === 'king' ? 'Женат на Королеве' : 'Замужем за Королем'} <a class="plink" data-zpair="${p.marriage.id}">${esc(p.marriage.spouse.login)}</a></div>
      <div class="pline">Рейтинг пары: <a class="plink" data-zpair="${p.marriage.id}">${ZSTAR} ${p.marriage.place}</a>, ${ZTHUMB} ${fmtFull(p.marriage.votes)}</div>` : ''}
    <div class="pline">Альянс: ${p.alliance ? `<a class="plink" data-allyinfo="${p.alliance.id}">${esc(p.alliance.name)} [${esc(p.alliance.tag)}]</a>` : '<b class="noally">нет</b>'}</div>
    ${p.allyInvite ? (p.allyInvite.sent ? `<div class="allyinv sent">✔ Приглашение в [${esc(p.allyInvite.tag)}] отправлено</div>` : `<button class="allyinv" data-allyinv="${p.id}">➕ Пригласить в альянс [${esc(p.allyInvite.tag)}]</button>`) : ''}
    ${p.alliance ? `<div class="pline">Звание в альянсе: ${esc(p.alliance.role)}${p.alliance.ep > 0 ? ` <img class="epaul" src="${GFX}ep/ep${Math.min(8, p.alliance.ep)}.png" alt="">` : ''}</div>` : ''}
    <div class="ptiles pbig">
      ${tile('treasury', 'gfx3d/prof/treasury.png', 'Пополнить Казну', !p.self)}
      ${tile('rep', 'gfx3d/prof/rep.png', 'Поднять Репутацию')}
      ${tile('gift', 'gfx3d/prof/gift.png', 'Отправить Подарок')}
      ${tile('friend', 'gfx3d/prof/friend.png', p.friend ? 'Убрать из друзей' : 'Добавить в друзья', p.self)}
      ${tile('msg', 'gfx3d/prof/msg.png', 'Сообщение')}
      ${tile('hof', 'gfx3d/prof/hof.png', 'Зал Славы')}
      ${tile('premium', 'gfx3d/prof/premium.png', p.self ? 'Премиум' : 'Подарить Премиум')}
      ${tile('info', 'gfx3d/prof/info.png', 'Личная информация')}
      ${tile('more', 'gfx3d/prof/more.png', '')}
    </div>
    ${giftsRow}${hof}${awards}${slayer}
    ${ribbon(`Замки - ${p.castles.length}`)}
    ${p.castles.map((c) => `<button class="pcastle" data-goworld="${c.x},${c.y}"><img src="${GFX}ground/castle_small.png" alt=""> ${esc(c.name)}<br>X: ${c.x}, Y: ${c.y}${c.capital ? ' (Столица)' : ''}</button>`).join('')}`;
}
// все медали Зала Славы игрока с датами получения
function medalsWin(p) {
  const list = p.medals || [];
  const total = list.reduce((a, m) => a + (m.bonus || 0), 0);
  return `${ribbon('Зал Славы')}<div class="bwline center">${esc(p.login)} · медалей: <b>${list.length}</b><br>Репутация от Зала славы: <b class="good">+${fmtFull(total)}</b></div>
    ${list.length ? list.map((m) => `<div class="award"><img src="${medalSrc(m.icon)}" alt=""><div><b>${esc(m.name)} — ${['I', 'II', 'III'][m.place - 1]} место</b><small>за ${monthName(m.month)} · получено ${fmtDay(m.at)}${m.bonus ? ` · бонус +${fmtFull(m.bonus)} репутации` : ''}</small></div></div>`).join('')
      : '<div class="parch-note">Медалей пока нет.</div>'}
    <button class="pbar" data-hof="${p.id}">Зал славы</button>`;
}
function profileMoreWin(p) {
  const tile = (key, icon, text, off) => `<button class="ptile ${off ? 'off' : ''}" data-ptile="${key}" data-pid="${p.id}"><img src="${GFX}${icon}" alt=""><span>${text}</span></button>`;
  return `${ribbon(p.login)}<div class="ptiles">
    ${tile('map', 'ground/castle_small.png', 'На карте')}
    ${tile('attack', 'smallicon/swordred.png', 'Атаковать', p.self)}
  </div>`;
}
function profileInfoWin(p) {
  return `${ribbon('Личная информация')}<div class="pstats">Игрок: <b>${esc(p.login)}</b><br>Раса: ${esc(p.raceName)}<br>В игре с: ${fmtDate(p.created)}${p.lastSeen ? `<br>Последний вход: ${fmtDate(p.lastSeen)}` : ''}</div>
    ${p.self ? `<form class="stack" data-form="about"><textarea name="text" rows="4" placeholder="О себе">${esc(p.about)}</textarea><button class="btn primary">Сохранить</button></form>` : `<div class="pstats">${esc(p.about) || '<span class="muted">Игрок ничего о себе не написал.</span>'}</div>`}`;
}

// ---------- Зал Славы ----------
// Зал Славы — как в оригинале: 4 страницы по 5 категорий, у каждой медаль, «Позиция», «Подробнее» и описание
const HALL_IMG = (id, place) => `gfx3d/halls/${id}${place ? `_${place}` : ''}.png`;
const medalSrc = (icon) => (String(icon).startsWith('gfx3d/') ? icon : GFX + icon);
S.hallPage = 0;
function hallsWin() {
  if (!S.halls) return `${ribbon('Зал славы')}<p class="parch-note">Загрузка…</p>`;
  const pages = S.hallPages || [S.halls.map((h) => h.id)], pg = Math.min(S.hallPage, pages.length - 1), by = Object.fromEntries(S.halls.map((h) => [h.id, h]));
  const pager = `<div class="hpager">${pages.map((_, i) => `<button class="${i === pg ? 'on' : ''}" data-hpage="${i}">${i + 1}</button>`).join('')}</div>`;
  const ss = S.hallSeason;
  const who = S.hallWho;
  return `${ribbon('Зал славы')}${who && !who.self ? `<div class="bwline center">Места игрока <b>${esc(who.login)}</b></div>` : ''}${who && who.admin ? '<div class="bwline center small">Администратор в Зале славы не участвует.</div>' : ''}${pager}
    ${pages[pg].map((id) => { const h = by[id]; if (!h) return ''; return `<div class="hall2"><img class="hmed" src="${HALL_IMG(id)}" alt="">
      <div class="hright"><b>${esc(h.name)}</b><div>Позиция: ${fmtFull(h.pos)}</div><button class="hmore" data-hmore="${id}">Подробнее</button></div>
      <div class="hshort">${esc(h.short)}</div></div>`; }).join('')}
    ${pager}
    ${ss && pg === 0 ? `<div class="bwline center small">Итоги ${monthName(ss.key)} через <span class="cd" data-e="${ss.end}"></span> — топ-3 каждой категории получат медаль и бонус репутации.</div>` : ''}`;
}
function hallDescWin() {
  const h = (S.halls || []).find((x) => x.id === S.hallId); if (!h) return hallsWin();
  const place = ['I', 'II', 'III'];
  return `${ribbon('Описание')}
    <div class="hmeds">${[1, 2, 3].map((i) => `<img src="${HALL_IMG(h.id, i)}" alt="">`).join('')}</div>
    <div class="hdesc2">Бонус: ${h.bonus.join(', ')} <small>(репутация за I, II, III место)</small></div>
    <div class="hdesc2"><b>${esc(h.name)}</b> <img class="hmini" src="${HALL_IMG(h.id, 1)}" alt=""> ${esc(h.desc)}</div>
    ${ribbon('Лидеры месяца')}
    ${h.top.length ? h.top.map((x, i) => `<div class="hrow">${i < 3 ? `<img src="${HALL_IMG(h.id, i + 1)}" alt="">` : `<span class="hnum">${i + 1}</span>`} <a data-cprof="${x.id}">${esc(x.login)}</a> — ${fmtFull(x.value)}</div>`).join('') : '<p class="parch-note">Пока никто не отличился.</p>'}
    <div class="bwline center small">Ваша позиция: <b>${fmtFull(h.pos)}</b>${h.mine ? ` · ваши очки: <b>${fmtFull(h.mine)}</b>` : ''}</div>`;
}
// окно «Зал <название>» как в оригинале: медаль (серая «?», пока не в тройке), позиция, дата отсчёта, показатель, «Описание»/«Архив», рейтинг по 10
const HALL_UNIT = { growth: (v) => `Прирост рейтинга ${fmtFull(v)} единиц.`, wealth: (v) => `${fmtFull(v)} монет.` };
// Зал славы: из меню — свои места, из профиля игрока — места этого игрока (who)
function openHalls(who) { S.halls = null; S.hallWhoId = who; send({ t: 'halls', ...(who !== undefined ? { who } : {}) }); openSheet(hallsWin); }
function openHall(id, page = 0) { S.hallId = id; S.hall = null; send({ t: 'hall', id, page, ...(S.hallWhoId !== undefined ? { who: S.hallWhoId } : {}) }); openSheet(hallWin); }
function hallWin() {
  const h = S.hall, id = S.hallId;
  const name = h ? h.name : ((S.halls || []).find((x) => x.id === id) || {}).name || '';
  if (!h) return `${ribbon(`Зал ${name}`)}<p class="parch-note">Загрузка…</p>`;
  const [y, m] = String(h.key || '').split('-');
  const top3 = h.pos >= 1 && h.pos <= 3;
  const nav = `<div class="hnav"><button data-hpg="0" ${h.page ? '' : 'disabled'}>◀◀</button><button data-hpg="${h.page - 1}" ${h.page ? '' : 'disabled'}>◀</button>
    <span>${h.page + 1}</span><button data-hpg="${h.page + 1}" ${h.page < h.pages - 1 ? '' : 'disabled'}>▶</button><button data-hpg="${h.pages - 1}" ${h.page < h.pages - 1 ? '' : 'disabled'}>▶▶</button></div>`;
  return `${ribbon(`Зал ${name}`)}
    <div class="hhead"><div class="hq ${top3 ? '' : 'none'}"><img src="${top3 ? HALL_IMG(id, h.pos) : HALL_IMG(id)}" alt="">${top3 ? '' : '<b>?</b>'}</div>
      <div class="hinfo">Позиция: ${h.pos}<br>Дата отсчета:<br>${m ? `01.${m}.${y}` : '—'}<br>Показатель: ${(HALL_UNIT[id] || ((v) => `${fmtFull(v)} очков.`))(h.value)}
        <button class="hdark" data-hdesc="${id}">Описание</button><button class="hdark" data-harch="${id}">Архив</button></div></div>
    ${ribbon('Рейтинг')}${nav}
    <div class="htable">${h.rows.map((r) => `<div class="${r.id === (S.hallWhoId ?? me()) ? 'me' : ''}"><span>${r.place}</span><a data-cprof="${r.id}">${esc(r.login)}</a><span>${fmtFull(r.value)}</span></div>`).join('') || '<p class="parch-note">В этом месяце пока никто не отличился.</p>'}</div>
    ${h.rows.length ? nav : ''}`;
}
function hallArchWin() {
  const h = S.hall; if (!h) return hallWin();
  return `${ribbon(`Архив: ${h.name}`)}${h.archive.length ? h.archive.map((a) => `<div class="section">${esc(monthName(a.key))}</div>
    ${a.top.map((x, i) => `<div class="hrow harow"><img src="${HALL_IMG(h.id, i + 1)}" alt=""> <a data-cprof="${x.id}">${esc(x.login)}</a> — ${fmtFull(x.value)}</div>`).join('') || '<p class="parch-note">Победителей не было.</p>'}`).join('')
    : '<p class="parch-note">Архив пуст — итоги подводятся в конце каждого месяца.</p>'}`;
}
const ALLY_MEDAL = { gold: 'Золотая медаль', silver: 'Серебряная медаль', bronze: 'Бронзовая медаль' };
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const monthName = (key) => { const [y, m] = String(key || '').split('-'); return m ? `${MONTHS[Number(m) - 1]} ${y}` : ''; };
const fmtDay = (t) => new Date(t).toLocaleDateString('ru-RU');

// ---------- рейтинги ----------
const RK = { players: ['Игрок', 'player'], castles: ['Замок', 'castle'], alliances: ['Альянс', 'ally'], reputation: ['Авторитет', 'auth'] };
function openRating(kind) { S.rk = kind; S.rlist = null; S.rpage = 0; S.rkMenu = false; send(kind === 'players' ? { t: 'rating' } : { t: 'ratings', kind }); openSheet(ratingWin); }
// рейтинги как в оригинале: полоса категории с меню ≡, листалка и таблица по 10 строк, от большего к меньшему
function ratingWin() {
  const k = S.rk, [title, icon] = RK[k];
  const list = k === 'players' ? S.ratingRows : S.rlist;
  const head = `${ribbon('Рейтинг')}<div class="rkbar"><span><img src="gfx3d/rating/${icon}.png" alt=""> ${title}</span><button data-rkmenu>≡</button></div>
    ${S.rkMenu ? `<div class="rkmenu">${Object.entries(RK).map(([id, [t, ic]]) => `<button data-rkind="${id}" class="${id === k ? 'on' : ''}"><img src="gfx3d/rating/${ic}.png" alt=""> ${t}</button>`).join('')}</div>` : ''}`;
  if (!list) return `${head}<p class="parch-note">Загрузка…</p>`;
  const pages = Math.max(1, Math.ceil(list.length / 10)), pg = Math.min(S.rpage || 0, pages - 1);
  const nav = `<div class="hnav"><button data-rpg="0" ${pg ? '' : 'disabled'}>◀◀</button><button data-rpg="${pg - 1}" ${pg ? '' : 'disabled'}>◀</button>
    <span>${pg + 1}</span><button data-rpg="${pg + 1}" ${pg < pages - 1 ? '' : 'disabled'}>▶</button><button data-rpg="${pages - 1}" ${pg < pages - 1 ? '' : 'disabled'}>▶▶</button></div>`;
  const rows = list.slice(pg * 10, pg * 10 + 10).map((r, j) => {
    const i = pg * 10 + j + 1;
    const name = k === 'alliances' ? `<a data-allyinfo="${r.id}">${esc(r.name)} [${esc(r.tag)}]</a>` : k === 'castles' ? `<button class="rlink" data-goworld="${r.x},${r.y}">${esc(r.name)}</button>` : `<a data-cprof="${r.id}">${esc(r.login)}</a>`;
    return `<div class="${k !== 'alliances' && k !== 'castles' && r.id === me() ? 'me' : ''}"><span>${i}</span>${name}<span>${fmtFull(r.rating)}</span></div>`;
  }).join('');
  return `${head}${nav}<div class="htable rtab">${rows || '<p class="parch-note">Пусто.</p>'}</div>${rows ? nav : ''}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-rkmenu],[data-rkind],[data-rpg]'); if (!t) return;
  if (t.dataset.rkmenu !== undefined) { S.rkMenu = !S.rkMenu; return refreshSheet(); }
  if (t.dataset.rkind) { S.rkMenu = false; S.rk = t.dataset.rkind; S.rlist = null; S.rpage = 0; send(S.rk === 'players' ? { t: 'rating' } : { t: 'ratings', kind: S.rk }); return refreshSheet(); }
  S.rpage = Math.max(0, Number(t.dataset.rpg)); refreshSheet();
});

// ---------- игроки: друзья, земляки, поиск ----------
function openPlayers(kind) { S.pk = kind; S.plist = null; if (kind !== 'search') send({ t: kind }); else send({ t: 'search', q: '' }); openSheet(playersWin); }
function playersWin() {
  const title = { friends: 'Мои друзья', nearby: 'Земляки', search: 'Поиск друзей' }[S.pk];
  return `${ribbon(title)}
    ${S.pk === 'search' ? '<form class="chatform" data-form="search"><input name="q" placeholder="Ник игрока" autocapitalize="none"><button class="btn primary small">Найти</button></form>' : ''}
    ${S.pk === 'nearby' ? '<p class="parch-note">Игроки в радиусе 25 клеток от вашего замка.</p>' : ''}
    <div class="rlist">${!S.plist ? '<p class="parch-note">Загрузка…</p>' : S.plist.map((r) => `<button class="rrow" data-cprof="${r.id}"><span class="rk">${raceIcon(r.race)}</span>
      <span class="rn"><b>${esc(r.login)}</b><small>${esc(r.raceName)} · X:${r.x} Y:${r.y}${r.dist !== undefined ? ` · ${r.dist} кл.` : ''}${r.online ? ' · в игре' : ''}</small></span><span class="rv">${fmtFull(r.rating)}</span></button>`).join('')
      || `<p class="parch-note">${S.pk === 'friends' ? 'Друзей пока нет — добавляйте их из профиля игрока.' : 'Никого не найдено.'}</p>`}</div>`;
}

// ---------- окно «Замок» на карте мира (как в клиенте: имя, координаты, рейтинг, игрок, раса, 3 плитки) ----------
function castleWin(o, x, y) {
  const mine = o.ownerId === me();
  const tile = (attr, icon, text) => `<button class="ptile" ${attr}><img src="${GFX}${icon}" alt=""><span>${text}</span></button>`;
  const saved = (S.places || []).some((p) => p.x === x && p.y === y);
  return `${ribbon('Замок')}
    <div class="cwin"><img class="cwimg" src="${GFX}${WORLD_NAME_IMG(o)}" alt=""><div>
      <div class="cwname">${esc(o.name)}</div><div>X: ${x} Y: ${y}</div><div>Рейтинг: ${gimg('ground/castle_small.png', 'rico')} ${fmtFull(o.rating)}</div></div></div>
    <div class="cwrow"><span>Игрок:</span><button class="pbar cwplayer" data-cprof="${o.ownerId}">${esc(o.owner)}</button></div>
    <div class="cwrow"><span>Раса:</span><span>${raceIcon(o.race)} ${esc(S.cat.races[o.race] || '')}</span></div>
    ${o.alliance ? `<div class="cwrow"><span>Альянс:</span><span>[${esc(o.alliance)}]</span></div>` : ''}
    <hr class="cwhr">
    <div class="ptiles">
      ${mine ? tile(`data-switchxy="${x},${y}"`, 'build/castle.png', 'Войти в замок') : tile(`data-write="${esc(o.owner)}"`, 'smallicon/unmes.png', 'Сообщение')}
      ${tile(`data-armyopen="trade" data-ax="${x}" data-ay="${y}"`, 'build/storage.png', 'Торговля')}
      ${mine ? '' : tile(`data-armyopen="attack" data-ax="${x}" data-ay="${y}"`, 'smallicon/swordred.png', 'Война')}
    </div>
    <button class="pbar cwsave" data-saveplace="${x},${y}">${saved ? 'Место запомнено' : 'Запомнить место'}</button>`;
}

// ---------- Казна: золото игрока ----------
const treasuryWin = () => {
  const log = S.st.user.goldLog || [];
  return `${ribbon('Казна')}<div class="cwin"><img class="cwimg" src="${GFX}coins.png" alt=""><div><div class="cwname">Монеты</div><b>${fmtFull(S.st.user.gold)}</b></div></div>
  <p class="parch-note">Монеты выдаёт администрация. Тратятся на подарки, репутацию, праздники, ритуалы и казну альянса.</p>
  ${ribbon('История')}${log.map((x) => `<div class="glog"><span class="${x.delta > 0 ? 'plus' : 'minus'}">${x.delta > 0 ? '+' : ''}${fmtFull(x.delta)}</span><span>${esc(x.reason)}<br><small>${new Date(x.at).toLocaleString('ru-RU')} · осталось ${fmtFull(x.left)}</small></span></div>`).join('') || '<p class="parch-note">Операций пока не было.</p>'}`;
};

// ---------- прочие окна ----------
const notesWin = () => `${ribbon('Блокнот')}${S.notes === null ? '<p class="parch-note">Загрузка…</p>' : `<form class="stack" data-form="notes"><textarea name="text" rows="14" placeholder="Заметки видите только вы">${esc(S.notes)}</textarea><button class="btn primary">Сохранить</button></form>`}`;
// «Замки» — как в оригинале: страницы по 15, строка-кнопка «№. Название / X: , Y: / Столица»; нажатие — перейти в замок.
// текущий замок подсвечен золотом
const CASTLES_PAGE = 15;
S.castlesPage = 0;
function castlesWin() {
  const list = S.st.castles || [], pages = Math.max(1, Math.ceil(list.length / CASTLES_PAGE));
  const pg = S.castlesPage = Math.min(S.castlesPage, pages - 1);
  return `${ribbon('Замки')}${pages > 1 ? `<div class="cpages">${Array.from({ length: pages }, (_, i) => `<button class="cpage ${i === pg ? 'on' : ''}" data-cpage="${i}">${i + 1}</button>`).join('')}</div>` : ''}
    ${list.slice(pg * CASTLES_PAGE, pg * CASTLES_PAGE + CASTLES_PAGE).map((c, i) => `<div class="cbarw"><button class="cbar ${c.active ? 'active' : ''}" ${c.active ? '' : `data-switch="${c.id}"`}>
      ${pg * CASTLES_PAGE + i + 1}. ${esc(c.name)}<br>X: ${c.x}, Y: ${c.y}${c.capital ? '<br>Столица' : ''}</button></div>`).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => { const b = e.target.closest('[data-cpage]'); if (b) { S.castlesPage = Number(b.dataset.cpage); refreshSheet(); } });
function advisorWin() {
  const c = S.st.castle, tips = [];
  const L = (id) => buildingLevel(id);
  if (!c.queue.length) tips.push('Очередь строительства пуста — стройте! Одновременно можно до ' + maxQueue() + ' строек.');
  if (L(0) < 3) tips.push('Развивайте Ратушу до 3 уровня — она открывает Казарму, Военный штаб и Рынок, а каждое её развитие ускоряет стройки на 5%.');
  if (L(1) < 3) tips.push('Склад переполняется — развивайте Склад, иначе излишки ресурсов пропадают.');
  const prodCells = c.grid[1].filter((b) => [5, 7, 8, 9].includes(b)).length;
  if (prodCells < 8) tips.push('Стройте добывающие здания на Землях: лес — Дровосек, валуны — Каменьщик, горы — Рудник, трава — Огород.');
  if (L(3) && !Object.values(c.mil.units).some((n) => n > 0)) tips.push('Казарма есть, а войск нет — натренируйте защитников.');
  if (L(3) && !L(2)) tips.push('Постройте Военный штаб — без него нельзя отправлять армии и нанять генерала.');
  if (L(2) && !c.mil.general) tips.push('Наймите генерала в Военном штабе — он усиливает армию и растёт в уровне.');
  if (!L(22)) tips.push('Забор даёт бонус к защите замка и всех войск в нём.');
  if (!L(26)) tips.push('Тайник прячет часть ресурсов от грабителей.');
  if (!tips.length) tips.push('Замок развивается отлично! Грабьте лагеря Дикарей и Лесорубов на карте мира и поднимайтесь в Зале Славы.');
  return `${ribbon('Советник')}<div class="advisor"><img src="${GFX}units/${S.cat.mil.raceDir[S.st.user.race]}/wisdom.png${S.st.user.race === 'orcs' ? '?orc' : ''}" alt=""><div>${tips.map((t) => `<p>${esc(t)}</p>`).join('')}</div></div>`;
}
const newsWin = () => `${ribbon('Новости')}<div class="pstats"><b>Тестовый сервер</b><br>Работают: постройки и таблицы уровней, армии и генералы, бои и набеги, разведка, экспедиции и артефакты,
  рынок, альянсы, науки, религия, чат, друзья, репутация, Зал Славы.<br><br>Скорость мира ×${S.cat.speed}.</div>`;
const contactsWin = () => `${ribbon('Контакты')}<div class="pstats">Вопросы и ошибки — через «Инфо → Служба поддержки»: сообщение сохранится на сервере и попадёт разработчикам.</div>`;
const menuDescWin = () => `${ribbon('Описание меню')}<div class="pstats">${Object.values(MENUS).map((m) => `<b>${m.label}</b>: ${m.items().filter(Boolean).map((i) => i[0]).join(', ')}`).join('<br><br>')}</div>`;
const helpWin = () => `${ribbon('Справка')}<div class="mitems light">
  <button class="mitem" data-act="book"><img src="${GFX}build/university.png" alt=""><span>Справочник зданий</span></button>
  <button class="mitem" data-act="army"><img src="${GFX}units/human/knight.png" alt=""><span>Войска</span></button>
  <button class="mitem" data-act="rules"><img src="${GFX}smallicon/Ekoscience.png" alt=""><span>Формулы</span></button></div>`;
const settingsWin = () => `${ribbon('Настройки')}<div class="pstats">Игрок: <b>${esc(S.st.user.login)}</b> · ${esc(S.st.user.raceName)}<br>Скорость мира ×${S.cat.speed}</div>
  <label class="cchk setchk"><input type="checkbox" data-showlvl ${S.showLvl ? 'checked' : ''}><i></i><img src="gfx3d/top/btn_lvl.png" alt=""> Показывать уровни зданий в замке</label>
  <div class="mitems light"><button class="mitem" data-act="bug"><img src="${GFX}smallicon/soft_help.png" alt=""><span>Сообщить об ошибке</span></button>
  <button class="mitem" data-act="logout"><img src="${GFX}smallicon/softclose.png" alt=""><span>Выйти из игры</span></button></div>`;

// ---------- сообщения сервера ----------
const prevMilMsg = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'profile') return; // обрабатывается в app.js
  if (m.t === 'chatdel') { S.chat = S.chat.filter((x) => x.id !== m.id); chatLine(); chatListUpdate(); return; }
  if (m.t === 'chatusers') { S.chatUsers = m.list; const b = $('[data-chatusers]'); if (b) b.innerHTML = `<img src="${GFX}chat/players.png" alt=""> Игроки (${m.list.length})`; return refreshSheet(); }
  if (m.t === 'chatlog') { S.chat = m.list; chatLine(); refreshSheet(); const l = $('#chatList'); if (l) l.scrollTop = l.scrollHeight; return; }
  if (m.t === 'chatmsg') { S.chat.push(m.msg); if (S.chat.length > 50) S.chat.shift(); chatLine(); chatListUpdate(); return; }
  if (m.t === 'allyinfo') { S.allyInfo = m.ally; return refreshSheet(); }
  if (m.t === 'hall') { S.hall = m.hall; return refreshSheet(); }
  if (m.t === 'halls') { S.hallWho = m.who; S.halls = m.list; S.hallPages = m.pages; S.hallSeason = m.season; S.hallLast = m.last; return refreshSheet(); }
  if (m.t === 'ratings') { S.rlist = m.list; return refreshSheet(); }
  if (m.t === 'players') { S.plist = m.list; return refreshSheet(); }
  if (m.t === 'notes') { S.notes = m.text; return refreshSheet(); }
  prevMilMsg(m);
};
// полные списки разделов профиля (нажатие на ряд значков)
function profileListWin(kind) {
  const p = S.lastProfile; if (!p) return '';
  if (kind === 'gifts') return `${ribbon(`Подарки - ${(p.gifts || []).length}`)}<p class="center"><b>${esc(p.login)}</b></p><div class="pgifts">${(p.gifts || []).map((g) => { const G = S.cat.gifts[g.gift] || {}; return `<button class="pgift" data-cprof="${g.fromId}" title="${esc(G.name || '')}"><img src="${GFX}${G.img}" alt=""><small>от ${esc(g.from)}</small>${g.text ? `<i>«${esc(g.text)}»</i>` : ''}</button>`; }).join('')}</div>`;
  return `${ribbon('Награждения')}<p class="center"><b>${esc(p.login)}</b></p>${(p.awards || []).map((m) => `<div class="award"><img src="${GFX}smallicon/status/${m.kind}.png" alt=""><div><b>${esc(ALLY_MEDAL[m.kind] || 'Медаль')} от альянса [${esc(m.tag)}]</b><small>${m.text ? `«${esc(m.text)}» · ` : ''}вручил ${esc(m.by)} · получено ${fmtDay(m.at)}</small></div></div>`).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => { const t = e.target.closest('[data-plist]'); if (t) openSheet(() => profileListWin(t.dataset.plist)); });
// профиль — новый вид
profileSheet = function (p) { S.lastProfile = p; return profileWin(p); }; // eslint-disable-line no-global-assign

$('#sheetBody').addEventListener('click', (e) => {
  const md = e.target.closest('[data-mymedals],[data-medal]');
  if (md) { const p = S.lastProfile; if (md.dataset.medal) { const m = p.medals.find((x) => `${x.at}:${x.hall}` === md.dataset.medal); if (m) toast(`${m.name}: ${['I', 'II', 'III'][m.place - 1]} место за ${monthName(m.month)}, получено ${fmtDay(m.at)}`); return; } return openSheet(() => medalsWin(p)); }
  const hp = e.target.closest('[data-hpage],[data-hmore]');
  if (hp) { if (hp.dataset.hpage !== undefined) { S.hallPage = Number(hp.dataset.hpage); refreshSheet(); $('#sheetBody').scrollTop = 0; return; } return openHall(hp.dataset.hmore); }
  const hx = e.target.closest('[data-hpg],[data-hdesc],[data-harch]');
  if (hx) { if (hx.dataset.hpg !== undefined) return send({ t: 'hall', id: S.hallId, page: Number(hx.dataset.hpg), ...(S.hallWhoId !== undefined ? { who: S.hallWhoId } : {}) }); if (hx.dataset.hdesc) return openSheet(hallDescWin); return openSheet(hallArchWin); }
  const t = e.target.closest('[data-cprof],[data-ptile],[data-hof],[data-soon],[data-switch],[data-switchxy],[data-saveplace],[data-mksend]'); if (!t) return;
  const d = t.dataset;
  if (d.switch) { closeAllSheets(); Iso.cams = {}; S.switchTo = true; return send({ t: 'switch', id: Number(d.switch) }); }
  if (d.switchxy) { const [x, y] = d.switchxy.split(',').map(Number); const c = (S.st.castles || []).find((k) => k.x === x && k.y === y); if (c) { closeAllSheets(); Iso.cams = {}; S.switchTo = true; send({ t: 'switch', id: c.id }); } return; }
  if (d.saveplace) { const [x, y] = d.saveplace.split(',').map(Number); S.places = S.places || []; if (!S.places.some((p) => p.x === x && p.y === y)) S.places.push({ x, y }); store.set('tw.places', S.places); toast('Место запомнено.'); return refreshSheet(); }
  if (d.cprof) return send({ t: 'profile', id: Number(d.cprof) });
  if (d.mksend) { const [x, y] = d.mksend.split(','); if (!MY().merchants.level) return toast(`В этом замке нет Рынка — ресурсы отправляют торговцы с Рынка. Постройте Рынок или перейдите в замок, где он есть.`, 'err'); S.mkt = { x, y, res: {} }; return openSheet(mktGiveWin); }
  if (d.hof !== undefined) return openHalls(d.hof ? Number(d.hof) : undefined);
  if (d.soon) return openSoon(d.soon);
  if (d.ptile) {
    if (t.classList.contains('off')) return;
    const p = S.lastProfile, id = Number(d.pid);
    if (d.ptile === 'treasury') return openSheet(treasuryWin);
    if (d.ptile === 'premium') return openPremium(p.self ? null : p.login);
    if (d.ptile === 'rep') { S.repTo = p; S.repCoins = 1; return openSheet(repWin); }
    if (d.ptile === 'gift') { S.giftTo = p; return openSheet(giftsWin); }
    if (d.ptile === 'friend') { send({ t: 'friend', op: p.friend ? 'del' : 'add', id }); return send({ t: 'profile', id }); }
    if (d.ptile === 'msg') { if (p.self) { closeAllSheets(); return ACTS.mail(); } return openDialog(p.id); }
    if (d.ptile === 'map') { closeAllSheets(); S.world = null; setTab('world'); return send({ t: 'world', cx: p.castles[0].x, cy: p.castles[0].y }); }
    if (d.ptile === 'info') return openSheet(() => profileInfoWin(p));
    if (d.ptile === 'attack') return openArmySheet({ mission: 'attack', x: p.castles[0].x, y: p.castles[0].y });
    if (d.ptile === 'hof') return openHalls(p.id);
    if (d.ptile === 'more') return openSheet(() => profileMoreWin(p)); // «•••» — остальные действия
  }
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.form; if (!k) return;
  if (k === 'chat') { e.preventDefault(); const v = f.text.value.trim(); if (v) send({ t: 'chat', text: v }); f.text.value = ''; S.chatDraft = ''; }
  if (k === 'search') { e.preventDefault(); S.plist = null; send({ t: 'search', q: f.q.value }); }
  if (k === 'notes') { e.preventDefault(); S.notes = f.text.value; send({ t: 'notes', text: f.text.value }); }
  if (k === 'about') { e.preventDefault(); send({ t: 'about', text: f.text.value }); S.lastProfile.about = f.text.value; }
});

// после входа — лента чата
const prevOnState = onState;
onState = function (m) {
  const first = !S.st; prevOnState(m);
  if (first) { S.places = store.get('tw.places') || []; send({ t: 'chatlog' }); chatLine(); }
  if (S.switchTo) { S.switchTo = false; setTab('castle'); } // переход в другой замок — показать его
}; // eslint-disable-line no-global-assign

// ---------- загрузка аватара ----------
// Картинка не уходит на сервер как файл: браузер вырезает квадрат, уменьшает до 96×96
// и отправляет только пиксели RGBA; сервер сам собирает из них PNG (server/src/avatar.js).
const AVA = 96;
const avInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
avInput.addEventListener('change', async () => {
  const f = avInput.files[0]; avInput.value = '';
  if (!f) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return toast('Нужна картинка PNG, JPG, WEBP или GIF.', 'err');
  if (f.size > 15 * 1024 * 1024) return toast('Файл больше 15 МБ.', 'err');
  let bmp;
  try { bmp = await createImageBitmap(f); } catch { return toast('Не удалось открыть картинку.', 'err'); }
  const side = Math.min(bmp.width, bmp.height), cv = document.createElement('canvas'); cv.width = cv.height = AVA;
  const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, AVA, AVA);
  const px = g.getImageData(0, 0, AVA, AVA).data;
  let bin = ''; for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  send({ t: 'avatar', op: 'set', px: btoa(bin), acct: 1 });
});
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-avatar]'); if (!t) return;
  if (t.dataset.avatar === 'set') return avInput.click();
  if (confirm('Удалить аватар?')) send({ t: 'avatar', op: 'del', acct: 1 });
});

// ---------- Подарки: каталог «Все / Новые», отправка игроку ----------
function giftsWin() {
  const p = S.giftTo, list = Object.entries(S.cat.gifts || {});
  return `${ribbon('🎁 Подарки')}
    <div class="combo"><select><option>Все</option></select></div>
    <div class="center bwline">Все <span class="plink">Новые</span></div>
    <div class="pager"><button>◀◀</button><button>◀</button><span>1</span><button>▶</button><button>▶▶</button></div>
    <div class="bwline center">Кому: <b>${esc(p.login)}</b> · у вас ${gimg('coins_s.png', 'ri')} ${fmtFull(S.st.user.gold || 0)}</div>
    ${list.map(([id, g]) => `<div class="giftrow"><img src="${GFX}${g.img}" alt="">
      ${g.premium ? '<div class="gprem">Премиум подарок</div>' : ''}
      <div class="bwline center">${esc(g.name)} ( ${gimg('coins_s.png', 'ri')} ${g.gold})</div>
      ${g.premium && !isPrem() ? '<div class="center bwline muted">🔒 Уникальный подарок — дарить можно с премиумом</div>' : `<div class="center bwline">🎁 <a class="plink" data-giftsend="${id}">Отправить</a> игроку!</div>`}</div>`).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-giftsend]'); if (!t) return;
  const p = S.giftTo, g = S.cat.gifts[t.dataset.giftsend];
  const text = prompt(`Подарок «${g.name}» игроку ${p.login} за ${g.gold} золота. Подпись (необязательно):`, '');
  if (text === null) return;
  send({ t: 'gift', to: p.id, gift: t.dataset.giftsend, text });
  closeSheet();
});

// ---------- Таблица репутации (как в оригинале): мечи, якоря, топоры по порогам ----------
// [название, пороги; картинка — gfx/rep/<key>.png; у топоров рас каждый следующий значок свой: <key>_1…_5]
const REP_TIERS = [
  ['bronze', 'Бронзовые мечи', [10, 50, 100, 150, 200]], ['silver', 'Серебряные мечи', [250, 320, 390, 460, 530]],
  ['gold', 'Золотые мечи', [600, 700, 800, 900, 1000]], ['plat', 'Платиновые мечи', [1100, 1350, 1600, 1850, 2100]],
  ['anchor', 'Якоря', [2350, 2750, 3150, 3550, 3950]], ['thunder', 'Грозовые мечи', [4350, 5100, 5850, 6600]],
  ['fire', 'Огненные мечи', [7350, 8350, 9350, 10350]], ['winged', 'Крылатые мечи', [11350, 12500, 13750, 14950]],
  ['axe_bronze', 'Бронзовые топоры', [16150, 17650, 19150, 20650]], ['axe_silver', 'Серебряные топоры', [22150, 24150, 26150, 28150]],
  ['axe_gold', 'Золотые топоры', [30150, 32650, 35150, 37650]], ['axe_gnome', 'Топоры гномов', [40150, 45150, 50150, 55150, 60150], true],
  ['axe_orc', 'Топоры орков', [65150, 80150, 95150, 110150, 125150], true], ['axe_elf', 'Топоры эльфов', [140150, 165150, 190150, 215150, 240150], true],
  ['axe_human', 'Топоры людей', [265150, 295150, 325150, 355150, 385150], true], ['crystal', 'Хрустальные мечи', [418000]],
];
function repTier(rep) {
  let res = null;
  for (const [key, name, th, multi] of REP_TIERS) th.forEach((t, i) => { if (rep >= t) res = { key, name, n: i + 1, multi }; });
  return res;
}
function repIcons(rep) {
  const t = repTier(Number(rep) || 0); if (!t) return '';
  const src = (i) => `${GFX}rep/${t.multi ? `${t.key}_${i + 1}` : t.key}.png`;
  return `<span class="repi" title="${esc(t.name)}: ${t.n}">${Array.from({ length: t.n }, (_, i) => `<img src="${src(i)}" alt="">`).join('')}</span>`;
}
function repTableWin() {
  return `${ribbon('Таблица репутации')}${REP_TIERS.map(([key, name, th, multi]) => `<div class="section">${esc(name)}:</div>
    ${th.map((t, i) => `<div class="reprow"><span>${i + 1}-${t}</span><span class="repi">${Array.from({ length: i + 1 }, (_, j) => `<img src="${GFX}rep/${multi ? `${key}_${j + 1}` : key}.png" alt="">`).join('')}</span></div>`).join('')}`).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-reptable]')) openSheet(repTableWin); });

// ---------- Поднять Репутацию: за золото, 1 монета = 2 репутации ----------
function repWin() {
  const p = S.repTo, k = S.cat.repPerGold || 2, c = S.repCoins || 1, gold = S.st.user.gold || 0;
  return `${ribbon('Поднять Репутацию')}
    <div class="bwline center">Игрок: <b>${esc(p.login)}</b></div>
    <div class="bwline center">Репутация (${fmtFull(p.reputation)}): ${repIcons(p.reputation)}</div>
    <div class="bwline center">1 ${gimg('coins_s.png', 'ri')} = ${k} 👍 · у вас ${gimg('coins_s.png', 'ri')} ${fmtFull(gold)}</div>
    <div class="arow"><span>Монет:</span><input class="anum" type="number" inputmode="numeric" min="1" value="${c}" data-repcoins></div>
    <div class="bwline center">Станет: <b data-repafter>${fmtFull(p.reputation + c * k)}</b> <span data-repicons>${repIcons(p.reputation + c * k)}</span></div>
    <button class="pbar" data-repgo>Поднять на <span data-repadd>${c * k}</span></button>`;
}
$('#sheetBody').addEventListener('input', (e) => {
  if (e.target.dataset.repcoins === undefined) return;
  const p = S.repTo, k = S.cat.repPerGold || 2; S.repCoins = Math.max(1, Math.floor(Number(e.target.value)) || 1);
  const v = p.reputation + S.repCoins * k;
  $('[data-repafter]').textContent = fmtFull(v); $('[data-repicons]').innerHTML = repIcons(v); $('[data-repadd]').textContent = S.repCoins * k;
});
$('#sheetBody').addEventListener('click', (e) => {
  if (!e.target.closest('[data-repgo]')) return;
  document.activeElement && document.activeElement.blur();
  send({ t: 'rep', id: S.repTo.id, coins: S.repCoins || 1 }); closeSheet();
});

// «Пригласить в альянс» из профиля игрока без альянса
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-allyinv]'); if (!b) return;
  b.disabled = true; send({ t: 'alliance', op: 'invite', id: Number(b.dataset.allyinv) });
  setTimeout(() => send({ t: 'profile', id: Number(b.dataset.allyinv) }), 300);
});

// окно «Аватара» (как в оригинале): большая аватарка, «Мне нравится!», список игроков, которым она понравилась
S.ava = null;
function openAva(id) { S.ava = { id, list: null, show: false }; send({ t: 'avalikes', id }); openSheet(avaWin); }
function avaWin() {
  const a = S.ava, p = S.lastProfile && S.lastProfile.id === a.id ? S.lastProfile : null, L = a.data;
  const img = p ? avatarImg(p, 'avabig') : L ? `<img class="avabig" src="avatar/${a.id}.png" alt="">` : '';
  const self = S.st.user.id === a.id;
  if (a.show && L) return `${ribbon('Аватарка')}<div class="center">${img}</div><p class="center avaq">Список игроков, которым понравилась аватарка:</p>
    ${L.list.length ? `<div class="avalist">${L.list.map((u) => `<button class="avarow" data-cprof="${u.id}"><span class="avasm">${u.avatar ? `<img src="avatar/${u.id}.png?v=${u.avatar}" alt="">` : raceAva(u.race)}</span>
      <span><b>${esc(u.login)}</b><br>Рейтинг: ${fmtFull(u.rating)} ${repIcons(u.rep)} (${fmtFull(u.rep)})</span></button>`).join('')}</div>` : '<p class="parch-note">Пока никто не голосовал.</p>'}`;
  return `${ribbon('Аватара')}<div class="center">${img}</div>
    ${self ? '<p class="center avaq">Это Ваша аватарка.</p>' : `<p class="center avaq">Вам понравилась эта аватарка?<br>Сообщите об этом!</p>
      <div class="center">${L && L.mine ? '<span class="avalikedone">✔ Вы уже проголосовали</span>' : '<button class="avalikebtn" data-avalike>Мне нравится!</button>'}</div>`}
    <p class="center avaq"><button class="avalink" data-avalist>Игроки</button>, которым понравилась эта аватарка${L ? ` (${L.list.length})` : ''}.</p>`;
}
function avaMsg(m) {
  if (!S.ava || S.ava.id !== m.id) return;
  S.ava.data = m; refreshSheet();
  if (m.done) { const d = document.createElement('div'); d.className = 'rinfo'; d.innerHTML = `<div class="rinfo-box okbox"><p>${esc(m.done)}</p><button type="button" class="okbtn">Ок</button></div>`;
    d.addEventListener('click', (e) => { if (e.target.closest('.okbtn') || e.target === d) d.remove(); }); document.body.appendChild(d); }
}
$('#sheetBody').addEventListener('click', (e) => {
  const v = e.target.closest('[data-avaview]'); if (v) return openAva(Number(v.dataset.avaview));
  if (e.target.closest('[data-avalike]')) return send({ t: 'avalike', id: S.ava.id });
  if (e.target.closest('[data-avalist]')) { S.ava.show = true; return openSheet(avaWin); }
});
