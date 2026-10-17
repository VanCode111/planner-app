import { useState } from 'react';
import { remindersAvailable } from '../api';
import { initialState, parseState, updateSettings } from '../model/actions';
import { demoState } from '../model/demo';
import { useNav } from '../nav';
import { useApp } from '../state';
import { confirmDialog, copyText, haptic, requestWriteAccess } from '../telegram/webapp';
import { ScreenHeader, Section } from '../ui/kit';
import { OrderSettingsForm } from './OrderSettingsForm';

export function SettingsScreen() {
  const { state, today, update, replace } = useApp();
  const nav = useNav();
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');

  const toggleReminders = async (on: boolean) => {
    if (on && !(await requestWriteAccess())) {
      nav.toast('Без разрешения писать бот не сможет напомнить');
      return;
    }
    update((s) => updateSettings(s, { reminders: on }, today));
  };

  return (
    <div className="screen">
      <ScreenHeader title="Настройки" />
      <OrderSettingsForm value={state.settings} onChange={(p) => update((s) => updateSettings(s, p, today))} />

      <Section title="Напоминания" footer={remindersAvailable ? undefined : 'Напоминания появятся, когда к приложению подключат бота.'}>
        <label className="kv">
          <span className="stack-2">
            <span>Написать в Telegram</span>
            <span className="hint small">накануне вечером и утром в день заказа</span>
          </span>
          <input type="checkbox" className="switch" disabled={!remindersAvailable}
            checked={state.settings.reminders && remindersAvailable} onChange={(e) => toggleReminders(e.target.checked)} />
        </label>
      </Section>

      <Section title="Данные" footer="Данные хранятся в вашем аккаунте Telegram и доступны на всех устройствах.">
        <button className="kv kv-button" onClick={async () => {
          const ok = await copyText(JSON.stringify(state));
          nav.toast(ok ? 'Данные скопированы' : 'Не получилось скопировать');
        }}>Экспортировать (скопировать JSON)</button>
        <button className="kv kv-button" aria-expanded={importing} onClick={() => setImporting((v) => !v)}>Импортировать</button>
        {importing && (
          <div className="pad stack-8">
            <textarea className="textarea" rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Вставьте скопированный JSON" aria-label="Данные для импорта" />
            <button className="btn btn-primary" onClick={async () => {
              let parsed = null;
              try {
                parsed = parseState(JSON.parse(importText));
              } catch {
                parsed = null;
              }
              if (!parsed) {
                nav.toast('Не похоже на данные Кладовки');
                return;
              }
              if (!(await confirmDialog('Заменить текущие данные импортированными?'))) return;
              replace(parsed);
              haptic.success();
              nav.home('order');
              nav.toast('Данные загружены');
            }}>Загрузить</button>
          </div>
        )}
        <button className="kv kv-button" onClick={async () => {
          if (!(await confirmDialog('Заменить ваши данные примером? Текущие товары и заказы удалятся.'))) return;
          replace(demoState(today));
          nav.home('order');
        }}>Загрузить пример</button>
        <button className="kv kv-button danger-text" onClick={async () => {
          if (!(await confirmDialog('Удалить все товары, заказы и настройки?'))) return;
          replace(initialState(today));
          nav.home('order');
        }}>Удалить все данные</button>
      </Section>
    </div>
  );
}
