const RUNTIME_LABELS = {
    android: 'Android tablet',
    iOS: 'iPad',
    windows: 'Windows app',
    desktop: 'Desktop app',
};

const MOCK_ENVIRONMENTS = {
    desktop: {
        android: false,
        iOS: false,
        windows: false,
        desktop: true,
    },
    windows: {
        android: false,
        iOS: false,
        windows: true,
        desktop: false,
    },
    android: {
        android: true,
        iOS: false,
        windows: false,
        desktop: false,
    },
    iOS: {
        android: false,
        iOS: true,
        windows: false,
        desktop: false,
    },
};

export const getPoster = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.Poster || null;
};

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

export const getPosterMode = () => {
    const poster = getPoster();

    if (!poster) {
        return 'none';
    }

    return poster.mockRuntime ? 'mock' : 'real';
};

export const isPosterAvailable = () => getPosterMode() !== 'none';

const normalizeEnvironment = environment => ({
    android: Boolean(environment.android),
    iOS: Boolean(environment.iOS),
    windows: Boolean(environment.windows),
    desktop: Boolean(environment.desktop),
});

export const getPosterEnvironment = () => {
    const poster = getPoster();

    if (!poster || !poster.environment) {
        return normalizeEnvironment({});
    }

    return normalizeEnvironment(poster.environment);
};

export const getPosterDebugState = () => {
    const poster = getPoster();

    if (!poster || !poster.mockRuntime || !poster.mockGetState) {
        return null;
    }

    return poster.mockGetState();
};

export const getRuntimeLabel = (environment) => {
    const runtimeKeys = ['desktop', 'windows', 'android', 'iOS'];

    for (const key of runtimeKeys) {
        if (environment[key]) {
            return RUNTIME_LABELS[key];
        }
    }

    return 'Preview mode';
};

export const registerPosterIcon = (places) => {
    const poster = getPoster();

    if (!poster || !poster.interface || !poster.interface.showApplicationIconAt) {
        return false;
    }

    poster.interface.showApplicationIconAt(places);
    return true;
};

export const openPosterPopup = (popupOptions) => {
    const poster = getPoster();

    if (!poster || !poster.interface || !poster.interface.popup) {
        return false;
    }

    poster.interface.popup(popupOptions);
    return true;
};

export const showPosterNotification = async (notification) => {
    const poster = getPoster();

    if (!poster || !poster.interface || !poster.interface.showNotification) {
        return null;
    }

    return poster.interface.showNotification(notification);
};

export const getPosterAccountHint = () => {
    if (typeof window === 'undefined') {
        return '';
    }

    const candidates = [
        window.location && window.location.href,
        document.referrer,
    ];
    const ancestorOrigins = document.location && document.location.ancestorOrigins
        ? Array.from(document.location.ancestorOrigins)
        : [];

    candidates.push(...ancestorOrigins);

    for (const candidate of candidates) {
        const account = extractPosterAccountFromUrl(candidate);

        if (account) {
            return account;
        }
    }

    const poster = getPoster();

    return poster && poster.mockRuntime && poster.mockAccount
        ? poster.mockAccount
        : '';
};

export const subscribeToPosterEvent = (eventName, handler) => {
    const poster = getPoster();

    if (!poster || !poster.on) {
        return false;
    }

    poster.on(eventName, handler);
    return true;
};

export const getPosterActiveOrder = async () => {
    const poster = getPoster();

    if (!poster || !poster.orders || !poster.orders.getActive) {
        return null;
    }

    return poster.orders.getActive();
};

export const getPosterClient = async (clientId) => {
    const poster = getPoster();

    if (!poster || !poster.clients || !poster.clients.get || !clientId) {
        return null;
    }

    return poster.clients.get(clientId);
};

export const getPosterProductFullName = async (params) => {
    const poster = getPoster();

    if (!poster || !poster.products || !poster.products.getFullName || !params || !params.id) {
        return null;
    }

    return poster.products.getFullName(params);
};

export const simulatePosterIconClick = (place) => {
    const poster = getPoster();

    if (!poster || !poster.mockSimulateApplicationClick) {
        return false;
    }

    poster.mockSimulateApplicationClick(place);
    return true;
};

export const closePosterMockPopup = () => {
    const poster = getPoster();

    if (!poster || !poster.mockClosePopup) {
        return false;
    }

    poster.mockClosePopup();
    return true;
};

export const setPosterMockEnvironment = (runtimeKey) => {
    const poster = getPoster();
    const environment = MOCK_ENVIRONMENTS[runtimeKey];

    if (!poster || !poster.mockSetEnvironment || !environment) {
        return false;
    }

    poster.mockSetEnvironment(environment);
    return true;
};
