'use strict';
// Окно «Альянс» как в оригинале: карточка, Верховенство, Состав, Управление (права, звания и погоны, описание,
// исключение, казна, кладовая, дипломатия, рассылки, реклама, заявки), Форум, Новости, Логи.
// Сервер: server/src/ally.js (allyView/allyOp/allyTopic) и P.alliance в army.js.

S.ally = null; S.allyTopic = null; S.allyShowDel = false; S.allyRankFor = null; S.allyReplyTo = null;
const AI = (n) => `${G3}menu/${n}.svg`;
const AL = 'gfx3d/ally/'; // родные иконки альянса (вырезаны из оригинала)
const aTile = (attr, icon, text, off) => `<button class="ptile ${off ? 'off' : ''}" ${attr}><img src="${icon}" alt=""><span>${text}</span></button>`;
// погоны по старшинству (gfx/ep/ep1…ep8): шевроны → звёзды → звезда в венке → корона (только создатель)
const EP_NAMES = ['нет', '1 — один шеврон', '2 — два шеврона', '3 — три шеврона', '4 — одна звезда', '5 — две звезды', '6 — три звезды', '7 — звезда в лавровом венке'];
const epImg = (ep) => (ep > 0 ? `<img class="epaul" src="${GFX}ep/ep${Math.min(8, ep)}.png" alt="">` : '—');
// корона по репутации (как на форуме оригинала): фиолетовая с 150, синяя 600, зелёная 1100, бирюзовая 2350, оранжевая 4350, красная 7350
const CROWNS = [[7350, 'red'], [4350, 'orange'], [2350, 'teal'], [1100, 'green'], [600, 'blue'], [150, 'purple']];
function repCrown(rep) { const c = CROWNS.find(([t]) => rep >= t); return c ? `<img class="crown2" src="${GFX}rep/crown_${c[1]}.png" alt="">` : ''; }
const CROWN_COLOR = { red: '#c01010', orange: '#d06010', teal: '#108a9a', green: '#1a7a1a', blue: '#1050c0', purple: '#5a1a9a' };
const nameColor = (rep) => { const c = CROWNS.find(([t]) => rep >= t); return c ? CROWN_COLOR[c[1]] : '#7a1a0a'; };
const can = (r) => S.ally && S.ally.my.rights.includes(r);
const canMod = () => can('news') || (S.ally && S.ally.modr); // модератор форума удаляет в любом альянсе
// в чужом альянсе (модератор) запросы идут с id этого альянса
S.allyForeign = null;
const asend = (m) => send({ ...m, ally: S.allyForeign || undefined });
function openAllyForum(id) { S.allyForeign = id; S.ally = null; asend({ t: 'ally', op: 'get' }); openSheet(allyForumWin); }
const dt = (t) => { const d = new Date(t), today = new Date(); const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === today.toDateString() ? `Сегодня, ${hm}` : `${d.toLocaleDateString('ru-RU')} ${hm}`; };
const loading = (t) => `${ribbon(t)}<p class="parch-note">Загрузка…</p>`;
// статус в составе (сервер: ally.js allyOnline, web.js allyPresenceCast): зелёная точка — в сети, серая — нет.
// Меняется сразу (сообщение allyon). В чужом альянсе (модератор) статуса нет
const allyDot = (on) => `<i class="aon${on ? ' on' : ''}" title="${on ? 'В сети' : 'Не в сети'}"></i>`;
const allyOn = (m) => (m.on === undefined ? '' : allyDot(m.on));
const allyHasOn = (a) => a.members.some((m) => m.on !== undefined);
const allyOnN = (a) => a.members.filter((m) => m.on).length;
const allyName = (m) => `${allyOn(m)}<a data-cprof="${m.id}" style="color:${nameColor(m.rep)}">${esc(m.login)}</a><br>`;

function openAlly() { S.allyForeign = null; S.ally = null; asend({ t: 'ally', op: 'get' }); openSheet(allyMainWin); }

function allyMainWin() {
  const a = S.ally; if (!a) return loading('Альянс');
  const lead = a.members.filter((m) => m.ep > 0 || m.id === a.leader).sort((x, y) => y.ep - x.ep);
  const row = (k, v) => `<div class="atr"><span>${k}</span><span>${v}</span></div>`;
  return `${ribbon('Альянс')}
    <div class="atable"><div class="atr head"><img src="${AI('alliance')}" alt=""> ${esc(a.name)}</div>
      ${row('Название', esc(a.tag))}${row('Ранг', a.rank)}${row('Рейтинг', fmtFull(a.score))}${row('Участников', `${a.members.length} из ${a.slots}`)}
      ${allyHasOn(a) ? row('В сети', `${allyDot(true)}${allyOnN(a)}`) : ''}
      ${row('Создатель', `<a data-cprof="${a.leader}">${esc(a.leaderLogin || '—')}</a>`)}</div>
    ${ribbon('Верховенство')}
    <div class="atable"><div class="atr3 head"><span>Звание</span><span>Имя</span><span>Погоны</span></div>
      ${lead.map((m) => `<div class="atr3"><span>${esc(m.title)}</span><span><a data-cprof="${m.id}">${esc(m.login)}</a></span><span>${epImg(m.ep)}</span></div>`).join('')}</div>
    <button class="pbar" data-aw="titles">Весь список</button>
    <div class="ptiles pbig">
      ${aTile('data-aw="charter"', `${AL}charter.png`, 'Устав')}
      ${aTile('data-aw="diplo"', `${AL}diplo.png`, 'Дипломатия')}
      ${aTile('data-aw="desc"', `${AL}desc.png`, 'Описание')}
    </div>
    ${ribbon('Состав')}
    <div class="atable">${a.members.slice(0, 5).map((m, i) => `<div class="atr4"><span>${i + 1}</span><span>${allyName(m)}${repIcons(m.rep)}${allyMedalsRow(m)}</span><span>${epImg(m.ep)}</span><span>${fmtFull(m.score)}</span></div>`).join('')}</div>
    <button class="pbar" data-aw="members">Весь состав</button>
    <div class="ptiles pbig">
      ${aTile('data-aw="manage"', `${AL}manage.png`, 'Управление')}
      ${aTile('data-aw="forum"', `${AL}forum.png`, 'Форум')}
      ${aTile('data-aw="mail"', `${AL}mail.png`, 'Рассылки', !can('mail'))}
      ${aTile('data-aw="ad"', `${AL}ad.png`, 'Реклама', !can('invite'))}
      ${aTile('data-aw="news"', `${AL}news.png`, 'Новости')}
      ${aTile('data-aw="logs"', `${AL}logs.png`, 'Журнал', !can('logs'))}
    </div>`;
}

