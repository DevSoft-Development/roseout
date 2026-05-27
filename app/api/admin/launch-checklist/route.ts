import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
export async function GET() { const auth = await requireAdminApiRole(["superuser","admin","editor","viewer"]); if (auth.error) return auth.error; const {count:total}=await supabaseAdmin.from("locations").select("id",{count:"exact",head:true}); const {count:missingAddress}=await supabaseAdmin.from("locations").select("id",{count:"exact",head:true}).is("address",null); return NextResponse.json({totalLocations:total||0, missingAddress:missingAddress||0}); }
