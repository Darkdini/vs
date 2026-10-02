'use strict';
// Окно «Задания»: награда за вход (календарь 28 дней), обучение (цепочка), ежедневные (3 в день + сундук), недельные (3 + сундук недели),
// поход «Тёмные земли» (логова с боссами).
// Данные — с сервера (server/src/quests.js): t:'quests' → S.quests; награда — t:'qclaim'; итог — t:'qdone' (окно «Задание выполнено!»).

const QT = [['cal', 'Вход', 'stash/btn.png'], ['tut', 'Обучение', 'quest/scroll.png'], ['daily', 'День', 'quest/chest.png'], ['week', 'Неделя', 'quest/chest_open.png'], ['camp', 'Поход', 'quest/lair_dragon.png']];
function openQuests(tab) { if (tab) S.qtab = tab; S.quests = null; send({ t: 'quests' }); openSheet(questsWin); }
const qImg = (p, cls = '') => `<img class="${cls}" src="${p.startsWith('gfx3d/') ? p : GFX + p}" alt="">`;
function qReward(r) {
  if (!r) return '';
  return `<div class="qrew"><span class="qrew-h">Награда:</span>${RES4.filter((k) => r[k]).map((k) => `<span>${RES_IC[k]}<b>${fmtFull(r[k])}</b></span>`).join('')}
${r.art !== undefined ? `<span>${gimg(ART_ICON.atk, 'ri')}<b>${['артефакт', 'редкий артефакт', 'легендарный артефакт'][r.art]}</b></span>` : ''}
    ${Object.entries(r.u || {}).map(([slot, n]) => { const u = M().units.find((x) => x.quest && x.race === S.st.user.race && x.slot === slot); return u ? `<span class="quni"><img class="ri" src="${unitSrc(u)}" alt=""><b>${esc(u.name)} ×${n}</b></span>` : ''; }).join('')}
    ${r.exp ? `<span><img class="ri" src="${GFX}stash/exp.png" data-fb="${GFX}smallicon/magattack.png" alt=""><b>опыт генерала ${fmtFull(r.exp)}</b></span>` : ''}</div>`;
}
const qBar = (have, need) => `<div class="qbar"><i style="width:${need ? Math.min(100, have / need * 100) : 0}%"></i><span>${fmtFull(have)} / ${fmtFull(need)}</span></div>`;
function qCard(q, kind) {
  return `<div class="qcard ${q.done && !q.claimed ? 'ready' : ''} ${q.claimed ? 'claimed' : ''}">
    <div class="qhead"><div class="qic">${qImg(q.icon)}</div><div class="grow"><b>${esc(q.title)}</b><p>${esc(q.text)}</p></div></div>
    ${qBar(q.have, q.need)}${qReward(q.reward)}
    ${q.claimed ? '<div class="qdone-l">✔ Награда получена</div>' : q.done ? `<button class="qbtn" data-qclaim="${kind}" data-qid="${esc(q.id || '')}">Получить награду</button>` : ''}</div>`;
}
function questsWin() {
  const tab = S.qtab || 'tut', q = S.quests;
  const tabs = `<div class="qtabs">${QT.map(([k, t, ic]) => `<button class="${k === tab ? 'on' : ''}" data-qtab="${k}">${qImg(ic)}<span>${t}</span>${q && qTabReady(q, k) ? '<b class="qdot"></b>' : ''}</button>`).join('')}</div>`;
  if (!q) return `${ribbon('Задания')}${tabs}<p class="parch-note">Загрузка…</p>`;
  let body = '';
  if (tab === 'tut') {
    const t = q.tut;
    body = t.finished ? `<div class="qcard"><div class="qhead"><div class="qic">${qImg('quest/scroll.png')}</div><div class="grow"><b>Обучение пройдено!</b><p>Вы освоили все premudrosti управления королевством. Впереди — ежедневные задания и поход в Тёмные земли.</p></div></div></div>`.replace('premudrosti', 'премудрости')
      : `<div class="qstep">Задание ${t.idx + 1} из ${t.total}</div><div class="qchain"><i style="width:${t.idx / t.total * 100}%"></i></div>${qCard(t, 'tut')}`;
  } else if (tab === 'daily') {
    const ch = q.chest;
    body = `<div class="qstep">Новые задания — каждый день</div>${q.daily.map((d) => qCard(d, 'daily')).join('')}
      <div class="qchest ${ch.ready ? 'ready' : ''} ${ch.taken ? 'claimed' : ''}">${qImg(ch.ready || ch.taken ? 'quest/chest_open.png' : 'quest/chest.png')}<div class="grow"><b>Сундук дня</b><p>${ch.taken ? 'Открыт. Новый — завтра.' : 'Откроется, когда все три задания дня выполнены: ресурсы, уникальные воины, опыт генерала и шанс на артефакт.'}</p></div>
      ${ch.ready ? '<button class="qbtn" data-qclaim="chest">Открыть</button>' : ''}</div>`;
  } else if (tab === 'week') {
    const ch = q.wchest;
    body = `<div class="qstep">Задания недели — до понедельника, осталось <span class="cd" data-e="${ch.ends}"></span></div>${q.weekly.map((d) => qCard(d, 'weekly')).join('')}
      <div class="qchest ${ch.ready ? 'ready' : ''} ${ch.taken ? 'claimed' : ''}">${qImg(ch.ready || ch.taken ? 'quest/chest_open.png' : 'quest/chest.png')}<div class="grow"><b>Сундук недели</b><p>${ch.taken ? 'Открыт. Новый — в понедельник.' : 'Откроется, когда все три задания недели выполнены: много ресурсов, уникальные воины, опыт генерала, редкое снаряжение и шанс на артефакт.'}</p></div>
      ${ch.ready ? '<button class="qbtn" data-qclaim="wchest">Открыть</button>' : ''}</div>`;
  } else if (tab === 'cal') {
    body = calBody(q.cal);
  } else {
    const c = q.camp;
    body = c.finished ? `<div class="qcard"><div class="qhead"><div class="qic">${qImg('quest/ruins.png')}</div><div class="grow"><b>Тёмные земли очищены!</b><p>Дракон повержен, о вашем королевстве слагают легенды.</p></div></div></div>`
      : `<div class="qstep">Глава ${c.k + 1} из ${c.total}</div>
      <div class="qscene"><img class="qplace" src="${GFX}${c.img}" alt=""><img class="qboss" src="${GFX}${c.boss}" alt=""><div class="qtitle">${esc(c.title)}</div></div>
      <div class="qcard"><p class="qstory">${esc(c.text)}</p>
        <div class="qguard-h">Охрана логова</div>
        ${c.guard.map((s) => `<div class="qguard ${s.boss ? 'boss' : ''}"><b>${s.boss ? '👑 ' : ''}${esc(s.name)}${s.boss ? '' : ` ×${fmtFull(s.n)}`}</b>
          <span>${STAT_IC('health')}${fmtFull(s.hp)}</span>${s.atk ? `<span>${STAT_IC('phiattack')}${s.atk}</span>` : ''}${s.mag ? `<span>${STAT_IC('magattack')}${s.mag}</span>` : ''}<span>${STAT_IC('phidef')}${s.def}</span><span>${STAT_IC('magdef')}${s.mdef}</span></div>`).join('')}
        ${qReward(c.reward)}
        ${c.won ? '<div class="qwon">Логово разорено!</div><button class="qbtn" data-qclaim="camp">Забрать трофеи</button>'
          : `<p class="small muted">Логово отмечено на карте мира: <b>X ${c.x}, Y ${c.y}</b>. Отправьте армию в Нападение или Набег — победа откроет следующую главу.</p>
          <div class="qbtns"><button class="pbar" data-qgo="${c.x},${c.y}">Выступить</button><button class="btn" data-goworld="${c.x},${c.y}">На карте</button></div>`}</div>`;
  }
  return `${ribbon('Задания')}${tabs}${body}`;
}
const qTabReady = (q, k) => (k === 'tut' ? q.tut.done : k === 'daily' ? q.daily.some((d) => d.done && !d.claimed) || q.chest.ready
  : k === 'week' ? q.weekly.some((d) => d.done && !d.claimed) || q.wchest.ready : k === 'cal' ? q.cal.ready : q.camp.won);
