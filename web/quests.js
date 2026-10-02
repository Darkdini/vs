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
// окно «Задание выполнено!»
function questDone(msg) {
  const d = document.createElement('div'); d.className = 'rinfo qwin';
  d.innerHTML = `<div class="rinfo-box okbox qwin-box"><div class="qrays"></div><img src="${GFX}quest/chest_open.png" alt=""><h3>Задание выполнено!</h3><p>${esc(msg)}</p><button type="button" class="okbtn">Ок</button></div>`;
  d.addEventListener('click', (e) => { if (e.target.closest('.okbtn')) d.remove(); });
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
// Сервер: quests.js advState / qclaim kind 'adv'. Ресурсы награды — сразу в замок, лишнее — в Кладовую.
function advPic() { const r = S.st.user.race; return `${GFX}units/${S.cat.mil.raceDir[r]}/wisdom.png${r === 'orcs' ? '?orc' : ''}`; }
function advBar() {
  const a = S.st && S.st.quests && S.st.quests.adv;
  let b = $('#advbar');
  if (!a || a.finished || !['castle', 'lands', undefined].includes(S.tab)) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('button'); b.id = 'advbar'; b.type = 'button'; b.addEventListener('click', () => openSheet(advWin)); $('#stage').appendChild(b); }
  b.classList.toggle('done', !!a.done);
  const nm = S.by && S.by[a.bid] ? S.by[a.bid].name : a.title, short = a.need > 1 ? `${nm} → ${a.need} ур.` : `Построить: ${nm}`;
  b.innerHTML = `<span class="ab-t">Задание:</span><span class="ab-x">${esc(short)}</span><span class="ab-b">${a.done ? 'Награда!' : 'Выполнить'}</span>`;
}
function advWin() {
  const a = S.st.quests && S.st.quests.adv;
  if (!a || a.finished) return `${ribbon('Советник')}<p class="parch-note">Все задания советника выполнены — дальше помогут Задания (свиток слева).</p>`;
  return `${ribbon('Советник')}<div class="advisor"><img src="${advPic()}" alt=""><div>
      <p><b>Задание ${a.idx + 1} из ${a.total}</b></p><p>${esc(a.title)}.</p>
      <p class="small">${a.done ? 'Отлично, правитель! Забирайте награду.' : `Сейчас: ${a.have} из ${a.need}. Здание — ${a.layer === 'lands' ? 'на Землях (дерево на панели справа)' : 'в замке'}. Ресурсы награды сразу пойдут в замок, а что не поместится на Складе — в Кладовую.`}</p></div></div>
    <div class="qcard ${a.done ? 'ready' : ''}">${qBar(a.have, a.need)}${qReward(a.reward)}
      ${a.done ? '<button class="qbtn" data-qclaim="adv">Забрать награду</button>' : `<button class="pbar" data-advgo="${a.layer === 'lands' ? 'lands' : 'castle'}">Перейти ${a.layer === 'lands' ? 'на Земли' : 'в замок'}</button>`}</div>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const g = e.target.closest('[data-advgo]'); if (!g) return;
  closeAllSheets(); setTab(g.dataset.advgo);
});
