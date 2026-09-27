'use strict';
// Центр разведки — как в оригинале: «Возможности», «Тренировать», «Разведка».
// Что узнаёт разведка, открывается уровнем здания (S.cat.mil.spyOpen, сервер: SPY_OPEN в army.js).

const SPY_ICON = { armies: `${G3}menu/helmet.svg`, res: `${G3}menu/basket.svg`, build: `${GFX}smallicon/upgrade.png`, riot: '', reinf: `${G3}menu/swords.svg` };
function spyButtons() {
  return '<button class="rbar" data-spy="info">Возможности</button><button class="rbar" data-spy="train">Тренировать</button><button class="rbar" data-spy="go">Разведка</button>';
}
function spyInfoWin() {
  const L = buildingLevel(45), open = M().spyOpen;
  const riot = unitSrc(unitById(233)); // Бунтарь — значок «Бунта»
  return `${ribbon('Центр шпионажа')}
    <div class="bwline center">Текущий уровень здания: <img class="upar" src="${GFX}smallicon/maxupgrade.png" alt=""> ${L}</div>
    <div class="center"><a class="plink" data-about="45">Справка</a></div>
    <div class="bwline" style="margin-top:14px">Доступна разведка:</div>
    ${Object.entries(open).map(([k, o]) => { const ok = L >= o.level; return `<div class="spyrow ${ok ? '' : 'off'}">
      <div class="st"><img src="${k === 'riot' ? riot : SPY_ICON[k]}" alt=""> <b>${esc(o.name)}</b></div>
      <div>Условие: ${esc(o.cond)}.</div>${ok ? '' : `<div class="lock">Откроется на ${o.level} уровне Центра разведки.</div>`}</div>`; }).join('')}`;
}
function spyTrainWin() {
  const def = S.by[45], units = myUnitList().filter((u) => u.building === 45);
  return `${units.length ? trainHtml(def, units) : '<p class="parch-note">Нет юнитов для тренировки.</p>'}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-spy]'); if (!t) return;
  const k = t.dataset.spy;
  if (k === 'info') return openSheet(spyInfoWin);
  if (k === 'train') return openSheet(spyTrainWin);
  if (k === 'go') return openArmySheet({ mission: 'scout' });
});
