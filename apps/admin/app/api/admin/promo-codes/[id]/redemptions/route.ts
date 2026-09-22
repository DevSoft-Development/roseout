import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const REDEMPTION_FIELDS = "id,promo_code_id,code,user_id,location_id,location_type,audience,granted_plan,premium_until,search_limit_override,discount_percent,discount_amount,created_at,signup_context";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.promoCodes);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("promo_code_redemptions")
    .select(REDEMPTION_FIELDS)
    .eq("promo_code_id", id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ redemptions: data ?? [] });
}
