'use strict';
// Оболочка как в Android-клиенте «Третий Мир 3D»: конверты наверху, панель локаций справа, внизу «Меню» — чат с часами —
// шестерёнка; меню — полоса из 7 кнопок (Кабинет, Локации, Альянс, Почта, Игры, Инфо, Рейтинг) и окно-список над ней;
// окна — пергамент с красными лентами, внизу ◀ и ✕. Стили окон — из APK клиента (web/gfx3d).

const G3 = 'gfx3d/';
const me = () => S.st.user.id;
const ribbon = (t) => `<div class="ribbon">${esc(t)}</div>`;
const soonWin = (title) => () => `${ribbon(title)}<div class="parch-note">Этот раздел скоро откроется — следите за новостями игры.</div>`;
const openSoon = (title) => openSheet(soonWin(title));
const raceIcon = (race) => gimg(RACE_IMG[race] || 'units/human/hd/general.png', 'rico');

// ---------- меню ----------
const M3 = (n) => `gfx/menu/${n}.png`; // иконки плиток меню — своя графика «Средневековья» (web/gfx/menu)
const MENUS = {
  cabinet: { label: 'Кабинет', icon: 'menu2/cabinet.png', items: () => [
    ...(S.st.user.admin ? [['Админка', 'admin_badge_s.png', () => openSheet(adminHtml)]] : []),
    ...(S.st.user.smod || S.st.user.admin ? [['Модерация', 'smod_badge_s.png', () => openSmod()]] : []),
    ...(S.st.user.staff ? [[S.st.user.staffNew ? `МАСТЕРА (${S.st.user.staffNew})` : 'МАСТЕРА', M3('blogs'), () => openStaff()]] : []), // общение админа и тестеров (staff.js)
    ['Задания', M3('quests'), () => openQuests()],
    ['Профиль', M3('profile'), () => openAccount()],
    ['Советник', `units/${S.cat.mil.raceDir[S.st.user.race]}/wisdom.png`, () => openSheet(advisorWin)],
    ...(shopVisible() ? [['Лавка Короля', 'shop/stall.png', () => openShop()]] : []),
    ['Казна', M3('treasury'), () => openSheet(treasuryWin)],
    ['Премиум', M3('premium'), () => openPremium()],
    ['Королевство', M3('loyalty'), () => openKingdom()],
    ['Ресурсы', M3('resources'), () => openRes()],
    ['Подарки', M3('gifts'), () => { S.gl = null; openSheet(giftListWin); send({ t: 'giftlist', id: S.st.user.id, page: 0 }); }], // подаренные мне — сразу списком (у каждого — свои)
    [S.st.user.zagsNew ? `ЗАГС (${S.st.user.zagsNew})` : 'ЗАГС', 'zags/rings.png', () => openZags()],
    ['Репутация', M3('reputation'), () => openRepLog()], // своя история; общий рейтинг — «Рейтинг» → «Авторитет»
    ['События', M3('events'), () => openReports()],
    [S.st.user.friendsNew ? `Друзья (${S.st.user.friendsNew})` : 'Друзья', M3('friends'), () => openFriends()],
    ['Поиск', M3('search'), () => openPlayers('search')],
    ['Земляки', 'ground/castle_small.png', () => openPlayers('nearby')],
    ['Биржа', M3('exchange'), () => openMarket()],
    ['Блокнот', M3('files'), () => { S.notes = null; send({ t: 'notes' }); openSheet(notesWin); }],
    ['Настройки', M3('settings'), () => openSheet(settingsWin)],
  ] },
  locations: { label: 'Локации', icon: 'menu2/locations.png', items: () => [
    ['Замок', 'gfx3d/locs2/castle.png', () => setTab('castle')],
    ['Земли', 'gfx3d/locs2/lands.png', () => setTab('lands')],
    ['Мир', 'gfx3d/locs2/world.png', () => setTab('world')],
    ['Мои замки', 'gfx3d/locs2/castles.png', () => openSheet(castlesWin)],
    ['Штаб', 'build/hd3/mbases.png', () => ACTS.hq()],
    ['Генерал', `units/${HD_DIR[S.st.user.race] || 'human/hd'}/general.png`, () => openGeneral()],
    ['Армии', 'build/hd3/baraks.png', () => openSheet(armiesWin)],
    ['Поход', 'smallicon/hd/attack.png', () => openArmySheet({})],
    ['Ресурсы', 'gfx3d/locs2/res.png', () => openRes()],
    ['Здания', 'build/hd3/build.png', () => openSheet(() => ribbon('Здания замка') + summaryHtml(VIEW.CASTLE))],
    ['Постройки', 'build/lands/farm5.png', () => openSheet(() => ribbon('Постройки на землях') + summaryHtml(VIEW.LANDS))],
  ] },
  alliance: { label: 'Альянс', icon: 'menu2/alliance.png', note: () => (MY().alliance ? '' : 'Вы не состоите в альянсе.'), items: () => [
    ...(!MY().alliance && (MY().invites || []).length ? [[`Приглашения (${MY().invites.length})`, 'gfx3d/rep/envnew.svg', () => openInvites()]] : []),
    [MY().alliance ? 'Мой альянс' : 'Вступить', MY().alliance ? M3('ally') : M3('ally'), () => { if (MY().alliance) return openAlly(); const i = S.st.castle.grid[0].indexOf(13); if (i < 0) return toast('Нужен Дипломатический центр — постройте его в замке.', 'err'); openCell(VIEW.CASTLE, i); }],
    ['Рейтинг', M3('castle'), () => openRating('alliances')],
    ['Справка', M3('help'), () => openSheet(helpWin)],
  ] },
  mail: { label: 'Почта', icon: 'menu2/mail.png', items: () => [
    ['Новое', M3('new'), () => { const who = prompt('Кому написать? Ник игрока:'); if (who && who.trim()) openDialog(who.trim()); }],
    ['Сообщения', M3('msgs'), () => ACTS.mail()],
    ['Отчеты', M3('reports'), () => openReports()],
    ['Приват.', M3('privacy'), () => openPrivacy()],
    ['Форум', M3('forum'), () => openForum()],
    ['Чат', M3('chat'), () => openChat()],
    ['Горн', M3('horn'), () => openReports()],
  ] },
  games: { label: 'Игры', icon: 'menu2/games.png', items: () => [
    ['Сундучки', M3('chests'), () => openChests()],
    ['Орел-решка', 'coin/stack.png', () => openCoin()],
  ] },
  info: { label: 'Инфо', icon: 'menu2/info.png', items: () => [
    ['Новости', M3('news'), () => openNews()],
    ['Поддержка', M3('support'), () => ACTS.bug()],
    ['Справка', M3('help'), () => openSheet(helpWin)],
    ['Контакты', M3('contacts'), () => openSheet(contactsWin)],
    ['Обзор', M3('overview'), () => openSheet(menuDescWin)],
    ['Звуки', M3('sounds'), () => openSound()],
  ] },
  rating: { label: 'Рейтинг', icon: 'menu2/rating.png', items: () => [
    ['Зал Славы', M3('hof'), () => openHalls()],
    ['Игрок', M3('player'), () => openRating('players')],
    ['Замок', M3('castle'), () => openRating('castles')],
    ['Альянс', M3('ally'), () => openRating('alliances')],
    ['Авторитет', M3('authority'), () => openRating('reputation')],
    ['Семейные пары', M3('pairs'), () => openPairs()],
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
    `<button class="ptile" data-mi="${i}"><img src="${it[1].startsWith('gfx') ? it[1] : GFX + it[1]}" alt=""><span${it[0].length > 10 ? ' class="long"' : ''}>${esc(it[0])}</span></button>`).join('')}${'<i class="ptile empty"></i>'.repeat(pad)}</div></div>`;
  // иконки нижней полосы — из оригинального клиента (web/gfx3d/menu)
  $('#menubar').innerHTML = Object.entries(MENUS).map(([k, v]) => `<button data-menu="${k}" class="${k === S.menu ? 'on' : ''}"><img src="${G3}${v.icon}" alt=""><span>${v.label}</span></button>`).join('');
}
function openMenu(k = 'cabinet') {
  S.menu = k; renderMenu(); $('#menu').classList.remove('hidden'); document.body.classList.add('menuopen'); // полоска «Задание» под меню прячется
  pushOverlay();
}
function closeMenu(fromPop) { if (!S.menu) return; S.menu = null; $('#menu').classList.add('hidden'); document.body.classList.remove('menuopen'); if (!fromPop) popOverlay(); }
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
  if (k === 'res') return openRes();
});
$('#chatline').addEventListener('click', () => openChat());
$('#btnGear').addEventListener('click', () => openSheet(settingsWin));

// ---------- чат ----------
S.chat = [];
function chatLine() {
  const vis = S.chat.filter((x) => !isBlack(x.fromId)), m = vis[vis.length - 1];
  $('#chatmsg').innerHTML = m ? `<b>${esc(m.from)}</b> ${repIcons(m.rep)} ${chatText(m)}` : `<span class="muted">Чат пуст${S.st && S.st.user.chatLow ? '' : ' — напишите первым'}</span>`;
}
// «Главный чат» как в оригинале: Выход / Игроки (N), сообщения «ЧЧ:ММ [ник] текст», смайлы, поле ввода внизу.
// Нажатие на ник — обращение «ник, » в поле ввода; сообщения, где упомянут я, подсвечены.
// смайлы чата: новые (gfx3d/smiles, код :имя:) и старые пиксельные (код :s-имя: и прежние коды — для старых сообщений)
const SMILES = ['angel','beer','devil','worry','heart','tongue','kiss','cool','laugh','wink','rose','handshake','cry','hmm','smile','blush','wow','love','angry','confused','dislike','like','coins','swords','shield','lips','ghost','cheers','crown','cup','flower','tulip','sun','gift','cake','strawberry','apple','banana','watermelon','orange','cherry','poop','chicken','goat','bear','cat','panda','butterfly','bomb','pizza'];
const OLD_SMILES = ['smile', 'sad', 'wok', 'angry', 'heart', 'kiss', 'notund', 'Uvula'];
const SMILE_SET = new Set(SMILES);
const smileSrc = (k) => (SMILE_SET.has(k) ? `gfx3d/smiles2/${k}.png` : `${GFX}smallicon/smiles/${k}.png`);
// текст сообщения чата; премиум-цвет — только допустимые значения #rrggbb
// лайк / дизлайк под сообщением чата (за своё — только счётчик)
const chatVotes = (m) => { const up = (m.up || []).length, dn = (m.dn || []).length; if (!up && !dn) return ''; // счётчик — только если уже оценили; голос — через нажатие на сообщение
  return `<span class="cvotes">${up ? `<span class="cvote up">👍 ${up}</span>` : ''}${dn ? `<span class="cvote dn">👎 ${dn}</span>` : ''}</span>`; };
const chatText = (m) => (/^#[0-9a-f]{6}$/i.test(m.color || '') ? `<span class="ccol" style="color:${m.color}">${smiles(esc(m.text))}</span>` : smiles(esc(m.text)));
const smiles = (html) => html.replace(/:([A-Za-z]{2,12}):/g, (m, k) => (SMILE_SET.has(k) || OLD_SMILES.includes(k) ? `<img class="csm" src="${smileSrc(k)}" alt="">` : m));
S.chatUsers = null; S.smileOpen = false;
function openChat() { send({ t: 'chatlog' }); send({ t: 'chatusers' }); S.smileOpen = false; S.chatAdm = false; S.chatLock = false; S.chatNew = 0; S.chatSaved = null; openSheet(chatWin); setTimeout(() => { const l = $('#chatList'); if (l) l.scrollTop = l.scrollHeight; }, 50); }
// одно сообщение ленты; лента перевёрнута — новое первым в разметке, внизу на экране
const CHAT_SHOW = 100;
function chatMsgHtml(m, my = S.st.user.login.toLowerCase()) {
  if (m.poll || m.pic || m.picGone || m.wheel) return chatSpecialHtml(m);
  const hit = m.fromId !== me() && m.text.toLowerCase().includes(my);
  return `<div class="cm ${hit ? 'hit' : ''} ${m.fromId === me() ? 'mine' : ''} ${m.role === 'smod' ? 'smodmsg' : ''}" data-chatpop="${m.fromId}" data-nick="${esc(m.from)}" data-mid="${m.id}" data-k="${m.id}"><small>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small> <b>[${esc(m.from)}]</b>${m.role ? ` <img class="admbadge s" src="${GFX}${m.role === 'admin' ? 'admin_badge_s.png' : m.role === 'smod' ? 'chat/smoder.png' : 'chat/moder.png'}" alt="">` : ''}${m.rep >= 10 ? ` ${repIcons(m.rep)}` : ''} ${chatText(m)}${chatVotes(m)}</div>`;
}
const chatListHtml = (my) => S.chat.filter((m) => !isBlack(m.fromId)).slice(-CHAT_SHOW).reverse().map((m) => chatMsgHtml(m, my)).join('') || `<p class="parch-note">Сообщений пока нет${S.st.user.chatLow ? '.' : ' — напишите первым.'}</p>`;
function chatWin() {
  const my = S.st.user.login.toLowerCase();
  const n = S.chatUsers ? S.chatUsers.length : '…';
  return `${ribbon('Главный чат')}
    <div class="chattop ${chatIsMod() ? 'withlock' : ''}"><button class="lbar" data-chatexit><img src="${GFX}chat/exit.png" alt=""> Выход</button><button class="lbar" data-chatusers><img src="${GFX}chat/players.png" alt=""> Игроки (${n})</button>${chatIsMod() ? `<button class="lbar clock ${chatClosedNow() ? 'on' : ''}" data-chatlock aria-label="Закрыть чат на время"><img src="${GFX}menu/privacy.png" alt=""></button>` : ''}</div>
    ${chatClosedHtml()}${chatPinHtml()}
    <div id="chatList" class="chatlist ${S.smileOpen ? 'short' : ''} ${chatPinHtml() ? 'pinned' : ''}">${chatListHtml(my)}</div>
    ${S.smileOpen ? `<div class="smilebox">${SMILES.map((k) => `<button data-smile="${k}"><img src="${smileSrc(k)}" alt=""></button>`).join('')}</div>` : ''}
    ${S.chatPop ? `<div class="cpop-bg" data-cpopclose><div class="cpop"><button class="cpop-x" data-cpopclose aria-label="Закрыть">✕</button><div class="cpop-nick">${esc(S.chatPop.nick)}</div>
      <div class="cpop-grid"><button class="ptile" data-cpop="reply"><img src="${GFX}chat/reply.png" alt=""><span>Обратиться</span></button>
      <button class="ptile" data-cpop="profile"><img src="${GFX}chat/profile.png" alt=""><span>Профиль</span></button>
      <button class="ptile" data-cpop="report"><img src="${GFX}chat/report.png" alt=""><span>Жалоба</span></button>
      <button class="ptile" data-cpop="private"><img src="${GFX}chat/private.png" alt=""><span>Лично</span></button></div>
      ${(() => { const cm = S.chat.find((x) => x.id === S.chatPop.mid); if (!cm || cm.fromId === me()) return ''; const my = (cm.up || []).includes(me()) ? 1 : (cm.dn || []).includes(me()) ? -1 : 0;
        return `<div class="cpop-mod">Оценить сообщение:</div><div class="cpop-votes"><button class="cvbtn ${my > 0 ? 'on' : ''}" data-cvote="1" data-mid="${cm.id}">👍 Нравится${(cm.up || []).length ? ` · ${cm.up.length}` : ''}</button><button class="cvbtn dn ${my < 0 ? 'on' : ''}" data-cvote="-1" data-mid="${cm.id}">👎 Не нравится${(cm.dn || []).length ? ` · ${cm.dn.length}` : ''}</button></div>`; })()}
      ${S.st.user.admin || S.st.user.mod ? `<div class="cpop-mod">Модерация:</div><div class="cpop-grid">
        <button class="ptile" data-cpop="del"><img src="${GFX}chat/delete.png" alt=""><span>Удалить</span></button>
        <button class="ptile ${S.chatPop.warn ? 'on' : ''}" data-cpop="warn"><img src="${GFX}menu/events.png" alt=""><span>Предупредить</span></button>
        <button class="ptile ${S.chatPop.ban ? 'on' : ''}" data-cpop="ban"><img src="${GFX}chat/ban.png" alt=""><span>Бан в чате</span></button>
        <button class="ptile" data-cpop="lock"><img src="${GFX}menu/privacy.png" alt=""><span>${chatClosedNow() ? 'Чат закрыт' : 'Закрыть чат'}</span></button></div>
        ${S.chatPop.warn || S.chatPop.ban ? `<div class="cpop-info">${(() => { const i = S.chatPop.info; if (!i) return 'Загрузка…';
          const w = i.warns ? `Предупреждений за неделю: <b>${i.warns}</b>${i.last ? `<br><small>последнее ${new Date(i.last.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(i.last.why)}</small>` : ''}` : 'Предупреждений за неделю нет';
          return `${w}${i.chatBan ? `<br><b class="smred">Сейчас запрет в чате ${i.chatBan < 0 ? 'навсегда' : `до ${new Date(i.chatBan).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}</b>` : ''}`; })()}</div>
          <div class="cpop-rule">${ruleSelect('data-crule', S.chatPop.rule)}</div>` : ''}
        ${S.chatPop.warn ? '<button class="lbar cwarnbtn" data-cwarn>Отправить предупреждение</button>' : ''}
        ${S.chatPop.ban ? `<div class="cpop-ban">${[[1, '1 час'], [2, '2 часа'], [8, '8 часов'], [-1, 'Навсегда'], [0, 'Снять бан']].map(([h, t]) => `<button class="pbtn" data-cban="${h}">${t}</button>`).join('')}</div>` : ''}` : ''}</div></div>` : ''}
    ${chatLockHtml()}
    ${S.chatAdm ? `<div class="cpop-bg" data-cadmclose><div class="cpop"><button class="cpop-x" data-cadmclose aria-label="Закрыть">✕</button><div class="cpop-nick">В общий чат</div>
      <div class="cpop-grid cadm-grid"><button class="ptile" data-cadmpic><img src="${GFX}dlg/file.png" alt=""><span>Фото</span></button><button class="ptile" data-cadmpoll><img src="${GFX}menu/blogs.png" alt=""><span>Опрос</span></button>
      <button class="ptile" data-cadmwheel><img src="${GFX}shop/fair.png" alt=""><span>Колесо Фортуны</span></button></div></div></div>` : ''}
    ${S.st.user.chatLow ? `<div class="chatbar chatlow"><img src="${GFX}menu/privacy.png" alt=""><span>Порог входа в чат — ★ ${S.st.user.chatLow.need} рейтинга. У вас ★ ${S.st.user.chatLow.have}. Развивайте замок — и сможете писать.</span></div>` : `<form class="chatbar" data-form="chat"><button type="button" class="cnewbtn ${S.chatNew ? '' : 'hidden'}" data-cnew>${chatNewText()}</button>${S.st.user.admin ? `<button type="button" class="cadmbtn cadmplus" data-cadmmenu aria-label="Фото, опрос или Колесо Фортуны">${S.chatPicBusy ? '⏳' : '+'}</button>` : ''}<button type="button" class="smilebtn" data-smiletoggle aria-label="Смайлы"><img src="${GFX}chat/smiles.png" alt=""></button><input name="text" maxlength="300" autocomplete="off" value="${esc(S.chatDraft || '')}"${chatClosedNow() && !chatIsMod() ? ' disabled placeholder="Чат закрыт"' : ''}><button class="sendbtn" aria-label="Отправить"${chatClosedNow() && !chatIsMod() ? ' disabled' : ''}><img src="${GFX}chat/send.png" alt=""></button></form>`}`;
}
// модератор нажал «Предупредить» или «Бан в чате» — окно длинное: прокрутить к выбору пункта правил и кнопкам
function cpopShowAction() { setTimeout(() => { const bg = $('.cpop-bg'); if (bg && ($('.cwarnbtn') || $('.cpop-ban'))) bg.scrollTop = bg.scrollHeight; }, 30); }
// ---- фото и опросы администратора в общем чате (server: pics.js, chatpoll.js) ----
S.cpolls = {}; S.cpollPin = 0; S.cpollSel = {};
const chatHead = (m) => `<small>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small> <b>[${esc(m.from)}]</b>${m.role ? ` <img class="admbadge s" src="${GFX}${m.role === 'admin' ? 'admin_badge_s.png' : m.role === 'smod' ? 'chat/smoder.png' : 'chat/moder.png'}" alt="">` : ''}`;
// закреплённый вверху чата открытый опрос: вопрос и «Голосовать» / «Итоги» — открывает окно опроса;
// пока идёт запись на Колесо Фортуны (wheel.js), закреплено оно
function chatPinHtml() { const wp = typeof whPinHtml === 'function' ? whPinHtml() : ''; if (wp) return wp;
  const p = S.cpollPin && S.cpolls[S.cpollPin]; if (!p) return '';
  return `<button class="cpin" data-cpollopen="${S.cpollPin}"><span>📌 📊 ${esc(p.q)}</span><b>${p.mine ? 'Итоги' : 'Голосовать'} ›</b></button>`; }
