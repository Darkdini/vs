'use strict';
// «Армии в замке» и «Военный поход» — как в оригинальном клиенте (сервер: squadOp / sendArmy в server/src/army.js).
// Замковая армия (castle.units) + отдельные армии-отряды (squads); армия уходит в поход целиком.

const ICO = (n) => `${G3}menu/${n}.svg`;
const armyTotal = (units) => Object.values(units || {}).reduce((s, n) => s + n, 0);
const armyKey = (k) => (k === 'castle' ? 'castle' : Number(k));
function armyByKey(k) {
  const m = MY();
  if (k === 'castle' || k === undefined) return { key: 'castle', name: 'Замковая армия', units: m.units, castle: true };
  const q = (m.squads || []).find((x) => x.id === Number(k));
  return q ? { key: q.id, name: `Армия: ${q.name}`, units: q.units } : null;
}
const allArmies = () => [armyByKey('castle'), ...(MY().squads || []).map((q) => armyByKey(q.id))];
const genHere = (a) => { const g = MY().general; return g && !g.dead && !g.away && (a.castle ? !g.squad : g.squad === a.key); };

// ---------- Армии в замке: как в Военном штабе оригинала — 5 армий на страницу, листалка, разделы с армиями вне замка ----------
S.armPage = 0;
const ARM_PER = 5, TOP = 'gfx3d/top/';
function armiesListHtml() {
  const list = allArmies(), pages = Math.max(1, Math.ceil(list.length / ARM_PER));
  S.armPage = Math.min(S.armPage, pages - 1);
  const rows = list.slice(S.armPage * ARM_PER, S.armPage * ARM_PER + ARM_PER).map((a) => `
    <div class="arow2"><div class="aicon"><img class="aswords" src="${ICO('swords')}" alt=""></div>
      <div class="ainfo"><div class="aname">${esc(a.name)}${genHere(a) ? ` <img class="rico" src="${unitSrc(unitById(M().generalId))}" alt="" title="генерал">` : ''}</div>
      <div class="acount"><img src="${G3}hq/helmet.png" alt=""> ${fmtFull(armyTotal(a.units))}</div>
      <button class="pbar amanage" data-army="${a.key}"><img src="${G3}Gears/a1.png" alt=""> Управление</button></div></div>`).join('');
  const my = MY(), n = armSections();
  const bar = (k, icon, text, cnt) => `<button class="pbar asec" data-asec="${k}"><img src="${icon}" alt=""> ${text}${cnt ? ` (${cnt})` : ''}</button>`;
  return `<div class="pager"><button data-apage="first">◀◀</button><button data-apage="prev">◀</button><span>${S.armPage + 1}</span><button data-apage="next">▶</button><button data-apage="last">▶▶</button></div>
    ${rows}
    ${bar('inc', `${TOP}inc.png`, 'Приближающиеся армии', n.inc.length)}
    ${bar('mine', `${TOP}att.png`, 'Ваши армии', n.mine.length)}
    ${bar('reinf', `${TOP}reinf.png`, 'Ваши подкрепления', n.reinf.length)}
    ${bar('outpost', `${GFX}build/hd3/guard_tower.png`, 'Форпост', 0)}
    ${bar('guests', `${TOP}guest.png`, 'Чужие подкрепления', n.guests.length)}
    ${bar('portal', `${GFX}build/hd3/portal.png`, 'В портале', n.portal.length)}
    <button class="pbar" data-campaign>Военный поход</button>`;
}
// армии вне замка по разделам
function armSections() {
  const my = MY(), arm = my.armies || [];
  return {
    inc: (my.incoming || []).filter((a) => a.mission !== 'trade' && a.mission !== 'reinforce'),
    mine: arm.filter((a) => a.state !== 'stay' && !a.portal),
    reinf: arm.filter((a) => a.state === 'stay'),
    guests: my.guests || [],
    portal: arm.filter((a) => a.portal && a.state !== 'stay'),
  };
}
const armWhen = (a) => (a.state === 'wait' ? `выйдет через <span class="cd" data-e="${a.depart}"></span>` : a.state === 'go' ? `к ${a.x}:${a.y}, прибудет через <span class="cd" data-e="${a.arrive}"></span>`
  : a.state === 'back' ? `возвращается, <span class="cd" data-e="${a.back}"></span>` : `стоит в «${esc(a.stayName || '')}»`);
