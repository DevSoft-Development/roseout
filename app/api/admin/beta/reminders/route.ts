import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBetaAdmin, safeError } from "../_shared";
import { sendBetaRemindersForActiveTesters } from "@/lib/beta/reminderEmails";
export async function GET(){const a=await requireBetaAdmin(); if(a.error)return a.error; const {data,error}=await supabaseAdmin.from("beta_email_reminders").select("*").order("created_at",{ascending:false}).limit(300); if(error)return safeError(); return NextResponse.json({success:true,reminders:data||[]});}
export async function POST(req:NextRequest){const a=await requireBetaAdmin(); if(a.error)return a.error; const b=await req.json().catch(()=>({})); const results=await sendBetaRemindersForActiveTesters(b.reminderType||"weekly_tasks"); return NextResponse.json({success:true,results});}
