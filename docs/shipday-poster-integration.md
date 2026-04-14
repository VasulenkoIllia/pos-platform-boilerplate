# Poster + Shipday Integration

Цей документ описує поточну робочу архітектуру інтеграції Poster POS з Shipday, що вже реалізована в цьому репозиторії.

## Що вже працює

- POS-кнопка `Shipday` у касі Poster.
- confirm popup перед реальною відправкою з екрана замовлення.
- сервісний екран `Shipday` у `functions`.
- fallback popup, якщо для відправки бракує клієнта, телефону або адреси.
- Poster OAuth connect flow.
- account-level settings page для кожного Poster акаунта.
- sync торгових точок Poster (`spots`).
- pickup fallback по точці Poster.
- збереження налаштувань у Postgres.
- live і mock режими для Shipday.
- логування замовлень у `order_log` (`shipdayOrderId` / `orderNumber` → account).
- dedupe-захист live-відправки по `account + orderNumber`, щоб не створювати дублікати в Shipday.
- Shipday webhook endpoint з верифікацією token.
- browser-session ізоляція settings page: користувач бачить тільки ті Poster акаунти, які сам підключив у поточному браузері через OAuth.
- CSRF-захист Poster OAuth через `state`.

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
- витягує суму доставки з payload замовлення, якщо Poster її передав
- збирає request до backend, передаючи і видимий `orderNumber`, і lookup-id для Poster transaction
- з екрана `order` спочатку показує confirm popup з адресою доставки
- передає час доставки з Poster у Shipday, якщо Poster віддав `delivery.time`
- з меню `functions` відкриває сервісний екран, а не ручну форму відправки
- показує fallback popup тільки якщо не вистачає полів
- на будь-якій помилці order-flow відкриває popup з debug-відповіддю від backend/Shipday і переходом у settings

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
- визначає правильний Poster account для POS-запиту
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
3. Backend запускає Poster OAuth і генерує захищений `state`.
4. Poster повертає користувача на `/poster/auth/callback`.
5. Backend перевіряє `state`, зберігає Poster installation у базу і додає акаунт у browser-session.
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

Якщо у поточному браузері вже кілька Poster акаунтів, `/poster/settings` без `account` покаже chooser тільки для акаунтів цього браузера. Це не глобальний список усіх акаунтів із бази.

### 3. Відправка замовлення

1. Касир відкриває замовлення доставки.
2. Натискає кнопку `Shipday`.
3. POS bundle збирає дані замовлення.
4. Для `orderNumber` bundle спочатку бере реальні поля замовлення (`orderName`, `transactionNumber`, `orderNumber`), а DOM-підказку Poster використовує тільки як fallback.
5. Якщо для відправки вистачає обов'язкових полів, касир бачить confirm popup:
   `Ви точно хочете відправити замовлення за адресою?`
6. Після підтвердження backend визначає акаунт і pickup spot.
7. Backend формує Shipday request за docs.
8. Backend відправляє `POST https://api.shipday.com/orders`.
9. У касі показується результат.

### Захист від дублікатів Shipday

Для live mode backend не дозволяє повторно створити Shipday order з тим самим `orderNumber` у межах того самого Poster `account`.

Flow:

- після нормалізації payload backend перевіряє `order_log`
- на рівні Postgres діє partial unique index для live-записів `account + orderNumber` зі статусами `pending/sent`
- якщо вже є live-запис `pending` або `sent` для `account + orderNumber`, Shipday API не викликається
- backend повертає HTTP `409 Conflict` з `duplicate: true`
- якщо запису немає, backend створює `pending` перед викликом Shipday
- після підтвердження Shipday запис переходить у `sent`
- якщо Shipday повернув явну HTTP-помилку, запис переходить у `failed` і повтор можна зробити після виправлення даних

Якщо Shipday не дав явного підтвердження, backend робить контрольний `GET /orders/:orderNumber`.

- якщо Shipday уже бачить це замовлення, backend переводить запис у `sent`
- якщо lookup теж неоднозначний, запис лишається `pending`
- поки запис `pending`, повторний create-запит блокується

Це навмисно: при timeout/network error невідомо, чи Shipday не створив order на своєму боці, тому автоматичний повтор може створити дубль.

