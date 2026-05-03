# Self-hosted deployment (Docker + Traefik + Cloudflare)

Ця інструкція описує деплой backend на власний сервер з Traefik і Cloudflare DNS.
Заміняє попередній Render setup, який задокументовано в [render-backend.md](render-backend.md).

## Архітектура

```
Cloudflare (proxy ON, Full strict)
      ↓
Traefik (entrypoint: websecure, certresolver: letsencrypt)
      ↓ proxy network
poster-shipday-bridge-app  (Node 20, port 8787)
      ↓ default network
poster-shipday-bridge-postgres  (Postgres 16)
      ↓ named volume
poster-shipday-bridge-pgdata
```

- App у двох мережах: `proxy` (зовнішня, з Traefik) + `default` (внутрішня compose, до Postgres)
- Postgres тільки у `default` — назовні не висовується
- Часова зона `Europe/Kyiv` встановлена і в Node, і в Postgres (`PGTZ`)
- Автоматичний healthcheck через `/health`
- `restart: unless-stopped` для обох сервісів

## Файли деплойменту

| Файл | Призначення |
|---|---|
| [Dockerfile](../Dockerfile) | Multi-stage build на `node:20.14.0-alpine`, non-root, healthcheck |
| [.dockerignore](../.dockerignore) | Виключає frontend (`src/`, `bundle.js`), `.env`, docs, tests з image |
| [docker-compose.yml](../docker-compose.yml) | App + Postgres з Traefik labels |
| [.env.example](../.env.example) | Шаблон env-змінних |

## Передумови на сервері

- Docker + Docker Compose v2
- Працює Traefik з:
  - external network (за замовчуванням `proxy`)
  - entrypoint на 443 (за замовчуванням `websecure`)
  - certresolver (за замовчуванням `letsencrypt`) АБО Cloudflare Origin Certificate
- Cloudflare DNS-запис `mamamia.workflo.space → IP сервера`, proxy ON
- Cloudflare SSL/TLS mode: **Full (strict)**

## Швидкий старт

```bash
# 1. Клонувати репо на сервер
git clone <repo-url> /opt/poster-shipday-bridge
cd /opt/poster-shipday-bridge

# 2. Підготувати .env
cp .env.example .env
nano .env  # заповнити POSTGRES_PASSWORD, SETTINGS_ENCRYPTION_SECRET, всі POSTER_*, TURBOSMS_*, SHIPDAY_WEBHOOK_TOKEN

# 3. Підняти стек
docker compose up -d --build

# 4. Перевірити логи
docker compose logs -f app
# Має зʼявитись: [server] Poster Shipday Bridge listening on http://0.0.0.0:8787

# 5. Перевірити health
curl https://mamamia.workflo.space/health | jq
```

## Генерація секретів

```bash
# SETTINGS_ENCRYPTION_SECRET (256 біт) — НЕ змінювати після першого запуску
openssl rand -hex 32

# POSTGRES_PASSWORD
openssl rand -hex 24
```

## Env-змінні

Повний список — у [.env.example](../.env.example). Зведена таблиця:

### Compose / Traefik

| Змінна | Дефолт | Опис |
|---|---|---|
| `APP_NAME` | `poster-shipday-bridge` | Префікс container_name, traefik router name, volume |
| `APP_DOMAIN` | `mamamia.workflo.space` | Публічний домен. Використовується в Traefik Host() rule і `BACKEND_PUBLIC_URL` |
| `TZ` | `Europe/Kyiv` | Часова зона контейнерів |
| `TRAEFIK_NETWORK` | `proxy` | External Docker network з Traefik |
| `TRAEFIK_ENTRYPOINT` | `websecure` | Назва entrypoint у Traefik |
| `TRAEFIK_TLS` | `true` | Чи активувати TLS |
| `TRAEFIK_CERTRESOLVER` | `letsencrypt` | Назва certresolver у Traefik |

### PostgreSQL

| Змінна | Опис |
|---|---|
| `POSTGRES_USER` | Користувач БД |
| `POSTGRES_PASSWORD` | Пароль (згенерувати через `openssl rand -hex 24`) |
| `POSTGRES_DB` | Назва БД |

`DATABASE_URL` і `DATABASE_SSL_MODE` формуються автоматично в compose з `POSTGRES_*`.

### App runtime

| Змінна | Опис |
|---|---|
| `POSTER_APPLICATION_ID` | З Poster Developer Dashboard |
| `POSTER_APPLICATION_SECRET` | З Poster Developer Dashboard |
| `SETTINGS_ENCRYPTION_SECRET` | Шифрує Shipday API keys у БД. **Не змінювати після першого запуску** |
| `TURBOSMS_TOKEN` | З turbosms.ua → API → Ключ доступу |
| `TURBOSMS_SENDER` | Затверджене імʼя відправника (≤11 символів) |
| `TURBOSMS_MOCK_MODE` | `false` для production |
| `SHIPDAY_WEBHOOK_TOKEN` | Має збігатись зі Shipday Dashboard → Integrations → Webhook → Token |

### Що НЕ потрібно в env

- **`SHIPDAY_API_KEY`** — задається per-spot через settings page, шифрується і зберігається в `poster_account_settings.shipday`
- **`SHIPDAY_PICKUP_*`** — pickup-адреси задаються per-spot через settings page (`poster_account_settings.pickup_mappings`)
- **`SHIPDAY_MOCK_MODE`** — теж per-spot
- Решта (`POSTER_*_PATH`, `*_TIMEOUT_MS`, `SHIPDAY_API_BASE_URL` тощо) мають sane defaults у [server/config.mjs](../server/config.mjs)

