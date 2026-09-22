import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type PersonalizationPreferences = {
  personalizationEnabled: boolean;
  searchHistoryPersonalizationEnabled: boolean;
};

export const DEFAULT_PERSONALIZATION_PREFERENCES: PersonalizationPreferences = {
  personalizationEnabled: true,
  searchHistoryPersonalizationEnabled: true,
};

export async function getPersonalizationPreferences(userId: string): Promise<PersonalizationPreferences> {
  const { data, error } = await supabaseAdmin
    .from("user_privacy_preferences")
    .select("personalization_enabled,search_history_personalization_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_PERSONALIZATION_PREFERENCES;
  return {
    personalizationEnabled: data.personalization_enabled !== false,
    searchHistoryPersonalizationEnabled: data.search_history_personalization_enabled !== false,
  };
}

export async function setPersonalizationPreferences(userId: string, next: Partial<PersonalizationPreferences>) {
  const current = await getPersonalizationPreferences(userId).catch(() => DEFAULT_PERSONALIZATION_PREFERENCES);
  const value = {
    user_id: userId,
    personalization_enabled: next.personalizationEnabled ?? current.personalizationEnabled,
    search_history_personalization_enabled: next.searchHistoryPersonalizationEnabled ?? current.searchHistoryPersonalizationEnabled,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("user_privacy_preferences").upsert(value, { onConflict: "user_id" });
  if (error) throw error;
  return {
    personalizationEnabled: value.personalization_enabled,
    searchHistoryPersonalizationEnabled: value.search_history_personalization_enabled,
  };
}