// закреп в открытом чате — заменить, убрать или добавить, не перерисовывая окно (поле ввода не теряет фокус)
function chatPinUpdate() {
  const l = $('#chatList'); if (!l) return;
  const keep = chatScrollSave(), html = chatPinHtml(), pb = $('.cpin');
  if (pb) { if (html) pb.outerHTML = html; else pb.remove(); } else if (html) l.insertAdjacentHTML('beforebegin', html);
  l.classList.toggle('pinned', !!html);
  chatScrollRestore(keep);
}
// сообщение с фото (нажатие — во весь экран) или с опросом (карточка как на форуме); без меню «Обратиться/Профиль…»
function chatSpecialHtml(m) {
  if (m.wheel) return `<div class="cm cspecial" data-k="${m.id}">${chatHead(m)}${whCardHtml(m)}</div>`;
  if (m.poll) { const p = S.cpolls[m.poll]; return `<div class="cm cspecial" data-k="${m.id}">${chatHead(m)}${p ? fPollCard(p, S.st.user.admin, { pre: 'c', id: m.poll, sel: S.cpollSel[m.poll] }) : ' <span class="muted">опрос удалён</span>'}</div>`; }
  const cap = m.text && m.text !== '📷 Фото' ? `<div class="cpcap">${chatText(m)}</div>` : '';
  // место под фото — заранее по его размерам (не выше 300): лента не прыгает, когда картинка догрузится
  const pw = Math.floor(Number(m.picW)) || 0, ph = Math.floor(Number(m.picH)) || 0;
  const sz = pw > 0 && ph > 0 ? ` sz" style="width:min(100%,${Math.min(pw, Math.round(300 * pw / ph))}px);aspect-ratio:${pw}/${ph}` : '';
  return `<div class="cm cspecial" data-k="${m.id}">${chatHead(m)}${m.pic ? `<button class="cpic${sz}" data-dlgview="pic/${m.pic}.png" data-exp="${m.picExp || 0}"><img src="pic/${m.pic}.png" alt="Фото"></button>` : ' <span class="muted">📷 фото удалено (хранится сутки)</span>'}${cap}</div>`;
}
function chatPollWin() { const id = S.cpollOpen, p = S.cpolls[id];
  return `${ribbon('Опрос')}${p ? fPollCard(p, S.st.user.admin, { pre: 'c', id, sel: S.cpollSel[id] }) : '<p class="parch-note">Опрос удалён.</p>'}`; }
