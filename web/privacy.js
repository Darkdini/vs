'use strict';
// «Приватность» (Почта → Приват.): кто может писать мне в личку и чёрный список. Сервер: server/src/privacy.js (t:'privacy').

S.privacy = null;
function openPrivacy() { S.privacy = null; send({ t: 'privacy' }); openSheet(privacyWin); }
const isBlack = (id) => ((S.st && S.st.user.black) || []).includes(Number(id));
function privacyWin() {
  const p = S.privacy;
  if (!p) return `${ribbon('Приватность')}<p class="parch-note">Загрузка…</p>`;
  return `${ribbon('Приватность')}
    <div class="clabel">Кто может писать мне личные сообщения и присылать фото:</div>
    <div class="pvwho">${Object.entries(p.options).map(([k, t]) => `<label class="cchk"><input type="radio" name="pvwho" value="${k}" ${p.who === k ? 'checked' : ''} data-pvwho><i></i> ${esc(t)}</label>`).join('')}</div>
    <p class="coinhint">Администрация и модераторы могут писать всегда.</p>
    ${ribbon(`Чёрный список - ${p.black.length}`)}
    <p class="coinhint">Игроки из списка не могут писать Вам, присылать фото и подарки, звать в ЗАГС и вызывать в «Орёл-решку». Их сообщения в общем чате у Вас скрыты.</p>
    <form class="chatform" data-form="pvadd"><input name="who" placeholder="Ник игрока" autocapitalize="none" autocomplete="off"><button class="btn primary small">Добавить</button></form>
    ${p.black.length ? p.black.map((u) => `<div class="pvrow"><button class="rrow" data-cprof="${u.id}"><span class="avasm">${u.avatar ? `<img src="avatar/${u.id}.png?v=${u.avatar}" alt="">` : raceAva(u.race)}</span><span class="rn"><b>${esc(u.login)}</b></span></button>
      <button class="zbar cbno" data-pvdel="${u.id}">Убрать</button></div>`).join('') : '<p class="parch-note">Чёрный список пуст.</p>'}`;
}
function privacyMsg(m) { S.privacy = m.data; refreshSheet(); }
$('#sheetBody').addEventListener('change', (e) => { if (e.target.dataset.pvwho !== undefined) send({ t: 'privacy', op: 'who', who: e.target.value }); });
$('#sheetBody').addEventListener('click', (e) => {
  const d = e.target.closest('[data-pvdel]'); if (d) return send({ t: 'privacy', op: 'del', id: Number(d.dataset.pvdel) });
  const b = e.target.closest('[data-blackop]'); if (!b) return;
  const id = Number(b.dataset.blackop);
  if (isBlack(id)) send({ t: 'privacy', op: 'del', id });
  else if (confirm(`Добавить ${b.dataset.nick} в чёрный список? Он(а) не сможет писать Вам, дарить подарки и звать в игры.`)) send({ t: 'privacy', op: 'add', who: id });
  setTimeout(() => send({ t: 'profile', id }), 300);
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form="pvadd"]'); if (!f) return;
  e.preventDefault(); e.stopPropagation();
  const who = f.who.value.trim(); if (who) send({ t: 'privacy', op: 'add', who });
}, true);
