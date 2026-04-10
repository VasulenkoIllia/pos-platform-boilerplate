import React from 'react';
import APP_CONFIG from '../config';
import {
    closePosterMockPopup,
    getPosterActiveOrder,
    getPosterAccountHint,
    getPosterClient,
    getPosterDebugState,
    getPosterEnvironment,
    getPosterMode,
    getPosterOrderNumberHint,
    getPosterProductFullName,
    getRuntimeLabel,
    isPosterAvailable,
    openPosterPopup,
    registerPosterIcon,
    setPosterMockEnvironment,
    showPosterNotification,
    simulatePosterIconClick,
    subscribeToPosterEvent,
} from '../poster/bridge';
import {
    getExternalServiceConfigSummary,
    getExternalServiceStatus,
} from '../services/externalService';
import sendOrderToShipday from '../services/shipdayBridge';

const INITIAL_SERVICE_STATUS = {
    state: 'checking',
    label: 'Ініціалізація',
    message: 'Збираю стартовий стан інтеграції...',
    checkedEndpoint: null,
    details: null,
};

const INITIAL_SHIPDAY_STATUS = {
    state: 'idle',
    label: 'Не відправляли',
    message: '',
    details: null,
};

const MOCK_RUNTIME_OPTIONS = [
    { key: 'desktop', label: 'Desktop' },
    { key: 'windows', label: 'Windows' },
    { key: 'android', label: 'Android' },
    { key: 'iOS', label: 'iPad' },
];

const formatLaunchPlace = (place) => {
    if (place === 'order') {
        return 'Екран замовлення';
    }

    if (place === 'functions') {
        return 'Меню функцій';
    }

    return 'Preview mode';
};

const getOrderId = (order) => {
    if (!order) {
        return null;
    }

    return order.id || order.orderId || null;
};

const getOrderNumber = (order) => {
    if (!order) {
        return null;
    }

    const candidate = (
        order.orderName
        || order.order_name
        || order.transactionId
        || order.transaction_id
        || order.transactionNumber
        || order.transaction_number
        || order.orderNumber
        || order.order_number
        || order.number
        || null
    );
    const normalizedCandidate = String(candidate || '').trim();

    if (normalizedCandidate) {
        return normalizedCandidate;
    }

    const runtimeOrderNumber = String(getPosterOrderNumberHint() || '').trim();

    return runtimeOrderNumber || null;
};

const buildClientName = (client) => {
    if (!client) {
        return '';
    }

    if (client.name) {
        return client.name;
    }

    return [client.firstname, client.lastname].filter(Boolean).join(' ').trim();
};

const findCustomerPhone = (order) => {
    if (!order) {
        return '';
    }

    return String(
        (order.client && order.client.phone)
        || (order.deliveryInfo && order.deliveryInfo.phone)
        || order.clientPhone
        || order.phone
        || '',
    ).trim();
};

const findCustomerEmail = (order) => {
    if (!order) {
        return '';
    }

    return String(
        (order.client && order.client.email)
        || (order.deliveryInfo && order.deliveryInfo.email)
        || order.clientEmail
        || order.email
        || '',
    ).trim();
};

const findCustomerName = (order) => {
    const clientName = buildClientName(order && order.client);

    if (clientName) {
        return clientName;
    }

    if (!order) {
        return '';
    }

    return String(
        order.customerName
        || order.client_name
        || order.clientName
        || '',
    ).trim();
};

const getPosterSpotId = (order) => {
    if (!order) {
        return '';
    }

    return String(
        order.spotId
        || order.spot_id
        || (order.spot && (order.spot.spotId || order.spot.spot_id || order.spot.id))
        || '',
    ).trim();
};

const getPosterSpotName = (order) => {
    if (!order) {
        return '';
    }

    return String(
        order.spotName
        || order.spot_name
        || (order.spot && (order.spot.name || order.spot.spot_name))
        || order.tableName
        || '',
    ).trim();
};

const getOrderProducts = (order) => {
    const products = order && (order.products || order.items || []);

    if (Array.isArray(products)) {
        return products;
    }

    if (products && typeof products === 'object') {
        return Object.values(products);
    }

    return [];
};

const formatCheckedAt = (checkedAt) => {
    if (!checkedAt) {
        return 'Ще не перевірялось';
    }

    return checkedAt.toLocaleString('uk-UA');
};

const getPosterModeBadgeClassName = (posterMode) => {
    if (posterMode === 'real') {
        return 'status-chip status-chip--success';
    }

    if (posterMode === 'mock') {
        return 'status-chip status-chip--neutral';
    }

    return 'status-chip status-chip--warning';
};

const normalizeMoneyValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return '';
    }

    if (Number.isInteger(numericValue) && Math.abs(numericValue) >= 1000) {
        return (numericValue / 100).toFixed(2);
    }

    return numericValue.toFixed(2);
};

const normalizeMoneyNumber = (value) => {
    const normalizedValue = normalizeMoneyValue(value);

    return normalizedValue ? Number(normalizedValue) : undefined;
};

const findAddressString = (order) => {
    if (!order) {
        return '';
    }

    if (order.deliveryInfo && typeof order.deliveryInfo === 'object') {
        return [
            order.deliveryInfo.city,
            order.deliveryInfo.address1,
            order.deliveryInfo.address2,
        ].filter(Boolean).join(', ');
    }

    if (typeof order.delivery_address === 'string') {
        return order.delivery_address;
    }

    if (typeof order.address === 'string') {
        return order.address;
    }

    if (order.address && typeof order.address === 'object') {
        return [
            order.address.address1,
            order.address.address2,
            order.address.city,
        ].filter(Boolean).join(', ');
    }

    if (order.client && typeof order.client.address === 'string') {
        return order.client.address;
    }

    return '';
};

const findProductsSummary = (order) => {
    const products = getOrderProducts(order);

    if (!Array.isArray(products) || !products.length) {
        return '';
    }

    return products.map((item) => {
        const name = item.product_name || item.name || 'Товар';
        const quantity = item.count || item.quantity || item.num || 1;

        return `${name} x${quantity}`;
    }).join(', ');
};

const findShipdayItems = (order) => {
    const products = getOrderProducts(order);

    if (!Array.isArray(products) || !products.length) {
        return [];
    }

    return products.map((item) => {
        const name = String(item.product_name || item.name || '').trim();

        if (!name) {
            return null;
        }

        const quantity = Number(item.count || item.quantity || item.num || 1);
        const unitPrice = normalizeMoneyNumber(item.unitPrice || item.price);
        const detail = String(item.comment || item.notes || '').trim();
        const normalizedItem = {
            name,
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        };

        if (unitPrice !== undefined) {
            normalizedItem.unitPrice = unitPrice;
        }

        if (detail) {
            normalizedItem.detail = detail;
        }

        return normalizedItem;
    }).filter(Boolean);
};

const buildShipdayDraft = (order) => {
    const draftOrderNumber = getOrderNumber(order) || getOrderId(order) || `MANUAL-${Date.now()}`;

    return {
        orderNumber: String(draftOrderNumber),
        customerName: findCustomerName(order),
        customerPhone: findCustomerPhone(order),
        customerEmail: findCustomerEmail(order),
        deliveryAddress: findAddressString(order),
        deliveryInstruction: (
            order
            && (
                order.deliveryComment
                || (order.deliveryInfo && order.deliveryInfo.comment)
                || order.comment
            )
        ) || '',
        orderItem: findProductsSummary(order),
        items: findShipdayItems(order),
        orderTotal: normalizeMoneyValue(order && (order.totalSum || order.total || order.sum)),
    };
};

const buildShipdayPayload = (draft) => {
    const normalizeText = (value) => {
        const trimmedValue = String(value || '').trim();

        return trimmedValue || undefined;
    };

    const payload = {
        orderNumber: String(draft.orderNumber || '').trim(),
        customerName: normalizeText(draft.customerName),
        customerAddress: normalizeText(draft.deliveryAddress),
        customerEmail: normalizeText(draft.customerEmail),
        customerPhoneNumber: normalizeText(draft.customerPhone),
        orderSource: 'Poster POS Service Bridge',
        deliveryInstruction: normalizeText(draft.deliveryInstruction),
        orderItem: Array.isArray(draft.items) && draft.items.length
            ? draft.items
            : normalizeText(draft.orderItem),
    };

    if (draft.orderTotal) {
        payload.totalOrderCost = Number(draft.orderTotal);
    }

    return payload;
};

const buildShipdayRequest = ({
    draft,
    order,
    account,
}) => {
    const posterOrderId = getOrderId(order);
    const posterTransactionId = String(
        (order && (
            order.transactionId
            || order.transaction_id
            || order.orderName
            || order.order_name
        )) || getOrderNumber(order) || String(draft.orderNumber || '').trim(),
    ).trim();
    const posterContext = {
        orderId: posterOrderId || '',
        transactionId: posterTransactionId || '',
        serviceMode: order && order.serviceMode ? order.serviceMode : '',
        spotId: getPosterSpotId(order),
        spotName: getPosterSpotName(order),
    };

    return {
        account: account || undefined,
        poster: Object.entries(posterContext).reduce((accumulator, [key, value]) => {
            if (value) {
                accumulator[key] = value;
            }

            return accumulator;
        }, {}),
        payload: buildShipdayPayload(draft),
    };
};

