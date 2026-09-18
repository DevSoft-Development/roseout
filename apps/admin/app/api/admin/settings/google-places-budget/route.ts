import { NextResponse } from "next/server";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  GOOGLE_PLACES_BUDGET_KEY,
  getGooglePlacesBudgetConfig,
  normalizeGooglePlacesBudget,
} from "@/lib/google/google-places-budget";
import { getGoogleCostControlAdminSnapshot } from "@/lib/google/google-places-cost-control-admin";
import {
  locationIntelligenceApiConfigured,
  readGoogleBudgetSummaryViaLocationIntelligenceApi,
} from "@/lib/aws/location-intelligence-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readSummary() {
  if (!locationIntelligenceApiConfigured()) return null;

  try {
    return await readGoogleBudgetSummaryViaLocationIntelligenceApi();
  } catch (error) {
    console.warn(
      "Google Places budget summary unavailable",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export async function GET() {
  await requireAdminRole(["superadmin", "admin"]);

  const [settings, summary, controls] = await Promise.all([
    getGooglePlacesBudgetConfig(),
    readSummary(),
    getGoogleCostControlAdminSnapshot().catch(() => null),
  ]);

  return NextResponse.json({ settings, summary, controls });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminRole(["superadmin", "admin"]);
  const body = await request.json().catch(() => ({}));
  const value = normalizeGooglePlacesBudget(body);

  const { error } = await getAdminDatabaseClient()
    .from("app_settings")
    .upsert({
      key: GOOGLE_PLACES_BUDGET_KEY,
      value,
      updated_by: admin.user_id,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("Unable to save Google Places budget settings", error);
    return NextResponse.json(
      { error: "Unable to save Google Places budget settings." },
      { status: 500 },
    );
  }

  const [summary, controls] = await Promise.all([
    readSummary(),
    getGoogleCostControlAdminSnapshot().catch(() => null),
  ]);

  return NextResponse.json({
    success: true,
    settings: value,
    summary,
    controls,
  });
}
