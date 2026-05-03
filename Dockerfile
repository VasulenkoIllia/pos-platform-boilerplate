# syntax=docker/dockerfile:1.7

FROM node:20.14.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20.14.0-alpine AS runtime

RUN apk add --no-cache tzdata wget \
    && cp /usr/share/zoneinfo/Europe/Kyiv /etc/localtime \
    && echo "Europe/Kyiv" > /etc/timezone

ENV TZ=Europe/Kyiv \
    NODE_ENV=production \
    PORT=8787

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server

RUN mkdir -p /app/.data && chown -R node:node /app

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8787/health >/dev/null 2>&1 || exit 1

CMD ["node", "server/index.mjs"]
