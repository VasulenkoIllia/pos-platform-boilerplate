# Render backend для Poster + Shipday

Цей репозиторій тепер містить не тільки POS bundle, а й мінімальний backend у `server/`, який можна підняти на Render.

## Що вже є

- `GET /health` для перевірки сервісу.
- `GET /poster/connect` для сторінки підключення в Poster.
- `GET /poster/oauth/start` для старту Poster OAuth.
- `GET /poster/auth/callback` для завершення OAuth і збереження токена Poster.
- `GET /api/poster/installations` для перевірки збережених інсталяцій.
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
- `SHIPDAY_API_KEY`

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

Можна передати або чистий Shipday payload, або обʼєкт виду:

```json
{
  "payload": {
    "orderNumber": "12345",
    "pickup": {
      "name": "Mamamia Pizza",
      "address": "вул. Прикладна 10"
    },
    "delivery": {
      "name": "Ім'я клієнта",
      "address": "вул. Прикладна 1"
    }
  }
}
```

Якщо `pickup` не передати, backend спробує добудувати його з env:

- `SHIPDAY_PICKUP_NAME`
- `SHIPDAY_PICKUP_PHONE`
- `SHIPDAY_PICKUP_ADDRESS`
- `SHIPDAY_PICKUP_FORMATTED_ADDRESS`
- `SHIPDAY_PICKUP_LAT`
- `SHIPDAY_PICKUP_LNG`

## Поточне обмеження

Poster OAuth інсталяції зараз зберігаються у JSON-файл `.data/poster-installations.json`. Для першого етапу тестування цього достатньо, але для стабільного продакшену краще винести це в базу даних.
