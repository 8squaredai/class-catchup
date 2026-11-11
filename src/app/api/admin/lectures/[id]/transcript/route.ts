import { parsePastedTranscript } from "@/lib/transcript";
import { saveSegments } from "@/lib/pipeline";

/** Paste a transcript instead of uploading audio ("[mm:ss] Speaker: text" lines, or VTT/SRT from Zoom/Teams/Panopto). */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/lectures/[id]/transcript">) {
  const { id } = await ctx.params;
  const { text } = await request.json();
  try {
    const segments = await saveSegments(id, parsePastedTranscript(String(text ?? "")));
    return Response.json({ segments });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
