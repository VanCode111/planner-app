import { addDays, weekday, type Day } from '../lib/dates';
import { uid } from '../lib/format';
import { initialState, newItem, updateSettings } from './actions';
import { deliveryFeeFor } from './forecast';
import type { AppState, CategoryId, Item, Order, OrderKind } from './types';

type Spec = {
  name: string;
  category: CategoryId;
  days: number;
  price: number;
  /** Через сколько дней закончится; null — неизвестно. */
  left: number | null;
  perishable?: boolean;
  /** Последняя покупка — столько недель назад (в день планового заказа). */
  boughtWeeksAgo?: number;
  everyWeeks?: number;
  qty?: number;
};

const SPECS: Spec[] = [
  { name: 'Молоко 3,2%, 1 л', category: 'food', days: 2.5, price: 89, left: 1, perishable: true, boughtWeeksAgo: 1, everyWeeks: 1, qty: 3 },
  { name: 'Хлеб бородинский', category: 'food', days: 3, price: 59, left: 3, perishable: true, boughtWeeksAgo: 1, everyWeeks: 1, qty: 2 },
  { name: 'Яйца С1, 10 шт', category: 'food', days: 7, price: 129, left: 3, boughtWeeksAgo: 1, everyWeeks: 1 },
  { name: 'Бананы, 1 кг', category: 'food', days: 5, price: 139, left: 4, perishable: true, boughtWeeksAgo: 1, everyWeeks: 1 },
  { name: 'Сыр, 200 г', category: 'food', days: 9, price: 230, left: 12, boughtWeeksAgo: 1, everyWeeks: 1 },
  { name: 'Кофе в зёрнах, 1 кг', category: 'food', days: 30, price: 1090, left: 8, boughtWeeksAgo: 3, everyWeeks: 4 },
  { name: 'Рис басмати', category: 'food', days: 35, price: 189, left: 25, boughtWeeksAgo: 2, everyWeeks: 5 },
  { name: 'Средство для посуды', category: 'household', days: 30, price: 189, left: 12, boughtWeeksAgo: 3, everyWeeks: 4 },
  { name: 'Губки для посуды, 5 шт', category: 'household', days: 21, price: 99, left: 19, boughtWeeksAgo: 1, everyWeeks: 3 },
  { name: 'Пакеты для мусора', category: 'household', days: 21, price: 149, left: 14, boughtWeeksAgo: 1, everyWeeks: 3 },
  { name: 'Стиральный порошок, 3 кг', category: 'household', days: 60, price: 649, left: 28, boughtWeeksAgo: 5, everyWeeks: 9 },
  { name: 'Туалетная бумага, 8 рул.', category: 'hygiene', days: 14, price: 389, left: 6, boughtWeeksAgo: 2, everyWeeks: 2 },
  { name: 'Зубная паста', category: 'hygiene', days: 30, price: 199, left: 20, boughtWeeksAgo: 2, everyWeeks: 4 },
  { name: 'Сухой корм для кошки', category: 'pets', days: 21, price: 890, left: 15, boughtWeeksAgo: 1, everyWeeks: 3 },
  { name: 'Соль', category: 'food', days: 120, price: 39, left: null },
  { name: 'Батарейки AA', category: 'other', days: 90, price: 259, left: null },
];

const WEEKS = 5;

/** Пример данных: заказ через 3 дня, пара товаров на исходе, история за 5 недель. */
export function demoState(today: Day): AppState {
  const next = addDays(today, 3);
  let state = updateSettings(initialState(today), { orderWeekday: weekday(next), periodWeeks: 1, deliveryFee: 199, freeDeliveryFrom: 2500 }, today);
  const orderDay = (weeksAgo: number) => addDays(next, -7 * weeksAgo);

  const items: Item[] = SPECS.map((s) => {
    const qty = s.qty ?? 1;
    const history = [];
    if (s.boughtWeeksAgo) {
      for (let w = s.boughtWeeksAgo; w <= WEEKS; w += s.everyWeeks ?? 1) history.push({ day: orderDay(w), qty, price: s.price });
    }
    return newItem(today, {
      name: s.name,
      category: s.category,
      daysPerUnit: s.days,
      price: s.price,
      perishable: !!s.perishable,
      runOutDay: s.left === null ? null : addDays(today, s.left),
      lastBoughtDay: history[0]?.day ?? null,
      lastBoughtQty: qty,
      signals: history.length > 1 ? 1 : 0,
      history,
      createdDay: orderDay(WEEKS),
    });
  });

  const order = (day: Day, kind: OrderKind, lines: Order['lines']): Order => {
    const total = lines.reduce((sum, l) => sum + l.qty * l.price, 0);
    return { id: uid(), day, kind, lines, total, deliveryFee: deliveryFeeFor(state.settings, total) };
  };

  const orders: Order[] = [];
  for (let w = 1; w <= WEEKS; w++) {
    const day = orderDay(w);
    const lines = items.flatMap((it) => it.history.filter((p) => p.day === day).map((p) => ({ itemId: it.id, name: it.name, qty: p.qty, price: p.price })));
    // Свежие продукты, которые в примере не ведутся как запасы, — чтобы суммы были похожи на настоящие.
    lines.push({ itemId: 'demo-fresh', name: 'Овощи, фрукты и мясо', qty: 1, price: 1180 + 45 * w });
    orders.push(order(day, 'planned', lines));
    if (w === 2) {
      // Дозаказ посреди недели: закончились молоко и хлеб.
      const pick = items.filter((it) => it.name.startsWith('Молоко') || it.name.startsWith('Хлеб'));
      orders.push(order(addDays(day, 4), 'extra', pick.map((it) => ({ itemId: it.id, name: it.name, qty: 1, price: it.price }))));
    }
  }
  orders.sort((a, b) => b.day.localeCompare(a.day));

  state = {
    ...state,
    onboarded: true,
    items,
    orders,
    savings: [
      { day: addDays(today, -5), amount: 199, forOrder: orderDay(1) },
      { day: addDays(today, -12), amount: 199, forOrder: orderDay(2) },
    ],
  };
  return state;
}
