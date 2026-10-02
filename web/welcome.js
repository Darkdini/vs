'use strict';
// Советник встречает при входе (как в оригинале): у каждой расы свой, держит папирус с докладом.
// Докладывает, сколько игроков в игре и что случилось за время отсутствия; тап по строке — сразу в отчёты, письма, подарки или новости.
// Сервер: t:'welcome' { players, reports, attacks, mail, gifts, news } (server/src/news.js welcomeInfo).
// Картинка gfx/advisor/<раса>.webp: середина папируса растягивается под длину доклада (border-image),
// top/bot — где на картинке начинается и кончается растягиваемая часть, w/h — размер картинки.

const ADVISOR = {
  humans: { name: 'Советник Эдмунд', w: 496, h: 706, top: 415, bot: 72 },
  elves: { name: 'Советница Лаэль', w: 476, h: 699, top: 402, bot: 66 },
  dwarves: { name: 'Советник Торин', w: 497, h: 698, top: 410, bot: 66 },
  orcs: { name: 'Советник Грумаш', w: 480, h: 725, top: 436, bot: 65 },
};
// «в субботу в 18:00 (через 1д 2ч)» — время по часам игрока
const bossWhen = (t) => { const d = new Date(t), days = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
  return `${days[d.getDay()]} в ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} (через ${fmtT((t - now()) / 1000)})`; };
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
function welcomeShow(m) {
  if (S.welcomed) return; S.welcomed = true;
  const race = (S.st && S.st.user.race) || 'humans', A = ADVISOR[race] || ADVISOR.humans, items = [];
  if (m.attacks) items.push(['reports', '⚔', `На ваши замки нападали: ${m.attacks} ${plural(m.attacks, 'раз', 'раза', 'раз')}`]);
  if (m.reports) items.push(['reports', '📜', `Новых отчётов: ${m.reports}`]);
  if (m.gifts) items.push(['gifts', '🎁', `${plural(m.gifts, 'Вам подарили подарок', 'Вам подарили подарки', 'Вам подарили подарков')}: ${m.gifts}`]);
  if (m.mail) items.push(['mail', '✉', `${plural(m.mail, 'Новое письмо', 'Новых письма', 'Новых писем')}: ${m.mail}`]);
  if (m.news) items.push(['news', '📰', `${plural(m.news, 'Свежая новость', 'Свежие новости', 'Свежих новостей')}: ${m.news}`]);
  const bossRow = !m.boss ? '' : m.boss.on
    ? `<button type="button" class="wlc-row wlc-boss" data-wgo="boss"><i>🐉</i><span>${esc(m.boss.name)} на карте мира: <b>X ${m.boss.x}, Y ${m.boss.y}</b>, здоровье ${m.boss.pct}%. Уйдёт через ${fmtT((m.boss.end - now()) / 1000)}. Нажмите — перейти к нему!</span><b>›</b></button>`
    : `<button type="button" class="wlc-row" data-wgo="bossinfo"><i>🐉</i><span>Мировой босс появится ${bossWhen(m.boss.next)}.</span><b>›</b></button>`;
  const d = document.createElement('div'); d.className = 'wlc';
  const W = Math.min(window.innerWidth * 0.94, 440), k = W / A.w, src = `${GFX}advisor/${race}.webp`;
  d.innerHTML = `<div class="wlc-box" style="width:${W}px;border-width:${A.top * k}px 0 ${A.bot * k}px;border-image:url('${src}') ${A.top} 0 ${A.bot} fill / ${A.top * k}px 0 ${A.bot * k}px stretch;min-height:${A.h * k}px">
    <h3>Приветствую, мой правитель!</h3><div class="wlc-who">${A.name}</div>
    <p>Сейчас в игре ${fmtFull(m.players)} ${plural(m.players, 'игрок', 'игрока', 'игроков')}.</p>
    ${items.length ? `<p>За Ваше отсутствие:</p>${items.map(([go, ic, t]) => `<button type="button" class="wlc-row" data-wgo="${go}"><i>${ic}</i><span>${t}</span><b>›</b></button>`).join('')}`
      : '<p>За Ваше отсутствие ничего не произошло.</p>'}${bossRow}
    <button type="button" class="wlc-close">Закрыть</button></div>`;
  d.addEventListener('click', (e) => {
    const r = e.target.closest('[data-wgo]');
    if (r) { d.remove(); const go = r.dataset.wgo; if (go === 'boss') { S.world = null; setTab('world'); send({ t: 'world', cx: m.boss.x, cy: m.boss.y }); return; } if (go === 'bossinfo') return openBoss(); if (go === 'reports') openReports(); else if (go === 'mail') openDialogs(); else if (go === 'gifts') send({ t: 'profile', id: S.st.user.id }); else openNews(); return; }
    if (e.target.closest('.wlc-close') || e.target === d) d.remove();
  });
  document.body.appendChild(d);
}
