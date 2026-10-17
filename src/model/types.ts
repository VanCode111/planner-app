import type { Day } from '../lib/dates';

export type CategoryId = 'food' | 'household' | 'hygiene' | 'pets' | 'kids' | 'health' | 'other';

export interface Purchase {
  day: Day;
  qty: number;
  price: number;
}

export interface Item {
  id: string;
  name: string;
  category: CategoryId;
  /** Цена одной упаковки, ₽ (последняя известная). */
  price: number;
  /** На сколько дней хватает одной упаковки — уточняется по сигналам. */
  daysPerUnit: number;
  /** Быстро портится: не предлагать взять впрок. */
  perishable: boolean;
  /** Прогноз: день, когда товар закончится. null — неизвестно. */
  runOutDay: Day | null;
  lastBoughtDay: Day | null;
  lastBoughtQty: number;
  /** Сколько раз пользователь уточнял остаток — от этого зависит уверенность прогноза. */
  signals: number;
  /** Последние покупки, новые первыми. */
  history: Purchase[];
  createdDay: Day;
}

export interface Settings {
  /** 0 = понедельник … 6 = воскресенье */
  orderWeekday: number;
  periodWeeks: 1 | 2;
  /** Любой из дней заказа — точка отсчёта для расписания «раз в 2 недели». */
  anchorDay: Day;
  deliveryFee: number;
  /** Порог бесплатной доставки; 0 — порога нет. */
  freeDeliveryFrom: number;
  reminders: boolean;
}

/** Правки текущего заказа, пока он не оформлен. */
export interface Draft {
  /** Добавлено вручную. */
  forced: Record<string, true>;
  /** Количество, изменённое вручную. */
  qty: Record<string, number>;
  /** Убрано из заказа на конкретную дату заказа. */
  skipped: Record<string, Day>;
  /** «Подождёт»: не предупреждать до этой даты заказа. */
  acked: Record<string, Day>;
}

export type OrderKind = 'planned' | 'extra' | 'shop';

export interface OrderLine {
  itemId: string;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  day: Day;
  kind: OrderKind;
  lines: OrderLine[];
  /** Сумма за товары. */
  total: number;
  deliveryFee: number;
}

/** Доставка, которую не пришлось оплачивать: выбрали «подождёт» вместо дозаказа. */
export interface Saving {
  day: Day;
  amount: number;
  /** Дата планового заказа, к которому отложили покупку. Не больше одной экономии на цикл. */
  forOrder: Day;
}

export interface AppState {
  v: 1;
  onboarded: boolean;
  settings: Settings;
  items: Item[];
  draft: Draft;
  orders: Order[];
  savings: Saving[];
  updatedAt: number;
}