function chatPollNewWin() { return `${ribbon('Опрос в общий чат')}<div class="bwline center small">Опрос увидят все игроки — он закрепится вверху чата, пока открыт.</div>${pollFormHtml('cpoll')}`; }
// фото в общий чат: как в личных сообщениях (dialogs.js: picPack) — браузер сжимает, сервер собирает новый PNG
async function chatPicSend(file) {
  if (typeof CompressionStream === 'undefined' || typeof createImageBitmap === 'undefined') return toast('Ваш браузер не умеет отправлять фото — обновите его.', 'err');
  S.chatPicBusy = true; refreshSheet();
  try {
    let p = null;
    for (const side of [PIC_SIDE, 720, 540, 400]) { p = await picPack(file, side); if (p.z.length <= PIC_MAXZ) break; }
    if (p.z.length > PIC_MAXZ) throw new Error('big');
    const parts = []; for (let i = 0; i < p.z.length; i += PIC_PART) parts.push(b64(p.z.subarray(i, i + PIC_PART)));
    const inp = $('.chatbar input'), caption = inp ? inp.value.trim() : ''; if (inp) inp.value = ''; S.chatDraft = '';
    S.chatPicQ = { parts }; send({ t: 'chatpic', op: 'begin', w: p.w, h: p.h, n: parts.length, caption });
  } catch (e) { S.chatPicBusy = false; refreshSheet(); toast('Не удалось прочитать картинку — выберите другую.', 'err'); }
}
let chatPicInput = null;
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-cadmmenu],[data-cadmclose],[data-cadmpic],[data-cadmpoll],[data-cadmwheel],[data-cpollopen],[data-cpoll],[data-cpollgo],[data-cpollun],[data-cpollclose],[data-cpolldel]'); if (!t) return;
  e.stopImmediatePropagation(); const d = t.dataset, id = Number(d.pid || d.cpollopen || 0);
  // меню админа «+»: поле ввода теряет фокус — иначе окно не перерисуется (refreshSheet бережёт набираемый текст)
  if (d.cadmmenu !== undefined) { if (S.chatPicBusy) return; const a = document.activeElement; if (a && a.blur) a.blur(); S.chatAdm = !S.chatAdm; return refreshSheet(); }
  if (d.cadmclose !== undefined) { if (e.target === t || t.classList.contains('cpop-x')) { S.chatAdm = false; refreshSheet(); } return; }
  if (d.cadmpoll !== undefined) { S.chatAdm = false; return openSheet(chatPollNewWin); }
  if (d.cadmwheel !== undefined) { S.chatAdm = false; return openSheet(wheelNewWin); } // Колесо Фортуны — wheel.js
  if (d.cadmpic !== undefined) {
    if (S.chatPicBusy) return;
    S.chatAdm = false; setTimeout(refreshSheet, 0);
    if (!chatPicInput) { chatPicInput = document.createElement('input'); chatPicInput.type = 'file'; chatPicInput.accept = 'image/*'; chatPicInput.style.display = 'none'; document.body.appendChild(chatPicInput);
      chatPicInput.addEventListener('change', () => { const f = chatPicInput.files && chatPicInput.files[0]; chatPicInput.value = ''; if (f) chatPicSend(f); }); }
    return chatPicInput.click();
  }
  if (d.cpollopen !== undefined) { S.cpollOpen = id; return openSheet(chatPollWin); }
  const p = S.cpolls[id]; if (!p) return;
  if (d.cpoll !== undefined) { const i = Number(d.cpoll);
    if (!p.multi) return send({ t: 'chatpoll', op: 'vote', id, opts: [i] });
    const sel = S.cpollSel[id] || []; S.cpollSel[id] = sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]; return S.sheets[S.sheets.length - 1] === chatWin ? chatListUpdate() : refreshSheet(); }
  if (d.cpollgo !== undefined) return send({ t: 'chatpoll', op: 'vote', id, opts: S.cpollSel[id] || [] });
  if (d.cpollun !== undefined) return send({ t: 'chatpoll', op: 'unvote', id });
  if (d.cpollclose !== undefined) { if (confirm('Завершить опрос? Голосовать больше будет нельзя, итоги увидят все.')) send({ t: 'chatpoll', op: 'close', id }); return; }
  if (d.cpolldel !== undefined) { if (confirm('Удалить опрос вместе с голосами и его сообщение из чата?')) send({ t: 'chatpoll', op: 'del', id }); }
}, true);
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target; if (f.dataset.form !== 'cpoll') return; e.preventDefault(); e.stopImmediatePropagation();
  send({ t: 'chatpoll', op: 'create', q: f.q.value, opts: Array.from({ length: 10 }, (_, i) => f[`o${i}`].value.trim()).filter(Boolean), multi: f.multi.checked, public: f.public.checked, days: Number(f.days.value) });
}, true);
// ответы сервера: опрос обновился (голос, завершение, удаление) / части фото
function chatPollMsg(m) {
  if (m.gone) { delete S.cpolls[m.id]; if (m.msgId) S.chat = S.chat.filter((x) => x.id !== m.msgId); } else if (m.poll) S.cpolls[m.id] = m.poll;
  if (m.poll && m.poll.mine) delete S.cpollSel[m.id];
  S.cpollPin = m.pin || 0;
  if (m.made && S.sheets[S.sheets.length - 1] === chatPollNewWin) closeSheet();
  const top = S.sheets[S.sheets.length - 1];
  if (top === chatWin) { chatPinUpdate(); chatListUpdate(); } else if (top === chatPollWin) refreshSheet();
  chatLine();
}
function chatPicMsg(m) {
  const q = S.chatPicQ;
  if (m.done || !q) { S.chatPicQ = null; S.chatPicBusy = false; if (S.sheets[S.sheets.length - 1] === chatWin) refreshSheet(); return; }
  if (m.i < q.parts.length) send({ t: 'chatpic', op: 'part', i: m.i, data: q.parts[m.i] });
}
// ---- лента общего чата не «бросает» вниз: игрок листает историю — лента стоит на месте, новое — кнопкой «Новые сообщения» ----
// Место чтения запоминается по сообщению, которое сейчас на экране (data-k), и возвращается после любой перерисовки окна.
S.chatNew = 0; S.chatSaved = null;
let chatAnchor = null; // пока игрок сам не листал — держим то же место до доли пикселя (иначе лента «ползёт» на 1 px с каждым сообщением)
const chatOff = (l, el) => el.getBoundingClientRect().top - l.getBoundingClientRect().top;
const chatNewText = () => `▼ Новые сообщения${S.chatNew > 1 ? `: ${S.chatNew}` : ''}`;
// игрок внизу ленты (видит самое новое)? Новое — первое в разметке (лента перевёрнута)
const chatAtNewest = (l) => { const n = l.querySelector('.cm'); return !n || n.getBoundingClientRect().bottom <= l.getBoundingClientRect().bottom + 40; };
function chatScrollSave() {
  const l = $('#chatList'); if (!l) return null;
  if (chatAtNewest(l)) return { newest: true };
  const p = chatAnchor, pe = p && l.querySelector(`.cm[data-k="${p.k}"]`);
  if (pe && Math.abs(chatOff(l, pe) - p.off) < 2) return p;
  const lr = l.getBoundingClientRect();
  for (const el of l.querySelectorAll('.cm[data-k]')) { const r = el.getBoundingClientRect(); if (r.top < lr.bottom && r.bottom > lr.top) return (chatAnchor = { k: el.dataset.k, off: r.top - lr.top, top: l.scrollTop }); }
  return { top: l.scrollTop };
}
function chatScrollRestore(a) {
  const l = $('#chatList'); if (!l) return;
  if (!a || a.newest) { l.scrollTop = l.scrollHeight; S.chatNew = 0; }
  else {
    // браузер обычно сам держит место (overflow-anchor) — тогда прокрутку не трогаем: не сбиваем лёгкий «бросок» пальцем
    const el = a.k && l.querySelector(`.cm[data-k="${a.k}"]`);
    if (el) { const d = chatOff(l, el) - a.off; if (Math.abs(d) >= 0.5) l.scrollTop = Math.round(l.scrollTop + d); } else l.scrollTop = a.top;
  }
  chatNewBtn();
}
function chatNewBtn() { const b = $('[data-cnew]'); if (!b) return; b.classList.toggle('hidden', !S.chatNew); b.textContent = chatNewText(); }
function chatToNewest() { const l = $('#chatList'); if (l) l.scrollTop = l.scrollHeight; S.chatNew = 0; S.chatSaved = null; chatAnchor = null; chatNewBtn(); }
// перерисовка окна чата (app.js: showSheet) — место чтения остаётся; вернулись из профиля и т. п. — тоже
function sheetKeep(top, fresh) { if (top !== chatWin) return null; const a = fresh ? S.chatSaved : chatScrollSave(); return () => chatScrollRestore(a); }
// обновить только ленту сообщений (голоса, удалённое, опрос); поле ввода не трогаем — можно печатать, пока приходят сообщения
function chatListUpdate() {
  const l = $('#chatList'); if (!l) return;
  const a = chatScrollSave(); l.innerHTML = chatListHtml(); chatScrollRestore(a);
}
// пришло новое сообщение — добавить только его, остальную ленту не трогать; своё — лента вниз
function chatAddMsg(m, mine) {
  const l = $('#chatList');
  if (!l) { if (!mine && S.chatSaved && !S.chatSaved.newest && S.sheets.includes(chatWin)) S.chatNew++; return; } // чат под другим окном (профиль и т. п.)
  if (isBlack(m.fromId)) return;
  const a = mine ? null : chatScrollSave();
  const pn = l.querySelector(':scope > .parch-note'); if (pn) pn.remove();
  l.insertAdjacentHTML('afterbegin', chatMsgHtml(m));
  for (const x of [...l.querySelectorAll(':scope > .cm')].slice(CHAT_SHOW)) x.remove(); // самые старые — вверху ленты
  if (a && !a.newest) S.chatNew++;
  chatScrollRestore(a);
}
// листает — запоминаем место; дошёл до низа — кнопка «Новые сообщения» прячется
let chatScrollRaf = 0;
$('#sheetBody').addEventListener('scroll', (e) => {
  if (!e.target || e.target.id !== 'chatList' || chatScrollRaf) return;
  chatScrollRaf = requestAnimationFrame(() => { chatScrollRaf = 0; const l = $('#chatList'); if (!l) return;
    S.chatSaved = chatScrollSave(); if (S.chatNew && chatAtNewest(l)) { S.chatNew = 0; chatNewBtn(); } });
}, true);
function chatUsersWin() {
  const l = S.chatUsers; if (!l) return `${ribbon('Игроки в игре')}<p class="parch-note">Загрузка…</p>`;
  return `${ribbon(`Игроки в игре (${l.length})`)}${l.map((u) => `<button class="rrow" data-cprof="${u.id}"><span class="rn"><b>${esc(u.login)} ${repIcons(u.rep)}</b></span></button>`).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const cv = e.target.closest('[data-cvote]'); if (cv) { e.stopPropagation(); S.chatPop = null; refreshSheet(); return send({ t: 'chatvote', id: Number(cv.dataset.mid), v: Number(cv.dataset.cvote) }); } // оценил — окно закрывается
  if (e.target.closest('[data-cnew]')) return chatToNewest();
  const t = e.target.closest('[data-cban],[data-cpop],[data-cpopclose],[data-chatpop],[data-chatexit],[data-chatusers],[data-smile],[data-smiletoggle]'); if (!t) return;
  const d = t.dataset, inp = $('.chatbar input');
  if (d.cban !== undefined) { const pp = S.chatPop; S.chatPop = null; send({ t: 'chatmod', op: 'ban', login: pp.nick, hours: Number(d.cban), rule: pp.rule || 0 }); return refreshSheet(); }
  if (d.cpopclose !== undefined && (e.target === t || t.classList.contains('cpop-x'))) { S.chatPop = null; return refreshSheet(); }
  if (d.cpopclose !== undefined) return;
  if (d.chatpop) { if (inp) S.chatDraft = inp.value; S.chatPop = { id: Number(d.chatpop), nick: d.nick, mid: Number(d.mid) }; return refreshSheet(); }
  if (d.cpop) {
    const pp = S.chatPop;
    if (d.cpop === 'lock') { S.chatPop = null; S.chatLock = true; return refreshSheet(); } // «Закрыть чат» — окно выбора времени (rules.js)
    if (d.cpop === 'ban' || d.cpop === 'warn') { // пункт правил и сведения о нарушителе (сколько предупреждений за неделю)
      const k = d.cpop; pp[k] = !pp[k]; pp[k === 'ban' ? 'warn' : 'ban'] = false; if (pp[k] && !pp.info) send({ t: 'chatmod', op: 'info', login: pp.nick });
      refreshSheet(); return cpopShowAction(); }
    S.chatPop = null;
    if (d.cpop === 'del') { if (confirm('Удалить сообщение?')) send({ t: 'chatmod', op: 'del', id: pp.mid }); return refreshSheet(); }
    if (d.cpop === 'profile') { refreshSheet(); return send({ t: 'profile', id: pp.id }); }
    if (d.cpop === 'private') { refreshSheet(); return openDialog(pp.nick); }
    if (d.cpop === 'report') {
      if (S.st.user.talkLow && S.st.user.talkLow.link) { talkLowToast('Жаловаться'); return refreshSheet(); }
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
  refreshSheet();
  const i2 = $('.chatbar input'); if (i2 && !d.smiletoggle) { i2.focus(); i2.setSelectionRange(i2.value.length, i2.value.length); }
});
$('#sheetBody').addEventListener('input', (e) => { if (e.target.closest('.chatbar')) S.chatDraft = e.target.value; });

// ---------- профиль (как «Профиль» в клиенте: пергамент, красные ленты) ----------
// аватар игрока (PNG до 256×256, собранный сервером) или картинка расы
// своей аватарки нет — портрет расы (gfx/auth/race_*.webp, те же, что при регистрации)
const raceAva = (race, cls = '') => `<img class="${cls} raceava" src="${GFX}auth/race_${['humans', 'elves', 'dwarves', 'orcs'].includes(race) ? race : 'humans'}.webp" alt="">`;
const avatarImg0 = (p, cls = '') => (p.avatar ? `<img class="${cls}" src="avatar/${p.id}.png?v=${p.avatar}" alt="">` : raceAva(p.race, cls));
// рамка аватара из «Лавки Короля»: аватар в круге, рамка поверх (большой просмотр — без рамки)
const AVA_FRAMES = ['silver', 'gold', 'fire'];
const avaFramed = (p, inner) => (p.frame && AVA_FRAMES.includes(p.frame) ? `<span class="afr afr-${p.frame}"><span class="afr-in">${inner}</span><img class="afr-f" src="${GFX}shop/frame_${p.frame}.png" alt=""></span>` : inner);
const avatarImg = (p, cls = '') => (cls === 'avabig' ? avatarImg0(p, cls) : avaFramed(p, avatarImg0(p, cls)));
function profileWin(p) {
  // off — кнопка серая; строка в off — причина (нельзя писать / дарить), показывается при нажатии
  const tile = (key, icon, text, off) => `<button class="ptile ${off ? 'off' : ''}" data-ptile="${key}" data-pid="${p.id}"${typeof off === 'string' ? ` data-deny="${esc(off)}"` : ''}><img src="${icon.startsWith('gfx') ? icon : GFX + icon}" alt=""><span>${text}</span></button>`;
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
  // как в оригинале: «Подарки игрока - N», три последних крупно и «Посмотреть» — весь список страницами (giftListWin)
  const giftsN = p.giftsN ?? gifts.length;
  const giftsRow = giftsN ? `${ribbon(`Подарки игрока - ${fmtFull(giftsN)}`)}<div class="pgtop" data-giftlist="${p.id}">${gifts.slice(0, 3).map((g) => `<img src="${GFX}${(S.cat.gifts[g.gift] || {}).img}" alt="">`).join('')}</div>
    <button class="pbar" data-giftlist="${p.id}">🎁 Посмотреть</button>` : `${ribbon('Подарки игрока - 0')}<div class="parch-note">Подарков пока нет.</div>`;
  const hon = p.honors || []; // медали «для красоты» (honors.js) — в строке «Звание», рядом со значками модераторов
  // значки убийцы мирового босса (boss.js)
  const bb = p.bossBadges || [], SLAY = { dragon: 'Драконоборец', troll: 'Сокрушитель троллей', lich: 'Изгоняющий тьму' };
  // в профиле — только ряд значков; нажатие на заголовок или значки — полный список (bossBadgesWin)
  S.bossBadgesOf = { login: p.login, list: bb, slay: SLAY };
  const slayer = bb.length ? `<div data-bbl>${ribbon(`Победы над боссами - ${bb.length} ›`)}<div class="bbadges">${bb.slice(0, 12).map((m) => bossMedal(m)).join('')}${bb.length > 12 ? `<b>+${bb.length - 12}</b>` : ''}</div></div>` : '';
  return `${ribbon('Профиль')}
    ${ribbon('Информация')}
    <div class="pinfo"><div class="avatar ${p.avatar ? 'avaclick' : ''}" ${p.avatar ? `data-avaview="${p.id}"` : ''}>${avatarImg(p)}</div><div>
      Никнейм: <b>${esc(p.login)}</b><br>Ранг: ${p.rank}<br>Рейтинг: ${fmtFull(p.rating)}<br>Раса: ${raceIcon(p.race)} ${esc(p.raceName)}</div></div>
    ${p.brank ? `<button class="brline" data-brank="${p.id}"><span class="brl-t">Боевой ранг:</span><span class="brl-r"><img src="${BR_IMG(p.brank.icon)}" alt="">${brStars(p.brank.idx < 0 ? 0 : p.brank.stars)}<small>${esc(p.brank.title)}</small></span><b class="brarr">›</b></button>` : ''}
    <button class="pline plink2" data-reptable>Репутация (${fmtFull(p.reputation)}): ${repIcons(p.reputation)}</button>
    ${best.length ? `<div class="pline">Зал Славы: ${medals}</div>` : ''}
    ${(p.titles || []).length || hon.length ? `<div class="ptitle ptl">Звание: ${[...(p.titles || []).map((t) => `${t === 'Администратор' ? `<img class="admbadge" src="${GFX}admin_badge.png" alt="">` : t === 'Старший модератор' ? `<img class="admbadge" src="${GFX}smod_badge.png" alt="">` : t === 'Модератор форума' ? `<img class="admbadge" src="${GFX}mod_badge.png" alt="">` : t === 'Авторитет' ? `<img class="admbadge thumb" src="${GFX}zags/thumb.png" alt="">` : `<img class="admbadge crownp" src="${GFX}premium_crown.png" alt="">`} ${esc(t)}`),
      ...hon.map((h) => `<button class="honb" data-honor="${esc(h.id)}"><img class="admbadge honor" src="${GFX}${h.small}" alt=""> ${esc(h.name)}</button>`)].join(', ')}</div>` : ''}
    ${p.marriage ? `<div class="pline zmar"><img class="zring" src="${GFX}zags/rings.png" alt=""> ${p.marriage.role === 'king' ? 'Женат на Королеве' : 'Замужем за Королем'} <a class="plink" data-zpair="${p.marriage.id}">${esc(p.marriage.spouse.login)}</a></div>
      <div class="pline">Рейтинг пары: <a class="plink" data-zpair="${p.marriage.id}">${ZSTAR} ${p.marriage.place}</a>, ${ZTHUMB} ${fmtFull(p.marriage.votes)}</div>` : ''}
    <div class="pline">Альянс: ${p.alliance ? `<a class="plink" data-allyinfo="${p.alliance.id}">${esc(p.alliance.name)} [${esc(p.alliance.tag)}]</a>` : '<b class="noally">нет</b>'}</div>
    ${p.allyInvite ? (p.allyInvite.sent ? `<div class="allyinv sent">✔ Приглашение в [${esc(p.allyInvite.tag)}] отправлено</div>` : `<button class="allyinv" data-allyinv="${p.id}">➕ Пригласить в альянс [${esc(p.allyInvite.tag)}]</button>`) : ''}
    ${p.alliance ? `<div class="pline">Звание в альянсе: ${esc(p.alliance.role)}${p.alliance.ep > 0 ? ` <img class="epaul" src="${GFX}ep/ep${Math.min(8, p.alliance.ep)}.png" alt="">` : ''}</div>` : ''}
    <div class="ptiles pbig">
      ${tile('treasury', 'gfx3d/prof/treasury.png', 'Пополнить Казну', !p.self)}
      ${tile('rep', 'gfx3d/prof/rep.png', 'Поднять Репутацию')}
      ${tile('gift', 'gfx3d/prof/gift.png', 'Отправить Подарок', (p.deny || {}).gift)}
      ${tile('friend', 'gfx3d/prof/friend.png', { friend: 'Убрать из друзей', sent: 'Заявка отправлена', in: 'Принять дружбу' }[p.friendState] || 'Добавить в друзья', p.self)}
      ${tile('msg', M3('contacts'), 'Сообщение', (p.deny || {}).msg)}
      ${tile('hof', M3('hof'), 'Зал Славы')}
      ${tile('premium', 'gfx3d/prof/premium.png', p.self ? 'Премиум' : 'Подарить Премиум', p.self ? '' : (p.deny || {}).gift)}
      ${tile('info', 'gfx3d/prof/info.png', 'Личная информация')}
      ${tile('more', 'gfx3d/prof/more.png', '')}
    </div>
    ${p.deny && p.deny.note ? `<p class="pdeny">🔒 ${esc(p.deny.note)}</p>` : ''}
    ${giftsRow}${hof}${awards}${slayer}
    ${ribbon(`Замки - ${p.castles.length}`)}
    ${p.castles.map((c) => `<button class="pcastle" data-goworld="${c.x},${c.y}"><img src="${GFX}ground/castle_small.png" alt=""> ${esc(c.name)}<br>X: ${c.x}, Y: ${c.y}${c.capital ? ' (Столица)' : ''}</button>`).join('')}`;
}
// медаль «для красоты» из строки «Звание» (honors.js): большая картинка, за что и когда вручена
function honorWin(p, id) {
  const h = (p.honors || []).find((x) => x.id === id);
  if (!h) return `${ribbon('Медаль')}<div class="parch-note">Медали нет.</div>`;
  return `${ribbon(`Медаль «${esc(h.name)}»`)}<div class="honwin"><img src="${GFX}${h.img}" alt=""><b>${esc(h.name)}</b><span>${esc(h.desc)}</span><small>${esc(p.login)} · вручена ${fmtDay(h.at)}</small></div>`;
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
    ${tile('attack', 'smallicon/hd/attack.png', 'Атаковать', p.self)}
    ${p.self ? '' : `<button class="ptile" data-blackop="${p.id}" data-nick="${esc(p.login)}"><img src="${M3('privacy')}" alt=""><span>${isBlack(p.id) ? 'Убрать из чёрного списка' : 'В чёрный список'}</span></button>`}
    <button class="ptile" data-nicks><img src="${M3('files')}" alt=""><span>История ников${(p.nicks || []).length ? ` (${p.nicks.length})` : ''}</span></button>
    ${p.self ? '' : `<button class="ptile" data-coinvs="${esc(p.login)}"><img src="${GFX}coin/stack.png" alt=""><span>Орёл-решка</span></button>`}
  </div>`;
}
// история ников игрока: какой ник был и когда сменён
function nicksWin(p) {
  const old = (p.nicks || []).slice().reverse(); // от первого ника к последнему
  const list = [...old.map((n) => ({ name: n.from, note: `до ${fmtDay(n.at)}${n.mod ? ' · сброшен модерацией' : ''}` })), { name: p.login, note: 'сейчас', now: 1 }];
  return `${ribbon('История ников')}<ol class="nicklist">${list.map((n) => `<li class="${n.now ? 'now' : ''}"><b>${esc(n.name)}</b><small>${n.note}</small></li>`).join('')}</ol>
    ${old.length ? '' : '<p class="parch-note">Ник не менялся.</p>'}`;
}
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-nicks]') && S.lastProfile) openSheet(() => nicksWin(S.lastProfile)); });
function profileInfoWin(p) {
  return `${ribbon('Личная информация')}<div class="pstats">Игрок: <b>${esc(p.login)}</b><br>Раса: ${esc(p.raceName)}${placeLines(p)}<br>В игре с: ${fmtDate(p.created)}${p.lastSeen ? `<br>Последний вход: ${fmtDate(p.lastSeen)}` : ''}</div>
    ${p.self ? placeForm(p) : ''}
    ${p.self ? bdayForm(p.bdayRaw) : p.bday ? `<div class="pstats">🎂 День рождения: <b>${esc(p.bday)}</b></div>` : ''}
    ${p.self ? `<form class="stack" data-form="about"><textarea name="text" rows="4" placeholder="О себе">${esc(p.about)}</textarea><button class="btn primary">Сохранить</button></form>` : `<div class="pstats">${esc(p.about) || '<span class="muted">Игрок ничего о себе не написал.</span>'}</div>`}`;
}

