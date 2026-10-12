'use strict';
// «Кабинет» игрока, как в Android-клиенте «Третий Мир 3D»: профиль, репутация, друзья, земляки, поиск, блокнот,
// общий чат, Зал Славы (текущие топ-3 по категориям) и статистика боёв. Подключается к Game — см. install().

const C = require('./catalog');
const START_REP = 10; // стартовая репутация у всех игроков

// Залы Славы — 20 категорий, как в оригинале (4 страницы по 5). stat — счётчик за месяц (mstats), bonus — репутация за 1/2/3 место.
// Медали: gfx3d/halls/<id>_<место>.png (золото, серебро, бронза), значок зала в списке — его золотая медаль (_1)
const HALLS = {
  rule: { name: 'Правление', bonus: [1000, 500, 250], short: 'Самый почетный рейтинг. Показывает общие успехи правителя по всем возможным направлениям развития королевства.',
    desc: 'Самый почетный рейтинг. Формируется согласно месту, полученному правителем во всех остальных категориях. Учитывается не только положение в итоговых таблицах, но и сложность того или иного рейтинга.' },
  growth: { name: 'Развитие', bonus: [200, 100, 50], short: 'Показывает мастерство игрока в развитии своего королевства. В зачет идут только очки рейтинга, полученного при постройке зданий в королевстве.',
    desc: 'В зачет идет только рейтинг, который игрок получил от развития зданий. Не учитывается прирост рейтинга при захвате замков других королевств или заброшенных замков.' },
  loyalty: { name: 'Лояльность', stat: 'loyal', bonus: [100, 50, 25], short: 'Показывает повышение лояльности населения королевства. Позиция в рейтинге определяется приростом лояльности населения в королевстве без учета лояльности, полученной от праздников.',
    desc: 'Оценивается прирост лояльности населения за определенный период. В зачет идет вся лояльность, полученная от храмов, артефактов, казней.' },
  loot: { name: 'Грабежи', stat: 'loot', bonus: [80, 40, 20], short: 'Показывает успехи игрока в разграблении соседних королевств. Позиция в рейтинге определяется суммой ресурсов, которые были украдены со складов соседних королевств.',
    desc: 'Положение в этой категории определяется количеством ресурсов, украденных в других королевствах. Учитываются только ресурсы, полученные со складов королевств, чей правитель отсутствует длительное время, а также ресурсы, захваченные после кровопролитных боев с вражеской армией.' },
  archaeology: { name: 'Археология', stat: 'arts', bonus: [200, 100, 50], short: 'Показывает успехи игрока в экспедициях за артефактами. Позиция в рейтинге определяется типом и количеством артефактов, доставленных в Ваши замки.',
    desc: 'Позиция игрока в таблице вычисляется исходя из количества и качества артефактов, найденных в экспедициях. В зачет идут только те артефакты, которые были успешно доставлены в один из замков игрока. Артефакты, потерянные археологами по пути домой, в зачет не идут.' },
  respect: { name: 'Уважение', stat: 'repGold', bonus: [200, 100, 50], short: 'Показывает прирост репутации игрока. В расчет берется золото, потраченное для поднятия репутации правителю.',
    desc: 'Прирост очков в категории рассчитывается исходя из золота, потраченного на поднятие репутации правителя.' },
  thanks: { name: 'Благодарность', stat: 'giftGold', bonus: [100, 50, 25], short: 'Показывает количество и качество подарков, полученных правителем за определенный период.',
    desc: 'Учитывается качество подарков, которые правитель получил от других игроков, а также подаренных себе самолично. Качество подарков определяется их стоимостью в игровом золоте.' },
  gamble: { name: 'Азарт', stat: 'gamble', bonus: [100, 50, 25], short: 'Показывает успехи короля на поприще азартных игр. В зачет идут только бесплатные игры.',
    desc: 'Показывает успехи короля на поприще азартных игр. В зачет идут только бесплатные игры: каждый открытый сундук в «Сундучках» (меню «Игры») — очко.' },
  jackpot: { name: 'Большой куш', stat: 'jackpot', bonus: [100, 50, 25], short: 'Показывает удачу правителя в «Орёл-решке»: сколько ресурсов он выиграл у других игроков.',
    desc: 'Очки — ресурсы, выигранные в «Орёл-решке» (меню «Игры»): за каждую победу засчитывается ставка соперника.' },
  doom: { name: 'Опустошение', stat: 'kills', bonus: [200, 100, 50], short: 'Показывает успехи правителя в ратном деле. В расчет берутся армии противника, которые были уничтожены королем за некоторый период.',
    desc: 'Место в данной категории определяется по очкам, которые начисляются в зависимости от количества и качества юнитов вражеских армий, уничтоженных войсками правителя.' },
  death: { name: 'Гибель', stat: 'attLost', bonus: [200, 100, 50], short: 'Показывает суммарные потери армий правителя: в нападениях на замки и лагеря, в защите своего замка и в боях с боссами.',
    desc: 'Рейтинг учитывает все потери армий правителя — количество и качество погибших воинов: в нападениях на замки других игроков и на лагеря, при защите своего замка и в боях с мировым боссом.' },
  ruin: { name: 'Разрушение', stat: 'ruins', bonus: [100, 50, 25], short: 'Показывает успехи правителя в истреблении вражеских укреплений. В расчет берутся здания, уничтоженные разрушителями и осадными орудиями королевства.',
    desc: 'Учитывает, сколько зданий было разрушено вашей армией во время нападений на замки противника.' },
  wealth: { name: 'Богатство', stat: 'goldIn', bonus: [100, 50, 25], short: 'Показывает прирост золота в казне королевства.',
    desc: 'Показывает то количество золота, которое получил правитель за время оценки. В зачет идут как покупка казны, так и другие способы ее пополнения.' },
  boost: { name: 'Усиление', stat: 'boost', bonus: [100, 50, 25], short: 'Показывает количество различных усилений, использованных правителем за определенный период.',
    desc: 'Учитывает количество усилений армии и королевства, полученных при использовании артефактов.' },
  command: { name: 'Командование', stat: 'genExp', bonus: [200, 100, 50], short: 'Показывает прирост мастерства генерала королевства.',
    desc: 'Положение в таблице формируется в зависимости от опыта, полученного генералом при атаках на вражеские укрепления. Расчет опыта ведется в зависимости от суммарных потерь армий противника и собственных войск королевства в бою, где принимал участие генерал.' },
  recruit: { name: 'Вербовка', stat: 'recruit', bonus: [100, 50, 25], short: 'Показывает успехи короля при вербовке вражеских армий.',
    desc: 'В зачет идет количество солдат вражеской армии, завербованных правителем в темницах королевства. (Темницы появятся позже.)' },
  execute: { name: 'Казни', stat: 'execute', bonus: [100, 50, 25], short: 'Отображает количество воинов, которое было казнено в королевстве.',
    desc: 'Показывает суммарное количество армий противника, которые были казнены в королевстве за определенный период. (Темницы появятся позже.)' },
  waste: { name: 'Расточительство', stat: 'goldOut', bonus: [100, 50, 25], short: 'Отображает траты казны правителем.',
    desc: 'Отображает траты казны правителем: подарки, репутация, премиум и другие расходы золота.' },
  defense: { name: 'Защита', stat: 'defLost', bonus: [200, 100, 50], short: 'Показывает потери войск правителя. В зачет идут потери при обороне собственных замков, замков других игроков, оазисов.',
    desc: 'Показывает потери войск правителя. В зачет идут потери при обороне собственных замков, замков других игроков, оазисов.' },
  presence: { name: 'Присутствие', stat: 'presence', bonus: [100, 50, 25], short: 'Показывает время, потраченное правителем при управлении и развитии своего королевства.',
    desc: 'Показывает время (в минутах), потраченное правителем при управлении и развитии своего королевства.' },
};
const HALL_PAGES = [['rule', 'growth', 'loyalty', 'loot', 'archaeology'], ['respect', 'thanks', 'gamble', 'jackpot', 'doom'], ['death', 'ruin', 'wealth', 'boost', 'command'], ['recruit', 'execute', 'waste', 'defense', 'presence']];