const buildPosterSettingsUrl = (account = '') => {
    const baseUrl = String(APP_CONFIG.externalService.baseUrl || '').replace(/\/+$/, '');
    const settingsPath = String(APP_CONFIG.externalService.settingsPath || '/poster/settings').replace(/^\/+/, '');

    if (!baseUrl) {
        return '';
    }

    const url = new URL(`${baseUrl}/${settingsPath}`);

    if (String(account || '').trim()) {
        url.searchParams.set('account', String(account).trim());
    }

    return url.toString();
};

const getMissingShipdayFields = (draft) => {
    const missingFields = [];

    if (!String(draft.orderNumber || '').trim()) {
        missingFields.push('order number');
    }

    if (!String(draft.customerName || '').trim()) {
        missingFields.push('імʼя клієнта');
    }

    if (!String(draft.customerPhone || '').trim()) {
        missingFields.push('телефон клієнта');
    }

    if (!String(draft.deliveryAddress || '').trim()) {
        missingFields.push('адреса доставки');
    }

    return missingFields;
};

const getPopupViewport = () => {
    if (typeof window === 'undefined') {
        return {
            width: APP_CONFIG.popup.width,
            height: APP_CONFIG.popup.height,
        };
    }

    return {
        width: window.innerWidth || APP_CONFIG.popup.width,
        height: window.innerHeight || APP_CONFIG.popup.height,
    };
};

const buildResponsivePopupOptions = () => {
    const viewport = getPopupViewport();
    const width = Math.max(460, Math.min(APP_CONFIG.popup.width, viewport.width - 120));
    const height = Math.max(560, Math.min(APP_CONFIG.popup.height, viewport.height - 120));

    return {
        ...APP_CONFIG.popup,
        width,
        height,
    };
};

const buildMissingFieldsStatus = missingFields => ({
    state: 'error',
    label: 'Заповни поля',
    message: `Заповни: ${missingFields.join(', ')}.`,
    details: {
        missingFields,
    },
});

const extractShipdayReference = result => String(
    (result && result.reference)
    || (result && result.shipday && (
        result.shipday.trackingId
        || result.shipday.orderNumber
        || result.shipday.orderId
        || result.shipday.id
    ))
    || '',
).trim();

const buildShipdaySuccessMessage = (result) => {
    const shipdayReference = extractShipdayReference(result);

    if (result.mode === 'mock') {
        return 'Тестову відправку виконано.';
    }

    if (shipdayReference) {
        return `Shipday підтвердив замовлення ${shipdayReference}.`;
    }

    return 'Shipday підтвердив прийом замовлення.';
};

const buildShipdaySuccessStatus = result => ({
    state: 'success',
    label: result.mode === 'mock' ? 'Mock success' : 'Відправлено',
    message: buildShipdaySuccessMessage(result),
    details: result,
});

const buildShipdayErrorStatus = (error) => {
    const responseIssues = error.response && Array.isArray(error.response.issues)
        ? error.response.issues
        : [];
    const firstIssue = responseIssues.length
        ? responseIssues[0].message
        : null;
    const shipdayErrorMessage = error.response && error.response.shipday && (
        error.response.shipday.errorMessage
        || error.response.shipday.message
        || error.response.shipday.raw
    );

    return {
        state: 'error',
        label: 'Помилка',
        message: firstIssue || shipdayErrorMessage || error.message || 'Не вдалося відправити замовлення.',
        details: error.response || null,
    };
};

class PosterBaseApp extends React.Component {
    constructor(props) {
        super(props);

        const environment = getPosterEnvironment();

        this.state = {
            checkedAt: null,
            environment,
            isRefreshing: false,
            lastLaunchContext: null,
            lastOrderSnapshot: null,
            popupOpen: !isPosterAvailable(),
            posterAccountHint: getPosterAccountHint(),
            posterDebugState: getPosterDebugState(),
            posterMode: getPosterMode(),
            runtimeLabel: getRuntimeLabel(environment),
            serviceStatus: INITIAL_SERVICE_STATUS,
            shipdayDraft: buildShipdayDraft(null),
            shipdayStatus: INITIAL_SHIPDAY_STATUS,
        };

        this.isMountedFlag = false;
        this.appRootRef = React.createRef();
        this.handleApplicationIconClicked = this.handleApplicationIconClicked.bind(this);
        this.handleMockClosePopup = this.handleMockClosePopup.bind(this);
        this.handleMockFunctionsClick = this.handleMockFunctionsClick.bind(this);
        this.handleMockOrderClick = this.handleMockOrderClick.bind(this);
        this.handleMockRuntimeChange = this.handleMockRuntimeChange.bind(this);
        this.handlePopupClosed = this.handlePopupClosed.bind(this);
        this.refreshStatus = this.refreshStatus.bind(this);
        this.handleShipdayDraftChange = this.handleShipdayDraftChange.bind(this);
        this.handleShipdaySend = this.handleShipdaySend.bind(this);
        this.hydrateActiveOrder = this.hydrateActiveOrder.bind(this);
        this.openShipdayPopup = this.openShipdayPopup.bind(this);
        this.sendShipdayDraft = this.sendShipdayDraft.bind(this);
        this.syncPosterContext = this.syncPosterContext.bind(this);
        this.resetPopupScroll = this.resetPopupScroll.bind(this);
        this.lastHydrationRequestId = 0;
    }

