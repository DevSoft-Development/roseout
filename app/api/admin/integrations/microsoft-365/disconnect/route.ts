import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const { error } = await supabaseAdmin.from("microsoft_365_connections").update({
    status: "revoked",
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    access_token_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", admin.user_id);
  if (error) throw error;
  return NextResponse.redirect(new URL("/admin/dashboard/settings/microsoft-365?disconnected=1", request.url), 303);
}
