'use strict';
// Каталог зданий — ID, названия и описания взяты из клиента (texts/strings.txt, картинки build/*.png → id 100+N).
// Цифры стоимости/времени/добычи — наш тестовый баланс (оригинальные значения клиент не содержит, их выдавал сервер).
// Ресурсы в порядке клиента: 0 дерево, 1 камень, 2 железо, 3 еда, 4 люди.

const RES = ['wood', 'stone', 'iron', 'food', 'people'];
const RES_ICON = { wood: 0, stone: 1, iron: 2, food: 3, people: 4 };
const TIME_ICON = 5;

// layer: castle — сетка замка 7×7, lands — сетка земель 15×15, none — служебный
// produces: какой ресурс добывает (для земель); tiers: картинки по уровням (у зданий земель — своя на каждый из 5 уровней, build/lands/*)
const B = (id, name, desc, layer, extra = {}) => ({ id, name, desc, layer, ...extra });

const BUILDINGS = [
  B(0, 'Ратуша', 'Главное здание Вашего королевства. Уровень развития здания влияет на скорость возведения новых зданий.', 'castle', { max: 20, unique: true }),
  B(1, 'Склад', 'Служит для хранения добытых в замке ресурсов.', 'castle', { max: 10, hp: 589, req: { 0: 1 }, base: { wood: 25, stone: 18, iron: 20, food: 17, people: 1 }, time: 60,
    about: 'Хранилище ресурсов, добытых в Вашем замке (за исключением ресурса «население», которое живет там же, где производится, то есть в «хибарах», «коттеджах», «усадьбах»). Уровень развития напрямую влияет на вместимость склада:' }),
  B(2, 'Военный штаб', 'Производит управления всеми военными операциями.', 'castle', { max: 20, unique: true, req: { 0: 3 } }),
  B(3, 'Казарма', 'Позволяет тренеровать легких воинов.', 'castle', { max: 20, unique: true, req: { 0: 3 } }),
  B(4, 'Рынок', 'Позволяет Вам совершать действия купли/продажи ресурсов.', 'castle', { max: 20, unique: true, req: { 0: 3, 1: 1 } }),
  B(5, 'Огород', 'Производит еду.', 'lands', { produces: 'food', tiers: [100, 101, 102, 103, 104] }),
  B(6, 'Хибара', 'В данном здании проживают Ваши подданые.', 'lands', { produces: 'people', tiers: [105, 106, 107, 108, 109] }),
  B(7, 'Дровосек', 'Производит дерево.', 'lands', { produces: 'wood', tiers: [110, 111, 112, 113, 114] }),
  B(8, 'Каменьщик', 'Добывает камень.', 'lands', { produces: 'stone', tiers: [115, 116, 117, 118, 119] }),
  B(9, 'Рудник', 'Добывает железо.', 'lands', { produces: 'iron', tiers: [120, 121, 122, 123, 124] }),
  B(10, '-Строимся-', 'Здание строится', 'none'),
  B(11, 'Кузнец', 'Позволяет усилить физические параметры Ваших воинов.', 'castle', { max: 20, unique: true, req: { 0: 3, 2: 1 }, hp: 660,
    base: { wood: 120, stone: 95, iron: 160, food: 100, people: 3 }, time: 120,
    about: 'Служит для улучшения физической атаки и защиты Ваших воинов. Каждое улучшение увеличивает базовый параметр атаки/защиты на 1 единицу.' }),
  B(12, 'Конюшня', 'Позволяет тренировать кавалерию', 'castle', { max: 20, unique: true, req: { 3: 5, 11: 3 } }),
  B(13, 'Дипломатический центр', 'Служит для управления альянсом', 'castle', { max: 10, unique: true, req: { 0: 3 }, base: { wood: 60, stone: 58, iron: 55, food: 50, people: 1 }, time: 120, hp: 672,
    about: 'Позволяет создать новый альянс или вступить в существующий альянс, управлять Вашим альянсом, а также просмотреть объявления о наборе в альянсы на рекламной площадке.' }),
  B(14, 'Дом мудрецов', 'Жилой дом ученых', 'castle', { unique: true, max: 20, req: { 0: 5 } }),
  B(15, 'Университет', 'Святилище науки, позволяет изучать науки', 'castle', { max: 20, unique: true, req: { 0: 5, 14: 1 } }),
  B(16, 'Лагерь археологов', 'Жилой дом археологов', 'castle', { unique: true, max: 10, req: { 15: 5 } }),
  B(17, 'Экспедиция', 'Позволяет организовывать экспедиции для поиска артефактов', 'castle', { max: 10, unique: true, req: { 16: 1 } }),
  B(18, 'Башня артефактов', 'Позволяет активировать найденные артефакты', 'castle', { max: 10, unique: true, req: { 17: 1 } }),
  B(19, 'Торговая палата', 'Увеличивает вместительность и скорость движения торговцев', 'castle', { max: 20, unique: true, req: { 4: 5 } }),
  B(20, 'Академия магов', 'Служит для тренировки магических юнитов', 'castle', { max: 20, unique: true, req: { 15: 3 } }),
  B(21, 'Караульная башня', 'Оповещает правителя о передвижениях армий королевства и о надвигающихся атаках.', 'castle', { max: 1, unique: true, req: { 0: 3, 3: 1 }, hp: 810,
    base: { wood: 80, stone: 90, iron: 110, food: 80, people: 3 }, time: 600,
    about: 'Оповещает правителя о передвижениях армий королевства, а также сообщает о надвигающихся на него атаках. Не показывает разведку, которая была направлена в замок короля.' }),
  B(22, 'Забор', 'Увеличивает защиту обороняющихся войск', 'castle', { max: 20, unique: true }),
  B(23, 'Мастерская', 'Служит для тренировки высокотехнологических юнитов', 'castle', { max: 20, unique: true, req: { 11: 5 } }),
  B(24, 'Дом путешественника', 'Служит для тренировки воинов, способных захватить или создать новые замки.', 'castle', { max: 10, unique: true, req: { 0: 10, 2: 1 }, hp: 669,
    base: { wood: 500, stone: 520, iron: 490, food: 400, people: 30 }, time: 600,
    about: 'Позволяет заказать тренировку бунтаря, который необходим для поднятия бунта и захвата вражеских замков, а также путешественников – помогут начать строительство нового замка на выбранных координатах или захватить чужую стройку.' }),
  B(25, 'Храм', 'Культовое сооружение, которое служит для повышения лояльности населения и понижения бунта в замке.', 'castle', { unique: true, max: 10, req: { 0: 10 }, hp: 500,
    base: { wood: 430, stone: 440, iron: 390, food: 460, people: 20 }, time: 600,
    about: 'Сооружение, которое необходимо для поднятия уровня лояльности у населения замка. Дает постоянный прирост лояльности – 1 ед в 2 часа (12 единиц в сутки). Позволяет провести ритуалы для повышения лояльности населения, а также снизить бунт в замке игрока.' }),
  B(26, 'Тайник', 'При нападении на замок сохраняет небольшую часть ресурсов', 'castle', { unique: true, max: 10 }),
  B(27, 'Лесопилка', 'Добыча древесины.', 'none'),
  B(28, 'Каменоломня', 'Добыча камня.', 'none'),
  B(29, 'Шахта', 'Добыча железа.', 'none'),
  B(30, 'Поле', 'Добыча еды.', 'none'),
  B(31, 'Коттедж', 'Вмещает людей.', 'none'),
  B(32, 'Деревообратывающий завод', 'Добыча древесины.', 'none'),
  B(33, 'Карьер', 'Добыча камня.', 'none'),
  B(34, 'Сталелитейный завод', 'Добыча железа.', 'none'),
  B(35, 'Ферма', 'Добыча еды.', 'none'),
  B(36, 'Усадьба', 'Вмещает людей.', 'none'),
  B(37, 'Рыболовная заводь', 'Производит еду.', 'lands', { produces: 'food', tiers: [125, 126, 127, 128, 129], water: true }),
  B(38, 'Портал', 'Служит для вызова юнитов', 'castle', { max: 10, unique: true, req: { 20: 10 } }),
  B(39, 'Школа магии', 'Школа для повышения магической атаки и защиты воинам.', 'castle', { max: 20, unique: true, req: { 20: 3 } }),
  B(40, 'Каменотес', 'Увеличивает устойчивость зданий к разрушению.', 'castle', { max: 20, unique: true, req: { 0: 5 } }),
  B(41, 'Пивоварня', 'В этом здании варится самый любимый напиток королевства.', 'castle', { max: 10, unique: true, req: { 0: 5 } }),
  B(42, 'Таверна', 'Место, где можно весело и беззаботно отдохнуть подданым королевства. Но иногда сюда забредают и наемники.', 'castle', { max: 10, unique: true, req: { 0: 5 } }),
  B(43, 'Лавка алхимиков', 'Место сбора алхимиков замка. Тайные рецепты, зелья, отвары готовят тут.', 'castle', { max: 10, unique: true, req: { 15: 5 } }),
  B(44, 'Сокровищница', 'Самые ценные реликвии, драгоценности заключены в Сокровищницу.', 'castle', { max: 20, unique: true, req: { 0: 10 } }),
  B(45, 'Центр разведки', 'Служит для управления разведывательными операциями замка.', 'castle', { max: 20, unique: true, req: { 0: 5, 11: 3, 12: 1 },
    base: { wood: 197, stone: 194, iron: 257, food: 240, people: 74 }, time: 300, hp: 512,
    about: 'Позволяет проводить разведывательные операции в замках врага. Уровень развития влияет на возможности разведчиков замка.' }),
  B(46, 'Резиденция', 'Служит для управления королевством.', 'castle', { max: 1, unique: true, req: { 0: 1 }, hp: 568,
    base: { wood: 500, stone: 500, iron: 300, food: 300, people: 10 }, time: 300,
    about: 'Резиденция правителя. Здесь видна лояльность населения Вашего королевства: она копится за Ваши действия в игре (стройки, тренировки, походы, науки, торговлю и праздники) и тратится на захват или основание каждого нового замка.' }),
];
const BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

