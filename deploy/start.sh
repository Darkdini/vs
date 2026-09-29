#!/bin/sh
# Запуск игры: потом открыть в Chrome http://127.0.0.1:8080
# База игроков лежит ОТДЕЛЬНО от игры — в ~/game-data, поэтому обновление (rm -rf game) её не стирает.
# Логин и пароль админа задаются один раз командой  sh ~/game/admin.sh  и хранятся в ~/game-data/admin.env
# (вне папки игры и вне репозитория). Без admin.env пароль admin на новой базе — случайный: см. ~/game-data/ADMIN_PASSWORD.txt
DATA="$HOME/game-data"
mkdir -p "$DATA"
# перенос старой базы из папки игры (если она там осталась)
[ ! -f "$DATA/db.json" ] && [ -f "$(dirname "$0")/server/data/db.json" ] && cp -r "$(dirname "$0")/server/data/." "$DATA/"
export DB="$DATA/db.json"
# свои настройки сервера (по строке ИМЯ=значение), например TRUST_PROXY=1 за Cloudflare Tunnel, WEB_PORT=8080
[ -f "$DATA/game.env" ] && { set -a; . "$DATA/game.env"; set +a; }
# секретный логин и пароль админа (sh ~/game/admin.sh): пароль применяется при каждом запуске
if [ -f "$DATA/admin.env" ]; then . "$DATA/admin.env"; export ADMIN_LOGIN ADMIN_PASS; export ADMIN_RESET=1; fi
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
