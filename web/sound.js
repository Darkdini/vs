'use strict';
// Звук: фоновая музыка (sound/birds_theme.ogg, по кругу), звуки нажатий и оповещения (синтез WebAudio).
// Настройки — Кабинет → Профиль → «Настройка звуков» (как в оригинале), хранятся в браузере.
const SND = Object.assign({ music: true, sounds: true, notify: true }, store.get('tw.sound') || {});
let bgm = null, actx = null, unlocked = false;
function musicOn() {
  if (!SND.music || document.hidden) return;
  if (!bgm) { bgm = new Audio('sound/birds_theme.ogg'); bgm.loop = true; bgm.volume = 0.35; bgm.preload = 'auto'; }
  if (!bgm.paused) return;
  const p = bgm.play(); if (p && p.catch) p.catch(() => {}); // браузер запретил без касания — включится с первым касанием
}
function musicOff() { if (bgm) bgm.pause(); }
function beep(freqs, dur = 0.08, vol = 0.12, type = 'triangle') {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur); t += dur * 0.8;
    }
  } catch { /* нет звука */ }
}
const sfxClick = () => { if (SND.sounds) beep([660], 0.05, 0.06); };
const sfxNotify = () => { if (SND.notify) beep([784, 1047, 1319], 0.12, 0.1, 'sine'); };
// браузер разрешает звук только после первого касания
// сразу при открытии игры; если браузер не дал — с первого касания/клавиши (в т.ч. на экране входа)
musicOn();
for (const ev of ['pointerdown', 'touchstart', 'keydown']) document.addEventListener(ev, () => { unlocked = true; musicOn(); }, { capture: true, passive: true });
document.addEventListener('click', (e) => { if (e.target.closest('button, .ptile, .mitem, a')) sfxClick(); }, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) musicOff(); else musicOn(); });

function soundWin() {
  const row = (k, icon, t) => `<label class="sndrow"><input type="checkbox" data-snd="${k}" ${SND[k] ? 'checked' : ''}><span class="sndbox"></span><img src="${icon}" alt=""> ${t}</label>`;
  return `${ribbon('Настройка звуков')}<div class="sndlist">
    ${row('music', 'gfx3d/sound/music.svg', 'Музыка')}${row('sounds', 'gfx3d/sound/sounds.svg', 'Звуки')}${row('notify', 'gfx3d/sound/notify.svg', 'Оповещения')}</div>
    <button class="pbar" data-sndsave>Сохранить</button>`;
}
$('#sheetBody').addEventListener('click', (e) => {
  if (!e.target.closest('[data-sndsave]')) return;
  for (const i of $$('#sheetBody [data-snd]')) SND[i.dataset.snd] = i.checked;
  store.set('tw.sound', SND);
  if (SND.music) { unlocked = true; musicOn(); } else musicOff();
  toast('Настройки звука сохранены.'); closeSheet();
});
