'use strict';
// «Забыли пароль?» на экране входа: логин → код от бота в Telegram → код + новый пароль (server/src/tgauth.js).
// Бот присылает только код — сам пароль игрок придумывает здесь, нигде он не пересылается.
const resetUi = (step2) => { $('#resetStep2').classList.toggle('hidden', !step2); $('#resetBtn').textContent = step2 ? 'Сменить пароль' : 'Получить код';
  const f = $('#resetForm'); f.code.required = step2; f.password.required = step2; f.password2.required = step2; };
$('#forgotBtn').addEventListener('click', () => {
  const f = $('#resetForm'); f.login.value = $('#authForm').login.value; $('#resetMsg').textContent = ''; $('#resetMsg').className = 'err'; resetUi(false);
  $('#authForm').classList.add('hidden'); $('#authTabs').classList.add('hidden'); f.classList.remove('hidden');
});
$('#resetBack').addEventListener('click', () => { $('#resetForm').classList.add('hidden'); $('#authForm').classList.remove('hidden'); $('#authTabs').classList.remove('hidden'); });
$('#resetForm').addEventListener('submit', (e) => {
  e.preventDefault(); const f = e.target, step2 = !$('#resetStep2').classList.contains('hidden'), msg = $('#resetMsg');
  msg.className = 'err'; msg.textContent = '';
  if (!step2) return send({ t: 'reset', op: 'request', login: f.login.value.trim() });
  if (f.password.value !== f.password2.value) { msg.textContent = 'Пароли не совпадают.'; return; }
  send({ t: 'reset', op: 'confirm', login: f.login.value.trim(), code: f.code.value.trim(), password: f.password.value });
});
function resetMsg(m) {
  const msg = $('#resetMsg'); msg.textContent = m.msg || ''; msg.className = m.ok ? 'okmsg' : 'err';
  if (m.op === 'request' && m.ok) { resetUi(true); $('#resetForm').code.focus(); }
  if (m.op === 'confirm' && m.ok) { // пароль сменён — назад ко входу, логин уже вписан
    setTimeout(() => { $('#resetBack').click(); const a = $('#authForm'); a.login.value = $('#resetForm').login.value; a.password.value = ''; a.password.focus(); $('#authErr').textContent = ''; toast('Пароль изменён — войдите с новым паролем.'); }, 1200);
  }
}
