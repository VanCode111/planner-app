import { describe, expect, it } from 'vitest';
import { addDays, weekday } from '../lib/dates';
import { ackUrgent, forceAdd, initialState, learn, markItem, newItem, placeOrder, purchase, skip, updateSettings } from './actions';
import { buildPlan, nextOrderDay, unitsToCover } from './forecast';
import type { AppState, Item } from './types';

// Среда, 21 октября 2026. Заказ — по субботам (orderWeekday = 5).
const WED = '2026-10-21';
const SAT = '2026-10-24';
const NEXT_SAT = '2026-10-31';

function makeState(items: Item[] = []): AppState {
  const s = initialState(WED);
  return { ...updateSettings(s, { orderWeekday: 5, periodWeeks: 1 }, WED), onboarded: true, items };
}

function item(name: string, daysPerUnit: number, runOutDay: string | null, extra: Partial<Item> = {}): Item {
  return newItem(WED, { name, daysPerUnit, runOutDay, price: 100, ...extra });
}

describe('расписание', () => {
  it('ближайший заказ — ближайшая суббота', () => {
    expect(weekday(SAT)).toBe(5);
    expect(nextOrderDay(makeState(), WED)).toBe(SAT);
    expect(nextOrderDay(makeState(), SAT)).toBe(SAT);
  });

  it('заказ, оформленный заранее, закрывает цикл', () => {
    let s = makeState();
    s = placeOrder(s, { kind: 'planned', day: '2026-10-23', lines: [] }).state;
    expect(nextOrderDay(s, '2026-10-23')).toBe(NEXT_SAT);
    expect(nextOrderDay(s, SAT)).toBe(NEXT_SAT);
  });

  it('дозаказ не сдвигает плановый заказ', () => {
    let s = makeState();
    s = placeOrder(s, { kind: 'extra', day: '2026-10-23', lines: [] }).state;
    expect(nextOrderDay(s, '2026-10-23')).toBe(SAT);
  });

  it('раз в две недели считается от опорного дня', () => {
    const s = updateSettings(makeState(), { periodWeeks: 2 }, WED);
    expect(s.settings.anchorDay).toBe(SAT);
    expect(nextOrderDay(s, '2026-10-25')).toBe('2026-11-07');
  });
});

describe('план заказа', () => {
  it('берёт то, что закончится до следующего заказа, и не трогает остальное', () => {
    const s = makeState([
      item('Молоко', 2.5, '2026-10-22'), // до заказа не дотянет
      item('Кофе', 30, '2026-10-29'), // до 31-го не хватит
      item('Порошок', 60, '2026-11-18'), // хватит
    ]);
    const plan = buildPlan(s, WED);
    expect(plan.next).toBe(SAT);
    expect(plan.following).toBe(NEXT_SAT);
    expect(plan.lines.map((l) => [l.item.name, l.reason])).toEqual([
      ['Молоко', 'soon'],
      ['Кофе', 'needed'],
    ]);
    expect(plan.urgent.map((i) => i.name)).toEqual(['Молоко']);
  });

  it('считает количество, чтобы дожить до следующего заказа', () => {
    const milk = item('Молоко', 7 / 3, '2026-10-22');
    expect(unitsToCover(milk, SAT, NEXT_SAT)).toBe(3);
    const coffee = item('Кофе', 30, '2026-10-29');
    expect(unitsToCover(coffee, SAT, NEXT_SAT)).toBe(1);
  });

  it('предлагает впрок только нескоропортящееся и ставит первым то, что закрывает порог', () => {
    const s = makeState([
      item('Кофе', 30, '2026-10-29', { price: 2300 }),
      item('Сыр', 7, '2026-11-03', { perishable: true }),
      item('Губки', 21, '2026-11-02', { price: 99 }),
      item('Средство для посуды', 30, '2026-11-05', { price: 250 }),
    ]);
    const plan = buildPlan(s, WED);
    expect(plan.missingForFree).toBe(200);
    expect(plan.suggestions.map((l) => l.item.name)).toEqual(['Средство для посуды', 'Губки']);
  });

  it('неизвестный остаток уходит в «проверьте наличие»', () => {
    const s = makeState([item('Соль', 120, null)]);
    const plan = buildPlan(s, WED);
    expect(plan.lines).toHaveLength(0);
    expect(plan.unknown.map((i) => i.name)).toEqual(['Соль']);
  });

  it('учитывает ручные добавления и пропуски', () => {
    const salt = item('Соль', 120, null);
    const coffee = item('Кофе', 30, '2026-10-29');
    let s = makeState([salt, coffee]);
    s = forceAdd(s, salt.id);
    s = skip(s, coffee.id, SAT);
    const plan = buildPlan(s, WED);
    expect(plan.lines.map((l) => [l.item.name, l.manual])).toEqual([['Соль', true]]);
    // Пропуск действует только на этот заказ.
    expect(buildPlan(s, '2026-10-25').lines.map((l) => l.item.name)).toContain('Кофе');
  });

  it('доставка бесплатна от порога', () => {
    const s = makeState([item('Кофе', 30, '2026-10-29', { price: 2600 })]);
    expect(buildPlan(s, WED).deliveryFee).toBe(0);
    const cheap = makeState([item('Кофе', 30, '2026-10-29', { price: 600 })]);
    expect(buildPlan(cheap, WED).deliveryFee).toBe(199);
  });
});

