'use strict';
// Премиум — как в оригинале: «Что это такое?», «Доступные Премиумы», покупка на 14 / 30 дней за монеты, «Подробнее».
const PREM_FEATURES = [ // [текст, работает] — экспедиции пока не трогаем
  'Возможность строить 5 зданий одновременно.', 'Отправка армий, согласно расписанию.', 'Получаемый генералом опыт увеличен в 2 раза.',
  ['Отменены приказы для экспедиций во время раскопок.', 0], 'Проведение ритуалов во всех замках через единый интерфейс.',
  '+1 ед. репутации при повышении репутации себе.', 'На 50% увеличен прирост населения во всех замках.',
  'Тренировка армий во всех замках через единый интерфейс.', 'Сводная информация об армиях королевства.',
  'Доступ к уникальному набору подарков.', 'Возможность выбирать цвет сообщений в диалогах и форуме.', 'Звание Премиум пользователя на профиле и форуме.',
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
    ${ribbon('Возможности')}${PREM_FEATURES.map((f) => { const [t, ok] = Array.isArray(f) ? f : [f, 1]; return `<div class="premf ${ok ? '' : 'soon'}"><span class="chk">✔</span> ${esc(t)}${ok ? '' : ' <small>(скоро)</small>'}</div>`; }).join('')}`;
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

// ---------- «Королевство» (премиум): все замки в одном окне — ресурсы, тренировка, ритуалы, бунт ----------
const isPrem = () => S.st.user.admin || (S.st.user.premium || 0) > Date.now();
S.kingdom = null;
function openKingdom() {
  if (!isPrem()) { toast('Управление всеми замками из одного окна — с премиумом.', 'err'); return openPremium(); }
  S.kingdom = null; send({ t: 'kingdom' }); openSheet(kingdomWin);
}
function kingdomWin() {
  const list = S.kingdom, r = MY().royal;
  if (!list) return `${ribbon('Королевство')}<p class="parch-note">Загрузка…</p>`;
  const opts = list.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.x}:${c.y})</option>`).join('');
  const rit = r ? `${ribbon('Ритуалы')}<div class="bwline small">Бонус лояльности сейчас +${Math.round(r.bonus * 100)}%. Ресурсы спишутся из выбранного замка.</div>
    <div class="arow"><span>Платит замок:</span><select data-kpay>${opts}</select></div>
    ${r.rituals.map((x) => `<div class="fest"><b>${esc(x.name)}</b> — +${Math.round(x.pct * 100)}% на ${x.hours} ч
      <div class="chips">${x.cost ? RES4.map((k) => `<span>${RES_IC[k]} ${fmtFull(x.cost[k])}</span>`).join('') : ''}${x.gold ? `<span>${gimg('coins_s.png', 'ri')} ${x.gold}</span>` : ''}</div>
      ${x.until > Date.now() ? `<div class="small muted">Действует ещё <span class="cd" data-e="${x.until}"></span></div>` : `<button class="pbtn" data-kritual="${x.id}">Провести</button>`}</div>`).join('')}` : '';
  return `${ribbon(`Королевство — ${list.length} ${list.length === 1 ? 'замок' : 'замков'}`)}
    ${list.map((c) => `<div class="kcard"><div class="khead"><b>${esc(c.name)}</b> <small>${c.x}:${c.y} · бунт ${100 - c.loyalty}%</small></div>
      <div class="chips">${RES4.map((k) => `<span>${RES_IC[k]} ${fmtN(c.res[k])}</span>`).join('')}<span>👥 ${fmtN(c.res.people)}</span></div>
      ${c.training.length ? `<div class="small">Тренируются: ${c.training.map((t) => `${esc(t.unit)} ×${t.left} <span class="cd" data-e="${t.end}"></span>`).join(', ')}</div>` : '<div class="small muted">Тренировок нет.</div>'}
      ${c.units.length ? `<div class="arow"><select data-kunit="${c.id}">${c.units.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
        <input type="number" min="1" value="10" inputmode="numeric" data-kcount="${c.id}" style="max-width:80px"><button class="btn primary small" data-ktrain="${c.id}">Обучить</button></div>` : '<div class="small muted">Нет казарм для тренировки.</div>'}
      ${c.loyalty < 100 && c.temple ? `<button class="btn small" data-kcalm="${c.id}">Снять весь бунт (${100 - c.loyalty}%)</button>` : ''}</div>`).join('')}
    ${rit}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-ktrain],[data-kritual],[data-kcalm]'); if (!t) return;
  const d = t.dataset;
  if (d.ktrain) { const id = d.ktrain; return send({ t: 'train', cid: Number(id), unit: Number($(`[data-kunit="${id}"]`).value), count: Number($(`[data-kcount="${id}"]`).value) || 1 }); }
  if (d.kritual) return send({ t: 'ritual', id: d.kritual, cid: Number($('[data-kpay]').value) });
  if (d.kcalm) return send({ t: 'calm', cid: Number(d.kcalm), pct: 'all' });
});
