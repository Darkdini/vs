'use strict';
// Окно «Генерал» — как в оригинальном клиенте (сервер: generalOp / generalView в server/src/army.js).
// С 27.10 генерал бьётся как его воин (новая боевая система): род войск, удары по пехоте/коннице/магам, специализация.
// Очки опыта за уровень — по пяти характеристикам (Личной защиты нет); сброс, переименование, «Убить», «Сменить воина», «Справка».

const GS = (n) => `${GFX}smallicon/${n}.png`;
const GEN_ROWS = [
  ['atk', 'phiattack', 'Личная атака'],
  ['catk', 'magattack', 'Командование атакой'],
  ['cdef', 'magdef', 'Командование защитой'],
  ['heal', 'plus', 'Скорость восстановления'],
  ['career', 'maxupgrade', 'Карьера'],
];
const kx = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
const GEN_CLS = { inf: 'пехота', cav: 'конница', mag: 'маги' };
// специализация и род войск генерала (как у его воина)
const genSpec = (p) => { const t = SPEC_TXT[p.spec] || SPEC_TXT.U; return `<span class="uspec" title="${t[2]}"><img src="${GS(`spec_${t[0]}`)}" alt=""> ${t[1]} · ${GEN_CLS[p.cls] || GEN_CLS.inf}</span>`; };
// три удара (по пехоте, коннице, магам) с иконками
const genHits = (a3) => ['inf', 'cav', 'mag'].map((k) => `<span title="${A3_NAME[k]}"><img src="${GS(A3_IC[k])}" alt="">${fmtFull(Math.round(a3[k]))}</span>`).join('');
// что воин даст генералу — в списках найма и смены воина
const genProf = (p) => (p ? `<div class="gprof">${genSpec(p)}<div class="ghits"><span title="Здоровье"><img src="${GS('health')}" alt="">${fmtFull(p.hp)}</span>${genHits(p.a3)}</div>
  <small>Командование до +${Math.round(p.cmdMax * 100)}% · опыт ×${kx(p.xp)}</small></div>` : '');

