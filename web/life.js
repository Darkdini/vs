'use strict';
// «Живые земли»: участки 7×7 разделены тропинками (как в замке), по тропинкам гуляют жители — останавливаются и смотрят на участки;
// на стройках и у лесопилок стучат строители, из труб идёт дым, над огородами порхают бабочки,
// в озере плещется рыба, в небе пролетают птицы. Фигурки — кадры 3D-моделей клиента (gfx/anim/*.png).
// Координаты: участок (x, y) стоит в точке (x·SP, y·SP) изометрической сетки; тропинки — между участками.
const LIFE = { walkers: [], last: 0, fish: null, birds: [] };
const AN = { K: 4, CW: 56, CH: 88, FX: 28, FY: 76, KM: 6, MW: 276, MH: 384, MX: 138, MY: 300 };
const SP = 1.2;                       // шаг клеток (1 — вплотную), промежуток — тропинка
const LIFE_N = 10, WALK_SPEED = 0.7;    // жителей; клеток сетки в секунду
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
function lifeSpawn() {
  const N = LN(), nodes = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) if (nodeNext(i, j).length) nodes.push([i, j]);
  LIFE.walkers = Array.from({ length: LIFE_N }, (_, k) => { const [i, j] = nodes[Math.floor(Math.random() * nodes.length)] || [0, 0];
    const [fx, fy] = nodePos(i, j); return { i, j, ti: i, tj: j, pi: i, pj: j, fx, fy, t: 1, skin: k % 4, frame: 0, wait: Math.random() * 2, look: 3 }; });
}
function lifeStep(dt) {
  if (!LIFE.walkers.length) lifeSpawn();
  for (const w of LIFE.walkers) {
    if (w.wait > 0) { w.wait -= dt; continue; }
    if (w.t >= 1) {
      w.i = w.ti; w.j = w.tj;
      if (Math.random() < 0.25) { w.look = Math.floor(Math.random() * 4); w.wait = 1.2 + Math.random() * 2.5; w.frame = 0; continue; } // постоять, посмотреть на участки
      let nb = nodeNext(w.i, w.j); if (nb.length > 1) nb = nb.filter(([a, b]) => a !== w.pi || b !== w.pj);
      if (!nb.length) { w.wait = 1; continue; }
      const [a, b] = nb[Math.floor(Math.random() * nb.length)];
      w.pi = w.i; w.pj = w.j; w.ti = a; w.tj = b; w.t = 0;
    }
    w.t = Math.min(1, w.t + dt * WALK_SPEED / SP); w.frame = (w.frame + dt * 9) % 8;
    const [x0, y0] = nodePos(w.i, w.j), [x1, y1] = nodePos(w.ti, w.tj);
    w.fx = x0 + (x1 - x0) * w.t; w.fy = y0 + (y1 - y0) * w.t;
  }
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
  // 3) сам участок: пашня, камень или трава
  for (let y = 0; y < N; y++) for (let xx = N - 1; xx >= 0; xx--) if (!isWater(xx, y)) {
    const g = `ground/${GROUND[L.base[y][xx]]}.png`;
    plotImage(/\/(grass|grass1)\.png$/.test(g) ? 'ground/grass1.png' : g, at(plotXY(xx, y)), 1.04);
  }
  x.imageSmoothingEnabled = sm;
  if (Iso.sel && Iso.sel.tab === 'lands') glow(at(plotXY(Iso.sel.x, Iso.sel.y)), 1.04);
  // 4) объекты по глубине (ниже на экране — рисуется позже): здания, украшения, жители, строители, мельница
  const items = [];
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const cell = y * N + xx, b = st.grid[1][cell], d = L.decor[y][xx], P = plotXY(xx, y);
    items.push([P.cy, () => {
      if (b < 0 && !queueAt(1, cell) && d >= 0) sprite(`ground/${DECOR[d]}.png`, P.sx, P.sy, d === 1 ? 3 : d === 2 ? -2 : 0);
      else drawCellBuilding(1, cell, b, st.levels[1][cell], { sx: P.sx, sy: P.sy }, 1, isSel(xx, y));
      plotFx(xx, y, b, cell, now);
    }]);
    // строитель: на стройке и у лесопилки — на тропинке перед участком, лицом к нему
    if (queueAt(1, cell) || SAWS.has(b)) { const fx = (xx - 0.5) * SP, fy = y * SP + 0.1; items.push([ptXY(fx, fy).cy + 0.1, () => lifePerson('builder', 2, (now / 110 + cell * 3) % 7, fx, fy, 7)]); }
  }
  for (const w of LIFE.walkers) items.push([ptXY(w.fx, w.fy).cy, () => lifePerson(`villager${w.skin}`, w.wait > 0 ? w.look : DIR_ROW(w.ti - w.i, w.tj - w.j), w.wait > 0 ? 0 : w.frame, w.fx, w.fy, 8)]);
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
  lifeFish(); lifeBirds(dpr);
}

// ---------- земли на нарисованном фоне: оригинальные земли 15×15 целиком ложатся на луг-ромб картинки ----------
const hasPic = () => typeof LANDS_LAYOUT !== 'undefined';
function landsXf() { // перенос «мира плиток» на картинку: центр ромба земель → центр луга, ширина → ширина луга
  const q = LANDS_LAYOUT.quad, N = LN(), span = (N - 1) * SP + 1, s = (q[2][0] - q[0][0]) * 0.98 / (span * TW), c0 = tileScreen((N - 1) * SP / 2, (N - 1) * SP / 2);
  return { s, cx: (q[0][0] + q[2][0]) / 2, cy: (q[1][1] + q[3][1]) / 2, ox: c0.sx + TW / 2, oy: c0.sy + TH / 2 };
}
function landsPicBegin() {
  const L = LANDS_LAYOUT, bg = pic('lands/bg.jpg'), x = ictx, sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  if (bg) x.drawImage(bg, 0, 0, L.w, L.h);
  const now = Date.now();
  for (const [i, p] of [...L.river, ...L.lake].entries()) { const ph = (now / 1700 + i * 0.37) % 1; if (ph > 0.5) continue; // блики на воде
    x.fillStyle = `rgba(255,255,255,${0.7 * Math.sin(ph * 2 * Math.PI)})`; x.beginPath(); x.ellipse(p[0] + ph * 8, p[1], 3 + ph * 4, 1.1, 0, 0, Math.PI * 2); x.fill(); }
  x.imageSmoothingEnabled = sm;
  const t = landsXf(); x.save(); x.translate(t.cx, t.cy); x.scale(t.s, t.s); x.translate(-t.ox, -t.oy);
}
function landsPicEnd() { ictx.restore(); }
// нажатие по картинке → клетка земель
function landsPicTile(wx, wy) { const t = landsXf(), f = screenToTileF((wx - t.cx) / t.s + t.ox, (wy - t.cy) / t.s + t.oy); return { x: Math.round(f.x / SP), y: Math.round(f.y / SP) }; }