describe('обучение и покупки', () => {
  it('покупка продлевает запас с учётом остатка', () => {
    const coffee = item('Кофе', 30, '2026-10-29');
    const after = purchase(coffee, SAT, 1, 1090);
    expect(after.runOutDay).toBe(addDays('2026-10-29', 30));
    expect(after.history[0]).toEqual({ day: SAT, qty: 1, price: 1090 });
  });

  it('закончилось раньше прогноза → расход ускоряется', () => {
    const powder = item('Порошок', 60, '2026-11-18', { lastBoughtDay: '2026-09-19' });
    // Прогноз: 60 дней. Факт: 32 дня → новое значение между ними.
    const after = learn(powder, WED);
    expect(after.runOutDay).toBe(WED);
    expect(after.daysPerUnit).toBeGreaterThan(32);
    expect(after.daysPerUnit).toBeLessThan(60);
    expect(after.signals).toBe(1);
  });

  it('«ещё много» отодвигает прогноз', () => {
    const coffee = item('Кофе', 30, '2026-10-29', { lastBoughtDay: '2026-09-29' });
    const s = markItem(makeState([coffee]), coffee.id, { days: 14 }, WED);
    expect(s.items[0].runOutDay).toBe('2026-11-04');
    expect(s.items[0].daysPerUnit).toBeGreaterThan(30);
  });

  it('оформленный заказ обновляет запасы и очищает черновик', () => {
    const milk = item('Молоко', 2.5, '2026-10-22');
    let s = forceAdd(makeState([milk]), milk.id);
    const { state, order } = placeOrder(s, { kind: 'planned', day: SAT, lines: [{ itemId: milk.id, qty: 3 }] });
    s = state;
    expect(order.total).toBe(300);
    expect(order.deliveryFee).toBe(199);
    expect(s.items[0].runOutDay).toBe(addDays(SAT, 8));
    expect(s.draft.forced).toEqual({});
  });

  it('«подождёт» засчитывает доставку не больше раза за цикл', () => {
    const a = item('Молоко', 2.5, '2026-10-22');
    const b = item('Хлеб', 3, '2026-10-22');
    let s = makeState([a, b]);
    s = ackUrgent(s, [a.id], SAT, WED);
    s = ackUrgent(s, [b.id], SAT, '2026-10-22');
    expect(s.savings).toHaveLength(1);
    expect(s.savings[0].amount).toBe(199);
    expect(buildPlan(s, WED).urgent).toHaveLength(0);
  });
});
