'use strict';
// «Боевой ранг»: строка в профиле, значок вверху экрана, окно «Прогресс / Таблица уровней / Справка». Ранг растёт сразу по очкам,
// за каждый новый ранг — сундук с наградой (забрать — кнопкой или в таблице).
// Сервер: server/src/battlerank.js (t:'brank').

S.brank = null; S.brTab = 'prog';
const BR_IMG = (icon) => `${GFX}rank/r${Math.max(1, Math.min(13, icon || 1))}.png`;
const brStars = (n, cls = '') => `<span class="brstars ${cls}">${Array.from({ length: 5 }, (_, i) => `<img src="${GFX}rank/star_${i < n ? 'on' : 'off'}.png" alt="">`).join('')}</span>`;
const brOffWin = () => `${ribbon('Боевой ранг')}<div class="parch-note">⚙ Идут технические работы.<br>Боевой ранг скоро вернётся — следите за новостями игры.</div>`;
function openBrank(id) { if (S.st.user.brOff && !S.st.user.admin) return openSheet(brOffWin); /* ранг выключен админом */
  S.brank = null; S.brTab = 'prog'; send({ t: 'brank', id }); openSheet(brankWin); }
function brankWin() {
  const b = S.brank;
  const tabs = `<div class="coin-tabs br4">${[['prog', 'Прогресс'], ['table', 'Таблица уровней'], ['top', '🏆 Топ'], ['help', '❓ Справка']].map(([k, t]) => `<button class="${S.brTab === k ? 'on' : ''}" data-brtab="${k}">${t}</button>`).join('')}</div>`;
  if (S.brTab === 'top') return `${ribbon('Боевой ранг')}${tabs}${brTopHtml()}`;
  if (!b) return `${ribbon('Боевой ранг')}${tabs}<p class="parch-note">Загрузка…</p>`;
  let body;
  if (S.brTab === 'prog') {
    // ранг растёт сразу, как набраны очки; шкала — от текущего ранга до следующего: заливка и числа на ней — одно и то же
    const nx = b.next, pv = b.prev, pct = nx ? Math.max(0, Math.min(100, ((b.pts - pv) / (nx - pv)) * 100)) : 100;
    body = `<div class="brcard"><img class="brbig" src="${BR_IMG(b.icon)}" alt=""><div>
        <div class="brnow">${b.self ? 'Ваш ранг' : 'Ранг'}</div>
        <div class="brtitle">${b.idx < 0 ? 'Без ранга' : `${b.idx + 1}. ${esc(b.title)}`}</div>${brStars(b.idx < 0 ? 0 : b.stars)}
        <div class="brpts">Очки ранга: <b>${fmtFull(b.pts)}</b></div></div></div>
      ${b.chests > 0 ? `<div class="brnext brclaim"><img src="${GFX}quest/chest_open.png" alt=""><div><b>Новый ранг!</b><br>Сундуков с наградой: <b>${b.chests}</b>
        <small>армия, ресурсы и опыт генерала — в Кладовую</small></div></div><button class="pbar" data-brclaim>Забрать награду</button>` : ''}
      ${nx ? `<div class="brbar"><i style="width:${pct.toFixed(1)}%"></i><span>${fmtFull(b.pts - pv)} / ${fmtFull(nx - pv)} · ${Math.floor(pct)}%</span></div><p class="coinhint">До ${b.idx + 2}-го ранга: <b>${fmtFull(nx - b.pts)}</b> ${plural(nx - b.pts, 'очко', 'очка', 'очков')}.</p>` : '<p class="coinhint">Высший ранг — Легенда 5★!</p>'}
      <div class="brbonus">Бонус ранга: урон и защита воинов <b>+${(Math.round(b.bonus.atk * 1000) / 10)}%</b>, прирост ресурсов <b>+${(Math.round(b.bonus.prod * 1000) / 10)}%</b></div>
      ${b.season ? `<p class="coinhint">Сезон ${b.season.n} · с ${fmtDay(b.season.start)}${b.best && b.best.season < b.season.n ? ` · рекорд: <b>${b.best.idx + 1}. ${esc(b.best.title)}</b> ${brStars(b.best.stars, 'sm')} (сезон ${b.best.season})` : ''}</p>` : ''}
      ${b.self ? '' : `<p class="coinhint">Игрок: <b>${esc(b.login)}</b></p>`}`;
  } else if (S.brTab === 'table') {
    // сундук: ранг открыт, награда не забрана — светится; забрана — бледный
    body = `<div class="brtable">${b.table.map((r) => `<div class="${r.idx === b.idx ? 'me' : ''} ${r.idx <= b.idx ? 'done' : ''} ${b.self && r.idx <= b.idx && r.idx > b.claimed ? 'ready' : ''} ${b.self && r.idx <= b.claimed ? 'got' : ''}" data-brprize="${r.idx}"><span>${r.idx + 1}. ${esc(r.title)}</span>
      <img src="${BR_IMG(r.icon)}" alt="">${brStars(r.stars, 'sm')}<b>${fmtFull(r.need)}</b><img class="brbox${r.prize.title ? ' tch' : ''}" src="${GFX}${r.prize.chest || 'quest/chest.png'}" alt=""></div>`).join('')}</div>`;
  } else {
    body = `<div class="pstats brhelp">Ранг отражает успехи правителя в битвах. Очки ранга выдаются за уничтоженных воинов противника — чем больше воинов уничтожено в одном бою, тем больше очков.<br><br>
      • Нападения и набеги на игроков и защита своего замка — 1 очко за каждые 5 единиц населения уничтоженных воинов.<br>• Лагеря разбойников — вдвое меньше.<br>
      • Раненые — ушедшие в Лазарет и выздоровевшие дома — дают четверть очков.<br>
      • Торговцы, путешественники, учёные, археологи и бунтари очков не дают.<br>
      • Повторный бой с тем же игроком за сутки — вдвое меньше очков, третий — вчетверо меньше и так далее.<br>
      • Если противник слабее Вас больше чем на 5 рангов — очков меньше.<br>
      • Ранг повышается сразу, как только набраны очки, — новое звание видно в профиле и на значке вверху экрана.<br><br>
      За каждый новый ранг — сундук с наградой: заберите его в этом окне (кнопка «Забрать награду» или сундук в «Таблице уровней»). В Кладовую придут армия (15 воинов за 1-й ранг, 30 за 2-й и так далее), ресурсы (по 250, 500…) и опыт генерала (50, 100…). Нажмите на ранг в «Таблице уровней», чтобы увидеть награду.<br><br>
      На первом ранге каждого нового звания (7. Рекрут, 13. Боец, 19. Воин…) — сундук звания: сверх обычной награды руны, со звания «Воин» — артефакт, с «Чемпиона» — ещё и воины-нежить. Чем выше звание, тем богаче сундук.<br><br>
      Сезоны: раз в месяц администрация начинает новый сезон — у всех ранги и очки с нуля, сундуки за ранги можно получить снова. Несобранные сундуки сами уходят в Кладовую, лучший ранг остаётся Вашим рекордом, а лучшие 10 игроков сезона — в «Топ» → «Прошлые сезоны».<br><br>
      Пока ранг у Вас, действует бонус: урон и защита воинов и прирост ресурсов во всех замках — чем выше ранг, тем больше (на Легенде 5★: +10% и +30%).</div>`;
  }
  return `${ribbon('Боевой ранг')}${tabs}${body}`;
}
// окно награды ранга: щит, звёзды, воины и ресурсы со значками, всё — в Кладовую
function brPrizePopup(r) {
  const b = S.brank, ready = b && b.self && r.idx <= b.idx && r.idx > b.claimed, got = b && b.self && r.idx <= b.claimed;
  const p = r.prize, units = (S.brank.units || []).map((id) => unitById(id)).filter(Boolean), per = Math.floor(p.army / Math.max(1, units.length));
  const pct = (v) => Math.round(v * 1000) / 10;
  const d = document.createElement('div'); d.className = 'rinfo';
  d.innerHTML = `<div class="rinfo-box brprize"><div class="brp-head"><img src="${BR_IMG(r.icon)}" alt=""><div><b>${r.idx + 1}. ${esc(r.title)}</b>${brStars(r.stars)}</div></div>
    <div class="brp-sec">Награда — в Кладовую <img class="brp-chest" src="${GFX}stash/btn.png" data-fb="${GFX}quest/chest.png" alt=""></div>
    <div class="brp-grid">${units.map((u) => `<div class="brp-it"><img src="${unitSrc(raceUnit ? raceUnit(u) : u)}" alt=""><b>${fmtFull(per)}</b><small>${esc(u.name)}</small></div>`).join('')}
      ${['wood', 'stone', 'iron', 'food'].map((k) => `<div class="brp-it res"><img src="gfx3d/res/${k}.png" alt=""><b>${fmtFull(p.res)}</b></div>`).join('')}
      ${p.exp ? `<div class="brp-it"><img src="${GFX}stash/exp.png" alt=""><b>+${fmtFull(p.exp)}</b><small>опыт генерала</small></div>` : ''}</div>
    ${p.title ? brTitleChest(r) : ''}
    <div class="brp-sec">Бонус, пока ранг у Вас</div>
    <div class="brp-bon"><span>⚔ Урон и защита <b>+${pct(r.bonus.atk)}%</b></span><span>📈 Прирост ресурсов <b>+${pct(r.bonus.prod)}%</b></span></div>
    <p class="brp-note">${got ? 'Награда за этот ранг уже в Кладовой.' : ready ? 'Ранг открыт — заберите сундук!' : 'Сундук откроется, когда наберёте очки для этого ранга.'}</p>
    ${ready ? `<button type="button" class="okbtn" data-brclaimto="${r.idx}">Забрать</button>` : '<button type="button" class="okbtn">Ок</button>'}</div>`;
  d.addEventListener('click', (e) => {
    const c = e.target.closest('[data-brclaimto]'); if (c) { send({ t: 'brank', op: 'claim', upto: Number(c.dataset.brclaimto) }); d.remove(); return; }
    if (e.target.closest('.okbtn') || e.target === d) d.remove();
  });
  document.body.appendChild(d);
}
// сундук звания (первый ранг нового звания): руны, нежить, артефакты — сверх обычной награды (сервер: battlerank.js TITLE_PRIZE)
function brTitleChest(r) {
  const t = r.prize.title, arts = {}; for (const a of t.arts || []) arts[a] = (arts[a] || 0) + 1;
  return `<div class="brp-sec">Сундук звания «${esc(r.title)}» — сверх того <img class="brp-chest" src="${GFX}${r.prize.chest}" alt=""></div>
    <div class="brp-grid">${t.runes ? `<div class="brp-it"><img src="${GFX}hero/rune_str.png" alt=""><b>${t.runes}</b><small>руны</small></div>` : ''}
      ${Object.entries(t.units || {}).map(([id, n]) => { const u = unitById(Number(id)); return u ? `<div class="brp-it"><img src="${unitSrc(u)}" alt=""><b>${fmtFull(n)}</b><small>${esc(u.name)}</small></div>` : ''; }).join('')}
      ${Object.entries(arts).map(([a, n]) => `<div class="brp-it"><img src="${GFX}arts/atk.png" alt=""><b>${n}</b><small>артефакт (${['обычный', 'редкий', 'легендарный'][a]})</small></div>`).join('')}</div>`;
}
function brankMsg(m) { S.brank = m.data; refreshSheet(); }
// вкладка «Топ»: рейтинг игроков по боевому рангу — по 10 на страницу (сервер: brank op:'top' → brtop); ник — профиль игрока
const brTopRow = (r) => `<button class="brtrow ${r.id === S.st.user.id ? 'me' : ''}" data-profile="${r.id}"><span class="brpl">${['🥇', '🥈', '🥉'][r.place - 1] || r.place}</span>
      <img src="${BR_IMG(r.icon)}" alt=""><span class="brtn"><b>${esc(r.login)}</b><small>${r.idx + 1}. ${esc(r.title)} ${brStars(r.stars, 'sm')}</small></span><span class="brtp">${fmtFull(r.pts)}</span></button>`;
