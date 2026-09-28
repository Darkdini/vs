#!/bin/sh
# Восстановление базы игроков из резервной копии.
#   sh ~/game/restore.sh           — список копий
#   sh ~/game/restore.sh <файл>    — восстановить (текущая база сначала сохраняется как …-before-restore)
DATA="$HOME/game-data"; B="$DATA/backups"
if [ -z "$1" ]; then
  echo "Резервные копии (новые внизу):"; ls -1 "$B" 2>/dev/null | tail -30 || echo "  нет"
  echo; echo "Восстановить: sh ~/game/restore.sh <имя файла>"; exit 0
fi
F="$1"; [ -f "$F" ] || F="$B/$1"; [ -f "$F" ] || { echo "Нет файла $1"; exit 1; }
gzip -t "$F" 2>/dev/null || { echo "Копия повреждена: $F"; exit 1; }
if [ -f "$DATA/server.pid" ] && kill -0 "$(cat "$DATA/server.pid")" 2>/dev/null; then
  PID=$(cat "$DATA/server.pid"); echo "Останавливаю сервер…"; kill -TERM "$PID"; i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done
fi
[ -f "$DATA/db.json" ] && gzip -c "$DATA/db.json" > "$B/db-$(date +%Y-%m-%d_%H%M%S)-before-restore.json.gz"
gzip -dc "$F" > "$DATA/db.json.restore" && mv "$DATA/db.json.restore" "$DATA/db.json"
echo "✓ База восстановлена из $(basename "$F"). Запуск: sh ~/game/start.sh"
