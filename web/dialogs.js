'use strict';
// «Сообщения» как в оригинале: список переписок (аватар, ник, начало последнего сообщения; непрочитанные выделены)
// и «Диалог» — переписка с одним игроком по дням, поле ввода со смайлами, «Отправить», «Профиль», «История».
// Сервер: dialogs / dialog / sendmail(dialog) / dialogclose в server/src/web.js.
S.dlg = { list: null, page: 0, filter: 'all', with: null, msgs: null };
function openDialogs() { S.dlg.list = null; S.dlg.menu = false; S.dlg.page = 0; S.dlg.stale = false; S.mailMenu = null; send({ t: 'dialogs', page: 0, filter: S.dlg.filter }); openSheet(dialogsWin); }

// Списки «Сообщения» и «Отчёты» (mil.js), как в оригинале: по 10 на страницу, стрелки листают; внизу слева — конверт,
// нажали — меню действий со всем списком и «Закрыть» (тогда ◀ в списке нет — style.css). В отчёте и в диалоге — только ◀ и ✕
function mailPager(key, page, pages) {
  const b = (to, t, on) => `<button data-${key}="${to}" ${on ? '' : 'disabled'}>${t}</button>`;
  return `<div class="hnav">${b(0, '◀◀', page > 0)}${b(page - 1, '◀', page > 0)}<span>${page + 1}</span>${b(page + 1, '▶', page < pages - 1)}${b(pages - 1, '▶▶', page < pages - 1)}</div>`;
}
const MAIL_OPS = [['all', 'Удалить всё'], ['read', 'Удалить прочитанные'], ['new', 'Удалить новые'], ['readall', 'Отметить как прочитанные']];
function mailMenuHtml(kind) { // kind: 'rep' — отчёты, 'dlg' — переписки
  if (S.mailMenu !== kind) return `<button class="mailset" data-mailmenu="${kind}" aria-label="Действия со списком"><img src="gfx3d/rep/mailset.png" alt=""></button>`;
  return `<div class="mailshade" data-mailmenu="close"></div><div class="mailmenu">${MAIL_OPS.map(([op, t]) => `<button data-mailop="${op}">${t}</button>`).join('')}</div>
    <div class="mailbar"><button data-mailmenu="close">Закрыть</button></div>`;
}
const MAIL_ASK = { rep: { all: 'Удалить все отчёты?', read: 'Удалить все прочитанные отчёты?', new: 'Удалить все новые (непрочитанные) отчёты?' },
  dlg: { all: 'Удалить все переписки?', read: 'Удалить переписки, где всё прочитано?', new: 'Удалить переписки с новыми сообщениями?' } };
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-mailmenu],[data-mailop]'); if (!t) return;
  const d = t.dataset;
  if (d.mailmenu !== undefined) { S.mailMenu = d.mailmenu === 'close' ? null : d.mailmenu; return refreshSheet(); }
  const kind = S.mailMenu, op = d.mailop; if (!kind) return;
  S.mailMenu = null; refreshSheet();
  if (op !== 'readall' && !confirm(`${MAIL_ASK[kind][op]}${kind === 'dlg' ? ' У собеседников сообщения останутся.' : ''}`)) return;
  if (kind === 'rep') return send(op === 'readall' ? { t: 'repread', page: S.repPage } : { t: 'repdel', ids: op, page: S.repPage });
  return send({ t: 'msgbulk', op, page: S.dlg.page, filter: S.dlg.filter });
});
function openDialog(who) { S.dlg.msgs = null; S.dlg.with = null; S.dlg.more = 30; S.dlg.edit = false; S.dlg.sel = {}; send({ t: 'dialog', ...(typeof who === 'number' ? { id: who } : { with: who }) }); openSheet(dialogWin); }
const dlgAva = (u) => `<span class="dava">${avaFramed(u, u.avatar ? `<img src="avatar/${u.id}.png?v=${u.avatar}" alt="">` : raceAva(u.race))}</span>`; // нет своей — портрет расы (ui3d.js)
const dlgCut = (t, n = 22) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; let c = s.slice(0, n); const m = /:([A-Za-z]*)$/.exec(c); if (m && !(SMILE_SET.has(m[1]) && s[n] === ':')) c = c.slice(0, m.index); return `${c.trimEnd()}…`; };