function allyMembersWin() {
  const a = S.ally; if (!a) return loading('Весь состав');
  // справа — рейтинг с учётом репутации; вверху — сколько сейчас в сети
  return `${ribbon('Весь состав')}${allyHasOn(a) ? `<div class="aonline">${allyDot(true)}В сети: <b>${allyOnN(a)}</b></div>` : ''}
    <div class="atable">${a.members.map((m, i) => `<div class="atr4"><span>${i + 1}</span><span>${allyName(m)}${repIcons(m.rep)}${allyMedalsRow(m)}</span><span>${epImg(m.ep)}</span><span>${fmtFull(m.score)}</span></div>`).join('')}</div>`;
}
function allyTitlesWin() {
  const a = S.ally; if (!a) return loading('Звания и погоны');
  return `${ribbon('Звания и погоны')}<div class="atable"><div class="atr3 head"><span>Звание</span><span>Имя</span><span>Погоны</span></div>
    ${a.members.map((m) => `<div class="atr3"><span>${esc(m.title)}</span><span><a data-cprof="${m.id}">${esc(m.login)}</a></span><span>${epImg(m.ep)}</span></div>`).join('')}</div>
    ${can('rights') ? '<button class="pbar" data-aw="rights">Назначить права</button>' : ''}`;
}

function allyManageWin() {
  const a = S.ally; if (!a) return loading('Управ. альянсом');
  return `${ribbon('Управ. альянсом')}<div class="ptiles">
    ${aTile('data-aw="gold"', `${GFX}coins_s.png`, 'Казна Альянса')}
    ${aTile('data-aw="store"', AI('basket'), 'Кладовая')}
    ${aTile('data-aw="titles"', `${GFX}ep/ep6.png`, 'Звания и погоны')}
    ${aTile('data-aw="mail"', `${GFX}smallicon/hd/letter.png`, 'Рассылки', !can('mail'))}
    ${aTile('data-aw="req"', AI('mail'), `Заявки и приглашения${a.requests.length ? ` (${a.requests.length})` : ''}`, !can('invite'))}
    ${aTile('data-aw="kick"', `${GFX}smallicon/destroy.png`, 'Исключить', !can('kick'))}
    ${aTile('data-aw="rights"', `${GFX}smallicon/hd/rank.png`, 'Назначить права', !can('rights'))}
    ${aTile('data-aw="descedit"', `${GFX}smallicon/hd/pen.png`, 'Изменить описание', !can('desc'))}
    ${aTile('data-aw="diplo"', AI('swords'), 'Дипломатия')}
    ${aTile('data-aleave', `${GFX}smallicon/destroy.png`, 'Покинуть Альянс')}
    ${aTile('data-aw="transfer"', `${GFX}smallicon/hd/loyalty.png`, 'Сместить Создателя')}
  </div>`;
}

