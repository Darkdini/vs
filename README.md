# Средневековье — браузерная стратегия

Средневековая стратегия для телефона: замок и земли, карта мира с провинциями, армии и генерал, альянсы, мировой босс,
руны и ковка снаряжения. Расы: Люди, Эльфы, Гномы, Орки. Играется в браузере (Chrome) и в приложении для Android.
Сайт игры: **https://middle-ages.ru**.

## Что где лежит

| Путь | Что там |
|---|---|
| `server/src/` | сервер игры на Node.js (без сторонних библиотек): `game.js` — замки, ресурсы, стройки, база; `army.js` — войска, генерал, бои, захват, функции зданий; `hero.js`, `runes.js` — снаряжение генерала, руны и ковка; `quests.js`, `boss.js`, `battlerank.js`, `ally.js`, `market.js`, `admin.js`, `tg*.js` (Telegram) и др.; `web.js` — сайт и WebSocket |
| `server/test/` | проверки: `royal.js` — правила игры, `web-smoke.js` — страница и протокол WebSocket, `net-guard.js` — защита сервера, `fuzz.js` — мусорные и злонамеренные запросы, `sim.js` — боты играют несколько игровых дней |
| `web/` | клиент: `index.html`, скрипты окон, `style.css`, графика `gfx/` и `gfx3d/`, звуки `sound/`, значки |
| `data/units.json` | баланс юнитов (собирает `tools/gen_units.py`) |
| `deploy/` | сервер игры (VPS): установка, обновление, админ, домен, защита, копии базы, Telegram — см. [`deploy/README.txt`](deploy/README.txt) |
| `tools/` | сборка: `pack.sh` → `dist/game.zip`, `build-apk.sh` → `dist/war-kings.apk`, графика (`gfxpack.py`, `webp.py`, `icons.py`) |
| `dist/` | готовое: `game.zip` — игра для сервера, `war-kings.apk` — приложение для Android |

## Обновить игру на сервере

```
ssh root@IP_сервера
war-update https://raw.githubusercontent.com/Darkdini/vs/<версия>/dist/game.zip
```

База игроков (`/opt/war/game-data`) при обновлении не трогается, перед заменой делается её копия.
Репозиторий закрытый: `war-update` скачивает игру с токеном GitHub (команда `war-token`) или пока репозиторий открыт.
Остальное — установка на новый сервер, логин админа, домен, копии базы, Telegram — в [`deploy/README.txt`](deploy/README.txt).

## Проверка и сборка

```bash
cd server && npm test     # все 5 проверок
sh tools/pack.sh          # dist/game.zip: клиент склеен и сжат, картинки зашифрованы, сервер из пакета проверяется запуском
sh tools/build-apk.sh     # dist/war-kings.apk на https://middle-ages.ru (нужны java 17+, curl, python3)
```

## Запуск на своём компьютере

```bash
cd server && ADMIN_PASS=свой_пароль npm start     # http://localhost:8080, вход: admin / свой_пароль
```

Админ-панель: Меню → Кабинет → Админка. На сервере у админа секретный логин (`deploy/admin.sh`), под `admin` войти нельзя.

| Настройка | По умолчанию | Смысл |
|---|---|---|
| `WEB_PORT` / `PORT`, `HOST` | 8080, 0.0.0.0 | порт и адрес сервера |
| `DB` | `server/data/db.json` | файл базы; копии — в папке `backups` рядом с ним (при запуске и раз в час) |
| `ADMIN_LOGIN`, `ADMIN_PASS`, `ADMIN_RESET` | — | секретный логин и пароль админа; `ADMIN_RESET=1` — пароль из настроек применяется при запуске |
| `TRUST_PROXY` | — | `1` — сервер за прокси (Caddy): IP игрока берётся из заголовков прокси |
| `SPEED`, `RES_SPEED` | 1 | ускорение мира и добычи (для проверок) |
| `TRAIN_DAY` | 400 | сколько воинов можно обучить в одном замке за сутки |
| `NEWBIE_DAYS` | 3 | дней защиты новичка |
| `WORLD_SIZE` | 1000 | сторона карты мира в клетках |
| `SHOP_OPEN`, `NICK_PRICE` | —, 100 | `1` — «Лавка Короля» открыта всем; цена смены ника в золоте |
| `TG_AUTH_TOKEN`, `TG_BACKUP_TOKEN`, `TG_API` | — | боты Telegram (восстановление пароля, звёзды, копии базы) и посредник для Telegram |
| `ADMIN_FULL` | — | `1` — админ на полной прокачке (для автотестов) |
