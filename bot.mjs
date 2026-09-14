import { readFile } from 'node:fs/promises';

const env = {};
try {
  const text = await readFile(new URL('./.env', import.meta.url), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch {
  // The explicit error below is more useful than a silent bot failure.
}

const token = env.TELEGRAM_BOT_TOKEN;
const webAppUrl = env.TELEGRAM_WEBAPP_URL || 'http://127.0.0.1:5173';
const botUsername = (env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').toLowerCase();

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is missing. Add it to .env and run npm run bot again.');
  process.exit(1);
}

const api = `https://api.telegram.org/bot${token}`;
let offset = 0;

async function telegram(method, body) {
  const response = await fetch(`${api}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result;
}

async function sendStart(chatId) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text: '💜 Добро пожаловать в BLISKO!\n\n✨ Находи людей рядом\n❤️ Получай взаимные симпатии\n💬 Общайся без лишнего шума\n📍 Открывай новые знакомства\n\nНажми кнопку ниже и начни прямо сейчас 👇',
    reply_markup: {
      inline_keyboard: [[{ text: '💘 Открыть BLISKO', web_app: { url: webAppUrl } }]],
    },
  });
}

async function configureCommands() {
  await telegram('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть BLISKO' },
      { command: 'profile', description: 'Открыть профиль' },
      { command: 'settings', description: 'Открыть настройки' },
      { command: 'delete', description: 'Удаление аккаунта' },
    ],
  });
  await telegram('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: '💘 Открыть BLISKO',
      web_app: { url: webAppUrl },
    },
  });
}

async function handle(update) {
  const message = update.message;
  if (!message?.chat?.id) return;
  const commandToken = message.text?.trim().split(/\s+/)[0].toLowerCase() || '';
  const command = commandToken.split('@')[0];
  if (commandToken.includes('@') && botUsername && commandToken.split('@')[1] !== botUsername) return;
  if (command === '/start' || command === '/help') return sendStart(message.chat.id);
  if (command === '/profile') {
    return telegram('sendMessage', { chat_id: message.chat.id, text: '👤 Otwórz BLISKO, aby zobaczyć swój profil.' });
  }
  if (command === '/settings') {
    return telegram('sendMessage', { chat_id: message.chat.id, text: '⚙️ Ustawienia są dostępne w aplikacji BLISKO.' });
  }
  if (command === '/delete') {
    return telegram('sendMessage', { chat_id: message.chat.id, text: 'Aby usunąć konto, napisz do administratora.' });
  }
  return sendStart(message.chat.id);
}

console.log('BLISKO Telegram bot is running in polling mode.');
console.log(`Mini App URL: ${webAppUrl}`);
await configureCommands();
await telegram('deleteWebhook', { drop_pending_updates: false });

while (true) {
  try {
    const updates = await telegram('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
    for (const update of updates) {
      offset = update.update_id + 1;
      await handle(update);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
