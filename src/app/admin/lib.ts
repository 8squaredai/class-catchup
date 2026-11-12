/** Types and helpers shared by the admin screens (client-side). */

export type Course = { id: string; code: string; name: string; professor: string | null; official_code: string | null; term: string | null };
export type Summary = { share_token: string; template?: string | null };
export type Lecture = {
  id: string;
  course_id: string;
  title: string;
  lecture_date: string;
  status: string;
  error: string | null;
  audio_path: string | null;
  duration_s: number | null;
  created_at: string;
  courses: { code: string } | null;
  summaries: Summary | Summary[] | null;
};
export type Student = { id?: string; name: string | null; whatsapp: string; consent_at?: string | null; opted_out_at?: string | null };
export type Absence = { id: string; course_id: string; student_id: string; start_date: string; end_date: string; reason: string | null; students: Student | null; courses: { code: string } | null };
export type Message = { id: number; lecture_id: string | null; direction: string; kind: string; body: string; status: string | null; error: string | null; created_at: string; students: Student | null };
export type Overview = { courses: Course[]; lectures: Lecture[]; absences: Absence[]; messages: Message[] };

export const MAX_UPLOAD_MB = 50;
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

/** PUT a file to a Supabase signed upload URL with progress (fetch can't report upload progress). */
export function uploadToSignedUrl(signedUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). The limit is ${MAX_UPLOAD_MB} MB; export audio as mono MP3 at 64 kbps.`)));
    xhr.onerror = () => reject(new Error("Upload failed: network error."));
    xhr.send(form);
  });
}

export const summaryOf = (l: Lecture) => (Array.isArray(l.summaries) ? l.summaries[0] : l.summaries) ?? null;

/** Students absent for this course on this date who consented and haven't opted out (mirrors the server rule). */
export function absentOn(absences: Absence[], courseId: string, date: string): Student[] {
  const seen = new Set<string>();
  return absences
    .filter((a) => a.course_id === courseId && a.start_date <= date && a.end_date >= date && a.students && a.students.consent_at && !a.students.opted_out_at)
    .filter((a) => !seen.has(a.student_id) && !!seen.add(a.student_id))
    .map((a) => a.students as Student);
}

export const studentLabel = (s: Student | null) => s?.name || (s?.whatsapp.startsWith("telegram:") ? "Telegram student" : s?.whatsapp) || "Student";
export const channelOf = (s: Student | null) => (s?.whatsapp.startsWith("telegram:") ? "Telegram" : "WhatsApp");
export const initials = (name: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export function fmtClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function isAudioOrVideo(file: File) {
  return file.type.startsWith("audio/") || file.type.startsWith("video/") || /\.(mp3|m4a|wav|aac|ogg|oga|opus|webm|flac|mp4|mov|m4v)$/i.test(file.name);
}
