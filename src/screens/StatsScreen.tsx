import { useState } from 'react';
import { formatDate, MONTHS_NOM, plural } from '../lib/dates';
import { formatRub } from '../lib/format';
import type { Order, OrderKind } from '../model/types';
import { useApp } from '../state';
import { CheckIcon, ChevronLeft, ChevronRight } from '../ui/icons';
import { Empty, Section, TopBar } from '../ui/kit';

const KIND: Record<OrderKind, { label: string; cls: string }> = {
  planned: { label: 'плановый', cls: 'badge-accent' },
  extra: { label: 'дозаказ', cls: 'badge-warn' },
  shop: { label: 'в магазине', cls: 'badge-neutral' },
};

/** Ключ месяца «2026-10» со сдвигом от текущего. */
function monthKey(today: string, offset: number): string {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
}

function summarize(orders: Order[]) {
  const delivery = orders.filter((o) => o.kind !== 'shop');
  return {
    spent: orders.reduce((s, o) => s + o.total + o.deliveryFee, 0),
    fees: orders.reduce((s, o) => s + o.deliveryFee, 0),
    paid: delivery.filter((o) => o.deliveryFee > 0).length,
    deliveries: delivery.length,
    extra: orders.filter((o) => o.kind === 'extra').length,
  };
}

export function StatsScreen() {
  const { state, today } = useApp();
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const key = monthKey(today, offset);
  const prevKey = monthKey(today, offset - 1);
  const orders = state.orders.filter((o) => o.day.startsWith(key));
  const cur = summarize(orders);
  const prev = summarize(state.orders.filter((o) => o.day.startsWith(prevKey)));
  const saved = state.savings.filter((s) => s.day.startsWith(key));
  const savedSum = saved.reduce((s, x) => s + x.amount, 0);
  const [y, m] = key.split('-').map(Number);
  const title = `${MONTHS_NOM[m - 1]}${y !== Number(today.slice(0, 4)) ? ` ${y}` : ''}`;
  const hasOlder = state.orders.some((o) => o.day < `${key}-01`);

  return (
    <div className="screen">
      <TopBar tab="stats" />
      <div className="month-nav">
        <h1 className="screen-title">{title}</h1>
        <div className="row-actions">
          <button className="icon-btn icon-btn-plain" aria-label="Предыдущий месяц" disabled={!hasOlder} onClick={() => setOffset((o) => o - 1)}><ChevronLeft /></button>
          <button className="icon-btn icon-btn-plain" aria-label="Следующий месяц" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}><ChevronRight /></button>
        </div>
      </div>

      {orders.length === 0 ? (
        <Empty title="Заказов нет" text="Здесь появятся траты, доставка и дозаказы, когда вы отметите первый заказ." />
      ) : (
        <>
          <div className="card pad stack-4 mt-8">
            <div className="hint">Потрачено на продукты и дом</div>
            <div className="hero-number">{formatRub(cur.spent)}</div>
            <div className="body-text">
              {orders.length} {plural(orders.length, ['заказ', 'заказа', 'заказов'])} · в среднем {formatRub(cur.spent / orders.length)}
            </div>
          </div>

          <div className="grid-2 px-16 mt-8">
            <div className="card pad stack-4 tile">
              <div className="hint">За доставку</div>
              <div className="tile-number">{formatRub(cur.fees)}</div>
              <div className="small">{cur.paid} {plural(cur.paid, ['платная', 'платные', 'платных'])} из {cur.deliveries}</div>
            </div>
            <div className="card pad stack-4 tile">
              <div className="hint">Дозаказов</div>
              <div className="tile-number">{cur.extra}</div>
              <div className="small">в прошлом месяце — {prev.extra}</div>
            </div>
          </div>

          {savedSum > 0 && (
            <div className="card pad ok-card mt-8">
              <CheckIcon className="ok-icon" />
              <p><b>Не потратили {formatRub(savedSum)} на доставку.</b> {saved.length} {plural(saved.length, ['раз', 'раза', 'раз'])} выбрали «подождёт» вместо отдельного дозаказа.</p>
            </div>
          )}

          <Section title="Заказы">
            {orders.map((o) => (
              <div key={o.id}>
                <button className="row" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>
                  <span className="row-main">
                    <span className="row-title-line">
                      <span className="row-title">{formatDate(o.day)}</span>
                      <span className={`badge ${KIND[o.kind].cls}`}>{KIND[o.kind].label}</span>
                    </span>
                    <span className="row-sub">{o.lines.length} {plural(o.lines.length, ['товар', 'товара', 'товаров'])}</span>
                  </span>
                  <span className="row-end">
                    <span className="row-price">{formatRub(o.total)}</span>
                    {o.kind !== 'shop' && (
                      <span className={`row-sub${o.deliveryFee ? ' tone-text-warn' : ''}`}>доставка {formatRub(o.deliveryFee)}</span>
                    )}
                  </span>
                </button>
                {open === o.id && (
                  <ul className="order-lines">
                    {o.lines.map((l) => <li key={l.itemId}><span>{l.name}{l.qty > 1 ? ` ×${l.qty}` : ''}</span><span>{formatRub(l.price * l.qty)}</span></li>)}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
