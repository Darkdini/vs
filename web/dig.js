'use strict';
// «Кладоискатель» (меню «Игры»): поле 5×5 — копать клетку за клеткой; находки копятся в добыче, ловушка — добыча сгорает;
// «Забрать добычу» — всё найденное в Кладовую. Что под закрытыми клетками, знает только сервер: server/src/dig.js (t:'dig').

S.dig = null;
const DIG_IMG = { trap: 'gfx3d/rep/skull.png', klad: `${GFX}reward/chest.png`, exp: `${GFX}stash/exp.png`, rune: `${GFX}hero/rune_str.png`, all: `${GFX}menu/resources.png` };
const digIcon = (c) => (c.kind === 'res' ? `gfx3d/res/${c.res}.png` : DIG_IMG[c.kind]);
function openDig() { S.dig = null; send({ t: 'dig' }); openSheet(digWin); }
function digWin() {
  const d = S.dig;
  if (!d) return `${ribbon('Кладоискатель')}<p class="parch-note">Загрузка…</p>`;
  const g = d.game, playing = g && !g.over;
  // закрытая клетка — холмик земли; открытая — находка или ловушка; после конца игры видно, что было под остальными
  const cells = Array.from({ length: d.size * d.size }, (_, i) => {
    const c = g && g.cells[i];
    if (!c) return `<button type="button" class="digc shut" data-dig="${i}" ${playing ? '' : 'disabled'} aria-label="Копать"></button>`;
    return `<div class="digc ${c.open ? 'open' : 'seen'} k-${c.kind}${g.boom === i ? ' boom' : ''}"><img src="${digIcon(c)}" alt="${esc(c.text)}" title="${esc(c.text)}"></div>`;
  }).join('');
  const status = !g ? `Под клетками — ресурсы, опыт генерала, руны и один клад. Но осторожно: ${d.traps} ловушек!`
    : g.lost ? '💀 Ловушка! Добыча этой игры сгорела.'
      : g.taken ? '✔ Добыча — в Кладовой.'
        : g.bag.length ? `Найдено: <b>${g.bag.length}</b>. Копать дальше или забрать добычу?` : 'Копайте — выберите клетку!';
  return `${ribbon('Кладоискатель')}
    <div class="chtop">Игр сегодня: <b>${d.left}</b> из ${d.max}${d.left ? '' : ` · новые через <span class="cd" data-e="${d.nextAt}"></span>`}</div>
    <p class="digst">${status}</p>
    <div class="digf" style="grid-template-columns:repeat(${d.size}, 1fr)">${cells}</div>
    ${g && g.bag.length ? `<div class="digbag"><b>Добыча${g.lost ? ' (сгорела)' : g.taken ? ' (в Кладовой)' : ''}:</b> ${g.bag.map(esc).join(' · ')}</div>` : ''}
    ${playing ? `<button type="button" class="pbar" data-digtake ${g.bag.length ? '' : 'disabled'}>Забрать добычу</button>`
    : `<button type="button" class="pbar" data-digstart ${d.left ? '' : 'disabled'}>${g ? 'Новая игра' : 'Начать раскопки'}</button>`}
    <p class="chnote">Копайте клетку за клеткой: находки копятся в добыче. Попалась ловушка — вся добыча этой игры сгорает, поэтому вовремя остановитесь и заберите её. Бесплатно ${d.max} ${plural(d.max, 'игра', 'игры', 'игр')} в день${d.max < 5 ? ' (с премиумом — 5)' : ''}. Призы — в Кладовую, их размер растёт с уровнем Ратуши столицы. Каждая игра — очко в Зал Славы «Азарт».</p>`;
}
function digMsg(m) { S.dig = m.data; if (m.msg) toast(m.msg, m.kind === 'trap' ? 'err' : ''); refreshSheet(); }
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-dig],[data-digstart],[data-digtake]'); if (!t || t.disabled) return;
  if (t.dataset.dig !== undefined) { // пока сервер не ответил — остальные клетки не нажать (двойное нажатие)
    document.querySelectorAll('[data-dig]').forEach((b) => { b.disabled = true; }); t.classList.add('digging');
    return send({ t: 'dig', op: 'dig', cell: Number(t.dataset.dig) });
  }
  t.disabled = true;
  send({ t: 'dig', op: t.dataset.digstart !== undefined ? 'start' : 'take' });
});
