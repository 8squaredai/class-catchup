"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { MAX_UPLOAD_MB, isAudioOrVideo } from "./lib";

/* ---------------------------------- Modal ---------------------------------- */

export function Modal({
  title, icon, onClose, children, footer, wide, locked,
}: { title: string; icon?: IconName; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; locked?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !locked && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, locked]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div className={`modal glass${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div className="row" style={{ gap: 10 }}>
            {icon && <span className="modal-icon"><Icon name={icon} size={18} /></span>}
            <h2 style={{ margin: 0 }}>{title}</h2>
          </div>
          <button type="button" className="btn-ghost btn-icon btn-sm" onClick={onClose} disabled={locked} aria-label="Close" title="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- Toasts --------------------------------- */

export type ToastKind = "ok" | "err" | "info" | "busy";
export type Toast = { id: number; kind: ToastKind; title: string; body?: string; progress?: number; action?: { label: string; href: string } };
type ToastApi = { push: (t: Omit<Toast, "id">) => number; update: (id: number, t: Partial<Omit<Toast, "id">>) => void; dismiss: (id: number) => void };

const ToastCtx = createContext<ToastApi | null>(null);
export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
};

const TOAST_ICON: Record<ToastKind, IconName> = { ok: "check", err: "alert", info: "info", busy: "loader" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, kind: ToastKind) => {
      clearTimeout(timers.current.get(id));
      if (kind !== "busy") timers.current.set(id, setTimeout(() => dismiss(id), kind === "err" ? 12000 : 6000));
    },
    [dismiss],
  );

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts, { ...t, id }].slice(-5));
      schedule(id, t.kind);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (patch.kind) schedule(id, patch.kind);
    },
    [schedule],
  );

  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast glass ${t.kind}`}>
            <span className="toast-icon"><Icon name={TOAST_ICON[t.kind]} size={16} /></span>
            <div className="toast-text">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
              {t.progress != null && (
                <span className="progress" aria-label={`${t.progress}%`}><span style={{ width: `${t.progress}%` }} /></span>
              )}
              {t.action && (
                <a href={t.action.href} target="_blank" rel="noreferrer" className="toast-action">
                  {t.action.label} <Icon name="external" size={13} />
                </a>
              )}
            </div>
            <button type="button" className="btn-ghost btn-icon btn-sm" onClick={() => dismiss(t.id)} aria-label="Dismiss" title="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* --------------------------- Drag & drop for files -------------------------- */

/** Validate a dropped/selected recording; returns an error message or null. */
export function checkRecording(file: File): string | null {
  if (!isAudioOrVideo(file)) return `“${file.name}” isn't an audio or video file.`;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024)
    return `“${file.name}” is ${(file.size / 1048576).toFixed(0)} MB; the limit is ${MAX_UPLOAD_MB} MB. Export it as mono MP3 at 64 kbps (a 90-min class ≈ 40 MB).`;
  return null;
}

/** Drag handlers for any element; counts enter/leave so nested children don't flicker the highlight. */
export function useFileDrop(onFile: (f: File) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return {
    over,
    handlers: {
      onDragEnter: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      },
    },
  };
}

export function DropZone({ file, onFile, onError }: { file: File | null; onFile: (f: File) => void; onError: (msg: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const take = (f: File) => {
    const err = checkRecording(f);
    if (err) onError(err);
    else onFile(f);
  };
  const { over, handlers } = useFileDrop(take);
  return (
    <div
      className={`dropzone${over ? " over" : ""}${file ? " has-file" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      {...handlers}
    >
      <input ref={input} type="file" accept="audio/*,video/*" hidden onChange={(e) => e.target.files?.[0] && take(e.target.files[0])} />
      <span className="drop-orb"><Icon name={file ? "check" : "upload"} size={26} /></span>
      {file ? (
        <>
          <strong>{file.name}</strong>
          <span className="muted">{(file.size / 1048576).toFixed(1)} MB · click or drop to replace</span>
        </>
      ) : (
        <>
          <strong>{over ? "Drop it!" : "Drop the class recording here"}</strong>
          <span className="muted">or click to browse · MP3, M4A, WAV, MP4 · up to {MAX_UPLOAD_MB} MB</span>
        </>
      )}
    </div>
  );
}
