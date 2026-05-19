import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const payload = {
    user_id: user.id,
    full_name: body.full_name || null,
    mobile_number: body.mobile_number || null,
    city: body.city || null,
    state: body.state || null,
    age_range: body.age_range || null,
    gender: body.gender || null,
    relationship_status: body.relationship_status || null,
    favorite_cuisines: Array.isArray(body.favorite_cuisines) ? body.favorite_cuisines : null,
    favorite_activities: Array.isArray(body.favorite_activities) ? body.favorite_activities : null,
    budget_range: body.budget_range || null,
    preferred_area: body.preferred_area || null,
    outing_style: body.outing_style || null,
  };
  const { error } = await supabaseAdmin.from("user_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
