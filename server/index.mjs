import 'dotenv/config';

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import config, {
    getMissingPosterAuthConfig,
} from './config.mjs';
import { createStorage } from './lib/storage.mjs';
import {
    renderConfigErrorPage,
    renderConnectPage,
    renderPosterErrorPage,
    renderSettingsPage,
    renderSuccessPage,
} from './lib/views.mjs';
import {
    buildAccountSettingsFromInput,
    buildSettingsUrl,
    resolveShipdayAccountConfig,
    toPublicAccountSettings,
} from './services/accountSettings.mjs';
import {
    buildPosterOauthUrl,
    exchangePosterAuthCode,
    toInstallationRecord,
} from './services/posterAuth.mjs';
import { getPosterSpots } from './services/posterWebApi.mjs';
import {
    createMockShipdayOrder,
    createShipdayOrder,
    getMockShipdayOrder,
    getShipdayOrder,
    normalizeShipdayOrderPayload,
} from './services/shipdayClient.mjs';

const storage = await createStorage(config);
const { installationsStore, accountSettingsStore } = storage;
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

const normalizeAccount = value => String(value || '').trim();

const toPublicInstallation = installation => ({
    account: installation.account,
    accessToken: maskToken(installation.accessToken),
    receivedAt: installation.receivedAt,
    endpoint: installation.endpoint,
    ownerInfo: installation.ownerInfo || null,
    user: installation.user || null,
});

const buildSettingsRedirectUrl = ({
    account,
    flags = {},
}) => {
    const url = new URL(
        buildSettingsUrl({
            baseUrl: config.backendPublicUrl || `http://localhost:${config.port}`,
            settingsPath: config.poster.settingsPath,
            account,
        }),
    );

    Object.entries(flags).forEach(([key, enabled]) => {
        if (enabled) {
            url.searchParams.set(key, '1');
        }
    });

    return url.toString();
};

const buildSettingsNotices = (request) => {
    const notices = [];

    if (String(request.query.connected || '') === '1') {
        notices.push({
            kind: 'success',
            message: 'Poster акаунт підключено. Тепер збережи Shipday API key і перевір mapping точок.',
        });
    }

    if (String(request.query.saved || '') === '1') {
        notices.push({
            kind: 'success',
            message: 'Налаштування акаунта збережено.',
        });
    }

    if (String(request.query.synced || '') === '1') {
        notices.push({
            kind: 'success',
            message: 'Точки Poster успішно синхронізовані.',
        });
    }

    if (String(request.query.sync_error || '') === '1') {
        notices.push({
            kind: 'danger',
            message: 'Не вдалося синхронізувати точки Poster. Перевір OAuth і повтори sync.',
        });
    }

    return notices;
};

const resolveRequestAccount = async (request) => {
    const explicitAccount = normalizeAccount(
        request.body && typeof request.body === 'object'
            ? request.body.account
            : request.query.account,
    ) || normalizeAccount(request.params.account);

    if (explicitAccount) {
        return explicitAccount;
    }

    const installations = await installationsStore.list();

    return installations.length === 1 ? installations[0].account : '';
};

const syncPosterSpotsForAccount = async (account) => {
    const installation = await installationsStore.get(account);

    if (!installation) {
        throw new Error('Poster installation не знайдено для цього акаунта.');
    }

    const spotsResult = await getPosterSpots({
        account,
        accessToken: installation.accessToken,
        apiBaseUrl: config.poster.apiBaseUrl,
        timeoutMs: config.poster.apiTimeoutMs,
    });
    const currentSettings = await accountSettingsStore.get(account);
    const nextSettings = await accountSettingsStore.save({
        ...(currentSettings || {}),
        account,
        syncedAt: new Date().toISOString(),
        posterSpots: spotsResult.spots,
        defaultSpotId: currentSettings && currentSettings.defaultSpotId
            ? currentSettings.defaultSpotId
            : (spotsResult.spots.length === 1 ? spotsResult.spots[0].spotId : ''),
    });

    return {
        installation,
        settings: nextSettings,
        spotsResult,
    };
};

