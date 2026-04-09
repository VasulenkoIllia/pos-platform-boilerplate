const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderList = items => items.map(item => `<li>${escapeHtml(item)}</li>`).join('');

const renderTextInput = ({
    name,
    label,
    value,
    placeholder = '',
    helper = '',
    type = 'text',
}) => `
    <label class="field">
        <span>${escapeHtml(label)}</span>
        <input type="${escapeHtml(type)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
        ${helper ? `<small>${escapeHtml(helper)}</small>` : ''}
    </label>
`;

const renderSelect = ({
    name,
    label,
    value,
    options,
    helper = '',
}) => `
    <label class="field">
        <span>${escapeHtml(label)}</span>
        <select name="${escapeHtml(name)}">
            ${options.map(option => `
                <option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>
                    ${escapeHtml(option.label)}
                </option>
            `).join('')}
        </select>
        ${helper ? `<small>${escapeHtml(helper)}</small>` : ''}
    </label>
`;

const renderCheckbox = ({
    name,
    label,
    checked,
    helper = '',
}) => `
    <label class="checkbox">
        <input type="checkbox" name="${escapeHtml(name)}" value="1" ${checked ? 'checked' : ''}>
        <span>${escapeHtml(label)}</span>
    </label>
    ${helper ? `<small class="checkbox-helper">${escapeHtml(helper)}</small>` : ''}
`;

const renderLayout = ({
    title,
    eyebrow,
    heading,
    body,
    aside,
    autoRedirectUrl,
    autoRedirectDelayMs = 800,
}) => `<!doctype html>
<html lang="uk">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #f4efe4;
            --panel: rgba(255, 255, 255, 0.92);
            --text: #1d241f;
            --muted: #5d655f;
            --line: rgba(29, 36, 31, 0.12);
            --accent: #1f7a4b;
            --accent-soft: rgba(31, 122, 75, 0.1);
            --warn: #8d5c16;
            --danger: #9f2f2f;
            --shadow: 0 20px 60px rgba(29, 36, 31, 0.14);
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: "Segoe UI", "Helvetica Neue", sans-serif;
            color: var(--text);
            background:
                radial-gradient(circle at top left, rgba(31, 122, 75, 0.12), transparent 28%),
                radial-gradient(circle at bottom right, rgba(200, 141, 39, 0.16), transparent 25%),
                var(--bg);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }
        .card {
            width: min(1120px, 100%);
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 24px;
            box-shadow: var(--shadow);
            overflow: hidden;
        }
        .card__body {
            padding: 32px;
            display: grid;
            gap: 24px;
        }
        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 999px;
            background: var(--accent-soft);
            color: var(--accent);
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }
        h1, h2, h3 {
            margin: 0;
            line-height: 1.08;
        }
        h1 {
            font-size: clamp(28px, 5vw, 42px);
        }
        h2 {
            font-size: 24px;
        }
        h3 {
            font-size: 18px;
        }
        p, li, label, small {
            margin: 0;
            line-height: 1.65;
            color: var(--muted);
            font-size: 15px;
        }
        ul {
            margin: 0;
            padding-left: 20px;
            display: grid;
            gap: 10px;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }
        .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 48px;
            padding: 0 18px;
            border-radius: 14px;
            background: var(--accent);
            color: #fff;
            text-decoration: none;
            font-weight: 700;
            border: 0;
            cursor: pointer;
        }
        .button--ghost {
            background: rgba(29, 36, 31, 0.08);
            color: var(--text);
        }
        .panel {
            padding: 18px 20px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.7);
            border: 1px solid var(--line);
        }
        .panel strong {
            color: var(--text);
        }
        .panel-grid {
            display: grid;
            gap: 16px;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .grid {
            display: grid;
            gap: 16px;
        }
        .form-grid {
            display: grid;
            gap: 16px;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .field {
            display: grid;
            gap: 8px;
        }
        .field span {
            color: var(--text);
            font-weight: 600;
        }
        .field input,
        .field select,
        .field textarea {
            width: 100%;
            min-height: 44px;
            border-radius: 12px;
            border: 1px solid rgba(29, 36, 31, 0.18);
            padding: 10px 12px;
            font: inherit;
            background: #fff;
            color: var(--text);
        }
        .field textarea {
            min-height: 96px;
            resize: vertical;
        }
        .checkbox {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            font-weight: 600;
            color: var(--text);
        }
        .checkbox input {
            width: 18px;
            height: 18px;
        }
        .checkbox-helper {
            display: block;
            margin-top: 4px;
        }
        .mono {
            font-family: "SFMono-Regular", "Menlo", monospace;
            font-size: 14px;
            color: var(--text);
            word-break: break-word;
        }
        .helper {
            font-size: 14px;
        }
        .tone-danger {
            color: var(--danger);
        }
        .tone-success {
            color: var(--accent);
        }
        .spot-list {
            display: grid;
            gap: 16px;
        }
        .spot-card {
            padding: 20px;
            border-radius: 18px;
            border: 1px solid var(--line);
            background: rgba(255, 255, 255, 0.72);
            display: grid;
            gap: 14px;
        }
        .spot-card__meta {
            display: grid;
            gap: 6px;
        }
        .spot-card__meta strong {
            color: var(--text);
        }
        .badge {
            display: inline-flex;
            width: fit-content;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(29, 36, 31, 0.08);
            color: var(--text);
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .notice {
            padding: 14px 16px;
            border-radius: 14px;
            border: 1px solid var(--line);
            background: rgba(255, 255, 255, 0.66);
        }
        .notice--success {
            border-color: rgba(31, 122, 75, 0.25);
            background: rgba(31, 122, 75, 0.08);
        }
        .notice--danger {
            border-color: rgba(159, 47, 47, 0.25);
            background: rgba(159, 47, 47, 0.08);
        }
        details {
            border-top: 1px solid var(--line);
            padding-top: 12px;
        }
        summary {
            cursor: pointer;
            color: var(--text);
            font-weight: 700;
        }
        @media (max-width: 720px) {
            .card__body {
                padding: 24px;
            }
        }
    </style>
    ${autoRedirectUrl ? `<meta http-equiv="refresh" content="${Math.max(1, Math.ceil(autoRedirectDelayMs / 1000))};url=${escapeHtml(autoRedirectUrl)}">` : ''}
</head>
<body>
    <main class="card">
        <div class="card__body">
            <div class="eyebrow">${escapeHtml(eyebrow)}</div>
            <div>
                <h1>${escapeHtml(heading)}</h1>
            </div>
            ${body}
            ${aside || ''}
        </div>
    </main>
</body>
</html>`;

