'use strict';
// Админ-панель (только для admin): отдельное окно со всеми командами сервера (server/src/admin.js).
// Цель команд — игрок из поля «Игрок» (пусто — вы сами); галочка «все замки» — над всеми его замками.

S.adm = { login: '', all: true, players: null, player: null, bugs: null };
const aBtn = (op, text, icon, extra = '') => `<button class="ptile" data-adm="${op}" ${extra}><img src="${GFX}${icon}" alt=""><span>${text}</span></button>`;
const aNum = (name, value, ph) => `<input class="anum" type="number" inputmode="numeric" data-an="${name}" value="${value}" placeholder="${ph}">`;

const ADM_TABS = [['target', 'Цель'], ['build', 'Замки'], ['army', 'Армия'], ['players', 'Игроки'], ['multi', 'Мульты'], ['world', 'Мир']];
function adminHtml() {
  const a = S.adm, who = a.login ? `игрок <b>${esc(a.login)}</b>` : '<b>вы (Советник)</b>';
  const units = (S.cat.mil.units || []).filter((u) => u.id !== S.cat.mil.generalId);
  const tab = a.tab || 'target';
  const head = `${ribbon('Админ-панель')}
    <div class="atarget">Цель: ${who}${a.login ? ' <button class="btn small" data-adm-self>сбросить</button>' : ''}</div>
    <div class="atabs">${ADM_TABS.map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" data-atab="${k}">${t}${k === 'multi' && S.st.user.multiNew ? ` <b class="abadge">${S.st.user.multiNew}</b>` : ''}</button>`).join('')}</div>`;
  const T = {
    target: () => `<div class="acard"><div class="arow"><span>Игрок:</span><input data-an="login" value="${esc(a.login)}" placeholder="пусто — вы сами" autocapitalize="none"></div>
      <label class="check"><input type="checkbox" data-an="all" ${a.all ? 'checked' : ''}> над всеми замками игрока</label></div>
      <div class="arow">${aNum('gold', 100, 'монет (минус — забрать)')}${aBtn('gold', '+ Монеты', 'coins_s.png', 'data-arg="gold:n"')}</div>
      <div class="arow">${aNum('res', 100000, 'ресурсов')}${aBtn('res', '+ Ресурсы', 'res/wood.png', 'data-arg="res:n"')}</div>
      <div class="arow">${aNum('royal', 10000, 'лояльности')}${aBtn('royal', '+ Лояльность', 'smallicon/bonus_status/coronalgold.png', 'data-arg="royal:n"')}</div>
      <div class="arow"><select data-an="race">${S.cat.raceOrder.map((r) => `<option value="${r}">${esc(S.cat.races[r])}</option>`).join('')}</select>${aBtn('race', 'Сменить расу', 'smallicon/plus.png', `data-arg="race:race" data-confirm="Сменить расу? Юниты прежней расы пропадут."`)}</div>
      <div class="ptiles">${aBtn('reset', 'Сброс на старт', 'build/build.png', `data-confirm="Сбросить ${a.login ? `игрока ${esc(a.login)}` : 'себя'} к началу игры? Все замки, войска и постройки пропадут — будет один новый замок, как сразу после регистрации."`)}</div>
      ${a.player ? playerCard(a.player) : ''}`,
    build: () => `<div class="acard"><div class="cwname"><img class="admbadge s" src="${GFX}ground/castle_small.png" alt=""> Выдать игроку полный замок</div>
      <p class="small">Новый замок на полной прокачке (все здания 20 ур.) появится рядом со столицей игрока, игроку придёт уведомление.</p>
      <form class="chatform" data-aform="givecastle"><input name="login" placeholder="Ник игрока" autocapitalize="none" required value="${esc(a.login)}"><input name="n" type="number" min="1" max="50" value="1" style="max-width:70px"><button class="btn primary small">Выдать</button></form></div>
      <div class="ptiles">${aBtn('max', 'Полная прокачка', 'build/castle.png')}${aBtn('finish', 'Завершить всё', 'res/time.png')}${aBtn('sciences', 'Науки 20 ур.', 'smallicon/Ekoscience.png')}${aBtn('fill', 'Склады полные', 'build/storage.png')}</div>
      <div class="arow">${aNum('castles', 1, 'сколько')}${aBtn('castles', '+ Замки', 'ground/castle_big.png', 'data-arg="castles:n"')}</div>
      <div class="arow">${aNum('loyalty', 100, '0–100')}${aBtn('loyalty', 'Лояльность замка', 'smallicon/bonus_status/coronalgold.png', 'data-arg="loyalty:value"')}</div>`,
    army: () => { const g = a.ga; return `<div class="acard"><div class="cwname"><img class="admbadge s" src="${GFX}units/human/knight.png" alt=""> Выдать армию игроку</div>
      <form class="chatform" data-aform="armyinfo"><input name="login" placeholder="Ник игрока" autocapitalize="none" required value="${esc(g ? g.login : a.login)}"><button class="btn primary small">Показать войска</button></form>
      ${g ? `<p class="small">Раса: <b>${esc(g.raceName)}</b> — доступны только её юниты. Пустое поле — не выдавать.</p>
      <form data-aform="givearmy"><div class="arow"><span>Замок:</span><select name="castle">${g.castles.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.x}:${c.y})${c.capital ? ' — столица' : ''}</option>`).join('')}</select></div>
        <div class="gaunits">${g.units.map((id) => { const u = unitById(id); return u ? `<label class="gaunit"><img src="${unitSrc(u, g.race)}" alt=""><span>${esc(u.name)}</span><input type="number" min="0" inputmode="numeric" name="u${id}" placeholder="0"></label>` : ''; }).join('')}</div>
        <div class="gabtns"><button type="button" class="btn small" data-gafill="100">всем по 100</button><button type="button" class="btn small" data-gafill="1000">всем по 1000</button><button type="button" class="btn small" data-gafill="">очистить</button></div>
        <button class="btn primary" style="width:100%;margin-top:8px">Выдать войска</button></form>` : ''}</div>
      `+`<div class="arow"><select data-an="unit"><option value="">Все юниты расы игрока</option>${units.map((u) => `<option value="${u.id}">${esc(u.name)}${u.race !== 'all' ? ` (${esc(S.cat.races[u.race] || '')})` : ''}</option>`).join('')}</select></div>
      <div class="arow">${aNum('army', 1000, 'кол-во (минус — забрать)')}${aBtn('army', '+ Войска', 'units/human/knight.png', 'data-arg="army:n,unit"')}</div>
      <div class="arow">${aNum('general', 100, 'уровень 1–500')}${aBtn('general', 'Генерал ур.', 'units/human/general.png', 'data-arg="general:level"')}</div>
      <div class="ptiles">${aBtn('arts', '5 артефактов', 'smallicon/artefacts/artefakt_dragon.png')}${aBtn('gear', 'Снаряжение', 'smallicon/swordred.png')}${aBtn('boss', 'Мировой босс', 'boss/m_dragon.png', 'data-confirm="Вызвать мирового босса сейчас? Текущий завершится."')}${aBtn('noarmy', 'Убрать войска', 'smallicon/destroy.png', 'data-confirm="Убрать все войска?"')}</div>`; },
    players: () => `<div class="acard"><div class="cwname"><img class="admbadge s" src="${GFX}mod_badge_s.png" alt=""> Модераторы форума</div>
      <p class="small">Модератор удаляет сообщения и темы, создаёт темы на форуме, запрещает писать в чате и на форуме.</p>
      ${!a.mods ? '<p class="small">Загрузка…</p>' : a.mods.mods.length ? a.mods.mods.map((m) => `<div class="arow"><span><b>${esc(m.login)}</b>${m.online ? ' · в игре' : ''}</span><button class="btn small" data-amod="${esc(m.login)}">Снять</button></div>`).join('') : '<p class="small">Модераторов пока нет.</p>'}
      ${a.mods && a.mods.sections.length ? `<p class="small">Модераторы разделов (назначаются в Форум → Модераторы): ${a.mods.sections.map((x) => `${esc(x.name)} — ${x.mods.map(esc).join(', ')}`).join('; ')}</p>` : ''}
      <form class="chatform" data-aform="addmod"><input name="login" placeholder="Ник игрока" autocapitalize="none" required><button class="btn primary small">Назначить</button></form></div>
      <form class="chatform" data-aform="find"><input name="q" placeholder="Поиск по нику" autocapitalize="none"><button class="btn primary small">Найти</button></form>
      <button class="pbar" data-adm="players">Топ-100 игроков</button>
      ${a.players ? `<div class="rlist">${a.players.map((p) => `<button class="rrow" data-apick="${esc(p.login)}"><span class="rn"><b>${esc(p.login)}${p.admin ? ` <img class="admbadge s" src="${GFX}admin_badge_s.png" alt="">` : p.mod ? ` <img class="admbadge s" src="${GFX}mod_badge_s.png" alt="">` : ''}${p.banned ? ' <span class="bad">[бан]</span>' : ''}</b>
        <small>${esc(p.race)} · замков ${p.castles} · монет ${fmtFull(p.gold)} · ${p.online ? 'в игре' : `был ${fmtDate(p.lastSeen)}`}</small></span><span class="rv">${fmtFull(p.rating)}</span></button>`).join('')}</div>` : ''}`,
    multi: () => {
      const m = a.multis, row = (u) => `<div class="mrow"><button class="rrow" data-apick="${esc(u.login)}"><span class="rn"><b>${esc(u.login)}${u.admin ? ` <img class="admbadge s" src="${GFX}admin_badge_s.png" alt="">` : ''}${u.banned ? ' <span class="bad">[бан]</span>' : ''}</b><small>был ${fmtDate(u.lastSeen)}</small></span><span class="rv">${fmtFull(u.rating)}</span></button>
        ${u.admin ? '' : `<button class="btn small ${u.banned ? '' : 'danger'}" data-mban="${esc(u.login)}" data-on="${u.banned ? 0 : 1}">${u.banned ? 'Разбан' : 'Бан'}</button>`}</div>`;
      return `<div class="bwline small">Сервер никого не банит сам — он только сообщает. Общее <b>устройство</b> — почти наверняка один человек, общий <b>IP</b> — возможно, одна сеть (дом, Wi‑Fi, мобильный оператор). Решаете вы.</div>
      <button class="pbar" data-adm="multis">Проверить мультов</button>
      ${m ? `<div class="mhead">🔔 Оповещения</div>${m.log.length ? `<div class="mlog">${m.log.slice(0, 15).map((x) => `<div class="${x.fresh ? 'fresh' : ''}">${x.fresh ? '<b class="newtag">новое</b> ' : ''}<b>${esc(x.login)}</b> — устройство ${esc(x.dev)}, как у ${x.with.map(esc).join(', ')} <small>${fmtDate(x.at)}</small></div>`).join('')}</div>` : '<p class="parch-note">Пока тихо.</p>'}
        ${m.groups.length ? m.groups.map((g) => {
          const free = g.users.filter((u) => !u.banned && !u.admin).map((u) => u.login);
          return `<div class="mgroup ${g.strong ? 'strong' : ''}"><div class="mhead">${g.strong ? '📱 Одно устройство' : '🌐 Один IP'} <small>${esc(g.key)}</small> · ${g.users.length} акк.${g.devBanned ? ' <span class="bad">[устройство в бане]</span>' : ''}</div>
          ${g.users.map(row).join('')}
          <div class="mact">${free.length > 1 ? `<button class="btn small danger" data-mall="${esc(free.join(','))}">Забанить все (${free.length})</button>` : ''}
          ${g.dev ? `<button class="btn small ${g.devBanned ? '' : 'danger'}" data-mdev="${esc(g.dev)}" data-on="${g.devBanned ? 0 : 1}">${g.devBanned ? 'Разблокировать устройство' : 'Бан устройства'}</button>` : ''}</div></div>`;
        }).join('') : '<p class="parch-note">Мультов не найдено.</p>'}` : ''}`;
    },
    world: () => `<div class="acard"><div class="cwname"><img class="admbadge s" src="${GFX}smallicon/upgrade.png" alt=""> Новость игрокам</div><p class="small">Всем игрокам придёт фиолетовый конверт в верхней панели; после прочтения он исчезнет, а новость останется в «Инфо → Новости».</p><form class="stack" data-aform="newspub"><input name="title" maxlength="80" placeholder="Заголовок" required><textarea name="text" rows="5" maxlength="4000" placeholder="Текст новости" required></textarea><button class="btn primary">Опубликовать</button></form></div>
      <form class="stack" data-aform="mailall"><input name="subject" placeholder="Тема письма" value="Сообщение администрации"><textarea name="text" rows="3" placeholder="Письмо всем игрокам" required></textarea><button class="btn primary">Разослать всем</button></form>
      <form class="chatform" data-aform="chat"><input name="text" placeholder="Объявление в общий чат" required><button class="btn primary small">В чат</button></form>
      <div class="ptiles">${aBtn('npc', 'Восстановить лагеря', 'ground/dikari.png')}${aBtn('season', 'Подвести месяц', 'smallicon/bonus_status/ranggold.png', 'data-confirm="Подвести итоги месяца досрочно и выдать награды топ-3?"')}${aBtn('reports', 'Очистить отчёты', 'smallicon/swordgreen.png')}${aBtn('bugs', 'Жалобы и ошибки', 'smallicon/soft_help.png')}</div>
      <div class="arow">${aNum('bots', 1000, 'сколько ботов')}${aBtn('bots', 'Заселить ботами', 'ground/castle_small.png', 'data-arg="bots:n"')}</div>
      ${a.bugs ? `<div class="pstats">${a.bugs.length ? a.bugs.map((b) => `<b>${esc(b.from)}</b> · ${fmtDate(b.at)}<br>${esc(b.text)}`).join('<hr>') : 'Сообщений нет.'}</div>${a.bugs.length ? '<button class="pbar" data-adm="bugsclear">Очистить список</button>' : ''}` : ''}`,
  };
  return head + T[tab]();
}

