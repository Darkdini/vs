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
      <div class="acount"><img src="${ICO('helmet')}" alt=""> ${fmtFull(armyTotal(a.units)) }</div>
      <button class="pbar amanage" data-army="${a.key}"><img src="${G3}Gears/a1.png" alt=""> Управление</button></div></div>`).join('');
  const my = MY(), n = armSections();
  const bar = (k, icon, text, cnt) => `<button class="pbar asec" data-asec="${k}"><img src="${icon}" alt=""> ${text}${cnt ? ` (${cnt})` : ''}</button>`;
  return `${rows}
    <div class="pager"><button data-apage="first">◀◀</button><button data-apage="prev">◀</button><span>${S.armPage + 1}</span><button data-apage="next">▶</button><button data-apage="last">▶▶</button></div>
    ${bar('inc', `${TOP}inc.png`, 'Приближающиеся армии', n.inc.length)}
    ${bar('mine', `${TOP}att.png`, 'Ваши армии', n.mine.length)}
    ${bar('reinf', `${TOP}reinf.png`, 'Ваши подкрепления', n.reinf.length)}
    ${bar('outpost', `${GFX}build/guard_tower.png`, 'Форпост', 0)}
    ${bar('guests', `${TOP}guest.png`, 'Чужие подкрепления', n.guests.length)}
    ${bar('portal', `${GFX}build/portal.png`, 'В портале', n.portal.length)}
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
      ${a.state === 'stay' ? `<button class="pbar amanage" data-recall="${a.id}">Отозвать домой</button>` : ''}</div></div>`;
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
    ${units || '<p class="parch-note">В армии нет войск.</p>'}
    <hr class="cwhr"><div class="ptiles ${a.castle && !(g && !g.dead && !g.away && !genHere(a)) ? 'solo' : ''}">
      ${tile(`data-regroup="${a.key}"`, `${G3}Gears/a1.png`, 'Переформировать')}
      ${a.castle ? '' : tile(`data-campaign="${a.key}"`, ICO('swords'), 'В поход')}
      ${g && !g.dead && !g.away && !genHere(a) ? tile(`data-genhere="${a.key}"`, unitSrc(unitById(M().generalId)), 'Генерал сюда') : ''}
      ${a.castle ? '' : tile(`data-rename="${a.key}"`, `${GFX}smallicon/softedit.png`, 'Переименовать')}
      ${a.castle ? '' : tile(`data-disband="${a.key}"`, `${GFX}smallicon/destroy.png`, 'Распустить')}
    </div>`;
}

