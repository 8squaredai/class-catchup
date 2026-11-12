import { summarizeLecture } from "@/lib/pipeline";
import { parseOptions } from "@/lib/templates";

export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/admin/lectures/[id]/summarize">) {
  const { id } = await ctx.params;
  try {
    const options = parseOptions(await req.json().catch(() => ({})));
    const r = await summarizeLecture(id, options);
    return Response.json({ ok: true, input_tokens: r.input_tokens, output_tokens: r.output_tokens });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
