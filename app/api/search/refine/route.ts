import { NextResponse } from "next/server";
import { searchV2 } from "@/lib/search/v2";
import type { SearchPlan } from "@/lib/search/v2";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validPreviousPlan(value: unknown): value is SearchPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return (
    plan.version === "search-plan-v1" &&
    typeof plan.requestId === "string" &&
    typeof plan.rawQuery === "string" &&
    typeof plan.mode === "string" &&
    Boolean(plan.restaurant && typeof plan.restaurant === "object") &&
    Boolean(plan.activity && typeof plan.activity === "object") &&
    Boolean(plan.geo && typeof plan.geo === "object")
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const query = String((body as any).query ?? "").trim().slice(0, 500);
    if (!query) {
      return NextResponse.json({ ok: false, error: "query_required" }, { status: 400 });
    }

    const previousPlan = (body as any).previousPlan ?? (body as any).previous_plan ?? null;
    if (!validPreviousPlan(previousPlan)) {
      return NextResponse.json({ ok: false, error: "valid_previous_plan_required" }, { status: 400 });
    }

    const latitude = Number((body as any).latitude);
    const longitude = Number((body as any).longitude);
    const radiusMiles = Number((body as any).radiusMiles ?? (body as any).radius_miles);
    const userLocation = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? {
          latitude,
          longitude,
          radiusMiles: Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : undefined,
        }
      : null;

    const result = await searchV2({
      query,
      requestId: crypto.randomUUID(),
      previousPlan,
      userLocation,
      market: typeof (body as any).market === "string" ? (body as any).market : previousPlan.geo.market,
      plannedFor: typeof (body as any).plannedFor === "string" ? (body as any).plannedFor : previousPlan.plannedFor,
      supabase: supabaseAdmin,
    });

    return NextResponse.json({
      ok: true,
      refinement: result.debug?.conversationRefinement ?? null,
      result,
    });
  } catch (error) {
    console.error("SEARCH_REFINEMENT_FAILED", error);
    return NextResponse.json({ ok: false, error: "search_refinement_failed" }, { status: 500 });
  }
}
