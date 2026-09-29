'use strict';
// «Сообщения» как в оригинале: список переписок (аватар, ник, начало последнего сообщения; непрочитанные выделены)
// и «Диалог» — переписка с одним игроком по дням, поле ввода со смайлами, «Отправить», «Профиль», «История».
// Сервер: dialogs / dialog / sendmail(dialog) / dialogclose в server/src/web.js.
S.dlg = { list: null, page: 0, filter: 'all', with: null, msgs: null };
function openDialogs() { S.dlg.list = null; S.dlg.menu = false; send({ t: 'dialogs', page: S.dlg.page, filter: S.dlg.filter }); openSheet(dialogsWin); }
function openDialog(who) { S.dlg.msgs = null; S.dlg.with = null; S.dlg.more = 30; send({ t: 'dialog', ...(typeof who === 'number' ? { id: who } : { with: who }) }); openSheet(dialogWin); }
const dlgAva = (u) => `<span class="dava">${u.avatar ? `<img src="avatar/${u.id}.png?v=${u.avatar}" alt="">` : '<img src="gfx3d/prof/king.png" alt="">'}</span>`;
const dlgCut = (t, n = 22) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; let c = s.slice(0, n); const m = /:([A-Za-z]*)$/.exec(c); if (m && !(SMILE_SET.has(m[1]) && s[n] === ':')) c = c.slice(0, m.index); return `${c.trimEnd()}…`; };

function dialogsWin() {
  const d = S.dlg, L = d.list;
  const head = `${ribbon('Сообщения')}<div class="rkbar"><span><img src="gfx3d/mail/msgs.png" alt=""> ${d.filter === 'unread' ? 'Непрочитанные' : 'Все'}</span><button data-dlgmenu>≡</button></div>
    ${d.menu ? `<div class="rkmenu"><button data-dlgf="all" class="${d.filter === 'all' ? 'on' : ''}"><img src="gfx3d/mail/msgs.png" alt=""> Все</button><button data-dlgf="unread" class="${d.filter === 'unread' ? 'on' : ''}"><img src="gfx3d/mail/new.png" alt=""> Непрочитанные</button></div>` : ''}`;
  if (!L) return `${head}<p class="parch-note">Загрузка…</p>`;
  const nav = `<div class="hnav"><button data-dlgpg="0" ${L.page ? '' : 'disabled'}>◀◀</button><button data-dlgpg="${L.page - 1}" ${L.page ? '' : 'disabled'}>◀</button>
    <span>${L.page + 1}</span><button data-dlgpg="${L.page + 1}" ${L.page < L.pages - 1 ? '' : 'disabled'}>▶</button><button data-dlgpg="${L.pages - 1}" ${L.page < L.pages - 1 ? '' : 'disabled'}>▶▶</button></div>`;
  return `${head}${nav}
    <div class="dlist">${L.list.map((x) => `<button class="dcard ${x.unread ? 'new' : ''}" data-dlgopen="${x.id}">${dlgAva(x)}
      <span class="dtx"><b>${esc(x.login)}</b><span>${x.unread ? '<img class="denv" src="gfx3d/rep/envnew.svg" alt=""> ' : x.mine ? '<small>Вы:</small> ' : ''}${smiles(esc(dlgCut(x.text)))}</span></span>
      ${x.unread ? `<i class="dcnt">${x.unread}</i>` : ''}</button>`).join('') || `<p class="parch-note">${d.filter === 'unread' ? 'Непрочитанных нет.' : 'Переписок пока нет — напишите кому-нибудь!'}</p>`}</div>
    <button class="dnew" data-dlgnew title="Новое сообщение"><img src="gfx3d/rep/mailset.png" alt="Новое сообщение"></button>`;
}

