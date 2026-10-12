#!/bin/sh
# Задать или сменить секретный логин и пароль админа. Хранятся в /opt/war/game-data/admin.env (права 600),
# в код и репозиторий не попадают. В игре админ виден как «admin», а войти можно только под секретным логином.
# На сервере, от root:  sh /opt/war/game/admin.sh   — сохранит и сам перезапустит игру; прежний пароль перестанет подходить.
# Забыли пароль админа — выполните эту команду ещё раз.
[ -d /opt/war ] && DATA=/opt/war/game-data || DATA="$HOME/game-data"
mkdir -p "$DATA"
printf 'Секретный логин админа: '; read -r L
stty -echo 2>/dev/null; printf 'Пароль (не отображается): '; read -r P1; printf '\nЕщё раз: '; read -r P2; stty echo 2>/dev/null; echo
[ -z "$L" ] || [ -z "$P1" ] && { echo 'Логин и пароль не могут быть пустыми.'; exit 1; }
[ "$P1" != "$P2" ] && { echo 'Пароли не совпадают.'; exit 1; }
[ ${#P1} -lt 12 ] && { echo 'Пароль слишком короткий — нужно от 12 символов.'; exit 1; }
case "$L$P1" in *\'*) echo 'Нельзя использовать символ одинарной кавычки.'; exit 1;; esac
umask 077
printf "ADMIN_LOGIN='%s'\nADMIN_PASS='%s'\n" "$L" "$P1" > "$DATA/admin.env"
chmod 600 "$DATA/admin.env"
# служба war (VPS): файл — пользователю war, перезапуск применяет новый пароль (при первой установке службы ещё нет —
# install-vps.sh запустит игру сам)
if [ "$(id -u)" = 0 ] && systemctl list-unit-files 2>/dev/null | grep -q '^war\.service'; then
  chown war:war "$DATA/admin.env"
  if systemctl restart war; then echo "✓ Сохранено, игра перезапущена — входите под новым логином и паролем."
  else echo "Сохранено, но игра не перезапустилась. Смотрите: journalctl -u war -n 50"; exit 1; fi
else echo "Сохранено в $DATA/admin.env. Новый пароль применится при следующем запуске сервера игры."; fi
