import { db } from "@/lib/supabase";

export async function POST(request: Request) {
  const { course_id, title, lecture_date } = await request.json();
  if (!course_id || !title || !lecture_date) return Response.json({ error: "course_id, title, lecture_date required" }, { status: 400 });
  const r = await db().from("lectures").insert({ course_id, title, lecture_date }).select().single();
  if (r.error) return Response.json({ error: r.error.message }, { status: 400 });
  return Response.json(r.data);
}
