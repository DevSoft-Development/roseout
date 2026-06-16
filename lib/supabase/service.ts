import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireSupabaseServiceRoleKey, requireSupabaseUrl } from "../env";

export function getSupabaseServiceClient() {
  return createClient(requireSupabaseUrl(), requireSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
