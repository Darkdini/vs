'use strict';
// Админ-панель (только для admin): отдельное окно со всеми командами сервера (server/src/admin.js).
// Цель команд — игрок из поля «Игрок» (пусто — вы сами); галочка «все замки» — над всеми его замками.

S.adm = { login: '', all: true, players: null, player: null, bugs: null };
const aBtn = (op, text, icon, extra = '') => `<button class="ptile" data-adm="${op}" ${extra}><img src="${GFX}${icon}" alt=""><span>${text}</span></button>`;
const aNum = (name, value, ph) => `<input class="anum" type="number" inputmode="numeric" data-an="${name}" value="${value}" placeholder="${ph}">`;

function adminHtml() {
  const a = S.adm, who = a.login ? `игрок <b>${esc(a.login)}</b>` : '<b>вы (admin)</b>';
  const units = (S.cat.mil.units || []).filter((u) => u.id !== S.cat.mil.generalId);
  return `${ribbon('Админ-панель')}
    <div class="acard"><div class="arow"><span>Игрок:</span><input data-an="login" value="${esc(a.login)}" placeholder="пусто — вы сами" autocapitalize="none"></div>
      <label class="check"><input type="checkbox" data-an="all" ${a.all ? 'checked' : ''}> над всеми замками игрока (иначе — только активный)</label>
      <div class="small">Сейчас команды действуют на: ${who}${a.login ? ' <button class="btn small" data-adm-self>сбросить</button>' : ''}</div></div>

    ${ribbon('Прокачка')}
    <div class="ptiles">
      ${aBtn('max', 'Полная прокачка', 'build/castle.png')}
      ${aBtn('finish', 'Завершить всё', 'res/time.png')}
      ${aBtn('sciences', 'Науки 20 ур.', 'smallicon/Ekoscience.png')}
    </div>
    <div class="arow">${aNum('castles', 1, 'сколько')}${aBtn('castles', '+ Замки (полные)', 'ground/castle_big.png', 'data-arg="castles:n"')}</div>

    ${ribbon('Ресурсы и золото')}
    <div class="ptiles">${aBtn('fill', 'Склады до максимума', 'build/storage.png')}</div>
    <div class="arow">${aNum('res', 100000, 'кол-во (минус — забрать)')}${aBtn('res', '+ Ресурсы', 'res/wood.png', 'data-arg="res:n"')}</div>
    <div class="arow">${aNum('gold', 10000, 'кол-во (минус — забрать)')}${aBtn('gold', '+ Золото', 'smallicon/coin_gold.png', 'data-arg="gold:n"')}</div>

    ${ribbon('Армия')}
    <div class="arow"><select data-an="unit"><option value="">Все юниты расы игрока</option>${units.map((u) => `<option value="${u.id}">${esc(u.name)}${u.race !== 'all' ? ` (${esc(S.cat.races[u.race] || '')})` : ''}</option>`).join('')}</select></div>
    <div class="arow">${aNum('army', 1000, 'кол-во (минус — забрать)')}${aBtn('army', '+ Войска', 'units/human/knight.png', 'data-arg="army:n,unit"')}</div>
    <div class="arow">${aNum('general', 100, 'уровень 1–500')}${aBtn('general', 'Генерал ур.', 'units/human/general.png', 'data-arg="general:level"')}</div>
    <div class="ptiles">
      ${aBtn('arts', '5 артефактов', 'smallicon/artefacts/artefakt_dragon.png')}
      ${aBtn('noarmy', 'Убрать войска', 'smallicon/destroy.png', 'data-confirm="Убрать все войска?"')}
      ${aBtn('npc', 'Восстановить лагеря', 'ground/dikari.png')}
    </div>
    <div class="arow">${aNum('loyalty', 100, '0–100')}${aBtn('loyalty', 'Лояльность', 'smallicon/bonus_status/coronalgold.png', 'data-arg="loyalty:value"')}</div>

    ${ribbon('Игроки')}
    <button class="pbar" data-adm="players">Показать всех игроков</button>
    ${a.players ? `<div class="rlist">${a.players.map((p) => `<button class="rrow" data-apick="${esc(p.login)}"><span class="rn"><b>${esc(p.login)}${p.admin ? ' ★' : ''}${p.banned ? ' <span class="bad">[бан]</span>' : ''}</b>
      <small>${esc(p.race)} · замков ${p.castles} · золото ${fmtFull(p.gold)} · ${p.online ? 'в игре' : `был ${fmtDate(p.lastSeen)}`}</small></span><span class="rv">${fmtFull(p.rating)}</span></button>`).join('')}</div>` : ''}
    ${a.player ? playerCard(a.player) : ''}

    ${ribbon('Связь и мир')}
    <form class="stack" data-aform="mailall"><input name="subject" placeholder="Тема письма" value="Сообщение администрации"><textarea name="text" rows="3" placeholder="Письмо всем игрокам" required></textarea><button class="btn primary">Разослать всем</button></form>
    <form class="chatform" data-aform="chat"><input name="text" placeholder="Объявление в общий чат" required><button class="btn primary small">В чат</button></form>
    <div class="arow">${aNum('bots', 1000, 'сколько ботов')}${aBtn('bots', 'Заселить мир ботами', 'ground/castle_small.png', 'data-arg="bots:n"')}</div>
    <div class="ptiles">${aBtn('reports', 'Очистить отчёты', 'smallicon/swordgreen.png')}${aBtn('bugs', 'Сообщения об ошибках', 'smallicon/soft_help.png')}</div>
    ${a.bugs ? `<div class="pstats">${a.bugs.length ? a.bugs.map((b) => `<b>${esc(b.from)}</b> · ${fmtDate(b.at)}<br>${esc(b.text)}`).join('<hr>') : 'Сообщений нет.'}</div>${a.bugs.length ? '<button class="pbar" data-adm="bugsclear">Очистить список ошибок</button>' : ''}` : ''}`;
}

