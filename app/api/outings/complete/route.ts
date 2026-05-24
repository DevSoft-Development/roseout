import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const outingId = body?.outing_id ? String(body.outing_id) : "";
  if (!outingId) return NextResponse.json({ success: false, error: "outing_id is required" }, { status: 400 });

  const { data: existing } = await supabaseAdmin.from("outings").select("id,status").eq("id", outingId).maybeSingle();
  if (!existing) return NextResponse.json({ success: false, error: "Outing not found" }, { status: 404 });
  if (existing.status === "completed") return NextResponse.json({ success: false, error: "Outing already completed" }, { status: 409 });

  const updates = {
    status: "completed",
    completed_at: new Date().toISOString(),
    rating: typeof body?.rating === "number" ? Math.max(1, Math.min(5, body.rating)) : null,
    matched_vibe: typeof body?.matched_vibe === "boolean" ? body.matched_vibe : null,
    would_go_again: typeof body?.would_go_again === "boolean" ? body.would_go_again : null,
    feedback: body?.feedback ? String(body.feedback).slice(0, 2000) : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("outings").update(updates).eq("id", outingId);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
