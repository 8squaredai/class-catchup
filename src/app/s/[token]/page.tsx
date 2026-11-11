import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { db } from "@/lib/supabase";
import AskBox from "./AskBox";

export const dynamic = "force-dynamic";

export default async function SummaryPage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const s = await db().from("summaries").select("markdown, created_at, model").eq("share_token", token).maybeSingle();
  if (!s.data) notFound();
  return (
    <main style={{ maxWidth: 760 }}>
      <article className="card summary">
        <ReactMarkdown>{s.data.markdown}</ReactMarkdown>
        <p className="muted" style={{ fontSize: 12, marginTop: 24 }}>
          Generated from the class recording by Claude ({s.data.model}). Timestamps like [12:34] point to the recording.
          It can make mistakes; check anything important with your professor.
        </p>
      </article>
      <AskBox token={token} />
    </main>
  );
}
