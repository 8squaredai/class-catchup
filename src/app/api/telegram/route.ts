import { after } from "next/server";
import { env } from "@/lib/env";
import { handleInbound } from "@/lib/bot";

export const maxDuration = 60;

type Update = {
  message?: {
    text?: string;
    chat: { id: number; type: string };
    from?: { first_name?: string; last_name?: string };
  };
};

/** Telegram bot webhook (registered with `npm run telegram:setup -- <public url>`). */
export async function POST(request: Request) {
  // Telegram echoes the secret we gave setWebhook in this header; reject anything else.
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.telegramWebhookSecret()) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = (await request.json()) as Update;
  const msg = update.message;
  // Only private 1:1 chats with text. Ignore groups, photos, stickers, edits, etc.
  if (msg?.text && msg.chat.type === "private") {
    // "/start", "/absent BA101" and "/help@ClassCatchupBot" become "start", "absent BA101", "help".
    const text = msg.text.replace(/^\/(\w+)(@\w+)?/, "$1");
    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || null;
    // Answer Telegram right away; Claude's reply is sent separately through the Bot API.
    after(async () => {
      try {
        await handleInbound(`telegram:${msg.chat.id}`, text, name);
      } catch (e) {
        console.error("handleInbound failed", e);
      }
    });
  }
  return Response.json({ ok: true });
}