function dialogWin() {
  const d = S.dlg, w = d.with;
  if (!w) return `${ribbon('Диалог')}<p class="parch-note">Загрузка…</p>`;
  const me = S.st.user.login;
  let day = '', body = '';
  for (const m of d.msgs) {
    const dd = new Date(m.at).toLocaleDateString('ru-RU');
    if (dd !== day) { day = dd; body += `<div class="ribbon ddate">${dd}</div>`; }
    body += `<div class="dmsg ${m.mine ? 'mine' : ''}"><div class="dwho"><img src="gfx3d/prof/king.png" alt=""><b>${esc(m.mine ? me : w.login)}</b></div>
      <div class="dline"><small>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small><span>${m.subject && !/^Re:/.test(m.subject) && m.subject !== 'Сообщение' ? `<b>${esc(m.subject)}</b><br>` : ''}${smiles(esc(m.text))}</span></div></div>`;
  }
  return `${ribbon('Диалог')}
    ${d.hasMore ? '<button class="pbar" data-dlgmore>Показать раньше</button>' : ''}
    <div class="dbody">${body || '<p class="parch-note">Сообщений ещё нет — напишите первым.</p>'}</div>
    <form class="dform" data-form="dlgsend"><input name="text" maxlength="4000" autocomplete="off" placeholder="Сообщение для ${esc(w.login)}" value="${esc(d.draft || '')}">
      <button type="button" class="dsm" data-dlgsmile><img src="gfx3d/smiles/smile.png" alt="Смайлы"></button></form>
    ${d.smile ? `<div class="smilebox">${SMILES.map((k) => `<button data-dlgsm="${k}"><img src="${smileSrc(k)}" alt=""></button>`).join('')}</div>` : ''}
    <button class="pbar dsend" data-dlgsend><img src="gfx3d/chat/tosend_button.png" alt=""> Отправить</button>
    <div class="two2"><button class="pbar" data-cprof="${w.id}"><img src="gfx3d/prof/king.png" alt=""> Профиль</button><button class="pbar" data-dlglist><img src="gfx3d/mail/msgs.png" alt=""> Все диалоги</button></div>`;
}

function dialogsMsg(m) {
  if (m.t === 'dialogs') { S.dlg.list = m; return refreshSheet(); }
  if (m.t === 'dialog') {
    const same = S.dlg.with && S.dlg.with.id === m.with.id;
    if (m.keep && !same) return; // пришло сообщение в другой диалог — список обновится сам
    S.dlg.with = m.with; S.dlg.msgs = m.list; S.dlg.hasMore = m.more;
    const inp = $('#sheetBody .dform input'); if (inp) S.dlg.draft = inp.value;
    const b = $('#sheetBody'); const atBottom = !b || b.scrollHeight - b.scrollTop - b.clientHeight < 80;
    if (S.sheets.length) { showSheet(false); if (atBottom || !m.keep) $('#sheetBody').scrollTop = 1e9; }
  }
}
function dlgSend() {
  const inp = $('#sheetBody .dform input'); if (!inp || !S.dlg.with) return;
  const text = inp.value.trim(); if (!text) return;
  send({ t: 'sendmail', to: S.dlg.with.login, subject: 'Сообщение', text, dialog: 1 });
  inp.value = ''; S.dlg.draft = ''; S.dlg.smile = false;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-dlgmenu],[data-dlgf],[data-dlgpg],[data-dlgopen],[data-dlgnew],[data-dlgsmile],[data-dlgsm],[data-dlgsend],[data-dlglist],[data-dlgmore]'); if (!t) return;
  const d = t.dataset;
  if (d.dlgmenu !== undefined) { S.dlg.menu = !S.dlg.menu; return refreshSheet(); }
  if (d.dlgf) { S.dlg.filter = d.dlgf; S.dlg.page = 0; S.dlg.menu = false; S.dlg.list = null; refreshSheet(); return send({ t: 'dialogs', page: 0, filter: S.dlg.filter }); }
  if (d.dlgpg !== undefined) { S.dlg.page = Math.max(0, Number(d.dlgpg)); return send({ t: 'dialogs', page: S.dlg.page, filter: S.dlg.filter }); }
  if (d.dlgopen) return openDialog(Number(d.dlgopen));
  if (d.dlgnew !== undefined) { const who = prompt('Кому написать? Ник игрока:'); if (who && who.trim()) openDialog(who.trim()); return; }
  if (d.dlgsmile !== undefined) { const i = $('#sheetBody .dform input'); if (i) S.dlg.draft = i.value; S.dlg.smile = !S.dlg.smile; return refreshSheet(); }
  if (d.dlgsm) { const i = $('#sheetBody .dform input'); S.dlg.draft = `${i ? i.value : S.dlg.draft || ''}:${d.dlgsm}:`; S.dlg.smile = false; showSheet(false); $('#sheetBody').scrollTop = 1e9; return; }
  if (d.dlgsend !== undefined) return dlgSend();
  if (d.dlglist !== undefined) { closeSheet(); return openDialogs(); }
  if (d.dlgmore !== undefined) { S.dlg.more = (S.dlg.more || 30) + 50; return send({ t: 'dialog', id: S.dlg.with.id, more: S.dlg.more }); }
});
$('#sheetBody').addEventListener('submit', (e) => {
  if (e.target.dataset.form !== 'dlgsend') return;
  e.preventDefault(); e.stopImmediatePropagation(); dlgSend();
}, true);
