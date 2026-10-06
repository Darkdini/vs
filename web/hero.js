'use strict';
// Герой-генерал: окна «Умения» (3 ветки по 4 умения) и «Снаряжение» (6 ячеек + Оружейная).
// Сервер: server/src/hero.js (t:'hero', op: talent / talreset / equip / unequip / enhance / sell). Справочник — M().hero, состояние — MY().hero.
// Картинки — gfx/hero/*.png; пока их нет, показываются запасные значки (onerror).

const HERO_FB = { weapon: 'swordred', helm: 'shieldblue', armor: 'phidef', shield: 'shieldgreen', amulet: 'magattack', horse: 'speed', atk: 'phiattack', def: 'phidef', loot: 'carry' };
const himg = (src, fb, cls = '') => `<img class="${cls}" src="${GFX}hero/${src}.png" data-fb="${GFX}smallicon/${fb}.png" alt="">`;
// запасная картинка: <img data-fb="..."> — если основной нет (встроенные onerror запрещены политикой безопасности)
document.addEventListener('error', (e) => { const im = e.target; if (im && im.tagName === 'IMG' && im.dataset.fb && im.src.indexOf(im.dataset.fb) < 0) { im.src = im.dataset.fb; delete im.dataset.fb; } }, true);
const HC = () => M().hero;
const gearIcon = (it, cls = '') => himg(`gear_${it.slot}_${it.r}`, HERO_FB[it.slot], cls);
const gearNm = (it) => `${HC().gear[it.slot].items[it.r]}${it.plus ? ` +${it.plus}` : ''}`;
const gearVl = (it) => HC().gear[it.slot].val[it.r] * (1 + 0.15 * (it.plus || 0));
const pc = (v) => `${Math.round(v * 1000) / 10}%`;
const HERO_LINES = [['atk', 'атака армии'], ['mag', 'магическая атака'], ['def', 'защита армии'], ['fury', 'атака в Нападении'], ['raid', 'урон в Набеге'], ['ram', 'урон таранов'],
  ['wall', 'сила Забора (генерал дома)'], ['heal', 'павших выживает'], ['survive', 'шанс генерала уцелеть'], ['loot', 'добыча'], ['speed', 'скорость армии'], ['find', 'шанс трофея'], ['exp', 'опыт генерала']];

function heroTalWin() {
  const h = MY().hero, T = HC().talents;
  if (!h || h.talPts === undefined) return `${ribbon('Умения')}<p class="parch-note">Нужен живой генерал.</p>`;
  const col = (br) => {
    const b = T[br], inBr = b.list.reduce((s, t) => s + (h.tal[t.id] || 0), 0);
    return `<div class="tcol"><div class="thead">${himg(`branch_${br}`, HERO_FB[br])}<b>${b.name}</b><small>${b.desc} · ${inBr}</small></div>
      ${b.list.map((t) => { const n = h.tal[t.id] || 0, lock = inBr < t.need, full = n >= t.max;
        return `<button class="ttal ${lock ? 'lock' : ''} ${full ? 'full' : ''} ${n ? 'some' : ''}" data-tal="${t.id}">${himg(`tal_${t.id}`, HERO_FB[br])}<b>${t.name}</b><em>${n}/${t.max}</em><small>${lock ? `🔒 нужно ${t.need} очков в ветке` : t.desc}</small></button>`; }).join('')}</div>`;
  };
  return `${ribbon('Умения генерала')}
    <div class="gname small2"><img class="tpt" src="${GFX}hero/icon_point.png" alt=""> Свободные очки умений: <b>${h.talFree}</b> из ${h.talPts}</div>
    <p class="small muted center">Очко умений — на 1 уровне и за каждые 3 уровня генерала. Умения действуют, когда генерал ведёт армию (оборонные — и дома).</p>
    <div class="tcols">${Object.keys(T).map(col).join('')}</div>
    <button class="pbar" data-talreset>${h.talResets > 0 ? 'Сбросить умения (бесплатно)' : `Сбросить умения за ${HC().talResetGold} ${gimg('coins_s.png', 'ri')}`}</button>`;
}

