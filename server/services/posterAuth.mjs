const TOKEN_ENDPOINT_BUILDERS = [
    account => `https://${account}.joinposter.com/api/v2/auth/access_token`,
    account => `https://${account}.joinposter.com/api/auth/access_token`,
];

const TOKEN_FORM_BUILDERS = [
    ({ applicationId, applicationSecret, redirectUri, code }) => ({
        client_id: applicationId,
        client_secret: applicationSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
    }),
    ({ applicationId, applicationSecret, redirectUri, code }) => ({
        application_id: applicationId,
        application_secret: applicationSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
    }),
];

const withTimeout = async (requestFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await requestFactory(controller.signal);
    } finally {
        clearTimeout(timeoutId);
    }
};

const parseResponseBody = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!text) {
        return null;
    }

    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(text);
        } catch (error) {
            return { raw: text };
        }
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return { raw: text };
    }
};

export const buildPosterOauthUrl = ({
    applicationId,
    redirectUri,
    oauthBaseUrl,
    state,
}) => {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: applicationId,
        redirect_uri: redirectUri,
    });

    if (state) {
        params.set('state', state);
    }

    return `${oauthBaseUrl}?${params.toString()}`;
};

export const exchangePosterAuthCode = async ({
    account,
    code,
    applicationId,
    applicationSecret,
    redirectUri,
    timeoutMs,
}) => {
    const attempts = [];

    for (const buildEndpoint of TOKEN_ENDPOINT_BUILDERS) {
        for (const buildForm of TOKEN_FORM_BUILDERS) {
            const endpoint = buildEndpoint(account);
            const formData = buildForm({
                applicationId,
                applicationSecret,
                redirectUri,
                code,
            });
            const body = new URLSearchParams(formData);

            try {
                const response = await withTimeout(signal => fetch(endpoint, {
                    method: 'POST',
                    signal,
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body,
                }), timeoutMs);
                const parsedBody = await parseResponseBody(response);

                if (response.ok && parsedBody && parsedBody.access_token) {
                    return {
                        endpoint,
                        fieldSet: Object.keys(formData).join(','),
                        payload: parsedBody,
                    };
                }

                attempts.push({
                    endpoint,
                    fieldSet: Object.keys(formData).join(','),
                    status: response.status,
                    body: parsedBody,
                });
            } catch (error) {
                attempts.push({
                    endpoint,
                    fieldSet: Object.keys(formData).join(','),
                    error: error.message,
                });
            }
        }
    }

    const details = attempts.map((attempt) => {
        if (attempt.error) {
            return `${attempt.endpoint} (${attempt.fieldSet}) -> ${attempt.error}`;
        }

        return `${attempt.endpoint} (${attempt.fieldSet}) -> HTTP ${attempt.status}`;
    });

    const exchangeError = new Error('Poster не повернув access_token.');
    exchangeError.details = details;
    throw exchangeError;
};

export const toInstallationRecord = ({
    account,
    authResult,
}) => ({
    account,
    accessToken: authResult.payload.access_token,
    tokenType: authResult.payload.token_type || 'Bearer',
    receivedAt: new Date().toISOString(),
    endpoint: authResult.endpoint,
    ownerInfo: authResult.payload.ownerInfo || null,
    user: authResult.payload.user || null,
    raw: authResult.payload,
});
