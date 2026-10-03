'use strict';
// ЗАГС, как в оригинале: плитки «Свадьба» (подать заявление), «Предложение» (мне / мои), «Рейтинг пар», «Справка»,
// «Последние браки» с «Поздравить пару!» и «Страница пары». Страница пары: супруги, дата брака, место и голоса,
// «Проголосовать» (за золото, 1 монета = 1 голос), подарки паре, комментарии. Сервер: server/src/zags.js.

S.zags = null; S.zprops = null; S.zpairs = null; S.zpair = null; S.zpropTab = 'in';
const ZI = (n, cls = '') => `<img class="zi ${cls}" src="${GFX}zags/${n}.png" alt="">`;
const ZTHUMB = ZI('thumb'), ZSTAR = ZI('star');
function openZags() { S.zags = null; send({ t: 'zags' }); openSheet(zagsWin); }
function openPairs() { S.zpairs = null; S.zpage = 0; send({ t: 'zpairs' }); openSheet(zpairsWin); }
function openPair(id) { S.zpair = { id: Number(id), loading: true }; send({ t: 'zpair', id: Number(id) }); openSheet(zpairWin); }
function openZprops(tab = 'in') { S.zprops = null; S.zpropTab = tab; send({ t: 'zprops' }); openSheet(zpropsWin); }
const zname = (u) => `<a class="plink" data-cprof="${u.id}">${esc(u.login)}</a>`;

