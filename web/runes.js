'use strict';
// Руны: окно рунного камня на карте мира (за руной идёт отряд — поход «Сбор руны») и «Ковка снаряжения» в Кузнице:
// за руны и ресурсы Кузнец куёт вещь генерала нужной ячейки и редкости — она появляется в Оружейной (hero.js).
// Сервер: server/src/runes.js (камни и сбор), server/src/hero.js (t:'hero', op:'forge'). Руны игрока — MY().hero.runes.
const RUNE_KEYS = ['str', 'def', 'path'];
const RUNE_STONE = (k) => `${GFX}world/rune_${k}.png`; // камень на карте и в его окне
const RUNE_ICON = (k) => `${GFX}hero/rune_${k}.png`; // значок руны в Кузнице
const runesHave = () => (MY().hero && MY().hero.runes) || {};
const runeSlots = (k) => Object.keys(HC().gear).filter((s) => HC().gear[s].rune === k);

function runeWin(o, x, y) {
  const k = o.rune, nm = HC().runeNames[k], G = HC().gear, back = Math.round((HC().forge.runeBack || 10800) / 3600);
  return `${ribbon(nm)}
    <div class="cwin"><img class="cwimg" src="${RUNE_STONE(k)}" alt=""><div><div class="cwname">${esc(nm)}</div><div>X: ${x} Y: ${y}</div>
      <div>У вас: <img class="runeic" src="${RUNE_ICON(k)}" alt=""> <b>${fmtFull(runesHave()[k] || 0)}</b></div></div></div>
    <div class="bwline">Руну забирает отряд, который дойдёт первым. Камень исчезнет и через ${back} ч появится на новом месте этой провинции. В каждой провинции три рунных камня: Силы, Стойкости и Пути.</div>
    <div class="bwline">${esc(nm)} нужна в Кузнице для ковки снаряжения генерала: <b>${runeSlots(k).map((s) => esc(G[s].name.toLowerCase())).join(' и ')}</b>.</div>
    <button class="pbar" data-armyopen="rune" data-ax="${x}" data-ay="${y}">Отправить отряд за руной</button>`;
}

S.rfSlot = 'weapon';
function runeForgeWin() {
  const h = MY().hero, C = HC(), F = C.forge, G = C.gear, RR = C.gearRarity;
  if (!h) return `${ribbon('Ковка снаряжения')}<p class="parch-note">Загрузка…</p>`;
  const have = h.runes || {}, L = buildingLevel(11), job = h.forgeJob, ench = h.job, full = h.gear.length >= h.bagMax;
  const s = G[S.rfSlot] ? S.rfSlot : 'weapon', key = G[s].rune;
  const bank = `<div class="rfrunes">${RUNE_KEYS.map((k) => `<div class="${k === key ? 'on' : ''}"><img src="${RUNE_ICON(k)}" alt=""><b>${fmtFull(have[k] || 0)}</b><small>${esc(C.runeNames[k])}</small></div>`).join('')}</div>`;
  const tabs = `<div class="rfslots">${Object.keys(G).map((x) => `<button class="${x === s ? 'on' : ''}" data-rfslot="${x}">${himg(`slot_${x}`, HERO_FB[x])}<span>${esc(G[x].name)}</span></button>`).join('')}</div>`;
  const busy = job ? `<div class="upbody center gjob">⚒ Кузнец куёт «${esc(G[job.slot].items[job.r])}»: <b><span class="cd" data-e="${job.end}"></span></b></div>`
    : ench ? '<div class="upbody center muted">Кузнец усиливает вещь — ковать можно, когда он закончит.</div>'
      : full ? `<div class="upbody center muted">Оружейная полна (${h.bagMax}) — наденьте или разберите вещи.</div>` : '';
  const rows = RR.map((rr, r) => {
    const it = { slot: s, r, plus: 0 }, need = F.runes[r], ok = (have[key] || 0) >= need;
    const act = L < F.lvl[r] ? `<div class="rfneed">Нужен ${esc(S.by[11].name)} ${F.lvl[r]} ур.</div>`
      : `<button class="pbar rfgo" data-rforge="${r}" ${job || ench || full ? 'disabled' : ''}>Ковать</button>`;
    return `<div class="rfrow" style="--rc:${rr.color}">${gearIcon(it)}<div class="rfinfo"><b>${esc(G[s].items[r])}</b><small>${esc(rr.name)} · +${pc(G[s].val[r])} ${esc(G[s].txt)}</small>
      <div class="upcost"><span class="${ok ? '' : 'lack'}"><img src="${RUNE_ICON(key)}" alt=""><b>${need}</b></span>${RES4.map((k) => `<span data-need="${k}:${F.res[r]}">${RES_IC[k]}<b>${fmtFull(F.res[r])}</b></span>`).join('')}<span>${TIME_IC}<b>${fmtT(F.sec[r])}</b></span></div>
      ${act}</div></div>`;
  }).join('');
  return `${ribbon('Ковка снаряжения')}${bank}
    <p class="ghint center">Руны собирают отряды на карте мира — в каждой провинции три рунных камня. Сколько рун у вас, видно выше.</p>
    ${busy}${tabs}<div class="rfhint">${esc(G[s].name)} куётся за руны «${esc(C.runeNames[key])}». Готовая вещь появится в Оружейной генерала.</div>${rows}`;
}

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-runeforge],[data-rfslot],[data-rforge]'); if (!t) return;
  const d = t.dataset;
  if (d.runeforge !== undefined) return openSheet(runeForgeWin);
  if (d.rfslot) { S.rfSlot = d.rfslot; return refreshSheet(); }
  if (d.rforge !== undefined) {
    const r = Number(d.rforge), C = HC(), G = C.gear[S.rfSlot], k = G.rune;
    domeWarn([`Сковать «${G.items[r]}» (${C.gearRarity[r].name})?`, `Уйдёт: ${C.forge.runes[r]} × ${C.runeNames[k]}, по ${fmtFull(C.forge.res[r])} каждого ресурса и ${fmtT(C.forge.sec[r])} работы Кузнеца.`],
      'Ковать', () => send({ t: 'hero', op: 'forge', slot: S.rfSlot, r }), `${GFX}hero/gear_${S.rfSlot}_${r}.png`);
  }
});
// идущая ковка — в окне здания Кузницы, под кнопками
function runeJobHtml() {
  const j = MY().hero && MY().hero.forgeJob; if (!j || !HC().gear[j.slot]) return '';
  return `<div class="upjob">${gearIcon({ slot: j.slot, r: j.r })} Ковка «${esc(HC().gear[j.slot].items[j.r])}»<br>Осталось: <span class="cd" data-e="${j.end}"></span></div>`;
}
