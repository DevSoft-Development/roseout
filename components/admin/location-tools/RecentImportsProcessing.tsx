import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const RECENT_IMPORT_LIMIT = 25;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function StatusPill({ label, ready, warning = false }: { label: string; ready: boolean; warning?: boolean }) {
  const tone = ready
    ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
    : warning
      ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
      : "border-white/10 bg-white/5 text-white/45";

  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-bold ${tone}`}>{label}</span>;
}

export async function RecentImportsProcessing() {
  const recentResult = await supabaseAdmin
    .from("locations")
    .select("id,name,location_type,created_at,created_source,import_source,source_table,google_place_id,google_enriched_at,website,reservation_url,reservation_link,external_reservation_url,menu_url,has_photos,is_searchable,quality_status,duplicate_status")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_IMPORT_LIMIT);

  if (recentResult.error) {
    console.error("Recent Location Intelligence imports unavailable", recentResult.error);
    return (
      <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
        Recent import activity is temporarily unavailable.
      </div>
    );
  }

  const recent = recentResult.data || [];
  if (recent.length === 0) {
    return <p className="text-sm font-semibold text-white/45">No location imports have been recorded yet.</p>;
  }

  const ids = recent.map((row) => row.id);
  const [inboxResult, stateResult, profileResult] = await Promise.all([
    supabaseAdmin
      .from("location_intelligence_inbox")
      .select("location_id,status,last_error,updated_at")
      .in("location_id", ids),
    supabaseAdmin
      .from("location_intelligence_state")
      .select("location_id,current_stage,last_error,completed_at,updated_at")
      .in("location_id", ids),
    supabaseAdmin
      .from("location_search_profiles")
      .select("location_id")
      .in("location_id", ids),
  ]);

  if (inboxResult.error) console.error("Recent import inbox state unavailable", inboxResult.error);
  if (stateResult.error) console.error("Recent import lifecycle state unavailable", stateResult.error);
  if (profileResult.error) console.error("Recent import Search Profile state unavailable", profileResult.error);

  const inboxById = new Map((inboxResult.data || []).map((row) => [row.location_id, row]));
  const stateById = new Map((stateResult.data || []).map((row) => [row.location_id, row]));
  const profileIds = new Set((profileResult.data || []).map((row) => row.location_id));

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
      <table className="min-w-[1180px] w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
          <tr>
            <th className="px-4 py-3">Imported</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Pipeline</th>
            <th className="px-4 py-3">Google</th>
            <th className="px-4 py-3">Discovery</th>
            <th className="px-4 py-3">Search</th>
            <th className="px-4 py-3">Publish</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {recent.map((row) => {
            const inbox = inboxById.get(row.id);
            const state = stateById.get(row.id);
            const source = row.created_source || row.import_source || row.source_table || "unknown";
            const reservationFound = hasText(row.external_reservation_url) || hasText(row.reservation_url) || hasText(row.reservation_link);
            const hasWebsite = hasText(row.website);
            const hasMenu = hasText(row.menu_url);
            const hasProfile = profileIds.has(row.id);
            const pipelineError = state?.last_error || inbox?.last_error;
            const pipelineLabel = state?.completed_at
              ? "Complete"
              : state?.current_stage || inbox?.status || "Queued";

            return (
              <tr key={row.id} className="align-top text-white/70">
                <td className="px-4 py-4 whitespace-nowrap text-xs font-semibold text-white/50">{formatDate(row.created_at)}</td>
                <td className="px-4 py-4">
                  <p className="font-black text-white">{row.name || "Unnamed location"}</p>
                  <p className="mt-1 text-xs capitalize text-white/45">{row.location_type || "location"}</p>
                </td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-white/60">{source}</span>
                </td>
                <td className="px-4 py-4">
                  <StatusPill label={pipelineLabel} ready={Boolean(state?.completed_at)} warning={Boolean(pipelineError)} />
                  {pipelineError ? <p className="mt-2 max-w-[220px] text-xs font-semibold text-amber-200/80 line-clamp-2">{pipelineError}</p> : null}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill label="Place ID" ready={hasText(row.google_place_id)} />
                    <StatusPill label="Enriched" ready={Boolean(row.google_enriched_at)} />
                    <StatusPill label="Photos" ready={row.has_photos === true} />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill label="Website" ready={hasWebsite} />
                    <StatusPill label="Menu" ready={hasMenu} />
                    <StatusPill label="Reservation" ready={reservationFound} />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <StatusPill label="Search Profile" ready={hasProfile} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill label={row.duplicate_status || "Dedupe pending"} ready={row.duplicate_status === "unique"} warning={row.duplicate_status === "duplicate"} />
                    <StatusPill label={row.is_searchable ? "Searchable" : row.quality_status || "Not searchable"} ready={row.is_searchable === true} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
