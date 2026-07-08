import { supabaseAdmin } from "@/lib/supabase-admin";
export const AI_TAG_HELPER_SETTINGS_KEY = "ai_tag_helper_settings";
export const AI_TAG_HELPER_ACCESS_VALUES = ["off","admins_only","paid_only","all"] as const;
export type AiTagHelperAccess = typeof AI_TAG_HELPER_ACCESS_VALUES[number];
export type AiTagHelperSettings = { access: AiTagHelperAccess };
export const DEFAULT_AI_TAG_HELPER_SETTINGS: AiTagHelperSettings = { access: "admins_only" };
export function normalizeAiTagHelperSettings(value:any): AiTagHelperSettings {
  const access = AI_TAG_HELPER_ACCESS_VALUES.includes(value?.access) ? value.access : DEFAULT_AI_TAG_HELPER_SETTINGS.access;
  return { access };
}
export async function getAiTagHelperSettings(): Promise<AiTagHelperSettings> {
  try { const {data}=await supabaseAdmin.from("app_settings").select("value").eq("key",AI_TAG_HELPER_SETTINGS_KEY).maybeSingle(); return normalizeAiTagHelperSettings(data?.value); }
  catch { return DEFAULT_AI_TAG_HELPER_SETTINGS; }
}
