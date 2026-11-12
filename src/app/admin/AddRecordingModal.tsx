"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { DropZone, Modal } from "./ui";
import { Recorder } from "./Recorder";
import { today, type Course, type Lecture } from "./lib";

export type Source = { kind: "file"; file: File } | { kind: "text"; text: string };
export type Tab = "upload" | "record" | "paste";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "upload", label: "Upload", icon: "upload" },
  { id: "record", label: "Record now", icon: "mic" },
  { id: "paste", label: "Paste transcript", icon: "clipboard" },
];

/** One dialog for "new lecture" and "add/replace the recording of an existing lecture". */
export function AddRecordingModal({
  course, lecture, initialTab = "upload", initialFile = null, onClose, onSubmit, onError,
}: {
  course: Course;
  lecture?: Lecture | null;
  initialTab?: Tab;
  initialFile?: File | null;
  onClose: () => void;
  onSubmit: (v: { title: string; date: string; source: Source }) => void;
  onError: (msg: string) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [file, setFile] = useState<File | null>(initialFile);
  const [recFile, setRecFile] = useState<File | null>(null);
  const [recActive, setRecActive] = useState(false);
  const [text, setText] = useState("");

  const needsTitle = !lecture;
  const titleOk = !needsTitle || title.trim().length > 0;
  const ready =
    titleOk && (tab === "upload" ? !!file : tab === "record" ? !!recFile && !recActive : text.trim().length > 20);

  function close() {
    if (recActive) return;
    if (recFile && !confirm("Discard this recording? It hasn't been saved.")) return;
    onClose();
  }

  function submit() {
    if (!ready) return;
    const source: Source = tab === "upload" ? { kind: "file", file: file! } : tab === "record" ? { kind: "file", file: recFile! } : { kind: "text", text };
    onSubmit({ title: title.trim(), date, source });
  }

  const cta =
    tab === "record" ? { label: "Save recording", icon: "check" as const } :
    tab === "paste" ? { label: "Save transcript", icon: "check" as const } :
    { label: lecture ? "Upload & transcribe" : "Create & transcribe", icon: "upload" as const };

  return (
    <Modal
      title={lecture ? `Recording for “${lecture.title}”` : `New lecture · ${course.code}`}
      icon={lecture ? "wave" : "plus"}
      onClose={close}
      locked={recActive}
      wide
      footer={
        <>
          <span className="muted foot-hint">
            {tab === "record" && recActive ? "Stop the recording to save it." : "Transcription starts automatically, then you pick a summary style."}
          </span>
          <div className="row">
            <button type="button" className="btn-ghost" onClick={close} disabled={recActive}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!ready} onClick={submit}>
              <Icon name={cta.icon} size={16} /> {cta.label}
            </button>
          </div>
        </>
      }
    >
      {needsTitle && (
        <div className="form-grid">
          <label className="field" style={{ gridColumn: "span 2" }}>
            Lecture title
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Session 4: Decision trees" maxLength={140} />
          </label>
          <label className="field">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      )}

      <div className="segmented" role="tablist" aria-label="Recording source">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "on" : ""}
            onClick={() => !recActive && setTab(t.id)}
            disabled={recActive && tab !== t.id}
          >
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === "upload" && <DropZone file={file} onFile={setFile} onError={onError} />}
        {tab === "record" && <Recorder onChange={setRecFile} onActive={setRecActive} onError={onError} />}
        {tab === "paste" && (
          <>
            <textarea
              className="mono"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"[00:00] Professor: Good morning everyone...\n[00:42] Student 1: ...\n\nOr paste a Zoom / Teams .vtt or .srt caption file."}
            />
            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Skips transcription: you go straight to picking a summary style.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
