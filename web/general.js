'use strict';
// Окно «Генерал» — как в оригинальном клиенте (сервер: generalOp / generalView в server/src/army.js).
// Очки опыта за уровень распределяются по шести характеристикам; сброс, переименование, «Убить».

const GS = (n) => `${GFX}smallicon/${n}.png`;
const GEN_ROWS = [
  ['atk', 'phiattack', 'Личная атака'],
  ['def', 'phidef', 'Личная защита'],
  ['catk', 'magattack', 'Командование атакой'],
  ['cdef', 'magdef', 'Командование защитой'],
  ['heal', 'plus', 'Скорость восстановления'],
  ['career', 'maxupgrade', 'Карьера'],
];
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function generalWin() {
  const g = MY().general, gu = unitById(M().generalId);
  if (!g) {
    return `${ribbon('Генерал')}<p class="parch-note">Генерала нет. Наймите его в Военном штабе (раздел «Найм», 1 генерал на замок).
      Генерал ведёт армию в поход, усиливает её командованием и получает опыт за каждую победу.</p>`;
  }
  const s = g.stats, span = Math.max(1, g.need - g.prevNeed), done = Math.max(0, Math.min(1, (g.exp - g.prevNeed) / span));
  const seg = Array.from({ length: 12 }, (_, i) => `<i class="${i < Math.round(done * 12) ? 'on' : ''}"></i>`).join('');
  const line = (icon, label, value) => `<div class="gline"><img src="${GS(icon)}" alt=""><span>${label}:</span><b>${value}</b></div>`;
  const tile = (attr, icon, text, badge) => `<button class="ptile" ${attr}><img src="${icon}" alt="">${badge !== undefined ? `<em class="gbadge">${badge}</em>` : ''}<span>${text}</span></button>`;
  const revive = g.dead ? (g.reviveAt
    ? `<p class="cinfo">Генерал воскресает: <span class="cd" data-e="${g.reviveAt}"></span></p>`
    : `<p class="cinfo">Генерал погиб в бою.</p><div class="chips">${RES4.map((r) => `<span>${RES_IC[r]} ${fmtFull(g.reviveCost[r])}</span>`).join('')}</div>
      <button class="pbar" data-revive>Воскресить</button>`) : '';
  return `${ribbon('Генерал')}
    <div class="gname">${esc(g.name)}</div>
    <div class="ghead"><img class="gimg" src="${unitSrc(gu)}" alt="">
      <div class="gright"><div>(${esc(g.kind || gu.name)})</div><div><img src="${GS('status/f_gold')}" alt=""> ${fmtFull(g.level)} ур.</div></div></div>
    <div class="gnext">До след. уровня:<div class="gseg" title="${fmtFull(g.exp)} / ${fmtFull(g.need)}">${seg}</div><small>${fmtFull(g.exp)} / ${fmtFull(g.need)}</small></div>
    <div class="gtop">
      <div><img src="${GS('health')}" alt=""><b>${g.health}%</b></div>
      <div><img src="${GS('phiattack')}" alt=""><b>${s.atk.toFixed(1)}</b></div>
      <div><img src="${GS('phidef')}" alt=""><b>${s.def.toFixed(1)}</b></div>
      <div><img src="${GS('magattack')}" alt=""><b>${pct(s.catk)}</b></div>
      <div><img src="${GS('magdef')}" alt=""><b>${pct(s.cdef)}</b></div>
    </div>
    ${line('phiattack', 'Личная атака', `${s.atk.toFixed(1)}+0`)}
    ${line('phidef', 'Личная защита', `${s.def.toFixed(1)}+0`)}
    ${line('magattack', 'Командование атакой', fmtFull(g.pts.catk))}
    ${line('magdef', 'Командование защитой', fmtFull(g.pts.cdef))}
    ${line('plus', 'Скорость восстановления', fmtFull(g.pts.heal))}
    <div class="gline"><img src="${G3}menu/locations.svg" alt=""><span>Находится в армии:</span><b>${g.dead ? 'погиб' : esc(g.where)}</b></div>
    ${line('maxupgrade', 'Карьера', fmtFull(g.pts.career))}
    ${line('greenball', 'Свободные очки опыта', fmtFull(g.free))}
    ${revive}
    <div class="ptiles g4">
      ${tile('data-genreset', `${G3}Gears/a1.png`, 'Сбросить очки', g.resets)}
      ${tile('data-gendist', GS('upgrade'), 'Распределить')}
      ${tile('data-genname', GS('softedit'), 'Переименовать')}
      ${tile('data-genkill', GS('l7day'), 'Убить')}
    </div>
    <p class="small muted">За уровень — ${g.perLevel} очка опыта. Командование: +0,3% к атаке (защите) армии за очко. Восстановление ускоряет воскрешение, карьера — получение опыта (+0,5% за очко).</p>
    ${ribbon('Как получить опыт')}
    <div class="gexp">
      <div><b>⚔ Нападение и набег с генералом</b> — 1 опыт за каждую единицу населения убитых врагов. Победа ×1,5, поражение ×0,5, набег ×0,75.</div>
      <div><b>🛡 Оборона замка</b> — генерал в замке (не в походе) получает опыт за убитых нападавших.</div>
      <div><b>🏕 Лагеря и руины</b> — немного опыта по силе охраны.</div>
      <div><b>⚠ Слабый противник</b> (рейтинг меньше 30% вашего) — опыт ×0,25.</div>
      <div><b>☠ Армия разбита целиком</b> — генерал погибает и опыта не получает.</div>
      <div><b>👑 Премиум «Завоеватель»</b> — опыт ×2.</div>
      <div>Следующий уровень: ещё <b>${fmtFull(Math.max(0, g.need - g.exp))}</b> опыта (≈ ${fmtFull(Math.ceil(Math.max(0, g.need - g.exp) / 1.5))} населения врагов в победных боях).</div>
    </div>`;
}

