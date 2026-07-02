import { NextResponse } from "next/server"; import { listPublicCareerJobs } from "@/lib/careers/queries";
export async function GET(){ try { return NextResponse.json({ jobs: await listPublicCareerJobs() }); } catch { return NextResponse.json({ error: "We could not load careers right now." }, { status: 500 }); } }
