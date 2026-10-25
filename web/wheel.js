'use strict';
// «Колесо Фортуны» в общем чате (сервер: server/src/wheel.js). Админ запускает (кнопка 🎰 в чате), игроки жмут «Участвую».
// Карточка записи: призы в рамках Лавки (ресурсы — серебро, золото и опыт — золото, воин — огонь), таймер, «Участвую»;
// пока идёт запись, колесо закреплено вверху чата. Розыгрыш — новое сообщение «Колесо крутится»: лента ников (5 с) →
// лента призов (5 с) → итог. Полосы и победителя присылает сервер — у всех одно и то же.
// Лента едет CSS-анимацией с задержкой от начала розыгрыша: чат перерисовывается при каждом сообщении, а лента не прыгает.
S.wheels = {}; S.wheelPin = 0; S.wheelOpen = 0;
const WH = { p1: 5000, p2s: 6200, res: 12200, card: 106, at0: 2 }; // времена — как SPIN_MS на сервере; карточка 100 + 6 px
const WH_RES = { wood: ['shop/wood.png', 'дерева', 'дерево'], stone: ['shop/stone.png', 'камня', 'камень'], iron: ['shop/iron.png', 'железа', 'железо'], food: ['shop/food.png', 'еды', 'еда'] };
const WH_RACES = ['humans', 'elves', 'dwarves', 'orcs'], WH_FRAMES = ['silver', 'gold', 'fire'];
const whGold = (n) => `${fmtFull(n)} ${plural(n, 'золото', 'золота', 'золота')}`;
const whLeft = (until) => { const s = Math.max(0, Math.ceil((until - now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// приз ячейки: рамка по редкости, картинка, сколько (n — цифрой на картинке), что (t — слово на табличке) и полное название
function whPrize(c) {
  if (c.k === 'gold') return { f: 'gold', img: `${GFX}gifts/gold_coin.png`, n: c.n, t: 'золото', full: whGold(c.n) };
  if (c.k === 'exp') return { f: 'gold', img: `${GFX}units/${HD_DIR[S.st.user.race] || 'human/hd'}/general.png`, cls: 'top', n: c.n, t: 'опыт', full: `${fmtFull(c.n)} опыта генерала` };
  if (c.k === 'unit') return { f: 'fire', img: `${GFX}units/${c.img}.png`, cls: 'unit', n: c.n, t: 'воин', full: `${c.name} ×${c.n}` };
  const r = WH_RES[c.k] || WH_RES.wood; return { f: 'silver', img: `${GFX}${r[0]}`, n: c.n, t: r[2], full: `${fmtFull(c.n)} ${r[1]}` };
}
// число на картинке — коротко, чтобы влезало в рамку: 10 000, 250 тыс, 1,5 млн
const whAmt = (n) => (n >= 1e6 ? `${String(+(n / 1e6).toFixed(1)).replace('.', ',')} млн` : n >= 1e5 ? `${Math.round(n / 1e3)} тыс` : fmtFull(n));
const whBurst = () => `<img class="rl-burst" src="${GFX}coin/burst.png" alt="">`;
const whFrame = (p, burst) => `${burst ? whBurst() : ''}<span class="afr afr-${p.f} rl-prz"><span class="afr-in"><img class="${p.cls || ''}" src="${p.img}" alt="">${p.n ? `<span class="rl-amt">${whAmt(p.n)}</span>` : ''}</span><img class="afr-f" src="${GFX}shop/frame_${p.f}.png" alt=""></span>`;
// игрок: своя аватарка (или портрет расы) в своей рамке из Лавки (нет рамки — серебряная)
const whAva = (id, p, burst) => { const f = WH_FRAMES.includes(p.fr) ? p.fr : 'silver';
  const img = p.av ? `<img src="avatar/${Number(id)}.png?v=${Number(p.av)}" alt="">` : `<img class="raceava" src="${GFX}auth/race_${WH_RACES.includes(p.race) ? p.race : 'humans'}.webp" alt="">`;
  return `${burst ? whBurst() : ''}<span class="afr afr-${f}"><span class="afr-in">${img}</span><img class="afr-f" src="${GFX}shop/frame_${f}.png" alt=""></span>`; };
const whCard = (inner, label, cls = '') => `<div class="rl-card ${cls}">${inner}<div class="rl-nk">${label}</div></div>`;

// сообщение колеса в чате: m.wph — 'join' (запись) или 'spin' (розыгрыш)
function whCardHtml(m) {
  const w = S.wheels[m.wheel]; if (!w) return ' <span class="muted">🎰 Колесо Фортуны</span>';
  return `<div class="rl" data-wcard="${w.id}:${m.wph === 'spin' ? 'spin' : 'join'}">${m.wph === 'spin' ? whSpinHtml(w) : whJoinHtml(w)}</div>`;
}
// запись: какие призы в колесе, «Участвую» / «Вы участвуете», число участников, до старта; у админа — «Крутить сейчас», «Отменить»
function whJoinHtml(w) {
  const one = (k) => w.cells.find((c) => c.k === k), res = w.cells.filter((c) => WH_RES[c.k]), rare = ['gold', 'exp', 'unit'].map(one).filter(Boolean);
  const cards = [...rare.map((c) => { const p = whPrize(c); return whCard(whFrame(p), p.t); }),
    ...(res.length ? [whCard(whFrame({ f: 'silver', img: `${GFX}shop/res.png`, n: res[0].n }), 'ресурсы')] : [])].join('');
  const names = rare.map((c) => ({ gold: 'золото', exp: 'опыт', unit: 'воин' }[c.k])), list = names.length > 1 ? `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}` : names[0] || '';
  const unit = one('unit'), adm = S.st.user.admin, N = w.cells.length, cells = `${N} ${plural(N, 'ячейка', 'ячейки', 'ячеек')}`;
  const how = [rare.length ? `${cells}: ${list} — ${rare.length > 1 ? 'по одной' : 'одна'}${res.length ? ',' : '.'}` : `${cells} — все ресурсы по ${fmtFull(res[0].n)}.`,
    ...(rare.length && res.length ? [`ресурсы — ${res.length} по ${fmtFull(res[0].n)}.`] : []), ...(unit ? [`Воин: <b>${esc(unit.name)}</b>`] : [])].join('<br>');
  let foot = '';
  if (w.st === 'join') foot = `${adm ? `<div class="fpm rl-adm"><button data-wspin="${w.id}">Крутить сейчас</button><button data-wcancel="${w.id}">Отменить</button></div>`
    : w.mine ? '<div class="rl-in">✔ Вы участвуете — ждите розыгрыша</div>' : `<button class="rl-go" data-wjoin="${w.id}">Участвую</button>`}
    <div class="rl-foot">Участников: <b data-wn="${w.id}">${w.n}</b> · старт через <b data-wt="${w.until}">${whLeft(w.until)}</b></div>`;
  else if (w.st === 'cancel') foot = `<div class="rl-foot">${w.why === 'empty' ? 'Никто не записался — розыгрыш не состоялся.' : 'Розыгрыш отменён администратором.'}</div>`;
  else foot = `<div class="rl-foot">Запись закрыта · участников: ${w.n}</div>`;
  return `<div class="rl-rib">Колесо Фортуны</div><div class="rl-cap">Призы в колесе:</div><div class="rl-list">${cards}</div>
    <div class="rl-cap rl-how">${how}</div>${foot}`;
}
// розыгрыш: что показать сейчас (ники / призы / итог) — по времени от начала; на границе — перерисовать карточку
function whSpinHtml(w) {
  const el = now() - w.spinAt;
  if (!w.strip1 || el >= WH.res) return whResultHtml(w, el);
  whSchedule(w.id, (el < WH.p2s ? WH.p2s : WH.res) - el);
  return el < WH.p2s ? whStage1(w, el) : whStage2(w, el - WH.p2s);
}
// лента: нужная карточка (w.at) встаёт ровно под стрелки; delay < 0 — анимация уже идёт столько-то; --wd — когда засветится выигрыш
const whTrack = (w, items, el) => `<div class="rl-win"><div class="rl-track rl-run" style="left:calc(50% - ${WH.at0 * WH.card + 50}px);--d:${-(w.at - WH.at0) * WH.card}px;--wd:${Math.round(WH.p1 - el)}ms;animation-delay:${-Math.round(el)}ms">${items}</div><i class="rl-ptr t"></i><i class="rl-ptr b"></i></div>`;
function whStage1(w, el) {
  const items = w.strip1.map((id, i) => { const p = w.people[id] || { login: '—' }; return whCard(whAva(id, p, i === w.at), esc(p.login), i === w.at ? 'win' : ''); }).join('');
  return `<div class="rl-rib">Колесо Фортуны</div><div class="rl-cap">Кто получит приз?</div>${whTrack(w, items, el)}<div class="rl-foot">Участников: ${w.n} · крутится…</div>`;
}
function whStage2(w, el) {
  const items = w.strip2.map((ci, i) => { const p = whPrize(w.cells[ci]); return whCard(whFrame(p, i === w.at), p.t, i === w.at ? 'win' : ''); }).join('');
  const who = w.people[w.win] || { login: '—' };
  return `<div class="rl-rib">Колесо Фортуны</div><div class="rl-who">${whAva(w.win, who)}<span>Крутит: <b>${esc(who.login)}</b></span></div>${whTrack(w, items, el)}<div class="rl-foot">Участников: ${w.n} · крутится…</div>`;
}
function whResultHtml(w, el) {
  const c = w.cells[w.cell], p = whPrize(c), who = (w.people || {})[w.win] || { login: '—' };
  return `<div class="rl-rib">Колесо Фортуны</div><div class="rl-res${el < WH.res + 1500 ? ' rl-pop' : ''}">${whFrame(p, true)}<div class="rl-big">${esc(who.login)}</div>
    <div class="rl-got">🏆 выигрывает: <b>${esc(p.full)}</b></div><div class="rl-sub">${c.k === 'gold' ? 'Золото уже в Казне победителя' : 'Приз уже в Кладовой победителя'} · участников: ${w.n}</div></div>`;
}
// перерисовать карточки колеса в открытом чате (или окне колеса), не трогая остальной чат и поле ввода
const whTimers = {};
function whSchedule(id, ms) { if (whTimers[id]) return; whTimers[id] = setTimeout(() => { delete whTimers[id]; whUpdate(id); }, Math.max(30, ms + 30)); }
function whUpdate(id) {
  const w = S.wheels[id]; if (!w) return;
  const keep = $('#chatList') ? chatScrollSave() : null; // карточка поменяла высоту — лента чата на том же месте
  for (const el of document.querySelectorAll(`[data-wcard^="${id}:"]`)) el.innerHTML = el.dataset.wcard.endsWith(':spin') ? whSpinHtml(w) : whJoinHtml(w);
  if (keep) chatScrollRestore(keep);
}
// окно из закрепа: та же карточка записи
function wheelWin() { const w = S.wheels[S.wheelOpen];
  return `${ribbon('Колесо Фортуны')}${w ? `<div class="rl rl-sheet" data-wcard="${w.id}:join">${whJoinHtml(w)}</div>` : '<p class="parch-note">Розыгрыш завершён.</p>'}`; }
// запуск (админ): призы, ячейки, время записи
function wheelNewWin() {
  const o = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${t}</option>`, und = ((S.cat && S.cat.mil && S.cat.mil.units) || []).filter((u) => u.undead);
  return `${ribbon('Колесо Фортуны')}<div class="bwline center small">Игроки жмут «Участвую». Время записи вышло — колесо выбирает одного победителя, потом его приз. Золото, опыт и воин занимают по одной ячейке, остальные ячейки — ресурсы. 0 — без этого приза.</div>
    <form class="fform whform" data-form="wheel">
      <label>Золото<input name="gold" type="number" min="0" max="1000" value="1" inputmode="numeric"></label>
      <label>Опыт генерала<input name="exp" type="number" min="0" max="1000000" value="5000" inputmode="numeric"></label>
      <label>Воин из сундуков<select name="unit">${o('rand', 'Случайный', true)}${und.map((u) => o(u.id, esc(u.name))).join('')}${o(0, 'Без воина')}</select></label>
      <label>Ресурсы в ячейке<input name="res" type="number" min="0" max="1000000" value="10000" inputmode="numeric"></label>
      <label>Ячеек в колесе<select name="cells">${Array.from({ length: 17 }, (_, i) => o(i + 4, i + 4, i + 4 === 12)).join('')}</select></label>
      <label>Запись участников<select name="mins">${[1, 2, 3, 5, 10].map((n) => o(n, `${n} мин`, n === 1)).join('')}</select></label>
      <button class="lbar">Запустить колесо</button></form>`;
}
// закреп вверху чата: колесо, пока идёт запись (важнее опроса — оно короткое)
function whPinHtml() { const w = S.wheelPin && S.wheels[S.wheelPin]; if (!w || w.st !== 'join') return '';
  return `<button class="cpin" data-wopen="${w.id}"><span>📌 🎰 Колесо Фортуны · <b data-wt="${w.until}">${whLeft(w.until)}</b></span><b>${S.st.user.admin ? 'Открыть ›' : w.mine ? 'Вы участвуете ✓' : 'Участвую ›'}</b></button>`; }

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-wjoin],[data-wopen],[data-wspin],[data-wcancel]'); if (!t) return; // кнопка в меню админа «+» — ui3d.js
  e.stopImmediatePropagation(); const d = t.dataset;
  if (d.wopen) { S.wheelOpen = Number(d.wopen); return openSheet(wheelWin); }
  if (d.wjoin) return send({ t: 'wheel', op: 'join', id: Number(d.wjoin) });
  if (d.wspin) { if (confirm('Закрыть запись и крутить колесо сейчас?')) send({ t: 'wheel', op: 'spin', id: Number(d.wspin) }); return; }
  if (d.wcancel && confirm('Отменить розыгрыш? Призов никто не получит.')) send({ t: 'wheel', op: 'cancel', id: Number(d.wcancel) });
}, true);
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target; if (f.dataset.form !== 'wheel') return; e.preventDefault(); e.stopImmediatePropagation();
  const n = (k) => Math.floor(Number(f[k].value)) || 0;
  send({ t: 'wheel', op: 'create', gold: n('gold'), exp: n('exp'), unit: f.unit.value === 'rand' ? 'rand' : n('unit'), res: n('res'), cells: n('cells'), mins: n('mins') });
}, true);
// таймер «старт через» — раз в секунду только у тех надписей, что на экране
setInterval(() => { for (const el of document.querySelectorAll('[data-wt]')) el.textContent = whLeft(Number(el.dataset.wt)); }, 1000);

function whMsg(m) {
  const w = m.w; if (!w) return;
  S.wheels[w.id] = w;
  if (w.st === 'join') S.wheelPin = w.id; else if (S.wheelPin === w.id) S.wheelPin = 0;
  if (w.st === 'done') { const cm = S.chat.find((x) => x.wheel === w.id && x.wph === 'spin'); if (cm) { cm.text = `🏆 Колесо Фортуны: ${(w.people[w.win] || {}).login || ''} выигрывает ${w.prize}!`; chatLine(); } }
  if (m.made && S.sheets[S.sheets.length - 1] === wheelNewWin) closeSheet();
  const top = S.sheets[S.sheets.length - 1];
  if (top === chatWin) { chatPinUpdate(); whUpdate(w.id); } else if (top === wheelWin) { if (w.st === 'join' || w.id !== S.wheelOpen) refreshSheet(); else closeSheet(); }
}
const prevMilWh = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'wheel') return whMsg(m);
  if (m.t === 'wheeln') { const w = S.wheels[m.id]; if (w) { w.n = m.n; for (const el of document.querySelectorAll(`[data-wn="${m.id}"]`)) el.textContent = m.n; } return; }
  if (m.t === 'chatlog') { S.wheels = m.wheels || {}; S.wheelPin = m.wpin || 0; }
  return prevMilWh(m);
};
