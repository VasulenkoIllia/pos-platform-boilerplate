# Render backend для Poster + Shipday

Цей документ описує тільки setup/deploy частину. Повна архітектура і бізнес-flow зібрані в
[shipday-poster-integration.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/shipday-poster-integration.md).

## Що деплоїться на Render

На Render запускається backend із `server/`, який відповідає за:

- Poster OAuth
- settings page
- sync Poster spots
- Shipday proxy
- health/debug endpoints

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
- `SETTINGS_ENCRYPTION_SECRET`

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

## Що налаштовує клієнт після install

На settings page клієнт заповнює:

- `Shipday API key`
- `Auth mode`
- `Mock mode`
- `Default Poster spot`

Цього достатньо, щоб кнопка `Shipday` у касі працювала.