function playerCard(p) {
  return `<div class="acard"><div class="cwname">${esc(p.login)}${p.banned ? ' <span class="bad">[заблокирован]</span>' : ''}</div>
    <div class="small">${esc(p.race)} · рейтинг ${fmtFull(p.rating)} · золото ${fmtFull(p.gold)} · в игре с ${fmtDate(p.created)}</div>
    <div class="rlist">${p.castlesList.map((c) => `<div class="rrow"><span class="rn"><b>${esc(c.name)}</b><small>X:${c.x} Y:${c.y} · лояльность ${c.loyalty}</small></span><span class="rv">${fmtFull(c.rating)}</span>
      <button class="btn small" data-goworld="${c.x},${c.y}">карта</button></div>`).join('')}</div>
    <div class="ptiles">
      ${p.banned ? aBtn('unban', 'Разблокировать', 'smallicon/greenball.png') : aBtn('ban', 'Заблокировать', 'smallicon/grayball.png', 'data-confirm="Заблокировать игрока?"')}
      ${aBtn('noavatar', 'Удалить аватар', 'smallicon/destroy.png', 'data-confirm="Удалить аватар игрока?"')}
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
  const b = e.target.closest('[data-adm],[data-apick],[data-adm-self]'); if (!b) return;
  if (b.dataset.admSelf !== undefined) { S.adm.login = ''; S.adm.player = null; return refreshSheet(); }
  if (b.dataset.apick) { S.adm.login = b.dataset.apick; S.adm.player = null; send({ t: 'admin', op: 'player', login: S.adm.login }); return refreshSheet(); }
  const op = b.dataset.adm;
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  const extra = {};
  if (b.dataset.arg) { // "op:key,key2" — значения берутся из полей data-an
    const [field, keys] = b.dataset.arg.split(':');
    keys.split(',').forEach((k, i) => { const el = $(`[data-an="${i === 0 ? field : k}"]`); if (el) extra[k] = el.value; });
  }
  if (op === 'players' || op === 'bugs') return send({ t: 'admin', op });
  if (op === 'bugsclear') { S.adm.bugs = null; return send({ t: 'admin', op }); }
  if (op === 'delete') { admSend(op); S.adm.login = ''; S.adm.player = null; S.adm.players = null; return; }
  admSend(op, extra);
  if (S.adm.login) setTimeout(() => send({ t: 'admin', op: 'player', login: S.adm.login }), 150);
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target, k = f.dataset.aform; if (!k) return;
  e.preventDefault();
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
    return refreshSheet();
  }
  prevMil2(m);
};
