import type { CategoryId } from './types';

export interface Category {
  id: CategoryId;
  title: string;
  /** Место в доме — для подсказки «Пробегитесь взглядом». */
  place: string;
}

export const CATEGORIES: Category[] = [
  { id: 'food', title: 'Продукты', place: 'Холодильник и кухня' },
  { id: 'household', title: 'Бытовая химия', place: 'Уборка и стирка' },
  { id: 'hygiene', title: 'Гигиена', place: 'Ванная' },
  { id: 'pets', title: 'Питомцы', place: 'Питомец' },
  { id: 'kids', title: 'Дети', place: 'Детская' },
  { id: 'health', title: 'Аптечка', place: 'Аптечка' },
  { id: 'other', title: 'Другое', place: 'Остальное' },
];

export const categoryById = (id: CategoryId): Category => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export interface Template {
  name: string;
  category: CategoryId;
  /** На сколько дней обычно хватает одной упаковки. */
  days: number;
  /** Примерная цена, ₽ — пользователь поправит. */
  price: number;
  perishable?: boolean;
}

/** Типовые товары: стартовые значения расхода, пока приложение не узнало ваш. */
export const TEMPLATES: Template[] = [
  { name: 'Молоко, 1 л', category: 'food', days: 3, price: 95, perishable: true },
  { name: 'Хлеб', category: 'food', days: 3, price: 65, perishable: true },
  { name: 'Яйца, 10 шт', category: 'food', days: 7, price: 129 },
  { name: 'Сыр, 200 г', category: 'food', days: 7, price: 230 },
  { name: 'Масло сливочное', category: 'food', days: 10, price: 190 },
  { name: 'Йогурт или творог', category: 'food', days: 2, price: 90, perishable: true },
  { name: 'Бананы, 1 кг', category: 'food', days: 5, price: 139, perishable: true },
  { name: 'Яблоки, 1 кг', category: 'food', days: 7, price: 159, perishable: true },
  { name: 'Овощи для салата', category: 'food', days: 4, price: 260, perishable: true },
  { name: 'Курица', category: 'food', days: 4, price: 360, perishable: true },
  { name: 'Гречка', category: 'food', days: 21, price: 110 },
  { name: 'Рис', category: 'food', days: 21, price: 120 },
  { name: 'Макароны', category: 'food', days: 14, price: 95 },
  { name: 'Кофе в зёрнах, 1 кг', category: 'food', days: 30, price: 1090 },
  { name: 'Чай', category: 'food', days: 30, price: 250 },
  { name: 'Сахар', category: 'food', days: 45, price: 85 },
  { name: 'Соль', category: 'food', days: 120, price: 39 },
  { name: 'Масло растительное', category: 'food', days: 30, price: 165 },
  { name: 'Вода питьевая, 5 л', category: 'food', days: 4, price: 120 },

  { name: 'Средство для посуды', category: 'household', days: 30, price: 189 },
  { name: 'Губки для посуды', category: 'household', days: 21, price: 99 },
  { name: 'Таблетки для посудомойки', category: 'household', days: 40, price: 990 },
  { name: 'Стиральный порошок', category: 'household', days: 45, price: 649 },
  { name: 'Кондиционер для белья', category: 'household', days: 45, price: 399 },
  { name: 'Пакеты для мусора', category: 'household', days: 21, price: 149 },
  { name: 'Бумажные полотенца', category: 'household', days: 14, price: 199 },
  { name: 'Чистящее средство', category: 'household', days: 60, price: 249 },

  { name: 'Туалетная бумага, 8 рул.', category: 'hygiene', days: 14, price: 389 },
  { name: 'Зубная паста', category: 'hygiene', days: 30, price: 199 },
  { name: 'Шампунь', category: 'hygiene', days: 45, price: 399 },
  { name: 'Гель для душа', category: 'hygiene', days: 30, price: 299 },
  { name: 'Жидкое мыло', category: 'hygiene', days: 30, price: 159 },
  { name: 'Дезодорант', category: 'hygiene', days: 45, price: 299 },

  { name: 'Сухой корм для кошки', category: 'pets', days: 21, price: 890 },
  { name: 'Влажный корм', category: 'pets', days: 7, price: 450 },
  { name: 'Наполнитель для лотка', category: 'pets', days: 21, price: 499 },
  { name: 'Корм для собаки', category: 'pets', days: 21, price: 1290 },

  { name: 'Подгузники', category: 'kids', days: 7, price: 1290 },
  { name: 'Влажные салфетки', category: 'kids', days: 10, price: 149 },
  { name: 'Детское пюре', category: 'kids', days: 3, price: 290, perishable: true },

  { name: 'Витамины', category: 'health', days: 30, price: 590 },
  { name: 'Пластыри', category: 'health', days: 120, price: 120 },
  { name: 'Батарейки AA', category: 'other', days: 90, price: 259 },
];

/** Подобрать шаблон к названию нового товара: «молоко» → «Молоко, 1 л». */
export function matchTemplate(name: string): Template | undefined {
  const q = name.trim().toLowerCase();
  if (q.length < 3) return undefined;
  return TEMPLATES.find((t) => {
    const base = t.name.toLowerCase().split(',')[0];
    return base.startsWith(q) || q.startsWith(base);
  });
}
