const TURBOSMS_API_URL = 'https://api.turbosms.ua/message/send.json';

const normalizePhone = (phone) => String(phone || '').trim().replace(/^\+/, '');

/**
 * @param {{ token: string, sender: string, phone: string, text: string, sequenceId?: string, mockMode?: boolean }} params
 * @returns {Promise<{ ok: boolean, mock?: boolean, status?: number, body?: object }>}
 */
export async function sendSms({ token, sender, phone, text, sequenceId, mockMode = false }) {
    const normalizedPhone = normalizePhone(phone);

    if (mockMode) {
        console.log(`[turbosms] MOCK SMS → ${normalizedPhone} | відправник: ${sender} | sequenceId: ${sequenceId || 'n/a'} | текст: "${text}"`);
        return { ok: true, mock: true };
    }

    const payload = {
        recipients: [normalizedPhone],
        sms: { sender, text },
    };

    if (sequenceId) {
        payload.sequence_id = sequenceId;
    }

    console.log('[turbosms] payload:', JSON.stringify(payload));

    let response;
    let responseBody;

    try {
        response = await fetch(TURBOSMS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });

        responseBody = await response.json().catch(() => null);
    } catch (error) {
        console.error('[turbosms] Мережева помилка при відправці SMS:', error.message);
        return { ok: false, error: error.message };
    }

    const responseCode = responseBody && responseBody.response_code;
    // 0 = OK, 800 = SUCCESS_MESSAGE_ACCEPTED, 507 = duplicate (sequence_id вже використано — ок)
    const ok = responseCode === 0 || responseCode === 800 || responseCode === 507;

    if (responseCode === 507) {
        console.log(`[turbosms] SMS вже відправлено раніше (sequence_id: ${sequenceId}) — дублікат ігнорується.`);
    } else if (ok) {
        console.log(`[turbosms] SMS відправлено → ${normalizedPhone}`);
    } else {
        console.error(`[turbosms] Помилка відправки SMS → ${normalizedPhone}:`, responseBody);
    }

    return { ok, status: response.status, body: responseBody };
}
