import { requireAdminRole } from "@/lib/admin-auth";
import { getLocationDataQualitySummary } from "@/lib/location-data-quality/summary";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CatalogEnrichmentRunner } from "@/components/admin/location-tools/CatalogEnrichmentRunner";
import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { GoogleEnrichmentClient } from "@/components/admin/location-tools/GoogleEnrichmentClient";
import { NoMatchReviewQueue } from "@/components/admin/location-tools/NoMatchReviewQueue";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminRole(["superadmin", "admin"]);

  let summary: Awaited<ReturnType<typeof getLocationDataQualitySummary>> | null = null;
  let summaryUnavailable = false;

  try {
    summary = await getLocationDataQualitySummary(90);
  } catch (error) {
    summaryUnavailable = true;
    console.error("Location data quality summary unavailable", error);
  }

  const suggestionsResult = await supabaseAdmin
    .from("location_google_food_term_suggestions")
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(500);

  if (suggestionsResult.error) {
    console.error("Google enrichment suggestions unavailable", suggestionsResult.error);
  }

  const suggestions = suggestionsResult.data || [];
  const locationIds = Array.from(
    new Set(
      suggestions
        .filter((suggestion) => suggestion.source_table === "locations" && suggestion.source_id)
        .map((suggestion) => suggestion.source_id),
    ),
  );

  const locationsResult = locationIds.length
    ? await supabaseAdmin
        .from("locations")
        .select("id,address,city,state")
        .in("id", locationIds)
    : { data: [], error: null };

  if (locationsResult.error) {
    console.error("Google review local addresses unavailable", locationsResult.error);
  }

  const localAddressById = new Map(
    (locationsResult.data || []).map((location) => [
      location.id,
      [location.address, location.city, location.state].filter(Boolean).join(", "),
    ]),
  );

  const reviewSuggestions = suggestions.map((suggestion) => ({
    ...suggestion,
    local_address: localAddressById.get(suggestion.source_id) || null,
  }));

  const stats = summary
    ? [
        { label: "Catalog records", value: summary.totalRecords, tone: "white" as const },
        { label: "Stale / never enriched", value: summary.staleGoogleEnrichment, tone: "amber" as const },
        { label: "Missing Google Place ID", value: summary.missingGooglePlaceId, tone: "amber" as const },
        { label: "Actionable generic cuisine", value: summary.genericRestaurantCuisineActionable, tone: "rose" as const },
        { label: "Suppressed generic cuisine", value: summary.genericRestaurantCuisineSuppressed, tone: "white" as const },
        { label: "Weak search metadata", value: summary.weakSearchMetadata, tone: "rose" as const },
        { label: "Ready to auto-apply", value: summary.googleAutoApplyReady, tone: "emerald" as const },
        { label: "Needs manual Google review", value: summary.googleManualReview, tone: "amber" as const },
        { label: "Approved / not yet applied", value: summary.googleApprovedAwaitingNormalization, tone: "white" as const },
        { label: "Applied Google suggestions", value: summary.googleApplied, tone: "white" as const },
        { label: "Actionable search-profile review", value: summary.searchProfilesActionableReview, tone: "rose" as const },
        { label: "Intentionally suppressed profiles", value: summary.searchProfilesSuppressedReview, tone: "white" as const },
      ]
    : [
        { label: "Catalog health", value: "Temporarily unavailable", tone: "rose" as const },
      ];

  return (
    <LocationToolShell
      title="Location Data Intelligence"
      description="One production workflow for database health, Google Places enrichment, classification review, and Search Foundation V3 refresh. Google evidence is reviewed here before it becomes canonical search data."
      stats={stats}
    >
      {summaryUnavailable ? (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
          Catalog health counters are temporarily unavailable. The enrichment runner, no-match review queue, and Google evidence review remain available. Reload later to refresh the counters.
        </div>
      ) : null}

      <ToolCard
        title="Catalog-wide enrichment runner"
        description="Audit the canonical database first, estimate Google API calls before spending, then process the repair queue in resumable minute-by-minute batches with an explicit API-call budget."
      >
        <CatalogEnrichmentRunner />
      </ToolCard>

      <ToolCard
        title="No-match review queue"
        description="Triage Google no-match records by likely closed or renamed, bad source name, address-only, parent or embedded venue, and unresolved. Decisions here record admin review state only and never unpublish a location automatically."
      >
        <NoMatchReviewQueue />
      </ToolCard>

      <ToolCard
        title="Google evidence review"
        description="Resolve ambiguous Google identity matches with the local and Google addresses side by side, clear risk signals, and controlled approve or reject actions."
      >
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <PipelineStep number="1" title="Compare identity" text="Review local versus Google name and address before accepting any suggested metadata." />
          <PipelineStep number="2" title="Check risk signals" text="Name similarity, address agreement, conflict flags, and distance explain why a row needs review." />
          <PipelineStep number="3" title="Resolve safely" text="Approve only the correct identity. Reject mismatches. Accepted evidence queues the V3 search-profile refresh." />
        </div>
        <GoogleEnrichmentClient initialSuggestions={reviewSuggestions as any} />
      </ToolCard>

      <ToolCard
        title="Quality policy"
        description="Actionable counters include records that can actually affect public search. Suppressed counters preserve visibility into inactive or intentionally excluded inventory without presenting it as a launch blocker. Search Foundation V3 remains the canonical classifier, and catalog runs are budgeted and resumable rather than one uncontrolled sweep."
      >
        <div className="grid gap-3 text-sm text-white/65 md:grid-cols-2">
          <Policy label="Default staleness threshold" value={summary ? `${summary.staleDays} days` : "Unavailable"} />
          <Policy label="All generic cuisine rows" value={summary ? String(summary.genericRestaurantCuisine) : "Unavailable"} />
          <Policy label="All flagged search profiles" value={summary ? String(summary.searchProfilesNeedingReview) : "Unavailable"} />
          <Policy label="Canonical records" value={summary ? String(summary.totals.locations) : "Unavailable"} />
          <Policy label="Restaurant source records" value={summary ? String(summary.totals.restaurants) : "Unavailable"} />
          <Policy label="Activity source records" value={summary ? String(summary.totals.activities) : "Unavailable"} />
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
