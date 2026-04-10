import { createAccountSettingsStore } from './accountSettingsStore.mjs';
import { createInstallationsStore } from './installationsStore.mjs';
import { createPostgresAccountSettingsStore } from './postgresAccountSettingsStore.mjs';
import { createPostgresInstallationsStore } from './postgresInstallationsStore.mjs';
import { createPostgresOrderLogStore } from './postgresOrderLogStore.mjs';
import { createPostgresPool, ensureStorageTables } from './postgres.mjs';

// Мінімальний in-memory order log для file-based режиму (dev / local preview)
const createInMemoryOrderLogStore = () => {
    const records = [];

    return {
        async save(entry) {
            const record = {
                id: records.length + 1,
                account: entry.account,
                orderNumber: String(entry.orderNumber),
                shipdayOrderId: entry.shipdayOrderId || null,
                spotId: entry.spotId || null,
                customerPhone: entry.customerPhone || null,
                mockMode: Boolean(entry.mockMode),
                createdAt: new Date().toISOString(),
            };

            records.push(record);

            return record;
        },

        async findByOrderNumber(orderNumber) {
            const target = String(orderNumber);

            return records.slice().reverse().find(r => r.orderNumber === target) || null;
        },

        async findByShipdayOrderId(shipdayOrderId) {
            const target = String(shipdayOrderId || '').trim();

            if (!target) {
                return null;
            }

            return records.slice().reverse().find(r => r.shipdayOrderId === target) || null;
        },

        async findUniqueByOrderNumber(orderNumber) {
            const target = String(orderNumber || '').trim();

            if (!target) {
                return null;
            }

            const matchingRecords = records.filter(r => r.orderNumber === target);
            const accounts = Array.from(new Set(matchingRecords.map(r => r.account).filter(Boolean)));

            if (accounts.length !== 1) {
                return null;
            }

            return matchingRecords[matchingRecords.length - 1] || null;
        },

        async listByAccount(account, { limit = 100 } = {}) {
            return records
                .filter(r => r.account === account)
                .slice(-limit)
                .reverse();
        },
    };
};

export const createStorage = async (config) => {
    if (!config.database.url) {
        return {
            driver: 'file',
            installationsStore: createInstallationsStore(config.poster.installationsFile),
            accountSettingsStore: createAccountSettingsStore(
                config.poster.accountSettingsFile,
                config.security.settingsSecret,
            ),
            orderLogStore: createInMemoryOrderLogStore(),
            close: async () => {},
        };
    }

    const pool = createPostgresPool({
        connectionString: config.database.url,
        sslMode: config.database.sslMode,
    });

    await ensureStorageTables(pool);

    return {
        driver: 'postgres',
        installationsStore: createPostgresInstallationsStore(pool),
        accountSettingsStore: createPostgresAccountSettingsStore(
            pool,
            config.security.settingsSecret,
        ),
        orderLogStore: createPostgresOrderLogStore(pool),
        close: async () => {
            await pool.end();
        },
    };
};
