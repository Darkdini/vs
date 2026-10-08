'use strict';
// Караульная башня: «Передвижения армий» королевства — свои армии из всех замков и армии, идущие на замки короля (без разведки).
S.moves = null;
function movesWin() {
  const m = S.moves; if (!m) return `${ribbon('Передвижения армий')}<p class="parch-note">Загрузка…</p>`;
  const st = (a) => (a.state === 'wait' ? `выйдет через <span class="cd" data-e="${a.depart}"></span>` : a.state === 'go' ? `прибудет через <span class="cd" data-e="${a.arrive}"></span>` : a.state === 'back' ? `вернётся через <span class="cd" data-e="${a.back}"></span>` : `стоит в «${esc(a.stayName || '')}»`);
  return `${ribbon('Передвижения армий')}
    ${(() => { const row = (a) => `<button type="button" class="mrow mrowbtn" data-mvid="${a.id}"><span><b>${esc(a.castle)}</b> → <b>${esc(a.to || `${a.x}:${a.y}`)}</b> (${a.x}:${a.y})<br><span class="mvtype mv-${a.mission}">${M().missions[a.mission]}</span>${a.state === 'back' ? ' <span class="mvtype mv-home">↩ Домой</span>' : ''}<br><small>🪖 ${esc(a.army || 'Армия')} · ${fmtFull(a.n)}${a.general ? ' + генерал' : ''} · ${st(a)}</small></span><i class="mvgo">›</i></button>${recallBtn(a)}`; const out = m.mine.filter((a) => a.state !== 'back'), home = m.mine.filter((a) => a.state === 'back');
      return `${ribbon('Армии королевства')}${out.length ? out.map(row).join('') : (home.length ? '<p class="parch-note">В походе никого нет.</p>' : '<p class="parch-note">Все армии дома.</p>')}${home.length ? `${ribbon('↩ Возвращаются домой')}${home.map(row).join('')}` : ''}`; })()}
    ${ribbon('Надвигающиеся атаки')}${m.incoming.length ? m.incoming.map((a) => `<div class="mrow ${['attack', 'raid'].includes(a.mission) ? 'danger' : ''}">${['attack', 'raid'].includes(a.mission) ? `<img class="wic" src="${GFX}watch/ic_${a.mission}.png" alt="">` : ''}<span><b>${M().missions[a.mission]}</b> на «${esc(a.to)}» от ${esc(a.from)}<br><small>из «${esc(a.castle)}» · прибудет через <span class="cd" data-e="${a.arrive}"></span></small>${threatInfo(a)}</span></div>`).join('') : '<p class="parch-note">Никто не идёт на Ваши замки.</p>'}
    <p class="small muted whint"><img src="${GFX}watch/ic_watch.png" alt="">${watchHint()} Разведку, направленную в Ваши замки, башня не показывает.</p>`;
}
// что башня узнала о вражеской армии (зависит от уровня башни — server/src/army.js watchLevel)
function threatInfo(a) {
  if (a.size == null) return '';
  const units = a.units ? Object.entries(a.units).filter(([, n]) => n > 0).map(([id, n]) => { const u = unitById(Number(id)); return u ? `<span class="tu"><img src="${unitSrc(u)}" alt="">${fmtFull(n)}</span>` : ''; }).join('') : '';
  return `<div class="tinfo">Войск: <b>${a.exact ? '' : '≈ '}${fmtFull(a.size)}</b>${a.general ? ' · с генералом' : a.general === false ? ' · без генерала' : ''}${units ? `<div class="tunits">${units}</div>` : ''}</div>`;
}
function watchHint() {
  const L = MY().watchLevel || 0;
  return L >= 10 ? `Башня ${L} ур. видит численность, состав войск и генерала.` : L >= 6 ? `Башня ${L} ур. видит точную численность; состав войск — с 10 ур.` : L >= 3 ? `Башня ${L} ур. видит примерную численность; точную — с 6 ур., состав — с 10 ур.` : L ? `Башня ${L} ур. видит только кто и когда придёт; численность — с 3 ур.` : 'Постройте Караульную башню, чтобы видеть вражеские армии.';
}
// значок на экране: «⚔ на вас идёт армия» с таймером до ближайшего удара; нажатие — «Передвижения армий»
function threatBtn() {
  const list = ((S.st && S.st.castle.mil && S.st.castle.mil.threats) || []).filter((a) => a.arrive > now());
  let b = $('#tbtn');
  if (!list.length) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('button'); b.id = 'tbtn'; b.type = 'button'; b.dataset.moves = '';
    b.innerHTML = `<img src="${GFX}watch/ic_alarm.png" alt=""><span class="tt">На вас идёт армия</span><span class="tc"></span><b></b>`; $('#game').appendChild(b);
  }
  const a = list[0];
  b.querySelector('.tc').textContent = fmtT((a.arrive - now()) / 1000);
  b.querySelector('.tt').textContent = `${a.mission === 'raid' ? 'Набег' : 'Нападение'} на «${a.to}»`;
  b.querySelector('b').textContent = list.length > 1 ? String(list.length) : '';
  b.classList.toggle('soon', a.arrive - now() < 60000);
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-moves]')) return;
  S.moves = null; send({ t: 'moves' }); openSheet(movesWin);
});
const prevMilW = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'moves') { S.wm = m.data; if (S.wmQuiet) { S.wmQuiet = false; if (S.tab === 'world') isoDraw(); return; } S.moves = m.data; return refreshSheet(); } // тихий запрос карты мира — окно не трогать
  if (m.t === 'kingdom') { S.kingdom = m.list; return refreshSheet(); }
  prevMilW(m);
};

