'use strict';
// «Лавка Короля» — как «Магазин» оригинала: плашка «Казна Королевства» и плитки разделов по 3 в ряд; в разделе — свои плитки или окно.
// Сервер: server/src/shop.js, API { t: 'shop', op: view | speed | res | treasure | move | moveprov | frame | frameuse | fest | rep }.
// Премиум, Защита и Подарки открывают свои окна (premium.js, shieldwin.js, профиль игрока). Кнопки ускорения есть и в окне строящегося здания (app.js).
S.shop = null; S.shopTab = { tele: 'prov', loyal: 'res' }; S.shopGot = null; S.shopRepCoins = 10;
// пока лавка не открыта для всех — её видит только администратор (сервер проверяет так же)
const shopVisible = () => !!(S.st && S.st.user && (S.st.user.admin || (S.cat && S.cat.shopOpen)));
const SG = (n) => `${GFX}shop/${n}.png`;
const shopCoin = (n) => `<img class="shcoin" src="${GFX}coins_s.png" alt=""> ${fmtFull(n)}`;
const shopKey = (q) => (q.wall ? 'wall' : `${q.view}:${q.cell}`);
// окна лавки помечены .shop — ответ сервера перерисовывает их и показывает плашку итога; в других окнах — всплывающей строкой
const shopOpenWin = (w) => { w.shop = true; openSheet(w); };
const shopTop = () => { const t = S.sheets[S.sheets.length - 1]; return !!(t && t.shop); };
function openShop() { S.shopNote = null; S.shopGot = null; send({ t: 'shop', op: 'view' }); shopOpenWin(shopWin); }
// цена «Достроить сейчас»: finishPer монеты за каждые 15 минут, не меньше finishMin (числа — с сервера)
const shopFinish = (q) => { const s = S.shop || { finishStep: 15, finishPer: 3, finishMin: 6 }; return Math.max(s.finishMin, Math.ceil(Math.max(0, q.end - Date.now()) / (s.finishStep * 60000)) * (s.finishPer || 1)); };
// две кнопки ускорения для одной стройки
function shopSpeedBtns(q) {
  if (!shopVisible()) return '';
  const left = q.end - Date.now(), hour = (S.shop && S.shop.speedHour) || 5;
  return `<div class="shbtns">${left > 3600000 ? `<button class="pbar" data-shspeed="${shopKey(q)}" data-mode="hour" data-cost="${hour}">⏩ −1 час · ${shopCoin(hour)}</button>` : ''}
    <button class="pbar gold" data-shspeed="${shopKey(q)}" data-mode="finish" data-cost="${shopFinish(q)}">⚡ Достроить сейчас · ${shopCoin(shopFinish(q))}</button></div>`;
}

// ---------- общие куски окон ----------
const shopCash = (extra = '') => `<div class="shcash">Казна Королевства: ${shopCoin(S.st.user.gold || 0)}${extra}</div>`;
const shopNoteHtml = () => (S.shopNote && S.shopNote.w === S.sheets[S.sheets.length - 1] && Date.now() - S.shopNote.at < 8000 ? `<div class="smnote shnote ${S.shopNote.ok ? 'ok' : ''}">${S.shopNote.ok ? '✔' : '⛔'} ${esc(S.shopNote.msg)}</div>` : '');
const shopHead = (title) => `${ribbon(title)}${shopNoteHtml()}`;
const shTile = (img, name, act, cls = '') => `<button class="ptile shtile ${cls}" ${act}><img src="${img}" alt=""><span>${esc(name)}</span></button>`;
// сетка по 3 в ряд; пустые места в последнем ряду — пунктиром, как в оригинале
const shGrid = (tiles) => `<div class="ptiles shgrid">${tiles.join('')}${'<div class="ptile shempty"></div>'.repeat((3 - (tiles.length % 3)) % 3)}</div>`;
const shopBusy = () => (!S.shop ? '<p class="parch-note">Загрузка…</p>' : '');
const shopLack = (cost) => { const gold = S.st.user.gold || 0; return gold < cost ? `<div class="shlack">Недостаточно: <span class="bad">${shopCoin(cost - gold)}</span></div>` : ''; };

