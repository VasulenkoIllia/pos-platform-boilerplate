# Poster + Shipday Integration

Цей документ описує поточну робочу архітектуру інтеграції Poster POS з Shipday, що вже реалізована в цьому репозиторії.

## Що вже працює

- POS-кнопка `Shipday` у касі Poster.
- `one-click send` з екрана замовлення.
- fallback popup, якщо для відправки бракує клієнта, телефону або адреси.
- Poster OAuth connect flow.
- account-level settings page для кожного Poster акаунта.
- sync торгових точок Poster (`spots`).
- pickup fallback по точці Poster.
- збереження налаштувань у Postgres.
- live і mock режими для Shipday.

## Архітектура

Інтеграція складається з двох частин.

### 1. POS bundle

Фронтенд знаходиться в:

- [PosterBaseApp.jsx](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/src/js/components/PosterBaseApp.jsx)
- [bridge.js](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/src/js/poster/bridge.js)
- [shipdayBridge.js](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/src/js/services/shipdayBridge.js)

Що робить POS:

- реєструє кнопку `Shipday` у `functions` і `order`
- бере активне замовлення через Poster POS runtime
- дотягує повний order, клієнта та назви позицій
- збирає request до backend
- показує fallback popup тільки якщо не вистачає полів
- показує debug-відповідь від backend/Shipday

### 2. Backend

Backend знаходиться в:

- [server/index.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/index.mjs)
- [server/services/shipdayClient.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/services/shipdayClient.mjs)
- [server/services/posterAuth.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/services/posterAuth.mjs)
- [server/services/posterWebApi.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/services/posterWebApi.mjs)
- [server/services/accountSettings.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/services/accountSettings.mjs)

Що робить backend:

- проходить Poster OAuth
- зберігає installation для конкретного Poster акаунта
- зберігає Shipday settings для конкретного Poster акаунта
- синхронізує точки Poster
- визначає правильну pickup-точку
- нормалізує payload під офіційний формат Shipday
- відправляє `POST /orders` у Shipday

## Чому потрібен backend

Shipday API key не можна зберігати в POS bundle.

Тому:

- POS app не ходить напряму в Shipday
- POS app викликає тільки наш backend
- backend уже ходить у Poster Web API і Shipday API

## Поточний flow

### 1. Підключення акаунта

1. Користувач натискає `Під’єднати` в Poster.
2. Poster веде його на `GET /poster/connect`.
3. Backend запускає Poster OAuth.
4. Poster повертає користувача на `/poster/auth/callback`.
5. Backend зберігає Poster installation у базу.
6. Backend синхронізує список точок Poster.
7. Користувач потрапляє на `/poster/settings?account=...`.

### 2. Налаштування акаунта

На settings page користувач налаштовує тільки те, що реально потрібно:

- `Shipday API key`
- `Auth mode`
- `Mock mode`
- `Default Poster spot`

Backend автоматично:

- зберігає API key за цим акаунтом
- зберігає auth mode
- синхронізує точки Poster
- використовує адресу вибраної точки як pickup fallback

### 3. Відправка замовлення

1. Касир відкриває замовлення доставки.
2. Натискає кнопку `Shipday`.
3. POS bundle збирає дані замовлення.
4. Backend визначає акаунт і pickup spot.
5. Backend формує Shipday request за docs.
6. Backend відправляє `POST https://api.shipday.com/orders`.
7. У касі показується результат.

## Формат Shipday, який ми використовуємо

Інтеграція тепер орієнтується на офіційний endpoint:

