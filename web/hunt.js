'use strict';
// «Алтарь» → «Зона охоты» (сервер — server/src/hunt.js, t:'hunt'): общая карта, где бродят чудовища четырёх стихий и ходят Генералы
// игроков. Нажали на чудовище — окно с его силой и защитой, выбор до двух боевых заклинаний (за кристаллы) и «Атаковать».
// Анимация на холсте: чудовища «дышат», Генерал идёт к чудовищу (шаги), у чудовища замахивается, летят заклинания,
// всплывают цифры урона; полоски здоровья у чудовищ и Генералов. Карта — картинка gfx/hunt/bg.webp, двигается пальцем.
S.hn = null; // { data, cv, vy, sel, spells: [], anim }
const HN = `${GFX}hunt/`;
const HN_EL = ['fire', 'water', 'air', 'earth'];
const HN_COL = { fire: '#ff7a2a', water: '#3aa8ff', air: '#bfe9ff', earth: '#6ed25a', phys: '#ffffff' };
const HN_RES_IC = { fire: 'c_fire', water: 'c_water', air: 'c_air', earth: 'c_earth' };
const HN_MOB_H = [0, 70, 96, 128]; // высота чудовища на экране по уровню
const HN_HERO_H = 64;
const HN_IMG = {};
const hnImg = (k) => { let i = HN_IMG[k]; if (!i) { i = HN_IMG[k] = new Image(); i.src = `${HN}${k}.png`; } return i.complete && i.naturalWidth ? i : null; };
const hnIco = (k, cls = 'hnic') => `<img class="${cls}" src="${HN}${k}.png" alt="">`;
const hnMy = () => S.hn && S.hn.data && S.hn.data.me;
function openHunt() { S.hn = S.hn || { data: null, sel: 0, spells: [] }; send({ t: 'hunt', op: 'view' }); openSheet(huntWin); }
function huntMsg(m) {
  if (!S.hn) return; const was = S.hn.data; S.hn.data = m.data;
  // удар виден только через опрос (до 2 с задержки) — анимацию удара запускаем с момента, когда клиент о нём узнал
  const seen = S.hn.seen || (S.hn.seen = {}), t = now();
  for (const h of [m.data.me, ...(m.data.hunters || [])]) { const L = h && h.last; if (!L) continue; const key = L.mob + ':' + L.at; if (!(key in seen)) seen[key] = t - L.at > 400 && t - L.at < 4000 ? t - 150 : L.at; L.at = seen[key]; }
  const top = S.sheets[S.sheets.length - 1];
  if (top === huntWin && S.hn.cv && S.hn.cv.isConnected) { hnBar(); if (!was) hnMount(); } else if (top === huntWin || top === huntMobWin) refreshSheet();
}
// пока окно охоты открыто — раз в 2 секунды свежая карта (другие Генералы ходят и бьют)
setInterval(() => { if (S.hn && S.sheets.length && [huntWin, huntMobWin].includes(S.sheets[S.sheets.length - 1]) && !document.hidden) send({ t: 'hunt', op: 'view' }); }, 2000);

