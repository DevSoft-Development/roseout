import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { runInitialLocationEnrichmentV2 } from "@/lib/location-intelligence/v2/initial-enrichment";

export const LOCATION_INTELLIGENCE_V2_PILOT_ID = "initial_100_v1";
export const LOCATION_INTELLIGENCE_V2_PILOT_LIMIT = 100;
export const LOCATION_INTELLIGENCE_V2_PILOT_BATCH_SIZE = 10;
export const LOCATION_INTELLIGENCE_V2_PILOT_LEASE_SECONDS = 600;

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
  successfulCategories?: string[];
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

export function pilotMarkerCountsAsSuccess(status: string, enriched: boolean) {
  return status === "success" || (status === "reserved" && enriched);
}

export function pilotCategoryKey(
  candidate: Pick<
    PilotCandidate,
    "primary_category" | "activity_type" | "category" | "cuisine_type" | "cuisine"
  > & { location_type?: PilotLocationType | string | null },
) {
  const value =
    candidate.location_type === "activity"
      ? candidate.activity_type ||
        candidate.primary_category ||
        candidate.category ||
        candidate.cuisine_type ||
        candidate.cuisine
      : candidate.primary_category ||
        candidate.category ||
        candidate.cuisine_type ||
        candidate.cuisine ||
        candidate.activity_type;

  return String(value || "uncategorized").trim().toLowerCase();
}

export function pilotDuplicateState(input: { duplicate_status?: unknown; duplicate_of?: unknown }) {
  const status = String(input.duplicate_status || "").trim().toLowerCase();
  return {
    confirmed: status === "duplicate" || Boolean(String(input.duplicate_of || "").trim()),
    messy: status === "possible_duplicate",
  };
}

