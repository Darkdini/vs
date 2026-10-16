#!/bin/sh
# Почта игры: письма с кодами игрокам (привязка почты в Профиле и «Забыли пароль?» в окне входа).
#   sh /opt/war/game/mail.sh        — подключить (спросит адрес ящика и пароль приложения)
#   sh /opt/war/game/mail.sh off    — выключить
# Ящик — на домене игры (например noreply@middle-ages.ru) в Яндекс 360 или VK WorkSpace; как завести — README, «Почта игры».
# Пароль — «пароль приложения» из настроек ящика (не основной). Хранится только на сервере, в game-data/game.env.
set -e
DATA=/opt/war/game-data; [ -d "$DATA" ] || DATA="$HOME/game-data"
ENV="$DATA/game.env"; mkdir -p "$DATA"; touch "$ENV"
DIR=$(cd "$(dirname "$0")" && pwd)
restart() { if systemctl list-unit-files 2>/dev/null | grep -q '^war\.service'; then chown war:war "$ENV" 2>/dev/null || true; systemctl restart war; echo "Сервер игры перезапущен."; else echo "Перезапустите сервер игры."; fi; }
clean() { grep -v '^SMTP_' "$ENV" > "$ENV.new" || true; mv "$ENV.new" "$ENV"; chmod 600 "$ENV"; }

if [ "$1" = "off" ]; then clean; echo "Почта игры выключена: у игроков скрыта кнопка «Привязать почту»."; restart; exit 0; fi

printf "Адрес ящика игры (например noreply@middle-ages.ru): "; read -r USER_ADDR < /dev/tty
echo "$USER_ADDR" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' || { echo "Это не похоже на адрес почты."; exit 1; }
echo "Где заведён ящик?  1 — Яндекс 360   2 — VK WorkSpace (Mail.ru)   3 — другой почтовый сервер"
printf "Номер (1): "; read -r K < /dev/tty
case "${K:-1}" in
  1) HOST=smtp.yandex.ru ;;
  2) HOST=smtp.mail.ru ;;
  *) printf "Адрес SMTP-сервера (например smtp.example.ru): "; read -r HOST < /dev/tty ;;
esac
echo "$HOST" | grep -qE '^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' || { echo "Это не похоже на адрес сервера."; exit 1; }
PORT=465
printf "Пароль приложения для ящика (ввод не виден): "; stty -echo < /dev/tty; read -r PASS < /dev/tty; stty echo < /dev/tty; echo
# пароль приложения у Яндекса и VK — латинские буквы и цифры; другие символы в game.env могут прочитаться неверно
echo "$PASS" | grep -qE '^[A-Za-z0-9]{8,64}$' || { echo "Пароль приложения — 8–64 латинские буквы и цифры. Создайте его в настройках ящика: «Пароли приложений»."; exit 1; }
echo "Проверяю вход в $HOST (письмо не отправляется)…"
SMTP_HOST="$HOST" SMTP_PORT="$PORT" SMTP_USER="$USER_ADDR" SMTP_PASS="$PASS" node "$DIR/server/src/mail.js" check || {
  echo "Почтовый сервер не принял вход. Проверьте адрес ящика и пароль приложения; в настройках ящика должен быть разрешён доступ"
  echo "почтовым программам (Яндекс 360: Все настройки → Почтовые программы → «С сервера imap.yandex.ru по протоколу IMAP»)."; exit 1; }
clean
{ echo "SMTP_HOST=$HOST"; echo "SMTP_PORT=$PORT"; echo "SMTP_USER=$USER_ADDR"; echo "SMTP_PASS=$PASS"; } >> "$ENV"
chmod 600 "$ENV"
restart
echo "✓ Готово: письма игрокам уходят с $USER_ADDR."
echo "  Проверка: Админка → Безопасность → «Почта игры» → впишите свою почту → «Проверить»."
