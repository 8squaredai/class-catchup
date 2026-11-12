import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { db, must, type Lecture, type Segment } from "./supabase";
import { env } from "./env";
import { wordsToSegments, transcriptForPrompt, fmtTime } from "./transcript";
import { summarizeTranscript } from "./claude";
import { sendMessage } from "./messaging";
import { defaultOptions, type SummaryOptions } from "./templates";

export const BUCKET = "lectures";

async function setStatus(id: string, status: string, error: string | null = null) {
  await db().from("lectures").update({ status, error }).eq("id", id);
}

export async function getLecture(id: string) {
  return must(
    await db().from("lectures").select("*, courses(code, name, professor)").eq("id", id).single(),
    "lecture",
  ) as Lecture & { courses: { code: string; name: string; professor: string | null } };
}

export async function getSegments(lectureId: string): Promise<Segment[]> {
  return must(
    await db().from("segments").select("idx, start_s, end_s, speaker, text").eq("lecture_id", lectureId).order("idx"),
    "segments",
  ) as Segment[];
}

/** Give the speaker with the most talk time the label "Professor"; anonymise everyone else. */
export function relabelSpeakers(segments: Segment[]): Segment[] {
  const auto = segments.every((s) => !s.speaker || /^speaker_\d+$/i.test(s.speaker));
  if (!auto) return segments;
  const talk = new Map<string, number>();
  for (const s of segments) if (s.speaker) talk.set(s.speaker, (talk.get(s.speaker) ?? 0) + (Number(s.end_s) - Number(s.start_s)));
  const ranked = [...talk.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const names = new Map(ranked.map((k, i) => [k, i === 0 ? "Professor" : `Student ${i}`]));
  return segments.map((s) => ({ ...s, speaker: s.speaker ? names.get(s.speaker) ?? s.speaker : null }));
}

export async function saveSegments(lectureId: string, segments: Segment[]) {
  const labelled = relabelSpeakers(segments).map((s, idx) => ({ ...s, idx, lecture_id: lectureId }));
  await db().from("segments").delete().eq("lecture_id", lectureId);
  for (let i = 0; i < labelled.length; i += 500) {
    const { error } = await db().from("segments").insert(labelled.slice(i, i + 500));
    if (error) throw new Error(`save segments: ${error.message}`);
  }
  const duration = labelled.length ? Number(labelled[labelled.length - 1].end_s) : 0;
  await db().from("lectures").update({ status: "transcribed", error: null, duration_s: duration }).eq("id", lectureId);
  return labelled.length;
}

/** Recording in Supabase Storage → ElevenLabs Scribe v2 (diarized, word timestamps) → segments. */
export async function transcribeLecture(lectureId: string) {
  const lecture = await getLecture(lectureId);
  if (!lecture.audio_path) throw new Error("No recording uploaded for this lecture.");
  await setStatus(lectureId, "transcribing");
  try {
    const signed = must(
      await db().storage.from(BUCKET).createSignedUrl(lecture.audio_path, 60 * 60),
      "signed url",
    );
    const eleven = new ElevenLabsClient({ apiKey: env.elevenLabsKey() });
    const res = await eleven.speechToText.convert({
      modelId: "scribe_v2",
      sourceUrl: signed.signedUrl,
      diarize: true,
      timestampsGranularity: "word",
      tagAudioEvents: false,
    });
    if (!("words" in res) || !Array.isArray(res.words)) {
      throw new Error("Unexpected ElevenLabs response (multichannel or webhook mode).");
    }
    const segments = wordsToSegments(res.words);
    if (!segments.length) throw new Error("Transcription returned no speech.");
    return await saveSegments(lectureId, segments);
  } catch (e) {
    await setStatus(lectureId, "error", (e as Error).message);
    throw e;
  }
}

export async function summarizeLecture(lectureId: string, options: SummaryOptions = defaultOptions()) {
  const lecture = await getLecture(lectureId);
  const segments = await getSegments(lectureId);
  if (!segments.length) throw new Error("Transcribe the lecture first.");
  await setStatus(lectureId, "summarizing");
  try {
    const result = await summarizeTranscript({
      courseCode: lecture.courses.code,
      courseName: lecture.courses.name,
      title: lecture.title,
      date: lecture.lecture_date,
      transcript: transcriptForPrompt(segments),
      options,
    });
    const { error } = await db().from("summaries").upsert(
      { lecture_id: lectureId, ...result, template: options.template, options: { addons: options.addons, note: options.note }, created_at: new Date().toISOString() },
      { onConflict: "lecture_id" },
    );
    if (error) throw new Error(`save summary: ${error.message}`);
    await setStatus(lectureId, "summarized");
    return result;
  } catch (e) {
    await setStatus(lectureId, "error", (e as Error).message);
    throw e;
  }
}

export async function summaryLink(lectureId: string) {
  const s = must(
    await db().from("summaries").select("share_token, whatsapp_text").eq("lecture_id", lectureId).single(),
    "summary",
  ) as { share_token: string; whatsapp_text: string };
  return { url: `${env.publicBaseUrl()}/s/${s.share_token}`, whatsapp_text: s.whatsapp_text };
}

/** Send the summary to one student and make this lecture their "current" one for follow-up questions. */
export async function deliverSummary(studentId: string, whatsapp: string, lectureId: string) {
  const { url, whatsapp_text } = await summaryLink(lectureId);
  const body = `${whatsapp_text}\n\n📄 Full summary: ${url}`;
  const results = await sendMessage(whatsapp, body);
  const failed = results.find((r) => r.error);
  await db().from("messages").insert({
    student_id: studentId,
    lecture_id: lectureId,
    direction: "out",
    kind: "summary",
    body,
    twilio_sid: results[0]?.sid ?? null,
    status: failed ? "failed" : results[0]?.status ?? "sent",
    error: failed?.error ?? null,
  });
  if (!failed) await db().from("students").update({ current_lecture_id: lectureId }).eq("id", studentId);
  return { ok: !failed, error: failed?.error ?? null };
}

/** Everyone marked absent for this course on the lecture date who consented and hasn't opted out. */
export async function absentStudents(lecture: Lecture) {
  const rows = must(
    await db()
      .from("absences")
      .select("student_id, students!inner(id, whatsapp, name, consent_at, opted_out_at)")
      .eq("course_id", lecture.course_id)
      .lte("start_date", lecture.lecture_date)
      .gte("end_date", lecture.lecture_date),
    "absences",
  ) as unknown as { student_id: string; students: { id: string; whatsapp: string; name: string | null; consent_at: string | null; opted_out_at: string | null } }[];
  const seen = new Set<string>();
  return rows
    .map((r) => r.students)
    .filter((s) => s.consent_at && !s.opted_out_at && !seen.has(s.id) && seen.add(s.id));
}

export async function sendLecture(lectureId: string) {
  const lecture = await getLecture(lectureId);
  const students = await absentStudents(lecture);
  const already = must(
    await db().from("messages").select("student_id").eq("lecture_id", lectureId).eq("kind", "summary").neq("status", "failed"),
    "sent",
  ) as { student_id: string }[];
  const done = new Set(already.map((r) => r.student_id));
  const results: { student: string; ok: boolean; error: string | null; skipped?: boolean }[] = [];
  for (const s of students) {
    if (done.has(s.id)) {
      results.push({ student: s.name ?? s.whatsapp, ok: true, error: null, skipped: true });
      continue;
    }
    const r = await deliverSummary(s.id, s.whatsapp, lectureId);
    results.push({ student: s.name ?? s.whatsapp, ...r });
  }
  if (results.some((r) => r.ok && !r.skipped)) await setStatus(lectureId, "sent");
  return results;
}

export function lectureLabel(l: { title: string; lecture_date: string; courses: { code: string } }) {
  return `${l.courses.code} – ${l.title} (${l.lecture_date})`;
}

export { fmtTime };
