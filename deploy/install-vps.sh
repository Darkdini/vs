#!/bin/sh
# Установка игры на VPS (Ubuntu/Debian) одной командой, от root:
#   curl -fsSL -H "Authorization: Bearer ТОКЕН" https://raw.githubusercontent.com/Darkdini/vs/claude/third-world-kings-war-analysis-lodxja/deploy/install-vps.sh -o install.sh
#   (репозиторий закрытый: ТОКЕН — fine-grained токен GitHub, только Darkdini/vs, Contents: Read-only; установка спросит его ещё раз)
#   sh install.sh tmrs.ru www.tmrs.ru 1-2-3-4.sslip.io   (можно несколько адресов через пробел)
# Что делает: ставит Node.js 20 и Caddy (HTTPS-сертификат сам), скачивает игру в /opt/war/game,
# база — /opt/war/game-data (обновления её не трогают), служба war автоматически стартует после перезагрузки.
# Логин и пароль админа спросит один раз (хранятся в /opt/war/game-data/admin.env, права 600).
# Обновить игру потом:  war-update      Логи:  journalctl -u war -f      Перезапуск:  systemctl restart war
set -e
DOMAIN="$1"
SITES=$(echo "$@" | sed 's/  */, /g')
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

echo "== Команды обновления war-update и war-token (тексты — как deploy/war-update.sh и deploy/war-token.sh)"
cat > /usr/local/bin/war-update <<'WAREOF'
#!/bin/sh
# war-update — скачать новую версию игры и перезапустить; база /opt/war/game-data не трогается (перед обновлением — копия).
#   war-update                 — последняя версия ветки
#   war-update <SHA>           — версия по коммиту
#   war-update <ссылка.zip>    — из архива по ссылке (или путь к файлу на сервере)
# Репозиторий закрытый: токен GitHub «только чтение» лежит в /etc/war-github.token (права 600, только root),
# задаётся командой war-token. В репозиторий и в папку игры токен не попадает; отправляется только на github.com.
set -e
REPO="Darkdini/vs"; BRANCH="claude/third-world-kings-war-analysis-lodxja"; TOKF=/etc/war-github.token
TOK=""; [ -f "$TOKF" ] && TOK=$(tr -d ' \r\n' < "$TOKF")
ghget() { if [ -n "$TOK" ]; then curl -fsSL -H "Authorization: Bearer $TOK" "$@"; else curl -fsSL "$@"; fi; }
nokey() { echo "✗ $1. Репозиторий закрытый — нужен токен GitHub: выполните war-token"; exit 1; }
ARG="${1:-}"
if [ -z "$ARG" ]; then
  ARG=$(ghget -H "Accept: application/vnd.github.sha" "https://api.github.com/repos/$REPO/commits/$BRANCH") || nokey "Не удалось узнать последнюю версию"
fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
case "$ARG" in
  /*) cp "$ARG" "$TMP/game.zip" ;;
  https://raw.githubusercontent.com/*|https://api.github.com/*) ghget -o "$TMP/game.zip" "$ARG" || nokey "Не удалось скачать" ;;
  http*) curl -fsSL -o "$TMP/game.zip" "$ARG" || { echo "✗ Не удалось скачать"; exit 1; } ;;
  *) ghget -o "$TMP/game.zip" "https://raw.githubusercontent.com/$REPO/$ARG/dist/game.zip" || nokey "Не удалось скачать версию $ARG" ;;
esac
unzip -q "$TMP/game.zip" -d "$TMP" || { echo "✗ Архив повреждён"; exit 1; }
[ -f "$TMP/game/server/src/index.js" ] || { echo "✗ Архив не похож на игру"; exit 1; }
[ -f /opt/war/game-data/db.json ] && cp /opt/war/game-data/db.json "/opt/war/game-data/db.before-update.json"
rm -rf /opt/war/game.old; [ -d /opt/war/game ] && mv /opt/war/game /opt/war/game.old
mv "$TMP/game" /opt/war/game
chown -R war:war /opt/war
systemctl restart war 2>/dev/null || true
# сама команда обновляется вместе с игрой
for f in war-update war-token; do [ -f "/opt/war/game/$f.sh" ] && ! cmp -s "/opt/war/game/$f.sh" "/usr/local/bin/$f" && install -m 755 "/opt/war/game/$f.sh" "/usr/local/bin/$f"; done
echo "Готово: версия $(cat /opt/war/game/VERSION)"
WAREOF
cat > /usr/local/bin/war-token <<'WAREOF'
#!/bin/sh
# war-token — сохранить токен GitHub для war-update (репозиторий закрытый).
# Токен вводится скрыто (не попадает в историю команд), хранится в /etc/war-github.token с правами 600 (только root).
# Нужен fine-grained токен: только репозиторий Darkdini/vs, право Contents: Read-only.
set -e
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
printf 'Вставьте токен GitHub и нажмите Enter (символы не видны): '
stty -echo 2>/dev/null; read -r T; stty echo 2>/dev/null; echo
T=$(printf %s "$T" | tr -d ' \r\n'); [ -n "$T" ] || { echo "Пусто — ничего не изменено"; exit 1; }
if curl -fsS -o /dev/null -H "Authorization: Bearer $T" https://api.github.com/repos/Darkdini/vs; then
  umask 077; printf %s "$T" > /etc/war-github.token; chmod 600 /etc/war-github.token
  echo "✓ Токен работает и сохранён. Обновлять как раньше: war-update"
else echo "✗ GitHub не принял токен (нет доступа к Darkdini/vs или неверный) — ничего не изменено"; exit 1; fi
WAREOF
chmod 755 /usr/local/bin/war-update /usr/local/bin/war-token
# репозиторий закрытый — без токена GitHub игру не скачать
curl -fsS -o /dev/null https://api.github.com/repos/Darkdini/vs 2>/dev/null || [ -f /etc/war-github.token ] || war-token < /dev/tty
war-update
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