function huntWin() {
  const d = S.hn && S.hn.data;
  if (!d) return `${ribbon('Зона охоты')}<p class="parch-note">Генерал выходит на охоту…</p>`;
  queueMicrotask(hnMount);
  return `<div class="dgfull hnfull" id="hnfull"><div class="dgbar hnbar" id="hnbar">${hnBarHtml(d)}</div>
    <button class="dgexit" data-hnexit aria-label="Выйти из Зоны охоты">✕</button></div>`;
}
function hnBarHtml(d) {
  const me = d.me, p = Math.round(me.hp / me.max * 100), mv = me.march, t = now();
  return `<div class="hnhp"><span class="hnheart">❤</span><div class="hnhpbar"><i style="width:${p}%"></i><b>${fmtFull(me.hp)} / ${fmtFull(me.max)}</b></div>
      ${me.hp < me.max ? `<button class="btn small" data-hnheal>Лечить · ${d.healCost} 🪙</button>` : ''}</div>
    <div class="hncry">${HN_EL.map((e) => `<span>${hnIco(HN_RES_IC[e])}${fmtFull(d.crystals[e] || 0)}</span>`).join('')}<span class="hngold">🪙 ${fmtFull(d.gold)}</span>
      <button class="btn small" data-hnhelp>?</button></div>
    ${mv && mv.end > t ? `<div class="hnmarch"><span>⏳ Генерал идёт к чудовищу: <span class="cd" data-e="${mv.end}"></span></span><button class="btn small" data-hnspeed>Ускорить · ${d.speedCost} 🪙</button></div>`
      : !me.general ? '<div class="hnmarch"><span>Охотится Генерал — наймите его в Военном штабе.</span></div>' : ''}`;
}
function hnBar() { const b = $('#hnbar'); if (b && S.hn.data) b.innerHTML = hnBarHtml(S.hn.data); }
// холст: один на всё время, переносится в окно; карта на всю ширину, двигается вверх-вниз
function hnMount() {
  const box = $('#hnfull'), s = S.hn; if (!box || !s || !s.data) return;
  if (!s.cv) {
    s.cv = document.createElement('canvas'); s.cv.className = 'dgcv';
    let drag = null;
    s.cv.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, x: e.clientX, vy: s.vy, vx: s.vx, moved: false }; s.cv.setPointerCapture(e.pointerId); });
    s.cv.addEventListener('pointermove', (e) => { if (!drag) return; const dy = e.clientY - drag.y; if (Math.abs(dy) + Math.abs(e.clientX - drag.x) > 6) drag.moved = true; if (drag.moved) { s.vy = drag.vy - dy; s.vx = drag.vx - (e.clientX - drag.x); hnClamp(); } });
    s.cv.addEventListener('pointerup', (e) => { const d0 = drag; drag = null; if (!d0 || d0.moved) return; const r = s.cv.getBoundingClientRect(), m = hnHit(e.clientX - r.left + s.vx, e.clientY - r.top + s.vy);
      if (m) { s.sel = m.id; s.spells = []; openSheet(huntMobWin); } });
    s.cv.addEventListener('pointercancel', () => { drag = null; });
  }
  box.appendChild(s.cv);
  if (s.vy === undefined) { const k = hnK(); s.vy = s.data.me.y * k - box.clientHeight * 0.6; s.vx = s.data.me.x * k - box.clientWidth / 2; }
  hnClamp();
  if (!s.raf) { const loop = () => { s.raf = 0; if (!s.cv.isConnected || S.sheets[S.sheets.length - 1] !== huntWin) return; hnDraw(); s.raf = requestAnimationFrame(loop); }; s.raf = requestAnimationFrame(loop); }
}
// карта — в натуральную величину (не меньше ширины окна): видно несколько чудовищ, остальное — двигая карту
const hnK = () => { const box = $('#hnfull'); return box ? Math.max(1, box.clientWidth / S.hn.data.w) : 1; };
function hnClamp() { const s = S.hn, box = $('#hnfull'); if (!box) return; const k = hnK(); s.vy = Math.max(-90, Math.min(s.data.h * k - box.clientHeight + 40, s.vy)); s.vx = Math.max(0, Math.min(s.data.w * k - box.clientWidth, s.vx || 0)); }
// где стоит охотник сейчас: дома, в пути (шаги), у чудовища (замах после удара — 2,5 с)
function hnHeroPos(h, mobs, t) {
  const home = { x: h.x, y: h.y }, mv = h.march, at = (id) => { const m = mobs.find((q) => q.id === id); return m ? { x: m.x + 46, y: m.y + 8 } : null; };
  if (mv) { const to = at(mv.mob); if (to) { const f = Math.max(0, Math.min(1, (t - mv.start) / Math.max(1, mv.end - mv.start))); return { x: home.x + (to.x - home.x) * f, y: home.y + (to.y - home.y) * f, walk: f < 1, face: to.x > home.x ? 1 : -1, arrive: f >= 1 }; } }
  if (h.last && t - h.last.at < 2600 && !h.last.gone) { const to = at(h.last.mob) || h.lastPos; if (to) { h.lastPos = to; return { x: to.x, y: to.y, strike: t - h.last.at, face: -1 }; } }
  return { x: home.x, y: home.y };
}
function hnHit(sx, my) { // нажатие по чудовищу: ближайшее в пределах его картинки
  const s = S.hn, k = hnK(); let best = null, bd = 1e9;
  for (const m of s.data.mobs) { const h = HN_MOB_H[m.l], cx = m.x * k, cy = m.y * k - h * 0.45, dx = sx - cx, dy = my - cy; const dd = Math.hypot(dx, dy); if (Math.abs(dx) < h * 0.7 && Math.abs(dy) < h * 0.65 && dd < bd) { bd = dd; best = m; } }
  return best;
}
const hnBarDraw = (g, x, y, w, f, col) => { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x - 1, y - 1, w + 2, 7); g.fillStyle = col; g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), 5); };
function hnDraw() {
  const s = S.hn, cv = s.cv, box = $('#hnfull'); if (!cv || !box || !s.data) return;
  const d = s.data, dpr = Math.min(2, window.devicePixelRatio || 1), W = box.clientWidth, H = box.clientHeight, k = hnK(), t = now();
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = `${W}px`; cv.style.height = `${H}px`; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.fillStyle = '#16120c'; g.fillRect(0, 0, W, H);
  let bg = HN_IMG.bg; if (!bg) { bg = HN_IMG.bg = new Image(); bg.src = `${HN}bg.webp`; }
  g.translate(-(s.vx || 0), 0); // сдвиг карты вбок; вверх-вниз — через vy в координатах
  if (bg.complete && bg.naturalWidth) g.drawImage(bg, 0, -s.vy, d.w * k, d.h * k);
  const items = []; // всё, что стоит на земле, — по глубине (y)
  for (const m of d.mobs) items.push({ y: m.y, draw: () => hnDrawMob(g, m, k, t) });
  const all = [{ ...d.me, me: true }, ...d.hunters];
  for (const h of all) { const p = hnHeroPos(h, d.mobs, t); items.push({ y: p.y, draw: () => hnDrawHero(g, h, p, k, t) }); }
  items.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
  // удары: летят заклинания и простой удар, всплывают цифры (у своего Генерала и у других — если видно последний удар)
  for (const h of all) if (h.last && !h.last.gone && t - h.last.at < 2600) hnDrawStrike(g, h, d.mobs, k, t);
}
function hnDrawMob(g, m, k, t) {
  const im = hnImg(`m_${m.el}${m.l}`), h = HN_MOB_H[m.l], cx = m.x * k, cy = m.y * k - S.hn.vy;
  const hitAge = hnHitAge(m.id, t), shake = hitAge < 400 ? Math.sin(hitAge / 25) * 4 : 0;
  g.save(); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(cx, cy, h * 0.42, h * 0.12, 0, 0, Math.PI * 2); g.fill(); g.restore();
  if (im) { const br = 1 + 0.025 * Math.sin(t / 500 + m.id), w = h * im.naturalWidth / im.naturalHeight; g.save(); g.translate(cx + shake, cy); g.scale(1, br);
    if (hitAge < 300) g.filter = 'brightness(1.8)'; g.drawImage(im, -w / 2, -h, w, h); g.restore(); }
  hnBarDraw(g, cx - 30, cy - h - 12, 60, m.hp / m.max, m.hp / m.max > 0.5 ? '#5bd14a' : m.hp / m.max > 0.2 ? '#f0c030' : '#e8402a');
  g.font = '700 11px Georgia, serif'; g.textAlign = 'center'; g.fillStyle = '#ffe9b0'; g.strokeStyle = '#000'; g.lineWidth = 3;
  const lv = ['', 'I', 'II', 'III'][m.l]; g.strokeText(lv, cx, cy - h - 18); g.fillText(lv, cx, cy - h - 18);
}
// сколько миллисекунд назад чудовище получило удар (от любого охотника) — вздрагивает и вспыхивает
function hnHitAge(id, t) { const d = S.hn.data; let a = 1e9; for (const h of [d.me, ...d.hunters]) if (h.last && h.last.mob === id && !h.last.gone) a = Math.min(a, t - h.last.at - 450); return a < 0 ? 1e9 : a; }
function hnDrawHero(g, h, p, k, t) {
  const race = h.race || 'humans', frame = p.strike !== undefined ? (p.strike < 700 ? 3 : 0) : p.walk ? 1 + (Math.floor(t / 170) % 2) : 0;
  const im = hnImg(`h_${race}${frame}`), x = p.x * k, y = p.y * k - S.hn.vy;
  g.save(); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y, 18, 6, 0, 0, Math.PI * 2); g.fill();
  if (h.me) { g.strokeStyle = '#ffd84a'; g.lineWidth = 2; g.shadowColor = '#ffd84a'; g.shadowBlur = 8; g.beginPath(); g.ellipse(x, y, 22, 8, 0, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  if (im) { const hh = HN_HERO_H * (frame === 3 ? im.naturalHeight / (hnImg(`h_${race}0`) || im).naturalHeight : 1), w = hh * im.naturalWidth / im.naturalHeight, bob = p.walk ? Math.abs(Math.sin(t / 170 * Math.PI)) * 2 : 0;
    g.save(); g.translate(x, y - bob); if ((p.face || -1) > 0) g.scale(-1, 1); g.drawImage(im, -w / 2, -hh, w, hh); g.restore(); }
  if (h.max) hnBarDraw(g, x - 20, y - HN_HERO_H - 10, 40, h.hp / h.max, '#5bd14a');
  g.font = '600 11px Georgia, serif'; g.textAlign = 'center'; g.fillStyle = h.me ? '#ffd84a' : '#f6e7c1'; g.strokeStyle = '#000'; g.lineWidth = 3;
  g.strokeText(h.login, x, y + 14); g.fillText(h.login, x, y + 14);
  if (h.march && p.walk && h.me) { const m = S.hn.data.mobs.find((q) => q.id === h.march.mob); if (m) { g.save(); g.setLineDash([6, 6]); g.strokeStyle = 'rgba(120,255,120,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(m.x * k, m.y * k - S.hn.vy); g.stroke(); g.restore(); } }
}
// удар: через 0,3 с после замаха от Генерала к чудовищу летят заклинания (шар цвета стихии), потом всплывают цифры урона
function hnDrawStrike(g, h, mobs, k, t) {
  const L = h.last, age = t - L.at, m = mobs.find((q) => q.id === L.mob) || (h.lastPos ? { x: h.lastPos.x - 46, y: h.lastPos.y - 8, l: L.l || 1 } : null); if (!m) return;
  const hx = (m.x + 46) * k, hy = (m.y + 8) * k - S.hn.vy - 30, mx = m.x * k, my = m.y * k - S.hn.vy - HN_MOB_H[m.l || 1] * 0.5;
  (L.hits || []).forEach((hit, i) => {
    const t0 = 250 + i * 160, f = (age - t0) / 300;
    if (f > 0 && f < 1) { const x = hx + (mx - hx) * f, y = hy + (my - hy) * f - Math.sin(f * Math.PI) * 30, col = HN_COL[hit.kind] || '#fff';
      const ic = hit.kind !== 'phys' ? hnImg(`s_${hit.kind}`) : null;
      g.save(); g.shadowColor = col; g.shadowBlur = 16; if (ic) g.drawImage(ic, x - 14, y - 14, 28, 28); else { g.fillStyle = col; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); } g.restore(); }
    const fa = age - t0 - 300; if (fa > 0 && fa < 1600) { const y = my - 10 - fa / 25 - i * 16; g.globalAlpha = Math.max(0, 1 - fa / 1600); g.font = '800 16px Georgia, serif'; g.textAlign = 'center';
      g.strokeStyle = '#000'; g.lineWidth = 4; g.fillStyle = hit.kind === 'phys' ? '#ff5a3a' : HN_COL[hit.kind]; const txt = `-${fmtFull(hit.dmg)}`; g.strokeText(txt, mx, y); g.fillText(txt, mx, y); g.globalAlpha = 1; }
  });
  const ga = age - 900; if (L.got && ga > 0 && ga < 1500) { g.globalAlpha = Math.max(0, 1 - ga / 1500); g.font = '800 14px Georgia, serif'; g.textAlign = 'center'; g.strokeStyle = '#000'; g.lineWidth = 4; g.fillStyle = '#ff3030';
    const y = hy - 34 - ga / 30; g.strokeText(`-${fmtFull(L.got)}`, hx, y); g.fillText(`-${fmtFull(L.got)}`, hx, y); g.globalAlpha = 1; }
  if (L.killed && age > 700 && age < 2600) { const f = (age - 700) / 1900; g.globalAlpha = 1 - f; ['c_' + (L.el || 'fire'), 'i_chest', 'i_scroll'].forEach((ic, i) => { const im = hnImg(ic); if (im) g.drawImage(im, mx - 50 + i * 36, my - 20 - f * 60, 30, 30); }); g.globalAlpha = 1; }
}

// окно чудовища: сила, защита от стихий, награды; до двух заклинаний; «Атаковать»
function huntMobWin() {
  const s = S.hn, d = s && s.data, m = d && d.mobs.find((x) => x.id === s.sel);
  if (!m) return `${ribbon('Чудовище')}<p class="parch-note">Чудовище уже пало — выберите другое.</p>`;
  const me = d.me, pct = (v) => `${Math.round(v * 100)}%`;
  const res = `<div class="hnres"><span class="hnphys">💥</span><span>Удар по Генералу: <b>${fmtFull(m.hit)}</b></span></div>
    <div class="hnres"><span class="hnphys">⚔</span><span>Защита от простого удара: <b>${pct(m.phys)}</b></span></div>
    ${HN_EL.map((e) => `<div class="hnres">${hnIco(HN_RES_IC[e], 'hnri')}<span>${esc(d.el[e])}: защита <b class="${m.res[e] === 0 ? 'good' : m.res[e] >= 0.9 ? 'bad' : ''}">${pct(m.res[e])}</b></span></div>`).join('')}`;
  const sp = s.spells, cost = {}; for (const x of sp) { const q = d.spells.find((y) => y.el === x.el && y.l === x.l); cost[x.el] = (cost[x.el] || 0) + q.cost; }
  const slot = (i) => { const x = sp[i]; const q = x && d.spells.find((y) => y.el === x.el && y.l === x.l);
    return `<button class="hnslot" data-hnslot="${i}">${q ? `${hnIco(`s_${q.el}`, 'hnsi')}<small>${esc(q.name)}</small>` : '<small>пусто</small>'}</button>`; };
  const grid = HN_EL.map((e) => `<div class="hnsrow">${hnIco(`s_${e}`, 'hnsi')}${[1, 2, 3].map((l) => { const q = d.spells.find((y) => y.el === e && y.l === l), on = sp.some((x) => x.el === e && x.l === l);
    return `<button class="hnsp ${on ? 'on' : ''}" data-hnsp="${e},${l}" ${!on && sp.length >= 2 ? 'disabled' : ''}><b>${['', 'I', 'II', 'III'][l]}</b><small>${fmtFull(q.dmg[0])}–${fmtFull(q.dmg[1])}</small><small>${hnIco(HN_RES_IC[e], 'hnci')}${q.cost}</small></button>`; }).join('')}</div>`).join('');
  const lack = Object.entries(cost).find(([el, n]) => (d.crystals[el] || 0) < n);
  const busy = me.march, weak = me.hp < m.hit;
  return `${ribbon(m.name)}<div class="hnmob"><img src="${HN}m_${m.el}${m.l}.png" alt=""><div class="grow">${res}</div></div>
    <div class="hnhpbar big"><i style="width:${Math.round(m.hp / m.max * 100)}%"></i><b>${fmtFull(m.hp)} / ${fmtFull(m.max)}</b></div>
    ${m.mine ? `<p class="small center">Ваш урон по нему: <b>${fmtFull(m.mine)}</b></p>` : ''}
    <div class="ribbon rband"><span>Возможные награды за бой</span></div>
    <div class="hnrew">${hnIco(`c_${m.el}`)}${hnIco('i_chest')}${m.l === 3 ? hnIco('i_scroll') : ''}<small>Кристаллы, ресурсы в замок, опыт Генералу${m.l === 3 ? ', иногда руна' : ''} — по доле вашего урона</small></div>
    <div class="ribbon rband"><span>Боевые заклинания</span></div>
    <p class="small muted">Перед атакой снарядите Генерала силами стихий — до двух заклинаний. Против стихии, от которой у чудовища нет защиты, заклинание бьёт в полную силу.</p>
    <div class="hnslots">${slot(0)}${slot(1)}</div><div class="hnspells">${grid}</div>
    <p class="small center">Простой удар Генерала: <b>${fmtFull(me.atk)}</b>${Object.keys(cost).length ? ` · стоимость: ${Object.entries(cost).map(([el, n]) => `${hnIco(HN_RES_IC[el], 'hnci')}${n}`).join(' ')}` : ''}</p>
    ${!me.general ? '<p class="parch-note">Охотится Генерал — наймите его в Военном штабе.</p>'
      : busy ? '<p class="parch-note">Генерал уже в походе.</p>'
      : weak ? `<p class="parch-note">Запас жизни Генерала слишком мал, чтобы сразиться с этим чудовищем.</p><button class="btn primary" data-hnheal>Вылечить за ${d.healCost} 🪙</button>`
      : `<button class="btn primary" data-hngo ${lack ? 'disabled' : ''}>⚔ Атаковать</button>${lack ? `<p class="small bad center">Не хватает кристаллов: ${esc(d.el[lack[0]])}</p>` : ''}`}`;
}
const huntHelpWin = () => `${ribbon('Зона охоты')}<div class="card small">
  <p>Здесь бродят чудовища четырёх стихий — огня, воды, воздуха и земли — трёх уровней. Нажмите на чудовище, выберите заклинания и «Атаковать»: Генерал пойдёт к нему и ударит.</p>
  <p>Здоровье чудовища общее: его бьют все охотники. Когда оно падёт, награду делят по доле урона: кристаллы стихий, ресурсы в замок, опыт Генералу, иногда руны.</p>
  <p>Заклинания стоят кристаллов своей стихии. У каждого чудовища своя защита: своей стихии оно почти не боится, а противоположной — беззащитно (огонь ↔ вода, воздух ↔ земля).</p>
  <p>Чудовище отвечает ударом — у Генерала убывает здоровье охотника. Оно восстанавливается само за 2 часа, сразу — за монеты.</p></div>`;

$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-huntopen],[data-hnexit],[data-hnheal],[data-hnspeed],[data-hnhelp],[data-hnsp],[data-hnslot],[data-hngo]'); if (!t) return;
  const d = t.dataset, s = S.hn;
  if (d.huntopen !== undefined) return openHunt();
  if (!s) return;
  if (d.hnexit !== undefined) { closeSheet(); return; }
  if (d.hnhelp !== undefined) return openSheet(huntHelpWin);
  if (d.hnheal !== undefined) return send({ t: 'hunt', op: 'heal' });
  if (d.hnspeed !== undefined) return send({ t: 'hunt', op: 'speed' });
  if (d.hnsp) { const [el, l] = d.hnsp.split(','), i = s.spells.findIndex((x) => x.el === el && x.l === Number(l)); if (i >= 0) s.spells.splice(i, 1); else if (s.spells.length < 2) s.spells.push({ el, l: Number(l) }); return refreshSheet(); }
  if (d.hnslot !== undefined) { s.spells.splice(Number(d.hnslot), 1); return refreshSheet(); }
  if (d.hngo !== undefined) { send({ t: 'hunt', op: 'go', mob: s.sel, spells: s.spells }); s.spells = []; closeSheet(); }
});
// окно Алтаря: Зона охоты (Умения и Соревнования — следующим шагом)
function altarHtml() {
  return `<button class="rbar" data-huntopen><img src="${HN}m_fire2.png" alt=""> Зона охоты</button>
    <button class="rbar" disabled><img src="${HN}s_air.png" alt=""> Умения <small>· скоро</small></button>
    <button class="rbar" disabled><img src="${HN}i_chest.png" alt=""> Соревнования <small>· скоро</small></button>`;
}
