import { describe, expect, it } from 'vitest';
import { signInitData, validateInitData } from './initData.mjs';
import { dueReminder, isOrderDay, isReminderDay, reminderText } from './schedule.mjs';

const TOKEN = '123456:TEST-token';
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const authDate = String(Math.floor(NOW / 1000) - 60);
const user = JSON.stringify({ id: 42, first_name: 'Аня' });

describe('initData', () => {
  it('принимает корректную подпись', () => {
    const data = signInitData({ auth_date: authDate, query_id: 'AAA', user }, TOKEN);
    expect(validateInitData(data, TOKEN, 3600, NOW)).toMatchObject({ id: 42 });
  });

  it('отклоняет подделку, чужой токен и устаревшие данные', () => {
    const data = signInitData({ auth_date: authDate, user }, TOKEN);
    expect(validateInitData(data.replace('42', '43'), TOKEN, 3600, NOW)).toBeNull();
    expect(validateInitData(data, '999:other', 3600, NOW)).toBeNull();
    expect(validateInitData(data, TOKEN, 30, NOW)).toBeNull();
    expect(validateInitData('', TOKEN)).toBeNull();
  });
});

describe('напоминания', () => {
  // Заказ по субботам, Москва (UTC+3).
  const u = { enabled: true, periodWeeks: 1, nextOrder: '2026-10-24', tzOffset: 180, count: 8, total: 2330, sent: {} };
  const at = (day, hourMsk) => Date.parse(`${day}T00:00:00Z`) + (hourMsk - 3) * 3600_000;

  it('считает дни заказа с учётом периода', () => {
    expect(isOrderDay(u, '2026-10-31')).toBe(true);
    expect(isOrderDay(u, '2026-10-30')).toBe(false);
    expect(isOrderDay({ ...u, periodWeeks: 2 }, '2026-10-31')).toBe(false);
    expect(isOrderDay({ ...u, periodWeeks: 2 }, '2026-11-07')).toBe(true);
  });

  it('пишет накануне вечером и утром в день заказа', () => {
    expect(dueReminder(u, at('2026-10-23', 19))).toBeNull();
    expect(dueReminder(u, at('2026-10-23', 20))).toEqual({ kind: 'evening', day: '2026-10-23' });
    expect(dueReminder(u, at('2026-10-24', 10))).toEqual({ kind: 'morning', day: '2026-10-24' });
    expect(dueReminder(u, at('2026-10-24', 18))).toBeNull();
  });

  it('не повторяется и молчит, если выключено', () => {
    expect(dueReminder({ ...u, sent: { morning: '2026-10-24' } }, at('2026-10-24', 11))).toBeNull();
    expect(dueReminder({ ...u, enabled: false }, at('2026-10-24', 10))).toBeNull();
  });

  it('по расписанию: вечер накануне и утро дня заказа', () => {
    expect(isReminderDay(u, 'evening', at('2026-10-23', 20))).toBe(true);
    expect(isReminderDay(u, 'morning', at('2026-10-23', 10))).toBe(false);
    expect(isReminderDay(u, 'morning', at('2026-10-24', 10))).toBe(true);
    // 23:30 UTC пятницы — это уже суббота в Москве.
    expect(isReminderDay(u, 'morning', Date.parse('2026-10-23T23:30:00Z'))).toBe(true);
  });

  it('называет число товаров и сумму', () => {
    expect(reminderText(u, 'morning')).toBe('Сегодня день заказа. В списке 8 товаров на ≈ 2 330 ₽ — проверьте и оформите.');
  });
});
