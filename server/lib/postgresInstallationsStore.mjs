const toIsoString = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return new Date(value).toISOString();
};

const fromRow = row => ({
    account: row.account,
    accessToken: row.access_token,
    tokenType: row.token_type || 'Bearer',
    receivedAt: toIsoString(row.received_at),
    endpoint: row.endpoint,
    ownerInfo: row.owner_info || null,
    user: row.user_data || null,
    raw: row.raw || null,
});

export const createPostgresInstallationsStore = (pool) => ({
    async get(account) {
        const { rows } = await pool.query(
            `SELECT account, access_token, token_type, received_at, endpoint, owner_info, user_data, raw
             FROM poster_installations
             WHERE account = $1`,
            [account],
        );

        return rows[0] ? fromRow(rows[0]) : null;
    },

    async list() {
        const { rows } = await pool.query(
            `SELECT account, access_token, token_type, received_at, endpoint, owner_info, user_data, raw
             FROM poster_installations
             ORDER BY account ASC`,
        );

        return rows.map(fromRow);
    },

    async save(record) {
        const { rows } = await pool.query(
            `INSERT INTO poster_installations (
                account,
                access_token,
                token_type,
                received_at,
                endpoint,
                owner_info,
                user_data,
                raw
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
            ON CONFLICT (account) DO UPDATE SET
                access_token = EXCLUDED.access_token,
                token_type = EXCLUDED.token_type,
                received_at = EXCLUDED.received_at,
                endpoint = EXCLUDED.endpoint,
                owner_info = EXCLUDED.owner_info,
                user_data = EXCLUDED.user_data,
                raw = EXCLUDED.raw
            RETURNING account, access_token, token_type, received_at, endpoint, owner_info, user_data, raw`,
            [
                record.account,
                record.accessToken,
                record.tokenType || 'Bearer',
                record.receivedAt || new Date().toISOString(),
                record.endpoint || null,
                JSON.stringify(record.ownerInfo || null),
                JSON.stringify(record.user || null),
                JSON.stringify(record.raw || null),
            ],
        );

        return fromRow(rows[0]);
    },
});
