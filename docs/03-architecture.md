# 03. Архитектура клиент-сервер (браузерная игра)

## 1. Рекомендуемый стек

| Слой | Выбор | Почему |
|---|---|---|
| Язык | **TypeScript** везде | Общие типы и формулы для клиента и сервера |
| Сервер API | Node.js + **Fastify** (или NestJS для большой команды) | Быстрый, простой, хорошие схемы валидации |
| Realtime | **WebSocket** (`ws` / socket.io) | Входящие атаки, завершение очередей, чат |
| БД | **PostgreSQL 16** | Транзакции и блокировки строк — критично для боёв и торговли |
| Кэш / pub-sub | **Redis** | Сессии, rate-limit, рассылка событий между инстансами, лидерборды (sorted sets) |
| Воркер событий | Отдельный Node-процесс | Обрабатывает таймеры (стройка, прибытие армий) |
| Клиент | **React + Vite**, **PixiJS** для карты мира и слоя «Земли» | Лёгкий DOM-интерфейс + быстрый канвас для карты |
| Хранилище картинок | S3-совместимое + CDN | Спрайты, гербы, аватары |
| Инфраструктура | Docker Compose → Kubernetes позже | |

```
/apps
  /server      Fastify API + WebSocket-шлюз
  /worker      обработчик событий (таймеров)
  /web         React-клиент
/packages
  /rules       формулы игры (чистые функции) + загрузка data/*.json
  /shared      типы DTO, коды ошибок, схемы (zod)
/data          buildings.json, units.json (баланс)
/docs
```

**Главное правило:** `packages/rules` — чистые детерминированные функции (стоимость уровня, производство, бой). Сервер использует их как истину, клиент — для предпросмотра («сколько стоит», «симулятор боя»).

## 2. Модель времени: ленивый расчёт + очередь событий

В браузерных стратегиях **нет глобального «тика»**. Состояние хранится снимками, а будущее — событиями.

### 2.1 Ресурсы
```ts
// packages/rules/resources.ts
export function resourcesAt(c: CastleSnapshot, now: number): Resources {
  const dtH = (now - c.resUpdatedAt) / 3_600_000;
  return mapRes(r => clamp(c.res[r] + c.rate[r] * dtH, 0, c.capacity[r]));
}
```
Любая операция с замком: `materialize(castle, now)` → изменить → сохранить новый снимок и новый `rate`.

### 2.2 События
Таблица `events(id, due_at, type, castle_id, payload)`. Типы: `BUILD_DONE`, `TRAIN_UNIT_DONE`, `RESEARCH_DONE`, `MOVEMENT_ARRIVE`, `MOVEMENT_RETURN`, `STARVATION`, `LOYALTY_RIOT`, `FESTIVAL_END`, `EXPEDITION_DIG_DONE`, `AUCTION_END`, `CASTLE_SALE_COMPLETE`, `PREMIUM_EXPIRE`.

Воркер:
```sql
BEGIN;
SELECT * FROM events
 WHERE due_at <= now()
 ORDER BY due_at, id
 LIMIT 100
 FOR UPDATE SKIP LOCKED;
-- для каждого события: блокируем затронутые замки (SELECT ... FOR UPDATE, в порядке id — без дедлоков),
-- materialize(замок, event.due_at), применяем, пишем отчёты, удаляем событие
COMMIT;
```

**Порядок важен.** Если игрок открывает замок, а у него есть просроченные, но ещё не обработанные события (воркер отстаёт) — API сначала обрабатывает их синхронно (`catchUp(castleId, now)`), в порядке `due_at`. Так атака, пришедшая в 12:00:00, увидит склад, достроенный в 11:59:59.

Тренировка: вместо события на каждого юнита храним `train_queue(started_at, per_unit_sec, count, done)`; сколько вышло — считается лениво, событие ставится только на конец партии.

## 3. Схема БД (ядро)

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY, email CITEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(), banned_until TIMESTAMPTZ, totp_secret TEXT
);

CREATE TABLE worlds (id SMALLSERIAL PRIMARY KEY, name TEXT, speed REAL DEFAULT 1,
  radius INT DEFAULT 200, started_at TIMESTAMPTZ, config JSONB);

CREATE TABLE players (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users, world_id SMALLINT REFERENCES worlds,
  nick TEXT NOT NULL, race TEXT NOT NULL CHECK (race IN ('humans','elves','dwarves','orcs')),
  gold INT NOT NULL DEFAULT 0, premium_until TIMESTAMPTZ, protection_until TIMESTAMPTZ,
  vacation_until TIMESTAMPTZ, culture_points BIGINT DEFAULT 0, population INT DEFAULT 0,
  alliance_id BIGINT, alliance_role_bits INT DEFAULT 0, about1 TEXT, about2 TEXT,
  avatar TEXT, last_active_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (world_id, nick)
);

