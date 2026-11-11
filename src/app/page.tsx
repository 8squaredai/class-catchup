export default function Home() {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  return (
    <main>
      <h1>Class Catch-up</h1>
      <p className="muted">Missed class because you were sick or on leave? Get the summary on Telegram and ask questions about it.</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>For students</h2>
        <ol>
          <li>
            Open {bot ? <a href={`https://t.me/${bot}`}>@{bot}</a> : "our Telegram bot"} and press <b>Start</b> (one time).
          </li>
          <li>
            Send <code>absent BA101</code> when you will miss a class (or <code>absent BA101 3</code> for 3 days).
          </li>
          <li>After class you get a summary with timestamps. Reply with any question; answers come only from the recording.</li>
          <li>
            Already missed it? Send <code>missed BA101</code>.
          </li>
        </ol>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <p>
          Recording → ElevenLabs Scribe (transcript with speakers and timestamps) → Claude summary following a shared
          <code> SKILL.md</code> → Telegram bot (WhatsApp via Twilio is built in as a second channel) → follow-up questions answered by Claude from the transcript, with
          <code> [mm:ss]</code> citations, and an honest &quot;not covered&quot; when the class didn&apos;t cover it.
        </p>
        <p>
          <a href="/admin">Professor / admin area →</a>
        </p>
      </div>
    </main>
  );
}
