import { db } from "@/lib/supabase";

/** Professor/admin marks a student absent (alternative to the student texting "absent BA101"). */
export async function POST(request: Request) {
  const { whatsapp, name, course_id, start_date, end_date } = await request.json();
  if (!whatsapp || !course_id || !start_date) return Response.json({ error: "whatsapp, course_id, start_date required" }, { status: 400 });
  const number = String(whatsapp).replace(/\s|-/g, "");
  const wa = number.startsWith("whatsapp:") ? number : `whatsapp:${number.startsWith("+") ? number : "+" + number}`;
  const existing = await db().from("students").select("id").eq("whatsapp", wa).maybeSingle();
  let studentId = existing.data?.id as string | undefined;
  if (!studentId) {
    // Admin-added students still need to opt in on WhatsApp (sandbox join + any message) before we can message them.
    const s = await db().from("students").insert({ whatsapp: wa, name: name || null, consent_at: new Date().toISOString() }).select("id").single();
    if (s.error) return Response.json({ error: s.error.message }, { status: 400 });
    studentId = s.data.id;
  }
  const r = await db().from("absences").insert({ student_id: studentId, course_id, start_date, end_date: end_date || start_date, reason: "admin" }).select().single();
  if (r.error) return Response.json({ error: r.error.message }, { status: 400 });
  return Response.json(r.data);
}
