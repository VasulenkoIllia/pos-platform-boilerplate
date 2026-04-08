const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderList = items => items.map(item => `<li>${escapeHtml(item)}</li>`).join('');

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
            --panel: rgba(255, 255, 255, 0.9);
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
            width: min(760px, 100%);
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
        h1 {
            margin: 0;
            font-size: clamp(28px, 5vw, 42px);
            line-height: 1.05;
        }
        p, li {
            margin: 0;
            line-height: 1.65;
            color: var(--muted);
            font-size: 16px;
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
        <p class="helper">Якщо автоматичний редірект не спрацює, натисніть кнопку вище.</p>
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

export const renderSuccessPage = ({
    appName,
    account,
}) => renderLayout({
    title: `${appName} | Poster connected`,
    eyebrow: 'Підключено',
    heading: 'Poster OAuth завершено',
    body: `
        <p>Акаунт <strong>${escapeHtml(account)}</strong> успішно збережено в backend. Тепер можна повернутися в Poster і продовжити налаштування Shipday.</p>
        <div class="panel">
            <p>Наступні кроки:</p>
            <ul>
                <li>Вказати цей Render URL у налаштуваннях застосунку Poster.</li>
                <li>Заповнити Shipday API key та pickup-адресу в env Render.</li>
                <li>Перезібрати POS bundle з правильним backend URL і повторно завантажити його в Poster.</li>
            </ul>
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
