# Class Catch-up

**Missed class because you were sick or on leave? Get the summary on WhatsApp, then ask it questions.**

Professors don't have time to email every absent student. Sessions get recorded anyway. This app turns the
recording into a timestamped catch-up summary, sends it on WhatsApp to every student who reported being absent,
and answers their follow-up questions *only from what was said in class*, citing the moment in the recording,
or saying honestly that it wasn't covered.

Built for the ieNYC × DataCamp "Be a Master in Claude" challenge (API / MCP integration track).

```
Recording ─▶ Supabase Storage ─▶ ElevenLabs Scribe v2 (speakers + word timestamps)
                                         │
                                         ▼
                         segments in Postgres ("[12:34] Professor: …")
                                         │
              Claude + skills/lecture-summary/SKILL.md ─▶ summary (web) + WhatsApp version
                                         │
            absent students (texted "absent BA101") ◀── Twilio WhatsApp ──▶ follow-up questions
                                                                            │
                                         Claude answers from cached transcript, cites [mm:ss]
```

## How Claude is used

| Where | What |
|---|---|
| `skills/lecture-summary/SKILL.md` | Agent Skill defining the summary format and rules. The app loads it at runtime as the system prompt, so Claude Code and production share one definition. |
| `src/lib/claude.ts` → `summarizeTranscript` | Messages API with **structured outputs** (JSON schema) returning `markdown` + `whatsapp_text`. |
| `src/lib/claude.ts` → `answerQuestion` | Q&A grounded in the transcript, **prompt caching** on the transcript block, structured `{covered, answer}` so "not covered" is explicit and measurable. Multi-turn history so follow-ups work. |
| Development | Built with Claude Code (`CLAUDE.md` in repo). |
| `scripts/eval.ts` | Automatic accuracy check: coverage refusals, citation validity, expected-source hit rate. |

## Setup (local)

1. **Install:** `npm install`
2. **Env:** `cp .env.example .env.local` and fill in:
   - Supabase: Project Settings → API Keys → **secret** key (`sb_secret_…`). The URL is already set.
   - `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`
   - Twilio: Account SID + Auth Token; WhatsApp Sandbox join phrase (Console → Messaging → Try it out → Send a WhatsApp message)
   - `ADMIN_PASSWORD` for `/admin`
3. **Run:** `npm run dev` → http://localhost:3001
4. **Expose for Twilio:** `ngrok http 3001` (or `cloudflared tunnel --url http://localhost:3001`).
   Put the https URL in `PUBLIC_BASE_URL` in `.env.local` and restart `npm run dev`.
5. **Twilio Sandbox settings → "When a message comes in":** `https://<your-url>/api/whatsapp`, method **POST**.
6. **Join the sandbox** from your phone: WhatsApp `join <your-code>` to the sandbox number shown in Twilio (Messaging → Try it out → Send a WhatsApp message), and put that number in `TWILIO_WHATSAPP_FROM`.

The database schema is already applied to Supabase project `nendnnxipxsnispborob` (see `supabase/migrations/`),
with one course seeded: **BA101 – Marketing Analytics**.

## Try it in 3 minutes (no recording needed)

1. From WhatsApp send: `absent BA101`, which marks you absent today and records consent.
2. Open http://localhost:3001/admin → create a lecture for BA101 dated today → **Paste transcript** → paste
   `samples/sample-lecture.txt` → **Summarize** → **Send to absent**.
3. The summary arrives on WhatsApp. Reply: *"when is the case study due?"*, then *"will the midterm be open book?"*
   (not covered, so the bot should say so).

With a real recording: **Upload audio** (mono MP3 at 64 kbps keeps a 90-min class under Supabase's 50 MB free limit;
`ffmpeg -i class.mp4 -ac 1 -b:a 64k class.mp3`) → **Transcribe** → Summarize → Send.

## WhatsApp commands

| Message | Effect |
|---|---|
| `absent BA101` / `sick BA101 3` / `leave BA101 5` | Marked absent for 1/3/5 days from today; gets summaries for those classes |
| `missed BA101` | Sends the latest summarized BA101 class now |
| `summary` | Resends the current class summary |
| anything else | Question about the current class, answered from the transcript with `[mm:ss]` |
| `stop` | Opt out |

## Evaluation

```bash
npm run eval -- --sample            # loads the sample lecture, summarizes it, runs eval/questions.json
npm run eval -- --lecture <uuid>    # any lecture already in the DB
```

Reports: covered/not-covered accuracy, % of answers whose citations all point to real transcript moments,
and whether the expected source timestamp was cited. Writes a CSV with a `human_correct` column for manual grading.
Run it on 2–3 real lectures and put the table in the write-up.

## Deploy (Vercel)

1. Push to GitHub, import in Vercel (or `vercel` CLI).
2. Add every variable from `.env.local` in Vercel → Settings → Environment Variables, with
   `PUBLIC_BASE_URL=https://<project>.vercel.app` and `TWILIO_SKIP_SIGNATURE` unset.
3. Point the Twilio Sandbox webhook to `https://<project>.vercel.app/api/whatsapp`.

## Privacy, consent and limits

- **Opt-in only:** students start by messaging the bot; the reply states what they're agreeing to; `stop` opts out.
- **Recordings and transcripts** stay in a private Supabase bucket/tables; only the server (secret key) can read them.
  Summary pages are reachable only through an unguessable link.
- **Classmates are anonymised** ("Student 1"); the professor is the speaker with the most talk time.
- **Professor approval** should be required before a course's recordings are processed (institutional/FERPA policy).
- **WhatsApp Sandbox** is for prototyping: each student must send the join code, and free-form messages only reach
  students who wrote in the last 24h. Production needs a WhatsApp Business sender + approved templates.
- **SMS / iMessage:** US SMS needs toll-free verification or A2P 10DLC (days to weeks); iMessage has no public API.
- **Accuracy:** transcription errors (names, formulas, accents) flow into the summary. Citations make every claim
  checkable against the recording, and the bot is instructed to say "not covered" instead of guessing.
- Q&A uses the most recent class sent to the student; questions across several lectures are future work (MCP server
  over the transcript archive).
