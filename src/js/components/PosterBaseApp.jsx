import React from 'react';
import APP_CONFIG from '../config';
import {
    closePosterMockPopup,
    getPosterDebugState,
    getPosterEnvironment,
    getPosterMode,
    getRuntimeLabel,
    isPosterAvailable,
    openPosterPopup,
    registerPosterIcon,
    setPosterMockEnvironment,
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
    message: 'Підготуй дані замовлення і натисни кнопку відправки.',
    details: null,
};

const MOCK_RUNTIME_OPTIONS = [
    { key: 'desktop', label: 'Desktop' },
    { key: 'windows', label: 'Windows' },
    { key: 'android', label: 'Android' },
    { key: 'iOS', label: 'iPad' },
];

const getStatusClassName = (state) => {
    switch (state) {
    case 'connected':
        return 'status-chip status-chip--success';
    case 'checking':
        return 'status-chip status-chip--neutral';
    case 'error':
        return 'status-chip status-chip--danger';
    default:
        return 'status-chip status-chip--warning';
    }
};

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

const formatCheckedAt = (checkedAt) => {
    if (!checkedAt) {
        return 'Ще не перевірялось';
    }

    return checkedAt.toLocaleString('uk-UA');
};

const getPosterModeLabel = (posterMode) => {
    if (posterMode === 'real') {
        return 'Poster runtime знайдено';
    }

    if (posterMode === 'mock') {
        return 'Poster mock mode';
    }

    return 'Preview mode';
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

const getPosterConnectionLabel = (posterMode) => {
    if (posterMode === 'real') {
        return 'Реальний Poster container';
    }

    if (posterMode === 'mock') {
        return 'Локальний mock runtime';
    }

    return 'Поза Poster';
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

const findAddressString = (order) => {
    if (!order) {
        return '';
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

    return '';
};

const findProductsSummary = (order) => {
    const products = order && (order.products || order.items || []);

    if (!Array.isArray(products) || !products.length) {
        return '';
    }

    return products.map((item) => {
        const name = item.product_name || item.name || 'Товар';
        const quantity = item.count || item.quantity || 1;

        return `${name} x${quantity}`;
    }).join(', ');
};

const buildShipdayDraft = (order) => {
    const draftOrderNumber = getOrderId(order) || `MANUAL-${Date.now()}`;
    const client = order && order.client ? order.client : {};

    return {
        orderNumber: String(draftOrderNumber),
        customerName: client.name || '',
        customerPhone: client.phone || '',
        customerEmail: client.email || '',
        deliveryAddress: findAddressString(order),
        deliveryInstruction: (order && (order.comment || order.deliveryComment)) || '',
        orderItem: findProductsSummary(order),
        orderTotal: normalizeMoneyValue(order && (order.totalSum || order.total || order.sum)),
        requestedDeliveryTime: '',
    };
};

const buildShipdayPayload = (draft) => {
    const normalizeText = (value) => {
        const trimmedValue = String(value || '').trim();

        return trimmedValue || undefined;
    };

    const payload = {
        orderNumber: String(draft.orderNumber || '').trim(),
        orderItem: normalizeText(draft.orderItem),
        orderSource: 'Poster POS Service Bridge',
        deliveryInstruction: normalizeText(draft.deliveryInstruction),
        delivery: {
            name: normalizeText(draft.customerName),
            phone: normalizeText(draft.customerPhone),
            email: normalizeText(draft.customerEmail),
            address: normalizeText(draft.deliveryAddress),
            formattedAddress: normalizeText(draft.deliveryAddress),
        },
    };

    if (draft.orderTotal) {
        payload.orderTotal = Number(draft.orderTotal);
    }

    if (normalizeText(draft.requestedDeliveryTime)) {
        payload.requestedDeliveryTime = normalizeText(draft.requestedDeliveryTime);
    }

    return payload;
};

const getShipdayStatusChipState = (shipdayStatus) => {
    if (shipdayStatus.state === 'success') {
        return 'connected';
    }

    if (shipdayStatus.state === 'sending') {
        return 'checking';
    }

    if (shipdayStatus.state === 'error') {
        return 'error';
    }

    return 'not-configured';
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
            posterDebugState: getPosterDebugState(),
            posterMode: getPosterMode(),
            runtimeLabel: getRuntimeLabel(environment),
            serviceStatus: INITIAL_SERVICE_STATUS,
            shipdayDraft: buildShipdayDraft(null),
            shipdayStatus: INITIAL_SHIPDAY_STATUS,
        };

        this.isMountedFlag = false;
        this.handleApplicationIconClicked = this.handleApplicationIconClicked.bind(this);
        this.handleMockClosePopup = this.handleMockClosePopup.bind(this);
        this.handleMockFunctionsClick = this.handleMockFunctionsClick.bind(this);
        this.handleMockOrderClick = this.handleMockOrderClick.bind(this);
        this.handleMockRuntimeChange = this.handleMockRuntimeChange.bind(this);
        this.handlePopupClosed = this.handlePopupClosed.bind(this);
        this.refreshStatus = this.refreshStatus.bind(this);
        this.handleShipdayDraftChange = this.handleShipdayDraftChange.bind(this);
        this.handleShipdaySend = this.handleShipdaySend.bind(this);
        this.syncPosterContext = this.syncPosterContext.bind(this);
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

    componentWillUnmount() {
        this.isMountedFlag = false;
    }

    handleApplicationIconClicked(data) {
        openPosterPopup(APP_CONFIG.popup);
        const order = data && data.order ? data.order : null;

        this.setState({
            lastLaunchContext: {
                orderId: getOrderId(order),
                place: data && data.place ? data.place : 'unknown',
            },
            lastOrderSnapshot: order,
            popupOpen: true,
            shipdayDraft: buildShipdayDraft(order),
            shipdayStatus: INITIAL_SHIPDAY_STATUS,
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

    async handleShipdaySend() {
        const { shipdayDraft } = this.state;
        const missingFields = [];

        if (!String(shipdayDraft.orderNumber || '').trim()) {
            missingFields.push('order number');
        }

        if (!String(shipdayDraft.customerName || '').trim()) {
            missingFields.push('імʼя клієнта');
        }

        if (!String(shipdayDraft.deliveryAddress || '').trim()) {
            missingFields.push('адреса доставки');
        }

        if (missingFields.length) {
            this.setState({
                shipdayStatus: {
                    state: 'error',
                    label: 'Заповни поля',
                    message: `Для тесту заповни: ${missingFields.join(', ')}.`,
                    details: {
                        missingFields,
                    },
                },
            });
            return;
        }

        this.setState({
            shipdayStatus: {
                state: 'sending',
                label: 'Відправка',
                message: 'Надсилаю замовлення в Shipday bridge...',
                details: null,
            },
        });

        try {
            const result = await sendOrderToShipday(buildShipdayPayload(shipdayDraft));

            this.setState({
                shipdayStatus: {
                    state: 'success',
                    label: result.mode === 'mock' ? 'Mock success' : 'Відправлено',
                    message: result.mode === 'mock'
                        ? 'Backend підтвердив тестову Shipday-відправку без реального API key.'
                        : 'Shipday прийняв замовлення.',
                    details: result,
                },
            });
        } catch (error) {
            const responseIssues = error.response && Array.isArray(error.response.issues)
                ? error.response.issues
                : [];
            const firstIssue = responseIssues.length
                ? responseIssues[0].message
                : null;

            this.setState({
                shipdayStatus: {
                    state: 'error',
                    label: 'Помилка',
                    message: firstIssue || error.message || 'Не вдалося відправити замовлення.',
                    details: error.response || null,
                },
            });
        }
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
            <pre className="service-json">
                {JSON.stringify(shipdayStatus.details, null, 2)}
            </pre>
        );
    }

    render() {
        const {
            checkedAt,
            environment,
            isRefreshing,
            lastOrderSnapshot,
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
        const recommendedCallStrategy = APP_CONFIG.externalService.requireBackendProxy
            ? 'Через backend/proxy'
            : 'Прямий виклик';
        const orderContextSummary = lastOrderSnapshot
            ? (lastOrderSnapshot.tableName || lastOrderSnapshot.spotName || 'Замовлення в контексті')
            : 'Поза контекстом замовлення';
        const shipdayStatusChipState = getShipdayStatusChipState(shipdayStatus);

        return (
            <div className="poster-base-app">
                <div className="poster-base-app__panel">
                    <div className="poster-base-app__hero">
                        <div>
                            <div className={getPosterModeBadgeClassName(posterMode)}>
                                {getPosterModeLabel(posterMode)}
                            </div>
                            <h1>{APP_CONFIG.name}</h1>
                            <p>{APP_CONFIG.description}</p>
                        </div>

                        <button
                            type="button"
                            className="btn btn-primary poster-base-app__refresh"
                            onClick={this.refreshStatus}
                            disabled={isRefreshing}
                        >
                            {isRefreshing ? 'Оновлення...' : 'Оновити статус'}
                        </button>
                    </div>

                    <div className="poster-base-app__grid">
                        <section className="info-card">
                            <div className="info-card__header">
                                <h2>Poster runtime</h2>
                                <div className={getPosterModeBadgeClassName(posterMode)}>
                                    {runtimeLabel}
                                </div>
                            </div>

                            <div className="details-list">
                                <div className="details-list__row">
                                    <span>Стан контейнера</span>
                                    <strong>{getPosterConnectionLabel(posterMode)}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Активні платформи</span>
                                    <strong>{activePlatforms.length ? activePlatforms.join(', ') : 'Невідомо'}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Іконки застосунку</span>
                                    <strong>{activeIconLocations}</strong>
                                </div>
                            </div>

                            {this.renderLaunchContext()}
                        </section>

                        <section className="info-card">
                            <div className="info-card__header">
                                <h2>Зовнішній сервіс</h2>
                                <div className={getStatusClassName(serviceStatus.state)}>
                                    {serviceStatus.label}
                                </div>
                            </div>

                            <p className="info-card__meta">
                                {serviceStatus.message}
                            </p>

                            <div className="details-list">
                                <div className="details-list__row">
                                    <span>Health endpoint</span>
                                    <strong>{healthEndpoint}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Остання перевірка</span>
                                    <strong>{formatCheckedAt(checkedAt)}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Рекомендована схема</span>
                                    <strong>{recommendedCallStrategy}</strong>
                                </div>
                            </div>

                            {this.renderServiceDetails()}
                        </section>
                    </div>

                    <section className="info-card info-card--highlight">
                        <div className="info-card__header">
                            <h2>Shipday test send</h2>
                            <div className={getStatusClassName(shipdayStatusChipState)}>
                                {shipdayStatus.label}
                            </div>
                        </div>

                        <p className="info-card__meta">
                            Перший етап інтеграції: вручну відправляємо замовлення в backend.
                            Без `SHIPDAY_API_KEY` backend поверне mock success, щоб можна було тестувати UI прямо в касі.
                        </p>

                        <div className="details-list">
                            <div className="details-list__row">
                                <span>Контекст</span>
                                <strong>{orderContextSummary}</strong>
                            </div>
                            <div className="details-list__row">
                                <span>Backend URL</span>
                                <strong>{APP_CONFIG.externalService.baseUrl || 'Ще не зібрано з Render URL'}</strong>
                            </div>
                        </div>

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
                                <span>Позиції</span>
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

                            <label className="shipday-form__field" htmlFor="shipday-requested-time">
                                <span>Бажаний час</span>
                                <input
                                    id="shipday-requested-time"
                                    className="form-control"
                                    name="requestedDeliveryTime"
                                    value={shipdayDraft.requestedDeliveryTime}
                                    onChange={this.handleShipdayDraftChange}
                                    placeholder="2026-04-08T23:30:00+03:00"
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

                        <div className="mock-controls">
                            <button
                                type="button"
                                className="btn btn-success"
                                onClick={this.handleShipdaySend}
                            >
                                Відправити в Shipday
                            </button>
                            <span className="shipday-form__hint">{shipdayStatus.message}</span>
                        </div>

                        {this.renderShipdayDetails()}
                    </section>

                    {posterMode === 'mock' && (
                        <section className="info-card info-card--highlight">
                            <div className="info-card__header">
                                <h2>Локальний mock POS</h2>
                                <div className="status-chip status-chip--neutral">
                                    Без каси
                                </div>
                            </div>

                            <p className="info-card__meta">
                                Тут можна прогнати основні сценарії без Poster desktop app:
                                симулювати клік по іконці застосунку, popup і тип пристрою.
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
                                    <span>Зареєстровані іконки</span>
                                    <strong>{mockRegisteredIcons || 'Немає'}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Останній popup title</span>
                                    <strong>{mockPopupTitle}</strong>
                                </div>
                                <div className="details-list__row">
                                    <span>Popup у mock runtime</span>
                                    <strong>{posterDebugState && posterDebugState.popupOpen ? 'Відкрито' : 'Закрито'}</strong>
                                </div>
                            </div>
                        </section>
                    )}

                    <section className="info-card info-card--highlight">
                        <h2>Що вже підготовлено</h2>
                        <ul className="next-steps">
                            <li>Реєстрація кнопки застосунку в `functions` та `order` через Poster POS API.</li>
                            <li>Popup shell для майбутнього UI інтеграції замість демо-прикладів boilerplate.</li>
                            <li>Адаптер для healthcheck зовнішнього сервісу і місце для подальшого API-клієнта.</li>
                            <li>Безпечний вектор розвитку: секрети не зберігаємо в POS bundle, а виносимо в backend/proxy.</li>
                            <li>Локальний browser preview з mock Poster runtime для тестування без каси.</li>
                        </ul>
                    </section>
                </div>
            </div>
        );
    }
}

export default PosterBaseApp;
