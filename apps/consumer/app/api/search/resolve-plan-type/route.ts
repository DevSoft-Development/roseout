import { NextResponse } from "next/server";
import { resolvePlanTypeWithSearchV2 } from "@/lib/search/resolvePlanTypeWithSearchV2";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!query) {
      return NextResponse.json({ error: "query_required" }, { status: 400 });
    }

    const planType = await resolvePlanTypeWithSearchV2(query);
    return NextResponse.json({ planType });
  } catch (error) {
    console.error("resolve-plan-type failed", error);
    return NextResponse.json({ error: "intent_resolution_failed" }, { status: 500 });
  }
}
