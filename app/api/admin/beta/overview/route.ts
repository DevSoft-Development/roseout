import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireBetaAdmin, safeError } from "../_shared";
export async function GET(){const a=await requireBetaAdmin(); if(a.error)return a.error; try{const {data}=await supabaseAdmin.from("admin_beta_overview").select("*").maybeSingle(); return NextResponse.json({success:true,overview:data||{}});}catch(error){console.error("ADMIN_BETA_OVERVIEW",error);return safeError();}}
