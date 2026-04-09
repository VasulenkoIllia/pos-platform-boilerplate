# Render backend для Poster + Shipday

Цей репозиторій тепер містить не тільки POS bundle, а й мінімальний backend у `server/`, який можна підняти на Render.

## Що вже є

- `GET /health` для перевірки сервісу.
- `GET /poster/connect` для сторінки підключення в Poster.
- `GET /poster/oauth/start` для старту Poster OAuth.
- `GET /poster/auth/callback` для завершення OAuth і збереження токена Poster.
- `GET /poster/settings` для account-level налаштувань Shipday і mapping точок.
- `GET /api/poster/installations` для перевірки збережених інсталяцій.
- `GET /api/poster/settings/:account` для перевірки збережених account settings.
- `POST /api/shipday/orders` для відправки delivery order у Shipday.
- `GET /api/shipday/orders/:orderNumber` для діагностики.
- `POST /webhooks/shipday` як заготовка під майбутні вебхуки.

## Локальний запуск backend

```bash
cp .env.example .env
npm install
npm run dev:backend
```

За замовчуванням backend стартує на `http://localhost:8787`.

## Деплой на Render

1. Створи новий `Web Service` з цього репозиторію.
2. Render підхопить [render.yaml](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/render.yaml).
3. Заповни env зі [`.env.example`](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/.env.example).
4. Після першого деплою вкажи реальний `BACKEND_PUBLIC_URL`, наприклад:
   `https://poster-shipday-bridge.onrender.com`
5. Перезапусти деплой після оновлення env.

## Які env обовʼязкові

- `BACKEND_PUBLIC_URL`
- `POSTER_APPLICATION_ID`
- `POSTER_APPLICATION_SECRET`
- `SETTINGS_ENCRYPTION_SECRET`

`SHIPDAY_API_KEY` тепер не обовʼязковий як глобальний env. Основний сценарій: кожен клієнт зберігає свій Shipday API key на сторінці `/poster/settings` після OAuth.

## Як увімкнути persistent storage

Зараз backend уміє працювати у двох режимах:

- `file` fallback через `.data/*.json`
- `postgres`, якщо задано `DATABASE_URL`

Для стабільного продакшену потрібен саме Postgres. Достатньо додати:

- `DATABASE_URL`
- `DATABASE_SSL_MODE=require` або `disable`

Після цього backend сам створить таблиці:

- `poster_installations`
- `poster_account_settings`

і перестане втрачати інтеграції після redeploy на Render.

## Як ізольовані кілька магазинів

Схема вже multi-tenant:

- `poster_installations.account` — це primary key для OAuth інсталяції конкретного Poster акаунта
- `poster_account_settings.account` — це primary key для Shipday налаштувань цього ж акаунта
- `spotId` та pickup mapping зберігаються всередині налаштувань конкретного акаунта

Тобто:

- різні Poster акаунти не можуть перезаписати одне одного
- однакові `spotId` у різних акаунтів не конфліктують
- кожен клієнт має свій Shipday API key, свої точки й свій mapping

Для першого етапу цього достатньо. Якщо колись знадобляться складніші звіти або аудит відправок, можна винести `poster_spots` і `pickup_mappings` в окремі таблиці, але для стабільної роботи інтеграції це не обовʼязково.

## Що потрібно для стабільної роботи через базу

1. Створи Render Postgres і підключи його до web service.
2. Додай `DATABASE_URL` в env сервісу.
3. Якщо використовуєш Internal Database URL Render, лишай `DATABASE_SSL_MODE=disable`.
4. Якщо використовуєш External Database URL, став `DATABASE_SSL_MODE=require`.
5. Залиш `SETTINGS_ENCRYPTION_SECRET` сталим і не змінюй його після запуску, інакше зашифровані Shipday API keys доведеться вводити заново.
6. Після ввімкнення Postgres ще раз пройди `Під’єднати` і збережи Shipday settings, якщо старі дані були тільки у file-store.

Після цього redeploy більше не повинен скидати:

- Poster OAuth installation
- account-level Shipday API key
- synced Poster spots
- pickup mapping для точок

## Mock режим для Shipday

За замовчуванням у [render.yaml](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/render.yaml) увімкнено:

- `SHIPDAY_MOCK_MODE=true`

Поки реального `SHIPDAY_API_KEY` немає, backend:

- не дзвонить у Shipday API
- повертає тестову успішну відповідь
- дозволяє перевірити UI та повний flow прямо в касі Poster
- працює навіть без глобального `SHIPDAY_API_KEY`

## Як тепер працює універсальна конфігурація

1. Poster веде користувача на `connect` сторінку.
2. Backend робить Poster OAuth і зберігає access token акаунта.
3. Backend синхронізує `spots.getSpots`.
4. Користувач відкриває `/poster/settings?account=...`.
5. Там він:
   - вводить свій `Shipday API key`
   - вибирає default spot
   - за потреби додає override pickup fields для кожної точки
6. Після цього POS-кнопка `Shipday` працює в one-click режимі без ручного введення pickup адреси в касі.

## Що вписати в Poster Developer

Після деплою Render в налаштуваннях застосунку Poster задай:

- `oAuth redirect URI`:
  `https://your-service.onrender.com/poster/auth/callback`
- `Сторінка підключення`:
  `https://your-service.onrender.com/poster/connect`

`Webhook URL` для Poster поки можна лишити порожнім, якщо ми ще не синхронізуємо події назад у backend.

## Як зібрати POS bundle з Render URL

POS bundle читає backend URL під час збірки з env:

```bash
export POSTER_BACKEND_BASE_URL=https://your-service.onrender.com
npm run build
npm run deploy
```

Після цього healthcheck у POS popup буде стукатися вже в Render backend.

## Формат запиту на Shipday proxy

`POST /api/shipday/orders`

Тепер краще передавати обʼєкт виду:

```json
{
  "account": "mamamia-pizza",
  "poster": {
    "orderId": "12345",
    "spotId": "2",
    "serviceMode": "delivery"
  },
  "payload": {
    "orderNumber": "12345",
    "delivery": {
      "name": "Ім'я клієнта",
      "address": "вул. Прикладна 1"
    }
  }
}
```

`pickup` можна не передавати. Backend резолвить його сам:

1. з mapping для `poster.spotId`
2. або з `defaultSpotId`
3. або з єдиної synced точки
4. або з глобального env fallback, якщо він налаштований

## Поточне обмеження

Poster OAuth інсталяції та account settings зараз зберігаються у JSON-файли в `.data/`. Для першого етапу тестування цього достатньо, але для стабільного продакшену краще винести це в базу даних.
