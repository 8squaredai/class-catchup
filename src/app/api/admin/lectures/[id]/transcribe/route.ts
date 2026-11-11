import { transcribeLecture } from "@/lib/pipeline";

export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<"/api/admin/lectures/[id]/transcribe">) {
  const { id } = await ctx.params;
  try {
    const segments = await transcribeLecture(id);
    return Response.json({ segments });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