// календарь входа: 28 клеток (4 недели), каждый 7-й день — крупная награда; пропуск дня прогресс не сбрасывает
function calIcon(rw) {
  if (rw.art !== undefined) return qImg(ART_ICON.atk);
  if (rw.gear !== undefined) return qImg(`hero/gear_armor_${rw.gear}.png`);
  const slot = Object.keys(rw.u || {})[0], u = slot && M().units.find((x) => x.quest && x.race === S.st.user.race && x.slot === slot);
  if (u && !rw.wood) return `<img src="${unitSrc(u)}" alt="">`;
  if (rw.exp && !rw.wood) return qImg('stash/exp.png');
  return qImg('quest/chest.png');
}
function calBody(cal) {
  const today = cal.days[cal.n];
  return `<div class="qstep">Награда за вход · круг ${cal.cycle} · день ${cal.n + (cal.ready ? 1 : 0)} из 28</div>
    <p class="small muted center">Заходите каждый день и забирайте награду — всё падает в Кладовую. Пропуск дня не сбрасывает прогресс. Каждый 7-й день — особая награда.</p>
    <div class="calg">${cal.days.map((d) => `<div class="calc ${d.taken ? 'taken' : ''} ${d.i === cal.n && cal.ready ? 'now' : ''} ${d.big ? `big b${d.big}` : ''}"><i>${d.i + 1}</i>${calIcon(d.rw)}${d.taken ? '<b>✔</b>' : ''}</div>`).join('')}</div>
    ${cal.ready ? `<div class="qcard ready"><b class="calt">Сегодня — день ${today.i + 1}${today.big ? ' · особая награда!' : ''}</b>${qReward(today.rw)}${today.rw.gear !== undefined ? `<div class="qrew"><span><img class="ri" src="${GFX}hero/gear_armor_${today.rw.gear}.png" alt=""><b>${['обычное', 'редкое', 'эпическое'][today.rw.gear]} снаряжение генерала</b></span></div>` : ''}<button class="qbtn" data-qclaim="cal">Забрать награду</button></div>`
      : `<div class="qcard claimed"><div class="qdone-l">✔ Награда за сегодня получена. Завтра — день ${today.i + 1}.</div>${qReward(today.rw)}</div>`}`;
}
// значок заданий на экране: свиток с числом готовых наград
function questBtn() {
  let b = $('#qbtn');
  if (!b) { b = document.createElement('button'); b.id = 'qbtn'; b.type = 'button'; b.innerHTML = `<img src="${GFX}quest/scroll.png" alt="Задания"><b></b>`; b.addEventListener('click', () => openQuests()); $('#game').appendChild(b); }
  const r = (S.st && S.st.quests && S.st.quests.ready) || 0;
  b.classList.toggle('glow', r > 0); b.querySelector('b').textContent = r ? String(r) : '';
}
// окно «Задание выполнено!»: заголовок, название, награда значками — что пришло в замок, что ждёт в Кладовой
function questDone(m) {
  if (typeof m === 'string') m = { msg: m };
  const rc = m.rc, d = document.createElement('div'); d.className = 'rinfo qwin';
  const chips = (o) => RES4.filter((r) => o[r] > 0).map((r) => `<span class="qw-chip"><img src="gfx3d/res/${r}.png" alt=""><b>${fmtFull(Math.round(o[r]))}</b></span>`).join('');
  const any = (o) => RES4.some((r) => o[r] > 0);
  let body = '';
  if (rc) {
    if (any(rc.castle)) body += `<div class="qw-sec"><div class="qw-h">🏰 В замок</div><div class="qw-row">${chips(rc.castle)}</div></div>`;
    const item = (img, t, v) => `<span class="qw-item"><img src="${img}" alt=""><b>${t}</b><em>${v}</em></span>`;
    const inStash = [...rc.units.map((x) => { const u = unitById(x.id); return u ? item(unitSrc(u), esc(u.name), `×${fmtFull(x.n)}`) : ''; }), rc.exp ? item(`${GFX}stash/exp.png`, 'Опыт генерала', `+${fmtFull(rc.exp)}`) : ''].filter(Boolean);
    if (any(rc.stash) || inStash.length) {
      const hint = any(rc.castle) && any(rc.stash) ? 'Не поместилось на Складе — заберите, когда освободится место (сундук справа вверху).' : 'Забирайте сколько нужно в любой свой замок — сундук справа вверху.';
      body += `<div class="qw-sec stash"><div class="qw-h"><img src="${GFX}stash/btn.png" alt=""> В Кладовую</div>${any(rc.stash) ? `<div class="qw-row">${chips(rc.stash)}</div>` : ''}${inStash.length ? `<div class="qw-items">${inStash.join('')}</div>` : ''}<small>${hint}</small></div>`;
    }
    const more = [rc.art !== null && rc.art !== undefined ? item(`${GFX}${ART_ICON.atk}`, ['Артефакт', 'Редкий артефакт', 'Легендарный артефакт'][rc.art] || 'Артефакт', 'в Сокровищнице') : '',
      rc.gear !== null && rc.gear !== undefined ? item(`${GFX}hero/gear_armor_${rc.gear}.png`, 'Снаряжение генерала', 'в Оружейной') : ''].filter(Boolean);
    if (more.length) body += `<div class="qw-sec"><div class="qw-h">✨ Трофеи</div><div class="qw-items">${more.join('')}</div></div>`;
  }
  if (!body) body = `<p class="qw-msg">${esc(m.msg || '')}</p>`;
  d.innerHTML = `<div class="rinfo-box qwin-box qw2"><div class="qrays"></div><img class="qw-chest" src="${GFX}quest/chest_open.png" alt="">
    <div class="qw-ribbon">${esc(m.head || 'Задание выполнено!')}</div>${m.name ? `<div class="qw-name">«${esc(m.name)}»</div>` : ''}
    <div class="qw-body">${body}</div><button type="button" class="okbtn qw-ok">Забрать</button></div>`;
  d.addEventListener('click', (e) => { if (e.target.closest('.okbtn') || e.target === d) d.remove(); });
  document.body.appendChild(d);
  if (typeof SND !== 'undefined' && SND.play) try { SND.play('quest'); } catch (e) { /* звука может не быть */ }
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-qtab],[data-qclaim],[data-qgo]'); if (!t) return;
  const d = t.dataset;
  if (d.qtab) { S.qtab = d.qtab; return refreshSheet(); }
  if (d.qclaim) return send({ t: 'qclaim', kind: d.qclaim, id: d.qid || '' });
  if (d.qgo) { const [x, y] = d.qgo.split(',').map(Number); return openArmySheet({ mission: 'attack', x, y }); }
});

