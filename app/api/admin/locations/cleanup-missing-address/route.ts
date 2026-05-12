import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

type LocationTable = "restaurants" | "activities";

type LocationRow = {
  id: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

type CleanupBody = {
  limit?: number | string;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function isMissing(value: unknown) {
  return !cleanText(value);
}

function cleanAddress(address: string | null | undefined) {
  return cleanText(address)
    .replace(/,\s*USA$/i, "")
    .replace(/,\s*United States$/i, "");
}

function parseAddressParts(address: string | null | undefined) {
  const cleaned = cleanAddress(address);
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  const stateZip = parts.length >= 1 ? parts[parts.length - 1] : "";
  const stateZipMatch = stateZip.match(/\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);
  const stateOnlyMatch = stateZip.match(/\b([A-Z]{2})\b/);
  const zipOnlyMatch = cleaned.match(/\b(\d{5})(?:-\d{4})?\b/);

  let city = "";
  if (parts.length >= 2) {
    city = parts[parts.length - 2].replace(/\b[A-Z]{2}\b.*$/, "").trim();
  }

  return {
    city,
    state: stateZipMatch?.[1] || stateOnlyMatch?.[1] || "",
    zip_code: stateZipMatch?.[2] || zipOnlyMatch?.[1] || "",
  };
}

function buildUpdates(location: LocationRow) {
  const parsed = parseAddressParts(location.address);
  const updates: Partial<Pick<LocationRow, "city" | "state" | "zip_code">> = {};

  if (isMissing(location.city) && parsed.city) updates.city = parsed.city;
  if (isMissing(location.state) && parsed.state) updates.state = parsed.state;
  if (isMissing(location.zip_code) && parsed.zip_code) updates.zip_code = parsed.zip_code;

  return updates;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function cleanupTable(table: LocationTable, limit: number) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id,address,city,state,zip_code")
    .not("address", "is", null)
    .or("city.is.null,city.eq.,state.is.null,state.eq.,zip_code.is.null,zip_code.eq.")
    .limit(limit);

  if (error) throw new Error(error.message);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const location of (data || []) as LocationRow[]) {
    const updates = buildUpdates(location);

    if (!Object.keys(updates).length) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update(updates)
      .eq("id", location.id);

    if (updateError) {
      failed += 1;
      errors.push(`${location.id}: ${updateError.message}`);
    } else {
      updated += 1;
    }
  }

  return {
    table,
    checked: data?.length || 0,
    updated,
    skipped,
    failed,
    errors: errors.slice(0, 10),
  };
}

async function logCleanupRun(meta: Record<string, unknown>, error?: string) {
  try {
    await supabaseAdmin.from("import_logs").insert({
      job_name: "location_address_cleanup",
      imported_count: Number(meta.updated || 0),
      error: error || null,
      meta,
    });
  } catch (logError) {
    console.error("Location cleanup logging failed:", logError);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireAdminApiRole([
      "superuser",
      "admin",
      "editor",
    ]);

    if (authError) return authError;

    const body = (await request.json().catch(() => ({}))) as CleanupBody;
    const limit = Math.max(1, Math.min(Number(body.limit || 100), 500));

    const restaurants = await cleanupTable("restaurants", limit);
    const activities = await cleanupTable("activities", limit);
    const updated = restaurants.updated + activities.updated;
    const failed = restaurants.failed + activities.failed;

    const meta = {
      success: failed === 0,
      limit,
      checked: restaurants.checked + activities.checked,
      updated,
      failed,
      restaurants,
      activities,
    };

    await logCleanupRun(meta, failed ? "Some locations failed to update" : undefined);

    return NextResponse.json(meta);
  } catch (error: unknown) {
    const message = getErrorMessage(error) || "Location cleanup failed";
    await logCleanupRun({ success: false, error: message }, message);

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
