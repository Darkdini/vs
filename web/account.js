'use strict';
// «Кабинет → Профиль» — настройки своего аккаунта, как в оригинале: аватар (Изменить/Удалить), ник, раса, звание, рейтинг,
// репутация, альянс; тип аккаунта, премиум, нарушения; безопасность (уникальный номер, смена пароля); замок (название, описание);
// управление (личная информация, мой публичный профиль). Сервер: profile(acct), avatar, passwd, castleinfo.
function openAccount() { S.acctView = true; send({ t: 'profile', id: S.st.user.id, acct: 1 }); }
function accountWin(p) {
  const a = p.acct || {}, bar = (attr, icon, text) => `<button class="pbar acbar" ${attr}>${icon ? `<img src="${icon}" alt="">` : ''} ${text}</button>`;
  const title = (p.titles || []).length ? p.titles.map((t) => `${t === 'Администратор' ? `<img class="acico" src="${GFX}admin_badge_s.png" alt="">` : t === 'Модератор форума' ? `<img class="acico" src="${GFX}mod_badge_s.png" alt="">` : `<img class="acico" src="${GFX}premium_crown.png" alt="">`} ${esc(t)}`).join(', ') : '—';
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
    ${p.self !== false && !(S.st.user.admin) ? `<form class="acform" data-form="nickcase"><label>Новый ник (3–10 символов):<input name="nick" maxlength="10" value="${esc(p.login)}" autocapitalize="none" required></label><button class="pbar">Сменить ник за ${S.st.nickPrice || 100} золота</button></form>` : ''}
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
  if (k === 'nickcase') { const n = f.nick.value.trim(); if (!confirm(`Сменить ник на «${n}» за ${S.st.nickPrice || 100} золота?`)) return; return send({ t: 'nickcase', nick: n }); }
  if (k === 'castleinfo') return send({ t: 'castleinfo', name: f.name.value, desc: f.desc.value });
  if (f.new.value !== f.new2.value) return toast('Новые пароли не совпадают.', 'err');
  send({ t: 'passwd', old: f.old.value, new: f.new.value }); f.reset(); closeSheet();
}, true);
