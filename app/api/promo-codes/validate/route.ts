import { NextRequest, NextResponse } from "next/server";
import { validatePromoCode } from "@/lib/promo-codes";

export async function POST(request: NextRequest) {
  const { code, audience } = await request.json();
  if (!code || !audience) return NextResponse.json({ valid: false, message: "code and audience are required." }, { status: 400 });
  const result = await validatePromoCode(code, audience);
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
        }
      : null,
  });
}
