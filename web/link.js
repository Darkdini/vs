'use strict';
// «СВЯЗЬ» игрока (сервер: server/src/link.js, t:'link' / 'linkpic'): переписка с мастерами игры — жалобы, ошибки, вопросы.
// Строка «📮 СВЯЗЬ» всегда первая в «Сообщениях» (dialogs.js); к сообщению можно приложить скрин — он живёт 8 часов —
// или свой отчёт («📜 Отчёт» → выбор из своих отчётов; мастерам уходит копия, открывается как обычный отчёт).
// Ответы приходят от «Мастер игры». lkMsgHtml рисует сообщения и у мастеров (staff.js → «СВЯЗЬ»).
S.lk = { data: null, busy: null, draft: '', reps: null }; // draft — текст в поле (не теряется, пока выбирают отчёт)
// порог рейтинга (server social.js talkLow): не показываем табличку всем — только сообщение, когда игрок сам нажал
const talkLowToast = (what) => { const t = S.st && S.st.user.talkLow; toast(`${what} можно с рейтингом ${t.need}. У вас — ${t.have}. Развивайте замок — и сможете.`, 'err'); };
function openLink() { if (S.st.user.talkLow && S.st.user.talkLow.link) return talkLowToast('Писать мастерам и сообщать об ошибках');
  S.lk = { data: null, busy: null, draft: '', reps: null }; send({ t: 'link', op: 'view' }); openSheet(linkWin); }
