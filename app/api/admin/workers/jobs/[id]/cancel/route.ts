import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) { const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import); if (auth.error) return auth.error; const { id } = await params; const body = await req.json().catch(() => ({})); const { error } = await supabaseAdmin.rpc("cancel_worker_job", { p_job_id: id, p_reason: body.reason || "admin_cancelled" }); if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 }); return NextResponse.json({ success: true }); }
