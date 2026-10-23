'use strict';
// Симулятор боя: кнопка «В симулятор» в отчёте разведки. Противник — из разведки (то, что разведчики увидели; можно поправить),
// своя армия — подбирается здесь. Считает сервер той же формулой, что и настоящий бой (army.js simBattle), в игре ничего не меняется.

S.sim = null;
const SIM_B = [3, 12, 20, 23]; // Казарма, Конюшня, Академия магов, Мастерская
const SIM_NOFIGHT = ['merchant', 'scout', 'eye', 'archaeologist', 'sage'];
const simHave = () => { const m = MY(), o = { ...(m.units || {}) }; for (const q of m.squads || []) for (const [id, n] of Object.entries(q.units || {})) o[id] = (o[id] || 0) + n; return o; };
// свои воины: кого можно тренировать (и разрушители, Таран) + кто уже есть в замке
function simMyUnits() {
  const race = S.st.user.race, have = simHave();
  const list = M().units.filter((u) => (u.race === race || u.race === 'all') && SIM_B.includes(u.building) && !u.notrain && u.id !== M().generalId);
  for (const id of Object.keys(have)) { const u = unitById(id); if (u && have[id] > 0 && !list.includes(u) && u.id !== M().generalId && !SIM_NOFIGHT.includes(u.role)) list.push(u); } // разведчики, торговцы, археологи — не в бой
  return list.sort((a, b) => SIM_B.indexOf(a.building) - SIM_B.indexOf(b.building) || a.level - b.level);
}
function openSim(r) {
  const d = r.data || {}, s = d.sim || {};
  const units = s.units ? { ...s.units } : null;
  S.sim = { title: d.def && (d.def.npc || `${d.def.castle} (${d.def.login})`), x: d.x, y: d.y, at: r.at, npc: s.npc ?? null, race: s.race || 'humans', uid: s.uid,
    dUnits: units, reinf: s.reinf ? { ...s.reinf } : null, known: { units: !!s.units, wall: s.wall !== undefined, def: s.defK !== undefined, res: !!s.res },
    wall: s.wall ?? 0, defK: s.defK || 1, magK: s.magK || 1, wallPer: s.wallPer, gen: s.gen || null, res: s.res || null, hidden: s.hidden || 0, forge: s.forge || null,
    mission: 'attack', general: false, units: {}, result: null };
  if (!units) { S.sim.dUnits = {}; for (const u of M().units.filter((x) => x.race === S.sim.race && [3, 12, 20].includes(x.building) && !x.notrain)) S.sim.dUnits[u.id] = 0; }
  openSheet(simWin);
}
const simRow = (u, val, key, race, extra = '') => `<div class="simrow ${extra ? 'my' : ''}"><img src="${unitSrc(u, race)}" alt=""><span>${esc(u.name)}</span>
  <input class="rgin" type="number" inputmode="numeric" min="0" value="${val || ''}" placeholder="0" data-${key}="${u.id}">${extra}</div>`;
