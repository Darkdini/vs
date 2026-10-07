#!/usr/bin/env python3
"""Графика игры — в зашифрованные файлы (вызывается из tools/pack.sh для пакета игры, исходники web/ не трогает).

    python3 tools/gfxpack.py <папка game/web> <файл ключа>

Каждая картинка web/gfx и web/gfx3d (WebP-копия, если есть) шифруется отдельно (XOR с потоком xorshift32 от ключа и имени)
и кладётся в web/pk/<id>.bin, где id — отпечаток ключа и содержимого: неизменённая картинка в любой сборке получает
то же имя и те же байты. Поэтому приложение для Android (tools/build-apk.sh) может хранить графику у себя и брать её
без сети, а изменённая на сервере картинка получит новое имя и скачается.
Оглавление → web/pk/index.json ({files: {путь: [id, 0, длина, тип]}, bundles: {id: отпечаток файла}}).
Исходные файлы картинок из пакета удаляются: открыть их распаковкой пакета нельзя.
Ключ — постоянный (tools/pk.key; при первой сборке создаётся). Это не секрет: он и так виден в web/sw.js у каждого игрока,
шифр — защита только от простого копирования картинок из пакета. Пишется в файл ключа (для сервера) и в web/sw.js.
Расшифровка та же в server/src/gfxpack.js, web/sw.js и tools/android (приложение отдаёт файлы как есть, не расшифровывая).
"""
import sys, os, json, secrets, hashlib, struct

MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'}
KEYFILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pk.key')


def seed_of(key, n):
    h = 0x811C9DC5
    for ch in f'{key}:{n}'.encode():
        h = ((h ^ ch) * 0x01000193) & 0xFFFFFFFF
    return h or 1


def crypt(data, key, n):
    s = seed_of(key, n)
    pad = (-len(data)) % 4
    buf = bytearray(data) + b'\0' * pad
    words = struct.unpack(f'<{len(buf) // 4}I', buf)
    out = []
    for w in words:
        s ^= (s << 13) & 0xFFFFFFFF
        s ^= s >> 17
        s ^= (s << 5) & 0xFFFFFFFF
        out.append(w ^ s)
    return struct.pack(f'<{len(out)}I', *out)[:len(data)]


def stable_key():
    if not os.path.exists(KEYFILE):
        open(KEYFILE, 'w').write(secrets.token_hex(16))
    return open(KEYFILE).read().strip()


def main(web, keyfile):
    key = stable_key()
    items = []
    for top in ('gfx', 'gfx3d'):
        for dp, _, fs in os.walk(os.path.join(web, top)):
            for name in sorted(fs):
                low = name.lower()
                if low.endswith(('.png.webp', '.jpg.webp', '.jpeg.webp')):
                    continue
                ext = os.path.splitext(low)[1]
                if ext not in MIME:
                    continue
                p = os.path.join(dp, name)
                rel = os.path.relpath(p, web).replace(os.sep, '/')
                src, mime = p, MIME[ext]
                if os.path.exists(p + '.webp'):
                    src, mime = p + '.webp', 'image/webp'
                items.append((rel, src, mime, p))
    items.sort()
    os.makedirs(os.path.join(web, 'pk'), exist_ok=True)
    files, bundles, total = {}, {}, 0
    for rel, src, mime, orig in items:
        data = open(src, 'rb').read()
        fid = hashlib.md5(key.encode() + b':' + data).hexdigest()[:12]
        if fid not in bundles:
            enc = crypt(data, key, fid)
            open(os.path.join(web, 'pk', f'{fid}.bin'), 'wb').write(enc)
            bundles[fid] = hashlib.md5(enc).hexdigest()[:10]
            total += len(enc)
        files[rel] = [fid, 0, len(data), mime]
    json.dump({'kid': seed_of(key, 'check'), 'files': files, 'bundles': bundles}, open(os.path.join(web, 'pk', 'index.json'), 'w'), separators=(',', ':'))
    for _, src, _, orig in items:
        for f in {src, orig}:
            if os.path.exists(f):
                os.remove(f)
    for dp, ds, fs in os.walk(os.path.join(web), topdown=False):  # пустые папки
        if not os.listdir(dp):
            os.rmdir(dp)
    open(keyfile, 'w').write(key)
    sw = os.path.join(web, 'sw.js')
    if os.path.exists(sw):
        s = open(sw, encoding='utf-8').read().replace('__PK_KEY__', key)
        open(sw, 'w', encoding='utf-8').write(s)
    print(f'графика: {len(files)} картинок → {len(bundles)} зашифрованных файлов, {total / 1e6:.1f} МБ')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
