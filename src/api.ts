import type { Day } from './lib/dates';
import { tg } from './telegram/webapp';

/** Бот-сервер для напоминаний (bot/server.mjs). Без него приложение работает, просто без напоминаний. */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

export const remindersAvailable = !!API_URL && !!tg;

export interface ReminderPayload {
  enabled: boolean;
  orderWeekday: number;
  periodWeeks: number;
  nextOrder: Day;
  count: number;
  total: number;
}

export async function syncReminders(payload: ReminderPayload): Promise<boolean> {
  if (!remindersAvailable) return false;
  try {
    // text/plain — «простой» запрос без CORS preflight.
    const res = await fetch(`${API_URL}/api/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...payload, initData: tg!.initData, tzOffset: -new Date().getTimezoneOffset() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
