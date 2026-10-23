'use strict';
// Подземелье (кнопка в здании «Экспедиция»; сервер — dungeon.js): общая карта с лагерями археологов пяти сложностей.
// Свободный лагерь — отправить отряд (археологи копают, Стражи глубин охраняют) копать; чужой — видно, кто копает и когда закончит,
// можно напасть Стражами и отнять находку; свой с находкой — «Забрать»: находка сразу в замке, отряд идёт домой.

S.dg = null; // { data, sel, units, cv — холст карты, vx/vy — сдвиг карты }
const DG = `${GFX}dungeon/`;
const DG_CELL = 50; // клетка карты, px
const DG_W = [0, 58, 68, 80, 94, 110]; // ширина картинки лагеря по сложности
const DG_GUARD = ['', 'слабая', 'средняя', 'сильная', 'очень сильная', 'огромная'];
const DG_ARCH = 230, DG_GUARDU = 231; // Археолог, Страж глубин — в Подземелье ходят только они
// находки по видам: картинка и имя для окна лагеря
const DG_FIND = { 'art:cloak': 'arts/d_cloak.png', 'art:eye': 'arts/d_eye.png', 'art:claw': 'arts/d_claw.png', 'art:seal': 'arts/d_seal.png', 'art:heart': 'arts/d_heart.png', 'art:hand': 'arts/d_hand.png', coin: 'arts/d_coin.png' };
const dgFindName = (key) => (key.startsWith('art:') ? (M().artifacts[key.slice(4)] || {}).name : { exp: 'Хроники Ветерана', res: 'Клад', rep: 'Лавры древних', coin: 'Монета Древних Королей' }[key]) || key;
const dgFindDesc = (key) => (key.startsWith('art:') ? (M().artifacts[key.slice(4)] || {}).desc : { exp: '100–300 опыта генералу', res: '1 000–3 000 каждого ресурса', rep: 'репутация +1…3', coin: '1 монета (не чаще раза в сутки)' }[key]) || '';
const dgFindIco = (key) => (DG_FIND[key] ? `<img src="${GFX}${DG_FIND[key]}" alt="">` : `<span class="dgfi">${{ exp: '📜', res: '💰', rep: '🏅' }[key] || '✦'}</span>`);
function openDung() { S.dg = S.dg || { data: null, sel: 0, units: {} }; send({ t: 'dung', op: 'view' }); openSheet(dungWin); }
function dungMsg(m) {
  if (!S.dg) return; S.dg.data = m.data;
  const top = S.sheets[S.sheets.length - 1];
  if (top === dungWin && S.dg.cv && S.dg.cv.isConnected) dgDraw(); else if ([dungWin, dungCampWin, dungMineWin].includes(top)) refreshSheet(); // карта — без перерисовки окна
}
// раз в 15 с, пока открыто окно Подземелья, — свежая карта (чужие отряды приходят и уходят)
setInterval(() => { if (S.dg && S.sheets.length && [dungWin, dungCampWin, dungMineWin].includes(S.sheets[S.sheets.length - 1]) && !document.hidden) send({ t: 'dung', op: 'view' }); }, 15000);

