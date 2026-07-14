import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
const roles = ["superadmin", "admin", "manager"] as const;
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const auth = await requireAdminApiRole(roles); if (auth.error) return auth.error; const { id } = await ctx.params; const body = await req.json().catch(() => ({})); const { data, error } = await supabaseAdmin.from("search_anchors").update({ review_status: "merged", is_active: false, is_searchable: false, metadata: { merged_into: body.target_anchor_id ?? null, merge_notes: body.notes ?? null } }).eq("id", id).select("*").single(); return error ? NextResponse.json({ success: false, error: error.message }, { status: 400 }) : NextResponse.json({ success: true, anchor: data }); }
