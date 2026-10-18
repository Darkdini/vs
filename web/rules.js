'use strict';
// «Правила игры» (сервер: server/src/rules.js, приходят в каталоге — S.cat.gameRules): Справка, форум, «Модерация».
// Мягкая модерация чата (server/src/chatmod.js):
// • «Предупредить» в меню сообщения — модератор выбирает пункт правил; у игрока окно «Предупреждение», пока он не нажмёт
//   «Понятно» (не в игре — при следующем входе: предупреждение приходит в состоянии игрока, S.st.user.warn).
// • Кнопка 🔒 у модератора вверху чата — закрыть чат на 5/10/15/30 минут: плашка с отсчётом, игроки не пишут.
S.chatClosed = 0; S.chatLock = false;
const gameRules = () => (S.cat && S.cat.gameRules) || { intro: '', list: [] };
// пункты правил: номер, текст, подпункты а) б)
function gameRulesHtml() {
  const R = gameRules();
  return `${R.intro ? `<p class="grintro">${esc(R.intro)}</p>` : ''}<div class="grhead">Нарушения</div>
    <ol class="grlist">${R.list.map((r) => `<li>${esc(r.text)}${r.sub ? `<ul class="grsub">${r.sub.map((x, i) => `<li><b>${'абвгд'[i]})</b> ${esc(x)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol>`;
}
const gameRulesWin = () => `${ribbon('Правила игры')}${gameRulesHtml()}`;
function openGameRules() { openSheet(gameRulesWin); }
// выбор пункта правил (модератору): предупреждение, бан в чате, блокировка
const ruleSelect = (attr, val) => `<select class="crule" ${attr}><option value="0">— пункт правил —</option>${gameRules().list.map((r, i) => `<option value="${i + 1}"${Number(val) === i + 1 ? ' selected' : ''}>${i + 1}. ${esc(r.short)}</option>`).join('')}</select>`;
const ruleLabelC = (n) => { const r = gameRules().list[n - 1]; return r ? `п. ${n} — ${r.short}` : ''; };

// ---- закрытый чат: плашка с отсчётом, поле ввода у игроков выключено ----
const chatIsMod = () => !!(S.st && S.st.user && (S.st.user.admin || S.st.user.mod));
const chatClosedNow = () => S.chatClosed > now();
const clLeft = (until) => { const s = Math.max(0, Math.ceil((until - now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function chatClosedHtml() {
  if (!chatClosedNow()) return '';
  return `<div class="cclosed"><img src="${GFX}menu/privacy.png" alt=""><span>Чат закрыт модератором — отдохните немного и успокойтесь. Откроется через <b data-ct="${S.chatClosed}">${clLeft(S.chatClosed)}</b>${chatIsMod() ? '<br><small>Вы модератор — вам писать можно.</small>' : ''}</span></div>`;
}
// окно «Закрыть чат» (модератор): на сколько минут или «Открыть сейчас»
function chatLockHtml() {
  if (!S.chatLock) return '';
  return `<div class="cpop-bg" data-clx><div class="cpop"><button class="cpop-x" data-clx aria-label="Закрыть">✕</button><div class="cpop-nick">${chatClosedNow() ? 'Чат закрыт' : 'Закрыть чат'}</div>
    <p class="clnote">${chatClosedNow() ? `Откроется сам через <b data-ct="${S.chatClosed}">${clLeft(S.chatClosed)}</b>. Можно открыть раньше или закрыть заново на другое время.` : 'Игроки не смогут писать, пока чат закрыт. Модераторы и администратор — могут. Чат откроется сам.'}</p>
    <div class="cpop-ban">${[5, 10, 15, 30].map((n) => `<button class="pbtn" data-clmin="${n}">${n} мин</button>`).join('')}${chatClosedNow() ? '<button class="pbtn cl-open" data-clmin="0">Открыть сейчас</button>' : ''}</div></div></div>`;
}
// обновить плашку и поле ввода в открытом чате, не перерисовывая окно (у игрока может быть набран текст)
function chatClosedUpdate() {
  if (S.sheets[S.sheets.length - 1] !== chatWin) return;
  const top = $('.chattop'); if (!top) return;
  const old = $('.cclosed'), html = chatClosedHtml();
  if (old) { if (html) old.outerHTML = html; else old.remove(); } else if (html) top.insertAdjacentHTML('afterend', html);
  const lb = $('[data-chatlock]'); if (lb) lb.classList.toggle('on', chatClosedNow());
  const inp = $('.chatbar input'), off = chatClosedNow() && !chatIsMod();
  if (inp) { inp.disabled = off; inp.placeholder = off ? 'Чат закрыт' : ''; }
  const sb = $('.chatbar .sendbtn'); if (sb) sb.disabled = off;
  if (S.chatLock) refreshSheet();
}
setInterval(() => {
  for (const el of document.querySelectorAll('[data-ct]')) el.textContent = clLeft(Number(el.dataset.ct));
  if (S.chatClosed && !chatClosedNow()) { S.chatClosed = 0; chatClosedUpdate(); } // время вышло (сервер тоже пришлёт «открыт»)
}, 1000);

// ---- предупреждение игроку: окно поверх игры, пока не нажмёт «Понятно» ----
function warnCheck() {
  const w = S.st && S.st.user && S.st.user.warn, old = document.getElementById('warnModal');
  if (!w) { if (old) old.remove(); return; }
  if (old && old.dataset.at === String(w.at)) return;
  if (old) old.remove();
  const r = gameRules().list[(w.rule || 0) - 1];
  const el = document.createElement('div'); el.id = 'warnModal'; el.className = 'cpop-bg warnbg'; el.dataset.at = String(w.at);
  el.innerHTML = `<div class="cpop warnpop"><div class="warnic"><img src="${GFX}menu/events.png" alt=""></div><div class="cpop-nick">Предупреждение</div>
    <p>${w.admin ? 'Администрация предупреждает' : `Модератор <b>${esc(w.by)}</b> предупреждает`} вас о нарушении правил игры:</p>
    <p class="warnwhy">${esc(w.why)}</p>${r ? `<p class="warnrule">${esc(r.text)}</p>` : ''}
    <p class="warnnote">Пожалуйста, общайтесь уважительно. При повторном нарушении — запрет писать в чат.</p>
    <button class="lbar" data-warnok>Понятно</button><button class="warnrules" data-warnrules>Правила игры</button></div>`;
  el.querySelector('[data-warnok]').addEventListener('click', () => { el.remove(); send({ t: 'chatmod', op: 'warnseen' }); });
  el.querySelector('[data-warnrules]').addEventListener('click', () => { el.remove(); send({ t: 'chatmod', op: 'warnseen' }); openGameRules(); });
  document.body.appendChild(el);
}

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-chatlock],[data-clmin],[data-clx],[data-cwarn],[data-gamerules]'); if (!t) return;
  e.stopImmediatePropagation(); const d = t.dataset;
  if (d.gamerules !== undefined) return openGameRules();
  if (d.chatlock !== undefined) { const a = document.activeElement; if (a && a.blur) a.blur(); S.chatLock = true; return refreshSheet(); }
  if (d.clx !== undefined) { if (e.target === t || t.classList.contains('cpop-x')) { S.chatLock = false; refreshSheet(); } return; }
  if (d.clmin !== undefined) {
    const n = Number(d.clmin);
    if (n && !confirm(`Закрыть чат на ${n} мин? Игроки не смогут писать.`)) return;
    S.chatLock = false; refreshSheet(); return send({ t: 'chatmod', op: 'close', minutes: n });
  }
  if (d.cwarn !== undefined) {
    const pp = S.chatPop; if (!pp) return;
    if (!pp.rule) return toast('Выберите пункт правил, который нарушен.', 'err');
    if (!confirm(`Предупредить ${pp.nick}: ${ruleLabelC(pp.rule)}?`)) return;
    send({ t: 'chatmod', op: 'warn', login: pp.nick, rule: pp.rule }); S.chatPop = null; return refreshSheet();
  }
}, true);
$('#sheetBody').addEventListener('change', (e) => { if (e.target.matches('[data-crule]') && S.chatPop) S.chatPop.rule = Number(e.target.value) || 0; });

const prevMilRules = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'chatclosed') { S.chatClosed = m.until || 0; return chatClosedUpdate(); }
  if (m.t === 'chatmodinfo') { if (S.chatPop && S.chatPop.nick === m.data.login) { S.chatPop.info = m.data; refreshSheet(); cpopShowAction(); } return; }
  if (m.t === 'chatlog') S.chatClosed = m.closed || 0;
  return prevMilRules(m);
};

// экран регистрации: «Правила игры» — окном поверх (окна игры до входа не открываются)
$('#rulesBtn').addEventListener('click', () => {
  const el = document.createElement('div'); el.className = 'cpop-bg warnbg';
  el.innerHTML = `<div class="cpop rulespop"><button class="cpop-x" aria-label="Закрыть">✕</button><div class="cpop-nick">Правила игры</div>
    <div class="rulesscroll">${gameRules().list.length ? gameRulesHtml() : '<p>Загрузка…</p>'}</div></div>`;
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.cpop-x')) el.remove(); });
  document.body.appendChild(el);
  // справочник ещё качается (только что открыли страницу) — правила появятся, как только он придёт
  if (!gameRules().list.length && S.catWait) S.catWait.then(() => { const b = el.querySelector('.rulesscroll'); if (b) b.innerHTML = gameRulesHtml(); });
});
