'use strict';
// «Жизнь в замке»: прозрачный слой поверх замка — блики и течение воды в реке и море, водопад, огонь у ворот,
// дым из труб фермы и мельницы, чайки над морем, тени облаков. Перерисовывается только этот слой (~12 раз в секунду),
// сам замок с фоном и зданиями — нет: телефон не греется. Жители, стража, торговец с тележкой и куры (gfx/life) ходят по дорожкам. Выключается в Настройках («Анимация»).
// Координаты — в точках картинки фона ground/bg/castle2.webp (1672×941), найдены по цветам фона.
const CL_WATER = [1463,124,527,137,514,150,1476,163,1437,176,540,189,514,202,527,202,540,202,488,215,501,215,475,228,397,267,1502,267,1515,267,1528,280,358,293,1515,293,1502,306,1489,319,1502,319,1463,332,1476,332,1489,332,1450,345,1463,345,1476,345,228,358,1424,358,176,371,189,371,202,371,215,371,176,384,1489,384,137,397,124,410,85,436,98,436,111,436,1541,436,72,449,1554,449,46,462,1567,462,20,475,33,475,46,475,59,475,1580,475,1593,475,7,488,20,488,33,488,46,488,59,488,1580,488,1593,488,1606,488,7,501,20,501,33,501,46,501,1593,501,1606,501,1619,501,1632,501,7,514,20,514,33,514,46,514,1606,514,1619,514,1632,514,7,527,20,527,33,527,1619,527,1632,527,1645,527,1658,527,7,540,20,540,1632,540,1645,540,1658,540,20,553,1632,553,1645,553,1658,553,7,566,1632,566,1658,566,7,579,1658,579,46,592,59,605,1658,605,59,618,72,618,85,618,72,631,124,631,1645,631,1658,631,124,644,137,644,1619,644,1632,644,1645,644,1658,644,1593,657,1606,657,1619,657,1632,657,1645,657,1658,657,189,670,1567,670,1593,670,1606,670,1619,670,1632,670,1645,670,1658,670,202,683,1554,683,1567,683,1580,683,1593,683,1606,683,1619,683,1632,683,1645,683,1658,683,241,696,254,696,267,696,1554,696,1567,696,1580,696,1593,696,1606,696,1619,696,1632,696,1645,696,1658,696,254,709,267,709,1463,709,1476,709,1502,709,1515,709,1528,709,1541,709,1554,709,1567,709,1580,709,1593,709,1606,709,1619,709,1632,709,1645,709,1658,709,267,722,280,722,345,722,1463,722,1476,722,1528,722,1541,722,1554,722,1567,722,1580,722,1593,722,1606,722,1619,722,1632,722,1645,722,1658,722,280,735,332,735,345,735,1515,735,1528,735,1541,735,1554,735,1567,735,1593,735,1606,735,1619,735,1632,735,1645,735,1658,735,345,748,1372,748,1385,748,1398,748,1528,748,1541,748,1554,748,1567,748,1580,748,1593,748,1606,748,1619,748,1632,748,1645,748,1658,748,384,761,397,761,1385,761,1411,761,1450,761,1541,761,1554,761,1567,761,1580,761,1593,761,1606,761,1619,761,1632,761,1645,761,1658,761,384,774,397,774,410,774,1398,774,1528,774,1541,774,1554,774,1567,774,1580,774,1593,774,1606,774,1619,774,1632,774,1645,774,1658,774,397,787,410,787,423,787,1528,787,1541,787,1554,787,1593,787,1606,787,1619,787,1645,787,1658,787,423,800,436,800,449,800,1541,800,1554,800,1567,800,1593,800,1606,800,1619,800,1632,800,1645,800,1658,800,1541,813,1554,813,1567,813,1580,813,1593,813,1606,813,1619,813,1632,813,1645,813,1658,813,488,826,1554,826,1567,826,1580,826,1593,826,1606,826,1619,826,1632,826,1645,826,1658,826,1216,839,1554,839,1567,839,1580,839,1593,839,1606,839,1619,839,1632,839,1645,839,1658,839,553,852,1164,852,1190,852,1203,852,1216,852,1554,852,1567,852,1580,852,1593,852,1606,852,1619,852,1632,852,1645,852,1658,852,553,865,579,865,1164,865,1177,865,1190,865,1203,865,1216,865,1229,865,1242,865,1567,865,1580,865,1593,865,1606,865,1619,865,1632,865,1645,865,1658,865,566,878,579,878,592,878,618,878,1125,878,1138,878,1151,878,1177,878,1190,878,1203,878,1216,878,1229,878,1242,878,1255,878,1593,878,1606,878,1619,878,1632,878,1645,878,1658,878,592,891,605,891,618,891,631,891,644,891,1047,891,1060,891,1125,891,1138,891,1151,891,1177,891,1190,891,1203,891,1216,891,1229,891,1242,891,1255,891,1268,891,1281,891,1580,891,1593,891,1606,891,1619,891,1632,891,1645,891,1658,891,644,904,657,904,1073,904,1086,904,1099,904,1125,904,1138,904,1151,904,1164,904,1177,904,1203,904,1216,904,1229,904,1242,904,1255,904,1268,904,1281,904,1294,904,1554,904,1567,904,1580,904,1593,904,1606,904,1619,904,1632,904,1658,904,644,917,1034,917,1047,917,1073,917,1086,917,1099,917,1138,917,1151,917,1164,917,1177,917,1190,917,1216,917,1229,917,1242,917,1255,917,1268,917,1294,917,1307,917,1320,917,1541,917,1554,917,1567,917,1580,917,1593,917,1606,917,1619,917,1658,917,982,930,995,930,1008,930,1060,930,1073,930,1086,930,1099,930,1125,930,1138,930,1151,930,1164,930,1177,930,1203,930,1216,930,1229,930,1242,930,1255,930,1268,930,1281,930,1294,930,1307,930,1320,930,1333,930,1346,930,1411,930,1424,930,1463,930,1554,930,1567,930,1606,930,1619,930,1632,930,1658,930]; // точки воды (x, y парами): блики
const CL_FIRE = [[761, 806], [884, 804]]; // жаровни у ворот
const CL_SMOKE = [[262, 150], [1590, 272]]; // трубы: ферма, водяная мельница
const CL_FALL = [[55, 1465, 1492], [100, 1460, 1495], [150, 1450, 1495], [185, 1445, 1490]]; // водопад: строка y → левый и правый край струи
const CL_SEA = [1555, 850]; // центр полёта чаек
const CL = { cv: null, g: null, timer: 0, tf: null, cloud: null };
function clLayer() {
  if (!CL.cv) { CL.cv = document.createElement('canvas'); CL.cv.className = 'iso isolife'; CL.g = CL.cv.getContext('2d'); }
  if (Iso.cv.parentNode && CL.cv.previousSibling !== Iso.cv) Iso.cv.after(CL.cv);
  if (CL.cv.width !== Iso.cv.width || CL.cv.height !== Iso.cv.height) { CL.cv.width = Iso.cv.width; CL.cv.height = Iso.cv.height; }
  return CL.g;
}
// вызывается из isoDrawNow после отрисовки кадра: в замке — запоминает камеру и рисует слой; на других вкладках — прячет его
function castleLife(c, dpr) {
  const on = S.tab === 'castle' && flowOn() && !!pic(CASTLE_BG.src);
  if (!on) { if (CL.cv) CL.cv.style.display = 'none'; clearTimeout(CL.timer); CL.timer = 0; return; }
  clLayer(); CL.cv.style.display = '';
  const k = CASTLE_BG.w / CASTLE_BG.iw, z = c.z * dpr; // точки картинки → точки экрана
  CL.tf = [z * k, c.x * dpr + CASTLE_BG.x * z, c.y * dpr + CASTLE_BG.y * z];
  clDraw();
  if (!CL.timer) CL.timer = setTimeout(clTick, 80);
}
function clTick() {
  CL.timer = 0;
  if (S.tab !== 'castle' || document.hidden || !Iso.cv.isConnected || !flowOn()) { if (CL.cv) CL.cv.style.display = 'none'; return; }
  clDraw(); CL.timer = setTimeout(clTick, 80);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.tab === 'castle' && CL.tf && !CL.timer) clTick(); });
