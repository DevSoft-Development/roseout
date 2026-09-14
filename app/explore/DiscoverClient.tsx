"use client";

import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import type { DiscoverSection } from "@/lib/discover";

const TONE_CLASSES = [
  "from-rose-950/90 via-rose-900/50 to-black",
  "from-fuchsia-950/90 via-purple-900/40 to-black",
  "from-amber-950/90 via-orange-900/40 to-black",
  "from-sky-950/90 via-blue-900/40 to-black",
  "from-emerald-950/90 via-emerald-900/40 to-black",
  "from-zinc-900 via-zinc-950 to-black",
];

export default function DiscoverClient({ sections }: { sections: DiscoverSection[] }) {
  const visible = sections.filter((section) => section.enabled && section.items.length > 0);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070303] text-white">
      <TheOutHavenHeader />

      <section className="relative px-5 pb-10 pt-28 sm:px-6 lg:pt-36">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_0%,rgba(225,6,42,.23),transparent_28%),radial-gradient(circle_at_90%_4%,rgba(255,255,255,.07),transparent_22%),linear-gradient(150deg,#070303_0%,#120605_52%,#070303_100%)]" />
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-[#ff8a9b]">Discover</p>
          <h1 className="mt-3 max-w-4xl text-5xl font-black tracking-[-0.05em] sm:text-6xl lg:text-7xl">Find your next OUTing.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/58 sm:text-lg">Ideas, places, neighborhoods, and complete plans worth going out for — without needing to know what to search.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/create" className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black transition hover:bg-[#ff2148]">Plan something specific</Link>
            <a href="#discover-content" className="rounded-full border border-white/14 bg-white/[0.055] px-5 py-3 text-sm font-black text-white/75 transition hover:bg-white/10 hover:text-white">Browse ideas</a>
          </div>
        </div>
      </section>

      <div id="discover-content" className="mx-auto max-w-7xl space-y-16 px-5 pb-20 sm:px-6">
        {visible.map((section, sectionIndex) => (
          <DiscoverSectionBlock key={section.id} section={section} sectionIndex={sectionIndex} />
        ))}

        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,.2),transparent_38%),linear-gradient(135deg,#17100f,#090706)] p-6 sm:p-8 lg:flex lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#ff8a9b]">Have something specific in mind?</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Tell us what you want. We’ll build the outing.</h2>
          </div>
          <Link href="/create" className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-black text-black transition hover:scale-[1.02] lg:mt-0">Plan my OUTing</Link>
        </section>
      </div>
    </main>
  );
}

function DiscoverSectionBlock({ section, sectionIndex }: { section: DiscoverSection; sectionIndex: number }) {
  const isCompact = section.id === "popular-searches";
  const isFeatured = section.id === "featured-places" || section.id === "featured-outings";

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {section.eyebrow ? <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">{section.eyebrow}</p> : null}
          <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">{section.title}</h2>
          {section.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52 sm:text-base">{section.description}</p> : null}
        </div>
      </div>

      {isCompact ? (
        <div className="flex flex-wrap gap-2.5">
          {section.items.map((item) => (
            <Link key={item.id} href={item.href || `/create?q=${encodeURIComponent(item.query || item.title)}`} className="rounded-full border border-white/12 bg-white/[0.055] px-4 py-2.5 text-sm font-black text-white/78 transition hover:border-[#e1062a]/60 hover:bg-[#e1062a]/12 hover:text-white">{item.title}</Link>
          ))}
        </div>
      ) : (
        <div className={`grid gap-4 ${isFeatured ? "md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {section.items.map((item, index) => {
            const href = item.href || `/create?q=${encodeURIComponent(item.query || item.title)}`;
            const imageStyle = item.image_url ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.82)),url(${item.image_url})` } : undefined;
            return (
              <Link key={item.id} href={href} className={`group relative min-h-[210px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br ${TONE_CLASSES[(index + sectionIndex) % TONE_CLASSES.length]} p-5 shadow-2xl transition duration-300 hover:-translate-y-1 hover:border-white/20`} style={imageStyle}>
                <div className="absolute inset-0 bg-cover bg-center" style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined} />
                {item.image_url ? <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/5" /> : null}
                <div className="relative z-10 flex h-full min-h-[170px] flex-col justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {item.badge ? <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/80 backdrop-blur">{item.badge}</span> : null}
                      {item.sponsored ? <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/72 backdrop-blur">{item.sponsor_label || "Sponsored"}</span> : null}
                    </div>
                    <span className="text-lg text-white/65 transition group-hover:translate-x-1 group-hover:text-white">→</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">{item.title}</h3>
                    {item.subtitle ? <p className="mt-2 max-w-md text-sm leading-6 text-white/66">{item.subtitle}</p> : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
