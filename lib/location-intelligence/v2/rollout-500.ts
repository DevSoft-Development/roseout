import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { runInitialLocationEnrichmentV2 } from "@/lib/location-intelligence/v2/initial-enrichment";

export const LOCATION_INTELLIGENCE_V2_ROLLOUT_ID = "controlled_500_v1";
export const LOCATION_INTELLIGENCE_V2_ROLLOUT_LIMIT = 500;
export const LOCATION_INTELLIGENCE_V2_ROLLOUT_BATCH_SIZE = 20;
export const LOCATION_INTELLIGENCE_V2_ROLLOUT_LEASE_SECONDS = 900;

type RolloutState = "NY" | "NJ" | "CT";
type RolloutLocationType = "restaurant" | "activity";

type CanonicalSnapshot = {
  google_place_id: string | null;
  phone: string | null;
  website: string | null;
  operating_hours: unknown;
  primary_category: string | null;
  description: string | null;
  main_image: string | null;
  rating: number | string | null;
  review_count: number | string | null;
};

type RolloutCandidate = CanonicalSnapshot & {
  id: string;
  state: RolloutState;
  location_type: RolloutLocationType;
  duplicate_status: string | null;
  popularity_score: number | string | null;
  is_claimed: boolean | null;
  claimed: boolean | null;
  claim_status: string | null;
  owner_user_id: string | null;
};

export type RolloutQuota = {
  state: RolloutState;
  locationType: RolloutLocationType;
  count: number;
};

const FIELD_NAMES = [
  "google_place_id",
  "phone",
  "website",
  "operating_hours",
  "primary_category",
  "description",
  "main_image",
  "rating",
  "review_count",
] as const;

