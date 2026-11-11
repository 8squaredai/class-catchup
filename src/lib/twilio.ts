import twilio from "twilio";
import { env } from "./env";

let client: ReturnType<typeof twilio> | null = null;
function tw() {
  if (!client) client = twilio(env.twilioSid(), env.twilioToken());
  return client;
}

/** WhatsApp via Twilio allows 1,600 characters per message; split on paragraph/line boundaries. */
export function chunk(text: string, max = 1500): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n/)) {
    if ((cur + "\n" + para).length > max && cur) {
      out.push(cur);
      cur = para;
    } else {
      cur = cur ? cur + "\n" + para : para;
    }
    while (cur.length > max) {
      out.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur) out.push(cur);
  return out;
}

export type SendResult = { sid: string | null; status: string; error: string | null };

export async function sendWhatsApp(to: string, body: string): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (const part of chunk(body)) {
    try {
      const m = await tw().messages.create({ from: env.twilioFrom(), to, body: part });
      results.push({ sid: m.sid, status: m.status, error: null });
    } catch (e) {
      const err = e as { code?: number; message?: string };
      // 63016 = outside the 24h customer-service window (student hasn't messaged in 24h)
      results.push({ sid: null, status: "failed", error: `${err.code ?? ""} ${err.message ?? String(e)}`.trim() });
      break;
    }
  }
  return results;
}

export function validTwilioSignature(signature: string | null, url: string, params: Record<string, string>): boolean {
  if (env.skipSignature()) return true;
  if (!signature) return false;
  return twilio.validateRequest(env.twilioToken(), signature, url, params);
}
