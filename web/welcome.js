'use strict';
// Советник встречает при входе (как в оригинале): у каждой расы свой, выглядывает из-за свитка.
// Докладывает, сколько игроков в игре и что случилось за время отсутствия; тап по строке — сразу в отчёты, письма или новости.
// Сервер: t:'welcome' { players, reports, attacks, mail, news } (server/src/news.js welcomeInfo).

const ADVISOR = { humans: 'Советник Эдмунд', elves: 'Советница Лаэль', dwarves: 'Советник Торин', orcs: 'Советник Грумаш' };
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
function welcomeShow(m) {
  if (S.welcomed) return; S.welcomed = true;
  const race = (S.st && S.st.user.race) || 'humans', items = [];
  if (m.attacks) items.push(['reports', '⚔', `На ваши замки нападали: ${m.attacks} ${plural(m.attacks, 'раз', 'раза', 'раз')}.`]);
  if (m.reports) items.push(['reports', '📜', `Новых отчётов: ${m.reports}.`]);
  if (m.mail) items.push(['mail', '✉', `${plural(m.mail, 'Новое письмо', 'Новых письма', 'Новых писем')}: ${m.mail}.`]);
  if (m.news) items.push(['news', '📰', `${plural(m.news, 'Свежая новость', 'Свежие новости', 'Свежих новостей')}: ${m.news}.`]);
  const d = document.createElement('div'); d.className = 'wlc';
  d.innerHTML = `<div class="wlc-box"><img class="wlc-adv" src="${GFX}advisor/${race}.png" alt="">
    <div class="wlc-in"><h3>Приветствую, мой правитель!</h3><div class="wlc-who">${ADVISOR[race] || 'Советник'}</div>
      <p>Сейчас в игре ${fmtFull(m.players)} ${plural(m.players, 'игрок', 'игрока', 'игроков')}.</p>
      ${items.length ? `<p>За Ваше отсутствие:</p>${items.map(([go, ic, t]) => `<button type="button" class="wlc-row" data-wgo="${go}"><i>${ic}</i><span>${t}</span><b>›</b></button>`).join('')}`
        : '<p>За Ваше отсутствие ничего не произошло.</p>'}
      <button type="button" class="wlc-close">✕ Закрыть</button></div></div>`;
  // своей картинки советника ещё нет — временно портрет генерала расы; нет и его — без картинки
  d.querySelector('.wlc-adv').addEventListener('error', (e) => { const im = e.target; if (!im.dataset.tried) { im.dataset.tried = '1'; im.classList.add('bust'); im.src = `${GFX}hero/portrait_${race}.png`; } else { im.remove(); d.classList.add('noadv'); } });
  d.addEventListener('click', (e) => {
    const r = e.target.closest('[data-wgo]');
    if (r) { d.remove(); const go = r.dataset.wgo; if (go === 'reports') openReports(); else if (go === 'mail') openDialogs(); else openNews(); return; }
    if (e.target.closest('.wlc-close') || e.target === d) d.remove();
  });
  document.body.appendChild(d);
}
