#!/bin/sh
# Вернуть прежнюю версию игры (~/game.old). База игроков остаётся текущей.
# Если нужно вернуть и базу — sh ~/game/restore.sh
GAME="$HOME/game"; DATA="$HOME/game-data"
[ -d "$HOME/game.old" ] || { echo "Прежней версии нет (~/game.old)."; exit 1; }
if [ -f "$DATA/server.pid" ] && kill -0 "$(cat "$DATA/server.pid")" 2>/dev/null; then
  PID=$(cat "$DATA/server.pid"); kill -TERM "$PID"; i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done
fi
rm -rf "$HOME/game.bad"; mv "$GAME" "$HOME/game.bad" && mv "$HOME/game.old" "$GAME"
echo "✓ Прежняя версия возвращена (неудачная — в ~/game.bad). Запуск: sh ~/game/start.sh"
