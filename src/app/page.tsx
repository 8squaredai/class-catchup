import { Icon, type IconName } from "@/components/Icon";
import { TopBar } from "@/components/TopBar";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STEPS: { icon: IconName; title: string; body: React.ReactNode }[] = [
  { icon: "message", title: "Tell the bot you're out", body: <>Send <code>absent AIML</code> (or <code>absent AIML 3</code> for 3 days) when you&apos;ll miss class.</> },
  { icon: "file", title: "Get the catch-up", body: "After class you get a summary with timestamps from the recording, written by Claude." },
  { icon: "book", title: "Ask anything", body: "Reply with questions. Answers come only from what was said in class, with the moment it was said." },
];

export default async function Home() {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const { data: courses } = await db().from("courses").select("code, name, professor, official_code").not("official_code", "is", null).order("name");

  return (
    <>
      <TopBar title="Class Catch-up">
        <a className="btn btn-ghost btn-sm" href="/admin"><Icon name="users" size={15} /> Faculty</a>
      </TopBar>
      <main>
        <section className="home-hero">
          <span className="eyebrow"><span className="dot" />For students who were sick or on leave</span>
          <h1>Missed class? Catch up in minutes.</h1>
          <p className="muted" style={{ fontSize: 17, maxWidth: 620 }}>
            Get a summary of the session you missed on Telegram, then ask it questions. Every answer comes from the class recording.
          </p>
          <div className="row" style={{ marginTop: 18 }}>
            <a className="btn btn-primary" href={bot ? `https://t.me/${bot}` : "#"} target="_blank" rel="noreferrer">
              <Icon name="send" size={16} /> Open {bot ? `@${bot}` : "the bot"} on Telegram
            </a>
            <span className="muted" style={{ fontSize: 13 }}>Press <b>Start</b> once, then send a command.</span>
          </div>
        </section>

        <section className="home-steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card home-step">
              <span className="step-num mono">0{i + 1}</span>
              <span className="home-step-icon"><Icon name={s.icon} size={20} /></span>
              <h3>{s.title}</h3>
              <p className="muted" style={{ margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </section>

        {!!courses?.length && (
          <section>
            <h2>Your courses and their codes</h2>
            <div className="card" style={{ padding: 6 }}>
              <ul className="code-list">
                {courses.map((c) => (
                  <li key={c.code}>
                    <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <strong>{c.name}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>{c.professor ?? "Professor TBA"}</span>
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <code>absent {c.code}</code>
                      <code>missed {c.code}</code>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 28 }}>
          Recording → ElevenLabs Scribe (speakers + timestamps) → Claude, using a shared Agent Skill → Telegram bot (WhatsApp via Twilio is built in as a
          second channel). Classmates are anonymised. Send <code>stop</code> anytime to opt out.
        </p>
      </main>
    </>
  );
}
