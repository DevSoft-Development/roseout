import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { loadPlatformErrors } from "@/lib/platform-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdminOrNull();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (admin.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const result = await loadPlatformErrors({
    q: params.get("q") || undefined,
    route: params.get("route") || undefined,
    type: params.get("type") || undefined,
    severity: params.get("severity") || undefined,
    visible: params.get("visible") || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
  });

  return NextResponse.json(result);
}
