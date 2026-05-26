import { supabaseAdmin } from "@/lib/supabase-admin";

export type PromoCode = {
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
  target_scope: "any" | "specific_user" | "specific_location" | "signup_user" | "signup_location_owner";
  assigned_user_id: string | null;
  assigned_location_id: string | null;
  assigned_location_name: string | null;
  signup_context: "user_signup" | "location_owner_signup" | "both_signups" | null;
  auto_generated: boolean;
  internal_notes: string | null;
};

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase();
}

export function generatePromoCode(prefix = "OUT", length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const cleanedPrefix = normalizePromoCode(prefix || "OUT").replace(/[^A-Z0-9]/g, "").slice(0, 10) || "OUT";

  let suffix = "";
  for (let i = 0; i < length; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `${cleanedPrefix}-${suffix}`;
}

export async function generateUniquePromoCode(prefix = "OUT") {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generatePromoCode(prefix, 8);
    const { data, error } = await supabaseAdmin.from("promo_codes").select("id").eq("code", code).maybeSingle();

    if (error) throw error;
    if (!data) return code;
  }

  return `${generatePromoCode(prefix, 10)}-${Date.now().toString(36).toUpperCase()}`;
}

export async function validatePromoCode(
  codeInput: string,
  audience: string,
  options?: {
    userId?: string | null;
    locationId?: string | null;
    signupContext?: "user_signup" | "location_owner_signup" | null;
  },
) {
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

  if (promo.target_scope === "specific_user" && promo.assigned_user_id && options?.userId !== promo.assigned_user_id) {
    return { valid: false, message: "This promo code is assigned to a specific user." };
  }
  if (promo.target_scope === "specific_location" && promo.assigned_location_id && options?.locationId !== promo.assigned_location_id) {
    return { valid: false, message: "This promo code is assigned to a specific location." };
  }

  if (promo.target_scope === "signup_user" && options?.signupContext !== "user_signup") {
    return { valid: false, message: "This promo code can only be used during user signup." };
  }
  if (promo.target_scope === "signup_location_owner" && options?.signupContext !== "location_owner_signup") {
    return { valid: false, message: "This promo code can only be used during location owner signup." };
  }

  if (promo.signup_context && promo.signup_context !== "both_signups") {
    if (promo.signup_context !== options?.signupContext) {
      const message =
        promo.signup_context === "user_signup"
          ? "This promo code can only be used during user signup."
          : "This promo code can only be used during location owner signup.";
      return { valid: false, message };
    }
  } else if (promo.signup_context === "both_signups") {
    const allowed = options?.signupContext === "user_signup" || options?.signupContext === "location_owner_signup";
    if (!allowed) return { valid: false, message: "This promo code is not valid or has expired." };
  }

  return { valid: true, message: "Promo code is valid.", promo, code };
}
