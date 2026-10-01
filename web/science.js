'use strict';
// Университет → «Науки»: список наук с колбами и окно науки — описание, изучение следующего уровня
// и таблица всех 20 уровней (что даёт каждый; вехи 5/10/15/20 — отдельные бонусы). Сервер: SCIENCES, research в army.js.
const FLASK = (s) => `gfx3d/sci/flask_${s.flask}.png`;
S.sciK = null;
function sciSec(n) { const sages = MY().units[227] || 0; return Math.max(3, Math.round(M().scienceTime[Math.min(20, n)] * Math.max(0.5, 1 - 0.02 * sages) / S.cat.speed)); }
function sciJob() {
  const r = MY().research;
  return r ? `<div class="bwline center">Изучается: <b>${esc(M().sciences[r.sci].name)} ${r.level} ур.</b> — <span class="cd" data-e="${r.end}"></span></div>` : '';
}
function sciWin() {
  const my = MY(), uni = buildingLevel(15);
  return `${ribbon('Науки')}${sciJob()}
    <div class="bwline small center">Университет ${uni} ур. — науки изучаются до ${uni} ур. · ученых в замке: ${my.units[227] || 0}</div>
    ${Object.entries(M().sciences).map(([k, s]) => `<button class="fbar sbar" data-scik="${k}"><img src="${FLASK(s)}" alt="">
      <span class="grow"><b>${esc(s.name)}</b><br><small>${esc(s.sub)}</small></span><span class="slvl">${my.sciences[k]}<small>/20</small></span></button>`).join('')}`;
}
function sciOne() {
  const my = MY(), k = S.sciK, s = M().sciences[k], l = my.sciences[k], n = l + 1, uni = buildingLevel(15), r = my.research;
  const cost = n <= 20 ? M().scienceCost[n] : null;
  let study;
  if (n > 20) study = '<div class="bwline center"><b>Наука изучена полностью.</b></div>';
  else if (r) study = `<div class="bwline center muted">Университет занят: ${esc(M().sciences[r.sci].name)} ${r.level} ур. — <span class="cd" data-e="${r.end}"></span></div>`;
  else if (n > uni) study = `<div class="bwline center reasons">Для ${n} ур. нужен Университет ${n} ур.</div>`;
  else study = `<div class="chips center">${RES4.map((q) => `<span data-need="${q}:${cost[q]}">${RES_IC[q]} ${fmtFull(cost[q])}</span>`).join('')}<span>${TIME_IC} ${fmtT(sciSec(n))}</span></div>
      <div class="center"><button class="pbtn" data-sci="${k}">Изучить ${n} ур.</button></div>`;
  return `<div class="shead"><img src="${FLASK(s)}" alt=""><div><div class="stitle">${esc(s.name)}</div><div class="ssub">${esc(s.sub)}</div></div></div>
    <p class="sabout">${esc(s.about)}</p>
    <div class="snow">Изучено: <b>${l} ур.</b>${l ? ` — ${esc(s.levels[l - 1].text)}` : ''}</div>
    ${study}
    <div class="slist">${s.levels.map((x) => `<div class="slv ${x.l <= l ? 'done' : ''} ${x.l === n ? 'next' : ''}"><b>${x.l} ур.</b><span>${esc(x.text)}${x.mile ? `<em>★ ${esc(x.mile)}</em>` : ''}</span></div>`).join('')}</div>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-scilist],[data-scik]'); if (!t) return;
  if (t.dataset.scilist !== undefined) return openSheet(sciWin);
  S.sciK = t.dataset.scik; openSheet(sciOne);
});
