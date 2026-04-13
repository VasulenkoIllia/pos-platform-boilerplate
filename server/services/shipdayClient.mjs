import { z } from 'zod';

const FlexibleOrderSchema = z.object({
    orderNumber: z.union([z.string(), z.number()]),
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

const normalizeText = (value) => {
    const normalizedValue = String(value || '').trim();

    return normalizedValue || undefined;
};

const normalizeNumber = (value) => {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }

    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : undefined;
};

const normalizeBoolean = (value) => {
    if (typeof value === 'boolean') {
        return value;
    }

    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    return undefined;
};

const normalizeDateValue = (value) => {
    const textValue = normalizeText(value);

    if (!textValue) {
        return undefined;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
        return textValue;
    }

    const parsedDate = new Date(textValue);

    if (Number.isNaN(parsedDate.getTime())) {
        return undefined;
    }

    return parsedDate.toISOString().slice(0, 10);
};

const normalizeTimeValue = (value) => {
    const textValue = normalizeText(value);

    if (!textValue) {
        return undefined;
    }

    if (/^\d{2}:\d{2}:\d{2}$/.test(textValue)) {
        return textValue;
    }

    const isoTimeMatch = textValue.match(/T(\d{2}:\d{2}:\d{2})/);

    if (isoTimeMatch) {
        return isoTimeMatch[1];
    }

    const timeMatch = textValue.match(/\b(\d{2}:\d{2}:\d{2})\b/);

    return timeMatch ? timeMatch[1] : undefined;
};

const pickFirstText = (...values) => {
    for (const value of values) {
        const normalizedValue = normalizeText(value);

        if (normalizedValue) {
            return normalizedValue;
        }
    }

    return undefined;
};

const pickFirstNumber = (...values) => {
    for (const value of values) {
        const normalizedValue = normalizeNumber(value);

        if (normalizedValue !== undefined) {
            return normalizedValue;
        }
    }

    return undefined;
};

export class ShipdayPayloadValidationError extends Error {
    constructor(message, details = []) {
        super(message);
        this.name = 'ShipdayPayloadValidationError';
        this.details = details;
    }
}

const ensureRequiredText = (fieldName, value) => {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
        throw new ShipdayPayloadValidationError(
            `Shipday payload повинен містити ${fieldName}.`,
            [`Поле ${fieldName} не прийшло з POS bundle або було порожнім після нормалізації.`],
        );
    }

    return normalizedValue;
};

const normalizeLocation = (location) => {
    if (!location || typeof location !== 'object') {
        return {};
    }

    return {
        name: normalizeText(location.name),
        address: normalizeText(location.address),
        formattedAddress: normalizeText(location.formattedAddress),
        phone: normalizeText(location.phone),
        email: normalizeText(location.email),
        lat: normalizeNumber(location.lat),
        lng: normalizeNumber(location.lng),
    };
};

const normalizeShipdayItem = (item) => {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const productId = pickFirstText(item.productId, item.product_id, item.id);
    const name = pickFirstText(
        item.name,
        item.productName,
        item.product_name,
        item.dishName,
        item.dish_name,
        item.fullName,
        item.title,
        item.product && (item.product.name || item.product.product_name),
        productId ? `Product #${productId}` : undefined,
    );

    if (!name) {
        return null;
    }

    const quantity = pickFirstNumber(item.quantity, item.count, item.num, item.qty) || 1;
    const directUnitPrice = pickFirstNumber(item.unitPrice, item.unit_price, item.price);
    const lineTotal = pickFirstNumber(
        item.productSum,
        item.product_sum,
        item.lineTotal,
        item.line_total,
        item.amount,
        item.sum,
        item.total,
    );
    const unitPrice = directUnitPrice !== undefined
        ? directUnitPrice
        : (lineTotal !== undefined ? Number((lineTotal / quantity).toFixed(2)) : undefined);
    const normalizedItem = {
        name,
        quantity,
    };
    const addOns = pickFirstText(item.addOns, item.add_ons);
    const detail = pickFirstText(item.detail, item.comment, item.notes, item.note);

    if (unitPrice !== undefined) {
        normalizedItem.unitPrice = unitPrice;
    }

    if (addOns) {
        normalizedItem.addOns = addOns;
    }

    if (detail) {
        normalizedItem.detail = detail;
    }

    return normalizedItem;
};

const normalizeShipdayItems = (payload) => {
    const candidates = [
        Array.isArray(payload.orderItem) ? payload.orderItem : null,
        Array.isArray(payload.orderItems) ? payload.orderItems : null,
        Array.isArray(payload.items) ? payload.items : null,
        Array.isArray(payload.products) ? payload.products : null,
    ].find(Boolean) || [];

    const normalizedItems = candidates
        .map(normalizeShipdayItem)
        .filter(Boolean);

    if (normalizedItems.length) {
        return normalizedItems;
    }

    const legacySummary = typeof payload.orderItem === 'string'
        ? normalizeText(payload.orderItem)
        : normalizeText(payload.orderItemsSummary);

    return legacySummary
        ? [{ name: legacySummary, quantity: 1 }]
        : [];
};

