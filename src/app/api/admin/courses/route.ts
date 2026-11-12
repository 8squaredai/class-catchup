import { db } from "@/lib/supabase";

export async function POST(request: Request) {
  const { code, name, professor, official_code, term } = await request.json();
  if (!code || !name) return Response.json({ error: "code and name required" }, { status: 400 });
  const r = await db().from("courses").insert({ code: String(code).toUpperCase().trim().replace(/[^A-Z0-9-]/g, ""), name, professor: professor || null, official_code: official_code || null, term: term || null }).select().single();
  if (r.error) return Response.json({ error: r.error.message }, { status: 400 });
  return Response.json(r.data);
}
