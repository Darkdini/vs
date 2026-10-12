'use strict';
// Руны: в каждой провинции три рунных камня — Силы, Стойкости и Пути (объекты карты мира, game.js PROV_NPC, img 40–42).
// Руну забирает любой отряд (поход «Сбор руны», army.js): кто пришёл первым, тот и взял; камень исчезает и через 3 часа
// встаёт на новом месте той же провинции. Руны копятся у игрока (u.runes — одни на всё королевство) и тратятся в Кузнице
// на ковку снаряжения генерала (hero.js): Силы — оружие и амулет, Стойкости — доспех и щит, Пути — шлем и конь.

const RUNES = {
  40: { key: 'str', name: 'Руна Силы', desc: 'Красный камень с руной огня. Нужна для ковки оружия и амулетов.' },
  41: { key: 'def', name: 'Руна Стойкости', desc: 'Синий камень с руной щита. Нужна для ковки доспехов и щитов.' },
  42: { key: 'path', name: 'Руна Пути', desc: 'Зелёный камень с руной дороги. Нужна для ковки шлемов и коней.' },
};
const RUNE_KEYS = ['str', 'def', 'path'];
const RUNE_NAME = Object.fromEntries(Object.values(RUNES).map((r) => [r.key, r.name]));
const RUNE_BACK_SEC = 3 * 3600; // собранная руна возвращается на карту через 3 часа (с учётом скорости мира)

function install(Game) {
  const P = Game.prototype;
  P.runesOf = function runesOf(u) {
    if (!u.runes || typeof u.runes !== 'object') u.runes = {};
    for (const k of RUNE_KEYS) if (!Number.isInteger(u.runes[k]) || u.runes[k] < 0) u.runes[k] = 0;
    return u.runes;
  };
  // рунный камень на клетке (x, y) или null
  P.runeAt = function runeAt(x, y) {
    const o = this.npcIn(x, y, 1, 1).find((q) => RUNES[q.img]);
    return o ? { ...o, ...RUNES[o.img] } : null;
  };
  // отряд дошёл до камня: руна — хозяину, камень исчезает; отряд идёт домой
  P.runeArrive = function runeArrive(c, a, t) {
    const u = this.userById(c.owner), r = this.runeAt(a.x, a.y), lines = [];
    let title;
    if (r && u) {
      const back = this.npcGone(a.x, a.y, t, RUNE_BACK_SEC), have = this.runesOf(u);
      have[r.key]++;
      this.addStat && this.addStat(u.id, 'runes', 1);
      title = `Собрана ${r.name}`;
      lines.push(`Отряд забрал ${r.name} у камня ${a.x}:${a.y}.`, `Теперь у вас: ${RUNE_KEYS.map((k) => `${RUNE_NAME[k]} — ${have[k]}`).join(', ')}.`,
        'Руны тратятся в Кузнице на ковку снаряжения генерала.', `Новый рунный камень появится в этой провинции через ${Math.max(1, Math.round((back || 0) / 60))} мин.`);
    } else {
      title = 'Руну уже забрали';
      lines.push(`На месте ${a.x}:${a.y} камня уже нет — кто-то успел раньше. Отряд возвращается домой.`);
    }
    this.report(c.owner, title, lines, 'rune');
    this.goBack(c, a, t);
  };
}

module.exports = { install, RUNES, RUNE_KEYS, RUNE_NAME, RUNE_BACK_SEC };