export const LOCATION_INTELLIGENCE_V2_ROLLOUT_CELL_TARGETS: readonly RolloutQuota[] = [
  { state: "NY", locationType: "restaurant", count: 225 },
  { state: "NY", locationType: "activity", count: 125 },
  { state: "NJ", locationType: "restaurant", count: 50 },
  { state: "NJ", locationType: "activity", count: 50 },
  { state: "CT", locationType: "restaurant", count: 25 },
  { state: "CT", locationType: "activity", count: 25 },
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function marker(provenance: unknown) {
  const value = asObject(asObject(provenance).v2_rollout);
  return String(value.id || "") === LOCATION_INTELLIGENCE_V2_ROLLOUT_ID ? value : null;
}

function missing(value: unknown) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

export function rolloutGapFields(input: CanonicalSnapshot) {
  return FIELD_NAMES.filter((field) => missing(input[field]));
}

export function rolloutCellKey(state: string, locationType: string) {
  return `${state}:${locationType}`;
}

function candidateScore(candidate: RolloutCandidate) {
  const gaps = rolloutGapFields(candidate).length;
  let score = gaps * 500;

  if (missing(candidate.google_place_id)) score += 400;
  if (missing(candidate.operating_hours)) score += 300;
  if (missing(candidate.primary_category)) score += 250;
  if (missing(candidate.website)) score += 200;
  if (missing(candidate.phone)) score += 150;
  if (missing(candidate.description)) score += 100;
  if (missing(candidate.main_image)) score += 75;

  if (candidate.duplicate_status === "possible_duplicate") score -= 300;

  const claimed =
    Boolean(candidate.is_claimed) ||
    Boolean(candidate.claimed) ||
    Boolean(candidate.owner_user_id) ||
    ["claimed", "approved"].includes(String(candidate.claim_status || "").toLowerCase());
  if (claimed) score -= 200;

  const popularity = Number(candidate.popularity_score || 0);
  if (Number.isFinite(popularity)) score += Math.max(0, Math.min(100, popularity));
  return score;
}

async function rolloutProgress() {
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("location_id,last_initial_enrichment_at,provenance,locations!inner(state,location_type)")
    .contains("provenance", { v2_rollout: { id: LOCATION_INTELLIGENCE_V2_ROLLOUT_ID } });
  if (error) throw new Error(`Rollout progress read failed: ${error.message}`);

  const successfulByCell: Record<string, number> = {};
  let successful = 0;
  let failed = 0;

  for (const row of data || []) {
    const rollout = marker(row.provenance);
    const status = String(rollout?.status || "");
    const enriched = Boolean(row.last_initial_enrichment_at);
    const success = status === "success" || (status === "reserved" && enriched);
    if (status === "failed") failed += 1;
    if (!success) continue;

    const joined = Array.isArray((row as any).locations) ? (row as any).locations[0] : (row as any).locations;
    const key = rolloutCellKey(String(joined?.state || ""), String(joined?.location_type || ""));
    successfulByCell[key] = (successfulByCell[key] || 0) + 1;
    successful += 1;
  }

  return { attempted: (data || []).length, successful, failed, successfulByCell };
}

export function nextRolloutQuotas(progress: { successful: number; successfulByCell: Record<string, number> }) {
  let slots = Math.min(
    LOCATION_INTELLIGENCE_V2_ROLLOUT_BATCH_SIZE,
    Math.max(0, LOCATION_INTELLIGENCE_V2_ROLLOUT_LIMIT - progress.successful),
  );
  const quotas: RolloutQuota[] = [];
  for (const target of LOCATION_INTELLIGENCE_V2_ROLLOUT_CELL_TARGETS) {
    if (slots <= 0) break;
    const current = progress.successfulByCell[rolloutCellKey(target.state, target.locationType)] || 0;
    const deficit = Math.max(0, target.count - current);
    const take = Math.min(deficit, slots);
    if (take > 0) quotas.push({ ...target, count: take });
    slots -= take;
  }
  return quotas;
}

async function readCandidates(state: RolloutState, locationType: RolloutLocationType) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id,state,location_type,duplicate_status,popularity_score,is_claimed,claimed,claim_status,owner_user_id,google_place_id,phone,website,operating_hours,primary_category,description,main_image,rating,review_count")
      .eq("state", state)
      .eq("location_type", locationType)
      .eq("is_searchable", true)
      .is("deleted_at", null)
      .neq("duplicate_status", "duplicate")
      .order("popularity_score", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Rollout candidate read failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function eligibleCandidates() {
  const strata: Array<[RolloutState, RolloutLocationType]> = [
    ["NY", "restaurant"],
    ["NY", "activity"],
    ["NJ", "restaurant"],
    ["NJ", "activity"],
    ["CT", "restaurant"],
    ["CT", "activity"],
  ];
  const rows = (await Promise.all(strata.map(([state, type]) => readCandidates(state, type)))).flat();
  const ids = rows.map((row) => String(row.id));
  const profiles = new Map<string, { lastInitial: string | null; provenance: Record<string, unknown> }>();

  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("location_intelligence_profiles_v2")
      .select("location_id,last_initial_enrichment_at,provenance")
      .in("location_id", ids.slice(i, i + 200));
    if (error) throw new Error(`Rollout profile read failed: ${error.message}`);
    for (const row of data || []) {
      profiles.set(String(row.location_id), {
        lastInitial: row.last_initial_enrichment_at ? String(row.last_initial_enrichment_at) : null,
        provenance: asObject(row.provenance),
      });
    }
  }

  return rows.flatMap((row) => {
    const id = String(row.id);
    const profile = profiles.get(id);
    if (profile?.lastInitial || marker(profile?.provenance)) return [];

    const candidate = row as unknown as RolloutCandidate;
    if (rolloutGapFields(candidate).length === 0) return [];
    return [candidate];
  });
}

function selectBatch(candidates: RolloutCandidate[], quotas: RolloutQuota[]) {
  const selected: RolloutCandidate[] = [];
  const selectedIds = new Set<string>();

  for (const quota of quotas) {
    const ranked = candidates
      .filter((candidate) =>
        !selectedIds.has(candidate.id) &&
        candidate.state === quota.state &&
        candidate.location_type === quota.locationType
      )
      .sort((a, b) => candidateScore(b) - candidateScore(a) || a.id.localeCompare(b.id));

    if (ranked.length < quota.count) {
      throw new Error(`Rollout quota unavailable for ${quota.state} ${quota.locationType}`);
    }
    for (const candidate of ranked.slice(0, quota.count)) {
      selected.push(candidate);
      selectedIds.add(candidate.id);
    }
  }
  return selected;
}

async function ensureProfile(locationId: string) {
  const { error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .upsert({ location_id: locationId, updated_at: new Date().toISOString() }, { onConflict: "location_id", ignoreDuplicates: true });
  if (error) throw new Error(`Rollout profile bootstrap failed: ${error.message}`);
}

async function markResult(
  locationId: string,
  status: "reserved" | "success" | "failed",
  metadata: Record<string, unknown> = {},
) {
  await ensureProfile(locationId);
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("provenance")
    .eq("location_id", locationId)
    .single();
  if (error) throw new Error(`Rollout audit read failed: ${error.message}`);

  const now = new Date().toISOString();
  const provenance = {
    ...asObject(data?.provenance),
    v2_rollout: {
      id: LOCATION_INTELLIGENCE_V2_ROLLOUT_ID,
      status,
      attempted_at: now,
      ...metadata,
    },
  };
  const { error: writeError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .update({ provenance, updated_at: now })
    .eq("location_id", locationId);
  if (writeError) throw new Error(`Rollout audit write failed: ${writeError.message}`);
}

async function readCanonical(locationId: string): Promise<CanonicalSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("google_place_id,phone,website,operating_hours,primary_category,description,main_image,rating,review_count")
    .eq("id", locationId)
    .single();
  if (error) throw new Error(`Rollout canonical read failed: ${error.message}`);
  return data as CanonicalSnapshot;
}

function changedFields(before: CanonicalSnapshot, after: CanonicalSnapshot) {
  return FIELD_NAMES.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function filledFields(before: CanonicalSnapshot, after: CanonicalSnapshot) {
  return FIELD_NAMES.filter((field) => missing(before[field]) && !missing(after[field]));
}

async function acquireLease() {
  const ownerToken = crypto.randomUUID();
  const { data, error } = await supabaseAdmin.rpc("acquire_location_intelligence_v2_pilot_lease", {
    p_pilot_id: LOCATION_INTELLIGENCE_V2_ROLLOUT_ID,
    p_owner_token: ownerToken,
    p_lease_seconds: LOCATION_INTELLIGENCE_V2_ROLLOUT_LEASE_SECONDS,
  });
  if (error) throw new Error(`Rollout lease acquisition failed: ${error.message}`);
  return data === true ? ownerToken : null;
}

async function releaseLease(ownerToken: string) {
  const { error } = await supabaseAdmin.rpc("release_location_intelligence_v2_pilot_lease", {
    p_pilot_id: LOCATION_INTELLIGENCE_V2_ROLLOUT_ID,
    p_owner_token: ownerToken,
  });
  if (error) throw new Error(`Rollout lease release failed: ${error.message}`);
}

async function runLockedBatch() {
  const progressBefore = await rolloutProgress();
  if (progressBefore.successful >= LOCATION_INTELLIGENCE_V2_ROLLOUT_LIMIT) {
    return { complete: true, rolloutId: LOCATION_INTELLIGENCE_V2_ROLLOUT_ID, ...progressBefore, selected: 0 };
  }

  const quotas = nextRolloutQuotas(progressBefore);
  const candidates = await eligibleCandidates();
  const selected = selectBatch(candidates, quotas);

  const failures: Array<{ locationId: string; error: string }> = [];
  const improvements: Array<{ locationId: string; changedFields: string[]; filledFields: string[] }> = [];

  for (let i = 0; i < selected.length; i += 2) {
    await Promise.all(selected.slice(i, i + 2).map(async (candidate) => {
      const before = await readCanonical(candidate.id);
      await markResult(candidate.id, "reserved", { gaps_before: rolloutGapFields(before) });
      try {
        await runInitialLocationEnrichmentV2(candidate.id);
        const after = await readCanonical(candidate.id);
        const changed = changedFields(before, after);
        const filled = filledFields(before, after);
        improvements.push({ locationId: candidate.id, changedFields: changed, filledFields: filled });
        await markResult(candidate.id, "success", {
          gaps_before: rolloutGapFields(before),
          changed_fields: changed,
          filled_fields: filled,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "rollout_enrichment_failed";
        const { data: profile } = await supabaseAdmin
          .from("location_intelligence_profiles_v2")
          .select("last_initial_enrichment_at")
          .eq("location_id", candidate.id)
          .maybeSingle();

        if (profile?.last_initial_enrichment_at) {
          const after = await readCanonical(candidate.id);
          const changed = changedFields(before, after);
          const filled = filledFields(before, after);
          improvements.push({ locationId: candidate.id, changedFields: changed, filledFields: filled });
          await markResult(candidate.id, "success", {
            gaps_before: rolloutGapFields(before),
            changed_fields: changed,
            filled_fields: filled,
            post_enrichment_error: message,
          });
          return;
        }

        failures.push({ locationId: candidate.id, error: message });
        await markResult(candidate.id, "failed", { error: message, gaps_before: rolloutGapFields(before) });
      }
    }));
  }

  const progressAfter = await rolloutProgress();
  const fieldImprovementCounts: Record<string, number> = {};
  for (const row of improvements) {
    for (const field of row.filledFields) {
      fieldImprovementCounts[field] = (fieldImprovementCounts[field] || 0) + 1;
    }
  }

  return {
    complete: progressAfter.successful >= LOCATION_INTELLIGENCE_V2_ROLLOUT_LIMIT,
    rolloutId: LOCATION_INTELLIGENCE_V2_ROLLOUT_ID,
    attemptedBefore: progressBefore.attempted,
    attemptedAfter: progressAfter.attempted,
    successBefore: progressBefore.successful,
    successAfter: progressAfter.successful,
    selected: selected.length,
    failed: failures.length,
    remaining: Math.max(0, LOCATION_INTELLIGENCE_V2_ROLLOUT_LIMIT - progressAfter.successful),
    quotas,
    fieldImprovementCounts,
    failures,
  };
}

export async function runLocationIntelligenceV2Rollout500Batch() {
  const ownerToken = await acquireLease();
  if (!ownerToken) {
    return {
      busy: true,
      complete: false,
      rolloutId: LOCATION_INTELLIGENCE_V2_ROLLOUT_ID,
      selected: 0,
      failed: 0,
      remaining: LOCATION_INTELLIGENCE_V2_ROLLOUT_LIMIT,
    };
  }

  try {
    return await runLockedBatch();
  } finally {
    await releaseLease(ownerToken);
  }
}
