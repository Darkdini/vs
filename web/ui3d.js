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
const MENUS = {
  cabinet: { label: 'Кабинет', icon: 'menu/cabinet.svg', items: () => [
    ...(S.st.user.admin ? [['Админ-панель', 'smallicon/status/f_gold.png', () => openSheet(adminHtml)]] : []),
    ['Профиль', 'units/human/general.png', () => send({ t: 'profile', id: me() })],
    ['Советник', `units/${S.cat.mil.raceDir[S.st.user.race]}/wisdom.png${S.st.user.race === 'orcs' ? '?orc' : ''}`, () => openSheet(advisorWin)],
    ['Казна', 'smallicon/coin_gold.png', () => openSheet(treasuryWin)],
    ['Премиум', 'smallicon/status/f_gold.png', () => openSoon('Премиум')],
    ['Уведомления', 'smallicon/upgrade.png', () => openReports()],
    ['Фотоальбомы', 'smallicon/magattak.png', () => openSoon('Фотоальбомы')],
    ['ЗАГС', 'smallicon/health.png', () => openSoon('ЗАГС')],
    ['Мои файлы', 'smallicon/carry.png', () => openSoon('Мои файлы')],
    ['Подарки', 'smallicon/surprize.png', () => openSoon('Подарки')],
    ['Репутация', 'smallicon/plus.png', () => openRating('reputation')],
    ['Авторитет города', 'smallicon/bonus_status/coronalgold.png', () => openSoon('Авторитет города')],
    ['Биржа Замков', 'ground/castle_old.png', () => openSoon('Биржа Замков')],
    ['Земляки', 'ground/castle_small.png', () => openPlayers('nearby')],
    ['Мои друзья', 'smallicon/status/online.png', () => openPlayers('friends')],
    ['Поиск друзей', 'user_search.png', () => openPlayers('search')],
    ['Блокнот', 'smallicon/softedit.png', () => { S.notes = null; send({ t: 'notes' }); openSheet(notesWin); }],
  ] },
  locations: { label: 'Локации', title: 'Локации', icon: 'menu/locations.svg', items: () => [
    ['Замок', 'build/castle.png', () => setTab('castle')],
    ['Земли', 'ground/wood.png', () => setTab('lands')],
    ['Мир', 'ground/castle_big.png', () => setTab('world')],
    ['Мои замки', 'ground/castle_small.png', () => openSheet(castlesWin)],
    ['Армия и генерал', 'build/mbases.png', () => ACTS.hq()],
    ['Генерал', 'units/human/general.png', () => openGeneral()],
    ['Армии в замке', 'build/baraks.png', () => openSheet(armiesWin)],
    ['Военный поход', 'smallicon/swordred.png', () => openArmySheet({})],
    ['Ресурсы', 'build/storage.png', () => openSheet(resSheet)],
    ['Здания замка', 'build/build.png', () => openSheet(() => ribbon('Здания замка') + summaryHtml(VIEW.CASTLE))],
    ['Постройки на землях', 'build/farm_big.png', () => openSheet(() => ribbon('Постройки на землях') + summaryHtml(VIEW.LANDS))],
  ] },
  alliance: { label: 'Альянс', title: 'Альянс', icon: 'menu/alliance.svg', items: () => [
    ['Мой альянс', 'build/diplomat.png', () => { if (MY().alliance) return openAlly(); const i = S.st.castle.grid[0].indexOf(13); if (i < 0) return toast('Нужен Дипломатический центр — постройте его в замке.', 'err'); openCell(VIEW.CASTLE, i); }],
    ['Рейтинг альянсов', 'smallicon/status/f_gold.png', () => openRating('alliances')],
  ] },
  mail: { label: 'Почта', title: 'Почта', icon: 'menu/mail.svg', items: () => [
    ['Новое', 'smallicon/softedit.png', () => openCompose('')],
    ['Сообщения', 'smallicon/unmes.png', () => ACTS.mail()],
    ['Отчеты', 'smallicon/swordgreen.png', () => openReports()],
    ['Приватность', 'smallicon/magblock.png', () => openSoon('Приватность')],
    null,
    ['Форум', 'smallicon/unrep.png', () => openSoon('Форум')],
    ['Чат', 'smallicon/greenball.png', () => openChat()],
    ['Блог', 'smallicon/softedit.png', () => openSoon('Блог')],
    ['События', 'smallicon/swordred.png', () => openReports()],
  ] },
  games: { label: 'Игры', title: 'Игры', icon: 'menu/games.svg', items: () => [
    ['Кости', 'smallicon/surprize.png', () => openSoon('Кости')],
    ['Лотерея', 'smallicon/coin_gold.png', () => openSoon('Лотерея')],
  ] },
  info: { label: 'Инфо', title: 'Информация', icon: 'menu/info.svg', items: () => [
    ['Новости', 'smallicon/upgrade.png', () => openSheet(newsWin)],
    ['Служба поддержки', 'smallicon/soft_help.png', () => ACTS.bug()],
    ['Справка', 'build/university.png', () => openSheet(helpWin)],
    ['Контакты', 'smallicon/unmes.png', () => openSheet(contactsWin)],
    ['Описание меню', 'smallicon/soft_help.png', () => openSheet(menuDescWin)],
  ] },
  rating: { label: 'Рейтинг', title: 'Рейтинги', icon: 'menu/rating.svg', items: () => [
    ['Зал Славы', 'smallicon/bonus_status/ranggold.png', () => { S.halls = null; send({ t: 'halls' }); openSheet(hallsWin); }],
    ['Игрок', 'units/human/general.png', () => openRating('players')],
    ['Замок', 'ground/castle_small.png', () => openRating('castles')],
    ['Альянс', 'build/diplomat.png', () => openRating('alliances')],
    ['Знаменитость', 'smallicon/surprize.png', () => openSoon('Знаменитость')],
    ['Авторитет', 'smallicon/plus.png', () => openRating('reputation')],
    ['Семейные пары', 'smallicon/health.png', () => openSoon('Семейные пары')],
    ['Империи', 'smallicon/bonus_status/coronalsilver.png', () => openSoon('Империи')],
  ] },
};
S.menu = null;
function renderMenu() {
  const m = MENUS[S.menu];
  const items = m.items();
  S.menuItems = items;
  $('#menuWin').innerHTML = `${m.title ? ribbon(m.title) : ''}<div class="mitems">${items.map((it, i) => (it
    ? `<button class="mitem" data-mi="${i}"><img src="${GFX}${it[1]}" alt=""><span>${esc(it[0])}</span></button>` : '<hr>')).join('')}
    ${m.title ? '<button class="mitem close" data-mclose><i class="xic"></i><span>Закрыть</span></button>' : ''}</div>`;
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
  $('#chatmsg').innerHTML = m ? `<b>${esc(m.from)}</b> ${repIcons(m.rep)} ${esc(m.text)}` : '<span class="muted">Чат пуст — напишите первым</span>';
}
function openChat() { send({ t: 'chatlog' }); openSheet(chatWin); setTimeout(() => { const l = $('#chatList'); if (l) l.scrollTop = l.scrollHeight; }, 50); }
const chatWin = () => `${ribbon('Чат')}<div id="chatList" class="chatlist">${S.chat.map((m) => `<div class="cm ${m.fromId === me() ? 'mine' : ''}"><b data-cprof="${m.fromId}">${esc(m.from)}</b> ${repIcons(m.rep)} <small>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small><div>${esc(m.text)}</div></div>`).join('') || '<p class="parch-note">Сообщений пока нет.</p>'}</div>
  <form class="chatform" data-form="chat"><input name="text" maxlength="300" placeholder="Сообщение всем игрокам" autocomplete="off"><button class="sendbtn" aria-label="Отправить"></button></form>`;