const dgState = (o) => (o.s === 'go' ? `идёт к лагерю, <span class="cd" data-e="${o.e}"></span>` : o.s === 'dig' ? `копает, ещё <span class="cd" data-e="${o.e}"></span>` : 'нашёл — ждёт, когда заберут');
// состав отряда значками: археологи, воины
const dgUnitsLine = (units) => Object.entries(units || {}).filter(([, n]) => n > 0).map(([id, n]) => { const u = unitById(Number(id)); return u ? `<span><img src="${unitSrc(u)}" alt="">${fmtFull(n)}</span>` : ''; }).join('');
function dgMineHtml(d) {
  const st = (a) => (a.state === 'go' ? `${a.mission === 'dig' ? 'идёт к лагерю' : 'идёт в налёт'}, <span class="cd" data-e="${a.arrive}"></span>` : a.state === 'dig' ? `копает, ещё <span class="cd" data-e="${a.digEnd}"></span>`
    : a.state === 'found' ? `<b class="good">нашёл: ${esc(a.find ? a.find.name : 'находку')}</b>` : a.state === 'back' ? `возвращается${a.find ? ` с добычей: ${esc(a.find.name)}` : ''}, <span class="cd" data-e="${a.back}"></span>` : '');
  return d.mine.map((a) => { const k = d.kinds[a.l] || {}; return `<div class="dgmine"><img src="${DG}camp${a.l || 1}.png" alt="">
    <div class="grow"><b>${esc(k.name || 'Лагерь')}</b> · ${a.mission === 'dig' ? 'раскопки' : 'налёт'}<br><small>${st(a)}</small><div class="dgunits">${dgUnitsLine(a.units)}</div></div>
    ${a.mission === 'dig' && a.state === 'found' ? `<button class="btn small primary" data-dgclaim="${a.id}">Забрать</button>` : a.mission === 'dig' && a.state === 'dig' ? `<button class="btn small" data-dgrecall="${a.id}">Бросить</button>` : ''}
    ${a.state !== 'back' && a.camp && d.camps.some((c) => c.id === a.camp) ? `<button class="btn small" data-dgcamp="${a.camp}">👁</button>` : ''}</div>`; }).join('');
}
// карта — на весь экран: один холст (земля, лагеря, ники и время), двигается пальцем; нажатие на лагерь — окно лагеря
const DG_IMG = {};
const dgImg = (k) => { let i = DG_IMG[k]; if (!i) { i = DG_IMG[k] = new Image(); i.onload = () => dgDraw(); i.src = `${DG}${k}`; } return i.complete && i.naturalWidth ? i : null; };
function dungWin() {
  const d = S.dg && S.dg.data;
  if (!d) return `${ribbon('Подземелье')}<p class="parch-note">Спускаемся в Подземелье…</p>`;
  queueMicrotask(dgMount);
  const found = d.mine.filter((a) => a.state === 'found').length;
  return `<div class="dgfull" id="dgfull">
    <div class="dgbar"><b>Подземелье</b><span>Раскопок: ${d.active} из ${d.max}</span>
      <button class="btn small ${found ? 'primary' : ''}" data-dgmine>Мои отряды${d.mine.length ? ` (${d.mine.length})` : ''}${found ? ' ★' : ''}</button><button class="btn small" data-dghelp>?</button></div>
    <button class="dgexit" data-dgexit aria-label="Выйти из Подземелья">✕</button>
  </div>`;
}
function dungMineWin() {
  const d = S.dg && S.dg.data; if (!d) return ribbon('Мои отряды');
  return `${ribbon('Мои отряды в Подземелье')}${dgMineHtml(d) || '<p class="parch-note">Отрядов в Подземелье нет. Выберите на карте свободный лагерь и отправьте археологов.</p>'}`;
}
const dungHelpWin = () => `${ribbon('Подземелье')}<div class="card small"><p>На карте — лагеря археологов пяти сложностей (цифра у лагеря). Чем выше сложность — тем сильнее охрана, дольше раскопки и ценнее находки, но и опаснее для археологов. Шанс находки зависит от того, сколько археологов вы отправили.</p>
  <p>В Подземелье ходят только археологи и Стражи глубин (тренируются в Экспедиции). Археологи копают, Стражи бьются с охраной лагеря. Одновременно — не больше трёх раскопок. Находят не всегда, а часть археологов гибнет в обвалах и ловушках.</p>
  <p>Нашли — отряд ждёт в лагере. Нажмите на лагерь и «Забрать»: находка сразу окажется в замке (артефакт — в Сокровищнице, пробуждается в Башне артефактов). Пока не забрали, любой игрок может напасть Стражами и отнять находку — в Подземелье нет ни купола, ни защиты новичка, ни союзов.</p>
  <p>Находки: 1 — «Покров Безмолвия», «Око Призрака»; 2 — «Коготь Полководца», опыт генерала; 3 — «Печать Нерушимости», «Сердце Твердыни»; 4 — «Длань Хранителя», клад ресурсов; 5 — «Монета Древних Королей», репутация.</p>
  <p>Зелёный круг — ваш отряд, красный — чужой. Двигайте карту пальцем, нажмите на лагерь.</p></div>`;