const removeEmptyValues = (value) => {
    if (Array.isArray(value)) {
        return value
            .map(removeEmptyValues)
            .filter(item => item !== undefined);
    }

    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((accumulator, [key, currentValue]) => {
            const normalizedValue = removeEmptyValues(currentValue);

            if (normalizedValue !== undefined) {
                accumulator[key] = normalizedValue;
            }

            return accumulator;
        }, {});
    }

    if (value === null || value === undefined || value === '') {
        return undefined;
    }

    return value;
};

export const normalizeShipdayOrderPayload = ({
    input,
    defaultPickup,
}) => {
    const payload = input && input.payload ? input.payload : input;
    const parsed = FlexibleOrderSchema.parse(payload);
    const normalizedPickup = {
        ...normalizeLocation(defaultPickup),
        ...normalizeLocation(parsed.pickup),
    };
    const normalizedDelivery = normalizeLocation(parsed.delivery);
    const orderItems = normalizeShipdayItems(parsed);

    if (!orderItems.length) {
        throw new ShipdayPayloadValidationError(
            'Shipday payload повинен містити хоча б одну позицію orderItem.',
            [
                'Poster не передав products/items або всі позиції не вдалося нормалізувати.',
                'Перевір requestPayload.orderItem у debug popup перед повторною відправкою.',
            ],
        );
    }

    const restaurantName = ensureRequiredText(
        'restaurantName',
        pickFirstText(parsed.restaurantName, normalizedPickup.name),
    );
    const restaurantAddress = ensureRequiredText(
        'restaurantAddress',
        pickFirstText(parsed.restaurantAddress, normalizedPickup.formattedAddress, normalizedPickup.address),
    );
    const customerName = ensureRequiredText(
        'customerName',
        pickFirstText(parsed.customerName, normalizedDelivery.name),
    );
    const customerAddress = ensureRequiredText(
        'customerAddress',
        pickFirstText(
            parsed.customerAddress,
            parsed.deliveryAddress,
            normalizedDelivery.formattedAddress,
            normalizedDelivery.address,
        ),
    );
    const customerPhoneNumber = ensureRequiredText(
        'customerPhoneNumber',
        pickFirstText(parsed.customerPhoneNumber, parsed.customerPhone, normalizedDelivery.phone),
    );

    const normalizedPayload = removeEmptyValues({
        orderNumber: String(parsed.orderNumber).trim(),
        customerName,
        customerAddress,
        customerEmail: pickFirstText(parsed.customerEmail, normalizedDelivery.email),
        customerPhoneNumber,
        restaurantName,
        restaurantAddress,
        restaurantPhoneNumber: pickFirstText(parsed.restaurantPhoneNumber, normalizedPickup.phone),
        expectedDeliveryDate: normalizeDateValue(parsed.expectedDeliveryDate || parsed.requestedDeliveryTime),
        expectedPickupTime: normalizeTimeValue(parsed.expectedPickupTime || parsed.requestedPickupTime),
        expectedDeliveryTime: normalizeTimeValue(parsed.expectedDeliveryTime || parsed.requestedDeliveryTime),
        pickupLatitude: pickFirstNumber(parsed.pickupLatitude, normalizedPickup.lat),
        pickupLongitude: pickFirstNumber(parsed.pickupLongitude, normalizedPickup.lng),
        deliveryLatitude: pickFirstNumber(parsed.deliveryLatitude, normalizedDelivery.lat),
        deliveryLongitude: pickFirstNumber(parsed.deliveryLongitude, normalizedDelivery.lng),
        tips: pickFirstNumber(parsed.tips, parsed.tip),
        tax: pickFirstNumber(parsed.tax),
        discountAmount: pickFirstNumber(parsed.discountAmount, parsed.discount),
        deliveryFee: pickFirstNumber(parsed.deliveryFee),
        totalOrderCost: pickFirstNumber(parsed.totalOrderCost, parsed.orderTotal),
        pickupInstruction: normalizeText(parsed.pickupInstruction),
        deliveryInstruction: normalizeText(parsed.deliveryInstruction),
        orderSource: pickFirstText(parsed.orderSource, 'Poster POS Service Bridge'),
        additionalId: pickFirstText(parsed.additionalId),
        clientRestaurantId: pickFirstNumber(parsed.clientRestaurantId),
        paymentMethod: normalizeText(parsed.paymentMethod),
        creditCardType: normalizeText(parsed.creditCardType),
        creditCardId: normalizeText(parsed.creditCardId),
        isCatering: normalizeBoolean(parsed.isCatering),
        orderItem: orderItems.length ? orderItems : undefined,
    });

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
            createdAt,
            message: 'Mock Shipday order created.',
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