function dialogsWin() {
  const d = S.dlg, L = d.list;
  const head = `${ribbon('Сообщения')}<div class="rkbar"><span><img src="${M3('msgs')}" alt=""> ${d.filter === 'unread' ? 'Непрочитанные' : 'Все'}</span><button data-dlgmenu>≡</button></div>
    ${d.menu ? `<div class="rkmenu"><button data-dlgf="all" class="${d.filter === 'all' ? 'on' : ''}"><img src="${M3('msgs')}" alt=""> Все</button><button data-dlgf="unread" class="${d.filter === 'unread' ? 'on' : ''}"><img src="${M3('new')}" alt=""> Непрочитанные</button></div>` : ''}`;
  if (!L) return `${head}<p class="parch-note">Загрузка…</p>${mailMenuHtml('dlg')}`;
  if (d.stale) { d.stale = false; send({ t: 'dialogs', page: d.page, filter: d.filter }); } // вернулись из диалога — превью и счётчики свежие
  return `${head}${mailPager('dlgpg', L.page, L.pages)}
    <div class="dlist">${L.list.map((x) => `<button class="dcard ${x.unread ? 'new' : ''}" data-dlgopen="${x.id}">${dlgAva(x)}
      <span class="dtx"><b>${esc(x.login)}</b><span>${x.unread ? '<img class="denv" src="gfx3d/rep/envnew.svg" alt=""> ' : x.mine ? '<small>Вы:</small> ' : ''}${smiles(esc(dlgCut(x.text)))}</span></span>
      ${x.unread ? `<i class="dcnt">${x.unread}</i>` : ''}</button>`).join('') || `<p class="parch-note">${d.filter === 'unread' ? 'Непрочитанных нет.' : 'Переписок пока нет — написать игроку можно из его профиля.'}</p>`}</div>
    ${mailMenuHtml('dlg')}`;
}