// холст создаётся один раз и переносится в окно при каждой перерисовке (положение карты сохраняется)
function dgMount() {
  const box = $('#dgfull'), s = S.dg; if (!box || !s) return;
  if (!s.cv) {
    s.cv = document.createElement('canvas'); s.cv.className = 'dgcv';
    let drag = null;
    s.cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: s.vx, vy: s.vy, moved: false }; s.cv.setPointerCapture(e.pointerId); });
    s.cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) { s.vx = drag.vx - dx; s.vy = drag.vy - dy; dgClamp(); dgDraw(); } });
    s.cv.addEventListener('pointerup', (e) => { const d0 = drag; drag = null; if (!d0 || d0.moved) return; const r = s.cv.getBoundingClientRect(), c = dgHit(e.clientX - r.left + s.vx, e.clientY - r.top + s.vy);
      if (c) { s.sel = c.id; s.units = {}; openSheet(dungCampWin); } });
    s.cv.addEventListener('pointercancel', () => { drag = null; });
  }
  box.appendChild(s.cv);
  const d = s.data, W = box.clientWidth, H = box.clientHeight;
  if (s.vx === undefined) { const my = d.camps.find((c) => c.o && c.o.me) || { x: d.w / 2, y: d.h / 2 }; s.vx = (my.x + 0.5) * DG_CELL - W / 2; s.vy = (my.y + 0.5) * DG_CELL - H / 2; }
  dgClamp(); dgDraw();
}
function dgClamp() { const s = S.dg, d = s.data, box = $('#dgfull'); if (!box) return; s.vx = Math.max(0, Math.min(d.w * DG_CELL - box.clientWidth, s.vx)); s.vy = Math.max(0, Math.min(d.h * DG_CELL - box.clientHeight, s.vy)); }
// лагерь под точкой (x, y карты): по картинке лагеря, верхние — первыми
const dgRect = (c) => { const w = DG_W[c.l], h = w * 1.05, cx = (c.x + 0.5) * DG_CELL, cy = (c.y + 0.5) * DG_CELL; return { x: cx - w / 2, y: cy - h * 0.62, w, h, cx, cy }; };
function dgHit(x, y) { const L = S.dg.data.camps.slice().sort((p, q) => q.y - p.y); return L.find((c) => { const r = dgRect(c); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h + 14; }) || null; }
function dgDraw() {
  const s = S.dg, cv = s && s.cv, box = $('#dgfull'); if (!cv || !box || !cv.isConnected) return;
  const d = s.data, dpr = Math.min(2, window.devicePixelRatio || 1), W = box.clientWidth, H = box.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = `${W}px`; cv.style.height = `${H}px`; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gr = dgImg('ground.jpg'), T = 240;
  if (gr) { for (let y = -(s.vy % T); y < H; y += T) for (let x = -(s.vx % T); x < W; x += T) g.drawImage(gr, x, y, T, T); } else { g.fillStyle = '#1c130b'; g.fillRect(0, 0, W, H); }
  // украшения: кристаллы, колонны, кости, лава, вагонетки, сталагмиты, жаровни — на постоянных местах, в стороне от лагерей
  if (!s.deco || s.decoFor !== d.camps.length) {
    const busy = new Set(d.camps.flatMap((c) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => `${c.x + dx}:${c.y + dy}`))));
    s.deco = []; s.decoFor = d.camps.length;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) { const h = ((x * 73856093) ^ (y * 19349663)) >>> 0; if (h % 9 || busy.has(`${x}:${y}`)) continue; s.deco.push({ x, y, k: 1 + (h >>> 5) % 8, z: 0.32 + ((h >>> 9) % 20) / 100, ox: ((h >>> 13) % 30) - 15, oy: ((h >>> 17) % 30) - 15 }); }
  }
  for (const o of s.deco) {
    const im = dgImg(`deco${o.k}.png`); if (!im) continue;
    const w = im.naturalWidth * o.z, h = im.naturalHeight * o.z, x = (o.x + 0.5) * DG_CELL + o.ox - w / 2 - s.vx, y = (o.y + 0.5) * DG_CELL + o.oy - h * 0.8 - s.vy;
    if (x + w < 0 || y + h < 0 || x > W || y > H) continue;
    g.drawImage(im, x, y, w, h);
  }
  const t = now(), vis = d.camps.filter((c) => { const r = dgRect(c); return r.x + r.w > s.vx - 90 && r.x < s.vx + W + 90 && r.y + r.h > s.vy - 30 && r.y < s.vy + H + 30; }).sort((p, q) => p.y - q.y);
  g.textBaseline = 'middle'; g.textAlign = 'center';
  for (const c of vis) {
    const r = dgRect(c), x = r.x - s.vx, y = r.y - s.vy, o = c.o;
    if (o) { const pulse = 0.55 + 0.25 * Math.sin(t / 400 + c.id); g.save(); g.globalAlpha = pulse; const gl = g.createRadialGradient(r.cx - s.vx, r.cy - s.vy, 4, r.cx - s.vx, r.cy - s.vy, r.w * 0.8); gl.addColorStop(0, o.me ? 'rgba(120,255,140,.45)' : 'rgba(255,120,80,.45)'); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(r.cx - s.vx - r.w, r.cy - s.vy - r.w, r.w * 2, r.w * 2); g.restore(); }
    if (o) { g.save(); g.strokeStyle = o.me ? '#6dff7a' : '#ff6a4a'; g.shadowColor = g.strokeStyle; g.shadowBlur = 10; g.lineWidth = 3; g.beginPath(); g.ellipse(r.cx - s.vx, r.cy - s.vy + r.h * 0.12, r.w * 0.46, r.w * 0.2, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
    const im = dgImg(`camp${c.l}.png`); if (im) g.drawImage(im, x, y, r.w, r.w * im.naturalHeight / im.naturalWidth);
    const by = y + r.h + 2;
    if (o) {
      const txt = `${o.login}${o.e ? ` · ${o.e > t ? fmtT((o.e - t) / 1000) : 'готово'}` : ''}`; g.font = '600 12px Georgia, serif';
      const tw = Math.min(170, g.measureText(txt).width) + 26, bx = r.cx - s.vx - tw / 2;
      g.fillStyle = 'rgba(20,12,6,.88)'; g.strokeStyle = o.me ? '#6dff7a' : '#ff6a4a'; g.lineWidth = 1.5; g.beginPath(); if (g.roundRect) g.roundRect(bx, by - 10, tw, 20, 10); else g.rect(bx, by - 10, tw, 20); g.fill(); g.stroke();
      const ic = dgImg(o.s === 'found' ? 'found.png' : 'dig.png'); if (ic) g.drawImage(ic, bx + 3, by - 9, 18, 18);
      g.fillStyle = '#f6e7b8'; g.fillText(txt, bx + 13 + tw / 2, by, tw - 26);
    } else {
      g.fillStyle = 'rgba(20,12,6,.85)'; g.strokeStyle = '#c9a15a'; g.lineWidth = 1.5; g.beginPath(); g.arc(r.cx - s.vx, by, 11, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = '700 14px Georgia, serif'; g.fillStyle = '#ffd98a'; g.fillText(String(c.l), r.cx - s.vx, by + 1);
    }
  }
  // затемнение по краям — глубина подземелья
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
}
// карта перерисовывается, пока открыта
setInterval(() => { if (S.dg && S.dg.cv && S.dg.cv.isConnected && !document.hidden) dgDraw(); }, 300); // таймеры и мерцание огней у отрядов
window.addEventListener('resize', () => { if (S.dg && S.dg.cv && S.dg.cv.isConnected) { dgClamp(); dgDraw(); } });
const dgRow = (u, val, cap) => `<div class="simrow my"><img src="${unitSrc(u)}" alt=""><span>${esc(u.name)}<small class="dgcap">до ${fmtFull(cap)}</small></span>
  <input class="rgin" type="number" inputmode="numeric" min="0" max="${cap}" value="${val || ''}" placeholder="0" data-dgu="${u.id}" data-cap="${cap}"><button class="simmax" data-dgmax="${u.id}" data-cap="${cap}"><img src="${G3}hq/helmet.png" alt="">${fmtFull((MY().units || {})[u.id] || 0)}</button></div>`;
function dungCampWin() {
  const s = S.dg, d = s && s.data, c = d && d.camps.find((q) => q.id === s.sel);
  if (!c) return `${ribbon('Лагерь')}<p class="parch-note">Этого лагеря больше нет — его раскопали. Новый появится в другом месте.</p>`;
  const k = d.kinds[c.l], o = c.o, arch = s.units[DG_ARCH] || 0, sumW = k.finds.reduce((q, f) => q + f.w, 0);
  const finds = k.finds.map((f) => `<div class="dgfind">${dgFindIco(f.key)}<div><b>${esc(dgFindName(f.key))}</b> <small>${Math.round(f.w / sumW * 100)}%</small><br><small>${esc(dgFindDesc(f.key))}</small></div></div>`).join('');
  const info = `<div class="dginfo"><img src="${DG}camp${c.l}.png" alt=""><div>
    <div>Сложность: <b>${c.l} из 5</b></div>
    <div>Путь: <b>${fmtT(k.go)}</b> · раскопки: <b>${fmtT(k.dig)}</b></div>
    <div>Охрана лагеря: нужно больше <b>${fmtFull(k.guard)}</b> Стражей</div>
    <div>Шанс находки: <b>${Math.min(k.cap, Math.round(k.k * Math.sqrt(Math.min(1, arch / k.limit)) + k.camp))}%</b> <small>(чем больше археологов, тем выше; больше всего — с полным отрядом из ${fmtFull(k.limit)})</small></div>
    <div class="small">В обвалах и ловушках гибнет часть археологов — сколько, узнаете из отчёта.</div>
    ${d.exp < k.lvl ? `<div class="bad">Нужна Экспедиция ${k.lvl} ур.</div>` : ''}</div></div>
    <div class="ribbon rband"><span>Что можно найти</span></div><div class="dgfinds">${finds}</div>`;
  const U = (id) => unitById(id);
  let body;
  if (o && o.me) body = `<div class="dgstat me">Здесь ваш отряд: ${dgState(o)}<div class="dgunits">${dgUnitsLine(o.units)}</div></div>
    ${o.s === 'found' && o.find ? `<div class="dgfound">${dgFindIco(o.find.k === 'art' ? (o.find.type === 'coin' ? 'coin' : `art:${o.find.type}`) : o.find.k)}<div><b>Найдено: ${esc(o.find.name)}</b><br><small>Нажмите «Забрать» — находка сразу окажется в замке. Пока она в лагере, её могут отнять.</small></div></div>
      <button class="pbar dgclaim" data-dgclaim="${o.aid}">✦ Забрать</button>` : o.s === 'dig' ? `<button class="pbar" data-dgrecall="${o.aid}">Бросить раскопки и вернуться</button>` : ''}`;
  else if (o) {
    const cap = Math.round(k.limit * (d.raidK || 1.5));
    body = `<div class="dgstat foe"><b>${esc(o.login)}</b>: ${dgState(o)}<br><small>Отряд ≈ ${fmtFull(o.n)}</small></div>
      ${o.s === 'go' ? '<p class="parch-note">Отряд ещё в пути — напасть можно, когда он дойдёт до лагеря.</p>'
        : `<div class="ribbon rband"><span>Налёт Стражами глубин</span></div>${dgRow(U(DG_GUARDU), s.units[DG_GUARDU], cap)}
      <button class="pbar" data-dgatk>⚔ Напасть${o.s === 'found' ? ' и отнять находку' : ''}</button>
      <p class="small muted">В налёт ходят только Стражи глубин. Отряд в лагере защищается без Забора и без помощи замка. Победите — ${o.s === 'found' ? 'находка ваша: Стражи принесут её в замок' : 'раскопки сорваны, лагерь свободен'}.</p>`}`;
  } else {
    body = `<div class="ribbon rband"><span>Отряд на раскопки</span></div>
      ${dgRow(U(DG_ARCH), s.units[DG_ARCH], k.limit)}${dgRow(U(DG_GUARDU), s.units[DG_GUARDU], k.limit)}
      ${(d.have.arch || 0) + (d.have.guard || 0) ? '' : '<p class="parch-note">Археологов и Стражей глубин нет — тренируйте их в Экспедиции.</p>'}
      <button class="pbar" data-dggo ${d.exp < k.lvl || d.active >= d.max ? 'disabled' : ''}>⛏ Копать</button>
      <p class="small muted">Копают археологи (хотя бы один), Стражи бьются с охраной лагеря и стерегут находку. Без Стражей охрана перебьёт археологов. ${d.active >= d.max ? `<b>Сейчас уже ${d.max} раскопки — больше нельзя.</b>` : ''}</p>`;
  }
  return `${ribbon(k.name)}${info}${body}`;
}

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-dgopen],[data-dgcamp],[data-dgmax],[data-dggo],[data-dgatk],[data-dgrecall],[data-dgclaim],[data-dgmine],[data-dghelp],[data-dgexit]'); if (!t) return;
  const d = t.dataset;
  if (d.dgopen !== undefined) return openDung();
  const s = S.dg; if (!s) return;
  if (d.dgexit !== undefined) return closeSheet(); // назад — в Экспедицию (или в замок)
  if (d.dgmine !== undefined) return openSheet(dungMineWin);
  if (d.dghelp !== undefined) return openSheet(dungHelpWin);
  if (d.dgcamp) { s.sel = Number(d.dgcamp); s.units = {}; return openSheet(dungCampWin); }
  if (d.dgmax) { s.units[d.dgmax] = Math.min(Number(d.cap) || 1e9, (MY().units || {})[d.dgmax] || 0); const i = $(`[data-dgu="${d.dgmax}"]`); if (i) i.value = s.units[d.dgmax] || ''; return refreshSheet(); }
  if (d.dgclaim) { send({ t: 'dung', op: 'claim', id: Number(d.dgclaim) }); if (S.sheets[S.sheets.length - 1] === dungCampWin) closeSheet(); return; }
  if (d.dggo !== undefined) { if (!(s.units[230] > 0)) return toast('Нужен хотя бы один археолог.', 'err'); send({ t: 'dung', op: 'go', camp: s.sel, units: s.units }); s.units = {}; return closeSheet(); }
  if (d.dgatk !== undefined) { if (!Object.values(s.units).some((n) => n > 0)) return toast('Выберите войска.', 'err'); send({ t: 'dung', op: 'attack', camp: s.sel, units: s.units }); s.units = {}; return closeSheet(); }
  if (d.dgrecall) { if (!confirm('Бросить раскопки? Отряд вернётся домой без находки.')) return; send({ t: 'dung', op: 'recall', id: Number(d.dgrecall) }); if (S.sheets[S.sheets.length - 1] === dungCampWin) closeSheet(); }
});
$('#sheetBody').addEventListener('input', (e) => {
  const t = e.target; if (!S.dg || !t.dataset || !t.dataset.dgu) return;
  S.dg.units[t.dataset.dgu] = Math.max(0, Math.min(Number(t.dataset.cap) || 1e9, Math.floor(Number(t.value) || 0)));
});
$('#sheetBody').addEventListener('change', (e) => { if (S.dg && e.target.dataset && e.target.dataset.dgu && Number(e.target.dataset.dgu) === 230) refreshSheet(); }); // шанс находки — по числу археологов
