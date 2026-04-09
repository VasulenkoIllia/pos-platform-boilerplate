const normalizeText = value => String(value || '').trim();

const normalizeFloat = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number.parseFloat(String(value));

    return Number.isFinite(parsed) ? parsed : null;
};

const normalizePickup = (pickup) => {
    const normalizedPickup = {
        name: normalizeText(pickup && pickup.name),
        phone: normalizeText(pickup && pickup.phone),
        address: normalizeText(pickup && pickup.address),
        formattedAddress: normalizeText(pickup && pickup.formattedAddress),
        lat: normalizeFloat(pickup && pickup.lat),
        lng: normalizeFloat(pickup && pickup.lng),
    };

    return Object.values(normalizedPickup).some(Boolean)
        ? normalizedPickup
        : null;
};

const normalizeSpotId = (value) => {
    const normalizedValue = normalizeText(value);

    return normalizedValue || '';
};

const normalizePosterSpot = (spot) => {
    const spotId = normalizeSpotId(spot && (spot.spotId || spot.spot_id || spot.id));

    if (!spotId) {
        return null;
    }

    return {
        spotId,
        name: normalizeText(spot && (spot.name || spot.spot_name || spot.spotName || `Spot #${spotId}`)),
        address: normalizeText(spot && spot.address),
        phone: normalizeText(spot && spot.phone),
        lat: normalizeFloat(
            spot && (
                spot.lat
                || (spot.raw && spot.raw.lat)
            ),
        ),
        lng: normalizeFloat(
            spot && (
                spot.lng
                || (spot.raw && spot.raw.lng)
            ),
        ),
        raw: spot && spot.raw ? spot.raw : null,
    };
};

export const maskSecret = (value) => {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
        return '';
    }

    if (normalizedValue.length <= 6) {
        return '***';
    }

    return `${normalizedValue.slice(0, 3)}...${normalizedValue.slice(-3)}`;
};

export const buildSettingsUrl = ({
    baseUrl,
    settingsPath,
    account,
}) => {
    if (!baseUrl || !settingsPath || !account) {
        return '';
    }

    const url = new URL(settingsPath, `${baseUrl}/`);
    url.searchParams.set('account', account);

    return url.toString();
};

export const toPublicAccountSettings = (settings) => {
    if (!settings) {
        return null;
    }

    return {
        account: settings.account,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
        syncedAt: settings.syncedAt,
        defaultSpotId: settings.defaultSpotId || '',
        posterSpots: Array.isArray(settings.posterSpots) ? settings.posterSpots : [],
        pickupMappings: settings.pickupMappings || {},
        shipday: {
            apiKeyConfigured: Boolean(settings.shipday && settings.shipday.apiKeyConfigured),
            apiKeyMasked: settings.shipday && settings.shipday.apiKeyMasked
                ? settings.shipday.apiKeyMasked
                : maskSecret(settings.shipday && settings.shipday.apiKey),
            authMode: normalizeText(settings.shipday && settings.shipday.authMode) || 'x-api-key',
            mockMode: Boolean(settings.shipday && settings.shipday.mockMode),
        },
    };
};

const buildPosterSpotMap = spots => new Map(
    (Array.isArray(spots) ? spots : [])
        .map(normalizePosterSpot)
        .filter(Boolean)
        .map(spot => [spot.spotId, spot]),
);

const mergePickupWithPosterSpot = ({
    posterSpot,
    pickupOverride,
}) => {
    const basePickup = posterSpot
        ? {
            name: posterSpot.name,
            address: posterSpot.address,
            formattedAddress: posterSpot.address,
            phone: posterSpot.phone,
            lat: posterSpot.lat,
            lng: posterSpot.lng,
        }
        : {};
    const mergedPickup = normalizePickup({
        ...basePickup,
        ...(pickupOverride || {}),
    });

    return mergedPickup;
};

