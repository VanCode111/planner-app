import type { ReactNode } from 'react';
import { initial } from '../lib/format';
import type { CategoryId } from '../model/types';
import { useNav, type Tab } from '../nav';
import { supports } from '../telegram/webapp';
import { ChevronLeft, CloseIcon, SlidersIcon } from './icons';

const nativeBack = supports('6.1');

export function Avatar({ name, category, size = 40 }: { name: string; category: CategoryId; size?: number }) {
  return (
    <div className={`avatar cat-${category}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.43) }} aria-hidden="true">
      {initial(name)}
    </div>
  );
}

export function Section({ title, aside, children, footer }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="section">
      {(title || aside) && (
        <div className="section-head">
          <h2 className="section-title">{title}</h2>
          {aside && <span className="section-aside">{aside}</span>}
        </div>
      )}
      <div className="card list">{children}</div>
      {footer && <p className="section-foot">{footer}</p>}
    </section>
  );
}

export function Bar({ value, tone = 'ok', thick }: { value: number; tone?: 'ok' | 'warn' | 'out'; thick?: boolean }) {
  return (
    <div className={`bar${thick ? ' bar-thick' : ''}`}>
      <div className={`bar-fill tone-${tone}`} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button aria-label="Меньше" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span>{value}</span>
      <button aria-label="Больше" onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

/** Переключатель вкладок + кнопка настроек — шапка основных экранов. */
export function TopBar({ tab }: { tab: Tab }) {
  const nav = useNav();
  return (
    <div className="topbar">
      <Segmented<Tab>
        label="Раздел"
        value={tab}
        onChange={nav.setTab}
        options={[
          { value: 'order', label: 'Заказ' },
          { value: 'stock', label: 'Запасы' },
          { value: 'stats', label: 'Траты' },
        ]}
      />
      <button className="icon-btn" aria-label="Настройки" onClick={() => nav.push({ name: 'settings' })}>
        <SlidersIcon />
      </button>
    </div>
  );
}

/** Заголовок вложенного экрана. В Telegram «назад» — нативная кнопка в шапке. */
export function ScreenHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  const nav = useNav();
  return (
    <header className="screen-header">
      {!nativeBack && (
        <button className="back-link" onClick={nav.back}><ChevronLeft size={20} /> Назад</button>
      )}
      {subtitle && <div className="eyebrow">{subtitle}</div>}
      <h1 className="screen-title">{title}</h1>
    </header>
  );
}

export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button className="icon-btn icon-btn-round" aria-label="Закрыть" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      <p className="empty-text">{text}</p>
      {action}
    </div>
  );
}
