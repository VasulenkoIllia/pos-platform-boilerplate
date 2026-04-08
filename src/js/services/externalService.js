import APP_CONFIG from '../config';

const joinUrl = (baseUrl, path) => {
    const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
    const normalizedPath = String(path || '').replace(/^\/+/, '');

    return `${normalizedBaseUrl}/${normalizedPath}`;
};

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
        reject(new Error(`Запит перевищив таймаут ${timeoutMs}мс`));
    }, timeoutMs);

    promise
        .then((result) => {
            clearTimeout(timeoutId);
            resolve(result);
        })
        .catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
});

const safeReadJson = async (response) => {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.indexOf('application/json') === -1) {
        return null;
    }

    try {
        return await response.json();
    } catch (error) {
        return null;
    }
};

const buildStatus = ({
    state,
    label,
    message,
    checkedEndpoint,
    details,
}) => ({
    state,
    label,
    message,
    checkedEndpoint: checkedEndpoint || null,
    details: details || null,
});

export const getExternalServiceConfigSummary = () => {
    const serviceConfig = APP_CONFIG.externalService;

    if (!serviceConfig.baseUrl) {
        return 'Не налаштовано. Задайте POSTER_BACKEND_BASE_URL або BACKEND_PUBLIC_URL перед збіркою POS bundle.';
    }

    return joinUrl(serviceConfig.baseUrl, serviceConfig.healthcheckPath);
};

export const getExternalServiceStatus = async () => {
    const serviceConfig = APP_CONFIG.externalService;

    if (!serviceConfig.baseUrl) {
        return buildStatus({
            state: 'not-configured',
            label: 'Не налаштовано',
            message: 'База готова, але адресу backend/proxy для зовнішнього сервісу ще не задано.',
        });
    }

    if (typeof fetch !== 'function') {
        return buildStatus({
            state: 'error',
            label: 'Недоступний fetch',
            message: 'У цьому runtime немає fetch, тому healthcheck виконати неможливо.',
        });
    }

    const endpoint = joinUrl(serviceConfig.baseUrl, serviceConfig.healthcheckPath);

    try {
        const response = await withTimeout(fetch(endpoint, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        }), serviceConfig.timeoutMs);
        const details = await safeReadJson(response);

        if (!response.ok) {
            return buildStatus({
                state: 'error',
                label: 'Помилка відповіді',
                message: `${serviceConfig.name} повернув HTTP ${response.status}.`,
                checkedEndpoint: endpoint,
                details,
            });
        }

        return buildStatus({
            state: 'connected',
            label: 'Підключено',
            message: `${serviceConfig.name} відповідає і готовий до подальшої інтеграції.`,
            checkedEndpoint: endpoint,
            details,
        });
    } catch (error) {
        return buildStatus({
            state: 'error',
            label: 'Немає звʼязку',
            message: error.message || 'Не вдалося дістатися до зовнішнього сервісу.',
            checkedEndpoint: endpoint,
        });
    }
};
