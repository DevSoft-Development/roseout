import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { ADMIN_PAGE_ACCESS } from '@/lib/admin-permissions';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { recalculateBookingLikelihood } from '@/lib/ml/advanced/recalculate';
export const runtime='nodejs'; export const dynamic='force-dynamic'; export const maxDuration=300;
async function auth(req:NextRequest){ if(isCronRequestAuthorized(req)) return null; const a=await requireAdminApiRole(ADMIN_PAGE_ACCESS.import); return a.error; }
export async function POST(req:NextRequest){ const e=await auth(req); if(e) return e; const body=await req.json().catch(()=>({})); const result=await recalculateBookingLikelihood(body); return NextResponse.json({success:!!result.ok,...result}); }
