import { useMemo, useState } from 'react';
import { addDays, diffDays, formatDate, inDays } from '../lib/dates';
import { formatRub } from '../lib/format';
import { confirmHave, forceAdd, placeOrder } from '../model/actions';
import { CATEGORIES } from '../model/catalog';
import { deliveryFeeFor, extraQty, isUncertain, nextOrderDay, type PlanLine } from '../model/forecast';
import type { CategoryId, Item } from '../model/types';
import { useNav } from '../nav';
import { useApp } from '../state';
import { MainButton } from '../telegram/MainButton';
import { copyText, haptic } from '../telegram/webapp';
import { CheckIcon, CopyIcon, PlusIcon } from '../ui/icons';
import { Avatar, ScreenHeader, Section, Stepper } from '../ui/kit';
import { stockLabel, untilText } from '../ui/status';

interface Line {
  item: Item;
  qty: number;
}

function listText(title: string, lines: Line[], total: number): string {
  const rows = lines.map((l) => `• ${l.item.name}${l.qty > 1 ? ` — ${l.qty} шт.` : ''}`);
  return [title, ...rows, '', `Итого ≈ ${formatRub(total)}`].join('\n');
}

/** Итог, копирование списка и сумма по чеку — общие для планового заказа и дозаказа. */
function Summary({ lines, receipt, onReceipt, title }: {
  lines: Line[];
  receipt: string;
  onReceipt: (v: string) => void;
  title: string;
}) {
  const { state } = useApp();
  const nav = useNav();
  const estimate = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
  const total = Number(receipt) > 0 ? Number(receipt) : estimate;
  const fee = deliveryFeeFor(state.settings, total);
  return (
    <>
      <Section title="Итого">
        <div className="kv"><span>Товары</span><b>{lines.reduce((s, l) => s + l.qty, 0)} шт.</b></div>
        <div className="kv"><span>Сумма по прогнозу</span><b>{formatRub(estimate)}</b></div>
        <div className="kv"><span>Доставка</span><b className={fee ? 'tone-text-warn' : 'tone-text-ok'}>{fee ? formatRub(fee) : 'бесплатно'}</b></div>
        <label className="kv">
          <span>Сумма по чеку</span>
          <span className="kv-input">
            <input inputMode="numeric" placeholder={String(Math.round(estimate))} value={receipt}
              onChange={(e) => onReceipt(e.target.value.replace(/\D/g, ''))} aria-label="Сумма по чеку" />
            ₽
          </span>
        </label>
      </Section>
      <div className="px-16 mt-12">
        <button className="btn btn-surface btn-block" disabled={!lines.length} onClick={async () => {
          const ok = await copyText(listText(title, lines, estimate));
          haptic.tap();
          nav.toast(ok ? 'Список скопирован — вставьте его в приложение магазина' : 'Не получилось скопировать');
        }}>
          <CopyIcon size={20} /> Скопировать список для магазина
        </button>
      </div>
    </>
  );
}

export function CheckoutScreen({ kind }: { kind: 'planned' | 'extra' }) {
  return kind === 'planned' ? <PlannedCheckout /> : <ExtraCheckout />;
}

