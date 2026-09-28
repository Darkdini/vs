Война Королей — браузерная игра

Запуск (Termux):  sh ~/game/start.sh
Открыть в Chrome: http://localhost:8080
База игроков: ~/game-data (не удаляется при обновлении игры)
Админ: логин admin, пароль — в консоли при первом запуске и в ~/game-data/ADMIN_PASSWORD.txt
Сбросить пароль админа: ADMIN_PASS=новыйпароль ADMIN_RESET=1 sh ~/game/start.sh
Остановить: Ctrl+C

Обновление без потери игроков:   sh ~/game/update.sh
Вернуть прежнюю версию:          sh ~/game/rollback.sh
Резервные копии базы:            sh ~/game/restore.sh   (автоматически: при запуске и каждый час, ~/game-data/backups)
