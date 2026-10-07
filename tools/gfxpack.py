#!/usr/bin/env python3
"""Графика игры — в зашифрованные листы (вызывается из tools/pack.sh для пакета игры, исходники web/ не трогает).

    python3 tools/gfxpack.py <папка game/web> <файл ключа>

Каждая картинка web/gfx и web/gfx3d (WebP-копия, если есть) шифруется отдельно (LIMIT = 0; больше — склейка в листы по папкам),
каждый файл шифруется (XOR с потоком xorshift32 от ключа и номера листа) → web/pk/<n>.bin,
оглавление → web/pk/index.json ({files: {путь: [лист, смещение, длина, тип]}, bundles: [отпечаток…]}).
Исходные файлы картинок из пакета удаляются: открыть их распаковкой пакета нельзя.
Ключ — случайный на каждую сборку: пишется в файл ключа (для сервера) и в web/sw.js (помощник кэша расшифровывает листы).
Расшифровка та же в server/src/gfxpack.js и web/sw.js.
"""
import sys, os, json, secrets, hashlib, struct

MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'}
LIMIT = 0  # каждая картинка — свой файл: телефон качает только нужные (листы по 1,5 МБ тянули лишние мегабайты и тормозили загрузку)


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


def main(web, keyfile):
    key = secrets.token_hex(16)
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
                group = '/'.join(rel.split('/')[:2]) if rel.count('/') >= 2 else rel.split('/')[0]
                items.append((group, rel, src, mime, p))
    items.sort(key=lambda t: (t[0], t[1]))
    os.makedirs(os.path.join(web, 'pk'), exist_ok=True)
    files, bundles, cur, cur_g, n = {}, [], bytearray(), None, 0

    def flush():
        nonlocal cur, n
        if not cur:
            return
        enc = crypt(bytes(cur), key, n)
        open(os.path.join(web, 'pk', f'{n}.bin'), 'wb').write(enc)
        bundles.append(hashlib.md5(enc).hexdigest()[:10])
        cur = bytearray(); n += 1

    for group, rel, src, mime, orig in items:
        data = open(src, 'rb').read()
        if cur and (group != cur_g or len(cur) + len(data) > LIMIT):
            flush()
        cur_g = group
        files[rel] = [n, len(cur), len(data), mime]
        cur += data
    flush()
    json.dump({'kid': seed_of(key, 'check'), 'files': files, 'bundles': bundles}, open(os.path.join(web, 'pk', 'index.json'), 'w'), separators=(',', ':'))
    for _, _, src, _, orig in items:
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
    total = sum(os.path.getsize(os.path.join(web, 'pk', f'{i}.bin')) for i in range(n))
    print(f'листы: {len(files)} картинок → {n} зашифрованных листов, {total / 1e6:.1f} МБ')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
