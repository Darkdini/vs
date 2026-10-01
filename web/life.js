'use strict';
// «Живые земли»: по свободным клеткам ходят жители, на стройках и у лесопилок стучат строители, из труб идёт дым,
// у края земель крутится мельница, над огородами порхают бабочки, в озере плещется рыба, в небе пролетают птицы.
// Фигурки — кадры 3D-моделей из клиента (gfx/anim/*.png, ноги — в точке FX,FY ячейки; K — во сколько раз крупнее).
const LIFE = { walkers: [], last: 0, fish: null, birds: [] };
const AN = { K: 4, CW: 56, CH: 88, FX: 28, FY: 76, KM: 6, MW: 276, MH: 384, MX: 138, MY: 300 };
const LIFE_N = 9, WALK_SPEED = 0.55; // жителей; клеток в секунду
const DIR_ROW = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 0 : 2) : (dy < 0 ? 1 : 3)); // −x, −y, +x, +y → строка листа
const HOUSES = new Set([6, 31, 36]), FARMS = new Set([5, 30, 35]), SAWS = new Set([7, 27, 32]);
const MILL_AT = [-2, 10], MILL_S = 1.7, MAN_S = 1.25; // мельница за левым нижним краем земель; масштабы мельницы и человечков

// где можно ходить: свободная клетка земель (не вода, без здания, стройки и украшения) или полоса травы за краем
function lifeFree(x, y) {
  const L = S.cat.lands, st = S.st.castle;
  if (x === MILL_AT[0] && y === MILL_AT[1]) return false;
  const N = LN();
  if (x < 0 || y < 0 || x > N - 1 || y > N - 1) return x >= -2 && y >= -2 && x <= N + 1 && y <= N + 1;
  const cell = y * N + x;
  return L.base[y][x] !== 9 && st.grid[1][cell] < 0 && !queueAt(1, cell) && L.decor[y][x] < 0;
}
function lifeNeighbours(x, y) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => lifeFree(a, b)); }
function lifeSpawn() {
  const cells = [];
  const N = LN();
  for (let y = -2; y <= N + 1; y++) for (let x = -2; x <= N + 1; x++) if (lifeFree(x, y)) cells.push([x, y]);
  const inside = cells.filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N), pool = inside.length >= 4 ? inside : cells;
  LIFE.walkers = Array.from({ length: LIFE_N }, (_, i) => { const [x, y] = pool[Math.floor(Math.random() * pool.length)] || [-1, 7];
    return { x, y, fx: x, fy: y, tx: x, ty: y, px: x, py: y, t: 1, skin: i % 4, frame: Math.random() * 8, wait: Math.random() * 3 }; });
}
// шаг жизни: время в секундах
function lifeStep(dt) {
  if (!LIFE.walkers.length) lifeSpawn();
  for (const w of LIFE.walkers) {
    if (!lifeFree(w.tx, w.ty) && (w.tx !== w.x || w.ty !== w.y)) { w.tx = w.x; w.ty = w.y; w.t = 1; } // на пути построили здание
    if (w.wait > 0) { w.wait -= dt; continue; }
    if (w.t >= 1) {
      w.x = w.tx; w.y = w.ty;
      if (Math.random() < 0.12) { w.wait = 1 + Math.random() * 3; w.frame = 0; continue; } // постоять, поглазеть
      let nb = lifeNeighbours(w.x, w.y); if (nb.length > 1) nb = nb.filter(([a, b]) => a !== w.px || b !== w.py);
      if (!nb.length) { w.wait = 2; continue; }
      const [nx, ny] = nb[Math.floor(Math.random() * nb.length)];
      w.px = w.x; w.py = w.y; w.tx = nx; w.ty = ny; w.t = 0;
    }
    w.t = Math.min(1, w.t + dt * WALK_SPEED); w.frame = (w.frame + dt * 9) % 8;
    w.fx = w.x + (w.tx - w.x) * w.t; w.fy = w.y + (w.ty - w.y) * w.t;
  }
  // рыба в озере: раз в несколько секунд
  if (!LIFE.fish || LIFE.fish.t > 1.6) {
    const L = S.cat.lands, water = [];
    const N = LN(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (L.base[y][x] === 9 && S.st.castle.grid[1][y * N + x] < 0) water.push([x, y]);
    LIFE.fish = water.length && Math.random() < 0.02 ? { c: water[Math.floor(Math.random() * water.length)], t: 0, dx: Math.random() < 0.5 ? -1 : 1 } : (LIFE.fish && LIFE.fish.t <= 1.6 ? LIFE.fish : null);
  } else LIFE.fish.t += dt;
  // птицы: стайка пролетает раз в 20–40 с
  LIFE.birds = LIFE.birds.filter((b) => b.t < b.dur);
  for (const b of LIFE.birds) b.t += dt;
  if (!LIFE.birds.length && Math.random() < dt / 25) {
    const n = 3 + Math.floor(Math.random() * 4), y0 = Math.random() * 0.6, dir = Math.random() < 0.5 ? 1 : -1;
    LIFE.birds.push({ t: 0, dur: 14, y0, dir, n, seed: Math.random() * 10 });
  }
}
const lifeSheet = (name) => pic(`anim/${name}.png`);
// человечек: кадр f из строки row листа, ноги в точке тайла (fx, fy) — центр клетки
function lifePerson(sheet, row, f, fx, fy, cols) {
  const im = lifeSheet(sheet); if (!im) return;
  const p = tileScreen(fx, fy), cx = p.sx + TW / 2, cy = p.sy + TH / 2, k = AN.K / MAN_S;
  const x = ictx, sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true;
  x.fillStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); x.ellipse(cx, cy, 4.5, 2, 0, 0, Math.PI * 2); x.fill(); // тень
  x.drawImage(im, (Math.floor(f) % cols) * AN.CW, row * AN.CH, AN.CW, AN.CH, cx - AN.FX / k, cy - AN.FY / k, AN.CW / k, AN.CH / k);
  x.imageSmoothingEnabled = sm;
}
// всё, что стоит на клетке (x, y) — рисуется сразу после неё (правильный порядок по глубине)
function lifeAt(xx, y, now) {
  const N = LN(), st = S.st.castle, cell = xx >= 0 && y >= 0 && xx < N && y < N ? y * N + xx : -1;
  for (const w of LIFE.walkers) if (Math.round(w.fx) === xx && Math.round(w.fy) === y)
    lifePerson(`villager${w.skin}`, w.t < 1 && !w.wait ? DIR_ROW(w.tx - w.x, w.ty - w.y) : 3, w.wait > 0 ? 0 : w.frame, w.fx, w.fy, 8);
  if (cell < 0) return;
  const b = st.grid[1][cell];
  // строитель: на стройке и у лесопилки — стучит молотком/топором перед зданием
  if (queueAt(1, cell) || SAWS.has(b)) lifePerson('builder', 2, (now / 110 + cell * 3) % 7, xx - 0.45, y + 0.45, 7);
  // дым из трубы дома
  if (HOUSES.has(b)) {
    const im = pic(`build/${BUILD_IMG[b]}.png`), p = tileScreen(xx, y); if (!im) return;
    const top = p.sy - (im.height - TH), cx = p.sx + TW / 2 + 6, x = ictx;
    for (let i = 0; i < 4; i++) {
      const ph = ((now / 2600) + i / 4 + cell * 0.13) % 1, r = 2 + ph * 6;
      x.fillStyle = `rgba(235,235,235,${0.45 * (1 - ph)})`; x.beginPath(); x.arc(cx + Math.sin(ph * 5 + cell) * 3 + ph * 6, top + 6 - ph * 22, r, 0, Math.PI * 2); x.fill();
    }
  }
  // бабочки над огородами
  if (FARMS.has(b)) {
    const p = tileScreen(xx, y), x = ictx;
    for (let i = 0; i < 2; i++) {
      const t = now / 1000 + cell * 1.7 + i * 2.3, bx = p.sx + TW / 2 + Math.sin(t * 0.7) * 16, by = p.sy + TH / 2 - 10 + Math.cos(t * 1.1) * 6, flap = Math.abs(Math.sin(t * 14)) * 2.2 + 0.4;
      x.fillStyle = i ? '#ffe14d' : '#ffffff';
      x.beginPath(); x.ellipse(bx - flap * 0.6, by, flap, 1.6, 0, 0, Math.PI * 2); x.ellipse(bx + flap * 0.6, by, flap, 1.6, 0, 0, Math.PI * 2); x.fill();
    }
  }
}
function lifeMill(now) {
  const im = lifeSheet('mill'); if (!im) return;
  const p = tileScreen(MILL_AT[0], MILL_AT[1]), cx = p.sx + TW / 2, cy = p.sy + TH / 2, k = AN.KM / MILL_S, f = Math.floor(now / 140) % 12;
  const x = ictx, sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true;
  x.drawImage(im, f * AN.MW, 0, AN.MW, AN.MH, cx - AN.MX / k, cy - AN.MY / k, AN.MW / k, AN.MH / k);
  x.imageSmoothingEnabled = sm;
}
function lifeFish() {
  const F = LIFE.fish; if (!F || F.t > 1.6) return;
  const p = tileScreen(F.c[0], F.c[1]), cx = p.sx + TW / 2, cy = p.sy + TH / 2, x = ictx, t = Math.min(1, F.t / 0.9);
  if (F.t < 0.9) { // дуга прыжка
    const fx = cx + F.dx * (t - 0.5) * 14, fy = cy - Math.sin(t * Math.PI) * 12;
    x.save(); x.translate(fx, fy); x.rotate(F.dx * (t - 0.5) * 2.2); x.fillStyle = '#c9d6e3'; x.beginPath(); x.ellipse(0, 0, 4, 1.6, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(-F.dx * 4, 0); x.lineTo(-F.dx * 6.5, -2); x.lineTo(-F.dx * 6.5, 2); x.fill(); x.restore();
  }
  for (const [s, k] of [[0, 1], [0.9, 1]]) { // круги на воде: при прыжке и при падении
    const q = (F.t - s) / 0.7; if (q < 0 || q > 1) continue;
    x.strokeStyle = `rgba(255,255,255,${0.7 * (1 - q)})`; x.lineWidth = 1; x.beginPath(); x.ellipse(cx + F.dx * (s ? 7 : -7) * k, cy, 2 + q * 8, 1 + q * 4, 0, 0, Math.PI * 2); x.stroke();
  }
}
// птицы — поверх всего, в координатах экрана
function lifeBirds(c, dpr) {
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
// вызывается из отрисовки земель
function lifeDraw(phase, c, dpr) {
  const now = Date.now();
  if (phase === 'begin') {
    const dt = Math.min(0.25, (now - (LIFE.last || now)) / 1000); LIFE.last = now;
    if (flowOn()) lifeStep(dt);
    if (flowOn() && !flowTimer) flowTimer = setTimeout(flowTick, ANIM_MS);
    // всё, что за верхними краями земель (позади зданий)
    const seen = new Set();
    for (const w of LIFE.walkers) { const a = Math.round(w.fx), b = Math.round(w.fy), k = `${a}:${b}`; if ((b < 0 || a > LN() - 1) && !seen.has(k)) { seen.add(k); lifeAt(a, b, now); } }
    return;
  }
  // перед зданиями: нижние края и мельница
  const N = LN();
  for (let y = -2; y <= N + 1; y++) for (let xx = N + 1; xx >= -2; xx--) {
    if (!(xx < 0 || y > N - 1) || y < 0 || xx > N - 1) continue;
    if (xx === MILL_AT[0] && y === MILL_AT[1]) lifeMill(now);
    lifeAt(xx, y, now);
  }
  lifeFish(); lifeBirds(c, dpr);
}

// ---------- земли на нарисованном фоне: оригинальные земли 15×15 целиком ложатся на луг-ромб картинки ----------
const hasPic = () => typeof LANDS_LAYOUT !== 'undefined';
function landsXf() { // перенос «мира плиток» на картинку: центр ромба земель → центр луга, ширина → ширина луга
  const q = LANDS_LAYOUT.quad, N = LN(), s = (q[2][0] - q[0][0]) * 0.98 / (N * TW);
  return { s, cx: (q[0][0] + q[2][0]) / 2, cy: (q[1][1] + q[3][1]) / 2, ox: N * TW / 2, oy: TH / 2 };
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
function landsPicTile(wx, wy) { const t = landsXf(); return screenToTile((wx - t.cx) / t.s + t.ox, (wy - t.cy) / t.s + t.oy); }
