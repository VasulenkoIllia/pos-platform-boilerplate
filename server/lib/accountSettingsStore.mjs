import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const INITIAL_DATA = {
    accounts: {},
};

const cloneInitialData = () => JSON.parse(JSON.stringify(INITIAL_DATA));

const normalizeText = value => String(value || '').trim();

const normalizeFloat = (value) => {
    if (value === '' || value === null || value === undefined) {
        return null;
    }

    const parsed = Number.parseFloat(String(value));

    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSpot = (spot) => {
    const spotId = normalizeText(spot && (spot.spotId || spot.spot_id || spot.id));

    if (!spotId) {
        return null;
    }

    return {
        spotId,
        name: normalizeText(spot && (spot.name || spot.spot_name || spot.spotName)),
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

const deriveKey = (secret) => crypto.createHash('sha256').update(secret).digest();

const encryptSecret = (value, secret) => {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
        return '';
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
    const encrypted = Buffer.concat([cipher.update(normalizedValue, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
        'enc',
        'v1',
        iv.toString('base64'),
        tag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':');
};

const decryptSecret = (value, secret) => {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue || !normalizedValue.startsWith('enc:v1:')) {
        return normalizedValue;
    }

    const [, , ivBase64, tagBase64, encryptedBase64] = normalizedValue.split(':');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        deriveKey(secret),
        Buffer.from(ivBase64, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedBase64, 'base64')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
};

const maskSecret = (value) => {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
        return '';
    }

    if (normalizedValue.length <= 6) {
        return '***';
    }

    return `${normalizedValue.slice(0, 3)}...${normalizedValue.slice(-3)}`;
};

const normalizeRecord = (account, record, secret) => {
    const apiKey = normalizeText(record && record.shipday && record.shipday.apiKey)
        || decryptSecret(record && record.shipday && record.shipday.apiKeyEncrypted, secret);
    const pickupMappingsInput = (record && record.pickupMappings) || {};
    const pickupMappings = Object.entries(pickupMappingsInput).reduce((accumulator, [spotId, pickup]) => {
        const normalizedPickup = normalizePickup(pickup);

        if (normalizedPickup) {
            accumulator[String(spotId)] = normalizedPickup;
        }

        return accumulator;
    }, {});

    return {
        account,
        createdAt: record && record.createdAt ? record.createdAt : new Date().toISOString(),
        updatedAt: record && record.updatedAt ? record.updatedAt : new Date().toISOString(),
        syncedAt: record && record.syncedAt ? record.syncedAt : null,
        defaultSpotId: normalizeText(record && record.defaultSpotId),
        posterSpots: Array.isArray(record && record.posterSpots)
            ? record.posterSpots.map(normalizeSpot).filter(Boolean)
            : [],
        pickupMappings,
        shipday: {
            apiKey,
            apiKeyMasked: maskSecret(apiKey),
            apiKeyConfigured: Boolean(apiKey),
            authMode: normalizeText(record && record.shipday && record.shipday.authMode) || 'x-api-key',
            mockMode: Boolean(record && record.shipday && record.shipday.mockMode),
        },
    };
};

const serializeRecord = (record, secret) => ({
    account: record.account,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncedAt: record.syncedAt || null,
    defaultSpotId: normalizeText(record.defaultSpotId),
    posterSpots: Array.isArray(record.posterSpots)
        ? record.posterSpots.map(normalizeSpot).filter(Boolean)
        : [],
    pickupMappings: Object.entries(record.pickupMappings || {}).reduce((accumulator, [spotId, pickup]) => {
        const normalizedPickup = normalizePickup(pickup);

        if (normalizedPickup) {
            accumulator[String(spotId)] = normalizedPickup;
        }

        return accumulator;
    }, {}),
    shipday: {
        apiKeyEncrypted: encryptSecret(record.shipday && record.shipday.apiKey, secret),
        authMode: normalizeText(record.shipday && record.shipday.authMode) || 'x-api-key',
        mockMode: Boolean(record.shipday && record.shipday.mockMode),
    },
});

export const createAccountSettingsStore = (filePath, secret) => {
    let writeQueue = Promise.resolve();

    const ensureFile = async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        try {
            await fs.access(filePath);
        } catch (error) {
            await fs.writeFile(filePath, JSON.stringify(INITIAL_DATA, null, 2));
        }
    };

    const readData = async () => {
        await ensureFile();
        const content = await fs.readFile(filePath, 'utf8');

        if (!content.trim()) {
            return cloneInitialData();
        }

        try {
            const parsed = JSON.parse(content);

            return {
                accounts: parsed.accounts || {},
            };
        } catch (error) {
            return cloneInitialData();
        }
    };

    const writeData = async (data) => {
        writeQueue = writeQueue.then(() => fs.writeFile(filePath, JSON.stringify(data, null, 2)));
        await writeQueue;
    };

    return {
        async get(account) {
            const normalizedAccount = normalizeText(account);

            if (!normalizedAccount) {
                return null;
            }

            const data = await readData();
            const record = data.accounts[normalizedAccount];

            if (!record) {
                return null;
            }

            return normalizeRecord(normalizedAccount, record, secret);
        },

        async list() {
            const data = await readData();

            return Object.entries(data.accounts).map(([account, record]) => normalizeRecord(account, record, secret));
        },

        async save(record) {
            const normalizedAccount = normalizeText(record && record.account);

            if (!normalizedAccount) {
                throw new Error('Account settings потребують account.');
            }

            const data = await readData();
            const existingRecord = data.accounts[normalizedAccount];
            const normalizedRecord = normalizeRecord(normalizedAccount, {
                ...existingRecord,
                ...record,
                pickupMappings: record.pickupMappings || (existingRecord && existingRecord.pickupMappings) || {},
                posterSpots: record.posterSpots || (existingRecord && existingRecord.posterSpots) || [],
                shipday: {
                    ...(existingRecord && existingRecord.shipday),
                    ...(record.shipday || {}),
                },
            }, secret);

            data.accounts[normalizedAccount] = serializeRecord(normalizedRecord, secret);
            await writeData(data);

            return normalizedRecord;
        },
    };
};
