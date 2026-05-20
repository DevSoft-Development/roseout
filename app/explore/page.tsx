import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

const sections = ["Trending", "Nearby", "Date Night", "Rooftops", "Brunch", "Luxury", "Group Friendly"];

export default function ExplorePage() {
  return (
    <main className="min-h-screen bg-[#070303] px-4 pb-20 pt-28 text-white sm:px-6 lg:px-8">
      <TheOutHavenHeader />
      <div className="mx-auto max-w-7xl">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Explore TheOutHaven</h1>
        <p className="mt-4 max-w-3xl text-white/70">Discover restaurants, activities, trending places, categories, and curated experiences.</p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-black">{section}</h2>
                <Link href="/create" className="text-sm font-bold text-red-200">Create Outing →</Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <article key={`${section}-${i}`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 transition hover:-translate-y-1 hover:border-[#e1062a]/50">
                    <div className="h-32 rounded-2xl bg-gradient-to-br from-white/10 to-[#e1062a]/20" />
                    <h3 className="mt-3 font-black">{section} Place {i}</h3>
                    <p className="text-sm text-white/65">NYC · 4.6 ★</p>
                    <p className="mt-1 text-xs text-red-200">Curated · Popular</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
