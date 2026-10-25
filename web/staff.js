'use strict';
// «МАСТЕРА» — закрытый раздел админа и тестеров (Меню → «МАСТЕРА»; сервер: server/src/staff.js, t:'staff').
// Как группа в Telegram с темами: список тем (закреплённые сверху, непрочитанное), переписка в теме,
// фото к сообщению (живёт 24 часа), опросы с голосованием, «↩» — ответ на сообщение с цитатой; темы удаляются и из списка (🗑).
// Новые сообщения приходят сразу, пока раздел открыт.
// «📮 СВЯЗЬ» — всегда первая строка списка (не тема: её нельзя удалить, закрыть или скрыть): переписки игроков с мастерами
// (server/src/link.js); ответ игрок получает сообщением от «Мастер игры»; «✔ Решено» — переписка больше не ждёт ответа.
const SF0 = () => ({ list: null, topic: null, compose: null, poll: null, picBusy: null, reply: null, link: null, linkTh: null, linkAll: false });
S.sf = SF0();
function openStaff(link) { S.sf = SF0(); send({ t: 'staff', op: link ? 'link' : 'view' }); openSheet(staffWin); }
const sfOpen = () => S.sheets.length && S.sheets[S.sheets.length - 1] === staffWin;
const sfTime = (t) => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : fmtDate(t); };
const sfPicUrl = (id) => `staffpic/${id}.png?k=${S.mkey || ''}`; // ключ соединения, не токен входа (server/src/web.js, MEDIA)
// «⬇ Скачать»: сервер отдаёт фото файлом (dl=1); в приложении для Android файл сохраняет само приложение в «Загрузки»
const sfDl = (id) => `<a class="btn small sfdl" href="${sfPicUrl(id)}&dl=1" download="mastera-${id.slice(0, 6)}.png">⬇ Скачать</a>`;
const sfLeft = (exp) => { const m = Math.max(1, Math.ceil((exp - now()) / 60000)), h = Math.floor(m / 60); return h ? `${h} ч ${m % 60} мин` : `${m} мин`; };

