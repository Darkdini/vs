#!/bin/sh
# Запуск игры: потом открыть в Chrome http://127.0.0.1:8080
# База игроков лежит ОТДЕЛЬНО от игры — в ~/game-data, поэтому обновление (rm -rf game) её не стирает.
# Пароль admin на новой базе — случайный: смотрите в консоли или в ~/game-data/ADMIN_PASSWORD.txt
# Забыли пароль admin:  ADMIN_PASS=новыйпароль ADMIN_RESET=1 sh ~/game/start.sh
DATA="$HOME/game-data"
mkdir -p "$DATA"
# перенос старой базы из папки игры (если она там осталась)
[ ! -f "$DATA/db.json" ] && [ -f "$(dirname "$0")/server/data/db.json" ] && cp -r "$(dirname "$0")/server/data/." "$DATA/"
export DB="$DATA/db.json"
# ТЕСТОВЫЙ РЕЖИМ: при каждом запуске пароль admin = 123456789. Перед выкладкой на хост УБРАТЬ эту строку!
export ADMIN_PASS="${ADMIN_PASS:-123456789}" ADMIN_RESET="${ADMIN_RESET:-1}"
# если сервер игры уже запущен (например, старая версия в другой сессии Termux) — сначала остановить его, иначе порт занят
if [ -f "$DATA/server.pid" ] && kill -0 "$(cat "$DATA/server.pid")" 2>/dev/null; then
  echo "Останавливаю ранее запущенный сервер…"; OLD=$(cat "$DATA/server.pid"); kill -TERM "$OLD"
  i=0; while kill -0 "$OLD" 2>/dev/null && [ $i -lt 20 ]; do sleep 1; i=$((i+1)); done
fi
pkill -f "^node src/index.js$" 2>/dev/null && sleep 1   # старые версии без pid-файла
# Termux: не давать Android «усыплять» сервер, пока открыт Chrome (иначе игра очень долго думает)
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
trap 'true' INT TERM
cd "$(dirname "$0")/server" && node src/index.js
command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock
exit 0
