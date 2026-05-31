import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertValidSupabaseEnv() {
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL. Expected a full URL like https://xxxx.supabase.co but received: ${supabaseUrl}`,
    );
  }
}

assertValidSupabaseEnv();

export const supabaseAdmin = createClient(supabaseUrl!, serviceRoleKey!, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
