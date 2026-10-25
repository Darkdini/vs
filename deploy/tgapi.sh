#!/bin/sh
# Telegram через посредника — для сервера игры в России, откуда api.telegram.org заблокирован (2026). Посредник —
# бесплатный Cloudflare Worker (deploy/tg-worker.js) или зарубежный сервер (deploy/tg-relay.sh):
#   sh /opt/war/game/tgapi.sh https://tg-relay.СЛОВО.workers.dev/КЛЮЧ   — Cloudflare Worker (КЛЮЧ — как KEY в его коде)
#   sh /opt/war/game/tgapi.sh https://1-2-3-4.sslip.io                  — зарубежный сервер с tg-relay.sh
#   sh /opt/war/game/tgapi.sh off                                       — снова напрямую в api.telegram.org
# Адрес хранится в game-data/game.env (TG_API); его читают игра, tgauth.sh и tgbackup.sh. Токены через посредника идут внутри HTTPS.
set -e
DATA=/opt/war/game-data; [ -d "$DATA" ] || DATA="$HOME/game-data"
ENV="$DATA/game.env"; mkdir -p "$DATA"; touch "$ENV"
restart() { if systemctl list-unit-files 2>/dev/null | grep -q '^war\.service'; then chown war:war "$ENV" 2>/dev/null || true; systemctl restart war; echo "Сервер игры перезапущен."; else echo "Перезапустите сервер игры."; fi; }
clean() { grep -v '^TG_API=' "$ENV" > "$ENV.new" || true; mv "$ENV.new" "$ENV"; chmod 600 "$ENV"; }
if [ "$1" = "off" ]; then clean; echo "Telegram — снова напрямую (api.telegram.org)."; restart; exit 0; fi
API="${1%/}"
echo "$API" | grep -qE '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$' || { echo "Укажите адрес посредника: sh $0 https://tg-relay.СЛОВО.workers.dev/КЛЮЧ"; exit 1; }
# проверка: через посредника Telegram отвечает «Unauthorized» (401) на пустой токен — значит, связь есть
CODE=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$API/bot0/getMe" || true)
case "$CODE" in
  401|404) ;;
  403) echo "✗ Посредник не пускает этот сервер: у Cloudflare Worker ключ в конце адреса не совпадает с KEY в его коде; у зарубежного сервера — запустите там tg-relay.sh с IP ЭТОГО сервера."; exit 1 ;;
  500) echo "✗ Посредник ответил ошибкой: у Cloudflare Worker в коде не вписан свой KEY (16+ латинских букв и цифр) — впишите и нажмите Deploy."; exit 1 ;;
  *) echo "✗ Посредник не отвечает (код ${CODE:-нет связи}). Проверьте адрес посредника."; exit 1 ;;
esac
clean; echo "TG_API=$API" >> "$ENV"; chmod 600 "$ENV"
echo "✓ Telegram доступен через посредника $API"
restart
echo "Теперь подключите ботов как обычно: sh /opt/war/game/tgauth.sh  и  sh /opt/war/game/tgbackup.sh"