// подарки в профиле: игроки дарят друг другу за золото
// обычные — всем; premium: true — уникальный набор, дарить можно только с премиумом
const GIFTS = {
  gift_box: { name: 'Подарочная коробка', img: 'gifts/gift_box.png?v=2', gold: 1, cats: ['party', 'misc'] },
  gold_coin: { name: 'Золотая монета', img: 'gifts/gold_coin.png?v=2', gold: 1, cats: ['misc'] },
  fountain: { name: 'Фонтан желаний', img: 'gifts/fountain.png?v=2', gold: 2, cats: ['girls', 'misc'] },
  treasure: { name: 'Сундук сокровищ', img: 'gifts/treasure.png?v=2', gold: 3, cats: ['boys', 'misc'] },
  diamond: { name: 'Большой диамант', img: 'gifts/diamond.png?v=2', gold: 3, premium: true, cats: ['girls'] },
  castle_box: { name: 'Королевская шкатулка', img: 'gifts/castle_box.png?v=2', gold: 10, premium: true, cats: ['girls', 'party'] },
  helmet: { name: 'Шлем Легиона', img: 'gifts/helmet.png?v=2', gold: 5, premium: true, cats: ['war', 'boys'] },
  crown: { name: 'Корона Авторитета', img: 'gifts/crown.png?v=2', gold: 8, premium: true, cats: ['boys', 'party'] },
  // премиум-подарки (новые)
  p_roses: { name: 'Королевский букет', img: 'gifts/p_roses.png', gold: 6, premium: true, cats: ['girls', 'party'], isNew: true },
  p_goblet: { name: 'Кубок пиршества', img: 'gifts/p_goblet.png', gold: 7, premium: true, cats: ['boys', 'party'], isNew: true },
  p_heart: { name: 'Рубиновое сердце', img: 'gifts/p_heart.png', gold: 9, premium: true, cats: ['girls'], isNew: true },
  p_sword: { name: 'Меч героя', img: 'gifts/p_sword.png', gold: 10, premium: true, cats: ['war', 'boys'], isNew: true },
  p_potion: { name: 'Эликсир чародея', img: 'gifts/p_potion.png', gold: 8, premium: true, cats: ['misc'], isNew: true },
  p_horse: { name: 'Белый скакун', img: 'gifts/p_horse.png', gold: 12, premium: true, cats: ['boys', 'war'], isNew: true },
  p_decree: { name: 'Королевский указ', img: 'gifts/p_decree.png', gold: 11, premium: true, cats: ['misc'], isNew: true },
  p_beer: { name: 'Гусь-полторашка', img: 'gifts/p_beer.png', gold: 30, premium: true, cats: ['boys', 'party', 'misc'], isNew: true },
  p_scepter: { name: 'Скипетр власти', img: 'gifts/p_scepter.png', gold: 15, premium: true, cats: ['boys'], isNew: true },
};
// разделы окна «Подарки» (как в оригинале): порядок в списке; пустые разделы не показываются
const GIFT_CATS = [['premium', 'Премиум'], ['girls', 'Девушкам'], ['boys', 'Парням'], ['war', 'Военные'], ['party', 'К празднику'], ['enemy', 'Врагам'], ['misc', 'Разное']];
const GIFTS_DAY = 20;
const REP_PER_GOLD = 2; // 1 монета = 2 репутации // сколько подарков игрок может отправить за сутки

