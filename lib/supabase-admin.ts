import { createClient } from "@supabase/supabase-js";
import WebSocketTransport from "next/dist/compiled/ws";

function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

function assertValidSupabaseAdminEnv() {
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  try {
    const parsed = new URL(supabaseUrl);

    if (!parsed.protocol.startsWith("http")) {
      throw new Error("Supabase URL must start with http or https.");
    }
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Expected a full URL like https://xxxx.supabase.co.",
    );
  }
}

assertValidSupabaseAdminEnv();

export const supabaseAdmin = createClient(supabaseUrl!, serviceRoleKey!, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: WebSocketTransport,
  },
});
