'use strict';
// Храм: окна «Бунт» (лояльность замка, усмирение) и «Ритуалы» (бонус к приросту лояльности населения). Сервер: royal.js.

function riotWin() {
  const c = S.st.castle, r = MY().royal, L = buildingLevel(25), bunt = Math.max(0, 100 - c.loyalty);
  const ready = r.calmAt <= Date.now();
  return `${ribbon('Бунт')}
    <div class="bwline center">Бунт в замке: <b>${bunt}%</b></div><div class="tbar red"><i style="width:${bunt}%"></i></div>
    <div class="bwline">Лояльность замка: ${c.loyalty} / 100. ${c.capital ? 'Столицу захватить нельзя.' : 'Если лояльность упадёт до 0 от вражеских Бунтарей — замок захватят.'}</div>
    <div class="bwline">Бунт сам утихает на ${2 + L}% в час (2% + уровень Храма ${L}).</div>
    ${ribbon('Усмирить бунт')}<div class="bwline">Лояльность замка +${r.calmGain}%, не чаще раза в 6 часов.</div>
    <div class="chips">${RES4.map((k) => `<span>${RES_IC[k]} ${fmtFull(r.calmCost[k])}</span>`).join('')}</div>
    ${bunt ? (ready ? '<button class="pbar" data-calm>Усмирить</button>' : `<div class="bwline center muted">Снова через <span class="cd" data-e="${r.calmAt}"></span></div>`) : '<div class="bwline center muted">Бунта нет.</div>'}`;
}
function ritualsWin() {
  const r = MY().royal;
  return `${ribbon('Ритуалы')}
    <div class="bwline">Ритуал на сутки увеличивает весь прирост лояльности населения. Сейчас бонус +${Math.round(r.bonus * 100)}% (максимум +${Math.round(r.bonusCap * 100)}% — 5% за уровень Храма).</div>
    ${r.rituals.map((x) => `<div class="fest"><b>${esc(x.name)}</b> — +${Math.round(x.pct * 100)}% на ${x.hours} ч<div class="small">${esc(x.desc)}</div>
      <div class="chips">${x.cost ? RES4.map((k) => `<span>${RES_IC[k]} ${fmtFull(x.cost[k])}</span>`).join('') : ''}${x.gold ? `<span>${gimg('smallicon/coin_gold.png', 'ri')} ${x.gold}</span>` : ''}</div>
      ${x.until > Date.now() ? `<div class="small muted">Действует ещё <span class="cd" data-e="${x.until}"></span></div>` : `<button class="pbtn" data-ritual="${x.id}">Провести</button>`}</div>`).join('')}
    ${religionHtml()}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-temple],[data-ritual],[data-calm]'); if (!t) return;
  const d = t.dataset;
  if (d.temple === 'riot') return openSheet(riotWin);
  if (d.temple === 'rituals') return openSheet(ritualsWin);
  if (d.ritual) return send({ t: 'ritual', id: d.ritual });
  if (d.calm !== undefined) return send({ t: 'calm' });
});
