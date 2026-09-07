import 'dotenv/config';
import prisma from './db/client.js';
import { createTelegramBot } from './telegram/bot.js';

async function main() {
  console.log('🛒 Initializing Supermarket Ops Agent...');

  // Verify DB connection
  await prisma.$connect();
  console.log('✅ Connected to SQLite database.');

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === 'your-telegram-bot-token-here' || token === 'mock-token-for-testing') {
    console.warn(
      '⚠️ TELEGRAM_BOT_TOKEN is not set or using mock token. Bot polling is paused.\n' +
        'Set a valid TELEGRAM_BOT_TOKEN in .env to run live on Telegram.'
    );
    return;
  }

  const bot = createTelegramBot(token);
  console.log('🤖 Telegram bot starting polling...');
  bot.start({
    onStart: (botInfo) => {
      console.log(`🚀 Supermarket Ops Bot @${botInfo.username} is running and ready!`);
    },
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
