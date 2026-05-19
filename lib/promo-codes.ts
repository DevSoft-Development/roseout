import { supabaseAdmin } from "@/lib/supabase-admin";

type PromoCode = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  audience: "users" | "locations" | "both";
  promo_type: "premium_access" | "search_boost" | "location_pro_trial" | "discount";
  plan_granted: string | null;
  duration_days: number | null;
  search_limit_override: number | null;
  discount_percent: number | null;
  discount_amount: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  max_redemptions_per_user: number | null;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
};

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase();
}

export async function validatePromoCode(codeInput: string, audience: string) {
  const code = normalizePromoCode(codeInput);
  const { data: promo, error } = await supabaseAdmin.from("promo_codes").select("*").eq("code", code).maybeSingle<PromoCode>();
  if (error || !promo) return { valid: false, message: "This promo code is not valid or has expired." };
  const now = new Date();
  const startsAt = new Date(promo.starts_at);
  const expiresAt = promo.expires_at ? new Date(promo.expires_at) : null;
  const audienceOk = promo.audience === "both" || promo.audience === audience;
  const isExhausted = promo.max_redemptions !== null && promo.redemption_count >= promo.max_redemptions;
  if (!promo.is_active || now < startsAt || (expiresAt && now > expiresAt) || !audienceOk || isExhausted) {
    return { valid: false, message: "This promo code is not valid or has expired." };
  }
  return {
    valid: true,
    message: "Promo code is valid.",
    promo,
    code,
  };
}