export const renderConnectPage = ({
    appName,
    oauthStartUrl,
    oauthCallbackUrl,
    shipdayOrdersUrl,
}) => renderLayout({
    title: `${appName} | Poster connect`,
    eyebrow: 'Poster connect',
    heading: 'Підключаю акаунт до Shipday bridge',
    autoRedirectUrl: oauthStartUrl,
    body: `
        <p>Poster відкрив сторінку підключення. Зараз backend перенаправить вас у Poster OAuth, щоб отримати доступ до акаунта без зберігання секретів у POS bundle.</p>
        <div class="actions">
            <a class="button" href="${escapeHtml(oauthStartUrl)}">Продовжити підключення</a>
        </div>
        <p class="helper">Після OAuth відкриється сторінка налаштувань Shipday для цього акаунта.</p>
    `,
    aside: `
        <div class="panel">
            <p><strong>Redirect URI</strong></p>
            <p class="mono">${escapeHtml(oauthCallbackUrl)}</p>
            <p><strong>Shipday proxy endpoint</strong></p>
            <p class="mono">${escapeHtml(shipdayOrdersUrl)}</p>
        </div>
    `,
});

export const renderSettingsPage = ({
    appName,
    account,
    settings,
    installation,
    settingsActionUrl,
    syncSpotsUrl,
    notices = [],
}) => {
    const publicSettings = settings || null;
    const posterSpots = publicSettings && Array.isArray(publicSettings.posterSpots)
        ? publicSettings.posterSpots
        : [];
    const defaultSpotOptions = [
        {
            value: '',
            label: posterSpots.length ? 'Оберіть точку за замовчуванням' : 'Спочатку синхронізуйте точки',
        },
        ...posterSpots.map(spot => ({
            value: spot.spotId,
            label: `${spot.name || `Spot #${spot.spotId}`} (${spot.spotId})`,
        })),
    ];
    const shipday = publicSettings && publicSettings.shipday ? publicSettings.shipday : {
        apiKeyConfigured: false,
        apiKeyMasked: '',
        authMode: 'x-api-key',
        mockMode: true,
    };
    const currentAuthModeLabel = shipday.authMode === 'basic' ? 'Basic' : 'x-api-key';
    const currentModeLabel = shipday.mockMode ? 'Mock mode' : 'Live mode';
    const defaultSpotLabel = defaultSpotOptions.find(option => String(option.value) === String(
        publicSettings && publicSettings.defaultSpotId ? publicSettings.defaultSpotId : '',
    ));
    const noticeMarkup = notices.map(notice => `
        <div class="notice notice--${escapeHtml(notice.kind || 'success')}">
            ${escapeHtml(notice.message)}
        </div>
    `).join('');
    const spotCards = posterSpots.length
        ? posterSpots.map((spot) => {
            const override = publicSettings && publicSettings.pickupMappings
                ? publicSettings.pickupMappings[spot.spotId] || {}
                : {};

            return `
                <section class="spot-card">
                    <div class="spot-card__meta">
                        <div class="badge">Poster spot ${escapeHtml(spot.spotId)}</div>
                        <strong>${escapeHtml(spot.name || `Spot #${spot.spotId}`)}</strong>
                        <div>${escapeHtml(spot.address || 'Адреса не повернулась із Poster API')}</div>
                    </div>
                    <div class="form-grid">
                        ${renderTextInput({
                            name: `pickupMappings[${spot.spotId}][name]`,
                            label: 'Shipday pickup name',
                            value: override.name || '',
                            placeholder: spot.name || 'Назва pickup',
                            helper: 'Якщо лишити порожнім, backend візьме назву точки з Poster.',
                        })}
                        ${renderTextInput({
                            name: `pickupMappings[${spot.spotId}][phone]`,
                            label: 'Pickup phone',
                            value: override.phone || '',
                            placeholder: spot.phone || '+380...',
                        })}
                        ${renderTextInput({
                            name: `pickupMappings[${spot.spotId}][address]`,
                            label: 'Pickup address',
                            value: override.address || '',
                            placeholder: spot.address || 'Адреса точки',
                            helper: 'Якщо лишити порожнім, backend візьме адресу точки з Poster.',
                        })}
                        ${renderTextInput({
                            name: `pickupMappings[${spot.spotId}][formattedAddress]`,
                            label: 'Formatted address',
                            value: override.formattedAddress || '',
                            placeholder: override.address || spot.address || '',
                        })}
                        ${renderTextInput({
                            name: `pickupMappings[${spot.spotId}][lat]`,
                            label: 'Latitude',
                            value: override.lat || '',
                            placeholder: '50.4501',
                        })}
                        ${renderTextInput({
                            name: `pickupMappings[${spot.spotId}][lng]`,
                            label: 'Longitude',
                            value: override.lng || '',
                            placeholder: '30.5234',
                        })}
                    </div>
                </section>
            `;
        }).join('')
        : `
            <div class="panel">
                <p>Ще немає синхронізованих торгових точок. Натисни <strong>Синхронізувати точки Poster</strong> і перевір, що акаунт уже пройшов OAuth.</p>
            </div>
        `;

    return renderLayout({
        title: `${appName} | Shipday settings`,
        eyebrow: 'Shipday settings',
        heading: `Налаштування акаунта ${account}`,
        body: `
            ${noticeMarkup}
            <div class="panel-grid">
                <div class="panel">
                    <p><strong>Poster account</strong></p>
                    <p class="mono">${escapeHtml(account)}</p>
                </div>
                <div class="panel">
                    <p><strong>Poster OAuth</strong></p>
                    <p class="mono">${installation && installation.accessToken ? 'Підключено' : 'Не підключено'}</p>
                </div>
                <div class="panel">
                    <p><strong>Shipday</strong></p>
                    <p class="mono">${shipday.apiKeyConfigured ? `${escapeHtml(shipday.apiKeyMasked || 'Збережено')} · ${escapeHtml(currentAuthModeLabel)} · ${escapeHtml(currentModeLabel)}` : 'Ще не налаштовано'}</p>
                </div>
                <div class="panel">
                    <p><strong>Pickup spot</strong></p>
                    <p class="mono">${defaultSpotLabel && defaultSpotLabel.value ? escapeHtml(defaultSpotLabel.label) : 'Ще не вибрано'}</p>
                </div>
            </div>
            <form class="grid" method="post" action="${escapeHtml(settingsActionUrl)}">
                <input type="hidden" name="account" value="${escapeHtml(account)}">
                <section class="panel grid">
                    <h2>Що потрібно налаштувати</h2>
                    <p>Для роботи інтеграції потрібні тільки Shipday API key, спосіб авторизації і точка Poster за замовчуванням. Адресу точки backend бере з Poster автоматично.</p>
                    <div class="form-grid">
                        ${renderTextInput({
                            name: 'shipday[apiKey]',
                            label: 'Shipday API key',
                            value: '',
                            type: 'password',
                            placeholder: shipday.apiKeyConfigured ? 'Лиш порожнім, щоб не змінювати збережений ключ' : 'Встав API key',
                            helper: shipday.apiKeyConfigured
                                ? 'Порожнє поле збереже поточний ключ.'
                                : 'Ключ зберігається на backend для цього Poster акаунта.',
                        })}
                        ${renderSelect({
                            name: 'shipday[authMode]',
                            label: 'Auth mode',
                            value: shipday.authMode || 'x-api-key',
                            options: [
                                { value: 'basic', label: 'Basic' },
                                { value: 'x-api-key', label: 'x-api-key' },
                            ],
                            helper: 'Для Shipday спочатку перевіряй Basic. Якщо акаунт вимагає інший режим, перемкнеш назад.',
                        })}
                        ${renderSelect({
                            name: 'defaultSpotId',
                            label: 'Точка Poster за замовчуванням',
                            value: publicSettings && publicSettings.defaultSpotId ? publicSettings.defaultSpotId : '',
                            options: defaultSpotOptions,
                            helper: 'Ця точка використається як fallback, якщо POS не передасть spotId у замовленні.',
                        })}
                    </div>
                    <div>
                        ${renderCheckbox({
                            name: 'shipday[mockMode]',
                            label: 'Залишити mock mode',
                            checked: shipday.mockMode,
                            helper: 'У mock mode замовлення не йдуть у реальний Shipday API. Це зручно для першого тесту.',
                        })}
                    </div>
                    <div class="actions">
                        <a class="button button--ghost" href="${escapeHtml(syncSpotsUrl)}">Синхронізувати точки Poster</a>
                    </div>
                </section>

                <section class="panel grid">
                    <h2>Pickup mapping</h2>
                    <p>У більшості випадків додатково нічого не треба. Якщо точка в Poster вже має правильну адресу, інтеграція візьме її автоматично. Розгорни блок нижче тільки якщо треба override для конкретної точки.</p>
                    <details>
                        <summary>Додаткові override для точок</summary>
                        <div class="spot-list" style="margin-top:16px;">
                            ${spotCards}
                        </div>
                    </details>
                </section>

                <div class="actions">
                    <button class="button" type="submit">Зберегти налаштування</button>
                </div>
            </form>
        `,
    });
};

export const renderSuccessPage = ({
    appName,
    account,
    settingsUrl,
}) => renderLayout({
    title: `${appName} | Poster connected`,
    eyebrow: 'Підключено',
    heading: 'Poster OAuth завершено',
    body: `
        <p>Акаунт <strong>${escapeHtml(account)}</strong> успішно збережено в backend. Тепер треба зберегти Shipday API key і змепити точки Poster на pickup-адреси.</p>
        <div class="actions">
            <a class="button" href="${escapeHtml(settingsUrl)}">Відкрити налаштування</a>
        </div>
    `,
});

export const renderConfigErrorPage = ({
    appName,
    title,
    heading,
    missing,
    details,
}) => renderLayout({
    title: `${appName} | Config required`,
    eyebrow: 'Потрібна конфігурація',
    heading,
    body: `
        <p class="tone-danger">${escapeHtml(title)}</p>
        <div class="panel">
            <p>Не вистачає env-параметрів:</p>
            <ul>${renderList(missing)}</ul>
        </div>
    `,
    aside: details ? `
        <div class="panel">
            <p>${escapeHtml(details)}</p>
        </div>
    ` : '',
});

export const renderPosterErrorPage = ({
    appName,
    heading,
    message,
    errors,
}) => renderLayout({
    title: `${appName} | OAuth error`,
    eyebrow: 'Помилка OAuth',
    heading,
    body: `
        <p class="tone-danger">${escapeHtml(message)}</p>
        <div class="panel">
            <ul>${renderList(errors)}</ul>
        </div>
    `,
});
