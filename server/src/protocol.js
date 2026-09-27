'use strict';
// Бинарный протокол клиента «Третий Мир» (J2ME, 2009).
// Кадр FLAP:  0x2A | channel u8 | seq u16 | len u16 | payload[len]
// Payload SNAC: group u16 | sub u16 | data (обычно список TLV)
// TLV:          type u16 | len u16 | value[len]
// Все числа big-endian, строки — cp1251.
// Подробно: docs/04-protocol.md

const FLAP_START = 0x2a;

// ---------- cp1251 (ровно та же таблица, что в клиенте: g.a(String) / g.b(byte[])) ----------
const SPECIAL_TO_BYTE = { 'Ё': 0xa8, 'ё': 0xb8, 'Ґ': 0xa5, 'Є': 0xaa, 'Ї': 0xaf, 'І': 0xb2, 'і': 0xb3, 'ґ': 0xb4, 'є': 0xba, 'ї': 0xbf };
// Остальные символы вне ASCII/кириллицы клиент не знает — заменяем на '?'.
const BYTE_TO_SPECIAL = Object.fromEntries(Object.entries(SPECIAL_TO_BYTE).map(([c, b]) => [b, c]));

const ASCII_FALLBACK = { '—': '-', '–': '-', '«': '"', '»': '"', '№': 'N', '…': '...' };

function encodeText(str) {
  str = str.replace(/[—–«»№…]/g, (ch) => ASCII_FALLBACK[ch]);
  const out = Buffer.alloc(str.length);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (SPECIAL_TO_BYTE[ch] !== undefined) out[i] = SPECIAL_TO_BYTE[ch];
    else if (code >= 0x410 && code <= 0x44f) out[i] = code - 0x410 + 0xc0;
    else if (code < 0x80) out[i] = code;
    else out[i] = 0x3f; // '?'
  }
  return out;
}

function decodeText(buf) {
  let s = '';
  for (const b of buf) {
    if (BYTE_TO_SPECIAL[b]) s += BYTE_TO_SPECIAL[b];
    else if (b >= 0xc0) s += String.fromCharCode(b - 0xc0 + 0x410);
    else s += String.fromCharCode(b);
  }
  return s;
}

// ---------- примитивы ----------
const u8 = (n) => Buffer.from([n & 0xff]);
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const i8 = (n) => { const b = Buffer.alloc(1); b.writeInt8(n); return b; };
const cat = (...parts) => Buffer.concat(parts.map((p) => (typeof p === 'string' ? encodeText(p) : p)));

function tlv(type, value = Buffer.alloc(0)) {
  const v = typeof value === 'string' ? encodeText(value) : value;
  return Buffer.concat([u16(type), u16(v.length), v]);
}

function parseTlvs(buf) {
  const list = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    const type = buf.readUInt16BE(off);
    const len = buf.readUInt16BE(off + 2);
    if (off + 4 + len > buf.length) break;
    list.push({ type, value: buf.subarray(off + 4, off + 4 + len) });
    off += 4 + len;
  }
  return list;
}

const tlvMap = (buf) => Object.fromEntries(parseTlvs(buf).map((t) => [t.type, t.value]));

// ---------- кадры ----------
// seq: младший байт seq у входящих пакетов клиент трактует как «ответ получен» (гасит индикатор ожидания),
// поэтому на канале 2 всегда шлём seq = 1.
function flap(channel, payload, seq = 1) {
  return Buffer.concat([Buffer.from([FLAP_START, channel]), u16(seq), u16(payload.length), payload]);
}

function snac(channel, group, sub, data = Buffer.alloc(0)) {
  return flap(channel, Buffer.concat([u16(group), u16(sub), data]));
}

// Потоковый разборщик входящих байтов → пакеты { channel, seq, group, sub, data }
class FlapReader {
  constructor() { this.buf = Buffer.alloc(0); }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const packets = [];
    while (this.buf.length >= 6) {
      if (this.buf[0] !== FLAP_START) throw new Error(`bad FLAP start byte 0x${this.buf[0].toString(16)}`);
      const len = this.buf.readUInt16BE(4);
      if (this.buf.length < 6 + len) break;
      const channel = this.buf[1];
      const seq = this.buf.readUInt16BE(2);
      const payload = this.buf.subarray(6, 6 + len);
      this.buf = this.buf.subarray(6 + len);
      const p = { channel, seq, payload };
      if (payload.length >= 4) {
        p.group = payload.readUInt16BE(0);
        p.sub = payload.readUInt16BE(2);
        p.data = payload.subarray(4);
      }
      packets.push(p);
    }
    return packets;
  }
}

module.exports = { encodeText, decodeText, u8, u16, u32, i8, cat, tlv, parseTlvs, tlvMap, flap, snac, FlapReader };