// ---------- Зал Славы ----------
// Зал Славы — как в оригинале: 4 страницы по 5 категорий, у каждой медаль, «Позиция», «Подробнее» и описание
const HALL_IMG = (id, place) => `gfx3d/halls/${id}_${place || 1}.png`; // значок зала — его золотая медаль
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
const HALL_UNIT = { growth: (v) => `Прирост рейтинга ${fmtFull(v)} ${plural(v, 'единица', 'единицы', 'единиц')}.`, wealth: (v) => `${fmtFull(v)} ${plural(v, 'монета', 'монеты', 'монет')}.` };
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
      <div class="hinfo">Позиция: ${h.pos}<br>Дата отсчета:<br>${m ? `01.${m}.${y}` : '—'}<br>Показатель: ${(HALL_UNIT[id] || ((v) => `${fmtFull(v)} ${plural(v, 'очко', 'очка', 'очков')}.`))(h.value)}
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
const RK = { players: ['Игрок', 'player'], castles: ['Замок', 'castle'], alliances: ['Альянс', 'ally'], reputation: ['Авторитет', 'authority'] };
function openRating(kind) { S.rk = kind; S.rlist = null; S.rpage = 0; S.rkMenu = false; send(kind === 'players' ? { t: 'rating' } : { t: 'ratings', kind }); openSheet(ratingWin); }
// рейтинги как в оригинале: полоса категории с меню ≡, листалка и таблица по 10 строк, от большего к меньшему
function ratingWin() {
  const k = S.rk, [title, icon] = RK[k];
  const list = k === 'players' ? S.ratingRows : S.rlist;
  const head = `${ribbon('Рейтинг')}<div class="rkbar"><span><img src="${M3(icon)}" alt=""> ${title}</span><button data-rkmenu>≡</button></div>
    ${S.rkMenu ? `<div class="rkmenu">${Object.entries(RK).map(([id, [t, ic]]) => `<button data-rkind="${id}" class="${id === k ? 'on' : ''}"><img src="${M3(ic)}" alt=""> ${t}</button>`).join('')}</div>` : ''}`;
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
  if (o.site) return siteWin(o, x, y); // недострой (Освоение)
  const mine = o.ownerId === me();
  const tile = (attr, icon, text) => `<button class="ptile" ${attr}><img src="${GFX}${icon}" alt=""><span>${text}</span></button>`;
  const saved = (S.places || []).some((p) => p.x === x && p.y === y);
  return `${ribbon('Замок')}
    <div class="cwin"><img class="cwimg" src="${GFX}${WORLD_NAME_IMG(o)}" alt=""><div>
      <div class="cwname">${esc(o.name)}</div><div>X: ${x} Y: ${y}</div><div>Рейтинг: ${gimg('ground/castle_small.png', 'rico')} ${fmtFull(o.rating)}</div></div></div>
    <div class="cwrow"><span>Игрок:</span>${o.nobody ? '<span>— ничей —</span>' : `<button class="pbar cwplayer" data-cprof="${o.ownerId}">${esc(o.owner)}</button>`}</div>
    <div class="cwrow"><span>Раса:</span><span>${raceIcon(o.race)} ${esc(S.cat.races[o.race] || '')}</span></div>
    ${o.alliance ? `<div class="cwrow"><span>Альянс:</span><span>[${esc(o.alliance)}]</span></div>` : ''}
    ${o.nobody ? '<p class="parch-note">Хозяин забросил замок — теперь он ничей. Захватить его может любой: победные нападения с Бунтарями, бунт +15% за каждое. Столицы у ничейных замков нет.</p>' : ''}
    <hr class="cwhr">
    <div class="ptiles">
      ${mine ? tile(`data-switchxy="${x},${y}"`, 'build/hd3/castle.png', 'Войти в замок') : o.nobody ? '' : tile(`data-write="${esc(o.owner)}"`, 'smallicon/hd/letter.png', 'Сообщение')}
      ${o.nobody ? '' : tile(`data-armyopen="trade" data-ax="${x}" data-ay="${y}"`, 'build/hd3/storage.png', 'Торговля')}
      ${!mine ? tile(`data-warpick data-ax="${x}" data-ay="${y}"`, 'smallicon/hd/attack.png', 'Война')
    : S.st.castle.x === x && S.st.castle.y === y ? '' : `<button class="ptile" data-armyopen="reinforce" data-ax="${x}" data-ay="${y}"><img src="${G3}top/reinf.png" alt=""><span>Подкрепление</span></button>`}
    </div>
    <button class="pbar cwsave" data-saveplace="${x},${y}">${saved ? 'Место запомнено' : 'Запомнить место'}</button>
    ${S.st.user.admin ? `<button class="pbar" data-ainspxy="${x},${y}">👁 Осмотр (админ): генерал, войска, всё</button>` : ''}`;
}

