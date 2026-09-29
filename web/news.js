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
  return `${ribbon('Новость')}<div class="nitem"><h3>${esc(n.title)}</h3><div class="ndate">${newsDate(n.at)}</div><div class="ntext">${smiles(esc(n.text))}</div>
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
