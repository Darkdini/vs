'use strict';
// «Живые земли»: участки разделены тропинками (как в замке), из труб хибар идёт дым, над огородами порхают бабочки,
// в озере плещется рыба, в небе пролетают птицы.
// Координаты: участок (x, y) стоит в точке (x·SP, y·SP) изометрической сетки; тропинки — между участками.
const LIFE = { last: 0, fish: null, birds: [] };
const SP = 1.3;                       // шаг клеток (1 — вплотную), промежуток — тропинка
const HOUSES = new Set([6, 31, 36]), FARMS = new Set([5, 30, 35]);
const inLands = (x, y) => x >= 0 && y >= 0 && x < LN() && y < LN();
const isWater = (x, y) => inLands(x, y) && S.cat.lands.base[y][x] === 9;
// экран: участок / точка сетки
const plotXY = (x, y) => { const p = tileScreen(x * SP, y * SP); return { sx: p.sx, sy: p.sy, cx: p.sx + TW / 2, cy: p.sy + TH / 2 }; };

// рыба в озере и птицы в небе
function lifeStep(dt) {
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
function lifeBirds(dpr, k = dpr) { // k — точек слоя на точку экрана
  if (!LIFE.birds.length) return;
  const x = ictx, W = Iso.cv.width / dpr, H = Iso.cv.height / dpr;
  x.save(); x.setTransform(k, 0, 0, k, 0, 0); x.strokeStyle = 'rgba(30,30,30,0.75)'; x.lineWidth = 1.4;
  for (const b of LIFE.birds) {
    const q = b.t / b.dur, bx0 = b.dir > 0 ? -40 + q * (W + 80) : W + 40 - q * (W + 80);
    for (let i = 0; i < b.n; i++) {
      const bx = bx0 - b.dir * (i % 2 ? i * 9 : i * 7), by = H * b.y0 + 40 + (i % 2 ? i * 6 : -i * 3) + Math.sin(b.t * 2 + i) * 3, fl = Math.sin(b.t * 9 + i * 1.3) * 3;
      x.beginPath(); x.moveTo(bx - 5, by - fl); x.quadraticCurveTo(bx - 2, by - 2, bx, by); x.quadraticCurveTo(bx + 2, by - 2, bx + 5, by - fl); x.stroke();
    }
  }
  x.restore();
}

// круглый участок земель: овал (круг в изометрии) с бортиком из камня; заливка по виду земли — один раз в готовую картинку
const ROUND_PLOT = {};
function roundPlot(P, kind) {
  const key = /grass/.test(kind) ? 'grass' : /stone|kamen|rock/.test(kind) ? 'stone' : 'field';
  let cv = ROUND_PLOT[key];
  if (!cv) {
    const K = 4, w = TW * K, h = TH * K; cv = document.createElement('canvas'); cv.width = w; cv.height = h + 2 * K; const g = cv.getContext('2d');
    const col = { grass: ['#8fc24a', '#5f9a2c'], field: ['#a8794a', '#7a5230'], stone: ['#b9b2a4', '#8a8273'] }[key];
    const ell = (k, dy = 0) => { g.beginPath(); g.ellipse(w / 2, h / 2 + dy, w / 2 * k, h / 2 * k, 0, 0, Math.PI * 2); };
    ell(0.9, K * 1.5); g.fillStyle = 'rgba(40, 30, 10, 0.35)'; g.fill(); // тень под бортиком
    ell(0.9); g.fillStyle = '#d8ccb0'; g.fill(); g.lineWidth = K; g.strokeStyle = '#6f6350'; g.stroke(); // каменный бортик
    ell(0.8); const gr = g.createRadialGradient(w / 2, h * 0.42, 2, w / 2, h / 2, w * 0.42); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]); g.fillStyle = gr; g.fill();
    if (key === 'field') { g.save(); ell(0.8); g.clip(); g.strokeStyle = 'rgba(70, 45, 20, 0.45)'; g.lineWidth = K * 0.9; for (let i = -10; i <= 10; i++) { g.beginPath(); g.moveTo(w / 2 + i * K * 6 - w / 2, h / 2 - h / 2); g.lineTo(w / 2 + i * K * 6 + w / 2, h / 2 + h / 2); g.stroke(); } g.restore(); } // борозды
    let seed = key.length * 97; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (key !== 'field') { g.save(); ell(0.8); g.clip(); for (let i = 0; i < 90; i++) { g.fillStyle = key === 'grass' ? (rnd() < 0.5 ? '#a6d660' : '#4f8a24') : (rnd() < 0.5 ? '#d2ccbd' : '#77705f'); g.fillRect(rnd() * w, rnd() * h, K * 1.2, K * (key === 'grass' ? 2 : 1.2)); } g.restore(); }
    ROUND_PLOT[key] = cv;
  }
  const k = 0.8; ictx.drawImage(cv, P.cx - TW * k / 2, P.cy - TH * k / 2, TW * k, (TH + 2) * k); // поменьше клетки — между участками просвет
}

