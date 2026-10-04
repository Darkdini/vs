'use strict';
// Мировой босс (сервер: server/src/boss.js; вызывает админ): на карте мира — крупный спрайт с полоской здоровья,
// окно босса (здоровье, время, таблица урона, «Нападение»/«Набег»), кнопка-медальон на экране, пока босс жив.
// Графика gfx/boss: <вид>.png — фигура, m_<вид> — медальон, o_<вид> — орден убийцы, banner, chest, swords.

const BOSS_FB = { dragon: 'boss/m_dragon.png', troll: 'boss/m_troll.png', lich: 'boss/m_lich.png' };
const bossPic = (kind) => pic(`boss/${kind}.png`);
// на карте: босс крупнее замка (на 2 клетки), под ним — красное зарево, над ним — полоска здоровья
function bossOnMap(o, p, sel) {
  const im = bossPic(o.boss.kind), x = ictx, cx = p.sx + TW / 2, base = p.sy + TH * 0.9;
  x.save();
  const g = x.createRadialGradient(cx, base - 4, 4, cx, base - 4, TW * 1.1); g.addColorStop(0, 'rgba(255,60,20,0.55)'); g.addColorStop(1, 'rgba(255,60,20,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, base - 4, TW * 1.1, TH * 0.8, 0, 0, Math.PI * 2); x.fill();
  if (im) { const w = TW * 1.9, h = w * im.height / im.width; x.imageSmoothingEnabled = true; if (sel) x.filter = 'drop-shadow(0 0 4px #ffe030) drop-shadow(0 0 6px #ff9d00)'; x.drawImage(scaledPic(`boss/${o.boss.kind}.png`, w) || im, cx - w / 2, base - h, w, h); x.filter = 'none'; }
  const bw = TW * 1.4, bh = 6, by = base - (im ? TW * 1.9 * im.height / im.width : TW) - 12, f = Math.max(0, o.boss.hp / o.boss.maxHp);
  x.fillStyle = '#000a'; x.fillRect(cx - bw / 2 - 1, by - 1, bw + 2, bh + 2); x.fillStyle = '#3a0a0a'; x.fillRect(cx - bw / 2, by, bw, bh);
  x.fillStyle = f > 0.5 ? '#e53935' : f > 0.2 ? '#ff7a1a' : '#ffd21a'; x.fillRect(cx - bw / 2, by, bw * f, bh);
  x.restore();
}
function openBoss() { S.boss = null; send({ t: 'boss' }); openSheet(bossWin); }
function bossWin() {
  const d = S.boss; if (!d) return `${ribbon('Мировой босс')}<p class="parch-note">Загрузка…</p>`;
  const b = d.boss;
  if (!b) {
    const L = d.last;
    return `${ribbon('Мировой босс')}<div class="bs-none"><img src="${GFX}boss/banner.png" alt=""><p>Сейчас чудовищ на карте нет.</p>
      <p>Мировой босс появляется по призыву администрации и держится 48 часов — следите за оповещениями.</p></div>
      ${L ? `${ribbon('Прошлый босс')}<p class="center"><b>${esc(L.name)}</b> — ${L.killed ? 'повержен' : 'ушёл непобеждённым'}</p>${bossTop(L.top)}` : ''}`;
  }
  const f = Math.max(0, b.hp / b.maxHp);
  return `${ribbon(esc(b.name))}
    <div class="bs-head"><img src="${GFX}boss/${b.kind}.png" alt=""><div><p>${esc(b.desc || '')}</p><p class="small">Логово: <b>X ${b.x}, Y ${b.y}</b> · уйдёт через <b><span class="cd" data-e="${b.end}"></span></b></p></div></div>
    <div class="bs-hp"><i style="width:${f * 100}%"></i><span>${fmtFull(b.hp)} / ${fmtFull(b.maxHp)}</span></div>
    <p class="center">Ваш урон: <b>${fmtFull(b.mine)}</b> · участников: ${b.players}</p>
    <div class="qbtns bs-go"><button class="pbar" data-bgo="attack"><img src="${GFX}boss/swords.png" alt="">Нападение</button><button class="pbar" data-bgo="raid"><img src="${GFX}boss/swords.png" alt="">Набег</button></div>
    <button class="btn" data-goworld="${b.x},${b.y}">Показать на карте</button>
    ${ribbon('Лучший урон')}${bossTop(b.top)}
    <p class="small muted bs-rw"><img src="${GFX}boss/chest.png" alt="">Армии идут к боссу быстрым маршем — вчетверо быстрее обычного и не дольше 15 минут в одну сторону. Босс силён: за каждый удар он уносит не меньше 12–15% армии (набег — вдвое меньше урона и потерь), а когда у него остаётся меньше 30% здоровья, впадает в ярость и бьёт в полтора раза сильнее. Один удар снимает не больше 5% его здоровья — одному не справиться, бейте всем сервером. Генерал в армии получает опыт за урон. Награды — когда босс повержен или ушёл: 1 место — золотая медаль, легендарное снаряжение генерала и артефакт, 2–3 — серебряная и бронзовая медали, эпическое снаряжение и артефакт, 4–10 — редкое; всем — ресурсы по доле урона; последний удар — значок в профиле, немного репутации и ресурсов и ещё эпическая вещь. Если босс уйдёт непобеждённым, награды вдвое меньше.</p>`;
}
const bossTop = (top) => (top && top.length ? `<div class="bs-top">${top.map((r, i) => `<div><b>${i + 1}</b><span>${esc(r.login)}</span><em>${fmtFull(r.d)}</em></div>`).join('')}</div>` : '<p class="parch-note">Пока никто не нанёс урона.</p>');
// кнопка на экране, пока босс жив
function bossBtn() {
  const b = S.st && S.st.castle.mil && S.st.castle.mil.worldBoss;
  let el = $('#bbtn');
  if (!b || b.end < now()) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('button'); el.id = 'bbtn'; el.type = 'button'; el.addEventListener('click', () => openBoss()); $('#game').appendChild(el); }
  if (el.dataset.k !== b.kind) { el.dataset.k = b.kind; el.innerHTML = `<img src="${GFX}boss/m_${b.kind}.png" alt=""><i><b style="width:${b.hp / b.maxHp * 100}%"></b></i>`; }
  el.querySelector('i b').style.width = `${Math.max(0, b.hp / b.maxHp) * 100}%`;
}
$('#sheetBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-bgo]'); if (!t || !S.boss || !S.boss.boss) return;
  openArmySheet({ mission: t.dataset.bgo, x: S.boss.boss.x, y: S.boss.boss.y });
});

