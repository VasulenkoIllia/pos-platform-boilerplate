import APP_CONFIG from '../config';

const buildEndpoint = (path) => {
    const baseUrl = String(APP_CONFIG.externalService.baseUrl || '').replace(/\/+$/, '');
    const normalizedPath = String(path || '').replace(/^\/+/, '');

    if (!baseUrl) {
        throw new Error('Backend URL не задано. Збери POS bundle з POSTER_BACKEND_BASE_URL.');
    }

    return `${baseUrl}/${normalizedPath}`;
};

const readJsonResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!text) {
        return null;
    }

    if (contentType.indexOf('application/json') === -1) {
        return { raw: text };
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return { raw: text };
    }
};

const sendOrderToShipday = async (requestPayload) => {
    const accountHint = String(
        (requestPayload && requestPayload.account) || '',
    ).trim();
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };

    if (accountHint) {
        headers['X-Poster-Account-Hint'] = accountHint;
    }

    const response = await fetch(buildEndpoint('/api/shipday/orders'), {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(requestPayload),
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
        const error = new Error((body && body.message) || `Shipday proxy повернув HTTP ${response.status}.`);
        error.response = body;
        throw error;
    }

    return body;
};

export default sendOrderToShipday;
