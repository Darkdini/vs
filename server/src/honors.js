'use strict';
// Особые медали (просто для красоты, без бонусов): «Первопроходец» — тестировщикам игры.
// Видна в профиле в строке «Звание», рядом со значками модераторов; нажатие — окно медали с датой вручения.
// Вручает и забирает только администратор: Админ-панель → 🎁 Выдать → 🏅 Медали (ники через запятую или всем тестерам).
// Хранится у игрока: u.honors = { <id медали>: <когда вручена> }.
const HONORS = {
  pioneer: { name: 'Первопроходец', desc: 'За помощь в тестировании игры', img: 'honors/pioneer.png', small: 'honors/pioneer_s.png' },
};
const NICKS_MAX = 50; // ников за одно вручение

function install(Game) {
  const P = Game.prototype;
  // медали игрока для профиля — по порядку вручения
  P.honorsOf = function honorsOf(u) {
    return Object.entries((u && u.honors) || {}).filter(([id]) => HONORS[id]).map(([id, at]) => ({ id, ...HONORS[id], at })).sort((a, b) => a.at - b.at);
  };
  // для админки: у кого какая медаль, сколько тестеров ещё без неё
  P.honorView = function honorView() {
    const users = Object.values(this.db.users).filter((u) => !u.bot);
    return { list: Object.entries(HONORS).map(([id, h]) => ({ id, ...h,
      who: users.filter((u) => u.honors && u.honors[id]).map((u) => ({ login: u.login, at: u.honors[id], tester: !!u.tester })).sort((a, b) => b.at - a.at),
      testersLeft: users.filter((u) => u.tester && !(u.honors && u.honors[id])).length })) };
  };
  const byNick = (g, s) => {
    const k = String(s || '').trim(); if (!k) return null;
    const u = Object.prototype.hasOwnProperty.call(g.db.users, k) ? g.db.users[k] : Object.values(g.db.users).find((x) => x.login.toLowerCase() === k.toLowerCase());
    return u && !u.bot ? u : null;
  };
  // вручить медаль: игрокам из списка; у кого уже есть — не трогаем; каждому новому — отчёт (его видно и тому, кого сейчас нет в игре)
  P.honorGive = function honorGive(id, list, now = Date.now()) {
    const h = HONORS[id], got = [], had = [];
    for (const u of list) {
      if (u.honors && u.honors[id]) { had.push(u.login); continue; }
      (u.honors = u.honors || {})[id] = now; got.push(u.login);
      this.report(u.id, `🏅 Вам вручена медаль «${h.name}»`, [`${h.desc}.`, 'Медаль — в Вашем профиле, в строке «Звание», рядом с именем. Её видят все, кто откроет профиль.'], 'honor');
    }
    if (got.length) this.store.save();
    return { got, had };
  };
  // команды админ-панели honor… (остальное — admin.js, closedtest.js, staff.js)
  const prev = P.adminOp;
  P.adminOp = function adminOp(user, op, arg = {}) {
    if (!String(op || '').startsWith('honor')) return prev.call(this, user, op, arg);
    if (!user || !user.admin) return { error: 'Нет прав.' };
    if (op === 'honorview') return { data: this.honorView() };
    const id = Object.prototype.hasOwnProperty.call(HONORS, arg.id) ? arg.id : null, h = id && HONORS[id];
    if (!h) return { error: 'Нет такой медали.' };
    if (op === 'honorgive') {
      let list, missing = [];
      if (arg.testers) list = Object.values(this.db.users).filter((u) => u.tester && !u.bot);
      else {
        const names = [...new Set(String(arg.nicks || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
        if (!names.length) return { error: 'Впишите ники через запятую.' };
        if (names.length > NICKS_MAX) return { error: `Не больше ${NICKS_MAX} ников за раз.` };
        list = []; for (const n of names) { const u = byNick(this, n); if (u) { if (!list.includes(u)) list.push(u); } else missing.push(n); }
      }
      if (!list.length && !missing.length) return { error: 'Тестеров нет.' };
      const r = this.honorGive(id, list);
      const msg = [r.got.length ? `Медаль «${h.name}» вручена: ${r.got.join(', ')}.` : `Новых награждённых нет.`,
        r.had.length ? `Уже была: ${r.had.join(', ')}.` : '', missing.length ? `Не найдены: ${missing.join(', ')}.` : ''].filter(Boolean).join(' ');
      return { data: { ...this.honorView(), msg } };
    }
    if (op === 'honortake') {
      const u = byNick(this, arg.login); if (!u) return { error: 'Игрок не найден.' };
      if (!(u.honors && u.honors[id])) return { error: `У ${u.login} нет медали «${h.name}».` };
      delete u.honors[id]; if (!Object.keys(u.honors).length) delete u.honors;
      this.store.save();
      return { data: { ...this.honorView(), msg: `${u.login}: медаль «${h.name}» снята.` } };
    }
    return { error: 'Неизвестная команда.' };
  };
}

module.exports = { install, HONORS };
