/** Календарный день в формате YYYY-MM-DD — без времени и часовых поясов. */
export type Day = string;

const MS_PER_DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Номер дня от 1970-01-01. Удобно сравнивать и вычитать. */
export function dayNum(day: Day): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromNum(n: number): Day {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Сегодняшний день по локальному времени пользователя. */
export function today(now: Date = new Date()): Day {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(day: Day, n: number): Day {
  return fromNum(dayNum(day) + n);
}

/** a − b в днях. */
export function diffDays(a: Day, b: Day): number {
  return dayNum(a) - dayNum(b);
}

/** 0 = понедельник … 6 = воскресенье. */
export function weekday(day: Day): number {
  return (((dayNum(day) + 3) % 7) + 7) % 7;
}

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
/** «в понедельник», «в среду» */
const WEEKDAYS_ACC = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const parts = (day: Day) => day.split('-').map(Number) as [number, number, number];

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const daysWord = (n: number) => plural(n, ['день', 'дня', 'дней']);

/** «24 октября» */
export function formatDate(day: Day): string {
  const [, m, d] = parts(day);
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

/** «24 окт» */
export function formatDateShort(day: Day): string {
  const [, m, d] = parts(day);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** «Суббота, 24 октября» */
export function formatDayLong(day: Day): string {
  const w = WEEKDAYS[weekday(day)];
  return `${w[0].toUpperCase()}${w.slice(1)}, ${formatDate(day)}`;
}

/** «в субботу» */
export function onWeekday(wd: number): string {
  return `${wd === 1 ? 'во' : 'в'} ${WEEKDAYS_ACC[wd]}`;
}

/** «каждую субботу», «каждый вторник», «каждое воскресенье» */
export function everyWeekday(wd: number): string {
  const word = wd === 6 ? 'каждое' : wd === 0 || wd === 1 || wd === 3 ? 'каждый' : 'каждую';
  return `${word} ${WEEKDAYS_ACC[wd]}`;
}

/** «через 3 дня», «сегодня», «завтра» */
export function inDays(n: number): string {
  if (n <= 0) return 'сегодня';
  if (n === 1) return 'завтра';
  return `через ${n} ${daysWord(n)}`;
}

/** Остаток запаса коротко: «1 день», «12 дней», «≈ 3 нед», «≈ 2 мес». */
export function formatLeft(days: number): string {
  if (days <= 0) return 'закончилось';
  if (days < 14) return `${days} ${daysWord(days)}`;
  if (days < 60) return `≈ ${Math.round(days / 7)} нед`;
  return `≈ ${Math.round(days / 30)} мес`;
}
