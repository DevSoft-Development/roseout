import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { loadAdminReviews } from "@/lib/reviews";

export const dynamic = "force-dynamic";

const MODERATION_ROLES = ["superadmin", "admin", "editor"] as const;

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!MODERATION_ROLES.includes(admin.role as (typeof MODERATION_ROLES)[number])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const result = await loadAdminReviews({
    type: sp.get("type") || undefined,
    status: sp.get("status") || undefined,
    verified: sp.get("verified") || undefined,
    source: sp.get("source") || undefined,
    q: sp.get("q") || sp.get("search") || undefined,
    locationId: sp.get("location_id") || undefined,
    limit: Number(sp.get("limit") || 50),
    offset: Number(sp.get("offset") || 0),
  });

  if (result.error) {
    return NextResponse.json(
      {
        reviews: [],
        stats: result.stats,
        warning: "Unable to load review data at the moment.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    reviews: result.reviews,
    stats: result.stats,
    warning: result.warning,
  });
}