// подсветка выбранного участка (хорошо видна на траве, пашне и камне):
// back — под зданием: яркое свечение и толстое золотое кольцо; front — передняя половина кольца поверх основания здания.
// Кольцо неподвижно (основной слой земель рисуется только при изменениях); расходящаяся волна — в слое оживления (roundSelWave)
const SEL_K = 0.8;
function roundSelWave(P) {
  const x = ictx, rx = TW * SEL_K / 2, ry = TH * SEL_K / 2, q = (Date.now() % 1400) / 1400;
  x.lineWidth = 3; x.strokeStyle = `rgba(255, 230, 120, ${0.8 * (1 - q)})`; x.beginPath(); x.ellipse(P.cx, P.cy + 1, rx * (1 + q * 0.55), ry * (1 + q * 0.55), 0, 0, Math.PI * 2); x.stroke();
}
function roundSel(P, part = 'back') {
  const x = ictx, k = SEL_K, rx = TW * k / 2, ry = TH * k / 2, cy = P.cy + 1, a = 1;
  const ring = (from, to, sc = 1) => { x.beginPath(); x.ellipse(P.cx, cy, rx * sc, ry * sc, 0, from, to); };
  x.save();
  if (part === 'back') {
    const g = x.createRadialGradient(P.cx, cy, rx * 0.1, P.cx, cy, rx * 1.45);
    g.addColorStop(0, `rgba(255, 245, 170, ${0.55 * a})`); g.addColorStop(0.6, `rgba(255, 215, 70, ${0.4 * a})`); g.addColorStop(1, 'rgba(255, 190, 30, 0)');
    x.fillStyle = g; ring(0, Math.PI * 2, 1.45); x.fill();
  }
  const from = part === 'back' ? 0 : 0, to = part === 'back' ? Math.PI * 2 : Math.PI; // спереди — нижняя (ближняя) половина
  x.lineCap = 'round';
  x.lineWidth = 7; x.strokeStyle = 'rgba(70, 40, 0, 0.75)'; ring(from, to); x.stroke(); // тёмная обводка — контраст на светлом
  x.lineWidth = 4.5; x.strokeStyle = `rgba(255, 205, 40, ${a})`; ring(from, to); x.stroke();
  x.lineWidth = 1.6; x.strokeStyle = `rgba(255, 252, 215, ${a})`; ring(from, to); x.stroke(); // блик
  x.restore();
}