const CHAT_KEEP = 30; // сколько последних сообщений хранит общий чат
function install(Game) {
  const P = Game.prototype;

  P.stats = function stats(user) {
    if (!user.stats) user.stats = { loot: 0, kills: 0, defKills: 0, arts: 0 };
    return user.stats;
  };
  // ----- соревновательный месяц: считаются только достижения за текущий месяц; в конце месяца топ-3 каждого зала
  // получают награду (медаль с датой получения) — она навсегда остаётся в профиле -----
  const monthKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const monthEnd = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); };
  P.season = function season() {
    if (!this.db.season) this.db.season = { key: monthKey(Date.now()), start: Date.now(), end: monthEnd(Date.now()), n: 1 };
    return this.db.season;
  };
  P.mstats = function mstats(u) {
    const s = this.season();
    if (!u.mstats || u.mstats.season !== s.n) u.mstats = { season: s.n, loot: 0, kills: 0, defKills: 0, arts: 0 };
    return u.mstats;
  };
  P.addStat = function addStat(userId, key, v) {
    const u = this.userById(userId); if (!u || !(v > 0)) return;
    const a = this.stats(u), m = this.mstats(u);
    a[key] = (a[key] || 0) + Math.round(v); // за всё время
    m[key] = (m[key] || 0) + Math.round(v); // за соревновательный месяц
  };
  // база на начало месяца (рейтинг, репутация) — прирост за месяц
  P.mbase = function mbase(u) { const s = this.season(); return u.mbase && u.mbase.season === s.n ? u.mbase : { rating: 0, rep: START_REP }; };
  P.hallValue = function hallValue(u, hall) {
    const s = this.mstats(u), b = this.mbase(u), h = HALLS[hall];
    if (hall === 'growth') return Math.max(0, this.userRating(u) - b.rating - (s.capRating || 0));
    if (hall === 'doom') return (s.kills || 0) + (s.defKills || 0);
    return h && h.stat ? s[h.stat] || 0 : 0;
  };
  // текущее положение в залах (за идущий месяц)
  P.halls = function halls() { this.seasonCheck(); return this.cached('halls', 60000, () => this.hallsCalc()); }; // кэш 1 мин
  P.hallsCalc = function hallsCalc() {
    const users = Object.values(this.db.users).filter((u) => !u.bot && !u.admin);
    const tables = {};
    for (const id of Object.keys(HALLS)) if (id !== 'rule') tables[id] = users.map((u) => ({ id: u.id, login: u.login, value: this.hallValue(u, id) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    // Правление: очки за места во всех остальных категориях с учётом сложности (бонуса) категории
    const rule = new Map();
    for (const [id, t] of Object.entries(tables)) t.forEach((x, i) => rule.set(x.id, (rule.get(x.id) || 0) + Math.round(HALLS[id].bonus[0] * (t.length - i) / t.length)));
    tables.rule = users.map((u) => ({ id: u.id, login: u.login, value: rule.get(u.id) || 0 })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    return Object.entries(HALLS).map(([id, h]) => ({ id, name: h.name, bonus: h.bonus, short: h.short, desc: h.desc, top: tables[id].slice(0, 10), all: tables[id], pos: Object.fromEntries(tables[id].map((x, i) => [x.id, i + 1])), total: tables[id].length }));
  };
  const hallIcon = (h, i) => `gfx3d/halls/${h.id}_${i + 1}.png`;
  // конец месяца (или досрочно админом): награды топ-3 каждого зала, новый месяц
  P.seasonClose = function seasonClose(now = Date.now()) {
    const s = this.season(), res = this.hallsCalc(), winners = [], got = new Map(); // игрок → { before, lines }
    for (const h of res) h.top.slice(0, 3).forEach((x, i) => {
      const u = this.userById(x.id); if (!u) return;
      const bonus = HALLS[h.id].bonus[i];
      if (!got.has(u)) got.set(u, { before: u.reputation ?? START_REP, lines: [] });
      got.get(u).lines.push(`${h.name} — ${['I', 'II', 'III'][i]} место: +${bonus} репутации`);
      u.reputation = (u.reputation ?? START_REP) + bonus; u.hallRep = (u.hallRep || 0) + bonus; // бонус — репутация
      (u.awards = u.awards || []).push({ hall: h.id, name: h.name, place: i + 1, value: x.value, month: s.key, at: now, icon: hallIcon(h, i), bonus });
      this.event(u.id, `Зал Славы «${h.name}»: ${i + 1} место по итогам месяца! Бонус +${bonus} репутации, медаль — в Вашем профиле.`);
      if (this.friendFeed) this.friendFeed(u.id, `${u.login} получил(а) медаль Зала славы «${h.name}» — ${['I', 'II', 'III'][i]} место`, now);
      winners.push({ hall: h.name, place: i + 1, login: u.login });
    });
    // письмо каждому победителю: за что и сколько репутации начислено
    const from = this.adminUser() || null;
    for (const [u, g] of got) {
      const total = (u.reputation ?? START_REP) - g.before;
      const text = [`Итоги Зала славы за ${s.key}.`, '', ...g.lines, '', `Всего: +${total} репутации (было ${g.before}, стало ${u.reputation}).`, 'Медали — в Вашем профиле, раздел «Зал Славы».'].join('\n');
      if (from) this.sendMail(from, u.login, `Зал славы: +${total} репутации`, text);
    }
    (this.db.hallHistory = this.db.hallHistory || []).push({ key: s.key, at: now, halls: res.map((h) => ({ id: h.id, name: h.name, top: h.top.slice(0, 3) })) });
    if (this.db.hallHistory.length > 24) this.db.hallHistory.shift();
    const n = s.n + 1;
    this.db.season = { key: monthKey(now), start: now, end: monthEnd(now), n };
    for (const u of Object.values(this.db.users)) u.mbase = { season: n, rating: this.userRating(u), rep: u.reputation ?? START_REP };
    this.cache = {};
    this.store.save();
    return winners;
  };
  // окно «Зал <название>»: страница рейтинга по 10, позиция и показатель игрока, дата отсчёта, архив прошлых месяцев
  P.hallPage = function hallPage(user, id, page = 0) {
    const h = this.halls().find((x) => x.id === id); if (!h) return { error: 'Нет такого зала.' };
    const pages = Math.max(1, Math.ceil(h.all.length / 10)), pg = Math.max(0, Math.min(pages - 1, Math.floor(Number(page)) || 0));
    const archive = (this.db.hallHistory || []).map((m) => { const x = m.halls.find((y) => y.id === id); return x ? { key: m.key, top: x.top } : null; }).filter(Boolean).reverse();
    return { id, name: h.name, pos: h.pos[user.id] || 0, value: this.hallValue(user, id), start: this.season().start || null, key: this.season().key,
      page: pg, pages, rows: h.all.slice(pg * 10, pg * 10 + 10).map((x, i) => ({ place: pg * 10 + i + 1, id: x.id, login: x.login, value: x.value })), archive };
  };
  P.seasonCheck = function seasonCheck(now = Date.now()) { if (now >= this.season().end) this.seasonClose(now); };
  // награды игрока (медали прошлых месяцев) — с датой получения
  P.medalsOf = function medalsOf(userId) {
    const u = this.userById(userId);
    return (u && u.awards ? u.awards : []).slice().reverse();
  };

  // место в общем рейтинге
  P.rankOf = function rankOf(userId) {
    const rank = this.cached('rank', 15000, () => new Map(this.leaderboard().map((x, i) => [x.u.id, i + 1])));
    return rank.get(userId) || 0;
  };

  // полный профиль для окна «Профиль»
  P.sendGift = function sendGift(user, toId, giftId, text) {
    const g = GIFTS[giftId]; if (!g) return { error: 'Нет такого подарка.' };
    const to = this.userById(Number(toId)); if (!to) return { error: 'Игрок не найден.' };
    const deny = this.canReach && this.canReach(user, to, 'gift'); if (deny) return { error: deny };
    if (g.premium && !this.isPremium(user)) return { error: 'Это уникальный подарок — дарить его можно только с премиумом.' };
    const now = Date.now();
    user.giftLog = (user.giftLog || []).filter((t) => t > now - 86400000);
    if (user.giftLog.length >= GIFTS_DAY) return { error: `Не больше ${GIFTS_DAY} подарков в сутки.` };
    if ((user.gold || 0) < g.gold) return { error: `Нужно ${g.gold} золота (у вас ${user.gold || 0}).` };
    this.goldChange(user, -g.gold, `Подарок «${g.name}» игроку ${to.login}`); user.giftLog.push(now); this.addStat(to.id, 'giftGold', g.gold);
    (to.gifts = to.gifts || []).push({ gift: giftId, from: user.id, at: now, text: String(text || '').trim().slice(0, 100) });
    if (to.gifts.length > 200) to.gifts = to.gifts.slice(-200);
    if (to.id !== user.id) {
      this.event(to.id, `${user.login} подарил Вам: ${g.name}!`);
      if (this.friendFeed) this.friendFeed(to.id, `${to.login} получил(а) подарок «${g.name}» от ${user.login}`, now);
      // сообщение в «Сообщения» от дарителя: какой подарок и подпись — подарок виден в профиле
      const note = String(text || '').trim().slice(0, 100);
      this.sendMail(user, to.login, 'Подарок', `🎁 Дарю тебе подарок «${g.name}»!${note ? `\n«${note}»` : ''}\nОн теперь в твоём профиле, раздел «Подарки».`);
    }
    this.store.save();
    return { ok: true, msg: `Подарок «${g.name}» отправлен игроку ${to.login}.` };
  };
  P.profileOf = function profileOf(u, viewer) {
    const al = this.allianceOf(u);
    return {
      id: u.id, login: u.login, race: u.race, raceName: C.RACE_NAMES[u.race], created: u.created, lastSeen: u.id === viewer.id || viewer.admin ? u.lastSeen || u.created : null, // кто когда в игре — видно только себе и админу
      rating: this.userRating(u), rank: this.rankOf(u.id), reputation: u.reputation ?? START_REP,
      title: u.admin ? 'Администратор' : u.smod ? 'Старший модератор' : u.mod ? 'Модератор форума' : this.isPremium(u) ? 'VIP' : null,
      // звания в профиле: VIP — пока действует купленный премиум (закончился — строка пропадает), плюс админ/модератор
      titles: [...((u.premium || 0) > Date.now() ? ['VIP'] : []), ...(u.admin ? ['Администратор'] : u.smod ? ['Старший модератор'] : u.mod ? ['Модератор форума'] : [])], premium: this.isPremium(u) && !u.admin ? u.premium : 0,
      chatBan: viewer.admin || viewer.mod || u.id === viewer.id ? u.chatBan || 0 : undefined,
      alliance: al ? { id: al.id, name: al.name, tag: al.tag, ...(this.allyTitle ? (({ title, ep }) => ({ role: title, ep }))(this.allyTitle(al, u.id)) : { role: al.leader === u.id ? 'Глава' : 'Участник', ep: 0 }) } : null,
      // «Пригласить в альянс» в чужом профиле: у игрока нет альянса, у смотрящего — альянс и право приглашать
      allyInvite: (() => { const my = u.id !== viewer.id && !al && this.allianceOf(viewer); if (!my || !this.allyCan || !this.allyCan(my, viewer.id, 'invite')) return null;
        return { tag: my.tag, name: my.name, sent: (u.invites || []).includes(my.id) }; })(),
      marriage: this.marriageLine ? this.marriageLine(u) : null,
      brank: this.brOf ? (({ idx, title, icon, stars }) => ({ idx, title, icon, stars }))(require('./battlerank').rankInfo(this.brRank(u))) : null,
      medals: this.medalsOf(u.id), hallRep: u.hallRep || 0, awards: (u.allyAwards || []).slice().reverse(), bossBadges: (u.bossBadges || []).slice().reverse(),
      castles: this.castlesOf(u).map((k, i) => ({ id: k.id, name: k.name, x: k.x, y: k.y, capital: i === 0, rating: this.rating(k) })),
      // история ников: прежние ники с датой смены; неприличный ник, сброшенный модерацией, видят только админ и модераторы
      nicks: (u.nickLog || []).filter((n) => !n.by || viewer.admin || viewer.mod || viewer.smod).map((n) => ({ from: n.from, to: n.to, at: n.at, mod: n.by ? 1 : undefined })).reverse(),
      self: u.id === viewer.id,
      friend: this.isFriend ? this.isFriend(viewer, u) : false, friendState: this.friendState ? this.friendState(viewer, u) : null, bday: u.bday ? this.bdayText(u.bday) : '', bdayRaw: u.id === viewer.id ? u.bday || '' : undefined,
      repToday: ((viewer.repGiven || {})[u.id] || 0) > Date.now() - 86400000,
      about: u.about || '', avatar: u.avatar || 0, frame: u.frame || '', gold: u.id === viewer.id ? u.gold || 0 : undefined,
      gifts: (u.gifts || []).slice(-50).reverse().map((g) => ({ gift: g.gift, from: (this.userById(g.from) || { login: '—' }).login, fromId: g.from, at: g.at, text: g.text || '' })),
      online: u.id === viewer.id || viewer.admin ? !!u.online : false,
    };
  };

  // «Поднять Репутацию»: за золото, 1 монета = REP_PER_GOLD репутации
  P.giveReputation = function giveReputation(from, toId, coins) {
    const to = this.userById(Number(toId));
    if (!to) return { error: 'Игрок не найден.' };
    coins = Math.floor(Number(coins));
    if (!(coins >= 1) || coins > 100000) return { error: 'Укажите количество монет.' };
    if ((from.gold || 0) < coins) return { error: `Не хватает золота (у вас ${from.gold || 0}).` };
    this.goldChange(from, -coins, `Репутация +${coins * REP_PER_GOLD} игроку ${to.login}`);
    const add = coins * REP_PER_GOLD + (to.id === from.id && this.isPremium(from) ? 1 : 0); // премиум: +1 себе
    to.reputation = (to.reputation ?? START_REP) + add; this.addStat(to.id, 'repGold', coins);
    this.cache = {};
    this.store.save();
    if (to.id !== from.id) this.event(to.id, `${from.login} поднял вам репутацию на ${add}!`);
    return { ok: true, add, rep: to.reputation };
  };

  P.playerRow = function playerRow(u, from) {
    const c = this.castlesOf(u)[0]; // столица
    const row = { id: u.id, login: u.login, race: u.race, raceName: C.RACE_NAMES[u.race], rating: this.userRating(u), x: c.x, y: c.y };
    if (from) row.dist = Math.round(Math.hypot(c.x - from.x, c.y - from.y) * 10) / 10;
    return row;
  };
  P.searchPlayers = function searchPlayers(q) {
    q = String(q || '').trim().toLowerCase();
    const list = q ? Object.values(this.db.users).filter((u) => u.login.toLowerCase().includes(q) || (u.nickLog || []).some((n) => !n.by && n.from.toLowerCase() === q)) : this.leaderboard().slice(0, 30).map((x) => x.u);
    return list.slice(0, 30).map((u) => this.playerRow(u));
  };
  // земляки — игроки в радиусе от замка
  P.nearby = function nearby(user, radius = 25) { // земляки — по индексу карты вокруг замка
    const c = this.castleOf(user), seen = new Set([user.id]), out = [];
    for (let y = c.y - radius; y <= c.y + radius; y++) for (let x = c.x - radius; x <= c.x + radius; x++) {
      const k = this.castleAt(x, y); if (!k || seen.has(k.owner)) continue; seen.add(k.owner);
      const u = this.userById(k.owner); if (u) out.push(this.playerRow(u, c));
    }
    return out.filter((r) => r.dist <= radius).sort((a, b) => a.dist - b.dist).slice(0, 30);
  };

  // общий чат (последние 100 сообщений)
  // модерация главного чата: удалить сообщение, запрет писать (часы или навсегда — -1)
  P.canModerate = (u) => !!(u && (u.admin || u.mod));
  P.chatDelete = function chatDelete(user, id) {
    if (!this.canModerate(user)) return { error: 'Нет прав.' };
    const n = (this.db.chat || []).length;
    this.db.chat = (this.db.chat || []).filter((m) => m.id !== Number(id));
    if (this.db.chat.length === n) return { error: 'Сообщение не найдено.' };
    this.store.save(); return { ok: true };
  };
  P.chatBanUser = function chatBanUser(user, login, hours) {
    if (!this.canModerate(user)) return { error: 'Нет прав.' };
    const t = this.db.users[String(login || '').trim()]; if (!t) return { error: 'Игрок не найден.' };
    if (t.admin || (t.smod && !user.admin) || (t.mod && !user.admin && !user.smod)) return { error: 'Этого игрока забанить нельзя.' }; // модератора — старший модератор, старшего — только админ
    hours = Number(hours);
    t.chatBan = hours === 0 ? 0 : hours < 0 ? -1 : Date.now() + hours * 3600000;
    if (hours !== 0) t.violations = (t.violations || 0) + 1; // «Нарушения» в профиле
    if (this.modLog) this.modLog(user, 'chat', t.login, hours === 0 ? 'запрет в чате снят' : `чат ${hours < 0 ? 'навсегда' : `на ${hours} ч.`}`); // журнал модерации
    this.event(t.id, hours === 0 ? 'Бан в чате снят.' : `Вам запрещено писать в чат ${hours < 0 ? 'навсегда' : `на ${hours} ч.`} (модератор ${user.login}).`);
    this.store.save();
    return { ok: true, msg: hours === 0 ? `Бан снят: ${t.login}.` : `${t.login}: бан в чате ${hours < 0 ? 'навсегда' : `на ${hours} ч.`}` };
  };
  P.chatPost = function chatPost(user, text) {
    if (user.chatBan === -1) return { error: 'Вам запрещено писать в чат навсегда.' };
    if (user.chatBan > Date.now()) return { error: `Вам запрещено писать в чат ещё ${Math.ceil((user.chatBan - Date.now()) / 60000)} мин.` };
    text = String(text || '').trim().slice(0, 300);
    if (!text) return { error: 'Пустое сообщение.' };
    const lim = this.tooOften(user, 'chat'); if (lim) return { error: lim }; // не чаще раза в 1,5 с и 15 в минуту
    this.db.chat = this.db.chat || [];
    const m = { id: this.db.nextId++, from: user.login, fromId: user.id, text, at: Date.now(), rep: user.reputation ?? START_REP, role: user.admin ? 'admin' : user.smod ? 'smod' : user.mod ? 'mod' : '', color: this.msgColor ? this.msgColor(user) : '' }; // цвет текста — премиум
    this.db.chat.push(m);
    if (this.db.chat.length > CHAT_KEEP) this.db.chat.splice(0, this.db.chat.length - CHAT_KEEP); // в чате хранятся последние 30
    this.store.save();
    return { msg: m };
  };
  // репутация — текущая (мечи/топоры рядом с ником в чате)
  // лайк / дизлайк сообщения в общем чате: один голос от игрока, повторное нажатие — снять, другое — сменить; за своё — нельзя
  P.chatVote = function chatVote(user, id, v) {
    const m = (this.db.chat || []).find((x) => x.id === Number(id)); if (!m) return { error: 'Сообщение уже ушло из чата.' };
    if (m.fromId === user.id) return { error: 'За своё сообщение голосовать нельзя.' };
    v = Number(v) > 0 ? 1 : -1; const had = (m.up || []).includes(user.id) ? 1 : (m.dn || []).includes(user.id) ? -1 : 0;
    m.up = (m.up || []).filter((x) => x !== user.id); m.dn = (m.dn || []).filter((x) => x !== user.id);
    if (had !== v) (v > 0 ? m.up : m.dn).push(user.id);
    if (!m.up.length) delete m.up; if (!m.dn.length) delete m.dn;
    this.store.save(); return { ok: true, id: m.id, up: m.up || [], dn: m.dn || [] };
  };
  P.chatLog = function chatLog() { return (this.db.chat || []).slice(-CHAT_KEEP).map((m) => { const u = this.userById(m.fromId); return { ...m, rep: u ? u.reputation ?? START_REP : m.rep, role: u ? (u.admin ? 'admin' : u.smod ? 'smod' : u.mod ? 'mod' : '') : m.role }; }); };

  P.setNotes = function setNotes(user, text) { user.notes = String(text || '').slice(0, 5000); this.store.save(); return { ok: true }; };
  P.setAbout = function setAbout(user, text) { user.about = String(text || '').slice(0, 500); this.store.save(); return { ok: true }; };

  // рейтинги по разделам «Рейтинг»
  P.ratingCastles = function ratingCastles() { return this.cached('rc', 15000, () => this.ratingCastlesCalc()); };
  P.ratingCastlesCalc = function ratingCastlesCalc() { // недострои (Освоение) — не замки рейтинга
    return Object.values(this.db.castles).filter((c) => !c.site).map((c) => { const u = this.userById(c.owner); return { id: u.id, login: u.login, name: c.name, x: c.x, y: c.y, rating: this.rating(c) }; })
      .sort((a, b) => b.rating - a.rating).slice(0, 500);
  };
  // очки альянса = сумма (рейтинг + репутация) всех участников
  P.allianceScore = function allianceScore(a) { return (a.members || []).reduce((s, id) => { const u = this.userById(id); return s + (u ? this.userRating(u) + (u.reputation ?? START_REP) : 0); }, 0); };
  P.ratingAlliances = function ratingAlliances() {
    return Object.values(this.db.alliances || {}).filter((a) => (a.members || []).length).map((a) => ({ id: a.id, name: a.name, tag: a.tag, members: a.members.length,
      rating: this.allianceScore(a) }))
      .sort((a, b) => b.rating - a.rating);
  };
  P.ratingReputation = function ratingReputation() {
    return Object.values(this.db.users).map((u) => ({ id: u.id, login: u.login, raceName: C.RACE_NAMES[u.race], rating: u.reputation ?? START_REP }))
      .sort((a, b) => b.rating - a.rating).slice(0, 500);
  };
}

module.exports = { REP_PER_GOLD, GIFTS, GIFT_CATS, install, HALLS, HALL_PAGES };
