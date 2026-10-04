'use strict';
// «Боевой ранг» (как в оригинале): строка в профиле, значок вверху экрана, окно «Прогресс / Таблица уровней / Справка».
// Сервер: server/src/battlerank.js (t:'brank').

S.brank = null; S.brTab = 'prog';
const BR_IMG = (icon) => `${GFX}rank/r${Math.max(1, Math.min(13, icon || 1))}.png`;
const brStars = (n, cls = '') => `<span class="brstars ${cls}">${Array.from({ length: 5 }, (_, i) => `<img src="${GFX}rank/star_${i < n ? 'on' : 'off'}.png" alt="">`).join('')}</span>`;
function openBrank(id) { S.brank = null; S.brTab = 'prog'; send({ t: 'brank', id }); openSheet(brankWin); }
const brPrize = (p) => [p.wood ? `ресурсы по ${fmtFull(p.wood)}` : '', p.u ? `уникальные воины ×${p.u.inf} каждого вида` : '', p.exp ? `опыт генерала +${p.exp}` : ''].filter(Boolean).join(', ');
function brankWin() {
  const b = S.brank;
  const tabs = `<div class="coin-tabs">${[['prog', 'Прогресс'], ['table', 'Таблица уровней'], ['help', '❓ Справка']].map(([k, t]) => `<button class="${S.brTab === k ? 'on' : ''}" data-brtab="${k}">${t}</button>`).join('')}</div>`;
  if (!b) return `${ribbon('Боевой ранг')}${tabs}<p class="parch-note">Загрузка…</p>`;
  let body;
  if (S.brTab === 'prog') {
    const pct = b.next ? Math.max(0, Math.min(100, ((b.pts - b.prev) / (b.next - b.prev)) * 100)) : 100;
    body = `<div class="brcard"><img class="brbig" src="${BR_IMG(b.icon)}" alt=""><div>
        <div class="brtitle">${b.idx < 0 ? 'Без ранга' : `${b.idx + 1}. ${esc(b.title)}`}</div>${brStars(b.idx < 0 ? 0 : b.stars)}
        <div class="brpts">Очки ранга: <b>${fmtFull(b.pts)}</b></div></div></div>
      ${b.next ? `<div class="brbar"><i style="width:${pct.toFixed(1)}%"></i><span>${fmtFull(b.pts)} / ${fmtFull(b.next)}</span></div><p class="coinhint">До следующего ранга: <b>${fmtFull(b.next - b.pts)}</b> очков.</p>` : '<p class="coinhint">Высший ранг достигнут!</p>'}
      <p class="coinhint">Сегодня набрано: <b>${fmtFull(b.today)}</b> из ${fmtFull(b.dayMax)} очков в сутки.${b.wait ? '<br>Очков уже хватает на следующий ранг — он откроется завтра (не больше одного ранга в сутки).' : ''}</p>
      <div class="brbonus">Бонус ранга: урон и защита воинов <b>+${Math.round(b.bonus.atk * 100)}%</b>, прирост ресурсов <b>+${Math.round(b.bonus.prod * 100)}%</b></div>
      ${b.self ? '' : `<p class="coinhint">Игрок: <b>${esc(b.login)}</b></p>`}`;
  } else if (S.brTab === 'table') {
    body = `<div class="brtable">${b.table.map((r) => `<div class="${r.idx === b.idx ? 'me' : ''} ${r.idx <= b.idx ? 'done' : ''}" data-brprize="${r.idx}"><span>${r.idx + 1}. ${esc(r.title)}</span>
      <img src="${BR_IMG(r.icon)}" alt="">${brStars(r.stars, 'sm')}<b>${fmtFull(r.need)}</b><img class="brbox" src="${GFX}quest/chest.png" alt=""></div>`).join('')}</div>`;
  } else {
    body = `<div class="pstats brhelp">Ранг отражает успехи правителя в битвах. Очки ранга выдаются за уничтоженных воинов противника — чем больше воинов уничтожено в одном бою, тем больше очков.<br><br>
      • Нападения и набеги на игроков и защита своего замка — полные очки.<br>• Лагеря разбойников — половина очков.<br>
      • Если противник слабее Вас больше чем на 5 рангов — очков меньше.<br>
      • С одним и тем же противником засчитываются 3 боя в сутки.<br>
      • В сутки — не больше 10 000 очков и не больше одного нового ранга. Лишние очки не пропадают: ранг догонит в следующие дни.<br><br>
      За открытие каждого ранга — награда в Кладовую: ресурсы, а на новом звании ещё уникальные воины и опыт генерала. Нажмите на ранг в «Таблице уровней», чтобы увидеть награду.<br><br>
      Пока ранг у Вас, действует бонус: урон и защита воинов и прирост ресурсов во всех замках — чем выше ранг, тем больше (на Легенде 5★: +20% и +30%).</div>`;
  }
  return `${ribbon('Боевой ранг')}${tabs}${body}`;
}
function brankMsg(m) { S.brank = m.data; refreshSheet(); }
// значок ранга вверху экрана (слева)
function brankBadge() {
  let b = $('#btnRank');
  if (!b) { b = document.createElement('button'); b.id = 'btnRank'; b.type = 'button'; b.setAttribute('aria-label', 'Боевой ранг'); b.addEventListener('click', () => openBrank()); $('#top').prepend(b); }
  const r = S.st && S.st.user.brank; if (!r) return;
  const key = `${r.icon}:${r.stars}`; if (b.dataset.k === key) return; b.dataset.k = key;
  b.innerHTML = `<img class="brfr" src="${GFX}rank/frame.png" alt=""><img class="brsh" src="${BR_IMG(r.icon)}" alt="">${brStars(r.idx < 0 ? 0 : r.stars, 'top')}`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-brtab],[data-brank],[data-brprize]'); if (!t) return;
  if (t.dataset.brtab) { S.brTab = t.dataset.brtab; return refreshSheet(); }
  if (t.dataset.brank !== undefined) return openBrank(Number(t.dataset.brank));
  const r = S.brank && S.brank.table[Number(t.dataset.brprize)]; if (r) okPopup(`${r.idx + 1}. ${r.title}: ${brPrize(r.prize)}. Бонус: урон и защита +${Math.round(r.bonus.atk * 100)}%, прирост +${Math.round(r.bonus.prod * 100)}%.`);
});
