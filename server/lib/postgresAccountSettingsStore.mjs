import {
    normalizeAccountSettingsRecord,
    serializeAccountSettingsRecord,
} from './accountSettingsStore.mjs';

const toIsoString = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return new Date(value).toISOString();
};

const fromRow = (row, secret) => normalizeAccountSettingsRecord(row.account, {
    account: row.account,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    syncedAt: toIsoString(row.synced_at),
    defaultSpotId: row.default_spot_id || '',
    posterSpots: row.poster_spots || [],
    pickupMappings: row.pickup_mappings || {},
    shipday: row.shipday || {},
}, secret);

export const createPostgresAccountSettingsStore = (pool, secret) => ({
    async get(account) {
        const { rows } = await pool.query(
            `SELECT
                account,
                created_at,
                updated_at,
                synced_at,
                default_spot_id,
                poster_spots,
                pickup_mappings,
                shipday
             FROM poster_account_settings
             WHERE account = $1`,
            [account],
        );

        return rows[0] ? fromRow(rows[0], secret) : null;
    },

    async list() {
        const { rows } = await pool.query(
            `SELECT
                account,
                created_at,
                updated_at,
                synced_at,
                default_spot_id,
                poster_spots,
                pickup_mappings,
                shipday
             FROM poster_account_settings
             ORDER BY account ASC`,
        );

        return rows.map(row => fromRow(row, secret));
    },

    async save(record) {
        const existingRecord = await this.get(record.account);
        const normalizedRecord = normalizeAccountSettingsRecord(record.account, {
            ...(existingRecord || {}),
            ...record,
            pickupMappings: record.pickupMappings
                || (existingRecord && existingRecord.pickupMappings)
                || {},
            posterSpots: record.posterSpots
                || (existingRecord && existingRecord.posterSpots)
                || [],
            shipday: {
                ...((existingRecord && existingRecord.shipday) || {}),
                ...(record.shipday || {}),
            },
        }, secret);
        const serializedRecord = serializeAccountSettingsRecord(normalizedRecord, secret);
        const { rows } = await pool.query(
            `INSERT INTO poster_account_settings (
                account,
                created_at,
                updated_at,
                synced_at,
                default_spot_id,
                poster_spots,
                pickup_mappings,
                shipday
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
            ON CONFLICT (account) DO UPDATE SET
                updated_at = EXCLUDED.updated_at,
                synced_at = EXCLUDED.synced_at,
                default_spot_id = EXCLUDED.default_spot_id,
                poster_spots = EXCLUDED.poster_spots,
                pickup_mappings = EXCLUDED.pickup_mappings,
                shipday = EXCLUDED.shipday
            RETURNING
                account,
                created_at,
                updated_at,
                synced_at,
                default_spot_id,
                poster_spots,
                pickup_mappings,
                shipday`,
            [
                serializedRecord.account,
                serializedRecord.createdAt || new Date().toISOString(),
                new Date().toISOString(),
                serializedRecord.syncedAt || null,
                serializedRecord.defaultSpotId || null,
                JSON.stringify(serializedRecord.posterSpots || []),
                JSON.stringify(serializedRecord.pickupMappings || {}),
                JSON.stringify(serializedRecord.shipday || {}),
            ],
        );

        return fromRow(rows[0], secret);
    },
});