// Юниты — ID картинок клиента (200..244) и названия из texts/strings.txt
const UNITS = {
  humans: [[200, 'Мечник'], [201, 'Копейщик'], [202, 'Разведчик'], [203, 'Чародей'], [204, 'Рыцарь'], [205, 'Паладин'], [206, 'Джин']],
  elves: [[207, 'Эльф лучник'], [208, 'Танцующий'], [209, 'Скаут'], [210, 'Созидающая'], [211, 'Кентавр'], [212, 'Единорог'], [213, 'Энт']],
  dwarves: [[214, 'Топорщик'], [215, 'Арбалетчик'], [216, 'Жрец рун'], [217, 'Грифон'], [218, 'Защитник гор'], [219, 'Револьверщик'], [220, 'Йетти']],
  special: [[221, 'Торговец'], [224, 'Путешественник'], [227, 'Ученый'], [230, 'Археолог'], [233, 'Бунтарь'], [236, 'Генерал']],
  unique: [[239, 'Великан'], [240, 'Катапульта'], [241, 'Око'], [242, 'Тень'], [243, 'Таран'], [244, 'Валькирия']],
};
const RACES = ['humans', 'elves', 'dwarves', 'orcs']; // порядок в форме регистрации: Люди, Эльфы, Гномы, Орки
const RACE_NAMES = { humans: 'Люди', elves: 'Эльфы', dwarves: 'Гномы', orcs: 'Орки' };

