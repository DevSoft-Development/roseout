import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { runInitialLocationEnrichmentV2 } from "@/lib/location-intelligence/v2/initial-enrichment";

export const LOCATION_INTELLIGENCE_V2_PILOT_ID = "initial_100_v1";
export const LOCATION_INTELLIGENCE_V2_PILOT_LIMIT = 100;
export const LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE = 10;

type PilotState = "NY" | "NJ" | "CT";
type PilotLocationType = "restaurant" | "activity";

type PilotCandidate = {
  id: string;
  state: PilotState;
  location_type: PilotLocationType;
  primary_category: string | null;
  category: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  activity_type: string | null;
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

export type PilotQuota = {
  state: PilotState;
  locationType: PilotLocationType;
  count: number;
};

export type PilotProgress = {
  attempted: number;
  successful: number;
  successfulByCell: Record<string, number>;
};

export const LOCATION_INTELLIGENCE_V2_PILOT_CELL_TARGETS: readonly PilotQuota[] = [
  { state: "NY", locationType: "restaurant", count: 45 },
  { state: "NY", locationType: "activity", count: 25 },
  { state: "NJ", locationType: "restaurant", count: 10 },
  { state: "NJ", locationType: "activity", count: 10 },
  { state: "CT", locationType: "restaurant", count: 5 },
  { state: "CT", locationType: "activity", count: 5 },
];

function cellKey(state: string, locationType: string) {
  return `${state}:${locationType}`;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function pilotMarker(provenance: unknown) {
  const marker = asObject(asObject(provenance).v2_pilot);
  return String(marker.id || "") === LOCATION_INTELLIGENCE_V2_PILOT_ID ? marker : null;
}

export function pilotCategoryKey(candidate: Pick<PilotCandidate, "primary_category" | "activity_type" | "category" | "cuisine_type" | "cuisine">) {
  return String(
    candidate.primary_category ||
      candidate.activity_type ||
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
  if (!seenCategories.has(pilotCategoryKey(candidate))) score += 300;
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

function deficitForCell(progress: PilotProgress, quota: PilotQuota) {
  const target =
    LOCATION_INTELLIGENCE_V2_PILOT_CELL_TARGETS.find(
      (row) => row.state === quota.state && row.locationType === quota.locationType,
    )?.count || 0;
  const succeeded = progress.successfulByCell[cellKey(quota.state, quota.locationType)] || 0;
  return Math.max(0, target - succeeded);
}

function appendQuota(target: PilotQuota[], quota: PilotQuota, count: number) {
  if (count <= 0) return;
  const existing = target.find(
    (row) => row.state === quota.state && row.locationType === quota.locationType,
  );
  if (existing) existing.count += count;
  else target.push({ ...quota, count });
}

export function nextPilotQuotas(progress: PilotProgress): PilotQuota[] {
  const remainingSuccesses = Math.max(0, LOCATION_INTELLIGENCE_V2_PILOT_LIMIT - progress.successful);
  const slots = Math.min(LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE, remainingSuccesses);
  if (slots <= 0) return [];

  const quotas: PilotQuota[] = [];
  let allocated = 0;

  if (progress.attempted < LOCATION_INTELLIGENCE_V2_PILOT_LIMIT) {
    const plannedBatch = pilotBatchQuotas(
      Math.floor(progress.attempted / LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE),
    );
    for (const quota of plannedBatch) {
      const available = deficitForCell(progress, quota);
      const take = Math.min(quota.count, available, slots - allocated);
      appendQuota(quotas, quota, take);
      allocated += take;
      if (allocated >= slots) break;
    }
  }

  if (allocated < slots) {
    for (const target of LOCATION_INTELLIGENCE_V2_PILOT_CELL_TARGETS) {
      const alreadyAllocated =
        quotas.find(
          (row) => row.state === target.state && row.locationType === target.locationType,
        )?.count || 0;
      const available = Math.max(0, deficitForCell(progress, target) - alreadyAllocated);
      const take = Math.min(available, slots - allocated);
      appendQuota(quotas, target, take);
      allocated += take;
      if (allocated >= slots) break;
    }
  }

  return quotas;
}

async function fetchLocationRows(state: PilotState, locationType: PilotLocationType) {
  const columns =
    "id,state,location_type,primary_category,category,cuisine,cuisine_type,activity_type,is_searchable,duplicate_status,google_place_id,popularity_score,is_claimed,claimed,claim_status,owner_user_id";

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
  const strata: Array<[PilotState, PilotLocationType]> = [
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

    const state = String(row.state || "").toUpperCase();
    const locationType = String(row.location_type || "");
    if (!["NY", "NJ", "CT"].includes(state)) return [];
    if (!["restaurant", "activity"].includes(locationType)) return [];

    return [
      {
        id,
        state: state as PilotState,
        location_type: locationType as PilotLocationType,
        primary_category: row.primary_category == null ? null : String(row.primary_category),
        category: row.category == null ? null : String(row.category),
        cuisine: row.cuisine == null ? null : String(row.cuisine),
        cuisine_type: row.cuisine_type == null ? null : String(row.cuisine_type),
        activity_type: row.activity_type == null ? null : String(row.activity_type),
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

async function pilotProgress(): Promise<PilotProgress> {
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("location_id,provenance,locations!inner(state,location_type)")
    .contains("provenance", {
      v2_pilot: {
        id: LOCATION_INTELLIGENCE_V2_PILOT_ID,
      },
    });
  if (error) throw new Error(`Pilot progress read failed: ${error.message}`);

  const successfulByCell: Record<string, number> = {};
  let successful = 0;

  for (const row of data || []) {
    const marker = pilotMarker(row.provenance);
    if (String(marker?.status || "") !== "success") continue;

    const joined = Array.isArray((row as any).locations)
      ? (row as any).locations[0]
      : (row as any).locations;
    const state = String(joined?.state || "").toUpperCase();
    const locationType = String(joined?.location_type || "");
    const key = cellKey(state, locationType);
    successfulByCell[key] = (successfulByCell[key] || 0) + 1;
    successful += 1;
  }

  return {
    attempted: (data || []).length,
    successful,
    successfulByCell,
  };
}

function selectPilotBatch(candidates: PilotCandidate[], quotas: PilotQuota[]) {
  const selected: PilotCandidate[] = [];
  const selectedIds = new Set<string>();
  const seenCategories = new Set<string>();
  const stats: PilotStats = { missingGoogle: 0, messy: 0, nonSearchable: 0 };

  for (const quota of quotas) {
    for (let slot = 0; slot < quota.count; slot += 1) {
      const ranked = candidates
        .filter(
          (candidate) =>
            !selectedIds.has(candidate.id) &&
            candidate.state === quota.state &&
            candidate.location_type === quota.locationType,
        )
        .map((candidate) => ({ candidate, score: scoreCandidate(candidate, stats, seenCategories) }))
        .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

      const next = ranked[0]?.candidate;
      if (!next) {
        throw new Error(
          `Pilot quota unavailable for ${quota.state} ${quota.locationType}; refusing cross-cell substitution.`,
        );
      }

      selected.push(next);
      selectedIds.add(next.id);
      seenCategories.add(categoryKey(next));
      if (isMissingGoogle(next)) stats.missingGoogle += 1;
      if (isMessy(next)) stats.messy += 1;
      if (next.is_searchable === false) stats.nonSearchable += 1;
    }
  }

  return selected;
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
    categories.add(pilotCategoryKey(candidate));
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
  const progressBefore = await pilotProgress();
  if (progressBefore.successful >= LOCATION_INTELLIGENCE_V2_PILOT_LIMIT) {
    return {
      complete: true,
      pilotId: LOCATION_INTELLIGENCE_V2_PILOT_ID,
      attemptedBefore: progressBefore.attempted,
      successBefore: progressBefore.successful,
      selected: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
    };
  }

  const quotas = nextPilotQuotas(progressBefore);
  if (quotas.length === 0) {
    throw new Error("No remaining Location Intelligence V2 pilot quota.");
  }

  const candidates = await eligiblePilotCandidates();
  const selected = selectPilotBatch(candidates, quotas);

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

  const progressAfter = await pilotProgress();
  return {
    complete: progressAfter.successful >= LOCATION_INTELLIGENCE_V2_PILOT_LIMIT,
    pilotId: LOCATION_INTELLIGENCE_V2_PILOT_ID,
    attemptedBefore: progressBefore.attempted,
    attemptedAfter: progressAfter.attempted,
    successBefore: progressBefore.successful,
    successAfter: progressAfter.successful,
    selected: selected.length,
    succeeded,
    failed: failures.length,
    remaining: Math.max(0, LOCATION_INTELLIGENCE_V2_PILOT_LIMIT - progressAfter.successful),
    quotas,
    cohort: summarize(selected),
    failures,
  };
}
