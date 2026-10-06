#!/bin/sh
# Бот Telegram для игроков: привязка аккаунта и восстановление пароля («Забыли пароль?» в окне входа).
#   sh /opt/war/game/tgauth.sh        — подключить (спросит токен бота)
#   sh /opt/war/game/tgauth.sh off    — выключить
# Нужен ОТДЕЛЬНЫЙ бот (не тот, что присылает вам копии базы): @BotFather → /newbot. Имя бота увидят игроки.
# Токен хранится только на сервере, в game-data/game.env.
set -e
DATA=/opt/war/game-data; [ -d "$DATA" ] || DATA="$HOME/game-data"
ENV="$DATA/game.env"; mkdir -p "$DATA"; touch "$ENV"
restart() { if systemctl list-unit-files 2>/dev/null | grep -q '^war\.service'; then chown war:war "$ENV" 2>/dev/null || true; systemctl restart war; echo "Сервер игры перезапущен."; else echo "Перезапустите игру: sh ~/game/start.sh"; fi; }
clean() { grep -v '^TG_AUTH_' "$ENV" > "$ENV.new" || true; mv "$ENV.new" "$ENV"; chmod 600 "$ENV"; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(($1)||'')}catch{console.log('')}})"; }

if [ "$1" = "off" ]; then clean; echo "Бот игроков выключен: «Забыли пароль?» и привязка Telegram скрыты."; restart; exit 0; fi

printf "Токен бота для игроков (от @BotFather): "; read -r TOKEN < /dev/tty
echo "$TOKEN" | grep -qE '^[0-9]+:[A-Za-z0-9_-]{30,}$' || { echo "Это не похоже на токен бота."; exit 1; }
if grep -q "^TG_BACKUP_TOKEN=$TOKEN\$" "$ENV"; then echo "Это бот копий базы — для игроков создайте другого бота (@BotFather → /newbot)."; exit 1; fi
BOT=$(curl -fsS "https://api.telegram.org/bot$TOKEN/getMe" | json "j.ok&&j.result.username") || true
[ -n "$BOT" ] || { echo "Telegram не принял токен (или сервер не достучался до api.telegram.org)."; exit 1; }
curl -fsS -o /dev/null "https://api.telegram.org/bot$TOKEN/deleteWebhook" || true
curl -fsS -o /dev/null "https://api.telegram.org/bot$TOKEN/setMyDescription" --data-urlencode "description=Бот игры «Средневековье»: привязка аккаунта и восстановление пароля. Код для смены пароля приходит только сюда. Администрация никогда не спрашивает код." || true
clean
{ echo "TG_AUTH_TOKEN=$TOKEN"; echo "TG_AUTH_BOT=$BOT"; } >> "$ENV"
chmod 600 "$ENV"
restart
echo "✓ Готово: бот @$BOT. Игроки привязывают его в Кабинет → Профиль → «Привязать Telegram»,"
echo "  а в окне входа появилась ссылка «Забыли пароль?»."
