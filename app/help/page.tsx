export const dynamic = "force-dynamic";

import Link from "next/link";
import { BookOpen, Building2, CalendarDays, HelpCircle, LifeBuoy, Search, ShieldCheck, Users } from "lucide-react";
import { getKbCategories, listKbArticles } from "@/lib/knowledge-base/server";

const audienceCards = [
  { title: "For Guests", text: "Find answers for planning outings, using search, and saving places.", icon: Users },
  { title: "For Location Owners", text: "Learn how to claim, update, and upgrade your business profile.", icon: Building2 },
  { title: "Reservations", text: "Get help with reservation links, booking flows, and guest questions.", icon: CalendarDays },
  { title: "Claims", text: "Learn how business profile claims and claim codes work.", icon: ShieldCheck },
  { title: "Billing", text: "Understand Pro Plan billing, upgrades, and cancellations.", icon: BookOpen },
  { title: "Contact Support", text: "Find the right support contact for your issue.", icon: LifeBuoy },
];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function HelpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = first(sp.q) ?? "";
  const [categories, { articles }] = await Promise.all([
    getKbCategories(true),
    listKbArticles("user", null, { publicOnly: true, pageSize: 30, q }),
  ]);
  const popular = articles.filter((article) => article.is_featured).slice(0, 6);
  const shownArticles = (popular.length ? popular : articles).slice(0, 9);
  const hasContent = categories.length > 0 || articles.length > 0;

  return (
    <main className="rose-page min-h-screen bg-[#050505] px-4 pb-16 pt-[120px] text-white sm:px-6 sm:pt-[132px] lg:px-8 lg:pt-[144px]">
      <div className="mx-auto max-w-7xl space-y-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#e1062a]/30 bg-gradient-to-br from-[#26030a] via-[#0d0d0d] to-[#050505] p-8 text-center shadow-[0_18px_50px_rgba(225,6,42,0.22)] md:p-12">
          <div className="absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-[#e1062a]/20 blur-3xl" />
          <div className="relative">
            <HelpCircle className="mx-auto mb-4 h-11 w-11 text-red-400" />
            <h1 className="text-4xl font-black tracking-tight md:text-6xl">TheOutHaven Help Center</h1>
            <p className="mx-auto mt-4 max-w-2xl text-rose-100/70">Find answers for planning outings, using search, and managing your account.</p>
            <form action="/help" className="mx-auto mt-8 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 h-5 w-5 text-rose-100/50" />
                <input name="q" defaultValue={q} placeholder="Search help articles…" className="w-full rounded-2xl border border-white/10 bg-black/40 py-3 pl-12 pr-4 text-white outline-none focus:border-[#e1062a]/50" />
              </div>
            </form>
          </div>
        </section>

        {!hasContent ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-rose-100/70">
            Help articles are being added. Please contact <a href="mailto:support@theouthaven.com" className="font-black text-rose-100 underline">support@theouthaven.com</a> for help.
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          {audienceCards.map(({ title, text, icon: Icon }) => (
            <div key={title} className="rounded-3xl border border-white/10 bg-[#1a1a1a]/70 p-5 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10">
              <Icon className="mb-3 h-6 w-6 text-red-400" />
              <h2 className="font-black">{title}</h2>
              <p className="mt-1 text-sm text-rose-100/60">{text}</p>
            </div>
          ))}
        </section>

        {categories.length ? (
          <section>
            <h2 className="mb-4 text-2xl font-black">Categories</h2>
            <div className="grid gap-4 md:grid-cols-4">
              {categories.map((category) => (
                <div key={category.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <BookOpen className="mb-3 h-6 w-6 text-red-400" />
                  <h3 className="font-black">{category.name}</h3>
                  <p className="mt-1 text-sm text-rose-100/60">{category.description}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {shownArticles.length ? (
          <section>
            <h2 className="mb-4 text-2xl font-black">Popular articles</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {shownArticles.map((article) => (
                <Link href={`/help/${article.slug}`} key={article.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10">
                  <h3 className="font-black">{article.title.replace("Public FAQ: ", "")}</h3>
                  <p className="mt-2 text-sm text-rose-100/60">{article.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-[#e1062a]/30 bg-[#e1062a]/10 p-6 text-center shadow-[0_18px_50px_rgba(225,6,42,0.16)]">
          <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <h2 className="text-2xl font-black">Still need help?</h2>
          <p className="mt-2 text-rose-100/70">Contact TheOutHaven support with your profile link, reservation details, claim code, screenshots, or issue description.</p>
          <a href="mailto:support@theouthaven.com" className="mt-5 inline-flex rounded-full bg-[#e1062a] px-5 py-3 font-black text-white">Contact support</a>
        </section>
      </div>
    </main>
  );
}
