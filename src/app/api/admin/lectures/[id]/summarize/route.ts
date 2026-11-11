import { summarizeLecture } from "@/lib/pipeline";

export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<"/api/admin/lectures/[id]/summarize">) {
  const { id } = await ctx.params;
  try {
    const r = await summarizeLecture(id);
    return Response.json({ ok: true, input_tokens: r.input_tokens, output_tokens: r.output_tokens });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
