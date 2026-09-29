#!/bin/sh
# Сборка Android-приложения «Война Королей» (WebView с игрой во весь экран) без Android Studio и SDK:
#   sh tools/build-apk.sh [адрес игры]      по умолчанию https://193-176-78-254.sslip.io
# Результат: dist/war-kings.apk (подписан v2, minSdk 24, Android 7+, targetSdk 34).
# Инструменты берутся с Maven Central (кэш ~/.cache/war-apk): android.jar (API 16 + ресурсы), dx (dex),
# apktool (из него aapt2), apksig (подпись). Нужны java/javac 17+, curl, unzip, zip, python3.
# Ключ подписи: tools/android/release.p12 — для обновлений приложения поверх старого ключ должен быть тот же!
set -e
URL="${1:-${GAME_URL:-https://193-176-78-254.sslip.io}}"
URL="${URL%/}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
A="$ROOT/tools/android"
C="${WAR_APK_CACHE:-$HOME/.cache/war-apk}"
KS="${KEYSTORE:-$A/release.p12}" KSPASS="${KEYSTORE_PASS:-warkings}"
VERSION_CODE="${VERSION_CODE:-$(date +%y%m%d%H)}"
VERSION_NAME="${VERSION_NAME:-$(TZ=Europe/Moscow date '+%Y.%m.%d')}"
M=https://repo1.maven.org/maven2
mkdir -p "$C"
get() { [ -s "$C/$2" ] || curl -fsSL -o "$C/$2" "$M/$1"; }
get com/google/android/android/4.1.1.4/android-4.1.1.4.jar android.jar
get com/google/android/tools/dx/1.7/dx-1.7.jar dx.jar
get com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar apksig.jar
get org/apktool/apktool-cli/3.0.3/apktool-cli-3.0.3.jar apktool.jar
[ -x "$C/aapt2" ] || { unzip -o -q -j "$C/apktool.jar" prebuilt/linux/aapt2 -d "$C" && chmod +x "$C/aapt2"; }

B=$(mktemp -d); trap 'rm -rf "$B"' EXIT
mkdir -p "$B/res" "$B/gen" "$B/stubs" "$B/cls" "$B/signer"
cp -r "$A/res/." "$B/res/"
python3 - "$B/res/values/strings.xml" "$URL" <<'PY'
import sys, html
p, url = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read().replace('GAME_URL', html.escape(url))
open(p, 'w', encoding='utf-8').write(s)
PY

echo "== ресурсы (aapt2)"
"$C/aapt2" compile --dir "$B/res" -o "$B/res.zip"
"$C/aapt2" link -o "$B/base.apk" -I "$C/android.jar" --manifest "$A/AndroidManifest.xml" --java "$B/gen" \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$B/res.zip"

echo "== код (javac → dx)"
javac -nowarn -Xlint:-options --release 8 -d "$B/stubs" -cp "$C/android.jar" "$A/stubs/android/webkit/WebChromeClient.java"
javac -nowarn -Xlint:-options --release 8 -encoding UTF-8 -d "$B/cls" -cp "$B/stubs:$C/android.jar" \
  "$A/src/ru/tmrs/war/MainActivity.java" $(find "$B/gen" -name '*.java')
# старый dx понимает только class-файлы Java 6: код без лямбд и новых конструкций, поэтому версию можно понизить
python3 - "$B/cls" <<'PY'
import sys, pathlib
for f in pathlib.Path(sys.argv[1]).rglob('*.class'):
    b = bytearray(f.read_bytes()); b[6], b[7] = 0, 50; f.write_bytes(b)
PY
java -cp "$C/dx.jar" com.android.dx.command.Main --dex --output="$B/classes.dex" "$B/cls"
(cd "$B" && zip -q base.apk classes.dex)

echo "== подпись (apksig)"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$KSPASS" -keypass "$KSPASS" -alias war \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=War of Kings, O=tmrs.ru, C=RU" >/dev/null 2>&1
  echo "Создан новый ключ подписи: $KS (сохраните его — без него обновление поверх установленного не встанет)"
fi
javac -nowarn -Xlint:-options -d "$B/signer" -cp "$C/apksig.jar" "$A/signer/Sign.java"
mkdir -p "$ROOT/dist"
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED -cp "$B/signer:$C/apksig.jar" Sign "$KS" "$KSPASS" war "$B/base.apk" "$ROOT/dist/war-kings.apk"
echo "Готово: dist/war-kings.apk ($(du -h "$ROOT/dist/war-kings.apk" | cut -f1)), адрес игры $URL, версия $VERSION_NAME ($VERSION_CODE)"