// «Устройства» в карточке игрока: модель, система, браузер, экран, железо, часовой пояс, IP; совпадения с другими аккаунтами; бан устройства
function devCard(p) {
  const d = p.dev || { devices: [], ips: [], sameIp: [] }, who = (l) => l.map((x) => `<button class="alink" data-apick="${esc(x)}">${esc(x)}</button>`).join(', ');
  const kv = (k, v) => (v || v === 0 ? `<div><span>${k}</span><b>${v}</b></div>` : '');
  const dev = (x) => `<div class="dcard ${x.banned ? 'ban' : ''}"><div class="dhead">📱 <b>${esc(x.model || (x.old ? 'Старый вход (без подробностей)' : 'Неизвестная модель'))}</b>${x.banned ? ' <span class="bad">[в бане]</span>' : ''}</div>
    ${x.old ? '' : `<div class="dgrid">${kv('Система', esc([x.os, x.osv && !String(x.os).includes(x.osv) ? `(${x.osv})` : ''].filter(Boolean).join(' ')))}${kv('Браузер', esc(x.browser || '—'))}${kv('Как играет', x.app ? 'Приложение' : 'Браузер')}
      ${kv('Экран', esc(`${x.scr || '?'} ×${x.dpr || 1}`))}${kv('Ядер / ОЗУ', `${x.cores || '?'} / ${x.mem ? `${x.mem} ГБ` : '?'}`)}${kv('Видео', esc(x.gpu || '—'))}
      ${kv('Язык', esc(x.lang))}${kv('Часовой пояс', esc(x.tz))}${kv('Сенсорный', x.touch ? 'да' : 'нет')}
      ${kv('Первый вход', fmtDate(x.first))}${kv('Последний', fmtDate(x.last))}${kv('Входов', x.count)}${kv('IP', esc((x.ips || []).join(', ')))}
      ${kv('ID / железо', `<small>${esc(x.dev.slice(0, 12))} / ${esc((x.fp || '—').slice(0, 12))}</small>`)}</div>`}
    ${x.old ? `<div class="small">id ${esc(x.dev.slice(0, 12))} · ${fmtDate(x.last)} — подробности появятся при следующем входе игрока.</div>` : ''}
    ${x.sameDev.length ? `<div class="dwarn">⚠ Тот же телефон (id): ${who(x.sameDev)}</div>` : ''}${x.sameFp.length ? `<div class="dwarn">⚠ То же железо: ${who(x.sameFp)}</div>` : ''}
    ${p.admin ? '' : `<button class="btn small ${x.banned ? '' : 'danger'}" data-mdev="${esc(x.dev)}" data-fp="${esc(x.fp || '')}" data-on="${x.banned ? 0 : 1}">${x.banned ? 'Разблокировать устройство' : '⛔ Бан устройства'}</button>`}</div>`;
  const full = d.devices.filter((x) => !x.old), old = d.devices.filter((x) => x.old);
  const oldRow = (x) => `<div class="doldrow ${x.banned ? 'ban' : ''}"><span>id ${esc(x.dev.slice(0, 10))} · ${fmtDate(x.last)}${x.sameDev.length ? ` · <span class="dwarn">⚠ ${who(x.sameDev)}</span>` : ''}</span>${p.admin ? '' : `<button class="btn small ${x.banned ? '' : 'danger'}" data-mdev="${esc(x.dev)}" data-on="${x.banned ? 0 : 1}">${x.banned ? 'Разбан' : 'Бан'}</button>`}</div>`;
  return `<div class="mhead">Устройства (${d.devices.length})</div>${full.map(dev).join('') || '<p class="small">Подробностей пока нет — появятся при следующем входе игрока.</p>'}
    ${old.length ? `<div class="dcard"><div class="dhead">Старые входы (без подробностей)</div>${old.map(oldRow).join('')}</div>` : ''}
    <div class="mhead">IP-адреса</div><div class="small">Регистрация: <b>${esc(d.regIp || p.regIp || '—')}</b><br>${(d.ips || []).slice(0, 10).map((x) => `${esc(x.ip)} <small>${fmtDate(x.at)}</small>`).join('<br>') || '—'}</div>
    ${d.sameIp && d.sameIp.length ? `<div class="dwarn">🌐 Те же IP: ${who(d.sameIp)}</div>` : ''}`;
}
function playerCard(p) {
  return `<div class="acard"><div class="cwname">${esc(p.login)}${p.banned ? ' <span class="bad">[заблокирован]</span>' : ''}</div>
    <div class="small">Логин для входа: <b>${esc(p.acct || '—')}</b>${p.email ? ` · email: ${esc(p.email)}` : ''}</div>
    <div class="small">${esc(p.race)} · рейтинг ${fmtFull(p.rating)} · монет ${fmtFull(p.gold)} · в игре с ${fmtDate(p.created)}</div>
    ${(p.nickLog || []).length ? `<div class="small">Прежние ники: ${p.nickLog.map((x) => `${esc(x.from)} → ${esc(x.to)} <small>${fmtDate(x.at)}</small>`).join('; ')}</div>` : ''}
    ${devCard(p)}
    <div class="rlist">${p.castlesList.map((c) => `<div class="rrow"><span class="rn"><b>${esc(c.name)}</b><small>X:${c.x} Y:${c.y} · лояльность ${c.loyalty}</small></span><span class="rv">${fmtFull(c.rating)}</span>
      <button class="btn small" data-goworld="${c.x},${c.y}">карта</button></div>`).join('')}</div>
    <div class="ptiles">
      ${p.banned ? aBtn('unban', 'Разблокировать', 'smallicon/greenball.png') : aBtn('ban', 'Заблокировать', 'smallicon/grayball.png', 'data-confirm="Заблокировать игрока?"')}
      ${aBtn('noavatar', 'Удалить аватар', 'smallicon/destroy.png', 'data-confirm="Удалить аватар игрока?"')}
      ${aBtn('castles', 'Дать полный замок', 'ground/castle_small.png', `data-confirm="Выдать игроку ${esc(p.login)} полностью прокачанный замок?"`)}${aBtn('mod', p.mod ? 'Снять модератора' : 'Модератор форума', 'mod_badge_s.png', `data-confirm="${p.mod ? 'Снять с игрока права модератора?' : 'Назначить модератором форума (удаление сообщений и бан в чате)?'}"`)}
      ${aBtn('makeadmin', 'Сделать админом', 'smallicon/status/f_gold.png', 'data-confirm="Дать права администратора?"')}
      ${aBtn('delete', 'Удалить игрока', 'smallicon/destroy.png', 'data-confirm="Удалить игрока и все его замки навсегда?"')}
    </div>
    <div class="arow">${aNum('rep', 10, 'репутация')}${aBtn('rep', '+ Репутация', 'smallicon/plus.png', 'data-arg="rep:n"')}</div>
    <form class="chatform" data-aform="pass"><input name="password" placeholder="Новый пароль" required><button class="btn primary small">Сменить пароль</button></form>
    <form class="chatform" data-aform="rename"><input name="name" placeholder="Новое имя активного замка" required><button class="btn primary small">Переименовать</button></form>
    <form class="chatform" data-aform="move"><input name="x" type="number" placeholder="X" required><input name="y" type="number" placeholder="Y" required><button class="btn primary small">Перенести замок</button></form></div>`;
}