const GEAR_L = ['helm', 'armor', 'shield'], GEAR_R = ['weapon', 'amulet', 'horse'];
function heroGearWin() {
  const h = MY().hero, g = MY().general, G = HC().gear, RR = HC().gearRarity;
  if (!h) return `${ribbon('Снаряжение')}<p class="parch-note">Загрузка…</p>`;
  const eq = h.eq || {};
  const slot = (s) => { const it = eq[s]; return `<button class="gslot r${it ? it.r : 'x'}" data-gslot="${s}" ${it ? `style="--rc:${RR[it.r].color}"` : ''}>${it ? gearIcon(it) : himg(`slot_${s}`, HERO_FB[s], 'empty')}<span>${it ? `${G[s].name}${it.plus ? ` +${it.plus}` : ''}` : G[s].name}</span></button>`; };
  const bonus = h.bonus ? HERO_LINES.filter(([k]) => h.bonus[k] > 0).map(([k, t]) => `<span>+${pc(h.bonus[k])} ${t}</span>`).join('') : '';
  const race = S.st.user.race, portrait = g ? `<img class="gport" src="${GFX}hero/portrait_${race}.png" data-fb="${unitSrc(unitById(M().generalId))}" alt="">` : '';
  return `${ribbon('Снаряжение')}
    ${g ? `<div class="gdoll"><div class="gcol">${GEAR_L.map(slot).join('')}</div><div class="gmid">${portrait}<b>${esc(g.name)}</b><small>${fmtFull(g.level)} ур.</small></div><div class="gcol">${GEAR_R.map(slot).join('')}</div></div>
    <div class="gbon">${bonus || '<span>Наденьте снаряжение и изучите умения — бонусы появятся здесь.</span>'}</div>` : '<p class="parch-note">Генерала нет — снаряжение ждёт в Оружейной.</p>'}
    ${h.job ? (() => { const all = [...h.gear, ...Object.values(eq)], it = all.find((x) => x && x.id === h.job.item); return `<div class="upbody center gjob">⚒ Кузнец усиливает${it ? ` «${esc(gearNm(it))}»` : ''} до +${h.job.plus}: <b><span class="cd" data-e="${h.job.end}"></span></b></div>`; })() : ''}
    ${ribbon(`Оружейная ${h.gear.length}/${h.bagMax}`)}
    <div class="gbag">${h.gear.length ? h.gear.map((it) => `<button class="gitem" data-gitem="${it.id}" style="--rc:${RR[it.r].color}">${gearIcon(it)}${it.plus ? `<em>+${it.plus}</em>` : ''}</button>`).join('')
      : '<p class="parch-note">Пусто. Снаряжение добывает генерал: в логовах похода «Тёмные земли» — всегда, в лагерях — иногда (умение «Охотник за трофеями» повышает шанс). Бывает и в Сундуке дня.</p>'}</div>`;
}

S.gsel = null;
function heroItemWin() {
  const h = MY().hero, id = S.gsel, RR = HC().gearRarity, G = HC().gear;
  const inBag = h.gear.find((x) => x.id === id), worn = Object.values(h.eq || {}).find((x) => x && x.id === id), it = inBag || worn;
  if (!it) return heroGearWin();
  const cur = !worn && h.eq && h.eq[it.slot];
  const cost = (it.plus || 0) < HC().gearMaxPlus ? HC().enhanceCost[it.r][it.plus || 0] : null, sell = HC().sellPrice[it.r][it.plus || 0];
  const res = (c, sec) => `<div class="upcost">${RES4.map((r) => `<span data-need="${r}:${c[r]}">${RES_IC[r]}<b>${fmtFull(c[r])}</b></span>`).join('')}${sec ? `<span>${TIME_IC}<b>${fmtT(sec)}</b></span>` : ''}</div>`;
  const job = h.job, mine = job && job.item === it.id;
  return `${ribbon(G[it.slot].name)}
    <div class="gcard" style="--rc:${RR[it.r].color}">${gearIcon(it, 'big')}<div><b>${esc(gearNm(it))}</b><small>${RR[it.r].name}</small>
      <p>+${pc(gearVl(it))} — ${G[it.slot].txt}${cur ? `<br><span class="muted">сейчас надето: ${esc(gearNm(cur))} (+${pc(gearVl(cur))})</span>` : ''}</p></div></div>
    ${worn ? `<button class="pbar" data-gun="${it.slot}">Снять</button>` : MY().general ? `<button class="pbar" data-geq="${it.id}">Надеть</button>` : ''}
    ${mine ? `<div class="upbody center gjob">⚒ Кузнец усиливает до +${job.plus}: <b><span class="cd" data-e="${job.end}"></span></b></div>`
      : cost ? `<div class="upbody center">Усилить у Кузнеца до +${(it.plus || 0) + 1} (+15% к силе вещи):</div>${res(cost, HC().enhanceSec[it.r][it.plus || 0])}${job ? '<div class="upbody center muted">Кузнец занят другой вещью — дождитесь конца.</div>' : `<button class="pbar" data-genh="${it.id}">Усилить</button>`}` : '<div class="upbody center">Вещь усилена до предела.</div>'}
    ${inBag && !mine ? `<div class="upbody center">Разобрать на ресурсы:</div>${res(sell)}<button class="pbar" data-gsell="${it.id}">Разобрать</button>` : ''}`;
}

function openHeroGear() { openSheet(heroGearWin); }
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-herotal],[data-herogear],[data-tal],[data-talreset],[data-gslot],[data-gitem],[data-geq],[data-gun],[data-genh],[data-gsell]'); if (!t) return;
  const d = t.dataset;
  if (d.herotal !== undefined) return openSheet(heroTalWin);
  if (d.herogear !== undefined) return openHeroGear();
  if (d.tal) return send({ t: 'hero', op: 'talent', id: d.tal });
  if (d.talreset !== undefined) { if (confirm('Сбросить все умения генерала? Очки вернутся.')) send({ t: 'hero', op: 'talreset' }); return; }
  if (d.gslot) { const it = (MY().hero.eq || {})[d.gslot]; if (it) { S.gsel = it.id; openSheet(heroItemWin); } return; }
  if (d.gitem) { S.gsel = Number(d.gitem); return openSheet(heroItemWin); }
  if (d.geq) { send({ t: 'hero', op: 'equip', item: Number(d.geq) }); return closeSheet(); }
  if (d.gun) { send({ t: 'hero', op: 'unequip', slot: d.gun }); return closeSheet(); }
  if (d.genh) return send({ t: 'hero', op: 'enhance', item: Number(d.genh) });
  if (d.gsell) { if (confirm('Разобрать вещь на ресурсы?')) { send({ t: 'hero', op: 'sell', item: Number(d.gsell) }); closeSheet(); } }
});