export const resolveShipdayAccountConfig = ({
    accountSettings,
    globalShipdayConfig,
    posterContext,
}) => {
    const settings = accountSettings || null;
    const shipdaySettings = settings && settings.shipday ? settings.shipday : {};
    const apiKey = normalizeText(shipdaySettings.apiKey) || normalizeText(globalShipdayConfig.apiKey);
    const authMode = normalizeText(shipdaySettings.authMode) || normalizeText(globalShipdayConfig.authMode) || 'x-api-key';
    const mockMode = Boolean(shipdaySettings.mockMode) || !apiKey;
    const posterSpotMap = buildPosterSpotMap(settings && settings.posterSpots);
    const pickupMappings = settings && settings.pickupMappings ? settings.pickupMappings : {};
    const explicitSpotId = normalizeSpotId(
        posterContext
        && (
            posterContext.spotId
            || posterContext.spot_id
        ),
    );
    const fallbackSpotId = normalizeSpotId(settings && settings.defaultSpotId);
    const singleSpotId = posterSpotMap.size === 1 ? Array.from(posterSpotMap.keys())[0] : '';
    const resolvedSpotId = explicitSpotId || fallbackSpotId || singleSpotId;
    const posterSpot = resolvedSpotId ? posterSpotMap.get(resolvedSpotId) : null;
    const pickupOverride = resolvedSpotId ? pickupMappings[resolvedSpotId] : null;
    const fallbackPickup = normalizePickup(globalShipdayConfig.defaultPickup);
    const pickup = mergePickupWithPosterSpot({
        posterSpot,
        pickupOverride,
    }) || fallbackPickup;

    return {
        account: settings ? settings.account : '',
        apiKey,
        authMode,
        mockMode,
        pickup,
        posterSpot,
        resolvedSpotId,
        hasConfiguredApiKey: Boolean(normalizeText(shipdaySettings.apiKey)),
    };
};

export const buildAccountSettingsFromInput = ({
    account,
    input,
    existingSettings,
    posterSpots,
}) => {
    const normalizedAccount = normalizeText(account);

    if (!normalizedAccount) {
        throw new Error('Потрібен account для збереження налаштувань.');
    }

    const currentSettings = existingSettings || {
        account: normalizedAccount,
        posterSpots: [],
        pickupMappings: {},
        shipday: {
            apiKey: '',
            authMode: 'x-api-key',
            mockMode: true,
        },
        defaultSpotId: '',
    };
    const nextPosterSpots = Array.isArray(posterSpots) && posterSpots.length
        ? posterSpots.map(normalizePosterSpot).filter(Boolean)
        : currentSettings.posterSpots;
    const pickupMappingsInput = input && input.pickupMappings && typeof input.pickupMappings === 'object'
        ? input.pickupMappings
        : {};
    const pickupMappings = nextPosterSpots.reduce((accumulator, spot) => {
        const rawPickup = pickupMappingsInput[spot.spotId] || currentSettings.pickupMappings[spot.spotId];
        const normalizedPickup = normalizePickup(rawPickup);

        if (normalizedPickup) {
            accumulator[spot.spotId] = normalizedPickup;
        }

        return accumulator;
    }, {});
    const shipdayInput = input && input.shipday && typeof input.shipday === 'object'
        ? input.shipday
        : {};
    const apiKeyInput = normalizeText(shipdayInput.apiKey);
    const apiKey = apiKeyInput || normalizeText(currentSettings.shipday && currentSettings.shipday.apiKey);
    const authMode = normalizeText(shipdayInput.authMode)
        || normalizeText(currentSettings.shipday && currentSettings.shipday.authMode)
        || 'x-api-key';
    const mockMode = Boolean(shipdayInput.mockMode);
    const defaultSpotIdInput = normalizeSpotId(input && input.defaultSpotId);
    const defaultSpotId = defaultSpotIdInput
        || normalizeSpotId(currentSettings.defaultSpotId)
        || (nextPosterSpots.length === 1 ? nextPosterSpots[0].spotId : '');

    return {
        account: normalizedAccount,
        createdAt: currentSettings.createdAt,
        syncedAt: currentSettings.syncedAt,
        posterSpots: nextPosterSpots,
        pickupMappings,
        defaultSpotId,
        shipday: {
            apiKey,
            authMode,
            mockMode,
        },
    };
};
