'use strict';
// Караульная башня: «Передвижения армий» королевства — свои армии из всех замков и армии, идущие на замки короля (без разведки).
S.moves = null;
function movesWin() {
  const m = S.moves; if (!m) return `${ribbon('Передвижения армий')}<p class="parch-note">Загрузка…</p>`;
  const st = (a) => (a.state === 'wait' ? `выйдет через <span class="cd" data-e="${a.depart}"></span>` : a.state === 'go' ? `прибудет через <span class="cd" data-e="${a.arrive}"></span>` : a.state === 'back' ? `вернётся через <span class="cd" data-e="${a.back}"></span>` : `стоит в «${esc(a.stayName || '')}»`);
  return `${ribbon('Передвижения армий')}
    ${ribbon('Армии королевства')}${m.mine.length ? m.mine.map((a) => `<div class="mrow"><span><b>${esc(a.castle)}</b> → ${a.x}:${a.y} · ${M().missions[a.mission]}<br><small>${fmtFull(a.n)} воинов · ${st(a)}</small></span></div>`).join('') : '<p class="parch-note">Все армии дома.</p>'}
    ${ribbon('Надвигающиеся атаки')}${m.incoming.length ? m.incoming.map((a) => `<div class="mrow ${['attack', 'raid'].includes(a.mission) ? 'danger' : ''}"><span><b>${M().missions[a.mission]}</b> на «${esc(a.to)}» от ${esc(a.from)}<br><small>из «${esc(a.castle)}» · прибудет через <span class="cd" data-e="${a.arrive}"></span></small></span></div>`).join('') : '<p class="parch-note">Никто не идёт на Ваши замки.</p>'}
    <p class="small muted">Разведку, направленную в Ваши замки, башня не показывает.</p>`;
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
