import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { ADMIN_PAGE_ACCESS } from '@/lib/admin-permissions';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { reconcileGtmCatalog } from '@/lib/gtm/orchestrator';
import { discoverContactsForQualifiedLocations } from '@/lib/gtm/contactDiscovery';
export const runtime='nodejs'; export const dynamic='force-dynamic'; export const maxDuration=300;
async function auth(req:NextRequest){ if(isCronRequestAuthorized(req)) return null; const a=await requireAdminApiRole(ADMIN_PAGE_ACCESS.import); return a.error; }
export async function POST(req:NextRequest){ const e=await auth(req); if(e) return e; const body=await req.json().catch(()=>({})); const limit=Math.min(5000,Math.max(1,Number(body.limit||500))); const scoring=await reconcileGtmCatalog({limit,dryRun:Boolean(body.dryRun)}); let contacts:any={processed:0,failed:0,results:[]}; if(!body.dryRun&&body.discoverContacts!==false) contacts=await discoverContactsForQualifiedLocations(Math.min(50,Math.max(1,Number(body.contactLimit||25)))); return NextResponse.json({success:scoring.failed===0&&contacts.failed===0,ok:scoring.failed===0&&contacts.failed===0,recordsUpdated:scoring.processed,scoring,contacts}); }
