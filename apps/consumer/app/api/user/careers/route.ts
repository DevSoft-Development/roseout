import { NextResponse } from "next/server"; import { getCurrentUserCareerApplications } from "@/lib/careers/queries";
export async function GET(){ try { return NextResponse.json({ applications: await getCurrentUserCareerApplications() }); } catch { return NextResponse.json({ error:"We could not load your applications." },{status:500}); } }
