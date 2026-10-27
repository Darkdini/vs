'use strict';
// «Личная информация»: страна (Россия, Украина, Беларусь) и населённый пункт — только из списка (сервер: social.js setPlace,
// places.js — города, посёлки и сёла из открытых данных Wikidata). Игрок вводит начало названия — сервер присылает найденные
// (t:'placefind'), игрок нажимает свой — сохраняется (t:'place'). Пока игрок печатает, обновляется только список, не всё окно.
const COUNTRY = { ru: 'Россия', ua: 'Украина', by: 'Беларусь' };
S.placeQ = { country: '', q: '', list: null, timer: 0 };
const placeText = (p) => (p.city ? `${p.city}${p.cityArea ? ` (${p.cityArea})` : ''}` : '');
// строки «Страна» и «Населённый пункт» — в «Личной информации» у всех
const placeLines = (p) => `${p.country && COUNTRY[p.country] ? `<br>Страна: ${COUNTRY[p.country]}` : ''}${p.city ? `<br>Населённый пункт: ${esc(placeText(p))}` : ''}`;
function placeResults() {
  const { q, list } = S.placeQ;
  if (!list || q.trim().length < 2) return '';
  return list.length ? list.map((x) => `<button type="button" class="placeitem" data-placei="${x.i}"><b>${esc(x.n)}</b>${x.r ? `<small>${esc(x.r)}</small>` : ''}</button>`).join('')
    : '<div class="small muted center">Ничего не найдено — проверьте название или выберите ближайший пункт.</div>';
}
// у себя — выбор страны и поиск пункта
function placeForm(p) {
  const pq = S.placeQ; if (!pq.country && COUNTRY[p.country]) pq.country = p.country;
  const c = pq.country;
  return `<div class="placeform"><span>Где вы живёте:</span>
    <select data-placec aria-label="Страна">${['', 'ru', 'ua', 'by'].map((k) => `<option value="${k}"${c === k ? ' selected' : ''}>${k ? COUNTRY[k] : '— страна —'}</option>`).join('')}</select>
    <input data-placeq maxlength="40" autocomplete="off" value="${esc(pq.q)}" aria-label="Город или село" placeholder="${c ? 'Город или село' : 'Сначала страна'}"${c ? '' : ' disabled'}></div>
    <div class="placelist">${placeResults()}</div>
    ${p.city ? `<p class="small">Сейчас: <b>${esc(COUNTRY[p.country] || '')}, ${esc(placeText(p))}</b> · <a class="placedel" data-placedel>Убрать</a></p>` : ''}
    <p class="small muted">Введите первые буквы и нажмите на свой город, посёлок или село. Если его нет в списке — выберите ближайший.</p>`;
}
const placeAsk = () => { const pq = S.placeQ; if (pq.country && pq.q.trim().length >= 2) send({ t: 'placefind', country: pq.country, q: pq.q.trim() }); };
const placeListShow = () => { const el = $('.placelist'); if (el) el.innerHTML = placeResults(); };
$('#sheetBody').addEventListener('input', (e) => {
  if (e.target.dataset.placeq === undefined) return;
  const pq = S.placeQ; pq.q = e.target.value; clearTimeout(pq.timer);
  if (pq.q.trim().length < 2) { pq.list = null; return placeListShow(); }
  pq.timer = setTimeout(placeAsk, 250);
});
$('#sheetBody').addEventListener('change', (e) => {
  if (e.target.dataset.placec === undefined) return;
  const pq = S.placeQ; pq.country = e.target.value; pq.q = ''; pq.list = null;
  const inp = $('[data-placeq]'); if (inp) { inp.value = ''; inp.disabled = !pq.country; inp.placeholder = pq.country ? 'Город или село' : 'Сначала страна'; if (pq.country) inp.focus(); }
  placeListShow();
});
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-placei],[data-placedel]'); if (!b) return;
  if (b.dataset.placedel !== undefined) return send({ t: 'place', country: '' });
  send({ t: 'place', country: S.placeQ.country, i: Number(b.dataset.placei) });
});
const prevMilPlace = milMsg;
milMsg = function (m) { // eslint-disable-line no-global-assign
  if (m.t === 'placefind') { // ответ на последний запрос — список; устаревший (игрок уже напечатал дальше) — мимо
    const pq = S.placeQ; if (m.country === pq.country && m.q === pq.q.trim()) { pq.list = m.list; placeListShow(); }
    return;
  }
  if (m.t === 'place') { // сохранено: в открытой «Личной информации» — сразу новые страна и пункт
    for (const p of new Set([S.lastAcct, S.lastProfile])) if (p && p.self) { p.country = m.country; p.city = m.city; p.cityArea = m.area; }
    S.placeQ = { country: m.country, q: '', list: null, timer: 0 };
    toast(m.msg); return refreshSheet();
  }
  return prevMilPlace(m);
};
