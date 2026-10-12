'use strict';
// «Подозрительное» для админа: раз в 10 минут сервер сравнивает каждого игрока с прошлым замером и записывает
// необъяснимые скачки — армия выросла больше, чем обучено и взято из Кладовой; золото пришло не от администрации
// или изменилось мимо журнала золота; лояльность населения выросла быстрее, чем позволяют правила; ресурсы сверх Склада.
// Действия админа над игроком (выдал золото, войска и т. п.) тревогу не вызывают: после них замер начинается заново.

const ALERT_MAX = 300;
const ROYAL_10MIN = 600, ROYAL_DAY = 1500; // законно — не больше ~700 в сутки (400 за действия + 50 + Храмы + ритуалы)
const GOLD_OK = /администрац|казн. альянса|звёзды Telegram/i; // поступления золота, которые не тревожат

function install(Game) {
  const P = Game.prototype;
  const ARMY = () => require('./army');
  // все воины игрока: в замках (и их отдельных армиях), в походе, в обучении и в экспедициях (Генерал и торговцы не считаются)
  P.armyTotal = function armyTotal(u) {
    const { GENERAL_ID } = ARMY(), skip = (id) => Number(id) === GENERAL_ID || Number(id) === 221;
    let n = 0;
    for (const c of this.castlesOf(u)) {
      for (const [id, v] of Object.entries(c.units || {})) if (!skip(id)) n += v || 0;
      for (const q of c.squads || []) for (const [id, v] of Object.entries(q.units || {})) if (!skip(id)) n += v || 0; // отдельные армии в замке
      for (const a of c.armies || []) for (const [id, v] of Object.entries(a.units || {})) if (!skip(id)) n += v || 0;
      for (const t of c.training || []) if (!skip(t.unit)) n += Math.max(0, (t.count || 0) - (t.done || 0));
      for (const e of c.expeds || []) n += e.n || 0;
    }
    return n;
  };
  const alerts = (g) => { if (!g.db.alerts) g.db.alerts = []; return g.db.alerts; };
  P.alert = function alert(u, kind, text, why = '') {
    const l = alerts(this);
    l.push({ id: this.db.nextId++, at: Date.now(), uid: u.id, login: u.login, kind, text, why, seen: false });
    if (l.length > ALERT_MAX) l.splice(0, l.length - ALERT_MAX);
  };
  P.alertsNew = function alertsNew() { return (this.db.alerts || []).filter((a) => !a.seen).length; };

  P.anomalyScan = function anomalyScan(now = Date.now()) {
    for (const u of Object.values(this.db.users)) {
      if (u.bot || u.admin) continue;
      const st = this.stats(u), cs = this.castlesOf(u);
      const snap = { at: now, army: this.armyTotal(u), trained: st.trained || 0, stashUnits: st.stashUnits || 0, gold: u.gold || 0, royal: u.royal || 0, castles: cs.length };
      const p = u.snap;
      const fresh = !p || (u.admTouch && u.admTouch >= p.at); // первый замер или админ менял игрока — только запоминаем
      if (!fresh) {
        // армия: рост сверх обученного и взятого из Кладовой
        const grow = snap.army - p.army, legal = (snap.trained - p.trained) + (snap.stashUnits - p.stashUnits);
        if (snap.castles === p.castles && grow - legal > Math.max(30, p.army * 0.1)) {
          this.alert(u, 'army', `Армия ${p.army.toLocaleString('ru-RU')} → ${snap.army.toLocaleString('ru-RU')} (+${(grow).toLocaleString('ru-RU')})`, `обучено ${legal >= 0 ? legal : 0}, из Кладовой ${snap.stashUnits - p.stashUnits} — без объяснения +${(grow - legal).toLocaleString('ru-RU')}`);
        }
        // золото: изменилось мимо журнала или пришло не от администрации
        const log = (u.goldLog || []).filter((x) => !x.chk), logged = log.reduce((s, x) => s + x.delta, 0); // каждая запись журнала проверяется один раз
        if (snap.gold - p.gold !== logged) this.alert(u, 'gold', `Золото ${p.gold} → ${snap.gold}`, `в журнале золота изменений на ${logged >= 0 ? '+' : ''}${logged} — разница ${snap.gold - p.gold - logged} без записи`);
        for (const x of log) if (x.delta > 0 && !GOLD_OK.test(x.reason || '')) this.alert(u, 'gold', `Получено золото +${x.delta}`, `причина: ${x.reason || 'не указана'}`);
        // лояльность населения
        const dr = snap.royal - p.royal;
        u.royalDay24 = (u.royalDay24 || []).filter((x) => x.at > now - 86400000); if (dr > 0) u.royalDay24.push({ at: now, v: dr });
        const day = u.royalDay24.reduce((s, x) => s + x.v, 0);
        if (dr > ROYAL_10MIN) this.alert(u, 'royal', `Лояльность населения +${Math.round(dr)} за 10 минут`, `было ${Math.round(p.royal)}, стало ${Math.round(snap.royal)}; законно — не больше ~700 в сутки`);
        else if (day > ROYAL_DAY && !u.royalWarned) { this.alert(u, 'royal', `Лояльность населения +${Math.round(day)} за сутки`, 'законно — не больше ~700 в сутки'); u.royalWarned = now; }
        if (u.royalWarned && now - u.royalWarned > 86400000) u.royalWarned = 0;
      }
      // ресурсы сверх вместимости Склада (законные пути ресурсы обрезают)
      for (const c of cs) {
        const cap = this.capacity(c);
        // излишек от советника тает по мере траты: запоминаем меньшее, ниже Склада — забываем
        if (c.overOk) for (const r of Object.keys(c.overOk)) { if ((c.res[r] || 0) <= cap[r]) delete c.overOk[r]; else c.overOk[r] = Math.min(c.overOk[r], Math.ceil(c.res[r])); }
        for (const r of ['wood', 'stone', 'iron', 'food']) if ((c.res[r] || 0) > Math.max(cap[r] * 1.05 + 100, ((c.overOk || {})[r] || 0) + 1) && !(u.admTouch && u.admTouch > now - 3600000)) { // overOk — излишек от советника
          if (c.overWarn && now - c.overWarn < 86400000) continue;
          c.overWarn = now; this.alert(u, 'res', `«${c.name}»: ресурсов больше Склада`, `${r === 'wood' ? 'дерево' : r === 'stone' ? 'камень' : r === 'iron' ? 'железо' : 'еда'} ${Math.round(c.res[r]).toLocaleString('ru-RU')} при вместимости ${cap[r].toLocaleString('ru-RU')}`);
        }
      }
      for (const x of u.goldLog || []) x.chk = 1;
      u.snap = snap;
    }
  };
}

module.exports = { install };
