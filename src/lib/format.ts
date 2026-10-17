const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** «2 370 ₽» с неразрывными пробелами. */
export function formatRub(value: number): string {
  return `${rub.format(Math.round(value)).replace(/\s/g, ' ')} ₽`;
}

/** Короткий уникальный id без зависимостей. */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Первая буква названия для аватарки товара. */
export function initial(name: string): string {
  const ch = name.trim().match(/\p{L}|\p{N}/u);
  return ch ? ch[0].toUpperCase() : '•';
}
