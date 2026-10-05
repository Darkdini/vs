#!/bin/sh
# Копия базы в Telegram (раз в сутки файлом в чат с вашим ботом). Запускать на сервере:
#   sh /opt/war/game/tgbackup.sh        — настроить (спросит токен бота и пароль шифрования)
#   sh /opt/war/game/tgbackup.sh off    — выключить
#   sh /opt/war/game/tgbackup.sh restore — восстановить базу из копии: перешлите файл копии своему боту и запустите
# Перед настройкой: в Telegram у @BotFather — /newbot, получить токен; затем открыть своего бота и нажать «Старт».
# Токен и пароль хранятся только на сервере, в game-data/game.env (доступ — только у root и игры).
set -e
DATA=/opt/war/game-data; [ -d "$DATA" ] || DATA="$HOME/game-data"
ENV="$DATA/game.env"; mkdir -p "$DATA"; touch "$ENV"
restart() { if systemctl list-unit-files 2>/dev/null | grep -q '^war\.service'; then chown war:war "$ENV" 2>/dev/null || true; systemctl restart war; echo "Сервер игры перезапущен."; else echo "Перезапустите игру: sh ~/game/start.sh"; fi; }
clean() { grep -v '^TG_BACKUP_' "$ENV" > "$ENV.new" || true; mv "$ENV.new" "$ENV"; chmod 600 "$ENV"; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(($1)||'')}catch{console.log('')}})"; }

if [ "$1" = "off" ]; then clean; echo "Копия в Telegram выключена."; restart; exit 0; fi

if [ "$1" = "restore" ]; then
  # токен и пароль — из game.env (на новом сервере сначала настройте: sh tgbackup.sh)
  TOKEN=$(sed -n 's/^TG_BACKUP_TOKEN=//p' "$ENV"); PASS=$(sed -n "s/^TG_BACKUP_PASS='\(.*\)'$/\1/p" "$ENV")
  [ -n "$TOKEN" ] || { echo "Сначала настройте бота: sh $0"; exit 1; }
  echo "Перешлите (или отправьте) своему боту файл копии db-….json.gz(.enc) из Telegram, затем нажмите Enter."; read -r _ < /dev/tty
  FILE=$(curl -fsS "https://api.telegram.org/bot$TOKEN/getUpdates" | json "(j.result||[]).map(u=>u.message&&u.message.document).filter(d=>d&&/^db-.*\\.json\\.gz(\\.enc)?$/.test(d.file_name)).map(d=>d.file_id+' '+d.file_name).pop()") || true
  [ -n "$FILE" ] || { echo "Бот не видит файла копии. Перешлите его боту ещё раз (имя файла db-….json.gz или .enc)."; exit 1; }
  FID=${FILE%% *}; NAME=${FILE#* }; echo "Файл: $NAME"
  FPATH=$(curl -fsS "https://api.telegram.org/bot$TOKEN/getFile?file_id=$FID" | json "j.ok&&j.result.file_path") || true
  [ -n "$FPATH" ] || { echo "Telegram не отдал файл (бот может скачать файл до 20 МБ)."; exit 1; }
  TMP=$(mktemp -d); curl -fsS -o "$TMP/$NAME" "https://api.telegram.org/file/bot$TOKEN/$FPATH"
  GZ="$TMP/$NAME"
  case "$NAME" in *.enc)
    if [ -z "$PASS" ]; then stty -echo 2>/dev/null || true; printf "Пароль шифрования копии: "; read -r PASS < /dev/tty; stty echo 2>/dev/null || true; echo; fi
    node "$(dirname "$0")/server/src/tgbackup.js" decrypt "$GZ" "$PASS" >/dev/null || { echo "Не расшифровалось: неверный пароль или файл повреждён."; rm -rf "$TMP"; exit 1; }
    GZ="${GZ%.enc}" ;;
  esac
  gzip -t "$GZ" 2>/dev/null || { echo "Копия повреждена."; rm -rf "$TMP"; exit 1; }
  printf "Заменить текущую базу копией %s? Текущая сохранится в backups. [да/нет] " "$NAME"; read -r A < /dev/tty
  [ "$A" = "да" ] || { echo "Отменено."; rm -rf "$TMP"; exit 1; }
  SYS=0; systemctl list-unit-files 2>/dev/null | grep -q '^war\.service' && SYS=1
  [ $SYS = 1 ] && systemctl stop war
  mkdir -p "$DATA/backups"; [ -f "$DATA/db.json" ] && gzip -c "$DATA/db.json" > "$DATA/backups/db-$(date +%Y-%m-%d_%H%M%S)-before-restore.json.gz"
  gzip -dc "$GZ" > "$DATA/db.json.restore" && mv "$DATA/db.json.restore" "$DATA/db.json"; rm -rf "$TMP"
  if [ $SYS = 1 ]; then chown -R war:war "$DATA"; systemctl start war; echo "✓ База восстановлена из $NAME, игра запущена."; else echo "✓ База восстановлена из $NAME. Запуск: sh ~/game/start.sh"; fi
  exit 0
