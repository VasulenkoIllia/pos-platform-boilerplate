const getConfiguredBackendUrl = () => String(
    process.env.POSTER_BACKEND_BASE_URL || process.env.BACKEND_PUBLIC_URL || '',
).replace(/\/+$/, '');

const APP_CONFIG = {
    name: 'Shipday',
    description: 'Інтеграція Poster із Shipday.',
    iconLabels: {
        functions: 'Shipday',
        order: 'Shipday',
    },
    popup: {
        width: 540,
        height: 760,
        title: 'Shipday',
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
