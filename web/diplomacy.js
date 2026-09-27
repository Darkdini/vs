'use strict';
// Дипломатический центр — как в оригинале: «Приглашения», «Альянсы», «Создать Альянс» (или «Мой альянс»).
// Сервер: P.alliance в server/src/army.js (accept/decline/declineall/request/create/invite/approve/reject/kick/leave).

const alBar = (attr, icon, text) => `<button class="rbar" ${attr}>${icon ? `<img src="${GFX}${icon}" alt="">` : ''} ${text}</button>`;
function diplomacyButtons() {
  const my = MY(), n = (my.invites || []).length, al = my.alliance;
  return alBar('data-dip="invites"', 'smallicon/unmes.png', `Приглашения${n ? ` (${n})` : ''}`)
    + alBar('data-dip="list"', 'smallicon/shieldblue.png', 'Альянсы')
    + (al ? alBar('data-dip="my"', 'smallicon/status/f_gold.png', `Мой альянс [${esc(al.tag)}]${al.lead && al.requests.length ? ` (${al.requests.length})` : ''}`) : alBar('data-dip="create"', '', 'Создать Альянс'));
}

function invitesWin() {
  const list = MY().invites || [];
  return `${ribbon('Приглашения')}
    ${list.length ? `<div class="center"><button class="pbtn" data-al="declineall">Отклонить все</button></div>` : '<p class="parch-note">Приглашений нет.</p>'}
    ${list.map((a) => `<div class="invite"><div>Приглашение в альянс:</div><div class="itag">${esc(a.tag)}!</div><small>${esc(a.name)}</small>
      <div class="two"><button class="pbtn" data-al="accept" data-id="${a.id}">Принять</button><button class="pbtn" data-al="decline" data-id="${a.id}">Отклонить</button></div></div>`).join('')}`;
}

S.alFound = null;
function alliancesWin() {
  const my = MY();
  const rows = (S.alFound || []).map((a) => `<div class="invite"><div class="itag">${esc(a.name)} [${esc(a.tag)}]</div>
      <small>глава ${esc(a.leader || '—')} · участников ${a.members} из ${a.slots} · очки ${fmtFull(a.score || 0)}</small>
      ${my.alliance ? '' : a.requested ? '<div class="small muted">Заявка отправлена</div>' : a.members >= a.slots ? '<div class="small muted">Мест нет</div>' : `<div class="center"><button class="pbtn" data-al="request" data-id="${a.id}">Подать заявку</button></div>`}</div>`).join('');
  return `${ribbon('Альянсы')}<div class="bwline center">Альянсы, подходящие вам:</div>
    <button class="pbar" data-alfind>Найти</button>
    ${S.alFound ? rows || '<p class="parch-note">Альянсов пока нет — создайте свой.</p>' : ''}`;
}

function createWin() {
  return `${ribbon('Создать Альянс')}
    <form class="stack" data-alform="create"><input name="name" placeholder="Название альянса (от 3 букв)" required maxlength="24">
      <input name="tag" placeholder="Тег (2–5 букв, например WOLF)" autocapitalize="characters" required maxlength="5">
      <button class="pbar">Создать Альянс</button></form>`;
}

function myAllianceWin() {
  const al = MY().alliance;
  if (!al) return `${ribbon('Мой альянс')}<p class="parch-note">Вы не состоите в альянсе.</p>`;
  const me = S.st.user.login;
  return `${ribbon(`${al.name} [${al.tag}]`)}
    <div class="bwline center">Участников: ${al.members.length} из ${al.slots}</div>
    <div class="bwline center">Очки альянса (рейтинг + репутация): <b>${fmtFull(al.score)}</b></div>
    ${(al.info || []).map((u) => `<div class="mrow"><span><b data-cprof="${u.id}">${esc(u.login)}</b>${u.login === (al.leaderLogin || '') ? ' ★' : ''} ${repIcons(u.rep)}<br><small>рейтинг ${fmtFull(u.rating)} + репутация ${fmtFull(u.rep)} = ${fmtFull(u.rating + u.rep)}</small></span>
      ${al.lead && u.login !== me ? `<button class="pbtn small" data-al="kick" data-login="${esc(u.login)}">Исключить</button>` : ''}</div>`).join('')}
    ${al.lead ? `${ribbon('Заявки')}${al.requests.length ? al.requests.map((r) => `<div class="mrow"><span>${esc(r.login)} <small>★ ${fmtFull(r.rating)}</small></span>
        <span><button class="pbtn small" data-al="approve" data-id="${r.id}">Принять</button> <button class="pbtn small" data-al="reject" data-id="${r.id}">Отклонить</button></span></div>`).join('') : '<p class="parch-note">Заявок нет.</p>'}
      ${ribbon('Пригласить игрока')}<form class="chatform" data-alform="invite"><input name="login" placeholder="Логин игрока" autocapitalize="none" required><button class="pbtn small">Пригласить</button></form>` : ''}
    <button class="rbar" data-al="leave" data-confirm="Выйти из альянса?">Выйти из альянса</button>`;
}

const DIP_WIN = { invites: invitesWin, list: alliancesWin, create: createWin, my: myAllianceWin };
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-dip],[data-al],[data-alfind]'); if (!t) return;
  const d = t.dataset;
  if (d.dip) { if (d.dip === 'list') S.alFound = null; return openSheet(DIP_WIN[d.dip]); }
  if (d.alfind !== undefined) return send({ t: 'alliances' });
  if (d.confirm && !confirm(d.confirm)) return;
  send({ t: 'alliance', op: d.al, id: d.id, login: d.login });
  if (d.al === 'request') setTimeout(() => send({ t: 'alliances' }), 150);
  if (d.al === 'leave') closeSheet();
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.alform; if (!k) return;
  e.preventDefault();
  if (k === 'create') { send({ t: 'alliance', op: 'create', name: f.name.value, tag: f.tag.value }); closeSheet(); }
  if (k === 'invite') { send({ t: 'alliance', op: 'invite', login: f.login.value }); f.login.value = ''; }
});