// подробности похода своей армии: откуда, куда, когда, состав; «Показать на карте», «Отозвать» (подкрепление)
function moveWin() {
  const a = S.moves && S.moves.mine.find((x) => x.id === S.moveId); if (!a) return `${ribbon('Поход')}<p class="parch-note">Армия уже дома.</p>`;
  const t = (ms) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const row = (k, v) => `<div class="mvline"><span>${k}</span><b>${v}</b></div>`;
  const state = a.state === 'wait' ? `выйдет в ${t(a.depart)} (через <span class="cd" data-e="${a.depart}"></span>)` : a.state === 'go' ? `в пути, прибудет в ${t(a.arrive)} (через <span class="cd" data-e="${a.arrive}"></span>)`
    : a.state === 'back' ? `возвращается, дома в ${t(a.back)} (через <span class="cd" data-e="${a.back}"></span>)` : `стоит в «${esc(a.stayName || a.to)}»`;
  // кто задаёт скорость: армия идёт со скоростью самого медленного воина
  const slow = Object.entries(a.units || {}).filter(([, n]) => n > 0).map(([id]) => unitById(Number(id))).filter((u) => u && u.speed > 0).sort((p, q) => p.speed - q.speed)[0];
  return `${ribbon(M().missions[a.mission] || 'Поход')}<div class="mvcard">
    ${row('Тип похода', `<span class="mvtype mv-${a.mission}">${M().missions[a.mission] || a.mission}</span>`)}${row('Откуда', `${esc(a.castle)} (${a.cx}:${a.cy})`)}${row('Куда', `${esc(a.to)} (${a.x}:${a.y})`)}${row('Сейчас', state)}
    ${a.depart ? row('Вышла', t(a.depart)) : ''}${a.sec ? row('Время в пути', fmtT(a.sec)) : ''}${row('Армия', `${esc(a.army || 'Армия')} · ${fmtFull(a.n)}${a.general ? ' + генерал' : ''}`)}${slow ? row('Скорость', `${slow.speed * (S.cat.march || 1)} кл./час — по самому медленному: ${esc(slow.name)}`) : ''}
</div>
    <button class="pbar" data-mvmap="${a.x}:${a.y}">🗺 Показать цель на карте</button>
    ${recallBtn(a)}
    ${a.state === 'stay' ? `<button class="pbar" data-recall="${a.id}">Отозвать домой</button>` : ''}`;
}
// ошиблись с походом — первые 4 минуты армию можно развернуть домой (сервер: squadOp recall)
const recallUntil = (a) => a.recallUntil ?? ((a.state === 'go' || a.state === 'wait') && a.mission !== 'expedition' && a.depart ? a.depart + 240000 : 0);
function recallBtn(a) {
  const until = recallUntil(a); if (!(until > now())) return '';
  return `<button type="button" class="pbar recallbtn" data-recallgo="${a.id}">↩ Вернуть армию в замок <small>(ещё <span class="cd" data-e="${until}"></span>)</small></button>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-recallgo]'); if (!b) return;
  if (!confirm('Вернуть армию в замок? Она развернётся и пойдёт домой.')) return;
  send({ t: 'squad', op: 'recall', id: Number(b.dataset.recallgo) });
  S.wmAt = 0; setTimeout(() => send({ t: 'moves' }), 300); // обновить «Передвижения армий» и карту
});
$('#sheetBody').addEventListener('click', (e) => {
  const r = e.target.closest('[data-mvid]'); if (r) { S.moveId = Number(r.dataset.mvid); return openSheet(moveWin); }
  const m = e.target.closest('[data-mvmap]'); if (m) { const [x, y] = m.dataset.mvmap.split(':').map(Number); closeAllSheets(); S.wGoto = { x, y }; setTab('world'); }
});

// ---------- армии в пути на карте мира: линия от замка к цели, значок армии движется по ней ----------
// свои: нападение/набег/разведка — зелёные мечи, подкрепление — щит, возвращаются домой — синие; на нас (видит Караульная башня) — красные
const WM_COL = { attack: '#e8402a', raid: '#f08a20', scout: '#4a9ae8', reinforce: '#3cbc4a', trade: '#e8c030', expedition: '#b07ae8', home: '#5aa8e0', inc: '#ff2a1a' };
const WM_IMG = {};
function wmIcon(k) { let i = WM_IMG[k]; if (!i) { i = WM_IMG[k] = new Image(); i.src = `${G3}top/${k}.png`; } return i.complete && i.naturalWidth ? i : null; }
function worldMoves(w) {
  if (!S.st) return;
  const key = JSON.stringify(S.st.moves || {}), t = now();
  if ((key !== S.wmKey || Date.now() - (S.wmAt || 0) > 30000) && Date.now() - (S.wmAt || 0) > 2000) { S.wmKey = key; S.wmAt = Date.now(); S.wmQuiet = true; send({ t: 'moves' }); }
  const m = S.wm; if (!m) return;
  const ox = w.cx - w.radius, oy = w.cy - w.radius;
  const P = (x, y) => { const p = tileScreen(x - ox, y - oy); return [p.sx + TW / 2, p.sy + TH / 2]; };
  const list = [];
  for (const a of m.mine || []) {
    if (a.state === 'go') list.push({ f: [a.cx, a.cy], to: [a.x, a.y], t0: a.depart, t1: a.arrive, col: WM_COL[a.mission] || '#fff', ic: a.mission === 'reinforce' || a.mission === 'trade' ? 'reinf' : 'att' });
    else if (a.state === 'back' && a.recalled != null) list.push({ f: [a.cx + (a.x - a.cx) * a.recalled, a.cy + (a.y - a.cy) * a.recalled], to: [a.cx, a.cy], t0: a.arrive, t1: a.back, col: WM_COL.home, ic: 'home' }); // отозвана — назад с того места, где развернулась
    else if (a.state === 'back') list.push({ f: [a.x, a.y], to: [a.cx, a.cy], t0: a.back - (a.arrive - a.depart), t1: a.back, col: WM_COL.home, ic: 'home' });
  }
  for (const a of m.incoming || []) if (a.fx != null && a.depart) { const hostile = ['attack', 'raid'].includes(a.mission); list.push({ f: [a.fx, a.fy], to: [a.tx, a.ty], t0: a.depart, t1: a.arrive, col: hostile ? WM_COL.inc : WM_COL.reinforce, ic: hostile ? 'inc' : 'reinf' }); }
  if (!list.length) return;
  if (flowOn() && !flowTimer) flowTimer = setTimeout(flowTick, ANIM_MS); // значки армий движутся — перерисовка карты идёт и когда своего замка не видно
  const g = ictx; g.save(); g.imageSmoothingEnabled = true; g.lineCap = 'round';
  for (const a of list) { // линии — под значками
    const A = P(...a.f), B = P(...a.to);
    g.setLineDash([]); g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    g.setLineDash([7, 6]); g.lineDashOffset = -(Date.now() / 60) % 13; g.lineWidth = 2.5; g.strokeStyle = a.col; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    g.setLineDash([]); g.fillStyle = a.col; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(B[0], B[1], 7, 3.5, 0, 0, Math.PI * 2); g.fill(); g.stroke(); // точка цели
  }
  for (const a of list) {
    const A = P(...a.f), B = P(...a.to), k = Math.max(0, Math.min(1, (t - a.t0) / Math.max(1, a.t1 - a.t0)));
    const x = A[0] + (B[0] - A[0]) * k, y = A[1] + (B[1] - A[1]) * k - 6, R = 13;
    g.fillStyle = 'rgba(30,18,8,0.85)'; g.strokeStyle = a.col; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill(); g.stroke();
    const im = wmIcon(a.ic); if (im) g.drawImage(im, x - R * 0.8, y - R * 0.8, R * 1.6, R * 1.6);
  }
  g.restore();
}
