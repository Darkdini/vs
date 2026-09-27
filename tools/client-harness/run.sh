#!/usr/bin/env bash
# Прогон ОРИГИНАЛЬНОГО J2ME-клиента на ПК без экрана против нашего сервера (для регрессионных тестов).
#   tools/client-harness/run.sh <patched.jar> <scenario.txt> [outdir]
# Нужны: git, JDK 11+. Сервер должен быть запущен (node server/src/index.js) на адресе, прошитом в jar.
# Сценарий: wait <мс> | key <код> | select <строка> <столбец> | text <строка> | shot <file.png> | dump | log <msg>
#   Коды клавиш: 50/52/54/56 = 2/4/6/8, 53 = 5 (выбор), 42 = *, 35 = #, 48 = 0, -6/-7 = левая/правая софт-клавиша
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
JAR="$(realpath "$1")"; SCEN="$(realpath "$2")"; OUT="$(realpath -m "${3:-shots}")"
WORK="${HARNESS_WORK:-$HERE/.work}"
FREEJ2ME_COMMIT=fae9304b85ac1c61d0117f6c8efe528612388278

if [ ! -f "$WORK/build/Harness.class" ]; then
  mkdir -p "$WORK"
  [ -d "$WORK/freej2me" ] || git clone -q https://github.com/hex007/freej2me "$WORK/freej2me"
  git -C "$WORK/freej2me" checkout -q "$FREEJ2ME_COMMIT"
  cp "$HERE/Connector.java" "$WORK/freej2me/src/javax/microedition/io/Connector.java"
  # клиент удаляет и пересоздаёт RMS «Login» из разных потоков; на телефоне это безопасно,
  # а freej2me падает с NoSuchFileException и клиент зацикливает вход — читаем пропавший файл как пустой
  sed -i 's#byte\[\] data = Files.readAllBytes(path);#byte[] data = Files.exists(path) ? Files.readAllBytes(path) : new byte[0];#' \
    "$WORK/freej2me/src/javax/microedition/rms/RecordStore.java"
  find "$WORK/freej2me/src" -name '*.java' > "$WORK/srcs.txt"
  mkdir -p "$WORK/build"
  javac -nowarn -encoding UTF-8 -d "$WORK/build" @"$WORK/srcs.txt" 2>&1 | grep -v '^Note' || true
  javac -nowarn -encoding UTF-8 -cp "$WORK/build" -d "$WORK/build" "$HERE/Harness.java"
fi
mkdir -p "$OUT" "$WORK/run/rms/ThirdWorld"
cd "$WORK/run"   # freej2me хранит RMS (сохранённый логин) в ./rms
exec java -Dstdout.encoding=UTF-8 -Djava.awt.headless=true -cp "$WORK/build" Harness "$JAR" 240 320 "$SCEN" "$OUT"
