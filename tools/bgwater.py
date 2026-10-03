#!/usr/bin/env python3
# Кадры течения воды для фона замка (web/gfx/ground/bg/water_N.webp).
# Маска воды — синие (и белая пена у водопада) пиксели castle.jpg. Направление течения — вниз по реке:
# если вода уходит за нижний край — течёт к этому выходу; иначе — от своей самой верхней точки вниз.
# Каждый кадр сдвигает рисунок воды вдоль течения (два слоя со сдвигом на полпериода, плавное зацикливание).
# Запуск: python3 tools/bgwater.py web/gfx/ground/bg/castle.jpg web/gfx/ground/bg  → печатает x y для CASTLE_BG.water
import sys
from collections import deque
import numpy as np
from PIL import Image
from scipy import ndimage as nd

N, L = 12, 14  # кадров, длина сдвига за цикл (px)
src, out = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
blue = (b > r + 30) & (b > g + 5) & (b > 90)
white = (r > 170) & (g > 190) & (b > 200) & (b >= r)
m = blue | (white & nd.binary_dilation(blue, iterations=8))
m = nd.binary_closing(nd.binary_opening(m, iterations=1), iterations=2)
lab, n = nd.label(m)
sz = nd.sum(m, lab, range(1, n + 1))
keep = [i + 1 for i, s in enumerate(sz) if s > 400]
m = np.isin(lab, keep)
H, W = m.shape
# расстояние от истока внутри воды (BFS, 8 соседей)
dist = np.full((H, W), -1.0)
sign = np.ones((H, W))
for k in keep:
    comp = lab == k
    ys, xs = np.nonzero(comp)
    bot = ys == H - 1  # вода уходит за нижний край — течёт к этому выходу (оба рукава реки)
    if bot.any(): seeds = list(zip(ys[bot], xs[bot])); sign[comp] = -1
    else: i = np.argmin(ys); seeds = [(ys[i], xs[i])]  # иначе — от самой верхней точки вниз
    q = deque(seeds)
    for y, x in seeds: dist[y, x] = 0
    while q:
        y, x = q.popleft(); d = dist[y, x]
        for dy, dx, w in ((1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1.41), (1, -1, 1.41), (-1, 1, 1.41), (-1, -1, 1.41)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and dist[yy, xx] < 0:
                dist[yy, xx] = d + w; q.append((yy, xx))
dd = np.where(dist < 0, 0, dist)
ds = nd.gaussian_filter(dd, 6)
gy, gx = np.gradient(ds)
wm = nd.gaussian_filter(m.astype(float), 6) + 1e-6
gx = nd.gaussian_filter(gx * m, 8) / wm; gy = nd.gaussian_filter(gy * m, 8) / wm
nrm = np.hypot(gx, gy) + 1e-6; fx, fy = gx / nrm * sign, gy / nrm * sign
Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
alpha = nd.gaussian_filter(nd.binary_erosion(m, iterations=2).astype(float), 1.5)  # мягкий край — берега не плывут
ys, xs = np.nonzero(alpha > 0.02); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
def sample(off):
    sx, sy = X - fx * off, Y - fy * off
    return np.stack([nd.map_coordinates(im[..., c], [sy, sx], order=1, mode='nearest') for c in range(3)], -1)
for f in range(N):
    t = f / N
    a = sample(t * L); bb = sample((t - 1) * L)
    wa = 1 - abs(2 * t - 1)  # треугольная смесь двух фаз — без рывка на стыке цикла
    c1 = sample(((t + 0.5) % 1) * L)
    w1 = abs(2 * t - 1)
    fr = (a * 0.5 + bb * 0.5) * wa + c1 * w1
    rgba = np.dstack([np.clip(fr, 0, 255), alpha * 255]).astype(np.uint8)[y0:y1, x0:x1]
    Image.fromarray(rgba, 'RGBA').save(f'{out}/water_{f}.webp', quality=80, method=6)
print(int(x0), int(y0))