// ---------- профиль (как «Профиль» в клиенте: пергамент, красные ленты) ----------
// аватар игрока (PNG 96×96, собранный сервером) или картинка расы
const avatarImg = (p, cls = '') => (p.avatar ? `<img class="${cls}" src="avatar/${p.id}.png?v=${p.avatar}" alt="">` : raceIcon(p.race));
function profileWin(p) {
  const tile = (key, icon, text, off) => `<button class="ptile ${off ? 'off' : ''}" data-ptile="${key}" data-pid="${p.id}"><img src="${GFX}${icon}" alt=""><span>${text}</span></button>`;
  const medals = p.medals.length ? p.medals.map((m) => `<img class="medal" src="${GFX}${m.icon}" alt="" title="Зал ${esc(m.name)} — ${m.place} место, получено ${fmtDay(m.at)}">`).join('') : '<span class="muted">нет</span>';
  // Зал Славы: медали топ-3 по итогам соревновательного месяца, с датой получения
  const hof = p.medals.length ? p.medals.map((m) => `<div class="award"><img src="${GFX}${m.icon}" alt=""><div><b>Зал ${esc(m.name)} — ${['I', 'II', 'III'][m.place - 1]} место</b><small>за ${monthName(m.month)} · получено ${fmtDay(m.at)}</small></div></div>`).join('') : '<div class="parch-note">Пока нет — медали получают топ-3 игрока каждого зала в конце соревновательного месяца.</div>';
  // Награждения: медали от альянса за заслуги
  const aw = p.awards || [];
  const awards = aw.length ? aw.map((m) => `<div class="award"><img src="${GFX}smallicon/status/${m.kind}.png" alt=""><div><b>${esc(ALLY_MEDAL[m.kind] || 'Медаль')} от альянса [${esc(m.tag)}]</b><small>${m.text ? `«${esc(m.text)}» · ` : ''}вручил ${esc(m.by)} · получено ${fmtDay(m.at)}</small></div></div>`).join('') : '<div class="parch-note">Пока нет — медали за заслуги вручает глава альянса.</div>';
  return `${ribbon('Профиль')}
    <div class="pauth"><img src="${GFX}smallicon/bonus_status/coronalgold.png" alt=""><div>Авторитет Вашего города:<br><b>Здесь может быть Ваше имя!</b></div></div>
    <button class="pbar" data-soon="Авторитет города">Стать Авторитетом!</button>
    ${ribbon('Информация')}
    <div class="pinfo"><div class="avatar">${avatarImg(p)}</div><div>
      Никнейм: <b>${esc(p.login)}</b>${p.online ? ' <span class="online">в игре</span>' : ''}<br>Ранг: ${p.rank}<br>Рейтинг: ${fmtFull(p.rating)}<br>Раса: ${raceIcon(p.race)} ${esc(p.raceName)}</div></div>
    ${p.self ? `<div class="avbtns"><button class="pbtn small" data-avatar="set">Загрузить аватар</button>${p.avatar ? '<button class="pbtn small" data-avatar="del">Удалить</button>' : ''}</div>` : ''}
    <button class="pline plink2" data-reptable>Репутация (${fmtFull(p.reputation)}): ${repIcons(p.reputation)}</button>
    <div class="pline">Зал Славы: ${medals}</div>
    ${p.title ? `<div class="ptitle">Звание: ${gimg('smallicon/status/f_gold.png', 'ri')} ${esc(p.title)}</div>` : ''}
    <div class="pline">Альянс: ${p.alliance ? `<b>${esc(p.alliance.name)} [${esc(p.alliance.tag)}]</b>` : '—'}</div>
    ${p.alliance ? `<div class="pline">Звание в альянсе: ${esc(p.alliance.role)}</div>` : ''}
    <div class="ptiles">
      ${tile('treasury', 'smallicon/coin_gold.png', 'Пополнить Казну', true)}
      ${tile('rep', 'smallicon/plus.png', 'Поднять Репутацию')}
      ${tile('gift', 'smallicon/surprize.png', 'Отправить Подарок')}
      ${tile('friend', 'smallicon/status/online.png', p.friend ? 'Убрать из друзей' : 'Добавить в друзья', p.self)}
      ${tile('msg', 'smallicon/unmes.png', 'Сообщение', p.self)}
      ${tile('map', 'ground/castle_small.png', 'На карте')}
      ${tile('premium', 'smallicon/status/f_gold.png', 'Подарить Премиум', true)}
      ${tile('info', 'units/human/general.png', 'Личная информация')}
      ${tile('attack', 'smallicon/swordred.png', 'Атаковать', p.self)}
    </div>
    ${ribbon(`Подарки - ${(p.gifts || []).length}`)}${(p.gifts || []).length ? `<div class="pgifts">${p.gifts.map((g) => { const G = S.cat.gifts[g.gift] || {}; return `<button class="pgift" data-cprof="${g.fromId}" title="${esc(G.name || '')}"><img src="${GFX}${G.img}" alt=""><small>от ${esc(g.from)}</small>${g.text ? `<i>«${esc(g.text)}»</i>` : ''}</button>`; }).join('')}</div>` : '<div class="parch-note">Подарков пока нет.</div>'}
    ${ribbon(`Зал Славы - ${p.medals.length}`)}${hof}<button class="pbar" data-hof>Посмотреть</button>
    ${ribbon(`Награждения - ${aw.length}`)}${awards}
    ${ribbon(`Замки - ${p.castles.length}`)}
    ${p.castles.map((c) => `<button class="pcastle" data-goworld="${c.x},${c.y}"><img src="${GFX}ground/castle_small.png" alt=""> ${esc(c.name)}<br>X: ${c.x}, Y: ${c.y}${c.capital ? ' (Столица)' : ''}</button>`).join('')}`;
}
function profileInfoWin(p) {
  return `${ribbon('Личная информация')}<div class="pstats">Игрок: <b>${esc(p.login)}</b><br>Раса: ${esc(p.raceName)}<br>В игре с: ${fmtDate(p.created)}${p.lastSeen ? `<br>Последний вход: ${fmtDate(p.lastSeen)}` : ''}</div>
    ${p.self ? `<form class="stack" data-form="about"><textarea name="text" rows="4" placeholder="О себе">${esc(p.about)}</textarea><button class="btn primary">Сохранить</button></form>` : `<div class="pstats">${esc(p.about) || '<span class="muted">Игрок ничего о себе не написал.</span>'}</div>`}`;
}