function admSend(op, extra = {}) {
  const a = S.adm;
  send({ t: 'admin', op, login: a.login || undefined, all: a.all, ...extra });
}
$('#sheetBody').addEventListener('input', (e) => {
  const n = e.target.dataset.an; if (!n) return;
  if (n === 'login') S.adm.login = e.target.value.trim();
});
$('#sheetBody').addEventListener('change', (e) => {
  const n = e.target.dataset.an; if (!n) return;
  if (n === 'all') S.adm.all = e.target.checked;
  if (n === 'login') { S.adm.player = null; refreshSheet(); }
});
$('#sheetBody').addEventListener('click', (e) => {
  const gf = e.target.closest('[data-gafill]'); if (gf) { $$('.gaunit input').forEach((i) => { i.value = gf.dataset.gafill; }); return; }
  const md = e.target.closest('[data-amod]'); if (md) { if (!confirm(`Снять ${md.dataset.amod} с модераторов?`)) return; send({ t: 'admin', op: 'mod', login: md.dataset.amod, on: 0 }); return setTimeout(() => send({ t: 'admin', op: 'mods' }), 300); }
  const tb = e.target.closest('[data-atab]'); if (tb) { S.adm.tab = tb.dataset.atab; if (S.adm.tab === 'multi') send({ t: 'admin', op: 'multis' }); if (S.adm.tab === 'players') send({ t: 'admin', op: 'mods' }); return refreshSheet(); }
  const mb = e.target.closest('[data-mban],[data-mall],[data-mdev]');
  if (mb) { // решения по мультам — только вручную и с подтверждением
    const d = mb.dataset, on = d.on === '1';
    if (d.mban !== undefined) { if (on && !confirm(`Заблокировать ${d.mban}?`)) return; send({ t: 'admin', op: on ? 'ban' : 'unban', login: d.mban }); }
    if (d.mall !== undefined) { if (!confirm(`Заблокировать аккаунты: ${d.mall.split(',').join(', ')}?`)) return; send({ t: 'admin', op: 'banmany', logins: d.mall.split(',') }); }
    if (d.mdev !== undefined) { if (on && !confirm(`Заблокировать устройство? С него нельзя будет войти и зарегистрироваться${d.fp ? ' — даже после очистки данных или из другого браузера' : ''}.`)) return; send({ t: 'admin', op: on ? 'devban' : 'devunban', dev: d.mdev, fp: d.fp || undefined }); }
    return setTimeout(() => (S.adm.tab === 'target' && S.adm.login ? send({ t: 'admin', op: 'player', login: S.adm.login }) : send({ t: 'admin', op: 'multis' })), 200);
  }
  const b = e.target.closest('[data-adm],[data-apick],[data-adm-self]'); if (!b) return;
  if (b.dataset.admSelf !== undefined) { S.adm.login = ''; S.adm.player = null; return refreshSheet(); }
  if (b.dataset.apick) { S.adm.login = b.dataset.apick; S.adm.player = null; S.adm.tab = 'target'; send({ t: 'admin', op: 'player', login: S.adm.login }); return refreshSheet(); }
  const op = b.dataset.adm;
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  const extra = {};
  if (b.dataset.arg) { // "op:key,key2" — значения берутся из полей data-an
    const [field, keys] = b.dataset.arg.split(':');
    keys.split(',').forEach((k, i) => { const el = $(`[data-an="${i === 0 ? field : k}"]`); if (el) extra[k] = el.value; });
  }
  if (op === 'players' || op === 'bugs' || op === 'multis') return send({ t: 'admin', op });
  if (op === 'bugsclear') { S.adm.bugs = null; return send({ t: 'admin', op }); }
  if (op === 'delete') { admSend(op); S.adm.login = ''; S.adm.player = null; S.adm.players = null; return; }
  admSend(op, extra);
  if (S.adm.login) setTimeout(() => send({ t: 'admin', op: 'player', login: S.adm.login }), 150);
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.aform; if (!k) return;
  e.preventDefault();
  if (k === 'armyinfo') { const l = f.login.value.trim(); if (!l) return; S.adm.ga = null; return send({ t: 'admin', op: 'armyinfo', login: l }); }
  if (k === 'givearmy') {
    const g = S.adm.ga; if (!g) return;
    const units = {}; for (const id of g.units) { const v = Number(f[`u${id}`].value); if (v > 0) units[id] = v; }
    if (!Object.keys(units).length) return toast('Укажите количество хотя бы для одного юнита.', 'err');
    if (!confirm(`Выдать войска игроку ${g.login}?`)) return;
    return send({ t: 'admin', op: 'givearmy', login: g.login, castle: Number(f.castle.value), units });
  }
  if (k === 'givecastle') { const l = f.login.value.trim(), n = Math.max(1, Number(f.n.value) || 1); if (!l) return; if (!confirm(`Выдать игроку ${l} полных замков: ${n}?`)) return; return send({ t: 'admin', op: 'castles', login: l, n }); }
  if (k === 'addmod') { const l = f.login.value.trim(); if (!l) return; send({ t: 'admin', op: 'mod', login: l, on: 1 }); f.login.value = ''; return setTimeout(() => send({ t: 'admin', op: 'mods' }), 300); }
  if (k === 'find') { S.adm.players = null; return send({ t: 'admin', op: 'players', q: f.q.value }); }
  if (k === 'newspub') { if (!confirm('Опубликовать новость всем игрокам?')) return; send({ t: 'news', op: 'publish', title: f.title.value, text: f.text.value }); f.reset(); return; }
  if (k === 'mailall') send({ t: 'admin', op: 'mailall', subject: f.subject.value, text: f.text.value });
  if (k === 'chat') { send({ t: 'admin', op: 'chat', text: f.text.value }); f.text.value = ''; }
  if (k === 'pass') admSend('pass', { password: f.password.value });
  if (k === 'rename') admSend('rename', { name: f.name.value });
  if (k === 'move') admSend('move', { x: f.x.value, y: f.y.value });
});

const prevMil2 = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'admininfo') {
    if (m.op === 'players') S.adm.players = m.data;
    if (m.op === 'player') S.adm.player = m.data;
    if (m.op === 'bugs') S.adm.bugs = m.data;
    if (m.op === 'multis') S.adm.multis = m.data;
    if (m.op === 'mods') S.adm.mods = m.data;
    if (m.op === 'armyinfo') S.adm.ga = m.data;
    return refreshSheet();
  }
  prevMil2(m);
};
