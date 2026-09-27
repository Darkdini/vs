#!/usr/bin/env python3
"""Перенастраивает Android-клиент «Третий Мир: Война Королей 3D» на свой сервер и заново подписывает APK.

Адрес сервера клиент берёт из файла assets/conect.conf внутри APK:
    G socket://mmog1.com:5005|socket://mmog2.com:5005
(первый символ — режим, дальше список серверов через «|»). Скрипт заменяет этот файл,
пересобирает zip (без изменения остальных файлов, с выравниванием несжатых записей по 4 байтам)
и подписывает APK схемами v1 (JAR) и v2 — без Android SDK, только Python + cryptography.

    python3 tools/repack_apk.py original.apk tw_local.apk --host 127.0.0.1 [--port 5005]

Ключ подписи создаётся один раз в ~/.tw-repack/ и переиспользуется, чтобы новые сборки ставились поверх старых.
Оригинальное приложение (подписано Fenix-Soft) перед установкой нужно удалить — подписи разные.

Termux:  pkg install python python-cryptography
"""
import argparse
import base64
import datetime
import hashlib
import os
import struct
import sys
import zlib

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID

CONF = "assets/conect.conf"
KEY_DIR = os.path.expanduser(os.environ.get("TW_REPACK_KEYS", "~/.tw-repack"))


# ---------------------------------------------------------------- zip ----------------------------------------------------------------
class Entry:
    __slots__ = ("name", "method", "flags", "crc", "csize", "usize", "data", "time", "date", "attr")


def read_zip(buf):
    eocd = buf.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise ValueError("не zip-файл")
    count, cd_size, cd_off = struct.unpack("<HII", buf[eocd + 10:eocd + 20])
    entries, off = [], cd_off
    for _ in range(count):
        if buf[off:off + 4] != b"PK\x01\x02":
            raise ValueError("битый central directory")
        (flags, method, time, date, crc, csize, usize, nlen, xlen, clen, _, _, attr, loff) = struct.unpack(
            "<HHHHIIIHHHHHII", buf[off + 8:off + 46])
        name = buf[off + 46:off + 46 + nlen].decode("utf-8")
        lnlen, lxlen = struct.unpack("<HH", buf[loff + 26:loff + 30])
        start = loff + 30 + lnlen + lxlen
        e = Entry()
        e.name, e.method, e.flags, e.crc, e.csize, e.usize = name, method, flags & ~0x08, crc, csize, usize
        e.data, e.time, e.date, e.attr = buf[start:start + csize], time, date, attr
        entries.append(e)
        off += 46 + nlen + xlen + clen
    return entries


def raw_content(e):
    if e.method == 0:
        return e.data
    return zlib.decompress(e.data, -15)


def make_entry(name, content, template=None, method=8):
    e = Entry()
    e.name, e.flags, e.usize, e.crc = name, 0, len(content), zlib.crc32(content) & 0xFFFFFFFF
    if template is not None:
        method, e.time, e.date, e.attr = template.method, template.time, template.date, template.attr
    else:
        e.time, e.date, e.attr = 0, (1981 - 1980) << 9 | 1 << 5 | 1, 0
    e.method = method
    if method == 0:
        e.data = content
    else:
        co = zlib.compressobj(9, zlib.DEFLATED, -15)
        e.data = co.compress(content) + co.flush()
    e.csize = len(e.data)
    return e


def write_zip(entries):
    """Возвращает (байты записей, байты central directory). Несжатые записи выравниваются по 4 байтам (как zipalign)."""
    body, cd = bytearray(), bytearray()
    for e in entries:
        name = e.name.encode("utf-8")
        offset = len(body)
        extra = b""
        if e.method == 0:
            pad = (-(offset + 30 + len(name))) % 4
            extra = b"\x00" * pad
        body += struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, e.flags, e.method, e.time, e.date, e.crc, e.csize, e.usize,
                            len(name), len(extra)) + name + extra + e.data
        cd += struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, e.flags, e.method, e.time, e.date, e.crc, e.csize,
                          e.usize, len(name), 0, 0, 0, 0, e.attr, offset) + name
    return bytes(body), bytes(cd)


def eocd(count, cd_size, cd_off):
    return struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, count, count, cd_size, cd_off, 0)


# ---------------------------------------------------------------- ключ ----------------------------------------------------------------
def load_or_create_key():
    os.makedirs(KEY_DIR, exist_ok=True)
    kp, cp = os.path.join(KEY_DIR, "key.pem"), os.path.join(KEY_DIR, "cert.pem")
    if os.path.exists(kp) and os.path.exists(cp):
        key = serialization.load_pem_private_key(open(kp, "rb").read(), None)
        cert = x509.load_pem_x509_certificate(open(cp, "rb").read())
        return key, cert
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TW local test"), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "vs")])
    now = datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now)
            .not_valid_after(now + datetime.timedelta(days=365 * 40)).sign(key, hashes.SHA256()))
    open(kp, "wb").write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    os.chmod(kp, 0o600)
    open(cp, "wb").write(cert.public_bytes(serialization.Encoding.PEM))
    print(f"создан ключ подписи: {KEY_DIR}")
    return key, cert


