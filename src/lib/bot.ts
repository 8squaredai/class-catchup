import { db, must } from "./supabase";
import { env } from "./env";
import { sendMessage } from "./messaging";
import { answerQuestion, type Turn } from "./claude";
import { transcriptForPrompt } from "./transcript";
import { getLecture, getSegments, deliverSummary, lectureLabel } from "./pipeline";

const TZ = "America/New_York";

export function todayISO(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Student = { id: string; whatsapp: string; name: string | null; consent_at: string | null; opted_out_at: string | null; current_lecture_id: string | null };

async function upsertStudent(whatsapp: string, profileName: string | null): Promise<Student> {
  const existing = await db().from("students").select("*").eq("whatsapp", whatsapp).maybeSingle();
  if (existing.data) {
    if (!existing.data.name && profileName) await db().from("students").update({ name: profileName }).eq("id", existing.data.id);
    return existing.data as Student;
  }
  return must(await db().from("students").insert({ whatsapp, name: profileName }).select("*").single(), "create student") as Student;
}

async function courseList(): Promise<string> {
  const courses = must(await db().from("courses").select("code, name").order("code"), "courses") as { code: string; name: string }[];
  return courses.map((c) => `• ${c.code} – ${c.name}`).join("\n");
}

async function findCourse(code: string) {
  const r = await db().from("courses").select("id, code, name").ilike("code", code).maybeSingle();
  return r.data as { id: string; code: string; name: string } | null;
}

async function helpText() {
  return (
    `👋 *Class Catch-up*\nI send you a summary of classes you miss and answer questions about them from the recording.\n\n` +
    `*Commands*\n` +
    `• *absent BA101* – I'm out today (add a number for more days: *absent BA101 3*)\n` +
    `• *missed BA101* – send me the latest class I missed\n` +
    `• *summary* – resend the current summary\n` +
    `• *stop* – stop all messages\n\n` +
    `Anything else is treated as a question about your latest class.\n\n*Courses*\n${await courseList()}`
  );
}

async function log(studentId: string, direction: "in" | "out", kind: string, body: string, lectureId: string | null = null, extra: Record<string, unknown> = {}) {
  await db().from("messages").insert({ student_id: studentId, direction, kind, body, lecture_id: lectureId, ...extra });
}

async function reply(student: Student, kind: string, body: string, lectureId: string | null = null) {
  const res = await sendMessage(student.whatsapp, body);
  const failed = res.find((r) => r.error);
  await log(student.id, "out", kind, body, lectureId, { twilio_sid: res[0]?.sid ?? null, status: failed ? "failed" : res[0]?.status, error: failed?.error ?? null });
}

const CONSENT_NOTE =
  "By using this you agree to receive class summaries generated from the session recording. Reply *stop* anytime.";

/** Handle one inbound chat message (Telegram or WhatsApp). Runs after the webhook has already answered. */
export async function handleInbound(from: string, rawBody: string, profileName: string | null) {
  const body = rawBody.trim();
  const student = await upsertStudent(from, profileName);
  const lower = body.toLowerCase();

  const absent = lower.match(/^(absent|sick|leave)\s+([a-z0-9-]+)(?:\s+(\d{1,2}))?/);
  const missed = lower.match(/^missed\s+([a-z0-9-]+)/);
  const kind = absent || missed || /^(help|hi|hello|hey|start|menu|stop|unsubscribe|summary)\b/.test(lower) ? "command" : "question";
  await log(student.id, "in", kind, body, kind === "question" ? student.current_lecture_id : null);

  if (/^(stop|unsubscribe)\b/.test(lower)) {
    await db().from("students").update({ opted_out_at: new Date().toISOString() }).eq("id", student.id);
    return reply(student, "system", "You won't get any more messages. Send *absent <course>* anytime to start again.");
  }

  if (absent || missed) {
    const code = (absent ? absent[2] : missed![1]).toUpperCase();
    const course = await findCourse(code);
    if (!course) return reply(student, "system", `I don't know the course "${code}". Available:\n${await courseList()}`);
    await db().from("students").update({ consent_at: student.consent_at ?? new Date().toISOString(), opted_out_at: null }).eq("id", student.id);
    student.consent_at ??= new Date().toISOString();

    if (absent) {
      const days = Math.min(Math.max(Number(absent[3] ?? 1), 1), 30);
      const start = todayISO();
      const end = addDays(start, days - 1);
      await db().from("absences").insert({ student_id: student.id, course_id: course.id, start_date: start, end_date: end, reason: absent[1] });
      await reply(
        student,
        "system",
        `Got it ✅ You're marked absent for *${course.code}* ${days === 1 ? "today" : `from ${start} to ${end}`}. ` +
          `I'll send you the summary after class.\n\n${CONSENT_NOTE}`,
      );
      // If today's class is already summarized, send it straight away.
      const ready = await db().from("lectures").select("id").eq("course_id", course.id).gte("lecture_date", start).lte("lecture_date", end).in("status", ["summarized", "sent"]);
      for (const l of ready.data ?? []) await deliverSummary(student.id, student.whatsapp, l.id);
      return;
    }

    const latest = await db().from("lectures").select("id").eq("course_id", course.id).in("status", ["summarized", "sent"]).order("lecture_date", { ascending: false }).limit(1).maybeSingle();
    if (!latest.data) return reply(student, "system", `There's no summarized ${course.code} class yet. I'll message you when there is one if you send *absent ${course.code}*.`);
    const r = await deliverSummary(student.id, student.whatsapp, latest.data.id);
    if (!r.ok) console.error("deliver failed", r.error);
    return;
  }

  if (/^summary\b/.test(lower)) {
    if (!student.current_lecture_id) return reply(student, "system", await helpText());
    await deliverSummary(student.id, student.whatsapp, student.current_lecture_id);
    return;
  }

  if (kind === "command") return reply(student, "system", await helpText());

  // A question about the student's current lecture.
  if (!student.current_lecture_id) {
    return reply(student, "system", `I don't have a class for you yet. Send *missed <course>* to get the latest one.\n\n${await courseList()}`);
  }
  const lecture = await getLecture(student.current_lecture_id);
  const segments = await getSegments(lecture.id);
  const history = await recentTurns(student.id, lecture.id);
  try {
    const res = await answerQuestion({ lectureLabel: lectureLabel(lecture), transcript: transcriptForPrompt(segments), question: body, history });
    const footer = res.covered ? "" : `\n\n(Not in the recording; worth asking ${lecture.courses.professor ?? "the professor"}.)`;
    await reply(student, "answer", res.answer + footer, lecture.id);
  } catch (e) {
    console.error("answer failed", e);
    await reply(student, "system", "Sorry, I couldn't answer that just now. Please try again in a minute.", lecture.id);
  }
}

/** Last few Q&A turns for this lecture, oldest first, so follow-ups like "and the second one?" work. */
async function recentTurns(studentId: string, lectureId: string): Promise<Turn[]> {
  const rows = (await db()
    .from("messages")
    .select("direction, kind, body")
    .eq("student_id", studentId)
    .eq("lecture_id", lectureId)
    .in("kind", ["question", "answer"])
    .order("created_at", { ascending: false })
    .limit(9)).data ?? [];
  // Drop the question we just logged (it's sent as the new user turn).
  const turns = rows.slice(1).reverse().map((r) => ({ role: r.direction === "in" ? "user" : "assistant", content: r.body } as Turn));
  while (turns.length && turns[0].role !== "user") turns.shift();
  // Merge consecutive same-role turns (API requires alternation).
  const merged: Turn[] = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += "\n" + t.content;
    else merged.push({ ...t });
  }
  if (merged.length && merged[merged.length - 1].role === "user") merged.pop();
  return merged;
}

export { env };
