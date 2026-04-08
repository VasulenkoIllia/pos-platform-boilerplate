const DEFAULT_ENVIRONMENT = {
    android: false,
    iOS: false,
    windows: false,
    desktop: true,
};

const buildMockOrder = () => ({
    id: 'DEV-1001',
    orderId: 'DEV-1001',
    totalSum: 42500,
    guestsCount: 2,
    tableName: 'Preview Table',
    spotName: 'Main Hall',
    client: {
        id: 77,
        phone: '+380671112233',
        name: 'Local Preview Client',
    },
    comment: 'Домофон 18, подзвонити за 5 хвилин.',
    address: {
        address1: 'вул. Саксаганського, 15',
        city: 'Київ',
    },
    products: [
        {
            product_name: 'Pizza Pepperoni',
            count: 2,
            price: 18000,
        },
        {
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
    };

    const poster = {
        mockRuntime: true,
        interface: {
            showApplicationIconAt(places) {
                mockState.registeredIcons = cloneValue(places || {});
            },

            popup(options) {
                mockState.popupOpen = true;
                mockState.lastPopup = cloneValue(options || {});
                return true;
            },
        },

        on(eventName, handler) {
            eventBus.on(eventName, handler);
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
                payload.order = buildMockOrder();
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
