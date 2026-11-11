# Class Catch-up

Lecture recordings → transcript (ElevenLabs Scribe v2) → catch-up summary (Claude) → Telegram bot (WhatsApp via Twilio as a second channel)
for students who were sick or on leave, with follow-up Q&A answered only from the transcript.

@AGENTS.md

## Stack
- Next.js 16 App Router, TypeScript, `src/` layout. Middleware is now `src/proxy.ts` (basic auth for /admin).
- Supabase project `nendnnxipxsnispborob` (Postgres + Storage bucket `lectures`). Server-only access with the
  secret key in `src/lib/supabase.ts`. RLS is on with no policies on purpose: the browser never talks to tables.
- Anthropic SDK (`src/lib/claude.ts`), default model `claude-sonnet-5-5` (env `CLAUDE_MODEL`).
- Telegram Bot API (`src/lib/telegram.ts`), webhook at `/api/telegram` (secret header check). Register with
  `npm run telegram:setup -- <public url>`.
- Twilio WhatsApp Sandbox (`src/lib/twilio.ts`), webhook at `/api/whatsapp`. Needs an upgraded Twilio account.
- `src/lib/messaging.ts` routes by address prefix (`telegram:<chat id>` / `whatsapp:+1…`, stored in
  `students.whatsapp`, a legacy column name).

## Where things live
- `skills/lecture-summary/SKILL.md` — the summary format. It is loaded at runtime as the system prompt, so
  edit the format there, not in code.
- `src/lib/pipeline.ts` — transcribe → summarize → send.
- `src/lib/bot.ts` — chat commands (shared by both channels) (`absent BA101 [days]`, `missed BA101`, `summary`, `stop`, help) and Q&A.
- `src/lib/transcript.ts` — word→segment grouping, pasted transcript parsing, `[mm:ss]` citation helpers.
- `scripts/eval.ts` + `eval/questions.json` — accuracy check (`npm run eval -- --sample`).
- `supabase/migrations/` — schema. Apply new migrations with the Supabase MCP or `supabase db push`.

## Rules
- Answers and summaries must come only from the transcript and cite `[mm:ss]`. Never relax this.
- Webhooks must reply fast (Twilio times out at 15s): do Claude work inside `after()` and reply via the REST API.
- WhatsApp free-form messages only reach students who messaged in the last 24h (error 63016 otherwise).
- Never log or commit `.env.local`. Never expose the Supabase secret key to client components.
- Students in transcripts are anonymised ("Student 1"); keep it that way.

## Commands
- `npm run dev` — local server on :3001 (expose with `ngrok http 3001` to test webhooks locally)
- `npm run typecheck`, `npm run lint`, `npm run build`
- `npm run eval -- --sample` — load the sample lecture and score the Q&A
