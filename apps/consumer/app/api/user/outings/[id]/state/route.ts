import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ACTIONS = new Set(["start_booking"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  if (!ACTIONS.has(action)) return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });

  const { data: existing } = await supabaseAdmin.from("outings")
    .select("id,status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (["completed", "completed_no_feedback", "cancelled"].includes(String(existing.status || ""))) {
    return NextResponse.json({ success: false, error: "This outing can no longer enter booking." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("outings")
    .update({ status: "planned", contact_method: "book_plan", updated_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,status")
    .single();

  if (error || !data) return NextResponse.json({ success: false, error: "Could not update outing." }, { status: 400 });
  return NextResponse.json({ success: true, outing: data });
}
