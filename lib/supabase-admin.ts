import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import WebSocketTransport from "next/dist/compiled/ws";
import { requireSupabaseServiceRoleKey, requireSupabaseUrl } from "./env";

let client: SupabaseClient<Database> | null = null;

export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(
      requireSupabaseUrl(),
      requireSupabaseServiceRoleKey(),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: WebSocketTransport },
      },
    );
  }
  return client;
}

// Keep the underlying client schema-typed, while allowing legacy admin pages
// with runtime-computed update keys to pass values through PostgREST safely.
export const supabaseAdmin = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getSupabaseAdminClient(), prop, receiver);
    },
  },
) as SupabaseClient<any>;
