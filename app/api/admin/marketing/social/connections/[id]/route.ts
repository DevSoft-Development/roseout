import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingSocialAccounts);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("marketing_social_connections")
    .update({ status: "disconnected", last_error: null, updated_at: now })
    .eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await supabaseAdmin.from("marketing_social_connection_secrets").delete().eq("connection_id", id);
  return NextResponse.json({ success: true });
}
