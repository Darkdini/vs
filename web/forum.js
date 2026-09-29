'use strict';
// Общий форум (Почта → Форум), как в оригинале: Правила / Модераторы / ★ избранное, разделы («Тем: N»),
// темы раздела (Новая тема — только модераторам, Категории, страницы), сообщения темы с ответом внизу.
// Сервер: server/src/forum.js, API { t: 'forum', op }.
const FG = 'gfx3d/forum/';
const FORUM_RULES = [
  ['Общее', `  Данные правила созданы для максимального комфорта при общении пользователей на форуме игры. Трактовка этих правил является исключительно прерогативой Администрации проекта. Администрация ориентируется на данные правила, но оставляет за собой возможность использования банов по своему усмотрению. Данные правила могут быть изменены и дополнены Администрацией проекта без предварительного согласования с пользователем. Вход на форум означает, что пользователь ознакомлен и безоговорочно согласен с правилами форума.
  За нарушение правил, Администрация проекта может ограничить доступ к общению на форуме для пользователя.
Текущие правила распространяются не только на форум, но и на игровые новости.`],
  ['Предупреждения', `  Флуд
  Доступ к форуму ограничивается за:
  1. Создание однотипных тем.
  2. Создание тем, не имеющих смысла - состоящих из символов, смайлов и т.д, как в теле сообщения, так и в названии темы.
  3. Размещение подряд нескольких однотипных ответов в теме.
  4. Размещение в теме постов, не связанных по смыслу, алфавиту.
  5. "up-анье" старых неактуальных тем, последние комментарии в которых были оставлены более 3-х недель назад.
  6. Общение на языке отличном от русского и непонятном большинству читателей форума.
  Офф-топ
Доступ к форуму ограничивается за создание тем не относящихся к тематике раздела.
  Капс
Доступ к форуму ограничивается в случае, когда ~50% и более текста сообщения набрано заглавными буквами.`],
  ['Оскорбления', `  Доступ к форуму ограничивается за создание тем или размещение постов, содержащих:
  1. Оскорбления других игроков, а также их близких без применения матерных слов.
  2. Ненормативную лексику (в том числе на иностранном языке) как в чей-то адрес, так и безадресно.
  3. Бранные слова, грубые жаргонизмы.
  4. Оскорбительные производные слов.
  5. Метафоры, отсылающие к названиям животных, обладающих негативными, с точки зрения общественного мнения, качествами.
  6. Пожелания несчастий в реальной жизни игроку и его близким.
  7. Адресные и безадресные рисунки оскорбительного характера из символов, а также фразы с рисунками оскорбительного содержания.
  8. Завуалированные выражения оскорбительного характера.`],
];

function openForum() { S.fr = { sections: null }; fsend({ op: 'sections' }); openSheet(forumSecWin); }
const fRib = (t) => `<div class="ribbon ${t.length > 24 ? 'rlong' : ''}">${esc(t)}</div>`;
const fsend = (m) => send({ t: 'forum', ...m });
const fArrow = `<img class="farrow" src="${FG}arrow.svg" alt="">`;
const fWho = (name, id, role) => `${role ? `<img class="fcrown" src="${FG}crown.png" alt="">` : ''}<a class="fnick ${role ? 'mod' : ''}" data-cprof="${id}">${esc(name)}</a>`;
const fPager = (pg, pages, attr) => pages > 1 ? `<div class="hpager">${Array.from({ length: pages }, (_, i) => `<button class="${i === pg ? 'on' : ''}" ${attr}="${i}">${i + 1}</button>`).join('')}</div>` : '';

