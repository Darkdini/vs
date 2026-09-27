'use strict';
// Кузница — как в оригинале: список юнитов с уровнями улучшения атаки ⚔ и защиты 🛡; +1 к базовому параметру за уровень,
// максимум — уровень Кузнеца. Одновременно идёт одно улучшение. Сервер: forgeOp в army.js.
const FI = { a: `${GFX}smallicon/phiattack.png`, d: `${GFX}smallicon/phidef.png` };
const fLvl = (id, k) => ((MY().forge || {})[id] || {})[k] || 0;
function forgeWin() {
  const my = MY(), job = my.forgeJob;
  return `${ribbon('Кузница')}
    ${job ? `<div class="bwline center">Улучшается: <b>${esc(unitById(job.unit).name)}</b> — ${job.kind === 'a' ? 'атака' : 'защита'} ${job.level} ур., <span class="cd" data-e="${job.end}"></span></div>` : ''}
    ${(my.forgeUnits || []).map((f) => { const u = unitById(f.id); return `<button class="fbar" data-funit="${u.id}"><img src="${unitSrc(u)}" alt="">
      <span><b>${esc(u.name)}</b><br><img class="fi" src="${FI.a}" alt=""> ${fLvl(u.id, 'a')} <img class="fi" src="${FI.d}" alt=""> ${fLvl(u.id, 'd')}</span></button>`; }).join('')}`;
}
S.funit = null;
function forgeUnitWin() {
  const my = MY(), u = unitById(S.funit), f = (my.forgeUnits || []).find((x) => x.id === u.id), L = buildingLevel(11), job = my.forgeJob;
  const row = (k, title, base) => { const lv = fLvl(u.id, k), n = f.next[k];
    return `<div class="fest"><b><img class="fi" src="${FI[k]}" alt=""> ${title}: ${base} + ${lv}</b> <span class="small">(ур. ${lv} из ${Math.min(20, L)})</span>
      ${lv >= Math.min(20, L) ? `<div class="small muted">${lv >= 20 ? 'Максимум.' : `Нужен Кузнец ${lv + 1} ур.`}</div>` : `<div class="chips">${RES4.map((r) => `<span>${RES_IC[r]} ${fmtFull(n.cost[r])}</span>`).join('')}<span>${TIME_IC} ${fmtT(n.sec)}</span></div>
      <button class="pbtn" data-fdo="${k}" ${job ? 'disabled' : ''}>Улучшить до ${lv + 1} ур.</button>`}</div>`; };
  return `${ribbon(u.name)}<div class="center"><img class="fbig" src="${unitSrc(u)}" alt=""></div>
    ${job ? '<div class="bwline center muted">Кузница занята — дождитесь окончания улучшения.</div>' : ''}
    ${row('a', 'Атака', u.attack)}${row('d', 'Защита', `${u.def.inf}/${u.def.cav}`)}
    <p class="small muted">Каждое улучшение увеличивает базовый параметр атаки/защиты на 1 единицу для всех таких воинов замка.</p>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-forge],[data-funit],[data-fdo]'); if (!t) return;
  const d = t.dataset;
  if (d.forge !== undefined) return openSheet(forgeWin);
  if (d.funit) { S.funit = Number(d.funit); return openSheet(forgeUnitWin); }
  if (d.fdo) return send({ t: 'forge', unit: S.funit, kind: d.fdo });
});
