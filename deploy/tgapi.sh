#!/bin/sh
# Telegram через зарубежного посредника — для сервера игры в России, откуда api.telegram.org заблокирован (2026).
#   sh /opt/war/game/tgapi.sh https://1-2-3-4.sslip.io   — запросы к Telegram идут через посредника (deploy/tg-relay.sh на зарубежном сервере)
#   sh /opt/war/game/tgapi.sh off                        — снова напрямую в api.telegram.org
# Адрес хранится в game-data/game.env (TG_API); его читают игра, tgauth.sh и tgbackup.sh. Токены через посредника идут внутри HTTPS.
set -e
DATA=/opt/war/game-data; [ -d "$DATA" ] || DATA="$HOME/game-data"
ENV="$DATA/game.env"; mkdir -p "$DATA"; touch "$ENV"
restart() { if systemctl list-unit-files 2>/dev/null | grep -q '^war\.service'; then chown war:war "$ENV" 2>/dev/null || true; systemctl restart war; echo "Сервер игры перезапущен."; else echo "Перезапустите игру: sh ~/game/start.sh"; fi; }
clean() { grep -v '^TG_API=' "$ENV" > "$ENV.new" || true; mv "$ENV.new" "$ENV"; chmod 600 "$ENV"; }
if [ "$1" = "off" ]; then clean; echo "Telegram — снова напрямую (api.telegram.org)."; restart; exit 0; fi
API="${1%/}"
echo "$API" | grep -qE '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$' || { echo "Укажите адрес посредника: sh $0 https://1-2-3-4.sslip.io"; exit 1; }
# проверка: через посредника Telegram отвечает «Unauthorized» (401) на пустой токен — значит, связь есть
CODE=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$API/bot0/getMe" || true)
case "$CODE" in
  401|404) ;;
  403) echo "✗ Посредник не пускает этот сервер: на посреднике запустите tg-relay.sh с IP ЭТОГО сервера."; exit 1 ;;
  *) echo "✗ Посредник не отвечает (код ${CODE:-нет связи}). Проверьте адрес и что на зарубежном сервере выполнен tg-relay.sh."; exit 1 ;;
esac
clean; echo "TG_API=$API" >> "$ENV"; chmod 600 "$ENV"
echo "✓ Telegram доступен через посредника $API"
restart
echo "Теперь подключите ботов как обычно: sh /opt/war/game/tgauth.sh  и  sh /opt/war/game/tgbackup.sh"
