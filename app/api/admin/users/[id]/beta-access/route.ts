import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { syncUserBetaAccess } from "@/lib/beta/programAccess";

const map: Record<string, string> = {
  none: "none",
  invite: "invite",
  approve: "approved",
  active: "active",
  remove: "removed",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.adminUsers);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const choice = String(body.status || "");
  const status = map[choice];
  if (!status) return NextResponse.json({ success: false, error: "Choose a valid beta access option." }, { status: 400 });
  try {
    const result = await syncUserBetaAccess({ userId: id, requestedBetaStatus: status, source: "users_admin", adminUserId: auth.adminUser?.user_id ?? null, actor: auth.adminUser });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to update beta access." }, { status: 500 });
  }
}
