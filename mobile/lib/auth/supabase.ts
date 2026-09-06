import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { hasMobileAuthConfig, mobileConfig } from "@/lib/config";
import { secureAuthStorage } from "@/lib/auth/storage";

export const supabase = hasMobileAuthConfig
  ? createClient(mobileConfig.supabaseUrl, mobileConfig.supabaseAnonKey, {
      auth: {
        storage: secureAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
