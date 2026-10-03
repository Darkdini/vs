'use strict';
// «Орёл-решка» (меню «Игры»): игра между игроками на ресурсы. Бросить вызов (ресурс, ставка, сторона, кому — или всем),
// список открытых вызовов («Принять»), свои вызовы («Отменить»), история; бросок монеты с анимацией. Сервер: server/src/coin.js.

S.coin = null; S.coinForm = { res: 'wood', amount: 500, side: 'eagle', to: '' }; S.coinTab = 'open';
const COIN_RES = { wood: ['Дерево', 'дерева'], stone: ['Камень', 'камня'], iron: ['Железо', 'железа'], food: ['Еда', 'еды'] };
const COIN_IC = (r) => `<img class="coinri" src="gfx3d/res/${r}.png" alt="">`;
const COIN_SIDE = { eagle: 'Орёл', tails: 'Решка' };
function openCoin(to) { S.coin = null; S.coinTab = to ? 'new' : 'open'; if (to) S.coinForm.to = to; send({ t: 'coin' }); openSheet(coinWin); }
function coinFace(side, cls = '') { return `<span class="coinface ${side} ${cls}"><img src="gfx3d/menu3/coin.png" alt=""><b>${side === 'eagle' ? '🦅' : '⚜'}</b></span>`; }
function coinWin() {
  const c = S.coin, f = S.coinForm;
  const tabs = `<div class="coin-tabs">${[['open', 'Вызовы'], ['new', 'Бросить вызов'], ['log', 'История']].map(([k, t]) => `<button class="${S.coinTab === k ? 'on' : ''}" data-cointab="${k}">${t}${k === 'open' && c && c.open.length ? ` (${c.open.length})` : ''}</button>`).join('')}</div>`;
  if (!c) return `${ribbon('Орёл-решка')}${tabs}<p class="parch-note">Загрузка…</p>`;
  let body = '';
  if (S.coinTab === 'open') {
    const one = (b) => `<div class="coinbet ${b.to ? 'personal' : ''}"><div class="cbinfo"><a class="plink" data-cprof="${b.from.id}">${esc(b.from.login)}</a>${b.to ? ' <small>вызывает Вас!</small>' : ''}
      <div class="cbamt">${COIN_IC(b.res)} ${fmtFull(b.amount)} <small>${COIN_RES[b.res][1]}</small></div><small>Он(а) — ${COIN_SIDE[b.side]}, Вам — ${COIN_SIDE[b.side === 'eagle' ? 'tails' : 'eagle']}</small></div>
      <button class="zbar cbgo" data-coinacc="${b.id}">Принять</button></div>`;
    body = `<p class="coinhint">Примите вызов: поставьте столько же — монета решит, кто заберёт оба банка.</p>${c.open.length ? c.open.map(one).join('') : '<p class="parch-note">Открытых вызовов пока нет — бросьте свой!</p>'}
      ${c.mine.length ? `${ribbon('Мои вызовы')}${c.mine.map((b) => `<div class="coinbet mine"><div class="cbinfo">${b.to ? `Для <b>${esc(b.to.login)}</b>` : 'Для всех'} · Вы — ${COIN_SIDE[b.side]}
        <div class="cbamt">${COIN_IC(b.res)} ${fmtFull(b.amount)} <small>${COIN_RES[b.res][1]}</small></div><small>Ждёт ещё <span class="cd" data-e="${b.exp}"></span></small></div>
        <button class="zbar cbno" data-coincan="${b.id}">Отменить</button></div>`).join('')}` : ''}`;
  } else if (S.coinTab === 'new') {
    const max = Math.min(c.have[f.res] || 0, c.max[f.res] || 0, c.maxBet || 1000);
    body = `<p class="coinhint">Ставка списывается из замка «${esc(c.castle)}» сразу. Ставка — от ${c.min} до ${fmtFull(c.maxBet || 1000)}. Выигрыш (обе ставки) — в Кладовую. Вызов ждёт сутки, потом ставка вернётся в замок.</p>
      <div class="coinres">${Object.keys(COIN_RES).map((r) => `<button class="${f.res === r ? 'on' : ''}" data-coinres="${r}">${COIN_IC(r)}<small>${fmtFull(c.have[r] || 0)}</small></button>`).join('')}</div>
      <div class="arow"><span>Ставка:</span><input class="anum" type="number" inputmode="numeric" min="${c.min}" max="${max}" value="${f.amount}" data-coinamt><button class="btn small" data-coinmax="${max}">Макс</button></div>
      <div class="coinsides">${['eagle', 'tails'].map((s) => `<button class="${f.side === s ? 'on' : ''}" data-coinside="${s}">${coinFace(s)}<span>${COIN_SIDE[s]}</span></button>`).join('')}</div>
      <div class="arow"><span>Кому:</span><input class="anum wide" placeholder="Ник — или пусто, вызов для всех" autocapitalize="none" value="${esc(f.to)}" data-cointo></div>
      <button class="pbar" data-coinbet>Бросить вызов</button>
      <p class="coinhint small">Сегодня осталось: вызовов <b>${c.left.bets}</b>, игр <b>${c.left.games}</b>. С одним соперником — не больше 3 игр в сутки.</p>`;
  } else {
    body = c.history.length ? c.history.map((h) => `<div class="coinlog ${h.won ? 'won' : 'lost'}">${coinFace(h.coin, 'mini')}<div>${h.won ? 'Победа' : 'Поражение'} — <a class="plink" data-cprof="${h.vsId}">${esc(h.vs)}</a><br>
      <small>${h.won ? '+' : '−'}${fmtFull(h.won ? h.amount * 2 : h.amount)} ${COIN_RES[h.res][1]} · ${fmtDate(h.at)}</small></div></div>`).join('') : '<p class="parch-note">Вы ещё не играли.</p>';
  }
  return `${ribbon('Орёл-решка')}${tabs}${body}`;
}
// бросок: монета крутится и падает нужной стороной, затем — итог
function coinFlipShow(r) {
  const d = document.createElement('div'); d.className = 'rinfo coinflip';
  d.innerHTML = `<div class="rinfo-box okbox"><div class="coinspin ${r.coin}">${coinFace('eagle', 'front')}${coinFace('tails', 'back')}</div>
    <p class="coinout hidden">${r.won ? '🎉 Победа!' : 'Не повезло…'}<br><small>Выпал <b>${COIN_SIDE[r.coin]}</b> (Вы — ${COIN_SIDE[r.side]}).<br>${r.won ? `Вы забираете ${fmtFull(r.pot)} ${COIN_RES[r.res][1]} — они в Кладовой.` : `Вы проиграли ${fmtFull(r.amount)} ${COIN_RES[r.res][1]} игроку ${esc(r.vs)}.`}</small></p>
    <button type="button" class="okbtn hidden">Ок</button></div>`;
  d.addEventListener('click', (e) => { if (e.target.closest('.okbtn')) d.remove(); });
  document.body.appendChild(d);
  setTimeout(() => { d.querySelector('.coinout').classList.remove('hidden'); d.querySelector('.okbtn').classList.remove('hidden'); }, 1900);
}
function coinMsg(m) {
  if (m.t === 'coin') S.coin = m.state;
  if (m.t === 'coinres') coinFlipShow(m.res);
  refreshSheet();
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-cointab],[data-coinres],[data-coinside],[data-coinmax],[data-coinbet],[data-coinacc],[data-coincan]'); if (!t) return;
  const d = t.dataset, f = S.coinForm;
  if (d.cointab) { S.coinTab = d.cointab; return refreshSheet(); }
  if (d.coinres) { f.res = d.coinres; return refreshSheet(); }
  if (d.coinside) { f.side = d.coinside; return refreshSheet(); }
  if (d.coinmax !== undefined) { f.amount = Number(d.coinmax) || 0; return refreshSheet(); }
  if (d.coinbet !== undefined) { document.activeElement && document.activeElement.blur(); return send({ t: 'coinbet', res: f.res, amount: f.amount, side: f.side, to: f.to.trim() }); }
  if (d.coinacc) { const b = S.coin.open.find((x) => x.id === Number(d.coinacc)); if (b && !confirm(`Поставить ${fmtFull(b.amount)} ${COIN_RES[b.res][1]} против ${b.from.login}? Вы — ${COIN_SIDE[b.side === 'eagle' ? 'tails' : 'eagle']}.`)) return; t.disabled = true; return send({ t: 'coinaccept', id: Number(d.coinacc) }); }
  if (d.coincan) { if (confirm('Отменить вызов? Ставка вернётся в замок.')) send({ t: 'coincancel', id: Number(d.coincan) }); }
});
$('#sheetBody').addEventListener('input', (e) => {
  const d = e.target.dataset;
  if (d.coinamt !== undefined) S.coinForm.amount = Math.max(0, Math.floor(Number(e.target.value)) || 0);
  if (d.cointo !== undefined) S.coinForm.to = e.target.value;
});
