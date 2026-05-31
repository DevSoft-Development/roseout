/* eslint-disable @typescript-eslint/no-explicit-any */
import { calculateStagingQuality, hasCompleteStagingQuality } from "@/lib/location-growth/stagingQuality";
import { supabaseAdmin } from "@/lib/supabase-admin";

type StagingRow = Record<string, any>;
type LocationRow = Record<string, any>;

type ChunkResult = {
  processed: number;
  duplicate: number;
  possibleDuplicate: number;
  unique: number;
  rejected: number;
  hasMore: boolean;
};

function toBoundedLimit(limit: number) {
  const numeric = Number(limit || 250);
  if (!Number.isFinite(numeric)) return 250;
  return Math.min(Math.max(Math.trunc(numeric), 1), 500);
}

function tokenSimilarity(left: unknown, right: unknown) {
  const a = new Set(String(left || "").split(/\s+/).filter(Boolean));
  const b = new Set(String(right || "").split(/\s+/).filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

function scoreMatch(staged: StagingRow, location: LocationRow) {
  const reasons: string[] = [];
  let score = 0;

  if (staged.location_key && staged.location_key === location.location_key) {
    score = Math.max(score, 100);
    reasons.push("same_location_key");
  }

  if (
    staged.normalized_phone &&
    location.normalized_phone &&
    staged.normalized_phone === location.normalized_phone
  ) {
    score = Math.max(score, 98);
    reasons.push("same_phone");
  }

  if (
    staged.source &&
    staged.source_id &&
    staged.source === location.import_source &&
    staged.source_id === location.import_source_id
  ) {
    score = Math.max(score, 100);
    reasons.push("same_source_id");
  }

  const nameScore = tokenSimilarity(staged.normalized_name, location.normalized_name);
  const addressScore = tokenSimilarity(
    staged.normalized_address,
    location.normalized_address,
  );
  const combined = Math.round(nameScore * 55 + addressScore * 45);
  if (combined >= 70) {
    score = Math.max(score, combined);
    if (nameScore >= 0.75) reasons.push("similar_name");
    if (addressScore >= 0.65) reasons.push("similar_address");
  }

  return { score, reasons };
}

function dedupeLocations(locations: LocationRow[]) {
  const byId = new Map<string, LocationRow>();
  for (const location of locations) {
    if (location.id) byId.set(String(location.id), location);
  }
  return [...byId.values()];
}

async function findPotentialLocations(row: StagingRow) {
  const exactFilters: string[] = [];
  if (row.location_key) exactFilters.push(`location_key.eq.${row.location_key}`);
  if (row.normalized_phone) {
    exactFilters.push(`normalized_phone.eq.${row.normalized_phone}`);
  }
  if (row.source && row.source_id) {
    exactFilters.push(
      `and(import_source.eq.${row.source},import_source_id.eq.${row.source_id})`,
    );
  }

  const locations: LocationRow[] = [];
  if (exactFilters.length) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select(
        "id,location_key,normalized_phone,import_source,import_source_id,normalized_name,normalized_address",
      )
      .or(exactFilters.join(","))
      .limit(25);

    if (error) throw new Error(`Dedupe exact lookup failed: ${error.message}`);
    locations.push(...((data || []) as LocationRow[]));
  }

  if (locations.length === 0 && row.normalized_name && row.normalized_address) {
    const firstNameToken = String(row.normalized_name).split(/\s+/).find(Boolean);
    if (firstNameToken) {
      const { data, error } = await supabaseAdmin
        .from("locations")
        .select(
          "id,location_key,normalized_phone,import_source,import_source_id,normalized_name,normalized_address",
        )
        .ilike("normalized_name", `%${firstNameToken}%`)
        .limit(25);

      if (error) throw new Error(`Dedupe similarity lookup failed: ${error.message}`);
      locations.push(...((data || []) as LocationRow[]));
    }
  }

  return dedupeLocations(locations);
}

export async function dedupeStagedLocationsChunk({
  batchId,
  limit,
}: {
  batchId?: string | null;
  limit: number;
}): Promise<ChunkResult> {
  const safeLimit = toBoundedLimit(limit);

  let query = supabaseAdmin
    .from("location_import_staging")
    .select("*")
    .eq("import_status", "staged")
    .in("duplicate_status", ["unchecked", "unique", "possible_duplicate"])
    .neq("quality_status", "reject")
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (batchId) query = query.eq("batch_id", batchId);

  const { data, error } = await query;
  if (error) throw new Error(`Dedupe chunk select failed: ${error.message}`);

  const rows = (data || []) as StagingRow[];
  const counts = {
    processed: rows.length,
    duplicate: 0,
    possibleDuplicate: 0,
    unique: 0,
    rejected: 0,
    hasMore: false,
  };

  for (let row of rows) {
    if (!hasCompleteStagingQuality(row)) {
      const scored = calculateStagingQuality(row);
      const { error: scoreError } = await supabaseAdmin
        .from("location_import_staging")
        .update({ ...scored, updated_at: new Date().toISOString() })
        .eq("id", row.id);

      if (scoreError) throw new Error(`Dedupe quality update failed: ${scoreError.message}`);
      row = { ...row, ...scored };
    }

    if (row.quality_status === "reject") {
      counts.rejected += 1;
      await supabaseAdmin
        .from("location_import_staging")
        .update({ import_status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      continue;
    }

    const candidates = await findPotentialLocations(row);
    let best: { location: LocationRow; score: number; reasons: string[] } | null = null;

    for (const location of candidates) {
      const scored = scoreMatch(row, location);
      if (scored.score > (best?.score || 0)) {
        best = { location, score: scored.score, reasons: scored.reasons };
      }
    }

    if (best && best.score >= 70) {
      const { error: matchError } = await supabaseAdmin
        .from("location_duplicate_matches")
        .upsert(
          {
            staging_id: row.id,
            existing_location_id: best.location.id,
            duplicate_score: best.score,
            match_reasons: best.reasons,
            decision: "pending",
          },
          { onConflict: "staging_id,existing_location_id" },
        );

      if (matchError) throw new Error(`Dedupe match upsert failed: ${matchError.message}`);
    }

    const duplicateStatus = best && best.score >= 90
      ? "duplicate"
      : best && best.score >= 70
        ? "possible_duplicate"
        : "unique";

    const { error: updateError } = await supabaseAdmin
      .from("location_import_staging")
      .update({
        duplicate_status: duplicateStatus,
        duplicate_score: best?.score || 0,
        matched_location_id: best?.location.id || null,
        import_status: duplicateStatus === "duplicate" ? "duplicate" : "staged",
        rejection_reason:
          duplicateStatus === "duplicate" ? "duplicate_existing_location" : row.rejection_reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateError) throw new Error(`Dedupe staging update failed: ${updateError.message}`);

    if (duplicateStatus === "duplicate") counts.duplicate += 1;
    if (duplicateStatus === "possible_duplicate") counts.possibleDuplicate += 1;
    if (duplicateStatus === "unique") counts.unique += 1;
  }

  counts.hasMore = rows.length === safeLimit;
  return counts;
}
