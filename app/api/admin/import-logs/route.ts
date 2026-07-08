import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";


export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("import_logs")
    .select("id, job_name, run_date, created_at, meta, error")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data || [] });
}