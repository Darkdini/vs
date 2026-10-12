'use strict';
// Новости от администрации: список (свиток, заголовок, дата, страницы), «Новость» с комментариями.
// Непрочитанная новость — фиолетовый конверт в верхней панели; после прочтения он исчезает (см. renderTop в app.js).
// Сервер: server/src/news.js, API { t: 'news', op }.
S.news = { list: null, item: null, page: 0 };
function openNews() { S.news.list = null; send({ t: 'news', op: 'list', page: S.news.page }); openSheet(newsListWin); }
function openNewsItem(id, all) { S.news.item = null; send({ t: 'news', op: 'get', id, ...(all ? { all: 1 } : {}) }); openSheet(newsItemWin); }
const newsDate = (t) => `${new Date(t).toLocaleDateString('ru-RU')} ${new Date(t).toLocaleTimeString('ru-RU', { hour: 'numeric', minute: '2-digit' })}`;
function newsListWin() {
  const L = S.news.list; if (!L) return `${ribbon('Новости')}<p class="parch-note">Загрузка…</p>`;
  const nav = `<div class="hnav"><button data-npg="0" ${L.page ? '' : 'disabled'}>◀◀</button><button data-npg="${L.page - 1}" ${L.page ? '' : 'disabled'}>◀</button>
    <span>${L.page + 1}</span><button data-npg="${L.page + 1}" ${L.page < L.pages - 1 ? '' : 'disabled'}>▶</button><button data-npg="${L.pages - 1}" ${L.page < L.pages - 1 ? '' : 'disabled'}>▶▶</button></div>`;
  return `${ribbon('Новости')}${nav}<div class="nlist">${L.list.map((n) => `<button class="ncard ${n.read ? '' : 'new'}" data-news="${n.id}"><img src="gfx3d/news/scroll.png" alt="">
    <span><b>${esc(n.title)}</b><small>${newsDate(n.at)}${n.comments ? ` · 💬 ${n.comments}` : ''}</small></span></button>`).join('') || '<p class="parch-note">Новостей пока нет.</p>'}</div>`;
}
function newsItemWin() {
  const n = S.news.item; if (!n) return `${ribbon('Новость')}<p class="parch-note">Загрузка…</p>`;
  return `${ribbon('Новость')}<div class="nitem"><h3>${esc(n.title)}</h3><div class="ndate">${newsDate(n.at)}</div><div class="ntext">${smiles(esc(n.text))}</div>${(n.pics || []).length ? `<div class="nshots">${n.pics.map((p) => `<img src="newspic/${p}.png" alt="" data-nshot="${p}" loading="lazy">`).join('')}</div>` : ''}
    ${S.st.user.admin ? `<button class="pbar" data-newsdel="${n.id}">Удалить новость</button>` : ''}
    <form class="dform" data-form="newscmt"><input name="text" maxlength="300" autocomplete="off" placeholder="Ваш комментарий…"><button class="btn primary small">Отправить</button></form></div>
    ${ribbon('Комментарии:')}<div class="ncmts">${n.comments.length ? n.comments.slice().reverse().map((c) => `<div class="ncmt"><a class="fnick" data-cprof="${c.byId}">${esc(c.by)}:</a>
      <span>${smiles(esc(c.text))}</span><small>${newsDate(c.at)}</small>${n.canMod ? `<button class="ncdel" data-ncdel="${c.id}" aria-label="Удалить">✕</button>` : ''}</div>`).join('') : '<p class="parch-note">Комментариев пока нет — напишите первым.</p>'}</div>`;
}
function newsMsg(m) {
  if (m.view === 'list') { S.news.list = m.data; S.news.page = m.data.page; if (!m.quiet || S.sheets.includes(newsListWin)) return refreshSheet(); return; }
  if (m.view === 'item') { S.news.item = m.data; refreshSheet(); }
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-news],[data-npg],[data-newsdel],[data-ncdel]'); if (!t) return;
  const d = t.dataset;
  if (d.news) return openNewsItem(Number(d.news));
  if (d.npg !== undefined) return send({ t: 'news', op: 'list', page: Number(d.npg) });
  if (d.newsdel) { if (confirm('Удалить новость у всех игроков?')) { send({ t: 'news', op: 'delete', id: Number(d.newsdel) }); closeSheet(); } return; }
  if (d.ncdel) return send({ t: 'news', op: 'cmtdel', id: S.news.item.id, comment: Number(d.ncdel) });
});
$('#sheetBody').addEventListener('submit', (e) => {
  if (e.target.dataset.form !== 'newscmt') return;
  e.preventDefault(); e.stopImmediatePropagation();
  const f = e.target, text = f.text.value.trim(); if (!text || !S.news.item) return;
  send({ t: 'news', op: 'comment', id: S.news.item.id, text }); f.text.value = '';
}, true);

