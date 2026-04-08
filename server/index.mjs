import 'dotenv/config';

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import config, {
    getMissingPosterAuthConfig,
    getMissingShipdayConfig,
} from './config.mjs';
import { createInstallationsStore } from './lib/installationsStore.mjs';
import {
    renderConfigErrorPage,
    renderConnectPage,
    renderPosterErrorPage,
    renderSuccessPage,
} from './lib/views.mjs';
import {
    buildPosterOauthUrl,
    exchangePosterAuthCode,
    toInstallationRecord,
} from './services/posterAuth.mjs';
import {
    createMockShipdayOrder,
    createShipdayOrder,
    getMockShipdayOrder,
    getShipdayOrder,
    normalizeShipdayOrderPayload,
} from './services/shipdayClient.mjs';

const installationsStore = createInstallationsStore(config.poster.installationsFile);
const currentFilePath = fileURLToPath(import.meta.url);
const entryFilePath = process.argv[1] ? path.resolve(process.argv[1]) : null;

const isLocalHostname = hostname => ['localhost', '127.0.0.1', '::1'].includes(hostname);

const isAllowedOrigin = (origin) => {
    if (!origin) {
        return true;
    }

    try {
        const { hostname, protocol } = new URL(origin);

        if (hostname === 'pos.ps') {
            return true;
        }

        if (hostname.endsWith('.joinposter.com')) {
            return true;
        }

        if (isLocalHostname(hostname)) {
            return protocol === 'http:' || protocol === 'https:';
        }

        if (config.backendPublicUrl && origin === config.backendPublicUrl) {
            return true;
        }
    } catch (error) {
        return false;
    }

    return false;
};

const maskToken = (token) => {
    if (!token) {
        return null;
    }

    if (token.length <= 10) {
        return '***';
    }

    return `${token.slice(0, 4)}...${token.slice(-4)}`;
};

const toPublicInstallation = installation => ({
    account: installation.account,
    accessToken: maskToken(installation.accessToken),
    receivedAt: installation.receivedAt,
    endpoint: installation.endpoint,
    ownerInfo: installation.ownerInfo || null,
    user: installation.user || null,
});

