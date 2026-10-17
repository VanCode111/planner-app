import { addDays, diffDays, type Day } from '../lib/dates';
import { clamp, uid } from '../lib/format';
import { matchTemplate, type Template } from './catalog';
import { deliveryFeeFor, firstOrderDayFrom } from './forecast';
import type { AppState, Draft, Item, Order, OrderKind, Settings } from './types';

/** Все изменения состояния — чистые функции (state, …) → state. */

const HISTORY_LIMIT = 12;
const ORDERS_LIMIT = 200;
const SAVINGS_LIMIT = 200;

export const emptyDraft = (): Draft => ({ forced: {}, qty: {}, skipped: {}, acked: {} });

export function defaultSettings(today: Day): Settings {
  const s: Settings = {
    orderWeekday: 5,
    periodWeeks: 1,
    anchorDay: today,
    deliveryFee: 199,
    freeDeliveryFrom: 2500,
    reminders: false,
  };
  return { ...s, anchorDay: firstOrderDayFrom(s, today) };
}

export function initialState(today: Day): AppState {
  return {
    v: 1,
    onboarded: false,
    settings: defaultSettings(today),
    items: [],
    draft: emptyDraft(),
    orders: [],
    savings: [],
    updatedAt: 0,
  };
}

export function newItem(today: Day, fields: Partial<Item> & { name: string }): Item {
  const tpl = matchTemplate(fields.name);
  return {
    id: uid(),
    category: tpl?.category ?? 'other',
    price: tpl?.price ?? 0,
    daysPerUnit: tpl?.days ?? 7,
    perishable: tpl?.perishable ?? false,
    runOutDay: null,
    lastBoughtDay: null,
    lastBoughtQty: 1,
    signals: 0,
    history: [],
    createdDay: today,
    ...fields,
  };
}

export const itemFromTemplate = (today: Day, t: Template): Item =>
  newItem(today, { name: t.name, category: t.category, price: t.price, daysPerUnit: t.days, perishable: !!t.perishable });

const mapItem = (state: AppState, id: string, fn: (item: Item) => Item): AppState => ({
  ...state,
  items: state.items.map((it) => (it.id === id ? fn(it) : it)),
});

export function updateItem(state: AppState, id: string, patch: Partial<Item>): AppState {
  return mapItem(state, id, (it) => ({ ...it, ...patch }));
}

export function addItem(state: AppState, item: Item): AppState {
  return { ...state, items: [...state.items, item] };
}

const omit = <T>(rec: Record<string, T>, id: string): Record<string, T> => {
  if (!(id in rec)) return rec;
  const copy = { ...rec };
  delete copy[id];
  return copy;
};

const draftWithout = (d: Draft, id: string): Draft => ({
  forced: omit(d.forced, id),
  qty: omit(d.qty, id),
  skipped: omit(d.skipped, id),
  acked: omit(d.acked, id),
});

export function deleteItem(state: AppState, id: string): AppState {
  return { ...state, items: state.items.filter((it) => it.id !== id), draft: draftWithout(state.draft, id) };
}

// ── Прогноз и обучение ─────────────────────────────────────────────────────────

/**
 * Пользователь сообщил, когда товар на самом деле закончится (или закончился).
 * Сравниваем с прогнозом и сдвигаем расход: половина старого значения + половина нового.
 */
export function learn(item: Item, actualRunOut: Day): Item {
  let daysPerUnit = item.daysPerUnit;
  if (item.lastBoughtDay && item.runOutDay) {
    const expected = diffDays(item.runOutDay, item.lastBoughtDay);
    const actual = diffDays(actualRunOut, item.lastBoughtDay);
    if (expected > 0 && actual > 0) {
      const ratio = clamp(actual / expected, 0.25, 4);
      daysPerUnit = clamp(Math.round(daysPerUnit * (0.5 + 0.5 * ratio) * 10) / 10, 0.5, 365);
    }
  }
  return { ...item, daysPerUnit, runOutDay: actualRunOut, signals: item.signals + 1 };
}

export type Mark = 'out' | 'low' | { days: number };

/** Когда товар закончится по отметке пользователя. */
export function runOutForMark(item: Item, mark: Mark, today: Day): Day {
  if (mark === 'out') return today;
  if (mark === 'low') return addDays(today, Math.max(1, Math.round(item.daysPerUnit * 0.15)));
  return addDays(today, Math.max(1, mark.days));
}

export function markItem(state: AppState, id: string, mark: Mark, today: Day): AppState {
  return mapItem(state, id, (it) => learn(it, runOutForMark(it, mark, today)));
}

/**
 * «Есть» в ответ на «проверьте наличие»: считаем, что осталось примерно пол-упаковки,
 * но не меньше чем до `minUntil`. Без обучения — сигнал слабый.
 */
export function confirmHave(state: AppState, id: string, today: Day, minUntil: Day): AppState {
  return mapItem(state, id, (it) => {
    const half = addDays(today, Math.round(it.daysPerUnit / 2));
    const runOutDay = [it.runOutDay, half, minUntil].reduce<Day>((a, b) => (b && b > a ? b : a), minUntil);
    return { ...it, runOutDay, signals: it.signals + 1 };
  });
}