function armSectionWin(k) {
  const n = armSections(), T = { inc: 'Приближающиеся армии', mine: 'Ваши армии', reinf: 'Ваши подкрепления', outpost: 'Форпост', guests: 'Чужие подкрепления', portal: 'В портале' }[k];
  const own = (a) => `<div class="arow2"><div class="aicon"><img class="aswords" src="${ICO('swords')}" alt=""></div><div class="ainfo">
      <div class="aname">${esc(a.squad ? (a.squad.id ? `Армия: ${a.squad.name}` : a.squad.name) : 'Армия')} — ${M().missions[a.mission]}${a.general ? ` <img class="rico" src="${unitSrc(unitById(M().generalId))}" alt="">` : ''}</div>
      <div class="acount"><img src="${ICO('helmet')}" alt=""> ${fmtFull(armyTotal(a.units))} · ${armWhen(a)}</div>
      ${typeof recallBtn === 'function' ? recallBtn(a) : ''}${a.state === 'stay' ? `<button class="pbar amanage" data-recall="${a.id}">Отозвать домой</button>` : ''}</div></div>`;
  let body;
  if (k === 'inc') body = n.inc.map((a) => `<div class="arow2 danger"><div class="aicon"><img class="aswords" src="${TOP}inc.png" alt=""></div><div class="ainfo">
      <div class="aname">${M().missions[a.mission]} от ${esc(a.from)}</div><div class="acount">из «${esc(a.castle)}» · прибудет через <span class="cd" data-e="${a.arrive}"></span></div></div></div>`).join('')
      || (MY().watch ? '<p class="parch-note">Никто не идёт на ваш замок.</p>' : '<p class="parch-note">Постройте Караульную башню — она покажет армии, идущие на ваш замок.</p>');
  else if (k === 'guests') body = n.guests.map((g) => `<div class="arow2"><div class="aicon"><img class="aswords" src="${TOP}guest.png" alt=""></div><div class="ainfo">
      <div class="aname">${esc(g.from)} (${esc(g.castle)})</div><div class="acount"><img src="${ICO('helmet')}" alt=""> ${fmtFull(armyTotal(g.units))} — защищает ваш замок</div></div></div>`).join('') || '<p class="parch-note">Чужих подкреплений в замке нет.</p>';
  else if (k === 'outpost') body = '<p class="parch-note">Форпостов нет. Форпост — укреплённая стоянка армии на карте мира (скоро).</p>';
  else body = n[k].map(own).join('') || `<p class="parch-note">${{ mine: 'Все армии дома.', reinf: 'Ваших подкреплений у союзников нет.', portal: 'Через портал сейчас никто не идёт.' }[k]}</p>`;
  return `${ribbon(T)}${body}`;
}
function armiesWin() { return `${ribbon('Армии в замке')}${armiesListHtml()}`; }

// ---------- Управление армией ----------
function armyWin(k) {
  const a = armyByKey(k);
  if (!a) return `${ribbon('Армия')}<p class="parch-note">Армии больше нет.</p>`;
  const units = Object.entries(a.units).filter(([, n]) => n > 0).map(([id, n]) => { const u = unitById(id); return u ? `<div class="uline"><img src="${unitSrc(u)}" alt=""> ${esc(u.name)}: ${fmtFull(n)}</div>` : ''; }).join('');
  const g = MY().general;
  const tile = (attr, icon, text) => `<button class="ptile" ${attr}><img src="${icon}" alt=""><span>${text}</span></button>`;
  return `${ribbon(a.name)}
    ${genHere(a) ? `<button class="uline ulink" data-general><img src="${unitSrc(unitById(M().generalId))}" alt=""> ${esc(g.name)}: 1 <small>(${fmtFull(g.level)} ур.)</small></button>` : ''}
    ${units || '<p class="parch-note">В армии нет войск.</p>'}<hr class="cwhr">
    ${a.castle ? `<div class="center"><button class="regroupbtn" data-regroup="${a.key}" aria-label="Переформировать"><img src="${G3}hq/regroup.png" alt="Переформировать"></button></div>`
    : `<div class="ptiles">${tile(`data-regroup="${a.key}"`, `${G3}hq/regroup.png`, 'Переформировать')}${tile(`data-campaign="${a.key}"`, ICO('swords'), 'В поход')}
      ${g && !g.dead && !g.away && !genHere(a) ? tile(`data-genhere="${a.key}"`, unitSrc(unitById(M().generalId)), 'Генерал сюда') : ''}
      ${tile(`data-rename="${a.key}"`, `${GFX}smallicon/softedit.png`, 'Переименовать')}${tile(`data-disband="${a.key}"`, `${GFX}smallicon/destroy.png`, 'Распустить')}</div>`}`;
}