function allyRightsWin() {
  const a = S.ally; if (!a) return loading('Назначение прав');
  const list = a.members.filter((m) => m.id !== a.leader);
  if (!list.length) return `${ribbon('Назначение прав')}<p class="parch-note">В альянсе пока только создатель.</p>`;
  const m = list.find((x) => x.login === S.allyRankFor) || list[0]; S.allyRankFor = m.login;
  return `${ribbon('Назначение прав')}
    <div class="clabel">Игрок:</div><div class="combo"><select data-arank>${list.map((x) => `<option ${x.login === m.login ? 'selected' : ''}>${esc(x.login)}</option>`).join('')}</select></div>
    <div class="clabel">Должность игрока:</div><input class="ainput" data-atitle value="${esc(m.title)}" maxlength="24">
    <div class="clabel">Погоны: <span data-aeppv>${epImg(m.ep)}</span></div><div class="combo"><select data-aep>${EP_NAMES.map((t, i) => `<option value="${i}" ${m.ep === i ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    ${Object.entries(a.rightsList).map(([k, t]) => `<label class="cchk big"><input type="checkbox" data-aright="${k}" ${m.rights.includes(k) ? 'checked' : ''}><i></i> ${esc(t)}</label>`).join('')}
    <div class="center"><button class="pbtn" data-arankgo>Назначить</button></div>`;
}

const formWin = (title, body) => `${ribbon(title)}<form class="aform" data-aform="${title}">${body}</form>`;
function allyDescEditWin() {
  const a = S.ally; if (!a) return loading('Изменить описание');
  return formWin('Изменить описание', `<div class="clabel">Короткое название:</div><input class="ainput" name="tag" value="${esc(a.tag)}" maxlength="5">
    <div class="clabel">Полное название:</div><input class="ainput" name="name" value="${esc(a.name)}" maxlength="24">
    <div class="clabel">Описание:</div><textarea class="ainput" name="desc" rows="4" maxlength="1000">${esc(a.desc)}</textarea>
    <div class="center"><button class="pbtn">Изменить</button></div>`);
}
function allyDescWin() { const a = S.ally; return a ? `${ribbon('Описание')}<div class="bwline">${esc(a.desc) || '<span class="muted">Описание не заполнено.</span>'}</div>${can('desc') ? '<button class="pbar" data-aw="descedit">Изменить описание</button>' : ''}` : loading('Описание'); }
function allyCharterWin() {
  const a = S.ally; if (!a) return loading('Устав');
  return can('desc') ? formWin('Устав', `<textarea class="ainput" name="text" rows="10" maxlength="3000" placeholder="Устав альянса">${esc(a.charter)}</textarea><div class="center"><button class="pbtn">Сохранить</button></div>`)
    : `${ribbon('Устав')}<div class="bwline" style="white-space:pre-wrap">${esc(a.charter) || '<span class="muted">Устав не написан.</span>'}</div>`;
}
function allyAdWin() { const a = S.ally; return a ? formWin('Реклама', `<div class="bwline">Объявление о наборе — видно всем в Дипломатическом центре → «Альянсы».</div><textarea class="ainput" name="text" rows="4" maxlength="300">${esc(a.ad)}</textarea><div class="center"><button class="pbtn">Разместить</button></div>`) : loading('Реклама'); }
function allyMailWin() { return formWin('Рассылки', '<div class="bwline">Письмо получат все участники альянса.</div><textarea class="ainput" name="text" rows="5" maxlength="2000" required></textarea><div class="center"><button class="pbtn">Разослать</button></div>'); }

function allyKickWin() {
  const a = S.ally; if (!a) return loading('Удалить игрока');
  const list = a.members.filter((m) => m.id !== a.leader && m.login !== S.st.user.login);
  return `${ribbon('Удалить игрока')}<div class="bwline">Выберите члена альянса для удаления:</div>
    ${list.map((m) => `<div class="mrow"><span>${allyOn(m)}${esc(m.login)} ${repIcons(m.rep)}</span><button class="pbtn small" data-akick="${esc(m.login)}">Исключить</button></div>`).join('') || '<p class="parch-note">Некого исключать.</p>'}`;
}
function allyTransferWin() {
  const a = S.ally; if (!a) return loading('Сместить Создателя');
  const list = a.members.filter((m) => m.id !== a.leader);
  return `${ribbon('Сместить Создателя')}<div class="bwline">${a.my.lead ? 'Передать альянс другому участнику — он станет создателем.' : 'Сместить создателя можно, если его нет в игре больше 14 дней (нужно право «Назначение прав»).'}</div>
    ${list.map((m) => `<div class="mrow"><span>${esc(m.login)}</span><button class="pbtn small" data-atransfer="${esc(m.login)}">Назначить создателем</button></div>`).join('') || '<p class="parch-note">В альянсе нет других участников.</p>'}`;
}
function allyReqWin() {
  const a = S.ally; if (!a) return loading('Заявки и приглашения');
  return `${ribbon('Заявки')}${a.requests.length ? a.requests.map((r) => `<div class="mrow"><span>${esc(r.login)} <small>★ ${fmtFull(r.rating)}</small></span>
      <span><button class="pbtn small" data-al="approve" data-id="${r.id}">Принять</button> <button class="pbtn small" data-al="reject" data-id="${r.id}">Отклонить</button></span></div>`).join('') : '<p class="parch-note">Заявок нет.</p>'}
    ${ribbon('Пригласить игрока')}<form class="chatform" data-alform="invite"><input name="login" placeholder="Ник игрока" autocapitalize="none" required><button class="pbtn small">Пригласить</button></form>
    ${a.invited.length ? `<div class="bwline">Приглашены: ${a.invited.map(esc).join(', ')}</div>` : ''}`;
}

// история кладовой и казны (сервер: ally.js allyMoves) — видна всем участникам: «+» внёс, «−» выдал
S.allyMoveF = 'all';
const allyMoveAmt = (e) => (e.gold ? `${gimg('coins_s.png', 'ri')} ${fmtFull(e.gold)}` : RES4.filter((r) => e.res && e.res[r]).map((r) => `${RES_IC[r]} ${fmtFull(e.res[r])}`).join(' '));
// via — откуда или куда монеты казны: stars — покупка за звёзды Telegram, refund — возврат звёзд, admin — администрация,
// medal — медаль участнику, gift — подарок участнику (what — какой)
const allyMoveWhat = (e) => (e.via === 'stars' ? 'пополнил за звёзды Telegram' : e.via === 'refund' ? 'вернул звёзды — списано из казны'
  : e.via === 'admin' ? (e.op === '+' ? 'пополнила казну' : 'списала из казны') : e.via === 'medal' ? `вручил медаль <b>${esc(e.to)}</b>${e.what ? ` (${esc(e.what)})` : ''}`
    : e.via === 'gift' ? `подарил <b>${esc(e.to)}</b>${e.what ? ` «${esc(e.what)}»` : ''}` : e.op === '+' ? 'внёс' : `выдал <b>${esc(e.to)}</b>`);
const allyMoveRow = (e) => (e.op ? `<div class="amove ${e.op === '+' ? 'in' : 'out'}"><i>${e.op === '+' ? '+' : '−'}</i>
    <span><b>${esc(e.by)}</b> ${allyMoveWhat(e)}<br>${allyMoveAmt(e)}</span><small>${dt(e.at)}</small></div>`
  : `<div class="logrow">${esc(e.text)}<br><small>${dt(e.at)}</small></div>`);
function allyMovesHtml(list) {
  const f = S.allyMoveF, n = (op) => list.filter((e) => e.op === op).length;
  const chips = [['all', 'Все'], ['+', `Пополнения (${n('+')})`], ['-', `Списания (${n('-')})`]].map(([x, t]) => `<button class="${x === f ? 'on' : ''}" data-amovef="${x}">${t}</button>`).join('');
  const rows = list.filter((e) => f === 'all' || e.op === f).slice(0, 50).map(allyMoveRow).join('');
  return `${ribbon('История')}<div class="warchips">${chips}</div>${rows || '<p class="parch-note">Пока пусто.</p>'}`;
}
// казна альянса пополняется только отдельно — покупкой за звёзды Telegram (server/src/tgpay.js) или администрацией;
// свои монеты игроков сюда не переводятся, игрокам казна не выдаётся — тратится только на медали и подарки участникам
const MEDAL_KINDS = [['gold', 'Золотая'], ['silver', 'Серебряная'], ['bronze', 'Бронзовая']];
function allyGoldWin() {
  const a = S.ally; if (!a) return loading('Казна Альянса');
  const pay = S.cat.pay && S.cat.pay.on ? S.cat.pay : null, mc = a.medalCost || {}, me = S.st.user.id;
  const who = `<div class="combo"><select name="to">${a.members.filter((m) => m.id !== me).map((m) => `<option value="${m.id}">${esc(m.login)}</option>`).join('')}</select></div>`; // себе из казны — нельзя
  return `${ribbon('Казна Альянса')}<div class="bwline center">В казне: ${gimg('coins_s.png', 'ri')} <b>${fmtFull(a.treasury)}</b></div>
    <p class="parch-note">Казна пополняется отдельно — ${pay ? 'покупкой за звёзды Telegram (монеты сразу придут в казну) или администрацией' : 'администрацией'}. Свои монеты в казну не переводятся, игрокам монеты из казны не выдаются — она тратится только на медали и подарки участникам.</p>
    ${pay ? `${ribbon('Пополнить казну')}<div class="paypacks">${pay.packs.map((p, i) => `<button class="pbar paypack" data-buyally="${i}"><img src="${GFX}coins_s.png" alt=""><b>${fmtFull(p.gold)}</b> монет<span>${fmtFull(p.stars)} ⭐</span></button>`).join('')}</div>` : ''}
    ${can('rights') && a.members.length > 1 ? `${ribbon('Медаль из казны')}<form class="aform" data-aform="medalto">${who}<div class="combo"><select name="kind">${MEDAL_KINDS.map(([k, t]) => `<option value="${k}">${t} — ${fmtFull(mc[k] || 0)} ${plural(mc[k] || 0, 'монета', 'монеты', 'монет')}</option>`).join('')}</select></div><input class="ainput" name="text" maxlength="80" placeholder="За что (необязательно)"><div class="center"><button class="pbtn">Вручить</button></div></form>` : ''}
    ${can('treasury') && a.members.length > 1 ? `${ribbon('Подарок из казны')}<form class="aform" data-aform="giftto">${who}<div class="center"><button class="pbtn">Выбрать подарок</button></div></form>` : ''}
    ${allyMovesHtml(a.moves.filter((e) => e.gold))}`;
}
function allyStoreWin() {
  const a = S.ally; if (!a) return loading('Кладовая');
  const inputs = RES4.map((r) => `<label class="resin">${RES_IC[r]}<input name="${r}" type="number" min="0" placeholder="0"></label>`).join('');
  return `${ribbon('Кладовая')}<div class="astock">${RES4.map((r) => `<span>${RES_IC[r]}<b>${fmtFull(a.storage[r] || 0)}</b></span>`).join('')}</div>
    ${ribbon('Внести из замка')}<form class="aform" data-aform="store"><div class="resins">${inputs}</div><div class="center"><button class="pbtn">Внести</button></div></form>
    ${can('treasury') ? `${ribbon('Выдать участнику')}<form class="aform" data-aform="storeto"><div class="combo"><select name="to">${a.members.map((m) => `<option>${esc(m.login)}</option>`).join('')}</select></div><div class="resins">${inputs}</div><div class="center"><button class="pbtn">Выдать</button></div></form>` : ''}
    ${allyMovesHtml(a.moves.filter((e) => e.res))}`;
}
function allyDiploWin() {
  const a = S.ally; if (!a) return loading('Дипломатия');
  return `${ribbon('Дипломатия')}${a.diplo.length ? a.diplo.map((d) => `<div class="mrow"><span><b>[${esc(d.tag)}]</b> ${esc(d.name)}</span><span class="dst ${d.status}">${esc(d.statusName)}</span></div>`).join('') : '<p class="parch-note">Отношений с другими альянсами нет.</p>'}
    ${can('diplo') ? formWin('Изменить отношения', `<input class="ainput" name="tag" placeholder="Короткое название альянса" maxlength="5" autocapitalize="characters" required>
      <div class="combo"><select name="status"><option value="ally">Союз</option><option value="nap">Пакт о ненападении</option><option value="war">Война</option><option value="none">Нейтралитет</option></select></div>
      <div class="center"><button class="pbtn">Объявить</button></div>`) : ''}`;
}

// ----- форум -----
function allyForumWin() {
  const a = S.ally; if (!a) return loading('Форум');
  const list = a.forum.filter((t) => S.allyShowDel || !t.deleted);
  return `${ribbon(a.foreign ? `Форум [${a.tag}]` : 'Форум')}${a.foreign ? '<div class="bwline center small">Вы модератор: можно удалять темы и сообщения.</div>' : '<button class="lbar" data-aw="newtopic">Создать тему</button>'}
    ${canMod() ? `<button class="pbar" data-adel>${S.allyShowDel ? 'Скрыть удалённые' : 'Восстановить'}</button>` : ''}
    ${list.map((t) => `<div class="ftopic ${t.deleted ? 'del' : ''}"><button class="fmain" data-atopic="${t.id}"><b>${t.pinned ? '📌 ' : ''}${t.closed ? '🔒 ' : ''}${esc(t.title)}</b>
      <span class="fline">${repCrown((a.members.find((m) => m.login === t.by) || {}).rep || 0)} <span style="color:${nameColor((a.members.find((m) => m.login === t.by) || {}).rep || 0)}">${esc(t.by)}</span> <span>Ответов: ${t.replies}</span></span>
      <small>${dt(t.last ? t.last.at : t.at)} от ${esc(t.last ? t.last.by : t.by)}</small></button>
      ${canMod() ? `<span class="fops"><button data-atopicop="${t.id}" title="Действия"><img src="${GFX}smallicon/hd/gear.png" alt=""></button><button data-atopicdel="${t.id}" title="${t.deleted ? 'Восстановить' : 'Удалить'}">${t.deleted ? '↺' : '✕'}</button></span>` : ''}</div>`).join('') || '<p class="parch-note">Тем пока нет.</p>'}`;
}
function allyTopicWin() {
  const t = S.allyTopic; if (!t) return loading('Тема');
  const canReply = !S.allyForeign && (!t.closed || can('news')); // в закрытой теме отвечает только руководство с правом «Новости и форум»
  return `${ribbon('Тема')}<div class="bwline center"><b>${esc(t.title)}</b>${t.closed ? ' 🔒' : ''}</div>
    <div class="two2">${S.allyForeign ? '' : '<button class="lbar" data-aw="post">Написать</button>'}<button class="lbar" data-aw="forum">Темы</button></div>
    ${t.posts.map((p, i) => `<div class="fpost">${canMod() && !p.deleted ? `<button class="apdel" data-apostdel="${i}" title="Удалить">✕</button>` : ''}<div class="fauthor">${repCrown(p.rep)} <a data-cprof="${p.byId}" style="color:${nameColor(p.rep)}">${esc(p.by)}</a></div>${repIcons(p.rep)}
      ${p.reply ? `<div class="fquote">↪ <b>${esc(p.reply.by)}</b>: «${esc(p.reply.text)}»</div>` : ''}<div class="ftext">${esc(p.text)}</div>
      <div class="afoot"><small>${dt(p.at)}</small>${canReply && !p.deleted ? `<button class="areply" data-areply="${i}">Ответить</button>` : ''}</div></div>`).join('')}`;
}
function allyNewTopicWin() { return formWin('Создать тему', '<div class="clabel">Тема:</div><input class="ainput" name="title" maxlength="60" required><div class="clabel">Текст:</div><textarea class="ainput" name="text" rows="5" maxlength="2000" required></textarea><div class="center"><button class="pbtn">Создать</button></div>'); }
// «Ответить»: над полем — кому отвечаем (ник и начало его сообщения), ✕ — написать просто в тему
function allyPostWin() {
  const rt = S.allyReplyTo;
  return formWin('Написать', `${rt ? `<div class="fquote fto"><span>↪ Ответ для <b>${esc(rt.by)}</b>: «${esc(rt.text)}»</span><button type="button" class="fxto" data-areplyx title="Не отвечать на это сообщение">✕</button></div>` : ''}
    <textarea class="ainput" name="text" rows="6" maxlength="2000" required></textarea><div class="center"><button class="pbtn">Отправить</button></div>`);
}

// ----- новости -----
function allyNewsWin() {
  const a = S.ally; if (!a) return loading('Новости');
  return `${ribbon('Новости')}${can('news') ? '<button class="pbar" data-aw="newsadd">Добавить</button>' : ''}
    ${a.news.map((n) => `<div class="fpost"><b>${esc(n.title)}</b><div class="ftext">${esc(n.text)}</div><small>${dt(n.at)} · ${esc(n.by)}${can('news') ? ` · <a data-anewsdel="${n.id}">удалить</a>` : ''}</small></div>`).join('') || '<p class="parch-note">Новостей нет.</p>'}`;
}
function allyNewsAddWin() { return formWin('Новость', '<div class="clabel">Тема:</div><input class="ainput" name="title" maxlength="80" required><div class="clabel">Текст новости:</div><textarea class="ainput" name="text" rows="5" maxlength="2000" required></textarea><button class="pbar">Добавить</button>'); }

// ----- логи -----
S.allyLogTab = 'def';
// категории военного лога: подпись, иконка, отдел журнала
const WAR_CAT = { att: ['Нападение', 'smallicon/hd/attack.png', 'att'], def: ['Оборона', 'smallicon/hd/defence.png', 'def'], scout: ['Разведка', 'units/human/hd/scout.png', 'scout'],
  sdef: ['Вражеская разведка', 'smallicon/hd/scout.png', 'scout'], rout: ['Подкрепление союзнику', 'smallicon/hd/reinf.png', 'reinf'], rin: ['Подкрепление получено', 'smallicon/hd/reinf.png', 'reinf'] };
// журнал по отделам: военные отчёты участников (оборона, нападения, разведка, подкрепления), состав и дипломатия, кладовая и казна
const LOG_TABS = [['def', 'Оборона', `${G3}smiles2/shield.png`], ['att', 'Нападения', `${G3}smiles2/swords.png`], ['scout', 'Разведка', `${GFX}shop/spy.png`],
  ['reinf', 'Подкрепления', `${G3}rep/kingdef.png`], ['log', 'Состав', `${AL}diplo.png`], ['moves', 'Кладовая', `${GFX}quest/chest.png`]];
const LOG_TITLE = { def: 'Оборона', att: 'Нападения', scout: 'Разведка', reinf: 'Подкрепления', log: 'Состав и дипломатия', moves: 'Кладовая и казна' };
function allyLogsWin() {
  const a = S.ally; if (!a) return loading('Журнал альянса');
  const tab = S.allyLogTab, war = (g) => a.reports.filter((r) => WAR_CAT[r.cat][2] === g);
  const n = (id) => (id === 'log' ? a.log.length : id === 'moves' ? a.moves.length : war(id).length);
  const tabs = LOG_TABS.map(([id, t, ic]) => `<button class="${id === tab ? 'on' : ''}" data-alogtab="${id}"><img src="${ic}" alt="">${t}${n(id) ? `<b>${n(id)}</b>` : ''}</button>`).join('');
  const mixed = tab === 'scout' || tab === 'reinf'; // в «Разведке» и «Подкреплениях» — чья и куда
  const rows = tab === 'log' ? a.log.map((r) => `<div class="logrow">${esc(r.text)}<br><small>${new Date(r.at).toLocaleString('ru-RU')}</small></div>`)
    : tab === 'moves' ? a.moves.map(allyMoveRow)
    : war(tab).map((r) => { const c = WAR_CAT[r.cat]; return `<button class="warrow ${r.cat}" data-report="${r.id}"><img src="${GFX}${c[1]}" alt="">
      <span><b>${esc(r.login)}</b>${mixed ? ` · <i>${c[0]}</i>` : ''}<br>${esc(r.title)}${r.line ? `<small class="wl">${esc(r.line)}</small>` : ''}<small>${new Date(r.at).toLocaleString('ru-RU')}</small></span></button>`; });
  return `${ribbon('Журнал альянса')}<div class="jtabs">${tabs}</div>${ribbon(LOG_TITLE[tab])}${rows.join('') || '<p class="parch-note">Записей пока нет.</p>'}`;
}

const AW = { members: allyMembersWin, titles: allyTitlesWin, manage: allyManageWin, rights: allyRightsWin, descedit: allyDescEditWin, desc: allyDescWin, charter: allyCharterWin,
  ad: allyAdWin, mail: allyMailWin, kick: allyKickWin, transfer: allyTransferWin, req: allyReqWin, gold: allyGoldWin, store: allyStoreWin, diplo: allyDiploWin,
  forum: allyForumWin, newtopic: allyNewTopicWin, post: allyPostWin, news: allyNewsWin, newsadd: allyNewsAddWin, logs: allyLogsWin };
const ALLY_FORMS = { 'Изменить описание': 'desc', Устав: 'charter', Реклама: 'ad', Рассылки: 'mail', 'Изменить отношения': 'diplo', 'Создать тему': 'topic', Написать: 'post', Новость: 'news' };

$('#sheetBody').addEventListener('click', (e) => {
  const lt = e.target.closest('[data-alogtab],[data-amovef]'); // вкладка журнала, фильтр истории кладовой/казны
  if (lt) { if (lt.dataset.alogtab) S.allyLogTab = lt.dataset.alogtab; else S.allyMoveF = lt.dataset.amovef; return refreshSheet(); }
  const t = e.target.closest('[data-apostdel],[data-aw],[data-aleave],[data-akick],[data-atransfer],[data-arankgo],[data-atopic],[data-atopicop],[data-atopicdel],[data-adel],[data-anewsdel],[data-areply],[data-areplyx]'); if (!t) return;
  const d = t.dataset;
  if (d.apostdel !== undefined) { if (confirm('Удалить сообщение?')) asend({ t: 'ally', op: 'postdel', topic: S.allyTopicId, idx: Number(d.apostdel) }); return; }
  if (d.aw) { if (t.classList.contains('off')) return toast('Нет прав на это действие.', 'err'); if (d.aw === 'post') S.allyReplyTo = null; if (d.aw === 'forum' && S.sheets.length && S.allyTopic) closeSheet(); return openSheet(AW[d.aw]); }
  if (d.aleave !== undefined) { if (confirm('Покинуть альянс?')) { send({ t: 'alliance', op: 'leave' }); closeAllSheets(); } return; }
  if (d.akick) { if (confirm(`Исключить ${d.akick} из альянса?`)) send({ t: 'alliance', op: 'kick', login: d.akick }); return setTimeout(() => asend({ t: 'ally', op: 'get' }), 200); }
  if (d.atransfer) { if (confirm(`Сделать ${d.atransfer} создателем альянса?`)) asend({ t: 'ally', op: 'transfer', login: d.atransfer }); return; }
  if (d.arankgo !== undefined) {
    const rights = [...document.querySelectorAll('[data-aright]')].filter((x) => x.checked).map((x) => x.dataset.aright);
    return asend({ t: 'ally', op: 'rank', login: S.allyRankFor, title: $('[data-atitle]').value, ep: Number($('[data-aep]').value), rights });
  }
  if (d.atopic) { S.allyTopic = null; S.allyTopicId = Number(d.atopic); asend({ t: 'ally', op: 'topicget', topic: d.atopic }); return openSheet(allyTopicWin); }
  if (d.atopicop) {
    const act = prompt('Выберите действие: 1 — Закрепить/открепить, 2 — Закрыть/открыть, 3 — Удалить', '1'); if (!act) return;
    return asend({ t: 'ally', op: 'topicop', topic: d.atopicop, act: { 1: 'pin', 2: 'close', 3: 'delete' }[act.trim()] || 'pin' });
  }
  if (d.atopicdel) { const tp = S.ally.forum.find((x) => x.id === Number(d.atopicdel)); if (tp && !tp.deleted && !confirm('Удалить тему?')) return; return asend({ t: 'ally', op: 'topicop', topic: d.atopicdel, act: tp && tp.deleted ? 'restore' : 'delete' }); }
  if (d.adel !== undefined) { S.allyShowDel = !S.allyShowDel; return refreshSheet(); }
  if (d.anewsdel) { if (confirm('Удалить новость?')) asend({ t: 'ally', op: 'news', del: d.anewsdel }); return; }
  if (d.areply !== undefined) { // «Ответить»: окно «Написать» с адресатом, текст начинается с его ника
    const p = S.allyTopic && S.allyTopic.posts[Number(d.areply)]; if (!p) return;
    S.allyReplyTo = { at: p.at, by: p.by, text: p.text.length > 90 ? `${p.text.slice(0, 90)}…` : p.text };
    openSheet(allyPostWin);
    const f = $('[data-aform="Написать"]'); if (f) { f.text.value = `${p.by}, `; f.text.focus(); f.text.setSelectionRange(f.text.value.length, f.text.value.length); }
    return;
  }
  if (d.areplyx !== undefined) { S.allyReplyTo = null; const q = t.closest('.fto'); if (q) q.remove(); return; } // написанное в поле остаётся
});
$('#sheetBody').addEventListener('change', (e) => { if (e.target.dataset.arank !== undefined) { S.allyRankFor = e.target.value; refreshSheet(); } if (e.target.dataset.aep !== undefined) { const pv = $('[data-aeppv]'); if (pv) pv.innerHTML = epImg(Number(e.target.value)); } });
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.aform; if (!k) return;
  e.preventDefault(); document.activeElement && document.activeElement.blur();
  const v = (n) => (f[n] ? f[n].value : undefined), res = () => Object.fromEntries(RES4.map((r) => [r, Number(v(r)) || 0]));
  if (k === 'medalto') { const m = S.ally.members.find((x) => String(x.id) === v('to')); if (!m) return; send({ t: 'alliance', op: 'award', login: m.login, kind: v('kind'), text: v('text') }); return setTimeout(() => asend({ t: 'ally', op: 'get' }), 200); }
  if (k === 'giftto') { const m = S.ally.members.find((x) => String(x.id) === v('to')); if (!m) return; S.giftTo = { id: m.id, login: m.login }; S.giftAlly = true; S.giftCat = 'all'; S.giftNew = false; S.giftPage = 0; return openSheet(giftsWin); } // подарок из казны (ui3d.js)
  if (k === 'store') { asend({ t: 'ally', op: 'store', res: res() }); f.reset(); return; }
  if (k === 'storeto') return asend({ t: 'ally', op: 'store', res: res(), to: v('to') });
  const op = ALLY_FORMS[k]; if (!op) return;
  asend({ t: 'ally', op, tag: v('tag'), name: v('name'), desc: v('desc'), text: v('text'), title: v('title'), status: v('status'), topic: S.allyTopicId,
    reply: op === 'post' && S.allyReplyTo ? S.allyReplyTo.at : undefined });
  if (op === 'post') S.allyReplyTo = null;
  if (['topic', 'post', 'news', 'mail'].includes(op)) closeSheet();
});
const prevMilA = milMsg;
const ALLY_ON_WINS = [allyMainWin, allyMembersWin, allyKickWin]; // окна со статусом «в игре»
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'ally') { S.ally = m.data; return refreshSheet(); }
  if (m.t === 'allytopic') { S.allyTopic = m.data; if (m.data) S.allyTopicId = m.data.id; return refreshSheet(); }
  if (m.t === 'allyon') { // соальянсник вошёл в игру или вышел — точка в составе меняется сразу
    const x = S.ally && S.ally.members.find((y) => y.id === m.id && y.on !== undefined); if (!x) return;
    x.on = !!m.on;
    if (ALLY_ON_WINS.includes(S.sheets[S.sheets.length - 1])) refreshSheet();
    return;
  }
  prevMilA(m);
};
// после обрыва связи (телефон спал, сменилась сеть) статус в открытом составе мог устареть — после входа состав берётся заново
const prevOnMsgA = onMsg;
onMsg = function (m) { // eslint-disable-line no-global-assign
  prevOnMsgA(m);
  if (m.t === 'auth' && !S.allyForeign && S.sheets.some((w) => ALLY_ON_WINS.includes(w))) asend({ t: 'ally', op: 'get' });
};

// ---------- карточка альянса для всех игроков (нажатие на название альянса в профиле, рейтинге) ----------
function openAllyInfo(id) { S.allyInfo = null; send({ t: 'allyinfo', id }); openSheet(allyInfoWin); }
function allyInfoWin() {
  const a = S.allyInfo; if (!a) return loading('Альянс');
  const lead = a.members.filter((m) => m.ep > 0 || m.id === a.leader).sort((x, y) => y.ep - x.ep);
  const row = (k, v) => `<div class="atr"><span>${k}</span><span>${v}</span></div>`;
  return `${ribbon('Альянс')}<div class="atable"><div class="atr head"><img src="${AI('alliance')}" alt=""> ${esc(a.name)}</div>
      ${row('Название', esc(a.tag))}${row('Ранг', a.rank)}${row('Рейтинг', fmtFull(a.score))}${row('Участников', a.members.length)}
      ${row('Создатель', `<a data-cprof="${a.leader}">${esc(a.leaderLogin || '—')}</a>`)}</div>
    ${ribbon('Верховенство')}
    <div class="atable"><div class="atr3 head"><span>Звание</span><span>Имя</span><span>Погоны</span></div>
      ${lead.map((m) => `<div class="atr3"><span>${esc(m.title)}</span><span><a data-cprof="${m.id}">${esc(m.login)}</a></span><span>${epImg(m.ep)}</span></div>`).join('')}</div>
    <button class="pbar" data-ai="titles">Весь список</button>
    <div class="ptiles pbig">
      ${aTile('data-ai="charter"', `${AL}charter.png`, 'Устав')}
      ${aTile('data-ai="diplo"', `${AL}diplo.png`, 'Дипломатия')}
      ${aTile('data-ai="desc"', `${AL}desc.png`, 'Описание')}
    </div>
    ${ribbon('Состав')}
    <div class="atable">${a.members.map((m, i) => `<div class="atr4"><span>${i + 1}</span><span><a data-cprof="${m.id}" style="color:${nameColor(m.rep)}">${esc(m.login)}</a><br>${repIcons(m.rep)}${allyMedalsRow(m)}</span><span>${epImg(m.ep)}</span><span>${fmtFull(m.score)}</span></div>`).join('')}</div>`;
}
function allyInfoTitlesWin() { const a = S.allyInfo; return a ? `${ribbon('Звания')}<div class="atable"><div class="atr3 head"><span>Звание</span><span>Имя</span><span>Погоны</span></div>${a.members.map((m) => `<div class="atr3"><span>${esc(m.title)}</span><span><a data-cprof="${m.id}">${esc(m.login)}</a></span><span>${epImg(m.ep)}</span></div>`).join('')}</div>` : loading('Звания'); }
function allyInfoTextWin(title, text, empty) { return `${ribbon(title)}<div class="bwline" style="white-space:pre-wrap">${esc(text) || `<span class="muted">${empty}</span>`}</div>`; }
function allyInfoDiploWin() { const a = S.allyInfo; return a ? `${ribbon('Дипломатия')}${a.diplo.length ? `<div class="atable">${a.diplo.map((x) => `<div class="atr"><span><a data-allyinfo="${x.id}">${esc(x.name)} [${esc(x.tag)}]</a></span><span>${esc(x.statusName)}</span></div>`).join('')}</div>` : '<div class="bwline muted">Договоров нет.</div>'}` : loading('Дипломатия'); }
$('#sheetBody').addEventListener('click', (e) => {
  const o = e.target.closest('[data-allyinfo]'); if (o) { e.stopPropagation(); return openAllyInfo(Number(o.dataset.allyinfo)); }
  const t = e.target.closest('[data-ai]'); if (!t) return;
  const a = S.allyInfo; if (!a) return;
  const k = t.dataset.ai;
  if (k === 'titles') return openSheet(allyInfoTitlesWin);
  if (k === 'diplo') return openSheet(allyInfoDiploWin);
  if (k === 'charter') return openSheet(() => allyInfoTextWin('Устав', a.charter, 'Устав не написан.'));
  if (k === 'desc') return openSheet(() => allyInfoTextWin('Описание', a.desc, 'Описание не заполнено.'));
}, true);
// медали Зала славы участника (за последний месяц) — под ником в «Составе», как в оригинале
function allyMedalsRow(m) {
  const l = m.medals || []; if (!l.length) return '';
  return `<div class="amedals">${l.map((x) => `<img src="${medalSrc(x.icon)}" alt="" title="${esc(x.name)} — ${['I', 'II', 'III'][x.place - 1]} место">`).join('')}</div>`;
}
