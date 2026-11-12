"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { TopBar } from "@/components/TopBar";
import { templateInfo, type SummaryOptions } from "@/lib/templates";
import { AddRecordingModal, type Source, type Tab } from "./AddRecordingModal";
import { SummarizeModal } from "./SummarizeModal";
import { Modal, ToastProvider, checkRecording, useFileDrop, useToast } from "./ui";
import {
  absentOn, api, channelOf, fmtDate, initials, studentLabel, summaryOf, timeAgo, today, uploadToSignedUrl,
  type Course, type Lecture, type Overview, type Student,
} from "./lib";
import "./admin.css";

export default function AdminPage() {
  return (
    <ToastProvider>
      <Admin />
    </ToastProvider>
  );
}

type AddState = { course: Course; lecture?: Lecture | null; tab?: Tab; file?: File | null };
type SumState = { id: string; title: string; template?: string | null };
type SendState = { lecture: Lecture; students: Student[] };

function Admin() {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [courseCode, setCourseCode] = useState<string | null>(null);
  const [working, setWorking] = useState<Record<string, string>>({}); // lectureId → what's running
  const [add, setAdd] = useState<AddState | null>(null);
  const [sum, setSum] = useState<SumState | null>(null);
  const [send, setSend] = useState<SendState | null>(null);
  const [newCourse, setNewCourse] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Overview>("/api/admin/overview"));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  // #CODE in the URL = open course (so the browser back button works).
  useEffect(() => {
    const sync = () => setCourseCode(decodeURIComponent(location.hash.slice(1)) || null);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const openCourse = (code: string | null) => {
    location.hash = code ? encodeURIComponent(code) : "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const course = data?.courses.find((c) => c.code === courseCode) ?? null;
  const mark = (id: string, what: string | null) =>
    setWorking((w) => {
      const n = { ...w };
      if (what) n[id] = what;
      else delete n[id];
      return n;
    });

  /* ------------------------------ pipeline steps ------------------------------ */

  async function transcribe(l: { id: string; title: string }) {
    mark(l.id, "transcribing");
    const t = toast.push({ kind: "busy", title: "Transcribing…", body: `ElevenLabs is turning “${l.title}” into a transcript with speakers and timestamps. About 1–3 min per hour of class.` });
    try {
      const r = await api<{ segments: number }>(`/api/admin/lectures/${l.id}/transcribe`, {});
      toast.update(t, { kind: "ok", title: "Transcript ready", body: `${r.segments} segments. Now pick how to summarize it.` });
      await load();
      setSum({ id: l.id, title: l.title });
    } catch (e) {
      toast.update(t, { kind: "err", title: "Transcription failed", body: (e as Error).message });
      await load();
    } finally {
      mark(l.id, null);
    }
  }

  async function summarize(target: SumState, opts: SummaryOptions) {
    setSum(null);
    mark(target.id, "summarizing");
    const tpl = templateInfo(opts.template);
    const t = toast.push({ kind: "busy", title: `Claude is writing a ${tpl.label}…`, body: "Usually 30–90 seconds." });
    try {
      await api(`/api/admin/lectures/${target.id}/summarize`, opts);
      await load();
      toast.update(t, { kind: "ok", title: `${tpl.label} ready`, body: "Review it, then send it to absent students." });
    } catch (e) {
      toast.update(t, { kind: "err", title: "Summary failed", body: (e as Error).message });
      await load();
    } finally {
      mark(target.id, null);
    }
  }

  async function doSend(s: SendState) {
    setSend(null);
    mark(s.lecture.id, "sending");
    const t = toast.push({ kind: "busy", title: "Sending…", body: `Delivering “${s.lecture.title}” to ${s.students.length} student${s.students.length === 1 ? "" : "s"}.` });
    try {
      const { results } = await api<{ results: { student: string; ok: boolean; error: string | null; skipped?: boolean }[] }>(`/api/admin/lectures/${s.lecture.id}/send`, {});
      const sent = results.filter((r) => r.ok && !r.skipped).length;
      const skipped = results.filter((r) => r.skipped).length;
      const failed = results.filter((r) => !r.ok);
      toast.update(t, {
        kind: failed.length ? "err" : "ok",
        title: failed.length ? `${failed.length} message${failed.length === 1 ? "" : "s"} failed` : results.length ? `Sent to ${sent} student${sent === 1 ? "" : "s"}` : "Nobody to send to",
        body: [sent && !failed.length ? "They can now reply with questions." : "", skipped ? `${skipped} already had it.` : "", ...failed.map((f) => `${f.student}: ${f.error}`)].filter(Boolean).join(" "),
      });
      await load();
    } catch (e) {
      toast.update(t, { kind: "err", title: "Sending failed", body: (e as Error).message });
    } finally {
      mark(s.lecture.id, null);
    }
  }

  async function addRecording(state: AddState, v: { title: string; date: string; source: Source }) {
    setAdd(null);
    let lecture: { id: string; title: string } = state.lecture ?? { id: "", title: v.title };
    try {
      if (!state.lecture) lecture = await api<{ id: string; title: string }>("/api/admin/lectures", { course_id: state.course.id, title: v.title, lecture_date: v.date });
      await load();
      if (v.source.kind === "text") {
        const r = await api<{ segments: number }>(`/api/admin/lectures/${lecture.id}/transcript`, { text: v.source.text });
        toast.push({ kind: "ok", title: "Transcript saved", body: `${r.segments} segments. Now pick how to summarize it.` });
        await load();
        setSum({ id: lecture.id, title: lecture.title });
        return;
      }
      const file = v.source.file;
      mark(lecture.id, "uploading");
      const t = toast.push({ kind: "busy", title: "Uploading recording", body: `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`, progress: 0 });
      const { signedUrl } = await api<{ signedUrl: string }>(`/api/admin/lectures/${lecture.id}/upload-url`, { filename: file.name });
      await uploadToSignedUrl(signedUrl, file, (p) => toast.update(t, { progress: p }));
      toast.update(t, { kind: "ok", title: "Recording uploaded", progress: undefined, body: "Starting transcription…" });
      await load();
      await transcribe(lecture);
    } catch (e) {
      toast.push({ kind: "err", title: "Couldn't add the recording", body: (e as Error).message });
      if (lecture.id) mark(lecture.id, null);
      await load();
    }
  }

  async function createCourse(form: FormData) {
    try {
      const c = await api<Course>("/api/admin/courses", Object.fromEntries(form));
      setNewCourse(false);
      await load();
      toast.push({ kind: "ok", title: `${c.code} added`, body: `Students can now send “absent ${c.code}”.` });
    } catch (e) {
      toast.push({ kind: "err", title: "Couldn't add course", body: (e as Error).message });
    }
  }

  const err = (msg: string) => toast.push({ kind: "err", title: "Hmm", body: msg });

  return (
    <>
      <TopBar title="Class Catch-up · Faculty">
        {course && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => openCourse(null)}>
            <Icon name="back" size={15} /> All courses
          </button>
        )}
      </TopBar>

      <main>
        {!data ? (
          <div className="loading glass">{loadError ? <><Icon name="alert" /> {loadError}</> : <><Icon name="loader" /> Loading your courses…</>}</div>
        ) : course ? (
          <CourseView
            key={course.id}
            data={data}
            course={course}
            working={working}
            onAdd={(lecture, tab, file) => setAdd({ course, lecture, tab, file })}
            onTranscribe={transcribe}
            onSummarize={(l) => setSum({ id: l.id, title: l.title, template: summaryOf(l)?.template })}
            onSend={(l) => setSend({ lecture: l, students: absentOn(data.absences, l.course_id, l.lecture_date) })}
            onError={err}
          />
        ) : (
          <CourseGrid data={data} onOpen={(c) => openCourse(c.code)} onNew={() => setNewCourse(true)} />
        )}
      </main>

      {add && (
        <AddRecordingModal
          course={add.course}
          lecture={add.lecture}
          initialTab={add.tab}
          initialFile={add.file}
          onClose={() => setAdd(null)}
          onSubmit={(v) => addRecording(add, v)}
          onError={err}
        />
      )}
      {sum && <SummarizeModal title={sum.title} initialTemplate={sum.template} onClose={() => setSum(null)} onConfirm={(o) => summarize(sum, o)} />}
      {send && <SendModal state={send} onClose={() => setSend(null)} onConfirm={() => doSend(send)} />}
      {newCourse && <NewCourseModal onClose={() => setNewCourse(false)} onCreate={createCourse} />}
    </>
  );
}

