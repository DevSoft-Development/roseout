import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseServiceRoleKey, requireSupabaseUrl } from "./env";

let client: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (!client) {
    client = createClient(requireSupabaseUrl(), requireSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdminClient(), prop, receiver);
  },
});
