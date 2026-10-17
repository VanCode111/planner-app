import { useState } from 'react';
import { plural } from '../lib/dates';
import { completeOnboarding, updateSettings } from '../model/actions';
import { CATEGORIES, TEMPLATES } from '../model/catalog';
import { demoState } from '../model/demo';
import type { Settings } from '../model/types';
import { useApp } from '../state';
import { MainButton } from '../telegram/MainButton';
import { haptic } from '../telegram/webapp';
import { CheckIcon, ChevronLeft } from '../ui/icons';
import { OrderSettingsForm } from './OrderSettingsForm';

const POINTS = [
  { title: 'Список собирается сам', text: 'Приложение знает, на сколько хватает каждого товара, и к дню заказа кладёт всё, чего не хватит до следующего.' },
  { title: 'Меньше дозаказов', text: 'Заметили, что кончается, — добавьте за 5 секунд. Перед заказом спросим о том, что часто забывают.' },
  { title: 'Дешевле доставка', text: 'Подскажем, что взять впрок, чтобы дотянуть до бесплатной доставки, и посчитаем, сколько сэкономили.' },
];

export function Onboarding() {
  const { state, today, update, replace } = useApp();
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Settings>(state.settings);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (step === 0) {
    return (
      <div className="screen onboarding">
        <div className="logo" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><rect x="14" y="12" width="36" height="40" rx="4" /><path d="M14 32h36M21 32v-8h8v8M35 32V22h8v10M21 52v-9h11v9" /></svg>
        </div>
        <h1 className="hero-title">Кладовка</h1>
        <p className="lead">Планировщик закупок для дома: заказывайте раз в неделю и ничего не забывайте.</p>
        <div className="stack-16 px-20 mt-12">
          {POINTS.map((p, i) => (
            <div className="point" key={p.title}>
              <span className="point-num">{i + 1}</span>
              <span className="stack-2">
                <b>{p.title}</b>
                <span className="body-text">{p.text}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="px-16 mt-20">
          <button className="btn btn-surface btn-block" onClick={() => replace(demoState(today))}>Посмотреть на примере</button>
        </div>
        <MainButton text="Настроить под себя" onClick={() => setStep(1)} />
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="screen">
        <header className="screen-header">
          <Progress step={1} />
          <h1 className="screen-title">Когда удобно заказывать?</h1>
        </header>
        <p className="lead">Соберём к этому дню всё, чего не хватит до следующего заказа.</p>
        <OrderSettingsForm value={settings} onChange={(p) => setSettings((s) => updateSettings({ ...state, settings: s }, p, today).settings)} />
        <MainButton text="Дальше — что вы покупаете" onClick={() => setStep(2)} />
      </div>
    );
  }

  const toggle = (name: string) => {
    haptic.select();
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-link" onClick={() => setStep(1)}><ChevronLeft size={20} /> Назад</button>
        <Progress step={2} />
        <h1 className="screen-title">Что вы обычно покупаете?</h1>
      </header>
      <p className="lead">Отметьте товары — расход для них уже примерно известен и уточнится сам. Остальное добавите потом.</p>
      {CATEGORIES.map((c) => {
        const list = TEMPLATES.filter((t) => t.category === c.id);
        if (!list.length) return null;
        return (
          <section className="section" key={c.id}>
            <div className="section-head"><h2 className="section-title">{c.title}</h2></div>
            <div className="chip-row">
              {list.map((t) => {
                const on = picked.has(t.name);
                return (
                  <button key={t.name} aria-pressed={on} className={`pill${on ? ' is-on' : ''}`} onClick={() => toggle(t.name)}>
                    {on && <CheckIcon size={16} />} {t.name}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <MainButton
        text={picked.size ? `Готово · ${picked.size} ${plural(picked.size, ['товар', 'товара', 'товаров'])}` : 'Пропустить'}
        onClick={() => update((s) => completeOnboarding({ ...s, settings }, TEMPLATES.filter((t) => picked.has(t.name)), today))}
      />
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="progress-dots" aria-label={`Шаг ${step} из 2`}>
      <span className={step >= 1 ? 'is-on' : ''} />
      <span className={step >= 2 ? 'is-on' : ''} />
    </div>
  );
}
