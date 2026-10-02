#!/usr/bin/env python3
# Облегчённые копии картинок для сервера: рядом с x.png / x.jpg кладёт x.png.webp (если она заметно меньше).
# Сервер (server/src/web.js) отдаёт её браузерам, которые понимают WebP; имена файлов в коде не меняются.
# Крупные картинки (>= 60 КБ) — с потерями (качество 84, почти незаметно), JPG — 72 (фото-фоны), мелкие — без потерь.
# Готовые копии кэшируются по содержимому (~/.cache/war-webp), повторная сборка — быстрая.
import sys, os, io, hashlib
from PIL import Image
root = sys.argv[1]
cache = os.path.join(os.path.expanduser('~'), '.cache', 'war-webp'); os.makedirs(cache, exist_ok=True)
n = saved = 0
for dp, _, fs in os.walk(root):
    for name in fs:
        if not name.lower().endswith(('.png', '.jpg', '.jpeg')): continue
        f = os.path.join(dp, name); data = open(f, 'rb').read()
        if len(data) < 8000: continue
        key = hashlib.md5(data + b'v2').hexdigest(); cf = os.path.join(cache, key + '.webp')
        if not os.path.exists(cf):
            try:
                im = Image.open(io.BytesIO(data)); b = io.BytesIO()
                if len(data) >= 60000 or name.lower().endswith(('.jpg', '.jpeg')):
                    if im.mode in ('RGBA', 'LA', 'P'): im.convert('RGBA').save(b, 'WEBP', quality=84, method=5, alpha_quality=90)
                    else: im.convert('RGB').save(b, 'WEBP', quality=72 if name.lower().endswith(('.jpg', '.jpeg')) else 84, method=5)
                else: (im.convert('RGBA') if im.mode in ('P', 'LA') else im).save(b, 'WEBP', lossless=True, method=5)
                out = b.getvalue()
            except Exception: out = b''
            open(cf, 'wb').write(out)
        out = open(cf, 'rb').read()
        if out and len(out) < len(data) * 0.9:
            open(f + '.webp', 'wb').write(out); n += 1; saved += len(data) - len(out)
print(f'webp: {n} копий, экономия {saved / 1e6:.1f} МБ')
