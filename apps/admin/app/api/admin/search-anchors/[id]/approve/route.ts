import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SEARCH_ANCHOR_LIST_FIELDS } from "@/lib/admin/search-security-projections";
const roles = ["superadmin", "admin", "manager"] as const;
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) { const auth = await requireAdminApiRole(roles); if (auth.error) return auth.error; const { id } = await ctx.params; const { data, error } = await supabaseAdmin.from("search_anchors").update({ review_status: "approved", is_active: true, is_searchable: true }).eq("id", id).select(SEARCH_ANCHOR_LIST_FIELDS).single(); return error ? NextResponse.json({ success: false, error: error.message }, { status: 400 }) : NextResponse.json({ success: true, anchor: data }); }
