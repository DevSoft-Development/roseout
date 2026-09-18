import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const adminDb = getAdminDatabaseClient();

  const { error } = await adminDb
    .from("microsoft_365_connections")
    .update({
      status: "revoked",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      access_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", admin.user_id);

  if (error) throw error;

  return NextResponse.redirect(
    new URL(
      "/admin/dashboard/settings/microsoft-365?disconnected=1",
      request.url,
    ),
    303,
  );
}
