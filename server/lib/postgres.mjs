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

    await pool.query(`
        CREATE TABLE IF NOT EXISTS order_log (
            id BIGSERIAL PRIMARY KEY,
            account TEXT NOT NULL,
            order_number TEXT NOT NULL,
            shipday_order_id TEXT,
            spot_id TEXT,
            customer_phone TEXT,
            mock_mode BOOLEAN NOT NULL DEFAULT FALSE,
            status TEXT NOT NULL DEFAULT 'sent',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        ALTER TABLE order_log
            ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';
    `);

    await pool.query(`
        ALTER TABLE order_log
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await pool.query(`
        WITH ranked_live_rows AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY account, order_number
                    ORDER BY
                        CASE status
                            WHEN 'sent' THEN 0
                            WHEN 'pending' THEN 1
                            ELSE 2
                        END,
                        updated_at DESC,
                        created_at DESC,
                        id DESC
                ) AS row_rank
            FROM order_log
            WHERE mock_mode = FALSE
              AND status IN ('pending', 'sent')
        )
        UPDATE order_log
        SET status = 'failed',
            updated_at = NOW()
        WHERE id IN (
            SELECT id
            FROM ranked_live_rows
            WHERE row_rank > 1
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS order_log_order_number_idx ON order_log (order_number);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS order_log_account_idx ON order_log (account);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS order_log_shipday_order_id_idx ON order_log (shipday_order_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS order_log_live_dedupe_idx
            ON order_log (account, order_number, status)
            WHERE mock_mode = FALSE;
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS order_log_live_unique_idx
            ON order_log (account, order_number)
            WHERE mock_mode = FALSE
              AND status IN ('pending', 'sent');
    `);
};