// значок босса: медаль за место (золото/серебро/бронза) или орден за последний удар
// картинки boss/medal_<вид>_<место>.png; пока их нет — орден, окрашенный фильтром
const bossMedal = (m) => (m.place
  ? `<span class="bmedal p${m.place}"><img src="${GFX}boss/medal_${m.kind}_${m.place}.png" data-fb="${GFX}boss/o_${m.kind}.png" alt=""><em>${m.place}</em></span>`
  : `<span class="bmedal"><img src="${GFX}boss/o_${m.kind}.png" alt=""></span>`);
function bossBadgesWin() {
  const d = S.bossBadgesOf || { list: [] }, MEDAL = ['Золотая медаль', 'Серебряная медаль', 'Бронзовая медаль'];
  return `${ribbon('Победы над боссами')}<p class="center"><b>${esc(d.login || '')}</b></p>${d.list.map((m) => `<div class="award">${bossMedal(m)}<div>${m.place
    ? `<b>${MEDAL[m.place - 1]}</b><small>${m.place}-е место по урону · «${esc(m.name)}»${m.killed === false ? ' (ушёл)' : ''} · ${fmtDay(m.at)}</small>`
    : `<b>${d.slay[m.kind] || 'Убийца чудовищ'}</b><small>последний удар по «${esc(m.name)}» · ${fmtDay(m.at)}</small>`}</div></div>`).join('')}`;
}
$('#sheetBody').addEventListener('click', (e) => { if (e.target.closest('[data-bbl]')) openSheet(bossBadgesWin); });
