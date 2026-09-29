#!/bin/sh
# Задать секретный логин и пароль админа. Хранятся в ~/game-data/admin.env (права 600), в код и репозиторий не попадают.
# В игре админ виден как «admin», а войти можно только под секретным логином.
# Запуск: sh ~/game/admin.sh   (потом перезапустите игру: sh ~/game/start.sh)
DATA="$HOME/game-data"; mkdir -p "$DATA"
printf 'Секретный логин админа: '; read -r L
stty -echo 2>/dev/null; printf 'Пароль (не отображается): '; read -r P1; printf '\nЕщё раз: '; read -r P2; stty echo 2>/dev/null; echo
[ -z "$L" ] || [ -z "$P1" ] && { echo 'Логин и пароль не могут быть пустыми.'; exit 1; }
[ "$P1" != "$P2" ] && { echo 'Пароли не совпадают.'; exit 1; }
[ ${#P1} -lt 12 ] && { echo 'Пароль слишком короткий — нужно от 12 символов.'; exit 1; }
case "$L$P1" in *\'*) echo 'Нельзя использовать символ одинарной кавычки.'; exit 1;; esac
umask 077
printf "ADMIN_LOGIN='%s'\nADMIN_PASS='%s'\n" "$L" "$P1" > "$DATA/admin.env"
chmod 600 "$DATA/admin.env"
echo "Сохранено в $DATA/admin.env. Перезапустите игру: sh ~/game/start.sh"
