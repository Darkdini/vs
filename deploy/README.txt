Война Королей — браузерная игра

Запуск (Termux):  sh ~/game/start.sh
Открыть в Chrome: http://127.0.0.1:8080  (быстрее, чем localhost)
База игроков: ~/game-data (не удаляется при обновлении игры)
Админ (тестовый режим): логин admin, пароль 123456789 — задаётся в start.sh, перед хостом убрать
Сбросить пароль админа: ADMIN_PASS=новыйпароль ADMIN_RESET=1 sh ~/game/start.sh
Остановить: Ctrl+C

Обновление без потери игроков:   sh ~/game/update.sh
Вернуть прежнюю версию:          sh ~/game/rollback.sh
Резервные копии базы:            sh ~/game/restore.sh   (автоматически: при запуске и каждый час, ~/game-data/backups)
За Cloudflare Tunnel / nginx запускайте с TRUST_PROXY=1 (иначе все игроки будут с одного адреса 127.0.0.1)
