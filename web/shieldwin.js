'use strict';
// Ратуша → «Защита»: Контрразведка, Защита замка, Защита королевства на 1 / 3 / 7 дней за золото (server/src/shield.js).
S.shield = null;
const SHIELD_ABOUT = {
  spy: { ic: 'shop/spy.png', short: 'Позволяет защитить королевство от разведки.', plus: ['Разведчики противника не узнают состояние складов, постройки замка, количество и расположение армий.'], minus: [] },
  castle: { ic: 'shop/shield.png', short: 'Позволяет защитить от нападений текущий замок королевства.', plus: ['Защищает выбранный замок от атак и разведок противника на выбранный срок.', 'Добыча ресурсов в замке не останавливается.', 'Доступны все торговые операции рынка.'], minus: ['Армии королевства не могут вести боевых действий.', 'В защищаемый замок нельзя отправить подкрепление.', 'Снятый купол не восстанавливается — защиту придётся купить заново.'] },
  kingdom: { ic: 'shop/shield.png', short: 'Позволяет защитить всё королевство от нападений.', plus: ['Защищает все замки королевства от атак и разведок противника на выбранный срок.', 'Добыча ресурсов во всех замках не останавливается.', 'Доступны все торговые операции рынка.'], minus: ['Армии королевства не могут вести боевых действий.', 'В защищаемые замки нельзя отправить подкрепление.', 'Снятый купол не восстанавливается — защиту придётся купить заново.'] },
};
function openShield() { S.shieldNote = null; S.shieldInfoK = null; send({ t: 'shield', op: 'view' }); openSheet(shieldWin); }
function shieldWin() {
  const d = S.shield; if (!d) return `${ribbon('Защита')}<p class="parch-note">Загрузка…</p>`;
  const n = S.shieldNote && Date.now() - S.shieldNote.at < 8000 ? `<div class="smnote ${S.shieldNote.ok ? 'ok' : ''}">${S.shieldNote.ok ? '✔' : '⛔'} ${esc(S.shieldNote.msg)}</div>` : '';
  const until = (t) => (t ? `<div class="shuntil">🛡 Действует ещё <span class="cd" data-e="${t}"></span></div>` : '');
  // купол (защиту замка или королевства) игрок может снять сам — насовсем, с предупреждением
  const card = (x) => { const A = SHIELD_ABOUT[x.k], on = d[x.k];
    return `<div class="shld ${on ? 'on' : ''}"><div class="shtop"><button class="shi" data-shinfo="${x.k}"><img src="${GFX}${A.ic}" alt=""><b>i</b></button>
      <div><div class="shname">${esc(x.name)}${x.k === 'castle' ? ` <small>«${esc(S.st.castle.name)}»</small>` : ''}</div><div class="shshort">${esc(A.short)}</div>${until(on)}</div></div>${on && x.k !== 'spy' ? `<button class="shdome" data-shoff="${x.k}">Снять купол</button>` : ''}
      ${S.shieldInfoK === x.k ? `<div class="shmore">${A.plus.map((t) => `<div>✅ ${esc(t)}</div>`).join('')}${A.minus.length ? `<div class="shlim">Ограничения</div>${A.minus.map((t) => `<div>• ${esc(t)}</div>`).join('')}` : ''}</div>` : ''}
      <div class="shbuy">${Object.entries(x.price).map(([days, gold]) => `<button class="shday" data-shbuy="${x.k}" data-days="${days}" data-gold="${gold}"><span>${days} ${plural(Number(days), 'день', 'дня', 'дней')}</span><b><img src="${GFX}coins_s.png" alt=""> ${gold}</b></button>`).join('')}</div></div>`; };
  return `${ribbon('Защита')}${n}<div class="bwline center small">У вас ${fmtFull(d.gold)} монет. Срок продлевается: новая покупка прибавляется к оставшемуся времени. Снятый купол не восстанавливается.</div>${d.kinds.map(card).join('')}`;
}
const shDur = (ms) => { const m = Math.max(1, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60); return d ? `${d} дн ${h} ч` : h ? `${h} ч ${m % 60} мин` : `${m} мин`; };
// предупреждение перед снятием купола — своё окно (видно в игре и на скринах): купол сгорит, защиту придётся купить заново
function domeWarn(lines, okText, onOk) {
  const d = document.createElement('div'); d.className = 'rinfo';
  d.innerHTML = `<div class="rinfo-box okbox domewarn"><img src="${GFX}shop/shield.png" alt="">${lines.map((t) => `<p class="${t.bad ? 'dwbad' : ''}">${esc(t.text || t)}</p>`).join('')}
    <div class="dwbtns"><button type="button" class="dwno">Отмена</button><button type="button" class="dwyes">${esc(okText)}</button></div></div>`;
  d.addEventListener('click', (e) => { if (e.target.closest('.dwyes')) { d.remove(); onOk(); } else if (e.target === d || e.target.closest('.dwno')) d.remove(); });
  document.body.appendChild(d);
}
// нападение под куполом: сервер не отправил армию — спросить, снять ли купол насовсем и напасть
function domeAsk(m) {
  if (!S.lastSend) return toast(m.msg, 'err');
  const req = S.lastSend;
  domeWarn([`У вас действует ${m.domeAsk.what}.`, 'Пока купол надет, армии не нападают, не грабят и не разведывают.',
    { bad: true, text: 'Чтобы напасть, купол нужно снять. Он не восстановится: оставшееся время сгорит, защиту придётся купить заново.' }, 'Снять купол и отправить армию?'],
  'Снять и напасть', () => send({ ...req, dropShield: true }));
}
function shieldMsg(m) { S.shield = m.data; if (m.note) S.shieldNote = { ...m.note, at: Date.now() }; if (S.sheets.includes(shieldWin)) refreshSheet(); }
$('#sheetBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-shieldopen]')) return openShield();
  const i = e.target.closest('[data-shinfo]'); if (i) { S.shieldInfoK = S.shieldInfoK === i.dataset.shinfo ? null : i.dataset.shinfo; return refreshSheet(); }
  const o = e.target.closest('[data-shoff]');
  if (o) { // снять купол насовсем — после предупреждения
    const k = o.dataset.shoff, kingdom = k === 'kingdom', rest = Math.max(0, (S.shield[k] || 0) - now());
    return domeWarn([`Снять купол ${kingdom ? 'с королевства' : `с замка «${S.st.castle.name}»`}?`,
      { bad: true, text: `Купол не восстановится: оставшееся время (${shDur(rest)}) сгорит, защиту придётся купить заново.` },
      kingdom ? 'Без купола ваши замки можно атаковать.' : S.shield.kingdom ? 'Защита королевства продолжает действовать — замок под ней, армии не воюют.' : 'Без купола замок можно атаковать.'],
    'Снять купол', () => send({ t: 'shield', op: 'off', kind: k }));
  }
  const b = e.target.closest('[data-shbuy]'); if (!b) return;
  const gold = Number(b.dataset.gold), have = S.st.user.gold || 0, name = (S.shield.kinds.find((x) => x.k === b.dataset.shbuy) || {}).name;
  if (have < gold) return toast(`Не хватает монет: нужно ${gold}, у вас ${have}.`, 'err');
  if (!confirm(`${name} на ${b.dataset.days} дн. за ${gold} монет?${b.dataset.shbuy !== 'spy' ? '\nПока действует защита, ваши армии не смогут нападать, грабить и разведывать.' : ''}`)) return;
  send({ t: 'shield', op: 'buy', kind: b.dataset.shbuy, days: Number(b.dataset.days) });
});
