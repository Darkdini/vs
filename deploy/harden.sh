#!/bin/sh
# Защита самого сервера (VPS), запускать от root:
#   sh /opt/war/game/harden.sh          — fail2ban (бан IP за подбор пароля SSH) + фаервол ufw (открыты только SSH, 80, 443)
#   sh /opt/war/game/harden.sh nopass   — вход только по ключу: пароль для SSH отключается (сначала добавьте свой ключ!)
#   sh /opt/war/game/harden.sh status   — что включено, кто сейчас забанен
set -e
[ "$(id -u)" = 0 ] || { echo "Нужно запускать от root"; exit 1; }
SVC=ssh; systemctl list-unit-files 2>/dev/null | grep -q '^sshd\.service' && SVC=sshd
# порт SSH: из текущего подключения (так точно не закроем себе вход), иначе из настроек sshd, иначе 22
PORT=$(echo "$SSH_CONNECTION" | awk '{print $4}'); [ -n "$PORT" ] || PORT=$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}'); [ -n "$PORT" ] || PORT=22

case "$1" in
status)
  echo "== Порт SSH: $PORT"
  echo "== Вход по паролю: $(sshd -T 2>/dev/null | awk '/^passwordauthentication /{print $2}')   (no — только по ключу)"
  echo "== Ключей в /root/.ssh/authorized_keys: $(grep -cE '^(ssh-|ecdsa-)' /root/.ssh/authorized_keys 2>/dev/null || echo 0)"
  echo "== Фаервол:"; ufw status 2>/dev/null || echo "  ufw не установлен"
  echo "== fail2ban:"; fail2ban-client status sshd 2>/dev/null || echo "  не работает"
  exit 0 ;;
nopass)
  K=/root/.ssh/authorized_keys
  if ! grep -qE '^(ssh-(ed25519|rsa)|ecdsa-)' "$K" 2>/dev/null; then echo "В $K нет ни одного ключа — сначала добавьте ключ (инструкция в README.txt), иначе войти будет нельзя."; exit 1; fi
  echo "Ключи, которым будет разрешён вход:"; awk '{print "  " $1 " … " $NF}' "$K"
  printf "Вы уже проверили вход по ключу в ДРУГОМ окне (без пароля)? [да/нет] "; read A < /dev/tty
  [ "$A" = "да" ] || { echo "Отменено. Сначала проверьте вход по ключу."; exit 1; }
  # 00- — чтобы наш файл читался раньше 50-cloud-init.conf (у sshd действует первое значение)
  cat > /etc/ssh/sshd_config.d/00-war.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
EOF
  grep -qE '^\s*Include\s+/etc/ssh/sshd_config\.d' /etc/ssh/sshd_config || sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' /etc/ssh/sshd_config
  sshd -t || { rm -f /etc/ssh/sshd_config.d/00-war.conf; echo "Ошибка в настройках sshd — ничего не изменено"; exit 1; }
  systemctl reload "$SVC" || systemctl restart "$SVC"
  echo "✓ Вход по паролю отключён: $(sshd -T | awk '/^passwordauthentication /{print $2}'). Текущее окно не закрывайте, пока не проверите вход в новом."
  echo "  Вернуть пароль (если что-то пошло не так, через консоль хостинга): rm /etc/ssh/sshd_config.d/00-war.conf && systemctl reload $SVC"
  exit 0 ;;
esac

export DEBIAN_FRONTEND=noninteractive
echo "== Установка fail2ban и ufw"
apt-get update -q >/dev/null
apt-get install -y -q fail2ban ufw >/dev/null
apt-get install -y -q python3-systemd >/dev/null 2>&1 || true

echo "== fail2ban: 5 неверных паролей SSH за 10 минут — бан IP на сутки; кто попадается снова — на неделю"
BACKEND=auto; [ -f /var/log/auth.log ] || BACKEND=systemd
cat > /etc/fail2ban/jail.d/war.local <<EOF
[DEFAULT]
bantime = 1d
findtime = 10m
maxretry = 5
bantime.increment = true
bantime.maxtime = 1w
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = $PORT
backend = $BACKEND
EOF
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban

echo "== Фаервол: открыты только SSH ($PORT), 80 и 443 (игра через HTTPS)"
ufw allow "$PORT/tcp" >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw --force enable >/dev/null
sleep 2
echo
ufw status | sed 's/^/  /'
fail2ban-client status sshd 2>/dev/null | sed 's/^/  /' || echo "  fail2ban не запустился: journalctl -u fail2ban -n 30"
echo
echo "✓ Готово. Проверить позже: sh /opt/war/game/harden.sh status"
echo "  Следующий шаг — вход по ключу (README.txt, раздел «Вход по ключу»), затем: sh /opt/war/game/harden.sh nopass"