Mock mode не блокує live-відправку, бо mock не створює реальне замовлення в Shipday.

### Як backend визначає Poster account

Для `POST /api/shipday/orders` backend використовує не один сигнал, а пріоритетний ланцюжок:

1. lookup через Poster transaction по кількох lookup-кандидатах:
   `transactionId`, `orderId`, нормалізований `orderNumber`
2. визначення акаунта по Poster `spotId` або `spotName`, якщо transaction lookup не спрацював
3. account із `Origin/Referer` `*.joinposter.com`
4. явний `account hint` із POS request як слабкий fallback
5. єдина installation у backend як останній fallback

Це потрібно, щоб multi-tenant backend не відправив замовлення від чужого Poster акаунта через випадковий або підроблений hint.

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
  "deliveryFee": 2.5,
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

- `Poster orderName / transactionNumber / orderNumber` -> `orderNumber`
- `Poster client name` -> `customerName`
- `Poster client phone` -> `customerPhoneNumber`
- `Poster delivery address` -> `customerAddress`
- `Poster spot name` -> `restaurantName`
- `Poster spot address` -> `restaurantAddress`
- `Poster spot lat/lng` -> `pickupLatitude/pickupLongitude`
- `Poster items[]` -> `orderItem[]`
- `Poster totalSum/total/sum` -> `totalOrderCost`
- `Poster deliveryFee/delivery_fee/deliveryInfo.deliveryFee/...` -> `deliveryFee`
- `Poster delivery.time` -> `expectedDeliveryDate` + `expectedDeliveryTime`
- коментар доставки -> `deliveryInstruction`

### Delivery fee

В офіційній документації Poster для POS `Order` і Web `transactions.getTransactions` немає стабільного єдиного поля `deliveryFee`.
У різних сценаріях вартість доставки може прийти як окреме поле в runtime payload або в delivery/shipping-блоці.

Тому POS bundle зараз шукає delivery fee у таких кандидатах:

- `deliveryFee`, `delivery_fee`
- `deliveryPrice`, `delivery_price`
- `deliveryCost`, `delivery_cost`
- `deliverySum`, `delivery_sum`
- `shippingFee`, `shipping_fee`
- `shippingPrice`, `shipping_price`
- `shippingCost`, `shipping_cost`
- `courierFee`, `courier_fee`
- ті самі поля всередині `deliveryInfo`, `delivery_info`, `delivery`, `shipping`, `deliveryService`

Якщо значення знайдено, backend передає його в Shipday як `deliveryFee`.
Якщо Poster не передав такого поля, `deliveryFee` не додається в Shipday payload.

### Delivery time

Згідно з документацією Poster для доставки використовується поле `delivery.time` у форматі `YYYY-MM-DD hh:mm:ss`.

POS bundle зараз шукає час доставки в таких кандидатах:

- `delivery.time` — основне джерело за документацією Poster
- `deliveryTime`, `delivery_time`
- `requestedDeliveryTime`, `requested_delivery_time`
- `deliveryInfo.time`, `deliveryInfo.deliveryTime`

Якщо значення знайдено, bundle передає в backend:

- `expectedDeliveryDate`
- `expectedDeliveryTime`

Тобто Shipday отримує той самий час доставки, який уже був указаний у Poster, без довільного перерахунку ETA на нашому боці.

Нормалізація робить важливу відмінність:

- поля типу `deliveryFee`, `deliveryPrice`, `deliveryCost` трактуються як сума в основній валюті
- поля типу `deliverySum`, `deliveryAmount`, `shippingSum`, `amount`, `sum` можуть бути у minor units, тому scale береться з самого замовлення

Тобто інтеграція не ділить усі цілі числа на `100` всліпу.

### Чому Shipday може створити замовлення без товарів

Таке можливо, якщо Shipday приймає `POST /orders`, але `orderItem` відсутній або прийшов у форматі, який Shipday не розпізнав.
Щоб не створювати напівпорожні live-замовлення, backend тепер валідовує `orderItem` до виклику Shipday:

- якщо POS не передав `products/items`
- якщо всі позиції не мають назви і не мають `product_id/id`
- якщо ручний fallback `orderItem` порожній

