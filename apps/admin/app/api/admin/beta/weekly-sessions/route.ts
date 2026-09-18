import { NextResponse } from "next/server";
import { getOrCreateWeeklyBetaSessionsForActiveTesters } from "@/lib/beta/weeklyTasks";
import { requireBetaAdmin, safeError } from "../_shared";
export async function POST(){const a=await requireBetaAdmin(); if(a.error)return a.error; try{const result=await getOrCreateWeeklyBetaSessionsForActiveTesters(); return NextResponse.json({success:true,message:`Created ${result.created}; already existed ${result.alreadyExisted}; skipped ${result.skipped}.`,...result});}catch(e:any){return safeError(e.message||"Unable to create real weekly sessions.",500)}}
