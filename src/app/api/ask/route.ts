import { db } from "@/lib/supabase";
import { answerQuestion } from "@/lib/claude";
import { transcriptForPrompt } from "@/lib/transcript";
import { getLecture, getSegments, lectureLabel } from "@/lib/pipeline";

export const maxDuration = 60;

/** Web Q&A from the public summary page. The share token is the only credential. */
export async function POST(request: Request) {
  const { token, question, history } = (await request.json()) as {
    token?: string;
    question?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  if (!token || !question?.trim() || question.length > 1000) return Response.json({ error: "Bad request" }, { status: 400 });
  const s = await db().from("summaries").select("lecture_id").eq("share_token", token).maybeSingle();
  if (!s.data) return Response.json({ error: "Not found" }, { status: 404 });
  const lecture = await getLecture(s.data.lecture_id);
  const segments = await getSegments(lecture.id);
  const res = await answerQuestion({
    lectureLabel: lectureLabel(lecture),
    transcript: transcriptForPrompt(segments),
    question,
    history: (history ?? []).slice(-6),
  });
  return Response.json({ covered: res.covered, answer: res.answer });
}
