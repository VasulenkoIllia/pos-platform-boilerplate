import { createAccountSettingsStore } from './accountSettingsStore.mjs';
import { createInstallationsStore } from './installationsStore.mjs';
import { createPostgresAccountSettingsStore } from './postgresAccountSettingsStore.mjs';
import { createPostgresInstallationsStore } from './postgresInstallationsStore.mjs';
import { createPostgresPool, ensureStorageTables } from './postgres.mjs';

export const createStorage = async (config) => {
    if (!config.database.url) {
        return {
            driver: 'file',
            installationsStore: createInstallationsStore(config.poster.installationsFile),
            accountSettingsStore: createAccountSettingsStore(
                config.poster.accountSettingsFile,
                config.security.settingsSecret,
            ),
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
        close: async () => {
            await pool.end();
        },
    };
};
