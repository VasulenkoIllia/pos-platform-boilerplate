import 'dotenv/config';

import crypto from 'node:crypto';
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
    renderAccountChooserPage,
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
import { getPosterSpots, getPosterTransaction } from './services/posterWebApi.mjs';
import {
    createMockShipdayOrder,
    createShipdayOrder,
    getMockShipdayOrder,
    getShipdayOrder,
    normalizeShipdayOrderPayload,
} from './services/shipdayClient.mjs';

const storage = await createStorage(config);
const { installationsStore, accountSettingsStore, orderLogStore } = storage;
const currentFilePath = fileURLToPath(import.meta.url);
const entryFilePath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const ACCOUNT_SESSION_COOKIE_NAME = 'poster_shipday_session';
const ACCOUNT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const isLocalHostname = hostname => ['localhost', '127.0.0.1', '::1'].includes(hostname);

const extractPosterAccountFromUrl = (value) => {
    if (!value) {
        return '';
    }

    try {
        const { hostname } = new URL(value);

        if (!hostname.endsWith('.joinposter.com')) {
            return '';
        }

        return hostname.replace(/\.joinposter\.com$/, '').split('.')[0] || '';
    } catch (error) {
        return '';
    }
};

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

        if (isLocalHostname(hostname) && config.nodeEnv !== 'production') {
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
const normalizeText = value => String(value || '').trim();
const normalizeComparableText = value => normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
const normalizePhone = value => String(value || '').replace(/[^\d+]/g, '');

const parseCookies = (request) => {
    const header = String(request.headers.cookie || '').trim();

    if (!header) {
        return {};
    }

    return header.split(';').reduce((accumulator, chunk) => {
        const [rawKey, ...rest] = chunk.split('=');
        const key = String(rawKey || '').trim();

        if (!key) {
            return accumulator;
        }

        accumulator[key] = decodeURIComponent(rest.join('=').trim());
        return accumulator;
    }, {});
};

const toBase64Url = value => Buffer.from(value).toString('base64url');

const signAccountSessionPayload = payload => crypto
    .createHmac('sha256', config.security.settingsSecret)
    .update(payload)
    .digest('base64url');

const normalizeAuthorizedAccounts = accounts => Array.from(new Set(
    (Array.isArray(accounts) ? accounts : [])
        .map(normalizeAccount)
        .filter(Boolean),
)).slice(0, 25);

const readAccountSession = (request) => {
    const cookies = parseCookies(request);
    const rawValue = cookies[ACCOUNT_SESSION_COOKIE_NAME];

    if (!rawValue) {
        return {
            accounts: [],
            selectedAccount: '',
        };
    }

    const [encodedPayload, signature] = String(rawValue).split('.');

    if (!encodedPayload || !signature) {
        return {
            accounts: [],
            selectedAccount: '',
        };
    }

    const expectedSignature = signAccountSessionPayload(encodedPayload);
    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureBuffer = Buffer.from(signature);

    if (
        expectedBuffer.length !== signatureBuffer.length
        || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
        return {
            accounts: [],
            selectedAccount: '',
        };
    }

    try {
        const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        const accounts = normalizeAuthorizedAccounts(parsed.accounts);
        const selectedAccount = normalizeAccount(parsed.selectedAccount);

        return {
            accounts,
            selectedAccount: accounts.includes(selectedAccount) ? selectedAccount : '',
        };
    } catch (error) {
        return {
            accounts: [],
            selectedAccount: '',
        };
    }
};

const buildAccountSession = ({
    existingSession,
    account,
}) => {
    const normalizedAccount = normalizeAccount(account);
    const accounts = normalizeAuthorizedAccounts([
        ...(existingSession && Array.isArray(existingSession.accounts) ? existingSession.accounts : []),
        normalizedAccount,
    ]);

    return {
        accounts,
        selectedAccount: accounts.includes(normalizedAccount)
            ? normalizedAccount
            : (accounts[0] || ''),
        issuedAt: new Date().toISOString(),
    };
};

const setAccountSessionCookie = (response, session) => {
    const safeSession = {
        accounts: normalizeAuthorizedAccounts(session && session.accounts),
        selectedAccount: normalizeAccount(session && session.selectedAccount),
        issuedAt: session && session.issuedAt ? session.issuedAt : new Date().toISOString(),
    };
    const encodedPayload = toBase64Url(JSON.stringify(safeSession));
    const signature = signAccountSessionPayload(encodedPayload);
    const cookieParts = [
        `${ACCOUNT_SESSION_COOKIE_NAME}=${encodeURIComponent(`${encodedPayload}.${signature}`)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${ACCOUNT_SESSION_MAX_AGE_SECONDS}`,
    ];

    if (config.nodeEnv === 'production') {
        cookieParts.push('Secure');
    }

    response.setHeader('Set-Cookie', cookieParts.join('; '));
};

const getAuthorizedSessionAccounts = async (request) => {
    const session = readAccountSession(request);
    const accounts = normalizeAuthorizedAccounts(session.accounts);
    const authorizedAccounts = [];

    for (const account of accounts) {
        const [installation, settings] = await Promise.all([
            installationsStore.get(account),
            accountSettingsStore.get(account),
        ]);

        if (installation || settings) {
            authorizedAccounts.push({
                account,
                installation,
                settings,
            });
        }
    }

    return {
        session,
        authorizedAccounts,
    };
};

const pickSettingsAccountFromSession = ({
    requestedAccount,
    session,
    authorizedAccounts,
}) => {
    const authorizedNames = authorizedAccounts.map(item => item.account);

    if (requestedAccount) {
        return authorizedNames.includes(requestedAccount) ? requestedAccount : '';
    }

    const selectedAccount = normalizeAccount(session && session.selectedAccount);

    if (selectedAccount && authorizedNames.includes(selectedAccount)) {
        return selectedAccount;
    }

    return authorizedNames.length === 1 ? authorizedNames[0] : '';
};

const getPosterBodyHints = (request) => {
    if (!request.body || typeof request.body !== 'object') {
        return [];
    }

    const poster = request.body.poster && typeof request.body.poster === 'object'
        ? request.body.poster
        : {};

    return [
        request.body.account,
        request.query.account,
        request.params.account,
        request.get('x-poster-account-hint'),
        poster.account,
        poster.accountHint,
    ]
        .map(normalizeAccount)
        .filter(Boolean);
};

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

const extractRequestOrderLookupHints = (request) => {
    if (!request.body || typeof request.body !== 'object') {
        return {
            transactionId: '',
            customerPhone: '',
            deliveryAddress: '',
        };
    }

    const poster = request.body.poster && typeof request.body.poster === 'object'
        ? request.body.poster
        : {};
    const payload = request.body.payload && typeof request.body.payload === 'object'
        ? request.body.payload
        : {};

    return {
        transactionId: normalizeText(
            poster.transactionId
            || poster.orderId,
        ),
        customerPhone: normalizePhone(
            payload.customerPhoneNumber
            || payload.customerPhone,
        ),
        deliveryAddress: normalizeComparableText(
            payload.customerAddress
            || payload.deliveryAddress,
        ),
    };
};

const getPosterOrderCandidateScore = ({
    hints,
    transaction,
}) => {
    let score = 0;

    if (hints.customerPhone && normalizePhone(transaction.clientPhone) === hints.customerPhone) {
        score += 2;
    }

    if (
        hints.deliveryAddress
        && normalizeComparableText(transaction.deliveryAddress) === hints.deliveryAddress
    ) {
        score += 2;
    }

    return score;
};

const resolveRequestAccountByPosterOrder = async ({
    request,
    installations,
}) => {
    const hints = extractRequestOrderLookupHints(request);

    if (!hints.transactionId || !Array.isArray(installations) || !installations.length) {
        return '';
    }

    const candidates = [];

    for (const installation of installations) {
        try {
            const result = await getPosterTransaction({
                account: installation.account,
                accessToken: installation.accessToken,
                apiBaseUrl: config.poster.apiBaseUrl,
                timeoutMs: config.poster.apiTimeoutMs,
                transactionId: hints.transactionId,
            });

            if (result && result.transaction) {
                candidates.push({
                    account: installation.account,
                    transaction: result.transaction,
                    score: getPosterOrderCandidateScore({
                        hints,
                        transaction: result.transaction,
                    }),
                });
            }
        } catch (error) {
            console.warn(
                `[resolveRequestAccount] Не вдалося перевірити transaction_id "${hints.transactionId}" ` +
                `для account "${installation.account}": ${error.message}`,
            );
        }
    }

    if (!candidates.length) {
        return '';
    }

    if (candidates.length === 1) {
        return candidates[0].account;
    }

    const highestScore = Math.max(...candidates.map(candidate => candidate.score));

    if (highestScore <= 0) {
        return '';
    }

    const strongestCandidates = candidates.filter(candidate => candidate.score === highestScore);

    return strongestCandidates.length === 1
        ? strongestCandidates[0].account
        : '';
};

const resolvePosterTransactionForAccount = async ({
    request,
    account,
}) => {
    const normalizedAccount = normalizeAccount(account);
    const hints = extractRequestOrderLookupHints(request);

    if (!normalizedAccount || !hints.transactionId) {
        return null;
    }

    const installation = await installationsStore.get(normalizedAccount);

    if (!installation) {
        return null;
    }

    try {
        const result = await getPosterTransaction({
            account: installation.account,
            accessToken: installation.accessToken,
            apiBaseUrl: config.poster.apiBaseUrl,
            timeoutMs: config.poster.apiTimeoutMs,
            transactionId: hints.transactionId,
        });

        return result && result.transaction ? result.transaction : null;
    } catch (error) {
        console.warn(
            `[resolvePosterTransactionForAccount] Не вдалося дотягнути transaction_id "${hints.transactionId}" ` +
            `для account "${normalizedAccount}": ${error.message}`,
        );
        return null;
    }
};

const resolveRequestAccount = async (request) => {
    const explicitHints = Array.from(new Set(getPosterBodyHints(request)));

    for (const explicitAccount of explicitHints) {
        const [installation, settings] = await Promise.all([
            installationsStore.get(explicitAccount),
            accountSettingsStore.get(explicitAccount),
        ]);

        if (installation || settings) {
            return explicitAccount;
        }
    }

    if (explicitHints.length) {
        console.warn(
            `[resolveRequestAccount] Account hints "${explicitHints.join(', ')}" не знайдені в БД. ` +
            'Перевіряємо заголовки та fallback.',
        );
    }

    const accountFromHeaders = [
        request.get('origin'),
        request.get('referer'),
    ]
        .map(extractPosterAccountFromUrl)
        .find(Boolean);

    if (accountFromHeaders) {
        const [installation, settings] = await Promise.all([
            installationsStore.get(accountFromHeaders),
            accountSettingsStore.get(accountFromHeaders),
        ]);

        if (installation || settings) {
            return accountFromHeaders;
        }
    }

    const installations = await installationsStore.list();

    if (installations.length > 1) {
        const accountFromPosterOrder = await resolveRequestAccountByPosterOrder({
            request,
            installations,
        });

        if (accountFromPosterOrder) {
            if (explicitHints.length) {
                console.warn(
                    `[resolveRequestAccount] Використовуємо account "${accountFromPosterOrder}" ` +
                    'через lookup по transaction_id замовлення.',
                );
            }

            return accountFromPosterOrder;
        }
    }

    if (installations.length === 1) {
        if (explicitHints.length) {
            console.warn(
                `[resolveRequestAccount] Fallback: використовуємо єдину інсталяцію "${installations[0].account}" ` +
                `замість невідомих account hints "${explicitHints.join(', ')}".`,
            );
        }

        return installations[0].account;
    }

    if (installations.length > 1 && explicitHints.length) {
        console.error(
            `[resolveRequestAccount] Account hints "${explicitHints.join(', ')}" не знайдені, ` +
            `а в БД ${installations.length} інсталяцій — неможливо визначити заклад.`,
        );
    }

    return '';
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

const extractShipdayOrderId = (shipdayBody) => {
    if (!shipdayBody || typeof shipdayBody !== 'object') {
        return '';
    }

    const candidates = [
        shipdayBody.orderId,
        shipdayBody.id,
        shipdayBody.data && shipdayBody.data.orderId,
        shipdayBody.data && shipdayBody.data.id,
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

    // Security headers
    app.use((request, response, next) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Frame-Options', 'DENY');
        response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        response.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

        if (config.nodeEnv === 'production') {
            response.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
        }

        next();
    });

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

        response.json({
            ok: true,
            service: config.appName,
            environment: config.nodeEnv,
            poster: {
                applicationIdConfigured: Boolean(config.poster.applicationId),
                applicationSecretConfigured: Boolean(config.poster.applicationSecret),
                connectUrl: config.urls.connect || null,
                oauthCallbackUrl: config.urls.oauthCallback || null,
                hasInstallations: installations.length > 0,
                hasAccountSettings: accountSettings.length > 0,
            },
            shipday: {
                configured: accountSettings.some(settings => settings.shipday && settings.shipday.apiKeyConfigured),
                globalFallbackMockMode: config.shipday.mockMode,
                apiBaseUrl: config.shipday.apiBaseUrl,
                globalFallbackAuthMode: config.shipday.authMode,
                ordersEndpoint: config.urls.shipdayOrders || null,
                webhookEndpoint: config.urls.shipdayWebhook || null,
                webhookTokenConfigured: Boolean(config.shipday.webhookToken),
                fallbackConfigured: Boolean(config.shipday.apiKey),
            },
            storage: {
                driver: storage.driver,
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
            setAccountSessionCookie(response, buildAccountSession({
                existingSession: readAccountSession(request),
                account,
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
        const requestedAccount = normalizeAccount(request.query.account);
        const { session, authorizedAccounts } = await getAuthorizedSessionAccounts(request);
        const account = pickSettingsAccountFromSession({
            requestedAccount,
            session,
            authorizedAccounts,
        });

        if (!account) {
            response.status(authorizedAccounts.length ? 400 : 403).type('html').send(renderAccountChooserPage({
                appName: config.appName,
                accounts: authorizedAccounts.map(item => ({
                    account: item.account,
                    oauthConnected: Boolean(item.installation),
                    shipdayConfigured: Boolean(item.settings && item.settings.shipday && item.settings.shipday.apiKeyConfigured),
                })),
                settingsPath: config.poster.settingsPath,
                connectPath: config.poster.connectPath,
                notice: requestedAccount
                    ? `У цьому браузері немає доступу до акаунта ${requestedAccount}. Спочатку підключи його через Poster OAuth.`
                    : '',
                description: authorizedAccounts.length
                    ? 'У цьому браузері доступно кілька підключених Poster акаунтів. Обери, для якого акаунта відкрити Shipday settings.'
                    : 'У цьому браузері ще немає доступу до Poster акаунтів. Спочатку відкрий connect flow для потрібного акаунта.',
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
            setAccountSessionCookie(response, {
                ...session,
                accounts: normalizeAuthorizedAccounts([
                    ...authorizedAccounts.map(item => item.account),
                    account,
                ]),
                selectedAccount: account,
                issuedAt: new Date().toISOString(),
            });
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

        const { session, authorizedAccounts } = await getAuthorizedSessionAccounts(request);

        if (!authorizedAccounts.some(item => item.account === account)) {
            response.status(403).type('html').send(renderAccountChooserPage({
                appName: config.appName,
                accounts: authorizedAccounts.map(item => ({
                    account: item.account,
                    oauthConnected: Boolean(item.installation),
                    shipdayConfigured: Boolean(item.settings && item.settings.shipday && item.settings.shipday.apiKeyConfigured),
                })),
                settingsPath: config.poster.settingsPath,
                connectPath: config.poster.connectPath,
                notice: `Немає доступу до акаунта ${account}. Збереження налаштувань заблоковано.`,
                description: authorizedAccounts.length
                    ? 'У цьому браузері можна змінювати тільки ті акаунти, які були підключені через Poster OAuth.'
                    : 'Спочатку підключи потрібний Poster акаунт через connect flow.',
            }));
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
            setAccountSessionCookie(response, {
                ...session,
                accounts: normalizeAuthorizedAccounts([
                    ...authorizedAccounts.map(item => item.account),
                    account,
                ]),
                selectedAccount: account,
                issuedAt: new Date().toISOString(),
            });

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
        const { authorizedAccounts } = await getAuthorizedSessionAccounts(request);

        response.json({
            ok: true,
            items: authorizedAccounts
                .filter(item => item.installation)
                .map(item => toPublicInstallation(item.installation)),
        });
    });

    app.get('/api/poster/installations/:account', async (request, response) => {
        const account = normalizeAccount(request.params.account);
        const { authorizedAccounts } = await getAuthorizedSessionAccounts(request);

        if (!authorizedAccounts.some(item => item.account === account)) {
            response.status(403).json({
                ok: false,
                message: 'Немає доступу до цього Poster account.',
            });
            return;
        }

        const installation = await installationsStore.get(account);

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
        const account = normalizeAccount(request.params.account);
        const { authorizedAccounts } = await getAuthorizedSessionAccounts(request);

        if (!authorizedAccounts.some(item => item.account === account)) {
            response.status(403).json({
                ok: false,
                message: 'Немає доступу до цього Poster account.',
            });
            return;
        }

        const settings = await accountSettingsStore.get(account);

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
            const rawPosterContext = request.body.poster && typeof request.body.poster === 'object'
                ? request.body.poster
                : {};
            const requiresPosterTransactionLookup = !normalizeText(
                rawPosterContext.spotId
                || rawPosterContext.spot_id,
            );
            const posterTransaction = requiresPosterTransactionLookup
                ? await resolvePosterTransactionForAccount({
                    request,
                    account,
                })
                : null;
            const posterContext = {
                ...rawPosterContext,
                transactionId: normalizeText(
                    rawPosterContext.transactionId
                    || rawPosterContext.transaction_id
                    || (posterTransaction && posterTransaction.transactionId)
                    || '',
                ),
                spotId: normalizeText(
                    rawPosterContext.spotId
                    || rawPosterContext.spot_id
                    || (posterTransaction && posterTransaction.spotId)
                    || '',
                ),
            };
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

            if (!resolvedShipdayConfig.apiKey && !resolvedShipdayConfig.isExplicitMockMode) {
                response.status(400).json({
                    ok: false,
                    message: 'Shipday API key не налаштований для цього акаунта. Відкрий settings і додай ключ, або явно ввімкни Mock Mode.',
                    requiresAccountSettings: true,
                    settingsUrl: buildSettingsUrl({
                        baseUrl: config.backendPublicUrl,
                        settingsPath: config.poster.settingsPath,
                        account,
                    }) || null,
                });
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
            const shipdayOrderId = extractShipdayOrderId(shipdayResponse.body);
            const responsePayload = {
                ok: shipdayResponse.ok && confirmed,
                account,
                mode: resolvedShipdayConfig.mockMode ? 'mock' : 'live',
                httpStatus: shipdayResponse.status,
                confirmed,
                reference: reference || null,
                shipdayOrderId: shipdayOrderId || null,
                resolvedConfig: {
                    account,
                    authMode: resolvedShipdayConfig.authMode,
                    mockMode: resolvedShipdayConfig.mockMode,
                    hasConfiguredApiKey: resolvedShipdayConfig.hasConfiguredApiKey,
                    resolvedSpotId: resolvedShipdayConfig.resolvedSpotId || null,
                },
                posterContextResolved: {
                    transactionId: posterContext.transactionId || null,
                    spotId: posterContext.spotId || null,
                    transactionLookupUsed: Boolean(posterTransaction),
                },
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

            if (!shipdayResponse.ok) {
                response.status(shipdayResponse.status).json({
                    ...responsePayload,
                    message: (
                        shipdayResponse.body
                        && (
                            shipdayResponse.body.errorMessage
                            || shipdayResponse.body.message
                            || shipdayResponse.body.raw
                        )
                    ) || `Shipday повернув HTTP ${shipdayResponse.status}.`,
                });
                return;
            }

            // Зберігаємо orderNumber → account для подальшого пошуку по webhook / TurboSMS
            try {
                await orderLogStore.save({
                    account,
                    orderNumber: payload.orderNumber,
                    shipdayOrderId: shipdayOrderId || null,
                    spotId: resolvedShipdayConfig.resolvedSpotId || null,
                    customerPhone: payload.customerPhoneNumber || null,
                    mockMode: resolvedShipdayConfig.mockMode,
                });
            } catch (logError) {
                console.error('[order_log] Не вдалося зберегти запис:', logError.message);
            }

            response.status(201).json(responsePayload);
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

    app.post('/webhooks/shipday', async (request, response) => {
        // Верифікація webhook token (налаштовується в Shipday Dashboard)
        const expectedToken = config.shipday.webhookToken;

        if (expectedToken) {
            const receivedToken = String(request.headers['token'] || request.headers['x-shipday-token'] || '');
            const expectedBuf = Buffer.from(expectedToken);
            const receivedBuf = Buffer.from(receivedToken);
            const tokenValid = expectedBuf.length === receivedBuf.length
                && crypto.timingSafeEqual(expectedBuf, receivedBuf);

            if (!tokenValid) {
                console.warn('[webhook/shipday] Невірний token у запиті.');
                response.status(401).json({ ok: false, message: 'Невірний webhook token.' });
                return;
            }
        }

        const body = request.body;
        const event = body && body.event;
        const orderNumber = body && body.order && body.order.orderNumber;
        const shipdayOrderId = String(
            (body && body.order && (
                body.order.orderId
                || body.order.id
            )) || '',
        ).trim();

        console.log(
            `[webhook/shipday] Отримано подію: ${event || 'unknown'}, ` +
            `orderNumber: ${orderNumber || 'n/a'}, shipdayOrderId: ${shipdayOrderId || 'n/a'}`,
        );

        let account = null;

        if (shipdayOrderId) {
            try {
                const logEntry = await orderLogStore.findByShipdayOrderId(shipdayOrderId);

                if (logEntry) {
                    account = logEntry.account;
                }
            } catch (lookupError) {
                console.error('[webhook/shipday] Помилка пошуку order_log по shipdayOrderId:', lookupError.message);
            }
        }

        if (!account && orderNumber) {
            try {
                const logEntry = await orderLogStore.findUniqueByOrderNumber(String(orderNumber));

                if (logEntry) {
                    account = logEntry.account;
                }
            } catch (lookupError) {
                console.error('[webhook/shipday] Помилка пошуку order_log по orderNumber:', lookupError.message);
            }
        }

        if (!account) {
            console.warn(
                `[webhook/shipday] Не вдалося безпечно знайти account для ` +
                `orderNumber "${orderNumber || 'n/a'}" / shipdayOrderId "${shipdayOrderId || 'n/a'}". Ігноруємо.`,
            );
            // Повертаємо 200 щоб Shipday не повторював запит
            response.status(200).json({ ok: true, message: 'Webhook отримано, account не знайдено — проігноровано.' });
            return;
        }

        // TODO: Тут буде логіка відправки TurboSMS для подій ORDER_ONTHEWAY / ORDER_ASSIGNED
        // const customerPhone = body.order && body.order.customer && body.order.customer.phone;
        // const trackingLink = body.order && body.order.trackingLink;

        console.log(`[webhook/shipday] Подія ${event} для замовлення ${orderNumber} (account: ${account}) — TurboSMS ще не реалізовано.`);

        response.status(200).json({
            ok: true,
            event: event || null,
            account,
            orderNumber: orderNumber || null,
            message: 'Webhook отримано.',
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

        console.error('[server] Unhandled error:', error);
        response.status(500).json({
            ok: false,
            message: 'Внутрішня помилка сервера.',
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
