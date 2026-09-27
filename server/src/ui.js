'use strict';
// Конструктор окон: SNAC group 12 («windowConstructParser» в клиенте, k.l()).
// Окно — это строки (rows) из элементов. Элементы копятся, TLV 5 закрывает строку.
// Выравнивание: ga — по горизонтали (0 лево, 1 центр, 2 право), va — по вертикали (0 верх, 1 центр, 2 низ).
//
// Внутри текста (TLV 7) работает разметка клиента:
//   {i<imageId>}                        — иконка (0 дерево, 1 камень, 2 железо, 3 еда, 4 люди, 5 время, 100+id — здание…)
//   {u<group>|<sub>|<tlv>|<param>|<текст>} — ссылка: по нажатию клиент шлёт SNAC(group,sub) + TLV(tlv, u32 param)
//   {u<group>|<sub>|<tlv>|<текст>}         — то же без параметра

const { u8, u16, u32, tlv, cat, snac } = require('./protocol');

const W = {
  ROW_END: 5, LABEL: 6, TEXT: 7, TEXTAREA: 8, INPUT: 9, BUTTON: 10, IMAGE: 11,
  TITLE: 12, MESSAGE: 13, EDITFIELD: 14, COMBO: 15, NAV: 16, CHECKBOX: 18, TICKER: 22,
};

// Типы полей ввода v(type, max): 5 — обычный текст, 2 — пароль, 4 — текст, 1 — число (по наблюдениям в клиенте)
const INPUT = { NUMBER: 1, PASSWORD: 2, TEXT: 4, LOGIN: 5 };

// Навигация (TLV 16): что клиент делает с предыдущим окном
const NAV = { CLEAR: 0, PUSH: 1, NONE: 2, ROOT: 10 };

class Window {
  constructor() { this.parts = []; this.nav = NAV.NONE; }

  title(text) { this.parts.push(tlv(W.TITLE, cat(u8(0), text))); return this; }
  separator() { this.parts.push(tlv(W.TITLE, u8(1))); return this; }
  endRow() { this.parts.push(tlv(W.ROW_END)); return this; }

  text(text, ga = 0, va = 1) { this.parts.push(tlv(W.TEXT, cat(u8(ga), u8(va), u16(0), text))); return this; }

  // ссылка-метка: при нажатии SNAC(group, sub) + пустой TLV(tlvType)
  link(text, group, sub, tlvType, ga = 0, va = 1) {
    this.parts.push(tlv(W.LABEL, cat(u8(ga), u8(va), u16(group), u16(sub), u16(tlvType), text)));
    return this;
  }

  label(text, ga = 0, va = 1) { this.parts.push(tlv(W.LABEL, cat(u8(ga), u8(va), u16(0), text))); return this; }

  input(id, { type = INPUT.TEXT, max = 20, value = '' } = {}, ga = 1, va = 1) {
    this.parts.push(tlv(W.INPUT, cat(u8(ga), u8(va), u8(type), u16(id), u8(max), value)));
    return this;
  }

  textarea(id, value = '', editable = true, ga = 0, va = 1) {
    this.parts.push(tlv(W.TEXTAREA, cat(u8(ga), u8(va), u8(editable ? 0 : 1), u16(id), value)));
    return this;
  }

  image(imageId, ga = 1, va = 1) { this.parts.push(tlv(W.IMAGE, cat(u8(ga), u8(va), u16(imageId)))); return this; }

  checkbox(id, text, ga = 0, va = 1) { this.parts.push(tlv(W.CHECKBOX, cat(u8(ga), u8(va), u16(id), text))); return this; }

  combo(id, items, ga = 1, va = 1) {
    const opts = items.map((s) => { const b = cat(s); return cat(u8(b.length), b); });
    // внимание: в этом TLV порядок байт выравнивания обратный (va, ga)
    this.parts.push(tlv(W.COMBO, cat(u8(va), u8(ga), u16(id), u8(items.length), ...opts)));
    return this;
  }

  // Кнопка «собрать поля»: SNAC(group, sub) со значениями полей fieldIds (TLV type = id поля, value = строка)
  buttonSubmit(text, group, sub, fieldIds, ga = 1, va = 1) {
    const ids = fieldIds.map((id) => u16(id));
    this.parts.push(tlv(W.BUTTON, cat(u8(ga), u8(va), u8(0), u16(group), u16(sub), u16(0), u8(fieldIds.length), ...ids, text)));
    return this;
  }

  // Кнопка «команда»: SNAC(group, sub) + пустой TLV(tlvType)
  buttonCommand(text, group, sub, tlvType, ga = 1, va = 1) {
    this.parts.push(tlv(W.BUTTON, cat(u8(ga), u8(va), u8(1), u16(group), u16(sub), u16(tlvType), text)));
    return this;
  }

  // Кнопка «команда с параметром»: SNAC(group, sub) + TLV(tlvType, u32 param)
  buttonParam(text, group, sub, tlvType, param, ga = 1, va = 1) {
    this.parts.push(tlv(W.BUTTON, cat(u8(ga), u8(va), u8(2), u16(group), u16(sub), u16(tlvType), u32(param), text)));
    return this;
  }

  // Локальная кнопка клиента (без сети): 0 — закрыть/назад, 27 — переподключиться
  buttonLocal(text, action = 0, ga = 1, va = 1) {
    this.parts.push(tlv(W.BUTTON, cat(u8(ga), u8(va), u8(3), u16(action), text)));
    return this;
  }

  setNav(nav) { this.nav = nav; return this; }

  build() { return Buffer.concat([...this.parts, tlv(W.NAV, u16(this.nav))]); }
  packet() { return snac(2, 12, 0, this.build()); }
}

// Всплывающее сообщение. target: 0 — поверх текущего экрана, 1 — вернуться на карту замка, 2 — в меню
function messageBox(text, target = 0) {
  return snac(2, 12, 0, tlv(W.MESSAGE, cat(u8(target), text)));
}

// Бегущая строка вверху экрана. repeat — сколько раз прокрутить, color — 0xRRGGBB
function ticker(text, color = 0xffff66, repeat = 1) {
  return snac(2, 12, 0, tlv(W.TICKER, cat(u8(repeat), u32(color), text)));
}

module.exports = { Window, messageBox, ticker, INPUT, NAV };