/* --------------------------------- Course grid -------------------------------- */

function CourseGrid({ data, onOpen, onNew }: { data: Overview; onOpen: (c: Course) => void; onNew: () => void }) {
  const day = today();
  const term = data.courses.find((c) => c.term)?.term;
  return (
    <>
      <section className="hero">
        <span className="eyebrow">{term ?? "This term"}</span>
        <h1>Courses</h1>
        <p className="muted" style={{ margin: 0 }}>Open a course to record or upload a session. Absent students get the summary on Telegram.</p>
      </section>

      <div className="course-grid">
        {data.courses.map((c, i) => {
          const lectures = data.lectures.filter((l) => l.course_id === c.id);
          const absentToday = absentOn(data.absences, c.id, day).length;
          const latest = lectures[0];
          return (
            <button key={c.id} type="button" className="course-card glass" style={{ animationDelay: `${i * 45}ms` }} onClick={() => onOpen(c)}>
              <span className="cc-top">
                <span className="chip code">{c.code}</span>
                {absentToday > 0 && <span className="pill live"><Icon name="users" size={12} /> {absentToday} out today</span>}
              </span>
              <span className="cc-name">{c.name}</span>
              {c.official_code && <span className="cc-official mono">{c.official_code}</span>}
              <span className="cc-foot">
                <span className="avatar" aria-hidden="true">{initials(c.professor)}</span>
                <span className="cc-prof">{c.professor ?? "Professor TBA"}</span>
                <span className="cc-count">
                  <Icon name="book" size={13} /> {lectures.length}
                </span>
              </span>
              {latest && <span className="cc-latest muted">Latest: {latest.title} · {latest.status}</span>}
              <span className="cc-arrow"><Icon name="chevron" size={18} /></span>
            </button>
          );
        })}
        <button type="button" className="course-card add glass" onClick={onNew}>
          <span className="drop-orb"><Icon name="plus" size={22} /></span>
          <span className="cc-name">Add a course</span>
          <span className="muted" style={{ fontSize: 13 }}>Give it a short code students can type</span>
        </button>
      </div>

      <h2>Recent activity</h2>
      <ActivityFeed messages={data.messages.slice(0, 8)} empty="No messages yet. Students start by opening the Telegram bot." />
    </>
  );
}

