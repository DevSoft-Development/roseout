import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";


export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("restaurant_events")
    .select("*, restaurants(name, restaurant_name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}