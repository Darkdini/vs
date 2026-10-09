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
  if (!g) return noGeneralWin();
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
    <div class="ptiles g2">
      ${tile('data-herotal', `${GFX}hero/icon_talents.png" data-fb="${GS('maxupgrade')}`, 'Умения', MY().hero && MY().hero.talFree ? MY().hero.talFree : undefined)}
      ${tile('data-herogear', `${GFX}hero/icon_gear.png" data-fb="${GS('swordred')}`, 'Снаряжение', MY().hero && MY().hero.gear.length ? MY().hero.gear.length : undefined)}
    </div>
    <div class="ptiles g4">
      ${tile('data-genreset', `${G3}Gears/a1.png`, 'Сбросить очки', g.resets)}
      ${tile('data-gendist', GS('upgrade'), 'Распределить')}
      ${tile('data-genname', GS('softedit'), 'Переименовать')}
      ${tile('data-genkill', GS('l7day'), 'Убить')}
    </div>
    <p class="small muted">За уровень — ${g.perLevel} очка опыта. Командование: первые очки — около +0,3% к атаке (защите) армии за очко, дальше прибавка убывает: 100 очков — +25%, 300 — +50%, предел — +100%. Личная защита генерала прикрывает войско в бою. Восстановление ускоряет воскрешение, карьера — получение опыта (+0,5% за очко).</p>
    ${ribbon('Как получить опыт')}
    <div class="gexp">
      <div><b>⚔ Нападение и набег с генералом</b> — 1 опыт за каждые 10 единиц населения убитых врагов. Победа ×1,5, поражение ×0,5, набег ×0,75.</div>
      <div><b>🛡 Оборона замка</b> — генерал в замке (не в походе) получает опыт за убитых нападавших.</div>
      <div><b>🏕 Лагеря и руины</b> — немного опыта по силе охраны.</div>
      <div><b>⚠ Слабый противник</b> (рейтинг меньше 30% вашего) — опыт ×0,25.</div>
      <div><b>🔁 Повторные бои</b> с тем же игроком за сутки — каждый следующий даёт вдвое меньше.</div>
      <div><b>☠ Армия разбита целиком</b> — генерал погибает и опыта не получает.</div>
      <div><b>⏳ Лимиты</b>: за один бой — не больше <b>${fmtFull(g.lim.battle)}</b> опыта, за сутки — не больше <b>${fmtFull(g.lim.day)}</b> (один уровень). Сегодня получено: <b>${fmtFull(g.lim.dayExp)}</b>.</div>
      <div><b>👑 Премиум «Завоеватель»</b> и <b>карьера</b> увеличивают и опыт, и лимиты.</div>
      <div>Следующий уровень: ещё <b>${fmtFull(Math.max(0, g.need - g.exp))}</b> опыта.</div>
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

// генерала нет (погиб или не нанят) — как в оригинале: павшие генералы (воскресить / за золото / удалить),
// «Тренировка» — выбор юнита из замковой армии; идёт тренировка — «Тренировка Генерала (Мародер) Осталось»
const genCost = (c) => `<div class="upcost">${RES4.map((r) => `<span data-need="${r}:${c.cost[r]}">${RES_IC[r]}<b>${fmtFull(c.cost[r])}</b></span>`).join('')}<span>${RES_IC.people}<b>${fmtFull(c.people)}</b></span><span>${TIME_IC}<b>${fmtT(c.sec / S.cat.speed)}</b></span></div>`;
// воскрешение по частям: сколько уже внесено и хватит ли ресурсов замка на остаток
const REV_KEYS = ['wood', 'stone', 'iron', 'food', 'people'];
const revNeed = (d, k) => (k === 'people' ? d.people : d.cost[k]), revLeft = (d, k) => Math.max(0, revNeed(d, k) - ((d.fund && d.fund[k]) || 0));
const reviveAll = (d) => REV_KEYS.every((k) => (k === 'people' ? S.st.castle.res.people : resNow(k)) >= revLeft(d, k));
const reviveFund = (d) => (d.fund ? `<div class="upbody center">Уже внесено:</div><div class="upcost">${REV_KEYS.map((k) => `<span>${RES_IC[k]}<b>${fmtFull(d.fund[k] || 0)} / ${fmtFull(revNeed(d, k))}</b></span>`).join('')}</div>`
  : (reviveAll(d) ? '' : '<div class="upbody center small">Ресурсов в замке не хватает — их можно вносить частями: когда соберётся всё, воскрешение начнётся.</div>'));
