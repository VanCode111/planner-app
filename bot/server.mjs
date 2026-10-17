/**
 * Бот Кладовки: кнопка открытия Mini App и напоминания о дне заказа.
 * Без зависимостей, Node.js 18+.
 *
 *   BOT_TOKEN=123:abc WEBAPP_URL=https://you.github.io/planner-app/ node bot/server.mjs
 *
 * Mini App отправляет на POST /api/reminders свои настройки и подписанный initData,
 * сервер хранит их в JSON-файле и раз в минуту проверяет, кому пора написать.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { validateInitData } from './initData.mjs';
import { dueReminder, reminderText } from './schedule.mjs';

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const PORT = Number(process.env.PORT || 8080);
const DATA_FILE = process.env.DATA_FILE || fileURLToPath(new URL('./data.json', import.meta.url));

if (!TOKEN || !WEBAPP_URL) {
  console.error('Укажите переменные окружения BOT_TOKEN и WEBAPP_URL');
  process.exit(1);
}

const openButton = { inline_keyboard: [[{ text: 'Открыть Кладовку', web_app: { url: WEBAPP_URL } }]] };

async function tg(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) {
    const err = new Error(`${method}: ${json.description}`);
    err.code = json.error_code;
    throw err;
  }
  return json.result;
}

// ── Хранилище ────────────────────────────────────────────────────────────────

const db = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : { users: {} };

function persist() {
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DATA_FILE);
}

// ── HTTP API для Mini App ────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function send(res, status, body) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

async function handleReminders(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { error: 'bad json' });
  }
  const user = validateInitData(body.initData, TOKEN);
  if (!user) return send(res, 401, { error: 'bad initData' });

  const orderWeekday = int(body.orderWeekday, 0, 6);
  const periodWeeks = int(body.periodWeeks, 1, 2);
  const tzOffset = int(body.tzOffset, -840, 840);
  const nextOrder = typeof body.nextOrder === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.nextOrder) ? body.nextOrder : null;
  if (orderWeekday === null || periodWeeks === null || tzOffset === null || !nextOrder) {
    return send(res, 400, { error: 'bad fields' });
  }

  const prev = db.users[user.id];
  db.users[user.id] = {
    chatId: user.id,
    enabled: body.enabled === true,
    orderWeekday,
    periodWeeks,
    nextOrder,
    tzOffset,
    count: int(body.count, 0, 10_000) ?? 0,
    total: int(body.total, 0, 10_000_000) ?? 0,
    sent: prev?.sent ?? {},
    updatedAt: new Date().toISOString(),
  };
  persist();
  send(res, 200, { ok: true });
}

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method === 'POST' && req.url === '/api/reminders') {
    return handleReminders(req, res).catch((e) => {
      console.error(e);
      send(res, 500, { error: 'internal' });
    });
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`API: http://localhost:${PORT}`));

// ── Напоминания ──────────────────────────────────────────────────────────────

async function tick() {
  const now = Date.now();
  let changed = false;
  for (const user of Object.values(db.users)) {
    const due = dueReminder(user, now);
    if (!due) continue;
    try {
      await tg('sendMessage', { chat_id: user.chatId, text: reminderText(user, due.kind), reply_markup: openButton });
    } catch (e) {
      console.error(`напоминание ${user.chatId}:`, e.message);
      // 403 — пользователь заблокировал бота: больше не пишем.
      if (e.code === 403) user.enabled = false;
    }
    user.sent = { ...user.sent, [due.kind]: due.day };
    changed = true;
  }
  if (changed) persist();
}

setInterval(() => tick().catch(console.error), 60_000);

// ── Сообщения боту ───────────────────────────────────────────────────────────

const WELCOME = [
  'Привет! Кладовка помогает заказывать продукты и товары для дома раз в неделю и ничего не забывать.',
  '',
  '• Сама собирает список к дню заказа — всё, чего не хватит до следующего.',
  '• «Заканчивается» — добавить товар за 5 секунд.',
  '• Подсказывает, как дотянуть до бесплатной доставки, и считает траты.',
].join('\n');

async function onMessage(msg) {
  if (!msg?.text) return;
  const text = msg.text.startsWith('/start')
    ? WELCOME
    : 'Списки и запасы — в приложении. Нажмите кнопку ниже.';
  await tg('sendMessage', { chat_id: msg.chat.id, text, reply_markup: openButton });
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        await onMessage(u.message).catch((e) => console.error(e.message));
      }
    } catch (e) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Кладовка', web_app: { url: WEBAPP_URL } } })
  .catch((e) => console.error(e.message));
await tg('setMyCommands', { commands: [{ command: 'start', description: 'Открыть Кладовку' }] })
  .catch((e) => console.error(e.message));
console.log('Бот запущен');
poll();