S.gd = {};
function genDistWin() {
  const g = MY().general; if (!g) return generalWin();
  const used = GEN_ROWS.reduce((s, [k]) => s + (Number(S.gd[k]) || 0), 0);
  return `${ribbon('Генерал')}
    <div class="gname small2"><img src="${GS('greenball')}" alt=""> Свободные очки опыта: <b data-gdleft>${fmtFull(g.free - used)}</b></div>
    ${GEN_ROWS.map(([k, icon, label]) => `<div class="gdrow"><span><img src="${GS(icon)}" alt=""> ${label}:</span>
      <input class="gdin" type="number" inputmode="numeric" min="0" placeholder="0" value="${S.gd[k] || ''}" data-gd="${k}"></div>`).join('')}
    <button class="pbar" data-gddo>Распределить</button>`;
}

function openGeneral() { openSheet(generalWin); }

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-general],[data-genreset],[data-gendist],[data-genname],[data-genkill],[data-gddo]'); if (!t) return;
  const d = t.dataset, g = MY().general;
  if (d.general !== undefined) return openGeneral();
  if (d.gendist !== undefined) { S.gd = {}; return openSheet(genDistWin); }
  if (d.genreset !== undefined) {
    if (!confirm(g && g.resets > 0 ? 'Сбросить все очки опыта генерала? (бесплатный сброс)' : `Сбросить все очки за ${g ? g.resetGold : 100} золота?`)) return;
    return send({ t: 'general', op: 'reset' });
  }
  if (d.genname !== undefined) { const n = prompt('Новое имя генерала:', g ? g.name : ''); if (n) send({ t: 'general', op: 'rename', name: n }); return; }
  if (d.genkill !== undefined) { if (confirm('Убить генерала? Его уровень и опыт пропадут навсегда.')) send({ t: 'general', op: 'kill' }); return; }
  if (d.gddo !== undefined) {
    document.activeElement && document.activeElement.blur();
    send({ t: 'general', op: 'dist', pts: { ...S.gd } }); S.gd = {};
    return closeSheet();
  }
});
$('#sheetBody').addEventListener('input', (e) => {
  const k = e.target.dataset.gd; if (!k) return;
  S.gd[k] = Math.max(0, Math.floor(Number(e.target.value)) || 0);
  const g = MY().general, left = $('[data-gdleft]');
  if (g && left) { const used = GEN_ROWS.reduce((s, [x]) => s + (S.gd[x] || 0), 0); left.textContent = fmtFull(g.free - used); left.classList.toggle('bad', used > g.free); }
});
