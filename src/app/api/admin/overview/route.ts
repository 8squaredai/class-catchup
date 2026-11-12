import { db } from "@/lib/supabase";

export async function GET() {
  const [courses, lectures, absences, messages] = await Promise.all([
    db().from("courses").select("*").order("code"),
    db().from("lectures").select("*, courses(code), summaries(share_token, template)").order("lecture_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    db().from("absences").select("*, students(name, whatsapp, consent_at, opted_out_at), courses(code)").order("created_at", { ascending: false }).limit(200),
    db().from("messages").select("*, students(name, whatsapp)").order("created_at", { ascending: false }).limit(60),
  ]);
  return Response.json({
    courses: courses.data ?? [],
    lectures: lectures.data ?? [],
    absences: absences.data ?? [],
    messages: messages.data ?? [],
  });
}
