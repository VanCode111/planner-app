import { addDays, daysWord, diffDays, everyWeekday, formatDate, formatDateShort, formatDayLong, inDays, onWeekday, plural, weekday } from '../lib/dates';
import { formatRub } from '../lib/format';
import { ackUrgent, confirmHave, forceAdd } from '../model/actions';
import type { PlanLine } from '../model/forecast';
import type { Item } from '../model/types';
import { useNav } from '../nav';
import { useApp } from '../state';
import { MainButton } from '../telegram/MainButton';
import { haptic } from '../telegram/webapp';
import { ClockIcon, PlusIcon } from '../ui/icons';
import { Avatar, Bar, Empty, Section, TopBar } from '../ui/kit';
import { untilText } from '../ui/status';

export function OrderScreen() {
  const { state, plan, today } = useApp();
  const nav = useNav();
  const s = state.settings;
  const toNext = diffDays(plan.next, today);
  const auto = plan.lines.filter((l) => !l.manual);
  const manual = plan.lines.filter((l) => l.manual);

  if (state.items.length === 0) {
    return (
      <div className="screen">
        <TopBar tab="order" />
        <Empty
          title="Пока пусто"
          text="Добавьте товары, которые вы обычно покупаете, — и к каждому заказу список будет собираться сам."
          action={<button className="btn btn-primary" onClick={() => nav.openSheet({ kind: 'quickAdd', mode: 'add' })}>Добавить товар</button>}
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar tab="order" />

      <header className="hero">
        <div className="eyebrow">{toNext === 0 ? 'Заказ сегодня' : 'Следующий заказ'}</div>
        <h1 className="hero-title">{formatDayLong(plan.next)}</h1>
        <div className="chips">
          <span className="chip chip-accent">{inDays(toNext)}</span>
          <span className="chip">{s.periodWeeks === 1 ? everyWeekday(s.orderWeekday) : `раз в 2 недели, ${onWeekday(s.orderWeekday)}`}</span>
        </div>
      </header>

      {plan.lines.length > 0 && s.freeDeliveryFrom > 0 && <ThresholdCard />}
      {plan.urgent.length > 0 && <UrgentCard items={plan.urgent} />}

      <Section
        title={`Нужно купить · ${auto.length}`}
        aside={`не хватит до ${formatDateShort(plan.following)}`}
        footer={auto.length === 0 ? 'По прогнозу до следующего заказа всего хватает.' : undefined}
      >
        {auto.map((l) => <LineRow key={l.item.id} line={l} />)}
        <button className="row row-action" onClick={() => nav.openSheet({ kind: 'quickAdd' })}>
          <span className="row-action-icon"><PlusIcon size={20} /></span>
          <span>Что-то заканчивается</span>
        </button>
      </Section>

      {manual.length > 0 && (
        <Section title={`Добавлено вручную · ${manual.length}`}>
          {manual.map((l) => <LineRow key={l.item.id} line={l} />)}
        </Section>
      )}

      {plan.unknown.length > 0 && <UnknownSection items={plan.unknown} />}

      {plan.suggestions.length > 0 && (
        <Section title="Можно взять впрок" aside="понадобится скоро">
          {plan.suggestions.map((l, i) => (
            <SuggestionRow key={l.item.id} line={l} closesGap={i === 0 && plan.missingForFree > 0 && l.item.price * l.qty >= plan.missingForFree} />
          ))}
        </Section>
      )}

      <MainButton
        text={plan.lines.length ? `Оформить заказ · ${formatRub(plan.total)}` : 'Список пуст'}
        disabled={!plan.lines.length}
        onClick={() => nav.push({ name: 'checkout', kind: 'planned' })}
      />
    </div>
  );
}

function ThresholdCard() {
  const { state, plan } = useApp();
  const s = state.settings;
  const done = plan.missingForFree === 0;
  return (
    <div className="card pad stack-10">
      <div className="split baseline">
        <div className="big-number">{formatRub(plan.total)}</div>
        <div className="hint">из {formatRub(s.freeDeliveryFrom)}</div>
      </div>
      <Bar value={plan.total / s.freeDeliveryFrom} thick />
      <p className="body-text">
        {done
          ? <>Доставка бесплатная.</>
          : <>До бесплатной доставки <b>{formatRub(plan.missingForFree)}</b>. Добавьте то, что всё равно скоро понадобится, — вместо {formatRub(s.deliveryFee)} за доставку.</>}
      </p>
    </div>
  );
}

function UrgentCard({ items }: { items: Item[] }) {
  const { state, plan, today, update } = useApp();
  const nav = useNav();
  const first = items[0];
  const more = items.length - 1;
  const fee = state.settings.deliveryFee;
  const left = first.runOutDay ? diffDays(first.runOutDay, today) : 0;
  const when = left <= 0 ? 'уже нет' : left === 1 ? 'хватит до завтра' : `хватит на ${left} ${daysWord(left)}`;

  const wait = () => {
    update((s) => ackUrgent(s, items.map((i) => i.id), plan.next, today));
    haptic.success();
    nav.toast(fee > 0 ? `Ждём ${formatDate(plan.next)} — минус ${formatRub(fee)} за доставку` : `Ждём ${formatDate(plan.next)}`);
  };

  return (
    <div className="card pad warn-card stack-12">
      <div className="warn-head">
        <ClockIcon className="warn-icon" />
        <p>
          <b>{first.name}</b> — {when}, а заказ {onWeekday(weekday(plan.next))}.
          {more > 0 && <> И ещё {more} {plural(more, ['товар', 'товара', 'товаров'])} не дотянут до заказа.</>}
          {' '}Подождёте или нужен дозаказ?
        </p>
      </div>
      <div className="grid-2">
        <button className="btn btn-warn-light" onClick={wait}>Подождёт</button>
        <button className="btn btn-warn" onClick={() => nav.push({ name: 'checkout', kind: 'extra' })}>
          {fee > 0 ? `Дозаказ +${formatRub(fee)}` : 'Дозаказ'}
        </button>
      </div>
    </div>
  );
}

function LineRow({ line }: { line: PlanLine }) {
  const { today } = useApp();
  const nav = useNav();
  const { item, qty, reason } = line;
  const warn = reason === 'out' || reason === 'soon';
  const note = line.manual && !item.runOutDay ? 'добавлено вручную' : untilText(item, today);
  return (
    <button className="row" onClick={() => nav.openSheet({ kind: 'line', itemId: item.id })}>
      <Avatar name={item.name} category={item.category} />
      <span className="row-main">
        <span className="row-title">{item.name}</span>
        <span className={`row-sub${warn ? ' tone-text-warn' : ''}`}>{note}</span>
      </span>
      <span className="row-end">
        <span className="row-price">{item.price ? formatRub(item.price * qty) : '—'}</span>
        <span className="row-sub">×{qty}</span>
      </span>
    </button>
  );
}

function SuggestionRow({ line, closesGap }: { line: PlanLine; closesGap: boolean }) {
  const { today, update } = useApp();
  const nav = useNav();
  const { item } = line;
  const left = item.runOutDay ? diffDays(item.runOutDay, today) : 0;
  return (
    <div className="row">
      <Avatar name={item.name} category={item.category} />
      <button className="row-main row-link" onClick={() => nav.push({ name: 'item', id: item.id })}>
        <span className="row-title">{item.name}</span>
        <span className="row-sub">
          {item.price ? `${formatRub(item.price * line.qty)} · ` : ''}
          {closesGap ? 'закроет порог доставки' : `закончится ${inDays(left)}`}
        </span>
      </button>
      <button
        className="icon-btn icon-btn-accent"
        aria-label={`Добавить «${item.name}» в заказ`}
        onClick={() => {
          update((s) => forceAdd(s, item.id));
          haptic.tap();
        }}
      >
        <PlusIcon size={20} />
      </button>
    </div>
  );
}

function UnknownSection({ items }: { items: Item[] }) {
  const { plan, today, update } = useApp();
  const until = addDays(plan.following, 1);
  return (
    <Section
      title="Проверьте наличие"
      aside={`${items.length} ${plural(items.length, ['товар', 'товара', 'товаров'])}`}
      footer="Мы ещё не знаем, сколько их осталось. Ответ поможет прогнозу."
    >
      {items.map((item) => (
        <div className="row" key={item.id}>
          <Avatar name={item.name} category={item.category} />
          <span className="row-main">
            <span className="row-title">{item.name}</span>
          </span>
          <span className="row-actions">
            <button className="btn btn-small btn-ghost" onClick={() => update((s) => confirmHave(s, item.id, today, until))}>Есть</button>
            <button className="btn btn-small btn-accent-light" onClick={() => update((s) => forceAdd(s, item.id))}>Купить</button>
          </span>
        </div>
      ))}
      {items.length > 2 && (
        <button className="row row-action" onClick={() => update((s) => items.reduce((acc, it) => confirmHave(acc, it.id, today, until), s))}>
          <span>Всё остальное есть</span>
        </button>
      )}
    </Section>
  );
}
