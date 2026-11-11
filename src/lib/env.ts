function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseSecret: () => process.env.SUPABASE_SECRET_KEY || required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicKey: () => required("ANTHROPIC_API_KEY"),
  claudeModel: () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
  elevenLabsKey: () => required("ELEVENLABS_API_KEY"),
  twilioSid: () => required("TWILIO_ACCOUNT_SID"),
  twilioToken: () => required("TWILIO_AUTH_TOKEN"),
  twilioFrom: () => process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
  sandboxJoin: () => process.env.TWILIO_SANDBOX_JOIN || "",
  publicBaseUrl: () => required("PUBLIC_BASE_URL").replace(/\/$/, ""),
  skipSignature: () => process.env.TWILIO_SKIP_SIGNATURE === "true" && process.env.NODE_ENV !== "production",
};
