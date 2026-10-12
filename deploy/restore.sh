#!/bin/sh
# Восстановление базы игроков из резервной копии. Копии сервер делает сам: при каждом запуске и раз в час
# (/opt/war/game-data/backups: последние 48 часовых и 10 стартовых). На сервере, от root:
#   sh /opt/war/game/restore.sh           — список копий (новые внизу)
#   sh /opt/war/game/restore.sh <файл>    — восстановить: игра останавливается, текущая база сохраняется
#                                           как …-before-restore, база заменяется копией, игра запускается
# Копии из Telegram (tgbackup.sh) восстанавливает  sh /opt/war/game/tgbackup.sh restore
[ -d /opt/war ] && DATA=/opt/war/game-data || DATA="$HOME/game-data"
B="$DATA/backups"
if [ -z "$1" ]; then
  echo "Резервные копии (новые внизу):"
  if [ -n "$(ls -A "$B" 2>/dev/null)" ]; then ls -1 "$B" | tail -30; else echo "  нет"; fi
  echo; echo "Восстановить: sh $0 <имя файла>"; exit 0
fi
F="$1"; [ -f "$F" ] || F="$B/$1"; [ -f "$F" ] || { echo "Нет файла $1"; exit 1; }
gzip -t "$F" 2>/dev/null || { echo "Копия повреждена: $F"; exit 1; }
SYS=0; [ "$(id -u)" = 0 ] && systemctl list-unit-files 2>/dev/null | grep -q '^war\.service' && SYS=1
if [ $SYS = 1 ]; then echo "Останавливаю игру (она сохраняет базу)…"; systemctl stop war
elif [ -f "$DATA/server.pid" ] && kill -0 "$(cat "$DATA/server.pid")" 2>/dev/null; then
  PID=$(cat "$DATA/server.pid"); echo "Останавливаю сервер…"; kill -TERM "$PID"; i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done
fi
mkdir -p "$B"
[ -f "$DATA/db.json" ] && gzip -c "$DATA/db.json" > "$B/db-$(date +%Y-%m-%d_%H%M%S)-before-restore.json.gz"
gzip -dc "$F" > "$DATA/db.json.restore" && mv "$DATA/db.json.restore" "$DATA/db.json" || { echo "✗ Не удалось распаковать копию — база не изменена"; [ $SYS = 1 ] && systemctl start war; exit 1; }
if [ $SYS = 1 ]; then
  chown -R war:war "$DATA"; systemctl start war
  echo "✓ База восстановлена из $(basename "$F"), игра запущена. Прежняя база — в backups (…-before-restore)."
else echo "✓ База восстановлена из $(basename "$F"). Запустите сервер игры."; fi
