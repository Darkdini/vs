#!/bin/sh
# Запуск игры: потом открыть в Chrome http://localhost:8080
# База игроков лежит ОТДЕЛЬНО от игры — в ~/game-data, поэтому обновление (rm -rf game) её не стирает.
# Пароль admin на новой базе — случайный: смотрите в консоли или в ~/game-data/ADMIN_PASSWORD.txt
# Забыли пароль admin:  ADMIN_PASS=новыйпароль ADMIN_RESET=1 sh ~/game/start.sh
DATA="$HOME/game-data"
mkdir -p "$DATA"
# перенос старой базы из папки игры (если она там осталась)
[ ! -f "$DATA/db.json" ] && [ -f "$(dirname "$0")/server/data/db.json" ] && cp -r "$(dirname "$0")/server/data/." "$DATA/"
export DB="$DATA/db.json"
cd "$(dirname "$0")/server" && exec node src/index.js
