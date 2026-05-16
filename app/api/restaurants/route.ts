import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPubliclyVisible } from "@/lib/locationVisibility";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("*")
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .neq("is_hidden", true)
    .not("status", "in", '("closed","archived")')
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    restaurants: (data || []).filter(isPubliclyVisible),
  });
}
