#!/bin/sh
# Сборка dist/game.zip для Termux и проверка: пакет распаковывается в чистую папку и сервер из него должен запуститься.
# Запуск: sh tools/pack.sh
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'kill $PID 2>/dev/null; rm -rf "$TMP"' EXIT
G="$TMP/pkg/game"
mkdir -p "$G/server"
cp -r "$ROOT/web" "$ROOT/data" "$G/"
cp -r "$ROOT/server/src" "$ROOT/server/package.json" "$G/server/"
cp "$ROOT"/deploy/*.sh "$ROOT/deploy/README.txt" "$G/"
TZ=Europe/Moscow date '+%Y-%m-%d %H:%M' > "$G/VERSION"
rm -f "$ROOT/dist/game.zip"
(cd "$TMP/pkg" && zip -qr "$ROOT/dist/game.zip" game)
# проверка: распаковать и запустить как в Termux
mkdir "$TMP/check" && (cd "$TMP/check" && unzip -q "$ROOT/dist/game.zip")
PORT=18093
(cd "$TMP/check/game/server" && DB="$TMP/db.json" WEB_PORT=$PORT PORT=18094 ADMIN_PASS=x NO_BACKUP=1 node src/index.js > "$TMP/log" 2>&1) &
PID=$!
i=0; until curl -sf "http://127.0.0.1:$PORT/" > /dev/null; do i=$((i+1)); if [ $i -gt 40 ] || ! kill -0 $PID 2>/dev/null; then echo "ПАКЕТ НЕ ЗАПУСКАЕТСЯ:"; cat "$TMP/log"; exit 1; fi; sleep 0.25; done
pkill -P $PID 2>/dev/null || true
echo "dist/game.zip собран и проверен: $(unzip -Z1 "$ROOT/dist/game.zip" | wc -l) файлов, версия $(cat "$G/VERSION")"
