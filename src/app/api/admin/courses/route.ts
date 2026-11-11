import { db } from "@/lib/supabase";

export async function POST(request: Request) {
  const { code, name, professor } = await request.json();
  if (!code || !name) return Response.json({ error: "code and name required" }, { status: 400 });
  const r = await db().from("courses").insert({ code: String(code).toUpperCase().trim(), name, professor: professor || null }).select().single();
  if (r.error) return Response.json({ error: r.error.message }, { status: 400 });
  return Response.json(r.data);
}
