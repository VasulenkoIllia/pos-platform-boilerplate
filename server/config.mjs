import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const normalizeBaseUrl = value => String(value || '').replace(/\/+$/, '');

const toUrl = (baseUrl, routePath) => {
    if (!baseUrl) {
        return '';
    }

    return new URL(routePath, `${baseUrl}/`).toString();
};

const parseInteger = (value, fallback) => {
    const parsed = Number.parseInt(String(value || ''), 10);

    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseFloatValue = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number.parseFloat(String(value));

    return Number.isFinite(parsed) ? parsed : null;
};

const config = {
    appName: 'Poster Shipday Bridge',
    port: parseInteger(process.env.PORT, 8787),
    nodeEnv: process.env.NODE_ENV || 'development',
    backendPublicUrl: normalizeBaseUrl(process.env.BACKEND_PUBLIC_URL),
    poster: {
        applicationId: String(process.env.POSTER_APPLICATION_ID || '').trim(),
        applicationSecret: String(process.env.POSTER_APPLICATION_SECRET || '').trim(),
        apiBaseUrl: normalizeBaseUrl(process.env.POSTER_API_BASE_URL || 'https://joinposter.com/api'),
        connectPath: process.env.POSTER_CONNECT_PATH || '/poster/connect',
        settingsPath: process.env.POSTER_SETTINGS_PATH || '/poster/settings',
        oauthStartPath: '/poster/oauth/start',
        redirectPath: process.env.POSTER_REDIRECT_PATH || '/poster/auth/callback',
        successPath: process.env.POSTER_SUCCESS_PATH || '/poster/connect/success',
        oauthBaseUrl: 'https://joinposter.com/api/auth',
        installationsFile: path.resolve(
            repoRoot,
            process.env.POSTER_INSTALLATIONS_FILE || '.data/poster-installations.json',
        ),
        accountSettingsFile: path.resolve(
            repoRoot,
            process.env.POSTER_ACCOUNT_SETTINGS_FILE || '.data/poster-account-settings.json',
        ),
        apiTimeoutMs: parseInteger(process.env.POSTER_API_TIMEOUT_MS, 15000),
        tokenExchangeTimeoutMs: parseInteger(process.env.POSTER_AUTH_TIMEOUT_MS, 15000),
    },
    security: {
        settingsSecret: String(
            process.env.SETTINGS_ENCRYPTION_SECRET
            || process.env.POSTER_APPLICATION_SECRET
            || 'poster-shipday-bridge-dev-secret',
        ).trim(),
    },
    shipday: {
        apiBaseUrl: normalizeBaseUrl(process.env.SHIPDAY_API_BASE_URL || 'https://api.shipday.com'),
        apiKey: String(process.env.SHIPDAY_API_KEY || '').trim(),
        authMode: String(process.env.SHIPDAY_AUTH_MODE || 'x-api-key').trim(),
        mockMode: String(process.env.SHIPDAY_MOCK_MODE || '').trim() === 'true'
            || !String(process.env.SHIPDAY_API_KEY || '').trim(),
        timeoutMs: parseInteger(process.env.SHIPDAY_TIMEOUT_MS, 15000),
        defaultPickup: {
            name: String(process.env.SHIPDAY_PICKUP_NAME || '').trim(),
            phone: String(process.env.SHIPDAY_PICKUP_PHONE || '').trim(),
            address: String(process.env.SHIPDAY_PICKUP_ADDRESS || '').trim(),
            formattedAddress: String(process.env.SHIPDAY_PICKUP_FORMATTED_ADDRESS || '').trim(),
            lat: parseFloatValue(process.env.SHIPDAY_PICKUP_LAT),
            lng: parseFloatValue(process.env.SHIPDAY_PICKUP_LNG),
        },
    },
};

if (config.shipday.mockMode) {
    config.shipday.defaultPickup = {
        name: config.shipday.defaultPickup.name || 'Poster Test Pickup',
        phone: config.shipday.defaultPickup.phone || '+380000000000',
        address: config.shipday.defaultPickup.address || 'Kyiv, Test Pickup 1',
        formattedAddress: config.shipday.defaultPickup.formattedAddress || 'Kyiv, Test Pickup 1',
        lat: config.shipday.defaultPickup.lat,
        lng: config.shipday.defaultPickup.lng,
    };
}

config.urls = {
    connect: toUrl(config.backendPublicUrl, config.poster.connectPath),
    settings: toUrl(config.backendPublicUrl, config.poster.settingsPath),
    oauthStart: toUrl(config.backendPublicUrl, config.poster.oauthStartPath),
    oauthCallback: toUrl(config.backendPublicUrl, config.poster.redirectPath),
    connectSuccess: toUrl(config.backendPublicUrl, config.poster.successPath),
    health: toUrl(config.backendPublicUrl, '/health'),
    shipdayOrders: toUrl(config.backendPublicUrl, '/api/shipday/orders'),
};

export const getMissingPosterAuthConfig = () => {
    const missing = [];

    if (!config.backendPublicUrl) {
        missing.push('BACKEND_PUBLIC_URL');
    }

    if (!config.poster.applicationId) {
        missing.push('POSTER_APPLICATION_ID');
    }

    if (!config.poster.applicationSecret) {
        missing.push('POSTER_APPLICATION_SECRET');
    }

    return missing;
};

export const getMissingShipdayConfig = () => {
    if (config.shipday.mockMode) {
        return [];
    }

    const missing = [];

    if (!config.shipday.apiKey) {
        missing.push('SHIPDAY_API_KEY');
    }

    return missing;
};

export default config;
