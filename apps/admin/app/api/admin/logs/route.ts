import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { loadAdminSystemLogs } from "@/lib/admin-logs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdminOrNull();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (admin.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const result = await loadAdminSystemLogs({
    category: sp.get("category") || undefined,
    level: sp.get("level") || undefined,
    entity_type: sp.get("entity_type") || undefined,
    actor: sp.get("actor") || undefined,
    search: sp.get("search") || undefined,
    limit: sp.get("limit") || undefined,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ logs: result.logs });
}