function PlannedCheckout() {
  const { state, plan, today, update, replace } = useApp();
  const nav = useNav();
  const [receipt, setReceipt] = useState('');
  const [answers, setAnswers] = useState<Record<string, 'have' | 'buy'>>({});
  const [openPlace, setOpenPlace] = useState<CategoryId | null>(null);
  const [visited, setVisited] = useState<Set<CategoryId>>(new Set());

  // Список вопросов фиксируем при открытии, чтобы строки не прыгали после ответа.
  const [asks] = useState<Item[]>(() => {
    const inPlan = new Set(plan.lines.map((l) => l.item.id));
    const horizon = addDays(plan.following, plan.periodDays);
    const uncertain = state.items.filter((it) =>
      !inPlan.has(it.id) && it.runOutDay && isUncertain(it) && diffDays(it.runOutDay, horizon) <= 0);
    return [...plan.unknown, ...uncertain].slice(0, 6);
  });

  const inPlan = new Set(plan.lines.map((l) => l.item.id));
  const places = CATEGORIES.filter((c) => state.items.some((it) => it.category === c.id));
  const minUntil = addDays(plan.following, 1);

  const answer = (item: Item, a: 'have' | 'buy') => {
    setAnswers((x) => ({ ...x, [item.id]: a }));
    update((s) => (a === 'buy' ? forceAdd(s, item.id) : confirmHave(s, item.id, today, minUntil)));
    haptic.select();
  };

  const submit = () => {
    const lines = plan.lines.map((l) => ({ itemId: l.item.id, qty: l.qty }));
    const result = placeOrder(state, { kind: 'planned', day: today, lines, actualTotal: Number(receipt) || undefined }).state;
    replace(result);
    haptic.success();
    nav.home('order');
    nav.toast(`Готово! Следующий заказ — ${formatDate(nextOrderDay(result, today))}`);
  };

  return (
    <div className="screen">
      <ScreenHeader subtitle={`Заказ на ${formatDate(plan.next)}`} title="Ничего не забыли?" />
      <p className="lead">{asks.length ? 'Это товары без точного прогноза — о них проще всего забыть.' : 'По всем товарам есть прогноз. Пробегитесь взглядом по дому — на всякий случай.'}</p>

      {asks.length > 0 && (
        <Section>
          {asks.map((it) => (
            <div className="row" key={it.id}>
              <Avatar name={it.name} category={it.category} />
              <span className="row-main">
                <span className="row-title">{it.name}</span>
                <span className="row-sub">{it.runOutDay ? `прогноз примерный: ${untilText(it, today)}` : 'остаток неизвестен'}</span>
              </span>
              {answers[it.id] ? (
                <span className={`row-done ${answers[it.id] === 'buy' ? 'accent-text' : 'hint'}`}>{answers[it.id] === 'buy' ? 'В заказе' : 'Есть'}</span>
              ) : (
                <span className="row-actions">
                  <button className="btn btn-small btn-ghost" onClick={() => answer(it, 'have')}>Есть</button>
                  <button className="btn btn-small btn-accent-light" onClick={() => answer(it, 'buy')}>Купить</button>
                </span>
              )}
            </div>
          ))}
        </Section>
      )}

      <section className="section">
        <div className="section-head"><h2 className="section-title">Пробегитесь взглядом</h2></div>
        <div className="chip-row">
          {places.map((c) => {
            const on = openPlace === c.id;
            return (
              <button key={c.id} className={`pill${on ? ' is-on' : ''}${visited.has(c.id) ? ' is-visited' : ''}`}
                aria-pressed={on}
                onClick={() => {
                  setOpenPlace(on ? null : c.id);
                  setVisited((v) => new Set(v).add(c.id));
                }}>
                {visited.has(c.id) && <CheckIcon size={16} />} {c.place}
              </button>
            );
          })}
        </div>
        {openPlace && (
          <div className="card list mt-8">
            {state.items.filter((it) => it.category === openPlace).map((it) => {
              const label = stockLabel(it, today, plan.next);
              return (
                <div className="row" key={it.id}>
                  <Avatar name={it.name} category={it.category} />
                  <span className="row-main">
                    <span className="row-title">{it.name}</span>
                    <span className={`row-sub tone-text-${label.tone}`}>{label.text}</span>
                  </span>
                  {inPlan.has(it.id)
                    ? <span className="row-done accent-text">В заказе</span>
                    : (
                      <button className="icon-btn icon-btn-accent" aria-label={`Добавить «${it.name}»`}
                        onClick={() => { update((s) => forceAdd(s, it.id)); haptic.tap(); }}>
                        <PlusIcon size={20} />
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        )}
        {!openPlace && <p className="section-foot">Нажмите на место в доме — покажем, что там обычно лежит.</p>}
      </section>

      <Summary title={`Заказ на ${formatDate(plan.next)}:`} lines={plan.lines} receipt={receipt} onReceipt={setReceipt} />
      <MainButton text="Заказ оформлен" disabled={!plan.lines.length} onClick={submit} />
    </div>
  );
}

function ExtraCheckout() {
  const { state, plan, today, update } = useApp();
  const nav = useNav();
  const [receipt, setReceipt] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const l of plan.lines) {
      if (l.reason === 'out' || l.reason === 'soon') init[l.item.id] = extraQty(l.item, today, plan.following);
    }
    return init;
  });

  const byId = useMemo(() => new Map(state.items.map((it) => [it.id, it])), [state.items]);
  const lines: Line[] = Object.entries(selected)
    .map(([id, qty]) => ({ item: byId.get(id)!, qty }))
    .filter((l) => l.item);
  const others: PlanLine[] = plan.lines.filter((l) => !(l.item.id in selected));
  const fee = state.settings.deliveryFee;

  const submit = () => {
    update((s) => placeOrder(s, {
      kind: 'extra',
      day: today,
      lines: lines.map((l) => ({ itemId: l.item.id, qty: l.qty })),
      actualTotal: Number(receipt) || undefined,
    }).state);
    haptic.success();
    nav.home('order');
    nav.toast('Дозаказ записан — плановый заказ пересчитан');
  };

  return (
    <div className="screen">
      <ScreenHeader subtitle={fee > 0 ? `Доставка ${formatRub(fee)}` : 'Дозаказ'} title="Дозаказ" />
      <p className="lead">
        Раз уж платите за доставку, возьмите сразу всё, чего не хватит до заказа {formatDate(plan.next)} ({inDays(diffDays(plan.next, today))}).
        Тогда в плановом заказе этого уже не будет.
      </p>

      <Section title={`В дозаказе · ${lines.length}`}>
        {lines.map((l) => (
          <div className="row" key={l.item.id}>
            <Avatar name={l.item.name} category={l.item.category} />
            <span className="row-main">
              <span className="row-title">{l.item.name}</span>
              <span className="row-sub">{l.item.price ? formatRub(l.item.price * l.qty) : untilText(l.item, today)}</span>
            </span>
            <Stepper label={`Количество: ${l.item.name}`} value={l.qty} min={0} onChange={(v) => setSelected((x) => {
              const copy = { ...x };
              if (v <= 0) delete copy[l.item.id];
              else copy[l.item.id] = v;
              return copy;
            })} />
          </div>
        ))}
        {lines.length === 0 && <p className="row hint">Добавьте товары из списка ниже.</p>}
      </Section>

      {others.length > 0 && (
        <Section title={`Заодно из заказа на ${formatDate(plan.next)}`} footer="Возьмёте сейчас — не понадобятся в плановом заказе.">
          {others.map((l) => (
            <div className="row" key={l.item.id}>
              <Avatar name={l.item.name} category={l.item.category} />
              <span className="row-main">
                <span className="row-title">{l.item.name}</span>
                <span className="row-sub">{untilText(l.item, today)}</span>
              </span>
              <button className="icon-btn icon-btn-accent" aria-label={`Добавить «${l.item.name}» в дозаказ`}
                onClick={() => { setSelected((x) => ({ ...x, [l.item.id]: extraQty(l.item, today, plan.following) })); haptic.tap(); }}>
                <PlusIcon size={20} />
              </button>
            </div>
          ))}
        </Section>
      )}

      <Summary title="Дозаказ:" lines={lines} receipt={receipt} onReceipt={setReceipt} />
      <MainButton text="Дозаказ оформлен" disabled={!lines.length} onClick={submit} />
    </div>
  );
}