// ---------- недострой на карте: чья стройка, когда будет готова; подкрепить (свой или союзника) или Война ----------
function siteWin(o, x, y) {
  const mine = o.ownerId === me(), ally = !mine && S.st.user.ally && o.allyId === S.st.user.ally, k = Math.max(0, Math.min(1, (now() - o.site.start) / Math.max(1, o.site.end - o.site.start)));
  const tile = (attr, icon, text) => `<button class="ptile" ${attr}><img src="${icon}" alt=""><span>${text}</span></button>`;
  return `${ribbon('Недострой')}
    <div class="cwin"><img class="cwimg site" src="${GFX}world/castle0.png" alt=""><div>
      <div class="cwname">${esc(o.name)}</div><div>X: ${x} Y: ${y}</div><div>Готово: <b>${Math.floor(k * 100)}%</b></div></div></div>
    <div class="tbar"><i style="width:${k * 100}%"></i></div>
    <div class="cwrow"><span>Строит:</span><button class="pbar cwplayer" data-cprof="${o.ownerId}">${esc(o.owner)}</button></div>
    ${o.alliance ? `<div class="cwrow"><span>Альянс:</span><span>[${esc(o.alliance)}]</span></div>` : ''}
    <div class="bwline">Замок будет готов через <span class="cd" data-e="${o.site.end}"></span>. ${mine ? 'Охраняйте стройку: её можно атаковать, а победное нападение, в котором выживут 3 путешественника, заберёт её себе.' : 'Победное нападение, в котором выживут 3 путешественника, заберёт стройку вам (если лояльности населения хватает на новый замок).'}</div>
    <hr class="cwhr">
    <div class="ptiles">
      ${mine ? '' : tile(`data-write="${esc(o.owner)}"`, `${GFX}smallicon/hd/letter.png`, 'Сообщение')}
      ${mine || ally ? tile(`data-armyopen="reinforce" data-ax="${x}" data-ay="${y}"`, `${G3}top/reinf.png`, 'Подкрепление') : tile(`data-warpick data-ax="${x}" data-ay="${y}"`, `${GFX}smallicon/hd/attack.png`, 'Война')}
    </div>`;
}

