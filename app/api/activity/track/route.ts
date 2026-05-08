import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const cookieStore = await cookies();
    const impersonatedUserId = cookieStore.get(
      "theouthaven_impersonate_user_id"
    )?.value;

    const supabase = adminSupabase();

    await supabase.from("user_activity_events").insert({
      user_id: body.user_id || impersonatedUserId || null,
      session_id: body.session_id || null,
      event_type: body.event_type,
      event_name: body.event_name || null,
      page_path: body.page_path || null,
      metadata: body.metadata || {},
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to track activity" },
      { status: 500 }
    );
  }
}