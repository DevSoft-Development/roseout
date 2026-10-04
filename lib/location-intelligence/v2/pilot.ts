import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { runInitialLocationEnrichmentV2 } from "@/lib/location-intelligence/v2/initial-enrichment";

export const LOCATION_INTELLIGENCE_V2_PILOT_ID = "initial_100_v1";
export const LOCATION_INTELLIGENCE_V2_PILOT_LIMIT = 100;
export const LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE = 10;

type PilotCandidate = {
  id: string;
  state: string;
  location_type: string;
  primary_category: string | null;
  category: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  is_searchable: boolean | null;
  duplicate_status: string | null;
  google_place_id: string | null;
  popularity_score: number | string | null;
  claimed: boolean;
  provenance: Record<string, unknown>;
};

type PilotStats = {
  missingGoogle: number;
  messy: number;
  nonSearchable: number;
};

type PilotQuota = {
  state: "NY" | "NJ" | "CT";
  locationType: "restaurant" | "activity";
  count: number;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function pilotMarker(provenance: unknown) {
  const marker = asObject(asObject(provenance).v2_pilot);
  return String(marker.id || "") === LOCATION_INTELLIGENCE_V2_PILOT_ID ? marker : null;
}

function categoryKey(candidate: PilotCandidate) {
  return String(
    candidate.primary_category ||
      candidate.category ||
      candidate.cuisine_type ||
      candidate.cuisine ||
      "uncategorized",
  )
    .trim()
    .toLowerCase();
}

function isMessy(candidate: PilotCandidate) {
  return candidate.duplicate_status === "duplicate" || candidate.duplicate_status === "possible_duplicate";
}

function isMissingGoogle(candidate: PilotCandidate) {
  return !String(candidate.google_place_id || "").trim();
}

function scoreCandidate(
  candidate: PilotCandidate,
  stats: PilotStats,
  seenCategories: Set<string>,
) {
  let score = 0;
  if (isMissingGoogle(candidate) && stats.missingGoogle < 1) score += 1200;
  if (isMessy(candidate) && stats.messy < 2) score += 900;
  if (candidate.is_searchable === false && stats.nonSearchable < 1) score += 650;
  if (!seenCategories.has(categoryKey(candidate))) score += 300;
  if (candidate.is_searchable !== false) score += 30;
  if (isMissingGoogle(candidate) && stats.missingGoogle >= 1) score -= 80;
  if (isMessy(candidate) && stats.messy >= 2) score -= 40;
  if (candidate.is_searchable === false && stats.nonSearchable >= 1) score -= 20;
  const popularity = Number(candidate.popularity_score || 0);
  if (Number.isFinite(popularity)) score += Math.max(0, Math.min(100, popularity));
  return score;
}

export function pilotBatchQuotas(batchIndex: number): PilotQuota[] {
  const odd = Math.max(0, Math.trunc(batchIndex)) % 2 === 1;
  return odd
    ? [
        { state: "NY", locationType: "restaurant", count: 5 },
        { state: "NY", locationType: "activity", count: 2 },
        { state: "NJ", locationType: "restaurant", count: 1 },
        { state: "NJ", locationType: "activity", count: 1 },
        { state: "CT", locationType: "activity", count: 1 },
      ]
    : [
        { state: "NY", locationType: "restaurant", count: 4 },
        { state: "NY", locationType: "activity", count: 3 },
        { state: "NJ", locationType: "restaurant", count: 1 },
        { state: "NJ", locationType: "activity", count: 1 },
        { state: "CT", locationType: "restaurant", count: 1 },
      ];
}

async function fetchLocationRows(state: string, locationType: string) {
  const columns =
    "id,state,location_type,primary_category,category,cuisine,cuisine_type,is_searchable,duplicate_status,google_place_id,popularity_score,is_claimed,claimed,claim_status,owner_user_id";

  const base = () =>
    supabaseAdmin
      .from("locations")
      .select(columns)
      .eq("state", state)
      .eq("location_type", locationType)
      .is("deleted_at", null);

  const [popular, messy, nonSearchable, missingNull, missingEmpty] = await Promise.all([
    base().order("popularity_score", { ascending: false, nullsFirst: false }).limit(160),
    base()
      .in("duplicate_status", ["duplicate", "possible_duplicate"])
      .order("popularity_score", { ascending: false, nullsFirst: false })
      .limit(60),
    base()
      .eq("is_searchable", false)
      .order("popularity_score", { ascending: false, nullsFirst: false })
      .limit(50),
    base()
      .is("google_place_id", null)
      .order("popularity_score", { ascending: false, nullsFirst: false })
      .limit(30),
    base()
      .eq("google_place_id", "")
      .order("popularity_score", { ascending: false, nullsFirst: false })
      .limit(30),
  ]);

  for (const result of [popular, messy, nonSearchable, missingNull, missingEmpty]) {
    if (result.error) throw new Error(`Pilot candidate read failed: ${result.error.message}`);
  }

  const deduped = new Map<string, Record<string, unknown>>();
  for (const row of [
    ...(popular.data || []),
    ...(messy.data || []),
    ...(nonSearchable.data || []),
    ...(missingNull.data || []),
    ...(missingEmpty.data || []),
  ]) {
    deduped.set(String((row as any).id), row as Record<string, unknown>);
  }
  return [...deduped.values()];
}

async function eligiblePilotCandidates() {
  const strata: Array<[string, string]> = [
    ["NY", "restaurant"],
    ["NY", "activity"],
    ["NJ", "restaurant"],
    ["NJ", "activity"],
    ["CT", "restaurant"],
    ["CT", "activity"],
  ];

  const rows = (await Promise.all(strata.map(([state, type]) => fetchLocationRows(state, type)))).flat();
  const ids = [...new Set(rows.map((row) => String(row.id)))];
  const profiles = new Map<string, { provenance: Record<string, unknown>; lastInitial: string | null }>();

  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    const { data, error } = await supabaseAdmin
      .from("location_intelligence_profiles_v2")
      .select("location_id,last_initial_enrichment_at,provenance")
      .in("location_id", chunk);
    if (error) throw new Error(`Pilot profile read failed: ${error.message}`);
    for (const row of data || []) {
      profiles.set(String(row.location_id), {
        provenance: asObject(row.provenance),
        lastInitial: row.last_initial_enrichment_at ? String(row.last_initial_enrichment_at) : null,
      });
    }
  }

  return rows.flatMap((row) => {
    const id = String(row.id);
    const profile = profiles.get(id);
    if (!profile || profile.lastInitial || pilotMarker(profile.provenance)) return [];
    return [
      {
        id,
        state: String(row.state || "").toUpperCase(),
        location_type: String(row.location_type || ""),
        primary_category: row.primary_category == null ? null : String(row.primary_category),
        category: row.category == null ? null : String(row.category),
        cuisine: row.cuisine == null ? null : String(row.cuisine),
        cuisine_type: row.cuisine_type == null ? null : String(row.cuisine_type),
        is_searchable: row.is_searchable == null ? null : Boolean(row.is_searchable),
        duplicate_status: row.duplicate_status == null ? null : String(row.duplicate_status),
        google_place_id: row.google_place_id == null ? null : String(row.google_place_id),
        popularity_score: row.popularity_score == null ? null : String(row.popularity_score),
        claimed:
          Boolean(row.is_claimed) ||
          Boolean(row.claimed) ||
          Boolean(row.owner_user_id) ||
          ["approved", "claimed"].includes(String(row.claim_status || "").toLowerCase()),
        provenance: profile.provenance,
      } satisfies PilotCandidate,
    ];
  });
}

