import type { Segment } from "./supabase";

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function parseTime(t: string): number {
  const parts = t.trim().replace(",", ".").split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

type Word = { text: string; start?: number; end?: number; type: string; speakerId?: string };

/**
 * Group ElevenLabs Scribe words into readable segments.
 * A new segment starts when the speaker changes, or a sentence ends after ~25s, or at ~45s regardless.
 */
export function wordsToSegments(words: Word[]): Segment[] {
  const segments: Segment[] = [];
  let cur: { start: number; end: number; speaker: string | null; parts: string[] } | null = null;

  const flush = () => {
    if (cur && cur.parts.join("").trim()) {
      segments.push({
        idx: segments.length,
        start_s: round(cur.start),
        end_s: round(cur.end),
        speaker: cur.speaker,
        text: cur.parts.join("").replace(/\s+/g, " ").trim(),
      });
    }
    cur = null;
  };

  for (const w of words) {
    const speaker = w.speakerId ?? null;
    const start: number = w.start ?? cur?.end ?? 0;
    const end: number = w.end ?? start;
    if (w.type === "audio_event") continue;

    if (w.type === "word" && cur && cur.speaker !== speaker) flush();
    if (!cur) {
      if (w.type !== "word") continue;
      cur = { start, end, speaker, parts: [] };
    }
    cur.parts.push(w.text);
    cur.end = end;

    const len = cur.end - cur.start;
    const sentenceEnd = /[.?!]$/.test(w.text.trim());
    if ((sentenceEnd && len > 25) || len > 45) flush();
  }
  flush();
  return segments;
}

/**
 * Parse a pasted transcript. Supported:
 *  - lines like "[12:34] Speaker: text" or "[1:02:03] text"
 *  - WebVTT / SRT cue blocks ("00:01:02.000 --> 00:01:05.000" followed by text)
 */
export function parsePastedTranscript(raw: string): Segment[] {
  const text = raw.replace(/\r/g, "");
  const segments: Segment[] = [];

  const cueRe = /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = cueRe.exec(text))) {
    let body = m[3].trim();
    let speaker: string | null = null;
    const v = body.match(/^<v\s+([^>]+)>/);
    if (v) { speaker = v[1].trim(); body = body.replace(/<[^>]+>/g, ""); }
    if (body) segments.push({ idx: segments.length, start_s: parseTime(m[1]), end_s: parseTime(m[2]), speaker, text: body.replace(/\s+/g, " ") });
  }
  if (segments.length) return mergeShort(segments);

  const lineRe = /^\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(?:([^:\n]{1,40}):\s+)?(.+)$/;
  for (const line of text.split("\n")) {
    const lm = line.match(lineRe);
    if (lm) {
      segments.push({ idx: segments.length, start_s: parseTime(lm[1]), end_s: parseTime(lm[1]), speaker: lm[2]?.trim() || null, text: lm[3].trim() });
    } else if (line.trim() && segments.length) {
      segments[segments.length - 1].text += " " + line.trim();
    }
  }
  for (let i = 0; i < segments.length; i++) {
    segments[i].end_s = i + 1 < segments.length ? segments[i + 1].start_s : segments[i].start_s + 30;
  }
  if (!segments.length) {
    throw new Error('Could not find timestamps. Use lines like "[12:34] Prof: text" or paste a .vtt/.srt file.');
  }
  return segments;
}

/** VTT cues are often 2-5s; merge consecutive cues from the same speaker into ~30s segments. */
function mergeShort(cues: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const c of cues) {
    const last = out[out.length - 1];
    if (last && last.speaker === c.speaker && c.end_s - last.start_s < 30) {
      last.text += " " + c.text;
      last.end_s = c.end_s;
    } else {
      out.push({ ...c, idx: out.length });
    }
  }
  return out;
}

/** The form Claude sees: one line per segment, timestamp first so it can cite it. */
export function transcriptForPrompt(segments: Segment[]): string {
  return segments
    .map((s) => `[${fmtTime(Number(s.start_s))}] ${s.speaker ? s.speaker + ": " : ""}${s.text}`)
    .join("\n");
}

/** Extract every [mm:ss] / [h:mm:ss] citation from a model answer. */
export function extractCitations(answer: string): number[] {
  return [...answer.matchAll(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g)].map((m) => parseTime(m[1]));
}

/** A citation is valid if it points inside the lecture (within 10s of a real segment start..end). */
export function citationIsValid(t: number, segments: Segment[]): boolean {
  return segments.some((s) => t >= Number(s.start_s) - 10 && t <= Number(s.end_s) + 10);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
