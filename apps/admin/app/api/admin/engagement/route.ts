import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const { error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.events);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("restaurant_events")
    .select("*, restaurants(name, restaurant_name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}
