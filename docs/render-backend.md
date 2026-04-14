# Render backend для Poster + Shipday

Цей документ описує тільки setup/deploy частину. Повна архітектура і бізнес-flow зібрані в
[shipday-poster-integration.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/shipday-poster-integration.md).

## Що деплоїться на Render

На Render запускається backend із `server/`, який відповідає за:

- Poster OAuth
- settings page
- sync Poster spots
- Shipday proxy
- fallback lookup scheduled delivery time через Poster Web API
- health/debug endpoints
- browser-session isolation для settings page

## Локальний запуск backend

```bash
cp .env.example .env
npm install
npm run dev:backend
```

За замовчуванням backend стартує на `http://localhost:8787`.

## Web Service на Render

1. Створи `Web Service` з цього репозиторію.
2. Render підхопить [render.yaml](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/render.yaml).
3. Після першого деплою дізнайся публічний URL сервісу.
4. Запиши його в `BACKEND_PUBLIC_URL`.

Приклад:

```text
https://poster-shipday-bridge.onrender.com
```

## Обовʼязкові env

- `BACKEND_PUBLIC_URL`
- `POSTER_APPLICATION_ID`
- `POSTER_APPLICATION_SECRET`
- `SETTINGS_ENCRYPTION_SECRET` — окремий секрет для шифрування Shipday API ключів. Не використовуй те саме значення що і `POSTER_APPLICATION_SECRET`. Не змінюй після першого запуску — інакше збережені ключі стануть нечитабельними.

## Опціональні env

- `SHIPDAY_WEBHOOK_TOKEN` — токен для верифікації вхідних Shipday webhook-ів. Встановлюється в Shipday Dashboard → Integrations → Webhook (max 32 символи). Якщо не задано — верифікація пропускається.

## Postgres

Для стабільної роботи потрібно використовувати Postgres.

### Що зробити

1. Створи Render Postgres.
2. Додай у web service:
   - `DATABASE_URL`
   - `DATABASE_SSL_MODE`

### Який SSL mode ставити

- `disable`, якщо використовуєш `Internal Database URL`
- `require`, якщо використовуєш `External Database URL`

### Як перевірити, що база підключилась

Відкрий:

- [https://poster-shipday-bridge.onrender.com/health](https://poster-shipday-bridge.onrender.com/health)

У відповіді має бути:

```json
"storage": {
  "driver": "postgres"
}
```

## Що важливо для стабільності

- не змінюй `SETTINGS_ENCRYPTION_SECRET` після запуску
- тримай web service і Postgres в одному регіоні
- після увімкнення Postgres ще раз пройди `Під’єднати`, якщо раніше дані були тільки у file-store
- після `git push` Render оновлює тільки backend; POS bundle треба переливати в Poster окремо через `npm run deploy`
- якщо мінялась логіка scheduled delivery, confirm popup або збір payload у POS, одного Render deploy недостатньо: потрібен і backend deploy, і новий `npm run deploy`

## Що вписати в Poster Developer

- `Сторінка підключення`:
  `https://your-service.onrender.com/poster/connect`
- `oAuth redirect URI`:
  `https://your-service.onrender.com/poster/auth/callback`

## Як задеплоїти POS bundle з Render backend URL

```bash
export POSTER_BACKEND_BASE_URL=https://your-service.onrender.com
npm run deploy
```

## Корисні endpoints

- `GET /health`
- `GET /api/poster/installations`
- `GET /api/poster/settings/:account`
- `POST /api/shipday/orders`
- `GET /api/shipday/orders/:orderNumber`
- `POST /webhooks/shipday` — Shipday webhook (вказати в Shipday Dashboard)

Важливо: `/api/poster/installations` і `/api/poster/settings/:account` тепер працюють тільки для акаунтів, які були підключені через Poster OAuth у поточному браузері. Це не публічні multi-tenant debug endpoints.

## Що налаштовує клієнт після install

На settings page клієнт заповнює:

- `Shipday API key`
- `Auth mode`
- `Mock mode`
- `Default Poster spot`

Цього достатньо, щоб кнопка `Shipday` у касі працювала.

`Default Poster spot` потрібен тільки як fallback. Якщо backend зможе визначити реальну точку замовлення через POS `spotId` або Poster transaction lookup, саме вона піде в Shipday.

## Що перевірити після деплою

1. `GET /health` повертає `storage.driver = postgres`.
2. Settings page відкривається тільки для акаунтів, підключених через OAuth у поточному браузері.
3. Звичайне delivery order і preorder order успішно йдуть у Shipday.
4. У preorder Shipday показує реальний `Req. Delivery Time`, а не fallback `created at + 30 min`.
