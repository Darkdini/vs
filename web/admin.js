'use strict';
// Админ-панель (только для admin): отдельное окно со всеми командами сервера (server/src/admin.js).
// Цель команд — игрок из поля «Игрок» (пусто — вы сами); галочка «все замки» — над всеми его замками.

S.adm = { login: '', all: true, players: null, player: null, bugs: null, tab: 'player' };
const aBtn = (op, text, icon, extra = '') => `<button class="ptile" data-adm="${op}" ${extra}><img src="${GFX}${icon}" alt=""><span>${text}</span></button>`;
const aNum = (name, value, ph) => `<input class="anum" type="number" inputmode="numeric" data-an="${name}" value="${value}" placeholder="${ph}">`;

// Разделы: Игрок (поиск, карточка, пароли, наказания) · Выдать (монеты, ресурсы, замки, армия) · Модерация (модераторы, мульты, жалобы) · Мир (новости, рассылки, события).
// У каждого действия — короткое описание; одно действие — в одном месте.
const ADM_TABS = [['player', '👤 Игрок'], ['give', '🎁 Выдать'], ['mod', '🛡 Модерация'], ['world', '🌍 Мир'], ['stats', '📊 Статистика'], ['alerts', '🚨 Тревоги'], ['sec', '🔒 Защита']];
// строка действия: название и пояснение слева, поле и кнопка справа
const aAct = (title, desc, controls, wide = false) => `<div class="aact ${wide ? 'wide' : ''}"><div class="aact-t"><b>${title}</b><small>${desc}</small></div><div class="aact-c">${controls}</div></div>`;
const aBtn2 = (op, text, extra = '', cls = '') => `<button class="btn small ${cls}" data-adm="${op}" ${extra}>${text}</button>`;
const aSec = (title, body) => `<div class="acard"><div class="cwname">${title}</div>${body}</div>`;
function adminHtml() {
  const a = S.adm, tab = ADM_TABS.some(([k]) => k === a.tab) ? a.tab : 'player';
  const who = a.login ? `игрок <b>${esc(a.login)}</b> <button class="btn small" data-adm-self>× сбросить</button>` : '<b>вы (Советник)</b>';
  const head = `${ribbon('Админ-панель')}
    <div class="atabs">${ADM_TABS.map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" data-atab="${k}">${t}${k === 'mod' && S.st.user.multiNew ? ` <b class="abadge">${S.st.user.multiNew}</b>` : ''}${k === 'alerts' && S.st.user.alertsNew ? ` <b class="abadge">${S.st.user.alertsNew}</b>` : ''}${k === 'sec' && S.st.user.secNew ? ` <b class="abadge">${S.st.user.secNew}</b>` : ''}</button>`).join('')}</div>`;
  const target = `<div class="atarget">Кому: ${who}<label class="check"><input type="checkbox" data-an="all" ${a.all ? 'checked' : ''}> во все замки игрока</label></div>`;
  const T = {
    player: () => `${aSec('Найти игрока', `<p class="small">Введите ник (можно часть) или нажмите «Топ-100». Нажмите на игрока — откроется его карточка.</p>
      <form class="chatform" data-aform="find"><input name="q" placeholder="Ник игрока" autocapitalize="none" value="${esc(a.q || '')}"><button class="btn primary small">Найти</button></form>
      <button class="pbar" data-adm="players">Топ-100 игроков</button>
      ${a.players ? `<div class="rlist">${a.players.map((p) => `<button class="rrow" data-apick="${esc(p.login)}"><span class="rn"><b>${esc(p.login)}${p.admin ? ` <img class="admbadge s" src="${GFX}admin_badge_s.png" alt="">` : p.mod ? ` <img class="admbadge s" src="${GFX}chat/moder.png" alt="">` : ''}${p.banned ? ' <span class="bad">[бан]</span>' : ''}</b>
        <small>${esc(p.race)} · замков ${p.castles} · монет ${fmtFull(p.gold)} · ${p.online ? 'в игре' : `был ${fmtDate(p.lastSeen)}`}</small></span><span class="rv">${fmtFull(p.rating)}</span></button>`).join('')}</div>` : ''}`)}
      ${a.player ? playerCard(a.player) : a.login ? '<p class="parch-note">Загрузка карточки…</p>' : ''}`,
    give: () => `${target}
      ${aSec('💰 Казна и ресурсы', `
        ${aAct('Монеты', 'Добавить золото на счёт. Минус — забрать. Игроку придёт письмо.', `${aNum('gold', 100, 'монет')}${aBtn2('gold', 'Выдать', 'data-arg="gold:n"')}`)}
        ${aAct('Ресурсы', 'Дерево, камень, железо и еду — поровну, в пределах складов.', `${aNum('res', 100000, 'каждого')}${aBtn2('res', 'Выдать', 'data-arg="res:n"')}`)}
        ${aAct('Заполнить склады', 'Все ресурсы до предела складов.', aBtn2('fill', 'Заполнить'))}
        ${aAct('Лояльность населения', 'Очки для захвата замков (Резиденция).', `${aNum('royal', 10000, 'очков')}${aBtn2('royal', 'Выдать', 'data-arg="royal:n"')}`)}`)}
      ${aSec('🏰 Замки', `
        ${aAct('Полная прокачка', 'Все здания замка и земель на максимум (галочка выше — во всех замках).', aBtn2('max', 'Прокачать', 'data-confirm="Прокачать замок на максимум?"'))}
        ${aAct('Завершить стройки', 'Мгновенно закончить стройки, тренировки и исследования.', aBtn2('finish', 'Завершить'))}
        ${aAct('Науки', 'Все науки Университета — 20 уровень.', aBtn2('sciences', 'Выдать'))}
        ${aAct('Новые замки', 'Полностью прокачанные замки рядом со столицей.', `${aNum('castles', 1, 'сколько')}${aBtn2('castles', 'Выдать', 'data-arg="castles:n" data-confirm="Выдать полные замки?"')}`)}
        ${aAct('Лояльность замка', 'Верность жителей активного замка, 0–100%.', `${aNum('loyalty', 100, '0–100')}${aBtn2('loyalty', 'Задать', 'data-arg="loyalty:value"')}`)}`)}
      ${aSec('⚔ Армия и генерал', `
        ${aAct('Войска', 'Выбрать замок и сколько каких юнитов (только юниты расы игрока).', `<form class="chatform" data-aform="armyinfo"><input type="hidden" name="login" value="${esc(a.login || S.st.user.login)}"><button class="btn small primary">Открыть список</button></form>`)}
        ${a.ga ? armyForm(a.ga) : ''}
        ${aAct('Убрать войска', 'Все войска в замках игрока исчезнут.', aBtn2('noarmy', 'Убрать', 'data-confirm="Убрать все войска?"', 'danger'))}
        ${aAct('Генерал', 'Генерал нужного уровня (1–500) в активном замке.', `${aNum('general', 100, 'уровень')}${aBtn2('general', 'Выдать', 'data-arg="general:level"')}`)}
        ${aAct('Артефакты', '5 легендарных артефактов в Сокровищницу.', aBtn2('arts', 'Выдать'))}
        ${aAct('Снаряжение генерала', 'Полный набор вещей всех редкостей в Оружейную.', aBtn2('gear', 'Выдать'))}`)}`,
    mod: () => `${aSec('🛡 Модераторы форума', `<p class="small">Модератор удаляет сообщения и темы на форуме и в чате, может запретить игроку писать.</p>
      ${!a.mods ? '<p class="small">Загрузка…</p>' : a.mods.mods.length ? a.mods.mods.map((m) => `<div class="arow"><span><b>${esc(m.login)}</b>${m.online ? ' · в игре' : ''}</span><button class="btn small" data-amod="${esc(m.login)}">Снять</button></div>`).join('') : '<p class="small">Модераторов пока нет.</p>'}
      ${a.mods && a.mods.sections.length ? `<p class="small">Модераторы разделов (назначаются в Форум → Модераторы): ${a.mods.sections.map((x) => `${esc(x.name)} — ${x.mods.map(esc).join(', ')}`).join('; ')}</p>` : ''}
      <form class="chatform" data-aform="addmod"><input name="login" placeholder="Ник игрока" autocapitalize="none" required><button class="btn primary small">Назначить</button></form>`)}
      ${aSec('👥 Мульты', multiHtml(a.multis))}
      ${aSec('📮 Жалобы и сообщения об ошибках', `<p class="small">Жалобы из чата и сообщения «Сообщить об ошибке» от игроков.</p><button class="pbar" data-adm="bugs">Показать</button>
        ${a.bugs ? `<div class="pstats">${a.bugs.length ? a.bugs.map((b) => `<b>${esc(b.from)}</b> · ${fmtDate(b.at)}<br>${esc(b.text)}`).join('<hr>') : 'Сообщений нет.'}</div>${a.bugs.length ? '<button class="pbar" data-adm="bugsclear">Очистить список</button>' : ''}` : ''}`)}`,
    world: () => `${aSec('📰 Новость', `<p class="small">Всем придёт фиолетовый конверт в верхней панели; новость останется в «Инфо → Новости».</p><form class="stack" data-aform="newspub"><input name="title" maxlength="80" placeholder="Заголовок" required><textarea name="text" rows="5" maxlength="4000" placeholder="Текст новости" required></textarea><button class="btn primary">Опубликовать</button></form>`)}
      ${aSec('✉ Письмо всем', `<p class="small">Личное письмо каждому игроку (в «Сообщения»).</p><form class="stack" data-aform="mailall"><input name="subject" placeholder="Тема письма" value="Сообщение администрации"><textarea name="text" rows="3" placeholder="Текст письма" required></textarea><button class="btn primary">Разослать всем</button></form>`)}
      ${aSec('💬 Объявление в чат', `<p class="small">Сообщение в общий чат с пометкой [Администрация].</p><form class="chatform" data-aform="chat"><input name="text" placeholder="Текст объявления" required><button class="btn primary small">В чат</button></form>`)}
      ${aSec('🐉 События', `
        ${aAct('Мировой босс', 'Вызвать босса на 48 часов (дракон, тролль, лич — по очереди). Текущий завершится.', aBtn2('boss', 'Вызвать', 'data-confirm="Вызвать мирового босса сейчас?"'))}
        ${aAct('Итоги месяца', 'Досрочно подвести Зал Славы и выдать награды топ-3.', aBtn2('season', 'Подвести', 'data-confirm="Подвести итоги месяца досрочно?"'))}`)}
      ${aSec('🛠 Обслуживание', `
        ${aAct('Лагеря на карте', 'Вернуть ресурсы и охрану всем разграбленным лагерям.', aBtn2('npc', 'Восстановить'))}
        ${aAct('Отчёты', 'Удалить все боевые отчёты на сервере.', aBtn2('reports', 'Очистить', 'data-confirm="Удалить все отчёты всех игроков?"', 'danger'))}
        ${aAct('Боты', 'Заселить карту замками-ботами (для проверки нагрузки).', `${aNum('bots', 100, 'сколько')}${aBtn2('bots', 'Заселить', 'data-arg="bots:n" data-confirm="Заселить карту ботами?"')}`)}`)}`,
    stats: () => admStatsHtml(a.stats),
    alerts: () => admAlertsHtml(a.alerts),
    sec: () => admSecHtml(a.sec),
  };
  return head + T[tab]();
}
function armyForm(g) {
  return `<form data-aform="givearmy" class="acard2"><p class="small">${esc(g.login)} · раса <b>${esc(g.raceName)}</b>. Пустое поле — не выдавать.</p>
    <div class="arow"><span>Замок:</span><select name="castle">${g.castles.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.x}:${c.y})${c.capital ? ' — столица' : ''}</option>`).join('')}</select></div>
    <div class="gaunits">${g.units.map((id) => { const u = unitById(id); return u ? `<label class="gaunit"><img src="${unitSrc(u, g.race)}" alt=""><span>${esc(u.name)}</span><input type="number" min="0" inputmode="numeric" name="u${id}" placeholder="0"></label>` : ''; }).join('')}</div>
    <div class="gabtns"><button type="button" class="btn small" data-gafill="100">всем по 100</button><button type="button" class="btn small" data-gafill="1000">всем по 1000</button><button type="button" class="btn small" data-gafill="">очистить</button></div>
    <button class="btn primary" style="width:100%;margin-top:8px">Выдать войска</button></form>`;
}
function multiHtml(m) {
  const row = (u) => `<div class="mrow"><button class="rrow" data-apick="${esc(u.login)}"><span class="rn"><b>${esc(u.login)}${u.admin ? ` <img class="admbadge s" src="${GFX}admin_badge_s.png" alt="">` : ''}${u.banned ? ' <span class="bad">[бан]</span>' : ''}</b><small>был ${fmtDate(u.lastSeen)}</small></span><span class="rv">${fmtFull(u.rating)}</span></button>
    ${u.admin ? '' : `<button class="btn small ${u.banned ? '' : 'danger'}" data-mban="${esc(u.login)}" data-on="${u.banned ? 0 : 1}">${u.banned ? 'Разбан' : 'Бан'}</button>`}</div>`;
  return `<div class="bwline small">Сервер никого не банит сам — только сообщает. Общее <b>устройство</b> — почти наверняка один человек, общий <b>IP</b> — возможно, одна сеть (дом, Wi‑Fi, мобильный оператор). Решаете вы.</div>
    <button class="pbar" data-adm="multis">Проверить мультов</button>
    ${m ? `<div class="mhead">🔔 Оповещения</div>${m.log.length ? `<div class="mlog">${m.log.slice(0, 15).map((x) => `<div class="${x.fresh ? 'fresh' : ''}">${x.fresh ? '<b class="newtag">новое</b> ' : ''}<b>${esc(x.login)}</b> — устройство ${esc(x.dev)}, как у ${x.with.map(esc).join(', ')} <small>${fmtDate(x.at)}</small></div>`).join('')}</div>` : '<p class="parch-note">Пока тихо.</p>'}
      ${m.groups.length ? m.groups.map((g) => {
        const free = g.users.filter((u) => !u.banned && !u.admin).map((u) => u.login);
        return `<div class="mgroup ${g.strong ? 'strong' : ''}"><div class="mhead">${g.strong ? '📱 Одно устройство' : '🌐 Один IP'} <small>${esc(g.key)}</small> · ${g.users.length} акк.${g.devBanned ? ' <span class="bad">[устройство в бане]</span>' : ''}</div>
        ${g.users.map(row).join('')}
        <div class="mact">${free.length > 1 ? `<button class="btn small danger" data-mall="${esc(free.join(','))}">Забанить все (${free.length})</button>` : ''}
        ${g.dev ? `<button class="btn small ${g.devBanned ? '' : 'danger'}" data-mdev="${esc(g.dev)}" data-on="${g.devBanned ? 0 : 1}">${g.devBanned ? 'Разблокировать устройство' : 'Бан устройства'}</button>` : ''}</div></div>`;
      }).join('') : '<p class="parch-note">Мультов не найдено.</p>'}` : ''}`;
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
const PASS_BY = (b) => (b === 'reg' ? 'регистрация' : b === 'self' ? 'сменил сам' : b === 'server' ? 'сброс на сервере' : String(b || '').startsWith('admin') ? `админ (${esc(String(b).slice(6))})` : 'до журнала');
function playerCard(p) {
  const pc = S.adm.passcheck && S.adm.passcheck.login === p.login ? S.adm.passcheck : null;
  return `<div class="acard"><div class="cwname">${esc(p.login)}${p.admin ? ` <img class="admbadge s" src="${GFX}admin_badge_s.png" alt="">` : ''}${p.banned ? ' <span class="bad">[заблокирован]</span>' : ''}</div>
    <div class="akv"><span>Ник в игре</span><b>${esc(p.login)}</b><span>Логин для входа</span><b>${esc(p.acct || '—')}</b><span>Email</span><b>${esc(p.email || '—')}</b>
      <span>Раса</span><b>${esc(p.race)}</b><span>Рейтинг</span><b>${fmtFull(p.rating)}</b><span>Монеты</span><b>${fmtFull(p.gold)}</b>
      <span>Регистрация</span><b>${fmtDate(p.created)}</b><span>Был в игре</span><b>${p.online ? 'сейчас' : fmtDate(p.lastSeen)}</b></div>
    ${(p.nickLog || []).length ? `<div class="small">Прежние ники: ${p.nickLog.map((x) => `${esc(x.from)} → ${esc(x.to)} <small>${fmtDate(x.at)}</small>`).join('; ')}</div>` : ''}
    <div class="ptiles g3a"><button class="ptile" data-cprof="${p.id}"><img src="${GFX}chat/profile.png" alt=""><span>Профиль и письмо</span></button>${p.castlesList[0] ? `<button class="ptile" data-goworld="${p.castlesList[0].x},${p.castlesList[0].y}"><img src="${GFX}world/castle1.png" alt=""><span>На карте</span></button>` : ''}</div></div>
  <div class="acard"><div class="cwname">🔑 Пароль и восстановление аккаунта</div>
    <p class="small">Пароли не хранятся в открытом виде — только их стойкие отпечатки. Если игрок потерял доступ, спросите у него старый пароль и проверьте его здесь: сервер ответит, совпадает ли он с текущим или прежним паролем этого аккаунта и когда тот действовал. Потом задайте новый пароль и сообщите его игроку.</p>
    <form class="chatform" data-aform="passcheck"><input name="password" placeholder="Пароль, который назвал игрок" autocomplete="off" required><button class="btn primary small">Проверить</button></form>
    ${pc ? `<div class="apc ${pc.hits.length ? 'ok' : 'bad'}">${pc.hits.length ? pc.hits.map((h) => `✔ Совпадает: ${h.current ? '<b>текущий пароль</b>' : '<b>прежний пароль</b>'}, действовал с ${fmtDate(h.from)}${h.to ? ` по ${fmtDate(h.to)}` : ' по сей день'} (${PASS_BY(h.by)})`).join('<br>') : '✘ Не совпадает ни с текущим, ни с прежними паролями этого аккаунта.'}</div>` : ''}
    <form class="chatform" data-aform="pass"><input name="password" placeholder="Новый пароль (от 5 символов)" autocomplete="off" required><button class="btn primary small">Сменить пароль</button></form>
    <div class="mhead">История смены пароля</div>
    ${(p.passLog || []).length ? `<div class="aplog">${p.passLog.map((x) => `<div><b>${fmtDate(x.at)}</b> · ${PASS_BY(x.by)}${x.ip ? ` · IP ${esc(x.ip)}` : ''}${x.current ? ' · <span class="ok">действует</span>' : ''}</div>`).join('')}</div>` : '<p class="small">Журнал пуст: аккаунт создан до журнала, смен пароля ещё не было.</p>'}</div>
  <div class="acard"><div class="cwname">💰 История золота</div>
    ${(p.goldLog || []).length ? `<div class="aplog">${p.goldLog.map((x) => `<div><b>${fmtDate(x.at)}</b> · <span class="${x.delta > 0 ? 'ok' : 'bad'}">${x.delta > 0 ? '+' : ''}${fmtFull(x.delta)}</span> · ${esc(x.reason || '')} · осталось ${fmtFull(x.left)}</div>`).join('')}</div>` : '<p class="small">Золото не менялось.</p>'}
    ${(p.alerts || []).length ? `<div class="mhead">🚨 Подозрительное у игрока</div><div class="aplog">${p.alerts.map((x) => `<div><b>${fmtDate(x.at)}</b> · ${ALERT_IC[x.kind] || '⚠'} ${esc(x.text)}<br><small>${esc(x.why)}</small></div>`).join('')}</div>` : ''}</div>
  <div class="acard"><div class="cwname">⚖ Наказания и права</div>
    ${aAct(p.banned ? 'Разблокировать' : 'Заблокировать', p.banned ? 'Снова пустить игрока в игру.' : 'Игрок не сможет войти, текущий вход прервётся.', p.banned ? aBtn2('unban', 'Разблокировать') : aBtn2('ban', 'Заблокировать', 'data-confirm="Заблокировать игрока?"', 'danger'))}
    ${aAct('Модератор форума', p.mod ? 'Сейчас модератор — можно снять права.' : 'Удаление сообщений и бан в чате и на форуме.', aBtn2('mod', p.mod ? 'Снять' : 'Назначить', `data-confirm="${p.mod ? 'Снять права модератора?' : 'Назначить модератором форума?'}"`))}
    ${aAct('Аватар', 'Удалить картинку игрока (вместо неё — портрет расы).', aBtn2('noavatar', 'Удалить', 'data-confirm="Удалить аватар игрока?"'))}
    ${aAct('Репутация', 'Добавить или убавить (минус) очки репутации.', `${aNum('rep', 10, 'очков')}${aBtn2('rep', 'Изменить', 'data-arg="rep:n"')}`)}</div>
  <div class="acard"><div class="cwname">🏰 Замки игрока</div>
    <div class="rlist">${p.castlesList.map((c) => `<div class="rrow"><span class="rn"><b>${esc(c.name)}</b><small>X:${c.x} Y:${c.y} · лояльность ${c.loyalty}%</small></span><span class="rv">${fmtFull(c.rating)}</span>
      <button class="btn small" data-goworld="${c.x},${c.y}">карта</button></div>
      <div class="acrow"><button class="btn small danger" data-adm="castlereset" data-cid="${c.id}" data-confirm="Сбросить замок «${esc(c.name)}» к стартовому виду? Здания, войска и ресурсы пропадут, место и имя останутся.">Сбросить замок</button>
      ${p.castlesList.length > 1 ? `<button class="btn small danger" data-adm="castledel" data-cid="${c.id}" data-confirm="Удалить замок «${esc(c.name)}» навсегда?">Удалить замок</button>` : ''}</div>`).join('')}</div>
    ${aAct('Переименовать', 'Новое имя активного замка игрока.', '<form class="chatform" data-aform="rename"><input name="name" placeholder="Имя замка" required><button class="btn small primary">Переименовать</button></form>', true)}
    ${aAct('Перенести', 'Переставить активный замок на свободную клетку карты.', '<form class="chatform" data-aform="move"><input name="x" type="number" placeholder="X" required><input name="y" type="number" placeholder="Y" required><button class="btn small primary">Перенести</button></form>', true)}
    ${aAct('Сменить расу', 'Юниты прежней расы пропадут.', `<select data-an="race">${S.cat.raceOrder.map((r) => `<option value="${r}">${esc(S.cat.races[r])}</option>`).join('')}</select>${aBtn2('race', 'Сменить', 'data-arg="race:race" data-confirm="Сменить расу? Юниты прежней расы пропадут."')}`)}
    ${aAct('Сброс на старт', 'Все замки, войска и постройки пропадут — один новый замок, как после регистрации.', aBtn2('reset', 'Сбросить', `data-confirm="Сбросить игрока ${esc(p.login)} к началу игры?"`, 'danger'))}
    ${p.admin ? '' : aAct('Удалить игрока', 'Аккаунт и все замки — навсегда.', aBtn2('delete', 'Удалить', 'data-confirm="Удалить игрока и все его замки навсегда?"', 'danger'))}</div>
  <div class="acard">${devCard(p)}</div>`;
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
  const tb = e.target.closest('[data-atab]'); if (tb) { S.adm.tab = tb.dataset.atab; if (S.adm.tab === 'mod') { send({ t: 'admin', op: 'mods' }); send({ t: 'admin', op: 'multis' }); } if (S.adm.tab === 'stats') send({ t: 'admin', op: 'stats' }); if (S.adm.tab === 'alerts') send({ t: 'admin', op: 'alerts' }); if (S.adm.tab === 'sec') send({ t: 'admin', op: 'sec' }); return refreshSheet(); }
  const mb = e.target.closest('[data-mban],[data-mall],[data-mdev]');
  if (mb) { // решения по мультам — только вручную и с подтверждением
    const d = mb.dataset, on = d.on === '1';
    if (d.mban !== undefined) { if (on && !confirm(`Заблокировать ${d.mban}?`)) return; send({ t: 'admin', op: on ? 'ban' : 'unban', login: d.mban }); }
    if (d.mall !== undefined) { if (!confirm(`Заблокировать аккаунты: ${d.mall.split(',').join(', ')}?`)) return; send({ t: 'admin', op: 'banmany', logins: d.mall.split(',') }); }
    if (d.mdev !== undefined) { if (on && !confirm(`Заблокировать устройство? С него нельзя будет войти и зарегистрироваться${d.fp ? ' — даже после очистки данных или из другого браузера' : ''}.`)) return; send({ t: 'admin', op: on ? 'devban' : 'devunban', dev: d.mdev, fp: d.fp || undefined }); }
    return setTimeout(() => (S.adm.tab === 'player' && S.adm.login ? send({ t: 'admin', op: 'player', login: S.adm.login }) : send({ t: 'admin', op: 'multis' })), 200);
  }
  const b = e.target.closest('[data-adm],[data-apick],[data-adm-self]'); if (!b) return;
  if (b.dataset.admSelf !== undefined) { S.adm.login = ''; S.adm.player = null; return refreshSheet(); }
  if (b.dataset.apick) { S.adm.login = b.dataset.apick; S.adm.player = null; S.adm.ga = null; S.adm.passcheck = null; S.adm.tab = 'player'; send({ t: 'admin', op: 'player', login: S.adm.login }); return refreshSheet(); }
  const op = b.dataset.adm;
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  const extra = {};
  if (b.dataset.cid) extra.cid = Number(b.dataset.cid);
  if (b.dataset.arg) { // "op:key,key2" — значения берутся из полей data-an
    const [field, keys] = b.dataset.arg.split(':');
    keys.split(',').forEach((k, i) => { const el = $(`[data-an="${i === 0 ? field : k}"]`); if (el) extra[k] = el.value; });
  }
  if (op === 'players' || op === 'bugs' || op === 'multis') return send({ t: 'admin', op });
  if (op === 'alertsclear') { send({ t: 'admin', op }); S.adm.alerts = []; return refreshSheet(); }
  if (op === 'secclear') { send({ t: 'admin', op }); return setTimeout(() => send({ t: 'admin', op: 'sec' }), 200); }
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
  if (k === 'find') { S.adm.players = null; S.adm.q = f.q.value; return send({ t: 'admin', op: 'players', q: f.q.value }); }
  if (k === 'passcheck') { admSend('passcheck', { password: f.password.value }); f.password.value = ''; return; }
  if (k === 'newspub') { if (!confirm('Опубликовать новость всем игрокам?')) return; send({ t: 'news', op: 'publish', title: f.title.value, text: f.text.value }); f.reset(); return; }
  if (k === 'mailall') send({ t: 'admin', op: 'mailall', subject: f.subject.value, text: f.text.value });
  if (k === 'chat') { send({ t: 'admin', op: 'chat', text: f.text.value }); f.text.value = ''; }
  if (k === 'pass') { if (!confirm(`Сменить пароль игроку ${S.adm.login}? Все его входы завершатся.`)) return; admSend('pass', { password: f.password.value }); f.password.value = ''; }
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
    if (m.op === 'stats') S.adm.stats = m.data;
    if (m.op === 'alerts') S.adm.alerts = m.data;
    if (m.op === 'sec') S.adm.sec = m.data;
    if (m.op === 'armyinfo') S.adm.ga = m.data;
    if (m.op === 'passcheck') S.adm.passcheck = m.data;
    return refreshSheet();
  }
  prevMil2(m);
};

