#!/bin/sh
# Чистый старт для закрытого теста (на сервере, от root):  sh /opt/war/game/fresh-test.sh 5
# Удаляет ВСЕХ игроков: старая база, аватары, картинки, копии базы уходят в архив /root/war-old/ (на всякий случай),
# остаются только настройки сервера — admin.env (логин админа) и game.env (токены ботов).
# Создаётся пустая база: режим «Закрытый тест» сразу включён, N тестеров (по умолчанию 5). Логины и пароли — на экран один раз.
set -e
N="${1:-5}"; W=/opt/war; D=$W/game-data
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
[ -f "$W/game/server/src/fresh.js" ] || { echo "Сначала поставьте новую версию игры: war-update <ссылка>"; exit 1; }
printf 'Удалить ВСЕХ игроков и начать с чистой базы? Старое уйдёт в архив /root/war-old. Напишите ДА: '; read -r A
case "$A" in ДА|Да|да) ;; *) echo "Отменено — ничего не изменено."; exit 1 ;; esac
systemctl stop war 2>/dev/null || true
T=$(date +%F_%H%M%S); mkdir -p /root/war-old; chmod 700 /root/war-old
if [ -d "$D" ]; then tar czf "/root/war-old/game-data-$T.tgz" -C "$W" game-data; echo "Архив старых данных: /root/war-old/game-data-$T.tgz"; fi
rm -rf "$W/game-data.new"; mkdir -p "$W/game-data.new"
for f in admin.env game.env; do [ -f "$D/$f" ] && cp -p "$D/$f" "$W/game-data.new/"; done
rm -rf "$D" "$W/game.old" "$W/.game-update"; mv "$W/game-data.new" "$D"; chmod 700 "$D"
( cd "$W/game/server" && node src/fresh.js "$D/db.json" "$N" )
id war >/dev/null 2>&1 && chown -R war:war "$W"; chmod 600 "$D"/*.env 2>/dev/null || true
[ -f "$D/admin.env" ] || echo "⚠ admin.env нет — пароль админа сервер запишет в $D/ADMIN_PASSWORD.txt при запуске."
systemctl start war 2>/dev/null || true; sleep 2
echo "Игра: $(systemctl is-active war 2>/dev/null || echo '?')  ·  папка данных: $(ls "$D" | tr '\n' ' ')"
