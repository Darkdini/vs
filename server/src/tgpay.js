'use strict';
// Покупка монет за звёзды Telegram — через бота игроков (tgauth.js, тот же токен TG_AUTH_TOKEN): 3 ⭐ = 1 монета.
// • Казна → пакет → сервер создаёт счёт (createInvoiceLink, валюта XTR) с одноразовым номером → игрок платит в Telegram.
// • Перед оплатой Telegram спрашивает бота (pre_checkout_query): счёт есть, не оплачен, сумма та же — иначе оплата не проходит.
// • После оплаты (successful_payment) монеты зачисляются один раз — по номеру платежа Telegram; повтор сообщения ничего не даёт.
// • Возврат звёзд (refunded_payment: магазин вернул игроку деньги за звёзды или администратор вернул звёзды) — монеты списываются,
//   даже если уже потрачены: баланс уходит в минус, и пока минус не закрыт, тратить монеты нельзя (все траты проверяют «хватает ли»).
// • /paysupport — вопросы об оплате (Telegram требует его у ботов, которые продают за звёзды).
const crypto = require('crypto');
const { enabled } = require('./tgauth');

const STARS_PER_GOLD = 3;
const PACKS = [5, 25, 50, 100, 250, 500].map((gold) => ({ gold, stars: gold * STARS_PER_GOLD }));
const INV_MS = 2 * 86400000, INV_PER_HOUR = 10, HOUR = 3600000, LIST_MAX = 5000;
const PAYLOAD = /^g:([0-9a-f]{32})$/;
const SUPPORT = 'Оплата звёздами: монеты приходят на аккаунт сразу после оплаты.\n'
  + 'Если монеты не пришли — напишите в игре: Меню → Инфо → Поддержка (время оплаты и сколько звёзд).\n'
  + 'Покупки за звёзды не возвращаются. Если Telegram или магазин приложений вернули вам деньги за звёзды — купленные монеты списываются.';

const payInfo = () => ({ on: enabled(), rate: STARS_PER_GOLD, packs: PACKS });

