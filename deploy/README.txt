Средневековье — браузерная игра

Запуск (Termux):  sh ~/game/start.sh
Открыть в Chrome: http://127.0.0.1:8080  (быстрее, чем localhost)
База игроков: ~/game-data (не удаляется при обновлении игры)
Секретный логин и пароль админа:  sh ~/game/admin.sh   (хранятся в ~/game-data/admin.env, потом перезапуск start.sh)
  В игре админ виден как «admin», войти можно только под секретным логином.
Свои настройки сервера: строки ИМЯ=значение в ~/game-data/game.env (например TRUST_PROXY=1, WEB_PORT=8080)
Остановить: Ctrl+C

Обновление без потери игроков:   sh ~/game/update.sh
Вернуть прежнюю версию:          sh ~/game/rollback.sh
Резервные копии базы:            sh ~/game/restore.sh   (автоматически: при запуске и каждый час, ~/game-data/backups)
За Cloudflare Tunnel / nginx добавьте TRUST_PROXY=1 в ~/game-data/game.env (иначе все игроки будут с одного адреса 127.0.0.1)
Если весь трафик идёт только через Cloudflare (проксирование включено, прямого доступа к серверу нет) — можно TRUST_PROXY=cf: тогда IP берётся из CF-Connecting-IP. Без этого условия заголовок подделывается — оставляйте TRUST_PROXY=1.
Cloudflare Tunnel в Termux:  pkg install cloudflared
  проверка без домена:  cloudflared tunnel --url http://127.0.0.1:8080   (выдаст адрес *.trycloudflare.com)

=== Защита сервера (VPS) ===
1) fail2ban + фаервол:   sh /opt/war/game/harden.sh
   • 5 неверных паролей SSH за 10 минут — IP в бан на сутки (кто попадается снова — до недели);
   • фаервол: открыты только SSH, 80 и 443, всё остальное закрыто.
   Проверка: sh /opt/war/game/harden.sh status

2) Вход по ключу (пароль SSH больше не подобрать):
   Termius (телефон): Keychain → «+» → Generate Key (тип ED25519) → открыть ключ → Export to host → выбрать сервер.
   Termux (Android):  pkg install openssh;  ssh-keygen -t ed25519  (Enter на все вопросы);  ssh-copy-id root@IP_сервера
   Компьютер:         ssh-keygen -t ed25519;  ssh-copy-id root@IP_сервера
   Проверьте в НОВОМ окне, что вход идёт без пароля. Только потом:  sh /opt/war/game/harden.sh nopass
   Старое окно не закрывайте, пока не убедитесь. Ключ берегите: потеряли телефон — вход через консоль в панели хостинга
   (там выполнить: rm /etc/ssh/sshd_config.d/00-war.conf && systemctl reload ssh — пароль снова заработает).

=== Копия базы в Telegram ===
1) В Telegram: @BotFather → /newbot → получите токен. Откройте своего бота → «Старт».
2) На сервере:  sh /opt/war/game/tgbackup.sh   (спросит токен и пароль шифрования — пароль ЗАПИШИТЕ отдельно)
   Раз в сутки (около 4:00 по времени сервера) база приходит файлом в чат с ботом. Вручную: Админ-панель → 🔒 Защита.
   Восстановить (в т. ч. на новом сервере после install-vps.sh и tgbackup.sh): перешлите файл копии боту,
   затем  sh /opt/war/game/tgbackup.sh restore
   Выключить:  sh /opt/war/game/tgbackup.sh off

=== Восстановление пароля через Telegram ===
1) В Telegram: @BotFather → /newbot — ОТДЕЛЬНЫЙ бот для игроков (не тот, что шлёт копии базы).
2) На сервере:  sh /opt/war/game/tgauth.sh   (спросит токен)
   Игроки: Кабинет → Профиль → «Привязать Telegram» → в боте «Старт».
   Забыли пароль: в окне входа «Забыли пароль?» → логин → бот присылает код (15 минут) → код + новый пароль.
   Сам пароль бот не присылает — его нигде нет в открытом виде. Все прежние входы после смены завершаются.
   Выключить:  sh /opt/war/game/tgauth.sh off
