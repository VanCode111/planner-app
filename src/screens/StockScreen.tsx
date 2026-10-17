import { useState } from 'react';
import { CATEGORIES } from '../model/catalog';
import { stockLevel } from '../model/forecast';
import type { CategoryId, Item } from '../model/types';
import { useNav } from '../nav';
import { useApp } from '../state';
import { PlusIcon, SearchIcon } from '../ui/icons';
import { Avatar, Bar, Empty, TopBar } from '../ui/kit';
import { stockLabel } from '../ui/status';

type Filter = 'all' | 'low' | CategoryId;

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function StockScreen() {
  const { state, plan, today } = useApp();
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const needed = new Set(plan.lines.filter((l) => !l.manual).map((l) => l.item.id));
  const q = norm(query.trim());
  const visible = state.items.filter((it) =>
    (!q || norm(it.name).includes(q))
    && (filter === 'all' || (filter === 'low' ? needed.has(it.id) : it.category === filter)));

  const byRunOut = (a: Item, b: Item) =>
    (a.runOutDay ?? '9999').localeCompare(b.runOutDay ?? '9999') || a.name.localeCompare(b.name, 'ru');
  const groups = CATEGORIES
    .map((c) => ({ ...c, items: visible.filter((it) => it.category === c.id).sort(byRunOut) }))
    .filter((g) => g.items.length);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'low', label: `До заказа не хватит · ${needed.size}` },
    ...CATEGORIES.filter((c) => state.items.some((it) => it.category === c.id)).map((c) => ({ id: c.id as Filter, label: c.title })),
  ];

  return (
    <div className="screen with-fab">
      <TopBar tab="stock" />
      {state.items.length === 0 ? (
        <Empty title="Запасов пока нет" text="Добавьте то, что обычно покупаете: продукты, бытовую химию, корм питомцу." />
      ) : (
        <>
          <label className="search search-surface mx-16">
            <SearchIcon size={20} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти в запасах" aria-label="Найти в запасах" />
          </label>
          <div className="chip-row chip-row-scroll" role="tablist" aria-label="Фильтр">
            {filters.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} className={`filter${filter === f.id ? ' is-on' : ''}`}
                onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>

          {groups.map((g) => (
            <section className="section" key={g.id}>
              <div className="section-head">
                <h2 className="section-title">{g.title}</h2>
                <span className="section-aside">{g.items.length} шт.</span>
              </div>
              <div className="card list">
                {g.items.map((it) => {
                  const label = stockLabel(it, today, plan.next);
                  const level = stockLevel(it, today);
                  return (
                    <button className="row" key={it.id} onClick={() => nav.push({ name: 'item', id: it.id })}>
                      <Avatar name={it.name} category={it.category} />
                      <span className="row-main stack-6">
                        <span className="split">
                          <span className="row-title">{it.name}</span>
                          <span className={`row-badge tone-text-${label.tone}`}>{label.text}</span>
                        </span>
                        {level === null
                          ? <span className="bar bar-unknown" />
                          : <Bar value={level} tone={label.tone === 'hint' ? 'ok' : label.tone} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {groups.length === 0 && <p className="lead">Ничего не нашлось.</p>}
        </>
      )}

      <button className="fab" onClick={() => nav.openSheet({ kind: 'quickAdd' })}>
        <PlusIcon size={20} /> Заканчивается
      </button>
    </div>
  );
}