    componentDidMount() {
        this.isMountedFlag = true;

        if (isPosterAvailable()) {
            registerPosterIcon(APP_CONFIG.iconLabels);
            subscribeToPosterEvent('applicationIconClicked', this.handleApplicationIconClicked);
            subscribeToPosterEvent('afterPopupClosed', this.handlePopupClosed);
        }

        this.syncPosterContext();
        this.refreshStatus();
    }

    componentDidUpdate(previousProps, previousState) {
        const { popupOpen } = this.state;

        if (!previousState.popupOpen && popupOpen) {
            this.resetPopupScroll();
        }
    }

    componentWillUnmount() {
        this.isMountedFlag = false;
    }

    async handleApplicationIconClicked(data) {
        const order = data && data.order ? data.order : null;
        const place = data && data.place ? data.place : 'unknown';
        const orderId = getOrderId(order);

        this.setState({
            lastLaunchContext: {
                orderId,
                place,
            },
            lastOrderSnapshot: order,
            popupOpen: false,
            shipdayDraft: buildShipdayDraft(order),
            shipdayStatus: INITIAL_SHIPDAY_STATUS,
        });

        const hydratedOrder = await this.hydrateActiveOrder(order);
        const effectiveOrder = hydratedOrder || order;
        const shipdayDraft = buildShipdayDraft(effectiveOrder);
        const shouldAutoSend = getPosterMode() === 'real' && place === 'order';

        if (!shouldAutoSend) {
            this.openShipdayPopup({
                shipdayDraft,
                shipdayStatus: INITIAL_SHIPDAY_STATUS,
            });
            return;
        }

        const missingFields = getMissingShipdayFields(shipdayDraft);

        if (missingFields.length) {
            this.openShipdayPopup({
                shipdayDraft,
                shipdayStatus: buildMissingFieldsStatus(missingFields),
            });
            return;
        }

        await this.sendShipdayDraft(shipdayDraft, {
            notify: true,
            openPopupOnError: true,
        });
    }

    handlePopupClosed() {
        if (!this.isMountedFlag) {
            return;
        }

        this.setState({
            popupOpen: false,
        });
    }

    syncPosterContext() {
        const environment = getPosterEnvironment();

        if (!this.isMountedFlag) {
            return;
        }

        this.setState({
            environment,
            posterAccountHint: getPosterAccountHint(),
            posterDebugState: getPosterDebugState(),
            posterMode: getPosterMode(),
            runtimeLabel: getRuntimeLabel(environment),
        });
    }

    handleMockOrderClick() {
        simulatePosterIconClick('order');
        this.syncPosterContext();
    }

    handleMockFunctionsClick() {
        simulatePosterIconClick('functions');
        this.syncPosterContext();
    }

    handleMockClosePopup() {
        closePosterMockPopup();
        this.syncPosterContext();
    }

    handleMockRuntimeChange(runtimeKey) {
        setPosterMockEnvironment(runtimeKey);
        this.syncPosterContext();
    }

    handleShipdayDraftChange(event) {
        const { name, value } = event.target;

        this.setState(prevState => ({
            shipdayDraft: {
                ...prevState.shipdayDraft,
                [name]: value,
            },
        }));
    }