const lkOpen = () => S.sheets.length && S.sheets[S.sheets.length - 1] === linkWin;
const lkPicUrl = (id) => `linkpic/${id}.png?k=${S.mkey || ''}`; // ключ соединения, не токен входа (server/src/web.js, MEDIA)
// сообщение переписки; who — ник игрока для мастеров (staff), у игрока — null
function lkMsgHtml(m, who) {
  const mine = who ? m.master : !m.master, name = m.master ? `🛡 ${esc(m.by)}` : who ? esc(who) : 'Вы';
  if (m.pic && m.picExp <= now()) { m.pic = null; m.picGone = true; } // время вышло — скрин исчезает сразу
  const pic = m.pic ? `<button class="sfpic" data-dlgview="${lkPicUrl(m.pic)}"><img src="${lkPicUrl(m.pic)}" alt="скрин" loading="lazy"></button><small class="sfexp">Скрин удалится через ${picLeft(m.picExp)}</small>`
    : m.picGone ? '<div class="sfgone">📷 Скрин удалён — прошло 8 часов</div>' : '';
  // отчёт — как пересланный отчёт в личных сообщениях (dialogs.js): «✉ Отчёт» и кнопка-название
  const rep = !m.rep ? '' : m.rep.gone ? `<div class="sfgone">📜 Отчёт «${esc(m.rep.title)}» — старая копия удалена</div>`
    : `<div class="lkrepw"><img class="drepic" src="gfx3d/rep/envnew.svg" alt=""> Отчёт<button type="button" class="pbtn drepb" data-lkrepopen="${m.id}">${esc(m.rep.title)}</button></div>`;
  return `<div class="sfmsg ${mine ? 'mine' : ''} ${m.master ? 'lkmaster' : ''}"><div class="sfhead"><b>${name}</b><small>${sfTime(m.at)}</small></div>
    ${m.text ? `<div class="sftext">${esc(m.text)}</div>` : ''}${pic}${rep}</div>`;
}
function linkWin() {
  const L = S.lk, d = L.data;
  const note = '<p class="small lknote">Напишите мастерам игры: жалоба на игрока, ошибка в игре или вопрос. Можно приложить скрин — он хранится 8 часов — или свой отчёт. Ответ придёт сюда же, от «Мастер игры».</p>';
  if (!d) return `${ribbon('СВЯЗЬ')}${note}<p class="parch-note">Загрузка…</p>`;
  return `${ribbon('СВЯЗЬ')}${note}${d.more ? `<p class="small center">Показаны последние ${d.msgs.length} сообщений</p>` : ''}
    <div class="sfmsgs lkmsgs">${d.msgs.map((m) => lkMsgHtml(m)).join('') || '<p class="parch-note">Сообщений пока нет.</p>'}</div>
    <form class="sfsend" data-lkform><textarea name="text" rows="3" maxlength="2000" placeholder="Что случилось?">${esc(L.draft || '')}</textarea>
      <div class="sfbtns"><button type="button" class="btn small" data-lkphoto ${L.busy ? 'disabled' : ''}>${L.busy ? esc(L.busy) : '📷 Скрин'}</button><button type="button" class="btn small" data-lkrep ${L.busy ? 'disabled' : ''}>📜 Отчёт</button><button class="btn primary small">Отправить</button></div></form>`;
}
// выбор отчёта: свои последние отчёты (как в «Отчётах»); нажали — сообщение с отчётом и текстом из поля уходит мастерам
function lkRepWin() {
  const L = S.lk.reps;
  return `${ribbon('Приложить отчёт')}<p class="small lknote">Выберите отчёт — он уйдёт мастерам игры вместе с текстом, который вы написали. Мастера увидят его, даже если потом вы удалите отчёт.</p>
    <div class="replist">${!L ? '<p class="parch-note">Загрузка…</p>' : L.map((r) => `<button type="button" class="repcard ${r.tone || 'info'}" data-lkreppick="${r.id}"><b>${esc(r.title)}</b><span>${repDate(r.at)}</span></button>`).join('') || '<p class="parch-note">Отчётов пока нет.</p>'}</div>`;
}
const lkScroll = () => setTimeout(() => { const b = $('#sheetBody'), l = $('.lkmsgs'); if (b && l) b.scrollTop = l.offsetTop + l.offsetHeight - b.clientHeight + 160; }, 30);
function linkMsg(m) {
  if (m.t === 'linkpicok') return lkPicMsg(m);
  if (m.t === 'linkreps') { S.lk.reps = m.list; if (S.sheets[S.sheets.length - 1] === lkRepWin) refreshSheet(); return; }
  if (!lkOpen()) { if (m.live) send({ t: 'link', op: 'leave' }); return; } // окно закрыто — сервер больше не шлёт обновлений
  S.lk.data = m.data;
  if (!m.live && S.lk.sent) { S.lk.sent = false; S.lk.draft = ''; } // сообщение с отчётом принято — поле пустое (отказ, например лимит, — текст остаётся)
  const typing = document.activeElement && document.activeElement.tagName === 'TEXTAREA';
  if (typing && m.live && $('.lkmsgs')) { $('.lkmsgs').innerHTML = m.data.msgs.map((x) => lkMsgHtml(x)).join(''); return lkScroll(); } // пишет — не сбивать поле ввода
  refreshSheet(); lkScroll();
}
// скрин: браузер уменьшает картинку и шлёт сжатые цвета точек (как фото в «МАСТЕРАХ» — staff.js sfPicSend)
async function lkPicSend(file, text) {
  if (typeof CompressionStream === 'undefined' || typeof createImageBitmap === 'undefined') return toast('Браузер не умеет отправлять картинки — обновите его.', 'err');
  S.lk.busy = 'Готовлю скрин…'; refreshSheet();
  try {
    let p = null; for (const side of [1280, 1024, 800, 640]) { p = await picPack(file, side); if (p.z.length <= 24 * 150 * 1024) break; }
    if (p.z.length > 24 * 150 * 1024) throw new Error('big');
    const parts = []; for (let i = 0; i < p.z.length; i += 150 * 1024) parts.push(b64(p.z.subarray(i, i + 150 * 1024)));
    S.lkQ = { parts }; S.lk.busy = 'Отправка… 0%'; refreshSheet();
    send({ t: 'linkpic', op: 'begin', w: p.w, h: p.h, n: parts.length, text });
  } catch (e) { S.lk.busy = null; refreshSheet(); toast('Не удалось прочитать картинку — выберите другую.', 'err'); }
}
function lkPicMsg(m) {
  const q = S.lkQ;
  if (m.done || !q) { S.lkQ = null; S.lk.busy = null; return refreshSheet(); }
  if (m.i < q.parts.length) { send({ t: 'linkpic', op: 'part', i: m.i, data: q.parts[m.i] }); S.lk.busy = `Отправка… ${Math.round(m.i / q.parts.length * 100)}%`; refreshSheet(); }
}
let lkInput = null;
$('#sheetBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-linkopen]')) return openLink(); // строка «📮 СВЯЗЬ» в «Сообщениях»
  // отчёт: открыть из переписки (и у мастеров — staff.js рисует те же сообщения), «📜 Отчёт» — выбор, выбрали — сообщение уходит
  const ro = e.target.closest('[data-lkrepopen]'); if (ro) return send({ t: 'link', op: 'rep', mid: Number(ro.dataset.lkrepopen) });
  if (e.target.closest('[data-lkrep]') && lkOpen() && !S.lk.busy) { S.lk.reps = null; send({ t: 'link', op: 'reps' }); return openSheet(lkRepWin); }
  const pick = e.target.closest('[data-lkreppick]');
  if (pick) { send({ t: 'link', op: 'post', text: (S.lk.draft || '').trim(), rep: Number(pick.dataset.lkreppick) }); S.lk.sent = true; return closeSheet(); } // текст уйдёт из поля, когда сервер примет
  if (!e.target.closest('[data-lkphoto]') || !lkOpen() || S.lk.busy) return;
  if (!lkInput) { lkInput = document.createElement('input'); lkInput.type = 'file'; lkInput.accept = 'image/*'; lkInput.style.display = 'none'; document.body.appendChild(lkInput);
    lkInput.addEventListener('change', () => { const file = lkInput.files && lkInput.files[0]; lkInput.value = ''; const ta = $('[data-lkform] textarea'); const text = ta ? ta.value.trim() : ''; if (ta) ta.value = ''; S.lk.draft = ''; if (file) lkPicSend(file, text); }); }
  lkInput.click();
});
$('#sheetBody').addEventListener('submit', (e) => {
  const fm = e.target; if (!fm.matches('[data-lkform]')) return; e.preventDefault();
  const text = fm.text.value.trim(); if (!text) return;
  fm.text.value = ''; S.lk.draft = ''; fm.text.blur(); send({ t: 'link', op: 'post', text });
});
// текст в поле запоминается: окно перерисовалось (выбор отчёта, ответ мастера) — написанное не пропадает
$('#sheetBody').addEventListener('input', (e) => { if (e.target.matches('[data-lkform] textarea')) S.lk.draft = e.target.value; });
