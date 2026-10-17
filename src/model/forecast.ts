import { addDays, diffDays, weekday, type Day } from '../lib/dates';
import type { AppState, Item, Settings } from './types';

/**
 * Ядро планировщика.
 *
 * Правило: товар попадает в ближайший заказ, если закончится раньше следующего за ним заказа.
 * Количество — столько упаковок, чтобы дожить до следующего заказа.
 */

export const periodDays = (s: Settings) => s.periodWeeks * 7;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Первый день по расписанию заказов, не раньше `from`. */
export function firstOrderDayFrom(s: Settings, from: Day): Day {
  let day = addDays(from, mod(s.orderWeekday - weekday(from), 7));
  if (s.periodWeeks === 2 && weekday(s.anchorDay) === s.orderWeekday) {
    const off = mod(diffDays(day, s.anchorDay), 14);
    if (off !== 0) day = addDays(day, 14 - off);
  }
  return day;
}

/**
 * Ближайший день заказа. Если плановый заказ уже оформлен в этот день или незадолго до него
 * (не раньше чем за полпериода), этот цикл закрыт — переходим к следующему.
 */
export function nextOrderDay(state: Pick<AppState, 'settings' | 'orders'>, today: Day): Day {
  const s = state.settings;
  const period = periodDays(s);
  const half = Math.floor(period / 2);
  const planned = state.orders.filter((o) => o.kind === 'planned').map((o) => o.day);
  let day = firstOrderDayFrom(s, today);
  for (let guard = 0; guard < 8; guard++) {
    const closed = planned.some((od) => {
      const d = diffDays(day, od);
      return d >= 0 && d <= half;
    });
    if (!closed) break;
    day = addDays(day, period);
  }
  return day;
}

export function daysLeft(item: Item, today: Day): number | null {
  return item.runOutDay ? diffDays(item.runOutDay, today) : null;
}

/** Доля оставшегося запаса 0…1 для полоски. null — нет данных. */
export function stockLevel(item: Item, today: Day): number | null {
  const left = daysLeft(item, today);
  if (left === null) return null;
  if (left <= 0) return 0;
  const span = item.lastBoughtDay && item.runOutDay
    ? diffDays(item.runOutDay, item.lastBoughtDay)
    : item.daysPerUnit * Math.max(1, item.lastBoughtQty);
  return Math.min(1, left / Math.max(1, span));
}

/** Сколько упаковок нужно, чтобы запаса хватило с `from` до `until`. */
export function unitsToCover(item: Item, from: Day, until: Day): number {
  const start = item.runOutDay && diffDays(item.runOutDay, from) > 0 ? item.runOutDay : from;
  const cover = diffDays(until, start);
  return Math.max(1, Math.ceil(cover / item.daysPerUnit - 0.05));
}

export type LineReason = 'out' | 'soon' | 'needed' | 'forced';

export interface PlanLine {
  item: Item;
  qty: number;
  reason: LineReason;
  /** Добавлен вручную, а не по прогнозу. */
  manual: boolean;
}

export interface Plan {
  today: Day;
  next: Day;
  following: Day;
  periodDays: number;
  /** Что войдёт в ближайший заказ. */
  lines: PlanLine[];
  /** Закончатся раньше ближайшего заказа, и пользователь ещё не решил, ждать ли. */
  urgent: Item[];
  /** Остаток неизвестен — спросить «есть или купить». */
  unknown: Item[];
  /** Можно взять впрок: понадобятся в следующем цикле. */
  suggestions: PlanLine[];
  total: number;
  deliveryFee: number;
  /** Сколько не хватает до бесплатной доставки. */
  missingForFree: number;
}

function reasonFor(item: Item, today: Day, next: Day, following: Day): LineReason | null {
  if (!item.runOutDay) return null;
  if (diffDays(item.runOutDay, today) <= 0) return 'out';
  if (diffDays(item.runOutDay, next) < 0) return 'soon';
  if (diffDays(item.runOutDay, following) <= 0) return 'needed';
  return null;
}

const REASON_ORDER: Record<LineReason, number> = { out: 0, soon: 1, needed: 2, forced: 3 };

export function deliveryFeeFor(s: Settings, total: number): number {
  if (s.freeDeliveryFrom > 0 && total >= s.freeDeliveryFrom) return 0;
  return s.deliveryFee;
}

export function buildPlan(state: AppState, today: Day): Plan {
  const s = state.settings;
  const period = periodDays(s);
  const next = nextOrderDay(state, today);
  const following = addDays(next, period);
  const { draft } = state;
  const skipped = (id: string) => draft.skipped[id] === next;

  const lines: PlanLine[] = [];
  const unknown: Item[] = [];
  const urgent: Item[] = [];
  const candidates: Item[] = [];

  for (const item of state.items) {
    if (skipped(item.id)) continue;
    const reason = reasonFor(item, today, next, following);
    const forced = !!draft.forced[item.id];
    if (reason || forced) {
      const qty = draft.qty[item.id] ?? unitsToCover(item, next, following);
      lines.push({ item, qty, reason: reason ?? 'forced', manual: forced && !reason });
      if ((reason === 'out' || reason === 'soon') && draft.acked[item.id] !== next) urgent.push(item);
    } else if (!item.runOutDay) {
      unknown.push(item);
    } else {
      candidates.push(item);
    }
  }

  lines.sort((a, b) =>
    REASON_ORDER[a.reason] - REASON_ORDER[b.reason]
    || (a.item.runOutDay ?? '').localeCompare(b.item.runOutDay ?? '')
    || a.item.name.localeCompare(b.item.name, 'ru'));

  const total = lines.reduce((sum, l) => sum + l.qty * l.item.price, 0);
  const missingForFree = s.freeDeliveryFrom > 0 ? Math.max(0, s.freeDeliveryFrom - total) : 0;

  const horizon = addDays(following, period);
  let suggestions: PlanLine[] = candidates
    .filter((it) => !it.perishable && it.runOutDay && diffDays(it.runOutDay, horizon) <= 0)
    .sort((a, b) => a.runOutDay!.localeCompare(b.runOutDay!))
    .map((item) => ({ item, qty: unitsToCover(item, following, horizon), reason: 'needed' as const, manual: false }));

  // Первым — самый дешёвый товар, который один закрывает разрыв до бесплатной доставки.
  if (missingForFree > 0) {
    const closer = suggestions
      .filter((l) => l.item.price * l.qty >= missingForFree)
      .sort((a, b) => a.item.price * a.qty - b.item.price * b.qty)[0];
    if (closer) suggestions = [closer, ...suggestions.filter((l) => l !== closer)];
  }

  return {
    today,
    next,
    following,
    periodDays: period,
    lines,
    urgent,
    unknown: unknown.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    suggestions: suggestions.slice(0, 5),
    total,
    deliveryFee: lines.length ? deliveryFeeFor(s, total) : 0,
    missingForFree,
  };
}

/** Количество для дозаказа сегодня: чтобы хватило до следующего за ближайшим заказа. */
export function extraQty(item: Item, today: Day, following: Day): number {
  return unitsToCover(item, today, following);
}

/** Прогноз приблизительный: товар ни разу не уточняли и покупали меньше двух раз. */
export function isUncertain(item: Item): boolean {
  return item.signals === 0 && item.history.length < 2;
}
