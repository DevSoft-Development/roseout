import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.restaurant_id || !body.event_type) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  await supabaseAdmin.from("restaurant_events").insert({
    restaurant_id: body.restaurant_id,
    email: body.email || null,
    event_type: body.event_type,
    metadata: body.metadata || {},
  });

  return NextResponse.json({ success: true });
}