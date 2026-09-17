import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@theouthaven/config/server-env";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(requireSupabaseUrl(), requireSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, path: "/" });
          }
        } catch {
          // Server Components cannot set cookies. Route handlers can.
        }
      },
    },
  });
}
