"use client";

import { useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

export default function AskBox({ token }: { token: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    setBusy(true);
    setQ("");
    const history = turns;
    setTurns([...history, { role: "user", content: question }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, question, history }),
      });
      const data = await res.json();
      const answer = res.ok ? data.answer + (data.covered ? "" : "\n\n(Not in the recording; worth asking your professor.)") : `Error: ${data.error}`;
      setTurns([...history, { role: "user", content: question }, { role: "assistant", content: answer }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Ask about this class</h2>
      <div className="chat">
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>{t.content}</div>
        ))}
        {busy && <div className="bubble assistant muted">Checking the recording…</div>}
      </div>
      <form onSubmit={ask} className="row" style={{ marginTop: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What did the professor say about the midterm?" style={{ flex: 1 }} />
        <button disabled={busy}>Ask</button>
      </form>
    </section>
  );
}
