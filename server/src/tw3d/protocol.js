'use strict';
// Протокол Android-клиента «Третий Мир: Война Королей 3D» (start.browser.gameTWWK 2.0.112, протокол v56).
// Восстановлен декомпиляцией (классы h.b/h.a — рамки, y.b/y.c — поток, J1.b — реестр типов, i.i — сообщение).
// Подробно: docs/06-protocol-3d.md
//
// Соединение:  C→S  [56, 15]           (версия протокола клиента, 15)
//              S→C  [ver, minVer]       (клиент использует min(ver, 56); если minVer > 56 — «клиент устарел»)
// Пакет:       [канал u8][длина varint][payload]
// payload:     [compressed bool][заголовок][тело]
// заголовок:   u32 длина таблицы шрифтов/фонов (0 → дальше varint 0, varint 0)
// тело канала 0 — сообщение i.i: int32 категория, int32 команда, типизированный объект

const PROTO = 56;

// ---------- имена команд: 6 символов в число (o.c.b / o.c.a клиента) ----------
function nameHash(s) {
  let sum = 0n, mul = 1n;
  for (let i = 0; i < s.length && i < 6; i++) {
    const c = s.charCodeAt(i);
    let v;
    if (c >= 97 && c <= 122) v = c - 96;
    else if (c >= 65 && c <= 90) v = c - 64;
    else if (c >= 48 && c <= 57) v = c - 21;
    else if (c === 58) v = 37;
    else if (c === 92) v = 38;
    else v = 39;
    sum += BigInt(v) * mul;
    mul *= 40n;
  }
  return Number(BigInt.asIntN(32, -2147483648n + sum));
}

function nameOf(n) {
  let l = BigInt(n) + 2147483648n, s = '';
  while (l !== 0n) {
    const c = Number(l % 40n);
    if (c === 0) break;
    if (c <= 26) s += String.fromCharCode(c + 64);
    else if (c <= 36) s += String.fromCharCode(c + 21);
    else if (c === 37) s += ':';
    else if (c === 38) s += '\\';
    else s += '_';
    l /= 40n;
  }
  return s;
}

// ---------- запись ----------
class Writer {
  constructor() { this.parts = []; }
  u8(n) { this.parts.push(Buffer.from([n & 0xff])); return this; }
  bool(b) { return this.u8(b ? 1 : 0); }
  i32(n) { const b = Buffer.alloc(4); b.writeInt32BE(n | 0); this.parts.push(b); return this; }
  i16(n) { const b = Buffer.alloc(2); b.writeInt16BE(n); this.parts.push(b); return this; }
  // число переменной длины (y.c.d): 0..249 → 1 байт (n-128), <65536 → 126 + short(n-32768), иначе 127 + int
  varint(n) {
    if (n >= 0 && n < 250) return this.u8(n - 128);
    if (n >= 0 && n < 65536) { this.u8(126); return this.i16(n - 32768); }
    this.u8(127); return this.i32(n);
  }
  // строка: varint длина + UTF-16BE (протокол > 27); null/пусто → 0
  str(s) {
    if (s === null || s === undefined || s === '') return this.varint(0);
    this.varint(s.length);
    const b = Buffer.alloc(s.length * 2);
    for (let i = 0; i < s.length; i++) b.writeUInt16BE(s.charCodeAt(i), i * 2);
    this.parts.push(b);
    return this;
  }
  char(c) { const b = Buffer.alloc(2); b.writeUInt16BE(c.charCodeAt(0)); this.parts.push(b); return this; }
  // типизированный объект (J1.b.g)
  value(v) {
    if (v === null || v === undefined) return this.u8(-1);
    if (typeof v === 'string') return this.u8(8).str(v);
    if (typeof v === 'boolean') return this.u8(12).bool(v);
    if (typeof v === 'number') return this.u8(1).i32(v);
    if (Array.isArray(v)) { this.u8(5).i32(v.length); v.forEach((x) => this.value(x)); return this; }
    if (v instanceof Dict) {
      this.u8(28).varint(v.map.size);
      for (const [k, x] of v.map) { this.i32(k); this.value(x); }
      return this;
    }
    if (v instanceof Command) { this.u8(7).i32(v.cat).i32(v.cmd).value(v.arg).char(v.target); return this; }
    if (v instanceof Raw) { this.u8(v.type); this.parts.push(v.bytes); return this; }
    throw new Error(`не умею сериализовать ${typeof v}`);
  }
  bytes() { return Buffer.concat(this.parts); }
}

// словарь i.l (ключи — хеши имён)
class Dict {
  constructor(obj = {}) { this.map = new Map(); for (const [k, v] of Object.entries(obj)) this.map.set(nameHash(k), v); }
}
// команда-ссылка w.d: target 's' сервер, 'g' клиент (глобально), 'l' текущее окно, 't' таймер
class Command {
  constructor(target, cat, cmd, arg = null) { this.target = target; this.cat = nameHash(cat); this.cmd = nameHash(cmd); this.arg = arg; }
}
class Raw { constructor(type, bytes) { this.type = type; this.bytes = bytes; } }