function forumSecWin() {
  const list = S.fr && S.fr.sections;
  return `${ribbon('Форум')}<div class="ftop"><button data-fr="rules">Правила</button><button data-fr="mods">Модераторы</button><button data-fr="favs"><img src="${FG}star.png" alt="Избранное"></button></div>
    ${!list ? '<p class="parch-note">Загрузка…</p>' : list.map((s) => `<button class="fcard" data-fsec="${s.id}"><div><b>${esc(s.name)}</b><span>Тем: ${s.topics}</span></div>${fArrow}</button>`).join('')}`;
}
function forumTopicsWin() {
  const d = S.fr.topics;
  if (!d) return `${ribbon('Форум')}<p class="parch-note">Загрузка…</p>`;
  return `${fRib(d.name)}<div class="two2 fbtns">${d.canMod ? '<button data-fr="newtopic">Новая тема</button>' : ''}<button data-fr="cats">Категории</button></div>
    ${fPager(d.page, d.pages, 'data-ftpg')}
    ${d.topics.map((t) => `<button class="fcard ${t.deleted ? 'fdel' : ''}" data-ftopic="${t.id}"><div><b>${t.pinned ? '📌 ' : ''}${t.closed ? '🔒 ' : ''}${esc(t.title)}</b>
      <span>${fWho(t.by, t.byId, 1)} Ответов: ${t.replies}</span><small>${t.last ? `${repDate(t.last.at)} от ${esc(t.last.by)}` : ''}</small></div>${fArrow}</button>`).join('')
      || '<p class="parch-note">В этом разделе пока нет тем.</p>'}
    ${fPager(d.page, d.pages, 'data-ftpg')}`;
}
function forumPostsWin() {
  const d = S.fr.posts;
  if (!d) return `${ribbon('Форум')}<p class="parch-note">Загрузка…</p>`;
  const mod = d.canMod;
  return `${fRib(d.title)}
    <div class="ftools"><button data-fr="fav" class="${d.fav ? 'on' : ''}"><img src="${FG}star.png" alt=""> ${d.fav ? 'В избранном' : 'В избранное'}</button>
      ${mod ? `<button data-ftop="pin">${d.pinned ? 'Открепить' : 'Закрепить'}</button><button data-ftop="close">${d.closed ? 'Открыть' : 'Закрыть'}</button>
      <button data-ftop="${d.deleted ? 'restore' : 'delete'}">${d.deleted ? 'Восстановить' : 'Удалить тему'}</button>` : ''}</div>
    ${d.deleted ? '<div class="bwline center small">Тема удалена — её видят только модераторы.</div>' : ''}
    ${fPager(d.page, d.pages, 'data-fppg')}
    ${d.posts.map((p) => `<div class="fpost ${p.deleted ? 'fdel' : ''}"><div class="fph"><img class="fking" src="${FG}king.png" alt="">${fWho(p.by, p.byId, p.role)}<small>${repDate(p.at)}</small></div>
      <div class="fpt">${esc(p.text)}</div>
      ${mod ? `<div class="fpm"><button data-fpdel="${p.id}">${p.deleted ? 'Восстановить' : 'Удалить'}</button>${p.role ? '' : `<button data-fban="${p.byId}" data-fbanname="${esc(p.by)}">Запрет</button>`}</div>` : ''}</div>`).join('')}
    ${fPager(d.page, d.pages, 'data-fppg')}
    ${d.canPost ? `<form class="fform" data-form="freply"><textarea name="text" maxlength="1500" rows="3" placeholder="Ваш ответ…" required></textarea><button class="lbar">Ответить</button></form>`
      : `<div class="bwline center small">${d.closed ? 'Тема закрыта — отвечать нельзя.' : esc(d.ban || '')}</div>`}`;
}
function forumNewTopicWin() {
  const d = S.fr.topics;
  return `${ribbon('Новая тема')}<div class="bwline center small">Раздел: <b>${esc(d ? d.name : '')}</b></div>
    <form class="fform" data-form="ftopic"><input name="title" maxlength="80" placeholder="Название темы" required><textarea name="text" maxlength="1500" rows="6" placeholder="Первое сообщение" required></textarea>
    <button class="lbar">Создать тему</button></form>`;
}
function forumRulesWin() {
  const k = S.frRule || 0;
  return `${ribbon('Правила форума')}<div class="frtabs">${FORUM_RULES.map(([t], i) => `<button class="${i === k ? 'on' : ''}" data-frrule="${i}">${t}</button>`).join('')}</div>
    <div class="frtext">${esc(FORUM_RULES[k][1])}</div>`;
}
function forumModsWin() {
  const list = S.fr && S.fr.sections; if (!list) return forumSecWin();
  const admin = S.st.user.admin;
  return list.map((s) => `${fRib(s.name)}${s.mods.length ? s.mods.map((m) => `<div class="fcard fmod"><img class="fking" src="${FG}king.png" alt=""><b>${esc(m)}</b>${admin ? `<button class="pbtn small" data-fsecmod="${s.id}" data-login="${esc(m)}">Снять</button>` : ''}</div>`).join('')
    : '<p class="parch-note">Модератор не назначен — темы ведёт Администрация.</p>'}
    ${admin ? `<form class="fform frow" data-form="fsecmod" data-sec="${s.id}"><input name="login" placeholder="Ник игрока" required><button class="pbtn small">Назначить</button></form>` : ''}`).join('');
}
function forumFavsWin() {
  const f = S.fr && S.fr.favs;
  return `${ribbon('Избранные темы')}${!f ? '<p class="parch-note">Загрузка…</p>' : f.map((t) => `<button class="fcard" data-ftopic="${t.id}"><div><b>${esc(t.title)}</b><span>${esc(t.section)} · Ответов: ${t.replies}</span>
    <small>${t.last ? `${repDate(t.last.at)} от ${esc(t.last.by)}` : ''}</small></div>${fArrow}</button>`).join('') || '<p class="parch-note">Нет избранных тем — отметьте тему звёздочкой.</p>'}`;
}

