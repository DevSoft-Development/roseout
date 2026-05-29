import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireMarketingAdminApi, requireMarketingViewerApi, normalizeCampaignStatus, normalizeCampaignType, normalizeStringOrNull } from '@/lib/marketing-admin';
import { logAdminEvent } from '@/lib/admin/logAdminEvent';

export async function GET(req: Request) {
  const { error } = await requireMarketingViewerApi(); if (error) return error;
  const u = new URL(req.url).searchParams;
  let q = supabaseAdmin.from('marketing_campaigns').select('*').order('created_at',{ascending:false});
  const status=u.get('status'); const channel=u.get('channel'); const type=u.get('type'); const search=u.get('search');
  if (status && status!=='all') q=q.eq('status', status);
  if (channel) q=q.contains('selected_platforms',[channel]);
  if (type) q=q.eq('campaign_type', type);
  if (search) q=q.ilike('name', `%${search}%`);
  const limit=Math.min(100, Math.max(1, Number(u.get('limit')||'30'))); const offset=Math.max(0, Number(u.get('offset')||'0'));
  const {data,error:fetchError}= await q.range(offset, offset+limit-1);
  if(fetchError) return NextResponse.json({error:fetchError.message},{status:500});
  return NextResponse.json({campaigns:data||[]});
}

export async function POST(req: Request) {
  const { error, adminUser } = await requireMarketingAdminApi(); if (error) return error;
  const body=await req.json();
  if(!body?.name || typeof body.name!=='string') return NextResponse.json({error:'name is required'},{status:400});
  const payload={ name: body.name.trim(), campaign_type: normalizeCampaignType(body.campaign_type), status: normalizeCampaignStatus(body.status), audience_segment: normalizeStringOrNull(body.audience), selected_platforms: Array.isArray(body.channels)?body.channels:[], created_by: adminUser?.user_id ?? null, created_by_email: adminUser?.email ?? null };
  const {data,error:insertError}=await supabaseAdmin.from('marketing_campaigns').insert(payload).select('*').single();
  if(insertError) return NextResponse.json({error:insertError.message},{status:500});
  await logAdminEvent({category:'Campaigns',message:`Campaign created: ${payload.name}`,level:'info',actor_id:adminUser?.user_id,actor_email:adminUser?.email,entity_type:'marketing_campaigns',entity_id:data.id});
  return NextResponse.json({campaign:data},{status:201});
}
