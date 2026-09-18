import { NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const adminUser = await getCurrentAdminOrNull();
  if (!adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_PAGE_ACCESS.marketingSocialAccounts.includes(adminUser.role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const now = new Date().toISOString();
  const { error } = await getAdminDatabaseClient()
    .from("marketing_social_connections")
    .update({ status: "disconnected", last_error: null, updated_at: now })
    .eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await getAdminDatabaseClient().from("marketing_social_connection_secrets").delete().eq("connection_id", id);
  return NextResponse.json({ success: true });
}
