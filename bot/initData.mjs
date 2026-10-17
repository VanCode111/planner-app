import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка подписи Telegram.WebApp.initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Возвращает объект user или null, если подпись неверна или данные устарели.
 */
export function validateInitData(initData, botToken, maxAgeSec = 7 * 24 * 3600, now = Date.now()) {
  if (typeof initData !== 'string' || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest('hex');
  if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    return user && typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}

/** Подписать данные так же, как это делает Telegram (для тестов). */
export function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));
  return params.toString();
}