function brTopHtml() {
  if (S.brHistOn) return brHistHtml();
  const T = S.brTop; if (!T) return '<p class="parch-note">Загрузка…</p>';
  return `<p class="brme">${T.me ? `Ваше место: <b>${T.me}</b> из ${fmtFull(T.total)}` : 'Вас пока нет в рейтинге — очки ранга дают бои.'}</p>
    ${T.season ? `<p class="brseas">Сезон ${T.season.n} · с ${fmtDay(T.season.start)}</p>${T.hist ? '<button type="button" class="pbar" data-brhist="1">Прошлые сезоны</button>' : ''}` : ''}${mailPager('brpg', T.page, T.pages)}
    <div class="brtop">${T.list.map(brTopRow).join('') || '<p class="parch-note">В рейтинге пока никого — очки ранга дают бои.</p>'}</div>`;
}
// «Прошлые сезоны»: лучшие 10 каждого сезона (сервер: brank op:'hist' → brhist)
function brHistHtml() {
  const H = S.brHist, back = '<button type="button" class="pbar" data-brhist="0">Текущий сезон</button>';
  if (!H) return `${back}<p class="parch-note">Загрузка…</p>`;
  return `${back}${H.map((h) => `<p class="brseas"><b>Сезон ${h.n}</b> · ${fmtDay(h.start)} — ${fmtDay(h.end)}</p>
    <div class="brtop">${h.top.map(brTopRow).join('') || '<p class="parch-note">В этом сезоне никто не набрал очков.</p>'}</div>`).join('') || '<p class="parch-note">Прошлых сезонов пока нет.</p>'}`;
}
function brHistMsg(m) { S.brHist = m.data; refreshSheet(); }
function brTopMsg(m) { S.brTop = m.data; refreshSheet(); }
// значок ранга вверху экрана (слева)
function brankBadge() {
  let b = $('#btnRank');
  if (!b) { b = document.createElement('button'); b.id = 'btnRank'; b.type = 'button'; b.setAttribute('aria-label', 'Боевой ранг'); b.addEventListener('click', () => openBrank()); $('#top').prepend(b); }
  const r = S.st && S.st.user.brank; if (!r) return;
  const nw = S.st.user.brNew || 0, key = `${r.icon}|${nw}`; if (b.dataset.k === key) return; b.dataset.k = key;
  b.innerHTML = `<img class="brsh" src="${BR_IMG(r.icon)}" alt="">${nw ? '<b class="brdot"></b>' : ''}`; // щит звания; красная метка — ждут сундуки наград
}
$('#sheetBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-brclaim]')) return send({ t: 'brank', op: 'claim' }); // все сундуки наград — в Кладовую
  const h = e.target.closest('[data-brhist]'); if (h) { S.brHistOn = h.dataset.brhist === '1'; if (S.brHistOn) { S.brHist = null; send({ t: 'brank', op: 'hist' }); } return refreshSheet(); }
  const t = e.target.closest('[data-brtab],[data-brank],[data-brprize],[data-brpg]'); if (!t) return;
  if (t.dataset.brpg !== undefined) return send({ t: 'brank', op: 'top', page: Math.max(0, Number(t.dataset.brpg)) });
  if (t.dataset.brtab) { S.brTab = t.dataset.brtab; S.brHistOn = false; if (S.brTab === 'top') { S.brTop = null; send({ t: 'brank', op: 'top', page: 0 }); } return refreshSheet(); }
  if (t.dataset.brank !== undefined) return openBrank(Number(t.dataset.brank));
  const r = S.brank && S.brank.table[Number(t.dataset.brprize)]; if (r) brPrizePopup(r);
});
