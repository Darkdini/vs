'use strict';
// «Живые земли»: участки 7×7 разделены тропинками (как в замке), по тропинкам гуляют жители — останавливаются и смотрят на участки;
// на стройках и у лесопилок стучат строители, из труб идёт дым, у края крутится мельница, над огородами порхают бабочки,
// в озере плещется рыба, в небе пролетают птицы. Фигурки — кадры 3D-моделей клиента (gfx/anim/*.png).
// Координаты: участок (x, y) стоит в точке (x·SP, y·SP) изометрической сетки; тропинки — между участками.
const LIFE = { walkers: [], last: 0, fish: null, birds: [] };
const AN = { K: 4, CW: 56, CH: 88, FX: 28, FY: 76, KM: 6, MW: 276, MH: 384, MX: 138, MY: 300 };
const SP = 1.32;                       // шаг участков (1 — вплотную), промежуток — тропинка
const LIFE_N = 6, WALK_SPEED = 0.7;    // жителей; клеток сетки в секунду
const DIR_ROW = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 0 : 2) : (dy < 0 ? 1 : 3)); // −x, −y, +x, +y → строка листа
const HOUSES = new Set([6, 31, 36]), FARMS = new Set([5, 30, 35]), SAWS = new Set([7, 27, 32]);
const MILL_S = 1.7, MAN_S = 1.3;
const inLands = (x, y) => x >= 0 && y >= 0 && x < LN() && y < LN();
const isWater = (x, y) => inLands(x, y) && S.cat.lands.base[y][x] === 9;
// экран: участок / точка сетки
const plotXY = (x, y) => { const p = tileScreen(x * SP, y * SP); return { sx: p.sx, sy: p.sy, cx: p.sx + TW / 2, cy: p.sy + TH / 2 }; };
const ptXY = (fx, fy) => { const p = tileScreen(fx, fy); return { cx: p.sx + TW / 2, cy: p.sy + TH / 2 }; };
const MILL_AT = () => [-1.25 * SP, (LN() - 2.4) * SP]; // мельница за левым нижним краем

