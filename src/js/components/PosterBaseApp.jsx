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

const INITIAL_SERVICE_STATUS = {
    state: 'checking',
    label: 'Ініціалізація',
    message: 'Збираю стартовий стан інтеграції...',
    checkedEndpoint: null,
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

class PosterBaseApp extends React.Component {
    constructor(props) {
        super(props);

        const environment = getPosterEnvironment();

        this.state = {
            checkedAt: null,
            environment,
            isRefreshing: false,
            lastLaunchContext: null,
            popupOpen: !isPosterAvailable(),
            posterDebugState: getPosterDebugState(),
            posterMode: getPosterMode(),
            runtimeLabel: getRuntimeLabel(environment),
            serviceStatus: INITIAL_SERVICE_STATUS,
        };

        this.isMountedFlag = false;
        this.handleApplicationIconClicked = this.handleApplicationIconClicked.bind(this);
        this.handleMockClosePopup = this.handleMockClosePopup.bind(this);
        this.handleMockFunctionsClick = this.handleMockFunctionsClick.bind(this);
        this.handleMockOrderClick = this.handleMockOrderClick.bind(this);
        this.handleMockRuntimeChange = this.handleMockRuntimeChange.bind(this);
        this.handlePopupClosed = this.handlePopupClosed.bind(this);
        this.refreshStatus = this.refreshStatus.bind(this);
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

        this.setState({
            lastLaunchContext: {
                orderId: getOrderId(data && data.order),
                place: data && data.place ? data.place : 'unknown',
            },
            popupOpen: true,
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

    render() {
        const {
            checkedAt,
            environment,
            isRefreshing,
            posterDebugState,
            posterMode,
            runtimeLabel,
            serviceStatus,
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
