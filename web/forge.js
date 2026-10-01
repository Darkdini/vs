'use strict';
// Кузница и Школа магии — как в оригинале. Список юнитов: значок, имя, уровни двух параметров (с 1).
// Окно юнита: «Текущий уровень атаки ⚔ N», «Стоимость улучшения на N+1 уровень» (ресурсы, люди, время) и кнопка
// «Улучшить на N+1-й уровень»; если этот параметр уже улучшается у другого юнита — «Уже проводится улучшение…».
// Одновременно — по одному улучшению на параметр (атака/защита, маг. атака/маг. защита). Сервер: upgradeOp в army.js.
const FI = { a: `${GFX}smallicon/phiattack.png`, d: `${GFX}smallicon/phidef.png`, m: `${GFX}smallicon/magattack.png`, md: `${GFX}smallicon/magdef.png` };
const UPK = {
  forge: { title: 'Кузница', kinds: ['a', 'd'], bld: 11, list: 'forgeUnits', op: 'forge', names: { a: 'атаки', d: 'защиты' } },
  magic: { title: 'Магическая школа', kinds: ['m', 'md'], bld: 39, list: 'magicUnits', op: 'magic', names: { m: 'магической атаки', md: 'магической защиты' } },
};
const fLvl = (id, k) => ((MY().forge || {})[id] || {})[k] || 0; // число улучшений (бонус к параметру)
const shownLvl = (id, k) => fLvl(id, k) + 1; // как в оригинале: без улучшений — 1
S.upw = 'forge'; S.upUnit = null;
function upListWin() {
  const w = UPK[S.upw], ids = MY()[w.list] || [];
  return `${ribbon(w.title)}${ids.map((id) => { const u = unitById(id); return `<button class="fbar" data-upunit="${id}"><img src="${unitSrc(u)}" alt="">
    <span><b>${esc(u.name)}</b><br>${w.kinds.map((k) => `<img class="fi" src="${FI[k]}" alt=""> ${shownLvl(id, k)}`).join(' ')}</span></button>`; }).join('') || '<p class="parch-note">Нет юнитов для улучшения.</p>'}`;
}
function upUnitWin() {
  const w = UPK[S.upw], u = unitById(S.upUnit), my = MY(), next = (my.upNext || {})[u.id] || {}, L = buildingLevel(w.bld), jobs = my.upJobs || {};
  const row = (k) => {
    const cur = shownLvl(u.id, k), T = cur + 1, n = next[k], job = jobs[k];
    const head = `<div class="uphead">Текущий уровень ${w.names[k]} <img class="fi" src="${FI[k]}" alt=""> ${cur}</div>`;
    if (job) return `${head}<div class="upbody">${job.unit === u.id ? `Идёт улучшение на ${job.level + 1} уровень. Осталось: <span class="cd" data-e="${job.end}"></span>` : 'Уже проводится улучшение данного параметра для другого юнита!'}</div>`;
    if (T > 20) return `${head}<div class="upbody">Достигнут максимальный уровень.</div>`;
    if (T > L) return `${head}<div class="upbody">Для улучшения на ${T} уровень нужен ${esc(S.by[w.bld].name)} ${T} ур.</div>`;
    return `${head}<div class="upbody">Стоимость улучшения на ${T} уровень:</div>
      <div class="upcost">${RES4.map((r) => `<span data-need="${r}:${n.cost[r]}">${RES_IC[r]}<b>${fmtFull(n.cost[r])}</b></span>`).join('')}<span>${RES_IC.people}<b>${fmtFull(n.people)}</b></span><span>${TIME_IC}<b>${fmtT(n.sec)}</b></span></div>
      <button class="pbar" data-updo="${k}">Улучшить на ${T}-й уровень</button>`;
  };
  return `${ribbon(u.name)}<div class="center"><img class="fbig" src="${unitSrc(u)}" alt=""></div>${w.kinds.map(row).join('')}`;
}
// «Юниты:» в окне здания — идущие улучшения
function upJobsHtml(bld) {
  const w = Object.values(UPK).find((x) => x.bld === bld), jobs = Object.values(MY().upJobs || {}).filter((j) => w.kinds.includes(j.kind));
  return jobs.length ? `${ribbon('Юниты:')}${jobs.map((j) => { const u = unitById(j.unit); return `<div class="upjob"><img src="${unitSrc(u)}" alt=""> ${esc(u.name)} улучшение на <img class="fi" src="${FI[j.kind]}" alt=""> ${j.level + 1}<br>Осталось: <span class="cd" data-e="${j.end}"></span></div>`; }).join('')}` : '';
}
function forgeWin() { S.upw = 'forge'; return upListWin(); }
function magicWin() { S.upw = 'magic'; return upListWin(); }
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-forge],[data-magic],[data-upunit],[data-updo]'); if (!t) return;
  const d = t.dataset;
  if (d.forge !== undefined) { S.upw = 'forge'; return openSheet(upListWin); }
  if (d.magic !== undefined) { S.upw = 'magic'; return openSheet(upListWin); }
  if (d.upunit) { S.upUnit = Number(d.upunit); return openSheet(upUnitWin); }
  if (d.updo) return send({ t: UPK[S.upw].op, unit: S.upUnit, kind: d.updo });
});