function generalWin() {
  const g = MY().general, gu = unitById(M().generalId);
  if (!g) return noGeneralWin();
  // полоса и числа — одно и то же: опыт внутри текущего уровня (100 ур.: от 490 050 до 500 000 — это 9 950 опыта)
  const s = g.stats, wu = unitById(s.kindId) || gu, span = Math.max(1, g.need - g.prevNeed), inLvl = Math.max(0, Math.min(span, g.exp - g.prevNeed)), done = inLvl / span;
  const line = (icon, label, value) => `<div class="gline"><img src="${icon.includes('/') ? icon : GS(icon)}" alt=""><span>${label}:</span><b>${value}</b></div>`;
  const tile = (attr, icon, text, badge) => `<button class="ptile" ${attr}><img src="${icon}" alt="">${badge !== undefined ? `<em class="gbadge">${badge}</em>` : ''}<span>${text}</span></button>`;
  const revive = g.dead ? (g.reviveAt
    ? `<p class="cinfo">Генерал воскресает: <span class="cd" data-e="${g.reviveAt}"></span></p>`
    : `<p class="cinfo">Генерал погиб в бою.</p><div class="chips">${RES4.map((r) => `<span>${RES_IC[r]} ${fmtFull(g.reviveCost[r])}</span>`).join('')}</div>
      <button class="pbar" data-revive>Воскресить</button>`) : '';
  // как в оригинале: здоровье, удары по пехоте/коннице/магам, командование атакой (%) и защитой (во сколько раз меньше урон по армии)
  return `${ribbon('Генерал')}
    <div class="gname">${esc(g.name)}</div>
    <div class="ghead"><img class="gimg" src="${unitSrc(gu)}" alt="">
      <div class="gright"><div>${esc(g.kind || wu.name)}</div><div>${genSpec(s)}</div><div><img src="${GS('status/f_gold')}" alt=""> ${fmtFull(g.level)} ур.</div></div></div>
    <div class="gnext">До след. уровня:<div class="gbar"><i style="width:${(done * 100).toFixed(1)}%"></i><b>${Math.floor(done * 100)}%</b></div><small>${fmtFull(inLvl)} / ${fmtFull(span)} опыта · ещё ${fmtFull(Math.max(0, g.need - g.exp))} до ${fmtFull(g.level + 1)} ур.</small></div>
    <div class="gtop g6">
      <div title="Здоровье"><img src="${GS('health')}" alt=""><b>${g.health}%</b></div>
      ${['inf', 'cav', 'mag'].map((k) => `<div title="${A3_NAME[k]}"><img src="${GS(A3_IC[k])}" alt=""><b>${fmtFull(Math.round(s.a3[k]))}</b></div>`).join('')}
      <div title="Командование атакой"><img src="${GS('magattack')}" alt=""><b>${(s.catk * 100).toFixed(1).replace('.', ',')}%</b></div>
      <div title="Командование защитой"><img src="${GS('magdef')}" alt=""><b>${(1 + s.cdef).toFixed(2).replace('.', ',')}</b></div>
    </div>
    ${line('phiattack', 'Личная атака', fmtFull(g.pts.atk))}
    ${line('magattack', 'Командование атакой', fmtFull(g.pts.catk))}
    ${line('magdef', 'Командование защитой', fmtFull(g.pts.cdef))}
    ${line('plus', 'Скорость восстановления', fmtFull(g.pts.heal))}
    ${line(`${G3}menu/locations.svg`, 'Находится в армии', g.dead ? 'погиб' : esc(g.where))}
    ${line('wall_icon', 'Размещение', esc(g.place || ''))}
    ${line('maxupgrade', 'Карьера', fmtFull(g.pts.career))}
    ${line('greenball', 'Свободные очки опыта', fmtFull(g.free))}
    ${revive}
    ${!g.dead && g.hpFull > Date.now() ? `<p class="cinfo">Здоровье ${g.health}% — полностью восстановится через <span class="cd" data-e="${g.hpFull}"></span></p>` : ''}
    ${g.rekind ? `<p class="cinfo">Переобучается в воина «${esc((unitById(g.rekind.kindId) || {}).name || '')}»: <span class="cd" data-e="${g.rekind.end}"></span></p>` : ''}
    <div class="ptiles g2">
      ${tile('data-herotal', `${GFX}hero/icon_talents.png" data-fb="${GS('maxupgrade')}`, 'Умения', MY().hero && MY().hero.talFree ? MY().hero.talFree : undefined)}
      ${tile('data-herogear', `${GFX}hero/icon_gear.png" data-fb="${GS('swordred')}`, 'Снаряжение', MY().hero && MY().hero.gear.length ? MY().hero.gear.length : undefined)}
    </div>
    <div class="ptiles g3">
      ${tile('data-genreset', `${G3}Gears/a1.png`, 'Сбросить очки', g.resets)}
      ${tile('data-gendist', GS('upgrade'), 'Распределить')}
      ${tile('data-genname', GS('softedit'), 'Переименовать')}
      ${tile('data-genhelp', GS('soft_help'), 'Справка')}
      ${tile('data-genkill', GS('l7day'), 'Убить')}
      ${g.dead || g.rekind ? '' : tile('data-genrkopen', unitSrc(wu), 'Сменить воина')}
    </div>`;
}

S.gd = {};
function genDistWin() {
  const g = MY().general; if (!g) return generalWin();
  const used = GEN_ROWS.reduce((s, [k]) => s + (Number(S.gd[k]) || 0), 0);
  const cap = (k) => (k === 'heal' ? g.healMax : k === 'career' ? g.careerMax : 0); // потолки — от воина генерала
  return `${ribbon('Генерал')}
    <div class="gname small2"><img src="${GS('greenball')}" alt=""> Свободные очки опыта: <b data-gdleft>${fmtFull(g.free - used)}</b></div>
    ${GEN_ROWS.map(([k, icon, label]) => `<div class="gdrow"><span><img src="${GS(icon)}" alt=""> ${label}:${cap(k) ? `<small class="gcap">${fmtFull(g.pts[k] || 0)} из ${fmtFull(cap(k))}</small>` : ''}</span>
      <input class="gdin" type="number" inputmode="numeric" min="0" placeholder="0" value="${S.gd[k] || ''}" data-gd="${k}"></div>`).join('')}
    <button class="pbar" data-gddo>Распределить</button>`;
}

