'use strict';
// «Мои друзья» как в оригинале: три плитки — Лента (события друзей), Друзья (список по страницам), Дни Рождения.
// Заявки в друзья приходят отчётом «Принять / Отклонить» и видны вверху вкладки «Друзья».
const FR_PAGE = 10;
const BD_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function openFriends(tab) { S.fr = null; S.frTab = tab || S.frTab || 'list'; S.frPage = 0; send({ t: 'myfriends' }); openSheet(friendsWin); }
function friendsMsg(m) {
  if (m.t === 'myfriends') { S.fr = m.data; return refreshSheet(); }
  if (m.t === 'bday') { if (S.lastProfile && S.lastProfile.self) S.lastProfile.bdayRaw = m.bday; if (S.lastAcct) S.lastAcct.bdayRaw = m.bday; if (S.fr) S.fr.myBday = m.bday; return refreshSheet(); }
}
const frAva = (u) => `<span class="frava">${avatarImg(u)}</span>`;
function friendsWin() {
  const f = S.fr, tab = S.frTab;
  const tile = (k, icon, text, badge) => `<button class="ptile frtile ${tab === k ? 'on' : ''}" data-frtab="${k}"><img src="${icon}" alt=""><span>${text}</span>${badge ? `<b class="frbadge">${badge}</b>` : ''}</button>`;
  const head = `${ribbon('Мои друзья')}<div class="ptiles pbig myfrt">
    ${tile('feed', M3('events'), 'Лента')}
    ${tile('list', M3('friends'), 'Друзья', f ? f.incoming.length : S.st.user.friendsNew)}
    ${tile('bday', 'gfx3d/prof/gift.png', 'Дни Рождения', f && f.today)}</div>`;
  if (!f) return `${head}<p class="parch-note">Загрузка…</p>`;
  if (tab === 'feed') return `${head}${ribbon('Все события')}<div class="frfeed">${f.feed.map((e) => `<button class="frev" data-cprof="${e.uid}"><small>${repDate(e.at)}</small>${esc(e.text)}</button>`).join('')
    || '<p class="parch-note">Событий пока нет. Здесь появится, когда друг захватит или потеряет замок, получит подарок или медаль Зала славы.</p>'}</div>`;
  if (tab === 'bday') {
    const today = f.bdays.filter((b) => b.today), next = f.bdays.filter((b) => !b.today).slice(0, 20);
    return `${head}${ribbon('Дни Рождения')}${today.length ? today.map((b) => `<button class="frbd today" data-cprof="${b.id}">${frAva(b)}<span><span>🎂 Сегодня день рождения у игрока <b>${esc(b.login)}</b>!</span><small>Поздравьте — отправьте подарок из профиля.</small></span></button>`).join('')
      : '<p class="parch-note center">Дней рождений нет!</p>'}
      ${next.length ? `${ribbon('Ближайшие')}${next.map((b) => `<button class="frbd" data-cprof="${b.id}">${frAva(b)}<span><b>${esc(b.login)}</b><small>${esc(b.bday)} · ${b.days === 1 ? 'завтра' : `через ${b.days} дн.`}</small></span></button>`).join('')}` : ''}
      <button class="pbar" data-frmybday>Указать свой день рождения</button>`;
  }
  const pages = Math.max(1, Math.ceil(f.list.length / FR_PAGE)), pg = Math.min(S.frPage || 0, pages - 1);
  const pager = pages > 1 ? `<div class="hpager">${Array.from({ length: pages }, (_, i) => `<button class="${i === pg ? 'on' : ''}" data-frpg="${i}">${i + 1}</button>`).join('')}</div>` : '';
  const inc = f.incoming.length ? `${ribbon(`Заявки в друзья - ${f.incoming.length}`)}${f.incoming.map((u) => `<div class="frrow frreq"><button class="frmain" data-cprof="${u.id}">${frAva(u)}<span class="frtxt"><b>${esc(u.login)}</b><small>Рейтинг: ${fmtFull(u.rating)}</small></span></button>
    <span class="frbtns"><button class="pbtn invyes" data-frop="accept" data-id="${u.id}">Принять</button><button class="pbtn invno" data-frop="decline" data-id="${u.id}">Отклонить</button></span></div>`).join('')}` : '';
  return `${head}${inc}${ribbon(`Друзья - ${f.list.length}`)}${pager}
    ${f.list.slice(pg * FR_PAGE, pg * FR_PAGE + FR_PAGE).map((u) => `<button class="frrow" data-cprof="${u.id}">${frAva(u)}<span class="frtxt"><b>${esc(u.login)}</b>
      <small class="${u.online ? 'fron' : 'froff'}">${u.online ? 'онлайн' : 'оффлайн'}</small><small>Рейтинг: ${fmtFull(u.rating)}</small><small class="frrep">${repIcons(u.rep)} ${fmtFull(u.rep)}</small></span></button>`).join('')
      || '<p class="parch-note">Друзей пока нет — откройте профиль игрока и нажмите «Добавить в друзья».</p>'}
    ${pager}<button class="pbar" data-frsearch>Найти друзей</button>`;
}
// день рождения в «Личной информации» (своей)
function bdayForm(raw) {
  const [d, m] = (raw || '').split('.').map(Number);
  return `<form class="bdform" data-form="bday"><span>День рождения:</span>
    <select name="day"><option value="0">—</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${d === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
    <select name="month"><option value="0">—</option>${BD_MONTHS.map((x, i) => `<option value="${i + 1}" ${m === i + 1 ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <button class="btn primary small">OK</button></form><p class="small muted">День рождения видят Ваши друзья — в этот день им придёт напоминание.</p>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-frtab],[data-frpg],[data-frop],[data-frsearch],[data-frmybday],[data-frreq],[data-frgo]'); if (!t) return;
  const d = t.dataset;
  if (d.frtab) { S.frTab = d.frtab; S.frPage = 0; return refreshSheet(); }
  if (d.frpg !== undefined) { S.frPage = Number(d.frpg); return refreshSheet(); }
  if (d.frop) { e.stopPropagation(); return send({ t: 'friend', op: d.frop, id: Number(d.id), view: 'my' }); }
  if (d.frsearch !== undefined) return openPlayers('search');
  if (d.frmybday !== undefined) return openSheet(() => `${ribbon('День рождения')}${bdayForm(S.fr && S.fr.myBday)}`);
  if (d.frgo !== undefined) return openFriends('list');
  if (d.frreq) { // кнопки в отчёте-заявке
    send({ t: 'friend', op: d.frreq, id: Number(d.id) });
    t.closest('.two').innerHTML = `<p class="parch-note">${d.frreq === 'accept' ? 'Заявка принята — теперь вы друзья!' : 'Заявка отклонена.'}</p>`;
  }
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target; if (f.dataset.form !== 'bday') return; e.preventDefault();
  send({ t: 'bday', day: Number(f.day.value), month: Number(f.month.value) });
});