# ---------------------------------------------------------------- v1 (JAR) ----------------------------------------------------------------
def _manifest_line(k, v):
    line = f"{k}: {v}".encode("utf-8")
    out, first = [], True
    while line:
        n = 72 if first else 71
        out.append((b"" if first else b" ") + line[:n])
        line, first = line[n:], False
    return b"\r\n".join(out) + b"\r\n"


def is_sig_file(name):
    u = name.upper()
    return u.startswith("META-INF/") and (u == "META-INF/MANIFEST.MF" or u.endswith((".SF", ".RSA", ".DSA", ".EC")) or u.startswith("META-INF/SIG-"))


def sign_v1(entries, key, cert):
    b64 = lambda d: base64.b64encode(d).decode()
    main = _manifest_line("Manifest-Version", "1.0") + _manifest_line("Created-By", "1.0 (tw-repack)") + b"\r\n"
    sf_sections = []
    manifest = bytearray(main)
    for e in entries:
        if e.name.endswith("/"):
            continue
        section = _manifest_line("Name", e.name) + _manifest_line("SHA-256-Digest", b64(hashlib.sha256(raw_content(e)).digest())) + b"\r\n"
        manifest += section
        sf_sections.append(_manifest_line("Name", e.name) + _manifest_line("SHA-256-Digest", b64(hashlib.sha256(section).digest())) + b"\r\n")
    manifest = bytes(manifest)
    sf = (_manifest_line("Signature-Version", "1.0") + _manifest_line("Created-By", "1.0 (tw-repack)")
          + _manifest_line("SHA-256-Digest-Manifest", b64(hashlib.sha256(manifest).digest()))
          + _manifest_line("SHA-256-Digest-Manifest-Main-Attributes", b64(hashlib.sha256(main).digest()))
          + _manifest_line("X-Android-APK-Signed", "2") + b"\r\n" + b"".join(sf_sections))
    rsa_blob = (pkcs7.PKCS7SignatureBuilder().set_data(sf).add_signer(cert, key, hashes.SHA256())
                .sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.NoCapabilities]))
    return [make_entry("META-INF/MANIFEST.MF", manifest), make_entry("META-INF/TWLOCAL.SF", sf), make_entry("META-INF/TWLOCAL.RSA", rsa_blob)]


# ---------------------------------------------------------------- v2 ----------------------------------------------------------------
def lp(b):
    return struct.pack("<I", len(b)) + b


def chunked_digest(sections):
    digests = []
    for s in sections:
        for i in range(0, len(s), 1 << 20):
            c = s[i:i + (1 << 20)]
            digests.append(hashlib.sha256(b"\xa5" + struct.pack("<I", len(c)) + c).digest())
    return hashlib.sha256(b"\x5a" + struct.pack("<I", len(digests)) + b"".join(digests)).digest()


def sign_v2(body, cd, count, key, cert):
    ALGO = 0x0103  # RSASSA-PKCS1-v1_5 + SHA2-256
    digest = chunked_digest([body, cd, eocd(count, len(cd), len(body))])
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    signed_data = lp(lp(struct.pack("<I", ALGO) + lp(digest))) + lp(lp(cert_der)) + lp(b"")
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    pub = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signer = lp(signed_data) + lp(lp(struct.pack("<I", ALGO) + lp(sig))) + lp(pub)
    value = lp(lp(signer))
    pair = struct.pack("<Q", 4 + len(value)) + struct.pack("<I", 0x7109871A) + value
    size = len(pair) + 8 + 16
    block = struct.pack("<Q", size) + pair + struct.pack("<Q", size) + b"APK Sig Block 42"
    return body + block + cd + eocd(count, len(cd), len(body) + len(block))


# ---------------------------------------------------------------- main ----------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--host", required=True, help="адрес сервера, например 127.0.0.1 (Termux на том же телефоне)")
    ap.add_argument("--port", type=int, default=5005)
    ap.add_argument("--mode", default=None, help="первый символ conect.conf (по умолчанию — как в оригинале)")
    a = ap.parse_args()

    entries = read_zip(open(a.src, "rb").read())
    names = [e.name for e in entries]
    if CONF not in names:
        sys.exit(f"{CONF} не найден — это не клиент «Третий Мир 3D»?")
    old = raw_content(entries[names.index(CONF)]).decode("latin1")
    mode = a.mode or old[:1]
    url = f"socket://{a.host}:{a.port}"
    new_conf = f"{mode}{url}|{url}".encode("latin1")
    print(f"conect.conf: {old!r} -> {new_conf.decode()!r}")

    out = []
    for e in entries:
        if is_sig_file(e.name):
            continue  # старую подпись Fenix-Soft убираем
        if e.name == CONF:
            e = make_entry(CONF, new_conf, template=e)
        out.append(e)
    key, cert = load_or_create_key()
    out = sign_v1(out, key, cert) + out
    body, cd = write_zip(out)
    open(a.dst, "wb").write(sign_v2(body, cd, len(out), key, cert))
    print(f"готово: {a.dst} ({os.path.getsize(a.dst)} байт), подпись v1+v2")


if __name__ == "__main__":
    main()
