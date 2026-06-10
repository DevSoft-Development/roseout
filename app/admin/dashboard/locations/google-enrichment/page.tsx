import { GoogleEnrichmentClient } from "./GoogleEnrichmentClient";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export default async function GoogleLocationEnrichmentPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.locations);
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
        <nav className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/30 p-2 text-sm font-black">
          <Link href="/admin/dashboard/locations" className="rounded-full px-4 py-2 text-white/55 hover:bg-white/10 hover:text-white">Locations</Link>
          <Link href="/admin/dashboard/locations/google-enrichment" className="rounded-full bg-white px-4 py-2 text-black">Google Enrichment</Link>
        </nav>
        <div className="mt-8">
          <GoogleEnrichmentClient initialSuggestions={suggestions || []} />
        </div>
      </section>
    </main>
  );
}