    async hydrateActiveOrder(fallbackOrder = null) {
        const requestId = Date.now();
        this.lastHydrationRequestId = requestId;

        try {
            const activeOrderResponse = await getPosterActiveOrder();
            const activeOrder = activeOrderResponse && activeOrderResponse.order
                ? activeOrderResponse.order
                : null;
            const sourceOrder = activeOrder || fallbackOrder;

            if (!sourceOrder) {
                return null;
            }

            const clientId = sourceOrder.clientId
                || (sourceOrder.client && sourceOrder.client.id)
                || (fallbackOrder && fallbackOrder.client && fallbackOrder.client.id)
                || 0;

            const [client, products] = await Promise.all([
                clientId ? getPosterClient(clientId).catch(() => null) : Promise.resolve(null),
                Promise.all(getOrderProducts(sourceOrder).map(async (item) => {
                    if (item.product_name || item.name || !item.id) {
                        return item;
                    }

                    try {
                        const fullName = await getPosterProductFullName({
                            id: item.id,
                            modification: item.modification,
                        });

                        return {
                            ...item,
                            name: fullName && fullName.name ? fullName.name : `Товар #${item.id}`,
                            product_name: fullName && fullName.name ? fullName.name : `Товар #${item.id}`,
                        };
                    } catch (error) {
                        return {
                            ...item,
                            name: `Товар #${item.id}`,
                            product_name: `Товар #${item.id}`,
                        };
                    }
                })),
            ]);

            const normalizedOrder = {
                ...(fallbackOrder || {}),
                ...sourceOrder,
                id: getOrderId(sourceOrder) || getOrderId(fallbackOrder),
                orderId: getOrderId(sourceOrder) || getOrderId(fallbackOrder),
                client: client
                    ? {
                        ...client,
                        name: buildClientName(client),
                        phone: client.phone || '',
                    }
                    : (fallbackOrder && fallbackOrder.client) || null,
                products,
                total: sourceOrder.total ?? (fallbackOrder && fallbackOrder.total),
                totalSum: sourceOrder.totalSum
                    ?? (fallbackOrder && fallbackOrder.totalSum)
                    ?? sourceOrder.total
                    ?? (fallbackOrder && fallbackOrder.total),
                sum: sourceOrder.sum
                    ?? (fallbackOrder && fallbackOrder.sum)
                    ?? sourceOrder.total
                    ?? (fallbackOrder && fallbackOrder.total),
                deliveryComment: sourceOrder.deliveryComment
                    || (sourceOrder.deliveryInfo && sourceOrder.deliveryInfo.comment)
                    || (fallbackOrder && fallbackOrder.deliveryComment)
                    || '',
            };

            if (!this.isMountedFlag || this.lastHydrationRequestId !== requestId) {
                return normalizedOrder;
            }

            this.setState(prevState => ({
                lastLaunchContext: {
                    ...(prevState.lastLaunchContext || {}),
                    orderId: getOrderId(normalizedOrder),
                },
                lastOrderSnapshot: normalizedOrder,
                shipdayDraft: buildShipdayDraft(normalizedOrder),
            }));

            return normalizedOrder;
        } catch (error) {
            // Keep the initial payload if the full order is unavailable in the current POS context.
            return fallbackOrder;
        }
    }

    openShipdayPopup({
        shipdayDraft,
        shipdayStatus = INITIAL_SHIPDAY_STATUS,
    }) {
        openPosterPopup(buildResponsivePopupOptions());

        this.setState({
            popupOpen: true,
            shipdayDraft,
            shipdayStatus,
        });
    }

    resetPopupScroll() {
        if (!this.appRootRef.current) {
            return;
        }

        window.requestAnimationFrame(() => {
            if (this.appRootRef.current) {
                this.appRootRef.current.scrollTop = 0;
            }
        });
    }

    async sendShipdayDraft(shipdayDraft, {
        notify = false,
        openPopupOnError = false,
    } = {}) {
        const { lastOrderSnapshot } = this.state;

        this.setState({
            shipdayDraft,
            shipdayStatus: {
                state: 'sending',
                label: 'Відправка',
                message: 'Відправляю...',
                details: null,
            },
        });

        try {
            const result = await sendOrderToShipday(buildShipdayRequest({
                draft: shipdayDraft,
                order: lastOrderSnapshot,
                account: getPosterAccountHint(),
            }));
            const shipdayStatus = buildShipdaySuccessStatus(result);
            const shipdayReference = extractShipdayReference(result);
            let notificationMessage = `Shipday прийняв замовлення ${shipdayDraft.orderNumber}.`;

            if (result.mode === 'mock') {
                notificationMessage = `Тестове замовлення ${shipdayDraft.orderNumber} відправлено.`;
            } else if (shipdayReference) {
                notificationMessage = `Shipday підтвердив замовлення ${shipdayReference}.`;
            }

            this.setState({
                popupOpen: false,
                shipdayStatus,
            });

            if (notify) {
                showPosterNotification({
                    title: APP_CONFIG.name,
                    message: notificationMessage,
                }).catch(() => null);
            }

            return {
                ok: true,
                result,
            };
        } catch (error) {
            const shipdayStatus = buildShipdayErrorStatus(error);

            this.setState({
                shipdayStatus,
            });

            if (notify) {
                showPosterNotification({
                    title: APP_CONFIG.name,
                    message: shipdayStatus.message,
                }).catch(() => null);
            }

            if (openPopupOnError && !(error.response && error.response.requiresAccountSettings)) {
                this.openShipdayPopup({
                    shipdayDraft,
                    shipdayStatus,
                });
            }

            return {
                ok: false,
                error,
            };
        }
    }

