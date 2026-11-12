import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Icon, type IconName } from "@/components/Icon";
import { TopBar } from "@/components/TopBar";
import { db } from "@/lib/supabase";
import { templateInfo } from "@/lib/templates";
import AskBox from "./AskBox";

export const dynamic = "force-dynamic";

export default async function SummaryPage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const s = await db().from("summaries").select("markdown, created_at, model, template").eq("share_token", token).maybeSingle();
  if (!s.data) notFound();
  const tpl = templateInfo(s.data.template);
  return (
    <>
      <TopBar title="Class Catch-up" />
      <main style={{ maxWidth: 800 }}>
        <article className="card summary" style={{ padding: "28px 32px", marginTop: 8 }}>
          <span className="pill live"><Icon name={tpl.icon as IconName} size={12} /> {tpl.label}</span>
          <ReactMarkdown>{s.data.markdown}</ReactMarkdown>
          <p className="muted" style={{ fontSize: 12, marginTop: 28, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Icon name="info" size={14} style={{ flex: "none", marginTop: 2 }} />
            Generated from the class recording by Claude ({s.data.model}). Timestamps like [12:34] point to the moment in the recording. It can make
            mistakes; check anything important with your professor.
          </p>
        </article>
        <AskBox token={token} />
      </main>
    </>
  );
}