// значок у сообщения — аватар игрока: своя картинка или портрет расы (как в списке переписок)
const dlgMini = (u) => `<span class="dmava">${u && u.avatar ? `<img src="avatar/${u.id}.png?v=${u.avatar}" alt="">` : raceAva(u && u.race)}</span>`;
// сообщения переписки по дням: кто, время, текст / фото / пересланный отчёт; other — собеседник { id, login, race, avatar };
// act(m) — кнопки под сообщением («Изменить», «История»)
function dlgMsgsHtml(msgs, other, act) {
  const me = S.st.user;
  let day = '', body = '';
  for (const m of msgs) if (m.pic && m.picExp <= now()) { delete m.pic; m.picGone = true; } // время вышло — фото исчезает сразу
  const picHtml = (m) => (m.pic ? `<button class="dpic" data-dlgview="pic/${m.pic}.png" data-exp="${m.picExp}"><img src="pic/${m.pic}.png" alt="Фото"></button><small class="dpict">⏳ исчезнет через ${picLeft(m.picExp)}</small>`
    : '<span class="dpicgone">📷 Фото удалено (фото хранятся 3 часа)</span>');
  // пересланный отчёт, как в оригинале: «Вам прислали ✉ Отчёт» и кнопка с его названием — открывает окно отчёта
  const repHtml = (m) => `<span class="drepw">${m.mine ? 'Вы переслали' : 'Вам прислали'} <img class="drepic" src="gfx3d/rep/envnew.svg" alt=""> Отчёт<button class="pbtn drepb" data-report="${Number(m.rep)}">${esc(m.repTitle || 'Открыть отчёт')}</button></span>`;
  for (const m of msgs) {
    const dd = new Date(m.at).toLocaleDateString('ru-RU');
    if (dd !== day) { day = dd; body += `<div class="ribbon ddate">${dd}</div>`; }
    const fw = m.fwd ? `<i class="dfwdl">↪ Переслано от ${esc(m.fwd)}</i>` : ''; // пересланное сообщение — от кого оно
    body += `<div class="dmsg ${m.mine ? 'mine' : ''}"><div class="dwho">${dlgMini(m.mine ? me : other)}<b>${esc(m.mine ? me.login : other.login)}</b></div>
      <div class="dline"><small>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>${m.rep ? repHtml(m) : m.pic || m.picGone ? `<span class="dpicw">${fw}${picHtml(m)}</span>` : `<span${/^#[0-9a-f]{6}$/i.test(m.color || '') ? ` style="color:${m.color}"` : ''}>${fw}${m.subject && !/^Re:/.test(m.subject) && !['Сообщение', 'Переслано'].includes(m.subject) ? `<b>${esc(m.subject)}</b><br>` : ''}${smiles(esc(m.text))}</span>`}</div>${act ? act(m) : ''}</div>`;
  }
  return body;
}
const dlgFwdBtn = (m) => `<button class="pbtn small dfwd" data-msgfwd="${m.id}"><img src="gfx3d/rep/fwd.png" alt=""> Переслать</button>`;
function dialogWin() {
  const d = S.dlg, w = d.with;
  if (!w) return `${ribbon('Диалог')}<p class="parch-note">Загрузка…</p>`;
  if (d.msgs.some((m) => m.pic) && !S.dlg.picTimer) S.dlg.picTimer = setTimeout(() => { S.dlg.picTimer = null; if (S.sheets[S.sheets.length - 1] === dialogWin) refreshSheet(); }, 20000); // отсчёт «исчезнет через…»
  const sel = d.sel || (d.sel = {});
  // «Изменить», как в оригинале: под каждым сообщением «Переслать» и галочка «Удалить», внизу — «Удалить отмеченное» и «Удалить разговор»
  if (d.edit) {
    const body = dlgMsgsHtml(d.msgs, w, (m) => `<div class="dmact">${dlgFwdBtn(m)}<label class="dchk"><input type="checkbox" data-msgsel="${m.id}" ${sel[m.id] ? 'checked' : ''}> Удалить</label></div>`);
    return `${ribbon('Диалог')}<div class="dbody">${body || '<p class="parch-note">Сообщений нет.</p>'}</div>
      <div class="dctl"><button class="pbar" data-msgdelsel><img src="gfx3d/rep/del.png" alt=""> Удалить отмеченное</button><button class="pbar" data-msgdelall><img src="gfx3d/rep/del.png" alt=""> Удалить разговор</button>
      <button class="pbar" data-dlgedit>Готово</button></div>`;
  }
  const fr = !w.friend || w.friend === 'in' ? `<button type="button" class="dsm dfr" data-dlgfriend title="${w.friend === 'in' ? 'Принять дружбу' : 'Добавить в друзья'}"><img src="gfx3d/prof/friend.png" alt="В друзья"></button>` : '';
  return `${ribbon('Диалог')}
    <div class="dbody">${dlgMsgsHtml(d.msgs, w) || '<p class="parch-note">Сообщений ещё нет — напишите первым.</p>'}</div>
    <div class="dctl"><form class="dform" data-form="dlgsend"><input name="text" maxlength="4000" autocomplete="off" placeholder="Сообщение для ${esc(w.login)}" value="${esc(d.draft || '')}">
      <button type="button" class="dsm" data-dlgsmile><img src="gfx3d/smiles2/smile.png" alt="Смайлы"></button>${fr}</form>
    ${S.dlg.picBusy ? `<div class="dpicst">📷 ${esc(S.dlg.picBusy)}</div>` : ''}
    ${d.smile ? `<div class="smilebox">${SMILES.map((k) => `<button data-dlgsm="${k}"><img src="${smileSrc(k)}" alt=""></button>`).join('')}</div>` : ''}
    <button class="pbar dsend" data-dlgsend><img src="${GFX}dlg/send.png" alt=""> Отправить</button>
    <div class="two2"><button class="pbar" data-cprof="${w.id}"><img src="${GFX}dlg/profile.png" alt=""> Профиль</button><button class="pbar" data-dlghist><img src="${GFX}dlg/history.png" alt=""> История</button></div>
    <div class="two2"><button class="pbar" data-dlgedit><img src="${GFX}dlg/edit.png" alt=""> Изменить</button><button class="pbar" data-dlgpic><img src="${GFX}dlg/file.png" alt=""> Файл</button></div></div>`; // значки кнопок — web/gfx/dlg
}
// «История» переписки, как в оригинале: листать страницы и пересылать сообщения
function dialogHistWin() {
  const h = S.dlgHist; if (!h) return `${ribbon('История')}<p class="parch-note">Загрузка…</p>`;
  const nav = h.pages > 1 ? `<div class="hnav"><button data-dhpg="0" ${h.page ? '' : 'disabled'}>◀◀</button><button data-dhpg="${h.page - 1}" ${h.page ? '' : 'disabled'}>◀</button>
    <span>${h.page + 1} из ${h.pages}</span><button data-dhpg="${h.page + 1}" ${h.page < h.pages - 1 ? '' : 'disabled'}>▶</button><button data-dhpg="${h.pages - 1}" ${h.page < h.pages - 1 ? '' : 'disabled'}>▶▶</button></div>` : '';
  return `${ribbon(`История: ${esc(h.with.login)}`)}${nav}<div class="dbody">${dlgMsgsHtml(h.list, h.with, (m) => `<div class="dmact">${dlgFwdBtn(m)}</div>`) || '<p class="parch-note">Сообщений нет.</p>'}</div>${nav}`;
}

function dialogsMsg(m) {
  if (m.t === 'dialogs') { S.dlg.list = m; return refreshSheet(); }
  if (m.t === 'dialoghist') { S.dlgHist = m; refreshSheet(); $('#sheetBody').scrollTop = 0; return; }
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
  const t = e.target.closest('[data-dlgmenu],[data-dlgf],[data-dlgpg],[data-dlgopen],[data-dlgsmile],[data-dlgsm],[data-dlgsend],[data-dlglist],[data-dlgmore]'); if (!t) return;
  const d = t.dataset;
  if (d.dlgmenu !== undefined) { S.dlg.menu = !S.dlg.menu; return refreshSheet(); }
  if (d.dlgf) { S.dlg.filter = d.dlgf; S.dlg.page = 0; S.dlg.menu = false; S.dlg.list = null; refreshSheet(); return send({ t: 'dialogs', page: 0, filter: S.dlg.filter }); }
  if (d.dlgpg !== undefined) { S.dlg.page = Math.max(0, Number(d.dlgpg)); return send({ t: 'dialogs', page: S.dlg.page, filter: S.dlg.filter }); }
  if (d.dlgopen) { S.dlg.stale = true; S.mailMenu = null; return openDialog(Number(d.dlgopen)); }
  if (d.dlgsmile !== undefined) { const i = $('#sheetBody .dform input'); if (i) S.dlg.draft = i.value; S.dlg.smile = !S.dlg.smile; return refreshSheet(); }
  if (d.dlgsm) { const i = $('#sheetBody .dform input'); S.dlg.draft = `${i ? i.value : S.dlg.draft || ''}:${d.dlgsm}:`; S.dlg.smile = false; showSheet(false); $('#sheetBody').scrollTop = 1e9; return; }
  if (d.dlgsend !== undefined) return dlgSend();
  if (d.dlglist !== undefined) { closeSheet(); return openDialogs(); }
  if (d.dlgmore !== undefined) { S.dlg.more = (S.dlg.more || 30) + 50; return send({ t: 'dialog', id: S.dlg.with.id, more: S.dlg.more }); }
});
// «История», «Изменить» (переслать, удалить отмеченное / весь разговор), «В друзья» — server/src/web.js dialoghist, msgfwd, msgdel
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-dlghist],[data-dhpg],[data-dlgedit],[data-msgfwd],[data-msgdelsel],[data-msgdelall],[data-dlgfriend]'); if (!t) return;
  const d = t.dataset, w = S.dlg.with;
  if (d.dhpg !== undefined) return send({ t: 'dialoghist', id: S.dlgHist.with.id, page: Number(d.dhpg) });
  if (d.msgfwd) { const to = prompt('Кому переслать сообщение? Ник игрока:'); if (to && to.trim()) send({ t: 'msgfwd', id: Number(d.msgfwd), to: to.trim() }); return; }
  if (!w) return;
  if (d.dlghist !== undefined) { S.dlgHist = null; send({ t: 'dialoghist', id: w.id }); return openSheet(dialogHistWin); }
  if (d.dlgedit !== undefined) { S.dlg.edit = !S.dlg.edit; S.dlg.sel = {}; S.dlg.smile = false; return refreshSheet(); }
  if (d.msgdelsel !== undefined) {
    const ids = Object.keys(S.dlg.sel || {}).filter((k) => S.dlg.sel[k]).map(Number);
    if (!ids.length) return toast('Отметьте галочкой, какие сообщения удалить.', 'err');
    if (!confirm(`Удалить отмеченные сообщения (${ids.length})? У ${w.login} они останутся.`)) return;
    S.dlg.sel = {}; return send({ t: 'msgdel', ids, dlg: w.id });
  }
  if (d.msgdelall !== undefined) { if (!confirm(`Удалить весь разговор с ${w.login}? У ${w.login} сообщения останутся.`)) return; S.dlg.sel = {}; S.dlg.edit = false; return send({ t: 'msgdel', with: w.id }); }
  if (d.dlgfriend !== undefined) { send({ t: 'friend', op: w.friend === 'in' ? 'accept' : 'add', id: w.id }); return setTimeout(() => send({ t: 'dialog', id: w.id, keep: 1 }), 300); }
});
$('#sheetBody').addEventListener('change', (e) => { const c = e.target.closest('[data-msgsel]'); if (c) S.dlg.sel[c.dataset.msgsel] = c.checked; });
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
