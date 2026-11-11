/**
 * One-time Telegram bot setup: points the bot at your deployed app and adds the command menu.
 *
 *   npm run telegram:setup -- https://class-catchup.vercel.app
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.local. The same two values
 * must be set in Vercel, or the deployed app will reject Telegram's messages.
 */
import { telegramApi } from "../src/lib/telegram";

async function main() {
  const base = (process.argv[2] ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("Pass your public https URL, e.g. npm run telegram:setup -- https://class-catchup.vercel.app");

  const me = await telegramApi("getMe", {});
  if (!me.ok) throw new Error(`Bot token rejected: ${me.description}`);
  const username = (me.result as { username: string }).username;
  console.log(`✓ Bot found: @${username}`);

  const hook = await telegramApi("setWebhook", {
    url: `${base}/api/telegram`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  if (!hook.ok) throw new Error(`setWebhook failed: ${hook.description}`);
  console.log(`✓ Webhook set to ${base}/api/telegram`);

  await telegramApi("setMyCommands", {
    commands: [
      { command: "start", description: "How this works + course list" },
      { command: "absent", description: "absent BA101 – I'm out today (absent BA101 3 = 3 days)" },
      { command: "missed", description: "missed BA101 – send the latest class" },
      { command: "summary", description: "Resend the current summary" },
      { command: "stop", description: "Stop all messages" },
    ],
  });
  console.log("✓ Command menu added");
  console.log(`\nStudents start here: https://t.me/${username}`);
  console.log(`Set TELEGRAM_BOT_USERNAME=${username} (in .env.local and Vercel) so the homepage shows this link.`);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
