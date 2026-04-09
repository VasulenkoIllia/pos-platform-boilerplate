import { Pool } from 'pg';

const buildSslConfig = (sslMode) => {
    if (sslMode === 'require') {
        return {
            rejectUnauthorized: false,
        };
    }

    return undefined;
};

export const createPostgresPool = ({
    connectionString,
    sslMode,
}) => new Pool({
    connectionString,
    ssl: buildSslConfig(sslMode),
});

export const ensureStorageTables = async (pool) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS poster_installations (
            account TEXT PRIMARY KEY,
            access_token TEXT NOT NULL,
            token_type TEXT,
            received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            endpoint TEXT,
            owner_info JSONB,
            user_data JSONB,
            raw JSONB
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS poster_account_settings (
            account TEXT PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            synced_at TIMESTAMPTZ,
            default_spot_id TEXT,
            poster_spots JSONB NOT NULL DEFAULT '[]'::jsonb,
            pickup_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
            shipday JSONB NOT NULL DEFAULT '{}'::jsonb
        );
    `);
};
