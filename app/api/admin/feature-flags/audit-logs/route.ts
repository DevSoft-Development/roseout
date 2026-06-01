import { NextResponse } from 'next/server'; import { supabaseAdmin } from '@/lib/supabase-admin'; import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export async function GET(){const a=await requireAdminApiRole(ADMIN_PAGE_ACCESS.featureFlags); if(a.error)return a.error; const {data,error}=await supabaseAdmin.from('feature_flag_audit_logs').select('*').order('created_at',{ascending:false}).limit(200); if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({logs:data||[]});}