// ---------- Казна: золото игрока ----------
const treasuryWin = () => {
  const log = S.st.user.goldLog || [];
  const pay = S.cat.pay && S.cat.pay.on ? S.cat.pay : null, gold = S.st.user.gold || 0;
  return `${ribbon('Казна')}<div class="cwin"><img class="cwimg" src="${GFX}coins.png" alt=""><div><div class="cwname">Монеты</div><b>${fmtFull(gold)}</b></div></div>
  ${pay ? '<button class="pbar big paytop" data-payopen>💰 Пополнить</button>' : ''}
  <p class="parch-note">${pay ? 'Монеты можно купить за звёзды Telegram или получить от администрации.' : 'Монеты выдаёт администрация.'} Тратятся${shopVisible() ? ' в «Лавке Короля» (ресурсы, сокровища, телепорт, ускорения, рамки),' : ''} на премиум, подарки, репутацию, праздники и ритуалы.</p>${shopVisible() ? '<button class="pbar" data-shopopen>🏪 Лавка Короля</button>' : ''}
  ${ribbon('История')}${log.map((x) => `<div class="glog"><span class="${x.delta > 0 ? 'plus' : 'minus'}">${x.delta > 0 ? '+' : ''}${fmtFull(x.delta)}</span><span>${esc(x.reason)}<br><small>${new Date(x.at).toLocaleString('ru-RU')} · осталось ${fmtFull(x.left)}</small></span></div>`).join('') || '<p class="parch-note">Операций пока не было.</p>'}`;
};

// ---------- Пополнение казны: пакеты монет за звёзды Telegram (server/src/tgpay.js) ----------
const payWin = () => {
  const pay = S.cat.pay;
  if (!pay || !pay.on) return `${ribbon('Пополнение казны')}<p class="parch-note">Оплата звёздами пока не подключена.</p>`;
  return `${ribbon('Пополнение казны')}<div class="cwin"><img class="cwimg" src="${GFX}coins.png" alt=""><div><div class="cwname">Монеты</div><b>${fmtFull(S.st.user.gold || 0)}</b></div></div>
  <div class="paysteps"><div><b>1</b>Выберите пакет</div><div><b>2</b>Оплатите звёздами в Telegram</div><div><b>3</b>Монеты сразу придут в Казну</div></div>
  <div class="paypacks">${pay.packs.map((p, i) => `<button class="pbar paypack" data-buygold="${i}"><img src="${GFX}coins_s.png" alt=""><b>${fmtFull(p.gold)}</b> монет<span>${fmtFull(p.stars)} ⭐</span></button>`).join('')}</div>
  <p class="parch-note">${pay.rate} ⭐ = 1 монета. Звёзды покупаются прямо в Telegram. Вопросы по оплате — команда /paysupport в боте игры.</p>`;
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
  if (L(1) < 3) tips.push('Развивайте Склад: когда он полон, новая добыча пропадает.');
  const prodCells = c.grid[1].filter((b) => [5, 7, 8, 9].includes(b)).length;
  if (prodCells < 8) tips.push('Стройте добывающие здания на Землях: лес — Дровосек, валуны — Каменщик, горы — Рудник, трава — Огород.');
  if (L(3) && !Object.values(c.mil.units).some((n) => n > 0)) tips.push('Казарма есть, а войск нет — натренируйте защитников.');
  if (L(3) && !L(2)) tips.push('Постройте Военный штаб — без него нельзя отправлять армии и нанять генерала.');
  if (L(2) && !c.mil.general) tips.push('Наймите генерала в Военном штабе — он усиливает армию и растёт в уровне.');
  if (!L(22)) tips.push('Забор даёт бонус к защите замка и всех войск в нём.');
  if (!L(26)) tips.push('Тайник прячет часть ресурсов от грабителей.');
  if (!tips.length) tips.push('Замок развивается отлично! Грабьте лагеря разбойников на карте мира и поднимайтесь в Зале Славы.');
  return `${ribbon('Советник')}<div class="advisor"><img src="${GFX}units/${S.cat.mil.raceDir[S.st.user.race]}/wisdom.png" alt=""><div>${tips.map((t) => `<p>${esc(t)}</p>`).join('')}</div></div>`;
}
const contactsWin = () => `${ribbon('Контакты')}<div class="pstats">Вопросы, ошибки и жалобы — в «Сообщения → СВЯЗЬ»: там ответят мастера игры. Можно приложить скрин.</div>`;
const menuDescWin = () => `${ribbon('Описание меню')}<div class="pstats">${Object.values(MENUS).map((m) => `<b>${m.label}</b>: ${m.items().filter(Boolean).map((i) => i[0]).join(', ')}`).join('<br><br>')}</div>`;
const helpWin = () => `${ribbon('Справка')}<div class="mitems light">
  <button class="mitem" data-act="book"><img src="${GFX}build/hd3/university.png" alt=""><span>Справочник зданий</span></button>
  <button class="mitem" data-act="army"><img src="${GFX}units/human/hd/knight.png" alt=""><span>Войска</span></button>
  <button class="mitem" data-bhelp><img src="${GFX}smallicon/atk_inf.png" alt=""><span>Боевая система</span></button>
  <button class="mitem" data-rsvhelp><img src="${G3}top/guest.png" alt=""><span>Резерв</span></button>
  <button class="mitem" data-chelp="build"><img src="${GFX}world/castle1.png" alt=""><span>Новые замки</span></button>
  <button class="mitem" data-act="rules"><img src="${GFX}smallicon/hd/formulas.png" alt=""><span>Формулы</span></button>
  <button class="mitem" data-gamerules><img src="${GFX}menu/news.png" alt=""><span>Правила игры</span></button></div>`;
