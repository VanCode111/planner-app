/** Когда и что напомнить. Чистые функции — их проверяют тесты. */

export const MORNING_HOUR = 10;
export const EVENING_HOUR = 20;
/** Окно отправки: если сервер был выключен, не шлём «доброе утро» вечером. */
const WINDOW_HOURS = 3;

const DAY_MS = 86_400_000;

const dayNum = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

export const addDays = (day, n) => new Date((dayNum(day) + n) * DAY_MS).toISOString().slice(0, 10);

/** Локальные дата и час пользователя по смещению часового пояса (в минутах, восток — плюс). */
export function localTime(nowMs, tzOffsetMin) {
  const d = new Date(nowMs + tzOffsetMin * 60_000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export function isOrderDay(user, day) {
  const period = 7 * (user.periodWeeks === 2 ? 2 : 1);
  const diff = dayNum(day) - dayNum(user.nextOrder);
  return ((diff % period) + period) % period === 0;
}

const plural = (n, [one, few, many]) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

const rub = (n) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/\s/g, ' ')} ₽`;

/**
 * Какое напоминание отправить пользователю сейчас: 'evening' накануне, 'morning' в день заказа или null.
 * user.sent хранит день последней отправки каждого вида, чтобы не повторяться.
 */
export function dueReminder(user, nowMs) {
  if (!user.enabled) return null;
  const { day, hour } = localTime(nowMs, user.tzOffset ?? 0);
  const sent = user.sent ?? {};
  if (hour >= MORNING_HOUR && hour < MORNING_HOUR + WINDOW_HOURS && isOrderDay(user, day) && sent.morning !== day) {
    return { kind: 'morning', day };
  }
  if (hour >= EVENING_HOUR && hour < EVENING_HOUR + WINDOW_HOURS && isOrderDay(user, addDays(day, 1)) && sent.evening !== day) {
    return { kind: 'evening', day };
  }
  return null;
}

/**
 * Для запуска по расписанию (GitHub Actions): нужно ли сейчас напоминание вида `kind`.
 * Вечернее — если завтра день заказа, утреннее — если сегодня.
 */
export function isReminderDay(user, kind, nowMs) {
  const { day } = localTime(nowMs, user.tzOffset ?? 0);
  return isOrderDay(user, kind === 'evening' ? addDays(day, 1) : day);
}

export function reminderText(user, kind) {
  if (kind === 'evening') {
    return 'Завтра день заказа. Если что-то закончилось — добавьте сейчас, чтобы не забыть и не платить потом за дозаказ.';
  }
  if (user.count > 0) {
    return `Сегодня день заказа. В списке ${user.count} ${plural(user.count, ['товар', 'товара', 'товаров'])} на ≈ ${rub(user.total)} — проверьте и оформите.`;
  }
  return 'Сегодня день заказа. Откройте Кладовку — проверим, что нужно купить.';
}
