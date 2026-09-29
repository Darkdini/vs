'use strict';
// Школа магии — как Кузница: список юнитов с уровнями магической атаки и магической защиты;
// +1 к базовому параметру за уровень, максимум — уровень Школы магии (до 20). Одновременно идёт одно улучшение.
// Магическую атаку улучшают только юниты-маги (у кого она есть), магическую защиту — все. Сервер: magicOp в army.js.
const MI = { m: `${GFX}smallicon/magattack.png`, md: `${GFX}smallicon/magdef.png` };
const mKinds = (u) => (u.magic > 0 ? ['m', 'md'] : ['md']);
function magicWin() {
  const my = MY(), job = my.magicJob;
  return `${ribbon('Школа магии')}
    ${job ? `<div class="bwline center">Улучшается: <b>${esc(unitById(job.unit).name)}</b> — ${job.kind === 'm' ? 'маг. атака' : 'маг. защита'} ${job.level} ур., <span class="cd" data-e="${job.end}"></span></div>` : ''}
    ${(my.forgeUnits || []).map((f) => { const u = unitById(f.id); return `<button class="fbar" data-munit="${u.id}"><img src="${unitSrc(u)}" alt="">
      <span><b>${esc(u.name)}</b><br>${u.magic > 0 ? `<img class="fi" src="${MI.m}" alt=""> ${fLvl(u.id, 'm')} ` : ''}<img class="fi" src="${MI.md}" alt=""> ${fLvl(u.id, 'md')}</span></button>`; }).join('')}`;
}
S.munit = null;
function magicUnitWin() {
  const my = MY(), u = unitById(S.munit), next = (my.magicNext || {})[u.id] || {}, L = buildingLevel(39), job = my.magicJob;
  const row = (k, title, base) => { const lv = fLvl(u.id, k), n = next[k];
    return `<div class="fest"><b><img class="fi" src="${MI[k]}" alt=""> ${title}: ${base} + ${lv}</b> <span class="small">(ур. ${lv} из ${Math.min(20, L)})</span>
      ${lv >= Math.min(20, L) || !n ? `<div class="small muted">${lv >= 20 ? 'Максимум.' : `Нужна Школа магии ${lv + 1} ур.`}</div>` : `<div class="chips">${RES4.map((r) => `<span>${RES_IC[r]} ${fmtFull(n.cost[r])}</span>`).join('')}<span>${TIME_IC} ${fmtT(n.sec)}</span></div>
      <button class="pbtn" data-mdo="${k}" ${job ? 'disabled' : ''}>Улучшить до ${lv + 1} ур.</button>`}</div>`; };
  return `${ribbon(u.name)}<div class="center"><img class="fbig" src="${unitSrc(u)}" alt=""></div>
    ${job ? '<div class="bwline center muted">Школа магии занята — дождитесь окончания улучшения.</div>' : ''}
    ${mKinds(u).includes('m') ? row('m', 'Магическая атака', u.magic) : '<div class="bwline small muted">У этого воина нет магической атаки — улучшается только магическая защита.</div>'}
    ${row('md', 'Магическая защита', u.def.mag)}
    <p class="small muted">Каждое улучшение увеличивает базовый параметр на 1 единицу для всех таких воинов замка: магическая атака — против магической защиты врага, магическая защита — против вражеских магов.</p>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-magic],[data-munit],[data-mdo]'); if (!t) return;
  const d = t.dataset;
  if (d.magic !== undefined) return openSheet(magicWin);
  if (d.munit) { S.munit = Number(d.munit); return openSheet(magicUnitWin); }
  if (d.mdo) return send({ t: 'magic', unit: S.munit, kind: d.mdo });
});