const ensurePickupConfigured = ({
    resolvedShipdayConfig,
    account,
}) => {
    const pickup = resolvedShipdayConfig.pickup;

    if (pickup && pickup.name && (pickup.address || pickup.formattedAddress)) {
        return null;
    }

    return {
        ok: false,
        message: 'Для цього акаунта не налаштовано pickup-дані Shipday. Відкрий settings і змепи Poster точку на pickup адресу.',
        requiresAccountSettings: true,
        settingsUrl: buildSettingsUrl({
            baseUrl: config.backendPublicUrl,
            settingsPath: config.poster.settingsPath,
            account,
        }) || null,
        spotId: resolvedShipdayConfig.resolvedSpotId || null,
    };
};

const extractShipdayReference = (shipdayBody) => {
    if (!shipdayBody || typeof shipdayBody !== 'object') {
        return '';
    }

    const candidates = [
        shipdayBody.trackingId,
        shipdayBody.orderNumber,
        shipdayBody.orderId,
        shipdayBody.id,
        shipdayBody.data && shipdayBody.data.trackingId,
        shipdayBody.data && shipdayBody.data.orderNumber,
        shipdayBody.data && shipdayBody.data.orderId,
        shipdayBody.data && shipdayBody.data.id,
        shipdayBody.result && shipdayBody.result.trackingId,
        shipdayBody.result && shipdayBody.result.orderNumber,
        shipdayBody.result && shipdayBody.result.orderId,
        shipdayBody.result && shipdayBody.result.id,
    ];

    return String(candidates.find(Boolean) || '').trim();
};

