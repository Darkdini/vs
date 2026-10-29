'use strict';
// Админ-панель (только для admin): отдельное окно со всеми командами сервера (server/src/admin.js).
// Цель команд — игрок из поля «Игрок» (пусто — вы сами); галочка «все замки» — над всеми его замками.

S.adm = { login: '', all: true, players: null, player: null, tab: 'player' };
const aNum = (name, value, ph) => `<input class="anum" type="number" inputmode="numeric" data-an="${name}" value="${value}" placeholder="${ph}">`;

// Разделы: Игрок (поиск, карточка, пароли, наказания) · Выдать (монеты, ресурсы, замки, армия) · Модерация (модераторы, мульты, жалобы) · Мир (новости, рассылки, события).
// У каждого действия — короткое описание; одно действие — в одном месте.
const ADM_TABS = [['player', '👤 Игрок'], ['give', '🎁 Выдать'], ['mod', '🛡 Модерация'], ['world', '🌍 Мир'], ['stats', '📊 Статистика'], ['pay', '⭐ Платежи'], ['alerts', '🚨 Тревоги'], ['sec', '🔒 Защита'], ['test', '🧪 Тест']];
// заявки старших модераторов: кого предлагают в модераторы (server/src/smod.js) — принять или отклонить
const modReqSec = (a) => { const l = (a.mods && a.mods.reqs) || [];
  return aSec(`📝 Заявки в модераторы${l.length ? ` (${l.length})` : ''}`, !a.mods ? '<p class="small">Загрузка…</p>' : l.length ? l.map((r) => `<div class="acard"><b>${esc(r.login)}</b>${r.online ? ' · в игре' : ''}
    <p class="small">Предлагает: ${esc(r.by)} (старший модератор), ${fmtDate(r.at)}<br>Почему: ${esc(r.why)}<br>В игре ${r.days} дн., нарушений: ${r.violations}${r.banned ? ' · <b>заблокирован</b>' : ''}</p>
    <div class="acrow"><button class="btn small primary" data-amodreq="${r.id}" data-ok="1">Принять</button><button class="btn small danger" data-amodreq="${r.id}" data-ok="0">Отклонить</button></div></div>`).join('')
    : '<p class="small">Заявок нет. Старший модератор предлагает игрока в модераторы — заявка появится здесь.</p>'); };
// строка действия: название и пояснение слева, поле и кнопка справа
const aAct = (title, desc, controls, wide = false) => `<div class="aact ${wide ? 'wide' : ''}"><div class="aact-t"><b>${title}</b><small>${desc}</small></div><div class="aact-c">${controls}</div></div>`;
const aBtn2 = (op, text, extra = '', cls = '') => `<button class="btn small ${cls}" data-adm="${op}" ${extra}>${text}</button>`;
// «Золото всем игрокам» — на вкладках «Выдать» (сверху) и «Мир»
const goldAllLog = () => { const g = S.adm.goldAll; if (!g) { if (!S.adm.goldAllAsked) { S.adm.goldAllAsked = true; send({ t: 'admin', op: 'goldallget' }); } return ''; }
  return `${g.msg ? `<div class="smnote ok">✔ ${esc(g.msg)}</div>` : ''}${g.last.length ? `<p class="small"><b>Последние раздачи:</b><br>${g.last.map((x) => `${fmtDate(x.at)} — по ${x.n} зол. «${esc(x.why)}», игроков: ${x.players}`).join('<br>')}</p>` : '<p class="small">Раздач ещё не было.</p>'}`; };
// «Премиум всем игрокам» — рядом с «Золото всем»: срок на выбор (кнопки или число), у кого премиум есть — продлится
const premAllLog = () => { const g = S.adm.premAll; if (!g) { if (!S.adm.premAllAsked) { S.adm.premAllAsked = true; send({ t: 'admin', op: 'premallget' }); } return ''; }
  return `${g.msg ? `<div class="smnote ok">✔ ${esc(g.msg)}</div>` : ''}${g.last.length ? `<p class="small"><b>Последние раздачи:</b><br>${g.last.map((x) => `${fmtDate(x.at)} — на ${x.days} дн. «${esc(x.why)}», игроков: ${x.players}`).join('<br>')}</p>` : '<p class="small">Раздач ещё не было.</p>'}`; };
const PREM_ALL = () => { const pd = S.adm.premDays || 3; // выбранный срок помнится, пока окно перерисовывается
  return aSec('👑 Премиум всем игрокам', `<p class="small">Каждому живому игроку (в игре от 3 дней, заходил за последние 30 дней, не заблокирован) — Премиум Завоеватель на выбранный срок; у кого уже есть — продлится. Кто в игре — увидит сразу, остальным скажет советник при входе.</p><form class="stack" data-aform="premall">
  <div class="apdays">${[1, 3, 7, 14, 30].map((d) => `<button type="button" class="btn small${d === pd ? ' on' : ''}" data-apdays="${d}">${d} ${plural(d, 'день', 'дня', 'дней')}</button>`).join('')}</div>
  <input class="anum" name="days" type="number" inputmode="numeric" min="1" max="30" value="${pd}" placeholder="Сколько дней (1–30)"><input name="why" maxlength="100" value="Подарок от администрации" placeholder="За что (видно игрокам)"><button class="btn primary">Выдать всем</button></form>${premAllLog()}`); };