// ---------- главное окно: разделы ----------
const SHOP_SECS = [['gold', 'Золото', 'gold'], ['res', 'Ресурсы', 'res'], ['premium', 'Премиум', 'premium'],
  ['treas', 'Сокровища', 'chest4'], ['rep', 'Репутация', 'reputation'], ['gifts', 'Подарки', 'gifts'],
  ['shield', 'Защита', 'dome'], ['tele', 'Телепорт', 'teleport'], ['loyal', 'Лояльность', 'loyalty'],
  ['speed', 'Ускорения', 'speed'], ['frames', 'Рамки', 'frame_gold']];
function shopWin() {
  const s = S.shop;
  return `${shopHead('Лавка Короля')}${shopCash()}${s && !s.open ? '<p class="bwline center small shwarn">🔒 Лавку пока видите только Вы (администратор). Для всех — SHOP_OPEN=1 в game.env.</p>' : ''}
    ${shGrid(SHOP_SECS.map(([id, name, img]) => shTile(SG(img), name, `data-shsec="${id}"`)))}`;
}
function shopSec(id) {
  if (id === 'premium') return openPremium();
  if (id === 'shield') return openShield();
  if (id === 'gifts') { const who = prompt('Кому подарок? Ник игрока:'); if (who && who.trim()) send({ t: 'profile', login: who.trim() }); return; } // в профиле — «Подарок»
  const W = { gold: shopGoldWin, res: shopResWin, treas: shopTreasWin, rep: shopRepWin, tele: shopTeleWin, loyal: shopLoyalWin, speed: shopSpeedWin, frames: shopFramesWin }[id];
  if (W) shopOpenWin(W);
}

// ---------- Золото: способы пополнения (без чужих логотипов) ----------
function shopGoldWin() {
  const pay = S.cat.pay && S.cat.pay.on ? S.cat.pay : null;
  return `${shopHead('Золото')}${shopCash()}${shGrid([shTile(SG('stars'), 'Звёзды', `data-shpay="${pay ? 'stars' : 'off'}"`, pay ? '' : 'off'), shTile(SG('card'), 'Карта / СБП', 'data-shpay="soon"', 'off')])}
    <p class="parch-note">${pay ? `Звёзды Telegram: ${pay.rate} ⭐ = 1 монета, монеты сразу придут в Казну.` : 'Оплата звёздами пока не подключена.'} Оплата картой и через СБП — скоро.</p>`;
}

// ---------- Ресурсы: S…XXXL одного ресурса и пакеты «все четыре» ----------
const SHOP_RES = [['wood', 'Дерево'], ['stone', 'Камень'], ['iron', 'Железо'], ['food', 'Еда'], ['pack', 'Пакеты']];
const shopResLeft = (s) => `<p class="parch-note">${s.resLeft > 0 ? `Сегодня можно купить ещё ${s.resLeft} из ${s.dayLimit}.` : `На сегодня все ${s.dayLimit} покупки сделаны — следующие завтра.`} Ресурсы — сразу в этот замок; что не влезет в Склады — в Кладовую.</p>`;
function shopResWin() {
  const s = S.shop;
  return `${shopHead('Ресурсы')}${shopCash()}${shGrid(SHOP_RES.map(([k, name]) => shTile(SG(k === 'pack' ? 'res' : k), name, `data-shrk="${k}"`)))}${s ? shopResLeft(s) : shopBusy()}`;
}
function shopResKind(k) {
  const s = S.shop, c = S.st.castle, gold = S.st.user.gold || 0, pack = k === 'pack', name = (SHOP_RES.find((x) => x[0] === k) || [])[1] || '';
  const store = pack ? '' : `<div>На складе: <img class="shres" src="gfx3d/res/${k}.png" alt=""> ${fmtFull(Math.floor(resNow(k)))}/${fmtFull(c.cap[k])}</div>`;
  if (!s) return `${shopHead(name)}${shopCash(store)}${shopBusy()}`;
  const tiles = s.sizes.map((z, i) => { const cost = pack ? z.pack : z.gold, ok = gold >= cost && s.resLeft > 0;
    return `<button class="ptile shsz ${ok ? 'ok' : 'off'}" data-shbuy="${k}" data-sz="${i}" data-cost="${cost}" data-what="${esc(`${name} ${z.k}: ${pack ? 'все ресурсы по ' : ''}${fmtFull(z.n)}`)}">
      <b class="shszk">${z.k}</b><span class="shszn">${pack ? '4×' : ''}${fmtFull(z.n)}</span><img src="${SG(pack ? 'res' : k)}" alt=""><span class="shszp">${shopCoin(cost)}</span></button>`; });
  return `${shopHead(name)}${shopCash(store)}<div class="ptiles shgrid">${tiles.join('')}</div>${shopResLeft(s)}`;
}

