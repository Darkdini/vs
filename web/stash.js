'use strict';
// Кладовая игрока, одна на все замки (как «Сокровища» оригинала): награды заданий, похода и мирового босса — ресурсы, уникальные воины, опыт генерала.
// Нажатие на строку — ползунок и «Извлечь». Сервер: server/src/stash.js (t:'stash', op:'take').
// Картинки — gfx/stash/*.png; пока их нет, показываются запасные (data-fb, см. hero.js).

const STASH_IC = { wood: 'gfx3d/res/wood.png', stone: 'gfx3d/res/stone.png', iron: 'gfx3d/res/iron.png', food: 'gfx3d/res/food.png' };
S.stash = null; S.stashOpen = null; S.stashN = ''; // stashN — сколько вписано в поле «Сколько» (окно может перерисоваться)
function openStash() { S.stash = null; S.stashOpen = null; S.stashN = ''; send({ t: 'stash' }); openSheet(stashWin); }
function stashIcon(x) {
  if (x.kind === 'res') return `<img src="${STASH_IC[x.key]}" alt="">`;
  if (x.kind === 'royal') return `<img src="${M3('loyalty')}" alt="">`;
  if (x.kind === 'exp') return `<img src="${GFX}stash/exp.png" data-fb="${GFX}smallicon/magattack.png" alt="">`;
  const u = unitById(x.key); return u ? `<img class="u" src="${unitSrc(u)}" alt="">` : '';
}
function stashWin() {
  const L = S.stash;
  if (!L) return `${ribbon('Кладовая')}<p class="parch-note">Загрузка…</p>`;
  if (!L.length) return `${ribbon('Кладовая')}<p class="parch-note">Кладовая пуста. Сюда падают награды заданий, похода «Тёмные земли» и мирового босса: ресурсы, уникальные воины и опыт генерала.</p>`;
  const id = (x) => `${x.kind}:${x.key}`;
  return `${ribbon('Кладовая')}<p class="small muted center">Кладовая одна на все Ваши замки: награды ждут здесь и не пропадают. Извлечённое попадёт в замок, где Вы сейчас${S.stashCastle ? ` — <b>«${esc(S.stashCastle)}»</b>` : ''}; ресурсы — пока есть место на Складе.</p>
    <div class="stl">${L.map((x) => { const open = S.stashOpen === id(x);
      const why = x.kind === 'res' && !x.max ? 'В замке хранится максимальное количество ресурса этого типа.' : x.kind === 'exp' && !x.max ? 'Нужен живой генерал в этом замке — перейдите в замок с генералом.' : '';
      return `<div class="str ${open ? 'open' : ''} ${x.quest ? 'uniq' : ''}" data-stid="${id(x)}"><div class="stic">${stashIcon(x)}</div>
        <div class="stm"><b>${esc(x.name)}${x.quest ? ' <i>★</i>' : ''}</b><span class="stn">${fmtFull(x.n)}</span></div>
        ${open ? (why ? `<div class="stwhy">${why}</div>` : `<div class="sttake"><div class="stq">Сколько: <input class="stnum" type="number" inputmode="numeric" min="1" max="${x.max}" step="1" placeholder="0" value="${esc(S.stashN)}" data-stnum><button class="stall" data-stall="${id(x)}">Всё</button></div>
          <input type="range" min="0" max="${x.max}" value="${Math.min(x.max, Math.floor(Number(S.stashN)) || 0)}" data-strange>
          <button class="pbar" data-sttake="${id(x)}">Извлечь</button></div>`) : '<span class="starr">›</span>'}</div>`; }).join('')}</div>`;
}
// значок на экране замка (справа сверху; прячется, пока выдвинута панель локаций): сундук с числом ждущих наград
function stashBtn() {
  let b = $('#stbtn');
  if (!b) { b = document.createElement('button'); b.id = 'stbtn'; b.type = 'button'; b.innerHTML = `<img src="${GFX}stash/btn.png" data-fb="${GFX}quest/chest.png" alt="Кладовая"><b></b>`; b.addEventListener('click', openStash); $('#stage').appendChild(b); }
  const n = (S.st && S.st.castle.mil && S.st.castle.mil.stash) || 0;
  b.classList.toggle('glow', n > 0); b.querySelector('b').textContent = n ? String(n) : '';
  b.hidden = !!S.tab && S.tab !== 'castle'; // только на экране замка (на карте мира и землях — свои панели)
}
// поле «Сколько» и ползунок двигаются вместе; число не больше, чем можно извлечь
$('#sheetBody').addEventListener('input', (e) => {
  const r = e.target.closest('[data-strange]'), f = e.target.closest('[data-stnum]'); if (!r && !f) return;
  const box = e.target.closest('.sttake'), num = box.querySelector('[data-stnum]'), rng = box.querySelector('[data-strange]'), max = Number(rng.max);
  if (r) { const v = Number(r.value); num.value = v > 0 ? String(v) : ''; } else { const v = Math.floor(Number(f.value)) || 0; if (v > max) f.value = String(max); rng.value = String(Math.max(0, Math.min(max, v))); }
  S.stashN = num.value;
});
$('#sheetBody').addEventListener('click', (e) => {
  const tk = e.target.closest('[data-sttake],[data-stall]');
  if (tk) { // «Извлечь» — сколько вписано (пусто — ничего, чтобы случайно не забрать всё); «Всё» — всё, что поместится
    const all = tk.dataset.stall !== undefined, [kind, key] = (all ? tk.dataset.stall : tk.dataset.sttake).split(':'), box = tk.closest('.sttake'), max = Number(box.querySelector('[data-strange]').max);
    const n = all ? max : Math.min(max, Math.floor(Number(box.querySelector('[data-stnum]').value)) || 0);
    if (!(n > 0)) return toast('Впишите, сколько извлечь, или нажмите «Всё».', 'err');
    S.stashOpen = null; S.stashN = ''; return send({ t: 'stash', op: 'take', kind, key, n });
  }
  if (e.target.closest('.sttake')) return;
  const row = e.target.closest('[data-stid]'); if (!row) return;
  S.stashOpen = S.stashOpen === row.dataset.stid ? null : row.dataset.stid; S.stashN = ''; refreshSheet();
});