fi

printf "Токен бота (от @BotFather, вида 123456:ABC…): "; read -r TOKEN < /dev/tty
echo "$TOKEN" | grep -qE '^[0-9]+:[A-Za-z0-9_-]{30,}$' || { echo "Это не похоже на токен бота."; exit 1; }
BOT=$(curl -fsS "https://api.telegram.org/bot$TOKEN/getMe" | json "j.ok&&j.result.username") || true
[ -n "$BOT" ] || { echo "Telegram не принял токен (или сервер не достучался до api.telegram.org)."; exit 1; }
echo "Бот: @$BOT"
CHAT=$(curl -fsS "https://api.telegram.org/bot$TOKEN/getUpdates" | json "(j.result||[]).map(u=>(u.message||u.my_chat_member||{}).chat).filter(c=>c&&c.type==='private').map(c=>c.id).pop()") || true
[ -n "$CHAT" ] || { echo "Бот пока не видит вашего чата: откройте @$BOT в Telegram, нажмите «Старт» (или напишите ему что-нибудь) и запустите эту команду снова."; exit 1; }
echo "Чат найден: $CHAT"
echo "Пароль шифрования копии (рекомендуется; без него файл в Telegram — открытый)."
echo "ЗАПИШИТЕ его отдельно: без пароля копию не восстановить. Пусто — без шифрования."
stty -echo 2>/dev/null || true; printf "Пароль: "; read -r PASS < /dev/tty; stty echo 2>/dev/null || true; echo
if [ -n "$PASS" ]; then
  [ ${#PASS} -ge 8 ] || { echo "Пароль — не короче 8 символов."; exit 1; }
  stty -echo 2>/dev/null || true; printf "Ещё раз: "; read -r PASS2 < /dev/tty; stty echo 2>/dev/null || true; echo
  [ "$PASS" = "$PASS2" ] || { echo "Пароли не совпали."; exit 1; }
fi
case "$PASS" in *"'"*) echo "В пароле не должно быть символа '"; exit 1 ;; esac
clean
{ echo "TG_BACKUP_TOKEN=$TOKEN"; echo "TG_BACKUP_CHAT=$CHAT"; [ -n "$PASS" ] && echo "TG_BACKUP_PASS='$PASS'"; } >> "$ENV"
chmod 600 "$ENV"
curl -fsS -o /dev/null "https://api.telegram.org/bot$TOKEN/sendMessage" --data-urlencode "chat_id=$CHAT" --data-urlencode "text=✓ Бот подключён к серверу «Война Королей». Копия базы будет приходить сюда раз в сутки. Первая — через минуту." || true
restart
echo "✓ Готово. Первая копия придёт в Telegram примерно через минуту, дальше — раз в сутки около 4:00 (время сервера)."
echo "  Отправить вручную: Админ-панель → 🔒 Защита → «Отправить копию сейчас»."
[ -n "$PASS" ] && echo "  Расшифровать копию: node /opt/war/game/server/src/tgbackup.js decrypt <файл.enc> <пароль>"
exit 0
