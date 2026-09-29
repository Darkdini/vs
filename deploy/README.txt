Война Королей — браузерная игра

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
Cloudflare Tunnel в Termux:  pkg install cloudflared
  проверка без домена:  cloudflared tunnel --url http://127.0.0.1:8080   (выдаст адрес *.trycloudflare.com)