function isMessy(candidate: PilotCandidate) {
  return pilotDuplicateState({ duplicate_status: candidate.duplicate_status }).messy;
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
    "id,state,location_type,primary_category,category,cuisine,cuisine_type,activity_type,is_searchable,duplicate_status,duplicate_of,google_place_id,popularity_score,is_claimed,claimed,claim_status,owner_user_id";
  const pageSize = 500;
  const rows: Record<string, unknown>[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select(columns)
      .eq("state", state)
      .eq("location_type", locationType)
      .is("deleted_at", null)
      .order("popularity_score", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Pilot candidate read failed: ${error.message}`);

    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
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
    if (pilotDuplicateState({
      duplicate_status: row.duplicate_status,
      duplicate_of: row.duplicate_of,
    }).confirmed) return [];

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
    .select("location_id,last_initial_enrichment_at,provenance,locations!inner(state,location_type,primary_category,activity_type,category,cuisine_type,cuisine)")
    .contains("provenance", {
      v2_pilot: {
        id: LOCATION_INTELLIGENCE_V2_PILOT_ID,
      },
    });
  if (error) throw new Error(`Pilot progress read failed: ${error.message}`);

  const successfulByCell: Record<string, number> = {};
  const successfulCategories = new Set<string>();
  let successful = 0;

  for (const row of data || []) {
    const marker = pilotMarker(row.provenance);
    const markerStatus = String(marker?.status || "");
    const enriched = Boolean(row.last_initial_enrichment_at);
    if (!pilotMarkerCountsAsSuccess(markerStatus, enriched)) continue;

    const joined = Array.isArray((row as any).locations)
      ? (row as any).locations[0]
      : (row as any).locations;
    const state = String(joined?.state || "").toUpperCase();
    const locationType = String(joined?.location_type || "");
    const key = cellKey(state, locationType);
    successfulByCell[key] = (successfulByCell[key] || 0) + 1;
    successfulCategories.add(
      pilotCategoryKey({
        location_type: locationType,
        primary_category: joined?.primary_category == null ? null : String(joined.primary_category),
        activity_type: joined?.activity_type == null ? null : String(joined.activity_type),
        category: joined?.category == null ? null : String(joined.category),
        cuisine_type: joined?.cuisine_type == null ? null : String(joined.cuisine_type),
        cuisine: joined?.cuisine == null ? null : String(joined.cuisine),
      }),
    );
    successful += 1;
  }

  return {
    attempted: (data || []).length,
    successful,
    successfulByCell,
    successfulCategories: [...successfulCategories],
  };
}

function selectPilotBatch(
  candidates: PilotCandidate[],
  quotas: PilotQuota[],
  successfulCategories: string[] = [],
) {
  const selected: PilotCandidate[] = [];
  const selectedIds = new Set<string>();
  const seenCategories = new Set(successfulCategories);
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
      seenCategories.add(pilotCategoryKey(next));
      if (isMissingGoogle(next)) stats.missingGoogle += 1;
      if (isMessy(next)) stats.messy += 1;
      if (next.is_searchable === false) stats.nonSearchable += 1;
    }
  }

  return selected;
}

async function acquirePilotLease() {
  const ownerToken = crypto.randomUUID();
  const { data, error } = await supabaseAdmin.rpc(
    "acquire_location_intelligence_v2_pilot_lease",
    {
      p_pilot_id: LOCATION_INTELLIGENCE_V2_PILOT_ID,
      p_owner_token: ownerToken,
      p_lease_seconds: LOCATION_INTELLIGENCE_V2_PILOT_LEASE_SECONDS,
    },
  );
  if (error) throw new Error(`Pilot lease acquisition failed: ${error.message}`);
  return data === true ? ownerToken : null;
}

async function releasePilotLease(ownerToken: string) {
  const { error } = await supabaseAdmin.rpc(
    "release_location_intelligence_v2_pilot_lease",
    {
      p_pilot_id: LOCATION_INTELLIGENCE_V2_PILOT_ID,
      p_owner_token: ownerToken,
    },
  );
  if (error) throw new Error(`Pilot lease release failed: ${error.message}`);
}

export function pilotEnrichmentCommitted(lastInitialEnrichmentAt: unknown) {
  return Boolean(String(lastInitialEnrichmentAt || "").trim());
}

async function locationInitialEnrichmentCommitted(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("last_initial_enrichment_at")
    .eq("location_id", locationId)
    .single();
  if (error) throw new Error(`Pilot enrichment reconciliation failed: ${error.message}`);
  return pilotEnrichmentCommitted(data?.last_initial_enrichment_at);
}

async function markPilotResult(
  locationId: string,
  status: "reserved" | "success" | "failed",
  error?: string,
) {
  const { data: profile, error: readError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("provenance")
    .eq("location_id", locationId)
    .single();
  if (readError) throw new Error(`Pilot audit read failed: ${readError.message}`);

  const now = new Date().toISOString();
  const provenance = {
    ...asObject(profile?.provenance),
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
    .eq("location_id", locationId);
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

async function runLockedLocationIntelligenceV2PilotBatch() {
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
      auditFailed: 0,
      postEnrichmentFailed: 0,
      remaining: 0,
    };
  }

  const quotas = nextPilotQuotas(progressBefore);
  if (quotas.length === 0) {
    throw new Error("No remaining Location Intelligence V2 pilot quota.");
  }

  const candidates = await eligiblePilotCandidates();
  const selected = selectPilotBatch(
    candidates,
    quotas,
    progressBefore.successfulCategories || [],
  );

  let succeeded = 0;
  const enrichmentFailures: Array<{ locationId: string; error: string }> = [];
  const postEnrichmentFailures: Array<{ locationId: string; error: string }> = [];
  const auditFailures: Array<{ locationId: string; error: string }> = [];

  for (let index = 0; index < selected.length; index += 2) {
    const slice = selected.slice(index, index + 2);
    await Promise.all(
      slice.map(async (candidate) => {
        try {
          await markPilotResult(candidate.id, "reserved");
        } catch (auditError) {
          auditFailures.push({
            locationId: candidate.id,
            error: auditError instanceof Error ? auditError.message : "pilot_reservation_failed",
          });
          return;
        }

        try {
          await runInitialLocationEnrichmentV2(candidate.id);
          succeeded += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "initial_enrichment_failed";

          let committed: boolean | null = null;
          try {
            committed = await locationInitialEnrichmentCommitted(candidate.id);
          } catch (reconcileError) {
            auditFailures.push({
              locationId: candidate.id,
              error:
                reconcileError instanceof Error
                  ? reconcileError.message
                  : "pilot_enrichment_reconciliation_failed",
            });
            return;
          }

          if (committed) {
            succeeded += 1;
            postEnrichmentFailures.push({ locationId: candidate.id, error: message });
            try {
              await markPilotResult(candidate.id, "success", message);
            } catch (auditError) {
              auditFailures.push({
                locationId: candidate.id,
                error:
                  auditError instanceof Error
                    ? auditError.message
                    : "pilot_post_enrichment_audit_failed",
              });
            }
            return;
          }

          enrichmentFailures.push({ locationId: candidate.id, error: message });
          try {
            await markPilotResult(candidate.id, "failed", message);
          } catch (auditError) {
            auditFailures.push({
              locationId: candidate.id,
              error: auditError instanceof Error ? auditError.message : "pilot_failure_audit_failed",
            });
          }
          return;
        }

        try {
          await markPilotResult(candidate.id, "success");
        } catch (auditError) {
          auditFailures.push({
            locationId: candidate.id,
            error: auditError instanceof Error ? auditError.message : "pilot_success_audit_failed",
          });
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
    failed: enrichmentFailures.length,
    auditFailed: auditFailures.length,
    postEnrichmentFailed: postEnrichmentFailures.length,
    remaining: Math.max(0, LOCATION_INTELLIGENCE_V2_PILOT_LIMIT - progressAfter.successful),
    quotas,
    cohort: summarize(selected),
    failures: enrichmentFailures,
    postEnrichmentFailures,
    auditFailures,
  };
}


export async function runLocationIntelligenceV2PilotBatch() {
  const ownerToken = await acquirePilotLease();
  if (!ownerToken) {
    return {
      busy: true,
      complete: false,
      pilotId: LOCATION_INTELLIGENCE_V2_PILOT_ID,
      attemptedBefore: 0,
      attemptedAfter: 0,
      successBefore: 0,
      successAfter: 0,
      selected: 0,
      succeeded: 0,
      failed: 0,
      auditFailed: 0,
      postEnrichmentFailed: 0,
      remaining: LOCATION_INTELLIGENCE_V2_PILOT_LIMIT,
      quotas: [] as PilotQuota[],
      cohort: null,
      failures: [] as Array<{ locationId: string; error: string }>,
      postEnrichmentFailures: [] as Array<{ locationId: string; error: string }>,
      auditFailures: [] as Array<{ locationId: string; error: string }>,
    };
  }

  try {
    return await runLockedLocationIntelligenceV2PilotBatch();
  } finally {
    await releasePilotLease(ownerToken);
  }
}
