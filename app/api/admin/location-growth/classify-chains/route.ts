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

function nameFor(row: Record<string, unknown>) {
  return String(row.name || row.restaurant_name || row.activity_name || "");
}

function chainUpdates(row: Record<string, unknown>) {
  const detected = detectChainBrand(nameFor(row));
  if (detected.isChain) {
    return {
      is_chain: true,
      brand_type: "chain",
      chain_brand: detected.chainBrand,
      curation_tier: "utility",
      date_score: 20,
      search_boost: -25,
      is_featured: false,
    };
  }

  return {
    is_chain: false,
    brand_type: "independent",
    chain_brand: null,
    curation_tier: row.curation_tier || "standard",
    date_score: row.date_score ?? 50,
    search_boost: row.search_boost ?? 0,
  };
}

function chainCandidateFilter() {
  const tokens = CHAIN_BRANDS.flatMap((brand) => {
    const first = brand.split(/\s+/)[0];
    return [brand, first];
  }).filter((value, index, arr) => value && arr.indexOf(value) === index);

  return [
    "is_chain.is.null",
    "brand_type.is.null",
    "curation_tier.is.null",
    ...tokens.flatMap((token) => [
      `name.ilike.%${token}%`,
      `restaurant_name.ilike.%${token}%`,
      `activity_name.ilike.%${token}%`,
    ]),
  ].join(",");
}

async function processTable(
  table: "locations" | "location_import_staging",
  limit: number,
) {
  const filter = chainCandidateFilter();
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(
      "id,name,restaurant_name,activity_name,is_chain,brand_type,chain_brand,curation_tier,date_score,search_boost",
    )
    .or(filter)
    .order("id", { ascending: true })
    .limit(limit);

  if (error)
    throw new Error(`${table} classify select failed: ${error.message}`);

  let processed = 0;
  let chainsFound = 0;
  for (const row of data || []) {
    const updates = chainUpdates(row);
    if (updates.is_chain) chainsFound += 1;
    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError)
      throw new Error(
        `${table} classify update failed: ${updateError.message}`,
      );
    processed += 1;
  }

  const { count } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .or(filter);

  return { processed, chainsFound, remaining: count || 0 };
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
        : { processed: 0, chainsFound: 0, remaining: 0 };

    return NextResponse.json({
      success: true,
      processed: live.processed + staging.processed,
      chainsFound: live.chainsFound + staging.chainsFound,
      remaining: live.remaining + staging.remaining,
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