// ---------- Переформировать: перевести войска в другую армию или в новую ----------
function regroupWin(k) {
  const a = armyByKey(k); if (!a) return armyWin(k);
  S.rg = S.rg && S.rg.from === a.key ? S.rg : { from: a.key, to: 'new', units: {} };
  const targets = [['new', 'Новая армия'], ...allArmies().filter((x) => x.key !== a.key).map((x) => [x.key, x.name])];
  const rows = Object.entries(a.units).filter(([, n]) => n > 0).map(([id, n]) => { const u = unitById(id); return u ? `<div class="row"><img class="ui s" src="${unitSrc(u)}" alt="">
      <div class="grow"><b>${esc(u.name)}</b><span>есть ${fmtFull(n)}</span></div>
      <input class="num" type="number" inputmode="numeric" min="0" max="${n}" value="${S.rg.units[id] || ''}" placeholder="0" data-rgu="${id}"><button class="btn small" data-rgall="${id}" data-rgmax="${n}">все</button></div>` : ''; }).join('');
  return `${ribbon('Переформировать')}
    <div class="clabel">Из армии: <b>${esc(a.name)}</b></div>
    <div class="clabel">В армию:</div>
    <div class="combo"><select data-rgto>${targets.map(([v, t]) => `<option value="${v}" ${String(S.rg.to) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    ${genHere(a) ? `<label class="cchk"><input type="checkbox" data-rggen ${S.rg.gen ? 'checked' : ''}><i></i><img src="${unitSrc(unitById(M().generalId))}" alt=""> Генерал «${esc(MY().general.name)}» (${fmtFull(MY().general.level)} ур.) — перевести в выбранную армию</label>` : ''}
    <div class="list" style="margin-top:8px">${rows || (genHere(a) ? '' : '<p class="parch-note">В армии нет войск.</p>')}</div>
    <button class="pbar" data-rgdo>Переформировать</button>
    <p class="small muted">Генерала можно перевести в любую армию замка. В другой свой замок генерал уходит подкреплением: «Военный поход» → «Подкрепление» на координаты своего замка — там он появится в Военном штабе.</p>`;
}

// ---------- Военный поход ----------
const CAMPAIGN_MISSIONS = [['raid', 'Набег'], ['attack', 'Нападение'], ['reinforce', 'Подкрепление'], ['scout', 'Разведка'], ['expedition', 'Экспедиция']];
function openArmySheet(pre = {}) {
  S.cmp = { army: pre.army !== undefined ? String(pre.army) : 'castle', mission: pre.mission && pre.mission !== 'undefined' ? pre.mission : 'raid', x: pre.x ?? '', y: pre.y ?? '', portal: false, sched: false, at: '', res: {} };
  openSheet(campaignWin);
};
function campaignFit(mission, units) {
  const fits = { scout: (r) => ['scout', 'eye'].includes(r), expedition: (r) => r === 'archaeologist', trade: (r) => r === 'merchant' }[mission]
    || ((r) => !['merchant', 'archaeologist', 'sage', 'settler'].includes(r));
  return Object.fromEntries(Object.entries(units || {}).filter(([id, n]) => n > 0 && unitById(id) && fits(unitById(id).role)));
}
// идёт ли генерал с армией: в нападение/набег, а подкреплением — только в свой замок (перевод генерала)
const ownCastleAt = (x, y) => (S.st.castles || []).some((k) => k.x === Number(x) && k.y === Number(y) && !k.active);
const genGoes = (a, c) => genHere(a) && (['attack', 'raid'].includes(c.mission) || (c.mission === 'reinforce' && ownCastleAt(c.x, c.y)));
function campaignSec() {
  const c = S.cmp, a = armyByKey(c.army); if (!a || c.x === '' || c.y === '') return null;
  const units = campaignFit(c.mission, a.units), speeds = Object.keys(units).map((id) => unitById(id).speed);
  if (genGoes(a, c)) speeds.push(unitById(M().generalId).speed);
  if (!speeds.length) return null;
  const b = MY().bonus, st = S.st.castle;
  let sec = Math.max(5, Math.round(Math.hypot(Number(c.x) - st.x, Number(c.y) - st.y) / (Math.min(...speeds) * b.speed) * 3600 / S.cat.speed));
  if (c.portal) sec = Math.max(5, Math.round(sec / 4));
  return sec;
}
function campaignWin() {
  const c = S.cmp, armies = allArmies();
  const a = armyByKey(c.army) || armies[0];
  const go = campaignFit(c.mission, a.units), n = armyTotal(go), sec = campaignSec();
  const portal = buildingLevel(38) > 0;
  const chk = (key, on, icon, text, dis) => `<label class="cchk ${dis ? 'off' : ''}"><input type="checkbox" data-cchk="${key}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}><i></i><img src="${icon}" alt=""> ${text}</label>`;
  return `${ribbon('Военный поход')}
    <div class="clabel">Выберите армию из замка:</div>
    <div class="combo"><select data-cmp="army">${armies.map((x) => `<option value="${x.key}" ${String(x.key) === String(a.key) ? 'selected' : ''}>${esc(x.name)} (🪖 ${fmtFull(armyTotal(x.units))})</option>`).join('')}</select></div>
    <div class="clabel">Цель похода:</div>
    <div class="combo"><select data-cmp="mission">${CAMPAIGN_MISSIONS.map(([k, t]) => `<option value="${k}" ${k === c.mission ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="row2 cxy"><label>X<input type="number" inputmode="numeric" data-cmp="x" value="${esc(c.x)}"></label><label>Y<input type="number" inputmode="numeric" data-cmp="y" value="${esc(c.y)}"></label></div>
    ${c.mission === 'trade' ? `<div class="row2">${RES4.map((r) => `<label>${RES_IC[r]}<input type="number" inputmode="numeric" min="0" data-cres="${r}" value="${c.res[r] || ''}" placeholder="0"></label>`).join('')}</div>` : ''}
    ${chk('portal', c.portal, `${GFX}build/portal.png`, 'Через портал', !portal)}
    ${chk('sched', c.sched, `${GFX}res/time.png`, 'Расписание отправки')}
    ${c.sched ? `<input type="datetime-local" data-cmp="at" value="${esc(c.at)}">` : ''}
    <div class="cinfo">В поход идут: <b>${fmtFull(n)}</b> ${genGoes(a, c) ? '+ генерал' : ''} · в пути: <b id="cmpTime">${sec ? fmtT(sec) : '—'}</b></div>
    ${n < armyTotal(a.units) ? '<div class="cinfo small">Неподходящие для этого похода юниты останутся в замке.</div>' : ''}
    <button class="pbar" data-cmpgo>Отправить</button>`;
}

// ---------- события ----------
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-asec],[data-army],[data-apage],[data-campaign],[data-regroup],[data-genhere],[data-rename],[data-disband],[data-recall],[data-rgall],[data-rgdo],[data-cmpgo],[data-armies]');
  if (!t) return;
  const d = t.dataset;
  if (d.armies !== undefined) return openSheet(armiesWin);
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
  if (d.rgdo !== undefined) { send({ t: 'squad', op: 'regroup', from: S.rg.from, to: S.rg.to, units: S.rg.units, general: !!S.rg.gen }); S.rg.units = {}; S.rg.gen = false; return closeSheet(); }
  if (d.cmpgo !== undefined) {
    const c = S.cmp, at = c.sched && c.at ? new Date(c.at).getTime() : 0;
    return send({ t: 'send', from: c.army, mission: c.mission, x: Number(c.x), y: Number(c.y), portal: c.portal, at, res: c.res });
  }
});
$('#sheetBody').addEventListener('input', (e) => {
  const d = e.target.dataset, v = e.target.value;
  if (d.rgu && S.rg) S.rg.units[d.rgu] = Math.max(0, Math.floor(Number(v)) || 0);
  if (!S.cmp) return;
  if (d.cmp === 'x' || d.cmp === 'y') { S.cmp[d.cmp] = v === '' ? '' : Number(v); const s = campaignSec(); const el = $('#cmpTime'); if (el) el.textContent = s ? fmtT(s) : '—'; }
  if (d.cmp === 'at') S.cmp.at = v;
  if (d.cres) S.cmp.res[d.cres] = Math.max(0, Math.floor(Number(v)) || 0);
});
$('#sheetBody').addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (d.rggen !== undefined && S.rg) S.rg.gen = e.target.checked;
  if (d.rgto !== undefined && S.rg) S.rg.to = e.target.value === 'new' || e.target.value === 'castle' ? e.target.value : Number(e.target.value);
  if (!S.cmp) return;
  if (d.cmp === 'army' || d.cmp === 'mission') { e.target.blur(); S.cmp[d.cmp] = e.target.value; refreshSheet(); }
  if (d.cchk) { e.target.blur(); S.cmp[d.cchk] = e.target.checked; if (d.cchk === 'sched' && e.target.checked && !S.cmp.at) { const t = new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000); S.cmp.at = t.toISOString().slice(0, 16); } refreshSheet(); }
});
