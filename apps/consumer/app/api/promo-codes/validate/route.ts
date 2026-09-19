import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { validatePromoCode } from "@/lib/promo-codes";

export async function POST(request: NextRequest) {
  const { code, audience, location_id, signup_context } = await request.json();
  if (!code || !audience) return NextResponse.json({ valid: false, message: "code and audience are required." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await validatePromoCode(code, audience, {
    userId: user?.id ?? null,
    locationId: location_id ?? null,
    signupContext: signup_context ?? null,
  });

  const promo = result.valid ? result.promo : null;
  return NextResponse.json({
    valid: result.valid,
    message: result.message,
    promo: promo
      ? {
          code: promo.code,
          name: promo.name,
          description: promo.description,
          promo_type: promo.promo_type,
          duration_days: promo.duration_days,
          plan_granted: promo.plan_granted,
          discount_percent: promo.discount_percent,
          discount_amount: promo.discount_amount,
          target_scope: promo.target_scope,
          signup_context: promo.signup_context,
        }
      : null,
  });
}