// ---------- чтение ----------
class Reader {
  constructor(buf) { this.buf = buf; this.off = 0; }
  u8() { return this.buf[this.off++]; }
  i8() { return this.buf.readInt8(this.off++); }
  bool() { return this.u8() !== 0; }
  i32() { const v = this.buf.readInt32BE(this.off); this.off += 4; return v; }
  u32() { const v = this.buf.readUInt32BE(this.off); this.off += 4; return v; }
  i16() { const v = this.buf.readInt16BE(this.off); this.off += 2; return v; }
  varint() {
    const b = this.i8();
    if (b === 126) return this.i16() + 32768;
    if (b === 127) return this.i32();
    return b + 128;
  }
  str() {
    const n = this.varint();
    if (n === 0) return null;
    let s = '';
    for (let i = 0; i < n; i++) { s += String.fromCharCode(this.buf.readUInt16BE(this.off)); this.off += 2; }
    return s;
  }
  char() { const c = String.fromCharCode(this.buf.readUInt16BE(this.off)); this.off += 2; return c; }
  // заголовок пакета (y.b.e): таблицы шрифтов и фонов
  header() {
    const len = this.u32();
    if (len > 0) { this.off += len; return { fonts: '?', skipped: len }; }
    const fonts = this.varint();
    const bgs = this.varint();
    if (fonts || bgs) throw new Error(`таблицы шрифтов/фонов в пакете клиента пока не поддержаны (${fonts}/${bgs})`);
    return { fonts, bgs };
  }
  value() {
    const t = this.i8();
    switch (t) {
      case -1: return null;
      case -2: return { error: 'ошибка на стороне клиента' };
      case 1: return this.i32();
      case 5: { const n = this.i32(); const a = []; for (let i = 0; i < n; i++) a.push(this.value()); return a; }
      case 6: return {};
      case 7: { const cat = this.i32(), cmd = this.i32(), arg = this.value(), target = this.char(); return { command: `${target}.${nameOf(cat)}.${nameOf(cmd)}`, arg }; }
      case 8: return this.str();
      case 9: return { pair: [this.i32(), this.i32()] };
      case 10: return { strings: [this.str(), this.str(), this.str(), this.str(), this.str()], byte: this.i8() };
      case 12: return this.bool();
      case 28: { const n = this.varint(); const o = {}; for (let i = 0; i < n; i++) { const k = nameOf(this.i32()); o[k] = this.value(); } return o; }
      case 29: return { ref: this.i32() };
      case 102: return this.script();
      default: throw new Error(`неизвестный тип объекта ${t} (смещение ${this.off - 1})`);
    }
  }
  // «скриптовое» значение (J1.b.e): байт подтипа, младшие 3 бита — категория, старшие — номер
  script() {
    const b = this.u8(), cat = b & 7, idx = b >>> 3;
    if (cat === 1) { // простые данные
      switch (idx) {
        case 1: return this.i32();
        case 2: return this.i8();
        case 3: return this.i16();
        case 4: { const v = this.buf.readBigInt64BE(this.off); this.off += 8; return Number(v); }
        case 5: { const v = this.buf.readFloatBE(this.off); this.off += 4; return v; }
        case 6: return this.bool();
        case 7: return this.str();
        default: throw new Error(`скриптовые данные: неизвестный номер ${idx}`);
      }
    }
    if (cat === 7) {
      if (idx === 1) return this.message();
      if (idx === 2) { const n = this.i32(); const a = []; for (let i = 0; i < n; i++) a.push(this.value()); return a; }
      throw new Error(`скриптовый объект 7/${idx} пока не поддержан`);
    }
    if (cat === 2) return { op: idx, a: this.script(), b: this.script() }; // оператор с двумя операндами
    throw new Error(`скриптовая категория ${cat} (номер ${idx}) пока не поддержана`);
  }

  message() { return { cat: this.i32(), cmd: this.i32(), arg: this.value() }; }
}

// ---------- рамки ----------
// Пакет сервер→клиент: [канал][varint len][compressed=0][u32 0][varint 0][varint 0][тело]
const EMPTY_HEADER = Buffer.from([0, 0, 0, 0, 0x80, 0x80]);
function packet(channel, body) {
  const payload = Buffer.concat([Buffer.from([0]), EMPTY_HEADER, body]);
  return Buffer.concat([new Writer().u8(channel).varint(payload.length).bytes(), payload]);
}
function message(cat, cmd, arg) {
  const w = new Writer().i32(typeof cat === 'string' ? nameHash(cat) : cat).i32(typeof cmd === 'string' ? nameHash(cmd) : cmd).value(arg);
  return packet(0, w.bytes());
}

// Потоковый разбор входящих байтов от клиента
class StreamParser {
  constructor() { this.buf = Buffer.alloc(0); this.handshake = true; }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out = [];
    if (this.handshake) {
      if (this.buf.length < 2) return out;
      out.push({ handshake: [this.buf[0], this.buf[1]] });
      this.buf = this.buf.subarray(2);
      this.handshake = false;
    }
    for (;;) {
      if (this.buf.length < 2) break;
      const r = new Reader(this.buf);
      const channel = r.u8();
      let len;
      try { len = r.varint(); } catch (e) { break; }
      if (this.buf.length < r.off + len) break;
      const payload = this.buf.subarray(r.off, r.off + len);
      this.buf = this.buf.subarray(r.off + len);
      out.push({ channel, payload });
    }
    return out;
  }
}

function decodePayload(payload) {
  const r = new Reader(payload);
  const compressed = r.bool();
  if (compressed) throw new Error('сжатые пакеты от клиента пока не поддержаны');
  const header = r.header();
  return { header, reader: r };
}

module.exports = { PROTO, nameHash, nameOf, Writer, Reader, Dict, Command, Raw, packet, message, StreamParser, decodePayload, EMPTY_HEADER };