// ---------- тропинки: узлы — перекрёстки между участками ----------
// узел (i, j), i,j = 0..N, стоит в точке ((i−½)·SP, (j−½)·SP); ребро есть, если рядом с ним сухой участок
const nodePos = (i, j) => [(i - 0.5) * SP, (j - 0.5) * SP];
function edgeOk(i, j, i2, j2) {
  const N = LN(); if (i2 < 0 || j2 < 0 || i2 > N || j2 > N) return false;
  const sides = i === i2 ? [[i - 1, Math.min(j, j2)], [i, Math.min(j, j2)]] : [[Math.min(i, i2), j - 1], [Math.min(i, i2), j]];
  return sides.some(([x, y]) => inLands(x, y) && !isWater(x, y));
}
const nodeNext = (i, j) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [i + a, j + b]).filter(([a, b]) => edgeOk(i, j, a, b));
const isPlaza = (x, y) => inLands(x, y) && S.cat.landOptions && !(S.cat.landOptions[y][x] || []).length;
function plazaAt() { const N = LN(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isPlaza(x, y)) return [x, y]; return null; }
const facing = (dx, dy) => DIR_ROW(dx, dy);
function lifeSpawn() {
  const N = LN(), nodes = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) if (nodeNext(i, j).length) nodes.push([i, j]);
  LIFE.walkers = Array.from({ length: LIFE_N }, (_, k) => { const [i, j] = nodes[Math.floor(Math.random() * nodes.length)] || [0, 0];
    const [fx, fy] = nodePos(i, j); return { node: [i, j], prev: null, ax: fx, ay: fy, bx: fx, by: fy, fx, fy, t: 1, skin: k % 4, frame: 0, wait: Math.random() * 2, look: 3, plaza: 0 }; });
  // на площади у фонтана — стоят и болтают
  const pz = plazaAt(); LIFE.loiter = [];
  if (pz) for (let k = 0; k < 3; k++) { const ang = k * 2.1 + 0.6, cx = pz[0] * SP + Math.cos(ang) * 0.62, cy = pz[1] * SP + Math.sin(ang) * 0.62;
    LIFE.loiter.push({ fx: cx, fy: cy, skin: (k + 1) % 4, look: facing(pz[0] * SP - cx, pz[1] * SP - cy), base: facing(pz[0] * SP - cx, pz[1] * SP - cy), turn: 2 + Math.random() * 4 }); }
  LIFE.pigeons = pz ? Array.from({ length: 5 }, () => ({ fx: pz[0] * SP + (Math.random() - 0.5) * 1.1, fy: pz[1] * SP + (Math.random() - 0.5) * 1.1, hop: Math.random() * 3, peck: Math.random() * 6.28 })) : [];
}
// идти от текущей точки к (bx, by)
const goTo = (w, bx, by) => { w.ax = w.fx; w.ay = w.fy; w.bx = bx; w.by = by; w.t = 0; w.look = facing(bx - w.ax, by - w.ay); };
function lifeStep(dt) {
  if (!LIFE.walkers.length) lifeSpawn();
  const pz = plazaAt();
  for (const w of LIFE.walkers) {
    if (w.wait > 0) { w.wait -= dt; continue; }
    if (w.t >= 1) {
      if (w.plaza === 1) { w.plaza = 2; w.look = facing(pz[0] * SP - w.fx, pz[1] * SP - w.fy); w.wait = 3 + Math.random() * 5; w.frame = 0; continue; } // у фонтана: постоять, полюбоваться
      if (w.plaza === 2) { // уйти с площади к случайному углу
        const corners = [[pz[0], pz[1]], [pz[0] + 1, pz[1]], [pz[0], pz[1] + 1], [pz[0] + 1, pz[1] + 1]], cn = corners[Math.floor(Math.random() * 4)];
        w.plaza = 3; w.node = cn; const [nx, ny] = nodePos(cn[0], cn[1]); goTo(w, nx, ny); continue;
      }
      w.plaza = 0;
      const [i, j] = w.node;
      // с угла площади — иногда зайти к фонтану
      if (pz && (i === pz[0] || i === pz[0] + 1) && (j === pz[1] || j === pz[1] + 1) && Math.random() < 0.45) {
        const ang = Math.random() * Math.PI * 2; w.plaza = 1; goTo(w, pz[0] * SP + Math.cos(ang) * 0.75, pz[1] * SP + Math.sin(ang) * 0.75); continue;
      }
      if (Math.random() < 0.2) { w.look = Math.floor(Math.random() * 4); w.wait = 1.2 + Math.random() * 2.5; w.frame = 0; continue; } // постоять, посмотреть на участки
      let nb = nodeNext(i, j); if (nb.length > 1 && w.prev) nb = nb.filter(([a, b]) => a !== w.prev[0] || b !== w.prev[1]);
      if (!nb.length) { w.wait = 1; continue; }
      const [a, b] = nb[Math.floor(Math.random() * nb.length)];
      w.prev = [i, j]; w.node = [a, b]; const [nx, ny] = nodePos(a, b); goTo(w, nx, ny);
    }
    const len = Math.hypot(w.bx - w.ax, w.by - w.ay) || 1;
    w.t = Math.min(1, w.t + dt * WALK_SPEED / len); w.frame = (w.frame + dt * 9) % 8;
    w.fx = w.ax + (w.bx - w.ax) * w.t; w.fy = w.ay + (w.by - w.ay) * w.t;
  }
  for (const l of LIFE.loiter || []) { l.turn -= dt; if (l.turn < 0) { l.turn = 2 + Math.random() * 5; l.look = Math.random() < 0.5 ? l.base : Math.floor(Math.random() * 4); } }
  for (const g of LIFE.pigeons || []) { g.hop -= dt; g.peck += dt * 6; if (g.hop < 0) { g.hop = 1 + Math.random() * 3; const ang = Math.random() * 6.28; g.tx = g.fx + Math.cos(ang) * 0.18; g.ty = g.fy + Math.sin(ang) * 0.18; if (Math.hypot(g.tx - pz[0] * SP, g.ty - pz[1] * SP) > 0.6 && Math.hypot(g.tx - pz[0] * SP, g.ty - pz[1] * SP) < 0.95) { g.fx = g.tx; g.fy = g.ty; } } }
  if (LIFE.fish) { LIFE.fish.t += dt; if (LIFE.fish.t > 1.6) LIFE.fish = null; }
  else if (Math.random() < dt / 4) {
    const N = LN(), water = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isWater(x, y) && S.st.castle.grid[1][y * N + x] < 0) water.push([x, y]);
    if (water.length) LIFE.fish = { c: water[Math.floor(Math.random() * water.length)], t: 0, dx: Math.random() < 0.5 ? -1 : 1 };
  }
  LIFE.birds = LIFE.birds.filter((b) => b.t < b.dur);
  for (const b of LIFE.birds) b.t += dt;
  if (!LIFE.birds.length && Math.random() < dt / 25) LIFE.birds.push({ t: 0, dur: 14, y0: Math.random() * 0.6, dir: Math.random() < 0.5 ? 1 : -1, n: 3 + Math.floor(Math.random() * 4) });
}
const lifeSheet = (name) => pic(`anim/${name}.png`);
function lifePerson(sheet, row, f, fx, fy, cols) {
  const im = lifeSheet(sheet); if (!im) return;
  const { cx, cy } = ptXY(fx, fy), k = AN.K / MAN_S, x = ictx, sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true;
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(cx, cy, 5, 2.2, 0, 0, Math.PI * 2); x.fill();
  x.drawImage(im, (Math.floor(f) % cols) * AN.CW, row * AN.CH, AN.CW, AN.CH, cx - AN.FX / k, cy - AN.FY / k, AN.CW / k, AN.CH / k);
  x.imageSmoothingEnabled = sm;
}
// украшения участка: дым из трубы, бабочки над огородом
function plotFx(x, y, b, cell, now) {
  const P = plotXY(x, y), c = ictx;
  if (HOUSES.has(b)) {
    const im = pic(`build/${BUILD_IMG[b]}.png`); if (!im) return;
    const top = P.sy - (im.height - TH);
    for (let i = 0; i < 4; i++) {
      const ph = ((now / 2600) + i / 4 + cell * 0.13) % 1, r = 2 + ph * 6;
      c.fillStyle = `rgba(235,235,235,${0.45 * (1 - ph)})`; c.beginPath(); c.arc(P.cx + 6 + Math.sin(ph * 5 + cell) * 3 + ph * 6, top + 6 - ph * 22, r, 0, Math.PI * 2); c.fill();
    }
  }
  if (FARMS.has(b)) for (let i = 0; i < 2; i++) {
    const t = now / 1000 + cell * 1.7 + i * 2.3, bx = P.cx + Math.sin(t * 0.7) * 16, by = P.cy - 10 + Math.cos(t * 1.1) * 6, flap = Math.abs(Math.sin(t * 14)) * 2.2 + 0.4;
    c.fillStyle = i ? '#ffe14d' : '#ffffff';
    c.beginPath(); c.ellipse(bx - flap * 0.6, by, flap, 1.6, 0, 0, Math.PI * 2); c.ellipse(bx + flap * 0.6, by, flap, 1.6, 0, 0, Math.PI * 2); c.fill();
  }
}
function lifeMill(now) {
  const im = lifeSheet('mill'); if (!im) return;
  const [mx, my] = MILL_AT(), { cx, cy } = ptXY(mx, my), k = AN.KM / MILL_S, f = Math.floor(now / 140) % 12, x = ictx, sm = x.imageSmoothingEnabled;
  x.imageSmoothingEnabled = true; x.drawImage(im, f * AN.MW, 0, AN.MW, AN.MH, cx - AN.MX / k, cy - AN.MY / k, AN.MW / k, AN.MH / k); x.imageSmoothingEnabled = sm;
}
function lifeFish() {
  const F = LIFE.fish; if (!F) return;
  const { cx, cy } = plotXY(F.c[0], F.c[1]), x = ictx, t = Math.min(1, F.t / 0.9);
  if (F.t < 0.9) {
    x.save(); x.translate(cx + F.dx * (t - 0.5) * 14, cy - Math.sin(t * Math.PI) * 12); x.rotate(F.dx * (t - 0.5) * 2.2); x.fillStyle = '#c9d6e3';
    x.beginPath(); x.ellipse(0, 0, 4, 1.6, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(-F.dx * 4, 0); x.lineTo(-F.dx * 6.5, -2); x.lineTo(-F.dx * 6.5, 2); x.fill(); x.restore();
  }
  for (const s of [0, 0.9]) { const q = (F.t - s) / 0.7; if (q < 0 || q > 1) continue;
    x.strokeStyle = `rgba(255,255,255,${0.7 * (1 - q)})`; x.lineWidth = 1; x.beginPath(); x.ellipse(cx + F.dx * (s ? 7 : -7), cy, 2 + q * 8, 1 + q * 4, 0, 0, Math.PI * 2); x.stroke(); }
}
function lifeBirds(dpr) {
  if (!LIFE.birds.length) return;
  const x = ictx, W = Iso.cv.width / dpr, H = Iso.cv.height / dpr;
  x.save(); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.strokeStyle = 'rgba(30,30,30,0.75)'; x.lineWidth = 1.4;
  for (const b of LIFE.birds) {
    const q = b.t / b.dur, bx0 = b.dir > 0 ? -40 + q * (W + 80) : W + 40 - q * (W + 80);
    for (let i = 0; i < b.n; i++) {
      const bx = bx0 - b.dir * (i % 2 ? i * 9 : i * 7), by = H * b.y0 + 40 + (i % 2 ? i * 6 : -i * 3) + Math.sin(b.t * 2 + i) * 3, fl = Math.sin(b.t * 9 + i * 1.3) * 3;
      x.beginPath(); x.moveTo(bx - 5, by - fl); x.quadraticCurveTo(bx - 2, by - 2, bx, by); x.quadraticCurveTo(bx + 2, by - 2, bx + 5, by - fl); x.stroke();
    }
  }
  x.restore();
}

// фонтан: кадры 3D-модели + брызги
const FT = { W: 336, H: 312, OX: 168, OY: 230.88, K: 6 };
function lifeFountain(P, now) {
  const im = lifeSheet('fountain'), x = ictx; if (!im) return;
  const k = FT.K / 1.25, f = Math.floor(now / 160) % 4, sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true;
  x.drawImage(im, f * FT.W, 0, FT.W, FT.H, P.cx - FT.OX / k, P.cy - FT.OY / k, FT.W / k, FT.H / k); x.imageSmoothingEnabled = sm;
  for (let i = 0; i < 14; i++) { // капли: вверх из центра и вниз по дуге в чашу
    const ph = ((now / 1100) + i / 14) % 1, ang = i * 2.4, r = ph * 13, h = Math.sin(ph * Math.PI) * 20;
    x.fillStyle = `rgba(210,240,255,${0.85 * (1 - ph)})`; x.beginPath(); x.arc(P.cx + Math.cos(ang) * r, P.cy - 22 - h + ph * 14 + Math.sin(ang) * r * 0.5, 1.3, 0, Math.PI * 2); x.fill();
  }
}
function plazaFlowers(P) {
  const x = ictx, cols = ['#e53935', '#fdd835', '#ffffff', '#ab47bc'];
  for (const [dx, dy] of [[-0.62, 0], [0.62, 0], [0, -0.62], [0, 0.62]]) {
    const q = { cx: P.cx + dx * TW * SP / 2 * 0.8, cy: P.cy + dy * TH * SP / 2 * 0.8 };
    x.fillStyle = '#5d4037'; x.beginPath(); x.ellipse(q.cx, q.cy, 7, 3.5, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2e7d32'; x.beginPath(); x.ellipse(q.cx, q.cy - 1, 6, 3, 0, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 6; i++) { x.fillStyle = cols[(i + Math.round(dx * 3 + dy * 7)) & 3]; x.beginPath(); x.arc(q.cx + Math.cos(i * 1.1) * 4, q.cy - 1.5 + Math.sin(i * 1.1) * 1.8, 1.1, 0, Math.PI * 2); x.fill(); }
  }
}
function lifePigeon(g) {
  const { cx, cy } = ptXY(g.fx, g.fy), x = ictx, pk = Math.max(0, Math.sin(g.peck)) * 1.5;
  x.fillStyle = 'rgba(0,0,0,0.2)'; x.beginPath(); x.ellipse(cx, cy, 2.4, 1, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#8d9aa6'; x.beginPath(); x.ellipse(cx, cy - 2, 2.6, 1.6, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5f6b75'; x.beginPath(); x.arc(cx + 2, cy - 3.2 + pk, 1.1, 0, Math.PI * 2); x.fill();
}

// ---------- вся сцена земель ----------
function landsScene(c, dpr) {
  const N = LN(), L = S.cat.lands, st = S.st.castle, now = Date.now(), x = ictx;
  const dt = Math.min(0.25, (now - (LIFE.last || now)) / 1000); LIFE.last = now;
  if (flowOn()) lifeStep(dt);
  if (flowOn() && !flowTimer) flowTimer = setTimeout(flowTick, ANIM_MS);
  const at = (P, k) => ({ sx: P.cx - TW / 2, sy: P.cy - TH / 2 });
  const sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true;
  // 1) озеро — сплошная вода (участки воды растянуты на шаг, без тропинок между ними)
  for (let y = 0; y < N; y++) for (let xx = N - 1; xx >= 0; xx--) if (isWater(xx, y)) plotImage('ground/water.png', at(plotXY(xx, y)), SP * 1.02);
  // 2) тропинки: кольцо вокруг каждого сухого участка; соседние кольца сходятся в дорожку с камушками
  for (let y = 0; y < N; y++) for (let xx = N - 1; xx >= 0; xx--) if (!isWater(xx, y)) { const P = plotXY(xx, y); pathTile(P.cx - TW * SP / 2, P.cy - TH * SP / 2, SP); }
  // площадь: брусчатка на весь шаг, клумбы по углам
  { const pz = plazaAt(); if (pz) { const P = plotXY(pz[0], pz[1]); plotImage('ground/stone.png', at(P), SP * 1.0); plazaFlowers(P); } }
  // 3) сам участок: пашня, камень или трава
  for (let y = 0; y < N; y++) for (let xx = N - 1; xx >= 0; xx--) if (!isWater(xx, y) && !isPlaza(xx, y)) {
    const g = `ground/${GROUND[L.base[y][xx]]}.png`;
    plotImage(GRASSY(g) ? 'ground/grass1.png' : g, at(plotXY(xx, y)), 1.04);
  }
  x.imageSmoothingEnabled = sm;
  if (Iso.sel && Iso.sel.tab === 'lands') glow(at(plotXY(Iso.sel.x, Iso.sel.y)), 1.04);
  // 4) объекты по глубине (ниже на экране — рисуется позже): здания, украшения, жители, строители, мельница
  const items = [];
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const cell = y * N + xx, b = st.grid[1][cell], d = L.decor[y][xx], P = plotXY(xx, y);
    if (isPlaza(xx, y)) continue;
    items.push([P.cy, () => {
      if (b < 0 && !queueAt(1, cell) && d >= 0) sprite(`ground/${DECOR[d]}.png`, P.sx, P.sy, d === 1 ? 3 : d === 2 ? -2 : 0);
      else drawCellBuilding(1, cell, b, st.levels[1][cell], { sx: P.sx, sy: P.sy }, 1, isSel(xx, y));
      plotFx(xx, y, b, cell, now);
    }]);
    // строитель: на стройке и у лесопилки — на тропинке перед участком, лицом к нему
    if (queueAt(1, cell) || SAWS.has(b)) { const fx = (xx - 0.5) * SP, fy = y * SP + 0.1; items.push([ptXY(fx, fy).cy + 0.1, () => lifePerson('builder', 2, (now / 110 + cell * 3) % 7, fx, fy, 7)]); }
  }
  for (const w of LIFE.walkers) items.push([ptXY(w.fx, w.fy).cy, () => lifePerson(`villager${w.skin}`, w.look, w.wait > 0 ? 0 : w.frame, w.fx, w.fy, 8)]);
  for (const l of LIFE.loiter || []) items.push([ptXY(l.fx, l.fy).cy, () => lifePerson(`villager${l.skin}`, l.look, 0, l.fx, l.fy, 8)]);
  for (const g of LIFE.pigeons || []) items.push([ptXY(g.fx, g.fy).cy, () => lifePigeon(g)]);
  { const pz = plazaAt(); if (pz) { const P = plotXY(pz[0], pz[1]); items.push([P.cy, () => lifeFountain(P, now)]); } }
  { const [mx, my] = MILL_AT(); items.push([ptXY(mx, my).cy, () => lifeMill(now)]); }
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
  lifeFish(); lifeBirds(dpr);
}

// ================= земли на нарисованном фоне (gfx/lands/bg.jpg + LANDS_LAYOUT) =================
// Мир = пиксели картинки. В центре картинки — пустой луг-ромб (LANDS_LAYOUT.quad: левый, верхний, правый, нижний углы),
// на него ложится сетка участков N×N: между участками — тропинки с камушками, в центре — площадь с фонтаном.
// Точка сетки (gx, gy), 0..N: gx → к верхнему углу, gy → к нижнему (как tileScreen).
const BK_G = 1.75;                 // масштаб построек
const LP = { walkers: [], last: 0, fish: null, adj: null, loiter: [], pigeons: [], geo: null };
const hasPic = () => typeof LANDS_LAYOUT !== 'undefined';
const scrToDir = (dx, dy) => DIR_ROW(dx / TW - dy / TH, dx / TW + dy / TH);
function gp(gx, gy) { // точка сетки → пиксель картинки (билинейно по углам ромба, с отступом от края луга)
  const N = LN(), [Lc, Tc, Rc, Bc] = LANDS_LAYOUT.quad, m = 0.035, u = m + (1 - 2 * m) * gx / N, v = m + (1 - 2 * m) * gy / N;
  return [Lc[0] * (1 - u) * (1 - v) + Tc[0] * u * (1 - v) + Rc[0] * u * v + Bc[0] * (1 - u) * v, Lc[1] * (1 - u) * (1 - v) + Tc[1] * u * (1 - v) + Rc[1] * u * v + Bc[1] * (1 - u) * v];
}
function lpGeo() {
  if (LP.geo) return LP.geo;
  const N = LN(), nodes = [], idx = (i, j) => j * (N + 1) + i, edges = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) nodes.push(gp(i, j));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { if (i < N) edges.push([idx(i, j), idx(i + 1, j)]); if (j < N) edges.push([idx(i, j), idx(i, j + 1)]); }
  let pc = -1; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!(S.cat.landOptions[y][x] || []).length) pc = y * N + x;
  const px = pc % N, py = Math.floor(pc / N), plazaNodes = pc < 0 ? [] : [idx(px, py), idx(px + 1, py), idx(px, py + 1), idx(px + 1, py + 1)];
  return (LP.geo = { nodes, edges, plazaNodes, plaza: pc < 0 ? gp(N / 2, N / 2) : gp(px + 0.5, py + 0.5), pc });
}
function lpGraph() {
  if (LP.adj) return LP.adj;
  const G = lpGeo(), adj = G.nodes.map(() => []);
  for (const [a, b] of G.edges) { adj[a].push({ to: b, poly: [G.nodes[a], G.nodes[b]] }); adj[b].push({ to: a, poly: [G.nodes[b], G.nodes[a]] }); }
  return (LP.adj = adj);
}
function lpSpawn() {
  const G = lpGeo(), n0 = G.nodes.length;
  LP.walkers = Array.from({ length: 9 }, (_, k) => { const n = Math.floor(Math.random() * n0), [x, y] = G.nodes[n];
    return { n, prev: -1, x, y, poly: null, seg: 0, d: 0, skin: k % 4, frame: 0, wait: Math.random() * 3, look: 3, mode: 0 }; });
  const [px, py] = G.plaza;
  LP.loiter = [0, 1, 2].map((k) => { const a = k * 2.1 + 0.5, x = px + Math.cos(a) * 34, y = py + 6 + Math.sin(a) * 19; return { x, y, skin: (k + 1) % 4, base: scrToDir(px - x, py - y), look: scrToDir(px - x, py - y), turn: 2 + Math.random() * 4 }; });
  LP.pigeons = Array.from({ length: 5 }, () => { const a = Math.random() * 6.28, r = 30 + Math.random() * 12; return { x: px + Math.cos(a) * r, y: py + 6 + Math.sin(a) * r * 0.55, peck: Math.random() * 6, hop: Math.random() * 3 }; });
}
function lpStep(dt) {
  const L = LANDS_LAYOUT, G = lpGeo(), adj = lpGraph(), [px, py] = G.plaza;
  if (!LP.walkers.length) lpSpawn();
  for (const w of LP.walkers) {
    if (w.wait > 0) { w.wait -= dt; continue; }
    if (!w.poly) {
      if (w.mode === 1) { w.mode = 2; w.look = scrToDir(px - w.x, py - w.y); w.wait = 3 + Math.random() * 5; continue; } // у фонтана постоять
      if (w.mode === 2) { w.mode = 0; const [nx, ny] = G.nodes[w.n]; w.poly = [[w.x, w.y], [nx, ny]]; w.seg = 0; w.d = 0; w.nextN = w.n; continue; }
      if (G.plazaNodes.includes(w.n) && Math.random() < 0.4) { const a = Math.random() * 6.28; w.mode = 1; w.poly = [[w.x, w.y], [px + Math.cos(a) * 40, py + 5 + Math.sin(a) * 22]]; w.seg = 0; w.d = 0; w.nextN = w.n; continue; }
      if (Math.random() < 0.2) { w.look = Math.floor(Math.random() * 4); w.wait = 1.5 + Math.random() * 3; w.frame = 0; continue; } // постоять, посмотреть на участки
      let opts = adj[w.n]; if (opts.length > 1) opts = opts.filter((e) => e.to !== w.prev);
      const e = opts[Math.floor(Math.random() * opts.length)]; if (!e) { w.wait = 2; continue; }
      w.poly = e.poly; w.seg = 0; w.d = 0; w.nextN = e.to;
    }
    let move = dt * 24;
    while (move > 0 && w.poly) {
      const a = w.poly[w.seg], b = w.poly[w.seg + 1]; if (!b) { w.prev = w.n; w.n = w.nextN; w.poly = null; break; }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.01, left = len - w.d;
      if (move < left) { w.d += move; move = 0; } else { move -= left; w.seg++; w.d = 0; }
      const q = w.poly[w.seg], r = w.poly[w.seg + 1] || q, t = r === q ? 0 : w.d / (Math.hypot(r[0] - q[0], r[1] - q[1]) || 1);
      w.x = q[0] + (r[0] - q[0]) * t; w.y = q[1] + (r[1] - q[1]) * t; if (r !== q) w.look = scrToDir(r[0] - q[0], r[1] - q[1]);
    }
    w.frame = (w.frame + dt * 9) % 8;
  }
  for (const l of LP.loiter) { l.turn -= dt; if (l.turn < 0) { l.turn = 2 + Math.random() * 5; l.look = Math.random() < 0.6 ? l.base : Math.floor(Math.random() * 4); } }
  for (const g of LP.pigeons) { g.peck += dt * 6; g.hop -= dt; if (g.hop < 0) { g.hop = 1 + Math.random() * 3; const nx = g.x + (Math.random() - 0.5) * 6, ny = g.y + (Math.random() - 0.5) * 4, d = Math.hypot((nx - px) / 1, (ny - py - 6) / 0.55); if (d > 26 && d < 46) { g.x = nx; g.y = ny; } } }
  if (LP.fish) { LP.fish.t += dt; if (LP.fish.t > 1.6) LP.fish = null; } else if (Math.random() < dt / 3) { const p = L.lake[Math.floor(Math.random() * L.lake.length)]; LP.fish = { x: p[0], y: p[1], t: 0, dx: Math.random() < 0.5 ? -1 : 1 }; }
  LIFE.birds = LIFE.birds.filter((b) => b.t < b.dur); for (const b of LIFE.birds) b.t += dt;
  if (!LIFE.birds.length && Math.random() < dt / 25) LIFE.birds.push({ t: 0, dur: 14, y0: Math.random() * 0.6, dir: Math.random() < 0.5 ? 1 : -1, n: 3 + Math.floor(Math.random() * 4) });
}
function lpPerson(sheet, row, f, x, y, cols) {
  const im = lifeSheet(sheet); if (!im) return;
  const k = AN.K / MAN_S, c = ictx; c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x, y, 5, 2.2, 0, 0, Math.PI * 2); c.fill();
  c.drawImage(im, (Math.floor(f) % cols) * AN.CW, row * AN.CH, AN.CW, AN.CH, x - AN.FX / k, y - AN.FY / k, AN.CW / k, AN.CH / k);
}
// тропинки по линиям сетки: земляная полоса с тёмной кромкой и белыми камушками по краям (один раз в кэш-холст)
function lpPaths() {
  if (LP.pathCv) return LP.pathCv;
  const L = LANDS_LAYOUT, G = lpGeo(), K = 2, cv = document.createElement('canvas'); cv.width = L.w * K; cv.height = L.h * K;
  const c = cv.getContext('2d'); c.scale(K, K); c.lineCap = 'round'; c.lineJoin = 'round';
  const seg = (w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (const [a, b] of G.edges) { c.moveTo(...G.nodes[a]); c.lineTo(...G.nodes[b]); } c.stroke(); };
  seg(17, 'rgba(90,60,30,0.55)'); seg(14, '#b58a54'); seg(8, '#c79d63');
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4000; i++) { const [a, b] = G.edges[Math.floor(rnd() * G.edges.length)], t = rnd(), [x0, y0] = G.nodes[a], [x1, y1] = G.nodes[b]; c.fillStyle = rnd() < 0.5 ? 'rgba(120,85,45,0.6)' : 'rgba(225,195,140,0.6)'; c.fillRect(x0 + (x1 - x0) * t + (rnd() - 0.5) * 9, y0 + (y1 - y0) * t + (rnd() - 0.5) * 6, 1.4, 1); }
  for (const [a, b] of G.edges) { // камушки по обеим сторонам
    const [x0, y0] = G.nodes[a], [x1, y1] = G.nodes[b], len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len, n = Math.floor(len / 7);
    for (let i = 1; i < n; i++) for (const sd of [-1, 1]) { const t = (i + (rnd() - 0.5) * 0.5) / n, x = x0 + (x1 - x0) * t + nx * 7.5 * sd, y = y0 + (y1 - y0) * t + ny * 7.5 * sd * 0.6, r = 1.6 + rnd();
      c.fillStyle = 'rgba(70,55,35,0.6)'; c.beginPath(); c.ellipse(x + 0.5, y + 0.9, r, r * 0.65, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = rnd() < 0.5 ? '#ece0c2' : '#d6c6a4'; c.beginPath(); c.ellipse(x, y, r, r * 0.65, 0, 0, Math.PI * 2); c.fill(); }
  }
  // площадь: брусчатка и клумбы
  if (G.pc >= 0) { const [px, py] = G.plaza, N = LN(), q = [gp(G.pc % N + 0.12, Math.floor(G.pc / N) + 0.12), gp(G.pc % N + 0.88, Math.floor(G.pc / N) + 0.12), gp(G.pc % N + 0.88, Math.floor(G.pc / N) + 0.88), gp(G.pc % N + 0.12, Math.floor(G.pc / N) + 0.88)];
    c.fillStyle = '#9d9488'; c.beginPath(); c.moveTo(...q[0]); for (const p of q.slice(1)) c.lineTo(...p); c.closePath(); c.fill();
    c.fillStyle = '#b9b0a2'; c.beginPath(); c.ellipse(px, py, 50, 28, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(110,100,90,0.5)'; c.lineWidth = 0.8; for (let r = 10; r < 50; r += 7) { c.beginPath(); c.ellipse(px, py, r, r * 0.56, 0, 0, Math.PI * 2); c.stroke(); }
    const cols = ['#e53935', '#fdd835', '#ffffff', '#ab47bc'];
    for (const p of q) { const fx = p[0] + (px - p[0]) * 0.2, fy = p[1] + (py - p[1]) * 0.2; c.fillStyle = '#5d4037'; c.beginPath(); c.ellipse(fx, fy, 10, 5.5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2e7d32'; c.beginPath(); c.ellipse(fx, fy - 1, 9, 4.6, 0, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 9; i++) { c.fillStyle = cols[i & 3]; c.beginPath(); c.arc(fx + Math.cos(i * 0.7) * 6, fy - 1.5 + Math.sin(i * 0.7) * 2.8, 1.3, 0, Math.PI * 2); c.fill(); } } }
  return (LP.pathCv = cv);
}
const cellQuad = (i, k = 0.1) => { const N = LN(), x = i % N, y = Math.floor(i / N); return [gp(x + k, y + k), gp(x + 1 - k, y + k), gp(x + 1 - k, y + 1 - k), gp(x + k, y + 1 - k)]; };
function quadPath(q) { const c = ictx; c.beginPath(); c.moveTo(...q[0]); for (const p of q.slice(1)) c.lineTo(...p); c.closePath(); }
function landsPicScene(c, dpr) {
  const L = LANDS_LAYOUT, G = lpGeo(), st = S.st.castle, now = Date.now(), x = ictx, N = LN();
  const dt = Math.min(0.25, (now - (LP.last || now)) / 1000); LP.last = now;
  if (flowOn()) lpStep(dt);
  if (flowOn() && !flowTimer) flowTimer = setTimeout(flowTick, ANIM_MS);
  const bg = pic('lands/bg.jpg'); const sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  if (bg) x.drawImage(bg, 0, 0, L.w, L.h);
  for (const [i, p] of [...L.river, ...L.lake].entries()) { const ph = (now / 1700 + i * 0.37) % 1; if (ph > 0.5) continue; // блики на воде
    x.fillStyle = `rgba(255,255,255,${0.7 * Math.sin(ph * 2 * Math.PI)})`; x.beginPath(); x.ellipse(p[0] + ph * 8, p[1], 3 + ph * 4, 1.1, 0, 0, Math.PI * 2); x.fill(); }
  x.drawImage(lpPaths(), 0, 0, L.w, L.h);
  const items = [];
  for (let i = 0; i < N * N; i++) {
    if (i === G.pc) continue;
    const [px, py] = gp(i % N + 0.5, Math.floor(i / N) + 0.5), b = st.grid[1][i], q = queueAt(1, i);
    if (Iso.sel && Iso.sel.tab === 'lands' && Iso.sel.y * N + Iso.sel.x === i) { quadPath(cellQuad(i)); x.fillStyle = 'rgba(255,214,80,0.35)'; x.fill(); x.strokeStyle = '#ffe27a'; x.lineWidth = 2.5; x.stroke(); }
    if (b < 0 && !q) { const a = 0.35 + 0.25 * Math.sin(now / 500 + i); x.save(); x.setLineDash([7, 6]); x.lineDashOffset = -now / 60; x.strokeStyle = `rgba(255,225,100,${a})`; x.lineWidth = 2; quadPath(cellQuad(i, 0.2)); x.stroke(); x.restore(); continue; }
    if (b === 37) { // Рыболовная заводь — прудик под лодкой
      const g = x.createRadialGradient(px, py, 4, px, py, 46); g.addColorStop(0, '#5ec8f0'); g.addColorStop(0.75, '#2f97c9'); g.addColorStop(1, 'rgba(40,120,90,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(px, py, 46, 28, 0, 0, Math.PI * 2); x.fill();
      for (let k = 0; k < 3; k++) { const ph = (now / 2200 + k / 3 + i * 0.2) % 1; x.strokeStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`; x.lineWidth = 1; x.beginPath(); x.ellipse(px - 18 + k * 16, py + 8 - k * 6, 3 + ph * 8, 1.2 + ph * 3, 0, 0, Math.PI * 2); x.stroke(); }
    }
    items.push([py, () => { drawCellBuilding(1, i, b, st.levels[1][i], { sx: px - TW / 2, sy: py - TH / 2 - TH * PLOT / 2 + 6 }, BK_G, false);
      if (HOUSES.has(b)) { const im = pic(`build/${BUILD_IMG[displayId(S.by[b], st.levels[1][i])]}.png`); if (im) for (let k = 0; k < 4; k++) { const ph = ((now / 2600) + k / 4 + i * 0.13) % 1;
        x.fillStyle = `rgba(235,235,235,${0.45 * (1 - ph)})`; x.beginPath(); x.arc(px + 9 + Math.sin(ph * 5 + i) * 3 + ph * 7, py - im.height * BK_G + 26 - ph * 26, 2 + ph * 6, 0, Math.PI * 2); x.fill(); } }
      if (FARMS.has(b)) for (let k = 0; k < 2; k++) { const t = now / 1000 + i * 1.7 + k * 2.3, bx = px + Math.sin(t * 0.7) * 22, by = py - 16 + Math.cos(t * 1.1) * 8, fl = Math.abs(Math.sin(t * 14)) * 2.2 + 0.4;
        x.fillStyle = k ? '#ffe14d' : '#fff'; x.beginPath(); x.ellipse(bx - fl * 0.6, by, fl, 1.6, 0, 0, Math.PI * 2); x.ellipse(bx + fl * 0.6, by, fl, 1.6, 0, 0, Math.PI * 2); x.fill(); } }]);
    if (q || SAWS.has(b)) { const [bx, by] = gp(i % N + 0.08, Math.floor(i / N) + 0.6); items.push([by, () => lpPerson('builder', 2, (now / 110 + i * 3) % 7, bx, by, 7)]); }
  }
  for (const w of LP.walkers) items.push([w.y, () => lpPerson(`villager${w.skin}`, w.look, w.wait > 0 || w.mode === 2 ? 0 : w.frame, w.x, w.y, 8)]);
  for (const l of LP.loiter) items.push([l.y, () => lpPerson(`villager${l.skin}`, l.look, 0, l.x, l.y, 8)]);
  for (const g of LP.pigeons) items.push([g.y, () => { const pk = Math.max(0, Math.sin(g.peck)) * 1.5; x.fillStyle = 'rgba(0,0,0,0.2)'; x.beginPath(); x.ellipse(g.x, g.y, 2.4, 1, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#8d9aa6'; x.beginPath(); x.ellipse(g.x, g.y - 2, 2.6, 1.6, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#5f6b75'; x.beginPath(); x.arc(g.x + 2, g.y - 3.2 + pk, 1.1, 0, Math.PI * 2); x.fill(); }]);
  if (G.pc >= 0) { const [fx, fy] = G.plaza; items.push([fy, () => lifeFountain({ cx: fx, cy: fy + 4 }, now)]); }
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
  if (LP.fish) { const F = LP.fish, t = Math.min(1, F.t / 0.9);
    if (F.t < 0.9) { x.save(); x.translate(F.x + F.dx * (t - 0.5) * 16, F.y - Math.sin(t * Math.PI) * 14); x.rotate(F.dx * (t - 0.5) * 2.2); x.fillStyle = '#d4e1ec'; x.beginPath(); x.ellipse(0, 0, 4.5, 1.8, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    for (const s0 of [0, 0.9]) { const q = (F.t - s0) / 0.7; if (q < 0 || q > 1) continue; x.strokeStyle = `rgba(255,255,255,${0.7 * (1 - q)})`; x.lineWidth = 1; x.beginPath(); x.ellipse(F.x + F.dx * (s0 ? 8 : -8), F.y, 2 + q * 9, 1 + q * 4, 0, 0, Math.PI * 2); x.stroke(); } }
  x.imageSmoothingEnabled = sm;
  lifeBirds(dpr);
}
// нажатие по картинке → участок, в чей ромб попала точка
function landsPicCell(wx, wy) {
  const N = LN();
  for (let i = 0; i < N * N; i++) {
    if (!(S.cat.landOptions[Math.floor(i / N)][i % N] || []).length) continue;
    const q = cellQuad(i, 0); let ins = true;
    for (let k = 0; k < 4; k++) { const [ax, ay] = q[k], [bx, by] = q[(k + 1) % 4]; if ((bx - ax) * (wy - ay) - (by - ay) * (wx - ax) < 0) { ins = false; break; } }
    if (ins) return i;
  }
  return -1;
}