export function purchase(item: Item, day: Day, qty: number, price: number): Item {
  const base = item.runOutDay && diffDays(item.runOutDay, day) > 0 ? item.runOutDay : day;
  return {
    ...item,
    price: price > 0 ? price : item.price,
    runOutDay: addDays(base, Math.max(1, Math.round(qty * item.daysPerUnit))),
    lastBoughtDay: day,
    lastBoughtQty: qty,
    history: [{ day, qty, price: price > 0 ? price : item.price }, ...item.history].slice(0, HISTORY_LIMIT),
  };
}

// ── Черновик заказа ───────────────────────────────────────────────────────────

const setDraft = (state: AppState, patch: Partial<Draft>): AppState => ({ ...state, draft: { ...state.draft, ...patch } });

export function forceAdd(state: AppState, id: string): AppState {
  const d = state.draft;
  return setDraft(state, { forced: { ...d.forced, [id]: true }, skipped: omit(d.skipped, id) });
}

export function setQty(state: AppState, id: string, qty: number): AppState {
  return setDraft(state, { qty: { ...state.draft.qty, [id]: Math.max(1, Math.round(qty)) } });
}

/** Убрать из заказа на дату `next`. */
export function skip(state: AppState, id: string, next: Day): AppState {
  const d = state.draft;
  return setDraft(state, { skipped: { ...d.skipped, [id]: next }, forced: omit(d.forced, id), qty: omit(d.qty, id) });
}

/**
 * «Подождёт до заказа»: больше не предупреждать и засчитать несостоявшийся дозаказ —
 * не больше одного раза на цикл.
 */
export function ackUrgent(state: AppState, ids: string[], next: Day, today: Day): AppState {
  const acked = { ...state.draft.acked };
  for (const id of ids) acked[id] = next;
  const fee = state.settings.deliveryFee;
  const counted = state.savings.some((sv) => sv.forOrder === next);
  const savings = fee > 0 && !counted
    ? [{ day: today, amount: fee, forOrder: next }, ...state.savings].slice(0, SAVINGS_LIMIT)
    : state.savings;
  return { ...setDraft(state, { acked }), savings };
}

// ── Заказы ────────────────────────────────────────────────────────────────────

export interface PlaceOrderInput {
  kind: OrderKind;
  day: Day;
  lines: { itemId: string; qty: number }[];
  /** Сумма по чеку, если пользователь её ввёл. */
  actualTotal?: number;
}

export function placeOrder(state: AppState, input: PlaceOrderInput): { state: AppState; order: Order } {
  const byId = new Map(state.items.map((it) => [it.id, it]));
  const lines = input.lines
    .map(({ itemId, qty }) => {
      const it = byId.get(itemId);
      return it ? { itemId, name: it.name, qty, price: it.price } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null && l.qty > 0);

  const estimate = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const total = input.actualTotal && input.actualTotal > 0 ? input.actualTotal : estimate;
  const order: Order = {
    id: uid(),
    day: input.day,
    kind: input.kind,
    lines,
    total,
    deliveryFee: input.kind === 'shop' ? 0 : deliveryFeeFor(state.settings, total),
  };

  const bought = new Map(lines.map((l) => [l.itemId, l]));
  const items = state.items.map((it) => {
    const l = bought.get(it.id);
    return l ? purchase(it, input.day, l.qty, l.price) : it;
  });

  let draft: Draft;
  if (input.kind === 'planned') {
    draft = emptyDraft();
  } else {
    draft = state.draft;
    for (const id of bought.keys()) draft = draftWithout(draft, id);
  }

  return {
    state: { ...state, items, draft, orders: [order, ...state.orders].slice(0, ORDERS_LIMIT) },
    order,
  };
}

// ── Настройки ─────────────────────────────────────────────────────────────────

export function updateSettings(state: AppState, patch: Partial<Settings>, today: Day): AppState {
  const settings = { ...state.settings, ...patch };
  if (patch.orderWeekday !== undefined || patch.periodWeeks !== undefined) {
    settings.anchorDay = firstOrderDayFrom({ ...settings, periodWeeks: 1 }, today);
  }
  return { ...state, settings };
}

/** Завершить онбординг: товары из каталога и свои товары по названию. */
export function completeOnboarding(state: AppState, templates: Template[], today: Day, customNames: string[] = []): AppState {
  const existing = new Set(state.items.map((it) => it.name.toLowerCase()));
  const items = [
    ...templates.map((t) => itemFromTemplate(today, t)),
    ...customNames.map((name) => newItem(today, { name: name.trim() })),
  ].filter((it) => {
    const key = it.name.toLowerCase();
    if (!key || existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  return { ...state, onboarded: true, items: [...state.items, ...items] };
}

/** Проверка и приведение импортированных данных. */
export function parseState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<AppState>;
  if (s.v !== 1 || !Array.isArray(s.items) || !s.settings || !Array.isArray(s.orders)) return null;
  return {
    v: 1,
    onboarded: !!s.onboarded,
    settings: s.settings,
    items: s.items,
    draft: { ...emptyDraft(), ...(s.draft ?? {}) },
    orders: s.orders,
    savings: Array.isArray(s.savings) ? s.savings : [],
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
  };
}