const settingsWin = () => `${ribbon('Настройки')}<div class="pstats">Игрок: <b>${esc(S.st.user.login)}</b> · ${esc(S.st.user.raceName)}<br>Скорость мира ×${S.cat.speed}</div>
  <label class="cchk setchk"><input type="checkbox" data-showlvl ${S.showLvl ? 'checked' : ''}><i></i><img src="gfx3d/top/btn_lvl.png" alt=""> Показывать уровни зданий (замок и земли)</label>
  <div class="mitems light"><button class="mitem" data-act="bug"><img src="${GFX}smallicon/hd/help.png" alt=""><span>Сообщить об ошибке</span></button>
  <button class="mitem" data-act="logout"><img src="${GFX}smallicon/hd/exit.png" alt=""><span>Выйти из игры</span></button></div>`;

// ---------- сообщения сервера ----------
const prevMilMsg = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'profile') return; // обрабатывается в app.js
  if (m.t === 'replog') { S.repLog = m; if (S.sheets[S.sheets.length - 1] === repLogWin) refreshSheet(); return; }
  if (m.t === 'chatvote') { const x = S.chat.find((q) => q.id === m.id); if (x) { x.up = m.up; x.dn = m.dn; chatListUpdate(); } return; }
  if (m.t === 'chatdel') { S.chat = S.chat.filter((x) => x.id !== m.id); chatLine(); chatListUpdate(); return; }
  if (m.t === 'chatusers') { S.chatUsers = m.list; const b = $('[data-chatusers]'); if (b) b.innerHTML = `<img src="${GFX}chat/players.png" alt=""> Игроки (${m.list.length})`; return refreshSheet(); }
  if (m.t === 'chatlog') { S.chat = m.list; S.cpolls = m.polls || {}; S.cpollPin = m.pin || 0; chatLine(); S.chatSaved = null; refreshSheet(); chatToNewest(); return; }
  if (m.t === 'chatpoll') return chatPollMsg(m);
  if (m.t === 'chatpicok') return chatPicMsg(m);
  if (m.t === 'chatmsg') { S.chat.push(m.msg); if (S.chat.length > 120) S.chat.shift(); chatLine(); chatAddMsg(m.msg, m.msg.fromId === me()); return; }
  if (m.t === 'allyinfo') { S.allyInfo = m.ally; return refreshSheet(); }
  if (m.t === 'hall') { S.hall = m.hall; return refreshSheet(); }
  if (m.t === 'halls') { S.hallWho = m.who; S.halls = m.list; S.hallPages = m.pages; S.hallSeason = m.season; S.hallLast = m.last; return refreshSheet(); }
  if (m.t === 'ratings') { S.rlist = m.list; return refreshSheet(); }
  if (m.t === 'players') { S.plist = m.list; return refreshSheet(); }
  if (m.t === 'notes') { S.notes = m.text; return refreshSheet(); }
  if (m.t === 'giftdel') { // свой подарок удалён: обновить список подарков и профиль под ним
    if (S.gl && S.gl.id === m.to) send({ t: 'giftlist', id: m.to, page: S.gl.page || 0 });
    send({ t: 'profile', id: m.to }); return;
  }
  if (m.t === 'giftlist') { S.gl = { ...m, t: undefined }; return S.sheets.includes(giftListWin) ? refreshSheet() : openSheet(giftListWin); }
  prevMilMsg(m);
};
// полные списки разделов профиля (нажатие на ряд значков)
function profileListWin(kind) {
  const p = S.lastProfile; if (!p) return '';
  // свой подарок (не из казны альянса) даритель может удалить — за столько же монет, сколько он стоил (social.js deleteGift)
  return `${ribbon('Награждения')}<p class="center"><b>${esc(p.login)}</b></p>${(p.awards || []).map((m) => `<div class="award"><img src="${GFX}smallicon/status/${m.kind}.png" alt=""><div><b>${esc(ALLY_MEDAL[m.kind] || 'Медаль')} от альянса [${esc(m.tag)}]</b><small>${m.text ? `«${esc(m.text)}» · ` : ''}вручил ${esc(m.by)} · получено ${fmtDay(m.at)}</small></div></div>`).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => { const t = e.target.closest('[data-plist]'); if (t) openSheet(() => profileListWin(t.dataset.plist)); });
// окно «Подарки» игрока, как в оригинале: «Отправить подарок!» (в чужом профиле), листалка, у каждого подарка — большая картинка,
// «Премиум подарок», «От: ник» (нажимается — профиль дарителя), пожелание и дата; свой подарок даритель может удалить
function giftListWin() {
  const L = S.gl; if (!L) return `${ribbon('🎁 Подарки')}<p class="parch-note">Загрузка…</p>`;
  const self = L.id === S.st.user.id, p = S.lastProfile, deny = p && p.id === L.id && p.deny && p.deny.gift;
  const pg = L.page, last = L.pages - 1, btn = (to, t) => `<button data-glpg="${to}" ${to < 0 || to > last || to === pg ? 'disabled' : ''}>${t}</button>`;
  const items = L.list.map((g) => { const G = S.cat.gifts[g.gift] || {}, mine = g.fromId === S.st.user.id && !g.ally;
    return `<div class="glitem"><img src="${GFX}${G.img}" alt="${esc(G.name || '')}">
      ${G.premium ? `<div class="glprem">${gimg('premium_crown.png', 'ri')} Премиум подарок</div>` : ''}
      <div class="glfrom">От: ${g.ally ? `альянса [${esc(g.ally)}]` : `<a class="plink" data-cprof="${g.fromId}">${esc(g.from)}</a>`}</div>
      ${g.text ? `<div class="gltext">${esc(g.text)}</div>` : ''}<div class="gldate">${esc(G.name || '')} · ${fmtDay(g.at)}</div>
      ${mine ? `<button class="btn small pgdel" data-gdel="${g.at}" data-gid="${esc(g.gift)}" data-gto="${L.id}">Удалить · ${G.gold || 1} ${gimg('coins_s.png', 'ri')}</button>` : ''}</div>`; }).join('');
  return `${ribbon('🎁 Подарки')}
    ${!self && !deny ? `<div class="center glsend"><a class="plink" data-glsend>Отправить подарок!</a></div>` : ''}
    <p class="center"><b>${esc(L.login)}</b> · всего ${fmtFull(L.total)}</p>
    ${L.pages > 1 ? `<div class="pager">${btn(0, '◀◀')}${btn(pg - 1, '◀')}<span>${pg + 1}</span>${btn(pg + 1, '▶')}${btn(last, '▶▶')}</div>` : ''}
    ${items || '<p class="parch-note">Подарков пока нет.</p>'}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-giftlist],[data-glpg],[data-glsend]'); if (!t) return;
  const d = t.dataset;
  if (d.giftlist) { S.gl = null; return send({ t: 'giftlist', id: Number(d.giftlist), page: 0 }); }
  if (d.glpg !== undefined && !t.disabled && S.gl) { send({ t: 'giftlist', id: S.gl.id, page: Number(d.glpg) }); const b = $('#sheetBody'); if (b) b.scrollTop = 0; return; }
  if (d.glsend !== undefined && S.gl) { S.giftTo = { id: S.gl.id, login: S.gl.login }; S.giftAlly = false; S.giftCat = 'all'; S.giftNew = false; S.giftPage = 0; return openSheet(giftsWin); }
});
$('#sheetBody').addEventListener('click', (e) => { // «Удалить» под своим подарком в чужом профиле
  const t = e.target.closest('[data-gdel]'); if (!t) return;
  const to = Number(t.dataset.gto) || (S.lastProfile || {}).id, who = S.gl && S.gl.id === to ? S.gl.login : (S.lastProfile || {}).login, G = S.cat.gifts[t.dataset.gid] || {}, n = G.gold || 1;
  if (!to || !confirm(`Удалить подарок «${G.name || 'Подарок'}» у ${who}? Это стоит ${n} ${plural(n, 'монету', 'монеты', 'монет')}.`)) return;
  send({ t: 'giftdel', to, at: Number(t.dataset.gdel), gift: t.dataset.gid });
});
// профиль — новый вид
profileSheet = function (p) { S.lastProfile = p; return profileWin(p); }; // eslint-disable-line no-global-assign

