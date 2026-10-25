// ---------- «Капкан» и Темница (server/src/trap.js) — в шторке здания ----------
// Капкан до боя ловит до 1000 воинов чужой армии; пленных — казнить (лояльность) или завербовать (15% через 4 ч).
function trapMsg(m) { S.trap = m.data; S.trapAt = Date.now(); const top = S.sheets[S.sheets.length - 1]; if (top) refreshSheet(); }
function trapHtml() {
  if (!S.trapAsk || Date.now() - S.trapAsk > 3000) { S.trapAsk = Date.now(); send({ t: 'trap' }); }
  const d = S.trap; if (!d) return '<p class="parch-note">Загрузка…</p>';
  const P = d.prison, R = d.recruit;
  const state = d.ready
    ? `<div class="trline ok">Капкан заряжен${P ? ', но Темница занята — пока в ней пленные, он не ловит' : ` — поймает до ${fmtFull(d.catchN)} воинов следующей чужой армии`}.</div>`
    : `<div class="trline">Перезарядка: <span class="cd" data-e="${d.readyAt}"></span></div>
      <button class="pbar" data-trapcharge>Зарядить сразу · ${RES4.map((r) => `${RES_IC[r]}${fmtFull(d.charge)}`).join(' ')}</button>`;
  const rows = (units) => Object.entries(units).map(([id, n]) => { const u = unitById(Number(id)); return u ? `<div class="trunit">${uimg(u, 'trimg')}<span>${esc(u.name)}</span><b>${fmtFull(n)}</b></div>` : ''; }).join('');
  const prison = P ? `<div class="trbox"><div class="trhead">В Темнице: ${fmtFull(P.n)} пленных (армия игрока ${esc(P.login)})</div>
      <div class="trunits">${rows(P.units)}</div>
      <div class="trline">Сбегут через <span class="cd" data-e="${P.until}"></span>, если ничего не сделать.</div>
      <button class="pbar" data-trapexec>Казнить всех${P.loy ? ` · лояльность +${P.loy}` : ''}</button>
      <p class="small trnote">${P.noLoy ? 'За этих пленных лояльности не будет: они с вашего телефона или из вашего альянса.' : P.loy ? `Лояльность — по ценности пленных, не больше ${d.loyDay} в сутки.` : `Лояльность за казни сегодня уже получена (не больше ${d.loyDay} в сутки).`}</p>
      <button class="pbar" data-traprec ${R ? 'disabled' : ''}>Завербовать</button>
      <p class="small trnote">${R ? 'Вербовка уже идёт — дождитесь её конца.' : `Через ${Math.round(d.recruitSec / 360) / 10} ч часть пленных согласится служить вам, остальные пропадут.`}</p></div>`
    : '<div class="trbox"><div class="trhead">Темница пуста</div></div>';
  const rec = R ? `<div class="trbox"><div class="trhead">Вербовка: ${fmtFull(R.n)} пленных (армия ${esc(R.from)})</div><div class="trunits">${rows(R.units)}</div>
      <div class="trline">Через <span class="cd" data-e="${R.end}"></span> станет известно, сколько согласятся служить.</div></div>` : '';
  return `${state}${prison}${rec}<button class="rbar" data-traphelp>Как работает Капкан</button>`;
}
function trapHelpWin() {
  const d = S.trap || { catchN: 1000, loyDay: 100, charge: 20000 };
  return `${ribbon('Капкан')}<div class="card small">
    <p>Когда на ваш замок нападает или идёт в набег чужая армия, Капкан ещё до боя ловит до ${fmtFull(d.catchN)} её воинов. Генерала и разведчиков он не трогает. Пойманные в бою не участвуют и попадают в Темницу.</p>
    <p>После этого Капкан перезаряжается 12 часов. Зарядить сразу можно за ${fmtFull(d.charge)} каждого ресурса. Пока в Темнице сидят пленные, Капкан не ловит.</p>
    <p><b>Казнить</b> — все пленные казнены, население радуется: лояльность растёт. Чем ценнее воины, тем больше лояльности, но не больше ${d.loyDay} в сутки. За пленных с вашего же телефона или из вашего альянса лояльности нет.</p>
    <p><b>Завербовать</b> — через 4 часа часть пленных соглашается служить вам — сколько, решает случай. Они встают в вашу армию, остальные пропадают.</p>
    <p>Если пленных не трогать сутки, они сбегают.</p>
    <p>Казни и вербовка идут в Зал славы: «Казни» и «Вербовка».</p></div>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-trapcharge],[data-trapexec],[data-traprec],[data-traphelp]'); if (!t) return;
  const d = t.dataset;
  if (d.traphelp !== undefined) return openSheet(trapHelpWin);
  if (d.trapcharge !== undefined) return send({ t: 'trap', op: 'charge' });
  if (d.trapexec !== undefined) { if (confirm('Казнить всех пленных?')) send({ t: 'trap', op: 'execute' }); return; }
  if (d.traprec !== undefined) { if (confirm('Завербовать? Остальные пленные пропадут.')) send({ t: 'trap', op: 'recruit' }); }
});