    async handleShipdaySend() {
        const { shipdayDraft } = this.state;
        const missingFields = getMissingShipdayFields(shipdayDraft);

        if (missingFields.length) {
            this.setState({
                shipdayStatus: buildMissingFieldsStatus(missingFields),
            });
            return;
        }

        await this.sendShipdayDraft(shipdayDraft);
    }

    async refreshStatus() {
        if (!this.isMountedFlag) {
            return;
        }

        this.setState(prevState => ({
            isRefreshing: true,
            serviceStatus: {
                ...prevState.serviceStatus,
                state: 'checking',
                label: 'Перевірка',
                message: 'Оновлюю стан підключення до зовнішнього сервісу...',
            },
        }));

        const serviceStatus = await getExternalServiceStatus();

        if (!this.isMountedFlag) {
            return;
        }

        this.syncPosterContext();
        this.setState({
            checkedAt: new Date(),
            isRefreshing: false,
            serviceStatus,
        });
    }

    renderLaunchContext() {
        const { lastLaunchContext, popupOpen } = this.state;

        if (!lastLaunchContext) {
            return (
                <div className="info-card__meta">
                    Додаток ще не відкривали з Poster. У preview режимі екран доступний відразу.
                </div>
            );
        }

        return (
            <div className="details-list">
                <div className="details-list__row">
                    <span>Точка входу</span>
                    <strong>{formatLaunchPlace(lastLaunchContext.place)}</strong>
                </div>
                <div className="details-list__row">
                    <span>Popup</span>
                    <strong>{popupOpen ? 'Відкрито' : 'Закрито'}</strong>
                </div>
                <div className="details-list__row">
                    <span>ID замовлення</span>
                    <strong>{lastLaunchContext.orderId || 'Немає в контексті'}</strong>
                </div>
            </div>
        );
    }

    renderServiceDetails() {
        const { serviceStatus } = this.state;

        if (!serviceStatus.details) {
            return null;
        }

        return (
            <pre className="service-json">
                {JSON.stringify(serviceStatus.details, null, 2)}
            </pre>
        );
    }

    renderShipdayDetails() {
        const { shipdayStatus } = this.state;

        if (!shipdayStatus.details) {
            return null;
        }

        return (
            <details className="shipday-debug">
                <summary>Shipday debug</summary>
                <pre className="service-json">
                    {JSON.stringify(shipdayStatus.details, null, 2)}
                </pre>
            </details>
        );
    }

    renderFunctionsHub() {
        const {
            isRefreshing,
            posterAccountHint,
            serviceStatus,
        } = this.state;
        const resolvedAccount = posterAccountHint;
        const settingsUrl = buildPosterSettingsUrl(resolvedAccount);
        const statusChipClassName = resolvedAccount
            ? 'status-chip status-chip--success'
            : 'status-chip status-chip--warning';

        return (
            <section className="info-card info-card--highlight service-hub">
                <div className="service-hub__header">
                    <div className={statusChipClassName}>
                        {resolvedAccount ? 'Poster account визначено' : 'Потрібно обрати акаунт'}
                    </div>
                    <h2>Налаштування Shipday</h2>
                    <p className="info-card__meta">
                        Кнопка в меню «Функції» використовується як сервісний вхід:
                        тут перевіряємо підключення і відкриваємо веб-налаштування.
                        Відправка замовлення в Shipday має запускатись з екрана конкретного delivery order.
                    </p>
                </div>

                <div className="details-list">
                    <div className="details-list__row">
                        <span>Поточний Poster account</span>
                        <strong>{resolvedAccount || 'Не вдалося визначити автоматично'}</strong>
                    </div>
                    <div className="details-list__row">
                        <span>Backend</span>
                        <strong>{serviceStatus.label}</strong>
                    </div>
                    <div className="details-list__row">
                        <span>Статус backend</span>
                        <strong>{serviceStatus.state === 'connected' ? 'Готовий' : 'Потрібна перевірка'}</strong>
                    </div>
                    <div className="details-list__row">
                        <span>Налаштування</span>
                        <strong>
                            {resolvedAccount
                                ? 'Відкриються для поточного акаунта'
                                : 'Відкриється account chooser для цього браузера'}
                        </strong>
                    </div>
                </div>

                <div className="service-hub__actions">
                    <a
                        className="btn btn-primary"
                        href={settingsUrl || buildPosterSettingsUrl('')}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {resolvedAccount ? 'Відкрити налаштування акаунта' : 'Вибрати акаунт і налаштувати'}
                    </a>
                    <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={this.refreshStatus}
                        disabled={isRefreshing}
                    >
                        {isRefreshing ? 'Оновлення...' : 'Оновити статус'}
                    </button>
                </div>

                {!resolvedAccount && (
                    <p className="service-hub__note">
                        Якщо акаунт не визначився автоматично, backend покаже тільки ті акаунти,
                        які були підключені через Poster OAuth у цьому браузері.
                    </p>
                )}

                {serviceStatus.message && serviceStatus.state !== 'connected' && (
                    <p className="shipday-form__status shipday-form__status--error">
                        {serviceStatus.message}
                    </p>
                )}
            </section>
        );
    }

