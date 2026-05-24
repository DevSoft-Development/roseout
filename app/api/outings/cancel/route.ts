import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const outingId = body?.outing_id ? String(body.outing_id) : "";
  if (!outingId) return NextResponse.json({ success: false, error: "outing_id is required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("outings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", outingId)
    .neq("status", "completed");

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
