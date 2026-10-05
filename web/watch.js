'use strict';
// Караульная башня: «Передвижения армий» королевства — свои армии из всех замков и армии, идущие на замки короля (без разведки).
S.moves = null;
function movesWin() {
  const m = S.moves; if (!m) return `${ribbon('Передвижения армий')}<p class="parch-note">Загрузка…</p>`;
  const st = (a) => (a.state === 'wait' ? `выйдет через <span class="cd" data-e="${a.depart}"></span>` : a.state === 'go' ? `прибудет через <span class="cd" data-e="${a.arrive}"></span>` : a.state === 'back' ? `вернётся через <span class="cd" data-e="${a.back}"></span>` : `стоит в «${esc(a.stayName || '')}»`);
  return `${ribbon('Передвижения армий')}
    ${ribbon('Армии королевства')}${m.mine.length ? m.mine.map((a) => `<button type="button" class="mrow mrowbtn" data-mvid="${a.id}"><span><b>${esc(a.castle)}</b> → <b>${esc(a.to || `${a.x}:${a.y}`)}</b> (${a.x}:${a.y})<br><span class="mvtype mv-${a.mission}">${M().missions[a.mission]}</span><br><small>🪖 ${esc(a.army || 'Армия')} · ${fmtFull(a.n)}${a.general ? ' + генерал' : ''} · ${st(a)}</small></span><i class="mvgo">›</i></button>`).join('') : '<p class="parch-note">Все армии дома.</p>'}
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
  if (m.t === 'moves') { S.moves = m.data; return refreshSheet(); }
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
    ${a.depart ? row('Вышла', t(a.depart)) : ''}${a.sec ? row('Время в пути', fmtT(a.sec)) : ''}${row('Армия', `${esc(a.army || 'Армия')} · ${fmtFull(a.n)}${a.general ? ' + генерал' : ''}`)}${slow ? row('Скорость', `${slow.speed} кл./час — по самому медленному: ${esc(slow.name)}`) : ''}
</div>
    <button class="pbar" data-mvmap="${a.x}:${a.y}">🗺 Показать цель на карте</button>
    ${a.state === 'stay' ? `<button class="pbar" data-recall="${a.id}">Отозвать домой</button>` : ''}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const r = e.target.closest('[data-mvid]'); if (r) { S.moveId = Number(r.dataset.mvid); return openSheet(moveWin); }
  const m = e.target.closest('[data-mvmap]'); if (m) { const [x, y] = m.dataset.mvmap.split(':').map(Number); closeAllSheets(); S.wGoto = { x, y }; setTab('world'); }
});