function forumMsg(m) {
  S.fr = S.fr || {};
  S.fr[m.view] = m.data;
  if (m.view === 'posts') S.fr.topic = m.data.id;
  if (m.view === 'posts' && m.replace === 0 && S.sheets.length) { S.sheets[S.sheets.length - 1] = forumPostsWin; showSheet(true); return; }
  refreshSheet();
  if (m.scroll) $('#sheetBody').scrollTop = 99999;
}

$('#sheetBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-cprof]')) return;
  const t = e.target.closest('[data-fr],[data-fsec],[data-ftopic],[data-ftpg],[data-fppg],[data-ftop],[data-fpdel],[data-fban],[data-frrule],[data-fsecmod]'); if (!t) return;
  const d = t.dataset;
  if (d.fsec) { S.fr.topics = null; S.fr.sec = Number(d.fsec); fsend({ op: 'topics', section: S.fr.sec }); return openSheet(forumTopicsWin); }
  if (d.ftopic) { S.fr.posts = null; S.fr.topic = Number(d.ftopic); fsend({ op: 'posts', topic: S.fr.topic, page: -1 }); return openSheet(forumPostsWin); }
  if (d.ftpg !== undefined) return fsend({ op: 'topics', section: S.fr.sec, page: Number(d.ftpg) });
  if (d.fppg !== undefined) return fsend({ op: 'posts', topic: S.fr.topic, page: Number(d.fppg) });
  if (d.ftop) { if (d.ftop === 'delete' && !confirm('Удалить тему?')) return; return fsend({ op: 'topicop', topic: S.fr.topic, act: d.ftop, page: S.fr.posts && S.fr.posts.page }); }
  if (d.fpdel) return fsend({ op: 'postdel', topic: S.fr.topic, post: Number(d.fpdel), page: S.fr.posts && S.fr.posts.page });
  if (d.fban) { const h = prompt(`Запретить ${d.fbanname} писать на форуме. Часов (0 — снять, -1 — навсегда):`, '24'); if (h === null) return; return fsend({ op: 'ban', topic: S.fr.topic, id: Number(d.fban), hours: Number(h) }); }
  if (d.frrule !== undefined) { S.frRule = Number(d.frrule); return refreshSheet(); }
  if (d.fsecmod) return fsend({ op: 'secmod', section: Number(d.fsecmod), login: d.login });
  switch (d.fr) {
    case 'rules': return openSheet(forumRulesWin);
    case 'mods': return openSheet(forumModsWin);
    case 'favs': S.fr.favs = null; fsend({ op: 'favs' }); return openSheet(forumFavsWin);
    case 'newtopic': return openSheet(forumNewTopicWin);
    case 'cats': return closeSheet();
    case 'fav': return fsend({ op: 'fav', topic: S.fr.topic, page: S.fr.posts && S.fr.posts.page });
  }
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.form; if (!['freply', 'ftopic', 'fsecmod'].includes(k)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (document.activeElement) document.activeElement.blur();
  if (k === 'freply') { fsend({ op: 'post', topic: S.fr.topic, text: f.text.value }); f.text.value = ''; }
  if (k === 'ftopic') fsend({ op: 'topic', section: S.fr.sec, title: f.title.value, text: f.text.value });
  if (k === 'fsecmod') fsend({ op: 'secmod', section: Number(f.dataset.sec), login: f.login.value });
}, true);
