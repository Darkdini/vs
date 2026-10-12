#!/usr/bin/env python3
# Значки игры из герба (web/icon-512.png — герб на прозрачном фоне). Запуск: python3 tools/icons.py
#   web/icon-maskable-192.png, web/icon-maskable-512.png — ярлык и установка из Chrome на Android: телефон обрезает
#     значок кругом или «капсулой», поэтому герб — в безопасной зоне на тёмном фоне с золотым свечением
#   web/apple-touch-icon.png (180) — iPhone и плитки на новой вкладке Chrome; web/favicon-48.png — вкладка браузера
#   tools/android/res/mipmap-*/ic_launcher_{foreground,background}.png + mipmap-anydpi-v26/ic_launcher.xml —
#     значок приложения на Android 8+ (адаптивный: фон + герб); старый ic_launcher.png остаётся для Android 7
import math, os
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
WEB = os.path.join(ROOT, 'web')
RES = os.path.join(ROOT, 'tools', 'android', 'res')
CENTER, EDGE = (104, 72, 28), (18, 13, 8)  # тёплое золотое свечение в центре → почти чёрный край (цвет игры #1b1610)

src = Image.open(os.path.join(WEB, 'icon-512.png')).convert('RGBA')
alpha = src.getchannel('A').load()
# насколько герб выходит от центра (в долях стороны): по этому числу он вписывается в нужный круг
reach = max(math.hypot(x + 0.5 - src.width / 2, y + 0.5 - src.height / 2) / src.width
            for y in range(src.height) for x in range(src.width) if alpha[x, y] > 40)


def background(size):
    g = Image.radial_gradient('L').resize((size, size), Image.LANCZOS)  # 0 в центре → 255 у края
    g = g.point(lambda v: min(255, int(v * 1.15)))
    return Image.composite(Image.new('RGBA', (size, size), EDGE + (255,)), Image.new('RGBA', (size, size), CENTER + (255,)), g)


def emblem(size, radius, shadow=True):
    """Герб на прозрачном холсте size×size; самая дальняя точка герба — на radius (доля стороны) от центра."""
    side = max(1, round(size * radius / reach))
    e = src.resize((side, side), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pos = ((size - side) // 2, (size - side) // 2)
    if shadow:  # мягкая тень под гербом — отделяет его от фона
        sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        sh.paste(Image.new('RGBA', (side, side), (0, 0, 0, 150)), (pos[0], pos[1] + max(1, size // 100)), e.getchannel('A'))
        out = Image.alpha_composite(out, sh.filter(ImageFilter.GaussianBlur(max(1, size / 60))))
    out.alpha_composite(e, pos)
    return out


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    print(f'{os.path.relpath(path, ROOT)}: {im.width}×{im.height}, {os.path.getsize(path) // 1024} КБ')


# Chrome/Android: круг-маска показывает радиус 0.5, безопасная зона любой формы — 0.4; герб до 0.46 — кончики мечей
# могут чуть срезаться только у «капли» и квадрата со скруглением
for s in (192, 512):
    save(Image.alpha_composite(background(s), emblem(s, 0.46)), os.path.join(WEB, f'icon-maskable-{s}.png'))
save(Image.alpha_composite(background(180), emblem(180, 0.49)).convert('RGB'), os.path.join(WEB, 'apple-touch-icon.png'))
save(emblem(48, 0.58, shadow=False), os.path.join(WEB, 'favicon-48.png'))

# Android 8+: холст 108dp, видно 72dp (радиус 0.333), безопасный круг 66dp (0.306)
for d, k in (('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)):
    s = round(108 * k)
    save(emblem(s, 0.325), os.path.join(RES, f'mipmap-{d}', 'ic_launcher_foreground.png'))
    save(background(s), os.path.join(RES, f'mipmap-{d}', 'ic_launcher_background.png'))
os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
with open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'w', encoding='utf-8') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
            '</adaptive-icon>\n')
print('tools/android/res/mipmap-anydpi-v26/ic_launcher.xml')
