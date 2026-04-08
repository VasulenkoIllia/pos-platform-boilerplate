const withTimeout = async (requestFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await requestFactory(controller.signal);
    } finally {
        clearTimeout(timeoutId);
    }
};

const parseJsonResponse = async (response) => {
    const text = await response.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return {
            raw: text,
        };
    }
};

const buildEndpointCandidates = ({
    account,
    apiBaseUrl,
    methodName,
}) => {
    const endpoints = [
        `https://${account}.joinposter.com/api/${methodName}`,
        `${String(apiBaseUrl || '').replace(/\/+$/, '')}/${methodName}`,
    ].filter(Boolean);

    return Array.from(new Set(endpoints));
};

const toArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value && typeof value === 'object') {
        return Object.values(value);
    }

    return [];
};

const normalizePosterSpot = (spot) => {
    const spotId = String(spot && (spot.spot_id || spot.spotId || spot.id) || '').trim();

    if (!spotId) {
        return null;
    }

    const name = String(
        (spot && (spot.name || spot.spot_name || spot.spotName || `Spot #${spotId}`)) || '',
    ).trim();
    const address = String(spot && spot.address || '').trim();
    const phone = String(spot && (spot.phone || spot.phone_number || '')).trim();

    return {
        spotId,
        name,
        address,
        phone,
        raw: spot,
    };
};

const extractSpots = (payload) => {
    const root = payload && (payload.response || payload.data || payload.result || payload);
    const candidateLists = [
        root && root.spots,
        root && root.spot,
        root,
    ];

    for (const candidate of candidateLists) {
        const items = toArray(candidate).map(normalizePosterSpot).filter(Boolean);

        if (items.length || Array.isArray(candidate)) {
            return items;
        }
    }

    return [];
};

const hasPosterApiError = payload => Boolean(
    payload
    && typeof payload === 'object'
    && (
        payload.error
        || payload.errors
        || payload.code
    ),
);

export const getPosterSpots = async ({
    account,
    accessToken,
    apiBaseUrl,
    timeoutMs,
}) => {
    const normalizedAccount = String(account || '').trim();
    const normalizedToken = String(accessToken || '').trim();

    if (!normalizedAccount || !normalizedToken) {
        throw new Error('Poster spots sync потребує account і access token.');
    }

    const attempts = [];
    const endpoints = buildEndpointCandidates({
        account: normalizedAccount,
        apiBaseUrl,
        methodName: 'spots.getSpots',
    });
    const tokenParamKeys = ['token', 'access_token'];

    for (const endpoint of endpoints) {
        for (const tokenParamKey of tokenParamKeys) {
            const url = new URL(endpoint);
            url.searchParams.set(tokenParamKey, normalizedToken);

            try {
                const response = await withTimeout(signal => fetch(url.toString(), {
                    method: 'GET',
                    signal,
                    headers: {
                        Accept: 'application/json',
                    },
                }), timeoutMs);
                const body = await parseJsonResponse(response);

                if (response.ok && !hasPosterApiError(body)) {
                    return {
                        endpoint,
                        tokenParamKey,
                        spots: extractSpots(body),
                        raw: body,
                    };
                }

                attempts.push({
                    endpoint,
                    tokenParamKey,
                    status: response.status,
                    body,
                });
            } catch (error) {
                attempts.push({
                    endpoint,
                    tokenParamKey,
                    error: error.message,
                });
            }
        }
    }

    const syncError = new Error('Poster не повернув список торгових точок.');
    syncError.details = attempts.map((attempt) => {
        if (attempt.error) {
            return `${attempt.endpoint} (${attempt.tokenParamKey}) -> ${attempt.error}`;
        }

        return `${attempt.endpoint} (${attempt.tokenParamKey}) -> HTTP ${attempt.status}`;
    });
    throw syncError;
};