const gico = (id) => (id ? `<img class="fi" src="${unitSrc(unitById(id))}" alt="">` : '');
// генерал один на всё королевство: если он в другом замке — где он и как перевести сюда (нанять второго нельзя)
function genElseWin(ge, dead) {
  const where = ge.what === 'train' ? 'тренируется в замке' : ge.what === 'revive' ? 'воскрешается в замке' : ge.what === 'away' ? 'в походе из замка' : 'служит в замке';
  return `${ribbon('Генерал')}<div class="upbody center">Генерал один на всё королевство.</div>
    <div class="upbody center">${ge.name ? `<b>${esc(ge.name)}</b>, ${fmtFull(ge.level)} ур., ` : 'Ваш генерал '}${where} «${esc(ge.castle)}».</div>
    <button class="pbar" data-switch="${ge.id}">Перейти в замок «${esc(ge.castle)}»</button>
    <div class="upbody center small">Чтобы генерал служил здесь, отправьте его из замка «${esc(ge.castle)}»: Поход → Подкрепление с генералом в этот замок.</div>
    ${dead.length ? `${ribbon('Павшие генералы замка')}${dead.map((d, i) => `<div class="upbody center">${gico(d.kindId)} ${esc(d.name)}, ${fmtFull(d.level)} ур. — воскресить можно, когда живого генерала в королевстве нет.</div>
      <button class="pbar" data-gendel="${i}">Удалить</button>`).join('')}` : ''}`;
}
function noGeneralWin() {
  const my = MY(), dead = my.deadGenerals || [], tr = my.genTrain;
  if (my.genElse) return genElseWin(my.genElse, dead);
  const deadHtml = dead.map((d, i) => `<div class="upbody center">Мертвый ${gico(d.kindId)} Генерал (${esc(d.kind || '')})<br>${esc(d.name)}, ${fmtFull(d.level)} ур.</div>
    ${d.reviveAt ? `<div class="upbody center">Воскрешение. Осталось: <span class="cd" data-e="${d.reviveAt}"></span></div>`
    : d.coinsOnly ? `<div class="upbody center">Генерала выше 100 уровня воскрешают только за монеты.</div><div class="upbody center">Стоимость воскрешения: ${fmtFull(d.gold)} ${gimg('coins_s.png', 'ri')}</div>
      <button class="pbar" data-genrevg="${i}">Воскресить за монеты</button>`
    : `<div class="upbody center">Стоимость воскрешения:</div>${genCost(d)}${reviveFund(d)}<div class="upbody center">или ${fmtFull(d.gold)} ${gimg('coins_s.png', 'ri')}</div>
      <button class="pbar" data-genrev="${i}">${reviveAll(d) ? 'Воскресить' : 'Внести ресурсы'}</button><button class="pbar" data-genrevg="${i}">Воскресить за монеты</button>`}
    <div class="upbody">Удалить генерала ${esc(d.kind || '')}.</div><button class="pbar" data-gendel="${i}">Удалить</button><hr class="cwhr">`).join('');
  const train = tr ? `<div class="upbody center">Тренировка ${gico(tr.kindId)} Генерала (${esc(tr.kind)})<br>Осталось: <span class="cd" data-e="${tr.end}"></span></div>`
    : `${ribbon('Тренировка')}<div class="upbody center">Выберите юнита из замковой армии для тренировки:</div>
      ${(my.genUnits || []).map((x) => { const u = unitById(x.id); return `<button class="pbar" data-gentu="${x.id}"><img class="fi" src="${unitSrc(u)}" alt=""> ${esc(u.name)}</button>`; }).join('') || '<p class="parch-note">В замковой армии нет подходящих юнитов.</p>'}`;
  return `${ribbon('Генерал')}${tr ? '' : deadHtml}${train}`;
}
S.gtu = null;
function genTrainWin() {
  const x = (MY().genUnits || []).find((y) => y.id === S.gtu); if (!x) return noGeneralWin();
  return `${ribbon('Генерал')}<div class="upbody center">Стоимость тренировки ${gico(x.id)} генерала:</div>${genCost(x)}<button class="pbar" data-gentdo>Тренировать</button>`;
}
function openGeneral() { openSheet(generalWin); }
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-genrev],[data-genrevg],[data-gendel],[data-gentu],[data-gentdo]'); if (!t) return;
  const d = t.dataset;
  if (d.genrev) return send({ t: 'general', op: 'revive', idx: Number(d.genrev) });
  if (d.genrevg) return send({ t: 'general', op: 'revive', idx: Number(d.genrevg), gold: true });
  if (d.gendel) { if (confirm('Удалить генерала навсегда?')) send({ t: 'general', op: 'delete', idx: Number(d.gendel) }); return; }
  if (d.gentu) { S.gtu = Number(d.gentu); return openSheet(genTrainWin); }
  if (d.gentdo !== undefined) return send({ t: 'general', op: 'train', unit: S.gtu });
});

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
