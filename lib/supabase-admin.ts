import { createClient } from "@supabase/supabase-js";
import WebSocketTransport from "next/dist/compiled/ws";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    realtime: {
      transport: WebSocketTransport,
    },
  },
);