function zagsWin() {
  const h = S.zags, tile = (k, icon, text, n) => `<button class="ptile" data-ztile="${k}"><img src="${icon}" alt=""><span>${text}</span>${n ? `<b class="zbadge">${n}</b>` : ''}</button>`;
  return `<div class="ptiles pbig ztiles">
      ${tile('wed', `${GFX}zags/arch.png`, 'Свадьба')}
      ${tile('props', `${GFX}zags/ringbox.png`, 'Предложение', h && h.incoming)}
      ${tile('pairs', `${GFX}zags/rating.png`, 'Рейтинг пар')}
      ${tile('help', `${GFX}zags/help.png`, 'Справка')}
    </div>
    ${h && h.my ? `<button class="pbar" data-zpair="${h.my.id}">${ZI('rings')} Наша пара: ${esc(h.my.spouse.login)} · ${ZSTAR} ${h.my.place} · ${ZTHUMB} ${fmtFull(h.my.votes)}</button>` : ''}
    ${ribbon('Последние браки')}
    ${!h ? '<p class="parch-note">Загрузка…</p>' : h.last.length ? h.last.map((m) => `<div class="zlast">${ZI('queen')} Королева ${zname(m.queen)} заключила брак с ${ZI('king')} Королем ${zname(m.king)}! Совет Вам, да любовь!</div>
      <button class="zbar" data-zcongr="${m.id}">${ZI('cake')} Поздравить пару!</button><button class="zbar" data-zpair="${m.id}">${ZI('heartat')} Страница пары</button>`).join('')
      : '<p class="parch-note">Браков пока не было — станьте первой парой Третьего Мира!</p>'}`;
}
// «Свадьба» — заявление о браке
function zproposeWin() {
  return `${ribbon('ЗАГС')}<form class="stack zform" data-form="zpropose">
    <p class="zlab">Введите имя игрока, с которым хотите заключить брак:</p><input name="to" autocapitalize="none" autocomplete="off" value="${esc(S.zproposeTo || '')}">
    <p class="zlab">Введите ваше признание в любви:</p><textarea name="text" rows="3" maxlength="300"></textarea>
    <p class="zlab">Вы являетесь</p><select name="role"><option value="king">Королем</option><option value="queen">Королевой</option></select>
    <p class="zcost">Стоимость отправки заявки составляет ${gimg('coins_s.png', 'ri')} ${(S.zprops && S.zprops.price) || 10}. Если ваше предложение отвергнут, золото возвращено не будет!</p>
    <button class="pbar">Отправить</button></form>`;
}
function zpropsWin() {
  const d = S.zprops, tab = S.zpropTab, list = d ? d[tab] : null;
  const head = `${ribbon('Предложения')}<div class="rkbar"><span>${tab === 'in' ? 'Предложения мне' : 'Мои предложения'}</span><button data-zptab="${tab === 'in' ? 'out' : 'in'}">≡</button></div>`;
  if (!list) return `${head}<p class="parch-note">Загрузка…</p>`;
  if (!list.length) return `${head}<p class="parch-note">${tab === 'in' ? 'Вам еще не прислали ни одной заявки на брак.' : 'Вы пока никому не делали предложение.'}</p>`;
  return head + list.map((p) => `<div class="zprop"><div class="zpava" data-cprof="${p.user.id}">${avatarImg(p.user)}</div><div>
      ${tab === 'in' ? `${p.role === 'king' ? `${ZI('king')} Король` : `${ZI('queen')} Королева`} ${zname(p.user)} предлагает Вам руку и сердце!` : `Вы предложили брак игроку ${zname(p.user)} (Вы — ${p.role === 'king' ? 'Король' : 'Королева'}).`}
      <div class="ztext">«${esc(p.text)}»</div><small class="muted">${fmtDate(p.at)} · действует до ${fmtDay(p.exp)}</small>
      <div class="zbtns">${tab === 'in' ? `<button class="zbar" data-zans="yes:${p.id}">${ZI('rings')} Принять</button><button class="zbar" data-zans="no:${p.id}">Отклонить</button>`
        : `<button class="zbar" data-zans="cancel:${p.id}">Отозвать</button>`}</div></div></div>`).join('');
}
function zpairsWin() {
  const list = S.zpairs;
  const head = `${ribbon('Рейтинг')}<p class="center zhead">Рейтинг самых крепких семейных пар Третьего Мира:</p>`;
  if (!list) return `${head}<p class="parch-note">Загрузка…</p>`;
  const pages = Math.max(1, Math.ceil(list.length / 10)), pg = Math.min(S.zpage || 0, pages - 1);
  const nav = `<div class="hnav"><button data-zpg="0" ${pg ? '' : 'disabled'}>◀◀</button><button data-zpg="${pg - 1}" ${pg ? '' : 'disabled'}>◀</button>
    <span>${pg + 1}</span><button data-zpg="${pg + 1}" ${pg < pages - 1 ? '' : 'disabled'}>▶</button><button data-zpg="${pages - 1}" ${pg < pages - 1 ? '' : 'disabled'}>▶▶</button></div>`;
  const mine = (m) => m.king.id === me() || m.queen.id === me();
  const rows = list.slice(pg * 10, pg * 10 + 10).map((m, j) => `<div class="${mine(m) ? 'me' : ''}"><span>${ZSTAR} ${pg * 10 + j + 1}</span>
    <a data-zpair="${m.id}">${esc(m.king.login)} и ${esc(m.queen.login)}</a><span>${ZTHUMB} ${fmtFull(m.votes)}</span></div>`).join('');
  return `${head}${nav}<div class="htable rtab ztab">${rows || '<p class="parch-note">Семейных пар пока нет.</p>'}</div>${rows ? nav : ''}`;
}
function zpairWin() {
  const p = S.zpair;
  if (!p || p.loading) return `${ribbon('ЗАГС')}<p class="parch-note">Загрузка…</p>`;
  const gifts = p.gifts || [];
  return `${ribbon('ЗАГС')}
    <div class="zcouple"><div><div class="zava" data-cprof="${p.king.id}">${avatarImg(p.king)}</div>${ZI('king')} Муж: ${zname(p.king)}</div>
      <div><div class="zava" data-cprof="${p.queen.id}">${avatarImg(p.queen)}</div>${ZI('queen')} Жена: ${zname(p.queen)}</div></div>
    <div class="pline">🕰 Брак заключен: ${fmtDate(p.at)}</div>
    <div class="pline">${ZSTAR} Рейтинг пары: ${ZSTAR} ${p.place} место, ${ZTHUMB} ${fmtFull(p.votes)} ${plural(p.votes, 'голос', 'голоса', 'голосов')}.</div>
    <button class="zbar" data-zvote="${p.id}">${ZTHUMB} Проголосовать</button>
    ${p.mine ? `<button class="zbar zdiv" data-zdivorce>${ZI('broken')} Развестись</button>` : ''}
    ${ribbon(`Подарки пары - ${gifts.length}`)}
    ${gifts.length ? `<div class="prow zgifts">${gifts.slice(0, 12).map((g) => `<img class="pgi" src="${GFX}${(S.cat.gifts[g.gift] || {}).img}" alt="" title="от ${esc(g.from)}">`).join('')}${gifts.length > 12 ? `<b>+${gifts.length - 12}</b>` : ''}</div>` : ''}
    <div class="zrow2"><button class="zbar" data-zcongr="${p.id}">Подарить</button><button class="zbar" data-zgiftlist>Посмотреть</button></div>
    ${ribbon('Комментарии')}
    <form class="stack" data-form="zcomment"><textarea name="text" rows="2" maxlength="300"></textarea><button class="pbar">Добавить</button></form>
    ${(p.comments || []).map((c) => `<div class="zcom"><a class="plink" data-cprof="${c.fromId}">${esc(c.from)}</a>:${c.del ? `<button class="zdel" data-zcdel="${c.id}" title="Удалить">✕</button>` : ''}<div>${esc(c.text)}</div></div>`).join('')}`;
}
function zgiftListWin() {
  const p = S.zpair, gifts = (p && p.gifts) || [];
  return `${ribbon('Подарки пары')}${gifts.length ? gifts.map((g) => { const x = S.cat.gifts[g.gift] || {}; return `<div class="award"><img src="${GFX}${x.img}" alt=""><div><b>${esc(x.name || '')}</b><small>от ${esc(g.from)} · ${fmtDate(g.at)}</small></div></div>`; }).join('')
    : '<p class="parch-note">Подарков пока нет — поздравьте пару первым!</p>'}`;
}
function zgiftsWin() {
  const list = Object.entries(S.cat.gifts || {});
  return `${ribbon('🎁 Подарок паре')}<div class="bwline center">У вас ${gimg('coins_s.png', 'ri')} ${fmtFull(S.st.user.gold || 0)}</div>
    ${list.map(([id, g]) => `<div class="giftrow"><img src="${GFX}${g.img}" alt="">${g.premium ? '<div class="gprem">Премиум подарок</div>' : ''}
      <div class="bwline center">${esc(g.name)} ( ${gimg('coins_s.png', 'ri')} ${g.gold})</div>
      ${g.premium && !isPrem() ? '<div class="center bwline muted">🔒 Уникальный подарок — дарить можно с премиумом</div>' : `<div class="center bwline">🎁 <a class="plink" data-zgift="${id}">Подарить</a> паре!</div>`}</div>`).join('')}`;
}
function zvoteWin() {
  const c = S.zcoins || 1, gold = S.st.user.gold || 0;
  return `${ribbon('Рейтинг пары')}<div class="bwline center">1 ${gimg('coins_s.png', 'ri')} = 1 ${ZTHUMB} · у вас ${gimg('coins_s.png', 'ri')} ${fmtFull(gold)}</div>
    <div class="arow"><span>Монет:</span><input class="anum" type="number" inputmode="numeric" min="1" value="${c}" data-zcoins></div>
    <button class="pbar" data-zvotego>Поднять рейтинг паре на <span data-zvn>${c}</span></button>`;
}
const zhelpWin = () => `${ribbon('Заявления')}<div class="pstats zhelp">Чтобы подать заявление, зайдите в «${ZI('rings')} ЗАГС» и нажмите «Свадьба».<br><br>
  В открывшемся окне введите имя избранницы (избранника), текст предложения, Вашу роль в браке (Король / Королева) и нажмите «Отправить». Заявка стоит ${gimg('coins_s.png', 'ri')} 10 — если предложение отвергнут, золото не возвращается.<br><br>
  Вашей половинке придёт уведомление, и она сможет принять или отклонить Ваше предложение.<br><br>
  Посмотреть Ваши предложения и предложения, сделанные Вам, можно в разделе «Предложение».<br><br>
  Предложения действуют 2 недели. Когда брак заключён, Ваши другие предложения снимаются.<br><br>
  Рейтинг пары поднимается за золото: 1 ${gimg('coins_s.png', 'ri')} = 1 голос. Нажмите на пару (в профиле, рейтинге или «Последних браках») и затем «Проголосовать». Развестись можно там же — кнопка «Развестись» на странице Вашей пары.</div>`;

