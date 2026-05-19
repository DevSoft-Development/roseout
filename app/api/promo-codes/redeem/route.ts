import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validatePromoCode } from "@/lib/promo-codes";

export async function POST(request: NextRequest) {
  const { code, audience, location_id, location_type } = await request.json();
  if (!code || !audience) return NextResponse.json({ error: "code and audience are required." }, { status: 400 });

  const result = await validatePromoCode(code, audience);
  if (!result.valid || !result.promo) return NextResponse.json({ error: result.message }, { status: 400 });
  const promo = result.promo;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (audience === "users") {
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { count } = await supabaseAdmin
      .from("promo_code_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", promo.id)
      .eq("user_id", user.id);

    if ((count ?? 0) >= (promo.max_redemptions_per_user ?? 1)) {
      return NextResponse.json({ error: "Promo code already redeemed the maximum number of times." }, { status: 400 });
    }

    const premiumUntil = promo.duration_days ? new Date(Date.now() + promo.duration_days * 86400000).toISOString() : null;
    const grantedPlan = promo.plan_granted || (promo.promo_type === "premium_access" ? "admin_granted_premium" : "registered");

    const updates: Record<string, unknown> = {
      promo_code_used: result.code,
      plan: grantedPlan,
      premium_until: premiumUntil,
    };
    if (promo.search_limit_override) updates.weekly_search_limit = promo.search_limit_override;

    const { error: profileError } = await supabaseAdmin.from("user_profiles").update(updates).eq("id", user.id);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    await supabaseAdmin.from("promo_code_redemptions").insert({ promo_code_id: promo.id, code: result.code, user_id: user.id, audience, granted_plan: grantedPlan, premium_until: premiumUntil, search_limit_override: promo.search_limit_override, discount_percent: promo.discount_percent, discount_amount: promo.discount_amount });
  }

  if (audience === "locations") {
    if (!location_id || !location_type) return NextResponse.json({ error: "location_id and location_type are required for location redemptions." }, { status: 400 });
    const table = location_type === "activities" ? "activities" : "restaurants";
    const proUntil = promo.duration_days ? new Date(Date.now() + promo.duration_days * 86400000).toISOString() : null;
    await supabaseAdmin.from(table).update({ plan: promo.plan_granted || "pro", plan_status: "active", pro_until: proUntil, promo_code_used: result.code }).eq("id", location_id);
    await supabaseAdmin.from("promo_code_redemptions").insert({ promo_code_id: promo.id, code: result.code, location_id, location_type, audience, granted_plan: promo.plan_granted || "pro", premium_until: proUntil });
  }

  const { error: rpcError } = await supabaseAdmin.rpc("increment_promo_redemption", { promo_id_input: promo.id });
  if (rpcError) {
    await supabaseAdmin.from("promo_codes").update({ redemption_count: (promo.redemption_count || 0) + 1, updated_at: new Date().toISOString() }).eq("id", promo.id);
  }

  return NextResponse.json({ success: true });
}
