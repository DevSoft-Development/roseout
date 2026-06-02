import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdminRole } from "@/lib/users/roles";
export const betaAdminRoles: AdminRole[] = ["superadmin", "admin", "experience", "experience_team"];
export async function requireBetaAdmin(){return requireAdminApiRole(betaAdminRoles);}
export function safeError(message="Request failed", status=500){return NextResponse.json({success:false,error:message},{status});}
export async function listTable(table:string, limit=200){const {data,error}=await supabaseAdmin.from(table).select("*").order("created_at",{ascending:false}).limit(limit); if(error)throw error; return data||[];}
