import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
export async function GET(req: NextRequest) { const auth=await requireAdminApiRole(["superuser","admin","editor","viewer"]); if(auth.error) return auth.error; const q=(req.nextUrl.searchParams.get("q")||"").trim(); let query=supabaseAdmin.from("users").select("id,full_name,email,phone,role,created_at").eq("role","owner").limit(200); if(q) query=query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`); const {data,error}=await query; if(error) return NextResponse.json({owners:[],error:error.message}); return NextResponse.json({owners:data||[]}); }