// неподвижный слой земель не меняется — рисуется один раз в свой холст (в точках экрана, с запасом на приближение),
// дальше каждый кадр — одна картинка вместо сотен (225 тропинок, участков и воды тормозили прокрутку на телефоне)
const LGROUND = { cv: null, base: null, k: 0, N: 0 };
function landsGroundDraw(N, L, at) {
  // 1) озеро — сплошная вода (участки воды растянуты на шаг, без тропинок между ними)
  for (let y = 0; y < N; y++) for (let xx = N - 1; xx >= 0; xx--) if (isWater(xx, y)) plotImage('ground/water.png', at(plotXY(xx, y)), SP * 1.02);
  // 2) тропинки: кольцо вокруг каждого сухого участка; соседние кольца сходятся в дорожку с камушками
  for (let y = 0; y < N; y++) for (let xx = N - 1; xx >= 0; xx--) if (!isWater(xx, y)) { const P = plotXY(xx, y); pathTile(P.cx - TW * SP / 2, P.cy - TH * SP / 2, SP); }
  // 3) сам участок — круглый (в изометрии — овал) с каменным бортиком: пашня, камень или трава
  for (let y = 0; y < N; y++) for (let xx = N - 1; xx >= 0; xx--) if (!isWater(xx, y)) roundPlot(plotXY(xx, y), GROUND[L.base[y][xx]]);
}
function landsGround(N, L, at) {
  if (!pic('ground/water.png')) return landsGroundDraw(N, L, at); // вода ещё грузится — пока рисуем напрямую
  const ps = [plotXY(0, 0), plotXY(N - 1, 0), plotXY(0, N - 1), plotXY(N - 1, N - 1)], pw = TW * SP, ph = TH * SP * 2;
  const x0 = Math.min(...ps.map((p) => p.cx)) - pw, x1 = Math.max(...ps.map((p) => p.cx)) + pw, y0 = Math.min(...ps.map((p) => p.cy)) - ph, y1 = Math.max(...ps.map((p) => p.cy)) + ph;
  const t = ictx.getTransform(), scr = Math.max(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d)); // точек экрана на единицу сейчас
  const kmax = 3000 / Math.max(x1 - x0, y1 - y0), need = Math.min(kmax, Math.max(1, scr * 1.15));
  if (!LGROUND.cv || LGROUND.base !== L.base || LGROUND.N !== N || (need > LGROUND.k * 1.15 && LGROUND.k < kmax)) {
    const k = Math.min(kmax, need * 1.3), cv = LGROUND.cv || document.createElement('canvas'); // приблизили сильнее — перерисовать чётче
    cv.width = Math.ceil((x1 - x0) * k); cv.height = Math.ceil((y1 - y0) * k);
    const g = cv.getContext('2d'), keep = ictx; g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); g.imageSmoothingEnabled = true;
    ictx = g; try { landsGroundDraw(N, L, at); } finally { ictx = keep; }
    Object.assign(LGROUND, { cv, base: L.base, k, N, x0, y0, w: x1 - x0, h: y1 - y0 });
  }
  const sm = ictx.imageSmoothingEnabled, q = ictx.imageSmoothingQuality; ictx.imageSmoothingEnabled = true; ictx.imageSmoothingQuality = 'low'; // слой уже в точках экрана — простого сглаживания хватает
  ictx.drawImage(LGROUND.cv, LGROUND.x0, LGROUND.y0, LGROUND.w, LGROUND.h); ictx.imageSmoothingEnabled = sm; ictx.imageSmoothingQuality = q;
}

// ---------- вся сцена земель (неподвижная часть; движение — слоем оживления, landsLife) ----------
function landsScene() {
  const N = LN(), L = S.cat.lands, st = S.st.castle, x = ictx;
  LF.mLands = x.getTransform(); // точки земель → точки экрана: по ним слой оживления рисует дым, бабочек и рыбу
  const at = (P, k) => ({ sx: P.cx - TW / 2, sy: P.cy - TH / 2 });
  const sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true;
  landsGround(N, L, at); // 1–3) вода, тропинки, круглые участки — готовой картинкой
  x.imageSmoothingEnabled = sm;
  if (Iso.sel && Iso.sel.tab === 'lands') roundSel(plotXY(Iso.sel.x, Iso.sel.y)); // выбранный участок — золотое кольцо по форме круга
  // 4) объекты по глубине (ниже на экране — рисуется позже): здания и украшения
  const items = [];
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const cell = y * N + xx, b = st.grid[1][cell], d = L.decor[y][xx], P = plotXY(xx, y);
    items.push([P.cy, () => {
      if (b < 0 && !queueAt(1, cell) && d >= 0) sprite(`ground/${DECOR[d]}.png`, P.sx, P.sy, d === 1 ? 3 : d === 2 ? -2 : 0);
      else drawCellBuilding(1, cell, b, st.levels[1][cell], { sx: P.sx, sy: P.sy }, 'fit', isSel(xx, y)); // постройка на всю клетку
    }]);
  }
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
  if (Iso.sel && Iso.sel.tab === 'lands') roundSel(plotXY(Iso.sel.x, Iso.sel.y), 'front'); // передняя половина кольца — поверх здания
  landLvlFlush(); // цифры уровней — поверх зданий
  landBarsFlush(); // полосы стройки — поверх всех зданий
  LVLQ.length = 0; // уровни на землях не показываем — только в замке
}