CREATE TABLE map_tiles (
  world_id SMALLINT, x SMALLINT, y SMALLINT,
  kind TEXT NOT NULL,              -- empty | castle | oasis | ruins | npc_camp
  terrain_layout JSONB,            -- для empty: какие 24 клетки земель будут у замка
  castle_id BIGINT, oasis_type TEXT, owner_castle_id BIGINT, meta JSONB,
  PRIMARY KEY (world_id, x, y)
);

CREATE TABLE castles (
  id BIGSERIAL PRIMARY KEY, world_id SMALLINT, owner_id BIGINT REFERENCES players,
  name TEXT, x SMALLINT, y SMALLINT, is_capital BOOL DEFAULT false, race TEXT NOT NULL,
  res JSONB NOT NULL,              -- {"food":..,"wood":..,"stone":..,"iron":..}
  rate JSONB NOT NULL, capacity JSONB NOT NULL, res_updated_at TIMESTAMPTZ NOT NULL,
  loyalty REAL DEFAULT 100, loyalty_updated_at TIMESTAMPTZ,
  population INT DEFAULT 0, pop_cap INT DEFAULT 0,
  version INT DEFAULT 0            -- оптимистическая блокировка для API
);

CREATE TABLE buildings (
  castle_id BIGINT REFERENCES castles ON DELETE CASCADE,
  layer TEXT CHECK (layer IN ('castle','lands')), slot SMALLINT,
  type TEXT NOT NULL, level SMALLINT NOT NULL DEFAULT 0,
  terrain TEXT,                    -- для lands: grass|forest|stone|iron
  PRIMARY KEY (castle_id, layer, slot)
);

CREATE TABLE build_queue (
  id BIGSERIAL PRIMARY KEY, castle_id BIGINT, layer TEXT, slot SMALLINT, type TEXT,
  to_level SMALLINT, started_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, cost JSONB
);

CREATE TABLE train_queue (
  id BIGSERIAL PRIMARY KEY, castle_id BIGINT, building TEXT, unit TEXT,
  count INT, done INT DEFAULT 0, per_unit_ms INT, started_at TIMESTAMPTZ
);

CREATE TABLE research (castle_id BIGINT, unit TEXT, smithy_level SMALLINT DEFAULT 0,
  researched BOOL DEFAULT false, PRIMARY KEY (castle_id, unit));

-- войска, стоящие в замке (свои и чужие подкрепления)
CREATE TABLE garrisons (
  castle_id BIGINT, owner_player_id BIGINT, home_castle_id BIGINT,
  units JSONB NOT NULL,            -- {"dwarves.atk_inf": 120, ...}
  PRIMARY KEY (castle_id, home_castle_id)
);

CREATE TABLE movements (
  id BIGSERIAL PRIMARY KEY, world_id SMALLINT, player_id BIGINT,
  from_castle_id BIGINT, to_x SMALLINT, to_y SMALLINT, to_castle_id BIGINT,
  mission TEXT NOT NULL,           -- scout|raid|attack|reinforce|settle|oasis|expedition|trade|return
  units JSONB, cargo JSONB, targets JSONB, general BOOL DEFAULT false,
  depart_at TIMESTAMPTZ, arrive_at TIMESTAMPTZ, state TEXT DEFAULT 'outgoing'
);
CREATE INDEX ON movements (to_castle_id, arrive_at);

CREATE TABLE events (id BIGSERIAL PRIMARY KEY, due_at TIMESTAMPTZ NOT NULL, type TEXT NOT NULL,
  castle_id BIGINT, ref_id BIGINT, payload JSONB);
CREATE INDEX ON events (due_at);

CREATE TABLE reports (id BIGSERIAL PRIMARY KEY, player_id BIGINT, kind TEXT, created_at TIMESTAMPTZ,
  read BOOL DEFAULT false, share_token TEXT, body JSONB);
CREATE TABLE messages (id BIGSERIAL PRIMARY KEY, from_id BIGINT, to_id BIGINT, subject TEXT,
  body TEXT, created_at TIMESTAMPTZ, read BOOL, deleted_by_sender BOOL, deleted_by_recipient BOOL);

CREATE TABLE alliances (id BIGSERIAL PRIMARY KEY, world_id SMALLINT, tag TEXT, name TEXT,
  leader_id BIGINT, empire_id BIGINT, description TEXT, treasury JSONB, created_at TIMESTAMPTZ);