function simWin() {
  const s = S.sim; if (!s) return `${ribbon('Симулятор боя')}<p class="parch-note">Сначала разведайте цель: в отчёте разведки будет кнопка «В симулятор боя» — данные противника подставятся сами, останется подобрать свою армию.</p><button class="pbar" data-simreps>Отчёты</button>`;
  const raceName = (S.cat.races || {})[s.race] || '';
  const note = (t) => `<div class="simnote">${t}</div>`;
  let foe;
  if (s.npc !== null) foe = `${note('Охрана лагеря крепнет вместе с силой вашей атаки (Кузница, науки, ранг, генерал) — считается сама.')}`;
  else {
    const rows = Object.entries(s.dUnits).map(([id, n]) => { const u = unitById(id); return u ? simRow(u, n, 'simd', s.race) : ''; }).join('');
    const rein = s.reinf && Object.keys(s.reinf).length ? `<div class="simsub">Подкрепления в замке</div>${Object.entries(s.reinf).map(([id, n]) => { const u = unitById(id); return u ? simRow(u, n, 'simr', s.race) : ''; }).join('')}` : '';
    foe = `${s.known.units ? '' : note('Армию разведчики не увидели — впишите сами, сколько воинов вы ждёте.')}${rows}${rein}
      <div class="simgrid">
        <label>Забор, ур.<input class="rgin" type="number" inputmode="numeric" min="0" max="20" value="${s.wall}" data-simwall></label>
        <label>Защита, +%<input class="rgin" type="number" inputmode="numeric" min="0" max="400" value="${Math.round((s.defK - 1) * 100)}" data-simdef></label>
      </div>
      ${note(`${s.known.wall ? 'Забор и бонус защиты (науки, ранг, артефакты, генерал) — по разведке.' : 'Постройки разведчики не увидели — Забор и бонус защиты впишите сами.'}`)}
      ${s.gen ? `<div class="simgen">${gimg(`units/${HD_DIR[s.race] || 'human/hd'}/general.png`, 'ric')} Генерал противника ${fmtFull(s.gen.level)} ур. — дома, защищает замок</div>` : ''}`;
  }
  const have = simHave(), g = MY().general, gOk = g && !g.dead && !g.away;
  const mine = simMyUnits().map((u) => simRow(u, s.units[u.id], 'simu', S.st.user.race, `<button class="simmax" data-simmax="${u.id}" title="Все в замке"><img src="${G3}hq/helmet.png" alt="">${fmtFull(have[u.id] || 0)}</button>`)).join('');
  const mis = [['attack', 'Нападение'], ['raid', 'Набег']].map(([k, t]) => `<button class="${s.mission === k ? 'on' : ''}" data-simmis="${k}">${t}</button>`).join('');
  return `${ribbon('Симулятор боя')}
    <div class="simhead"><b>${esc(s.title || '')}</b>${s.npc === null && raceName ? ` · ${esc(raceName)}` : ''}<br><small>${s.x}:${s.y} · разведка ${repDate(s.at)}</small></div>
    <div class="ribbon rband"><span><img src="${REPG}kingdef.png" alt=""> Противник</span></div>${foe}
    <div class="ribbon rband"><span><img src="${REPG}kingatt.png" alt=""> Ваша армия</span></div>
    <div class="coin-tabs simmis">${mis}</div>
    ${gOk ? `<label class="cchk"><input type="checkbox" data-simgen ${s.general ? 'checked' : ''}><i></i><img src="${unitSrc(unitById(M().generalId))}" alt=""> ${esc(g.name)} (${fmtFull(g.level)} ур.)</label>` : ''}
    <div class="two simbtns"><button class="pbtn" data-simall>Вся армия замка</button><button class="pbtn" data-simclr>Очистить</button></div>
    ${mine}
    <button class="pbar" data-simgo>⚔ Рассчитать бой</button>
    <div id="simres">${simResHtml()}</div>`;
}
function simResHtml() {
  const r = S.sim && S.sim.result; if (!r) return '';
  const k = r.ap && r.dp ? Math.max(r.ap, r.dp) / Math.min(r.ap, r.dp) : 1, kk = (Math.round(k * 10) / 10).toLocaleString('ru-RU');
  const rows = (list, race, self) => list.map((x) => { const u = x.id ? unitById(x.id) : null; return `<div class="rul">${u ? `<img class="ric" src="${unitSrc(u, race)}" alt=""> ${esc(u.name)}` : esc(x.name || '')}: <b>${fmtFull(x.lost)}</b> из ${fmtFull(x.was)}${self && x.wounded ? ` <small>(раненых ${fmtFull(x.wounded)})</small>` : ''}</div>`; }).join('');
  const sum = (l, f) => l.reduce((q, x) => q + x[f], 0), aW = sum(r.att, 'was'), aL = sum(r.att, 'lost'), dW = sum(r.def, 'was'), dL = sum(r.def, 'lost');
  const need = !r.win && r.ap ? Math.ceil((r.dp / r.ap - 1) * 100 + 1) : 0;
  const loot = r.win ? (r.npc ? `<div class="simline">Добыча: <b>${fmtFull(r.loot)}</b> из ${fmtFull(r.stock)} (унесут до ${fmtFull(r.carry)}). Цена потерь: ${fmtFull(r.lossCost)} → итог <b class="${r.profit >= 0 ? 'rgood' : 'rbad'}">${r.profit >= 0 ? '+' : ''}${fmtFull(r.profit)}</b></div>`
    : r.loot !== null ? `<div class="simline">Добыча: <b>${fmtFull(r.loot)}</b> (воины унесут до ${fmtFull(r.carry)}, в замке по разведке — ${fmtFull(r.stock)} сверх Тайника)</div>`
      : `<div class="simline">Воины унесут до <b>${fmtFull(r.carry)}</b> ресурсов (сколько их в замке — разведка не узнала).</div>`) : '';
  return `<div class="simres ${r.win ? 'win' : 'lose'}">
      <div class="simverdict">${r.win ? '⚔ Победа атаки' : '🛡 Поражение атаки'}</div>
      <div class="simline">Сила атаки <b>${fmtFull(r.ap)}</b> · защиты <b>${fmtFull(r.dp)}</b> — ${r.ap >= r.dp ? 'атака' : 'защита'} сильнее в <b>${kk}</b> раза</div>
      ${r.wallTo !== null ? `<div class="simline">Тараны: Забор ${r.wall} → <b>${r.wallTo}</b> ур.${r.win ? '' : ' (в бою; сломан останется, только если атака победит)'}</div>` : ''}
      ${r.morale < 100 ? `<div class="simline">Боевой дух ${r.morale}% — противник намного слабее вас, атака бьёт хуже.</div>` : ''}
      ${need ? `<div class="simline">Для победы атака должна быть сильнее примерно на <b>${need}%</b> — больше войск, Тараны против Забора или генерал.</div>` : ''}
      ${loot}
      <div class="simsub">Ваши потери: ${fmtFull(aL)} из ${fmtFull(aW)}${r.wounded ? ` · в Лазарет: ${fmtFull(r.wounded)}` : ''}</div>${rows(r.att, S.st.user.race, true)}
      <div class="simsub">Потери противника: ${fmtFull(dL)} из ${fmtFull(dW)}</div>${rows(r.def, S.sim.race)}
      <p class="small muted center">Удача в расчёте — 0%, в настоящем бою ±5%.</p></div>`;
}
function simMsg(m) { if (!S.sim) return; S.sim.result = m; refreshSheet(); const el = $('#simres'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-simrep],[data-simopen],[data-simreps],[data-simgo],[data-simmis],[data-simall],[data-simclr],[data-simmax]'); if (!t) return;
  const d = t.dataset, s = S.sim;
  if (d.simopen !== undefined) return openSheet(simWin); // Военный штаб: последний расчёт (или подсказка)
  if (d.simreps !== undefined) return openReports();
  if (d.simrep !== undefined) return S.openReport && openSim(S.openReport);
  if (!s) return;
  if (d.simmis) { s.mission = d.simmis; return refreshSheet(); }
  if (d.simall !== undefined) { s.units = {}; for (const [id, n] of Object.entries(simHave())) if (n > 0 && simMyUnits().some((u) => String(u.id) === id)) s.units[id] = n; return refreshSheet(); }
  if (d.simclr !== undefined) { s.units = {}; s.result = null; return refreshSheet(); }
  if (d.simmax) { s.units[d.simmax] = simHave()[d.simmax] || 0; const i = $(`[data-simu="${d.simmax}"]`); if (i) i.value = s.units[d.simmax] || ''; return; }
  if (d.simgo !== undefined) {
    const def = s.npc !== null ? { npc: s.npc } : { race: s.race, uid: s.uid, units: s.dUnits, reinf: s.reinf, wall: s.wall, defK: s.defK, magK: s.magK, wallPer: s.wallPer, gen: s.gen, res: s.res, hidden: s.hidden, forge: s.forge };
    send({ t: 'sim', units: s.units, general: s.general, mission: s.mission, def });
  }
});
$('#sheetBody').addEventListener('input', (e) => {
  const t = e.target, s = S.sim; if (!s || !t.dataset) return;
  const v = Math.max(0, Math.floor(Number(t.value) || 0)), d = t.dataset;
  if (d.simu) s.units[d.simu] = v;
  else if (d.simd) s.dUnits[d.simd] = v;
  else if (d.simr) s.reinf[d.simr] = v;
  else if (d.simwall !== undefined) s.wall = Math.min(20, v);
  else if (d.simdef !== undefined) s.defK = 1 + v / 100; // по разведке — точное значение, пока игрок его не изменил
  else if (d.simgen !== undefined) s.general = t.checked;
});
$('#sheetBody').addEventListener('change', (e) => { const t = e.target; if (S.sim && t.dataset && t.dataset.simgen !== undefined) S.sim.general = t.checked; });