// «Справка → Генерал» — как в оригинале: вкладки «Описание», «Характеристики», «Особенности», «F.A.Q.», без цифр (по просьбе владельца)
// (правила — server/src/army.js: genProfile, genStats, battleExp)
S.ghTab = 'about';
const GH_IC = (f) => `<img class="bhic" src="${GS(f)}" alt="">`;
const GH = {
  about: ['Описание', () => `<p><img class="bhic" src="${unitSrc(unitById(M().generalId))}" alt=""> <b>Генерал</b> — главнокомандующий ваших армий. Его присутствие в армии может переломить ход битвы.</p>
    <p>Сила генерала определяется воином, из которого он создан. От воина зависят:</p>
    <p>1. Скорость набора опыта. Чем слабее воин, тем быстрее генерал набирает опыт.</p>
    <p>2. Базовые удары ${GH_IC('phiattack')} Личной атаки — по пехоте, коннице и магам, как у воина. Чем они выше, тем больше урона наносит генерал.</p>
    <p>3. Предел ${GH_IC('magattack')} Командования атакой, ${GH_IC('magdef')} Командования защитой, ${GH_IC('plus')} Скорости восстановления и ${GH_IC('maxupgrade')} Карьеры. Чем сильнее воин, тем выше предел.</p>
    <p>4. Стоимость ${GH_IC('health')} воскрешения. Чем дороже воин, тем дороже воскресить генерала.</p>
    <p>5. Время воскрешения. Чем сильнее воин, тем дольше генерал воскресает.</p>`],
  stats: ['Характеристики', () => `<p>${GH_IC('phiattack')} <b>Личная атака</b> — какой урон наносит генерал, участвуя в бою.</p>
    <p>${GH_IC('magattack')} <b>Командование атакой</b> — на сколько процентов увеличен урон армии, в которой находится генерал.</p>
    <p>${GH_IC('magdef')} <b>Командование защитой</b> — во сколько раз уменьшен урон по армии, в которой находится генерал.</p>
    <p>${GH_IC('plus')} <b>Скорость восстановления</b> — уменьшает время воскрешения генерала.</p>
    <p>${GH_IC('maxupgrade')} <b>Карьера</b> — увеличивает опыт, который генерал получает в бою.</p>`],
  feat: ['Особенности', () => `<p>Сила и польза генерала зависят от воина, которого выбрали для его создания. Чем воин сильнее, тем лучше работают умения генерала. Но такой генерал растёт дольше, чем генерал из более слабого воина.</p>
    <p>Сильнее всего генералы из воинов старших уровней. Из ${GH_IC('atk_mag')} мага получится генерал сильнее, чем из ${GH_IC('atk_cav')} всадника, а генерал-${GH_IC('atk_inf')} пехотинец уступает генералу из конного воина.</p>
    <p>Опыт генерал получает только в бою, в котором участвует сам. Чем больше врагов одолеет его армия — и числом, и силой воинов, — тем больше опыта получит генерал. Тяжёлый бой тоже даёт опыт, даже если ваша армия понесла большие потери.</p>`],
  faq: ['F.A.Q.', () => `<p><b>В: Как перевести генерала из одного замка в другой?</b><br>О: Отправьте генерала с армией подкреплением в этот замок.</p>
    <p><b>В: Почему генерал не получил опыт после боя?</b><br>О: Опыт дают за врагов, которых одолела армия генерала. Опыта нет, если армия никого не одолела, если генерал погиб в бою или уже достиг наивысшего уровня.</p>
    <p><b>В: Какой эффект будет, если я вложу очки в характеристику?</b><br>О: Итог зависит от воина генерала. Личную атаку и командование атакой и защитой вы увидите в окне генерала сразу после распределения очков. Действие скорости восстановления и карьеры скрыто и числом не показывается.</p>
    <p><b>В: Я распределил очки в командование, но значение не изменилось. Почему?</b><br>О: Значение изменилось. Просто в окне не показываются совсем маленькие доли.</p>
    <p><b>В: Почему у генерала неполное здоровье?</b><br>О: В бою генерал теряет столько здоровья, сколько потеряла его армия: армия потеряла половину — и генерал теряет половину здоровья. Со временем здоровье восстанавливается. Если здоровье кончится, генерал погибнет — раненого генерала лучше не брать в тяжёлый бой, пока он не восстановится.</p>
    <p><b>В: Можно ли сменить воина генерала?</b><br>О: Да, кнопкой «Сменить воина» — за монеты. Уровень, опыт, очки и снаряжение останутся.</p>
    <p><b>В: Можно ли сделать генералом уникального воина или воина другой расы?</b><br>О: Нет. Генерал — только из воинов той расы, за которую вы играете.</p>`],
};
function genHelpWin() {
  const tabs = `<div class="coin-tabs bh4">${Object.entries(GH).map(([k, [t]]) => `<button class="${S.ghTab === k ? 'on' : ''}" data-ghtab="${k}">${t}</button>`).join('')}</div>`;
  return `${ribbon('Генерал')}${tabs}<div class="pstats bhelp">${(GH[S.ghTab] || GH.about)[1]()}</div>`;
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
  const deadHtml = dead.map((d, i) => `<div class="upbody center">Мёртвый ${gico(d.kindId)} Генерал (${esc(d.kind || '')})<br>${esc(d.name)}, ${fmtFull(d.level)} ур.</div>
    ${d.reviveAt ? `<div class="upbody center">Воскрешение. Осталось: <span class="cd" data-e="${d.reviveAt}"></span></div>`
    : d.coinsOnly ? `<div class="upbody center">Генерала выше 100 уровня воскрешают только за монеты.</div><div class="upbody center">Стоимость воскрешения: ${fmtFull(d.gold)} ${gimg('coins_s.png', 'ri')}</div>
      <button class="pbar" data-genrevg="${i}">Воскресить за монеты</button>`
    : `<div class="upbody center">Стоимость воскрешения:</div>${genCost(d)}${reviveFund(d)}<div class="upbody center">или ${fmtFull(d.gold)} ${gimg('coins_s.png', 'ri')}</div>
      <button class="pbar" data-genrev="${i}">${reviveAll(d) ? 'Воскресить' : 'Внести ресурсы'}</button><button class="pbar" data-genrevg="${i}">Воскресить за монеты</button>`}
    <div class="upbody">Удалить генерала ${esc(d.kind || '')}.</div><button class="pbar" data-gendel="${i}">Удалить</button><hr class="cwhr">`).join('');
  const train = tr ? `<div class="upbody center">Тренировка ${gico(tr.kindId)} Генерала (${esc(tr.kind)})<br>Осталось: <span class="cd" data-e="${tr.end}"></span></div>`
    : `${ribbon('Тренировка')}<div class="upbody center">Выберите юнита из замковой армии для тренировки:</div>
      ${(my.genUnits || []).map((x) => { const u = unitById(x.id); return `<button class="pbar gpick" data-gentu="${x.id}"><img class="fi" src="${unitSrc(u)}" alt=""> ${esc(u.name)}${genProf(x.prof)}</button>`; }).join('') || '<p class="parch-note">В замковой армии нет подходящих юнитов.</p>'}`;
  return `${ribbon('Генерал')}${tr ? '' : deadHtml}${train}`;
}
S.gtu = null;
function genTrainWin() {
  const x = (MY().genUnits || []).find((y) => y.id === S.gtu); if (!x) return noGeneralWin();
  return `${ribbon('Генерал')}<div class="upbody center">Генерал из воина ${gico(x.id)} ${esc(unitById(x.id).name)}:</div>${genProf(x.prof)}
    <div class="upbody center">Стоимость тренировки:</div>${genCost(x)}<button class="pbar" data-gentdo>Тренировать</button>`;
}
// сменить воина: уровень, опыт, очки и снаряжение остаются; цена — как найм, переобучение — полчаса (сервер: rekindGeneral)
function genRekindWin() {
  const g = MY().general; if (!g) return generalWin();
  const list = (MY().genUnits || []).filter((x) => x.id !== g.kindId);
  return `${ribbon('Сменить воина')}<div class="upbody center">Сейчас: ${gico(g.kindId)} Генерал (${esc(g.kind || '')}), ${fmtFull(g.level)} ур.</div>
    <p class="coinhint">Уровень, опыт, очки и снаряжение останутся. Если у нового воина пределы ниже, лишние очки станут свободными. Переобучение — ${Math.max(1, Math.round(g.rekindSec / S.cat.speed / 60))} мин, цена — ${coinsZa(g.rekindGold || 50).replace('монету', 'монета')}.</p>
    <div class="upbody center">Выберите юнита из замковой армии:</div>
    ${list.map((x) => { const u = unitById(x.id); return `<button class="pbar gpick" data-genrk="${x.id}"><img class="fi" src="${unitSrc(u)}" alt=""> ${esc(u.name)}${genProf(x.prof)}</button>`; }).join('') || '<p class="parch-note">В замковой армии нет подходящих юнитов.</p>'}`;
}
S.grk = null;
function genRekindDoWin() {
  const g = MY().general, x = (MY().genUnits || []).find((y) => y.id === S.grk); if (!g || !x) return genRekindWin();
  // цена — монеты (с 27.10), время — полчаса
  return `${ribbon('Сменить воина')}<div class="upbody center">Переобучить генерала в ${gico(x.id)} ${esc(unitById(x.id).name)}:</div>${genProf(x.prof)}
    <div class="upcost"><span>${gimg('coins_s.png', 'ri')}<b>${fmtFull(g.rekindGold || 50)}</b></span><span>${TIME_IC}<b>${fmtT(g.rekindSec / S.cat.speed)}</b></span></div>
    <div class="upbody center small">Уровень ${fmtFull(g.level)}, опыт, очки и снаряжение останутся.</div><button class="pbar" data-genrkdo>Сменить воина</button>`;
}
function openGeneral() { openSheet(generalWin); }
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-genrev],[data-genrevg],[data-gendel],[data-gentu],[data-gentdo],[data-genrkopen],[data-genrk],[data-genrkdo],[data-genhelp],[data-ghtab]'); if (!t) return;
  const d = t.dataset;
  if (d.genhelp !== undefined) { S.ghTab = 'about'; return openSheet(genHelpWin); }
  if (d.ghtab) { S.ghTab = d.ghtab; return refreshSheet(); }
  if (d.genrev) return send({ t: 'general', op: 'revive', idx: Number(d.genrev) });
  if (d.genrevg) return send({ t: 'general', op: 'revive', idx: Number(d.genrevg), gold: true });
  if (d.gendel) { if (confirm('Удалить генерала навсегда?')) send({ t: 'general', op: 'delete', idx: Number(d.gendel) }); return; }
  if (d.gentu) { S.gtu = Number(d.gentu); return openSheet(genTrainWin); }
  if (d.gentdo !== undefined) return send({ t: 'general', op: 'train', unit: S.gtu });
  if (d.genrkopen !== undefined) return openSheet(genRekindWin);
  if (d.genrk) { S.grk = Number(d.genrk); return openSheet(genRekindDoWin); }
  if (d.genrkdo !== undefined) { const g = MY().general; if (!confirm(`Сменить воина генерала за ${coinsZa((g && g.rekindGold) || 50)}?`)) return; send({ t: 'general', op: 'rekind', unit: S.grk }); closeSheet(); return closeSheet(); } // назад — в окно генерала
});

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-general],[data-genreset],[data-gendist],[data-genname],[data-genkill],[data-gddo]'); if (!t) return;
  const d = t.dataset, g = MY().general;
  if (d.general !== undefined) return openGeneral();
  if (d.gendist !== undefined) { S.gd = {}; return openSheet(genDistWin); }
  if (d.genreset !== undefined) {
    if (!confirm(g && g.resets > 0 ? 'Сбросить все очки опыта генерала? (бесплатный сброс)' : `Сбросить все очки за ${coinsZa(g ? g.resetGold : 100)}?`)) return;
    return send({ t: 'general', op: 'reset' });
  }
  if (d.genname !== undefined) { const n = prompt('Новое имя генерала:', g ? g.name : ''); if (n) send({ t: 'general', op: 'rename', name: n }); return; }
  if (d.genkill !== undefined) { if (confirm('Убить генерала? Его уровень, опыт и очки пропадут навсегда.\nЧтобы сменить воина и сохранить уровень — кнопка «Сменить воина».')) send({ t: 'general', op: 'kill' }); return; }
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
