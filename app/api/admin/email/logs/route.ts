import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.emailTemplates); if (error) return error; const { data } = await supabaseAdmin.from("email_send_logs").select("*").order("created_at", { ascending: false }).limit(50); return NextResponse.json({ logs: data || [] }); }
