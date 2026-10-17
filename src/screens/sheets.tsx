import { useState } from 'react';
import { addDays, diffDays, formatDate, inDays, onWeekday, plural, weekday } from '../lib/dates';
import { formatRub } from '../lib/format';
import {
  ackUrgent, addItem, deleteItem, forceAdd, markItem, newItem, placeOrder, runOutForMark, setQty, skip,
} from '../model/actions';
import { CATEGORIES, matchTemplate } from '../model/catalog';
import { unitsToCover } from '../model/forecast';
import type { CategoryId, Item } from '../model/types';
import { useNav } from '../nav';
import { useApp } from '../state';
import { MainButton } from '../telegram/MainButton';
import { confirmDialog, haptic } from '../telegram/webapp';
import { CheckIcon, PlusIcon, SearchIcon } from '../ui/icons';
import { Avatar, Segmented, Sheet, Stepper } from '../ui/kit';
import { untilText } from '../ui/status';

const HOW_LONG = [
  { days: 7, label: '≈ неделя' },
  { days: 14, label: '≈ 2 недели' },
  { days: 30, label: '≈ месяц' },
  { days: 60, label: '≈ 2 месяца' },
];

/** Строка из плана: количество, убрать из заказа с причиной. */
export function LineSheet({ itemId }: { itemId: string }) {
  const { plan, today, update } = useApp();
  const nav = useNav();
  const [removing, setRemoving] = useState(false);
  const line = plan.lines.find((l) => l.item.id === itemId);
  if (!line) return null;
  const { item, qty } = line;

  const done = (message: string) => {
    haptic.success();
    nav.closeSheet();
    nav.toast(message);
  };

  return (
    <Sheet title={item.name} onClose={nav.closeSheet}>
      <p className="sheet-sub">{untilText(item, today)}{item.price ? ` · ${formatRub(item.price)} за шт.` : ''}</p>

      {!removing ? (
        <div className="stack-12">
          <div className="card-inset split">
            <span>Количество</span>
            <Stepper label="Количество" value={qty} onChange={(v) => update((s) => setQty(s, item.id, v))} />
          </div>
          {item.price > 0 && (
            <div className="split px-4">
              <span className="hint">Сумма</span>
              <b>{formatRub(item.price * qty)}</b>
            </div>
          )}
          <div className="grid-2">
            <button className="btn btn-ghost" onClick={() => nav.push({ name: 'item', id: item.id })}>Карточка товара</button>
            <button className="btn btn-danger-light" onClick={() => setRemoving(true)}>Убрать из заказа</button>
          </div>
          <MainButton text="Готово" onClick={nav.closeSheet} />
        </div>
      ) : (
        <div className="stack-12">
          <div className="label-strong">Ещё есть? На сколько примерно хватит</div>
          <div className="grid-2">
            {HOW_LONG.map((o) => (
              <button key={o.days} className="btn btn-ghost" onClick={() => {
                update((s) => skip(markItem(s, item.id, { days: o.days }, today), item.id, plan.next));
                done('Убрали из заказа, прогноз обновлён');
              }}>{o.label}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => {
            update((s) => skip(s, item.id, plan.next));
            done(`Не берём ${formatDate(plan.next)}`);
          }}>Просто не в этот раз</button>
          <button className="btn btn-danger-light btn-block" onClick={async () => {
            if (!(await confirmDialog(`Удалить «${item.name}» из запасов? История покупок тоже удалится.`))) return;
            update((s) => deleteItem(s, item.id));
            done('Товар удалён');
          }}>Больше не покупаю</button>
          <MainButton text="Назад" onClick={() => setRemoving(false)} />
        </div>
      )}
    </Sheet>
  );
}

type When = 'wait' | 'extra' | 'shop';
/** have — новый товар, который пока есть: просто начать отслеживать. */
type Level = 'low' | 'out' | 'have';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

const DAY_OPTIONS = [3, 7, 14, 30, 60, 90];
const dayLabel = (d: number) =>
  ({ 3: '3 дня', 7: 'неделю', 14: '2 недели', 30: 'месяц', 60: '2 месяца', 90: '3 месяца' } as Record<number, string>)[d]
  ?? `${d} ${plural(d, ['день', 'дня', 'дней'])}`;

/**
 * «Что заканчивается?» — 5 секунд, чтобы ничего не забыть до заказа.
 * В режиме add — «Добавить товар»: новый товар можно просто начать отслеживать.
 */
export function QuickAddSheet({ mode = 'quick', initialQuery = '' }: { mode?: 'quick' | 'add'; initialQuery?: string }) {
  const { state, plan, today, update } = useApp();
  const nav = useNav();
  const [query, setQuery] = useState(initialQuery);
  const [picked, setPicked] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [level, setLevel] = useState<Level>('low');
  const [when, setWhen] = useState<When>('wait');
  // Поля нового товара.
  const [category, setCategory] = useState<CategoryId>('other');
  const [days, setDays] = useState(7);
  const [price, setPrice] = useState('');

  const q = norm(query);
  const byRunOut = (a: Item, b: Item) => (a.runOutDay ?? '9999').localeCompare(b.runOutDay ?? '9999');
  const results = q
    ? state.items.filter((it) => norm(it.name).includes(q)).sort(byRunOut).slice(0, 6)
    : mode === 'add' ? [] : [...state.items].sort(byRunOut).slice(0, 6);
  const exact = state.items.some((it) => norm(it.name) === q);
  const inPlan = new Set(plan.lines.map((l) => l.item.id));

  const item: Item | null = picked && isNew
    ? { ...picked, category, daysPerUnit: days, price: Number(price) || 0 }
    : picked;
  const projected = item && level !== 'have' ? runOutForMark(item, level, today) : null;
  const urgent = projected !== null && diffDays(projected, plan.next) < 0;
  const fee = state.settings.deliveryFee;
  const choice: When = urgent ? when : 'wait';

  const pickExisting = (it: Item) => {
    if (mode === 'add') {
      nav.push({ name: 'item', id: it.id });
      return;
    }
    setPicked(it);
    setIsNew(false);
    setLevel('low');
    setWhen('wait');
    haptic.select();
  };

  const pickNew = () => {
    const created = newItem(today, { name: query.trim() });
    const tpl = matchTemplate(created.name);
    setPicked(created);
    setIsNew(true);
    setCategory(created.category);
    setDays(created.daysPerUnit);
    setPrice(tpl ? String(tpl.price) : '');
    setLevel(mode === 'add' ? 'have' : 'out');
    setWhen('wait');
    haptic.select();
  };

  const confirm = () => {
    if (!item) return;
    const id = item.id;

    if (level === 'have') {
      update((s) => addItem(s, { ...item, runOutDay: addDays(today, Math.max(1, Math.round(item.daysPerUnit / 2))) }));
      haptic.success();
      nav.closeSheet();
      nav.toast('Добавили в запасы — предупредим, когда пора покупать');
      return;
    }

    const marked = (s: typeof state) => markItem(isNew ? addItem(s, item) : s, id, level, today);

    if (choice === 'shop') {
      update((s) => {
        const s1 = marked(s);
        const bought = s1.items.find((it) => it.id === id)!;
        return placeOrder(s1, { kind: 'shop', day: today, lines: [{ itemId: id, qty: unitsToCover(bought, today, plan.next) }] }).state;
      });
      haptic.success();
      nav.closeSheet();
      nav.toast('Отметили покупку — прогноз обновлён');
      return;
    }

    update((s) => {
      const s1 = forceAdd(marked(s), id);
      return urgent && choice === 'wait' ? ackUrgent(s1, [id], plan.next, today) : s1;
    });
    haptic.success();
    if (choice === 'extra') {
      nav.push({ name: 'checkout', kind: 'extra' });
    } else {
      nav.closeSheet();
      nav.toast(`Добавили в заказ на ${formatDate(plan.next)}`);
    }
  };

  const cta = level === 'have'
    ? 'Добавить в запасы'
    : !urgent
      ? `Добавить в заказ на ${formatDate(plan.next)}`
      : choice === 'wait' ? 'Добавить в заказ' : choice === 'extra' ? 'Собрать дозаказ' : 'Отметить покупку';

  const dayOptions = DAY_OPTIONS.includes(days) ? DAY_OPTIONS : [...DAY_OPTIONS, days].sort((x, y) => x - y);

  return (
    <Sheet title={mode === 'add' ? 'Добавить товар' : 'Что заканчивается?'} onClose={nav.closeSheet}>
      <label className="search">
        <SearchIcon size={20} />
        <input
          autoFocus={!picked}
          value={query}
          placeholder={mode === 'add' ? 'Название, например «кетчуп»' : 'Например, молоко'}
          aria-label="Поиск товара"
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q && !exact && !picked) pickNew();
          }}
        />
      </label>

      {!picked && (
        <div className="stack-4 mt-8">
          {results.map((it) => (
            <button key={it.id} className="row row-plain" onClick={() => pickExisting(it)}>
              <Avatar name={it.name} category={it.category} />
              <span className="row-main">
                <span className="row-title">{it.name}</span>
                <span className="row-sub">
                  {mode === 'add' ? 'уже в запасах' : inPlan.has(it.id) ? `уже в заказе · ${untilText(it, today)}` : untilText(it, today)}
                </span>
              </span>
            </button>
          ))}
          {q && !exact && (
            <button className="row row-plain row-action" onClick={pickNew}>
              <span className="row-action-icon"><PlusIcon size={20} /></span>
              <span>Новый товар «{query.trim()}»</span>
            </button>
          )}
          {!q && <p className="hint px-4">{mode === 'add' ? 'Впишите любое название — товар не обязательно должен быть в каталоге.' : 'Начните вводить название — или впишите новый товар.'}</p>}
        </div>
      )}

      {picked && item && (
        <div className="stack-14 mt-12">
          <button className="picked" onClick={() => setPicked(null)}>
            <Avatar name={item.name} category={item.category} />
            <span className="row-main">
              <span className="row-title">{item.name}</span>
              <span className="row-sub">{isNew ? 'новый товар' : `одной упаковки хватает на ${Math.round(item.daysPerUnit)} дн.`}</span>
            </span>
            <CheckIcon className="accent-text" />
          </button>

          {isNew && (
            <div className="stack-12">
              <div className="stack-8">
                <div className="field-label">Категория</div>
                <div className="chip-row chip-row-flush">
                  {CATEGORIES.map((c) => (
                    <button key={c.id} aria-pressed={category === c.id} className={`pill pill-small${category === c.id ? ' is-on' : ''}`}
                      onClick={() => setCategory(c.id)}>{c.title}</button>
                  ))}
                </div>
              </div>
              <div className="stack-8">
                <div className="field-label">Одной упаковки хватает на</div>
                <div className="chip-row chip-row-flush">
                  {dayOptions.map((d) => (
                    <button key={d} aria-pressed={days === d} className={`pill pill-small${days === d ? ' is-on' : ''}`}
                      onClick={() => setDays(d)}>{dayLabel(d)}</button>
                  ))}
                </div>
                <div className="hint small">Примерно. Прогноз уточнится по вашим отметкам и покупкам.</div>
              </div>
              <label className="card-inset split">
                <span>Цена за упаковку</span>
                <span className="kv-input">
                  <input inputMode="numeric" value={price} placeholder="не знаю" aria-label="Цена за упаковку"
                    onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
                  ₽
                </span>
              </label>
            </div>
          )}

          <Segmented<Level>
            label="Сколько осталось"
            value={level}
            onChange={setLevel}
            options={isNew
              ? [{ value: 'out', label: 'Нет дома' }, { value: 'low', label: 'Кончается' }, { value: 'have', label: 'Есть запас' }]
              : [{ value: 'low', label: 'Скоро закончится' }, { value: 'out', label: 'Уже нет' }]}
          />

          {level === 'have' ? (
            <p className="body-text">Начнём отслеживать: считаем, что осталось примерно пол-упаковки, и добавим в заказ, когда будет пора.</p>
          ) : urgent ? (
            <>
              <div>
                <div className="label-strong">Когда нужно?</div>
                <div className="hint">Заказ {onWeekday(weekday(plan.next))}, {formatDate(plan.next)} — {inDays(diffDays(plan.next, today))}</div>
              </div>
              <div className="stack-8" role="radiogroup" aria-label="Когда нужно">
                <Option on={choice === 'wait'} onClick={() => setWhen('wait')} title="Подождёт до заказа" badge={fee > 0 ? 'выгоднее' : undefined}
                  text={fee > 0 ? `Добавим в заказ. Платить ${formatRub(fee)} за отдельную доставку не придётся.` : 'Добавим в ближайший заказ.'} />
                <Option on={choice === 'extra'} onClick={() => setWhen('extra')} title="Нужно раньше"
                  text={`Дозаказ${fee > 0 ? ` с доставкой ${formatRub(fee)}` : ''}. Заодно предложим всё, что закончится до заказа.`} />
                <Option on={choice === 'shop'} onClick={() => setWhen('shop')} title="Куплю сам рядом с домом"
                  text="Отметим покупку — прогноз запасов обновится." />
              </div>
            </>
          ) : (
            <p className="body-text">
              {inPlan.has(item.id) ? 'Уже в списке — уточним прогноз.' : `До ${formatDate(plan.next)} хватит — добавим в ближайший заказ.`}
            </p>
          )}
          <MainButton text={cta} onClick={confirm} />
        </div>
      )}
    </Sheet>
  );
}

function Option({ on, onClick, title, text, badge }: { on: boolean; onClick: () => void; title: string; text: string; badge?: string }) {
  return (
    <button role="radio" aria-checked={on} className={`option${on ? ' is-on' : ''}`} onClick={onClick}>
      <span className="option-dot" />
      <span className="option-body">
        <span className="option-title">{title}{badge && <span className="badge badge-ok">{badge}</span>}</span>
        <span className="option-text">{text}</span>
      </span>
    </button>
  );
}