// ---------- Сокровища: сундуки и окно «Содержит: от … до …» ----------
const SHOP_ITEM = () => ({ res: ['Ресурсы (каждого)', SG('res')], runes: ['Руны (случайные)', `${GFX}world/rune_str.png`],
  art0: ['Артефакт обычный', `${GFX}${ART_ICON.def}`, 'artr0'], art1: ['Артефакт редкий', `${GFX}${ART_ICON.def}`, 'artr1'], art2: ['Артефакт легендарный', `${GFX}${ART_ICON.def}`, 'artr2'],
  royal: ['Лояльность', `${GFX}smallicon/hd/loyalty.png`], exp: ['Опыт генерала', `${GFX}stash/exp.png`], rep: ['Репутация', SG('reputation')],
  ...Object.fromEntries([320, 321, 322, 323].map((id) => { const u = unitById(id); return [`u${id}`, [u ? u.name : 'Нежить', u ? unitSrc(u) : '', 'shunit']]; })) }); // нежить (army.js UNDEAD)
function shopTreasWin() {
  const s = S.shop, gold = S.st.user.gold || 0;
  return `${shopHead('Сокровища')}${shopCash()}${s ? shGrid(s.treasures.map((t) => `<button class="ptile shchest ${gold >= t.gold ? 'ok' : ''}" data-shtr="${t.id}"><img src="${SG(t.img)}" alt=""><span class="shszp">${shopCoin(t.gold)}</span></button>`)) : shopBusy()}
    <p class="parch-note">Нажмите на сундук — покажу, что в нём бывает.</p>`;
}
function shopTreasOne(id) {
  const s = S.shop, t = s && s.treasures.find((x) => x.id === id); if (!t) return `${shopHead('Сокровища')}${shopBusy()}`;
  const IT = SHOP_ITEM(), gold = S.st.user.gold || 0, got = S.shopGot && S.shopGot.id === id ? S.shopGot.lines : null;
  const rows = t.items.map(([k, a, b, p]) => `<div class="shtrow"><img class="${IT[k][2] || ''}" src="${IT[k][1]}" alt=""><span class="shtrn">${IT[k][0]}</span>${p ? `<b class="shtrv">${a === b ? fmtFull(a) : `${fmtFull(a)}–${fmtFull(b)}`} <span class="shtrf">(шанс ${Math.round(p * 100)}%)</span></b>`
    : a === b ? `<b class="shtrv">${fmtFull(a)}</b>` : `<span class="shtrf">от</span><b>${fmtFull(a)}</b><span class="shtrf">до</span><b>${fmtFull(b)}</b>`}</div>`).join('');
  return `${shopHead('Сокровища')}<div class="shtrhead"><img src="${SG(t.img)}" alt=""><b>${esc(t.name)}</b></div>
    <div class="shtrbox"><div class="shtrcap">Содержит:</div>${rows}</div>
    ${got ? `<div class="shgot"><b>Выпало:</b>${got.map((l) => `<div>${esc(l)}</div>`).join('')}</div><button class="pbar" data-shstash>📦 Открыть Кладовую</button>` : ''}
    <p class="parch-note small">Ресурсы, нежить, лояльность и опыт генерала — в Кладовую, руны — к вашим рунам, артефакты — в Сокровищницу столицы (полна — разбиваются на осколки). Всё, что выпало, придёт и отчётом.</p>
    ${shopLack(t.gold) || `<button class="shbuy" data-shtrbuy="${t.id}" data-cost="${t.gold}" data-name="${esc(t.name)}">Купить за ${shopCoin(t.gold)}</button>`}`;
}