// «🏚 Ничейные замки» (server/src/nobody.js): замки заброшенных игроков — где, бунт, чьи были; «Забросить» — в карточке игрока
const NOBODY_SEC = () => {
  const d = S.adm.nobody;
  if (!d) { if (!S.adm.nobodyAsked) { S.adm.nobodyAsked = true; send({ t: 'admin', op: 'nobodyview' }); } return aSec('🏚 Ничейные замки', '<p class="small">Загрузка…</p>'); }
  return aSec(`🏚 Ничейные замки${d.castles.length ? ` (${d.castles.length})` : ''}`, `<p class="small">Замки игроков, которых Вы забросили (Игрок → «Забросить замки»). Их может захватить любой: победы с Бунтарями, бунт +15% за каждую.</p>
    ${d.castles.length ? `<div class="rlist">${d.castles.map((c) => `<div class="rrow"><span class="rn"><b>X:${c.x} Y:${c.y}</b><small>был у ${esc(c.was || '?')}${c.at ? ` · ${fmtDate(c.at)}` : ''} · бунт ${c.riot}%</small></span><span class="rv">${fmtFull(c.rating)}</span>
      <button class="btn small" data-goworld="${c.x},${c.y}">карта</button></div>`).join('')}</div>` : '<p class="small">Ничейных замков на карте нет.</p>'}
    ${d.log.length ? `<p class="small"><b>Заброшены:</b><br>${d.log.map((x) => `${fmtDate(x.at)} — ${esc(x.login)}, замков: ${x.castles.length}`).join('<br>')}</p>` : ''}`);
};
// «⚔ Боевой ранг: сезоны» (server/src/battlerank.js): раз в календарный месяц — итоги и новый сезон (ранги у всех с нуля)
const BRSEASON_SEC = () => {
  const d = S.adm.brs, title = '⚔ Боевой ранг: сезоны';
  if (!d) { if (!S.adm.brsAsked) { S.adm.brsAsked = true; send({ t: 'admin', op: 'brseason' }); } return aSec(title, '<p class="small">Загрузка…</p>'); }
  return aSec(title, `${d.msg ? `<div class="smnote ok">✔ ${esc(d.msg)}</div>` : ''}
    <p class="small">Идёт сезон <b>${d.n}</b> — с ${fmtDay(d.start)}. В рейтинге игроков: <b>${fmtFull(d.players)}</b>.${d.top.length ? `<br>Лидеры: ${d.top.map((x) => `${x.place}. <b>${esc(x.login)}</b> — ${x.idx + 1}. ${esc(x.title)} (${fmtFull(x.pts)})`).join('; ')}.` : ''}</p>
    <p class="small">Новый сезон: у всех игроков ранги и очки с нуля (и бонус ранга), сундуки за ранги можно получить снова. Несобранные сундуки уйдут игрокам в Кладовую (придёт письмо), лучший ранг останется рекордом, лучшие 10 — в «Топ» → «Прошлые сезоны». Начать можно раз в календарный месяц.</p>
    ${d.wait ? `<p class="small">Следующий сезон можно начать с <b>${esc(d.waitDay)}</b> (по Москве).</p>` : aBtn2('brseasonnew', 'Подвести итоги и начать новый сезон', 'data-confirm="Начать новый сезон боевого ранга? У всех игроков ранги и очки начнутся с нуля."', 'danger')}`);
};
// «🏅 Медали» — медали для красоты (server/src/honors.js): вручить по никам или всем тестерам, список награждённых — забрать
const HONOR_SEC = () => {
  const d = S.adm.honor;
  if (!d) { if (!S.adm.honorAsked) { S.adm.honorAsked = true; send({ t: 'admin', op: 'honorview' }); } return aSec('🏅 Медали', '<p class="small">Загрузка…</p>'); }
  return aSec('🏅 Медали', `${d.msg ? `<div class="smnote ok">✔ ${esc(d.msg)}</div>` : ''}${d.list.map((h) => `<div class="honadm"><img src="${GFX}${h.img}" alt=""><div><b>${esc(h.name)}</b><small>${esc(h.desc)}. Видна в профиле в строке «Звание», бонусов не даёт. Игроку придёт уведомление.</small></div></div>
    <form class="chatform" data-aform="honorgive" data-id="${h.id}"><input name="nicks" placeholder="Ники через запятую" autocapitalize="none" autocomplete="off" value="${esc(S.adm.login || '')}"><button class="btn primary small">Вручить</button></form>
    ${h.testersLeft ? `<button class="pbar" data-ahonall="${h.id}">Вручить всем тестерам (${h.testersLeft})</button>` : ''}
    <p class="small"><b>Награждены: ${h.who.length}</b></p>
    ${h.who.map((w) => `<div class="arow"><span><b>${esc(w.login)}</b>${w.tester ? ' · тестер' : ''} · ${fmtDate(w.at)}</span><button class="btn small" data-ahontake="${h.id}" data-login="${esc(w.login)}">Забрать</button></div>`).join('')}`).join('<hr>')}`);
};
const GOLD_ALL = () => aSec('🎁 Золото всем игрокам', `<p class="small">Каждому живому игроку (в игре от 3 дней, заходил за последние 30 дней, не заблокирован) — золото в Казну и сообщение в игре.</p><form class="stack" data-aform="goldall"><input class="anum" name="n" type="number" inputmode="numeric" min="1" max="1000" value="5" placeholder="Сколько каждому"><input name="why" maxlength="100" value="Подарок от администрации" placeholder="За что (видно игрокам)"><button class="btn primary">Выдать всем</button></form>${goldAllLog()}`);
// «🏦 Казна альянса» (server/src/admin.js allygold): казна пополняется только отдельно — покупкой за звёзды Telegram или здесь;
// свои монеты игроки туда не переводят
const ALLY_GOLD = () => aSec('🏦 Казна альянса', `<p class="small">Казна альянса пополняется только отдельно: покупкой за звёзды Telegram (кнопки в окне «Казна Альянса») или здесь. Свои монеты игроки туда не переводят, игрокам казна не выдаётся — тратится только на медали и подарки участникам. С минусом — списать.</p><form class="stack" data-aform="allygold"><input name="tag" maxlength="5" placeholder="Тег альянса" autocapitalize="characters" autocomplete="off" required><input class="anum" name="n" type="number" inputmode="numeric" placeholder="Сколько монет" required><button class="btn primary">Пополнить казну</button></form>`);
// «⚔ Правила боя (проба)» (server/src/army.js newBattle, battleCompare): новые правила включаются и выключаются для всех боёв;
// «Сравнить бой» — тот же бой по прежним и по новым правилам, в игре ничего не меняется
const BATTLE_RULES = 'Кузница и Школа магии — у всех воинов до 20 уровня по каждому параметру; тараны ломают Забор, только если нападение победило; удача нападающего ±5% (было ±10%).';
const battleCmpHtml = (c) => {
  const n = (v) => fmtFull(Math.round(v || 0)), row = (t, f) => `<tr><th>${t}</th><td>${f(c.old)}</td><td>${f(c.new)}</td></tr>`;
  return `<p class="small"><b>${esc(c.att)}</b> → <b>${esc(c.def)}</b>: ${c.mission === 'raid' ? 'набег' : 'нападение'}${c.general ? ' с генералом' : ''}</p>
    <table class="bcmp"><tr><th></th><th>Прежние</th><th>Новые</th></tr>
    ${row('Исход', (r) => (r.win ? '<b class="bgood">победа атаки</b>' : '<b class="bbad">атака отбита</b>'))}
    ${row('Сила нападающих / защитников', (r) => `${n(r.ap)} / ${n(r.dp)}`)}
    ${row('Боевой дух', (r) => `${r.morale}%`)}
    ${row('Нападающий потерял', (r) => `${n(r.aLost)} из ${n(r.sent)}${r.wounded ? `<br><small>в Лазарет ${n(r.wounded)}</small>` : ''}${r.saved ? `<br><small>лекарь спас ${n(r.saved)}</small>` : ''}`)}
    ${row('Защитник потерял', (r) => `${n(r.dLost)} из ${n(r.had)}${r.guests ? `<br><small>подкреплений было ${n(r.guests)}</small>` : ''}${r.healed ? `<br><small>выздоровели дома ${n(r.healed)}</small>` : ''}${r.dWounded ? `<br><small>в Лазарет ${n(r.dWounded)}</small>` : ''}`)}
    ${row('Забор', (r) => (r.wall0 === r.wall ? `${r.wall0}` : `${r.wall0} → ${r.wall}`))}</table>`;
};
const BATTLE_SEC = () => {
  const b = S.adm.battle;
  if (!b) { if (!S.adm.battleAsked) { S.adm.battleAsked = true; send({ t: 'admin', op: 'battlerules' }); } return aSec('⚔ Правила боя (проба)', '<p class="small">Загрузка…</p>'); }
  return aSec('⚔ Правила боя (проба)', `<p class="small">Новые правила: ${BATTLE_RULES} Включаются сразу для всех боёв, вернуть прежние — одной кнопкой.</p>
    <div class="smnote ${b.on ? 'ok' : ''}">Сейчас действуют: <b>${b.on ? 'новые правила' : 'прежние правила'}</b>${b.at ? ` · с ${fmtDate(b.at)}` : ''}</div>
    <button class="pbar" data-abattle="${b.on ? 0 : 1}">${b.on ? 'Вернуть прежние правила' : 'Включить новые правила'}</button>
    <p class="small"><b>Сравнить бой</b> — вся армия столицы первого игрока нападает на столицу второго (с его подкреплениями): итог по прежним и по новым правилам, без удачи. В игре ничего не меняется.</p>
    <form class="stack" data-aform="battlecmp"><input name="att" placeholder="Нападающий (ник)" autocapitalize="none" autocomplete="off" value="${esc(b.attNick || '')}" required><input name="def" placeholder="Защитник (ник)" autocapitalize="none" autocomplete="off" value="${esc(b.defNick || '')}" required>
      <div class="combo"><select name="mission"><option value="attack">Нападение</option><option value="raid" ${b.mission === 'raid' ? 'selected' : ''}>Набег</option></select></div>
      <label class="check"><input type="checkbox" name="general" ${b.noGen ? '' : 'checked'}> с генералом</label><button class="btn primary">Сравнить</button></form>
    ${b.cmp ? battleCmpHtml(b.cmp) : ''}`);
};
// «🛠 Закрыть игру» (технические работы, server/src/closedtest.js) — вверху Админ-панели, на любой вкладке:
// игрокам — заглушка «сервер временно не работает», входит только администратор; на 8 или 24 часа — потом игра открывается сама
const hoursTxt = (h) => `${h} ${plural(h, 'час', 'часа', 'часов')}`;
const MAINT_BAR = () => {
  const m = S.adm.maint;
  if (!m) { if (!S.adm.maintAsked) { S.adm.maintAsked = true; send({ t: 'admin', op: 'maint' }); } return ''; }
  if (!m.on) return `<div class="maintbar"><div class="mlabel">🛠 Закрыть игру для игроков:</div><div class="mbtns">${(m.hours || [8, 24]).map((h) => `<button class="pbar" data-amaint="${h}">на ${hoursTxt(h)}</button>`).join('')}</div></div>`;
  return `<div class="maintbar"><div class="smnote">🛠 <b>Игра закрыта для игроков</b>${m.at ? ` · с ${fmtDate(m.at)}` : ''}${m.until ? `<br>Откроется сама: <b>${fmtDate(m.until)}</b>` : ''}<br>Они видят: «${esc(m.msg)}»<br>Мир при этом идёт: армии в пути дойдут.</div>
    <button class="pbar" data-amaint="0">Открыть игру сейчас</button>
    <p class="small">Если Вы выйдете: войти можно адресом игры с <b>#admin</b> в конце или пятью нажатиями на логотип.</p></div>`;
};
const aSec = (title, body) => `<div class="acard"><div class="cwname">${title}</div>${body}</div>`;
function adminHtml() {
  const a = S.adm, tab = ADM_TABS.some(([k]) => k === a.tab) ? a.tab : 'player';
  const who = a.login ? `игрок <b>${esc(a.login)}</b> <button class="btn small" data-adm-self>× сбросить</button>` : '<b>вы (Советник)</b>';
  const head = `${ribbon('Админ-панель')}${MAINT_BAR()}
    <div class="atabs">${ADM_TABS.map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" data-atab="${k}">${t}${k === 'mod' && (S.st.user.multiNew || S.st.user.modReqNew) ? ` <b class="abadge">${(S.st.user.multiNew || 0) + (S.st.user.modReqNew || 0)}</b>` : ''}${k === 'alerts' && S.st.user.alertsNew ? ` <b class="abadge">${S.st.user.alertsNew}</b>` : ''}${k === 'pay' && S.st.user.payNew ? ` <b class="abadge">${S.st.user.payNew}</b>` : ''}${k === 'sec' && S.st.user.secNew ? ` <b class="abadge">${S.st.user.secNew}</b>` : ''}</button>`).join('')}</div>`;
  const target = `<div class="atarget">Кому: ${who}<label class="check"><input type="checkbox" data-an="all" ${a.all ? 'checked' : ''}> во все замки игрока</label></div>`;
  const T = {
    player: () => `${aSec('Найти игрока', `<p class="small">Введите ник (можно часть) или нажмите «Топ-100». Нажмите на игрока — откроется его карточка.</p>
      <form class="chatform" data-aform="find"><input name="q" placeholder="Ник игрока" autocapitalize="none" value="${esc(a.q || '')}"><button class="btn primary small">Найти</button></form>
      <button class="pbar" data-adm="players">Топ-100 игроков</button>
      ${a.players ? `<div class="rlist">${a.players.map((p) => `<button class="rrow" data-apick="${esc(p.login)}"><span class="rn"><b>${esc(p.login)}${p.admin ? ` <img class="admbadge s" src="${GFX}admin_badge_s.png" alt="">` : p.mod ? ` <img class="admbadge s" src="${GFX}chat/moder.png" alt="">` : ''}${p.banned ? ' <span class="bad">[бан]</span>' : ''}</b>
        <small>${esc(p.race)} · замков ${p.castles} · монет ${fmtFull(p.gold)} · ${p.online ? 'в игре' : `был ${fmtDate(p.lastSeen)}`}</small></span><span class="rv">${fmtFull(p.rating)}</span></button>`).join('')}</div>` : ''}`)}
      ${a.player ? playerCard(a.player) : a.login ? '<p class="parch-note">Загрузка карточки…</p>' : ''}`,
    give: () => `${GOLD_ALL()}${PREM_ALL()}${ALLY_GOLD()}${HONOR_SEC()}${target}
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
        ${aAct('Бунт в замке', 'Бунт в активном замке, 0–100% (100% — замок можно захватить).', `${aNum('loyalty', 0, '0–100')}${aBtn2('loyalty', 'Задать', 'data-arg="loyalty:value"')}`)}`)}
      ${aSec('⚔ Армия и генерал', `
        ${aAct('Войска', 'Выдать или забрать: выбрать замок и сколько каких юнитов — юниты расы игрока и особые (уникальные, нежить, снятые с найма).', `<form class="chatform" data-aform="armyinfo"><input type="hidden" name="login" value="${esc(a.login || S.st.user.login)}"><button class="btn small primary">Открыть список</button></form>`)}
        ${a.ga ? armyForm(a.ga) : ''}
        ${aAct('Убрать войска', 'Все войска в замках игрока исчезнут.', aBtn2('noarmy', 'Убрать', 'data-confirm="Убрать все войска?"', 'danger'))}
        ${aAct('Генерал', 'Генерал нужного уровня (1–500) в активном замке.', `${aNum('general', 100, 'уровень')}${aBtn2('general', 'Выдать', 'data-arg="general:level"')}`)}
        ${aAct('Артефакты', '5 легендарных артефактов в Сокровищницу.', aBtn2('arts', 'Выдать'))}
        ${aAct('Снаряжение генерала', 'Полный набор вещей всех редкостей в Оружейную.', aBtn2('gear', 'Выдать'))}`)}`,
    mod: () => `${modReqSec(a)}${aSec('⭐ Старшие модераторы', `<p class="small">Старший модератор: панель «Модерация» в Меню — блокировка на 1–7 дней, сброс ника, аватара и замков, альянсы; модераторов предлагает заявкой — Вы принимаете или отклоняете (раздел выше), снимает сразу. Администратора не видит и не трогает.</p>
      ${!a.mods ? '<p class="small">Загрузка…</p>' : (a.mods.smods || []).length ? a.mods.smods.map((m) => `<div class="arow"><span><b>${esc(m.login)}</b>${m.online ? ' · в игре' : ''}</span><button class="btn small" data-asmod="${esc(m.login)}">Снять</button></div>`).join('') : '<p class="small">Старших модераторов пока нет.</p>'}
      <form class="chatform" data-aform="addsmod"><input name="login" placeholder="Ник игрока" autocapitalize="none" required><button class="btn primary small">Назначить</button></form>`)}
      ${aSec('🛡 Модераторы форума', `<p class="small">Модератор удаляет сообщения и темы на форуме и в чате, может запретить игроку писать.</p>
      ${!a.mods ? '<p class="small">Загрузка…</p>' : a.mods.mods.length ? a.mods.mods.map((m) => `<div class="arow"><span><b>${esc(m.login)}</b>${m.online ? ' · в игре' : ''}</span><button class="btn small" data-amod="${esc(m.login)}">Снять</button></div>`).join('') : '<p class="small">Модераторов пока нет.</p>'}
      ${a.mods && a.mods.sections.length ? `<p class="small">Модераторы разделов (назначаются в Форум → Модераторы): ${a.mods.sections.map((x) => `${esc(x.name)} — ${x.mods.map(esc).join(', ')}`).join('; ')}</p>` : ''}
      <form class="chatform" data-aform="addmod"><input name="login" placeholder="Ник игрока" autocapitalize="none" required><button class="btn primary small">Назначить</button></form>`)}
      ${aSec('👥 Мульты', multiHtml(a.multis))}
      ${aSec('📮 Жалобы и сообщения об ошибках', `<p class="small">Жалобы из чата и «Сообщить об ошибке» теперь в разделе МАСТЕРА → «СВЯЗЬ»: там на них отвечают, игроку приходит отчёт.</p><button class="pbar" data-admlink>Открыть «СВЯЗЬ»</button>`)}`,
    world: () => `${aSec('📰 Новость', `<p class="small">Всем придёт фиолетовый конверт в верхней панели; новость останется в «Инфо → Новости».</p>${newsPubForm()}`)}
      ${BATTLE_SEC()}
      ${BRSEASON_SEC()}
      ${GOLD_ALL()}
      ${PREM_ALL()}
      ${ALLY_GOLD()}
      ${NOBODY_SEC()}
      ${aSec('✉ Письмо всем', `<p class="small">Личное письмо каждому игроку (в «Сообщения»).</p><form class="stack" data-aform="mailall"><input name="subject" placeholder="Тема письма" value="Сообщение администрации"><textarea name="text" rows="3" placeholder="Текст письма" required></textarea><button class="btn primary">Разослать всем</button></form>`)}
      ${aSec('💬 Объявление в чат', `<p class="small">Сообщение в общий чат с пометкой [Администрация].</p><form class="chatform" data-aform="chat"><input name="text" placeholder="Текст объявления" required><button class="btn primary small">В чат</button></form>`)}
      ${aSec('🐉 События', `
        ${aAct('Мировой босс', 'Вызвать босса на 48 часов (дракон, тролль, лич — по очереди). Текущий завершится.', aBtn2('boss', 'Вызвать', 'data-confirm="Вызвать мирового босса сейчас?"'))}
        ${aAct('Итоги месяца', 'Досрочно подвести Зал Славы и выдать награды топ-3.', aBtn2('season', 'Подвести', 'data-confirm="Подвести итоги месяца досрочно?"'))}`)}
      ${aSec('🛠 Обслуживание', `
        ${aAct('Лагеря на карте', 'Вернуть ресурсы и охрану всем разграбленным лагерям.', aBtn2('npc', 'Восстановить'))}
        ${aAct('Отчёты', 'Удалить все боевые отчёты на сервере.', aBtn2('reports', 'Очистить', 'data-confirm="Удалить все отчёты всех игроков?"', 'danger'))}
        ${aAct('Боты', 'Заселить карту замками-ботами (для проверки нагрузки).', `${aNum('bots', 100, 'сколько')}${aBtn2('bots', 'Заселить', 'data-arg="bots:n" data-confirm="Заселить карту ботами?"')}`)}
        ${aAct('Убрать ботов', 'Удалить всех ботов с карты вместе с их замками.', aBtn2('botsdel', 'Убрать всех', 'data-confirm="Удалить всех ботов с карты?"', 'danger'))}`)}`,
    stats: () => admStatsHtml(a.stats),
    pay: () => admPayHtml(a.pay),
    alerts: () => admAlertsHtml(a.alerts),
    sec: () => admSecHtml(a.sec),
    test: () => admTestHtml(a.test),
  };
  return head + T[tab]();
}
// «есть N» — дома в выбранном замке (замковая армия, «Резерв», отряды), «в походе M» — армии, ушедшие из него (сервер: admin.js armyinfo)
const gaCastle = (g, id) => g.castles.find((c) => c.id === id) || g.castles[0] || { home: {}, away: {} };
const gaCount = (c, id) => `есть ${fmtFull((c.home || {})[id] || 0)}${(c.away || {})[id] ? ` · в походе ${fmtFull(c.away[id])}` : ''}`;
const gaUnit = (g, c) => (id) => { const u = unitById(id); return u ? `<label class="gaunit"><img src="${unitSrc(u, g.race)}" alt=""><span>${esc(u.name)}<small class="gahave" data-gah="${id}">${gaCount(c, id)}</small></span><input type="number" min="0" inputmode="numeric" name="u${id}" placeholder="0"></label>` : ''; };
// сколько каких юнитов в полях формы (other — войска не из списка выдачи: их можно только забрать)
const gaPicked = (g, f, ids = [...g.units, ...(g.special || []), ...(g.other || [])]) => {
  const units = {}; for (const id of ids) { const i = f[`u${id}`], v = i ? Math.floor(Number(i.value)) : 0; if (v > 0) units[id] = v; } return units;
};
function armyForm(g) {
  const c = gaCastle(g, S.adm.gaCastle); // выбранный замок помнится, пока открыт список (после «Выдать» / «Забрать» список обновляется)
  return `<form data-aform="givearmy" class="acard2"><p class="small">${esc(g.login)} · раса <b>${esc(g.raceName)}</b>. Пустое поле — не трогать.</p>
    <div class="arow"><span>Замок:</span><select name="castle">${g.castles.map((k) => `<option value="${k.id}"${k.id === c.id ? ' selected' : ''}>${esc(k.name)} (${k.x}:${k.y})${k.capital ? ' — столица' : ''}</option>`).join('')}</select></div>
    <div class="gaunits gamain">${g.units.map(gaUnit(g, c)).join('')}</div>
    ${(g.special || []).length ? `<p class="small gasub">Особые — не тренируются: уникальные воины заданий, нежить из сундуков, снятые с найма.</p>
    <div class="gaunits">${g.special.map(gaUnit(g, c)).join('')}</div>` : ''}
    ${(g.other || []).length ? `<p class="small gasub">Другие войска в замках игрока (например, завербованные в Темнице) — их можно только забрать.</p>
    <div class="gaunits">${g.other.map(gaUnit(g, c)).join('')}</div>` : ''}
    <div class="gabtns"><button type="button" class="btn small" data-gafill="100">обычным по 100</button><button type="button" class="btn small" data-gafill="1000">обычным по 1000</button><button type="button" class="btn small" data-gafill="">очистить</button></div>
    <div class="gabtns"><button type="button" class="btn small" data-gafill="all">всё, что есть в замке</button></div>
    <button class="btn primary" style="width:100%;margin-top:8px">Выдать войска</button>
    <button type="button" class="btn danger" data-gatake style="width:100%;margin-top:6px">Забрать войска</button>
    <p class="small">Забираются войска из замковой армии, «Резерва» и отрядов выбранного замка; армии в походе — когда вернутся. Генерал и торговцы не забираются. Игроку придёт сообщение.</p></form>`;
}
// «Мульты»: только «один телефон — несколько аккаунтов» (у каждого телефона в игре свой номер) и подсказки «то же железо и та же сеть»;
// общий Wi‑Fi и мобильный интернет мультом не считаются. «Не мульт» скрывает группу, пока в ней не появится новый аккаунт
function multiHtml(m) {
  const row = (u) => `<div class="mrow"><button class="rrow" data-apick="${esc(u.login)}"><span class="rn"><b>${esc(u.login)}${u.admin ? ` <img class="admbadge s" src="${GFX}admin_badge_s.png" alt="">` : ''}${u.banned ? ' <span class="bad">[бан]</span>' : ''}</b><small>был ${fmtDate(u.lastSeen)}</small></span><span class="rv">${fmtFull(u.rating)}</span></button>
    ${u.admin ? '' : `<button class="btn small ${u.banned ? '' : 'danger'}" data-mban="${esc(u.login)}" data-on="${u.banned ? 0 : 1}">${u.banned ? 'Разбан' : 'Бан'}</button>`}</div>`;
  const phone = (p) => (p ? [p.model || 'Телефон', p.app ? 'приложение' : p.browser || p.os].filter(Boolean).join(' · ') : 'Телефон (модель появится при следующем входе)');
  const grp = (g) => {
    const free = g.users.filter((u) => !u.banned && !u.admin).map((u) => u.login);
    return `<div class="mgroup ${g.kind === 'dev' ? 'strong' : ''}"><div class="mhead">${g.kind === 'dev' ? '📱' : '🔎'} ${esc(phone(g.phone))} · ${g.users.length} акк.${g.devBanned ? ' <span class="bad">[телефон в бане]</span>' : ''}</div>
      ${g.users.map(row).join('')}
      <div class="mact">${g.kind === 'dev' && free.length > 1 ? `<button class="btn small danger" data-mall="${esc(free.join(','))}">Бан всех (${free.length})</button>` : ''}
      ${g.dev ? `<button class="btn small ${g.devBanned ? '' : 'danger'}" data-mdev="${esc(g.dev)}" data-on="${g.devBanned ? 0 : 1}">${g.devBanned ? 'Разблокировать телефон' : 'Бан телефона'}</button>` : ''}
      ${g.users.length > 1 ? `<button class="btn small" data-mok="${esc(g.key)}">Не мульт</button>` : ''}</div></div>`;
  };
  const shown = m ? m.groups.filter((g) => !g.hidden) : [], dev = shown.filter((g) => g.kind === 'dev'), hint = shown.filter((g) => g.kind === 'hint'), hid = m ? m.groups.filter((g) => g.hidden) : [];
  return `<div class="bwline small">Мульт — несколько аккаунтов с <b>одного телефона</b>: у каждого телефона в игре свой номер, он хранится в самом телефоне. Общий Wi‑Fi и мобильный интернет мультом не считаются. Сервер никого не банит сам — решаете вы.</div>
    <button class="pbar" data-adm="multis">Проверить мультов</button>
    ${m ? `<div class="mhead">🔔 Оповещения</div>${m.log.length ? `<div class="mlog">${m.log.slice(0, 15).map((x) => `<div class="${x.fresh ? 'fresh' : ''}">${x.fresh ? '<b class="newtag">новое</b> ' : ''}<b>${esc(x.login)}</b> — тот же телефон, что у ${x.with.map(esc).join(', ')} <small>${fmtDate(x.at)}</small></div>`).join('')}</div>` : '<p class="parch-note">Пока тихо.</p>'}
      <div class="mhead">📱 Один телефон — несколько аккаунтов (${dev.length})</div>
      ${dev.length ? dev.map(grp).join('') : '<p class="parch-note">Мультов не найдено.</p>'}
      ${hint.length ? `<div class="mhead">🔎 Похоже на тот же телефон (${hint.length})</div><p class="small">Номера телефонов разные, но то же железо и та же сеть — возможно, один телефон после очистки данных или другой браузер. Проверьте сами: это только подсказка.</p>${hint.map(grp).join('')}` : ''}
      ${hid.length ? `<details class="mhid"><summary>Отмечены «Не мульт» (${hid.length})</summary>${hid.map((g) => `<div class="arow"><span>${g.kind === 'dev' ? '📱' : '🔎'} ${g.users.map((u) => esc(u.login)).join(', ')}</span><button class="btn small" data-munok="${esc(g.key)}">Вернуть</button></div>`).join('')}</details>` : ''}` : ''}`;
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
    ${x.sameDev.length ? `<div class="dwarn">⚠ С этого телефона входили: ${who(x.sameDev)}</div>` : ''}${x.sameFp.length ? `<div class="dwarn">🔎 Похоже на тот же телефон (то же железо и та же сеть): ${who(x.sameFp)}</div>` : ''}
    ${p.admin ? '' : `<button class="btn small ${x.banned ? '' : 'danger'}" data-mdev="${esc(x.dev)}" data-on="${x.banned ? 0 : 1}">${x.banned ? 'Разблокировать телефон' : '⛔ Бан телефона'}</button>`}</div>`;
  const full = d.devices.filter((x) => !x.old), old = d.devices.filter((x) => x.old);
  const oldRow = (x) => `<div class="doldrow ${x.banned ? 'ban' : ''}"><span>id ${esc(x.dev.slice(0, 10))} · ${fmtDate(x.last)}${x.sameDev.length ? ` · <span class="dwarn">⚠ ${who(x.sameDev)}</span>` : ''}</span>${p.admin ? '' : `<button class="btn small ${x.banned ? '' : 'danger'}" data-mdev="${esc(x.dev)}" data-on="${x.banned ? 0 : 1}">${x.banned ? 'Разбан' : 'Бан'}</button>`}</div>`;
  // «Вход в игру»: что мешает игроку войти — и кнопки, чтобы снять (server security.js accessCheck)
  // подробно: кто, когда и за что; для IP — что делали с этого адреса (журнал «Защиты»: нарушения и примеры запросов)
  const accInfo = (x) => { const L = x.log, rows = [x.at ? `Когда: <b>${fmtDate(x.at)}</b>` : '', x.by ? `Кто: <b>${esc(x.by)}</b>` : '', x.until ? `До: <b>${fmtDate(x.until)}</b>` : '',
    x.why ? `За что: <b>${esc(x.why)}</b>` : x.k === 'acc' || x.k === 'dev' ? 'За что: <i>причина не записана (бан был до 26.10)</i>' : ''].filter(Boolean);
    if (L) { rows.push(`Что делали с адреса (${fmtDate(L.first)} — ${fmtDate(L.last)}, всего ${L.n}): <b>${L.kinds.map((k) => `${esc(k.t)} ×${k.v}`).join(', ')}</b>`); if (L.samples.length) rows.push(`Примеры: ${L.samples.map((s) => `<code>${esc(s)}</code>`).join('<br>')}`); }
    return rows.length ? `<div class="accinfo">${rows.join('<br>')}</div>` : ''; };
  const accRow = (x) => `<div class="accrow"><span>⛔ ${esc(x.t)}${accInfo(x)}</span>${
    x.k === 'acc' ? `<button class="btn small" data-mban="${esc(p.login)}" data-on="0">Разблокировать</button>` : x.k === 'dev' ? `<button class="btn small" data-mdev="${esc(x.dev)}" data-on="0">Разблокировать</button>` : x.k === 'ip' ? `<button class="btn small" data-ipunban="${esc(x.ip)}">Разблокировать</button>` : ''}</div>`;
  const acc = d.access ? `<div class="mhead">Вход в игру</div>${d.access.length ? `<div class="dcard ban">${d.access.map(accRow).join('')}</div>` : '<div class="dcard accok">✅ Ничего не мешает войти: аккаунт, телефоны и IP-адреса не заблокированы.</div>'}` : '';
  return `${acc}<div class="mhead">Устройства (${d.devices.length})</div>${full.map(dev).join('') || '<p class="small">Подробностей пока нет — появятся при следующем входе игрока.</p>'}
    ${old.length ? `<div class="dcard"><div class="dhead">Старые входы (без подробностей)</div>${old.map(oldRow).join('')}</div>` : ''}
    <div class="mhead">IP-адреса</div><div class="small">Регистрация: <b>${esc(d.regIp || p.regIp || '—')}</b>${d.regIpBanned ? ' <span class="bad">[заблокирован]</span>' : ''}<br>${(d.ips || []).slice(0, 10).map((x) => `${esc(x.ip)}${x.banned ? ' <span class="bad">[заблокирован]</span>' : ''} <small>${fmtDate(x.at)}</small>`).join('<br>') || '—'}</div>
    ${d.sameIp && d.sameIp.length ? `<div class="small">🌐 Та же сеть (IP): ${who(d.sameIp)} — не доказательство: так бывает у семьи на одном Wi‑Fi и у абонентов одного оператора.</div>` : ''}`;
}
const PASS_BY = (b) => (b === 'reg' ? 'регистрация' : b === 'self' ? 'сменил сам' : b === 'server' ? 'сброс на сервере' : b === 'telegram' ? 'по коду из Telegram' : b === 'mail' ? 'по коду из письма' : String(b || '').startsWith('admin') ? `админ (${esc(String(b).slice(6))})` : 'до журнала');
function playerCard(p) {
  const pc = S.adm.passcheck && S.adm.passcheck.login === p.login ? S.adm.passcheck : null;
  return `<div class="acard"><div class="cwname">${esc(p.login)}${p.admin ? ` <img class="admbadge s" src="${GFX}admin_badge_s.png" alt="">` : ''}${p.banned ? ' <span class="bad">[заблокирован]</span>' : ''}</div>
    ${p.dev && p.dev.access && p.dev.access.length ? `<div class="accwarn">⛔ Вход закрыт: ${p.dev.access.map((x) => esc(x.t)).join('; ')}. Снять — ниже, в «Вход в игру».</div>` : ''}
    <div class="akv"><span>Ник в игре</span><b>${esc(p.login)}</b><span>Логин для входа</span><b>${esc(p.acct || '—')}</b><span>Email</span><b>${esc(p.email || '—')}${p.email ? (p.emailOk ? ' <span class="ok">✔ подтверждена</span>' : ' <small>(не подтверждена)</small>') : ''}</b>
      <span>Раса</span><b>${esc(p.race)}</b><span>Рейтинг</span><b>${fmtFull(p.rating)}</b><span>Монеты</span><b>${fmtFull(p.gold)}</b>
      <span>Регистрация</span><b>${fmtDate(p.created)}</b><span>Был в игре</span><b>${p.online ? 'сейчас' : fmtDate(p.lastSeen)}</b></div>
    ${(p.nickLog || []).length ? `<div class="small">Прежние ники: ${p.nickLog.map((x) => `${esc(x.from)} → ${esc(x.to)} <small>${fmtDate(x.at)}</small>`).join('; ')}</div>` : ''}
    <div class="ptiles g3a"><button class="ptile" data-cprof="${p.id}"><img src="${GFX}chat/profile.png" alt=""><span>Профиль и письмо</span></button>${p.castlesList[0] ? `<button class="ptile" data-goworld="${p.castlesList[0].x},${p.castlesList[0].y}"><img src="${GFX}world/castle1.png" alt=""><span>На карте</span></button>` : ''}
      <button class="ptile" data-ainsp="${esc(p.login)}"><img src="${GFX}shop/spy.png" alt=""><span>👁 Осмотр</span></button></div></div>
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
    ${aAct(p.banned ? 'Разблокировать' : 'Заблокировать', p.banned ? 'Снова пустить игрока в игру.' : 'Игрок не сможет войти, текущий вход прервётся.', p.banned ? aBtn2('unban', 'Разблокировать') : aBtn2('ban', 'Заблокировать', '', 'danger'))}
    ${aAct('Старший модератор', p.smod ? 'Сейчас старший модератор — можно снять.' : 'Модераторы, блокировка на 1–7 дней, сброс ника/аватара/замков, альянсы, мульты. Вас не видит и не тронет.', aBtn2('smod', p.smod ? 'Снять' : 'Назначить', `data-confirm="${p.smod ? 'Снять старшего модератора?' : 'Назначить старшим модератором?'}"`))}
    ${aAct('Модератор форума', p.mod ? 'Сейчас модератор — можно снять права.' : 'Удаление сообщений и бан в чате и на форуме.', aBtn2('mod', p.mod ? 'Снять' : 'Назначить', `data-confirm="${p.mod ? 'Снять права модератора?' : 'Назначить модератором форума?'}"`))}
    ${aAct('Аватар', 'Удалить картинку игрока (вместо неё — портрет расы).', aBtn2('noavatar', 'Удалить', 'data-confirm="Удалить аватар игрока?"'))}
    ${aAct('Репутация', 'Добавить или убавить (минус) очки репутации.', `${aNum('rep', 10, 'очков')}${aBtn2('rep', 'Изменить', 'data-arg="rep:n"')}`)}</div>
  <div class="acard"><div class="cwname">🏰 Замки игрока</div>
    <div class="rlist">${p.castlesList.map((c) => `<div class="rrow"><span class="rn"><b>${esc(c.name)}</b><small>X:${c.x} Y:${c.y} · бунт ${100 - c.loyalty}%</small></span><span class="rv">${fmtFull(c.rating)}</span>
      <button class="btn small" data-ainsp="${esc(p.login)}" data-cid="${c.id}">👁 осмотр</button><button class="btn small" data-goworld="${c.x},${c.y}">карта</button></div>
      <div class="acrow"><button class="btn small danger" data-adm="castlereset" data-cid="${c.id}" data-confirm="Сбросить замок «${esc(c.name)}» к стартовому виду? Здания, войска и ресурсы пропадут, место и имя останутся.">Сбросить замок</button>
      ${p.castlesList.length > 1 ? `<button class="btn small danger" data-adm="castledel" data-cid="${c.id}" data-confirm="Удалить замок «${esc(c.name)}» навсегда?">Удалить замок</button>` : ''}</div>`).join('')}</div>
    ${aAct('Переименовать', 'Новое имя активного замка игрока.', '<form class="chatform" data-aform="rename"><input name="name" placeholder="Имя замка" required><button class="btn small primary">Переименовать</button></form>', true)}
    ${aAct('Перенести', 'Переставить активный замок на свободную клетку карты.', '<form class="chatform" data-aform="move"><input name="x" type="number" placeholder="X" required><input name="y" type="number" placeholder="Y" required><button class="btn small primary">Перенести</button></form>', true)}
    ${aAct('Сменить расу', 'Юниты прежней расы пропадут.', `<select data-an="race">${S.cat.raceOrder.map((r) => `<option value="${r}">${esc(S.cat.races[r])}</option>`).join('')}</select>${aBtn2('race', 'Сменить', 'data-arg="race:race" data-confirm="Сменить расу? Юниты прежней расы пропадут."')}`)}
    ${aAct('Сброс на старт', 'Все замки, войска и постройки пропадут — один новый замок, как после регистрации.', aBtn2('reset', 'Сбросить', `data-confirm="Сбросить игрока ${esc(p.login)} к началу игры?"`, 'danger'))}
    ${p.admin ? '' : aAct('Забросить замки', 'Для давно не играющих — вместо бана. Все замки станут ничьими («Ничейный замок»): армия останется их защищать (походы вернутся домой), генерал пропадёт, постройки и ресурсы останутся. Захватить можно любой (столицы нет) — победами с Бунтарями, бунт +15% за каждую. Сам игрок исчезнет отовсюду, как при удалении.',
      aBtn2('abandon', 'Забросить', `data-confirm="Забросить замки игрока ${esc(p.login)}${p.online ? ' (сейчас в игре!)' : ` (не заходил ${Math.max(0, Math.floor((Date.now() - p.lastSeen) / 86400000))} дн.)`}? Замки (${p.castlesList.length}) станут ничьими, игрок удалится навсегда."`, 'danger'))}
    ${p.admin ? '' : aAct('Удалить игрока', 'Аккаунт и все замки — навсегда. Игрок пропадёт у всех: из друзей, альянса, брака; переписка с ним удалится, чужие подкрепления из его замков вернутся домой.', aBtn2('delete', 'Удалить', 'data-confirm="Удалить игрока и все его замки навсегда?"', 'danger'))}</div>
  <div class="acard">${devCard(p)}</div>`;
}

// ---------- «👁 Осмотр» (против жульничества): всё о замках и аккаунте игрока, только чтение (server/src/admin.js adminInspect) ----------
// открывается из карточки игрока (весь аккаунт или замок) и с карты мира (окно «Замок» — у админа плитка «Осмотр»)
function openInspect(arg) { S.adm.insp = null; S.adm.inspArg = arg; send({ t: 'admin', op: 'inspect', ...arg }); openSheet(admInspectWin); }
const INSP_MIS = { attack: 'Нападение', raid: 'Набег', scout: 'Разведка', trade: 'Торговля', reinforce: 'Подкрепление', expedition: 'Раскопки', settle: 'Освоение', rally: 'Созыв', rune: 'Сбор руны' };
const INSP_ST = { go: 'идёт', wait: 'ждёт выхода', stay: 'стоит', back: 'возвращается', dig: 'копает в Подземелье', found: 'нашёл артефакт, ждёт отзыва' };
const INSP_STAT = { loot: 'награблено', kills: 'убито в нападениях', defKills: 'убито в защите', arts: 'артефакты (очки)', expeds: 'экспедиций', trades: 'торговых походов', boost: 'пробуждений',
  genExp: 'опыт генерала', runes: 'рун собрано', ruins: 'осад руин', repGold: 'монет на репутацию', loyal: 'лояльность за дела', npcWins: 'побед над лагерями', stashTake: 'взято из Кладовой' };
const INSP_RAR = ['обычный', 'редкий', 'легендарный'];
function admInspectWin() {
  const d = S.adm.insp; if (!d) return `${ribbon('👁 Осмотр')}<p class="parch-note">Загрузка…</p>`;
  const kv = (k, v) => `<span>${k}</span><b>${v}</b>`;
  const ul = (l) => (l.length ? `${l.map((x) => `${esc(x.name)} <b>${fmtFull(x.n)}</b>`).join(' · ')} <small>(всего ${fmtFull(l.reduce((s, x) => s + x.n, 0))})</small>` : '<span class="muted">нет</span>');
  const sec = (t, body) => `<div class="mhead">${t}</div><div class="small insb">${body}</div>`;
  const till = (t) => (t ? `до ${fmtDate(t)}` : 'нет');
  const st = d.stash, gp = (p, k) => p[k] || 0;
  const head = `<div class="acard"><div class="cwname">${esc(d.login)} <small>· ${esc(d.race)} · ${d.online ? '<span class="ok">в игре</span>' : `был ${fmtDate(d.lastSeen)}`}</small></div>
    <div class="akv">${kv('Монеты', fmtFull(d.gold))}${kv('Премиум', till(d.premium))}${kv('Лояльность населения', fmtFull(d.royal))}${kv('Репутация', fmtFull(d.rep))}
      ${kv('Боевой ранг', `${d.brank.rank} · очков ${fmtFull(d.brank.pts)} · наград забрано ${d.brank.claimed}`)}${kv('Захватов замков', d.captures)}
      ${kv('Руны', `Силы ${gp(d.runes, 'str')} · Стойкости ${gp(d.runes, 'def')} · Пути ${gp(d.runes, 'path')}`)}${kv('Купол королевства', till(d.shieldKingdom))}${kv('Контрразведка', till(d.shieldSpy))}${kv('Регистрация', fmtDate(d.created))}</div>
    ${sec('📦 Кладовая', `${['wood', 'stone', 'iron', 'food'].map((r) => `${RES_IC[r]} ${fmtFull(st.res[r])}`).join(' ')}<br>Воины: ${ul(st.units)}<br>Опыт генерала: <b>${fmtFull(st.exp)}</b> · лояльность: <b>${fmtFull(st.royal)}</b>${st.cut ? `<br>Сброс излишков ${fmtDate(st.cut.at)} — списано: ${['wood', 'stone', 'iron', 'food'].filter((r) => st.cut.res[r]).map((r) => `${RES_IC[r]} ${fmtFull(st.cut.res[r])}`).join(' ')}` : ''}`)}
    ${sec('📈 Счётчики', Object.entries(d.stats).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${INSP_STAT[k] || esc(k)}: <b>${fmtFull(v)}</b>`).join(' · ') || 'нет')}
    <button class="pbar" data-ainsprefresh>🔄 Обновить</button></div>`;
  const castle = (c) => { const g = c.general, p = (g && g.pts) || {};
    const genHtml = g ? `<b>${esc(g.name)}</b>, ${g.level} ур. (опыт ${fmtFull(g.exp)}), ${g.away ? 'в походе' : 'в замке'}<br>Очки: атака ${gp(p, 'atk')} · защита ${gp(p, 'def')} · ком. атакой ${gp(p, 'catk')} · ком. защитой ${gp(p, 'cdef')} · восстановление ${gp(p, 'heal')} · карьера ${gp(p, 'career')} · свободно ${g.free}${g.gear.length ? `<br>Снаряжение: ${g.gear.map(esc).join(', ')}` : ''}`
      : `<span class="muted">нет</span>${c.dead.length ? `<br>Погибли: ${c.dead.map((x) => `${esc(x.name)} ${x.level} ур.${x.reviveAt ? ` (воскреснет ${fmtDate(x.reviveAt)})` : ''}`).join(', ')}` : ''}`;
    return `<div class="acard insc" data-insc="${c.id}"><div class="cwname">🏰 ${esc(c.name)} <small>X:${c.x} Y:${c.y}${c.capital ? ' · столица' : ''}</small></div>
    <div class="akv">${kv('Рейтинг', fmtFull(c.rating))}${kv('Бунт', `${c.riot}%`)}${kv('Стена', `${c.wall} ур.`)}${kv('Купол', till(c.shield))}${kv('Религия', c.religion ? esc(((S.cat.mil.religions || {})[c.religion] || {}).name || c.religion) : 'нет')}
      ${kv('Науки', `экономика ${gp(c.sciences, 'eco')} · инженерия ${gp(c.sciences, 'eng')} · философия ${gp(c.sciences, 'fhi')} · война ${gp(c.sciences, 'war')}`)}</div>
    ${sec('Ресурсы', `${['wood', 'stone', 'iron', 'food'].map((r) => `${RES_IC[r]} ${fmtFull(c.res[r].n)} / ${fmtFull(c.res[r].cap)} <small>+${fmtFull(c.res[r].rate)}/ч</small>`).join('<br>')}<br>${RES_IC.people} ${fmtFull(c.people)}`)}
    ${sec('⚔ Генерал', `${genHtml}${c.bag ? `<br>Вещей в Оружейной: ${c.bag}` : ''}`)}
    ${sec('🛡 Войска в замке', ul(c.units))}
    ${c.squads.length ? sec('Отряды', c.squads.map((q) => `<b>${esc(q.name)}</b>: ${ul(q.units)}`).join('<br>')) : ''}
    ${c.training.length ? sec('Тренируются', c.training.map((t) => `${esc(t.name)} ×${fmtFull(t.left)} — до ${fmtDate(t.end)}`).join('<br>')) : ''}
    ${(c.trapLog && c.trapLog.length) || c.prison ? sec('Капкан', `${c.prison ? `В Темнице: ${fmtFull(c.prison.n)} (армия ${esc(c.prison.login)})${c.prison.noLoy ? ' · без лояльности' : ''}<br>` : ''}${(c.trapLog || []).map((e) => `${new Date(e.at).toLocaleString('ru-RU')} · ${({ catch: 'поймано', execute: 'казнено', recruit: 'завербовано', escape: 'сбежало' })[e.act] || e.act} ${fmtFull(e.n)}${e.act === 'recruit' ? ` из ${fmtFull(e.of)}` : ''} · ${esc(e.from || '')}${e.loy ? ` · лояльность +${e.loy}` : ''}${e.noLoy ? ' · свой телефон/альянс' : ''}`).join('<br>')}`) : ''}
    ${c.wounded.length || c.healing.length ? sec('Лазарет', `Раненые: ${ul(c.wounded)}${c.healing.length ? `<br>Лечатся: ${c.healing.map((t) => `${esc(t.name)} ×${fmtFull(t.left)}`).join(', ')}` : ''}`) : ''}
    ${sec(`🚩 Армии вне замка (${c.armies.length})`, c.armies.map((a) => `<b>${INSP_MIS[a.mission] || esc(a.mission)}</b> → ${a.x}:${a.y} · ${INSP_ST[a.state] || esc(a.state)}${a.stay ? ` в «${esc(a.stay)}»` : ''}${a.general ? ' · с генералом' : ''}${a.state !== 'stay' ? ` · ${fmtDate(a.arrive)}` : ''}<br>${ul(a.units)}`).join('<hr>') || '<span class="muted">нет</span>')}
    ${sec('🤝 Чужие подкрепления в замке', c.guests.map((x) => `<b>${esc(x.from)}</b> («${esc(x.castle)}»): ${ul(x.units)}`).join('<br>') || '<span class="muted">нет</span>')}
    ${sec('🎯 Идут к замку', c.incoming.map((a) => `<b>${esc(a.from)}</b> («${esc(a.castle)}») — ${INSP_MIS[a.mission] || esc(a.mission)}, ${fmtDate(a.arrive)}<br>${ul(a.units)}`).join('<hr>') || '<span class="muted">никто</span>')}
    ${c.queue.length || c.research ? sec('🔨 Стройки', `${c.queue.map((q) => `${esc(q.name)} → ${q.level} ур. до ${fmtDate(q.end)}`).join('<br>')}${c.research ? `<br>Наука ${esc(c.research.sci)} → ${c.research.level} ур. до ${fmtDate(c.research.end)}` : ''}`) : ''}
    ${sec('🏛 Здания замка', c.castleB.map((b) => `${esc(b.name)} ${b.n > 1 ? `×${b.n} (до ${b.max} ур.)` : `${b.max} ур.`}`).join(' · ') || 'нет')}
    ${sec('🌾 Земли', c.landsB.map((b) => `${esc(b.name)} ×${b.n} (до ${b.max} ур.)`).join(' · ') || 'нет')}
    ${sec('💎 Артефакты', c.artifacts.map((a) => `${esc(a.name)} (${INSP_RAR[a.rarity] || a.rarity})${a.active ? ` · <span class="ok">пробуждён${a.until ? ` до ${fmtDate(a.until)}` : ''}</span>` : ''}`).join('<br>') || 'нет')}
    ${c.expeds.length ? sec('Экспедиции', c.expeds.map((e) => `${esc(e.kind)}: ${e.n} археологов, вернутся ${fmtDate(e.end)}`).join('<br>')) : ''}
    <button class="btn small" data-goworld="${c.x},${c.y}">На карте</button></div>`; };
  return `${ribbon(`👁 Осмотр: ${d.login}`)}<p class="small muted center">Только просмотр — игрок об осмотре не узнаёт.</p>${head}${d.castles.map(castle).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ainsp],[data-ainspxy],[data-ainsprefresh]'); if (!b) return;
  if (b.dataset.ainsprefresh !== undefined) { S.adm.insp = null; refreshSheet(); return send({ t: 'admin', op: 'inspect', ...(S.adm.inspArg || {}) }); }
  if (b.dataset.ainspxy) { const [x, y] = b.dataset.ainspxy.split(',').map(Number); return openInspect({ x, y }); }
  openInspect({ login: b.dataset.ainsp, castle: Number(b.dataset.cid) || 0 });
});

function admSend(op, extra = {}) {
  const a = S.adm;
  send({ t: 'admin', op, login: a.login || undefined, all: a.all, ...extra });
}
$('#sheetBody').addEventListener('input', (e) => {
  const n = e.target.dataset.an; if (!n) return;
  if (n === 'login') S.adm.login = e.target.value.trim();
});
$('#sheetBody').addEventListener('change', (e) => {
  if (e.target.matches('form[data-aform="givearmy"] select[name="castle"]') && S.adm.ga) { // Войска: другой замок — его «есть N», введённое остаётся
    S.adm.gaCastle = Number(e.target.value); const c = gaCastle(S.adm.ga, S.adm.gaCastle);
    $$('[data-gah]').forEach((el) => { el.textContent = gaCount(c, el.dataset.gah); }); return;
  }
  const n = e.target.dataset.an; if (!n) return;
  if (n === 'all') S.adm.all = e.target.checked;
  if (n === 'login') { S.adm.player = null; refreshSheet(); }
});
$('#sheetBody').addEventListener('click', (e) => {
  const gf = e.target.closest('[data-gafill]'); if (gf) { // «обычным по N» — особым вручную; «всё, что есть в замке» — для «Забрать»
    const v = gf.dataset.gafill, g = S.adm.ga, f = gf.closest('form');
    if (v === 'all') { if (g && f) { const c = gaCastle(g, Number(f.castle.value)); $$('.gaunit input').forEach((i) => { i.value = (c.home || {})[i.name.slice(1)] || ''; }); } return; }
    $$(v ? '.gamain .gaunit input' : '.gaunit input').forEach((i) => { i.value = v; }); return;
  }
  const gt = e.target.closest('[data-gatake]'); if (gt) { // «Забрать войска» — те же поля, что для выдачи
    const g = S.adm.ga, f = gt.closest('form'); if (!g || !f) return;
    const units = gaPicked(g, f), c = gaCastle(g, Number(f.castle.value));
    if (!Object.keys(units).length) return toast('Укажите количество хотя бы для одного юнита.', 'err');
    if (!confirm(`Забрать войска у игрока ${g.login}${c.name ? ` из замка «${c.name}»` : ''}?`)) return;
    send({ t: 'admin', op: 'takearmy', login: g.login, castle: c.id, units });
    return send({ t: 'admin', op: 'armyinfo', login: g.login }); // обновить «есть N»
  }
  const pd = e.target.closest('[data-apdays]'); if (pd) { S.adm.premDays = Number(pd.dataset.apdays); const f = pd.closest('form'); f.days.value = S.adm.premDays; f.querySelectorAll('[data-apdays]').forEach((x) => x.classList.toggle('on', x === pd)); return; } // «Премиум всем»: срок кнопкой
  const sm = e.target.closest('[data-asmod]'); if (sm) { if (!confirm(`Снять ${sm.dataset.asmod} со старших модераторов? Обычным модератором он останется.`)) return; send({ t: 'admin', op: 'smod', login: sm.dataset.asmod, on: 0 }); return setTimeout(() => send({ t: 'admin', op: 'mods' }), 300); }
  const mq = e.target.closest('[data-amodreq]'); if (mq) { const ok = mq.dataset.ok === '1'; if (!confirm(ok ? 'Принять заявку — назначить игрока модератором?' : 'Отклонить заявку?')) return; send({ t: 'admin', op: 'modreq', id: Number(mq.dataset.amodreq), ok: ok ? 1 : 0 }); return setTimeout(() => send({ t: 'admin', op: 'mods' }), 300); }
  const md = e.target.closest('[data-amod]'); if (md) { if (!confirm(`Снять ${md.dataset.amod} с модераторов?`)) return; send({ t: 'admin', op: 'mod', login: md.dataset.amod, on: 0 }); return setTimeout(() => send({ t: 'admin', op: 'mods' }), 300); }
  const tb = e.target.closest('[data-atab]'); if (tb) { S.adm.tab = tb.dataset.atab; if (S.adm.tab === 'mod') { send({ t: 'admin', op: 'mods' }); send({ t: 'admin', op: 'multis' }); } if (S.adm.tab === 'stats') send({ t: 'admin', op: 'stats' }); if (S.adm.tab === 'alerts') send({ t: 'admin', op: 'alerts' }); if (S.adm.tab === 'pay') send({ t: 'admin', op: 'payments' }); if (S.adm.tab === 'sec') send({ t: 'admin', op: 'sec' }); if (S.adm.tab === 'test') send({ t: 'admin', op: 'testview' }); return refreshSheet(); }
  const mb = e.target.closest('[data-mban],[data-mall],[data-mdev],[data-mok],[data-munok]');
  if (mb) { // решения по мультам — только вручную и с подтверждением
    const d = mb.dataset, on = d.on === '1';
    if (d.mban !== undefined) { let why = ''; if (on) { why = prompt(`Заблокировать ${d.mban}? За что (увидите в карточке игрока):`, ''); if (why === null) return; } send({ t: 'admin', op: on ? 'ban' : 'unban', login: d.mban, why }); }
    if (d.mall !== undefined) { if (!confirm(`Заблокировать аккаунты: ${d.mall.split(',').join(', ')}?`)) return; send({ t: 'admin', op: 'banmany', logins: d.mall.split(',') }); }
    if (d.mdev !== undefined) { let why = ''; if (on) { why = prompt('Заблокировать этот телефон? С него нельзя будет войти и зарегистрироваться. За что (увидите в карточке игрока):', ''); if (why === null) return; } send({ t: 'admin', op: on ? 'devban' : 'devunban', dev: d.mdev, why }); }
    if (d.mok !== undefined) { if (!confirm('Отметить «Не мульт»? Группа скроется, пока в ней не появится новый аккаунт.')) return; send({ t: 'admin', op: 'multiok', key: d.mok }); }
    if (d.munok !== undefined) send({ t: 'admin', op: 'multiunok', key: d.munok });
    return setTimeout(() => (S.adm.tab === 'player' && S.adm.login ? send({ t: 'admin', op: 'player', login: S.adm.login }) : send({ t: 'admin', op: 'multis' })), 200);
  }
  const hn = e.target.closest('[data-ahonall],[data-ahontake]');
  if (hn) { // 🏅 Медали: всем тестерам / забрать у игрока
    const d = hn.dataset;
    if (d.ahonall) { if (!confirm('Вручить медаль всем тестерам, у кого её ещё нет?')) return; return send({ t: 'admin', op: 'honorgive', id: d.ahonall, testers: 1 }); }
    if (!confirm(`Забрать медаль у ${d.login}?`)) return;
    return send({ t: 'admin', op: 'honortake', id: d.ahontake, login: d.login });
  }
  const tt = e.target.closest('[data-tmode],[data-top],[data-tcopy]');
  if (tt) { // 🧪 Тест: режим, пароль, отключить, снять
    const d = tt.dataset;
    if (d.tcopy !== undefined) { const t = S.adm.test && S.adm.test.created; if (t) navigator.clipboard.writeText(`Логин: ${t.acct}\nПароль: ${t.pass}`).then(() => toast('Скопировано'), () => toast('Не удалось скопировать — перепишите вручную', 'err')); return; }
    if (d.tmode !== undefined) { const on = d.tmode === '1'; if (!confirm(on ? 'Включить закрытый тест? Все, кроме тестеров и админа, будут выброшены из игры, регистрация закроется.' : 'Выключить закрытый тест? Игра откроется для всех, регистрация заработает.')) return; return send({ t: 'admin', op: 'testmode', on }); }
    const ask = { testpass: `Сделать новый пароль тестеру ${d.login}? Старый перестанет работать.`, testoff: `Отключить доступ тестеру ${d.login}?`, testmark: `Снять ${d.login} с тестеров?` }[d.top];
    if (ask && !confirm(ask)) return;
    return send({ t: 'admin', op: d.top, login: d.login, on: d.top === 'testmark' ? 0 : undefined });
  }
  const b = e.target.closest('[data-adm],[data-apick],[data-adm-self]'); if (!b) return;
  if (b.dataset.admSelf !== undefined) { S.adm.login = ''; S.adm.player = null; return refreshSheet(); }
  if (b.dataset.apick) { S.adm.login = b.dataset.apick; S.adm.player = null; S.adm.ga = null; S.adm.passcheck = null; S.adm.tab = 'player'; send({ t: 'admin', op: 'player', login: S.adm.login }); return refreshSheet(); }
  const op = b.dataset.adm;
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  const extra = {};
  if (op === 'ban') { const why = prompt('За что блокируете? (увидите в карточке игрока)', ''); if (why === null) return; extra.why = why; }
  if (b.dataset.cid) extra.cid = Number(b.dataset.cid);
  if (b.dataset.arg) { // "op:key,key2" — значения берутся из полей data-an
    const [field, keys] = b.dataset.arg.split(':');
    keys.split(',').forEach((k, i) => { const el = $(`[data-an="${i === 0 ? field : k}"]`); if (el) extra[k] = el.value; });
  }
  if (op === 'players' || op === 'multis') return send({ t: 'admin', op });
  if (op === 'alertsclear') { send({ t: 'admin', op }); S.adm.alerts = []; return refreshSheet(); }
  if (op === 'secclear') { send({ t: 'admin', op }); return setTimeout(() => send({ t: 'admin', op: 'sec' }), 200); }
  if (op === 'tgbackup') { send({ t: 'admin', op }); return setTimeout(() => send({ t: 'admin', op: 'sec' }), 4000); }
  if (op === 'delete' || op === 'abandon') { admSend(op); S.adm.login = ''; S.adm.player = null; S.adm.players = null; if (op === 'abandon') { S.adm.nobody = null; S.adm.nobodyAsked = false; } return; }
  admSend(op, extra);
  if (S.adm.login) setTimeout(() => send({ t: 'admin', op: 'player', login: S.adm.login }), 150);
});
$('#sheetBody').addEventListener('input', (e) => { // поиск по заблокированным IP — перерисовываем только список
  const q = e.target.closest('[data-ipq]'); if (!q) return; S.adm.ipq = q.value; const box = $('#ipbanlist'); if (box && S.adm.sec) box.innerHTML = ipBanListHtml(S.adm.sec.bans);
});
$('#sheetBody').addEventListener('input', (e) => { // «Премиум всем»: срок числом — запомнить и подсветить такую же кнопку
  const i = e.target.closest('[data-aform="premall"] [name="days"]'); if (!i) return; const n = Math.floor(Number(i.value));
  if (n >= 1 && n <= 30) S.adm.premDays = n; i.form.querySelectorAll('[data-apdays]').forEach((x) => x.classList.toggle('on', Number(x.dataset.apdays) === n));
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.aform; if (!k) return;
  e.preventDefault();
  if (k === 'armyinfo') { const l = f.login.value.trim(); if (!l) return; S.adm.ga = null; return send({ t: 'admin', op: 'armyinfo', login: l }); }
  if (k === 'givearmy') {
    const g = S.adm.ga; if (!g) return;
    const units = gaPicked(g, f, [...g.units, ...(g.special || [])]); // «другие» (не из списка выдачи) — только забрать
    if (!Object.keys(units).length) return toast('Укажите количество хотя бы для одного юнита.', 'err');
    if (!confirm(`Выдать войска игроку ${g.login}?`)) return;
    send({ t: 'admin', op: 'givearmy', login: g.login, castle: Number(f.castle.value), units });
    return send({ t: 'admin', op: 'armyinfo', login: g.login }); // обновить «есть N»
  }
  if (k === 'givecastle') { const l = f.login.value.trim(), n = Math.max(1, Number(f.n.value) || 1); if (!l) return; if (!confirm(`Выдать игроку ${l} полных замков: ${n}?`)) return; return send({ t: 'admin', op: 'castles', login: l, n }); }
  if (k === 'addsmod') { const l = f.login.value.trim(); if (!l || !confirm(`Назначить ${l} старшим модератором?`)) return; send({ t: 'admin', op: 'smod', login: l, on: 1 }); f.login.value = ''; return setTimeout(() => send({ t: 'admin', op: 'mods' }), 300); }
  if (k === 'addmod') { const l = f.login.value.trim(); if (!l) return; send({ t: 'admin', op: 'mod', login: l, on: 1 }); f.login.value = ''; return setTimeout(() => send({ t: 'admin', op: 'mods' }), 300); }
  if (k === 'find') { S.adm.players = null; S.adm.q = f.q.value; return send({ t: 'admin', op: 'players', q: f.q.value }); }
  if (k === 'testadd') return send({ t: 'admin', op: 'testadd', acct: f.acct.value.trim(), nick: f.nick.value.trim(), race: Number(f.race.value), note: f.note.value.trim() });
  if (k === 'testmark') { const l = f.login.value.trim(); if (!l) return; f.login.value = ''; return send({ t: 'admin', op: 'testmark', login: l, on: 1 }); }
  if (k === 'honorgive') { const v = f.nicks.value.trim(); if (!v) return toast('Впишите ники через запятую.', 'err'); return send({ t: 'admin', op: 'honorgive', id: f.dataset.id, nicks: v }); }
  if (k === 'passcheck') { admSend('passcheck', { password: f.password.value }); f.password.value = ''; return; }
  if (k === 'mailtest') { S.adm.mailTest = { ok: true, msg: 'Отправляю…' }; refreshSheet(); return send({ t: 'admin', op: 'mailtest', addr: f.addr.value.trim() }); }
  if (k === 'goldall') { const n = Math.floor(Number(f.n.value)); if (!(n >= 1 && n <= 1000)) return toast('От 1 до 1000 золота.', 'err'); if (!confirm(`Выдать КАЖДОМУ игроку по ${n} золота?`)) return; S.adm.goldAll = { msg: 'Выдаю…', last: (S.adm.goldAll || { last: [] }).last }; refreshSheet(); return send({ t: 'admin', op: 'goldall', n, why: f.why.value }); }
  if (k === 'premall') { const n = Math.floor(Number(f.days.value)); if (!(n >= 1 && n <= 30)) return toast('Срок — от 1 до 30 дней.', 'err'); if (!confirm(`Выдать КАЖДОМУ игроку Премиум на ${n} ${plural(n, 'день', 'дня', 'дней')}?`)) return; S.adm.premAll = { msg: 'Выдаю…', last: (S.adm.premAll || { last: [] }).last }; refreshSheet(); return send({ t: 'admin', op: 'premall', days: n, why: f.why.value }); }
  if (k === 'battlecmp') { S.adm.battle = { ...(S.adm.battle || {}), attNick: f.att.value.trim(), defNick: f.def.value.trim(), mission: f.mission.value, noGen: !f.general.checked }; return send({ t: 'admin', op: 'battlecmp', att: f.att.value.trim(), def: f.def.value.trim(), mission: f.mission.value, general: f.general.checked ? 1 : 0 }); }
  if (k === 'allygold') { const n = Math.trunc(Number(f.n.value)), tag = f.tag.value.trim().toUpperCase(); if (!n || !tag) return toast('Укажите тег альянса и сумму.', 'err'); const amt = `${Math.abs(n)} ${plural(Math.abs(n), 'монету', 'монеты', 'монет')}`; if (!confirm(n > 0 ? `Пополнить казну альянса [${tag}] на ${amt}?` : `Списать из казны альянса [${tag}] ${amt}?`)) return; f.n.value = ''; return send({ t: 'admin', op: 'allygold', tag, n }); }
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
    if (m.op === 'multis') S.adm.multis = m.data;
    if (m.op === 'mods') S.adm.mods = m.data;
    if (m.op === 'stats') S.adm.stats = m.data;
    if (m.op === 'alerts') S.adm.alerts = m.data;
    if (m.op === 'payments') S.adm.pay = m.data;
    if (m.op === 'sec') S.adm.sec = m.data;
    if (m.op.startsWith('honor')) S.adm.honor = m.data;
    if (m.op.startsWith('test')) { const keep = S.adm.test && S.adm.test.created; S.adm.test = { ...m.data, created: m.data.created || (m.op === 'testview' ? null : keep) }; }
    if (m.op === 'armyinfo') S.adm.ga = m.data;
    if (m.op === 'inspect') { // осмотр: сразу к нужному замку (нажали на замок на карте или «осмотр» у замка)
      S.adm.insp = m.data; refreshSheet();
      if (m.data.focus && S.sheets[S.sheets.length - 1] === admInspectWin) { const el = $(`[data-insc="${m.data.focus}"]`); if (el) el.scrollIntoView({ block: 'start' }); }
      return;
    }
    if (m.op === 'passcheck') S.adm.passcheck = m.data;
    if (m.op === 'mailtest') S.adm.mailTest = { ok: !m.data.error, msg: m.data.error || m.data.msg };
    if (m.op === 'goldall' || m.op === 'goldallget') S.adm.goldAll = { ...m.data, at: Date.now() };
    if (m.op === 'premall' || m.op === 'premallget') S.adm.premAll = { ...m.data, at: Date.now() };
    if (m.op === 'battlerules') S.adm.battle = { ...(S.adm.battle || {}), ...m.data };
    if (m.op === 'maint') S.adm.maint = m.data;
    if (m.op === 'battlecmp') S.adm.battle = { ...(S.adm.battle || {}), cmp: m.data.cmp };
    if (m.op === 'nobodyview') S.adm.nobody = m.data;
    if (m.op === 'brseason' || m.op === 'brseasonnew') S.adm.brs = m.data;
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
// ---------- ⭐ Платежи (server/src/tgpay.js): покупки монет за звёзды Telegram, итоги, возвраты ----------
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-apayref]')) send({ t: 'admin', op: 'payments' }); });
$('#sheetBody').addEventListener('click', (e) => { // «Закрыть игру для игроков» на 8 / 24 часа, «Открыть игру сейчас»
  const t = e.target.closest('[data-amaint]'); if (!t) return;
  const h = Number(t.dataset.amaint);
  if (!confirm(h ? `Закрыть игру для игроков на ${hoursTxt(h)}? Кто в игре — выбросит, все увидят «Сервер временно не работает». Войти сможете только Вы. Через ${hoursTxt(h)} игра откроется сама.` : 'Открыть игру для всех игроков сейчас?')) return;
  send(h ? { t: 'admin', op: 'maint', on: 1, hours: h } : { t: 'admin', op: 'maint', on: 0 });
});
$('#sheetBody').addEventListener('click', (e) => { // правила боя: включить новые / вернуть прежние
  const t = e.target.closest('[data-abattle]'); if (!t) return;
  const on = t.dataset.abattle === '1'; if (!confirm(on ? 'Включить новые правила боя для всех боёв?' : 'Вернуть прежние правила боя?')) return;
  send({ t: 'admin', op: 'battlerules', on: on ? 1 : 0 });
});
function admPayHtml(p) {
  if (!p) return aSec('⭐ Платежи', '<p class="small">Загрузка…</p>');
  const tile = (v, t) => `<div class="stile"><b>${fmtFull(v)}</b><span>${t}</span></div>`;
  const row = (x) => `<div class="payrow${x.refunded || x.lost ? ' bad' : ''}"><span><b>${esc(x.login || '?')}</b><small>${fmtDate(x.at)}${x.tg ? ` · Telegram id ${x.tg}` : ''}</small></span>
    <span class="payamt">+${fmtFull(x.gold)} 🪙<small>${fmtFull(x.stars)} ⭐</small></span>
    <em>${x.lost ? 'без счёта — начислить вручную' : x.refunded ? `возврат ${fmtDate(x.refunded)} — монеты списаны` : 'зачислено'}</em></div>`;
  return `${aSec('⭐ Итого', `<div class="stiles">${tile(p.stars, 'звёзд получено')}${tile(p.gold, 'монет зачислено')}${tile(p.count, 'покупок')}${tile(p.refunds, 'возвратов')}</div>
      <p class="small">Звёзды копятся на балансе бота игроков${S.cat.pay && S.cat.pay.bot ? ` @${esc(S.cat.pay.bot)}` : ''}. Вывести их можно через Fragment, примерно через 3 недели после покупки.</p>
      <button class="btn small" data-apayref>↻ Обновить</button>`)}
    ${aSec('🧾 Зачисления', p.list.length ? p.list.map(row).join('') : '<p class="small">Покупок пока не было.</p>')}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ssel],[data-astats]'); if (!b) return;
  if (b.dataset.astats !== undefined) { S.adm.statSel = null; return send({ t: 'admin', op: 'stats' }); }
  const [id, i] = b.dataset.ssel.split(':'); S.adm.statSel = S.adm.statSel && S.adm.statSel.id === id && S.adm.statSel.i === Number(i) ? null : { id, i: Number(i) }; refreshSheet();
});

