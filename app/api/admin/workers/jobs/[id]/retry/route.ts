import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import); if (auth.error) return auth.error; const { id } = await params; const { data, error } = await supabaseAdmin.rpc("retry_worker_job", { p_job_id: id }); if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 }); return NextResponse.json({ success: true, job: data }, { status: 202 }); }
