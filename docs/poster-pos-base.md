# Poster POS base

Цей репозиторій переведено з демо-режиму на базовий каркас реального POS-застосунку для Poster.

## Що вже є

- Власний entrypoint замість `hello-world`.
- Реєстрація іконки застосунку в `functions` та `order`.
- Popup shell для роботи всередині Poster POS.
- Базовий модуль перевірки доступності зовнішнього сервісу.
- Місце для конфігурації інтеграції в `src/js/config.js`.

## Що треба заповнити перед інтеграцією

1. Створити застосунок у Poster developer account.
2. Для локального deploy зберегти `applicationId` та `applicationSecret` у `manifest.local.json`
   або передавати їх через `POSTER_APPLICATION_ID` і `POSTER_APPLICATION_SECRET`.
3. Вказати адресу власного backend/proxy у `src/js/config.js`.
4. Увімкнути POS Platform для застосунку в налаштуваннях Poster.

## Локальний запуск

```bash
npm install
npm run dev
```

Після цього є два режими тестування.

### Browser preview без каси

1. Відкрити `https://localhost:5173`.
2. Якщо браузер просить довірити локальний сертифікат, підтвердити доступ.
3. У браузері відкриється локальний preview з mock `Poster`.
4. Через кнопки `Simulate Order Click`, `Simulate Functions Click` і `Закрити Popup` можна тестувати базову поведінку без каси.
5. Через runtime picker можна перемикати mock середовище між `Desktop`, `Windows`, `Android` та `iPad`.

### Poster POS development mode

1. Увійти в `https://pos.ps`.
2. Перевести застосунок у development mode.
3. Вказати URL `https://localhost:5173`.
4. Відкрити екран замовлення або меню функцій і натиснути кнопку `Інтеграція`.

## Деплой bundle в Poster

```bash
npm run deploy
```

Скрипт збирає `bundle.js` і відправляє його через `application.uploadPOSPlatformBundle`.

## Архітектурне правило

Якщо зовнішній сервіс потребує API key, secret, OAuth client secret або підписані запити, ці дані не можна тримати в POS bundle. Для цього потрібен окремий backend/proxy, а POS-додаток має викликати вже його.

## Render backend

Для connect flow і Shipday proxy тепер є окремий backend у цьому ж репозиторії. Деталі запуску й env зібрані в [render-backend.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/render-backend.md).
