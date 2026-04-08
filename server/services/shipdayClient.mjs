import { z } from 'zod';

const LocationSchema = z.object({
    name: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    formattedAddress: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
}).passthrough();

const ShipdayOrderSchema = z.object({
    orderNumber: z.union([z.string(), z.number()]),
    orderItem: z.string().trim().min(1).optional(),
    paymentMethod: z.string().trim().min(1).optional(),
    orderSource: z.string().trim().min(1).optional(),
    orderTotal: z.number().finite().optional(),
    deliveryFee: z.number().finite().optional(),
    discount: z.number().finite().optional(),
    tip: z.number().finite().optional(),
    tax: z.number().finite().optional(),
    deliveryInstruction: z.string().trim().min(1).optional(),
    requestedPickupTime: z.string().trim().min(1).optional(),
    requestedDeliveryTime: z.string().trim().min(1).optional(),
    pickup: LocationSchema.optional(),
    delivery: LocationSchema,
    items: z.array(z.object({
        name: z.string().trim().min(1),
        quantity: z.number().finite().optional(),
        price: z.number().finite().optional(),
    }).passthrough()).optional(),
    totals: z.object({
        orderTotal: z.number().finite().optional(),
        deliveryFee: z.number().finite().optional(),
        discount: z.number().finite().optional(),
        tip: z.number().finite().optional(),
        tax: z.number().finite().optional(),
    }).passthrough().optional(),
}).passthrough();

const readJsonResponse = async (response) => {
    const text = await response.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return { raw: text };
    }
};

const withTimeout = async (requestFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await requestFactory(controller.signal);
    } finally {
        clearTimeout(timeoutId);
    }
};

const formatItems = items => items
    .map((item) => {
        const quantity = item.quantity ? `x${item.quantity}` : '';
        const price = typeof item.price === 'number' ? `(${item.price})` : '';

        return [item.name, quantity, price].filter(Boolean).join(' ');
    })
    .join(', ');

const ensureLocation = (label, location) => {
    if (!location || (!location.address && !location.formattedAddress)) {
        throw new Error(`${label} повинен містити address або formattedAddress.`);
    }

    if (!location.name) {
        throw new Error(`${label} повинен містити name.`);
    }
};

export const normalizeShipdayOrderPayload = ({
    input,
    defaultPickup,
}) => {
    const payload = input && input.payload ? input.payload : input;
    const parsed = ShipdayOrderSchema.parse(payload);
    const pickup = {
        ...defaultPickup,
        ...(parsed.pickup || {}),
    };
    const delivery = {
        ...parsed.delivery,
    };
    const normalizedPayload = {
        ...parsed,
        orderNumber: String(parsed.orderNumber),
        pickup,
        delivery,
        orderSource: parsed.orderSource || 'Poster POS Service Bridge',
    };

    if (!normalizedPayload.orderItem && parsed.items && parsed.items.length) {
        normalizedPayload.orderItem = formatItems(parsed.items);
    }

    if (parsed.totals) {
        normalizedPayload.orderTotal = normalizedPayload.orderTotal ?? parsed.totals.orderTotal;
        normalizedPayload.deliveryFee = normalizedPayload.deliveryFee ?? parsed.totals.deliveryFee;
        normalizedPayload.discount = normalizedPayload.discount ?? parsed.totals.discount;
        normalizedPayload.tip = normalizedPayload.tip ?? parsed.totals.tip;
        normalizedPayload.tax = normalizedPayload.tax ?? parsed.totals.tax;
    }

    ensureLocation('pickup', normalizedPayload.pickup);
    ensureLocation('delivery', normalizedPayload.delivery);

    return normalizedPayload;
};

export const createMockShipdayOrder = async ({
    payload,
}) => {
    const createdAt = new Date().toISOString();

    return {
        ok: true,
        status: 201,
        body: {
            success: true,
            mock: true,
            orderNumber: payload.orderNumber,
            trackingId: `mock-${payload.orderNumber}`,
            status: 'NOT_ASSIGNED',
            delivery: payload.delivery,
            pickup: payload.pickup,
            requestedDeliveryTime: payload.requestedDeliveryTime || null,
            estimatedPickupTime: payload.requestedPickupTime || null,
            createdAt,
            message: 'Mock Shipday order created. Реальний API key ще не підключений.',
        },
    };
};

export const getMockShipdayOrder = async ({
    orderNumber,
}) => ({
    ok: true,
    status: 200,
    body: {
        success: true,
        mock: true,
        orderNumber,
        trackingId: `mock-${orderNumber}`,
        status: 'NOT_ASSIGNED',
        message: 'Mock Shipday order details.',
    },
});

const buildShipdayHeaders = ({
    apiKey,
    authMode,
}) => {
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };

    if (authMode === 'basic') {
        headers.Authorization = `Basic ${apiKey}`;
        return headers;
    }

    headers['x-api-key'] = apiKey;
    return headers;
};

export const createShipdayOrder = async ({
    apiBaseUrl,
    apiKey,
    authMode,
    timeoutMs,
    payload,
}) => {
    const response = await withTimeout(signal => fetch(`${apiBaseUrl}/orders`, {
        method: 'POST',
        signal,
        headers: buildShipdayHeaders({ apiKey, authMode }),
        body: JSON.stringify(payload),
    }), timeoutMs);
    const responseBody = await readJsonResponse(response);

    return {
        ok: response.ok,
        status: response.status,
        body: responseBody,
    };
};

export const getShipdayOrder = async ({
    apiBaseUrl,
    apiKey,
    authMode,
    timeoutMs,
    orderNumber,
}) => {
    const encodedOrderNumber = encodeURIComponent(orderNumber);
    const response = await withTimeout(signal => fetch(`${apiBaseUrl}/orders/${encodedOrderNumber}`, {
        method: 'GET',
        signal,
        headers: buildShipdayHeaders({ apiKey, authMode }),
    }), timeoutMs);
    const responseBody = await readJsonResponse(response);

    return {
        ok: response.ok,
        status: response.status,
        body: responseBody,
    };
};