// ---------- советник-строитель: полоска «Задание: … [Выполнить]» над чатом (как в оригинале) ----------
// Сервер: quests.js advState / qclaim kind 'adv'. Ресурсы награды — сразу в замок до вместимости Склада, остаток — в Кладовую.
function advPic() { return `${GFX}tut/adv_${S.st.user.race}.png`; } // портрет советника своей расы (gfx/tut)
function advBar() {
  const a = S.st && S.st.quests && S.st.quests.adv;
  let b = $('#advbar');
  const show = !!a && !a.finished && ['castle', 'lands', undefined].includes(S.tab);
  $('#game').classList.toggle('adv', show); // свиток заданий и кнопка босса поднимаются над полоской
  if (!show) { if (b) b.remove(); const h = $('#advhand'); if (h) h.remove(); return; }
  if (!b) {
    b = document.createElement('button'); b.id = 'advbar'; b.type = 'button';
    b.addEventListener('click', (e) => { const x = S.st.quests && S.st.quests.adv; if (!x || x.finished) return;
      if (e.target.closest('.ab-t')) return openSheet(advWin); // значок слева — окно советника с объяснением
      if (x.done) return send({ t: 'qclaim', kind: 'adv' }); // готово — сразу награда
      advGo(); }); // иначе — сразу к нужному зданию
    $('#stage').appendChild(b);
  }
  b.classList.toggle('done', !!a.done);
  // рука-указатель: на первых шагах и когда награда готова — «нажми сюда»
  let h = $('#advhand'); const hand = a.done || a.idx < 3;
  if (hand && !h) { h = document.createElement('img'); h.id = 'advhand'; h.src = `${GFX}tut/hand.png`; h.alt = ''; $('#stage').appendChild(h); }
  if (!hand && h) h.remove();
  const sb = $('#stbtn'); if (sb) sb.classList.toggle('advpulse', !!a.stash && !a.done); // шаг Кладовой — сундук светится
  const nm = S.by && S.by[a.bid] ? S.by[a.bid].name : a.title, short = a.stash ? 'Кладовая → забрать' : a.need > 1 ? `${nm} → ${a.need} ур.` : `Построить: ${nm}`;
  b.innerHTML = `<span class="ab-t"><img src="${GFX}tut/${a.done ? 'star' : a.stash ? 'ic_reward' : a.need > 1 ? 'ic_up' : 'ic_build'}.png" alt="">Задание:</span><span class="ab-x">${esc(short)}</span><span class="ab-b">${a.done ? 'Награда!' : 'Выполнить'}</span>`;
}
function advWin() {
  const a = S.st.quests && S.st.quests.adv;
  if (!a || a.finished) return `${ribbon('Советник')}<div class="advdone"><img src="${GFX}tut/laurel.png" alt=""><p>Все задания советника выполнены! Дальше помогут Задания (свиток слева).</p></div>`;
  return `${ribbon('Советник')}<div class="advisor"><img src="${advPic()}" alt=""><div>
      <p><b>${a.done ? `<img class="advic" src="${GFX}tut/done.png" alt="">` : `<img class="advic" src="${GFX}tut/${a.stash ? 'ic_reward' : a.need > 1 ? 'ic_up' : 'ic_build'}.png" alt="">`} ${a.stash ? 'Урок: Кладовая' : `Задание ${a.idx + 1} из ${a.total}`}</b></p><p>${esc(a.title)}.</p>
      <p class="small">${a.done ? 'Отлично, правитель! Забирайте награду.' : a.stash ? 'Награды, которым не хватило места на Складе, ждут в Кладовой — сундук справа вверху. Откройте её, выберите ресурс, ползунком отметьте сколько и нажмите «Извлечь». Забирать можно, пока на Складе есть место.' : `Сейчас: ${a.have} из ${a.need}. Здание — ${a.layer === 'lands' ? 'на Землях (дерево на панели справа)' : 'в замке'}. Ресурсы награды пойдут сразу в замок, а что не поместится на Складе — в Кладовую (сундук справа вверху), они не пропадут.`}</p></div></div>
    <div class="qcard ${a.done ? 'ready' : ''}">${qBar(a.have, a.need)}${qReward(a.reward)}
      ${a.done ? '<button class="qbtn" data-qclaim="adv">Забрать награду</button>' : '<button class="pbar" data-advgo>Выполнить — к зданию</button>'}</div>`;
}
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-advgo]')) advGo(); });

