import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { generateUniquePromoCode, normalizePromoCode } from "@/lib/promo-codes";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.promoCodes);
  if (auth.error) return auth.error;
  const body = await request.json();
  const prefix = normalizePromoCode(typeof body?.prefix === "string" ? body.prefix : "OUT").replace(/[^A-Z0-9]/g, "").slice(0, 10) || "OUT";
  const code = await generateUniquePromoCode(prefix);
  return NextResponse.json({ code });
}