function install(Game) {
  const P = Game.prototype;
  const st = (g) => { if (!g.db.pay) g.db.pay = { inv: {}, list: [] }; return g.db.pay; };

  // счёт на пакет: Promise → { url } (ссылка t.me/$… открывает оплату в Telegram) или { error }
  P.payStart = function payStart(u, pack, now = Date.now()) {
    if (!enabled()) return Promise.resolve({ error: 'Оплата звёздами пока не подключена.' });
    const p = PACKS[Number(pack)];
    if (!u || u.bot || !Number.isInteger(Number(pack)) || !p) return Promise.resolve({ error: 'Нет такого пакета.' });
    const reqs = (u.payReq || []).filter((t) => t > now - HOUR);
    if (reqs.length >= INV_PER_HOUR) return Promise.resolve({ error: 'Слишком много счетов — попробуйте через час.' });
    u.payReq = [...reqs, now];
    const S = st(this);
    for (const [k, v] of Object.entries(S.inv)) if (now - v.at > INV_MS) delete S.inv[k]; // неоплаченные счета живут двое суток
    const id = crypto.randomBytes(16).toString('hex');
    S.inv[id] = { uid: u.id, gold: p.gold, stars: p.stars, at: now };
    this.store.save();
    return this.tgApi('createInvoiceLink', {
      title: `${p.gold} монет`, description: `Монеты для игры «Средневековье», аккаунт «${u.login}». Придут сразу после оплаты.`,
      payload: `g:${id}`, currency: 'XTR', prices: [{ label: `${p.gold} монет`, amount: p.stars }],
    }).then((url) => (typeof url === 'string' && /^https:\/\/t\.me\//.test(url) ? { url } : { error: 'Telegram не выдал счёт — попробуйте ещё раз.' }),
      (e) => { console.error('оплата звёздами (счёт):', e.message); return { error: 'Telegram не ответил — попробуйте ещё раз.' }; });
  };

  // перед оплатой: счёт наш, не оплачен, не устарел, сумма та же
  P.payPreCheckout = function payPreCheckout(q, now = Date.now()) {
    if (!q || !q.id) return null;
    const m = PAYLOAD.exec(String(q.invoice_payload || '')), inv = m && st(this).inv[m[1]], u = inv && this.userById(inv.uid);
    let err = '';
    if (!inv || !u || now - inv.at > INV_MS) err = 'Счёт устарел — откройте покупку в игре ещё раз.';
    else if (q.currency !== 'XTR' || Number(q.total_amount) !== inv.stars) err = 'Сумма не совпадает со счётом — откройте покупку в игре ещё раз.';
    return this.tgApi('answerPreCheckoutQuery', err ? { pre_checkout_query_id: q.id, ok: false, error_message: err } : { pre_checkout_query_id: q.id, ok: true })
      .catch((e) => console.error('оплата звёздами (проверка):', e.message));
  };

  // оплачено: монеты — один раз на номер платежа Telegram
  P.payDone = function payDone(msg, now = Date.now()) {
    const sp = msg.successful_payment, S = st(this), charge = String(sp.telegram_payment_charge_id || '');
    if (!charge || S.list.some((x) => x.charge === charge)) return null; // повтор того же платежа
    const m = PAYLOAD.exec(String(sp.invoice_payload || '')), inv = m && S.inv[m[1]], u = inv && this.userById(inv.uid);
    const rec = { charge, uid: u ? u.id : 0, login: u ? u.login : '', gold: 0, stars: Number(sp.total_amount) || 0, at: now, tg: (msg.from && msg.from.id) || 0 };
    if (!u || sp.currency !== 'XTR' || rec.stars !== inv.stars) { // не должно случаться (проверено перед оплатой) — разбирает администратор
      rec.lost = true; S.list.push(rec); this.store.save();
      if (this.alert) this.alert(u || this.adminUser(), 'gold', `Оплата ${rec.stars} ⭐ без подходящего счёта`, `платёж ${charge}: монеты не начислены — начислить вручную`);
      return this.tgSay(msg.chat.id, 'Оплата получена, но счёт не найден. Напишите в игре: Меню → Инфо → Поддержка — монеты начислит администрация.');
    }
    delete S.inv[m[1]];
    rec.gold = inv.gold;
    this.goldChange(u, inv.gold, `Покупка ${inv.gold} монет за ${inv.stars} ⭐ (звёзды Telegram)`);
    S.list.push(rec); if (S.list.length > LIST_MAX) S.list.splice(0, S.list.length - LIST_MAX);
    this.store.save();
    this.event(u.id, `✅ Зачислено ${inv.gold} монет за звёзды Telegram`);
    return this.tgSay(msg.chat.id, `✅ Оплата получена: ${inv.gold} монет зачислено на аккаунт «${u.login}». Спасибо!`);
  };

  // звёзды вернулись игроку: монеты — назад, хоть в минус
  P.payRefund = function payRefund(msg, now = Date.now()) {
    const rp = msg.refunded_payment, charge = String(rp.telegram_payment_charge_id || '');
    const rec = st(this).list.find((x) => x.charge === charge);
    if (!rec || rec.refunded) return null;
    rec.refunded = now;
    const u = this.userById(rec.uid);
    if (u && rec.gold) {
      u.gold = (u.gold || 0) - rec.gold;
      (u.goldLog = u.goldLog || []).push({ at: now, delta: -rec.gold, reason: `Возврат ${rec.stars} ⭐: списано ${rec.gold} монет`, left: u.gold });
      if (u.goldLog.length > 200) u.goldLog.splice(0, u.goldLog.length - 200);
      this.event(u.id, `Звёзды за покупку вернулись к вам — списано ${rec.gold} монет`);
      if (this.alert) this.alert(u, 'gold', `Возврат ${rec.stars} ⭐: −${rec.gold} монет`, `монет теперь ${u.gold}${u.gold < 0 ? ' (минус — тратить нельзя)' : ''}`);
    }
    this.store.save();
    return msg.chat ? this.tgSay(msg.chat.id, `Возврат ${rec.stars} ⭐ получен — ${rec.gold} монет списано с аккаунта «${rec.login}».`) : null;
  };

  P.paySupport = function paySupport(chat) { return this.tgSay(chat, SUPPORT); };

  // для админ-панели: последние платежи и итоги
  P.payList = function payList(n = 100) {
    const L = st(this).list, ok = L.filter((x) => !x.lost && !x.refunded);
    return { list: L.slice(-n).reverse(), stars: ok.reduce((s, x) => s + x.stars, 0), gold: ok.reduce((s, x) => s + x.gold, 0), count: ok.length, refunds: L.filter((x) => x.refunded).length };
  };
}

module.exports = { install, payInfo, PACKS, STARS_PER_GOLD };
