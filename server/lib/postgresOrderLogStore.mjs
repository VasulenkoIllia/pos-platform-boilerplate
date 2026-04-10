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
    id: row.id,
    account: row.account,
    orderNumber: row.order_number,
    shipdayOrderId: row.shipday_order_id || null,
    spotId: row.spot_id || null,
    customerPhone: row.customer_phone || null,
    mockMode: Boolean(row.mock_mode),
    createdAt: toIsoString(row.created_at),
});

export const createPostgresOrderLogStore = pool => ({
    async save({ account, orderNumber, shipdayOrderId, spotId, customerPhone, mockMode }) {
        const { rows } = await pool.query(
            `INSERT INTO order_log (account, order_number, shipday_order_id, spot_id, customer_phone, mock_mode)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                account,
                String(orderNumber),
                shipdayOrderId || null,
                spotId || null,
                customerPhone || null,
                Boolean(mockMode),
            ],
        );

        return fromRow(rows[0]);
    },

    async findByOrderNumber(orderNumber) {
        const { rows } = await pool.query(
            `SELECT * FROM order_log
             WHERE order_number = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [String(orderNumber)],
        );

        return rows[0] ? fromRow(rows[0]) : null;
    },

    async findByShipdayOrderId(shipdayOrderId) {
        const normalizedShipdayOrderId = String(shipdayOrderId || '').trim();

        if (!normalizedShipdayOrderId) {
            return null;
        }

        const { rows } = await pool.query(
            `SELECT * FROM order_log
             WHERE shipday_order_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [normalizedShipdayOrderId],
        );

        return rows[0] ? fromRow(rows[0]) : null;
    },

    async findUniqueByOrderNumber(orderNumber) {
        const normalizedOrderNumber = String(orderNumber || '').trim();

        if (!normalizedOrderNumber) {
            return null;
        }

        const { rows: accountRows } = await pool.query(
            `SELECT account
             FROM order_log
             WHERE order_number = $1
             GROUP BY account
             ORDER BY account ASC
             LIMIT 2`,
            [normalizedOrderNumber],
        );

        if (!accountRows.length) {
            return null;
        }

        if (accountRows.length !== 1 || !accountRows[0].account) {
            return null;
        }

        const { rows } = await pool.query(
            `SELECT *
             FROM order_log
             WHERE order_number = $1
               AND account = $2
             ORDER BY created_at DESC
             LIMIT 1`,
            [normalizedOrderNumber, accountRows[0].account],
        );

        return rows[0] ? fromRow(rows[0]) : null;
    },

    async listByAccount(account, { limit = 100 } = {}) {
        const { rows } = await pool.query(
            `SELECT * FROM order_log
             WHERE account = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [account, limit],
        );

        return rows.map(fromRow);
    },
});