// ---------- баланс (тестовый) ----------
// добыча одного здания земель в час по уровням (2/ч на 1 ур. … 8.25/ч на 20 ур.), PROD_K — множитель по ресурсу.
// Подогнано под оригинал: полностью отстроенный замок с максимальными бонусами (Экономика 20, легендарный артефакт)
// даёт 527 дерева/камня/железа, 992 еды и 727 людей в час.
const PROD = Array.from({ length: 31 }, (_, l) => (l ? Math.round((2 + (l - 1) * 6.25 / 19) * 1000) / 1000 : 0));
// земли 7×7 (было 15×15): клеток меньше, зато здания растут до 25 ур., а добыча за уровень умножена на LAND_MULT —
// полностью отстроенные земли дают столько же, сколько прежние 225 клеток на 20 ур.
const LANDS_N = 15, LANDS_MAX = 5;
// здания земель — 5 уровней; каждый равен прежнему уровню из LAND_EFF (1, 5, 10, 15, 20): добыча, рейтинг, места в Хибаре и прочность —
// как у прежнего уровня (полные земли дают столько же, сколько прежние 20 ур.); цена и время — прежние того уровня × LAND_COST_K
const LAND_EFF = [0, 1, 5, 10, 15, 20], LAND_EFF_MAX = 20;
const landEff = (level) => LAND_EFF[Math.max(0, Math.min(LANDS_MAX, level | 0))];
const landFromOld = (o) => { if (!(o > 0)) return 0; let best = 1; for (let l = 1; l <= LANDS_MAX; l++) if (Math.abs(LAND_EFF[l] - o) <= Math.abs(LAND_EFF[best] - o)) best = l; return best; }; // прежний уровень 1–20 → ближайший новый
const LAND_CELLS_OLD = { 5: 42, 6: 73, 7: 26, 8: 26, 9: 26, 37: 32 }, LAND_CELLS = { 5: 42, 6: 73, 7: 26, 8: 26, 9: 26, 37: 32 }; // как в оригинале
// множитель добычи для раскладки: cells — клеток каждого вида, max — макс. уровень (полные земли = прежние 225 клеток на 20 ур.)
const landMult = (cells, max) => Object.fromEntries(Object.keys(cells).map((id) => [id, Math.round(LAND_CELLS_OLD[id] * PROD[20] / (cells[id] * PROD[max]) * 1000) / 1000]));
const LAND_MULT = landMult(LAND_CELLS, LAND_EFF_MAX);
for (const b of BUILDINGS) if (b.layer === 'lands') b.max = LANDS_MAX;
// прежние раскладки (для переноса построек): 7×7 — до 25 ур., 5×5 — до 30 ур.
const LAND_MULT_BY_SIZE = { 225: LAND_MULT, 49: landMult({ 5: 9, 6: 12, 7: 7, 8: 7, 9: 7, 37: 6 }, 25), 25: landMult({ 5: 4, 6: 5, 7: 4, 8: 4, 9: 4, 37: 3 }, 30) };
const HUT_CAP_MULT = Math.round(LAND_CELLS_OLD[6] * 20 / (LAND_CELLS[6] * LAND_EFF_MAX) * 1000) / 1000; // места для людей за уровень Хибары
const PROD_K = { wood: 1, stone: 1, iron: 1, food: 0.5788, people: 1.5163 };

