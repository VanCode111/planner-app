import { useState } from 'react';
import { diffDays, formatDate, inDays, onWeekday, weekday } from '../lib/dates';
import { formatRub } from '../lib/format';
import {
  ackUrgent, addItem, deleteItem, forceAdd, markItem, newItem, placeOrder, runOutForMark, setQty, skip,
} from '../model/actions';
import { unitsToCover } from '../model/forecast';
import type { Item } from '../model/types';
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
type Level = 'low' | 'out';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

/** «Что заканчивается?» — 5 секунд, чтобы ничего не забыть до заказа. */
export function QuickAddSheet() {
  const { state, plan, today, update } = useApp();
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [level, setLevel] = useState<Level>('low');
  const [when, setWhen] = useState<When>('wait');

  const q = norm(query);
  const byRunOut = (a: Item, b: Item) => (a.runOutDay ?? '9999').localeCompare(b.runOutDay ?? '9999');
  const results = q
    ? state.items.filter((it) => norm(it.name).includes(q)).sort(byRunOut).slice(0, 6)
    : [...state.items].sort(byRunOut).slice(0, 6);
  const exact = state.items.some((it) => norm(it.name) === q);
  const inPlan = new Set(plan.lines.map((l) => l.item.id));

  const projected = picked ? runOutForMark(picked, level, today) : null;
  const urgent = projected !== null && diffDays(projected, plan.next) < 0;
  const fee = state.settings.deliveryFee;
  const choice: When = urgent ? when : 'wait';

  const pick = (item: Item, created: boolean) => {
    setPicked(item);
    setIsNew(created);
    setLevel(created ? 'out' : 'low');
    setWhen('wait');
    haptic.select();
  };

  const confirm = () => {
    if (!picked) return;
    const id = picked.id;
    const marked = (s: typeof state) => markItem(isNew ? addItem(s, picked) : s, id, level, today);

    if (choice === 'shop') {
      update((s) => {
        const s1 = marked(s);
        const item = s1.items.find((it) => it.id === id)!;
        return placeOrder(s1, { kind: 'shop', day: today, lines: [{ itemId: id, qty: unitsToCover(item, today, plan.next) }] }).state;
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

  const cta = !urgent
    ? `Добавить в заказ на ${formatDate(plan.next)}`
    : choice === 'wait' ? 'Добавить в заказ' : choice === 'extra' ? 'Собрать дозаказ' : 'Отметить покупку';

  return (
    <Sheet title="Что заканчивается?" onClose={nav.closeSheet}>
      <label className="search">
        <SearchIcon size={20} />
        <input
          autoFocus={!picked}
          value={query}
          placeholder="Например, молоко"
          aria-label="Поиск товара"
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
        />
      </label>

      {!picked && (
        <div className="stack-4 mt-8">
          {results.map((it) => (
            <button key={it.id} className="row row-plain" onClick={() => pick(it, false)}>
              <Avatar name={it.name} category={it.category} />
              <span className="row-main">
                <span className="row-title">{it.name}</span>
                <span className="row-sub">{inPlan.has(it.id) ? `уже в заказе · ${untilText(it, today)}` : untilText(it, today)}</span>
              </span>
            </button>
          ))}
          {q && !exact && (
            <button className="row row-plain row-action" onClick={() => pick(newItem(today, { name: query.trim() }), true)}>
              <span className="row-action-icon"><PlusIcon size={20} /></span>
              <span>Новый товар «{query.trim()}»</span>
            </button>
          )}
          {!q && results.length === 0 && <p className="hint">Начните вводить название.</p>}
        </div>
      )}

      {picked && (
        <div className="stack-14 mt-12">
          <button className="picked" onClick={() => setPicked(null)}>
            <Avatar name={picked.name} category={picked.category} />
            <span className="row-main">
              <span className="row-title">{picked.name}</span>
              <span className="row-sub">{isNew ? 'новый товар' : `одной упаковки хватает на ${Math.round(picked.daysPerUnit)} дн.`}</span>
            </span>
            <CheckIcon className="accent-text" />
          </button>

          <Segmented<Level>
            label="Сколько осталось"
            value={level}
            onChange={setLevel}
            options={[{ value: 'low', label: 'Скоро закончится' }, { value: 'out', label: 'Уже нет' }]}
          />

          {urgent ? (
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
              {inPlan.has(picked.id) ? 'Уже в списке — уточним прогноз.' : `До ${formatDate(plan.next)} хватит — добавим в ближайший заказ.`}
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
