import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth); if (auth.error) return auth.error; const { id } = await params; const { data, error } = await supabaseAdmin.from("worker_job_events").select("*").eq("job_id", id).order("created_at", { ascending: false }).limit(100); if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 }); return NextResponse.json({ success: true, events: data || [] }); }
