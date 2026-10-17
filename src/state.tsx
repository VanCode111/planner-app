import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { syncReminders, type ReminderPayload } from './api';
import { today as getToday, type Day } from './lib/dates';
import { initialState } from './model/actions';
import { buildPlan, type Plan } from './model/forecast';
import type { AppState } from './model/types';
import { loadState, saveState } from './telegram/storage';

interface AppCtx {
  state: AppState;
  today: Day;
  plan: Plan;
  /** Изменить состояние чистой функцией из model/actions. */
  update: (fn: (s: AppState) => AppState) => void;
  replace: (s: AppState) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp вне AppProvider');
  return ctx;
}

const SAVE_DELAY = 700;

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [today, setToday] = useState(getToday);
  const dirty = useRef(false);

  useEffect(() => {
    loadState().then((s) => setState(s ?? initialState(getToday())));
  }, []);

  // Приложение могут держать открытым через полночь.
  useEffect(() => {
    const refresh = () => setToday(getToday());
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!state || !dirty.current) return;
    const timer = window.setTimeout(() => saveState(state), SAVE_DELAY);
    const flush = () => document.visibilityState === 'hidden' && saveState(state);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    dirty.current = true;
    setState((s) => (s ? { ...fn(s), updatedAt: Date.now() } : s));
  }, []);

  const replace = useCallback((s: AppState) => {
    dirty.current = true;
    setState({ ...s, updatedAt: Date.now() });
  }, []);

  const plan = useMemo(() => (state ? buildPlan(state, today) : null), [state, today]);

  // Напоминания бота знают день заказа и что в списке.
  const reminder: ReminderPayload | null = state && plan
    ? {
      enabled: state.settings.reminders,
      orderWeekday: state.settings.orderWeekday,
      periodWeeks: state.settings.periodWeeks,
      nextOrder: plan.next,
      count: plan.lines.length,
      total: Math.round(plan.total),
    }
    : null;
  const reminderKey = reminder ? JSON.stringify(reminder) : '';
  useEffect(() => {
    if (!reminder || (!reminder.enabled && !dirty.current)) return;
    const timer = window.setTimeout(() => syncReminders(reminder), 3000);
    return () => window.clearTimeout(timer);
  }, [reminderKey]);

  if (!state || !plan) return <>{fallback}</>;
  return <Ctx.Provider value={{ state, today, plan, update, replace }}>{children}</Ctx.Provider>;
}