// ---------- Зал Славы ----------
function hallsWin() {
  if (!S.halls) return `${ribbon('Зал Славы')}<p class="parch-note">Загрузка…</p>`;
  const place = ['I', 'II', 'III'], col = ['gold', 'silver', 'bronze'];
  const ss = S.hallSeason, last = S.hallLast;
  return `${ribbon('Зал Славы')}
    ${ss ? `<div class="bwline center">Соревнование за <b>${monthName(ss.key)}</b><br><small>итоги через <span class="cd" data-e="${ss.end}"></span> — награды получат топ-3 каждого зала</small></div>` : ''}
    ${S.halls.map((h) => `<div class="hall"><img class="hallic" src="${GFX}smallicon/bonus_status/${h.icon}gold.png" alt="">
    <div><b class="hname">Зал ${esc(h.name)}</b><div class="hdesc">${esc(h.desc)}</div>
    ${h.top.length ? h.top.map((x, i) => `<div class="hrow"><img src="${GFX}smallicon/bonus_status/${h.icon}${col[i] === 'silver' && h.icon === 'medal' ? 'siver' : col[i]}.png" alt=""> ${place[i]} место — <a data-cprof="${x.id}">${esc(x.login)}</a> (${fmtFull(x.value)})</div>`).join('') : '<div class="hdesc">Пока никто не отличился.</div>'}
    </div></div>`).join('')}
    ${last ? `${ribbon(`Победители за ${monthName(last.key)}`)}${last.halls.map((h) => `<div class="hrow"><b>${esc(h.name)}:</b> ${h.top.map((x, i) => `<img src="${GFX}smallicon/bonus_status/${h.icon}${['gold', 'silver', 'bronze'][i] === 'silver' && h.icon === 'medal' ? 'siver' : ['gold', 'silver', 'bronze'][i]}.png" alt=""> <a data-cprof="${x.id}">${esc(x.login)}</a>`).join(' ') || '—'}</div>`).join('')}` : ''}`;
}
const ALLY_MEDAL = { gold: 'Золотая медаль', silver: 'Серебряная медаль', bronze: 'Бронзовая медаль' };
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const monthName = (key) => { const [y, m] = String(key || '').split('-'); return m ? `${MONTHS[Number(m) - 1]} ${y}` : ''; };
const fmtDay = (t) => new Date(t).toLocaleDateString('ru-RU');

