'use strict';
// «Кабинет → Профиль» — настройки своего аккаунта, как в оригинале: аватар (Изменить/Удалить), ник, раса, звание, рейтинг,
// репутация, альянс; тип аккаунта, премиум, нарушения; безопасность (уникальный номер, смена пароля); замок (название, описание);
// управление (личная информация, мой публичный профиль). Сервер: profile(acct), avatar, passwd, castleinfo.
function openAccount() { S.acctView = true; S.tgNote = null; S.mailNote = null; S.mailEdit = ''; send({ t: 'profile', id: S.st.user.id, acct: 1 }); }
// Почта: привязка кодом из письма — чтобы восстановить пароль, если забудете (server/src/mail.js).
// S.mailEdit: '' — кнопки, 'link'/'change' — адрес и пароль от аккаунта, 'unlink' — пароль для отвязки
function mailBlock(ml) {
  if (!ml || !ml.on || S.st.user.admin) return '';
  const ed = S.mailEdit || '', note = S.mailNote ? `<div class="smnote ${S.mailNote.ok ? 'ok' : ''}">${S.mailNote.ok ? '✔' : '⛔'} ${esc(S.mailNote.msg)}</div>` : '';
  const head = `<div class="actg"><span class="actgi">✉</span><div>${ml.email ? `Почта привязана: <b>${esc(ml.email)}</b><br><small>Забудете пароль — пришлём код на почту.</small>`
    : 'Почта не привязана.<br><small>Привяжите — и если забудете пароль, код для смены придёт на почту.</small>'}</div></div>`;
  const pass = '<label>Пароль от аккаунта:<input name="password" type="password" autocomplete="current-password" required></label>';
  const back = '<button class="pbar acbar" data-ml="close">Отмена</button>';
  const body = ml.pending ? `${S.mailNote ? '' : `<div class="smnote ok">✔ Код отправлен на ${esc(ml.pending)}</div>`}<form class="acform" data-mlcode><label>Код из письма:<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>
      <button class="pbar">Подтвердить</button></form><button class="pbar acbar" data-ml="cancel">Отмена</button>`
    : ed === 'link' || ed === 'change' ? `<form class="acform" data-mllink><label>${ml.email ? 'Новая почта' : 'Ваша почта'}:<input name="addr" type="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="100" placeholder="name@mail.ru" value="${esc(ml.email ? '' : ml.suggest || '')}" required></label>
      ${pass}<button class="pbar">Получить код</button></form>${back}`
    : ed === 'unlink' ? `<form class="acform" data-mlun>${pass}<button class="pbar">Отвязать почту</button></form>${back}`
    : ml.email ? '<button class="pbar acbar" data-ml="change">Сменить почту</button><button class="pbar acbar" data-ml="unlink">Отвязать почту</button>'
    : '<button class="pbar acbar gold" data-ml="link">✉ Привязать почту</button>';
  return `${head}${note}${body}`;
}
// Telegram: привязка для восстановления пароля (server/src/tgauth.js)
function tgBlock(t) {
  if (!t || !t.on || S.st.user.admin) return '';
  return `<div class="actg"><span class="actgi">📱</span><div>${t.linked ? `Telegram привязан: <b>${esc(t.name)}</b><br><small>Забудете пароль — бот пришлёт код для смены.</small>`
    : 'Telegram не привязан.<br><small>Привяжите — и если забудете пароль, бот пришлёт код для смены.</small>'}</div></div>
    ${S.tgNote ? `<div class="smnote ${S.tgNote.ok ? 'ok' : ''}">${S.tgNote.ok ? '✔' : '⛔'} ${esc(S.tgNote.msg)}</div>` : ''}
    ${!t.linked ? '<button class="pbar acbar gold" data-tg="link">📱 Привязать Telegram</button>'
    : t.unlinking ? `<form class="acform" data-tgun><label>Код из Telegram для отвязки:<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>
      <button class="pbar">Подтвердить отвязку</button></form><button class="pbar acbar" data-tg="unlink">Прислать код ещё раз</button>`
    : '<button class="pbar acbar" data-tg="unlink">Отвязать Telegram</button>'}
    ${t.linked ? `<div class="tgnot"><div class="tgnh">🔔 Уведомления в Telegram</div>${(t.notify || []).map((x) => `<label class="tgn"><input type="checkbox" data-tgn="${x.k}" ${x.on ? 'checked' : ''}><span>${esc(x.t)}${x.d ? `<small>${esc(x.d)}</small>` : ''}</span></label>`).join('')}
      <small class="tgnf">Пока вы в игре, бот молчит (кроме нападений). Не больше 20 сообщений в час.</small></div>` : ''}`;
}
function accountWin(p) {
  const a = p.acct || {}, bar = (attr, icon, text) => `<button class="pbar acbar" ${attr}>${icon ? `<img src="${icon}" alt="">` : ''} ${text}</button>`;
  const title = (p.titles || []).length || (p.honors || []).length ? [...(p.titles || []).map((t) => `${t === 'Администратор' ? `<img class="acico" src="${GFX}admin_badge_s.png" alt="">` : t === 'Старший модератор' ? `<img class="acico" src="${GFX}smod_badge_s.png" alt="">` : t === 'Модератор форума' ? `<img class="acico" src="${GFX}mod_badge_s.png" alt="">` : t === 'Авторитет' ? `<img class="acico thumb" src="${GFX}zags/thumb.png" alt="">` : `<img class="acico" src="${GFX}premium_crown.png" alt="">`} ${esc(t)}`),
    ...(p.honors || []).map((h) => `<span class="honi"><img class="acico honor" src="${GFX}${h.small}" alt=""> ${esc(h.name)}</span>`)].join(', ') : '—'; // медали «для красоты» (honors.js) — рядом со званиями
  return `${ribbon('Профиль')}
    <div class="acctop"><div class="acleft"><div class="avatar">${avatarImg(p)}</div>
      <button class="pbtn acbtn" data-avatar="set">Изменить</button>${p.avatar ? '<button class="pbtn acbtn" data-avatar="del">Удалить</button>' : ''}</div>
      <div class="acinfo">Мой ник: <b>${esc(p.login)}</b><br>Раса: ${raceIcon(p.race)} ${esc(p.raceName)}<br>Звание: ${title}<br>Рейтинг: ${fmtFull(p.rating)}<br>
        Репутация (${fmtFull(p.reputation)}): ${repIcons(p.reputation)}<br>Альянс: ${p.alliance ? `<b>${esc(p.alliance.name)} [${esc(p.alliance.tag)}]</b>` : '—'}</div></div>
    <div class="acctype">Тип аккаунта: ${a.premium ? 'Премиум «Завоеватель»' : 'Базовый'}</div>
    ${bar('data-acct="premium"', `${GFX}premium_crown.png`, 'Премиум пакеты')}
    ${bar('data-acct="viol"', '', `⚠ Нарушения (${a.violations || 0})`)}
    ${ribbon('Безопасность')}
    <div class="acuid">Ваш уникальный номер в игре:<br><b>${a.uid}</b>${a.acctLogin ? `<br>Логин для входа: <b>${esc(a.acctLogin)}</b>` : ''}</div>
    ${bar('data-acct="pass"', '', '🔑 Изменить пароль')}
    ${tgBlock(a.tg)}
    ${mailBlock(a.mail)}
    ${p.self !== false && !(S.st.user.admin) ? `<form class="acform" data-form="nickcase"><label>Новый ник (3–10 английских букв и цифр):<input name="nick" maxlength="10" value="${esc(p.login)}" autocapitalize="none" required></label><button class="pbar">Сменить ник за ${coinsZa(S.st.nickPrice || 100)}</button></form>` : ''}
    ${ribbon('Цвет сообщений')}<div class="mcolhead"><img src="${GFX}chat/color.png" alt=""><span>Цвет текста в чате, письмах и на форуме (премиум)</span></div><div class="mcolors">${(S.st.msgColors || ['']).map((c, i) => `<button type="button" class="mcol ${i === (S.st.msgColor || 0) ? 'on' : ''}" data-mcol="${i}" style="background:${c || '#3a2410'}" aria-label="цвет ${i}">${i ? '' : 'Аа'}</button>`).join('')}</div>
    <div class="bwline small center">${a.premium ? 'Этим цветом будут видны ваши сообщения в диалогах и на форуме.' : '🔒 Выбор цвета — с премиумом.'}</div>
    ${ribbon('Замок')}
    <form class="acform" data-form="castleinfo"><label>Название:<input name="name" maxlength="24" value="${esc(a.castleName || '')}" required></label>
      <label>Описание:<input name="desc" maxlength="200" value="${esc(a.castleDesc || '')}"></label><button class="pbar">Изменить</button></form>
    ${ribbon('Управление')}
    ${bar('data-acct="sound"', 'gfx3d/sound/notify.svg', 'Настройка звуков')}
    ${bar('data-acct="info"', 'gfx3d/prof/info.png', 'Личная информация')}
    ${bar('data-acct="public"', 'gfx3d/prof/king.png', 'Мой профиль (как видят другие)')}`;
}
function passWin() {
  return `${ribbon('Изменить пароль')}<form class="stack" data-form="passwd">
    <input name="old" type="password" placeholder="Старый пароль" autocomplete="current-password" required>
    <input name="new" type="password" placeholder="Новый пароль (от 5 символов)" autocomplete="new-password" required>
    <input name="new2" type="password" placeholder="Повторите новый пароль" autocomplete="new-password" required>
    <button class="btn primary">Изменить пароль</button></form>
    <p class="small muted">После смены пароля на других устройствах нужно будет войти заново.</p>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const mc = e.target.closest('[data-mcol]'); if (mc) return send({ t: 'msgcolor', i: Number(mc.dataset.mcol) });
  const t = e.target.closest('[data-acct]'); if (!t) return;
  const k = t.dataset.acct, p = S.lastAcct;
  if (k === 'premium') return openPremium();
  if (k === 'sound') return openSound();
  if (k === 'viol') return toast(`Нарушений: ${(p.acct || {}).violations || 0}. Нарушения — баны в чате от модераторов.`);
  if (k === 'pass') return openSheet(passWin);
  if (k === 'info') return openSheet(() => profileInfoWin(p));
  if (k === 'public') { S.acctView = false; return send({ t: 'profile', id: S.st.user.id }); }
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.form; if (k !== 'passwd' && k !== 'castleinfo' && k !== 'nickcase') return;
  e.preventDefault(); e.stopPropagation();
  if (k === 'nickcase') { const n = f.nick.value.trim(); if (!confirm(`Сменить ник на «${n}» за ${coinsZa(S.st.nickPrice || 100)}?`)) return; return send({ t: 'nickcase', nick: n }); }
  if (k === 'castleinfo') return send({ t: 'castleinfo', name: f.name.value, desc: f.desc.value });
  if (f.new.value !== f.new2.value) return toast('Новые пароли не совпадают.', 'err');
  send({ t: 'passwd', old: f.old.value, new: f.new.value }); f.reset(); closeSheet();
}, true);
// привязка Telegram: сервер выдаёт одноразовую ссылку t.me/<бот>?start=<код>, игрок жмёт «Старт» в боте
$('#sheetBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-payopen]')) return openSheet(payWin); // Казна → «Пополнить»
  const bg = e.target.closest('[data-buygold]'); // пакет монет за звёзды: счёт открывается в Telegram
  if (bg) { S.tgWin = window.open('about:blank', '_blank'); return send({ t: 'tg', op: 'buy', pack: Number(bg.dataset.buygold) }); }
  const ba = e.target.closest('[data-buyally]'); // пакет монет в казну альянса (Казна Альянса): монеты — в казну, не игроку
  if (ba) { S.tgWin = window.open('about:blank', '_blank'); return send({ t: 'tg', op: 'buy', pack: Number(ba.dataset.buyally), ally: 1 }); }
  const b = e.target.closest('[data-tg]'); if (!b) return;
  if (b.dataset.tg === 'unlink') return send({ t: 'tg', op: 'unlink' }); // бот пришлёт код — отвязка только с ним
  S.tgWin = window.open('about:blank', '_blank'); send({ t: 'tg', op: 'link' }); // окно открывается сразу (иначе телефон заблокирует всплывающее)
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-tgun]'); if (!f) return; e.preventDefault(); e.stopImmediatePropagation();
  send({ t: 'tg', op: 'unlinkok', code: f.code.value.trim() });
});
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ml]'); if (!b) return;
  S.mailNote = null;
  if (b.dataset.ml === 'cancel') return send({ t: 'email', op: 'cancel' });
  S.mailEdit = b.dataset.ml === 'close' ? '' : b.dataset.ml; refreshSheet();
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-mllink],[data-mlcode],[data-mlun]'); if (!f) return; e.preventDefault(); e.stopImmediatePropagation();
  if (f.dataset.mllink !== undefined) { f.querySelector('button').disabled = true; return send({ t: 'email', op: 'link', addr: f.addr.value.trim(), password: f.password.value }); }
  if (f.dataset.mlcode !== undefined) return send({ t: 'email', op: 'confirm', code: f.code.value.trim() });
  send({ t: 'email', op: 'unlink', password: f.password.value });
});
// ответ сервера по почте: удалось — назад к кнопкам (после «Получить код» — поле для кода), не удалось — форма остаётся
function mailMsg(m) {
  S.mailNote = m.note || null; if (m.done) S.mailEdit = '';
  if (S.acctView) send({ t: 'profile', id: S.st.user.id, acct: 1 });
}
function tgMsg(m) {
  if (m.note) S.tgNote = m.note;
  if (m.buyErr) { if (S.tgWin && !S.tgWin.closed) S.tgWin.close(); S.tgWin = null; toast(m.buyErr); return; }
  if (m.url) { if (S.tgWin && !S.tgWin.closed) S.tgWin.location.href = m.url; else location.href = m.url; S.tgWin = null; toast(m.buy ? 'Оплатите счёт в Telegram — монеты придут сразу после оплаты.' : 'Нажмите «Старт» в боте — и вернитесь в игру.'); return; }
  if (S.acctView) send({ t: 'profile', id: S.st.user.id, acct: 1 }); // обновить блок в Профиле
}
$('#sheetBody').addEventListener('change', (e) => { const c = e.target.closest('[data-tgn]'); if (c) send({ t: 'tg', op: 'notify', kind: c.dataset.tgn, on: c.checked }); });
