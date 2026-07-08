import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireBetaAdmin, safeError } from "../_shared";
export async function GET(){const a=await requireBetaAdmin(); if(a.error)return a.error; const {data,error}=await supabaseAdmin.from("beta_feedback").select("*").order("created_at",{ascending:false}).limit(300); if(error)return safeError(); return NextResponse.json({success:true,feedback:data||[]});}
export async function PATCH(req:NextRequest){const a=await requireBetaAdmin(); if(a.error)return a.error; const b=await req.json(); const {data,error}=await supabaseAdmin.from("beta_feedback").update({status:b.status,admin_notes:b.admin_notes,reviewed_by:a.adminUser?.user_id,reviewed_at:new Date().toISOString()}).eq("id",b.id).select("*").single(); if(error)return safeError(); return NextResponse.json({success:true,feedback:data});}