// ---------- Репутация: своя, за монеты ----------
function shopRepWin() {
  const s = S.shop; if (!s) return `${shopHead('Репутация')}${shopBusy()}`;
  const k = s.repPerGold, c = S.shopRepCoins;
  return `${shopHead('Репутация')}${shopCash()}<div class="shtrhead"><img src="${SG('reputation')}" alt=""><div><b>Ваша репутация: ${fmtFull(s.rep)}</b><div>${repIcons(s.rep)}</div></div></div>
    <div class="bwline center">1 ${gimg('coins_s.png', 'ri')} = ${k} 👍</div>
    <div class="arow"><span>Монет:</span><input class="anum" type="number" inputmode="numeric" min="1" value="${c}" data-shrepc></div>
    <div class="bwline center">Станет: <b data-shrepafter>${fmtFull(s.rep + c * k)}</b></div>
    <button class="shbuy" data-shrepgo>Поднять за ${gimg('coins_s.png', 'ri')} <span data-shrepcost>${fmtFull(c)}</span></button>
    <p class="parch-note small">Поднять репутацию другому игроку — в его профиле.</p>`;
}

// ---------- Телепорт замка: в провинцию (случайное место) или на координаты ----------
function shopTeleWin() {
  const s = S.shop, c = S.st.castle, tab = S.shopTab.tele; if (!s) return `${shopHead('Телепорт замка')}${shopBusy()}`;
  const cost = tab === 'prov' ? s.moveProvGold : s.moveGold;
  const tabs = `<div class="shtabs"><button class="${tab === 'prov' ? 'on' : ''}" data-shtab="tele:prov">Провинция</button><button class="${tab === 'xy' ? 'on' : ''}" data-shtab="tele:xy">Координаты</button></div>`;
  const where = `<div class="shtl"><span>Текущие:</span><b>X: ${c.x}  Y: ${c.y}</b></div><div class="shtl"><span>Провинция:</span><b>№${provNum(c.x, c.y)}</b></div>`;
  const body = tab === 'prov'
    ? `${where}<div class="shtl"><span>В провинцию №:</span><input name="p" type="number" inputmode="numeric" min="1" required></div><div class="shtl"><span>Новые:</span><b>случайные</b></div>`
    : `${where}<div class="shtl"><span>Новые:</span><input name="x" type="number" inputmode="numeric" placeholder="X" required><input name="y" type="number" inputmode="numeric" placeholder="Y" required></div>`;
  return `${shopHead('Телепорт замка')}${shopCash()}${tabs}<form class="shtele" data-shtele="${tab}">${body}<div class="shtl"><span>Стоимость:</span><b>${shopCoin(cost)}</b></div>
    ${shopLack(cost) || '<button class="shbuy">Переехать</button>'}</form>
    <p class="parch-note small">*Знания старейшин переносят замок только на свободное место: не у границы провинции, не на лагере, не ближе 2 клеток к другим замкам, в провинции меньше 10 замков. Армии должны быть дома.</p>`;
}

// ---------- Лояльность: праздники Резиденции (за ресурсы / за золото) ----------
const FEST_IMG = { fair: 'fair', tournament: 'tournament', feast: 'feast' };
function shopLoyalWin() {
  const s = S.shop, tab = S.shopTab.loyal; if (!s) return `${shopHead('Повышение лояльности')}${shopBusy()}`;
  const tabs = `<div class="shtabs"><button class="${tab === 'res' ? 'on' : ''}" data-shtab="loyal:res">${gimg('../gfx3d/res/wood.png', 'ri')} Ресурсы</button><button class="${tab === 'gold' ? 'on' : ''}" data-shtab="loyal:gold">${gimg('coins_s.png', 'ri')} Золото</button></div>`;
  const now = Date.now(), list = s.fests.filter((f) => (tab === 'gold' ? f.gold > 0 : !f.gold));
  const cards = list.map((f) => { const ready = f.readyAt <= now, price = f.gold ? shopCoin(f.gold) : Object.entries(f.cost || {}).map(([r, v]) => `${RES_IC[r]} ${fmtFull(v)}`).join(' ');
    return `<div class="shfest"><img src="${SG(FEST_IMG[f.id] || 'loyalty')}" alt=""><div class="shgrow"><b>${esc(f.name)}</b><span class="small">${esc(f.desc)}</span>
      <span>Лояльность: ${CROWN()} +${fmtFull(f.gain)}</span><span class="small">Стоимость: ${price}</span>
      ${!ready ? `<span class="small muted">Снова через <span class="cd" data-e="${f.readyAt}"></span></span>` : (f.gold && shopLack(f.gold)) || `<button class="shbuy" data-shfest="${f.id}">Провести праздник</button>`}</div></div>`; }).join('');
  return `${shopHead('Повышение лояльности')}${shopCash()}${tabs}
    <p class="bwline center small">${CROWN()} Лояльность населения позволяет основывать и захватывать замки. Сейчас: <b>${fmtFull(s.royal)}</b>. Каждый праздник — раз в сутки, нужна Резиденция в этом замке.</p>${cards}`;
}