// ---------- Переформирование — как в оригинале: у каждого юнита поле (сколько перевести) и плашка со шлемом (сколько есть,
// нажатие — все); ниже — куда («Создать новую» или другая армия), «Название новой армии:» и «Переформировать» ----------
function regroupWin(k) {
  const a = armyByKey(k); if (!a) return armyWin(k);
  S.rg = S.rg && S.rg.from === a.key ? S.rg : { from: a.key, to: 'new', units: {}, name: '' };
  const targets = [['new', 'Создать новую'], ...allArmies().filter((x) => x.key !== a.key).map((x) => [x.key, x.name])];
  const rows = Object.entries(a.units).filter(([, n]) => n > 0).map(([id, n]) => { const u = unitById(id); return u ? `<div class="rgrow">
      <div class="rgname"><img src="${unitSrc(u)}" alt=""> ${esc(u.name)}</div>
      <div class="rgline"><input class="rgin" type="number" inputmode="numeric" min="0" max="${n}" value="${S.rg.units[id] || ''}" data-rgu="${id}">
      <button class="rghave" data-rgall="${id}" data-rgmax="${n}"><img src="${G3}hq/helmet.png" alt=""> ${fmtFull(n)}</button></div></div>` : ''; }).join('');
  return `${ribbon('Переформирование')}
    ${genHere(a) ? `<label class="cchk"><input type="checkbox" data-rggen ${S.rg.gen ? 'checked' : ''}><i></i><img src="${unitSrc(unitById(M().generalId))}" alt=""> ${esc(MY().general.name)} (${fmtFull(MY().general.level)} ур.)</label>` : ''}
    ${rows || (genHere(a) ? '' : '<p class="parch-note">В армии нет войск.</p>')}
    <div class="rgto"><select data-rgto>${targets.map(([v, t]) => `<option value="${v}" ${String(S.rg.to) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    ${S.rg.to === 'new' ? `<div class="rgnh">Название новой армии:</div><input class="rgin wide" maxlength="20" value="${esc(S.rg.name || '')}" data-rgname>` : ''}
    <button class="pbar" data-rgdo>Переформировать</button>`;
}

// ---------- Военный поход ----------
const CAMPAIGN_MISSIONS = [['raid', 'Набег'], ['attack', 'Нападение'], ['reinforce', 'Подкрепление'], ['scout', 'Разведка'], ['expedition', 'Экспедиция'], ['settle', 'Освоение']];
function openArmySheet(pre = {}) {
  // армию игрок выбирает сам (из «В поход» у армии — уже выбрана); армия идёт целиком
  S.cmp = { army: pre.army !== undefined ? String(pre.army) : '', mission: pre.mission && pre.mission !== 'undefined' ? pre.mission : 'raid', x: pre.x ?? '', y: pre.y ?? '', portal: false, sched: false, at: '', res: {} };
  openSheet(campaignWin);
};
// «Война» на чужом замке: сначала выбрать, что делать — нападение, набег или разведка; потом — войска (campaignWin)
const WAR_KINDS = [['attack', 'Нападение', 'Бой до конца: проигравший теряет всю армию, победитель — тем меньше, чем больше перевес. Тараны ломают забор, катапульты — здания, бунтари захватывают замок.'],
  ['raid', 'Набег', 'Быстрый грабёж: никто не гибнет целиком — слабая сторона теряет больше; главное — унести ресурсы.'],
  ['scout', 'Разведка', 'Идут только разведчики: узнать войска, ресурсы и постройки замка, без боя.'],
  ['reinforce', 'Подкрепление', 'Войска встанут в этот замок и будут защищать его вместе с хозяином. Вернуть их можно в «Передвижениях армий».']];
function warWin(x, y) {
  const scout = M().units.find((u) => u.role === 'scout'), site = S.world && (S.world.objects || []).find((o) => o.x === Number(x) && o.y === Number(y) && o.site);
  const ic = { attack: `${GFX}watch/ic_attack.png`, raid: `${GFX}watch/ic_raid.png`, scout: scout ? unitSrc(scout) : `${GFX}watch/ic_watch.png`, reinforce: `${G3}top/reinf.png` };
  const ally = allyCastleAt(x, y); // союзник по альянсу — только подкрепление
  return `${ribbon('Война')}<div class="clabel">Цель: X ${esc(x)} · Y ${esc(y)}. Что делаем?</div>
    ${ally ? '<div class="cinfo small">Это замок вашего альянса — ему можно только помочь подкреплением.</div>' : ''}
    ${site ? '<div class="cinfo small">Это недострой: набег ничего не даст. Победное нападение, в котором выживут 3 путешественника, заберёт стройку вам.</div>' : ''}
    ${WAR_KINDS.filter(([k]) => (!ally || k === 'reinforce') && !(site && k === 'raid')).map(([k, t, d]) => `<button class="wpick" data-warkind="${k}" data-ax="${esc(x)}" data-ay="${esc(y)}"><img src="${ic[k]}" alt=""><span><b>${t}</b><small>${d}</small></span><i>›</i></button>`).join('')}`;
}
// пустая клетка на карте мира: «Освоение» — основать замок путешественниками
function emptyWin(x, y) {
  const r = MY().royal || {}, tv = unitById(224), have = (MY().units || {})[224] || 0;
  return `${ribbon('Пустая земля')}
    <div class="cwin"><img class="cwimg" src="${unitSrc(tv)}" alt=""><div><div class="cwname">X: ${x} Y: ${y}</div><div>Здесь можно основать новый замок.</div></div></div>
    <div class="bwline"><b>Освоение:</b> армия, в которой ${M().settleN || 10} путешественников, идёт сюда и строит замок ${M().settleDays || 3} дня. Стройку видно на карте — её можно атаковать и подкреплять; победное нападение, в котором выживут 3 путешественника, заберёт её.</div>
    <div class="bwline">Лояльность населения (Резиденция) должна позволять новый замок: нужно ${fmtFull(r.need || 0)}, у вас ${fmtFull(r.royal || 0)}. Списывается она, когда замок достроен.</div>
    <div class="bwline">Путешественников в Замковой армии: <b>${fmtFull(have)}</b> (тренируются в здании «Путешественник»).</div>
    <button class="pbar" data-armyopen="settle" data-ax="${x}" data-ay="${y}">Основать замок</button>`;
}
function campaignFit(mission, units) {
  const fits = { scout: (r) => ['scout', 'eye'].includes(r), expedition: (r) => r === 'archaeologist', trade: (r) => r === 'merchant', settle: (r) => !['merchant', 'archaeologist', 'sage'].includes(r), attack: (r) => !['merchant', 'archaeologist', 'sage'].includes(r) }[mission]
    || ((r) => !['merchant', 'archaeologist', 'sage', 'settler'].includes(r));
  return Object.fromEntries(Object.entries(units || {}).filter(([id, n]) => n > 0 && unitById(id) && fits(unitById(id).role)));
}
// идёт ли генерал с армией: в нападение/набег, а подкреплением — только в свой замок (перевод генерала)
// замок союзника по альянсу: на него только подкрепление (нападать, грабить и разведывать нельзя)
const allyCastleAt = (x, y) => { const me = S.st.user.ally, o = me && S.world && (S.world.objects || []).find((q) => q.kind === 'castle' && q.x === Number(x) && q.y === Number(y)); return !!(o && o.allyId === me && o.ownerId !== S.st.user.id); };
const ownCastleAt = (x, y) => (S.st.castles || []).some((k) => k.x === Number(x) && k.y === Number(y) && !k.active);
const genGoes = (a, c) => genHere(a) && (['attack', 'raid', 'rally'].includes(c.mission) || (c.mission === 'reinforce' && ownCastleAt(c.x, c.y)));
function campaignSec() {
  const c = S.cmp, a = c.army === '' ? null : armyByKey(c.army); if (!a || c.x === '' || c.y === '') return null;
  if (c.mission === 'rally') return S.boss && S.boss.rally ? Math.max(0, Math.ceil((S.boss.rally.end - now()) / 1000)) : null; // созыв: удар — когда он закончится
  const units = campaignFit(c.mission, a.units), speeds = Object.keys(units).map((id) => unitById(id).speed);
  if (genGoes(a, c)) speeds.push(unitById(M().generalId).speed);
  if (!speeds.length) return null;
  const b = MY().bonus, st = S.st.castle;
  let sec = Math.max(5, Math.round(Math.hypot(Number(c.x) - st.x, Number(c.y) - st.y) / (Math.min(...speeds) * b.speed * (S.cat.march || 1)) * 3600 / S.cat.speed));
  const o = ((S.world && S.world.objects) || []).find((w) => w.x === Number(c.x) && w.y === Number(c.y)); // лагерь разбойников — втрое быстрее
  if (o && (o.lair || [30, 31, 32].includes(o.img)) && ['attack', 'raid'].includes(c.mission)) sec = Math.max(5, Math.round(sec / (S.cat.campFast || 3)));
  if (c.portal) sec = Math.max(5, Math.round(sec / 4));
  return sec;
}
function campaignWin() {
  const c = S.cmp, armies = allArmies();
  if (allyCastleAt(c.x, c.y) && ['raid', 'attack', 'scout'].includes(c.mission)) c.mission = 'reinforce'; // союзник — только подкрепление
  const a = c.army === '' ? null : armyByKey(c.army);
  const portal = buildingLevel(38) > 0;
  const chk = (key, on, icon, text, dis) => `<label class="cchk ${dis ? 'off' : ''}"><input type="checkbox" data-cchk="${key}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}><i></i><img src="${icon}" alt=""> ${text}</label>`;
  const nm = (x) => x.name.replace(/^Армия: /, '');
  return `${ribbon('Военный поход')}
    <div class="clabel">Выберите армию из замка:</div>
    <div class="combo"><select data-cmp="army">${a ? '' : '<option value="" selected disabled>— выберите армию —</option>'}${armies.map((x) => { const k = armyTotal(campaignFit(c.mission, x.units)); return `<option value="${x.key}" ${a && String(x.key) === String(a.key) ? 'selected' : ''}>${esc(nm(x))} — ${fmtFull(k)} ${c.mission === 'scout' ? 'разведч.' : 'юн.'}${genHere(x) ? ' + генерал' : ''}</option>`; }).join('')}</select></div>
    <div class="clabel">Цель похода:</div>
    <div class="combo"><select data-cmp="mission">${(c.mission === 'rally' ? [['rally', 'Созыв на мирового босса']] : CAMPAIGN_MISSIONS.filter(([k]) => !allyCastleAt(c.x, c.y) || !['raid', 'attack', 'scout'].includes(k))).map(([k, t]) => `<option value="${k}" ${k === c.mission ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    ${c.mission === 'rally' ? '<div class="cinfo small">Армия встанет в общую армию альянса и ударит по боссу вместе со всеми, когда созыв закончится. Домой вернётся быстрым маршем.</div>'
      : `<div class="row2 cxy"><label>X<input type="number" inputmode="numeric" data-cmp="x" value="${esc(c.x)}"></label><label>Y<input type="number" inputmode="numeric" data-cmp="y" value="${esc(c.y)}"></label></div>`}
    ${c.mission === 'trade' ? `<div class="row2">${RES4.map((r) => `<label>${RES_IC[r]}<input type="number" inputmode="numeric" min="0" data-cres="${r}" value="${c.res[r] || ''}" placeholder="0"></label>`).join('')}</div>` : ''}
    ${c.mission === 'rally' ? '' : `${chk('portal', c.portal, `${GFX}build/hd3/portal.png`, 'Через портал', !portal)}
    ${chk('sched', c.sched && isPrem(), `${GFX}res/time.png`, isPrem() ? 'Расписание отправки' : 'Расписание отправки 🔒 премиум', !isPrem())}
    ${c.sched && isPrem() ? `<input type="datetime-local" data-cmp="at" value="${esc(c.at)}">` : ''}`}
    ${!a ? '<div class="cinfo">Армию собирают заранее: Военный штаб → «Армии в замке» → «Переформировать».</div>'
      : `<div class="cinfo ctime">${gimg('res/time.png', 'ric')} ${c.mission === 'rally' ? 'Удар созыва через' : 'Время в пути'}: <b id="cmpTime">${(() => { const t = campaignSec(); return t ? fmtT(t) : '—'; })()}</b></div>`}
    <button class="pbar" data-cmpgo>Отправить</button>`;
}

// ---------- события ----------
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-asec],[data-army],[data-apage],[data-campaign],[data-regroup],[data-genhere],[data-rename],[data-disband],[data-recall],[data-rgall],[data-rgdo],[data-cmpgo],[data-armies],[data-warpick],[data-warkind]');
  if (!t) return;
  const d = t.dataset;
  if (d.armies !== undefined) return openSheet(armiesWin);
  if (d.warpick !== undefined) return openSheet(() => warWin(d.ax, d.ay));
  if (d.warkind) return openArmySheet({ mission: d.warkind, x: Number(d.ax), y: Number(d.ay) });
  if (d.asec) return openSheet(() => armSectionWin(d.asec));
  if (d.army !== undefined) return openSheet(() => armyWin(armyKey(d.army)));
  if (d.apage) { const pages = Math.ceil(allArmies().length / ARM_PER); S.armPage = { first: 0, prev: S.armPage - 1, next: S.armPage + 1, last: pages - 1 }[d.apage]; S.armPage = Math.max(0, Math.min(pages - 1, S.armPage)); return refreshSheet(); }
  if (d.campaign !== undefined) return openArmySheet({ army: d.campaign === '' ? 'castle' : d.campaign });
  if (d.regroup !== undefined) { S.rg = null; return openSheet(() => regroupWin(armyKey(d.regroup))); }
  if (d.genhere !== undefined) return send({ t: 'squad', op: 'general', id: d.genhere });
  if (d.rename !== undefined) { const nm = prompt('Название армии:'); if (nm) send({ t: 'squad', op: 'rename', id: Number(d.rename), name: nm }); return; }
  if (d.disband !== undefined) { if (confirm('Распустить армию в Замковую армию?')) { send({ t: 'squad', op: 'disband', id: Number(d.disband) }); closeSheet(); } return; }
  if (d.recall) return send({ t: 'squad', op: 'recall', id: Number(d.recall) });
  if (d.rgall) { S.rg.units[d.rgall] = Number(d.rgmax); const i = $(`[data-rgu="${d.rgall}"]`); if (i) i.value = d.rgmax; return; }
  if (d.rgdo !== undefined) { send({ t: 'squad', op: 'regroup', from: S.rg.from, to: S.rg.to, units: S.rg.units, general: !!S.rg.gen, name: S.rg.to === 'new' ? S.rg.name : undefined }); return; }
  if (d.cmpgo !== undefined) {
    const c = S.cmp, at = c.sched && c.at ? new Date(c.at).getTime() : 0;
    if (c.army === '') return toast('Выберите армию, которая пойдёт в поход.', 'err');
    return send({ t: 'send', from: c.army, mission: c.mission, x: Number(c.x), y: Number(c.y), portal: c.portal, at, res: c.res });
  }
});
$('#sheetBody').addEventListener('input', (e) => {
  const d = e.target.dataset, v = e.target.value;
  if (d.rgu && S.rg) S.rg.units[d.rgu] = Math.max(0, Math.floor(Number(v)) || 0);
  if (d.rgname !== undefined && S.rg) S.rg.name = v;
  if (!S.cmp) return;
  if (d.cmp === 'x' || d.cmp === 'y') { S.cmp[d.cmp] = v === '' ? '' : Number(v); const s = campaignSec(); const el = $('#cmpTime'); if (el) el.textContent = s ? fmtT(s) : '—'; }
  if (d.cmp === 'at') S.cmp.at = v;
  if (d.cres) S.cmp.res[d.cres] = Math.max(0, Math.floor(Number(v)) || 0);
});
$('#sheetBody').addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (d.rggen !== undefined && S.rg) S.rg.gen = e.target.checked;
  if (d.rgto !== undefined && S.rg) { S.rg.to = e.target.value === 'new' || e.target.value === 'castle' ? e.target.value : Number(e.target.value); e.target.blur(); refreshSheet(); }
  if (!S.cmp) return;
  if (d.cmp === 'army' || d.cmp === 'mission') { e.target.blur(); S.cmp[d.cmp] = e.target.value; refreshSheet(); }
  if (d.cchk) { e.target.blur(); S.cmp[d.cchk] = e.target.checked; if (d.cchk === 'sched' && e.target.checked && !S.cmp.at) { const t = new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000); S.cmp.at = t.toISOString().slice(0, 16); } refreshSheet(); }
});
