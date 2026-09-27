'use strict';
// Премиум — как в оригинале: «Что это такое?», «Доступные Премиумы», покупка на 14 / 30 дней за монеты, «Подробнее».
const PREM_FEATURES = [
  ['Возможность строить 5 зданий одновременно.', 1], ['Отправка армий, согласно расписанию.', 1], ['Получаемый генералом опыт увеличен в 2 раза.', 1],
  ['Отменены приказы для экспедиций во время раскопок.', 0], ['Проведение ритуалов во всех замках через единый интерфейс.', 0],
  ['+1 ед. репутации при повышении репутации себе.', 1], ['На 50% увеличен прирост населения во всех замках.', 1],
  ['Тренировка армий во всех замках через единый интерфейс.', 0], ['Сводная информация об армиях королевства.', 1],
  ['Доступ к уникальному набору подарков.', 0], ['Возможность выбирать цвет сообщений в диалогах и форуме.', 0], ['Звание Премиум пользователя на профиле и форуме.', 1],
];
S.premTo = null;
const premCard = () => `<img class="premcard" src="${GFX}premium_card.png" alt="">`;
const premUntil = () => { const t = S.st.user.premium; return t > Date.now() ? `<div class="bwline center good2">Премиум активен до ${new Date(t).toLocaleString('ru-RU')}</div>` : ''; };
function premiumWin() {
  return `${ribbon('Что это такое?')}<div class="bwline big2">Премиум - это набор функций для более комфортного развития замков и управления армиями Вашего королевства.</div>
    ${premUntil()}${ribbon('Доступные Премиумы')}
    <div class="premrow">${premCard()}<div class="premside"><div class="premname">Премиум Завоеватель</div>
      <button class="pbar" data-prem="buy">Купить</button><button class="pbar" data-prem="info">Подробнее</button></div></div>`;
}
function premiumBuyWin() {
  const to = S.premTo;
  return `${ribbon(to ? `Премиум в подарок: ${to}` : 'Премиум')}<div class="premrow">${premCard()}<div class="premside"><div class="premname">Премиум Завоеватель</div>
    <div class="bwline">Самый полный и престижный премиум пакет.</div><button class="pbar" data-prem="info">Подробнее</button></div></div>
    ${Object.entries(S.cat.premiumPlans).map(([d, c]) => `<button class="pbar big" data-premday="${d}">${d} дней = <img class="coinimg" src="${GFX}coins_s.png" alt=""> ${c}</button>`).join('')}
    <div class="bwline center small">У вас ${fmtFull(S.st.user.gold || 0)} монет</div>${to ? '' : premUntil()}`;
}
function premiumInfoWin() {
  return `${ribbon('Премиум')}<div class="premrow">${premCard()}<div class="premside"><div class="premname">Премиум Завоеватель</div>
    <div class="bwline">Самый полный и престижный премиум пакет.</div><button class="pbar" data-prem="buy">Купить</button></div></div>
    ${ribbon('Возможности')}${PREM_FEATURES.map(([t, ok]) => `<div class="premf ${ok ? '' : 'soon'}"><span class="chk">✔</span> ${esc(t)}${ok ? '' : ' <small>(скоро)</small>'}</div>`).join('')}`;
}
function openPremium(to = null) { S.premTo = to; openSheet(premiumWin); }
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-prem],[data-premday]'); if (!t) return;
  const d = t.dataset;
  if (d.prem === 'buy') return openSheet(premiumBuyWin);
  if (d.prem === 'info') return openSheet(premiumInfoWin);
  if (d.premday) {
    const c = S.cat.premiumPlans[d.premday];
    if (confirm(`${S.premTo ? `Подарить игроку ${S.premTo} ` : 'Купить '}Премиум Завоеватель на ${d.premday} дней за ${c} монет?`)) { send({ t: 'premium', days: Number(d.premday), to: S.premTo || undefined }); closeAllSheets(); }
  }
});