// ---------- 🚨 Подозрительное (server/src/anomaly.js): резкие скачки армии, золота, лояльности, ресурсов ----------
const ALERT_IC = { army: '⚔', gold: '💰', royal: '👑', res: '📦' };
function admAlertsHtml(l) {
  const intro = '<p class="small">Раз в 10 минут сервер сравнивает каждого игрока с прошлым замером. Сюда попадает то, что нельзя объяснить игрой: армия выросла больше, чем обучено, взято из Кладовой и вылечено в Лазарете; золото пришло не от администрации или изменилось мимо журнала; лояльность населения растёт быстрее правил; ресурсов больше, чем вмещает Склад. Ваши действия в админке тревогу не вызывают.</p>';
  if (!l) return aSec('🚨 Подозрительное', `${intro}<p class="small">Загрузка…</p>`);
  return aSec('🚨 Подозрительное', `${intro}
    ${l.length ? `<div class="alist">${l.map((x) => `<div class="alrt ${x.seen ? '' : 'new'}"><i>${ALERT_IC[x.kind] || '⚠'}</i><div><b>${esc(x.text)}</b><small>${esc(x.why)}</small>
      <span>${fmtDate(x.at)} · <button class="lnk" data-apick="${esc(x.login)}">${esc(x.login)}</button></span></div></div>`).join('')}</div>
      ${aAct('Очистить список', 'Удалить все записи (новые появятся при следующих проверках).', aBtn2('alertsclear', 'Очистить', 'data-confirm="Очистить список подозрительного?"', 'danger'))}`
    : '<p class="parch-note">Ничего подозрительного. Проверка идёт каждые 10 минут.</p>'}`);
}

