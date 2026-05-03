# Poster + Shipday POS Bridge

Цей репозиторій уже не просто boilerplate. Тут зібрана робоча інтеграція:

- POS bundle для Poster
- backend для Poster OAuth і Shipday proxy
- account-level settings
- sync точок Poster
- відправка delivery orders у Shipday
- dedupe і `order_log`
- Postgres storage
- Docker deployment з Traefik (self-hosted, у production)

## Де читати документацію

- Архітектура і бізнес-flow:
  [docs/shipday-poster-integration.md](docs/shipday-poster-integration.md)
- Локальний POS/base flow:
  [docs/poster-pos-base.md](docs/poster-pos-base.md)
- **Production deployment (Docker + Traefik + Cloudflare):**
  [docs/self-hosted-deployment.md](docs/self-hosted-deployment.md)
- Render backend (deprecated, для історичної довідки):
  [docs/render-backend.md](docs/render-backend.md)

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

Backend деплоїться через Docker Compose на власний сервер за Traefik — див.
[docs/self-hosted-deployment.md](docs/self-hosted-deployment.md).

Після змін у POS frontend треба окремо перелити `bundle.js` у Poster:

```bash
export POSTER_BACKEND_BASE_URL=https://mamamia.workflo.space
npm run deploy
```

## Поточна продуктова поведінка

- кнопка `Shipday` на екрані замовлення не відправляє order одразу, а спочатку відкриває confirm popup
- scheduled delivery time береться з Poster payload, а якщо його там немає, backend дотягує `delivery.delivery_time` через Poster Web API
- backend конвертує локальний час точки `Europe/Kiev` у UTC перед Shipday API
- якщо в Shipday уже є live order з тим самим `account + orderNumber`, повторне створення блокується