// ---------- Ускорения стройки ----------
function shopSpeedWin() {
  const c = S.st.castle, qs = (c.queue || []).filter((q) => q.end > Date.now()).sort((a, b) => a.end - b.end);
  return `${shopHead('Ускорения')}${shopCash()}${qs.length ? qs.map((q) => { const def = S.by[q.building];
    return `<div class="shcard"><img class="shico" src="${bsrc(q.building)}" alt=""><div class="shgrow"><b>${esc(q.wall ? 'Стена' : def.name)} · ${q.level} ур.</b>
      <span class="small">Осталось: <span class="cd" data-e="${q.end}"></span></span>${shopSpeedBtns(q)}</div></div>`; }).join('')
    : `<p class="parch-note">Сейчас в «${esc(c.name)}» ничего не строится.</p>`}`;
}

// ---------- Рамки аватара ----------
function shopFramesWin() {
  const s = S.shop, me = S.st.user; if (!s) return `${shopHead('Рамки аватара')}${shopBusy()}`;
  return `${shopHead('Рамки аватара')}${shopCash()}${s.frames.map((f) => `<div class="shcard"><span class="shava">${avatarImg({ id: me.id, race: me.race, avatar: me.avatar, frame: f.id })}</span><div class="shgrow"><b>${esc(f.name)}</b>
      <span class="small">${f.own ? (s.frame === f.id ? '✅ Надета — её видят все.' : 'Куплена навсегда.') : 'Навсегда. Видна в профиле, переписке и ЗАГСе.'}</span>
      ${f.own ? (s.frame === f.id ? '<button class="pbar" data-shframe="" data-use="1">Снять</button>' : `<button class="pbar" data-shframe="${f.id}" data-use="1">Надеть</button>`)
    : `<button class="pbar gold" data-shframe="${f.id}" data-cost="${f.gold}" data-name="${esc(f.name)}">Купить · ${shopCoin(f.gold)}</button>`}</div></div>`).join('')}`;
}
for (const w of [shopWin, shopGoldWin, shopResWin, shopTreasWin, shopRepWin, shopTeleWin, shopLoyalWin, shopSpeedWin, shopFramesWin]) w.shop = true;

