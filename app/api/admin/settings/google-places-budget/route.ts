import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";
import {
  GOOGLE_PLACES_BUDGET_KEY,
  getGooglePlacesBudgetConfig,
  normalizeGooglePlacesBudget,
} from "@/lib/google/google-places-budget";
import { getGoogleCostControlAdminSnapshot } from "@/lib/google/google-places-cost-control";
import {
  locationIntelligenceApiConfigured,
  readGoogleBudgetSummaryViaLocationIntelligenceApi,
} from "@/lib/aws/location-intelligence-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireBudgetAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await getAdminLoginRole(supabaseAdmin as any, { id: user.id, email: user.email ?? null });
  return role === "admin" || role === "superadmin" ? { user, role } : null;
}

async function readSummary() {
  if (!locationIntelligenceApiConfigured()) return null;
  try {
    return await readGoogleBudgetSummaryViaLocationIntelligenceApi();
  } catch (error) {
    console.warn("Google Places budget summary unavailable", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function GET() {
  const access = await requireBudgetAdmin();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [settings, summary, controls] = await Promise.all([
    getGooglePlacesBudgetConfig(),
    readSummary(),
    getGoogleCostControlAdminSnapshot().catch(() => null),
  ]);
  return NextResponse.json({ settings, summary, controls });
}

export async function PATCH(request: Request) {
  const access = await requireBudgetAdmin();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const value = normalizeGooglePlacesBudget(body);

  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key: GOOGLE_PLACES_BUDGET_KEY,
    value,
    updated_by: access.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Unable to save Google Places budget settings", error);
    return NextResponse.json({ error: "Unable to save Google Places budget settings." }, { status: 500 });
  }

  const [summary, controls] = await Promise.all([
    readSummary(),
    getGoogleCostControlAdminSnapshot().catch(() => null),
  ]);
  return NextResponse.json({ success: true, settings: value, summary, controls });
}