// цена улучшения; у зданий земель — прежняя цена уровня LAND_COST_EFF × LAND_COST_K (сумма прежних уровней не влезла бы в склады).
// 4 и 5 ур. — по цене прежних 12 и 14 ур. (а не 15 и 20): каждый следующий уровень дороже примерно вдвое, а не в 6 раз; время — прежнее (LAND_EFF)
const LAND_COST_K = 1.5, LAND_COST_EFF = [0, 1, 5, 10, 12, 14];
function levelCost(b, level) {
  if (b.layer !== 'lands' || level <= 1) return levelCost0(b, level);
  const c = levelCost0(b, LAND_COST_EFF[Math.min(LANDS_MAX, level)]), out = {};
  for (const r of RES) out[r] = r === 'people' ? Math.ceil(c[r] * LAND_COST_K) : Math.round(c[r] * LAND_COST_K / 5) * 5;
  return out;
}
function levelCost0(b, level) {
  const growth = b.layer === 'lands' ? 1.45 : 1.3;
  const base = b.base ? { ...b.base } : b.layer === 'lands'
    ? { wood: 60, stone: 50, iron: 40, food: 30, people: 1 }
    : { wood: 120, stone: 110, iron: 80, food: 60, people: 2 };
  if (b.produces) base[b.produces === 'people' ? 'food' : b.produces] = Math.round(base.wood * 0.5);
  const k = growth ** (Math.min(level, 20) - 1) * 1.03 ** Math.max(0, level - 20); // после 20 ур. (земли до 30) цена растёт мягко — влезает в склады
  const cost = {};
  for (const r of RES) cost[r] = r === 'people' ? Math.ceil(base.people * level) : b.base ? Math.round(base[r] * k) : Math.round((base[r] * k) / 5) * 5;
  return cost;
}

