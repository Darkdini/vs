'use strict';
// Храм: окна «Бунт» (бунт в замке, снижение за ресурсы) и «Ритуалы» (бонус к приросту лояльности населения). Сервер: royal.js.

function riotWin() {
  const c = S.st.castle, r = MY().royal, L = buildingLevel(25), bunt = Math.max(0, 100 - c.loyalty), per = r.calmPer || {};
  const cost = (n) => `<div class="chips">${RES4.map((k) => `<span data-need="${k}:${(per[k] || 0) * n}">${RES_IC[k]} ${fmtFull((per[k] || 0) * n)}</span>`).join('')}</div>`;
  const opt = (n, t) => (n > 0 && n <= bunt ? `<div class="fest"><b>${t}</b>${cost(n)}<button class="pbtn" data-calm="${n}">Снизить на ${n}%</button></div>` : '');
  return `${ribbon('Бунт')}
    <div class="bwline center">Бунт в замке: <b>${bunt}%</b></div><div class="tbar red"><i style="width:${bunt}%"></i></div>
    <div class="bwline">${c.capital ? 'Столицу захватить нельзя.' : 'Каждое победное нападение врага с Бунтарями поднимает бунт на 15%. Бунт 100% — замок переходит к нападающему.'}</div>
    <div class="bwline">Сам бунт не утихает — снизить его можно только здесь, за ресурсы. После захвата в замке бунт 95%.</div>
    ${ribbon('Снизить бунт')}<div class="bwline">За 1% бунта: ${RES4.map((k) => `${RES_IC[k]} ${fmtFull(per[k] || 0)}`).join(' ')}${L ? ` (Храм ${L} ур.: дешевле на ${Math.round(L * 2.5)}%)` : ''}</div>
    ${bunt ? `${opt(5, 'На 5%')}${opt(15, 'На 15%')}${bunt !== 5 && bunt !== 15 ? opt(bunt, `Весь бунт (${bunt}%)`) : ''}` : '<div class="bwline center muted">Бунта нет — замок спокоен.</div>'}`;
}
function ritualsWin() {
  const r = MY().royal;
  return `${ribbon('Ритуалы')}
    <div class="bwline">Ритуал на сутки увеличивает весь прирост лояльности населения. Сейчас бонус +${Math.round(r.bonus * 100)}% (максимум +${Math.round(r.bonusCap * 100)}% — 5% за уровень Храма).</div>
    ${r.rituals.map((x) => `<div class="fest"><b>${esc(x.name)}</b> — +${Math.round(x.pct * 100)}% на ${x.hours} ч<div class="small">${esc(x.desc)}</div>
      <div class="chips">${x.cost ? RES4.map((k) => `<span>${RES_IC[k]} ${fmtFull(x.cost[k])}</span>`).join('') : ''}${x.gold ? `<span>${gimg('coins_s.png', 'ri')} ${x.gold}</span>` : ''}</div>
      ${x.until > Date.now() ? `<div class="small muted">Действует ещё <span class="cd" data-e="${x.until}"></span></div>` : `<button class="pbtn" data-ritual="${x.id}">Провести</button>`}</div>`).join('')}
    ${religionHtml()}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-temple],[data-ritual],[data-calm]'); if (!t) return;
  const d = t.dataset;
  if (d.temple === 'riot') return openSheet(riotWin);
  if (d.temple === 'rituals') return openSheet(ritualsWin);
  if (d.ritual) return send({ t: 'ritual', id: d.ritual });
  if (d.calm !== undefined) return send({ t: 'calm', pct: Number(d.calm) || 'all' });
});
