#!/bin/sh
# Свой адрес сайта (домен) для игры на VPS. Сначала в панели домена — A-записи на IP этого сервера (@ и www), потом:
#   sh /opt/war/game/domain.sh middle-ages.ru www.middle-ages.ru
#   sh /opt/war/game/domain.sh                — показать, по каким адресам открывается игра
# Проверяет, что адреса уже ведут на этот сервер (иначе ничего не меняет), добавляет их в Caddy — HTTPS-сертификат
# выпускается сам — и ждёт, пока игра откроется по https. Прежние адреса (например 1-2-3-4.sslip.io) продолжают работать.
set -e
CF="${CADDYFILE:-/etc/caddy/Caddyfile}"
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
[ -f "$CF" ] || { echo "✗ Нет $CF — сначала установите игру (install-vps.sh)"; exit 1; }
# первая строка Caddyfile от install-vps.sh: «адрес1, адрес2 {»
HEAD=$(head -n 1 "$CF")
echo "$HEAD" | grep -qE '^[A-Za-z0-9., -]+\{[[:space:]]*$' || { echo "✗ $CF изменён вручную — добавьте адрес в первую строку сами: nano $CF"; exit 1; }
OLD=$(echo "$HEAD" | sed 's/{.*//; s/,/ /g')
if [ $# = 0 ]; then
  echo "Игра открывается по адресам:"; for s in $OLD; do echo "  https://$s"; done
  echo "Добавить свой домен: sh $0 мой-домен.ru www.мой-домен.ru"; exit 0
fi

NEW=""
for a in "$@"; do
  d=$(echo "$a" | sed 's#^[A-Za-z]*://##; s#/.*##' | tr 'A-Z' 'a-z')
  echo "$d" | grep -qE '^[a-z0-9-]+(\.[a-z0-9-]+)+$' || { echo "✗ «$a» — не адрес сайта (латиница, цифры, точки, дефисы; русский домен — в виде xn--…)"; exit 1; }
  NEW="$NEW $d"
done

# IP этого сервера: адреса сетевых карт + внешний (если сервер за NAT)
MY=" $(hostname -I 2>/dev/null || true) $(curl -fsS -4 -m 10 https://ifconfig.me 2>/dev/null || true) "
resolvectl flush-caches 2>/dev/null || true
BAD=0
for d in $NEW; do
  IPS=$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1}' | sort -u || true)
  if [ -z "$IPS" ]; then echo "✗ $d — адрес ещё не виден в интернете"; BAD=1; continue; fi
  for ip in $IPS; do
    case "$MY" in
      *" $ip "*) ;;
      *) echo "✗ $d ведёт на $ip, а не на этот сервер — в панели домена у $d должна быть только A-запись с IP этого сервера"; BAD=1 ;;
    esac
  done
done
if [ "$BAD" = 1 ]; then
  echo "Ничего не изменено. Новые записи домена расходятся по интернету от 15 минут до нескольких часов —"
  echo "подождите и выполните эту же команду ещё раз."
  exit 1
fi
echo "✓ Адреса ведут на этот сервер:$NEW"

SITES=$(printf '%s\n' $NEW $OLD | awk 'NF && !seen[$0]++' | paste -sd, - | sed 's/,/, /g')
cp "$CF" "$CF.bak"
sed -i "1s|.*|$SITES {|" "$CF"
undo() { cp "$CF.bak" "$CF"; systemctl reload caddy 2>/dev/null || true; echo "✗ $1 — возвращён прежний $CF"; exit 1; }
if command -v caddy >/dev/null 2>&1; then caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1 || undo "Caddy не принял настройки"; fi
systemctl reload caddy 2>/dev/null || systemctl restart caddy || undo "Caddy не перезапустился"
echo "Выпускаю HTTPS-сертификаты (до пары минут)…"

WAIT=0
for d in $NEW; do
  i=0
  until curl -fsS -o /dev/null -m 10 --resolve "$d:443:127.0.0.1" "https://$d/" 2>/dev/null; do
    i=$((i+1)); [ $i -gt 24 ] && break; sleep 5
  done
  if [ $i -gt 24 ]; then WAIT=1; echo "… $d — сертификат ещё не готов"; else echo "✓ https://$d — открывается"; fi
done
echo "Все адреса игры: $SITES"
if [ "$WAIT" = 1 ]; then
  echo "Сертификат выпускается дольше обычного: откройте адрес через 5–10 минут."
  echo "Не откроется — пришлите вывод команды:  journalctl -u caddy -n 30 --no-pager"
  exit 1
fi
echo "Готово!"
