'use strict';
// «Биржа Замков» (Кабинет → Биржа): замки игроков за золото (цена от 300). Вкладки: «Продаются» (купить),
// «Продать замок» (свои замки, кроме столицы), «Мои лоты» (снять). Сервер: server/src/market.js.

S.market = null; S.marketTab = 'lots'; S.marketPrice = {};
function openMarket() { S.market = null; S.marketTab = 'lots'; send({ t: 'market' }); openSheet(marketWin); }
const MK_COIN = () => gimg('coins_s.png', 'ri');
function marketCastle(c, hidden) {
  return `<div class="mkc"><img class="mkimg" src="${GFX}ground/castle_small.png" alt=""><div class="mkinfo"><b>${esc(c.name)}</b>
    <button class="rlink mkxy" data-goworld="${c.x},${c.y}">X: ${c.x}, Y: ${c.y}</button>
    ${hidden ? `<small>Рейтинг ${fmtFull(c.rating)}</small><small class="mklock">🔒 Армия, ресурсы и здания видны тем, у кого хватает золота на покупку.</small>`
    : `<small>Рейтинг ${fmtFull(c.rating)} · Ратуша ${c.townhall} ур. · зданий ${c.buildings}${c.army ? ` · армия ${fmtFull(c.army)}` : ''}${c.wall ? ` · стена ${c.wall} ур.` : ''}${c.arts ? ` · артефактов ${c.arts}` : ''}</small>
    <small class="mkres">${['wood', 'stone', 'iron', 'food'].map((r) => `<img src="gfx3d/res/${r}.png" alt=""> ${fmtN(c.res[r])}`).join(' ')}</small>`}</div></div>`;
}
function marketWin() {
  const m = S.market;
  const tabs = `<div class="coin-tabs">${[['lots', 'Продаются'], ['sell', 'Продать замок'], ['mine', 'Мои лоты']].map(([k, t]) => `<button class="${S.marketTab === k ? 'on' : ''}" data-mktab="${k}">${t}${k === 'lots' && m && m.lots.length ? ` (${m.lots.length})` : k === 'mine' && m && m.mine.length ? ` (${m.mine.length})` : ''}</button>`).join('')}</div>`;
  if (!m) return `${ribbon('Биржа Замков')}${tabs}<p class="parch-note">Загрузка…</p>`;
  let body;
  if (S.marketTab === 'lots') {
    body = `<p class="coinhint">Замки других правителей за золото. Покупка — сразу: замок со зданиями, ресурсами, стеной, артефактами и армией становится Вашим. У вас ${MK_COIN()} <b>${fmtFull(m.gold)}</b></p>
      ${m.lots.length ? m.lots.map((x) => `<div class="mklot">${marketCastle(x.castle, x.hidden)}<div class="mkfoot"><span>Продаёт <a class="plink" data-cprof="${x.seller.id}">${esc(x.seller.login)}</a></span>
        <button class="zbar mkbuy" data-mkbuy="${x.id}" ${m.gold < x.price ? 'disabled' : ''}>Купить за ${MK_COIN()} ${fmtFull(x.price)}</button></div></div>`).join('') : '<p class="parch-note">Сейчас на Бирже нет замков.</p>'}`;
  } else if (S.marketTab === 'sell') {
    body = `<p class="coinhint">Выставьте свой замок за золото — цена от ${m.min}. Столицу продать нельзя. Замок продаётся вместе с армией, что в нём стоит; генерал перейдёт в другой Ваш замок. Золото придёт в Казну. Лот держится 7 дней.</p>
      ${m.sell.length ? m.sell.map((c) => `<div class="mklot">${marketCastle(c)}${c.busy ? `<div class="mkbusy">Сейчас нельзя: ${esc(c.busy)}.</div>`
        : `<div class="mkfoot"><span class="mkprice">${MK_COIN()} <input class="anum" type="number" inputmode="numeric" min="${m.min}" value="${S.marketPrice[c.id] || m.min}" data-mkprice="${c.id}"></span>
          <button class="zbar" data-mksell="${c.id}">Выставить</button></div>`}</div>`).join('')
        : `<p class="parch-note">${m.castles < 2 ? 'У Вас только столица — её продать нельзя. Продавать можно второй и следующие замки.' : 'Все Ваши замки, кроме столицы, уже на Бирже.'}</p>`}`;
  } else {
    body = m.mine.length ? m.mine.map((x) => `<div class="mklot mine">${marketCastle(x.castle)}<div class="mkfoot"><span>Цена ${MK_COIN()} <b>${fmtFull(x.price)}</b><br><small>ещё <span class="cd" data-e="${x.exp}"></span></small></span>
      <button class="zbar cbno" data-mkcancel="${x.id}">Снять</button></div></div>`).join('') : '<p class="parch-note">Вы ничего не выставили на Биржу.</p>';
  }
  return `${ribbon('Биржа Замков')}${tabs}${body}`;
}
function marketMsg(m) {
  if (m.t === 'market') S.market = m.state;
  if (m.t === 'marketdone') okPopup(m.msg);
  refreshSheet();
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-mktab],[data-mkbuy],[data-mksell],[data-mkcancel]'); if (!t) return;
  const d = t.dataset, m = S.market;
  if (d.mktab) { S.marketTab = d.mktab; return refreshSheet(); }
  if (d.mkbuy) { const x = m.lots.find((k) => k.id === Number(d.mkbuy)); if (x && !confirm(`Купить замок «${x.castle.name}» у ${x.seller.login} за ${fmtFull(x.price)} золота?`)) return; t.disabled = true; return send({ t: 'marketbuy', id: Number(d.mkbuy) }); }
  if (d.mksell) { const c = m.sell.find((k) => k.id === Number(d.mksell)), price = Math.floor(Number(S.marketPrice[d.mksell] || m.min));
    if (price < m.min) return toast(`Цена — от ${m.min} золота.`, 'err');
    if (!confirm(`Выставить «${c.name}» на Биржу за ${fmtFull(price)} золота?`)) return; return send({ t: 'marketsell', id: Number(d.mksell), price }); }
  if (d.mkcancel) { if (confirm('Снять замок с Биржи?')) send({ t: 'marketcancel', id: Number(d.mkcancel) }); }
});
$('#sheetBody').addEventListener('input', (e) => { const id = e.target.dataset.mkprice; if (id) S.marketPrice[id] = Math.max(0, Math.floor(Number(e.target.value)) || 0); });