async function successfulPilotCount() {
  const { count, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("location_id", { count: "exact", head: true })
    .contains("provenance", {
      v2_pilot: {
        id: LOCATION_INTELLIGENCE_V2_PILOT_ID,
        status: "success",
      },
    });
  if (error) throw new Error(`Pilot progress read failed: ${error.message}`);
  return Number(count || 0);
}

function selectPilotBatch(candidates: PilotCandidate[], batchIndex: number) {
  const selected: PilotCandidate[] = [];
  const selectedIds = new Set<string>();
  const seenCategories = new Set<string>();
  const stats: PilotStats = { missingGoogle: 0, messy: 0, nonSearchable: 0 };

  const choose = (pool: PilotCandidate[], count: number) => {
    for (let slot = 0; slot < count; slot += 1) {
      const ranked = pool
        .filter((candidate) => !selectedIds.has(candidate.id))
        .map((candidate) => ({ candidate, score: scoreCandidate(candidate, stats, seenCategories) }))
        .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
      const next = ranked[0]?.candidate;
      if (!next) break;
      selected.push(next);
      selectedIds.add(next.id);
      seenCategories.add(categoryKey(next));
      if (isMissingGoogle(next)) stats.missingGoogle += 1;
      if (isMessy(next)) stats.messy += 1;
      if (next.is_searchable === false) stats.nonSearchable += 1;
    }
  };

  for (const quota of pilotBatchQuotas(batchIndex)) {
    choose(
      candidates.filter(
        (candidate) =>
          candidate.state === quota.state && candidate.location_type === quota.locationType,
      ),
      quota.count,
    );
  }

  if (selected.length < LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE) {
    choose(candidates, LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE - selected.length);
  }

  return { selected, stats };
}

async function markPilotResult(
  candidate: PilotCandidate,
  status: "success" | "failed",
  error?: string,
) {
  const now = new Date().toISOString();
  const provenance = {
    ...candidate.provenance,
    v2_pilot: {
      id: LOCATION_INTELLIGENCE_V2_PILOT_ID,
      attempted_at: now,
      status,
      ...(error ? { error } : {}),
    },
  };
  const { error: updateError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .update({ provenance, updated_at: now })
    .eq("location_id", candidate.id);
  if (updateError) throw new Error(`Pilot audit update failed: ${updateError.message}`);
}

function summarize(selected: PilotCandidate[]) {
  const byState: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const categories = new Set<string>();
  let missingGoogle = 0;
  let messy = 0;
  let nonSearchable = 0;
  let claimed = 0;

  for (const candidate of selected) {
    byState[candidate.state] = (byState[candidate.state] || 0) + 1;
    byType[candidate.location_type] = (byType[candidate.location_type] || 0) + 1;
    categories.add(categoryKey(candidate));
    if (isMissingGoogle(candidate)) missingGoogle += 1;
    if (isMessy(candidate)) messy += 1;
    if (candidate.is_searchable === false) nonSearchable += 1;
    if (candidate.claimed) claimed += 1;
  }

  return {
    byState,
    byType,
    categoryCount: categories.size,
    missingGoogle,
    messy,
    nonSearchable,
    claimed,
  };
}

export async function runLocationIntelligenceV2PilotBatch() {
  const successBefore = await successfulPilotCount();
  if (successBefore >= LOCATION_INTELLIGENCE_V2_PILOT_LIMIT) {
    return {
      complete: true,
      pilotId: LOCATION_INTELLIGENCE_V2_PILOT_ID,
      successBefore,
      selected: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
    };
  }

  const batchIndex = Math.floor(successBefore / LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE);
  const remainingSlots = Math.min(
    LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE,
    LOCATION_INTELLIGENCE_V2_PILOT_LIMIT - successBefore,
  );
  const candidates = await eligiblePilotCandidates();
  const { selected: planned } = selectPilotBatch(candidates, batchIndex);
  const selected = planned.slice(0, remainingSlots);
  if (selected.length === 0) {
    throw new Error("No eligible Location Intelligence V2 pilot candidates remain.");
  }

  let succeeded = 0;
  const failures: Array<{ locationId: string; error: string }> = [];

  for (let index = 0; index < selected.length; index += 2) {
    const slice = selected.slice(index, index + 2);
    await Promise.all(
      slice.map(async (candidate) => {
        try {
          await runInitialLocationEnrichmentV2(candidate.id);
          await markPilotResult(candidate, "success");
          succeeded += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "initial_enrichment_failed";
          try {
            await markPilotResult(candidate, "failed", message);
          } catch (auditError) {
            failures.push({
              locationId: candidate.id,
              error: `${message}; audit=${
                auditError instanceof Error ? auditError.message : "pilot_audit_failed"
              }`,
            });
            return;
          }
          failures.push({ locationId: candidate.id, error: message });
        }
      }),
    );
  }

  const successAfter = successBefore + succeeded;
  return {
    complete: successAfter >= LOCATION_INTELLIGENCE_V2_PILOT_LIMIT,
    pilotId: LOCATION_INTELLIGENCE_V2_PILOT_ID,
    batchIndex,
    successBefore,
    successAfter,
    selected: selected.length,
    succeeded,
    failed: failures.length,
    remaining: Math.max(0, LOCATION_INTELLIGENCE_V2_PILOT_LIMIT - successAfter),
    cohort: summarize(selected),
    failures,
  };
}
