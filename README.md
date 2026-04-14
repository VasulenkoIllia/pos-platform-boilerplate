# Poster + Shipday POS Bridge

Цей репозиторій уже не просто boilerplate. Тут зібрана робоча інтеграція:

- POS bundle для Poster
- backend для Poster OAuth і Shipday proxy
- account-level settings
- sync точок Poster
- відправка delivery orders у Shipday
- dedupe і `order_log`
- Postgres storage

## Де читати документацію

- Архітектура і бізнес-flow:
  [docs/shipday-poster-integration.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/shipday-poster-integration.md)
- Локальний POS/base flow:
  [docs/poster-pos-base.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/poster-pos-base.md)
- Render backend setup:
  [docs/render-backend.md](/Users/monstermac/WebstormProjects/pos-platform-boilerplate/docs/render-backend.md)

## Локальний запуск

> Потрібна Node.js `v20.14.0`

```bash
npm install
npm run dev
```

Для backend окремо:

```bash
npm run dev:backend
```

## Важливо про деплой

- `git push` або Render deploy оновлюють тільки backend
- після змін у POS frontend треба окремо перелити `bundle.js` у Poster:

```bash
npm run deploy
```

## Поточна продуктова поведінка

- кнопка `Shipday` на екрані замовлення не відправляє order одразу, а спочатку відкриває confirm popup
- scheduled delivery time береться з Poster payload, а якщо його там немає, backend дотягує `delivery.delivery_time` через Poster Web API
- backend конвертує локальний час точки `Europe/Kiev` у UTC перед Shipday API
- якщо в Shipday уже є live order з тим самим `account + orderNumber`, повторне створення блокується
