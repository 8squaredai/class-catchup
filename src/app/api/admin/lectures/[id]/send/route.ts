import { sendLecture } from "@/lib/pipeline";

export const maxDuration = 120;

export async function POST(_req: Request, ctx: RouteContext<"/api/admin/lectures/[id]/send">) {
  const { id } = await ctx.params;
  try {
    return Response.json({ results: await sendLecture(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