function staffWin() {
  const f = S.sf;
  if (f.topic) return sfTopicHtml(f.topic);
  if (f.linkTh) return sfLinkThHtml(f.linkTh);
  if (f.link) return sfLinkHtml(f.link);
  const d = f.list; if (!d) return `${ribbon('МАСТЕРА')}<p class="parch-note">Загрузка…</p>`;
  const nt = f.compose === 'topic' ? `<form class="stack sfnew" data-sfform="topic"><input name="title" maxlength="60" placeholder="Название темы (о какой проблеме)" required>
      <textarea name="text" rows="3" maxlength="2000" placeholder="Первое сообщение (можно пустым)"></textarea>
      <div class="sfbtns"><button class="btn primary">Создать тему</button><button type="button" class="btn" data-sfcancel>Отмена</button></div></form>`
    : '<button class="pbar" data-sfnewtopic>➕ Новая тема</button>';
  const who = d.members.map((m) => `${m.admin ? '👑 ' : ''}${esc(m.login)}${m.online ? ' 🟢' : ''}`).join(', ');
  return `${ribbon('МАСТЕРА')}<p class="small sfwho">Участники: ${who}</p>${nt}
    <div class="sftopics"><div class="sftrow"><button class="sftopic sflink ${d.link.n ? 'new' : ''}" data-sflink>
      <span class="sft1"><b>📮 СВЯЗЬ</b></span><span class="sft2"><span class="sfprev">Переписки игроков${d.link.n ? ` · ждут ответа: ${d.link.n}` : d.link.all ? ' · всем ответили' : ''}</span>${d.link.n ? `<b class="sfbadge">${d.link.n}</b>` : ''}</span></button></div>
      ${d.topics.map((t) => `<div class="sftrow"><button class="sftopic ${t.unread ? 'new' : ''}" data-sftopic="${t.id}">
      <span class="sft1"><b>${t.pin ? '📌 ' : ''}${t.closed ? '🔒 ' : ''}${esc(t.title)}</b><small>${sfTime(t.lastAt)}</small></span>
      <span class="sft2"><span class="sfprev">${t.last ? `<i>${esc(t.last.by)}:</i> ${esc(t.last.text).slice(0, 90)}` : '<i>Пока пусто</i>'}</span>${t.unread ? `<b class="sfbadge">${t.unread}</b>` : ''}</span></button>
      ${t.canDel ? `<button class="sftdel" data-sftdel="${t.id}" data-title="${esc(t.title)}" aria-label="Удалить тему">🗑</button>` : ''}</div>`).join('')
      || '<p class="parch-note">Тем пока нет. Создайте первую — например, «Ошибки на карте мира».</p>'}</div>`;
}
function sfMsgHtml(m) {
  const pic = m.pic ? `<button class="sfpic" data-sfpic="${m.pic}"><img src="${sfPicUrl(m.pic)}" alt="фото" loading="lazy"></button><div class="sfpicbar"><small class="sfexp">Фото удалится через ${sfLeft(m.picExp)}</small>${sfDl(m.pic)}</div>`
    : m.picGone ? '<div class="sfgone">📷 Фото удалено — прошло 24 часа</div>' : '';
  let poll = '';
  if (m.poll) {
    const p = m.poll, max = Math.max(1, p.total);
    poll = `<div class="sfpoll"><div class="sfq">📊 ${esc(p.q)}</div><small>${p.multi ? 'Можно выбрать несколько' : 'Один вариант'}${p.closed ? ' · голосование завершено' : ''}</small>
      ${p.opts.map((o, i) => `<button class="sfopt ${o.mine ? 'mine' : ''}" data-sfvote="${m.id}" data-opt="${i}" ${p.closed ? 'disabled' : ''}>
        <span class="sfbar" style="width:${Math.round(o.n / max * 100)}%"></span><span class="sfot">${o.mine ? '✔ ' : ''}${esc(o.text)}</span><b>${o.n}</b></button>
        ${o.who.length ? `<small class="sfwho2">${o.who.map(esc).join(', ')}</small>` : ''}`).join('')}
      <small>Проголосовало: ${p.total}</small>${p.canClose && !p.closed ? `<button class="btn small" data-sfpollclose="${m.id}">Завершить голосование</button>` : ''}</div>`;
  }
  return `<div class="sfmsg ${m.mine ? 'mine' : ''}"><div class="sfhead"><b>${m.admin ? '👑 ' : ''}${esc(m.by)}</b><small>${sfTime(m.at)}</small>
    <button class="sfrep" data-sfreply="${m.id}" aria-label="Ответить">↩</button>${m.canDel ? `<button class="sfdel" data-sfdel="${m.id}" aria-label="Удалить">✕</button>` : ''}</div>
    ${m.reply ? `<div class="fquote"><b>${esc(m.reply.by)}:</b> ${esc(m.reply.text)}</div>` : ''}${m.text ? `<div class="sftext">${smiles(esc(m.text))}</div>` : ''}${pic}${poll}</div>`;
}
function sfTopicHtml(d) {
  const t = d.topic, f = S.sf;
  const tools = `<div class="sftools"><button class="btn small" data-sfback>← Темы</button>${t.admin ? `<button class="btn small" data-sfop="pin">${t.pin ? 'Открепить' : '📌 Закрепить'}</button>` : ''}
    ${t.canMod ? `<button class="btn small" data-sfop="close">${t.closed ? 'Открыть' : '🔒 Закрыть'}</button><button class="btn small danger" data-sfop="topicdel">🗑 Тема</button>` : ''}</div>`;
  const pollForm = f.poll ? `<form class="stack sfpollform" data-sfform="poll"><input name="q" maxlength="200" placeholder="Вопрос" required value="${esc(f.poll.q || '')}">
      ${f.poll.opts.map((o, i) => `<input name="o${i}" maxlength="80" placeholder="Вариант ${i + 1}" value="${esc(o)}">`).join('')}
      ${f.poll.opts.length < 10 ? '<button type="button" class="btn small" data-sfaddopt>+ вариант</button>' : ''}
      <label class="check"><input type="checkbox" name="multi" ${f.poll.multi ? 'checked' : ''}> можно выбрать несколько</label>
      <div class="sfbtns"><button class="btn primary">Создать опрос</button><button type="button" class="btn" data-sfcancel>Отмена</button></div></form>` : '';
  const box = t.closed && !t.admin ? '<p class="parch-note">🔒 Тема закрыта — писать в неё нельзя.</p>'
    : `${pollForm}<form class="sfsend" data-sfform="post">${f.reply ? `<div class="fquote fto"><span>↩ Ответ <b>${esc(f.reply.by)}</b>: ${esc(f.reply.text).slice(0, 90)}</span><button type="button" class="fxto" data-sfreplyx aria-label="Не отвечать">✕</button></div>` : ''}
      <textarea name="text" rows="2" maxlength="2000" placeholder="${f.reply ? 'Ваш ответ…' : 'Сообщение…'}"></textarea>
      <div class="sfbtns"><button type="button" class="btn small" data-sfphoto ${f.picBusy ? 'disabled' : ''}>${f.picBusy ? esc(f.picBusy) : '📷 Фото'}</button>
      <button type="button" class="btn small" data-sfpollnew>📊 Опрос</button><button class="btn primary small">Отправить</button></div></form>`;
  return `${ribbon(t.title)}${tools}${d.more ? `<p class="small center">Показаны последние ${d.msgs.length} сообщений</p>` : ''}
    <div class="sfmsgs">${d.msgs.map(sfMsgHtml).join('') || '<p class="parch-note">Сообщений пока нет — напишите первым.</p>'}</div>${box}`;
}
// «СВЯЗЬ»: список переписок игроков (сверху ждущие ответа) и переписка с одним игроком (сообщения — lkMsgHtml из link.js)
function sfLinkHtml(list) {
  const f = S.sf, wait = list.filter((x) => x.wait), shown = f.linkAll ? list : wait;
  return `${ribbon('СВЯЗЬ')}<div class="sftools"><button class="btn small" data-sfback>← Темы</button>
    <button class="btn small ${f.linkAll ? '' : 'primary'}" data-sflinkall="0">Ждут ответа (${wait.length})</button><button class="btn small ${f.linkAll ? 'primary' : ''}" data-sflinkall="1">Все (${list.length})</button></div>
    <p class="small">Переписки игроков: жалобы, ошибки, вопросы. Игрок видит ответ как сообщение от «Мастер игры» — ваш ник он не увидит.</p>
    <div class="sftopics">${shown.map((x) => `<div class="sftrow"><button class="sftopic ${x.wait ? 'new' : ''}" data-sflinkth="${x.uid}">
      <span class="sft1"><b>${x.wait ? '⏳ ' : '✔ '}${esc(x.login)}${x.gone ? ' (удалён)' : ''}</b><small>${sfTime(x.at)}</small></span>
      <span class="sft2"><span class="sfprev">${x.last.master ? '<i>Мастер:</i> ' : ''}${esc(x.last.text).slice(0, 90)}</span>${x.wait ? '<b class="sfbadge">!</b>' : ''}</span></button></div>`).join('')
      || `<p class="parch-note">${f.linkAll ? 'Переписок пока нет.' : 'Все ответили — новых обращений нет.'}</p>`}</div>`;
}
function sfLinkThHtml(d) {
  return `${ribbon(`СВЯЗЬ: ${d.login}`)}<div class="sftools"><button class="btn small" data-sflink>← Список</button>
    <button class="btn small ${d.wait ? '' : 'primary'}" data-sflinksolve="${d.uid}">${d.wait ? '✔ Решено' : '⏳ Снова ждёт ответа'}</button>
    ${d.gone ? '' : `<button class="btn small" data-profile="${d.uid}">Профиль</button>`}</div>
    ${d.more ? `<p class="small center">Показаны последние ${d.msgs.length} сообщений</p>` : ''}
    <div class="sfmsgs">${d.msgs.map((m) => lkMsgHtml(m, d.login)).join('')}</div>
    ${d.gone ? '<p class="parch-note">Игрока уже нет в игре.</p>' : `<form class="sfsend" data-sfform="linkans" data-uid="${d.uid}"><textarea name="text" rows="3" maxlength="2000" placeholder="Ответ игроку (придёт от «Мастер игры»)"></textarea>
      <div class="sfbtns"><button class="btn primary small">Отправить ответ</button></div></form>`}`;
}
const sfScroll = () => setTimeout(() => { const b = $('#sheetBody'), l = $('.sfmsgs'); if (b && l) b.scrollTop = l.offsetTop + l.offsetHeight - b.clientHeight + 140; }, 30);
function staffMsg(m) {
  if (m.t === 'staffnew') { if (S.st && S.st.user) S.st.user.staffNew = m.n; if (S.menu) renderMenu(); return; } // число на плитке в открытом меню
  if (m.t === 'staffpicok') return sfPicMsg(m);
  if (!sfOpen()) { if (m.live) send({ t: 'staff', op: 'leave' }); return; } // окно закрыто — сервер больше не шлёт обновлений
  const wasTopic = S.sf.topic && S.sf.topic.topic.id;
  const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (m.view === 'link') { S.sf.link = m.data; S.sf.linkTh = null; S.sf.topic = null; if (!(typing && m.live)) refreshSheet(); return; }
  if (m.view === 'linkth') { // открыта переписка: пишет ответ — обновить только сообщения
    const same = S.sf.linkTh && S.sf.linkTh.uid === m.data.uid; S.sf.linkTh = m.data; S.sf.topic = null;
    if (typing && m.live && same && $('.sfmsgs')) { $('.sfmsgs').innerHTML = m.data.msgs.map((x) => lkMsgHtml(x, m.data.login)).join(''); return; }
    refreshSheet(); return sfScroll();
  }
  if (m.view === 'list') { S.sf.list = m.data; S.sf.topic = null; S.sf.link = null; S.sf.linkTh = null; }
  else { S.sf.topic = m.data; S.sf.link = null; S.sf.linkTh = null; }
  if (typing && m.live && m.view === 'topic' && $('.sfmsgs')) { $('.sfmsgs').innerHTML = m.data.msgs.map(sfMsgHtml).join(''); return; } // пишет сообщение — обновить только переписку
  refreshSheet();
  if (m.view === 'topic' && (!m.live || wasTopic !== m.data.topic.id || !typing)) sfScroll();
}
// фото: браузер уменьшает картинку и шлёт сжатые цвета точек (как в личных сообщениях — dialogs.js picPack)
async function sfPicSend(file, text) {
  if (!S.sf.topic) return;
  if (typeof CompressionStream === 'undefined' || typeof createImageBitmap === 'undefined') return toast('Браузер не умеет отправлять фото — обновите его.', 'err');
  S.sf.picBusy = 'Готовлю фото…'; refreshSheet();
  try {
    let p = null; for (const side of [1280, 1024, 800, 640]) { p = await picPack(file, side); if (p.z.length <= 24 * 150 * 1024) break; }
    if (p.z.length > 24 * 150 * 1024) throw new Error('big');
    const parts = []; for (let i = 0; i < p.z.length; i += 150 * 1024) parts.push(b64(p.z.subarray(i, i + 150 * 1024)));
    S.sfQ = { parts }; S.sf.picBusy = 'Отправка… 0%'; refreshSheet();
    send({ t: 'staffpic', op: 'begin', topic: S.sf.topic.topic.id, w: p.w, h: p.h, n: parts.length, text });
  } catch (e) { S.sf.picBusy = null; refreshSheet(); toast('Не удалось прочитать картинку — выберите другую.', 'err'); }
}
function sfPicMsg(m) {
  const q = S.sfQ;
  if (m.done || !q) { S.sfQ = null; S.sf.picBusy = null; return refreshSheet(); }
  if (m.i < q.parts.length) { send({ t: 'staffpic', op: 'part', i: m.i, data: q.parts[m.i] }); S.sf.picBusy = `Отправка… ${Math.round(m.i / q.parts.length * 100)}%`; refreshSheet(); }
}
let sfInput = null;
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-sftopic],[data-sfnewtopic],[data-sfcancel],[data-sfback],[data-sfop],[data-sfvote],[data-sfpollclose],[data-sfdel],[data-sfphoto],[data-sfpollnew],[data-sfaddopt],[data-sfpic],[data-sfreply],[data-sfreplyx],[data-sftdel],[data-sflink],[data-sflinkall],[data-sflinkth],[data-sflinksolve]');
  if (!t || !sfOpen()) return;
  const d = t.dataset, f = S.sf, tid = f.topic && f.topic.topic.id;
  if (d.sflink !== undefined) return send({ t: 'staff', op: 'link' });
  if (d.sflinkall) { f.linkAll = d.sflinkall === '1'; return refreshSheet(); }
  if (d.sflinkth) return send({ t: 'staff', op: 'linkopen', uid: Number(d.sflinkth) });
  if (d.sflinksolve) return send({ t: 'staff', op: 'linksolve', uid: Number(d.sflinksolve) });
  if (d.sftopic) { f.reply = null; return send({ t: 'staff', op: 'open', topic: Number(d.sftopic) }); }
  if (d.sftdel) { if (confirm(`Удалить тему «${d.title}» со всеми сообщениями?`)) send({ t: 'staff', op: 'topicdel', topic: Number(d.sftdel) }); return; }
  if (d.sfreply) { // ответ на сообщение: цитата над полем ввода
    const m = (f.topic && f.topic.msgs || []).find((x) => x.id === Number(d.sfreply)); if (!m) return;
    f.reply = { id: m.id, by: m.by, text: m.poll ? `📊 ${m.poll.q}` : m.text || '📷 Фото' }; refreshSheet();
    return setTimeout(() => { const ta = $('[data-sfform=post] textarea'); if (ta) ta.focus(); }, 30);
  }
  if (d.sfreplyx !== undefined) { f.reply = null; return refreshSheet(); }
  if (d.sfnewtopic !== undefined) { f.compose = 'topic'; return refreshSheet(); }
  if (d.sfcancel !== undefined) { f.compose = null; f.poll = null; return refreshSheet(); }
  if (d.sfback !== undefined) { f.link = null; f.linkTh = null; f.topic = null; f.poll = null; f.reply = null; return send({ t: 'staff', op: 'view' }); }
  if (d.sfop) { const ask = { topicdel: 'Удалить тему со всеми сообщениями?', close: f.topic.topic.closed ? '' : 'Закрыть тему? Писать в неё сможет только админ.' }[d.sfop]; if (ask && !confirm(ask)) return; return send({ t: 'staff', op: d.sfop, topic: tid }); }
  if (d.sfvote) return send({ t: 'staff', op: 'vote', msg: Number(d.sfvote), opt: Number(d.opt) });
  if (d.sfpollclose) { if (confirm('Завершить голосование? Голосовать больше будет нельзя.')) send({ t: 'staff', op: 'pollclose', msg: Number(d.sfpollclose) }); return; }
  if (d.sfdel) { if (confirm('Удалить сообщение?')) send({ t: 'staff', op: 'del', msg: Number(d.sfdel) }); return; }
  if (d.sfpollnew !== undefined) { f.poll = { q: '', opts: ['', ''], multi: false }; refreshSheet(); return setTimeout(() => { const q = $('[data-sfform=poll] input[name=q]'); if (q) q.focus(); }, 30); }
  if (d.sfaddopt !== undefined) { const fm = t.form; sfPollKeep(fm); f.poll.opts.push(''); return refreshSheet(); }
  if (d.sfpic) { const v = document.createElement('div'); v.className = 'nshotfull'; v.innerHTML = `<img src="${sfPicUrl(d.sfpic)}" alt=""><div class="sffullbar">${sfDl(d.sfpic)}</div>`; v.addEventListener('click', (ev) => { if (!ev.target.closest('.sfdl')) v.remove(); }); return document.body.appendChild(v); }
  if (d.sfphoto !== undefined && !f.picBusy) {
    if (!sfInput) { sfInput = document.createElement('input'); sfInput.type = 'file'; sfInput.accept = 'image/*'; sfInput.style.display = 'none'; document.body.appendChild(sfInput);
      sfInput.addEventListener('change', () => { const file = sfInput.files && sfInput.files[0]; sfInput.value = ''; const ta = $('[data-sfform=post] textarea'); const text = ta ? ta.value.trim() : ''; if (ta) ta.value = ''; if (file) sfPicSend(file, text); }); }
    sfInput.click();
  }
});
const sfPollKeep = (fm) => { if (!fm || !S.sf.poll) return; S.sf.poll.q = fm.q.value; S.sf.poll.opts = S.sf.poll.opts.map((_, i) => fm[`o${i}`].value); S.sf.poll.multi = fm.multi.checked; };
$('#sheetBody').addEventListener('submit', (e) => {
  const fm = e.target, k = fm.dataset.sfform; if (!k) return; e.preventDefault();
  const f = S.sf, tid = f.topic && f.topic.topic.id;
  if (k === 'linkans') { const text = fm.text.value.trim(); if (!text) return; fm.text.value = ''; fm.text.blur(); return send({ t: 'staff', op: 'linkans', uid: Number(fm.dataset.uid), text }); }
  if (k === 'topic') { f.compose = null; return send({ t: 'staff', op: 'newtopic', title: fm.title.value, text: fm.text.value }); }
  if (k === 'post') { const text = fm.text.value.trim(); if (!text) return; fm.text.value = ''; fm.text.blur(); const reply = f.reply ? f.reply.id : undefined; f.reply = null; return send({ t: 'staff', op: 'post', topic: tid, text, reply }); }
  if (k === 'poll') { sfPollKeep(fm); const p = f.poll; f.poll = null; return send({ t: 'staff', op: 'poll', topic: tid, q: p.q, opts: p.opts, multi: p.multi }); }
});
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-admlink]')) openStaff(true); }); // Админка → «Открыть „СВЯЗЬ“»
