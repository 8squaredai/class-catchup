import { db } from "@/lib/supabase";
import { BUCKET } from "@/lib/pipeline";

/** Signed upload URL so the browser uploads the recording straight to Supabase Storage (bypasses Vercel's 4.5MB body limit). */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/lectures/[id]/upload-url">) {
  const { id } = await ctx.params;
  const { filename } = await request.json();
  const ext = String(filename || "audio.mp3").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
  const path = `${id}/recording.${ext}`;
  const r = await db().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (r.error) return Response.json({ error: r.error.message }, { status: 400 });
  await db().from("lectures").update({ audio_path: path, status: "uploaded", error: null }).eq("id", id);
  return Response.json({ path, token: r.data.token, signedUrl: r.data.signedUrl });
}