const isShipdayCreateConfirmed = (shipdayBody) => {
    if (!shipdayBody || typeof shipdayBody !== 'object') {
        return false;
    }

    if (extractShipdayReference(shipdayBody)) {
        return true;
    }

    return shipdayBody.success === true;
};

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
    app.use(express.urlencoded({ extended: true }));

    app.get('/', (request, response) => {
        response.redirect(config.poster.connectPath);
    });

    app.get('/health', async (request, response) => {
        const [installations, accountSettings] = await Promise.all([
            installationsStore.list(),
            accountSettingsStore.list(),
        ]);
        const accountSummaries = accountSettings.map(settings => ({
            account: settings.account,
            shipdayConfigured: Boolean(settings.shipday && settings.shipday.apiKeyConfigured),
            authMode: settings.shipday && settings.shipday.authMode
                ? settings.shipday.authMode
                : config.shipday.authMode,
            mockMode: Boolean(settings.shipday && settings.shipday.mockMode),
            defaultSpotId: settings.defaultSpotId || '',
            spotsCount: Array.isArray(settings.posterSpots) ? settings.posterSpots.length : 0,
        }));

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
                accountSettingsCount: accountSettings.length,
            },
            shipday: {
                configured: accountSettings.some(settings => settings.shipday && settings.shipday.apiKeyConfigured),
                globalFallbackMockMode: config.shipday.mockMode,
                apiBaseUrl: config.shipday.apiBaseUrl,
                globalFallbackAuthMode: config.shipday.authMode,
                ordersEndpoint: config.urls.shipdayOrders || null,
                fallbackConfigured: Boolean(config.shipday.apiKey),
                accounts: accountSummaries,
            },
            storage: {
                driver: storage.driver,
                posterInstallationsFile: config.poster.installationsFile,
                accountSettingsFile: config.poster.accountSettingsFile,
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
        const code = normalizeAccount(request.query.code);
        const account = normalizeAccount(request.query.account);

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

            let synced = false;

            try {
                await syncPosterSpotsForAccount(account);
                synced = true;
            } catch (error) {
                synced = false;
            }

            response.redirect(buildSettingsRedirectUrl({
                account,
                flags: {
                    connected: true,
                    synced,
                    sync_error: !synced,
                },
            }));
        } catch (error) {
            next(error);
        }
    });

    app.get(config.poster.successPath, async (request, response) => {
        const account = normalizeAccount(request.query.account);
        const settingsUrl = buildSettingsUrl({
            baseUrl: config.backendPublicUrl,
            settingsPath: config.poster.settingsPath,
            account,
        });

        response.type('html').send(renderSuccessPage({
            appName: config.appName,
            account: account || 'невідомий акаунт',
            settingsUrl,
        }));
    });

    app.get(config.poster.settingsPath, async (request, response, next) => {
        const account = await resolveRequestAccount(request);

        if (!account) {
            response.status(400).type('html').send(renderConfigErrorPage({
                appName: config.appName,
                title: 'Не вдалося визначити Poster account.',
                heading: 'Потрібен account у query або рівно одна інсталяція в backend',
                missing: ['account'],
            }));
            return;
        }

        if (String(request.query.sync || '') === '1') {
            try {
                await syncPosterSpotsForAccount(account);
                response.redirect(buildSettingsRedirectUrl({
                    account,
                    flags: {
                        synced: true,
                    },
                }));
            } catch (error) {
                response.redirect(buildSettingsRedirectUrl({
                    account,
                    flags: {
                        sync_error: true,
                    },
                }));
            }

            return;
        }

        try {
            const installation = await installationsStore.get(account);

            if (!installation) {
                response.status(404).type('html').send(renderPosterErrorPage({
                    appName: config.appName,
                    heading: 'Poster акаунт ще не підключено',
                    message: 'Спочатку завершіть connect flow через Poster.',
                    errors: [
                        'На backend немає installation record для цього account.',
                    ],
                }));
                return;
            }

            let settings = await accountSettingsStore.get(account);

            if (!settings || !Array.isArray(settings.posterSpots) || !settings.posterSpots.length) {
                try {
                    const synced = await syncPosterSpotsForAccount(account);
                    settings = synced.settings;
                } catch (error) {
                    settings = settings || null;
                }
            }

            response.type('html').send(renderSettingsPage({
                appName: config.appName,
                account,
                installation: toPublicInstallation(installation),
                settings: toPublicAccountSettings(settings),
                settingsActionUrl: config.urls.settings,
                syncSpotsUrl: buildSettingsRedirectUrl({
                    account,
                    flags: {
                        sync: true,
                    },
                }),
                notices: buildSettingsNotices(request),
            }));
        } catch (error) {
            next(error);
        }
    });

    app.post(config.poster.settingsPath, async (request, response, next) => {
        const account = normalizeAccount(request.body.account);

        if (!account) {
            response.status(400).json({
                ok: false,
                message: 'Потрібен account для збереження налаштувань.',
            });
            return;
        }

        try {
            const installation = await installationsStore.get(account);

            if (!installation) {
                response.status(404).json({
                    ok: false,
                    message: 'Poster installation не знайдено для цього акаунта.',
                });
                return;
            }

            let existingSettings = await accountSettingsStore.get(account);
            let syncedSpots = existingSettings && Array.isArray(existingSettings.posterSpots)
                ? existingSettings.posterSpots
                : [];

            if (!syncedSpots.length) {
                try {
                    const synced = await syncPosterSpotsForAccount(account);
                    existingSettings = synced.settings;
                    syncedSpots = synced.settings.posterSpots;
                } catch (error) {
                    syncedSpots = [];
                }
            }

            const nextSettings = buildAccountSettingsFromInput({
                account,
                input: request.body,
                existingSettings,
                posterSpots: syncedSpots,
            });

            await accountSettingsStore.save(nextSettings);

            response.redirect(buildSettingsRedirectUrl({
                account,
                flags: {
                    saved: true,
                },
            }));
        } catch (error) {
            next(error);
        }
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

    app.get('/api/poster/settings/:account', async (request, response) => {
        const settings = await accountSettingsStore.get(request.params.account);

        response.json({
            ok: true,
            item: toPublicAccountSettings(settings),
        });
    });

    app.post('/api/shipday/orders', async (request, response, next) => {
        try {
            const account = await resolveRequestAccount(request);

            if (!account) {
                response.status(400).json({
                    ok: false,
                    message: 'Не вдалося визначити Poster account для відправки в Shipday.',
                    requiresAccountSettings: true,
                });
                return;
            }

            const accountSettings = await accountSettingsStore.get(account);
            const posterContext = request.body.poster && typeof request.body.poster === 'object'
                ? request.body.poster
                : {};
            const resolvedShipdayConfig = resolveShipdayAccountConfig({
                accountSettings,
                globalShipdayConfig: config.shipday,
                posterContext,
            });
            const pickupError = ensurePickupConfigured({
                resolvedShipdayConfig,
                account,
            });

            if (pickupError) {
                response.status(400).json(pickupError);
                return;
            }

            const payload = normalizeShipdayOrderPayload({
                input: request.body,
                defaultPickup: resolvedShipdayConfig.pickup,
            });
            const shipdayResponse = resolvedShipdayConfig.mockMode
                ? await createMockShipdayOrder({ payload })
                : await createShipdayOrder({
                    apiBaseUrl: config.shipday.apiBaseUrl,
                    apiKey: resolvedShipdayConfig.apiKey,
                    authMode: resolvedShipdayConfig.authMode,
                    timeoutMs: config.shipday.timeoutMs,
                    payload,
                });
            const confirmed = resolvedShipdayConfig.mockMode
                ? true
                : isShipdayCreateConfirmed(shipdayResponse.body);
            const reference = extractShipdayReference(shipdayResponse.body);
            const responsePayload = {
                ok: shipdayResponse.ok && confirmed,
                account,
                mode: resolvedShipdayConfig.mockMode ? 'mock' : 'live',
                httpStatus: shipdayResponse.status,
                confirmed,
                reference: reference || null,
                requestPayload: payload,
                pickupSource: {
                    spotId: resolvedShipdayConfig.resolvedSpotId || null,
                    posterSpot: resolvedShipdayConfig.posterSpot || null,
                },
                shipday: shipdayResponse.body,
            };

            if (shipdayResponse.ok && !resolvedShipdayConfig.mockMode && !confirmed) {
                response.status(502).json({
                    ...responsePayload,
                    message: 'Shipday відповів без явного підтвердження створення замовлення.',
                });
                return;
            }

            response.status(shipdayResponse.ok ? 201 : shipdayResponse.status).json(responsePayload);
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/shipday/orders/:orderNumber', async (request, response, next) => {
        try {
            const account = await resolveRequestAccount(request);
            const accountSettings = account ? await accountSettingsStore.get(account) : null;
            const resolvedShipdayConfig = resolveShipdayAccountConfig({
                accountSettings,
                globalShipdayConfig: config.shipday,
                posterContext: {},
            });

            if (!resolvedShipdayConfig.mockMode && !resolvedShipdayConfig.apiKey) {
                response.status(400).json({
                    ok: false,
                    message: 'Shipday API key не налаштований для цього акаунта.',
                    requiresAccountSettings: true,
                    settingsUrl: account ? buildSettingsUrl({
                        baseUrl: config.backendPublicUrl,
                        settingsPath: config.poster.settingsPath,
                        account,
                    }) : null,
                });
                return;
            }

            const shipdayResponse = resolvedShipdayConfig.mockMode
                ? await getMockShipdayOrder({
                    orderNumber: request.params.orderNumber,
                })
                : await getShipdayOrder({
                    apiBaseUrl: config.shipday.apiBaseUrl,
                    apiKey: resolvedShipdayConfig.apiKey,
                    authMode: resolvedShipdayConfig.authMode,
                    timeoutMs: config.shipday.timeoutMs,
                    orderNumber: request.params.orderNumber,
                });

            response.status(shipdayResponse.ok ? 200 : shipdayResponse.status).json({
                ok: shipdayResponse.ok,
                account,
                mode: resolvedShipdayConfig.mockMode ? 'mock' : 'live',
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
    const server = http.createServer(app);
    const shutdown = async (signal) => {
        console.log(`[server] Received ${signal}, shutting down...`);

        server.close(async () => {
            try {
                await storage.close();
                console.log('[server] Storage closed.');
            } catch (error) {
                console.error('[server] Failed to close storage cleanly.', error);
            } finally {
                process.exit(0);
            }
        });
    };

    process.once('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.once('SIGTERM', () => {
        void shutdown('SIGTERM');
    });

    return server.listen(config.port, () => {
        console.log(`[server] ${config.appName} listening on http://0.0.0.0:${config.port}`);
    });
};

if (entryFilePath && entryFilePath === currentFilePath) {
    startServer();
}
