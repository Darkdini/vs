#!/usr/bin/env python3
"""Перенастраивает оригинальный J2ME-клиент «Третий Мир» на наш сервер.

Адрес сервера зашит в классе com/fenix/main/h.class:
  - хост — строковая константа "mmog1.com" (CONSTANT_Utf8 в пуле констант),
  - порт — инструкция `sipush 2500` в статическом инициализаторе.
Скрипт переписывает пул констант (длина строки может меняться — в class-файле нет абсолютных смещений
на пул) и порт, остальные файлы jar копирует без изменений. Подписи у jar нет. В MANIFEST только убираются пустые строки (см. fix_manifest).

    python3 tools/patch_client.py original.jar patched.jar --host 127.0.0.1 [--port 2500]

127.0.0.1 — если сервер запущен в Termux на том же телефоне, что и J2ME Loader.
IP в локальной сети (например 192.168.1.10) — если сервер на другом устройстве.
"""
import argparse
import struct
import sys
import zipfile

TARGET_CLASS = "com/fenix/main/h.class"
ORIGINAL_HOST = b"mmog1.com"
ORIGINAL_PORT = 2500

# размеры записей пула констант (tag -> байт после тега); Utf8 (1) обрабатывается отдельно
CP_SIZES = {3: 4, 4: 4, 5: 8, 6: 8, 7: 2, 8: 2, 9: 4, 10: 4, 11: 4, 12: 4, 15: 3, 16: 2, 17: 4, 18: 4, 19: 2, 20: 2}


def patch_class(data: bytes, host: str, port: int) -> bytes:
    if data[:4] != b"\xca\xfe\xba\xbe":
        raise ValueError("not a class file")
    count = struct.unpack(">H", data[8:10])[0]
    out = bytearray(data[:10])
    pos, i, replaced = 10, 1, 0
    while i < count:
        tag = data[pos]
        if tag == 1:
            ln = struct.unpack(">H", data[pos + 1:pos + 3])[0]
            s = data[pos + 3:pos + 3 + ln]
            if s == ORIGINAL_HOST:
                s = host.encode("ascii")
                replaced += 1
            out += bytes([1]) + struct.pack(">H", len(s)) + s
            pos += 3 + ln
        else:
            size = CP_SIZES[tag]
            out += data[pos:pos + 1 + size]
            pos += 1 + size
            if tag in (5, 6):  # long/double занимают два слота
                i += 1
        i += 1
    if replaced != 1:
        raise ValueError(f"host constant {ORIGINAL_HOST!r} found {replaced} times (expected 1) — другая версия клиента?")
    rest = bytearray(data[pos:])
    if port != ORIGINAL_PORT:
        if not 1 <= port <= 32767:
            raise ValueError("порт должен быть 1..32767 (ограничение инструкции sipush)")
        needle = bytes([0x11]) + struct.pack(">h", ORIGINAL_PORT)  # sipush 2500
        if rest.count(needle) != 1:
            raise ValueError("не найдена ровно одна инструкция sipush 2500")
        idx = rest.index(needle)
        rest[idx + 1:idx + 3] = struct.pack(">h", port)
    return bytes(out + rest)


def fix_manifest(data: bytes) -> bytes:
    """Убирает пустые строки внутри манифеста (в оригинале строка Adapted-By идёт после пустой строки,
    из-за чего настольная Java и некоторые эмуляторы не читают jar). Телефону это не мешает."""
    lines = [l for l in data.replace(b"\r\n", b"\n").split(b"\n") if l.strip()]
    return b"\r\n".join(lines) + b"\r\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--host", required=True)
    ap.add_argument("--port", type=int, default=ORIGINAL_PORT)
    a = ap.parse_args()
    with zipfile.ZipFile(a.src) as zin, zipfile.ZipFile(a.dst, "w", zipfile.ZIP_DEFLATED) as zout:
        names = zin.namelist()
        if TARGET_CLASS not in names:
            sys.exit(f"{TARGET_CLASS} не найден — это не клиент «Третий Мир»?")
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == TARGET_CLASS:
                data = patch_class(data, a.host, a.port)
            elif info.filename == "META-INF/MANIFEST.MF":
                data = fix_manifest(data)
            zout.writestr(info, data)
    print(f"готово: {a.dst} -> {a.host}:{a.port}")


if __name__ == "__main__":
    main()