// ---------- земли на нарисованном фоне: оригинальные земли 15×15 целиком ложатся на луг-ромб картинки ----------
const hasPic = () => typeof LANDS_LAYOUT !== 'undefined';
function landsXf() { // мир плиток → картинка: углы земель (левый, верхний, правый) ложатся точно в углы луга — сетка растянута на весь ромб
  const q = LANDS_LAYOUT.quad, N = LN(), E = (N - 1) * SP + 0.5, m = 0.985, cx = (q[0][0] + q[2][0]) / 2, cy = (q[1][1] + q[3][1]) / 2;
  const sc = (g, h) => { const p = tileScreen(g, h); return [p.sx + TW / 2, p.sy + TH / 2]; };
  const Lw = sc(-0.5, -0.5), Tw = sc(E, -0.5), Rw = sc(E, E);
  const my = (q[1][1] + q[3][1]) / 2, hw = (q[2][0] - q[0][0]) / 2 * m, hh = (q[3][1] - q[1][1]) / 2 * m; // ромб по ширине и высоте (все 4 угла)
  const L = [cx - hw, my], T = [cx, my - hh], R = [cx + hw, my];
  const w1 = [Tw[0] - Lw[0], Tw[1] - Lw[1]], w2 = [Rw[0] - Lw[0], Rw[1] - Lw[1]], p1 = [T[0] - L[0], T[1] - L[1]], p2 = [R[0] - L[0], R[1] - L[1]];
  const det = w1[0] * w2[1] - w2[0] * w1[1], i00 = w2[1] / det, i01 = -w2[0] / det, i10 = -w1[1] / det, i11 = w1[0] / det;
  const a = p1[0] * i00 + p2[0] * i10, c = p1[0] * i01 + p2[0] * i11, b = p1[1] * i00 + p2[1] * i10, d = p1[1] * i01 + p2[1] * i11;
  return { a, b, c, d, e: L[0] - a * Lw[0] - c * Lw[1], f: L[1] - b * Lw[0] - d * Lw[1] };
}
function landsPicBegin() {
  const L = LANDS_LAYOUT, bg = pic('lands/bg.jpg?v=3'), x = ictx, sm = x.imageSmoothingEnabled; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  if (bg) x.drawImage(bg, 0, 0, L.w, L.h);
  LF.mPic = x.getTransform(); // точки картинки → экран: блики на воде (слой оживления)
  x.imageSmoothingEnabled = sm;
  const t = landsXf(); x.save(); x.transform(t.a, t.b, t.c, t.d, t.e, t.f);
}
function landsPicEnd() { ictx.restore(); }
// нажатие по картинке → клетка земель
function landsPicTile(wx, wy) { const t = landsXf(), det = t.a * t.d - t.b * t.c, X = wx - t.e, Y = wy - t.f, f = screenToTileF((t.d * X - t.c * Y) / det, (-t.b * X + t.a * Y) / det); return { x: Math.round(f.x / SP), y: Math.round(f.y / SP) }; }

