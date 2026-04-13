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
    status: row.status || 'sent',
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
});

export const createPostgresOrderLogStore = pool => ({
    async save({ account, orderNumber, shipdayOrderId, spotId, customerPhone, mockMode }) {
        const { rows } = await pool.query(
            `INSERT INTO order_log (account, order_number, shipday_order_id, spot_id, customer_phone, mock_mode, status, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'sent', NOW())
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

    async createPendingIfAbsent({ account, orderNumber, spotId, customerPhone, mockMode }) {
        const normalizedAccount = String(account || '').trim();
        const normalizedOrderNumber = String(orderNumber || '').trim();
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            await client.query(
                'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
                [normalizedAccount, normalizedOrderNumber],
            );

            const { rows: existingRows } = await client.query(
                `SELECT *
                 FROM order_log
                 WHERE account = $1
                   AND order_number = $2
                   AND mock_mode = FALSE
                   AND status IN ('pending', 'sent')
                 ORDER BY created_at DESC
                 LIMIT 1
                 FOR UPDATE`,
                [normalizedAccount, normalizedOrderNumber],
            );

            if (existingRows[0]) {
                await client.query('ROLLBACK');

                return {
                    created: false,
                    record: fromRow(existingRows[0]),
                };
            }

            const { rows } = await client.query(
                `INSERT INTO order_log (account, order_number, shipday_order_id, spot_id, customer_phone, mock_mode, status, updated_at)
                 VALUES ($1, $2, NULL, $3, $4, $5, 'pending', NOW())
                 RETURNING *`,
                [
                    normalizedAccount,
                    normalizedOrderNumber,
                    spotId || null,
                    customerPhone || null,
                    Boolean(mockMode),
                ],
            );

            await client.query('COMMIT');

            return {
                created: true,
                record: fromRow(rows[0]),
            };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => null);
            throw error;
        } finally {
            client.release();
        }
    },

    async markSent(id, { shipdayOrderId, spotId, customerPhone, mockMode } = {}) {
        const { rows } = await pool.query(
            `UPDATE order_log
             SET shipday_order_id = COALESCE($2, shipday_order_id),
                 spot_id = COALESCE($3, spot_id),
                 customer_phone = COALESCE($4, customer_phone),
                 mock_mode = $5,
                 status = 'sent',
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
                id,
                shipdayOrderId || null,
                spotId || null,
                customerPhone || null,
                Boolean(mockMode),
            ],
        );

        return rows[0] ? fromRow(rows[0]) : null;
    },

    async markFailed(id, { failureMessage } = {}) {
        const { rows } = await pool.query(
            `UPDATE order_log
             SET status = 'failed',
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
                id,
            ],
        );

        if (failureMessage) {
            console.warn(`[order_log] Shipday send attempt ${id} marked failed: ${failureMessage}`);
        }

        return rows[0] ? fromRow(rows[0]) : null;
    },

    async findByOrderNumber(orderNumber) {
        const { rows } = await pool.query(
            `SELECT * FROM order_log
             WHERE order_number = $1
               AND status = 'sent'
               AND mock_mode = FALSE
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
               AND status = 'sent'
               AND mock_mode = FALSE
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
               AND status = 'sent'
               AND mock_mode = FALSE
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
               AND status = 'sent'
               AND mock_mode = FALSE
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
