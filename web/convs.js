'use strict';
// «Беседы» в «Сообщениях» (сервер: server/src/convs.js, t:'conv' / 'convpic'): групповая переписка до 15 человек.
// В списке «Сообщения» — после «СВЯЗИ»: приглашения («Вступить» / «Отказаться») и мои беседы; создать — конверт внизу → «Новая беседа».
// Окно беседы — как «Диалог»: сообщения по дням (кто, время, текст со смайлами, фото на 2 часа), поле ввода, «Отправить»,
// «Участники» (создатель приглашает по нику, исключает, отзывает приглашения, переименовывает, удаляет; выйти — любой), «Фото».
S.conv = { list: null, cur: null, draft: '', smile: false, picBusy: null, picQ: null, more: 0, listNew: -1 };
const convListReq = () => send({ t: 'conv', op: 'list' });
const cvInput = () => $('#sheetBody form[data-form="cvsend"] input');

// блок бесед в «Сообщениях» (dialogs.js dialogsWin) — на первой странице
function convRows() {
  const L = S.conv.list; if (!L) return '';
  const inv = L.invites.map((x) => `<div class="dcard cvinv"><span class="dava cvava">💬</span><span class="dtx"><b>${esc(x.title)}</b><span>${esc(x.from)} зовёт в беседу · ${x.n} чел.</span></span>
    <span class="cvans"><button class="pbtn small" data-cvyes="${x.id}">Вступить</button><button class="pbtn small" data-cvno="${x.id}">Отказаться</button></span></div>`).join('');
  const rows = L.convs.map((c) => `<button class="dcard cvrow ${c.unread ? 'new' : ''}" data-cvopen="${c.id}"><span class="dava cvava">💬</span>
    <span class="dtx"><b>${esc(c.title)}</b><span>${c.unread ? '<img class="denv" src="gfx3d/rep/envnew.svg" alt=""> ' : ''}${c.last ? `${c.last.by ? `<small>${esc(c.last.by)}:</small> ` : ''}${smiles(esc(dlgCut(c.last.text, 26)))}` : ''}</span></span>
    ${c.unread ? `<i class="dcnt">${c.unread}</i>` : `<i class="cvn">${c.n}/${L.max}</i>`}</button>`).join('');
  return `${inv}${rows}`;
}
// «Новая беседа» (конверт в «Сообщениях», dialogs.js mailMenuHtml): название — и беседа открывается, дальше «Участники» → пригласить
function convNew() {
  if (S.st.user.talkLow) return talkLowToast('Создавать беседы');
  const title = prompt('Название беседы (до 40 знаков):'); if (title && title.trim()) send({ t: 'conv', op: 'create', title: title.trim() });
}
// сообщения беседы по дням; служебные («вступил», «вышел», «переименовал») — мелко по центру
function convMsgsHtml(c) {
  let day = '', body = '';
  for (const m of c.msgs) if (m.pic && m.picExp <= now()) { delete m.pic; m.picGone = true; } // время вышло — фото исчезает сразу
  for (const m of c.msgs) {
    const dd = new Date(m.at).toLocaleDateString('ru-RU'), tm = new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (dd !== day) { day = dd; body += `<div class="ribbon ddate">${dd}</div>`; }
    if (!m.by) { body += `<div class="cvsys"><small>${tm}</small> ${esc(m.text)}</div>`; continue; }
    const p = c.people[m.by] || { login: '—', race: 'humans', avatar: 0 };
    const pic = m.pic ? `<button class="dpic" data-dlgview="pic/${m.pic}.png" data-exp="${m.picExp}"><img src="pic/${m.pic}.png" alt="Фото"></button><small class="dpict">⏳ исчезнет через ${picLeft(m.picExp)}</small>`
      : m.picGone ? '<span class="dpicgone">📷 Фото удалено (в беседах фото хранятся 2 часа)</span>' : '';
    body += `<div class="dmsg ${m.mine ? 'mine' : ''}"><div class="dwho">${dlgMini({ id: m.by, ...p })}<button class="cvwho" data-profile="${m.by}">${esc(p.login)}</button></div>
      <div class="dline"><small>${tm}</small>${pic ? `<span class="dpicw">${m.text ? `<span>${smiles(esc(m.text))}</span>` : ''}${pic}</span>` : `<span>${smiles(esc(m.text))}</span>`}</div></div>`; // фото — столбиком, как в личке
  }
  return body;
}
function convWin() {
  const c = S.conv.cur;
  if (!c) return `${ribbon('Беседа')}<p class="parch-note">Загрузка…</p>`;
  if (c.msgs.some((m) => m.pic) && !S.conv.picTimer) S.conv.picTimer = setTimeout(() => { S.conv.picTimer = null; if (S.sheets[S.sheets.length - 1] === convWin) refreshSheet(); }, 20000); // отсчёт «исчезнет через…»
  const write = c.muted ? `<p class="parch-note dlock">🔒 ${esc(c.muted)}</p>`
    : `<form class="dform" data-form="cvsend"><input name="text" maxlength="1000" autocomplete="off" placeholder="Сообщение в беседу" value="${esc(S.conv.draft || '')}">
      <button type="button" class="dsm" data-cvsmile><img src="gfx3d/smiles2/smile.png" alt="Смайлы"></button></form>
      ${S.conv.picBusy ? `<div class="dpicst">📷 ${esc(S.conv.picBusy)}</div>` : ''}
      ${S.conv.smile ? `<div class="smilebox">${SMILES.map((k) => `<button data-cvsm="${k}"><img src="${smileSrc(k)}" alt=""></button>`).join('')}</div>` : ''}
      <button class="pbar dsend" data-cvsend><img src="${GFX}dlg/send.png" alt=""> Отправить</button>`;
  return `${ribbon(c.title)}${c.more ? '<button class="pbtn small cvmore" data-cvmore>Показать ранее</button>' : ''}
    <div class="dbody cvbody">${convMsgsHtml(c) || '<p class="parch-note">Сообщений ещё нет — напишите первым.</p>'}</div>
    <div class="dctl">${write}
    <div class="two2"><button class="pbar" data-cvpeople>👥 Участники ${c.members.length}/${c.max}</button>${c.muted ? '' : `<button class="pbar" data-cvpic><img src="${GFX}dlg/file.png" alt=""> Фото</button>`}</div></div>`;
}
function convPeopleWin() {
  const c = S.conv.cur; if (!c) return `${ribbon('Участники')}<p class="parch-note">Загрузка…</p>`;
  const me = S.st.user.id;
  const row = (x) => { const p = c.people[x.id] || { login: '—', race: 'humans', avatar: 0 };
    return `<div class="cvmem">${dlgMini({ id: x.id, ...p })}<button class="cvwho" data-profile="${x.id}">${esc(p.login)}</button>${x.owner ? '<small>👑 создатель</small>' : ''}
      ${c.own && x.id !== me ? `<button class="pbtn small" data-cvkick="${x.id}" data-name="${esc(p.login)}">Исключить</button>` : ''}</div>`; };
  const inv = c.invites.length ? `<p class="small cvlbl">Приглашены — ждём ответа:</p><div class="cvmems">${c.invites.map((x) => `<div class="cvmem"><span>✉ ${esc(x.login)}</span>${c.own ? `<button class="pbtn small" data-cvcancel="${x.id}">Отозвать</button>` : ''}</div>`).join('')}</div>` : '';
  const free = c.max - c.members.length - c.invites.length;
  const invite = !c.own ? '<p class="small cvlbl">Приглашает игроков создатель беседы.</p>' : free > 0
    ? `<form class="cvinvf" data-form="cvinvite"><input name="login" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Ник игрока"><button class="pbtn">Пригласить</button></form><p class="small cvlbl">Свободно мест: ${free}</p>`
    : `<p class="small cvlbl">Мест нет: в беседе ${c.max} человек вместе с приглашёнными.</p>`;
  return `${ribbon(`Участники ${c.members.length}/${c.max}`)}<div class="cvmems">${c.members.map(row).join('')}</div>${inv}${invite}
    ${c.own ? '<div class="two2"><button class="pbar" data-cvrename>✏ Переименовать</button><button class="pbar" data-cvdelete>🗑 Удалить беседу</button></div>' : ''}
    <button class="pbar cvleave" data-cvleave>🚪 Выйти из беседы</button>`;
}
// закрыть окна беседы (её удалили, игрока исключили, он вышел) — кнопки «назад» до списка
function convCloseWins() {
  while (S.sheets.length && [convWin, convPeopleWin].includes(S.sheets[S.sheets.length - 1])) closeSheet();
}
function convMsg(m) {
  if (m.t === 'convs') { S.conv.list = m.data; S.conv.listNew = S.st.convNew; if (S.sheets[S.sheets.length - 1] === dialogsWin) refreshSheet(); return; }
  if (m.t === 'convpicok') return convPicMsg(m);
  if (m.gone) { if (S.conv.cur && S.conv.cur.id === m.gone) { S.conv.cur = null; convCloseWins(); } if (S.sheets[S.sheets.length - 1] === dialogsWin) convListReq(); return; }
  if (m.live && !(S.conv.cur && S.conv.cur.id === m.data.id)) return; // пришло в другую беседу — список обновится по конверту
  const inp = cvInput(), typing = inp && document.activeElement === inp;
  if (inp) S.conv.draft = inp.value;
  S.conv.cur = m.data;
  if (!S.sheets.includes(convWin)) { S.conv.draft = ''; S.conv.smile = false; openSheet(convWin); $('#sheetBody').scrollTop = 1e9; return; }
  const top = S.sheets[S.sheets.length - 1], b = $('#sheetBody'), atBottom = !b || b.scrollHeight - b.scrollTop - b.clientHeight < 80;
  if (top === convPeopleWin) return refreshSheet();
  if (top !== convWin) return;
  if (typing && m.live && $('.cvbody')) { $('.cvbody').innerHTML = convMsgsHtml(m.data); if (atBottom) b.scrollTop = 1e9; return; } // пишет — не сбивать поле ввода
  showSheet(false); if (atBottom || !m.keep) $('#sheetBody').scrollTop = 1e9;
}
// новые сообщения в беседах (конверт) — список «Сообщения», если открыт, свежий
function convState() {
  if (!S.st || S.st.convNew === S.conv.listNew) return;
  S.conv.listNew = S.st.convNew; if (S.sheets[S.sheets.length - 1] === dialogsWin) convListReq();
}
function convSend() {
  const inp = cvInput(), c = S.conv.cur; if (!inp || !c) return;
  const text = inp.value.trim(); if (!text) return;
  send({ t: 'conv', op: 'post', id: c.id, text }); inp.value = ''; S.conv.draft = ''; S.conv.smile = false;
}
// фото: как в личных сообщениях (dialogs.js picPack) — браузер уменьшает картинку и шлёт сжатые цвета точек; подпись — текст из поля
async function convPicSend(file) {
  const c = S.conv.cur; if (!c) return;
  if (typeof CompressionStream === 'undefined' || typeof createImageBitmap === 'undefined') return toast('Ваш браузер не умеет отправлять фото — обновите его.', 'err');
  S.conv.picBusy = 'Готовлю фото…'; refreshSheet();
  try {
    let p = null;
    for (const side of [PIC_SIDE, 720, 540, 400]) { p = await picPack(file, side); if (p.z.length <= PIC_MAXZ) break; }
    if (p.z.length > PIC_MAXZ) throw new Error('big');
    const parts = []; for (let i = 0; i < p.z.length; i += PIC_PART) parts.push(b64(p.z.subarray(i, i + PIC_PART)));
    const text = (S.conv.draft || '').trim(); S.conv.draft = '';
    S.conv.picQ = { parts }; S.conv.picBusy = 'Отправка… 0%'; refreshSheet();
    send({ t: 'convpic', op: 'begin', id: c.id, w: p.w, h: p.h, n: parts.length, text });
  } catch (e) { S.conv.picBusy = null; refreshSheet(); toast('Не удалось прочитать картинку — выберите другую.', 'err'); }
}
function convPicMsg(m) {
  const q = S.conv.picQ;
  if (m.done || !q) { S.conv.picQ = null; S.conv.picBusy = null; return refreshSheet(); }
  if (m.i < q.parts.length) { send({ t: 'convpic', op: 'part', i: m.i, data: q.parts[m.i] }); S.conv.picBusy = `Отправка… ${Math.round(m.i / q.parts.length * 100)}%`; refreshSheet(); }
}
let convPicInput = null;
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-cvopen],[data-cvyes],[data-cvno],[data-cvsend],[data-cvsmile],[data-cvsm],[data-cvpeople],[data-cvpic],[data-cvmore],[data-cvkick],[data-cvcancel],[data-cvrename],[data-cvdelete],[data-cvleave]');
  if (!t) return;
  const d = t.dataset, c = S.conv.cur;
  if (d.cvopen) { S.conv.cur = null; S.conv.more = 0; S.mailMenu = null; S.dlg.stale = true; send({ t: 'conv', op: 'view', id: Number(d.cvopen) }); return openSheet(convWin); }
  if (d.cvyes) return send({ t: 'conv', op: 'answer', id: Number(d.cvyes), yes: 1 });
  if (d.cvno) { if (confirm('Отказаться от приглашения в беседу?')) send({ t: 'conv', op: 'answer', id: Number(d.cvno), yes: 0 }); return; }
  if (!c) return;
  if (d.cvsend !== undefined) return convSend();
  if (d.cvsmile !== undefined) { const i = cvInput(); if (i) S.conv.draft = i.value; S.conv.smile = !S.conv.smile; return refreshSheet(); }
  if (d.cvsm) { const i = cvInput(); S.conv.draft = `${i ? i.value : S.conv.draft || ''}:${d.cvsm}:`; S.conv.smile = false; showSheet(false); $('#sheetBody').scrollTop = 1e9; return; }
  if (d.cvpeople !== undefined) { const i = cvInput(); if (i) S.conv.draft = i.value; return openSheet(convPeopleWin); }
  if (d.cvmore !== undefined) { S.conv.more = (S.conv.more || 60) + 100; return send({ t: 'conv', op: 'view', id: c.id, more: S.conv.more }); }
  if (d.cvpic !== undefined) {
    if (S.conv.picBusy) return;
    const i = cvInput(); if (i) S.conv.draft = i.value;
    if (!convPicInput) { convPicInput = document.createElement('input'); convPicInput.type = 'file'; convPicInput.accept = 'image/*'; convPicInput.style.display = 'none'; document.body.appendChild(convPicInput);
      convPicInput.addEventListener('change', () => { const f = convPicInput.files && convPicInput.files[0]; convPicInput.value = ''; if (f) convPicSend(f); }); }
    if (!S.conv.picHint) { S.conv.picHint = true; toast('Фото в беседе видят все участники 2 часа, потом оно удалится.'); }
    return convPicInput.click();
  }
  if (d.cvkick) { if (confirm(`Исключить ${d.name} из беседы?`)) send({ t: 'conv', op: 'kick', id: c.id, uid: Number(d.cvkick) }); return; }
  if (d.cvcancel) return send({ t: 'conv', op: 'cancel', id: c.id, uid: Number(d.cvcancel) });
  if (d.cvrename !== undefined) { const title = prompt('Новое название беседы:', c.title); if (title && title.trim()) send({ t: 'conv', op: 'rename', id: c.id, title: title.trim() }); return; }
  if (d.cvdelete !== undefined) { if (confirm(`Удалить беседу «${c.title}» для всех участников? Сообщения и фото пропадут.`)) send({ t: 'conv', op: 'delete', id: c.id }); return; }
  if (d.cvleave !== undefined) { if (confirm(`Выйти из беседы «${c.title}»?${c.own ? ' Беседа перейдёт к тому, кто в ней дольше всех.' : ''}`)) send({ t: 'conv', op: 'leave', id: c.id }); }
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.dataset.form;
  if (f === 'cvsend') { e.preventDefault(); e.stopImmediatePropagation(); return convSend(); }
  if (f === 'cvinvite') {
    e.preventDefault(); e.stopImmediatePropagation();
    const nick = e.target.login.value.trim(); if (!nick || !S.conv.cur) return;
    e.target.login.value = ''; send({ t: 'conv', op: 'invite', id: S.conv.cur.id, login: nick });
  }
}, true);
