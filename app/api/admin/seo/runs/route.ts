import { NextResponse } from 'next/server'; import { supabaseAdmin } from '@/lib/supabase-admin'; import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export async function GET(){const a=await requireAdminApiRole(ADMIN_PAGE_ACCESS.seoTools); if(a.error)return a.error; const {data,error}=await supabaseAdmin.from('seo_audit_runs').select('*').order('created_at',{ascending:false}).limit(20); if(error) return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({runs:data||[]});}