- [Insert Delivery Order](https://docs.shipday.com/reference/insert-delivery-order)
- [Authentication](https://docs.shipday.com/reference/authentication)

### Авторизація

Для live Shipday використовується:

```http
Authorization: Basic <API_KEY>
```

Окремий login/token exchange не потрібен.

### Який payload шле backend

Backend нормалізує запит у flat-структуру на кшталт:

```json
{
  "orderNumber": "1775735542682",
  "customerName": "Test User",
  "customerAddress": "Berlin Test 1",
  "customerPhoneNumber": "+49123456789",
  "restaurantName": "Mamamia Pizza",
  "restaurantAddress": "52.625821, 13.502703, JGG3+83, 13125 Berlin",
  "pickupLatitude": 52.6257786,
  "pickupLongitude": 13.5026494,
  "totalOrderCost": 12.5,
  "deliveryInstruction": "debug",
  "orderSource": "Poster POS Service Bridge",
  "orderItem": [
    {
      "name": "Test item",
      "quantity": 1,
      "unitPrice": 12.5
    }
  ]
}
```

## Mapping Poster -> Shipday

Основний mapping зараз такий:

- `Poster order id` -> `orderNumber`
- `Poster client name` -> `customerName`
- `Poster client phone` -> `customerPhoneNumber`
- `Poster delivery address` -> `customerAddress`
- `Poster spot name` -> `restaurantName`
- `Poster spot address` -> `restaurantAddress`
- `Poster spot lat/lng` -> `pickupLatitude/pickupLongitude`
- `Poster items[]` -> `orderItem[]`
- `Poster totalSum/total/sum` -> `totalOrderCost`
- коментар доставки -> `deliveryInstruction`

## Дані по точках

Для мережі з кількома магазинами інтеграція вже multi-tenant і multi-spot.

Що це означає:

- кожен Poster акаунт має окремі installation і settings
- у кожного акаунта свій Shipday API key
- у кожного акаунта свій список Poster spots
- кожне замовлення намагається взяти `spotId` із контексту POS
- якщо `spotId` не прийшов, backend бере `defaultSpotId`

## Зберігання даних

Робочий режим зараз:

- `Postgres`

Таблиці:

- `poster_installations`
- `poster_account_settings`

Що зберігається:

- Poster installation по акаунту
- Shipday settings по акаунту
- synced Poster spots
- `defaultSpotId`
- pickup mappings

Shipday API key зберігається зашифрованим.

## Що налаштовується в Render

Мінімально потрібні env:

- `BACKEND_PUBLIC_URL`
- `POSTER_APPLICATION_ID`
- `POSTER_APPLICATION_SECRET`
- `SETTINGS_ENCRYPTION_SECRET`
- `DATABASE_URL`
- `DATABASE_SSL_MODE`

Postgres уже підтримується кодом через:

- [storage.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/storage.mjs)
- [postgres.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgres.mjs)
- [postgresInstallationsStore.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgresInstallationsStore.mjs)
- [postgresAccountSettingsStore.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgresAccountSettingsStore.mjs)

## Що налаштовується в Poster Developer

У налаштуваннях застосунку Poster треба вказати:

- `Сторінка підключення`:
  `https://your-service.onrender.com/poster/connect`
- `oAuth redirect URI`:
  `https://your-service.onrender.com/poster/auth/callback`

POS Platform має бути увімкнена.

## Як тестувати в касі

### Live test

1. Створи або відкрий замовлення типу `Доставка`.
2. Переконайся, що в замовленні є:
   - клієнт
   - телефон
   - адреса доставки
   - позиції
3. Натисни `Shipday`.

Очікувана поведінка:

- якщо даних достатньо, popup не потрібен або відкриється тільки з результатом
- backend відправляє live request у Shipday
- у Shipday з’являється order

### Fallback test

Якщо не вистачає:

- імені клієнта
- телефону
- адреси доставки

POS відкриє popup і попросить дозаповнити поля вручну.

## Діагностика

### Healthcheck

`GET /health`

Дозволяє перевірити:

- чи підключений Postgres
- скільки installation збережено
- скільки account settings збережено
- які акаунти зараз налаштовані

### Перевірка settings конкретного акаунта

`GET /api/poster/settings/:account`

Дає:

- чи збережений Shipday key
- який `authMode`
- чи вимкнений `mockMode`
- які точки Poster синхронізовані

### Debug у касі

У fallback popup є блок `Shipday debug`.

Там видно:

- `mode`
- `httpStatus`
- `reference`
- `resolvedConfig`
- `requestPayload`
- сирий `shipday` response

Це головний спосіб зрозуміти, що саме реально пішло в Shipday.

## Важлива правка, яка вже врахована

Було знайдено баг:

- POS інколи передавав хибний `account` hint
- backend через це йшов у mock fallback

Тепер backend перевіряє explicit account і, якщо він не існує, а підключений тільки один Poster акаунт, автоматично бере цей єдиний акаунт.

Тому для поточного інсталяційного сценарію `mamamia-pizza` більше не повинен випадково відправлятись у mock.

## Основні файли

POS:

- [PosterBaseApp.jsx](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/src/js/components/PosterBaseApp.jsx)
- [bridge.js](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/src/js/poster/bridge.js)
- [shipdayBridge.js](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/src/js/services/shipdayBridge.js)

Backend:

- [index.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/index.mjs)
- [shipdayClient.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/services/shipdayClient.mjs)
- [accountSettings.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/services/accountSettings.mjs)
- [posterAuth.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/services/posterAuth.mjs)
- [posterWebApi.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/services/posterWebApi.mjs)

Storage:

- [storage.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/storage.mjs)
- [postgres.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgres.mjs)
- [postgresAccountSettingsStore.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgresAccountSettingsStore.mjs)
- [postgresInstallationsStore.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgresInstallationsStore.mjs)