/* --------------------------------- Course view -------------------------------- */

function CourseView({
  data, course, working, onAdd, onTranscribe, onSummarize, onSend, onError,
}: {
  data: Overview;
  course: Course;
  working: Record<string, string>;
  onAdd: (lecture: Lecture | null, tab: Tab, file?: File | null) => void;
  onTranscribe: (l: Lecture) => void;
  onSummarize: (l: Lecture) => void;
  onSend: (l: Lecture) => void;
  onError: (msg: string) => void;
}) {
  const lectures = useMemo(() => data.lectures.filter((l) => l.course_id === course.id), [data.lectures, course.id]);
  const lectureIds = useMemo(() => new Set(lectures.map((l) => l.id)), [lectures]);
  const day = today();
  const upcoming = data.absences.filter((a) => a.course_id === course.id && a.end_date >= day);
  const activity = data.messages.filter((m) => m.lecture_id && lectureIds.has(m.lecture_id)).slice(0, 10);
  const [copied, setCopied] = useState(false);

  // Drop a file anywhere on the course page → new lecture with that recording.
  const pageDrop = useFileDrop((f) => {
    const e = checkRecording(f);
    if (e) onError(e);
    else onAdd(null, "upload", f);
  });

  return (
    <div className={`course-view${pageDrop.over ? " drop-over" : ""}`} {...pageDrop.handlers}>
      <div className="drop-veil" aria-hidden="true">
        <span className="drop-orb big"><Icon name="upload" size={34} /></span>
        <strong>Drop to create a new {course.code} lecture</strong>
      </div>

      <section className="course-head glass">
        <div className="stack" style={{ gap: 6, minWidth: 0 }}>
          <span className="eyebrow">{course.official_code ?? course.code}</span>
          <h1 style={{ margin: 0 }}>{course.name}</h1>
          <div className="row muted" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 8 }}><span className="avatar sm">{initials(course.professor)}</span>{course.professor ?? "Professor TBA"}</span>
            <button
              type="button"
              className="chip code copy"
              title="Copy the command students send to the bot"
              onClick={() => navigator.clipboard.writeText(`absent ${course.code}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            >
              <Icon name={copied ? "check" : "copy"} size={12} /> absent {course.code}
            </button>
          </div>
        </div>
        <div className="row head-actions">
          <button type="button" onClick={() => onAdd(null, "record")}><Icon name="mic" size={16} /> Record class</button>
          <button type="button" className="btn-primary" onClick={() => onAdd(null, "upload")}><Icon name="upload" size={16} /> Upload recording</button>
        </div>
      </section>

      <div className="course-layout">
        <section className="stack" style={{ gap: 12 }}>
          <div className="spread">
            <h2 style={{ margin: "8px 0 0" }}>Lectures</h2>
            <span className="muted" style={{ fontSize: 13 }}>Tip: drag a recording onto this page or onto a lecture</span>
          </div>
          {lectures.length === 0 ? (
            <button type="button" className="empty glass" onClick={() => onAdd(null, "upload")}>
              <span className="drop-orb big"><Icon name="upload" size={30} /></span>
              <strong>No lectures yet</strong>
              <span className="muted">Drop a recording here, or record the class live from this laptop.</span>
            </button>
          ) : (
            lectures.map((l, i) => (
              <LectureCard
                key={l.id}
                lecture={l}
                index={i}
                working={working[l.id]}
                absentCount={absentOn(data.absences, l.course_id, l.lecture_date).length}
                onAdd={(tab, file) => onAdd(l, tab, file)}
                onTranscribe={() => onTranscribe(l)}
                onSummarize={() => onSummarize(l)}
                onSend={() => onSend(l)}
                onError={onError}
              />
            ))
          )}
        </section>

        <aside className="stack" style={{ gap: 12 }}>
          <div className="card side">
            <h3 className="side-title"><Icon name="users" size={15} /> Absent students</h3>
            {upcoming.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Nobody yet. Students send <code>absent {course.code}</code> to the bot.
              </p>
            ) : (
              <ul className="people">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <span className="avatar sm">{initials(studentLabel(a.students))}</span>
                    <span className="stack" style={{ gap: 0 }}>
                      <strong>{studentLabel(a.students)}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {a.start_date === a.end_date ? fmtDate(a.start_date) : `${fmtDate(a.start_date)} → ${fmtDate(a.end_date)}`} · {channelOf(a.students)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card side">
            <h3 className="side-title"><Icon name="message" size={15} /> Activity</h3>
            <ActivityFeed messages={activity} compact empty="Questions and deliveries for this course show up here." />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* --------------------------------- Lecture card ------------------------------- */

const STEPS: { key: string; label: string; icon: IconName }[] = [
  { key: "source", label: "Recording", icon: "wave" },
  { key: "transcript", label: "Transcript", icon: "file" },
  { key: "summary", label: "Summary", icon: "pen" },
  { key: "sent", label: "Sent", icon: "send" },
];

function stepStates(status: string, working?: string) {
  const s = working === "uploading" ? "created" : working === "transcribing" ? "transcribing" : working === "summarizing" ? "summarizing" : status;
  const order = ["created", "uploaded", "transcribing", "transcribed", "summarizing", "summarized", "sent"];
  const at = order.indexOf(s);
  const done = [at >= 1, at >= 3, at >= 5, at >= 6];
  const active = [working === "uploading", s === "transcribing", s === "summarizing", working === "sending"];
  const firstOpen = done.indexOf(false);
  return STEPS.map((step, i) => ({ ...step, state: active[i] ? "active" : done[i] ? "done" : status === "error" && i === firstOpen ? "error" : "todo" }));
}

function LectureCard({
  lecture: l, index, working, absentCount, onAdd, onTranscribe, onSummarize, onSend, onError,
}: {
  lecture: Lecture;
  index: number;
  working?: string;
  absentCount: number;
  onAdd: (tab: Tab, file?: File | null) => void;
  onTranscribe: () => void;
  onSummarize: () => void;
  onSend: () => void;
  onError: (m: string) => void;
}) {
  const s = summaryOf(l);
  const tpl = s?.template ? templateInfo(s.template) : null;
  const busy = !!working || l.status === "transcribing" || l.status === "summarizing";
  const hasTranscript = ["transcribed", "summarizing", "summarized", "sent"].includes(l.status) || (l.status === "error" && !!s);
  const drop = useFileDrop((f) => {
    const e = checkRecording(f);
    if (e) onError(e);
    else onAdd("upload", f);
  });

  let next: { label: string; icon: IconName; run: () => void; primary?: boolean } | null = null;
  if (busy) next = null;
  else if (l.status === "created") next = { label: "Add recording", icon: "upload", run: () => onAdd("upload"), primary: true };
  else if (l.status === "uploaded" || (l.status === "error" && l.audio_path && !s)) next = { label: l.status === "error" ? "Retry transcription" : "Transcribe", icon: "wave", run: onTranscribe, primary: true };
  else if (l.status === "transcribed" || (l.status === "error" && hasTranscript && !s)) next = { label: "Summarize", icon: "pen", run: onSummarize, primary: true };
  else if (l.status === "summarized" || (l.status === "error" && s)) next = { label: absentCount ? `Send to ${absentCount}` : "Send", icon: "send", run: onSend, primary: true };
  else if (l.status === "sent") next = { label: "Send to new absentees", icon: "send", run: onSend };

  const busyLabel =
    working === "uploading" ? "Uploading…" : working === "sending" ? "Sending…" : l.status === "transcribing" || working === "transcribing" ? "Transcribing…" : "Summarizing…";

  return (
    <article className={`lecture glass${drop.over ? " over" : ""}`} style={{ animationDelay: `${index * 40}ms` }} {...drop.handlers}>
      <div className="lecture-top">
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="date-chip"><Icon name="calendar" size={12} /> {fmtDate(l.lecture_date)}</span>
            {l.duration_s ? <span className="muted" style={{ fontSize: 12 }}>{Math.round(l.duration_s / 60)} min</span> : null}
            {tpl && <span className="pill"><Icon name={tpl.icon as IconName} size={12} /> {tpl.label}</span>}
          </div>
          <h3 className="lecture-title">{l.title}</h3>
        </div>
        <div className="row lecture-actions">
          {s && (
            <a className="btn btn-ghost btn-icon btn-sm" href={`/s/${s.share_token}`} target="_blank" rel="noreferrer" title="View summary" aria-label="View summary">
              <Icon name="eye" size={16} />
            </a>
          )}
          {hasTranscript && !busy && (
            <button type="button" className="btn-ghost btn-icon btn-sm" onClick={onSummarize} title="Re-summarize with another template" aria-label="Re-summarize">
              <Icon name="refresh" size={16} />
            </button>
          )}
          {!busy && (
            <button type="button" className="btn-ghost btn-icon btn-sm" onClick={() => onAdd(l.audio_path ? "upload" : "paste")} title={l.audio_path ? "Replace recording" : "Add recording or transcript"} aria-label="Replace recording">
              <Icon name="upload" size={16} />
            </button>
          )}
          {busy ? (
            <button type="button" className="btn-sm" disabled><Icon name="loader" size={15} /> {busyLabel}</button>
          ) : next ? (
            <button type="button" className={`btn-sm${next.primary ? " btn-primary" : ""}`} onClick={next.run}>
              <Icon name={next.icon} size={15} /> {next.label}
            </button>
          ) : null}
        </div>
      </div>

      <ol className="steps" aria-label="Progress">
        {stepStates(l.status, working).map((st) => (
          <li key={st.key} className={`step ${st.state}`}>
            <span className="step-dot"><Icon name={st.state === "done" ? "check" : st.state === "active" ? "loader" : st.state === "error" ? "alert" : st.icon} size={13} /></span>
            <span className="step-label">{st.label}</span>
          </li>
        ))}
      </ol>

      {l.status === "error" && l.error && <p className="error" style={{ margin: "10px 0 0" }}><Icon name="alert" size={13} /> {l.error}</p>}
      {drop.over && <div className="lecture-drop">Drop to {l.audio_path ? "replace" : "add"} this lecture&apos;s recording</div>}
    </article>
  );
}

/* --------------------------------- Activity feed ------------------------------ */

function ActivityFeed({ messages, compact, empty }: { messages: Overview["messages"]; compact?: boolean; empty: string }) {
  if (!messages.length) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>{empty}</p>;
  return (
    <ul className={`feed${compact ? " compact" : " glass"}`}>
      {messages.map((m) => (
        <li key={m.id} className={m.direction === "in" ? "in" : "out"}>
          <span className={`feed-icon ${m.error ? "err" : ""}`}>
            <Icon name={m.error ? "alert" : m.direction === "in" ? "message" : m.kind === "summary" ? "send" : "message"} size={13} />
          </span>
          <div className="feed-text">
            <span className="feed-meta">
              <strong>{m.direction === "in" ? studentLabel(m.students) : `Bot → ${studentLabel(m.students)}`}</strong>
              <span className="muted"> · {m.kind} · {timeAgo(m.created_at)}</span>
            </span>
            <span className="feed-body">{m.body.length > (compact ? 140 : 220) ? m.body.slice(0, compact ? 140 : 220) + "…" : m.body}</span>
            {m.error && <span className="error">{m.error}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------- Modals ----------------------------------- */

function SendModal({ state, onClose, onConfirm }: { state: SendState; onClose: () => void; onConfirm: () => void }) {
  const n = state.students.length;
  return (
    <Modal
      title="Send to absent students"
      icon="send"
      onClose={onClose}
      footer={
        <>
          <span className="muted foot-hint">Students who already received it are skipped.</span>
          <div className="row">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!n} onClick={onConfirm}><Icon name="send" size={16} /> Send to {n}</button>
          </div>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        “{state.lecture.title}” · {fmtDate(state.lecture.lecture_date)}
      </p>
      {n ? (
        <ul className="people">
          {state.students.map((s, i) => (
            <li key={i}>
              <span className="avatar sm">{initials(studentLabel(s))}</span>
              <span className="stack" style={{ gap: 0 }}>
                <strong>{studentLabel(s)}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{channelOf(s)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          Nobody is marked absent for {state.lecture.courses?.code} on {fmtDate(state.lecture.lecture_date)}. Students send{" "}
          <code>absent {state.lecture.courses?.code}</code> to the bot, or <code>missed {state.lecture.courses?.code}</code> to get the latest class anytime.
        </p>
      )}
    </Modal>
  );
}

function NewCourseModal({ onClose, onCreate }: { onClose: () => void; onCreate: (f: FormData) => void }) {
  return (
    <Modal title="Add a course" icon="plus" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(new FormData(e.currentTarget));
        }}
      >
        <label className="field">
          Course name
          <input name="name" required autoFocus placeholder="e.g. Marketing Analytics" />
        </label>
        <div className="form-grid">
          <label className="field">
            Chat code <span className="muted" style={{ fontWeight: 400 }}>what students type</span>
            <input name="code" required placeholder="MKTG" pattern="[A-Za-z0-9-]{2,12}" title="2–12 letters, digits or dashes" style={{ textTransform: "uppercase" }} />
          </label>
          <label className="field">
            Professor
            <input name="professor" placeholder="e.g. Jane Doe" />
          </label>
        </div>
        <label className="field">
          Official course code <span className="muted" style={{ fontWeight: 400 }}>optional</span>
          <input name="official_code" placeholder="SEP26-TB2627-BAAI-3-13_S1" className="mono" />
        </label>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary"><Icon name="check" size={16} /> Add course</button>
        </div>
      </form>
    </Modal>
  );
}