// время: база × рост^(ур-1) × 0.95^ур.Ратуши (Ратуша ускоряет стройки на 5% за уровень)
const TIME = { lands: { base: 60, growth: 1.45 }, castle: { base: 180, growth: 1.25 }, townhallFactor: 0.95, min: 5 };
function levelTimeSec(b, level, townhallLevel) {
  if (b.layer === 'lands' && !b.time && level > 1) return Math.round(levelTimeSec0(b, landEff(level), townhallLevel) * LAND_COST_K);
  return levelTimeSec0(b, level, townhallLevel);
}
function levelTimeSec0(b, level, townhallLevel) {
  const t = b.time ? { base: b.time, growth: TIME.castle.growth } : b.layer === 'lands' ? TIME.lands : TIME.castle;
  return Math.max(TIME.min, Math.round(t.base * t.growth ** (Math.min(level, 20) - 1) * 1.03 ** Math.max(0, level - 20) * TIME.townhallFactor ** townhallLevel));
}

// рейтинг: полностью отстроенный замок = 2300 (замок до 1300 + земли до 1000).
// Полный замок: 49 клеток — все виды зданий замка на максимуме, остальные клетки — Склады 10 ур.;
// полные земли: 225 клеток × 20 ур. Очки за уровень — доля от этих максимумов.
const BY_ID_MAX_STORE = BUILDINGS.find((b) => b.id === 1).max;
// прочность здания (как в оригинале: Склад — 589 на 1 ур., растёт линейно с уровнем)
const durability = (b, level0) => { const level = b.layer === 'lands' ? landEff(level0) : level0; return durability0(b, level); };
const durability0 = (b, level) => (b.hp ? b.hp * level : 0) || Math.round((b.base ? ['wood', 'stone', 'iron', 'food'].reduce((s, r) => s + b.base[r], 0) : b.layer === 'lands' ? 180 : 370) * 7.3625) * level;
const CASTLE_TYPES = BUILDINGS.filter((b) => b.layer === 'castle');
// тропинка от ворот к Ратуше (как в оригинале) — на ней строить нельзя: клетки x=3,y=0..2 и y=3,x=0..2 сетки 7×7
const CASTLE_PATH = [3, 10, 17, 21, 22, 23];
const CASTLE_CELLS = 49 - CASTLE_PATH.length;
const CASTLE_FULL_LEVELS = CASTLE_TYPES.reduce((s, b) => s + (b.max || 20), 0) + (CASTLE_CELLS - CASTLE_TYPES.length) * BY_ID_MAX_STORE;
const LANDS_FULL_LEVELS = LANDS_N * LANDS_N * LAND_EFF_MAX; // все клетки земель застраиваемые (в прежних уровнях: рейтинг считает landEff)
const RATING = { max: 2300, castleMax: 1300, landsMax: 1000, castle: 1300 / CASTLE_FULL_LEVELS, lands: 1000 / LANDS_FULL_LEVELS };

// Какую картинку показывать для уровня (земли «растут»: маленькое → среднее → большое здание)
function displayId(b, level) {
  if (!b.tiers) return b.id;
  if (b.layer === 'lands' && b.tiers.length >= LANDS_MAX) return b.tiers[Math.max(1, Math.min(LANDS_MAX, level)) - 1]; // своя картинка на каждый уровень
  const e = b.layer === 'lands' ? landEff(level) : level;
  return e >= 10 ? b.tiers[2] : e >= 5 ? b.tiers[1] : b.tiers[0];
}

module.exports = { LAND_COST_K, LAND_EFF, LAND_EFF_MAX, landEff, landFromOld, LAND_MULT_BY_SIZE, LANDS_N, LANDS_MAX, LAND_MULT, HUT_CAP_MULT, LAND_CELLS, TIME, RATING, RES, RES_ICON, TIME_ICON, BUILDINGS, BY_ID, UNITS, RACES, RACE_NAMES, PROD, PROD_K, CASTLE_PATH, durability, levelCost, levelTimeSec, displayId };