$('#sheetBody').addEventListener('click', (e) => {
  const hb = e.target.closest('[data-honor]');
  if (hb) { const p = S.lastProfile; return openSheet(() => honorWin(p, hb.dataset.honor)); }
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
    if (t.classList.contains('off')) { if (d.deny) toast(d.deny, 'err'); return; }
    const p = S.lastProfile, id = Number(d.pid);
    if (d.ptile === 'treasury') return openSheet(S.cat.pay && S.cat.pay.on ? payWin : treasuryWin);
    if (d.ptile === 'premium') return openPremium(p.self ? null : p.login);
    if (d.ptile === 'rep') { S.repTo = p; S.repCoins = 1; return openSheet(repWin); }
    if (d.ptile === 'gift') { S.giftTo = p; S.giftAlly = false; S.giftCat = 'all'; S.giftNew = false; S.giftPage = 0; return openSheet(giftsWin); }
    if (d.ptile === 'friend') {
      const st = p.friendState, op = st === 'friend' ? 'del' : st === 'sent' ? 'cancel' : st === 'in' ? 'accept' : 'add';
      if (op === 'del' && !confirm(`Убрать ${p.login} из друзей?`)) return;
      if (op === 'cancel' && !confirm(`Отозвать заявку в друзья игроку ${p.login}?`)) return;
      send({ t: 'friend', op, id }); return send({ t: 'profile', id, refresh: 1 });
    }
    if (d.ptile === 'msg') { if (p.self) { closeAllSheets(); return ACTS.mail(); } return openDialog(p.id); }
    if (d.ptile === 'map') { const k = p.castles[0]; if (!k) return; closeAllSheets(); S.wGoto = { x: k.x, y: k.y }; S.wMark = { x: k.x, y: k.y }; return setTab('world'); } // один запрос: сразу на этот замок, он подсвечен (раньше карта уходила к своему замку)
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
  // последний замок, в котором игрок был на этом устройстве: при входе открывается он, а не столица
  const lc = store.get('tw.castle'), cid = S.st.castle.id, login = S.st.user.login;
  if (first && lc && lc.login === login && lc.id !== cid && (S.st.castles || []).some((k) => k.id === lc.id)) send({ t: 'switch', id: lc.id, quiet: 1 });
  else if (!lc || lc.login !== login || lc.id !== cid) store.set('tw.castle', { login, id: cid });
  if (S.switchTo) { S.switchTo = false; setTab('castle'); } // переход в другой замок — показать его
}; // eslint-disable-line no-global-assign

// ---------- загрузка аватара ----------
// Картинка не уходит на сервер как файл: браузер вырезает квадрат, уменьшает до 256×256 и отправляет только сжатые
// цвета точек; сервер проверяет размер, сам собирает из них новый PNG и называет его номером игрока (server/src/avatar.js).
const AVA = 96;
const avInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
avInput.addEventListener('change', async () => {
  const f = avInput.files[0]; avInput.value = '';
  if (!f) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return toast('Нужна картинка PNG, JPG, WEBP или GIF.', 'err');
  if (f.size > 15 * 1024 * 1024) return toast('Файл больше 15 МБ.', 'err');
  let bmp;
  try { bmp = await createImageBitmap(f); } catch { return toast('Не удалось открыть картинку.', 'err'); }
  const side = Math.min(bmp.width, bmp.height);
  const pack = async (n) => { // квадрат n×n → сжатые цвета точек RGB (base64)
    const cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.fillStyle = '#fff'; g.fillRect(0, 0, n, n);
    g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, n, n);
    const px = g.getImageData(0, 0, n, n).data, rgb = new Uint8Array(n * n * 3);
    for (let s = 0, d = 0; s < px.length; s += 4, d += 3) { rgb[d] = px[s]; rgb[d + 1] = px[s + 1]; rgb[d + 2] = px[s + 2]; }
    const z = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    let bin = ''; for (let i = 0; i < z.length; i += 0x8000) bin += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  if (typeof CompressionStream !== 'undefined') { // хорошее качество: 256×256, если не влезает в одно сообщение — меньше
    for (const n of [256, 224, 192, 160, 128]) { const z = await pack(n); if (z.length < 390000) return send({ t: 'avatar', op: 'set', z, size: n, acct: 1 }); }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = AVA; // старый браузер — 96×96
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
S.giftCat = 'all'; S.giftNew = false; S.giftPage = 0;
const GIFT_PAGE = 6;
// подарки по иерархии: сначала обычные, потом премиум; внутри — от дешёвых к дорогим
const giftList = () => Object.entries(S.cat.gifts || {})
  .filter(([, g]) => (S.giftCat === 'all' || (S.giftCat === 'premium' ? g.premium : (g.cats || []).includes(S.giftCat))) && (!S.giftNew || g.isNew))
  .sort(([, a], [, b]) => (!!a.premium - !!b.premium) || a.gold - b.gold || a.name.localeCompare(b.name));
function giftsWin() {
  const p = S.giftTo, all = Object.values(S.cat.gifts || {});
  const cats = [['all', 'Все'], ...(S.cat.giftCats || []).filter(([k]) => all.some((g) => (k === 'premium' ? g.premium : (g.cats || []).includes(k))))];
  const list = giftList(), pages = Math.max(1, Math.ceil(list.length / GIFT_PAGE)); S.giftPage = Math.min(S.giftPage, pages - 1);
  const pg = S.giftPage, show = list.slice(pg * GIFT_PAGE, pg * GIFT_PAGE + GIFT_PAGE);
  return `${ribbon('🎁 Подарки')}
    <div class="combo"><select data-giftcat>${cats.map(([k, t]) => `<option value="${k}" ${k === S.giftCat ? 'selected' : ''}>${k === 'premium' ? '👑 ' : ''}${t}</option>`).join('')}</select></div>
    <div class="center bwline gnew"><a class="${S.giftNew ? 'plink' : 'gsel'}" data-gnew="0">Все</a> <a class="${S.giftNew ? 'gsel' : 'plink'}" data-gnew="1">Новые</a></div>
    <div class="pager"><button data-gpg="0" ${pg ? '' : 'disabled'}>◀◀</button><button data-gpg="${pg - 1}" ${pg ? '' : 'disabled'}>◀</button><span>${pg + 1} / ${pages}</span><button data-gpg="${pg + 1}" ${pg < pages - 1 ? '' : 'disabled'}>▶</button><button data-gpg="${pages - 1}" ${pg < pages - 1 ? '' : 'disabled'}>▶▶</button></div>
    <div class="bwline center">Кому: <b>${esc(p.login)}</b> · ${S.giftAlly ? `из казны альянса ${gimg('coins_s.png', 'ri')} ${fmtFull((S.ally || {}).treasury || 0)}` : `у вас ${gimg('coins_s.png', 'ri')} ${fmtFull(S.st.user.gold || 0)}`}</div>
    ${show.length ? show.map(([id, g], i) => `${!i || !!show[i - 1][1].premium !== !!g.premium ? (g.premium ? `<div class="ribbon gsec prem">👑 Премиум подарки</div><p class="small center gsecnote">Уникальные — дарить можно только с премиумом</p>` : '<div class="ribbon gsec">Подарки</div>') : ''}
      <div class="giftrow ${g.premium ? 'prem' : ''}"><img src="${GFX}${g.img}" alt="">
      ${g.premium ? `<div class="gprem">${gimg('premium_crown.png', 'ri')} Премиум подарок</div>` : ''}
      <div class="bwline center">${esc(g.name)} ( ${gimg('coins_s.png', 'ri')} ${g.gold})</div>
      ${g.premium && !isPrem() ? '<div class="center bwline muted">🔒 Уникальный подарок — дарить можно с премиумом</div>' : `<div class="center bwline">🎁 <a class="plink" data-giftsend="${id}">Отправить</a> игроку!</div>`}</div>`).join('') : '<p class="parch-note">В этом разделе пока нет подарков.</p>'}`;
}
$('#sheetBody').addEventListener('change', (e) => { if (e.target.matches('[data-giftcat]')) { S.giftCat = e.target.value; S.giftPage = 0; refreshSheet(); } });
$('#sheetBody').addEventListener('click', (e) => {
  const n = e.target.closest('[data-gnew]'); if (n) { S.giftNew = n.dataset.gnew === '1'; S.giftPage = 0; return refreshSheet(); }
  const pg = e.target.closest('[data-gpg]'); if (pg && !pg.disabled) { S.giftPage = Math.max(0, Number(pg.dataset.gpg)); refreshSheet(); const b = $('#sheetBody'); if (b) b.scrollTop = 0; }
});
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-giftsend]'); if (!t) return;
  const p = S.giftTo, g = S.cat.gifts[t.dataset.giftsend];
  const text = prompt(`Подарок «${g.name}» игроку ${p.login} за ${g.gold} ${plural(g.gold, 'монету', 'монеты', 'монет')}${S.giftAlly ? ' из казны альянса' : ''}. Подпись (необязательно):`, '');
  if (text === null) return;
  send({ t: 'gift', to: p.id, gift: t.dataset.giftsend, text, ally: S.giftAlly ? 1 : undefined }); // ally — из казны альянса (alliance.js)
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
  ['axe_human', 'Топоры людей', [265150, 295150, 325150, 355150, 385150], true],
  // высшие звания (5 цветов в каждом): каждый следующий значок звания — свой цвет, <key>_1…_5
  ['crystal', 'Хрустальные мечи', [415150, 465150, 515150, 565150, 615150], true], ['hammer', 'Боевые молоты', [665150, 725150, 785150, 845150, 905150], true],
  ['scythe', 'Косы', [965150, 1115150, 1265150, 1415150, 1565150], true], ['kris', 'Изогнутые клинки', [1715150, 1865150, 2015150, 2165150, 2315150], true],
  ['bow', 'Луки', [2465150, 2615150, 2765150, 2915150, 3065150], true], ['spear', 'Копья', [3215150, 3365150, 3515150, 3665150, 3815150], true],
  ['morning', 'Моргенштерны', [3965150, 4115150, 4265150, 4415150, 4565150], true], ['staraxe', 'Звёздные секиры', [4715150, 4902650, 5090150, 5277650, 5465150], true],
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

// ---------- Кабинет → «Репутация»: своя репутация, «Кто поднимал» (ник и сколько всего) и история — кто поднял или за что (сервер: social.js repAdd / repView) ----------
function openRepLog() { S.repLog = null; send({ t: 'replog' }); openSheet(repLogWin); }
function repLogWin() {
  const v = S.repLog;
  if (!v) return `${ribbon('Репутация')}<div class="bwline center muted">Загрузка…</div>`;
  const row = (x) => `<div class="rlog"><b class="${x.n > 0 ? 'rgood' : 'rbad'}">${x.n > 0 ? '+' : '−'}${fmtFull(Math.abs(x.n))}</b>
    <span>${x.who ? `<b>${esc(x.who)}</b> поднял(а) вам репутацию` : esc(x.why || 'Репутация')}</span><small>${fmtDate(x.at)}</small></div>`;
  const by = (x) => `<div class="repby"><b>${esc(x.who)}</b><span class="rgood">+${fmtFull(x.n)}</span>
    <small>поднял(а) ${x.k} ${plural(x.k, 'раз', 'раза', 'раз')}, последний — ${fmtDate(x.at)}</small></div>`;
  return `${ribbon('Репутация')}
    <div class="shtrhead"><img src="${GFX}shop/reputation.png" alt=""><div><b>Ваша репутация: ${fmtFull(v.rep)}</b><div>${repIcons(v.rep)}</div></div></div>
    <button class="pbar" data-reptable>Таблица репутации</button>
    ${ribbon('Кто поднимал')}
    ${(v.by || []).length ? v.by.map(by).join('') : '<div class="bwline center muted">Пока никто из игроков не поднимал вам репутацию.</div>'}
    ${ribbon('История')}
    ${v.log.length ? v.log.map(row).join('') : '<div class="bwline center muted">Пока записей нет.</div>'}
    <p class="parch-note small">Рейтинг всех игроков по репутации — в меню «Рейтинг» → «Авторитет».</p>`;
}
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

$('#sheetBody').addEventListener('click', (e) => { const b = e.target.closest('[data-coinvs]'); if (b) openCoin(b.dataset.coinvs); }); // «Орёл-решка» из профиля игрока

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
