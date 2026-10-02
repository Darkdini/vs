'use strict';
// Стена (Забор, id 22): не занимает клетку в замке — её развивают из окна Ратуши (кнопка «Стена»).
// Сервер: game.js startWall / castle.wall; бонус при защите — army.js bonus().wallPer × уровень; тараны ломают уровни до боя.
const WALL = 22;
const wallHp = (L) => Math.round(40 * 1.2 ** L); // прочность одного уровня (как на сервере, army.js)
function wallWin() {
  const c = S.st.castle, L = c.wall || 0, def = S.by[WALL], b = (MY() && MY().bonus) || {}, per = b.wallPer || 0.03;
  const q = c.queue.find((x) => x.wall), next = L + 1, max = def.max || 20;
  const hp = Array.from({ length: L }, (_, i) => wallHp(i + 1)).reduce((s, v) => s + v, 0);
  const cost = next <= max ? def.costs[next] : null;
  const costHtml = cost ? `<div class="upcost">${RES.filter((r) => cost[r]).map((r) => `<span data-need="${r}:${cost[r]}">${RES_IC[r]}<b>${fmtFull(cost[r])}</b></span>`).join('')}<span>${TIME_IC}<b>${fmtT(buildSec(def, next, c.townhall))}</b></span></div>` : '';
  return `${ribbon('Стена')}
    <div class="wl-head"><img src="${GFX}fence/hd/fence1.png" data-fb="${GFX}smallicon/wall_icon.png" alt=""><div>
      <div>Уровень: <b>${L}</b> из ${max}</div>
      <div>Бонус при защите: <img class="ri" src="${GFX}smallicon/phidef.png" alt=""> <b>${Math.round(per * L * 100)} %</b></div>
      <div>Прочность: <b>${fmtFull(hp)}</b></div>
      <div>Рейтинг: <b>+${fr(L * ratingPer(def))}</b></div></div></div>
    <p class="small">Стена окружает замок и не занимает места внутри. Уменьшает <b>физическую атаку</b> наступающей армии на указанный процент. Тараны ломают уровни стены до боя — каждый уровень держит удар отдельно.</p>
    ${q ? `<div class="upbody center">Строится ${q.level} уровень: <b><span class="cd" data-e="${q.end}"></span></b></div><div class="pbar2"><i data-s="${q.start}" data-e="${q.end}"></i></div>`
      : cost ? `${ribbon(`Улучшить до ${next} уровня`)}<div class="upbody center">Бонус станет <b>${Math.round(per * next * 100)} %</b>, прочность <b>${fmtFull(hp + wallHp(next))}</b></div>${costHtml}<button class="pbar" data-wallup>Улучшить</button>`
        : '<p class="parch-note">Стена построена до предела.</p>'}`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-wallwin]')) return openSheet(wallWin);
  if (e.target.closest('[data-wallup]')) send({ t: 'wall' });
});
