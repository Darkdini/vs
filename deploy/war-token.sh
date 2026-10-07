#!/bin/sh
# war-token — сохранить токен GitHub для war-update (репозиторий закрытый).
# Токен вводится скрыто (не попадает в историю команд), хранится в /etc/war-github.token с правами 600 (только root).
# Нужен fine-grained токен: только репозиторий Darkdini/vs, право Contents: Read-only.
set -e
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
printf 'Вставьте токен GitHub и нажмите Enter (символы не видны): '
stty -echo 2>/dev/null; read -r T; stty echo 2>/dev/null; echo
T=$(printf %s "$T" | tr -d ' \r\n'); [ -n "$T" ] || { echo "Пусто — ничего не изменено"; exit 1; }
if curl -fsS -o /dev/null -H "Authorization: Bearer $T" https://api.github.com/repos/Darkdini/vs; then
  umask 077; printf %s "$T" > /etc/war-github.token; chmod 600 /etc/war-github.token
  echo "✓ Токен работает и сохранён. Обновлять как раньше: war-update"
else echo "✗ GitHub не принял токен (нет доступа к Darkdini/vs или неверный) — ничего не изменено"; exit 1; fi
