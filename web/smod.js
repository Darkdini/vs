'use strict';
// «Модерация» — панель старшего модератора (Меню → «Модерация»). Сервер: server/src/smod.js (t:'smod').
// Вкладки: Игрок (поиск и действия), Команда (модераторы), Наказания (блокировки и чат), Мульты, Альянсы, Журнал.
// Администратора в панели нет: ни в списках, ни в мультах; сервер отклоняет любое действие над ним.

S.smod = null; S.smodP = null; S.smodTab = 'player';
function openSmod() { S.smod = null; S.smodP = null; send({ t: 'smod', op: 'view' }); openSheet(smodWin); }
const smDate = (t) => (t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const smBtn = (op, text, extra = '', cls = '') => `<button type="button" class="btn small ${cls}" data-smop="${op}" ${extra}>${text}</button>`;
function smodPlayerCard(p) {
  const ban = p.banned ? `<b class="smred">заблокирован${p.banUntil ? ` до ${smDate(p.banUntil)}` : ' навсегда'}</b>${p.banWhy ? ` — ${esc(p.banWhy)}` : ''}` : 'нет';
  const chat = p.chatBan === -1 ? 'навсегда' : p.chatBan > Date.now() ? `до ${smDate(p.chatBan)}` : 'нет';
  return `<div class="smcard"><div class="smhead"><span class="avasm">${p.avatar ? `<img src="avatar/${p.id}.png?v=${p.avatar}" alt="">` : raceAva(p.race)}</span>
      <div><b>${esc(p.login)}</b>${p.smod ? ' · старший модератор' : p.mod ? ' · модератор' : ''}<br><small>${p.online ? 'в игре' : `был ${smDate(p.lastSeen)}`} · с ${smDate(p.created)}</small></div></div>
    <dl class="kv smkv"><dt>Блокировка</dt><dd>${ban}</dd><dt>Чат</dt><dd>${chat}</dd><dt>Нарушения</dt><dd>${p.violations}</dd>
      <dt>Альянс</dt><dd>${p.alliance ? `[${esc(p.alliance.tag)}] ${esc(p.alliance.name)}` : '—'}</dd>
      <dt>Замки</dt><dd>${p.castles.map((c) => `${esc(c.name)} (${c.x}:${c.y})`).join(', ') || '—'}</dd>
      <dt>Ники</dt><dd>${p.nickLog.length ? p.nickLog.map((n) => `${esc(n.from)} → ${esc(n.to)}`).join(', ') : '—'}</dd>
      <dt>IP</dt><dd>${p.ips.map((x) => esc(x.ip)).join(', ') || '—'}</dd></dl>
    ${p.login === S.st.user.login ? '' : `<div class="smsec">Блокировка аккаунта</div>
    <div class="smrow"><input data-smwhy placeholder="Причина (обязательно)" maxlength="120"></div>
    <div class="smrow">${S.smod.banDays.map((d) => smBtn('ban', `${d} дн.`, `data-days="${d}"`, 'cbno')).join('')}${p.banned ? smBtn('unban', 'Разблокировать') : ''}</div>
    <div class="smsec">Запрет в чате</div>
    <div class="smrow">${[1, 6, 24, 72].map((h) => smBtn('chat', `${h} ч`, `data-hours="${h}"`)).join('')}${p.chatBan ? smBtn('chat', 'Снять', 'data-hours="0"') : ''}</div>
    <div class="smsec">Нарушения и сброс</div>
    <div class="smrow">${smBtn('viol', '+1 нарушение', 'data-d="1"')}${smBtn('viol', '−1', 'data-d="-1"')}</div>
    <div class="smrow">${smBtn('nick', 'Сбросить ник', 'data-confirm="Сбросить ник игрока на «ИгрокN»?"')}${smBtn('castles', 'Названия замков', 'data-confirm="Сбросить названия и описания замков?"')}${p.avatar ? smBtn('avatar', 'Удалить аватар', 'data-confirm="Удалить аватар игрока?"') : ''}</div>
    ${p.smod ? '' : `<div class="smsec">Команда</div><div class="smrow">${smBtn('mod', p.mod ? 'Снять с модераторов' : 'Назначить модератором', `data-on="${p.mod ? 0 : 1}" data-confirm="${p.mod ? 'Снять права модератора?' : 'Назначить модератором?'}"`)}</div>`}`}</div>`;
}
function smodWin() {
  const d = S.smod, T = [['player', 'Игрок'], ['team', 'Команда'], ['bans', 'Наказания'], ['multi', 'Мульты'], ['ally', 'Альянсы'], ['log', 'Журнал']];
  const tabs = `<div class="coin-tabs smtabs">${T.map(([k, t]) => `<button class="${S.smodTab === k ? 'on' : ''}" data-smtab="${k}">${t}</button>`).join('')}</div>`;
  if (!d) return `${ribbon('Модерация')}${tabs}<p class="parch-note">Загрузка…</p>`;
  let body = '';
  if (S.smodTab === 'player') {
    body = `<form class="chatform" data-smfind><input name="who" placeholder="Ник игрока" autocapitalize="none" autocomplete="off" value="${esc(S.smodLogin || '')}"><button class="btn primary small">Найти</button></form>
      ${S.smodP ? smodPlayerCard(S.smodP) : '<p class="coinhint">Найдите игрока по нику — сведения, наказания и сброс ника, замков, аватара. Администратора здесь нет и не будет.</p>'}`;
  } else if (S.smodTab === 'team') {
    const row = (u, k) => `<div class="smline"><span><img class="acico" src="${GFX}${k}_badge_s.png" alt=""> <a class="plink" data-smpick="${esc(u.login)}">${esc(u.login)}</a>${u.online ? ' · <i class="smon">в игре</i>' : ''}</span>${k === 'mod' ? smBtn('mod', 'Снять', `data-login="${esc(u.login)}" data-on="0" data-confirm="Снять ${esc(u.login)} с модераторов?"`) : ''}</div>`;
    body = `<div class="smsec">Старшие модераторы</div>${d.smods.map((u) => row(u, 'smod')).join('') || '<p class="parch-note">—</p>'}
      <div class="smsec">Модераторы</div>${d.mods.map((u) => row(u, 'mod')).join('') || '<p class="parch-note">Модераторов нет.</p>'}
      <form class="chatform" data-smaddmod><input name="who" placeholder="Ник — назначить модератором" autocapitalize="none" autocomplete="off"><button class="btn primary small">Назначить</button></form>
      <p class="coinhint">Старших модераторов назначает только администратор.</p>`;
  } else if (S.smodTab === 'bans') {
    body = `<div class="smsec">Заблокированы</div>${d.banned.map((u) => `<div class="smline"><span><a class="plink" data-smpick="${esc(u.login)}">${esc(u.login)}</a><br><small>${u.until ? `до ${smDate(u.until)}` : 'навсегда (админ)'}${u.why ? ` — ${esc(u.why)}` : ''}</small></span>${u.until ? smBtn('unban', 'Снять', `data-login="${esc(u.login)}"`) : ''}</div>`).join('') || '<p class="parch-note">Никого.</p>'}
      <div class="smsec">Запрет в чате</div>${d.chatBanned.map((u) => `<div class="smline"><span><a class="plink" data-smpick="${esc(u.login)}">${esc(u.login)}</a><br><small>${u.until === -1 ? 'навсегда' : `до ${smDate(u.until)}`}</small></span>${smBtn('chat', 'Снять', `data-login="${esc(u.login)}" data-hours="0"`)}</div>`).join('') || '<p class="parch-note">Никого.</p>'}`;
  } else if (S.smodTab === 'multi') {
    body = `<p class="coinhint">Игроки с одного устройства или IP. Только просмотр — нажмите на ник, чтобы открыть карточку.</p>
      ${d.multis.map((g) => `<div class="smgrp"><small>${g.kind === 'dev' ? '📱 устройство' : '🌐 IP'} ${esc(g.key)}</small><div>${g.users.map((u) => `<a class="plink ${u.banned ? 'smred' : ''}" data-smpick="${esc(u.login)}">${esc(u.login)}</a>`).join(', ')}</div></div>`).join('') || '<p class="parch-note">Совпадений нет.</p>'}`;
  } else if (S.smodTab === 'ally') {
    body = `<p class="coinhint">Альянс с оскорбительным названием — переименовать; описание и устав — сбросить. Укажите тег или номер альянса.</p>
      <form class="smform" data-smally><input name="id" placeholder="Тег альянса (сейчас)" autocapitalize="characters"><input name="tag" placeholder="Новый тег (2–5)" maxlength="5"><input name="name" placeholder="Новое название" maxlength="24">
        <div class="smrow"><button class="btn primary small" name="go" value="name">Переименовать</button><button class="btn small cbno" name="go" value="desc">Сбросить описание</button></div></form>`;
  } else {
    const OP = { mod: 'Модератор', ban: 'Блокировка', unban: 'Разблокировка', chat: 'Чат', viol: 'Нарушения', nick: 'Ник', castles: 'Замки', avatar: 'Аватар', allyname: 'Альянс', allydesc: 'Альянс' };
    body = d.log.map((x) => `<div class="smlog"><small>${smDate(x.at)} · <b>${esc(x.by)}</b></small><div>${OP[x.op] || esc(x.op)}: <b>${esc(x.target)}</b> — ${esc(x.text)}</div></div>`).join('') || '<p class="parch-note">Журнал пуст.</p>';
  }
  const n = S.smodNote && Date.now() - S.smodNote.at < 6000 ? `<div class="smnote ${S.smodNote.ok ? 'ok' : ''}">${S.smodNote.ok ? '✔' : '⛔'} ${esc(S.smodNote.msg)}</div>` : '';
  return `${ribbon('Модерация')}${tabs}${n}${body}`;
}
function smodMsg(m) {
  if (m.view === 'deny' || m.view === 'ok') { S.smodNote = { msg: m.msg, ok: m.view === 'ok', at: Date.now() }; return refreshSheet(); }
  if (m.view === 'main') S.smod = m.data; else { S.smodP = m.data; S.smodTab = 'player'; S.smodLogin = m.data.login; } refreshSheet(); }
const smFind = (login) => { S.smodLogin = login; S.smodP = null; refreshSheet(); send({ t: 'smod', op: 'player', login }); };
$('#sheetBody').addEventListener('click', (e) => {
  const tb = e.target.closest('[data-smtab]'); if (tb) { S.smodTab = tb.dataset.smtab; return refreshSheet(); }
  const pk = e.target.closest('[data-smpick]'); if (pk) return smFind(pk.dataset.smpick);
  const b = e.target.closest('[data-smop]'); if (!b) return;
  const d = b.dataset, login = d.login || (S.smodP && S.smodP.login); if (!login) return;
  if (d.confirm && !confirm(d.confirm)) return;
  const m = { t: 'smod', op: d.smop, login };
  if (d.smop === 'ban') { const why = ($('[data-smwhy]') || {}).value || ''; if (why.trim().length < 3) return toast('Укажите причину блокировки.', 'err'); if (!confirm(`Заблокировать ${login} на ${d.days} дн.?`)) return; m.days = Number(d.days); m.why = why; }
  if (d.hours !== undefined) m.hours = Number(d.hours);
  if (d.d !== undefined) m.d = Number(d.d);
  if (d.on !== undefined) m.on = Number(d.on);
  send(m);
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target;
  if (f.matches('[data-smfind]')) { e.preventDefault(); e.stopPropagation(); const w = f.who.value.trim(); if (w) smFind(w); return; }
  if (f.matches('[data-smaddmod]')) { e.preventDefault(); e.stopPropagation(); const w = f.who.value.trim(); if (w && confirm(`Назначить ${w} модератором?`)) send({ t: 'smod', op: 'mod', login: w, on: 1 }); return; }
  if (f.matches('[data-smally]')) {
    e.preventDefault(); e.stopPropagation(); const go = e.submitter && e.submitter.value, id = f.id.value.trim(); if (!id) return toast('Укажите тег альянса.', 'err');
    if (go === 'desc') { if (confirm(`Сбросить описание и устав [${id}]?`)) send({ t: 'smod', op: 'allydesc', id }); return; }
    if (confirm(`Переименовать [${id}] в [${f.tag.value.trim()}] ${f.name.value.trim()}?`)) send({ t: 'smod', op: 'allyname', id, tag: f.tag.value, name: f.name.value });
  }
}, true);
