import { sendWhatsApp, type SendResult } from "./twilio";
import { sendTelegram } from "./telegram";

/**
 * One send function for every chat channel. A student's address says which channel they use:
 *   "telegram:<chat id>"  → Telegram bot
 *   "whatsapp:+1212..."   → WhatsApp via Twilio
 * Adding a channel = a new sender here + a webhook route that calls handleInbound("<channel>:<id>", ...).
 */
export function sendMessage(to: string, body: string): Promise<SendResult[]> {
  if (to.startsWith("telegram:")) return sendTelegram(to.slice("telegram:".length), body);
  return sendWhatsApp(to, body);
}

export type { SendResult };
