import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseServiceRoleKey, requireSupabaseUrl } from "@theouthaven/config/server-env";

let client: SupabaseClient | null = null;

export function getAdminDatabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(requireSupabaseUrl(), requireSupabaseServiceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return client;
}