function zagsMsg(m) {
  if (m.t === 'zags') S.zags = m.home;
  else if (m.t === 'zprops') S.zprops = m.data;
  else if (m.t === 'zpairs') S.zpairs = m.list;
  else if (m.t === 'zpair') { S.zpair = m.pair; }
  else if (m.t === 'zdone') {
    okPopup(m.msg);
    if (m.go === 'pair' && m.pair) { closeSheet(); return openPair(m.pair); }
    if (m.go === 'props') {
      if (S.sheets[S.sheets.length - 1] === zpropsWin) { S.zprops = null; send({ t: 'zprops' }); return refreshSheet(); }
      if (S.sheets[S.sheets.length - 1] === zproposeWin) closeSheet();
      return openZprops('out');
    }
    if (m.go === 'home') { closeSheet(); return openZags(); }
  }
  refreshSheet();
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-ztile],[data-zpair],[data-zcongr],[data-zans],[data-zptab],[data-zpg],[data-zvote],[data-zvotego],[data-zgift],[data-zgiftlist],[data-zcdel],[data-zdivorce],[data-zprofvote]'); if (!t) return;
  const d = t.dataset;
  if (d.ztile === 'wed') { S.zproposeTo = ''; return openSheet(zproposeWin); }
  if (d.ztile === 'props') return openZprops('in');
  if (d.ztile === 'pairs') return openPairs();
  if (d.ztile === 'help') return openSheet(zhelpWin);
  if (d.zpair) return openPair(d.zpair);
  if (d.zcongr) { S.zgiftTo = Number(d.zcongr); return openSheet(zgiftsWin); }
  if (d.zans) { const [op, id] = d.zans.split(':'); if (op === 'yes' && !confirm('Принять предложение и заключить брак?')) return; return send({ t: 'zanswer', op, id: Number(id) }); }
  if (d.zptab) { S.zpropTab = d.zptab; return refreshSheet(); }
  if (d.zpg !== undefined) { S.zpage = Math.max(0, Number(d.zpg)); return refreshSheet(); }
  if (d.zvote || d.zprofvote) { S.zvoteId = Number(d.zvote || d.zprofvote); S.zcoins = 1; return openSheet(zvoteWin); }
  if (d.zvotego !== undefined) { document.activeElement && document.activeElement.blur(); closeSheet(); if (S.sheets[S.sheets.length - 1] !== zpairWin) openPair(S.zvoteId); return send({ t: 'zvote', id: S.zvoteId, coins: S.zcoins || 1 }); }
  if (d.zgift) { const g = S.cat.gifts[d.zgift]; if (!confirm(`Подарить паре «${g.name}» за ${g.gold} золота?`)) return; closeSheet(); if (S.sheets[S.sheets.length - 1] !== zpairWin) openPair(S.zgiftTo); return send({ t: 'zgift', id: S.zgiftTo, gift: d.zgift }); }
  if (d.zgiftlist !== undefined) return openSheet(zgiftListWin);
  if (d.zcdel) { if (confirm('Удалить комментарий?')) send({ t: 'zcomment', id: S.zpair.id, del: Number(d.zcdel) }); return; }
  if (d.zdivorce !== undefined) { if (confirm('Развестись? Голоса и подарки пары пропадут.')) send({ t: 'zdivorce' }); }
});
$('#sheetBody').addEventListener('input', (e) => {
  if (e.target.dataset.zcoins === undefined) return;
  S.zcoins = Math.max(1, Math.floor(Number(e.target.value)) || 1); const s = $('[data-zvn]'); if (s) s.textContent = S.zcoins;
});
$('#sheetBody').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form="zpropose"],[data-form="zcomment"]'); if (!f) return;
  e.preventDefault(); e.stopPropagation();
  if (f.dataset.form === 'zpropose') { S.zproposeTo = f.to.value.trim(); return send({ t: 'zpropose', to: f.to.value.trim(), text: f.text.value, role: f.role.value }); }
  const text = f.text.value.trim(); if (!text) return; f.text.value = ''; send({ t: 'zcomment', id: S.zpair.id, text });
}, true);
