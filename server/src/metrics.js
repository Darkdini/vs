'use strict';
// Статистика для админа (Админ-панель → «Статистика»): онлайн по часам, регистрации и активные игроки по дням,
// сколько новичков вернулось на следующий день (и через неделю), траты и поступления золота.
// Онлайн записывается раз в минуту (максимум за час), дни активности — у каждого игрока (u.act, последние 60 дней).
// Время — московское.

const DAY = 86400000, MSK = 3 * 3600000;
const dayKey = (t) => new Date(t + MSK).toISOString().slice(0, 10);
const hourKey = (t) => new Date(t + MSK).toISOString().slice(0, 13);
// траты золота по видам (по началу причины в журнале золота)
const GOLD_KIND = [[/^Премиум/, 'Премиум'], [/^Подарок/, 'Подарки'], [/^Репутация/, 'Репутация'], [/^Ритуал/, 'Ритуалы'], [/^Праздник/, 'Праздники'],
  [/^Смена ника/, 'Смена ника'], [/^Воскрешение/, 'Воскрешение генерала'], [/^Сброс/, 'Сброс очков/умений'], [/казн. альянса|альянс/i, 'Альянс'],
  [/администрац/i, 'Администрация']];
const goldKind = (reason) => { for (const [re, k] of GOLD_KIND) if (re.test(reason || '')) return k; return 'Прочее'; };

function install(Game) {
  const P = Game.prototype;
  const M = (g) => { if (!g.db.metrics) g.db.metrics = { online: {} }; return g.db.metrics; };
  // игрок что-то делает — отметить день активности
  P.markActive = function markActive(u, now = Date.now()) {
    if (!u || u.bot) return;
    const d = dayKey(now); if (u.actDay === d) return;
    u.actDay = d; (u.act = u.act || []).push(d); if (u.act.length > 60) u.act.splice(0, u.act.length - 60);
  };
  // раз в минуту: сколько игроков онлайн (храним максимум за каждый час, 30 дней)
  P.metricTick = function metricTick(online, now = Date.now()) {
    const m = M(this), h = hourKey(now);
    m.online[h] = Math.max(m.online[h] || 0, online);
    const old = hourKey(now - 30 * DAY); for (const k of Object.keys(m.online)) if (k < old) delete m.online[k];
  };
  P.adminStats = function adminStats(onlineNow, now = Date.now()) {
    const m = M(this), users = Object.values(this.db.users).filter((u) => !u.bot && !u.admin);
    // онлайн за последние 48 часов (максимум в каждом часе)
    const hours = Array.from({ length: 48 }, (_, i) => { const t = now - (47 - i) * 3600000, k = hourKey(t); return { k, h: k.slice(11, 13), v: m.online[k] || 0 }; });
    // по дням за 14 дней: регистрации, активные, пик онлайна, вернулись на след. день и через 7 дней
    const regBy = {}, actBy = {};
    for (const u of users) {
      if (u.created) { const d = dayKey(u.created); (regBy[d] = regBy[d] || []).push(u); }
      for (const d of u.act || []) actBy[d] = (actBy[d] || 0) + 1;
    }
    const today = dayKey(now);
    const days = Array.from({ length: 14 }, (_, i) => {
      const t = now - (13 - i) * DAY, d = dayKey(t), d1 = dayKey(t + DAY), d7 = dayKey(t + 7 * DAY), reg = regBy[d] || [];
      let peak = 0; for (const [k, v] of Object.entries(m.online)) if (k.startsWith(d) && v > peak) peak = v;
      const back = (dd) => (dd > today ? null : reg.filter((u) => (u.act || []).includes(dd)).length);
      return { d, reg: reg.length, active: actBy[d] || 0, peak, d1: back(d1), d7: back(d7) };
    });
    // золото за 30 дней
    const from = now - 30 * DAY, spent = {}, got = {}; let inSum = 0, outSum = 0; const spenders = [], buyers = [];
    for (const u of users) {
      let o = 0, i = 0;
      for (const x of u.goldLog || []) {
        if (x.at < from) continue;
        if (x.delta < 0) { const k = goldKind(x.reason); spent[k] = spent[k] || { k, sum: 0, n: 0 }; spent[k].sum -= x.delta; spent[k].n++; o -= x.delta; }
        else { const k = goldKind(x.reason); got[k] = got[k] || { k, sum: 0, n: 0 }; got[k].sum += x.delta; got[k].n++; i += x.delta; }
      }
      outSum += o; inSum += i;
      if (o) spenders.push({ login: u.login, sum: o }); if (i) buyers.push({ login: u.login, sum: i });
    }
    const top = (l) => l.sort((a, b) => b.sum - a.sum).slice(0, 5);
    const week = dayKey(now - 6 * DAY);
    return {
      now: { online: onlineNow, users: users.length, active7: users.filter((u) => (u.act || []).some((d) => d >= week)).length, regToday: (regBy[today] || []).length,
        goldHeld: users.reduce((s, u) => s + (u.gold || 0), 0) },
      hours, days,
      gold: { in: inSum, out: outSum, spent: Object.values(spent).sort((a, b) => b.sum - a.sum), got: Object.values(got).sort((a, b) => b.sum - a.sum), spenders: top(spenders), buyers: top(buyers) },
    };
  };
}

module.exports = { install, dayKey, hourKey };