backend поверне HTTP 400 і не викличе Shipday API.

Нормалізація позицій підтримує такі формати:

- назва: `name`, `productName`, `product_name`, `dishName`, `dish_name`, `fullName`, `title`
- fallback назви: `Product #<product_id>` / `Товар #<id>`, якщо є тільки ідентифікатор
- кількість: `quantity`, `count`, `num`, `qty`
- ціна за одиницю: `unitPrice`, `unit_price`, `price`
- fallback ціни: `productSum/product_sum/lineTotal/line_total/amount/sum/total` діляться на кількість
- якщо `price` виглядає як minor units, але `lineTotal` підтверджує scale `100`, bundle автоматично переводить `price` у major units перед відправкою в Shipday

У debug popup потрібно перевіряти:

- `requestPayload.orderItem`
- `requestPayload.deliveryFee`
- `requestPayload.totalOrderCost`
- `shipday` — фактичну відповідь Shipday

## Дані по точках

Для мережі з кількома магазинами інтеграція вже multi-tenant і multi-spot.

Що це означає:

- кожен Poster акаунт має окремі installation і settings
- у кожного акаунта свій Shipday API key
- у кожного акаунта свій список Poster spots
- кожне замовлення спочатку намагається взяти `spotId` із POS payload
- якщо `spotId` не прийшов, backend дотягує Poster transaction по lookup-кандидатах і бере `transaction.spotId`
- якщо transaction lookup не спрацював, але в POS є `spotName`, backend пробує змепити його на synced Poster spot
- тільки якщо точку замовлення все одно не вдалося визначити, backend бере `defaultSpotId`

Тобто `Default Poster spot` потрібен тільки як fallback. Якщо Poster може дати точну точку замовлення, вона має пріоритет.

## Зберігання даних

Робочий режим зараз:

- `Postgres`

Таблиці:

- `poster_installations`
- `poster_account_settings`
- `order_log`

Що зберігається:

- Poster installation по акаунту
- Shipday settings по акаунту
- synced Poster spots
- `defaultSpotId`
- pickup mappings
- лог відправлених замовлень: `orderNumber`, `account`, `shipdayOrderId`, `spotId`, `customerPhone`, `mockMode`
- статус відправки: `pending`, `sent`, `failed`
- для live-записів гарантується унікальність активної відправки по `account + orderNumber`

Shipday API key зберігається зашифрованим.

## Ізоляція даних між організаціями

Один backend може обслуговувати багато різних Poster організацій, але дані мають бути ізольовані.

Що ізолюється по `account`:

- Poster installation
- Shipday settings
- synced Poster spots
- pickup mappings
- `order_log`

Що ізолюється по browser-session:

- доступ до `/poster/settings`
- доступ до `/api/poster/installations`
- доступ до `/api/poster/settings/:account`

Тобто різні організації не повинні бачити налаштування одна одної просто через shared backend URL.

Таблиця `order_log` використовується для:

- визначення `account` у Shipday webhook спочатку по `shipdayOrderId`, а потім обережним fallback по `orderNumber`
- майбутньої відправки TurboSMS
- аудиту замовлень по акаунту

У file-based (local dev) режимі `order_log` зберігається in-memory.

## Що налаштовується в Render

Мінімально потрібні env:

- `BACKEND_PUBLIC_URL`
- `POSTER_APPLICATION_ID`
- `POSTER_APPLICATION_SECRET`
- `SETTINGS_ENCRYPTION_SECRET` — окремий секрет для шифрування API ключів (не збігається з `POSTER_APPLICATION_SECRET`)
- `DATABASE_URL`
- `DATABASE_SSL_MODE`

Опціонально:

- `SHIPDAY_WEBHOOK_TOKEN` — токен для верифікації вхідних Shipday webhook-ів (налаштовується в Shipday Dashboard → Integrations → Webhook)

Якщо `SETTINGS_ENCRYPTION_SECRET` не встановлено, backend виведе попередження в логи і використає менш безпечний fallback. Не допускай цього в production.

Postgres уже підтримується кодом через:

