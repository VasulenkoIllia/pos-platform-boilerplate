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

const normalizeFloat = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number.parseFloat(String(value));

    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value) => String(value || '').trim();

const buildNameFromParts = (...parts) => parts
    .map(part => normalizeText(part))
    .filter(Boolean)
    .join(' ')
    .trim();

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
        lat: normalizeFloat(spot && spot.lat),
        lng: normalizeFloat(spot && spot.lng),
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

const normalizePosterTransaction = (transaction) => {
    if (!transaction || typeof transaction !== 'object') {
        return null;
    }

    const transactionId = String(
        transaction.transaction_id
        || transaction.transactionId
        || transaction.id
        || '',
    ).trim();

    if (!transactionId) {
        return null;
    }

    return {
        transactionId,
        orderNumber: String(
            transaction.order_number
            || transaction.orderNumber
            || transaction.transaction_number
            || transaction.transactionNumber
            || transaction.order_name
            || transaction.orderName
            || transaction.number
            || '',
        ).trim(),
        spotId: String(transaction.spot_id || transaction.spotId || '').trim(),
        clientId: String(transaction.client_id || transaction.clientId || '').trim(),
        clientName: normalizeText(
            transaction.client_name
            || transaction.clientName
            || transaction.customerName
            || transaction.customer_name
            || buildNameFromParts(
                transaction.client_firstname,
                transaction.client_lastname,
            )
            || buildNameFromParts(
                transaction.clientFirstName,
                transaction.clientLastName,
            )
            || buildNameFromParts(
                transaction.first_name,
                transaction.last_name,
            ),
        ),
        clientPhone: String(transaction.client_phone || transaction.clientPhone || '').trim(),
        clientEmail: normalizeText(
            transaction.client_email
            || transaction.clientEmail
            || transaction.email,
        ),
        deliveryAddress: [
            transaction.delivery && transaction.delivery.country,
            transaction.delivery && transaction.delivery.city,
            transaction.delivery && transaction.delivery.address1,
            transaction.delivery && transaction.delivery.address2,
            transaction.delivery && transaction.delivery.zip_code,
        ].filter(Boolean).join(', ').trim(),
        deliveryComment: normalizeText(
            (transaction.delivery && transaction.delivery.comment)
            || transaction.delivery_comment
            || transaction.deliveryComment
            || transaction.transaction_comment,
        ),
        deliveryTime: String(
            (transaction.delivery && (
                transaction.delivery.delivery_time
                || transaction.delivery.deliveryTime
                || transaction.delivery.time
            ))
            || transaction.delivery_time
            || transaction.deliveryTime
            || '',
        ).trim(),
        sum: String(transaction.sum || '').trim(),
        raw: transaction,
    };
};

const extractTransaction = (payload) => {
    const root = payload && (payload.response || payload.data || payload.result || payload);
    const candidates = [
        Array.isArray(root) ? root[0] : root,
        root && Array.isArray(root.data) ? root.data[0] : null,
        root && root.transaction,
    ].filter(Boolean);

    for (const candidate of candidates) {
        const normalizedTransaction = normalizePosterTransaction(candidate);

        if (normalizedTransaction) {
            return normalizedTransaction;
        }
    }

    return null;
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

export const getPosterTransaction = async ({
    account,
    accessToken,
    apiBaseUrl,
    timeoutMs,
    transactionId,
}) => {
    const normalizedAccount = String(account || '').trim();
    const normalizedToken = String(accessToken || '').trim();
    const normalizedTransactionId = String(transactionId || '').trim();

    if (!normalizedAccount || !normalizedToken || !normalizedTransactionId) {
        return null;
    }

    const endpoints = buildEndpointCandidates({
        account: normalizedAccount,
        apiBaseUrl,
        methodName: 'dash.getTransaction',
    });
    const tokenParamKeys = ['token', 'access_token'];

    for (const endpoint of endpoints) {
        for (const tokenParamKey of tokenParamKeys) {
            const url = new URL(endpoint);
            url.searchParams.set(tokenParamKey, normalizedToken);
            url.searchParams.set('transaction_id', normalizedTransactionId);
            url.searchParams.set('include_delivery', 'true');
            url.searchParams.set('timezone', 'client');

            try {
                const response = await withTimeout(signal => fetch(url.toString(), {
                    method: 'GET',
                    signal,
                    headers: {
                        Accept: 'application/json',
                    },
                }), timeoutMs);
                const body = await parseJsonResponse(response);

                if (!response.ok || hasPosterApiError(body)) {
                    continue;
                }

                const transaction = extractTransaction(body);

                if (transaction) {
                    return {
                        endpoint,
                        tokenParamKey,
                        transaction,
                        raw: body,
                    };
                }
            } catch (error) {
                continue;
            }
        }
    }

    return null;
};
