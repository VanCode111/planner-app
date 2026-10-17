import { diffDays, formatDateShort, formatLeft, WEEKDAYS_SHORT, weekday, type Day } from '../lib/dates';
import { daysLeft } from '../model/forecast';
import type { Item } from '../model/types';

export type Tone = 'ok' | 'warn' | 'out' | 'hint';

/** «хватит до чт», «уже нет» — подпись к товару в списке заказа. */
export function untilText(item: Item, today: Day): string {
  const left = daysLeft(item, today);
  if (left === null) return 'остаток неизвестен';
  if (left <= 0) return 'уже нет';
  if (left === 1) return 'хватит до завтра';
  if (left < 7) return `хватит до ${WEEKDAYS_SHORT[weekday(item.runOutDay!)].toLowerCase()}`;
  return `хватит до ${formatDateShort(item.runOutDay!)}`;
}

/** Остаток для списка запасов и его цвет относительно ближайшего заказа. */
export function stockLabel(item: Item, today: Day, next: Day): { text: string; tone: Tone } {
  const left = daysLeft(item, today);
  if (left === null) return { text: 'нет данных', tone: 'hint' };
  if (left <= 0) return { text: 'нет', tone: 'out' };
  return { text: formatLeft(left), tone: left <= diffDays(next, today) ? 'warn' : 'ok' };
}
