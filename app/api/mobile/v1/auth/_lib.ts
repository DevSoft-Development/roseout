import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireTurnstile } from "@/lib/security/turnstile";

export const MOBILE_SMS_CONSENT_TEXT =
  "I agree to receive SMS messages from TheOutHaven about my account, saved plans, OUTing reminders, reservations, and optional offers. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase.";

export function mobileAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Mobile authentication is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function normalizeUsPhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  return `+1${national}`;
}

export async function requireMobileAuthTurnstile(request: Request, token: unknown, action: string) {
  return requireTurnstile({ request, token: typeof token === "string" ? token : null, action });
}

export async function saveConsumerProfile(input: {
  userId: string;
  phoneE164: string | null;
  birthMonth: number | null;
  smsConsent: boolean;
}) {
  const now = new Date().toISOString();
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("consumer_profiles").upsert({
    user_id: input.userId,
    phone_e164: input.phoneE164,
    birth_month: input.birthMonth,
    sms_consent: input.smsConsent,
    sms_consent_at: input.smsConsent ? now : null,
    sms_consent_source: input.smsConsent ? "mobile_account_signup" : null,
    sms_consent_text: input.smsConsent ? MOBILE_SMS_CONSENT_TEXT : null,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (error) throw error;
}