// ---------- советник ведёт за руку: нужная клетка, переход к ней, подсветка кнопки ----------
// клетка для задания: здание этого вида ниже нужного уровня (самое развитое), иначе — свободное место, где его можно построить
function advTarget() {
  const a = S.st && S.st.quests && S.st.quests.adv; if (!a || a.finished || a.done || a.stash) return null;
  const v = a.layer === 'lands' ? VIEW.LANDS : VIEW.CASTLE, c = S.st.castle, N = v ? LN() : 7, g = c.grid[v], lv = c.levels[v];
  let best = -1;
  for (let i = 0; i < g.length; i++) { const q = queueAt(v, i); if ((g[i] === a.bid || (q && q.building === a.bid)) && (best < 0 || lv[i] > lv[best])) best = i; }
  if (best < 0) { // не построено — ближайшее к центру свободное место, где можно поставить это здание
    let bd = 1e9; const mid = (N - 1) / 2;
    for (let i = 0; i < g.length; i++) {
      if (g[i] >= 0 || queueAt(v, i)) continue;
      const x = i % N, y = Math.floor(i / N);
      if (v === VIEW.CASTLE && ((S.cat.castlePath || []).includes(i) || (x === 3 && y === 3))) continue;
      if (v === VIEW.LANDS && !(S.cat.landOptions[y][x] || []).includes(a.bid)) continue;
      const d = (x - mid) ** 2 + (y - mid) ** 2; if (d < bd) { bd = d; best = i; }
    }
  }
  return best < 0 ? null : { view: v, tab: v ? 'lands' : 'castle', cell: best, x: best % N, y: Math.floor(best / N), bid: a.bid };
}
function advGo() {
  const a0 = S.st.quests && S.st.quests.adv;
  if (a0 && a0.stash && !a0.done) { closeAllSheets(); if (S.tab !== 'castle') setTab('castle'); S.advHL = { stash: true }; openStash(); return; } // урок Кладовой
  const t = advTarget(); if (!t) return openSheet(advWin);
  closeAllSheets(); if (S.tab !== t.tab) setTab(t.tab);
  if (t.view === VIEW.CASTLE) { // камера — на нужную клетку
    const c = cam(), p = cellAt(t.x, t.y), r = Iso.cv.getBoundingClientRect();
    if (r.width) { c.x = r.width / 2 - (p.sx + TW / 2) * c.z; c.y = r.height * 0.45 - (p.sy + TH / 2) * c.z; Iso.cams[S.tab] = clampCam(c); }
  }
  Iso.sel = { tab: t.tab, x: t.x, y: t.y }; S.advHL = t; isoDraw();
  openCell(t.view, t.cell); setTimeout(advHighlight, 30);
}
// в открытом окне — пульсирующая кнопка «Развить/Построить» нужного здания и рука над ней
function advHighlight() {
  const t = S.advHL; if (!t) return;
  if (t.stash) { // Кладовая: сначала строка с ресурсом, после её открытия — «Извлечь»
    const btn = $('#sheetBody [data-sttake^="res:"]') || $('#sheetBody .str[data-stid^="res:"]');
    if (!btn || btn.classList.contains('advpulse')) return;
    $$('#sheetBody .advpulse').forEach((x) => x.classList.remove('advpulse')); $$('#sheetBody .advhand2').forEach((x) => x.remove());
    btn.classList.add('advpulse'); btn.scrollIntoView({ block: 'center' });
    const h = document.createElement('img'); h.className = 'advhand2'; h.src = `${GFX}tut/hand.png`; h.alt = ''; btn.appendChild(h); return;
  }
  const btn = $(`#sheetBody [data-build="${t.view},${t.cell},${t.bid}"]`) || $(`#sheetBody [data-pick="${t.view},${t.cell},${t.bid}"]`);
  if (!btn || btn.classList.contains('advpulse')) return;
  btn.classList.add('advpulse'); btn.scrollIntoView({ block: 'center' });
  const h = document.createElement('img'); h.className = 'advhand2'; h.src = `${GFX}tut/hand.png`; h.alt = ''; btn.appendChild(h);
}
new MutationObserver(() => { if (S.advHL) advHighlight(); }).observe($('#sheetBody'), { childList: true, subtree: true });
document.addEventListener('click', (e) => { if (e.target.closest('[data-build],[data-pick],[data-sttake]')) setTimeout(() => { S.advHL = null; }, 0); }, true);
// на карте замка/земель: золотое кольцо и прыгающая стрелка над нужной клеткой (рисуется из isoDrawNow)
function advMarker(view, at, big = view === VIEW.LANDS ? 2 : 1) { // на Землях вид издалека — метка крупнее
  const t = advTarget(); if (!t || t.view !== view) return;
  const p = at(t.x, t.y), cx = p.sx + TW / 2, cy = p.sy + TH / 2, k = Date.now() / 260;
  const ring = pic('tut/ring.png'), arr = pic('tut/arrow_down.png'), x = ictx;
  x.save(); const sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true;
  if (ring) { const w = TW * (1.05 + 0.08 * Math.sin(k)) * (big > 1 ? 1.3 : 1); x.globalAlpha = 0.85; x.drawImage(ring, cx - w / 2, cy - w / 4, w, w / 2); x.globalAlpha = 1; }
  if (arr) { const w = TW * 0.42 * big, h = w * arr.height / arr.width, top = cy - TH * 1.2 - h - Math.abs(Math.sin(k)) * 10 * big; x.drawImage(arr, cx - w / 2, top, w, h); }
  x.imageSmoothingEnabled = sm; x.restore();
  if (!S.advAnim) S.advAnim = setTimeout(() => { S.advAnim = null; isoDraw(); }, 60);
}
