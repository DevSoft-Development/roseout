import { requireAdminRole } from "@/lib/admin-auth";
import { getLocationDataQualitySummary } from "@/lib/location-data-quality/summary";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { GoogleEnrichmentClient } from "@/components/admin/location-tools/GoogleEnrichmentClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminRole(["superadmin", "admin"]);

  const [summary, suggestionsResult] = await Promise.all([
    getLocationDataQualitySummary(90),
    supabaseAdmin
      .from("location_google_food_term_suggestions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  const suggestions = suggestionsResult.data || [];

  return (
    <LocationToolShell
      title="Location Data Intelligence"
      description="One production workflow for database health, Google Places enrichment, classification review, and Search Foundation V3 refresh. Google evidence is reviewed here before it becomes canonical search data."
      stats={[
        { label: "Catalog records", value: summary.totalRecords, tone: "white" },
        { label: "Stale / never enriched", value: summary.staleGoogleEnrichment, tone: "amber" },
        { label: "Missing Google Place ID", value: summary.missingGooglePlaceId, tone: "amber" },
        { label: "Generic restaurant cuisine", value: summary.genericRestaurantCuisine, tone: "rose" },
        { label: "Weak search metadata", value: summary.weakSearchMetadata, tone: "rose" },
        { label: "Google suggestions to review", value: summary.pendingGoogleReview, tone: "amber" },
        { label: "Search profiles needing review", value: summary.searchProfilesNeedingReview, tone: "rose" },
      ]}
    >
      <ToolCard
        title="Unified enrichment pipeline"
        description="Step 1: preview weak or stale records. Step 2: create bounded Google review suggestions. Step 3: approve strong evidence. Approved source rows are synced to canonical locations and automatically queued for Search Foundation V3 reclassification."
      >
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <PipelineStep number="1" title="Audit & preview" text="Inspect weak records before spending Google API calls." />
          <PipelineStep number="2" title="Google evidence" text="Match Places, enrich metadata, and create review suggestions in safe batches." />
          <PipelineStep number="3" title="Canonical refresh" text="Approval syncs canonical locations and queues the V3 search profile refresh." />
        </div>
        <GoogleEnrichmentClient initialSuggestions={suggestions as any} />
      </ToolCard>

      <ToolCard
        title="Quality policy"
        description="The consolidated workflow treats Google as evidence, not as the final taxonomy. The Search Foundation V3 profile builder remains the sole canonical classifier."
      >
        <div className="grid gap-3 text-sm text-white/65 md:grid-cols-2">
          <Policy label="Staleness threshold" value={`${summary.staleDays} days`} />
          <Policy label="Canonical records" value={String(summary.totals.locations)} />
          <Policy label="Restaurant source records" value={String(summary.totals.restaurants)} />
          <Policy label="Activity source records" value={String(summary.totals.activities)} />
        </div>
      </ToolCard>
    </LocationToolShell>
  );
}

function PipelineStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white">{number}</div>
      <p className="font-black text-white">{title}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-white/50">{text}</p>
    </div>
  );
}

function Policy({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <span>{label}</span>
      <strong className="text-white">{value}</strong>
    </div>
  );
}
