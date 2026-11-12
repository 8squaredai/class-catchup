"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtClock } from "./lib";

type Phase = "idle" | "asking" | "recording" | "paused" | "done";
const BARS = 28;

function pickMime(): { mime: string; ext: string } {
  const options = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    { mime: "audio/webm", ext: "webm" },
  ];
  return options.find((o) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o.mime)) ?? { mime: "", ext: "webm" };
}

/**
 * Records the class from the laptop microphone. 48 kbps Opus keeps a 90-minute class around 32 MB.
 * Calls onChange(file) after Stop (null while recording / after discard) and onActive(true) while the
 * mic is live, so the parent can block closing and enable "Save recording".
 */
export function Recorder({ onChange, onActive, onError }: { onChange: (f: File | null) => void; onActive: (active: boolean) => void; onError: (msg: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number>(0);
  const bars = useRef<HTMLDivElement>(null);
  const clock = useRef({ startedAt: 0, banked: 0 });
  const live = phase === "recording" || phase === "paused";

  useEffect(() => onActive(live), [live, onActive]);

  // Timer that survives pause/resume.
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed(clock.current.banked + (Date.now() - clock.current.startedAt) / 1000), 250);
    return () => clearInterval(t);
  }, [phase]);

  // Warn before leaving the page with an unsaved recording.
  useEffect(() => {
    if (phase === "idle" || phase === "asking") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  function teardown() {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  }
  useEffect(() => () => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    teardown();
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function meter(source: MediaStream) {
    const ctx = new AudioContext();
    audioCtx.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(source).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const el = bars.current;
      if (el) {
        const step = Math.floor(data.length / BARS);
        for (let i = 0; i < BARS; i++) {
          const v = data[i * step] / 255;
          (el.children[i] as HTMLElement).style.transform = `scaleY(${Math.max(0.08, rec.current?.state === "paused" ? 0.08 : v)})`;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("This browser can't record audio. Use Chrome, Edge or Safari.");
      return;
    }
    setPhase("asking");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      const { mime, ext } = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 });
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        const type = r.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        onChange(new File([blob], `class-recording-${stamp}.${ext}`, { type }));
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("done");
        teardown();
      };
      rec.current = r;
      r.start(1000);
      clock.current = { startedAt: Date.now(), banked: 0 };
      setElapsed(0);
      setPreviewUrl(null);
      onChange(null);
      meter(s);
      setPhase("recording");
    } catch (e) {
      setPhase("idle");
      teardown();
      onError((e as Error).name === "NotAllowedError" ? "Microphone access was blocked. Allow it in the browser's address bar and try again." : (e as Error).message);
    }
  }

  function pause() {
    rec.current?.pause();
    clock.current.banked += (Date.now() - clock.current.startedAt) / 1000;
    setPhase("paused");
  }
  function resume() {
    rec.current?.resume();
    clock.current.startedAt = Date.now();
    setPhase("recording");
  }
  function stop() {
    if (phase === "recording") clock.current.banked += (Date.now() - clock.current.startedAt) / 1000;
    setElapsed(clock.current.banked);
    rec.current?.stop();
  }
  function discard() {
    onChange(null);
    setPreviewUrl(null);
    setElapsed(0);
    setPhase("idle");
  }

  return (
    <div className={`recorder ${phase}`}>
      <div className="rec-stage">
        <button
          type="button"
          className={`rec-orb${live ? " live" : ""}`}
          onClick={phase === "idle" || phase === "done" ? start : stop}
          disabled={phase === "asking"}
          aria-label={live ? "Stop recording" : "Start recording"}
          title={live ? "Stop recording" : "Start recording"}
        >
          <span className="ring r1" /><span className="ring r2" />
          <Icon name={live ? "stop" : phase === "asking" ? "loader" : "mic"} size={30} />
        </button>
        <div className="rec-readout">
          <span className="rec-state">
            {phase === "idle" && "Ready to record"}
            {phase === "asking" && "Waiting for microphone permission…"}
            {phase === "recording" && <><span className="rec-dot" /> Recording</>}
            {phase === "paused" && "Paused"}
            {phase === "done" && "Recording finished"}
          </span>
          <span className="rec-clock mono">{fmtClock(elapsed)}</span>
        </div>
      </div>

      <div className="rec-bars" ref={bars} aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => <span key={i} />)}
      </div>

      {live && (
        <div className="row" style={{ justifyContent: "center" }}>
          {phase === "recording" ? (
            <button type="button" onClick={pause}><Icon name="pause" size={16} /> Pause</button>
          ) : (
            <button type="button" onClick={resume}><Icon name="play" size={16} /> Resume</button>
          )}
          <button type="button" className="btn-danger" onClick={stop}><Icon name="stop" size={16} /> Stop</button>
        </div>
      )}

      {phase === "done" && previewUrl && (
        <div className="stack" style={{ alignItems: "center" }}>
          <audio src={previewUrl} controls style={{ width: "100%" }} />
          <button type="button" className="btn-ghost btn-sm" onClick={discard}><Icon name="trash" size={14} /> Discard and record again</button>
        </div>
      )}

      {phase === "idle" && (
        <p className="muted" style={{ textAlign: "center", margin: 0, fontSize: 13 }}>
          Put the laptop near the front of the room. Keep this tab open while recording; you can switch to your slides.
        </p>
      )}
    </div>
  );
}
