import { WEEKDAYS_SHORT } from '../lib/dates';
import type { Settings } from '../model/types';
import { haptic } from '../telegram/webapp';
import { Segmented } from '../ui/kit';

type Patch = Partial<Pick<Settings, 'orderWeekday' | 'periodWeeks' | 'deliveryFee' | 'freeDeliveryFrom'>>;

const digits = (v: string) => Number(v.replace(/\D/g, '')) || 0;

/** День и частота заказа, стоимость доставки — общая часть онбординга и настроек. */
export function OrderSettingsForm({ value, onChange }: { value: Settings; onChange: (patch: Patch) => void }) {
  return (
    <>
      <section className="section">
        <div className="section-head"><h2 className="section-title">День заказа</h2></div>
        <div className="weekdays px-16" role="radiogroup" aria-label="День заказа">
          {WEEKDAYS_SHORT.map((label, i) => (
            <button key={label} role="radio" aria-checked={value.orderWeekday === i}
              className={value.orderWeekday === i ? 'is-on' : ''}
              onClick={() => { haptic.select(); onChange({ orderWeekday: i }); }}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="section-title">Как часто</h2></div>
        <div className="px-16">
          <Segmented<1 | 2>
            label="Как часто"
            value={value.periodWeeks}
            onChange={(periodWeeks) => onChange({ periodWeeks })}
            options={[{ value: 1, label: 'Каждую неделю' }, { value: 2, label: 'Раз в 2 недели' }]}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="section-title">Доставка в вашем магазине</h2></div>
        <div className="card list">
          <label className="kv">
            <span>Стоимость доставки</span>
            <span className="kv-input">
              <input inputMode="numeric" value={value.deliveryFee || ''} placeholder="0" aria-label="Стоимость доставки"
                onChange={(e) => onChange({ deliveryFee: digits(e.target.value) })} />
              ₽
            </span>
          </label>
          <label className="kv">
            <span>Бесплатно от</span>
            <span className="kv-input">
              <input inputMode="numeric" value={value.freeDeliveryFrom || ''} placeholder="нет" aria-label="Бесплатная доставка от"
                onChange={(e) => onChange({ freeDeliveryFrom: digits(e.target.value) })} />
              ₽
            </span>
          </label>
        </div>
        <p className="section-foot">Подскажем, когда выгоднее добрать корзину, чем платить за доставку.</p>
      </section>
    </>
  );
}
