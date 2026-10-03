'use strict';
// «Сундучки» (меню «Игры»): 3 закрытых сундука — открыть один, после него показываются и два других.
// Попытки в сутки, серия дней и Золотой сундук за 7 дней подряд. Сервер: server/src/chests.js (t:'chests' / 'chestopen').

S.chests = null; S.chestRes = null;
const CH_IMG = { shut: `${GFX}quest/chest.png`, open: `${GFX}quest/chest_open.png`, gold: `${GFX}reward/chest.png` };
function openChests() { S.chests = null; S.chestRes = null; send({ t: 'chests' }); openSheet(chestsWin); }
function chestsWin() {
  const s = S.chests;
  if (!s) return `${ribbon('Сундучки')}<p class="parch-note">Загрузка…</p>`;
  const r = S.chestRes;
  const dots = Array.from({ length: s.need }, (_, i) => `<i class="${i < s.streak ? 'on' : ''}${i === s.need - 1 ? ' last' : ''}">${i === s.need - 1 ? '★' : i + 1}</i>`).join('');
  let table;
  if (r && r.golden) table = `<div class="chgold won"><img src="${CH_IMG.gold}" alt=""><div class="chprize big">${esc(r.prize)}</div></div>`;
  else if (r) table = `<div class="chtable">${r.prizes.map((p, i) => `<div class="chbox ${i === r.pick ? 'mine' : 'other'}${p.rare ? ' rare' : ''}"><img src="${CH_IMG.open}" alt=""><div class="chprize">${esc(p.text)}</div></div>`).join('')}</div>
    <p class="center chwon">Ваш приз: <b>${esc(r.prize)}</b><br><small>${r.prize.startsWith('Артефакт') ? 'Артефакт — в Сокровищнице замка.' : 'Приз — в Кладовой: заберите его в любой замок.'}</small></p>`;
  else table = `<div class="chtable">${[0, 1, 2].map((i) => `<button class="chbox shut" data-chpick="${i}" ${s.left ? '' : 'disabled'}><img src="${CH_IMG.shut}" alt=""></button>`).join('')}</div>
    <p class="center chq">${s.left ? 'Выберите сундук!' : 'Попытки на сегодня закончились.'}</p>`;
  return `${ribbon('Сундучки')}
    <div class="chtop">Попыток сегодня: <b>${s.left}</b> из ${s.max}${s.left ? '' : ` · новые через <span class="cd" data-e="${s.nextAt}"></span>`}</div>
    ${table}
    ${r && !r.golden && s.left ? '<button class="pbar" data-chagain>Открыть ещё</button>' : ''}
    ${r && r.golden ? '<button class="pbar" data-chagain>К сундучкам</button>' : ''}
    ${s.gold && !(r && r.golden) ? `<button class="chgold" data-chgold><img src="${CH_IMG.gold}" alt=""><span>Золотой сундук ждёт Вас!<br><small>Нажмите — гарантированно редкий приз</small></span></button>` : ''}
    <div class="chstreak"><div class="chdots">${dots}</div>
      <small>Серия: <b>${s.streak}</b> из ${s.need} дней подряд${s.today ? ' (сегодня засчитано)' : ''}. На ${s.need}-й день — Золотой сундук. Пропустите день — серия сгорает.</small></div>
    <p class="chnote">Бесплатно ${s.max} попытки в день${s.max < 5 ? ' (с премиумом — 5)' : ''}. Призы: ресурсы, опыт генерала, уникальные воины, иногда — артефакт. Каждая игра — очко в Зал Славы «Азарт».</p>`;
}
function chestsMsg(m) {
  if (m.t === 'chests') { S.chests = m.state; S.chestRes = null; }
  if (m.t === 'chestres') { S.chests = m.res.state; S.chestRes = m.res; }
  refreshSheet();
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-chpick],[data-chagain],[data-chgold]'); if (!t) return;
  if (t.dataset.chpick !== undefined) { if (t.classList.contains('opening')) return; document.querySelectorAll('[data-chpick]').forEach((b) => { b.disabled = true; }); t.classList.add('opening');
    return setTimeout(() => send({ t: 'chestopen', pick: Number(t.dataset.chpick) }), 450); }
  if (t.dataset.chagain !== undefined) { S.chestRes = null; return refreshSheet(); }
  if (t.dataset.chgold !== undefined) { t.disabled = true; t.classList.add('opening'); setTimeout(() => send({ t: 'chestopen', golden: 1 }), 450); }
});
