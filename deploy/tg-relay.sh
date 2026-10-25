#!/bin/sh
# Посредник для Telegram — ставится на ЗАРУБЕЖНЫЙ сервер (не на сервер игры). Нужен, когда игра стоит в России:
# оттуда api.telegram.org заблокирован (2026), а отсюда — доступен. Посредник пересылает запросы игры в Telegram и ответы обратно.
# Пускает только сервер игры (по его IP), всем остальным — 403. Токены ботов идут внутри HTTPS и посредником не сохраняются.
#   sh tg-relay.sh IP_сервера_игры          например: sh tg-relay.sh 81.85.78.243
# Потом на сервере игры:  sh /opt/war/game/tgapi.sh https://<IP этого сервера через дефисы>.sslip.io
set -e
GAME_IP="$1"
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
echo "$GAME_IP" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || { echo "Укажите IP сервера игры: sh tg-relay.sh 81.85.78.243"; exit 1; }

echo "== Отсюда Telegram доступен?"
curl -sS -m 20 -o /dev/null https://api.telegram.org || { echo "✗ С этого сервера Telegram тоже недоступен — посредник здесь не поможет, нужен другой (зарубежный) сервер."; exit 1; }
MYIP=$(curl -fsS -4 -m 20 https://ifconfig.me) || { echo "✗ Не удалось узнать IP этого сервера"; exit 1; }
HOST="$(echo "$MYIP" | tr . -).sslip.io"
[ "$MYIP" != "$GAME_IP" ] || { echo "✗ Это и есть сервер игры. Посредник ставится на ДРУГОЙ, зарубежный сервер."; exit 1; }

# если сюда раньше ставили игру — выключаем её: игра живёт на сервере в России, а один бот на двух серверах не работает
if systemctl is-active --quiet war 2>/dev/null; then systemctl disable --now war >/dev/null 2>&1 || true; echo "Игра на этом сервере выключена (она теперь на $GAME_IP)."; fi

echo "== Caddy (HTTPS-сертификат получает сам)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update -q
  if ! apt-get install -y -q caddy; then
    apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -q && apt-get install -y -q caddy
  fi
fi
cat > /etc/caddy/Caddyfile <<CADDY
# посредник Telegram для сервера игры $GAME_IP (deploy/tg-relay.sh)
$HOST {
	@game remote_ip $GAME_IP
	handle @game {
		reverse_proxy https://api.telegram.org {
			header_up Host api.telegram.org
		}
	}
	handle {
		respond "Forbidden" 403
	}
}
CADDY
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi

echo "== Проверка (первый раз сертификат выпускается до минуты)"
OK=""; for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  C=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "https://$HOST/bot0/getMe" 2>/dev/null || true)
  [ "$C" = 403 ] && { OK=1; break; }; sleep 5
done
[ -n "$OK" ] || { echo "✗ Посредник не отвечает по https://$HOST — смотрите: journalctl -u caddy -n 30"; exit 1; }
echo
echo "✓ Посредник работает: https://$HOST (пускает только $GAME_IP)"
echo "Теперь на сервере игры ($GAME_IP) выполните:"
echo "  sh /opt/war/game/tgapi.sh https://$HOST"
