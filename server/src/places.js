'use strict';
// Населённые пункты России, Украины и Беларуси — для «Личной информации» (social.js setPlace): города, посёлки и сёла.
// data/places.json.gz собирает tools/places.py из открытых данных Wikidata (npm-пакеты @geomelon, лицензия CC0): там же — как
// чистились ошибки областей и что со спорными территориями (они в обоих списках, России и Украины). Свой пункт игрок не пишет —
// только выбирает из найденных: поиск по началу названия или любого слова в нём (ё = е, дефис = пробел), крупные — первыми.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const FILE = path.join(__dirname, '..', '..', 'data', 'places.json.gz');
const LIMIT = 30;
let DATA = null; // { ru|ua|by: { r: [области], p: [[имя, номер области или -1]], low: [имена для поиска] } } — при первом поиске
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[-‐–—]/g, ' ').replace(/[ʼ’']/g, '').replace(/\s+/g, ' ').trim();
function load() {
  if (DATA) return DATA;
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString('utf8'));
  for (const c of Object.values(d)) c.low = c.p.map((x) => norm(x[0]));
  return (DATA = d);
}
const item = (c, i) => ({ i, n: c.p[i][0], r: c.p[i][1] >= 0 ? c.r[c.p[i][1]] : '' });
// найденные: сперва название целиком, потом начало названия или слова внутри («новгород» — и Великий, и Нижний) — крупные выше
function find(country, q) {
  const c = Object.prototype.hasOwnProperty.call(load(), country) ? DATA[country] : null; q = norm(q);
  if (!c || q.length < 2) return [];
  const exact = [], starts = [], inner = [], sq = ` ${q}`;
  for (let i = 0; i < c.low.length; i++) {
    const s = c.low[i];
    if (s === q) { if (exact.length < LIMIT) exact.push(i); } else if (s.startsWith(q)) { if (starts.length < LIMIT) starts.push(i); } else if (inner.length < LIMIT && s.includes(sq)) inner.push(i);
  }
  return [...exact, ...[...starts, ...inner].sort((a, b) => a - b)].slice(0, LIMIT).map((i) => item(c, i)); // номер в списке — чем меньше, тем крупнее
}
// пункт по номеру из найденного — для сохранения (номер не из списка — null)
function get(country, i) {
  const c = Object.prototype.hasOwnProperty.call(load(), country) ? DATA[country] : null;
  return c && Number.isInteger(i) && i >= 0 && i < c.p.length ? item(c, i) : null;
}
const counts = () => Object.fromEntries(Object.entries(load()).map(([k, c]) => [k, c.p.length]));
module.exports = { find, get, norm, counts };
