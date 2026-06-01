import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  CHAIN_BRANDS,
  detectChainBrand,
} from "@/lib/location-growth/chainDetection";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ChainTable = "locations" | "location_import_staging";

type ChainRow = {
  id: string;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  is_chain: boolean | null;
  brand_type: string | null;
  chain_brand: string | null;
  curation_tier: string | null;
  date_score: number | null;
  search_boost: number | null;
};

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;

  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") ===
      process.env.IMPORT_SECRET
  ) {
    return null;
  }

  const { error } = await requireAdminApiRole(["admin", "superadmin"]);
  return error;
}

function boundedLimit(value: unknown) {
  const n = Number(value ?? 500);
  if (!Number.isFinite(n)) return 500;
  return Math.min(Math.max(Math.trunc(n), 1), 500);
}

function nameFor(row: Pick<ChainRow, "name" | "restaurant_name" | "activity_name">) {
  return String(row.name || row.restaurant_name || row.activity_name || "").trim();
}

function buildChainCandidateFilter() {
  const tokens = CHAIN_BRANDS.flatMap((brand) => {
    const first = brand.split(/\s+/)[0];
    return [brand, first];
  }).filter((value, index, arr) => value && arr.indexOf(value) === index);

  return tokens
    .flatMap((token) => [
      `name.ilike.%${token}%`,
      `restaurant_name.ilike.%${token}%`,
      `activity_name.ilike.%${token}%`,
    ])
    .join(",");
}

function chainUpdates(row: ChainRow) {
  const locationName = nameFor(row);
  const detected = detectChainBrand(locationName);

  if (detected.isChain) {
    return {
      is_chain: true,
      brand_type: "chain",
      chain_brand: detected.chainBrand,
      curation_tier: "utility",
      date_score: 20,
      search_boost: -25,
      is_featured: false,
      chain_confidence: 0.95,
      chain_classification_reason: `Matched known chain brand: ${detected.chainBrand}`,
      chain_classified_at: new Date().toISOString(),
    };
  }

  return {
    is_chain: false,
    brand_type: row.brand_type || "independent",
    chain_brand: null,
    curation_tier: row.curation_tier || "standard",
    date_score: row.date_score ?? 50,
    search_boost: row.search_boost ?? 0,
    chain_confidence: 0.9,
    chain_classification_reason: locationName
      ? "No known chain brand matched."
      : "No usable location name was available for chain detection.",
    chain_classified_at: new Date().toISOString(),
  };
}

async function selectCandidates(table: ChainTable, limit: number) {
  const brandFilter = buildChainCandidateFilter();
  const selectColumns =
    "id,name,restaurant_name,activity_name,is_chain,brand_type,chain_brand,curation_tier,date_score,search_boost";

  let prioritizedRows: ChainRow[] = [];

  /*
    Important:
    chain_classified_at is the real progress cursor. The brand OR filter is only
    used to prioritize likely chains; if brand matches do not fill the chunk,
    the action fills the rest with any unclassified rows so progress can reach
    zero.
  */
  if (brandFilter) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(selectColumns)
      .is("chain_classified_at", null)
      .or(brandFilter)
      .order("id", { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`${table} classify select failed: ${error.message}`);
    }

    prioritizedRows = (data || []) as ChainRow[];
  }

  if (prioritizedRows.length >= limit) {
    return prioritizedRows;
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .select(selectColumns)
    .is("chain_classified_at", null)
    .order("id", { ascending: true })
    .limit(limit + prioritizedRows.length);

  if (error) {
    throw new Error(`${table} classify select failed: ${error.message}`);
  }

  const seen = new Set(prioritizedRows.map((row) => row.id));
  const fillRows = ((data || []) as ChainRow[]).filter((row) => !seen.has(row.id));

  return [...prioritizedRows, ...fillRows].slice(0, limit);
}

async function countRemaining(table: ChainTable) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .is("chain_classified_at", null);

  if (error) {
    throw new Error(`${table} classify remaining count failed: ${error.message}`);
  }

  return count || 0;
}

async function processTable(table: ChainTable, limit: number) {
  if (limit <= 0) {
    const remaining = await countRemaining(table);
    return {
      table,
      processed: 0,
      chainsFound: 0,
      independentFound: 0,
      failed: 0,
      remaining,
    };
  }

  const rows = await selectCandidates(table, limit);

  let processed = 0;
  let chainsFound = 0;
  let independentFound = 0;
  let failed = 0;

  for (const row of rows) {
    const updates = chainUpdates(row);

    if (updates.is_chain) {
      chainsFound += 1;
    } else {
      independentFound += 1;
    }

    const { error } = await supabaseAdmin
      .from(table)
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      failed += 1;
      console.error(`${table} chain classification failed`, {
        id: row.id,
        error: error.message,
      });
      continue;
    }

    processed += 1;
  }

  const remaining = await countRemaining(table);

  return {
    table,
    processed,
    chainsFound,
    independentFound,
    failed,
    remaining,
  };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth) return auth;

  const body = await request.json().catch(() => ({}));
  const limit = boundedLimit(body.limit);

  try {
    const live = await processTable("locations", limit);
    const remainingLimit = Math.max(limit - live.processed, 0);

    const staging =
      remainingLimit > 0
        ? await processTable("location_import_staging", remainingLimit)
        : {
            table: "location_import_staging" as const,
            processed: 0,
            chainsFound: 0,
            independentFound: 0,
            failed: 0,
            remaining: await countRemaining("location_import_staging"),
          };

    const processed = live.processed + staging.processed;
    const chainsFound = live.chainsFound + staging.chainsFound;
    const independentFound = live.independentFound + staging.independentFound;
    const failed = live.failed + staging.failed;
    const remaining = live.remaining + staging.remaining;

    const message =
      remaining > 0
        ? `Classified ${processed.toLocaleString()} locations. Found ${chainsFound.toLocaleString()} chains and marked ${independentFound.toLocaleString()} as independent. ${remaining.toLocaleString()} still need classification. Run Classify Chains again to continue.`
        : `Chain classification complete. Classified ${processed.toLocaleString()} locations in this run. Found ${chainsFound.toLocaleString()} chains and marked ${independentFound.toLocaleString()} as independent.`;

    return NextResponse.json({
      success: true,
      processed,
      chainsFound,
      independentFound,
      failed,
      remaining,
      hasMore: remaining > 0,
      message,
      live,
      staging,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
