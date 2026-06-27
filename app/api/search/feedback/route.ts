import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeFeedbackType } from '@/lib/ml/advanced/negativeFeedback';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
  const body=await req.json().catch(()=>({}));
  const type=normalizeFeedbackType(body.feedbackType||body.feedback_type);
  const note=typeof body.note==='string'?body.note.slice(0,500):null;
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser().catch(()=>({data:{user:null}} as any));
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'guest';
  if(String(body.honeypot||'')) return NextResponse.json({success:true,message:'Thanks — we will use that to improve results.'});
  const row={ user_id:user?.id||null, session_id:String(body.sessionId||ip).slice(0,120), search_event_id:body.searchEventId||body.search_event_id||null, raw_query:body.rawQuery||body.raw_query||null, normalized_query:body.normalizedQuery||body.normalized_query||null, intent_bucket:body.intentBucket||body.intent_bucket||null, location_id:body.locationId||body.location_id||null, restaurant_location_id:body.restaurantLocationId||body.restaurant_location_id||null, activity_location_id:body.activityLocationId||body.activity_location_id||null, pair_key:body.pairKey||body.pair_key||null, feedback_type:type, feedback_label:body.feedbackLabel||body.feedback_label||null, feedback_note:note, market:body.market||null };
  const {error}=await supabaseAdmin.from('search_negative_feedback').insert(row);
  if(error) return NextResponse.json({success:false,message:'We could not save that feedback yet.'},{status:500});
  return NextResponse.json({success:true,message:'Thanks — we will use that to improve results.'});
}