// ---------- рейтинги ----------
function openRating(kind) { S.rk = kind; S.rlist = null; send(kind === 'players' ? { t: 'rating' } : { t: 'ratings', kind }); openSheet(ratingWin); }
function ratingWin() {
  const k = S.rk, title = { players: 'Рейтинг игроков', castles: 'Рейтинг замков', alliances: 'Рейтинг альянсов', reputation: 'Авторитет' }[k];
  const list = k === 'players' ? S.ratingRows : S.rlist;
  if (!list) return `${ribbon(title)}<p class="parch-note">Загрузка…</p>`;
  return `${ribbon(title)}<div class="rlist">${list.map((r, i) => {
    const place = i < 3 ? `<img src="${GFX}smallicon/status/f_${['gold', 'silver', 'bronze'][i]}.png" alt="">` : i + 1;
    if (k === 'alliances') return `<div class="rrow"><span class="rk">${place}</span><span class="rn"><b>${esc(r.name)} [${esc(r.tag)}]</b><small>участников ${r.members}</small></span><span class="rv">${fmtFull(r.rating)}</span></div>`;
    if (k === 'castles') return `<button class="rrow" data-goworld="${r.x},${r.y}"><span class="rk">${place}</span><span class="rn"><b>${esc(r.name)}</b><small>${esc(r.login)} · X:${r.x} Y:${r.y}</small></span><span class="rv">${fmtFull(r.rating)}</span></button>`;
    return `<button class="rrow ${r.id === me() ? 'me' : ''}" data-cprof="${r.id}"><span class="rk">${place}</span><span class="rn"><b>${esc(r.login)}${k === 'reputation' ? ` ${repIcons(r.rating ?? r.reputation)}` : ''}</b><small>${esc(r.race || r.raceName || '')}${r.online ? ' · в игре' : ''}</small></span><span class="rv">${fmtFull(r.rating)}</span></button>`;
  }).join('') || '<p class="parch-note">Пусто.</p>'}</div>`;
}

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
const treasuryWin = () => `${ribbon('Казна')}<div class="cwin"><img class="cwimg" src="${GFX}smallicon/coin_gold.png" alt=""><div><div class="cwname">Золото</div><b>${fmtFull(S.st.user.gold)}</b></div></div>
  <p class="parch-note">Золото — премиум-валюта: выдаётся администрацией и за достижения.</p>`;