// ---------- 📊 Статистика (server/src/metrics.js): онлайн по часам, регистрации и возвраты новичков, золото ----------
// столбики — один ряд значений; нажатие на столбик показывает точное значение под графиком
function admBars(id, rows, label, fmt = fmtFull) {
  const max = Math.max(1, ...rows.map((r) => r.v)), sel = S.adm.statSel && S.adm.statSel.id === id ? S.adm.statSel.i : -1, peak = rows.reduce((b, r, i) => (r.v > rows[b].v ? i : b), 0);
  return `<div class="sbars" style="--n:${rows.length}">${rows.map((r, i) => `<button class="${i === sel ? 'on' : ''}" data-ssel="${id}:${i}" title="${esc(r.t)}: ${fmt(r.v)}"><i style="height:${Math.max(r.v ? 4 : 0, r.v / max * 100)}%"></i></button>`).join('')}</div>
    <div class="saxis" style="--n:${rows.length}">${rows.map((r, i) => `<span>${r.tick || ''}</span>`).join('')}</div>
    <p class="sread">${sel >= 0 ? `<b>${esc(rows[sel].t)}</b>: ${fmt(rows[sel].v)} ${label}` : `Максимум: <b>${fmt(rows[peak].v)}</b> ${label} (${esc(rows[peak].t)}). Нажмите на столбик — точное значение.`}</p>`;
}
function admStatsHtml(st) {
  if (!st) return `${aSec('📊 Статистика', '<p class="small">Загрузка…</p>')}`;
  const tile = (v, t) => `<div class="stile"><b>${fmtFull(v)}</b><span>${t}</span></div>`;
  const dm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const pct = (a, b) => (b ? ` (${Math.round(a / b * 100)}%)` : '');
  const back = (x, reg) => (x === null ? '<span class="muted">—</span>' : reg ? `${x} из ${reg}${pct(x, reg)}` : '<span class="muted">0</span>');
  const hours = st.hours.map((h, i) => ({ v: h.v, t: `${dm(h.k)} ${h.h}:00`, tick: i % 6 === 0 ? `${h.h}ч` : '' }));
  const reg = st.days.map((d, i) => ({ v: d.reg, t: dm(d.d), tick: i % 2 === 0 ? dm(d.d) : '' }));
  const act = st.days.map((d, i) => ({ v: d.active, t: dm(d.d), tick: i % 2 === 0 ? dm(d.d) : '' }));
  const g = st.gold, gmax = Math.max(1, ...g.spent.map((x) => x.sum));
  return `${aSec('📊 Сейчас', `<div class="stiles">${tile(st.now.online, 'онлайн')}${tile(st.now.users, 'игроков всего')}${tile(st.now.active7, 'заходили за 7 дней')}${tile(st.now.regToday, 'регистраций сегодня')}${tile(st.now.goldHeld, 'золота у игроков')}</div>
      <button class="btn small" data-astats>↻ Обновить</button>`)}
    ${aSec('🕐 Онлайн за 48 часов', `<p class="small">Сколько игроков было в игре одновременно (максимум за час, время московское).</p>${admBars('h', hours, 'онлайн')}`)}
    ${aSec('🆕 Регистрации за 14 дней', admBars('r', reg, 'регистраций'))}
    ${aSec('👥 Активные игроки за 14 дней', `<p class="small">Сколько разных игроков заходили в игру в этот день.</p>${admBars('a', act, 'игроков')}`)}
    ${aSec('↩ Возвращаются ли новички', `<p class="small">Из зарегистрированных в этот день — сколько зашли на следующий день и через неделю. «—» — тот день ещё не наступил. Считается с обновления, в котором появилась статистика.</p>
      <table class="stab"><tr><th>День</th><th>Рег.</th><th>Через день</th><th>Через неделю</th><th>Пик онлайн</th></tr>
      ${st.days.slice().reverse().map((d) => `<tr><td>${dm(d.d)}</td><td>${d.reg}</td><td>${back(d.d1, d.reg)}</td><td>${back(d.d7, d.reg)}</td><td>${d.peak}</td></tr>`).join('')}</table>`)}
    ${aSec('💰 Золото за 30 дней', `<div class="stiles">${tile(g.in, 'поступило')}${tile(g.out, 'потрачено')}</div>
      <div class="ssub">На что тратят</div>
      ${g.spent.length ? g.spent.map((x) => `<div class="shbar"><span>${esc(x.k)}</span><i><b style="width:${x.sum / gmax * 100}%"></b></i><em>${fmtFull(x.sum)} · ${x.n} раз</em></div>`).join('') : '<p class="small">Трат пока не было.</p>'}
      <div class="ssub">Откуда пришло</div>
      ${g.got.length ? g.got.map((x) => `<div class="srow"><span>${esc(x.k)}</span><b>${fmtFull(x.sum)}</b></div>`).join('') : '<p class="small">Поступлений не было.</p>'}
      <div class="stwo"><div><div class="ssub">Больше всех потратили</div>${g.spenders.map((x) => `<div class="srow"><span>${esc(x.login)}</span><b>${fmtFull(x.sum)}</b></div>`).join('') || '<p class="small">—</p>'}</div>
      <div><div class="ssub">Больше всех получили</div>${g.buyers.map((x) => `<div class="srow"><span>${esc(x.login)}</span><b>${fmtFull(x.sum)}</b></div>`).join('') || '<p class="small">—</p>'}</div></div>`)}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ssel],[data-astats]'); if (!b) return;
  if (b.dataset.astats !== undefined) { S.adm.statSel = null; return send({ t: 'admin', op: 'stats' }); }
  const [id, i] = b.dataset.ssel.split(':'); S.adm.statSel = S.adm.statSel && S.adm.statSel.id === id && S.adm.statSel.i === Number(i) ? null : { id, i: Number(i) }; refreshSheet();
});

// ---------- 🚨 Подозрительное (server/src/anomaly.js): резкие скачки армии, золота, лояльности, ресурсов ----------
const ALERT_IC = { army: '⚔', gold: '💰', royal: '👑', res: '📦' };
function admAlertsHtml(l) {
  const intro = '<p class="small">Раз в 10 минут сервер сравнивает каждого игрока с прошлым замером. Сюда попадает то, что нельзя объяснить игрой: армия выросла больше, чем обучено и взято из Кладовой; золото пришло не от администрации или изменилось мимо журнала; лояльность населения растёт быстрее правил; ресурсов больше, чем вмещает Склад. Ваши действия в админке тревогу не вызывают.</p>';
  if (!l) return aSec('🚨 Подозрительное', `${intro}<p class="small">Загрузка…</p>`);
  return aSec('🚨 Подозрительное', `${intro}
    ${l.length ? `<div class="alist">${l.map((x) => `<div class="alrt ${x.seen ? '' : 'new'}"><i>${ALERT_IC[x.kind] || '⚠'}</i><div><b>${esc(x.text)}</b><small>${esc(x.why)}</small>
      <span>${fmtDate(x.at)} · <button class="lnk" data-apick="${esc(x.login)}">${esc(x.login)}</button></span></div></div>`).join('')}</div>
      ${aAct('Очистить список', 'Удалить все записи (новые появятся при следующих проверках).', aBtn2('alertsclear', 'Очистить', 'data-confirm="Очистить список подозрительного?"', 'danger'))}`
    : '<p class="parch-note">Ничего подозрительного. Проверка идёт каждые 10 минут.</p>'}`);
}

// ---------- 🔒 Безопасность (server/src/secwatch.js): подозрительные IP — подбор паролей, поиск дыр, флуд ----------
function admSecHtml(d) {
  const intro = '<p class="small">Адреса, с которых было подозрительное: подбор паролей (особенно к Вашему аккаунту), поиск уязвимостей на сайте (.php, .env, wp-admin, обход папок), попытки отправить файл, флуд, подделанные запросы. Красные — свежие с прошлого просмотра. Вход на сам сервер (SSH) сюда не попадает — его смотрят командой <code>lastb</code>.</p>';
  if (!d) return aSec('🔒 Безопасность', `${intro}<p class="small">Загрузка…</p>`);
  const danger = (x) => x.kinds.some((k) => ['admin', 'probe', 'upload'].includes(k.k));
  const row = (x) => `<div class="alrt ${x.fresh && danger(x) ? 'new' : ''}"><i>${danger(x) ? '⛔' : '⚠'}</i><div>
      <b>${esc(x.ip)}${x.ip === d.me ? ' <span class="ok">(это Вы)</span>' : ''}${x.banned ? ' <span class="bad">[заблокирован]</span>' : ''}</b>
      <small>${x.kinds.map((k) => `${esc(k.t)} ×${k.v}`).join(' · ')}</small>
      <small class="muted">${x.samples.map(esc).join('<br>')}</small>
      <span>первый раз ${fmtDate(x.first)} · последний ${fmtDate(x.last)}</span>
      ${x.ip === d.me ? '' : x.banned ? `<button class="btn small" data-ipunban="${esc(x.ip)}">Разблокировать</button>` : `<button class="btn small danger" data-ipban="${esc(x.ip)}" data-why="${esc(x.kinds.map((k) => k.t).join(', '))}">Заблокировать IP</button>`}</div></div>`;
  return `${aSec('🔒 Безопасность', `${intro}<p class="small">Ваш адрес сейчас: <b>${esc(d.me || '?')}</b> — его заблокировать нельзя. Осторожно: у мобильного интернета один адрес бывает у многих людей — блокировка закроет игру им всем.</p>
      ${d.list.length ? `<div class="alist">${d.list.map(row).join('')}</div>` : '<p class="parch-note">Пока ничего подозрительного.</p>'}
      <button class="btn small" data-asec>↻ Обновить</button> ${aBtn2('secclear', 'Очистить журнал', 'data-confirm="Очистить журнал адресов? Блокировки останутся."', 'danger')}`)}
    ${aSec('⛔ Заблокированные адреса', `${d.bans.length ? d.bans.map((b) => `<div class="srow"><span><b>${esc(b.ip)}</b> · ${fmtDate(b.at)}${b.why ? ` · ${esc(b.why)}` : ''}</span><button class="btn small" data-ipunban="${esc(b.ip)}">Снять</button></div>`).join('') : '<p class="small">Нет.</p>'}
      <form class="chatform" data-aform="ipban"><input name="ip" placeholder="IP вручную, например 1.2.3.4" autocomplete="off" required><button class="btn small danger">Заблокировать</button></form>`)}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ipban],[data-ipunban],[data-asec]'); if (!b) return;
  if (b.dataset.asec !== undefined) return send({ t: 'admin', op: 'sec' });
  if (b.dataset.ipban) { if (!confirm(`Заблокировать ${b.dataset.ipban}? Сайт и игра для этого адреса закроются.`)) return; send({ t: 'admin', op: 'ipban', target: b.dataset.ipban, why: b.dataset.why }); }
  if (b.dataset.ipunban) send({ t: 'admin', op: 'ipunban', target: b.dataset.ipunban });
  setTimeout(() => send({ t: 'admin', op: 'sec' }), 200);
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-aform="ipban"]'); if (!f) return; e.preventDefault(); e.stopImmediatePropagation();
  if (!confirm(`Заблокировать ${f.ip.value.trim()}?`)) return;
  send({ t: 'admin', op: 'ipban', target: f.ip.value.trim(), why: 'вручную' }); f.ip.value = ''; setTimeout(() => send({ t: 'admin', op: 'sec' }), 200);
}, true);
