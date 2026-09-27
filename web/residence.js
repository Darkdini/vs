'use strict';
// Резиденция — лояльность населения королевства (сервер: server/src/royal.js), «Праздники» и справка «Лояльность».

const CROWN = () => `<img class="crown" src="${GFX}smallicon/bonus_status/coronalgold.png" alt="">`;
function residenceHtml() {
  const r = MY().royal; if (!r) return '';
  const line = (t) => `<div class="resline">${t}</div>`;
  return line(`Лояльность населения: ${CROWN()} ${r.royal} ед.`) + line(`Количество замков: ${r.castles} ед.`) + line(`Захватов: ${r.captures} ед.`)
    + line(`Недостроев: ${r.unfinished} ед.`) + line(`Осталось до следующего захвата/недостроя: ${CROWN()} ${r.left} ед.`)
    + line(`Сегодня за действия: ${r.today} из ${r.dayCap} ед.`)
    + line(`Каждые сутки: ${CROWN()} +${r.perDay} ед.${r.temples ? ` (из них Храмы в других замках: +${r.temples})` : ' (постройте Храм во втором замке — будет быстрее)'}`)
    + (r.capital ? line('Этот замок является столицей') : '')
    + '<button class="rbar" data-res="fest">Праздники</button><button class="rbar" data-res="help">Лояльность</button>';
}
function festivalsWin() {
  const r = MY().royal;
  return `${ribbon('Праздники')}<div class="bwline">Праздник радует население и приносит лояльность (в пределах дневного лимита ${r.dayCap} ед.). Каждый праздник — раз в сутки.</div>
    ${r.festivals.map((f) => `<div class="fest"><b>${esc(f.name)}</b> — ${CROWN()} +${f.gain}<div class="small">${esc(f.desc)}</div>
      <div class="chips">${f.cost ? RES4.map((k) => `<span>${RES_IC[k]} ${fmtFull(f.cost[k])}</span>`).join('') : ''}${f.gold ? `<span>${gimg('smallicon/coin_gold.png', 'ri')} ${f.gold}</span>` : ''}</div>
      ${f.ready ? `<button class="pbtn" data-fest="${f.id}">Устроить</button>` : `<div class="small muted">Снова через <span class="cd" data-e="${f.readyAt}"></span></div>`}</div>`).join('')}`;
}
// справка «Лояльность» — страницы как в оригинале (Далее / В начало / В содержание)
const LOY_HELP = [
  (R) => `Лояльность населения растёт, пока Вы правите королевством: за каждое действие (стройка, тренировка, поход, исследование, торговля, праздник) +${R.perAction} ед., но не больше ${R.dayCap} ед. в сутки, и ещё +${R.passive} ед. в сутки, пока Вы заходите в игру.<br>Храмы во втором и следующих замках ускоряют прирост: +${R.templePerLevel} ед. в сутки за каждый уровень Храма. А лояльность (бунт) каждого замка восстанавливается тем быстрее, чем выше уровень Храма в нём.`,
  (R) => `Основное изменение новой системы заключается в том, что теперь лояльность будет расходываться при захватах/основаниях замков. (Например, у вас 10000 лояльности, для следующего замка надо 8000, тогда после захвата/основания у вас останется 2000.)<br>Причем, чем активнее (по действиям, а не по онлайну) игрок, тем быстрее он сможет захватить новый замок к себе в Королевство. Следующий замок стоит ${fmtFull(R.cost)} × число Ваших замков.`,
  (R) => `Но если население не будет видеть своего правителя в течении ${R.stopDays} дней, прирост лояльности остановится!<br>А если Вы не будете заходить в игру две недели, лояльность начнет падать по ${R.decayPerDay} ед/сутки! Если у вас отнимут замок, ваше население расстроится, и лояльность уменьшится на ${Math.round(R.lossPct * 100)}%.<br>А в случае если правителя не будет более 3-х недель, население начнет бунтовать: по ${R.riotPerDay}% в сутки (до ${100 - R.riotMin}%). Поэтому следите за своим Королевством и будьте на вершине!`,
];
S.loyPage = 0;
function loyaltyHelpWin() {
  const R = MY().royal.rules, last = S.loyPage >= LOY_HELP.length - 1;
  return `${ribbon('Лояльность')}<div class="bwline">${LOY_HELP[S.loyPage](R)}</div>
    <button class="obar" data-loypage="${last ? 0 : S.loyPage + 1}">${last ? 'В начало' : 'Далее'}</button>
    <button class="pbar" data-loypage="toc">В содержание</button>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-res],[data-fest],[data-loypage]'); if (!t) return;
  const d = t.dataset;
  if (d.res === 'fest') return openSheet(festivalsWin);
  if (d.res === 'help') { S.loyPage = 0; return openSheet(loyaltyHelpWin); }
  if (d.fest) return send({ t: 'festival', id: d.fest });
  if (d.loypage === 'toc') return closeSheet();
  if (d.loypage !== undefined) { S.loyPage = Number(d.loypage); return refreshSheet(); }
});
