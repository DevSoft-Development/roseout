import { GoogleEnrichmentClient } from "./GoogleEnrichmentClient";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function GoogleLocationEnrichmentPage() {
  const { data: suggestions } = await supabaseAdmin
    .from("location_google_food_term_suggestions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="min-h-screen bg-[#080407] text-white">
      <section className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">TheOutHaven Intelligence</p>
        <h1 className="mt-3 text-5xl font-black tracking-tight">Google Places Enrichment</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
          Preview, review, and safely apply Google Places metadata and food/search term suggestions. Google data is treated as enrichment evidence and never removes existing TheOutHaven terms.
        </p>
        <div className="mt-8">
          <GoogleEnrichmentClient initialSuggestions={suggestions || []} />
        </div>
      </section>
    </main>
  );
}
