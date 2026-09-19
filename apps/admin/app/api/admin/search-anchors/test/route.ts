import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { resolveSearchAnchor } from "@/lib/search/anchors/resolve";
import { supabaseAdmin } from "@/lib/supabase-admin";
const roles = ["superadmin", "admin", "manager"] as const;
export async function POST(req: NextRequest) { const auth = await requireAdminApiRole(roles); if (auth.error) return auth.error; const { query, anchor } = await req.json().catch(()=>({})); const resolution = await resolveSearchAnchor(supabaseAdmin, anchor || query || ""); return NextResponse.json({ success:true, resolution }); }