    render() {
        const {
            checkedAt,
            environment,
            isRefreshing,
            lastOrderSnapshot,
            lastLaunchContext,
            posterDebugState,
            posterMode,
            runtimeLabel,
            serviceStatus,
            shipdayDraft,
            shipdayStatus,
        } = this.state;

        const activePlatforms = Object.keys(environment).filter(key => environment[key]);
        const activeIconLocations = Object.keys(APP_CONFIG.iconLabels).join(', ');
        const healthEndpoint = serviceStatus.checkedEndpoint || getExternalServiceConfigSummary();
        const mockPopupTitle = posterDebugState && posterDebugState.lastPopup
            ? posterDebugState.lastPopup.title
            : 'Ще не викликався';
        const mockRegisteredIcons = posterDebugState
            ? Object.keys(posterDebugState.registeredIcons || {}).join(', ')
            : 'Немає';
        const orderContextSummary = lastOrderSnapshot
            ? (lastOrderSnapshot.tableName || lastOrderSnapshot.spotName || 'Замовлення в контексті')
            : 'Поза контекстом замовлення';
        const contextPlace = lastLaunchContext && lastLaunchContext.place
            ? formatLaunchPlace(lastLaunchContext.place)
            : 'Меню функцій';
        const shipdayActionLabel = shipdayStatus.state === 'sending'
            ? 'Відправка...'
            : 'Відправити в Shipday';
        const isRealMode = posterMode === 'real';
        const isFunctionsLaunch = Boolean(lastLaunchContext && lastLaunchContext.place === 'functions');
        const showFunctionsHub = isRealMode && isFunctionsLaunch;
        const mainContent = showFunctionsHub ? this.renderFunctionsHub() : (
            <section className="info-card info-card--highlight">
                {!isRealMode && (
                    <div className="poster-base-app__compact-header">
                        <div>
                            <div className={getPosterModeBadgeClassName(posterMode)}>
                                {posterMode === 'mock' ? 'Preview mode' : 'Доставка Shipday'}
                            </div>
                            <h1>{APP_CONFIG.name}</h1>
                            <p>
                                Мінімальний екран інтеграції для відправки доставки в Shipday.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="btn btn-outline-primary poster-base-app__refresh"
                            onClick={this.refreshStatus}
                            disabled={isRefreshing}
                        >
                            {isRefreshing ? 'Оновлення...' : 'Оновити'}
                        </button>
                    </div>
                )}

                {!isRealMode && (
                    <div className="details-list">
                        <div className="details-list__row">
                            <span>Джерело</span>
                            <strong>{contextPlace}</strong>
                        </div>
                        <div className="details-list__row">
                            <span>Замовлення</span>
                            <strong>{shipdayDraft.orderNumber}</strong>
                        </div>
                        <div className="details-list__row">
                            <span>Контекст</span>
                            <strong>{orderContextSummary}</strong>
                        </div>
                        <div className="details-list__row">
                            <span>Backend</span>
                            <strong>{serviceStatus.label}</strong>
                        </div>
                    </div>
                )}

                <div className="shipday-form">
                    <label className="shipday-form__field" htmlFor="shipday-order-number">
                        <span>Order number</span>
                        <input
                            id="shipday-order-number"
                            className="form-control"
                            name="orderNumber"
                            value={shipdayDraft.orderNumber}
                            onChange={this.handleShipdayDraftChange}
                        />
                    </label>

                    <label className="shipday-form__field" htmlFor="shipday-customer-name">
                        <span>Клієнт</span>
                        <input
                            id="shipday-customer-name"
                            className="form-control"
                            name="customerName"
                            value={shipdayDraft.customerName}
                            onChange={this.handleShipdayDraftChange}
                        />
                    </label>

                    <label className="shipday-form__field" htmlFor="shipday-customer-phone">
                        <span>Телефон</span>
                        <input
                            id="shipday-customer-phone"
                            className="form-control"
                            name="customerPhone"
                            value={shipdayDraft.customerPhone}
                            onChange={this.handleShipdayDraftChange}
                        />
                    </label>

                    <label className="shipday-form__field shipday-form__field--full" htmlFor="shipday-delivery-address">
                        <span>Адреса доставки</span>
                        <input
                            id="shipday-delivery-address"
                            className="form-control"
                            name="deliveryAddress"
                            value={shipdayDraft.deliveryAddress}
                            onChange={this.handleShipdayDraftChange}
                        />
                    </label>

                    <label className="shipday-form__field shipday-form__field--full" htmlFor="shipday-order-item">
                        <span>Позиції замовлення</span>
                        <input
                            id="shipday-order-item"
                            className="form-control"
                            name="orderItem"
                            value={shipdayDraft.orderItem}
                            onChange={this.handleShipdayDraftChange}
                        />
                    </label>

                    <label className="shipday-form__field" htmlFor="shipday-order-total">
                        <span>Сума</span>
                        <input
                            id="shipday-order-total"
                            className="form-control"
                            name="orderTotal"
                            value={shipdayDraft.orderTotal}
                            onChange={this.handleShipdayDraftChange}
                        />
                    </label>

                    <label className="shipday-form__field shipday-form__field--full" htmlFor="shipday-delivery-instruction">
                        <span>Інструкція курʼєру</span>
                        <input
                            id="shipday-delivery-instruction"
                            className="form-control"
                            name="deliveryInstruction"
                            value={shipdayDraft.deliveryInstruction}
                            onChange={this.handleShipdayDraftChange}
                        />
                    </label>
                </div>

                <div className={isRealMode ? 'shipday-form__actions' : 'mock-controls'}>
                    <button
                        type="button"
                        className="btn btn-success"
                        onClick={this.handleShipdaySend}
                        disabled={shipdayStatus.state === 'sending'}
                    >
                        {shipdayActionLabel}
                    </button>
                    {shipdayStatus.message && (
                        <span className={`shipday-form__status shipday-form__status--${shipdayStatus.state}`}>
                            {shipdayStatus.message}
                        </span>
                    )}
                </div>

                {this.renderShipdayDetails()}
            </section>
        );

        return (
            <div
                ref={this.appRootRef}
                className={`poster-base-app ${isRealMode ? 'poster-base-app--real' : ''}`}
            >
                <div className="poster-base-app__panel">
                    {mainContent}

                    {posterMode === 'mock' && (
                        <section className="info-card info-card--highlight">
                            <div className="info-card__header">
                                <h2>Preview mode</h2>
                                <div className="status-chip status-chip--neutral">
                                    Без каси
                                </div>
                            </div>

                            <p className="info-card__meta">
                                Тут можна симулювати доставку без каси. `Order Click` підставляє demo-замовлення
                                з клієнтом, адресою та позиціями.
                            </p>

                            <div className="mock-controls">
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={this.handleMockOrderClick}
                                >
                                    Симулювати Order Click
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-outline-primary"
                                    onClick={this.handleMockFunctionsClick}
                                >
                                    Симулювати Functions Click
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={this.handleMockClosePopup}
                                >
                                    Закрити Popup
                                </button>
                            </div>

                            <div className="mock-runtime-picker">
                                {MOCK_RUNTIME_OPTIONS.map(option => (
                                    <button
                                        key={option.key}
                                        type="button"
                                        className={environment[option.key]
                                            ? 'btn btn-dark'
                                            : 'btn btn-light'}
                                        onClick={() => this.handleMockRuntimeChange(option.key)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>

                            <div className="details-list">
                                <div className="details-list__row">
                                    <span>Іконки</span>
                                    <strong>{mockRegisteredIcons || activeIconLocations || 'Немає'}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Popup title</span>
                                    <strong>{mockPopupTitle}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Runtime</span>
                                    <strong>{activePlatforms.length ? activePlatforms.join(', ') : runtimeLabel}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Backend</span>
                                    <strong>{healthEndpoint}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Остання перевірка</span>
                                    <strong>{formatCheckedAt(checkedAt)}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Popup</span>
                                    <strong>{posterDebugState && posterDebugState.popupOpen ? 'Відкрито' : 'Закрито'}</strong>
                                </div>
                            </div>
                            {this.renderServiceDetails()}
                        </section>
                    )}
                </div>
            </div>
        );
    }
}

export default PosterBaseApp;
