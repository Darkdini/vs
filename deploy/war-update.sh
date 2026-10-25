#!/bin/sh
# war-update — скачать новую версию игры и перезапустить; база /opt/war/game-data не трогается (перед обновлением — копия).
#   war-update                 — последняя версия ветки
#   war-update <SHA>           — версия по коммиту
#   war-update <ссылка.zip>    — из архива по ссылке (или путь к файлу на сервере)
# Репозиторий закрытый: токен GitHub «только чтение» лежит в /etc/war-github.token (права 600, только root),
# задаётся командой war-token. В репозиторий и в папку игры токен не попадает; отправляется только на github.com.
set -e
REPO="Darkdini/vs"; BRANCH="claude/third-world-kings-war-analysis-lodxja"; TOKF=/etc/war-github.token
TOK=""; [ -f "$TOKF" ] && TOK=$(tr -d ' \r\n' < "$TOKF")
ghget() { if [ -n "$TOK" ]; then curl -fsSL -H "Authorization: Bearer $TOK" "$@"; else curl -fsSL "$@"; fi; }
nokey() { echo "✗ $1. Репозиторий закрытый — нужен токен GitHub: выполните war-token"; exit 1; }
ARG="${1:-}"
if [ -z "$ARG" ]; then
  ARG=$(ghget -H "Accept: application/vnd.github.sha" "https://api.github.com/repos/$REPO/commits/$BRANCH") || nokey "Не удалось узнать последнюю версию"
fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
case "$ARG" in
  /*) cp "$ARG" "$TMP/game.zip" ;;
  https://raw.githubusercontent.com/*|https://api.github.com/*) ghget -o "$TMP/game.zip" "$ARG" || nokey "Не удалось скачать" ;;
  http*) curl -fsSL -o "$TMP/game.zip" "$ARG" || { echo "✗ Не удалось скачать"; exit 1; } ;;
  *) ghget -o "$TMP/game.zip" "https://raw.githubusercontent.com/$REPO/$ARG/dist/game.zip" || nokey "Не удалось скачать версию $ARG" ;;
esac
unzip -q "$TMP/game.zip" -d "$TMP" || { echo "✗ Архив повреждён"; exit 1; }
[ -f "$TMP/game/server/src/index.js" ] || { echo "✗ Архив не похож на игру"; exit 1; }
[ -f /opt/war/game-data/db.json ] && cp /opt/war/game-data/db.json "/opt/war/game-data/db.before-update.json"
rm -rf /opt/war/game.old; [ -d /opt/war/game ] && mv /opt/war/game /opt/war/game.old
mv "$TMP/game" /opt/war/game
chown -R war:war /opt/war
systemctl restart war 2>/dev/null || true
# сама команда обновляется вместе с игрой
for f in war-update war-token; do [ -f "/opt/war/game/$f.sh" ] && ! cmp -s "/opt/war/game/$f.sh" "/usr/local/bin/$f" && install -m 755 "/opt/war/game/$f.sh" "/usr/local/bin/$f"; done
echo "Готово: версия $(cat /opt/war/game/VERSION)"
