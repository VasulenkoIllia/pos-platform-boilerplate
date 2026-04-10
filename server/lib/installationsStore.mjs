import fs from 'node:fs/promises';
import path from 'node:path';

const INITIAL_DATA = {
    installations: {},
};

const normalizeAccount = value => String(value || '').trim();

const cloneInitialData = () => JSON.parse(JSON.stringify(INITIAL_DATA));

export const createInstallationsStore = (filePath) => {
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
                installations: parsed.installations || {},
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
            const key = normalizeAccount(account);

            if (!key) {
                return null;
            }

            const data = await readData();

            return data.installations[key] || null;
        },
        async list() {
            const data = await readData();

            return Object.values(data.installations);
        },
        async save(record) {
            const key = normalizeAccount(record && record.account);

            if (!key) {
                throw new Error('Installation потребує account.');
            }

            const data = await readData();
            data.installations[key] = { ...record, account: key };
            await writeData(data);

            return data.installations[key];
        },
    };
};
