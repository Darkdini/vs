'use strict';
// «Сообщения» как в оригинале: список переписок (аватар, ник, начало последнего сообщения; непрочитанные выделены)
// и «Диалог» — переписка с одним игроком по дням, поле ввода со смайлами, «Отправить», «Профиль», «История».
// Сервер: dialogs / dialog / sendmail(dialog) / dialogclose в server/src/web.js.
S.dlg = { list: null, page: 0, filter: 'all', with: null, msgs: null };
function openDialogs() { S.dlg.list = null; S.dlg.menu = false; send({ t: 'dialogs', page: S.dlg.page, filter: S.dlg.filter }); openSheet(dialogsWin); }
function openDialog(who) { S.dlg.msgs = null; S.dlg.with = null; S.dlg.more = 30; send({ t: 'dialog', ...(typeof who === 'number' ? { id: who } : { with: who }) }); openSheet(dialogWin); }
const dlgAva = (u) => `<span class="dava">${u.avatar ? `<img src="avatar/${u.id}.png?v=${u.avatar}" alt="">` : raceAva(u.race)}</span>`; // нет своей — портрет расы (ui3d.js)
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
  for (const m of d.msgs) if (m.pic && m.picExp <= now()) { delete m.pic; m.picGone = true; } // время вышло — фото исчезает сразу
  if (d.msgs.some((m) => m.pic) && !S.dlg.picTimer) S.dlg.picTimer = setTimeout(() => { S.dlg.picTimer = null; if (S.sheets[S.sheets.length - 1] === dialogWin) refreshSheet(); }, 20000); // отсчёт «исчезнет через…»
  const picHtml = (m) => (m.pic ? `<button class="dpic" data-dlgview="pic/${m.pic}.png" data-exp="${m.picExp}"><img src="pic/${m.pic}.png" alt="Фото"></button><small class="dpict">⏳ исчезнет через ${picLeft(m.picExp)}</small>`
    : '<span class="dpicgone">📷 Фото удалено (фото хранятся 3 часа)</span>');
  for (const m of d.msgs) {
    const dd = new Date(m.at).toLocaleDateString('ru-RU');
    if (dd !== day) { day = dd; body += `<div class="ribbon ddate">${dd}</div>`; }
    body += `<div class="dmsg ${m.mine ? 'mine' : ''}"><div class="dwho"><img src="gfx3d/prof/king.png" alt=""><b>${esc(m.mine ? me : w.login)}</b></div>
      <div class="dline"><small>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>${m.pic || m.picGone ? `<span class="dpicw">${picHtml(m)}</span>` : `<span${/^#[0-9a-f]{6}$/i.test(m.color || '') ? ` style="color:${m.color}"` : ''}>${m.subject && !/^Re:/.test(m.subject) && m.subject !== 'Сообщение' ? `<b>${esc(m.subject)}</b><br>` : ''}${smiles(esc(m.text))}</span>`}</div></div>`;
  }
  return `${ribbon('Диалог')}
    ${d.hasMore ? '<button class="pbar" data-dlgmore>Показать раньше</button>' : ''}
    <div class="dbody">${body || '<p class="parch-note">Сообщений ещё нет — напишите первым.</p>'}</div>
    <form class="dform" data-form="dlgsend"><input name="text" maxlength="4000" autocomplete="off" placeholder="Сообщение для ${esc(w.login)}" value="${esc(d.draft || '')}">
      <button type="button" class="dsm dpicb" data-dlgpic title="Прикрепить фото">📷</button><button type="button" class="dsm" data-dlgsmile><img src="gfx3d/smiles2/smile.png" alt="Смайлы"></button></form>
    ${S.dlg.picBusy ? `<div class="dpicst">📷 ${esc(S.dlg.picBusy)}</div>` : ''}
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

// ---------- фото в сообщениях (server/src/pics.js): живут 3 часа ----------
const picLeft = (exp) => { const m = Math.max(1, Math.ceil((exp - now()) / 60000 - 0.05)), h = Math.floor(m / 60); return h ? `${h} ч ${m % 60} мин` : `${m} мин`; };
// Браузер уменьшает картинку (до 960 точек по стороне) и отправляет только сжатые цвета точек — сам файл на сервер не уходит.
const PIC_SIDE = 960, PIC_PART = 150 * 1024, PIC_MAXZ = 14 * PIC_PART;
async function picPack(file, side) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, side / Math.max(bmp.width, bmp.height)), w = Math.max(8, Math.round(bmp.width * k)), h = Math.max(8, Math.round(bmp.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data, rgb = new Uint8Array(w * h * 3);
  for (let s = 0, d = 0; s < px.length; s += 4, d += 3) { rgb[d] = px[s]; rgb[d + 1] = px[s + 1]; rgb[d + 2] = px[s + 2]; }
  const z = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return { w, h, z };
}
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
async function picSend(file) {
  if (!S.dlg.with) return;
  if (typeof CompressionStream === 'undefined' || typeof createImageBitmap === 'undefined') return toast('Ваш браузер не умеет отправлять фото — обновите его.', 'err');
  S.dlg.picBusy = 'Готовлю фото…'; refreshSheet();
  try {
    let p = null;
    for (const side of [PIC_SIDE, 720, 540, 400]) { p = await picPack(file, side); if (p.z.length <= PIC_MAXZ) break; }
    if (p.z.length > PIC_MAXZ) throw new Error('big');
    const parts = []; for (let i = 0; i < p.z.length; i += PIC_PART) parts.push(b64(p.z.subarray(i, i + PIC_PART)));
    S.picQ = { parts, i: 0 }; S.dlg.picBusy = 'Отправка… 0%'; refreshSheet();
    send({ t: 'pic', op: 'begin', to: S.dlg.with.login, w: p.w, h: p.h, n: parts.length });
  } catch (e) { S.dlg.picBusy = null; refreshSheet(); toast('Не удалось прочитать картинку — выберите другую.', 'err'); }
}
// сервер подтверждает каждую часть — шлём следующую
function picMsg(m) {
  if (m.t !== 'picok') return false;
  const q = S.picQ;
  if (m.done || !q) { S.picQ = null; S.dlg.picBusy = null; refreshSheet(); return true; }
  if (m.i < q.parts.length) { send({ t: 'pic', op: 'part', i: m.i, data: q.parts[m.i] }); S.dlg.picBusy = `Отправка… ${Math.round(m.i / q.parts.length * 100)}%`; refreshSheet(); }
  return true;
}
let picInput = null;
$('#sheetBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-dlgpic]')) {
    if (S.dlg.picBusy) return;
    if (!picInput) { picInput = document.createElement('input'); picInput.type = 'file'; picInput.accept = 'image/*'; picInput.style.display = 'none'; document.body.appendChild(picInput);
      picInput.addEventListener('change', () => { const f = picInput.files && picInput.files[0]; picInput.value = ''; if (f) picSend(f); }); }
    if (!S.dlg.picHint) { S.dlg.picHint = true; toast('Фото видно собеседнику 3 часа, потом оно удалится.'); }
    return picInput.click();
  }
  const v = e.target.closest('[data-dlgview]'); if (!v) return;
  const d = document.createElement('div'); d.className = 'picview'; d.innerHTML = `<img src="${esc(v.dataset.dlgview)}" alt=""><button type="button">✕</button>`;
  const exp = Number(v.dataset.exp) || 0; // открытое во весь экран фото закрывается само, когда истекут 3 часа
  if (exp) setTimeout(() => { if (d.isConnected) { d.remove(); toast('Фото удалено — оно хранится 3 часа.'); if (S.sheets[S.sheets.length - 1] === dialogWin) refreshSheet(); } }, Math.max(0, exp - now()));
  d.addEventListener('click', () => d.remove()); document.body.appendChild(d);
});
