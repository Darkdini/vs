'use strict';
// «Пригласить друга» (Кабинет → «Пригласить друга» и кнопка в Профиле; сервер — server/src/invite.js): своя ссылка на игру,
// условия подарка и приглашённые — их рейтинг и что с подарком. Ссылка — …/?ref=<код>: app.js запоминает код до регистрации
// и показывает на форме, кто пригласил. Подарки: другу — монеты за рейтинг friendRating, пригласившему — за рейтинг друга rating;
// если самого игрока пригласили (me), вверху — кто и что с его подарком.
S.inv = null;
function openFriendInvite() { S.inv = null; send({ t: 'invite' }); openSheet(inviteWin); }
const inviteLink = (code) => `${location.origin}/?ref=${code}`;
const INV_ST = {
  wait: (x, v) => `развивается: ${fmtFull(x.rating)} из ${fmtFull(v.rating)}`,
  gift: (x) => `<span class="rgood">🎁 подарок получен ${fmtDate(x.giftAt)}</span>`,
  cap: () => '⏳ подарок придёт в следующем месяце',
  same: () => '<span class="rbad">играет с вашего телефона — без подарка</span>',
};
function inviteWin() {
  const v = S.inv;
  if (!v) return `${ribbon('Пригласить друга')}<div class="bwline center muted">Загрузка…</div>`;
  const coins = (n) => `${n} ${plural(n, 'монету', 'монеты', 'монет')}`, me = v.me;
  const gift = `Премиум на ${v.days} ${plural(v.days, 'день', 'дня', 'дней')} и ${coins(v.gold)}`;
  const mine = !me ? '' : `<div class="invme">Вас пригласил <b>${esc(me.by)}</b>. ${me.same ? '<span class="rbad">Вы играете с его телефона — подарка нет.</span>'
    : me.got ? `<span class="rgood">🎁 Ваш подарок — ${coins(v.friendGold)} — получен ${fmtDate(me.got)}.</span>`
    : `Когда ваш рейтинг дойдёт до <b>${fmtFull(v.friendRating)}</b>, вы получите <b>${coins(v.friendGold)}</b>. Сейчас: ${fmtFull(me.rating)}.`}</div>`;
  return `${ribbon('Пригласить друга')}
    ${mine}<div class="invhead"><img src="gfx3d/prof/friend.png" alt=""><div>Пригласите друга в Средневековье по своей ссылке. Когда его рейтинг дойдёт до <b>${fmtFull(v.rating)}</b>, вы получите подарок: <b>${gift}</b>.</div></div>
    <div class="bwline small">Друг тоже получит подарок — <b>${coins(v.friendGold)}</b>, когда его рейтинг дойдёт до <b>${fmtFull(v.friendRating)}</b>.</div>
    <div class="invlink"><input readonly value="${esc(inviteLink(v.code))}" data-invlink aria-label="Ваша ссылка"><button class="pbtn" data-invcopy>Копировать</button></div>
    ${navigator.share ? '<button class="pbar" data-invshare>Отправить другу</button>' : ''}
    <div class="bwline small">Подарков за этот месяц: <b>${v.month} из ${v.perMonth}</b>. Если друзей больше — подарок за них придёт в следующем месяце.</div>
    <div class="bwline small">Друг должен играть со своего телефона: за аккаунт с вашего телефона подарка не будет.</div>
    ${ribbon('Приглашённые')}
    ${v.list.length ? v.list.map((x) => `<div class="invrow"><b>${esc(x.nick)}</b><small>${(INV_ST[x.st] || INV_ST.wait)(x, v)}</small></div>`).join('')
    : '<div class="bwline center muted">Пока никого. Отправьте ссылку друзьям!</div>'}`;
}
// копирование: где нет доступа к буферу (старые WebView), — выделить ссылку и скопировать по-старому
function inviteCopy(link) {
  const old = () => { const i = $('[data-invlink]'); if (!i) return toast('Скопируйте ссылку вручную'); i.select(); try { toast(document.execCommand('copy') ? 'Ссылка скопирована' : 'Скопируйте ссылку вручную'); } catch { toast('Скопируйте ссылку вручную'); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => toast('Ссылка скопирована'), old); else old();
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-frinv],[data-invcopy],[data-invshare],[data-invlink]'); if (!t) return;
  if (t.dataset.frinv !== undefined) return openFriendInvite();
  if (t.dataset.invlink !== undefined) return t.select();
  const link = S.inv && inviteLink(S.inv.code); if (!link) return;
  if (t.dataset.invcopy !== undefined) return inviteCopy(link);
  navigator.share({ title: 'Средневековье', text: 'Приглашаю в Средневековье — играем вместе!', url: link }).catch(() => {});
});
const prevMilInv = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'invite') { S.inv = m; if (S.sheets[S.sheets.length - 1] === inviteWin) refreshSheet(); return; }
  return prevMilInv(m);
};
