'use strict';
// Проверка ника: только английские буквы, цифры и «_» (3–10 символов, первая — буква); без мата и оскорблений
// (русские — латиницей, как их пишут в никах, и английские) и без всего, что похоже на администрацию.
// Ник сначала «выпрямляется»: нижний регистр, без «_», цифры-подмены букв (0→o, 1→i/l, 3→e/з, 4→a/ч, 5→s, 6→б, 7→t, 8→б, 9→я)
// перебираются вариантами (и цифра может быть просто выброшена), повторы букв схлопываются (fuuuck → fuck).
// Затем ищется любой корень из списков ниже. Списки можно дополнять: ROOTS — запрещено как часть ника,
// EXACT — только целиком (короткие слова, которые иначе задели бы обычные имена: loh → Lohan, nazi → Nazira).

// мат и оскорбления — как часть ника
const ROOTS = [
  // русский мат и производные
  'huy', 'hui', 'huj', 'xuy', 'xui', 'xyu', 'xyi', 'huev', 'huesos', 'pizd', 'pisd', 'pezd',
  'eban', 'ebal', 'ebat', 'ebla', 'eblo', 'ebuch', 'ebnu', 'yeban', 'yebat', 'zaeb', 'uebok', 'ueban', 'dolboeb', 'dolbaeb', 'dolboyob', 'dalbaeb',
  'blya', 'blja', 'blyat', 'bljat', 'blyad', 'bljad', 'suka', 'cyka', 'suchk', 'pidor', 'pidar', 'pidr', 'pidaras', 'pedik', 'pederast', 'gomik',
  'mudak', 'mudil', 'mudoz', 'gandon', 'gondon', 'shlyuh', 'shluh', 'shlux', 'shalav', 'prostitut', 'zalup', 'droch', 'konchen',
  'govno', 'gavno', 'zhopa', 'zhope', 'jopa', 'srany', 'ssany', 'obossan', 'obosran',
  // оскорбления и унижения
  'chmo', 'chmyr', 'debil', 'idiot', 'kretin', 'urod', 'tvar', 'mraz', 'gnida', 'skotin', 'ublyud', 'ubljud', 'ublud', 'vyrodok', 'virodok',
  'bydlo', 'bidlo', 'ushlep', 'ushlyop', 'nishebrod', 'nishcheb', 'opushch', 'petushar', 'durachin', 'tupoy', 'tupoi', 'tupica', 'tupitsa',
  'otsos', 'sosal', 'sosat', 'soska', 'minet', 'dauny',
  // ненависть
  'nigg', 'nigga', 'hitler', 'nazist', 'fashist', 'zhidov',
  // английские
  'fuck', 'fvck', 'fuq', 'phuck', 'fck', 'shit', 'bitch', 'biatch', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'faggot', 'retard', 'moron',
  'asshole', 'arsehole', 'bastard', 'twat', 'wanker', 'dumbass', 'jackass', 'penis', 'vagina', 'porn', 'rapist', 'motherf',
];
// только целиком
const EXACT = ['loh', 'lox', 'lokh', 'daun', 'durak', 'dura', 'petuh', 'petux', 'kozel', 'ovca', 'shkura', 'zhid', 'hach', 'nazi', 'fag', 'fuk',
  'cock', 'loser', 'sex', 'rape', 'anal', 'negr', 'hren', 'her', 'sran', 'srat'];
// администрация: как часть ника и целиком
const ADMIN_ROOTS = ['admin', 'admln', 'adrnin', 'administ', 'moderat', 'support', 'sovetnik', 'sovietnik', 'covetnik', 'helpdesk', 'gamemast', 'gmaster',
  'official', 'system', 'server', 'owner', 'developer', 'creator', 'staff', 'glavmod', 'glavadm'];
const ADMIN_EXACT = ['adm', 'mod', 'mods', 'moder', 'moders', 'smod', 'gm', 'gms', 'dev', 'devs', 'root', 'sys', 'sysop'];

// цифры, похожие на буквы: каждый вариант (и «цифру выбросить») — ник «1d10t» найдётся как idiot, «5uka» — как suka, «pi3da» — как pizda
const LEET = { 0: ['o'], 1: ['i', 'l'], 2: [], 3: ['e', 'z'], 4: ['a', 'ch'], 5: ['s'], 6: ['b'], 7: ['t'], 8: ['b'], 9: ['ya'] }; // 9 похожа на «я»: bl9t
function variants(nick) {
  let out = [''];
  for (const ch of String(nick).toLowerCase().replace(/[^a-z0-9]/g, '')) {
    const opts = LEET[ch] ? [...LEET[ch], ''] : [ch];
    out = out.flatMap((p) => opts.map((o) => p + o));
    if (out.length > 2048) out = out.slice(0, 2048);
  }
  const set = new Set();
  for (const v of out) { set.add(v); set.add(v.replace(/(.)\1+/g, '$1')); }
  return [...set];
}

// причина отказа или null — ник можно брать
function nickProblem(nick) {
  const s = String(nick || '');
  if (!/^[A-Za-z][A-Za-z0-9_]{2,9}$/.test(s)) return 'Ник: 3–10 символов — английские буквы, цифры и «_», первая — буква.';
  const vs = variants(s);
  if (vs.some((v) => ADMIN_EXACT.includes(v) || ADMIN_ROOTS.some((r) => v.includes(r)))) return 'Ник похож на имя администрации — выберите другой.';
  if (vs.some((v) => EXACT.includes(v) || ROOTS.some((r) => v.includes(r)))) return 'Такой ник нельзя: в нём мат или оскорбление. Выберите другой.';
  return null;
}

module.exports = { nickProblem, variants, ROOTS, EXACT, ADMIN_ROOTS, ADMIN_EXACT };