// ---------- прочие окна ----------
const notesWin = () => `${ribbon('Блокнот')}${S.notes === null ? '<p class="parch-note">Загрузка…</p>' : `<form class="stack" data-form="notes"><textarea name="text" rows="14" placeholder="Заметки видите только вы">${esc(S.notes)}</textarea><button class="btn primary">Сохранить</button></form>`}`;
function castlesWin() {
  const list = S.st.castles || [];
  return `${ribbon(`Мои замки - ${list.length}`)}${list.map((c) => `<div class="pcastle ${c.active ? 'active' : ''}"><img src="${GFX}ground/castle_small.png" alt=""> ${esc(c.name)}<br>X: ${c.x}, Y: ${c.y}${c.capital ? ' (Столица)' : ''}
    <div class="pcsub">★ ${fmtFull(c.rating)} · лояльность ${c.loyalty}${c.active ? ' · вы здесь' : ''}</div>
    <div class="btns">${c.active ? '' : `<button class="btn primary small" data-switch="${c.id}">Перейти в замок</button>`}<button class="btn small" data-goworld="${c.x},${c.y}">На карте</button></div></div>`).join('')}
    <p class="parch-note">Новые замки захватывают: атака с Бунтарями на Заброшенный замок или на не-столичный замок игрока.</p>`;
}
function advisorWin() {
  const c = S.st.castle, tips = [];
  const L = (id) => buildingLevel(id);
  if (!c.queue.length) tips.push('Очередь строительства пуста — стройте! Одновременно можно до ' + S.cat.maxQueue + ' строек.');
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
  <div class="mitems light"><button class="mitem" data-act="bug"><img src="${GFX}smallicon/soft_help.png" alt=""><span>Сообщить об ошибке</span></button>
  <button class="mitem" data-act="logout"><img src="${GFX}smallicon/softclose.png" alt=""><span>Выйти из игры</span></button></div>`;

// ---------- сообщения сервера ----------
const prevMilMsg = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'profile') return; // обрабатывается в app.js
  if (m.t === 'chatlog') { S.chat = m.list; chatLine(); refreshSheet(); const l = $('#chatList'); if (l) l.scrollTop = l.scrollHeight; return; }
  if (m.t === 'chatmsg') { S.chat.push(m.msg); if (S.chat.length > 50) S.chat.shift(); chatLine(); const l = $('#chatList'); if (l) { refreshSheet(); const l2 = $('#chatList'); l2.scrollTop = l2.scrollHeight; } return; }
  if (m.t === 'halls') { S.halls = m.list; S.hallSeason = m.season; S.hallLast = m.last; return refreshSheet(); }
  if (m.t === 'ratings') { S.rlist = m.list; return refreshSheet(); }
  if (m.t === 'players') { S.plist = m.list; return refreshSheet(); }
  if (m.t === 'notes') { S.notes = m.text; return refreshSheet(); }
  prevMilMsg(m);
};
// профиль — новый вид
profileSheet = function (p) { S.lastProfile = p; return profileWin(p); }; // eslint-disable-line no-global-assign

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-cprof],[data-ptile],[data-hof],[data-soon],[data-switch],[data-switchxy],[data-saveplace]'); if (!t) return;
  const d = t.dataset;
  if (d.switch) { closeAllSheets(); Iso.cams = {}; S.switchTo = true; return send({ t: 'switch', id: Number(d.switch) }); }
  if (d.switchxy) { const [x, y] = d.switchxy.split(',').map(Number); const c = (S.st.castles || []).find((k) => k.x === x && k.y === y); if (c) { closeAllSheets(); Iso.cams = {}; S.switchTo = true; send({ t: 'switch', id: c.id }); } return; }
  if (d.saveplace) { const [x, y] = d.saveplace.split(',').map(Number); S.places = S.places || []; if (!S.places.some((p) => p.x === x && p.y === y)) S.places.push({ x, y }); store.set('tw.places', S.places); toast('Место запомнено.'); return refreshSheet(); }
  if (d.cprof) return send({ t: 'profile', id: Number(d.cprof) });
  if (d.hof !== undefined) { S.halls = null; send({ t: 'halls' }); return openSheet(hallsWin); }
  if (d.soon) return openSoon(d.soon);
  if (d.ptile) {
    if (t.classList.contains('off')) return;
    const p = S.lastProfile, id = Number(d.pid);
    if (d.ptile === 'rep') { S.repTo = p; S.repCoins = 1; return openSheet(repWin); }
    if (d.ptile === 'gift') { S.giftTo = p; return openSheet(giftsWin); }
    if (d.ptile === 'friend') { send({ t: 'friend', op: p.friend ? 'del' : 'add', id }); return send({ t: 'profile', id }); }
    if (d.ptile === 'msg') return openCompose(p.login);
    if (d.ptile === 'map') { closeAllSheets(); S.world = null; setTab('world'); return send({ t: 'world', cx: p.castles[0].x, cy: p.castles[0].y }); }
    if (d.ptile === 'info') return openSheet(() => profileInfoWin(p));
    if (d.ptile === 'attack') return openArmySheet({ mission: 'attack', x: p.castles[0].x, y: p.castles[0].y });
  }
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.form; if (!k) return;
  if (k === 'chat') { e.preventDefault(); const v = f.text.value.trim(); if (v) send({ t: 'chat', text: v }); f.text.value = ''; }
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
  send({ t: 'avatar', op: 'set', px: btoa(bin) });
});
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-avatar]'); if (!t) return;
  if (t.dataset.avatar === 'set') return avInput.click();
  if (confirm('Удалить аватар?')) send({ t: 'avatar', op: 'del' });
});

// ---------- Подарки: каталог «Все / Новые», отправка игроку ----------
function giftsWin() {
  const p = S.giftTo, list = Object.entries(S.cat.gifts || {});
  return `${ribbon('🎁 Подарки')}
    <div class="combo"><select><option>Все</option></select></div>
    <div class="center bwline">Все <span class="plink">Новые</span></div>
    <div class="pager"><button>◀◀</button><button>◀</button><span>1</span><button>▶</button><button>▶▶</button></div>
    <div class="bwline center">Кому: <b>${esc(p.login)}</b> · у вас ${gimg('smallicon/coin_gold.png', 'ri')} ${fmtFull(S.st.user.gold || 0)}</div>
    ${list.map(([id, g]) => `<div class="giftrow"><img src="${GFX}${g.img}" alt="">
      ${g.premium ? '<div class="gprem">Премиум подарок</div>' : ''}
      <div class="bwline center">${esc(g.name)} ( ${gimg('smallicon/coin_gold.png', 'ri')} ${g.gold})</div>
      <div class="center bwline">🎁 <a class="plink" data-giftsend="${id}">Отправить</a> игроку!</div></div>`).join('')}`;
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
    <div class="bwline center">1 ${gimg('smallicon/coin_gold.png', 'ri')} = ${k} 👍 · у вас ${gimg('smallicon/coin_gold.png', 'ri')} ${fmtFull(gold)}</div>
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
