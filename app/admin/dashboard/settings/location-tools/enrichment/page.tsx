import { requireAdminRole } from "@/lib/admin-auth";
import { getLocationDataQualitySummary } from "@/lib/location-data-quality/summary";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CatalogEnrichmentRunner } from "@/components/admin/location-tools/CatalogEnrichmentRunner";
import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { GoogleEnrichmentClient } from "@/components/admin/location-tools/GoogleEnrichmentClient";
import { NoMatchReviewQueue } from "@/components/admin/location-tools/NoMatchReviewQueue";
import { RecentImportsProcessing } from "@/components/admin/location-tools/RecentImportsProcessing";

export const dynamic = "force-dynamic";

function lastRun(value: string | null | undefined) {
  if (!value) return "No successful run recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString("en-US", { timeZone: "America/New_York" });
}

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
        { label: "Dedupe queue", value: summary.dedupeUnknownBacklog, tone: summary.dedupeUnknownBacklog ? "rose" as const : "emerald" as const },
        { label: "Publication queue", value: summary.publicationBacklog, tone: summary.publicationBacklog ? "amber" as const : "emerald" as const },
        { label: "Menu v2 backlog", value: summary.menuV2Backlog, tone: summary.menuV2Backlog ? "amber" as const : "emerald" as const },
        { label: "Semantic refresh pending", value: summary.semanticRefreshPending, tone: summary.semanticRefreshPending ? "amber" as const : "emerald" as const },
        { label: "Missing Google Place ID", value: summary.missingGooglePlaceId, tone: "amber" as const },
        { label: "Stale / never enriched", value: summary.staleGoogleEnrichment, tone: "amber" as const },
        { label: "Actionable search-profile review", value: summary.searchProfilesActionableReview, tone: "rose" as const },
        { label: "Weak search metadata", value: summary.weakSearchMetadata, tone: "rose" as const },
        { label: "Ready to auto-apply", value: summary.googleAutoApplyReady, tone: "emerald" as const },
        { label: "Needs manual Google review", value: summary.googleManualReview, tone: "amber" as const },
        { label: "Applied Google suggestions", value: summary.googleApplied, tone: "white" as const },
      ]
    : [
        { label: "Catalog health", value: "Temporarily unavailable", tone: "rose" as const },
      ];

  return (
    <LocationToolShell
      title="Location Data Intelligence"
      description="One production control center for Google identity and metadata, first-party menu and reservation discovery, dedupe, publication safety, Search Profile freshness, and catalog repair."
      stats={stats}
    >
      {summaryUnavailable ? (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
          Catalog health counters are temporarily unavailable. The enrichment runner, no-match review queue, and Google evidence review remain available. Reload later to refresh the counters.
        </div>
      ) : null}

      {summary ? (
        <ToolCard
          title="Production pipeline health"
          description="Live completion and exception counters for the full Location Intelligence pipeline. Healthy stages should converge toward zero backlog while discovered evidence and Search Profile coverage increase."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HealthMetric label="Dedupe unknown" value={summary.dedupeUnknownBacklog} healthy={summary.dedupeUnknownBacklog === 0} />
            <HealthMetric label="Ready to publish" value={summary.publicationBacklog} healthy={summary.publicationBacklog === 0} />
            <HealthMetric label="Hidden duplicates" value={summary.hiddenDuplicateRows} neutral />
            <HealthMetric label="Missing Search Profiles" value={summary.locationsWithoutSearchProfile} healthy={summary.locationsWithoutSearchProfile === 0} />
            <HealthMetric label="Menu v2 complete" value={summary.menuIntelligenceV2} neutral />
            <HealthMetric label="Menu v2 backlog" value={summary.menuV2Backlog} healthy={summary.menuV2Backlog === 0} />
            <HealthMetric label="Menu failed" value={summary.menuFailed} healthy={summary.menuFailed === 0} />
            <HealthMetric label="Menu blocked" value={summary.menuBlocked} neutral />
            <HealthMetric label="Reservations found" value={summary.reservationFound} neutral />
            <HealthMetric label="Reservation failed" value={summary.reservationFailed} healthy={summary.reservationFailed === 0} />
            <HealthMetric label="Reservation blocked" value={summary.reservationBlocked} neutral />
            <HealthMetric label="Semantic refresh pending" value={summary.semanticRefreshPending} healthy={summary.semanticRefreshPending === 0} />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Coverage label="Official website" value={summary.websitesPresent} total={summary.totals.locations} />
            <Coverage label="Phone" value={summary.phonesPresent} total={summary.totals.locations} />
            <Coverage label="Hours" value={summary.hoursPresent} total={summary.totals.locations} />
            <Coverage label="Photos" value={summary.photosPresent} total={summary.totals.locations} />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <RunStatus label="Guarded publication" value={lastRun(summary.lastCleanupSuccessAt)} />
            <RunStatus label="Unified gap repair" value={lastRun(summary.lastGapRepairSuccessAt)} />
            <RunStatus label="Search Profile worker" value={lastRun(summary.lastSearchProfileWorkerSuccessAt)} />
          </div>

          <div className="mt-5 grid gap-3 text-sm text-white/65 md:grid-cols-2 xl:grid-cols-4">
            <Policy label="Menus checked" value={String(summary.menuChecked)} />
            <Policy label="Menus found" value={String(summary.menuFound)} />
            <Policy label="Menus not found" value={String(summary.menuNotFound)} />
            <Policy label="Reservation not found" value={String(summary.reservationNotFound)} />
          </div>
        </ToolCard>
      ) : null}

      <ToolCard
        title="Recent Imports & Processing"
        description="The latest locations entering the catalog with their live Location Intelligence, Google, discovery, Search Profile, dedupe, and publication state."
      >
        <RecentImportsProcessing />
      </ToolCard>

      <ToolCard
        title="Catalog-wide enrichment runner"
        description="Audit the canonical database first, estimate Google API calls before spending, then process the repair queue in resumable batches with an explicit API-call budget."
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
          <PipelineStep number="3" title="Resolve safely" text="Approve only the correct identity. Reject mismatches. Accepted evidence queues the V3 Search Profile refresh." />
        </div>
        <GoogleEnrichmentClient initialSuggestions={reviewSuggestions as any} />
      </ToolCard>

      <ToolCard
        title="Quality policy"
        description="Owner and admin truth remains authoritative. Verified first-party website evidence outranks provider and inferred data. Google fills trusted gaps without silently replacing managed fields."
      >
        <div className="grid gap-3 text-sm text-white/65 md:grid-cols-2">
          <Policy label="Default Google staleness threshold" value={summary ? `${summary.staleDays} days` : "Unavailable"} />
          <Policy label="All generic cuisine rows" value={summary ? String(summary.genericRestaurantCuisine) : "Unavailable"} />
          <Policy label="Suppressed generic cuisine" value={summary ? String(summary.genericRestaurantCuisineSuppressed) : "Unavailable"} />
          <Policy label="Intentionally suppressed profiles" value={summary ? String(summary.searchProfilesSuppressedReview) : "Unavailable"} />
          <Policy label="Canonical records" value={summary ? String(summary.totals.locations) : "Unavailable"} />
          <Policy label="Search Profiles" value={summary ? String(summary.searchProfilesTotal) : "Unavailable"} />
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

function HealthMetric({ label, value, healthy = false, neutral = false }: { label: string; value: number; healthy?: boolean; neutral?: boolean }) {
  const tone = neutral
    ? "border-white/10 bg-black/20 text-white"
    : healthy
      ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
      : "border-amber-300/20 bg-amber-500/10 text-amber-100";
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-65">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function Coverage({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-white/70">{label}</span>
        <strong className="text-white">{pct}%</strong>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-white/45">{value.toLocaleString()} / {total.toLocaleString()}</p>
    </div>
  );
}

function RunStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-2 text-sm font-bold text-white">{value}</p>
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