// ---------- оживление земель — свой прозрачный слой поверх (как «Жизнь в замке», castlelife.js) ----------
// Блики на воде, дым из труб хибар, бабочки над огородами, рыба, птицы, волна вокруг выбранного участка — 7 раз в секунду,
// в пониженном разрешении. Сами земли (фон, участки, 225 построек) — в основном слое, только при изменениях:
// раньше вся картинка перерисовывалась 7 раз в секунду и каждый кадр целиком уходил в видеокарту — на телефоне это и грело
const LF = { cv: null, g: null, timer: 0, mPic: null, mLands: null, dpr: 1, spark: null, sparkFor: null };
const LF_RES = Math.min(1, 1.25 / Math.min(2, window.devicePixelRatio || 1)), LF_MS = 140; // разрешение слоя (доля от экрана) и шаг кадра
function lfLayer() {
  if (!LF.cv) { LF.cv = document.createElement('canvas'); LF.cv.className = 'iso isolife'; LF.g = LF.cv.getContext('2d'); }
  if (Iso.cv.parentNode && LF.cv.previousSibling !== Iso.cv) Iso.cv.after(LF.cv);
  const w = Math.max(1, Math.round(Iso.cv.width * LF_RES)), h = Math.max(1, Math.round(Iso.cv.height * LF_RES));
  if (LF.cv.width !== w || LF.cv.height !== h) { LF.cv.width = w; LF.cv.height = h; }
}
// вызывается из isoDrawNow после кадра: на землях — рисует слой и заводит таймер, на других вкладках — прячет
function landsLife(dpr) {
  const on = S.tab === 'lands' && flowOn() && !!LF.mLands && !!S.st;
  if (!on) { if (LF.cv) LF.cv.style.display = 'none'; clearTimeout(LF.timer); LF.timer = 0; return; }
  lfLayer(); LF.cv.style.display = ''; LF.dpr = dpr;
  lfDraw();
  if (!LF.timer) LF.timer = setTimeout(lfTick, LF_MS);
}
function lfTick() {
  LF.timer = 0;
  if (S.tab !== 'lands' || document.hidden || !Iso.cv.isConnected || !flowOn()) { if (LF.cv) LF.cv.style.display = 'none'; return; }
  lfDraw(); LF.timer = setTimeout(lfTick, typeof animIdle === 'function' && animIdle() ? IDLE_ANIM_MS : LF_MS); // давно не касались — реже
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.tab === 'lands' && LF.cv && !LF.timer) lfTick(); });
// блики на воде: точки реки и озера с картинки; под постройкой (рыболовная заводь на воде) — не видны
function lfSparkles(g, now) {
  if (!hasPic() || !LF.mPic) return;
  const L = LANDS_LAYOUT, N = LN(), grid = S.st.castle.grid[1];
  if (LF.sparkFor !== L) { LF.spark = [...L.river, ...L.lake].map((p) => { const t = landsPicTile(p[0], p[1]); return t.x >= 0 && t.y >= 0 && t.x < N && t.y < N ? t.y * N + t.x : -1; }); LF.sparkFor = L; }
  [...L.river, ...L.lake].forEach((p, i) => {
    const cell = LF.spark[i]; if (cell >= 0 && grid[cell] >= 0) return;
    const ph = (now / 1700 + i * 0.37) % 1; if (ph > 0.5) return;
    g.fillStyle = `rgba(255,255,255,${0.7 * Math.sin(ph * 2 * Math.PI)})`; g.beginPath(); g.ellipse(p[0] + ph * 8, p[1], 3 + ph * 4, 1.1, 0, 0, Math.PI * 2); g.fill();
  });
}
function lfDraw() {
  const g = LF.g, r = LF_RES, now = Date.now(), st = S.st.castle, N = LN();
  const dt = Math.min(0.25, (now - (LIFE.last || now)) / 1000); LIFE.last = now;
  lifeStep(dt);
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, LF.cv.width, LF.cv.height);
  const put = (m) => g.setTransform(m.a * r, m.b * r, m.c * r, m.d * r, m.e * r, m.f * r);
  const keep = ictx; ictx = g; // функции украшений рисуют в ictx
  try {
    g.imageSmoothingEnabled = true;
    if (LF.mPic) { put(LF.mPic); lfSparkles(g, now); }
    put(LF.mLands);
    for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) { const cell = y * N + xx, b = st.grid[1][cell]; if (HOUSES.has(b) || FARMS.has(b)) plotFx(xx, y, b, cell, now); }
    if (Iso.sel && Iso.sel.tab === 'lands') roundSelWave(plotXY(Iso.sel.x, Iso.sel.y));
    lifeFish();
    lifeBirds(LF.dpr, LF.dpr * r);
  } finally { ictx = keep; }
}
