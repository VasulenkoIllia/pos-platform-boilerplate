# Poster POS base

Цей репозиторій тепер містить реальний POS-застосунок Poster з backend для Shipday.

## Що вже реалізовано

- кнопка `Shipday` у `functions` та `order`
- confirm popup перед реальною відправкою із замовлення
- fallback popup для ручного дозаповнення
- сервісний `Shipday`-екран у `functions`
- локальний browser preview з mock `Poster`
- backend connect flow і Shipday proxy
- account-level налаштування для Shipday
- підтримка scheduled delivery time з Poster
- dedupe live-відправки по `account + orderNumber`

## Швидкий старт

1. Створи застосунок у Poster Developer.
2. Увімкни `POS-платформа`.
3. Для локального deploy збережи `applicationId` та `applicationSecret` у `manifest.local.json`
   або передавай через env.
4. Налаштуй backend і Shipday за інструкцією в
   [shipday-poster-integration.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/shipday-poster-integration.md).

## Локальний preview без каси

```bash
npm install
npm run dev
```

Потім відкрий:

- [https://localhost:5173](https://localhost:5173)

У preview доступні:

- `Simulate Order Click`
- `Simulate Functions Click`
- mock runtime picker

Це потрібно тільки для локальної розробки UI та basic flow.

## Деплой POS bundle в Poster

```bash
npm run deploy
```

Скрипт збирає `bundle.js` і відправляє його через `application.uploadPOSPlatformBundle`.

Важливо: `git push` або Render deploy не оновлюють POS bundle автоматично. Після frontend/POS-змін `bundle.js` треба заливати в Poster окремо.

## Що важливо

Секрети не зберігаються в POS bundle.

Тобто:

- Shipday API key зберігається тільки в backend
- POS bundle викликає тільки backend

Поточна продуктова поведінка:

- `Shipday` з `order` = confirm popup, а вже після підтвердження відправка замовлення або fallback popup
  з debug і переходом у settings, якщо backend повернув помилку
- `Shipday` з `functions` = сервісний вхід, статус і перехід у web settings
- scheduled delivery time для preorder/delivery замовлень передається в Shipday; якщо POS runtime не дав цей час, backend бере його з Poster Web API `delivery.delivery_time`

## Детальна документація

- Архітектура інтеграції:
  [shipday-poster-integration.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/shipday-poster-integration.md)
- Render і backend setup:
  [render-backend.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/render-backend.md)