// скриншот новости — на весь экран по нажатию, закрыть — нажатием
document.addEventListener('click', (e) => {
  const im = e.target.closest('[data-nshot]'); if (!im) return;
  const d = document.createElement('div'); d.className = 'nshotfull'; d.innerHTML = `<img src="newspic/${im.dataset.nshot}.png" alt="">`;
  d.addEventListener('click', () => d.remove()); document.body.appendChild(d);
});

// ---------- публикация новости: администратор (Админ-панель → Мир) и старший модератор (Модерация → Новость) ----------
// скриншоты к новости: до 4, загружаются сразу (сервер пересобирает PNG), в форме — миниатюры с ✕
S.np = null;
const newsPicsHtml = () => { const n = S.np || { ids: [] };
  return `<div class="npics">${n.ids.map((id) => `<span class="npic"><img src="newspic/${id}.png" alt=""><button type="button" data-npdel="${id}" aria-label="Убрать">✕</button></span>`).join('')}
    ${n.ids.length < 4 ? `<button type="button" class="btn small" data-npadd ${n.busy ? 'disabled' : ''}>${n.busy ? esc(n.busy) : '📷 Добавить скриншот'}</button>` : ''}</div>`; };
let npInput = null;
// черновик новости: заголовок и текст не стираются, когда форма перерисовывается (загрузка скриншота)
$('#sheetBody').addEventListener('input', (e) => { if (e.target.dataset.npdraft === undefined) return; const f = e.target.form; S.npDraft = { title: f.title.value, text: f.text.value }; });
async function newsPicUpload(file) {
  if (typeof CompressionStream === 'undefined' || typeof createImageBitmap === 'undefined') return toast('Браузер не умеет загружать картинки — обновите его.', 'err');
  S.np = S.np || { ids: [] }; S.np.busy = 'Готовлю…'; refreshSheet();
  try {
    let p = null; for (const side of [1280, 1024, 800, 640]) { p = await picPack(file, side); if (p.z.length <= 24 * 150 * 1024) break; }
    if (p.z.length > 24 * 150 * 1024) throw new Error('big');
    const parts = []; for (let i = 0; i < p.z.length; i += 150 * 1024) parts.push(b64(p.z.subarray(i, i + 150 * 1024)));
    S.npQ = { parts }; S.np.busy = 'Загрузка… 0%'; refreshSheet(); send({ t: 'newspic', op: 'begin', w: p.w, h: p.h, n: parts.length });
  } catch (e) { S.np.busy = null; refreshSheet(); toast('Не удалось прочитать картинку.', 'err'); }
}
function newsPicMsg(m) {
  const q = S.npQ; if (!S.np) return;
  if (m.done) { S.npQ = null; S.np.busy = null; if (m.id) S.np.ids.push(m.id); return refreshSheet(); }
  if (q && m.i < q.parts.length) { send({ t: 'newspic', op: 'part', i: m.i, data: q.parts[m.i] }); S.np.busy = `Загрузка… ${Math.round(m.i / q.parts.length * 100)}%`; refreshSheet(); }
}
$('#sheetBody').addEventListener('click', (e) => {
  const d = e.target.closest('[data-npdel]'); if (d && S.np) { S.np.ids = S.np.ids.filter((x) => x !== d.dataset.npdel); return refreshSheet(); }
  if (!e.target.closest('[data-npadd]') || (S.np && S.np.busy)) return;
  if (!npInput) { npInput = document.createElement('input'); npInput.type = 'file'; npInput.accept = 'image/*'; npInput.style.display = 'none'; document.body.appendChild(npInput);
    npInput.addEventListener('change', () => { const f = npInput.files && npInput.files[0]; npInput.value = ''; if (f) newsPicUpload(f); }); }
  npInput.click();
});
function newsPubForm() {
  return `<form class="stack" data-newspub><input name="title" maxlength="80" placeholder="Заголовок" required value="${esc((S.npDraft || {}).title || '')}" data-npdraft><textarea name="text" rows="5" maxlength="4000" placeholder="Текст новости" required data-npdraft>${esc((S.npDraft || {}).text || '')}</textarea>${newsPicsHtml()}<button class="btn primary">Опубликовать</button></form>`;
}
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-newspub]'); if (!f) return; e.preventDefault(); e.stopImmediatePropagation();
  if (S.np && S.np.busy) return toast('Дождитесь загрузки скриншота.', 'err');
  if (!confirm(`Опубликовать новость всем игрокам${(S.np && S.np.ids.length) ? ` (скриншотов: ${S.np.ids.length})` : ''}?`)) return;
  send({ t: 'news', op: 'publish', title: f.title.value, text: f.text.value, pics: S.np ? S.np.ids : [] }); f.reset(); S.np = null; S.npDraft = null; refreshSheet();
});
