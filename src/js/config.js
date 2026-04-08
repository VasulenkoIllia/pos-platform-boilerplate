const getConfiguredBackendUrl = () => String(
    process.env.POSTER_BACKEND_BASE_URL || process.env.BACKEND_PUBLIC_URL || '',
).replace(/\/+$/, '');

const APP_CONFIG = {
    name: 'POS Service Bridge',
    description: 'Базовий POS-застосунок для інтеграції Poster із зовнішнім сервісом.',
    iconLabels: {
        functions: 'Інтеграція',
        order: 'Інтеграція',
    },
    popup: {
        width: 540,
        height: 760,
        title: 'POS Service Bridge',
    },
    externalService: {
        name: 'Poster Render backend',
        baseUrl: getConfiguredBackendUrl(),
        healthcheckPath: '/health',
        timeoutMs: 8000,
        requireBackendProxy: true,
    },
};

export default APP_CONFIG;