const clHash = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
function clDraw() {
  const g = CL.g, [s, ox, oy] = CL.tf, t = performance.now();
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, CL.cv.width, CL.cv.height);
  g.setTransform(s, 0, 0, s, ox, oy);
  clWalkersDraw(g); // жители — первыми: стирание за зданиями не задевает воду, дым и тени облаков
  // тени облаков — медленно плывут слева направо по всему замку
  if (!CL.cloud) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const q = c.getContext('2d'), gr = q.createRadialGradient(128, 128, 8, 128, 128, 128);
    gr.addColorStop(0, 'rgba(10,25,40,0.16)'); gr.addColorStop(1, 'rgba(10,25,40,0)'); q.setTransform(1, 0, 0, 0.5, 0, 0); q.fillStyle = gr; q.fillRect(0, 0, 256, 256); CL.cloud = c;
  }
  for (const [sp, y, w, ph] of [[1.1, 300, 620, 0], [0.8, 650, 520, 0.55]]) { const x = ((t * sp / 1000 * 6 + ph * 2600) % 2600) - 500; g.drawImage(CL.cloud, x, y - w / 4, w, w / 2); }
  // вода: блики появляются, плывут по течению и гаснут
  g.fillStyle = '#fff';
  for (let i = 0; i < CL_WATER.length; i += 2) {
    const ph = (t / 2400 + clHash(i)) % 1; if (ph > 0.5) continue;
    g.globalAlpha = 0.55 * Math.sin(ph * 2 * Math.PI);
    g.beginPath(); g.ellipse(CL_WATER[i] + ph * 9 - 4, CL_WATER[i + 1] + ph * 3, 2.2 + ph * 5, 0.9, 0, 0, Math.PI * 2); g.fill();
  }
  // водопад: светлые струи бегут вниз, внизу — пена
  const fx = (y) => { let a = CL_FALL[0]; for (const b of CL_FALL) { if (b[0] >= y) { const f = (y - a[0]) / Math.max(1, b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; } a = b; } return [a[1], a[2]]; };
  g.lineCap = 'round'; g.strokeStyle = '#f2fbff'; g.lineWidth = 1.6; g.globalAlpha = 0.5;
  for (let j = 0; j < 16; j++) {
    const y0 = 55 + ((t / 9 + clHash(j + 300) * 130) % 130), [l, r] = fx(y0), x = l + (r - l) * (0.12 + 0.76 * clHash(j + 500));
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x - 1.2, Math.min(185, y0 + 13)); g.stroke();
  }
  for (let j = 0; j < 7; j++) {
    const ph = (t / 1300 + clHash(j + 700)) % 1, x = 1450 + 38 * clHash(j + 900);
    g.globalAlpha = 0.55 * (1 - ph); g.beginPath(); g.ellipse(x, 190 - ph * 4, 3 + ph * 7, 1.5 + ph * 3, 0, 0, Math.PI * 2); g.fill();
  }
  // огонь у ворот: тёплое свечение и языки пламени
  for (const [x, y] of CL_FIRE) {
    const fl = 0.75 + 0.25 * Math.sin(t / 90 + x) * Math.sin(t / 137 + y);
    const gr = g.createRadialGradient(x, y, 1, x, y, 26); gr.addColorStop(0, `rgba(255,190,70,${0.45 * fl})`); gr.addColorStop(1, 'rgba(255,140,30,0)');
    g.globalAlpha = 1; g.fillStyle = gr; g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.fill();
    for (let j = 0; j < 5; j++) {
      const ph = (t / 520 + clHash(j + x)) % 1, dx = (clHash(j + y) - 0.5) * 7 + Math.sin(t / 120 + j) * 1.2;
      g.globalAlpha = 0.85 * (1 - ph); g.fillStyle = ph < 0.4 ? '#fff2a8' : '#ff9a2e';
      g.beginPath(); g.ellipse(x + dx, y - 3 - ph * 14, 2.4 * (1 - ph) + 0.6, 4 * (1 - ph) + 1, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // дым из труб — серые клубы растут, поднимаются и тают
  g.fillStyle = '#e6e6e6';
  for (const [x, y] of CL_SMOKE) for (let j = 0; j < 6; j++) {
    const ph = (t / 3800 + j / 6) % 1;
    g.globalAlpha = 0.32 * (1 - ph) * Math.min(1, ph * 6);
    g.beginPath(); g.arc(x + ph * 16 + Math.sin(t / 900 + j) * 2, y - ph * 42, 2.5 + ph * 8, 0, Math.PI * 2); g.fill();
  }
  // чайки над морем
  g.globalAlpha = 0.9; g.lineWidth = 1.4; g.strokeStyle = '#fbfbfb';
  for (let j = 0; j < 3; j++) {
    const a = t / (5200 + j * 900) + j * 2.1, x = CL_SEA[0] + Math.cos(a) * (70 + j * 18), y = CL_SEA[1] + Math.sin(a) * (30 + j * 8) - j * 20, f = Math.sin(t / 140 + j * 2) * 2.4;
    g.beginPath(); g.moveTo(x - 6, y - f); g.quadraticCurveTo(x - 2.5, y - 2.5, x, y); g.quadraticCurveTo(x + 2.5, y - 2.5, x + 6, y - f); g.stroke();
  }
  g.globalAlpha = 1;
}

// ---------- жители: ходят по дорожкам между площадками ----------
// Сеть дорожек — узлы на перекрёстках между площадками (по центрам площадок CASTLE_XY) и рёбра вдоль дорожек;
// последний узел — у ворот. Листы фигурок gfx/life/*.png: строка 0 — идёт к зрителю вправо (юго-восток),
// строка 1 — от зрителя вправо (северо-восток); влево — то же, отражённое. 4 кадра шага.
const CL_ROADS = {"n":[[566,264],[469,317],[366,375],[743,279],[653,327],[558,379],[458,435],[361,490],[917,279],[832,339],[739,390],[646,441],[549,495],[453,550],[1092,265],[1010,328],[927,389],[834,443],[739,497],[642,553],[547,610],[1194,323],[1109,383],[1024,442],[931,496],[836,553],[738,609],[642,664],[1296,382],[1209,440],[1122,497],[1028,552],[934,607],[837,664],[1306,496],[1218,552],[1125,607],[1031,662],[822,748]],"e":[[0,4],[0,1],[1,5],[1,2],[2,6],[3,9],[3,4],[4,10],[4,5],[5,11],[5,6],[6,12],[6,7],[7,13],[8,15],[8,9],[9,16],[9,10],[10,17],[10,11],[11,18],[11,12],[12,19],[12,13],[13,20],[14,21],[14,15],[15,22],[15,16],[16,23],[16,17],[17,24],[17,18],[18,25],[18,19],[19,26],[19,20],[20,27],[21,28],[21,22],[22,29],[22,23],[23,30],[23,24],[24,31],[24,25],[25,32],[25,26],[26,33],[26,27],[28,29],[29,34],[29,30],[30,35],[30,31],[31,36],[31,32],[32,37],[32,33],[34,35],[35,36],[36,37],[33,38]],"gate":38};
const CL_SPR = { // fw, fh — кадр в листе; ax — точка ног по горизонтали; h — рост на фоне (точки картинки); rows — строк в листе
  man: { fw: 63, fh: 110, ax: 32, h: 31, rows: 2, v: 17 }, woman: { fw: 63, fh: 110, ax: 29, h: 30, rows: 2, v: 15 },
  guard: { fw: 56, fh: 110, ax: 33, h: 33, rows: 2, v: 16 }, cart: { fw: 98, fh: 110, ax: 29, h: 34, rows: 1, v: 13 },
  chicken: { fw: 76, fh: 60, ax: 28, h: 12, rows: 1, v: 9 },
};
const CL_NB = (() => { const m = CL_ROADS.n.map(() => []); for (const [a, b] of CL_ROADS.e) { m[a].push(b); m[b].push(a); } return m; })();
const CLW = { list: null, last: 0 };
const clRnd = (n) => Math.floor(Math.random() * n);
function clWalkersInit() {
  const nodes = CL_ROADS.n.length - 1; // без узла ворот
  const mk = (kind) => { const a = clRnd(nodes); return { kind, a, b: a, p: 1, dist: 0, wait: Math.random() * 3, x: CL_ROADS.n[a][0], y: CL_ROADS.n[a][1], fl: false, row: 0, alpha: 1 }; };
  CLW.list = ['man', 'woman', 'guard', 'man', 'woman', 'guard', 'cart'].map(mk);
  // куры — у фермы за стеной и у ворот: бродят рядом со своим местом и клюют
  for (const [cx, cy] of [[228, 200], [246, 210], [214, 214], [900, 740], [912, 752]]) CLW.list.push({ kind: 'chicken', cx, cy, x: cx, y: cy, tx: cx, ty: cy, wait: Math.random() * 2, peck: 0, fl: Math.random() < 0.5, dist: 0 });
}
// следующий узел: не назад (если есть выбор); тележка — только вниз по экрану (у неё нет кадров «от зрителя»)
function clNext(w) {
  let opts = CL_NB[w.b].filter((n) => n !== w.a);
  if (w.kind === 'cart') opts = CL_NB[w.b].filter((n) => CL_ROADS.n[n][1] > CL_ROADS.n[w.b][1]);
  if (!opts.length) opts = w.kind === 'cart' ? [] : CL_NB[w.b];
  return opts.length ? opts[clRnd(opts.length)] : -1;
}
function clWalkersStep(dt) {
  for (const w of CLW.list) {
    const S0 = CL_SPR[w.kind];
    if (w.kind === 'chicken') {
      if (w.wait > 0) { w.wait -= dt; w.peck += dt; continue; }
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d < 0.5) { w.wait = 1 + Math.random() * 3; w.peck = 0; const a = Math.random() * Math.PI * 2, r = Math.random() * 14; w.tx = w.cx + Math.cos(a) * r; w.ty = w.cy + Math.sin(a) * r * 0.55; continue; }
      const s = Math.min(d, S0.v * dt); w.x += dx / d * s; w.y += dy / d * s; w.dist += s; w.fl = dx < 0; continue;
    }
    if (w.wait > 0) { w.wait -= dt; continue; }
    if (w.p >= 1) { // дошёл до узла: иногда постоять, потом выбрать дорожку дальше
      if (w.kind !== 'cart' && Math.random() < 0.25 && !w.paused) { w.paused = true; w.wait = 1 + Math.random() * 4; continue; }
      w.paused = false;
      const n = clNext(w);
      if (n < 0) { // тележка доехала до низа — заново сверху (появляется у верхних дорожек)
        const tops = CL_ROADS.n.map((p, i) => [p[1], i]).filter(([y, i]) => i !== CL_ROADS.gate).sort((p, q) => p[0] - q[0]).slice(0, 6);
        const a = tops[clRnd(tops.length)][1]; Object.assign(w, { a, b: a, p: 1, x: CL_ROADS.n[a][0], y: CL_ROADS.n[a][1], wait: 2 + Math.random() * 4, alpha: 0 }); continue;
      }
      w.a = w.b; w.b = n; w.p = 0;
      const A = CL_ROADS.n[w.a], B = CL_ROADS.n[w.b]; w.len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      w.fl = B[0] < A[0]; w.row = S0.rows > 1 && B[1] < A[1] ? 1 : 0;
    }
    const A = CL_ROADS.n[w.a], B = CL_ROADS.n[w.b], s = S0.v * dt;
    w.p = Math.min(1, w.p + s / w.len); w.dist += s;
    w.x = A[0] + (B[0] - A[0]) * w.p; w.y = A[1] + (B[1] - A[1]) * w.p;
    w.alpha = Math.min(1, (w.alpha ?? 1) + dt * 1.5);
  }
}
// кадр фигурки; за зданиями, стоящими ближе к зрителю, фигурка прячется: поверх стирается картинкой самого здания
function clWalkersDraw(g) {
  const t = performance.now(); if (!CLW.list) clWalkersInit();
  const dt = Math.min(0.25, (t - (CLW.last || t)) / 1000); CLW.last = t; clWalkersStep(dt);
  const k = CASTLE_BG.w / CASTLE_BG.iw; // точки мира → точки картинки: делить на k
  const list = [...CLW.list].sort((p, q) => p.y - q.y);
  for (const w of list) {
    const S0 = CL_SPR[w.kind], im = pic(`life/${w.kind}.png`); if (!im) continue;
    const moving = w.kind === 'chicken' ? w.wait <= 0 : w.wait <= 0 && w.p < 1;
    let f = moving ? Math.floor(w.dist / (w.kind === 'chicken' ? 3 : 5.5)) % 4 : 0;
    if (w.kind === 'chicken') f = moving ? Math.floor(w.dist / 3) % 2 : 2 + (Math.floor(w.peck * 3) % 2);
    const sc = S0.h / (S0.fh * 0.92), dw = S0.fw * sc, dh = S0.fh * sc, ax = S0.ax * sc;
    g.save(); g.globalAlpha = w.alpha ?? 1; g.translate(w.x, w.y + 1); if (w.fl) g.scale(-1, 1);
    g.drawImage(im, f * S0.fw, (w.row || 0) * S0.fh, S0.fw, S0.fh, -ax, -dh, dw, dh); g.restore();
    // здания перед фигуркой (глубже на экране) и перекрывающие её — стереть фигурку их картинкой
    const L = w.x - dw, R = w.x + dw, T = w.y - dh;
    g.globalCompositeOperation = 'destination-out';
    for (const b of CB_REC) {
      const bx = b.x / k, by = b.y / k, bw = b.w / k, bh = b.h / k;
      if (b.d / k <= w.y || bx > R || bx + bw < L || by > w.y + 2 || by + bh < T) continue;
      g.drawImage(b.im, bx, by, bw, bh);
    }
    g.globalCompositeOperation = 'source-over';
  }
}