CREATE TABLE alliance_invites (alliance_id BIGINT, player_id BIGINT, created_at TIMESTAMPTZ,
  PRIMARY KEY (alliance_id, player_id));
CREATE TABLE alliance_relations (a_id BIGINT, b_id BIGINT, kind TEXT, -- ally|nap|war
  state TEXT, created_at TIMESTAMPTZ, PRIMARY KEY (a_id, b_id));
CREATE TABLE empires (id BIGSERIAL PRIMARY KEY, name TEXT, emperor_id BIGINT, tax_percent SMALLINT,
  treasury JSONB);

CREATE TABLE market_offers (id BIGSERIAL PRIMARY KEY, castle_id BIGINT, give_res TEXT, give_amount INT,
  want_res TEXT, want_amount INT, max_distance INT, alliance_only BOOL, created_at TIMESTAMPTZ);

CREATE TABLE artifacts (id BIGSERIAL PRIMARY KEY, world_id SMALLINT, kind TEXT, rarity TEXT,
  effect JSONB, owner_player_id BIGINT, castle_id BIGINT, active_from TIMESTAMPTZ);
CREATE TABLE auctions (id BIGSERIAL PRIMARY KEY, seller_id BIGINT, artifact_id BIGINT,
  start_price INT, best_bid INT, best_bidder_id BIGINT, ends_at TIMESTAMPTZ, state TEXT);
CREATE TABLE castle_sales (id BIGSERIAL PRIMARY KEY, castle_id BIGINT, seller_id BIGINT,
  buyer_id BIGINT, price_gold INT, price_res JSONB, state TEXT, complete_at TIMESTAMPTZ);

-- любая операция с золотом — только через журнал (аудит, возвраты)
CREATE TABLE gold_ledger (id BIGSERIAL PRIMARY KEY, player_id BIGINT, delta INT, reason TEXT,
  ref TEXT, created_at TIMESTAMPTZ DEFAULT now());
```

## 4. API (REST + WebSocket)

Все запросы — от имени сессии; тело валидируется zod-схемой из `packages/shared`.

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Аккаунт |
| POST | `/worlds/:id/join` `{nick, race, sector}` | Создать игрока и столицу |
| GET | `/me` | Игрок, золото, премиум, список замков, непрочитанное |
| GET | `/castles/:id` | Полное состояние (ресурсы на `now`, здания, очереди, гарнизон, входящие/исходящие) |
| POST | `/castles/:id/build` `{layer, slot, type}` | Поставить в очередь стройку/улучшение |
| DELETE | `/castles/:id/build/:qid` | Отмена |
| POST | `/castles/:id/demolish` `{slot}` | Снос |
| POST | `/castles/:id/train` `{unit, count}` | Тренировка |
| POST | `/castles/:id/research` `{unit}` / `/upgrade` | Академия / Кузница |
| POST | `/castles/:id/festival` `{kind}` | Праздник |
| GET | `/map?x=&y=&r=` | Кусок карты (чанки 20×20, кэш в Redis) |
| GET | `/tiles/:x/:y` | Детали клетки (владелец, альянс, оазис) |
| POST | `/castles/:id/send` `{mission, to:{x,y}, units, targets?, general?}` | Отправить армию |
| POST | `/movements/:id/cancel` | Отзыв в первые 90 с |
| POST | `/castles/:id/trade/send` `{to, res}` | Отправка торговцами |
| GET/POST/DELETE | `/market/offers` | Предложения рынка |
| POST | `/castles/:id/npc-exchange` `{res}` | Обмен за золото |
| GET/POST | `/auctions`, `/auctions/:id/bid` | Аукцион |
| GET/POST | `/alliances`, `/alliances/:id/invite`, `/…/members/:pid` | Альянс |
| GET | `/players/:id` | Публичный профиль |
| GET | `/ratings/:kind?page=` | Рейтинги |
| GET/POST | `/messages`, `/reports`, `/reports/:id/share` | Почта и отчёты |
| POST | `/shop/checkout` | Покупка золота (вебхук платёжки → `gold_ledger`) |
| POST | `/battle/simulate` | Симулятор боя (чистая функция из `rules`) |

**WebSocket** `wss://…/ws` — сервер пушит:
`castle.updated {castleId}`, `build.done`, `train.progress`, `movement.incoming {arriveAt, mission, units?}`, `report.new`, `message.new`, `alliance.alert`, `chat.message`. Клиент по `castle.updated` перезапрашивает `/castles/:id` (или применяет diff).

Все ответы содержат `serverTime`, клиент считает таймеры относительно него (не доверяет локальным часам).

## 5. Бой на сервере