export const createApp = () => {
    const app = express();

    app.disable('x-powered-by');
    app.use(cors({
        origin(origin, callback) {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error('Origin not allowed by CORS.'));
        },
    }));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: false }));

    app.get('/', (request, response) => {
        response.redirect(config.poster.connectPath);
    });

    app.get('/health', async (request, response) => {
        const installations = await installationsStore.list();

        response.json({
            ok: true,
            service: config.appName,
            environment: config.nodeEnv,
            poster: {
                applicationIdConfigured: Boolean(config.poster.applicationId),
                applicationSecretConfigured: Boolean(config.poster.applicationSecret),
                connectUrl: config.urls.connect || null,
                oauthCallbackUrl: config.urls.oauthCallback || null,
                installationsCount: installations.length,
            },
            shipday: {
                configured: Boolean(config.shipday.apiKey),
                mockMode: config.shipday.mockMode,
                apiBaseUrl: config.shipday.apiBaseUrl,
                authMode: config.shipday.authMode,
                ordersEndpoint: config.urls.shipdayOrders || null,
            },
            storage: {
                posterInstallationsFile: config.poster.installationsFile,
            },
            checkedAt: new Date().toISOString(),
        });
    });

    app.get(config.poster.connectPath, (request, response) => {
        const missingConfig = getMissingPosterAuthConfig();

        if (missingConfig.length) {
            response.status(500).type('html').send(renderConfigErrorPage({
                appName: config.appName,
                title: 'Backend ще не готовий для Poster connect.',
                heading: 'Додайте env у Render',
                missing: missingConfig,
                details: 'Після цього впишіть connect і redirect URL у налаштуваннях застосунку Poster.',
            }));
            return;
        }

        response.type('html').send(renderConnectPage({
            appName: config.appName,
            oauthStartUrl: config.urls.oauthStart,
            oauthCallbackUrl: config.urls.oauthCallback,
            shipdayOrdersUrl: config.urls.shipdayOrders,
        }));
    });

    app.get(config.poster.oauthStartPath, (request, response) => {
        const missingConfig = getMissingPosterAuthConfig();

        if (missingConfig.length) {
            response.status(500).type('html').send(renderConfigErrorPage({
                appName: config.appName,
                title: 'Poster OAuth не можна почати без env.',
                heading: 'Не вистачає параметрів для OAuth',
                missing: missingConfig,
            }));
            return;
        }

        const oauthUrl = buildPosterOauthUrl({
            applicationId: config.poster.applicationId,
            redirectUri: config.urls.oauthCallback,
            oauthBaseUrl: config.poster.oauthBaseUrl,
        });

        response.redirect(oauthUrl);
    });

    app.get(config.poster.redirectPath, async (request, response, next) => {
        const code = String(request.query.code || '').trim();
        const account = String(request.query.account || '').trim();

        if (!code || !account) {
            response.status(400).type('html').send(renderPosterErrorPage({
                appName: config.appName,
                heading: 'Poster не повернув code або account',
                message: 'OAuth callback прийшов без обовʼязкових параметрів.',
                errors: [
                    'Очікувались query-параметри code та account.',
                ],
            }));
            return;
        }

        try {
            const authResult = await exchangePosterAuthCode({
                account,
                code,
                applicationId: config.poster.applicationId,
                applicationSecret: config.poster.applicationSecret,
                redirectUri: config.urls.oauthCallback,
                timeoutMs: config.poster.tokenExchangeTimeoutMs,
            });

            await installationsStore.save(toInstallationRecord({
                account,
                authResult,
            }));

            const successUrl = new URL(config.poster.successPath, config.backendPublicUrl || `http://localhost:${config.port}`);
            successUrl.searchParams.set('account', account);
            response.redirect(successUrl.toString());
        } catch (error) {
            next(error);
        }
    });

    app.get(config.poster.successPath, async (request, response) => {
        const account = String(request.query.account || '').trim();
        const installation = account ? await installationsStore.get(account) : null;

        response.type('html').send(renderSuccessPage({
            appName: config.appName,
            account: account || (installation && installation.account) || 'невідомий акаунт',
        }));
    });

    app.get('/api/poster/installations', async (request, response) => {
        const installations = await installationsStore.list();

        response.json({
            ok: true,
            items: installations.map(toPublicInstallation),
        });
    });

    app.get('/api/poster/installations/:account', async (request, response) => {
        const installation = await installationsStore.get(request.params.account);

        if (!installation) {
            response.status(404).json({
                ok: false,
                message: 'Poster installation не знайдено.',
            });
            return;
        }

        response.json({
            ok: true,
            item: toPublicInstallation(installation),
        });
    });

    app.post('/api/shipday/orders', async (request, response, next) => {
        const missingShipdayConfig = getMissingShipdayConfig();

        if (missingShipdayConfig.length) {
            response.status(500).json({
                ok: false,
                message: 'Shipday env не налаштований.',
                missing: missingShipdayConfig,
            });
            return;
        }

        try {
            const payload = normalizeShipdayOrderPayload({
                input: request.body,
                defaultPickup: config.shipday.defaultPickup,
            });
            const shipdayResponse = config.shipday.mockMode
                ? await createMockShipdayOrder({ payload })
                : await createShipdayOrder({
                    apiBaseUrl: config.shipday.apiBaseUrl,
                    apiKey: config.shipday.apiKey,
                    authMode: config.shipday.authMode,
                    timeoutMs: config.shipday.timeoutMs,
                    payload,
                });

            response.status(shipdayResponse.ok ? 201 : shipdayResponse.status).json({
                ok: shipdayResponse.ok,
                mode: config.shipday.mockMode ? 'mock' : 'live',
                requestPayload: payload,
                shipday: shipdayResponse.body,
            });
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/shipday/orders/:orderNumber', async (request, response, next) => {
        const missingShipdayConfig = getMissingShipdayConfig();

        if (missingShipdayConfig.length) {
            response.status(500).json({
                ok: false,
                message: 'Shipday env не налаштований.',
                missing: missingShipdayConfig,
            });
            return;
        }

        try {
            const shipdayResponse = config.shipday.mockMode
                ? await getMockShipdayOrder({
                    orderNumber: request.params.orderNumber,
                })
                : await getShipdayOrder({
                    apiBaseUrl: config.shipday.apiBaseUrl,
                    apiKey: config.shipday.apiKey,
                    authMode: config.shipday.authMode,
                    timeoutMs: config.shipday.timeoutMs,
                    orderNumber: request.params.orderNumber,
                });

            response.status(shipdayResponse.ok ? 200 : shipdayResponse.status).json({
                ok: shipdayResponse.ok,
                mode: config.shipday.mockMode ? 'mock' : 'live',
                shipday: shipdayResponse.body,
            });
        } catch (error) {
            next(error);
        }
    });

    app.post('/webhooks/shipday', (request, response) => {
        response.status(202).json({
            ok: true,
            message: 'Shipday webhook route готовий, але обробка ще не реалізована.',
        });
    });

    app.use((error, request, response, next) => {
        if (response.headersSent) {
            next(error);
            return;
        }

        if (error.message === 'Origin not allowed by CORS.') {
            response.status(403).json({
                ok: false,
                message: error.message,
            });
            return;
        }

        if (error.name === 'ZodError') {
            response.status(400).json({
                ok: false,
                message: 'Невірний формат payload.',
                issues: error.issues,
            });
            return;
        }

        if (request.path === config.poster.redirectPath) {
            response.status(502).type('html').send(renderPosterErrorPage({
                appName: config.appName,
                heading: 'Не вдалося завершити Poster OAuth',
                message: error.message,
                errors: error.details || ['Перевірте POSTER_APPLICATION_ID, POSTER_APPLICATION_SECRET і BACKEND_PUBLIC_URL.'],
            }));
            return;
        }

        response.status(500).json({
            ok: false,
            message: error.message || 'Внутрішня помилка сервера.',
        });
    });

    return app;
};

export const startServer = () => {
    const app = createApp();

    return http.createServer(app).listen(config.port, () => {
        console.log(`[server] ${config.appName} listening on http://0.0.0.0:${config.port}`);
    });
};

if (entryFilePath && entryFilePath === currentFilePath) {
    startServer();
}
