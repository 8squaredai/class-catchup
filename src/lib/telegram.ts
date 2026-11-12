import { env } from "./env";
import { chunk, type SendResult } from "./twilio";

/** Call a Telegram Bot API method. https://core.telegram.org/bots/api */
export async function telegramApi(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${env.telegramToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; result?: unknown; description?: string; error_code?: number };
}

/**
 * Send a message to a Telegram chat. Telegram allows 4,096 characters per message.
 * Our texts use WhatsApp-style *bold*, which Telegram's legacy "Markdown" mode understands too.
 * If Telegram can't parse the formatting (e.g. a stray * or _), resend as plain text.
 */
export async function sendTelegram(chatId: string, body: string): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (const part of chunk(body, 4000)) {
    try {
      let r = await telegramApi("sendMessage", { chat_id: chatId, text: part.replace(/\[/g, "\\["), parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
      if (!r.ok && r.error_code === 400 && /parse entities/i.test(r.description ?? "")) {
        r = await telegramApi("sendMessage", { chat_id: chatId, text: part, link_preview_options: { is_disabled: true } });
      }
      if (!r.ok) {
        // 403 = the student blocked the bot or never pressed Start
        results.push({ sid: null, status: "failed", error: `${r.error_code ?? ""} ${r.description ?? "Telegram error"}`.trim() });
        break;
      }
      const id = (r.result as { message_id?: number } | undefined)?.message_id;
      results.push({ sid: id != null ? `tg:${id}` : null, status: "sent", error: null });
    } catch (e) {
      results.push({ sid: null, status: "failed", error: (e as Error).message });
      break;
    }
  }
  return results;
}
