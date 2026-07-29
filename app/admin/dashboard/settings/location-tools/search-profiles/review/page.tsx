import Link from "next/link";
import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { summarizeReview, type ReviewProfile } from "@/lib/search/profile/profileReviewPolicy";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => typeof value === "string" ? value.trim() : "";

export default async function SearchProfileReviewQueue({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminRole(["superadmin", "admin"]);
  const params = await searchParams;
  const severity = single(params.severity);
  const reasonFilter = single(params.reason).toLowerCase();

  const profilesResult = await supabaseAdmin
    .from("location_search_profiles")
    .select("location_id,needs_review,confidence,profile_version,primary_domain,canonical_terms,review_reasons,supported_domains,restaurant_categories,activity_categories,nightlife_categories,verified_at")
    .eq("needs_review", true)
    .order("confidence", { ascending: true })
    .limit(1000);
  if (profilesResult.error) throw new Error(`Review queue failed: ${profilesResult.error.message}`);

  const profiles = (profilesResult.data ?? []) as unknown as Array<ReviewProfile & { verified_at?: string | null }>;
  const reasonOptions = [...new Set(profiles.flatMap((profile) => profile.review_reasons ?? []).filter(Boolean))].sort();
  const reviewed = profiles.map((profile) => ({ profile, summary: summarizeReview(profile) }));
  const filtered = reviewed.filter(({ summary }) => {
    if (severity && severity !== "all" && summary.severity !== severity) return false;
    if (reasonFilter && ![...summary.blockingReasons, ...summary.warningReasons].some((reason) => reason.toLowerCase().includes(reasonFilter))) return false;
    return true;
  });

  const locationIds = filtered.map(({ profile }) => profile.location_id);
  const locationsResult = locationIds.length
    ? await supabaseAdmin.from("locations").select("id,name,restaurant_name,activity_name,location_type,city,borough").in("id", locationIds)
    : { data: [], error: null };
  if (locationsResult.error) throw new Error(`Review location lookup failed: ${locationsResult.error.message}`);
  const locations = new Map((locationsResult.data ?? []).map((location) => [location.id, location]));

  return (
    <LocationToolShell title="Search Profile Review Queue" description="Filter review reasons, separate blocking conflicts from warnings, and open profiles to apply changes." stats={[
      { label: "Matching", value: filtered.length },
      { label: "Blocking", value: reviewed.filter((item) => item.summary.severity === "blocking").length },
      { label: "Warnings", value: reviewed.filter((item) => item.summary.severity === "warning").length },
    ]}>
      <ToolCard title="Review filters">
        <form className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <select name="severity" defaultValue={severity || "all"} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
            <option value="all">All severities</option>
            <option value="blocking">Blocking conflicts</option>
            <option value="warning">Harmless warnings</option>
          </select>
          <select name="reason" defaultValue={single(params.reason)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
            <option value="">All review reasons</option>
            {reasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
          <button className="rounded-full border border-white/15 px-5 font-black">Apply filters</button>
        </form>
      </ToolCard>
      <ToolCard title={`Profiles (${filtered.length})`}>
        <div className="space-y-2">
          {filtered.map(({ profile, summary }) => {
            const location = locations.get(profile.location_id);
            return (
              <div key={profile.location_id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong>{location?.name ?? location?.restaurant_name ?? location?.activity_name ?? profile.location_id}</strong>
                    <p className="text-xs text-white/45">{[location?.location_type, location?.city, location?.borough].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className={summary.severity === "blocking" ? "rounded-full bg-red-500/15 px-3 py-1 text-xs font-black text-red-200" : "rounded-full bg-amber-500/15 px-3 py-1 text-xs font-black text-amber-100"}>{summary.severity}</span>
                </div>
                {summary.blockingReasons.length ? <p className="mt-2 text-sm text-red-200">Blocking: {summary.blockingReasons.join("; ")}</p> : null}
                {summary.warningReasons.length ? <p className="mt-2 text-sm text-amber-100">Warnings: {summary.warningReasons.join("; ")}</p> : null}
                <div className="mt-3 flex gap-2">
                  <Link href={`/admin/dashboard/settings/location-tools/search-profiles/${profile.location_id}`} className="rounded-full border border-emerald-300/25 px-4 py-2 text-xs font-black text-emerald-100">Review / Apply</Link>
                  <Link href={`/admin/dashboard/settings/location-tools/search-profiles?search=${profile.location_id}`} className="rounded-full border border-white/15 px-4 py-2 text-xs font-black">View in list</Link>
                </div>
              </div>
            );
          })}
          {!filtered.length ? <p className="text-sm text-white/55">No profiles match these filters.</p> : null}
        </div>
      </ToolCard>
    </LocationToolShell>
  );
}