function shopMsg(m) {
  S.shop = m.data;
  if (m.op === 'treasure' && m.lines) S.shopGot = { id: S.shopTr, lines: m.lines };
  if (m.note) { if (shopTop()) S.shopNote = { ...m.note, at: Date.now(), w: S.sheets[S.sheets.length - 1] }; else toast(m.note.msg, m.note.ok ? '' : 'err'); } // плашка — только в окне покупки; в окне здания — строкой над картой
  if (shopTop()) refreshSheet();
}
const shopNoGold = (cost) => { const gold = S.st.user.gold || 0; if (gold >= cost) return false; toast(`Не хватает монет: нужно ${cost}, у вас ${gold}.`, 'err'); return true; };
$('#sheetBody').addEventListener('click', (e) => {
  const d = (e.target.closest('[data-shsec],[data-shpay],[data-shrk],[data-shbuy],[data-shtr],[data-shtrbuy],[data-shtab],[data-shfest],[data-shrepgo],[data-shstash],[data-shframe],[data-shspeed]') || {}).dataset;
  if (!d) return;
  if (d.shsec) return shopSec(d.shsec);
  if (d.shpay) return d.shpay === 'stars' ? openSheet(payWin) : toast(d.shpay === 'soon' ? 'Оплата картой и через СБП — скоро.' : 'Оплата звёздами пока не подключена.');
  if (d.shrk) { const k = d.shrk, w = () => shopResKind(k); return shopOpenWin(w); }
  if (d.shbuy) {
    if (S.shop && S.shop.resLeft <= 0) return toast(`На сегодня все ${S.shop.dayLimit} покупки ресурсов сделаны — следующие завтра.`, 'err');
    if (shopNoGold(Number(d.cost)) || !confirm(`Купить ${d.what} за ${coinsZa(Number(d.cost))}?`)) return;
    return send({ t: 'shop', op: 'res', res: d.shbuy, size: Number(d.sz) });
  }
  if (d.shtr) { const id = d.shtr, w = () => shopTreasOne(id); S.shopTr = id; S.shopGot = null; return shopOpenWin(w); }
  if (d.shtrbuy) { if (shopNoGold(Number(d.cost)) || !confirm(`Купить «${d.name}» за ${coinsZa(Number(d.cost))}?`)) return; S.shopTr = d.shtrbuy; return send({ t: 'shop', op: 'treasure', id: d.shtrbuy }); }
  if (d.shtab) { const [k, v] = d.shtab.split(':'); S.shopTab[k] = v; return refreshSheet(); }
  if (d.shfest) return send({ t: 'shop', op: 'fest', id: d.shfest });
  if (d.shrepgo !== undefined) { const c = S.shopRepCoins; if (shopNoGold(c) || !confirm(`Поднять свою репутацию на ${c * ((S.shop && S.shop.repPerGold) || 2)} за ${coinsZa(c)}?`)) return; document.activeElement && document.activeElement.blur(); return send({ t: 'shop', op: 'rep', coins: c }); }
  if (d.shstash !== undefined) return openStash();
  if (d.shframe !== undefined) {
    if (d.use) return send({ t: 'shop', op: 'frameuse', id: d.shframe });
    const cost = Number(d.cost); if (shopNoGold(cost) || !confirm(`Купить «${d.name}» за ${coinsZa(cost)}? Навсегда.`)) return;
    return send({ t: 'shop', op: 'frame', id: d.shframe });
  }
  if (d.shspeed) {
    const cost = Number(d.cost); if (shopNoGold(cost)) return;
    if (!confirm(d.mode === 'hour' ? `Ускорить стройку на 1 час за ${coinsZa(cost)}?` : `Достроить сейчас за ${coinsZa(cost)}?`)) return;
    return send({ t: 'shop', op: 'speed', key: d.shspeed, mode: d.mode });
  }
});
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-shopopen]')) openShop(); });
$('#sheetBody').addEventListener('input', (e) => {
  if (e.target.dataset.shrepc === undefined || !S.shop) return;
  const k = S.shop.repPerGold; S.shopRepCoins = Math.max(1, Math.floor(Number(e.target.value)) || 1);
  $('[data-shrepafter]').textContent = fmtFull(S.shop.rep + S.shopRepCoins * k); $('[data-shrepcost]').textContent = fmtFull(S.shopRepCoins);
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-shtele]'); if (!f) return; e.preventDefault();
  const s = S.shop || {}, c = S.st.castle;
  if (f.dataset.shtele === 'prov') {
    const p = Math.floor(Number(f.p.value)), cost = s.moveProvGold || 250; if (!(p > 0)) return;
    if (shopNoGold(cost) || !confirm(`Перенести «${c.name}» в провинцию №${p} на случайное свободное место за ${coinsZa(cost)}?`)) return;
    return send({ t: 'shop', op: 'moveprov', prov: p });
  }
  const x = Math.floor(Number(f.x.value)), y = Math.floor(Number(f.y.value)), cost = s.moveGold || 500;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (shopNoGold(cost) || !confirm(`Перенести «${c.name}» на ${x}:${y} за ${coinsZa(cost)}?`)) return;
  send({ t: 'shop', op: 'move', x, y });
});