```ts
// packages/rules/battle.ts — чистая функция, покрыта unit-тестами
export function resolveBattle(input: BattleInput): BattleResult
// input: армия атаки (юниты, уровни кузницы, генерал, артефакты), мисcия,
//        защитники (все гарнизоны), стена, раса защитника, население сторон, тайники, запасы
// result: потери по юнитам, победитель, добыча, урон стене/зданиям, изменение лояльности, отчёты
```
Обработка `MOVEMENT_ARRIVE`: заблокировать замок цели → `catchUp` → собрать гарнизоны → `resolveBattle` → применить изменения → создать движение `return` с выжившими и добычей → отчёты обеим сторонам → WS-уведомления. Всё в одной транзакции.

Случайность (лояльность от бунтарей, раскопки, выбор цели катапульт) — через seeded RNG от `movement.id`, чтобы бой можно было воспроизвести для разбора жалоб.

## 6. Клиент: экраны

1. **Вход / регистрация / выбор мира, расы, сектора.**
2. **Замок** — изометрическая сцена со слотами; клик по слоту → окно здания (уровень, эффект, стоимость следующего уровня, кнопка «Улучшить», таймер; для казармы — тренировка).
3. **Земли** — сетка 5×5 (PixiJS), цвет по местности, уровень на клетке.
4. **Мир** — карта с драг-н-дропом и зумом, подсветка альянсов/врагов, окно клетки (атаковать / разведать / отправить ресурсы / основать замок).
5. **Верхняя панель**: 4 ресурса (растут в реальном времени на клиенте по `rate`), вместимость, население, золото; **левая**: очереди стройки; **правая**: входящие/исходящие армии с таймерами.
6. **Сборный пункт** — отправка армии (выбор юнитов, миссии, целей катапульт, предпросмотр времени прибытия).
7. **Рынок, Аукцион, Альянс, Империя, Рейтинги, Профиль, Почта, Отчёты, Настройки, Магазин.**
8. **Симулятор боя** (офлайн, на `packages/rules`).

Мобильная вёрстка обязательна — оригинал был мобильной игрой.

## 7. Безопасность и анти-чит

- Сервер проверяет **всё**: наличие ресурсов на момент запроса, требования зданий, население, лимиты очередей, расстояния, защиту новичка/отпуск.
- Транзакции + `SELECT … FOR UPDATE` на замок; идемпотентные ключи на POST, чтобы двойной клик не списал дважды.
- Rate-limit по IP и аккаунту (Redis), капча на регистрации, детект ботов по равномерности действий.
- Детект мультиаккаунтов: общие IP/отпечатки устройств + анализ переливов ресурсов → очередь модерации.
- Золото меняется только через `gold_ledger` в транзакции; вебхуки платёжки проверяются подписью.
- Пароли — argon2id; сессии — httpOnly cookie; CSRF-токен.

## 8. Масштабирование

- Один мир на 20–50 тыс. игроков укладывается в один PostgreSQL + 2–4 инстанса API + 1–3 воркера (SKIP LOCKED позволяет параллелить).
- Разные миры — разные схемы/БД (шардирование по миру).
- Горячие чтения: карта (чанки в Redis, инвалидация по событию), рейтинги (пересчёт раз в 5–15 мин в Redis sorted set).
- Рост `events` и `reports`: партиционирование по времени, архивация отчётов старше 30 дней.

## 9. Тестирование

- `packages/rules`: unit-тесты на формулы (стоимость, производство, бой — включая пример из GDD §9.7), property-тесты (ресурсы не уходят в минус, потери ≤ армии).
- Интеграционные тесты воркера: «атака приходит в ту же секунду, что и достройка склада», «две атаки в одну секунду», «голод во время марша».
- Нагрузочный тест: 10 000 ботов-клиентов с k6 / artillery.

## 10. План разработки (ориентир)

| Спринт (2 нед.) | Результат |
|---|---|
| 1 | Монорепо, CI, БД-миграции, авторизация, `packages/rules` с загрузкой `data/*.json` |
| 2 | Создание игрока и столицы, ресурсы (ленивый расчёт), здания и очередь, воркер событий |
| 3 | Клиент: Замок, Земли, верхняя панель, таймеры, WebSocket |
| 4 | Юниты, тренировка, Академия/Кузница |
| 5 | Карта мира, марши, разведка/набег/атака, отчёты |
| 6 | Почта, профиль, рейтинг населения, защита новичка → **закрытая альфа** |
| 7–8 | Рынок, торговцы, альянсы, дипломатия, тревоги |
| 9–10 | Резиденция, лояльность, бунтари, поселенцы, осада, генерал, оазисы → **открытая бета** |
| 11+ | Артефакты, аукцион, империи, премиум, платежи |
