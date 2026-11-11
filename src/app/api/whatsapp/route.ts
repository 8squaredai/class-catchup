import { after } from "next/server";
import { env } from "@/lib/env";
import { validTwilioSignature } from "@/lib/twilio";
import { handleInbound } from "@/lib/bot";

export const maxDuration = 60;

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio WhatsApp webhook ("When a message comes in", HTTP POST). */
export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  const url = `${env.publicBaseUrl()}/api/whatsapp`;
  if (!validTwilioSignature(request.headers.get("x-twilio-signature"), url, params)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From; // "whatsapp:+1..."
  const body = params.Body ?? "";
  if (from && body.trim()) {
    // Answer Twilio immediately (it times out after 15s); Claude replies via the REST API.
    after(async () => {
      try {
        await handleInbound(from, body, params.ProfileName || null);
      } catch (e) {
        console.error("handleInbound failed", e);
      }
    });
  }
  return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
