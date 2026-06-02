export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { LifeBuoy, ThumbsDown, ThumbsUp } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { KB_SELECT } from "@/lib/knowledge-base/server";

type Props = { params: Promise<{ slug: string }> };

export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params;
  const { data: article } = await supabaseAdmin
    .from("knowledge_base_articles")
    .select(KB_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .in("visibility", ["public", "both"])
    .maybeSingle();
  if (!article) notFound();

  const { data: related } = await supabaseAdmin
    .from("knowledge_base_articles")
    .select("id,title,slug,excerpt")
    .eq("status", "published")
    .in("visibility", ["public", "both"])
    .eq("category_id", article.category_id)
    .neq("id", article.id)
    .limit(4);

  return (
    <main className="rose-page min-h-screen bg-[#050505] px-4 pb-16 pt-[120px] text-white sm:px-6 sm:pt-[132px] lg:px-8 lg:pt-[144px]">
      <article className="mx-auto max-w-4xl space-y-6">
        <Link href="/help" className="font-black text-rose-100 transition hover:text-red-400">← Help Center</Link>
        <section className="rounded-[2rem] border border-[#e1062a]/30 bg-gradient-to-br from-[#26030a] via-[#0d0d0d] to-[#050505] p-8 shadow-[0_18px_50px_rgba(225,6,42,0.18)]">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-rose-100/50">{article.knowledge_base_categories?.name} · Updated {new Date(article.updated_at).toLocaleDateString()}</p>
          <h1 className="mt-3 text-4xl font-black">{article.title.replace("Public FAQ: ", "")}</h1>
          {article.excerpt ? <p className="mt-4 text-lg text-rose-100/70">{article.excerpt}</p> : null}
        </section>
        <section className="whitespace-pre-wrap rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 leading-8 text-rose-50/90">{article.content}</section>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <b>Was this helpful?</b>
          <div className="mt-3 flex gap-3">
            <button className="rounded-full border border-white/10 px-4 py-2 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10"><ThumbsUp className="inline h-4 w-4" /> Helpful</button>
            <button className="rounded-full border border-white/10 px-4 py-2 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10"><ThumbsDown className="inline h-4 w-4" /> Not Helpful</button>
          </div>
        </section>
        {(related ?? []).length ? (
          <section className="grid gap-3 md:grid-cols-2">
            {(related ?? []).map((item) => (
              <Link key={item.id} href={`/help/${item.slug}`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10">
                <b>{item.title.replace("Public FAQ: ", "")}</b>
                <p className="text-sm text-rose-100/60">{item.excerpt}</p>
              </Link>
            ))}
          </section>
        ) : null}
        <section className="rounded-3xl border border-[#e1062a]/30 bg-[#e1062a]/10 p-5">
          <LifeBuoy className="mb-3 h-6 w-6 text-red-400" />
          <b>Need more help? Contact support.</b>
          <p className="mt-2 text-rose-100/70">Trying to claim your business or troubleshoot a reservation? Email <a href="mailto:support@theouthaven.com" className="font-black text-rose-100 underline">support@theouthaven.com</a>.</p>
        </section>
      </article>
    </main>
  );
}
