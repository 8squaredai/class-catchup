import { db } from "@/lib/supabase";

export async function GET() {
  const [courses, lectures, absences, messages] = await Promise.all([
    db().from("courses").select("*").order("code"),
    db().from("lectures").select("*, courses(code), summaries(share_token)").order("lecture_date", { ascending: false }).limit(50),
    db().from("absences").select("*, students(name, whatsapp), courses(code)").order("created_at", { ascending: false }).limit(50),
    db().from("messages").select("*, students(name, whatsapp)").order("created_at", { ascending: false }).limit(40),
  ]);
  return Response.json({
    courses: courses.data ?? [],
    lectures: lectures.data ?? [],
    absences: absences.data ?? [],
    messages: messages.data ?? [],
  });
}
