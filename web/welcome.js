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
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
function welcomeShow(m) {
  if (S.welcomed) return; S.welcomed = true;
  const race = (S.st && S.st.user.race) || 'humans', A = ADVISOR[race] || ADVISOR.humans, items = [];
  if (m.attacks) items.push(['reports', '⚔', `На ваши замки нападали: ${m.attacks} ${plural(m.attacks, 'раз', 'раза', 'раз')}`]);
  if (m.reports) items.push(['reports', '📜', `Новых отчётов: ${m.reports}`]);
  if (m.gifts) items.push(['gifts', '🎁', `${plural(m.gifts, 'Вам подарили подарок', 'Вам подарили подарки', 'Вам подарили подарков')}: ${m.gifts}`]);
  if (m.mail) items.push(['mail', '✉', `${plural(m.mail, 'Новое письмо', 'Новых письма', 'Новых писем')}: ${m.mail}`]);
  if (m.news) items.push(['news', '📰', `${plural(m.news, 'Свежая новость', 'Свежие новости', 'Свежих новостей')}: ${m.news}`]);
  const bossRow = m.boss && m.boss.on ? `<div class="wlc-boss"><img src="${GFX}boss/m_${m.boss.kind}.png" alt=""><span>${esc(m.boss.name)}</span><button type="button" data-wgo="boss">Перейти</button></div>` : '';
  const d = document.createElement('div'); d.className = 'wlc';
  const W = Math.min(window.innerWidth * 0.94, 440), k = W / A.w, src = `${GFX}advisor/${race}.webp`;
  // отступ текста от скруток папируса — в пикселях от ширины самого папируса (проценты считались бы от всего окна — на компьютере ломалось)
  d.innerHTML = `<div class="wlc-box" style="width:${W}px;padding:0 ${Math.round(W * 0.18)}px;border-width:${A.top * k}px 0 ${A.bot * k}px;border-image:url('${src}') ${A.top} 0 ${A.bot} fill / ${A.top * k}px 0 ${A.bot * k}px stretch;min-height:${A.h * k}px">
    <h3>Приветствую, мой правитель!</h3><div class="wlc-who">${A.name}</div>
    <p>Сейчас в игре (онлайн): ${fmtFull(m.players)} ${plural(m.players, 'игрок', 'игрока', 'игроков')}.</p>
    ${items.length ? `<p>За Ваше отсутствие:</p>${items.map(([go, ic, t]) => `<button type="button" class="wlc-row" data-wgo="${go}"><i>${ic}</i><span>${t}</span><b>›</b></button>`).join('')}`
      : '<p>За Ваше отсутствие ничего не произошло.</p>'}${bossRow}
    <button type="button" class="wlc-close">Закрыть</button></div>`;
  d.addEventListener('click', (e) => {
    const r = e.target.closest('[data-wgo]');
    if (r) { d.remove(); const go = r.dataset.wgo; if (go === 'boss') { S.world = null; setTab('world'); send({ t: 'world', cx: m.boss.x, cy: m.boss.y }); return; } if (go === 'reports') openReports(); else if (go === 'mail') openDialogs(); else if (go === 'gifts') send({ t: 'profile', id: S.st.user.id }); else openNews(); return; }
    if (e.target.closest('.wlc-close') || e.target === d) { d.remove(); if (S.st && S.st.quests && S.st.quests.cal && !S.calShown) { S.calShown = true; openQuests('cal'); } } // награда за вход ждёт — сразу календарь
  });
  document.body.appendChild(d);
}
