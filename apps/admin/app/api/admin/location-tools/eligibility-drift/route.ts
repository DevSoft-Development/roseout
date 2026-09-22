import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

type RepairResult = {
  location_id: string;
  changed: boolean;
};

function boundedLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const limit = boundedLimit(request.nextUrl.searchParams.get("limit"));
  const { data, error } = await supabaseAdmin.rpc("toh_find_location_eligibility_drift", {
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    limit,
    count: data?.length ?? 0,
    drift: data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(["superadmin"]);
  if (auth.error) return auth.error;

  let body: { limit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const limit = boundedLimit(body.limit);
  const { data, error } = await supabaseAdmin.rpc("toh_repair_location_eligibility_drift", {
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = (data ?? []) as RepairResult[];
  const repaired = results.filter((row) => row.changed === true).length;

  return NextResponse.json({
    limit,
    inspected: results.length,
    repaired,
    results,
  });
}
