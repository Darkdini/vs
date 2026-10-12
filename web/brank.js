'use strict';
// «Боевой ранг» (как в оригинале): строка в профиле, значок вверху экрана, окно «Прогресс / Таблица уровней / Справка».
// Сервер: server/src/battlerank.js (t:'brank').

S.brank = null; S.brTab = 'prog';
const BR_IMG = (icon) => `${GFX}rank/r${Math.max(1, Math.min(13, icon || 1))}.png`;
const brStars = (n, cls = '') => `<span class="brstars ${cls}">${Array.from({ length: 5 }, (_, i) => `<img src="${GFX}rank/star_${i < n ? 'on' : 'off'}.png" alt="">`).join('')}</span>`;
function openBrank(id) { S.brank = null; S.brTab = 'prog'; send({ t: 'brank', id }); openSheet(brankWin); }
function brankWin() {
  const b = S.brank;
  const tabs = `<div class="coin-tabs">${[['prog', 'Прогресс'], ['table', 'Таблица уровней'], ['help', '❓ Справка']].map(([k, t]) => `<button class="${S.brTab === k ? 'on' : ''}" data-brtab="${k}">${t}</button>`).join('')}</div>`;
  if (!b) return `${ribbon('Боевой ранг')}${tabs}<p class="parch-note">Загрузка…</p>`;
  let body;
  if (S.brTab === 'prog') {
    // шкала — путь от последнего набранного ранга до следующего: заливка и числа на ней — одно и то же
    const pi = Math.max(b.idx, b.pending), nx = pi + 1 < b.table.length ? b.table[pi + 1].need : null, pv = pi >= 0 ? b.table[pi].need : 0;
    const pct = nx ? Math.max(0, Math.min(100, ((b.pts - pv) / (nx - pv)) * 100)) : 100;
    // ранг меняется раз в месяц: крупно — какой ранг будет 1-го числа и за сколько рангов придут награды
    const n = b.pending - b.idx, upd = new Date(b.update + 3 * 3600000);
    const day = `1 ${['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][upd.getUTCMonth()]}`;
    body = `<div class="brcard"><img class="brbig" src="${BR_IMG(b.icon)}" alt=""><div>
        <div class="brnow">${b.self ? 'Ваш ранг сейчас' : 'Ранг сейчас'}</div>
        <div class="brtitle">${b.idx < 0 ? 'Без ранга' : `${b.idx + 1}. ${esc(b.title)}`}</div>${brStars(b.idx < 0 ? 0 : b.stars)}
        <div class="brpts">Очки ранга: <b>${fmtFull(b.pts)}</b></div></div></div>
      ${n > 0 ? `<div class="brnext"><img src="${BR_IMG(b.pendingInfo.icon)}" alt=""><div>${day} ранг станет:<br><b>${b.pending + 1}. ${esc(b.pendingInfo.title)}</b> ${brStars(b.pendingInfo.stars, 'sm')}
        <small>и придут награды за ${n} ${plural(n, 'ранг', 'ранга', 'рангов')}</small></div></div>` : ''}
      <p class="coinhint">Ранг меняется раз в месяц — 1-го числа. До обновления: <b><span class="cd" data-e="${b.update}"></span></b></p>
      ${nx ? `<div class="brbar"><i style="width:${pct.toFixed(1)}%"></i><span>${fmtFull(b.pts - pv)} / ${fmtFull(nx - pv)} · ${Math.floor(pct)}%</span></div><p class="coinhint">До ${pi + 2}-го ранга: <b>${fmtFull(nx - b.pts)}</b> очков.</p>` : '<p class="coinhint">Очков хватает на высший ранг!</p>'}
      <div class="brbonus">Бонус ранга: урон и защита воинов <b>+${(Math.round(b.bonus.atk * 1000) / 10)}%</b>, прирост ресурсов <b>+${(Math.round(b.bonus.prod * 1000) / 10)}%</b></div>
      ${b.self ? '' : `<p class="coinhint">Игрок: <b>${esc(b.login)}</b></p>`}`;
  } else if (S.brTab === 'table') {
    body = `<div class="brtable">${b.table.map((r) => `<div class="${r.idx === b.idx ? 'me' : ''} ${r.idx <= b.idx ? 'done' : ''}" data-brprize="${r.idx}"><span>${r.idx + 1}. ${esc(r.title)}</span>
      <img src="${BR_IMG(r.icon)}" alt="">${brStars(r.stars, 'sm')}<b>${fmtFull(r.need)}</b><img class="brbox" src="${GFX}quest/chest.png" alt=""></div>`).join('')}</div>`;
  } else {
    body = `<div class="pstats brhelp">Ранг отражает успехи правителя в битвах. Очки ранга выдаются за уничтоженных воинов противника — чем больше воинов уничтожено в одном бою, тем больше очков.<br><br>
      • Нападения и набеги на игроков и защита своего замка — полные очки.<br>• Лагеря разбойников — половина очков.<br>
      • Если противник слабее Вас больше чем на 5 рангов — очков меньше.<br>
      • Очки копятся всё время, а ранг обновляется 1-го числа каждого месяца — тогда же приходят награды за все открытые ранги<br><br>
      За каждый открытый ранг — награда в Кладовую (1-го числа): армия (300 воинов за 1-й ранг, 600 за 2-й и так далее) и ресурсы (по 500, 1 000…), на новом звании ещё опыт генерала. Нажмите на ранг в «Таблице уровней», чтобы увидеть награду.<br><br>
      Пока ранг у Вас, действует бонус: урон и защита воинов и прирост ресурсов во всех замках — чем выше ранг, тем больше (на Легенде 5★: +20% и +30%).</div>`;
  }
  return `${ribbon('Боевой ранг')}${tabs}${body}`;
}
// окно награды ранга: щит, звёзды, воины и ресурсы со значками, всё — в Кладовую
function brPrizePopup(r) {
  const p = r.prize, units = (S.brank.units || []).map((id) => unitById(id)).filter(Boolean), per = Math.floor(p.army / Math.max(1, units.length));
  const pct = (v) => Math.round(v * 1000) / 10;
  const d = document.createElement('div'); d.className = 'rinfo';
  d.innerHTML = `<div class="rinfo-box brprize"><div class="brp-head"><img src="${BR_IMG(r.icon)}" alt=""><div><b>${r.idx + 1}. ${esc(r.title)}</b>${brStars(r.stars)}</div></div>
    <div class="brp-sec">Награда — в Кладовую <img class="brp-chest" src="${GFX}stash/btn.png" data-fb="${GFX}quest/chest.png" alt=""></div>
    <div class="brp-grid">${units.map((u) => `<div class="brp-it"><img src="${unitSrc(raceUnit ? raceUnit(u) : u)}" alt=""><b>${fmtFull(per)}</b><small>${esc(u.name)}</small></div>`).join('')}
      ${['wood', 'stone', 'iron', 'food'].map((k) => `<div class="brp-it res"><img src="gfx3d/res/${k}.png" alt=""><b>${fmtFull(p.res)}</b></div>`).join('')}
      ${p.exp ? `<div class="brp-it"><img src="${GFX}stash/exp.png" alt=""><b>+${fmtFull(p.exp)}</b><small>опыт генерала</small></div>` : ''}</div>
    <div class="brp-sec">Бонус, пока ранг у Вас</div>
    <div class="brp-bon"><span>⚔ Урон и защита <b>+${pct(r.bonus.atk)}%</b></span><span>📈 Прирост ресурсов <b>+${pct(r.bonus.prod)}%</b></span></div>
    <p class="brp-note">Ранг и награды начисляются 1-го числа каждого месяца.</p>
    <button type="button" class="okbtn">Ок</button></div>`;
  d.addEventListener('click', (e) => { if (e.target.closest('.okbtn') || e.target === d) d.remove(); });
  document.body.appendChild(d);
}
function brankMsg(m) { S.brank = m.data; refreshSheet(); }
// значок ранга вверху экрана (слева)
function brankBadge() {
  let b = $('#btnRank');
  if (!b) { b = document.createElement('button'); b.id = 'btnRank'; b.type = 'button'; b.setAttribute('aria-label', 'Боевой ранг'); b.addEventListener('click', () => openBrank()); $('#top').prepend(b); }
  const r = S.st && S.st.user.brank; if (!r) return;
  const key = `${r.icon}`; if (b.dataset.k === key) return; b.dataset.k = key;
  b.innerHTML = `<img class="brsh" src="${BR_IMG(r.icon)}" alt="">`; // вверху — только щит звания
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-brtab],[data-brank],[data-brprize]'); if (!t) return;
  if (t.dataset.brtab) { S.brTab = t.dataset.brtab; return refreshSheet(); }
  if (t.dataset.brank !== undefined) return openBrank(Number(t.dataset.brank));
  const r = S.brank && S.brank.table[Number(t.dataset.brprize)]; if (r) brPrizePopup(r);
});