// копия базы в Telegram (server/src/tgbackup.js): включена ли, когда ушла последняя, кнопка «Отправить сейчас»
// ✉ Почта игры (server/src/mail.js): подключена ли, сколько игроков привязали почту, проверочное письмо
function admMailHtml(m) {
  if (!m) return '';
  const t = S.adm.mailTest;
  return aSec('✉ Почта игры', m.on ? `<p class="small">Письма с кодами (привязка почты, «Забыли пароль?») уходят с <b>${esc(m.from)}</b> через ${esc(m.host)}:${m.port}. За час отправлено: ${m.hour}. Почту привязали игроков: <b>${m.bound}</b>.</p>
      ${t ? `<div class="smnote ${t.ok ? 'ok' : ''}">${t.ok ? '✔' : '⛔'} ${esc(t.msg)}</div>` : ''}
      <form class="chatform" data-aform="mailtest"><input name="addr" type="email" placeholder="Куда прислать проверочное письмо" autocapitalize="none" required><button class="btn primary small">Проверить</button></form>`
    : '<p class="small">Почта не подключена — у игроков нет кнопки «Привязать почту». Подключить: на сервере <b>sh /opt/war/game/mail.sh</b> (адрес ящика на домене игры и пароль приложения). Как завести ящик — README, раздел «Почта игры».</p>');
}
function admTgHtml(t) {
  if (!t) return '';
  if (!t.on) return aSec('🗄 Копия базы в Telegram', '<p class="small">Не настроена. Раз в сутки база игроков будет приходить файлом в чат с Вашим ботом — если с сервером что-то случится, игроки не пропадут. Настройка на сервере: <code>sh /opt/war/game/tgbackup.sh</code> (инструкция — в README.txt).</p>');
  const ok = t.lastOk ? `последняя — <b>${fmtDate(t.lastOk)}</b> (${Math.round(t.size / 1024)} КБ)` : 'ещё не отправлялась';
  return aSec('🗄 Копия базы в Telegram', `<p class="small">Включена: раз в сутки около ${t.hour}:00 по времени сервера${t.enc ? ', файл зашифрован паролем 🔒' : ' (без шифрования)'}; ${ok}.</p>
      ${t.err ? `<p class="small bad">Ошибка ${fmtDate(t.lastTry)}: ${esc(t.err)}</p>` : ''}
      ${aBtn2('tgbackup', t.busy ? 'Отправляется…' : '📤 Отправить копию сейчас', '', '')}`);
}
// «Заблокированные адреса»: поиск по части IP (их бывает около тысячи) — показываем не больше 100 строк
function ipBanListHtml(bans) {
  const q = String(S.adm.ipq || '').trim(), list = q ? bans.filter((b) => b.ip.includes(q)) : bans, shown = list.slice(0, 100);
  const head = `<p class="small">${q ? `Найдено: <b>${list.length}</b> из ${bans.length}` : `Всего: <b>${bans.length}</b>`}${list.length > shown.length ? ` · показаны первые ${shown.length} — уточните поиск` : ''}</p>`;
  return bans.length ? `${head}${shown.map((b) => `<div class="srow"><span><b>${esc(b.ip)}</b> · ${fmtDate(b.at)}${b.until ? ` · до ${fmtDate(b.until)}` : ''}${b.why ? ` · ${esc(b.why)}` : ''}</span><button class="btn small" data-ipunban="${esc(b.ip)}">Снять</button></div>`).join('')}${q && !list.length ? '<p class="parch-note">Такого адреса среди заблокированных нет.</p>' : ''}` : '<p class="small">Нет.</p>';
}
// ---------- 🔒 Безопасность (server/src/secwatch.js): подозрительные IP — подбор паролей, поиск дыр, флуд ----------
function admSecHtml(d) {
  const intro = '<p class="small">Адреса, с которых было подозрительное: подбор паролей (особенно к Вашему аккаунту), поиск уязвимостей на сайте (.php, .env, wp-admin, обход папок), попытки отправить файл, флуд, подделанные запросы. Красные — свежие с прошлого просмотра. Вход на сам сервер (SSH) сюда не попадает — его смотрят командой <code>lastb</code>.</p><p class="small"><b>Автоблок:</b> 3 запроса «поиск дыр» или «отправка файла» с одного адреса — IP закрывается сам на 30 дней. Адреса, с которых уже заходили игроки, автоблок не трогает.</p>';
  if (!d) return aSec('🔒 Безопасность', `${intro}<p class="small">Загрузка…</p>`);
  const danger = (x) => x.kinds.some((k) => ['admin', 'probe', 'upload'].includes(k.k));
  const row = (x) => `<div class="alrt ${x.fresh && danger(x) ? 'new' : ''}"><i>${danger(x) ? '⛔' : '⚠'}</i><div>
      <b>${esc(x.ip)}${x.ip === d.me ? ' <span class="ok">(это Вы)</span>' : ''}${x.banned ? ` <span class="bad">[${x.auto ? 'автоблок' : 'заблокирован'}]</span>` : ''}</b>
      <small>${x.kinds.map((k) => `${esc(k.t)} ×${k.v}`).join(' · ')}</small>
      <small class="muted">${x.samples.map(esc).join('<br>')}</small>
      <span>первый раз ${fmtDate(x.first)} · последний ${fmtDate(x.last)}</span>
      ${x.ip === d.me ? '' : x.banned ? `<button class="btn small" data-ipunban="${esc(x.ip)}">Разблокировать</button>` : `<button class="btn small danger" data-ipban="${esc(x.ip)}" data-why="${esc(x.kinds.map((k) => k.t).join(', '))}">Заблокировать IP</button>`}</div></div>`;
  return `${aSec('⛔ Заблокированные адреса', `<input class="ipq" data-ipq placeholder="🔍 Поиск по IP, например 80.47.13" value="${esc(S.adm.ipq || '')}" inputmode="decimal" autocomplete="off"><div id="ipbanlist">${ipBanListHtml(d.bans)}</div>
      <p class="small" style="margin:10px 0 2px">Заблокировать адрес вручную:</p><form class="chatform" data-aform="ipban"><input name="ip" placeholder="IP вручную, например 1.2.3.4" autocomplete="off" required><button class="btn small danger">Заблокировать</button></form>`)}
    ${aSec('🔒 Безопасность', `${intro}<p class="small">Ваш адрес сейчас: <b>${esc(d.me || '?')}</b> — его заблокировать нельзя. Осторожно: у мобильного интернета один адрес бывает у многих людей — блокировка закроет игру им всем.</p>
      ${d.list.length ? `<div class="alist">${d.list.map(row).join('')}</div>` : '<p class="parch-note">Пока ничего подозрительного.</p>'}
      <button class="btn small" data-asec>↻ Обновить</button> ${aBtn2('secclear', 'Очистить журнал', 'data-confirm="Очистить журнал адресов? Блокировки останутся."', 'danger')}`)}
    ${admTgHtml(d.tg)}
    ${admMailHtml(d.mail)}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ipban],[data-ipunban],[data-asec]'); if (!b) return;
  if (b.dataset.asec !== undefined) return send({ t: 'admin', op: 'sec' });
  if (b.dataset.ipban) { if (!confirm(`Заблокировать ${b.dataset.ipban}? Сайт и игра для этого адреса закроются.`)) return; send({ t: 'admin', op: 'ipban', target: b.dataset.ipban, why: b.dataset.why }); }
  if (b.dataset.ipunban) send({ t: 'admin', op: 'ipunban', target: b.dataset.ipunban });
  setTimeout(() => (S.adm.tab === 'player' && S.adm.login ? send({ t: 'admin', op: 'player', login: S.adm.login }) : send({ t: 'admin', op: 'sec' })), 200); // из карточки игрока — обновить карточку
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-aform="ipban"]'); if (!f) return; e.preventDefault(); e.stopImmediatePropagation();
  if (!confirm(`Заблокировать ${f.ip.value.trim()}?`)) return;
  send({ t: 'admin', op: 'ipban', target: f.ip.value.trim(), why: 'вручную' }); f.ip.value = ''; setTimeout(() => send({ t: 'admin', op: 'sec' }), 200);
}, true);

// ---------- 🧪 Закрытый тест (server/src/closedtest.js): пока включён — входят только тестеры и админ, регистрации нет ----------
function admTestHtml(t) {
  if (!t) return '<p class="parch-note">Загрузка…</p>';
  const c = t.created;
  return `${aSec('🧪 Закрытый тест', `<div class="tmode ${t.on ? 'on' : ''}">${t.on ? '🔒 ВКЛЮЧЁН — входят только тестеры и админ, регистрация закрыта' : '🔓 Выключен — игра открыта для всех'}</div>
      <button class="btn ${t.on ? '' : 'primary'}" data-tmode="${t.on ? 0 : 1}">${t.on ? 'Выключить (открыть игру всем)' : 'Включить закрытый тест'}</button>
      ${t.msg ? `<div class="smnote ok">✔ ${esc(t.msg)}</div>` : ''}`)}
    ${c ? aSec('🔑 Данные для входа', `<p class="small">Передайте тестеру. <b>Пароль показывается только сейчас</b> — на сервере хранится лишь его отпечаток. Забыли — «Новый пароль».</p>
      <div class="tcreds"><div>Логин: <b>${esc(c.acct)}</b></div><div>Пароль: <b>${esc(c.pass)}</b></div><div class="small">Ник в игре: ${esc(c.nick)}</div></div>
      <button class="btn small" data-tcopy>📋 Скопировать логин и пароль</button>`) : ''}
    ${aSec('➕ Новый тестер', `<p class="small">Всё можно оставить пустым: логин будет вида test_xxxx, ник — как логин. Пароль сервер придумает сам.</p>
      <form class="stack" data-aform="testadd"><input name="acct" placeholder="Логин (необязательно, от 5 символов)" autocapitalize="none" maxlength="40">
        <input name="nick" placeholder="Ник в игре (необязательно, 3–10 англ. букв и цифр)" autocapitalize="none" maxlength="10">
        <select name="race">${['Люди', 'Эльфы', 'Гномы', 'Орки'].map((r, i) => `<option value="${i}">${r}</option>`).join('')}</select>
        <input name="note" placeholder="Кому выдан (видно только вам)" maxlength="60"><button class="btn primary">Создать тестера</button></form>`)}
    ${aSec(`👥 Тестеры — ${t.list.length}`, t.list.length ? t.list.map((u) => `<div class="trow ${u.off ? 'off' : ''}"><div><b>${esc(u.login)}</b> <small>логин ${esc(u.acct)} · ${esc(u.race)}</small>
        <small>${u.off ? '⛔ доступ отключён' : u.online ? '🟢 в игре' : u.lastSeen ? `был ${fmtDate(u.lastSeen)}` : 'ещё не входил'}${u.note ? ` · ${esc(u.note)}` : ''}</small></div>
        <div class="tbtns"><button class="btn small" data-top="testpass" data-login="${esc(u.login)}">Новый пароль</button>
        <button class="btn small" data-top="${u.off ? 'teston' : 'testoff'}" data-login="${esc(u.login)}">${u.off ? 'Включить' : 'Отключить'}</button>
        <button class="btn small danger" data-top="testmark" data-login="${esc(u.login)}">Снять</button></div></div>`).join('') : '<p class="small">Тестеров пока нет.</p>')}
    ${aSec('⭐ Сделать тестером игрока', `<p class="small">Уже зарегистрированный игрок (по нику) сможет входить во время теста со своим паролем.</p>
      <form class="chatform" data-aform="testmark"><input name="login" placeholder="Ник игрока" autocapitalize="none" required><button class="btn primary small">Добавить</button></form>`)}`;
}
