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
cp "$ROOT/deploy/admin.sh" "$G/" 2>/dev/null || true
TZ=Europe/Moscow date '+%Y-%m-%d %H:%M' > "$G/VERSION"
# клиент для хостинга: все скрипты страницы склеены в один g.js и минифицированы (без комментариев и пробелов),
# стили и admin.js тоже сжаты; исходники клиента в пакет не попадают
ESB="npx --yes esbuild@0.28.2"
W="$G/web"
SCRIPTS=$(grep -o '<script src="[a-z0-9]*\.js"></script>' "$W/index.html" | sed 's/.*src="\([^"]*\)".*/\1/')
: > "$TMP/bundle.js"
for f in $SCRIPTS; do cat "$W/$f" >> "$TMP/bundle.js"; printf '\n;\n' >> "$TMP/bundle.js"; rm "$W/$f"; done
$ESB "$TMP/bundle.js" --minify --legal-comments=none --target=es2019 --log-level=warning --outfile="$W/g.js"
$ESB "$W/admin.js" --minify --legal-comments=none --target=es2019 --log-level=warning --outfile="$TMP/admin.min.js" && mv "$TMP/admin.min.js" "$W/admin.js"
$ESB "$W/style.css" --minify --log-level=warning --outfile="$TMP/style.min.css" && mv "$TMP/style.min.css" "$W/style.css"
V=$(date +%s)
node -e '
const fs = require("fs"), f = process.argv[1], v = process.argv[2];
let h = fs.readFileSync(f, "utf8");
h = h.replace(/<!--[\s\S]*?-->/g, "");
let first = true;
h = h.replace(/[ \t]*<script src="[a-z0-9]+\.js"><\/script>\n?/g, () => { if (!first) return ""; first = false; return `<script src="g.js?v=${v}"></script>\n`; });
h = h.replace(/\n\s*\n+/g, "\n");
fs.writeFileSync(f, h);' "$W/index.html" "$V"
rm -f "$ROOT/dist/game.zip"
(cd "$TMP/pkg" && zip -qr "$ROOT/dist/game.zip" game)
# проверка: распаковать и запустить как в Termux
mkdir "$TMP/check" && (cd "$TMP/check" && unzip -q "$ROOT/dist/game.zip")
PORT=18093
(cd "$TMP/check/game/server" && DB="$TMP/db.json" WEB_PORT=$PORT PORT=18094 ADMIN_PASS=x NO_BACKUP=1 node src/index.js > "$TMP/log" 2>&1) &
PID=$!
i=0; until curl -sf "http://127.0.0.1:$PORT/" > /dev/null; do i=$((i+1)); if [ $i -gt 40 ] || ! kill -0 $PID 2>/dev/null; then echo "ПАКЕТ НЕ ЗАПУСКАЕТСЯ:"; cat "$TMP/log"; exit 1; fi; sleep 0.25; done
curl -sf "http://127.0.0.1:$PORT/g.js" > /dev/null || { echo "g.js не отдаётся"; exit 1; }
pkill -P $PID 2>/dev/null || true
echo "dist/game.zip собран и проверен: $(unzip -Z1 "$ROOT/dist/game.zip" | wc -l) файлов, версия $(cat "$G/VERSION")"
