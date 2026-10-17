import { useState } from 'react';
import { diffDays, formatDate, plural } from '../lib/dates';
import { formatRub } from '../lib/format';
import { deleteItem, forceAdd, markItem, updateItem, type Mark } from '../model/actions';
import { CATEGORIES, categoryById } from '../model/catalog';
import { daysLeft, stockLevel } from '../model/forecast';
import type { CategoryId, Item } from '../model/types';
import { useNav } from '../nav';
import { useApp } from '../state';
import { confirmDialog, haptic } from '../telegram/webapp';
import { Avatar, Bar, ScreenHeader, Section } from '../ui/kit';

function leftLong(days: number): string {
  if (days <= 0) return 'Закончилось';
  if (days < 14) return `${days} ${plural(days, ['день', 'дня', 'дней'])}`;
  if (days < 60) {
    const w = Math.round(days / 7);
    return `≈ ${w} ${plural(w, ['неделя', 'недели', 'недель'])}`;
  }
  const m = Math.round(days / 30);
  return `≈ ${m} ${plural(m, ['месяц', 'месяца', 'месяцев'])}`;
}

function why(item: Item): string {
  const d = Math.round(item.daysPerUnit);
  const base = `Одной упаковки хватает примерно на ${d} ${plural(d, ['день', 'дня', 'дней'])}`;
  if (item.history.length >= 2) return `${base} — посчитали по покупкам и вашим отметкам.`;
  if (item.signals > 0) return `${base} — уточнили по вашим отметкам.`;
  return `${base}. Это типовое значение — оно уточнится, когда вы отметите «закончилось» или «ещё много».`;
}

const HOW_LONG = [
  { days: 7, label: '≈ неделя' },
  { days: 14, label: '≈ 2 недели' },
  { days: 30, label: '≈ месяц' },
  { days: 60, label: '≈ 2 месяца' },
];

export function ItemScreen({ id }: { id: string }) {
  const { state, plan, today, update } = useApp();
  const nav = useNav();
  const [askHowLong, setAskHowLong] = useState(false);
  const item = state.items.find((it) => it.id === id);
  if (!item) return null;

  const left = daysLeft(item, today);
  const level = stockLevel(item, today);
  const line = plan.lines.find((l) => l.item.id === id);
  const tone = left === null ? 'ok' : left <= 0 ? 'out' : left <= diffDays(plan.next, today) ? 'warn' : 'ok';
  const patch = (p: Partial<Item>) => update((s) => updateItem(s, id, p));

  const mark = (m: Mark) => {
    update((s) => markItem(s, id, m, today));
    setAskHowLong(false);
    haptic.success();
    nav.toast('Прогноз обновлён');
  };

  return (
    <div className="screen">
      <ScreenHeader title={(
        <span className="item-head">
          <Avatar name={item.name} category={item.category} size={56} />
          <span>
            <span className="item-name">{item.name}</span>
            <span className="item-meta">{categoryById(item.category).title}{item.price ? ` · ${formatRub(item.price)}` : ''}</span>
          </span>
        </span>
      )} />

      <div className="card pad stack-10 mt-8">
        <div className="split baseline">
          <div className="big-number">{left === null ? 'Нет данных' : leftLong(left)}</div>
          {item.runOutDay && left !== null && left > 0 && <div className="hint">до ~{formatDate(item.runOutDay)}</div>}
        </div>
        {level !== null ? <Bar value={level} tone={tone} thick /> : <span className="bar bar-thick bar-unknown" />}
        <p className="body-text">{why(item)}</p>
        {line
          ? <p className="body-text accent-text">В заказе на {formatDate(plan.next)} · ×{line.qty}</p>
          : (
            <button className="btn btn-accent-light" onClick={() => { update((s) => forceAdd(s, id)); haptic.tap(); nav.toast(`Добавили в заказ на ${formatDate(plan.next)}`); }}>
              Добавить в заказ на {formatDate(plan.next)}
            </button>
          )}
      </div>

      <section className="section">
        <div className="section-head"><h2 className="section-title">Как на самом деле?</h2></div>
        <div className="grid-3 px-16">
          <button className="btn btn-surface" onClick={() => mark('out')}>Закончилось</button>
          <button className="btn btn-surface" onClick={() => mark('low')}>Мало</button>
          <button className={`btn btn-surface${askHowLong ? ' is-on' : ''}`} aria-expanded={askHowLong} onClick={() => setAskHowLong((v) => !v)}>Ещё много</button>
        </div>
        {askHowLong && (
          <div className="grid-2 px-16 mt-8">
            {HOW_LONG.map((o) => <button key={o.days} className="btn btn-surface" onClick={() => mark({ days: o.days })}>{o.label}</button>)}
          </div>
        )}
        <p className="section-foot">Отметка поправит прогноз и для следующих покупок.</p>
      </section>

      <Section title="Настройки">
        <label className="kv">
          <span>Название</span>
          <span className="kv-input kv-input-wide">
            <input value={item.name} onChange={(e) => patch({ name: e.target.value })} onBlur={(e) => !e.target.value.trim() && patch({ name: 'Без названия' })} aria-label="Название" />
          </span>
        </label>
        <label className="kv">
          <span>Категория</span>
          <select className="kv-select" value={item.category} onChange={(e) => patch({ category: e.target.value as CategoryId })}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className="kv">
          <span>Цена за упаковку</span>
          <span className="kv-input">
            <input inputMode="numeric" value={item.price || ''} placeholder="0" aria-label="Цена"
              onChange={(e) => patch({ price: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            ₽
          </span>
        </label>
        <label className="kv">
          <span>Упаковки хватает на</span>
          <span className="kv-input">
            <input inputMode="numeric" value={Math.round(item.daysPerUnit)} aria-label="Дней на упаковку"
              onChange={(e) => patch({ daysPerUnit: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} />
            дн.
          </span>
        </label>
        <label className="kv">
          <span className="stack-2">
            <span>Быстро портится</span>
            <span className="hint small">не предлагать впрок</span>
          </span>
          <input type="checkbox" className="switch" checked={item.perishable} onChange={(e) => patch({ perishable: e.target.checked })} />
        </label>
      </Section>

      {item.history.length > 0 && (
        <Section title="История покупок">
          {item.history.map((p, i) => {
            const prev = item.history[i + 1];
            const gap = prev ? diffDays(p.day, prev.day) : null;
            return (
              <div className="kv" key={`${p.day}-${i}`}>
                <span className="stack-2">
                  <span>{formatDate(p.day)}{p.qty > 1 ? ` · ${p.qty} шт.` : ''}</span>
                  <span className="hint small">{gap === null ? 'первая покупка в истории' : `через ${gap} ${plural(gap, ['день', 'дня', 'дней'])} после прошлой`}</span>
                </span>
                <b>{formatRub(p.price * p.qty)}</b>
              </div>
            );
          })}
        </Section>
      )}

      <div className="px-16 mt-20">
        <button className="btn btn-surface danger-text btn-block" onClick={async () => {
          if (!(await confirmDialog(`Удалить «${item.name}»? История покупок тоже удалится.`))) return;
          update((s) => deleteItem(s, id));
          nav.back();
          nav.toast('Товар удалён');
        }}>Удалить товар</button>
      </div>
    </div>
  );
}
