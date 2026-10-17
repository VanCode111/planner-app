/**
 * Одно напоминание о дне заказа — без сервера, для запуска по расписанию из GitHub Actions
 * (.github/workflows/reminders.yml). Подходит, когда приложением пользуетесь вы сами.
 *
 *   BOT_TOKEN=123:abc CHAT_ID=42 ORDER_DAY=2026-10-24 KIND=evening node bot/remind.mjs
 *
 * ORDER_DAY    — любой из ваших дней заказа (YYYY-MM-DD), от него считается расписание
 * PERIOD_WEEKS — 1 (каждую неделю) или 2
 * TZ_OFFSET    — смещение часового пояса в минутах, Москва — 180
 * KIND         — evening (накануне) или morning (в день заказа)
 * FORCE=true   — отправить, даже если сегодня не день напоминания (для проверки)
 */
import { isReminderDay, reminderText } from './schedule.mjs';

const env = process.env;
const kind = env.KIND === 'evening' ? 'evening' : 'morning';
const user = {
  nextOrder: env.ORDER_DAY,
  periodWeeks: Number(env.PERIOD_WEEKS || 1),
  tzOffset: Number(env.TZ_OFFSET || 180),
  count: 0,
};

if (!env.BOT_TOKEN || !env.CHAT_ID || !/^\d{4}-\d{2}-\d{2}$/.test(user.nextOrder ?? '')) {
  console.error('Нужны BOT_TOKEN, CHAT_ID и ORDER_DAY (YYYY-MM-DD)');
  process.exit(1);
}

if (env.FORCE !== 'true' && !isReminderDay(user, kind, Date.now())) {
  console.log(`Сегодня напоминание «${kind}» не нужно`);
  process.exit(0);
}

const body = { chat_id: env.CHAT_ID, text: reminderText(user, kind) };
if (env.WEBAPP_URL) {
  body.reply_markup = { inline_keyboard: [[{ text: 'Открыть Кладовку', web_app: { url: env.WEBAPP_URL } }]] };
}

const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const json = await res.json();
if (!json.ok) {
  console.error(`Telegram: ${json.description}`);
  process.exit(1);
}
console.log(`Отправлено: ${kind}`);
