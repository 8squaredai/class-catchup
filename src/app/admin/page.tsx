"use client";

import { useCallback, useEffect, useState } from "react";
import { ADDONS, TEMPLATES, defaultOptions, templateInfo, type SummaryOptions, type TemplateId } from "@/lib/templates";

type Summary = { share_token: string; template?: string | null };
type Course = { id: string; code: string; name: string; professor: string | null };
type Lecture = {
  id: string;
  title: string;
  lecture_date: string;
  status: string;
  error: string | null;
  audio_path: string | null;
  duration_s: number | null;
  courses: { code: string };
  summaries: Summary | Summary[] | null;
};
type Absence = { id: string; start_date: string; end_date: string; reason: string; students: { name: string | null; whatsapp: string }; courses: { code: string } };
type Message = { id: number; direction: string; kind: string; body: string; status: string | null; error: string | null; created_at: string; students: { name: string | null; whatsapp: string } | null };
type Overview = { courses: Course[]; lectures: Lecture[]; absences: Absence[]; messages: Message[] };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function api(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function summaryOf(l: Lecture) {
  return (Array.isArray(l.summaries) ? l.summaries[0] : l.summaries) ?? null;
}
const token = (l: Lecture) => summaryOf(l)?.share_token;

export default function Admin() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [sumFor, setSumFor] = useState<Lecture | null>(null);
  const [opts, setOpts] = useState<SummaryOptions>(defaultOptions());

  useEffect(() => {
    if (!sumFor) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSumFor(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sumFor]);

  function openSummarize(l: Lecture) {
    const used = summaryOf(l)?.template;
    setOpts(defaultOptions(TEMPLATES.some((t) => t.id === used) ? (used as TemplateId) : undefined));
    setSumFor(l);
  }

  const load = useCallback(async () => setData(await api("/api/admin/overview")), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
    const t = setInterval(() => load().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fn();
      if (r && typeof r === "object" && "results" in r) {
        const results = (r as { results: { student: string; ok: boolean; error: string | null; skipped?: boolean }[] }).results;
        setMsg(results.length ? results.map((x) => `${x.student}: ${x.skipped ? "already sent" : x.ok ? "sent ✓" : "failed – " + x.error}`).join("\n") : "No absent students for this course on that date.");
      }
      await load();
    } catch (e) {
      setMsg(`${label}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function upload(lectureId: string, file: File) {
    await run("Upload", async () => {
      const { signedUrl } = await api(`/api/admin/lectures/${lectureId}/upload-url`, { filename: file.name });
      // Same request supabase-js uploadToSignedUrl makes: multipart PUT, authorised by the token in the URL.
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      const put = await fetch(signedUrl, {
        method: "PUT",
        headers: { "x-upsert": "true", apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" },
        body: form,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}). Supabase free plan limit is 50 MB; export audio as mono MP3 at 64 kbps.`);
    });
  }

  if (!data) return <main><p className="muted">Loading… {msg}</p></main>;

  return (
    <main>
      <h1>Class Catch-up · Admin</h1>
      <p className="muted">Create a lecture → upload the recording (or paste a transcript) → transcribe → summarize → send to absent students.</p>
      {msg && <pre className="card" style={{ whiteSpace: "pre-wrap" }}>{msg}</pre>}

      <h2>New lecture</h2>
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          run("Create lecture", async () => {
            await api("/api/admin/lectures", Object.fromEntries(f));
            form.reset();
          });
        }}
      >
        <select name="course_id" required>
          {data.courses.map((c) => (
            <option key={c.id} value={c.id}>{c.code} – {c.name}</option>
          ))}
        </select>
        <input name="title" placeholder="Lecture title, e.g. Customer Lifetime Value" required style={{ flex: 1, minWidth: 240 }} />
        <input name="lecture_date" type="date" defaultValue={today()} required />
        <button disabled={!!busy}>Create</button>
      </form>

      <h2>Lectures</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>Date</th><th>Course</th><th>Title</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {data.lectures.map((l) => (
              <tr key={l.id}>
                <td>{l.lecture_date}</td>
                <td>{l.courses.code}</td>
                <td>
                  {l.title}
                  {l.duration_s ? <div className="muted" style={{ fontSize: 12 }}>{Math.round(l.duration_s / 60)} min</div> : null}
                  {l.error && <div className="error">{l.error}</div>}
                </td>
                <td>
                  <span className={`pill ${l.status === "error" ? "err" : ["summarized", "sent"].includes(l.status) ? "ok" : ""}`}>{l.status}</span>
                  {summaryOf(l)?.template && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4, whiteSpace: "nowrap" }}>
                      {templateInfo(summaryOf(l)?.template).emoji} {templateInfo(summaryOf(l)?.template).label}
                    </div>
                  )}
                </td>
                <td>
                  <div className="row">
                    <label className="secondary" style={{ cursor: "pointer", fontSize: 13 }}>
                      <input type="file" accept="audio/*,video/*" hidden onChange={(e) => e.target.files?.[0] && upload(l.id, e.target.files[0])} />
                      <span style={{ textDecoration: "underline" }}>Upload audio</span>
                    </label>
                    <button className="secondary" type="button" onClick={() => { setPasteFor(pasteFor === l.id ? null : l.id); setPasteText(""); }}>Paste transcript</button>
                    <button type="button" disabled={!!busy || !l.audio_path} onClick={() => run("Transcribe", () => api(`/api/admin/lectures/${l.id}/transcribe`, {}))}>
                      {busy === "Transcribe" ? "Transcribing…" : "Transcribe"}
                    </button>
                    <button type="button" disabled={!!busy || !["transcribed", "summarized", "sent", "error"].includes(l.status)} onClick={() => openSummarize(l)}>
                      {busy === "Summarize" ? "Summarizing…" : "Summarize"}
                    </button>
                    <button type="button" disabled={!!busy || !token(l)} onClick={() => run("Send", () => api(`/api/admin/lectures/${l.id}/send`, {}))}>
                      Send to absent
                    </button>
                    {token(l) && <a href={`/s/${token(l)}`} target="_blank">View summary</a>}
                  </div>
                  {pasteFor === l.id && (
                    <div style={{ marginTop: 8 }}>
                      <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"[00:00] Professor: Good morning everyone...\n[00:42] Student 1: ...\n\nor paste a .vtt / .srt file"} />
                      <button type="button" disabled={!!busy || !pasteText.trim()} onClick={() => run("Save transcript", async () => { await api(`/api/admin/lectures/${l.id}/transcript`, { text: pasteText }); setPasteFor(null); })}>
                        Save transcript
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!data.lectures.length && <tr><td colSpan={5} className="muted">No lectures yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Absences</h2>
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          run("Add absence", async () => {
            await api("/api/admin/absences", Object.fromEntries(f));
            form.reset();
          });
        }}
      >
        <input name="name" placeholder="Student name" />
        <input name="whatsapp" placeholder="+1 212 555 1234" required />
        <select name="course_id" required>
          {data.courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        <input name="start_date" type="date" defaultValue={today()} required />
        <input name="end_date" type="date" defaultValue={today()} />
        <button disabled={!!busy}>Mark absent</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Student</th><th>Course</th><th>From</th><th>To</th><th>Source</th></tr></thead>
          <tbody>
            {data.absences.map((a) => (
              <tr key={a.id}>
                <td>{a.students?.name || a.students?.whatsapp}</td>
                <td>{a.courses?.code}</td>
                <td>{a.start_date}</td>
                <td>{a.end_date}</td>
                <td className="muted">{a.reason}</td>
              </tr>
            ))}
            {!data.absences.length && <tr><td colSpan={5} className="muted">Students appear here when they text “absent BA101”.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Message log</h2>
      <div className="card">
        <table>
          <thead><tr><th>Time</th><th>Student</th><th></th><th>Message</th></tr></thead>
          <tbody>
            {data.messages.map((m) => (
              <tr key={m.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(m.created_at).toLocaleString()}</td>
                <td>{m.students?.name || m.students?.whatsapp}</td>
                <td><span className={`pill ${m.error ? "err" : ""}`}>{m.direction === "in" ? "⬅" : "➡"} {m.kind}</span></td>
                <td style={{ whiteSpace: "pre-wrap", maxWidth: 520 }}>
                  {m.body.length > 400 ? m.body.slice(0, 400) + "…" : m.body}
                  {m.error && <div className="error">{m.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Add course</h2>
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          run("Add course", async () => {
            await api("/api/admin/courses", Object.fromEntries(f));
            form.reset();
          });
        }}
      >
        <input name="code" placeholder="Code (BA102)" required />
        <input name="name" placeholder="Course name" required />
        <input name="professor" placeholder="Professor" />
        <button disabled={!!busy}>Add</button>
      </form>

      {sumFor && (
        <div className="modal-backdrop" onClick={() => setSumFor(null)}>
          <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="sum-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="sum-title" style={{ marginTop: 0 }}>Summarize “{sumFor.title}”</h2>
            <p className="muted" style={{ marginTop: -4 }}>How should absent students get this class?</p>

            <div className="tpl-grid" role="radiogroup" aria-label="Summary template">
              {TEMPLATES.map((t) => (
                <label key={t.id} className={`tpl${opts.template === t.id ? " on" : ""}`}>
                  <input type="radio" name="template" checked={opts.template === t.id} onChange={() => setOpts({ ...defaultOptions(t.id), note: opts.note })} />
                  <span className="tpl-title">{t.emoji} {t.label}</span>
                  <span className="muted tpl-when">{t.when}</span>
                  <span className="tpl-gives">{t.gives}</span>
                </label>
              ))}
            </div>

            <h3>Add-ons</h3>
            <div className="row" style={{ gap: "6px 18px" }}>
              {ADDONS.map((a) => (
                <label key={a.id} className="check">
                  <input
                    type="checkbox"
                    checked={opts.addons.includes(a.id)}
                    onChange={(e) => setOpts({ ...opts, addons: e.target.checked ? [...opts.addons, a.id] : opts.addons.filter((x) => x !== a.id) })}
                  />
                  {a.label}
                </label>
              ))}
            </div>

            <h3>
              Note for Claude <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
            </h3>
            <textarea
              className="note"
              value={opts.note}
              maxLength={1000}
              onChange={(e) => setOpts({ ...opts, note: e.target.value })}
              placeholder="e.g. Focus on mechanics vs. dynamics and skip the syllabus intro."
            />
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>Steers what to emphasise. Claude still only uses what was said in the recording.</p>

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => setSumFor(null)}>Cancel</button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  const l = sumFor;
                  setSumFor(null);
                  run("Summarize", () => api(`/api/admin/lectures/${l.id}/summarize`, opts));
                }}
              >
                Summarize as {templateInfo(opts.template).label}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
