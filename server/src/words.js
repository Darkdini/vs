'use strict';
// Слова после чисел: 1 монета, 2 монеты, 5 монет (21 монета, 11 монет). Тот же plural, что у клиента (web/welcome.js).
const plural = (n, one, few, many) => { const a = Math.abs(Math.round(Number(n) || 0)), m = a % 100, k = a % 10; return m > 10 && m < 20 ? many : k === 1 ? one : k >= 2 && k <= 4 ? few : many; };
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
// «25 монет», «1 воин» — число с пробелами по-русски и слово в нужной форме
const num = (n, one, few, many) => `${fmt(n)} ${plural(n, one, few, many)}`;
const coins = (n) => num(n, 'монета', 'монеты', 'монет');
const coinsAcc = (n) => num(n, 'монету', 'монеты', 'монет'); // «за 21 монету», «стоит 1 монету»
const coinsGen = (n) => num(n, 'монеты', 'монет', 'монет'); // «от 21 монеты», «не больше 300 монет»
const warriors = (n) => num(n, 'воин', 'воина', 'воинов');
const resources = (n) => num(n, 'ресурс', 'ресурса', 'ресурсов');
// после «из», «больше», «не хватает»: из 1 воина, из 21 воина, из 5 воинов
const ofWarriors = (n) => `${fmt(n)} ${plural(n, 'воина', 'воинов', 'воинов')}`;

module.exports = { plural, num, coins, coinsAcc, coinsGen, warriors, resources, ofWarriors };
