'use strict';
// Экран загрузки после входа: пока не догрузились фон замка, панели и здания — заставка с полоской,
// а не пустое поле с клетками. Не дольше 15 секунд (медленная сеть — игра откроется и догрузит остальное сама).
const GLOAD_CSS = ['gfx3d/top/bar_l.png', 'gfx3d/top/bar_r.png', 'gfx3d/top/bar_m.png', 'gfx3d/top/btn_mail.png', 'gfx3d/top/btn_rep.png', 'gfx3d/Menu/Top.png',
  ...['wood', 'stone', 'iron', 'food', 'people'].map((r) => `gfx3d/res/${r}.png`)];
function gameLoading() {
  if (S.gloadDone || $('#gload')) return;
  const d = document.createElement('div'); d.id = 'gload';
  d.innerHTML = '<div class="gl-in"><img src="gfx3d/ui/logo.webp" alt=""><div class="gl-t">Загрузка королевства…</div><div class="gl-bar"><i></i></div></div>';
  document.body.appendChild(d);
  const extra = GLOAD_CSS.map((src) => { const im = new Image(); const o = { ok: false }; im.onload = im.onerror = () => { o.ok = true; }; im.src = src; return o; });
  const t0 = Date.now();
  const tick = () => {
    if (!S.st) return setTimeout(tick, 100);
    const c = S.st.castle, need = [CASTLE_BG.src];
    c.grid[0].forEach((b, i) => { if (b >= 0 && BUILD_IMG[displayId(S.by[b], c.levels[0][i])]) need.push(`build/${BUILD_IMG[displayId(S.by[b], c.levels[0][i])]}.png`); });
    const list = [...new Set(need)], ok = list.filter((p) => pic(p)).length + extra.filter((o) => o.ok).length, all = list.length + extra.length;
    d.querySelector('i').style.width = `${Math.round(ok / all * 100)}%`;
    if (ok >= all || Date.now() - t0 > 15000) { S.gloadDone = true; d.classList.add('out'); setTimeout(() => d.remove(), 400); isoDraw(); return; }
    setTimeout(tick, 120);
  };
  tick();
}