## Postgres схема

Створюється автоматично при старті app через `ensureStorageTables()` ([server/lib/postgres.mjs](../server/lib/postgres.mjs)):

- `poster_installations` — OAuth tokens per-account
- `poster_account_settings` — per-spot конфіги (Shipday key, pickup mappings, default spot) — **дані шифруються через `SETTINGS_ENCRYPTION_SECRET`**
- `order_log` — журнал відправок у Shipday + dedup. Унікальний індекс `order_log_live_unique_idx` запобігає дублюванню live-замовлень

## Конфігурація зовнішніх систем

Після підняття backend оновити URL у трьох місцях:

### 1. Poster Developer Dashboard

Для застосунку (`POSTER_APPLICATION_ID=4791`):

- **Сторінка підключення**: `https://mamamia.workflo.space/poster/connect`
- **oAuth redirect URI**: `https://mamamia.workflo.space/poster/auth/callback`

### 2. Shipday Dashboard

`Integrations → Webhook`:

- **URL**: `https://mamamia.workflo.space/webhooks/shipday`
- **Token**: значення `SHIPDAY_WEBHOOK_TOKEN` з `.env`

### 3. POS bundle (з локальної машини, не з сервера)

Frontend bundle вшиває backend URL під час збірки і заливається в Poster:

```bash
export POSTER_BACKEND_BASE_URL=https://mamamia.workflo.space
npm run deploy
```

## Підключення кожної точки

Backend multi-tenant — кожна точка налаштовується окремо через settings page:

1. У Poster admin цієї точки → Маркет → твій застосунок → "Підключити"
2. Пройти OAuth (буде redirect на backend → settings page)
3. На settings page заповнити:
   - Shipday API key (один на акаунт Shipday — спільний для всіх точок)
   - Default Poster spot
   - Pickup mappings (адреса, телефон, координати) для цієї точки
4. Save
5. Тестове замовлення в касі → перевірити що пішло в Shipday + SMS прийшла

### Якщо OAuth не стартує автоматично

Якщо в Poster admin клік "Підключити" приводить тебе одразу на `/poster/auth/callback`
з помилкою OAuth — відкрий вручну у новому вікні браузера:

```
https://mamamia.workflo.space/poster/connect?account=<account>
```

Натисни "Продовжити підключення" — це ініціює OAuth з cookie-сесією і приведе на settings page
після успіху. Цей шлях треба використовувати для кожної точки на старті (поки в БД немає installation).

## Poster OAuth flow

Backend multi-step:

1. `GET /poster/connect?account=<acc>` — рендерить сторінку з кнопкою "Продовжити"
2. `GET /poster/oauth/start?account=<acc>` — встановлює HttpOnly+Signed cookie
   `poster_shipday_oauth_state` (містить nonce та account, TTL 10 хв) і робить redirect на
   `https://<acc>.joinposter.com/api/auth?...&state=<nonce>`
3. Користувач логиниться у Poster і клікає "Дозволити"
4. Poster робить redirect на `https://mamamia.workflo.space/poster/auth/callback?code=X&account=Y`
   ⚠️ Poster **НЕ повертає** `state` параметр у callback (це особливість їхньої OAuth імплементації)
5. Backend перевіряє:
   - cookie існує і не expired (TTL 10 хв)
   - `account` у callback збігається з `account` у cookie payload
   - якщо state у URL раптом є — додатково звіряє з cookie nonce
6. Backend exchange `code` → `access_token` через Poster Web API
7. Token зберігається в `poster_installations` → redirect на settings page

### Чому не URL-state

Poster OAuth не передає `state` у callback навіть коли надсилається в authorization request.
Тому CSRF-захист працює через cookie-only валідацію: підписаний HttpOnly cookie прив'язує
весь OAuth flow до конкретної браузерної сесії, а звірка `account` запобігає підстановці
чужого callback. Це не слабше за state-параметр для нашого сценарію.

## Корисні команди

```bash
# Логи app
docker compose logs -f app

# Логи Postgres
docker compose logs -f postgres

# Перезапуск після оновлення коду
git pull
docker compose up -d --build

# Підключитись до Postgres
docker compose exec postgres psql -U poster_bridge -d poster_bridge

# Перевірити статус
docker compose ps
curl -s https://mamamia.workflo.space/health | jq

# Backup БД
docker compose exec -T postgres pg_dump -U poster_bridge poster_bridge | gzip > backup-$(date +%F).sql.gz

# Зупинити (без видалення даних)
docker compose stop

# Зупинити і видалити контейнери (volume залишається)
docker compose down

# ⚠️ Видалити ВСЕ включно з даними
docker compose down -v
```

## Що НЕ можна робити

- **Не змінювати `SETTINGS_ENCRYPTION_SECRET`** після першого запуску — всі збережені Shipday keys стануть нечитабельними
- **Не комітити `.env`** — у `.gitignore` він уже є
- **Не виставляти Postgres-порт назовні** — він тільки в `default` network, доступний лише з app
- **Не міняти `BACKEND_PUBLIC_URL`** без оновлення Poster Developer і POS bundle — OAuth redirect зламається
