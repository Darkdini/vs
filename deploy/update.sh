#!/bin/sh
# Безопасное обновление игры — база игроков (~/game-data) не трогается:
#   sh ~/game/update.sh            — скачать последнюю версию
#   sh ~/game/update.sh <адрес.zip> — обновить из другого архива
# Порядок: скачать → проверить новую версию на КОПИИ базы → остановить сервер (он сохраняет базу) → копия базы → замена папки игры.
# Если новая версия не запускается на вашей базе — обновление отменяется, сервер и база остаются как были.
set -e
REPO="Darkdini/vs"; BRANCH="claude/third-world-kings-war-analysis-lodxja"
# ссылка на КОНКРЕТНУЮ версию (по коммиту): GitHub кэширует ссылку на ветку несколько минут и может отдать старый архив
# закрытый репозиторий: токен GitHub (только чтение) — в ~/game-data/github.token или /etc/war-github.token (права 600)
TOK=""; for f in "$HOME/game-data/github.token" /etc/war-github.token; do [ -r "$f" ] && TOK=$(tr -d ' \r\n' < "$f") && break; done
ghget() { if [ -n "$TOK" ]; then curl -fsSL -H "Authorization: Bearer $TOK" "$@"; else curl -fsSL "$@"; fi; }
if [ -z "$1" ]; then
  SHA=$(ghget "https://api.github.com/repos/$REPO/commits/$BRANCH" 2>/dev/null | grep -m1 '"sha"' | sed 's/.*"sha": *"\([0-9a-f]*\)".*/\1/')
  [ -n "$SHA" ] && URL="https://raw.githubusercontent.com/$REPO/$SHA/dist/game.zip" || URL="https://raw.githubusercontent.com/$REPO/$BRANCH/dist/game.zip"
else URL="$1"; fi
GAME="$HOME/game"; DATA="$HOME/game-data"; TMP="$HOME/.game-update"
fail() { echo "✗ $1 — обновление отменено, игра и база не изменены."; [ -f "$TMP/check.pid" ] && kill "$(cat "$TMP/check.pid")" 2>/dev/null; rm -rf "$TMP"; exit 1; }
rm -rf "$TMP"; mkdir -p "$TMP" "$DATA"
# старая база внутри папки игры (версии до ~/game-data) — сначала вынести
[ ! -f "$DATA/db.json" ] && [ -f "$GAME/server/data/db.json" ] && cp -r "$GAME/server/data/." "$DATA/"

echo "1/6 Скачиваю новую версию… ($URL)"
case "$URL" in /*) cp "$URL" "$TMP/game.zip" ;; https://raw.githubusercontent.com/*|https://api.github.com/*) ghget -o "$TMP/game.zip" "$URL" || fail "Не удалось скачать (закрытый репозиторий — нужен токен в ~/game-data/github.token)" ;; *) curl -fsSL -o "$TMP/game.zip" "$URL" || fail "Не удалось скачать" ;; esac
unzip -q "$TMP/game.zip" -d "$TMP" || fail "Архив повреждён"
[ -f "$TMP/game/server/src/index.js" ] || fail "В архиве нет сервера"

echo "2/6 Проверяю новую версию на копии вашей базы…"
for f in "$TMP"/game/server/src/*.js; do node --check "$f" 2>/dev/null || fail "Ошибка в коде $(basename "$f")"; done
mkdir -p "$TMP/check"; [ -f "$DATA/db.json" ] && cp "$DATA/db.json" "$TMP/check/db.json"
( cd "$TMP/game/server" && DB="$TMP/check/db.json" WEB_PORT=18099 HOST=127.0.0.1 NO_BACKUP=1 ADMIN_PASS=check node src/index.js > "$TMP/check.log" 2>&1 & echo $! > "$TMP/check.pid" )
ok=0; for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; if curl -fs http://127.0.0.1:18099/ >/dev/null 2>&1; then ok=1; break; fi; done
[ $ok = 1 ] || { tail -15 "$TMP/check.log"; fail "Новая версия не запустилась на вашей базе"; }
kill "$(cat "$TMP/check.pid")" 2>/dev/null; rm -f "$TMP/check.pid"

echo "3/6 Останавливаю сервер (он сохраняет базу)…"
if [ -f "$DATA/server.pid" ]; then
  PID=$(cat "$DATA/server.pid")
  if kill -0 "$PID" 2>/dev/null; then kill -TERM "$PID"; i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done; fi
fi

echo "4/6 Резервная копия базы…"
mkdir -p "$DATA/backups"
if [ -f "$DATA/db.json" ]; then B="$DATA/backups/db-$(date +%Y-%m-%d_%H%M%S)-update.json.gz"; gzip -c "$DATA/db.json" > "$B"; echo "   $B"; fi

echo "5/6 Меняю версию игры (прежняя сохранена в ~/game.old)…"
rm -rf "$HOME/game.old"; [ -d "$GAME" ] && mv "$GAME" "$HOME/game.old"
mv "$TMP/game" "$GAME"; rm -rf "$TMP"

echo "6/6 Готово ✓  Версия $(cat "$GAME/VERSION" 2>/dev/null).  Запуск: sh ~/game/start.sh   Вернуть прежнюю версию: sh ~/game/rollback.sh"
