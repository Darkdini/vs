'use strict';
// Общий форум (Почта → Форум), как в оригинале: Правила / Модераторы / ★ избранное, разделы («Тем: N»),
// темы раздела (Новая тема — только модераторам, Категории, страницы), сообщения темы с ответом внизу;
// опрос в теме (как в Telegram) — карточкой вверху темы, создают модераторы (forumPollNewWin).
// Сервер: server/src/forum.js, API { t: 'forum', op }.
const FG = 'gfx3d/forum/';
const FORUM_RULES = [
  ['Правила игры', null], // текст — из каталога (rules.js: gameRulesHtml)
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
// значок роли — наш (как в профиле): администратор или модератор форума
const fBadge = (role) => (role ? `<img class="fbadge" src="${GFX}${role === 'admin' ? 'admin' : 'mod'}_badge_s.png" alt="">` : '');
const fWho = (name, id, role) => `${fBadge(role)}<a class="fnick ${role ? 'mod' : ''}" data-cprof="${id}">${esc(name)}</a>`;
// аватарка автора сообщения: своё фото или портрет расы (как в переписке)
const fAva = (p) => `<span class="dmava fava" data-cprof="${p.byId}">${p.ava ? `<img src="avatar/${p.byId}.png?v=${p.ava}" alt="">` : raceAva(p.race)}</span>`;
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
    ${d.topics.map((t) => `<button class="fcard ${t.deleted ? 'fdel' : ''}" data-ftopic="${t.id}"><div><b>${t.pinned ? '📌 ' : ''}${t.closed ? '🔒 ' : ''}${t.poll ? '📊 ' : ''}${esc(t.title)}</b>
      <span>${fWho(t.by, t.byId, 1)} Ответов: ${t.replies}</span><small>${t.last ? `${repDate(t.last.at)} от ${esc(t.last.by)}` : ''}</small></div>${fArrow}</button>`).join('')
      || '<p class="parch-note">В этом разделе пока нет тем.</p>'}
    ${fPager(d.page, d.pages, 'data-ftpg')}`;
}
function forumPostsWin() {
  const d = S.fr.posts;
  if (!d) return `${ribbon('Форум')}<p class="parch-note">Загрузка…</p>`;
  const mod = d.canMod, rt = S.fr.replyTo; // «Ответить»: кому отвечаем (сбрасывается при входе в тему и после отправки)
  return `${fRib(d.title)}
    <div class="ftools"><button data-fr="fav" class="${d.fav ? 'on' : ''}"><img src="${FG}star.png" alt=""> ${d.fav ? 'В избранном' : 'В избранное'}</button>
      ${mod ? `<button data-ftop="pin">${d.pinned ? 'Открепить' : 'Закрепить'}</button><button data-ftop="close">${d.closed ? 'Открыть' : 'Закрыть'}</button>
      <button data-ftop="${d.deleted ? 'restore' : 'delete'}">${d.deleted ? 'Восстановить' : 'Удалить тему'}</button>${d.poll || d.deleted ? '' : '<button data-fr="poll">📊 Опрос</button>'}` : ''}</div>
    ${d.deleted ? '<div class="bwline center small">Тема удалена — её видят только модераторы.</div>' : ''}
    ${d.poll ? fPollCard(d.poll, mod) : ''}
    ${fPager(d.page, d.pages, 'data-fppg')}
    ${d.posts.map((p) => `<div class="fpost ${p.deleted ? 'fdel' : ''}"><div class="fph">${fAva(p)}${fWho(p.by, p.byId, p.role)}<small>${repDate(p.at)}</small></div>
      ${p.reply ? `<div class="fquote">↪ <b>${esc(p.reply.by)}</b>: «${smiles(esc(p.reply.text))}»</div>` : ''}
      <div class="fpt"${/^#[0-9a-f]{6}$/i.test(p.color || '') ? ` style="color:${p.color}"` : ''}>${smiles(esc(p.text))}</div>
      ${(d.canPost && !p.deleted) || mod ? `<div class="fpm">${d.canPost && !p.deleted ? `<button data-freply="${p.id}">Ответить</button>` : ''}${mod ? `${p.deleted ? `<button data-fpdel="${p.id}">Восстановить</button>` : ''}${d.page === 0 && p === d.posts[0] ? '' : `<button data-fpdel="${p.id}" data-fforever="1">${p.deleted ? 'Удалить навсегда' : 'Удалить'}</button>`}${p.role ? '' : `<button data-fban="${p.byId}" data-fbanname="${esc(p.by)}">Запрет</button>`}` : ''}</div>` : ''}</div>`).join('')}
    ${fPager(d.page, d.pages, 'data-fppg')}
    ${d.canPost ? `<form class="fform" data-form="freply">${rt ? `<div class="fquote fto"><span>↪ Ответ для <b>${esc(rt.by)}</b>: «${smiles(esc(rt.text))}»</span><button type="button" class="fxto" data-freplyx title="Не отвечать на это сообщение">✕</button></div>` : ''}<textarea name="text" maxlength="1500" rows="3" placeholder="Ваш ответ…" required></textarea>${smileBar()}<button class="lbar">Ответить</button></form>`
      : `<div class="bwline center small">${d.closed ? 'Тема закрыта — отвечать нельзя.' : esc(d.ban || '')}</div>`}`;
}
// опрос: пока игрок не голосовал — варианты-кнопки (один вариант — голос сразу, несколько — галочки и «Голосовать»);
// после голоса или завершения — полоски с процентами, ✔ у своего выбора; модератору итоги видны сразу.
// Та же карточка — в общем чате (ui3d.js): o.pre = 'c' (кнопки data-cpoll…), o.id — номер опроса, o.sel — отмеченные варианты
function fPollCard(p, mod, o = {}) {
  const pre = o.pre || 'f', pid = o.id ? ` data-pid="${o.id}"` : '', sel = o.sel || (pre === 'f' ? S.fr.pollSel : null) || [], when = p.open ? (p.until ? ` · до ${repDate(p.until)}` : '') : ' · завершён';
  const row = (o, i) => { const inner = `${p.results ? `<span class="fpbar" style="width:${o.pct}%"></span>` : ''}<span class="fpt2">${p.multi && p.canVote ? (sel.includes(i) ? '☑ ' : '☐ ') : ''}${o.mine ? '✔ ' : ''}${esc(o.text)}</span>${p.results ? `<b class="fpp">${o.pct}%</b>` : ''}`;
    const who = o.voters && (o.voters.length || o.more) ? `<small class="fpvote">${o.voters.map(esc).join(', ')}${o.more ? ` и ещё ${o.more}` : ''}</small>` : '';
    return `${p.canVote ? `<button class="fpopt ${sel.includes(i) ? 'on' : ''}" data-${pre}poll="${i}"${pid}>${inner}</button>` : `<div class="fpopt ${o.mine ? 'mine' : ''}">${inner}</div>`}${who}`; };
  return `<div class="fpoll"><div class="fpq">📊 ${esc(p.q)}</div><div class="fpm2">${p.public ? 'Открытый опрос' : 'Анонимный опрос'}${p.multi ? ' · можно выбрать несколько' : ''}${when}</div>
    ${p.opts.map(row).join('')}
    <div class="fpfoot"><span>Проголосовало: <b>${p.total}</b></span>${p.canVote && p.multi ? `<button class="pbtn small" data-${pre}pollgo${pid} ${sel.length ? '' : 'disabled'}>Голосовать</button>` : ''}
      ${p.mine && p.open ? `<button class="pbtn small" data-${pre}pollun${pid}>Отменить голос</button>` : ''}</div>
    ${mod ? `<div class="fpm">${p.open ? `<button data-${pre}pollclose${pid}>Завершить опрос</button>` : ''}<button data-${pre}polldel${pid}>Удалить опрос</button></div>` : ''}</div>`;
}
// новый опрос (модератор): вопрос, 2–10 вариантов (4 поля сразу, «Ещё вариант» — следующее), несколько ответов, открытый, срок
function forumPollNewWin() {
  const d = S.fr.posts;
  return `${ribbon('Новый опрос')}<div class="bwline center small">Тема: <b>${esc(d ? d.title : '')}</b></div>${pollFormHtml('fpoll')}`;
}
// форма нового опроса: form — 'fpoll' (форум) или 'cpoll' (общий чат, ui3d.js)
function pollFormHtml(form) {
  return `<form class="fform fpollnew" data-form="${form}"><input name="q" maxlength="200" placeholder="Вопрос, например: Кто победит?" required>
      ${Array.from({ length: 10 }, (_, i) => `<input name="o${i}" maxlength="100" placeholder="Вариант ${i + 1}${i < 2 ? '' : ' (необязательно)'}" ${i < 2 ? 'required' : ''} class="${i < 4 ? '' : 'hidden'}">`).join('')}
      <button type="button" class="pbtn small" data-fpolladd>+ Ещё вариант</button>
      <label class="check"><input type="checkbox" name="multi"> Можно выбрать несколько вариантов</label>
      <label class="check"><input type="checkbox" name="public"> Показывать всем, кто как голосовал</label>
      <label class="fpdays">Срок: <select name="days"><option value="0">без срока</option><option value="1">1 день</option><option value="3">3 дня</option><option value="7">7 дней</option></select></label>
      <button class="lbar">Создать опрос</button></form>`;
}
function forumNewTopicWin() {
  const d = S.fr.topics;
  return `${ribbon('Новая тема')}<div class="bwline center small">Раздел: <b>${esc(d ? d.name : '')}</b></div>
    <form class="fform" data-form="ftopic"><input name="title" maxlength="80" placeholder="Название темы" required><textarea name="text" maxlength="1500" rows="6" placeholder="Первое сообщение" required></textarea>${smileBar()}
    <button class="lbar">Создать тему</button></form>`;
}
function forumRulesWin() {
  const k = S.frRule || 0;
  return `${ribbon('Правила')}<div class="frtabs">${FORUM_RULES.map(([t], i) => `<button class="${i === k ? 'on' : ''}" data-frrule="${i}">${t}</button>`).join('')}</div>
    ${FORUM_RULES[k][1] === null ? `<div class="frtext grbox">${gameRulesHtml()}</div>` : `<div class="frtext">${esc(FORUM_RULES[k][1])}</div>`}`;
}
function forumModsWin() {
  const list = S.fr && S.fr.sections; if (!list) return forumSecWin();
  const admin = S.st.user.admin;
  return list.map((s) => `${fRib(s.name)}${s.mods.length ? s.mods.map((m) => `<div class="fcard fmod">${fBadge('mod')}<b>${esc(m)}</b>${admin ? `<button class="pbtn small" data-fsecmod="${s.id}" data-login="${esc(m)}">Снять</button>` : ''}</div>`).join('')
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
  if (m.view === 'posts') { S.fr.topic = m.data.id; S.fr.pollSel = []; }
  if (m.pollMade && S.sheets.length && S.sheets[S.sheets.length - 1] === forumPollNewWin) { closeSheet(); return; } // опрос создан — назад в тему
  if (m.view === 'posts' && m.replace === 0 && S.sheets.length) { S.sheets[S.sheets.length - 1] = forumPostsWin; showSheet(true); return; }
  refreshSheet();
  if (m.scroll) $('#sheetBody').scrollTop = 99999;
}

$('#sheetBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-cprof]')) return;
  const t = e.target.closest('[data-fr],[data-fsec],[data-ftopic],[data-ftpg],[data-fppg],[data-ftop],[data-fpdel],[data-fban],[data-frrule],[data-fsecmod],[data-freply],[data-freplyx],[data-fpoll],[data-fpollgo],[data-fpollun],[data-fpollclose],[data-fpolldel],[data-fpolladd]'); if (!t) return;
  const d = t.dataset, pg = S.fr.posts && S.fr.posts.page;
  if (d.fpoll !== undefined) { // голос: один вариант — сразу, несколько — галочки
    const p = S.fr.posts && S.fr.posts.poll, i = Number(d.fpoll); if (!p) return;
    if (!p.multi) return fsend({ op: 'pollvote', topic: S.fr.topic, opts: [i], page: pg });
    const sel = S.fr.pollSel || []; S.fr.pollSel = sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]; return refreshSheet();
  }
  if (d.fpollgo !== undefined) return fsend({ op: 'pollvote', topic: S.fr.topic, opts: S.fr.pollSel || [], page: pg });
  if (d.fpollun !== undefined) return fsend({ op: 'pollunvote', topic: S.fr.topic, page: pg });
  if (d.fpollclose !== undefined) { if (!confirm('Завершить опрос? Голосовать больше будет нельзя, итоги увидят все.')) return; return fsend({ op: 'pollclose', topic: S.fr.topic, page: pg }); }
  if (d.fpolldel !== undefined) { if (!confirm('Удалить опрос вместе с голосами?')) return; return fsend({ op: 'polldel', topic: S.fr.topic, page: pg }); }
  if (d.fpolladd !== undefined) { const h = t.form && [...t.form.querySelectorAll('input[name^="o"].hidden')][0]; if (h) { h.classList.remove('hidden'); h.focus(); } if (!(t.form && t.form.querySelector('input[name^="o"].hidden'))) t.classList.add('hidden'); return; }
  if (d.freply) { // ответ на сообщение: ник и начало его текста — над полем ответа; поле внизу страницы, сразу в нём
    const p = (S.fr.posts && S.fr.posts.posts || []).find((x) => x.id === Number(d.freply)); if (!p) return;
    S.fr.replyTo = { id: p.id, by: p.by, text: p.text.length > 90 ? `${p.text.slice(0, 90)}…` : p.text }; refreshSheet();
    const f = $('[data-form="freply"]'); if (!f) return;
    if (!f.text.value.trim()) f.text.value = `${p.by}, `;
    f.scrollIntoView({ block: 'end' }); f.text.focus(); f.text.setSelectionRange(f.text.value.length, f.text.value.length); return;
  }
  if (d.freplyx !== undefined) { S.fr.replyTo = null; return refreshSheet(); }
  if (d.fsec) { S.fr.topics = null; S.fr.sec = Number(d.fsec); fsend({ op: 'topics', section: S.fr.sec }); return openSheet(forumTopicsWin); }
  if (d.ftopic) { S.fr.posts = null; S.fr.replyTo = null; S.fr.topic = Number(d.ftopic); fsend({ op: 'posts', topic: S.fr.topic, page: -1 }); return openSheet(forumPostsWin); }
  if (d.ftpg !== undefined) return fsend({ op: 'topics', section: S.fr.sec, page: Number(d.ftpg) });
  if (d.fppg !== undefined) return fsend({ op: 'posts', topic: S.fr.topic, page: Number(d.fppg) });
  if (d.ftop) { if (d.ftop === 'delete' && !confirm('Удалить тему?')) return; return fsend({ op: 'topicop', topic: S.fr.topic, act: d.ftop, page: S.fr.posts && S.fr.posts.page }); }
  if (d.fpdel) { // «Удалить» — сразу и навсегда (с подтверждением); «Восстановить» — у скрытых раньше
    if (d.fforever && !confirm('Удалить сообщение навсегда? Вернуть его будет нельзя.')) return;
    return fsend({ op: 'postdel', topic: S.fr.topic, post: Number(d.fpdel), forever: !!d.fforever, page: S.fr.posts && S.fr.posts.page });
  }
  if (d.fban) { const h = prompt(`Запретить ${d.fbanname} писать на форуме. Часов (0 — снять, -1 — навсегда):`, '24'); if (h === null) return; return fsend({ op: 'ban', topic: S.fr.topic, id: Number(d.fban), hours: Number(h) }); }
  if (d.frrule !== undefined) { S.frRule = Number(d.frrule); return refreshSheet(); }
  if (d.fsecmod) return fsend({ op: 'secmod', section: Number(d.fsecmod), login: d.login });
  switch (d.fr) {
    case 'rules': return openSheet(forumRulesWin);
    case 'mods': return openSheet(forumModsWin);
    case 'favs': S.fr.favs = null; fsend({ op: 'favs' }); return openSheet(forumFavsWin);
    case 'newtopic': return openSheet(forumNewTopicWin);
    case 'poll': return openSheet(forumPollNewWin);
    case 'cats': return closeSheet();
    case 'fav': return fsend({ op: 'fav', topic: S.fr.topic, page: S.fr.posts && S.fr.posts.page });
  }
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.form; if (!['freply', 'ftopic', 'fsecmod', 'fpoll'].includes(k)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (document.activeElement) document.activeElement.blur();
  if (k === 'freply') { fsend({ op: 'post', topic: S.fr.topic, text: f.text.value, reply: S.fr.replyTo ? S.fr.replyTo.id : undefined }); f.text.value = ''; S.fr.replyTo = null; }
  if (k === 'ftopic') fsend({ op: 'topic', section: S.fr.sec, title: f.title.value, text: f.text.value });
  if (k === 'fsecmod') fsend({ op: 'secmod', section: Number(f.dataset.sec), login: f.login.value });
  if (k === 'fpoll') fsend({ op: 'pollcreate', topic: S.fr.topic, q: f.q.value, opts: Array.from({ length: 10 }, (_, i) => f[`o${i}`].value.trim()).filter(Boolean),
    multi: f.multi.checked, public: f.public.checked, days: Number(f.days.value), page: S.fr.posts && S.fr.posts.page });
}, true);
