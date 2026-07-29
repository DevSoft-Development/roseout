import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { SearchProfileReviewTable, type ReviewTableRow } from "@/components/admin/location-tools/SearchProfileReviewTable";
import { requireAdminRole } from "@/lib/admin-auth";
import { summarizeReview, type ReviewProfile } from "@/lib/search/profile/profileReviewPolicy";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const LOCATION_LOOKUP_BATCH_SIZE = 100;
type Params = Record<string, string | string[] | undefined>;
type LocationSummary = {
  id: string;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  location_type: string | null;
  city: string | null;
  borough: string | null;
  state: string | null;
};
type StoredProfile = ReviewProfile & { generated_at?: string | null; verified_at?: string | null };
const single = (value: string | string[] | undefined) => typeof value === "string" ? value.trim() : "";

async function loadLocationsInBatches(locationIds: string[]) {
  const locations = new Map<string, LocationSummary>();
  for (let start = 0; start < locationIds.length; start += LOCATION_LOOKUP_BATCH_SIZE) {
    const batch = locationIds.slice(start, start + LOCATION_LOOKUP_BATCH_SIZE);
    const result = await supabaseAdmin.from("locations").select("id,name,restaurant_name,activity_name,location_type,city,borough,state").in("id", batch);
    if (result.error) throw new Error(`Review location lookup failed for batch ${Math.floor(start / LOCATION_LOOKUP_BATCH_SIZE) + 1}: ${result.error.message}`);
    for (const location of (result.data ?? []) as unknown as LocationSummary[]) locations.set(location.id, location);
  }
  return locations;
}

export default async function SearchProfileReviewQueue({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdminRole(["superadmin", "admin"]);
  const params = await searchParams;
  const severity = single(params.severity);
  const reason = single(params.reason);
  const search = single(params.search).toLowerCase();

  const profilesResult = await supabaseAdmin
    .from("location_search_profiles")
    .select("location_id,needs_review,confidence,profile_version,primary_domain,canonical_terms,review_reasons,supported_domains,restaurant_categories,activity_categories,nightlife_categories,generated_at,verified_at")
    .eq("needs_review", true)
    .order("confidence", { ascending: true })
    .limit(1000);
  if (profilesResult.error) throw new Error(`Review queue failed: ${profilesResult.error.message}`);

  const profiles = (profilesResult.data ?? []) as unknown as StoredProfile[];
  const reviewed = profiles.map((profile) => ({ profile, summary: summarizeReview(profile) }));
  const reasonOptions = [...new Set(reviewed.flatMap(({ summary }) => [...summary.blockingReasons, ...summary.warningReasons]))].sort();
  const locationIds = [...new Set(profiles.map((profile) => profile.location_id))];
  const locations = await loadLocationsInBatches(locationIds);

  const rows: ReviewTableRow[] = reviewed.map(({ profile, summary }) => {
    const location = locations.get(profile.location_id);
    return {
      locationId: profile.location_id,
      name: location?.name ?? location?.restaurant_name ?? location?.activity_name ?? profile.location_id,
      locationType: location?.location_type ?? "",
      state: location?.state ?? "",
      city: location?.city ?? location?.borough ?? "",
      status: "Needs Review",
      domain: profile.primary_domain ?? "",
      canonicalTerms: profile.canonical_terms ?? [],
      confidence: Number(profile.confidence ?? 0),
      profileVersion: Number(profile.profile_version ?? 0),
      generatedAt: profile.generated_at ?? null,
      severity: summary.severity,
      blockingReasons: summary.blockingReasons,
      warningReasons: summary.warningReasons,
    };
  }).filter((row) => {
    if (severity && severity !== "all" && row.severity !== severity) return false;
    if (reason && ![...row.blockingReasons, ...row.warningReasons].includes(reason)) return false;
    if (search && ![row.name, row.locationType, row.state, row.city, row.domain, ...row.canonicalTerms].join(" ").toLowerCase().includes(search)) return false;
    return true;
  });

  return (
    <LocationToolShell
      title="Search Profile Review Center"
      description="Review classification quality, correct safe issues, and approve search profiles without losing the context behind each decision."
      stats={[
        { label: "Showing", value: rows.length },
        { label: "Blocking", value: reviewed.filter((item) => item.summary.severity === "blocking").length },
        { label: "Warnings", value: reviewed.filter((item) => item.summary.severity === "warning").length },
        { label: "Needs Review", value: reviewed.length },
      ]}
    >
      <ToolCard title="Find profiles">
        <form className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.4fr)_180px_minmax(240px,1fr)_auto] xl:items-end">
          <label className="min-w-0 text-xs font-bold uppercase tracking-wide text-white/50">
            Search
            <input name="search" defaultValue={single(params.search)} placeholder="Location, type, state, city, domain, or term" className="mt-2 h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-rose-400/50" />
          </label>
          <label className="min-w-0 text-xs font-bold uppercase tracking-wide text-white/50">
            Severity
            <select name="severity" defaultValue={severity || "all"} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">
              <option value="all">All severities</option><option value="blocking">Blocking conflicts</option><option value="warning">Warnings only</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold uppercase tracking-wide text-white/50">
            Review reason
            <select name="reason" defaultValue={reason} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">
              <option value="">All review reasons</option>{reasonOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <button className="h-11 whitespace-nowrap rounded-xl bg-white px-5 text-sm font-black text-black hover:bg-white/90">Apply filters</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/45">
          <span><strong className="text-red-200">Blocking</strong> requires manual review.</span>
          <span><strong className="text-amber-100">Warning</strong> can be handled in bulk when evidence is consistent.</span>
        </div>
      </ToolCard>

      <ToolCard title={`Profiles requiring review (${rows.length})`}>
        <SearchProfileReviewTable rows={rows} isSuperadmin={admin.role === "superadmin"} />
      </ToolCard>
    </LocationToolShell>
  );
}
