#!/bin/sh
# Установка игры на VPS (Ubuntu/Debian) одной командой, от root:
#   curl -fsSL https://raw.githubusercontent.com/Darkdini/vs/claude/third-world-kings-war-analysis-lodxja/deploy/install-vps.sh -o install.sh
#   sh install.sh tmrs.ru www.tmrs.ru 1-2-3-4.sslip.io   (можно несколько адресов через пробел)
# Что делает: ставит Node.js 20 и Caddy (HTTPS-сертификат сам), скачивает игру в /opt/war/game,
# база — /opt/war/game-data (обновления её не трогают), служба war автоматически стартует после перезагрузки.
# Логин и пароль админа спросит один раз (хранятся в /opt/war/game-data/admin.env, права 600).
# Обновить игру потом:  war-update      Логи:  journalctl -u war -f      Перезапуск:  systemctl restart war
set -e
DOMAIN="$1"
SITES=$(echo "$@" | sed 's/  */, /g')
ZIP_URL="${ZIP_URL:-https://raw.githubusercontent.com/Darkdini/vs/claude/third-world-kings-war-analysis-lodxja/dist/game.zip}"
[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo sh install.sh адрес)"; exit 1; }
[ -n "$DOMAIN" ] || { echo "Укажите адрес сайта: sh install.sh моя-игра.duckdns.org"; exit 1; }

echo "== Пакеты"
apt-get update -q
apt-get install -y -q curl unzip ca-certificates gnupg
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -q nodejs
fi
if ! command -v caddy >/dev/null 2>&1; then
  if ! apt-get install -y -q caddy; then
    apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -q && apt-get install -y -q caddy
  fi
fi

echo "== Пользователь и папки"
id war >/dev/null 2>&1 || useradd -r -m -d /opt/war -s /usr/sbin/nologin war
mkdir -p /opt/war/game-data && chmod 700 /opt/war/game-data

echo "== Команда обновления war-update"
cat > /usr/local/bin/war-update <<EOF
#!/bin/sh
# скачать новую версию игры и перезапустить; база /opt/war/game-data не трогается (перед обновлением — копия)
set -e
URL="\${1:-$ZIP_URL}"
TMP=\$(mktemp -d)
curl -fsSL -o "\$TMP/game.zip" "\$URL"
unzip -q "\$TMP/game.zip" -d "\$TMP"
[ -f "\$TMP/game/server/src/index.js" ] || { echo "Архив не похож на игру"; exit 1; }
[ -f /opt/war/game-data/db.json ] && cp /opt/war/game-data/db.json "/opt/war/game-data/db.before-update.json"
rm -rf /opt/war/game.old; [ -d /opt/war/game ] && mv /opt/war/game /opt/war/game.old
mv "\$TMP/game" /opt/war/game && rm -rf "\$TMP"
chown -R war:war /opt/war
systemctl restart war 2>/dev/null || true
echo "Готово: версия \$(cat /opt/war/game/VERSION)"
EOF
chmod 755 /usr/local/bin/war-update
war-update

if [ ! -f /opt/war/game-data/admin.env ]; then
  echo "== Логин и пароль админа (в игре админ будет виден как admin)"
  HOME=/opt/war sh /opt/war/game/admin.sh < /dev/tty
fi
chown -R war:war /opt/war; chmod 600 /opt/war/game-data/admin.env 2>/dev/null || true

echo "== Служба war"
cat > /etc/systemd/system/war.service <<'EOF'
[Unit]
Description=Средневековье — сервер игры
After=network.target

[Service]
User=war
Group=war
WorkingDirectory=/opt/war/game/server
Environment=HOME=/opt/war DB=/opt/war/game-data/db.json HOST=127.0.0.1 WEB_PORT=8080 TRUST_PROXY=1 ADMIN_RESET=1
EnvironmentFile=-/opt/war/game-data/admin.env
EnvironmentFile=-/opt/war/game-data/game.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=20
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/war/game-data
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now war
systemctl restart war

echo "== HTTPS (Caddy) для $SITES"
cat > /etc/caddy/Caddyfile <<EOF
$SITES {
	encode gzip
	reverse_proxy 127.0.0.1:8080
}
EOF
systemctl enable caddy >/dev/null 2>&1 || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then ufw allow 80/tcp; ufw allow 443/tcp; fi
sleep 2
systemctl is-active --quiet war && echo "Сервер игры работает." || { echo "Сервер не запустился, смотрите: journalctl -u war -n 50"; exit 1; }
echo
echo "Готово! Игра: https://$DOMAIN  (первый раз сертификат выпускается до минуты)"
echo "Адрес $DOMAIN должен указывать на IP этого сервера: $(curl -fsS -4 https://ifconfig.me 2>/dev/null || echo 'IP смотрите в панели хостинга')"
echo "Обновить игру: war-update    Логи: journalctl -u war -f    Резервные копии базы: /opt/war/game-data/backups"
