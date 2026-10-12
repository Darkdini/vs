'use strict';
// «Лавка Короля»: покупки за золото. Ускорения стройки (−1 час, «Достроить сейчас») и сундуки ресурсов.
// Сервер: server/src/shop.js, API { t: 'shop', op: view | speed | chest }. Кнопки ускорения есть и в окне строящегося здания (app.js).
S.shop = null;
// пока лавка не открыта для всех — её видит только администратор (сервер проверяет так же)
const shopVisible = () => !!(S.st && S.st.user && (S.st.user.admin || (S.cat && S.cat.shopOpen)));
function openShop() { S.shopNote = null; send({ t: 'shop', op: 'view' }); openSheet(shopWin); }
const shopCoin = (n) => `<img class="shcoin" src="${GFX}coins_s.png" alt=""> ${fmtFull(n)}`;
const shopKey = (q) => (q.wall ? 'wall' : `${q.view}:${q.cell}`);
// цена «Достроить сейчас»: finishPer монеты за каждые 15 минут, не меньше finishMin (числа — с сервера)
const shopFinish = (q) => { const s = S.shop || { finishStep: 15, finishPer: 3, finishMin: 6 }; return Math.max(s.finishMin, Math.ceil(Math.max(0, q.end - Date.now()) / (s.finishStep * 60000)) * (s.finishPer || 1)); };
// две кнопки ускорения для одной стройки
function shopSpeedBtns(q) {
  if (!shopVisible()) return '';
  const left = q.end - Date.now(), hour = (S.shop && S.shop.speedHour) || 5;
  return `<div class="shbtns">${left > 3600000 ? `<button class="pbar" data-shspeed="${shopKey(q)}" data-mode="hour" data-cost="${hour}">⏩ −1 час · ${shopCoin(hour)}</button>` : ''}
    <button class="pbar gold" data-shspeed="${shopKey(q)}" data-mode="finish" data-cost="${shopFinish(q)}">⚡ Достроить сейчас · ${shopCoin(shopFinish(q))}</button></div>`;
}
function shopWin() {
  const s = S.shop, c = S.st.castle, gold = S.st.user.gold || 0;
  const head = `<div class="shhead"><img src="${GFX}shop/stall.png" alt=""><div><div class="cwname">Ваши монеты</div><b>${shopCoin(gold)}</b>
    <div class="small">Покупки — в «Казна → История».</div></div></div>`;
  const qs = (c.queue || []).filter((q) => q.end > Date.now()).sort((a, b) => a.end - b.end);
  const speed = qs.length ? qs.map((q) => { const def = S.by[q.building];
    return `<div class="shcard"><img class="shico" src="${bsrc(q.building)}" alt=""><div class="shgrow"><b>${esc(q.wall ? 'Стена' : def.name)} · ${q.level} ур.</b>
      <span class="small">Осталось: <span class="cd" data-e="${q.end}"></span></span>${shopSpeedBtns(q)}</div></div>`; }).join('')
    : `<p class="parch-note">Сейчас в «${esc(c.name)}» ничего не строится.</p>`;
  const chests = !s ? '<p class="parch-note">Загрузка…</p>' : s.chests.map((x) => `<div class="shcard"><img class="shico" src="${GFX}shop/${x.id}.png" alt=""><div class="shgrow"><b>${esc(x.name)}</b>
      <span class="small">${Object.entries(x.res).map(([r, v]) => `${RES_IC[r]} ${fmtFull(v)}`).join(' ')}</span>
      <button class="pbar" data-shchest="${x.id}" data-cost="${x.gold}" data-name="${esc(x.name)}" ${s.chestsLeft > 0 ? '' : 'disabled'}>Купить · ${shopCoin(x.gold)}</button></div></div>`).join('')
    + `<p class="bwline center small">Ресурсы падают в Кладовую — заберёте в любой свой замок. Сегодня можно ещё ${s.chestsLeft} из ${s.dayLimit}.</p>
      <button class="pbar" data-shstash>📦 Открыть Кладовую</button>`;
  const move = !s ? '' : `<div class="shcard"><img class="shico" src="${GFX}shop/move.png" alt=""><div class="shgrow"><b>«${esc(c.name)}» сейчас на ${c.x}:${c.y}</b>
      <span class="small">Перенести замок на выбранные координаты — только на свободное место: не у границы провинции, не на лагере, не ближе 2 клеток к другим замкам, в провинции меньше 10 замков. Армии должны быть дома.</span>
      <form class="shmove" data-shmove><input name="x" type="number" inputmode="numeric" placeholder="X" required><input name="y" type="number" inputmode="numeric" placeholder="Y" required>
      <button class="pbar gold">Переехать · ${shopCoin(s.moveGold)}</button></form></div></div>`;
  const me = S.st.user, frames = !s ? '' : s.frames.map((f) => `<div class="shcard"><span class="shava">${avatarImg({ id: me.id, race: me.race, avatar: me.avatar, frame: f.id })}</span><div class="shgrow"><b>${esc(f.name)}</b>
      <span class="small">${f.own ? (s.frame === f.id ? '✅ Надета — её видят все.' : 'Куплена навсегда.') : 'Навсегда. Видна в профиле, переписке и ЗАГСе.'}</span>
      ${f.own ? (s.frame === f.id ? '<button class="pbar" data-shframe="" data-use="1">Снять</button>' : `<button class="pbar" data-shframe="${f.id}" data-use="1">Надеть</button>`)
    : `<button class="pbar gold" data-shframe="${f.id}" data-cost="${f.gold}" data-name="${esc(f.name)}">Купить · ${shopCoin(f.gold)}</button>`}</div></div>`).join('');
  const n = S.shopNote && Date.now() - S.shopNote.at < 8000 ? `<div class="smnote shnote ${S.shopNote.ok ? 'ok' : ''}">${S.shopNote.ok ? '✔' : '⛔'} ${esc(S.shopNote.msg)}</div>` : '';
  return `${ribbon('Лавка Короля')}${n}${head}${s && !s.open ? '<p class="bwline center small shwarn">🔒 Лавку пока видите только Вы (администратор). Для всех — SHOP_OPEN=1 в game.env.</p>' : ''}${ribbon('⏩ Ускорить стройку')}${speed}${ribbon('📦 Ресурсы')}${chests}${ribbon('🏰 Переезд замка')}${move}${ribbon('✨ Рамки аватара')}${frames}`;
}
function shopMsg(m) {
  S.shop = m.data;
  if (m.note) { if (S.sheets.includes(shopWin)) S.shopNote = { ...m.note, at: Date.now() }; else toast(m.note.msg, m.note.ok ? '' : 'err'); } // в окне здания — строкой над картой
  if (S.sheets.includes(shopWin)) refreshSheet();
}
$('#sheetBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-shstash]')) return openStash();
  const fr = e.target.closest('[data-shframe]');
  if (fr) {
    if (fr.dataset.use) return send({ t: 'shop', op: 'frameuse', id: fr.dataset.shframe });
    const cost = Number(fr.dataset.cost), gold = S.st.user.gold || 0;
    if (gold < cost) return toast(`Не хватает монет: нужно ${cost}, у вас ${gold}.`, 'err');
    if (!confirm(`Купить «${fr.dataset.name}» за ${cost} монет? Навсегда.`)) return;
    return send({ t: 'shop', op: 'frame', id: fr.dataset.shframe });
  }
  const b = e.target.closest('[data-shspeed],[data-shchest]'); if (!b || b.disabled) return;
  const cost = Number(b.dataset.cost), gold = S.st.user.gold || 0;
  if (gold < cost) return toast(`Не хватает монет: нужно ${cost}, у вас ${gold}.`, 'err');
  if (b.dataset.shspeed) {
    if (!confirm(b.dataset.mode === 'hour' ? `Ускорить стройку на 1 час за ${cost} монет?` : `Достроить сейчас за ${cost} монет?`)) return;
    return send({ t: 'shop', op: 'speed', key: b.dataset.shspeed, mode: b.dataset.mode });
  }
  if (!confirm(`Купить «${b.dataset.name}» за ${cost} монет?`)) return;
  send({ t: 'shop', op: 'chest', id: b.dataset.shchest });
});
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-shopopen]')) openShop(); });
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-shmove]'); if (!f) return; e.preventDefault();
  const x = Math.floor(Number(f.x.value)), y = Math.floor(Number(f.y.value)), cost = (S.shop && S.shop.moveGold) || 500, gold = S.st.user.gold || 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (gold < cost) return toast(`Не хватает монет: нужно ${cost}, у вас ${gold}.`, 'err');
  if (!confirm(`Перенести «${S.st.castle.name}» на ${x}:${y} за ${cost} монет?`)) return;
  send({ t: 'shop', op: 'move', x, y });
});
