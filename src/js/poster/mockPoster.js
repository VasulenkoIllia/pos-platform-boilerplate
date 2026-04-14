const DEFAULT_ENVIRONMENT = {
    android: false,
    iOS: false,
    windows: false,
    desktop: true,
};

const buildMockClient = () => ({
    id: 77,
    firstname: 'Local',
    lastname: 'Preview Client',
    name: 'Local Preview Client',
    phone: '+380671112233',
    address: 'вул. Саксаганського, 15, Київ',
});

const buildMockOrder = () => ({
    id: 'DEV-1001',
    orderId: 'DEV-1001',
    totalSum: 42500,
    total: 425,
    deliveryFee: 5000,
    spotId: '1',
    clientId: 77,
    guestsCount: 2,
    tableName: 'Preview Table',
    spotName: 'Main Hall',
    client: buildMockClient(),
    comment: 'Домофон 18, подзвонити за 5 хвилин.',
    deliveryInfo: {
        city: 'Київ',
        address1: 'вул. Саксаганського, 15',
        address2: '',
        deliveryFee: 5000,
        comment: 'Домофон 18, подзвонити за 5 хвилин.',
    },
    delivery: {
        deliveryPrice: 5000,
        time: '2026-04-14 18:30:00',
    },
    address: {
        address1: 'вул. Саксаганського, 15',
        city: 'Київ',
    },
    products: [
        {
            id: 101,
            product_name: 'Pizza Pepperoni',
            count: 2,
            price: 18000,
        },
        {
            id: 202,
            product_name: 'Cola 0.5',
            count: 1,
            price: 6500,
        },
    ],
});

const cloneValue = value => JSON.parse(JSON.stringify(value));

const createEventBus = () => {
    const listeners = {};

    return {
        on(eventName, handler) {
            if (!listeners[eventName]) {
                listeners[eventName] = [];
            }

            listeners[eventName].push(handler);
        },

        emit(eventName, payload) {
            const handlers = listeners[eventName] || [];

            handlers.forEach(handler => handler(payload));
        },
    };
};

const installPosterMock = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    if (window.Poster) {
        return window.Poster;
    }

    const eventBus = createEventBus();
    const mockState = {
        environment: cloneValue(DEFAULT_ENVIRONMENT),
        registeredIcons: {},
        popupOpen: false,
        lastPopup: null,
        lastNotification: null,
        activeOrder: null,
    };

    const poster = {
        mockRuntime: true,
        mockAccount: 'preview-account',
        interface: {
            showApplicationIconAt(places) {
                mockState.registeredIcons = cloneValue(places || {});
            },

            popup(options) {
                mockState.popupOpen = true;
                mockState.lastPopup = cloneValue(options || {});
                return true;
            },

            showNotification(options) {
                mockState.lastNotification = cloneValue(options || {});
                return Promise.resolve(mockState.lastNotification);
            },
        },

        on(eventName, handler) {
            eventBus.on(eventName, handler);
        },

        orders: {
            getActive() {
                return Promise.resolve(
                    mockState.activeOrder
                        ? { order: cloneValue(mockState.activeOrder) }
                        : {},
                );
            },
        },

        clients: {
            get(clientId) {
                const activeClient = mockState.activeOrder && mockState.activeOrder.client;

                if (!activeClient || Number(activeClient.id) !== Number(clientId)) {
                    return Promise.resolve(false);
                }

                return Promise.resolve(cloneValue(activeClient));
            },
        },

        products: {
            getFullName({ id }) {
                const activeProducts = mockState.activeOrder
                    ? Object.values(mockState.activeOrder.products || {})
                    : [];
                const product = activeProducts.find(item => Number(item.id) === Number(id));

                return Promise.resolve({
                    id,
                    modification: product && product.modification ? product.modification : 0,
                    name: product && product.product_name ? product.product_name : `Product #${id}`,
                    modGroupName: '',
                });
            },
        },

        emit(eventName, payload) {
            eventBus.emit(eventName, payload);
        },

        mockGetState() {
            return {
                environment: cloneValue(mockState.environment),
                registeredIcons: cloneValue(mockState.registeredIcons),
                popupOpen: mockState.popupOpen,
                lastPopup: cloneValue(mockState.lastPopup),
                lastNotification: cloneValue(mockState.lastNotification),
            };
        },

        mockSetEnvironment(nextEnvironment) {
            mockState.environment = {
                ...cloneValue(DEFAULT_ENVIRONMENT),
                ...cloneValue(nextEnvironment || {}),
            };
            poster.environment = cloneValue(mockState.environment);
        },

        mockSimulateApplicationClick(place) {
            const payload = {
                place,
            };

            if (place === 'order') {
                mockState.activeOrder = buildMockOrder();
                payload.order = cloneValue(mockState.activeOrder);
            }

            eventBus.emit('applicationIconClicked', payload);
        },

        mockClosePopup() {
            mockState.popupOpen = false;
            eventBus.emit('afterPopupClosed');
        },
    };

    poster.environment = cloneValue(mockState.environment);
    window.Poster = poster;

    return poster;
};

export default installPosterMock;