- [storage.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/storage.mjs)
- [postgres.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgres.mjs)
- [postgresInstallationsStore.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgresInstallationsStore.mjs)
- [postgresAccountSettingsStore.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgresAccountSettingsStore.mjs)
- [postgresOrderLogStore.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgresOrderLogStore.mjs)

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

- якщо даних достатньо, іде `one-click send`
- якщо даних бракує, відкривається fallback popup
- backend відправляє live request у Shipday
- у Shipday з’являється order
- pickup у Shipday береться з реальної точки замовлення, а не з `default spot`, якщо `spotId` вдалося резолвити

### Fallback test

Якщо не вистачає:

- імені клієнта
- телефону
- адреси доставки

POS відкриє popup і попросить дозаповнити поля вручну.

## Shipday Webhook

Backend приймає Shipday webhook на:

```
POST /webhooks/shipday
```

### Налаштування в Shipday Dashboard

1. Відкрий Shipday Dashboard → Integrations → Webhook.
2. Вкажи URL: `https://your-service.onrender.com/webhooks/shipday`
3. Встанови токен (max 32 символи) і додай його як `SHIPDAY_WEBHOOK_TOKEN` в Render.

### Верифікація

Якщо `SHIPDAY_WEBHOOK_TOKEN` встановлено — backend перевіряє заголовок `token` у кожному запиті. При невідповідності повертає HTTP 401.

### Визначення закладу по webhook

Backend шукає `account` так:

1. спочатку по `shipdayOrderId` з таблиці `order_log`
2. якщо його немає у webhook payload — робить fallback по `orderNumber`
3. fallback по `orderNumber` використовується лише якщо він однозначно належить одному акаунту

Якщо замовлення не знайдено або `orderNumber` двозначний між різними акаунтами — webhook ігнорується (повертається HTTP 200 щоб Shipday не повторював).

### Підтримувані події

Webhook приймає всі події Shipday. Поточний статус обробки:

| Подія | Статус |
|---|---|
| `ORDER_INSERTED` | отримується, логується |
| `ORDER_ASSIGNED` | отримується, логується |
| `ORDER_ONTHEWAY` | отримується, логується — TurboSMS буде тут |
| `ORDER_COMPLETED` | отримується, логується |
| решта | отримуються, логуються |

## Діагностика

### Healthcheck

`GET /health`

Дозволяє перевірити:

- чи підключений Postgres
- чи є installation
- чи є account settings
- URL webhook endpoint
- чи налаштований `SHIPDAY_WEBHOOK_TOKEN`

`/health` навмисно не віддає список акаунтів або їхні налаштування назовні.

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

## Поведінка при відсутньому або невідомому account hint

Backend може отримати `account` hint від POS, але не довіряє йому беззастережно. Можливі сценарії:

| Ситуація | Поведінка |
|---|---|
| Є `transactionId`, і Poster lookup дає однозначний акаунт | Використовується lookup-акаунт |
| `transactionId` не допоміг, але є `Origin/Referer` з `*.joinposter.com` | Використовується акаунт із заголовків |
| Сильні сигнали не спрацювали, але є валідний `account hint` | Використовується тільки як слабкий fallback |
| Сигналів немає, але в backend одна installation | Використовується єдина installation |
| Сигнали двозначні або їх недостатньо | Backend повертає HTTP 400 |

Для multi-store сценарію POS також передає `poster.transactionId` окремо від технічного `poster.orderId`. Це важливо, бо у Poster `order.id` і видимий номер чека можуть не збігатися.

## Mock mode

Mock mode увімкнено явно, якщо:

- `mockMode: true` у налаштуваннях акаунта, або
- `SHIPDAY_MOCK_MODE=true` в env

Глобальний `SHIPDAY_MOCK_MODE` більше не вмикається неявно через відсутність глобального `SHIPDAY_API_KEY`. Це важливо для multi-tenant схеми, де ключі Shipday зберігаються на рівні конкретного Poster акаунта в базі.

Якщо Shipday API key не налаштований і mock mode **не увімкнено явно**, backend поверне **HTTP 400** з повідомленням і посиланням на settings. Це навмисна поведінка — замовлення не відправляються мовчки в нікуди.

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
- [postgresOrderLogStore.mjs](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/server/lib/postgresOrderLogStore.mjs)
