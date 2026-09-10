import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function getClaimOutreachReadiness(locationId:string){
  const [{data:state,error:stateError},{data:contact,error:contactError},{data:sequence,error:sequenceError}]=await Promise.all([
    supabaseAdmin.from('gtm_location_state').select('crm_account_id,suppressed,gtm_status').eq('location_id',locationId).maybeSingle(),
    supabaseAdmin.from('gtm_contact_discoveries').select('contact_id,contact_value,verification_status').eq('location_id',locationId).eq('contact_kind','email').in('verification_status',['discovered','verified']).order('confidence',{ascending:false}).limit(1).maybeSingle(),
    supabaseAdmin.from('crm_sequences').select('id,status').eq('sequence_key','business-claim-outreach').is('archived_at',null).limit(1).maybeSingle(),
  ]);
  if(stateError)throw stateError;if(contactError)throw contactError;if(sequenceError)throw sequenceError;
  if(state?.suppressed)return{ready:false,reason:'suppressed'};
  if(!state?.crm_account_id)return{ready:false,reason:'full_crm_association_required'};
  if(!contact?.contact_id)return{ready:false,reason:'verified_or_discovered_business_email_required'};
  if(!sequence||sequence.status!=='active')return{ready:false,reason:'claim_sequence_not_active'};
  const {data:steps,error:stepsError}=await supabaseAdmin.from('crm_sequence_steps').select('id,step_type,template_id').eq('sequence_id',sequence.id).order('step_order'); if(stepsError)throw stepsError;
  const emailSteps=(steps||[]).filter((s:any)=>s.step_type==='email'); if(!emailSteps.length)return{ready:false,reason:'claim_sequence_has_no_email_step'};
  const templateIds=emailSteps.map((s:any)=>s.template_id).filter(Boolean); if(templateIds.length!==emailSteps.length)return{ready:false,reason:'email_template_missing'};
  const {data:templates,error:templateError}=await supabaseAdmin.from('crm_templates').select('id,status,active_version_id').in('id',templateIds); if(templateError)throw templateError;
  if((templates||[]).length!==templateIds.length||(templates||[]).some((t:any)=>t.status!=='approved'||!t.active_version_id))return{ready:false,reason:'approved_active_email_template_required'};
  return{ready:true,sequenceId:sequence.id,contactId:contact.contact_id,accountId:state.crm_account_id,locationId};
}

export async function enrollClaimOutreach(locationId:string){
  const ready:any=await getClaimOutreachReadiness(locationId); if(!ready.ready)return ready;
  const sourceRecordId=`gtm:${locationId}:business-claim-outreach`;
  const {data:existing,error:existingError}=await supabaseAdmin.from('crm_sequence_enrollments').select('id,status').eq('source_system','gtm').eq('source_record_id',sourceRecordId).limit(1).maybeSingle(); if(existingError)throw existingError; if(existing)return{ready:true,enrolled:true,existing:true,enrollmentId:existing.id,status:existing.status};
  const {data,error}=await supabaseAdmin.from('crm_sequence_enrollments').insert({sequence_id:ready.sequenceId,contact_id:ready.contactId,account_id:ready.accountId,location_id:locationId,source_system:'gtm',source_record_id:sourceRecordId,status:'active',current_step_order:1,next_step_at:new Date().toISOString()}).select('id,status').single(); if(error)throw error;
  return{ready:true,enrolled:true,existing:false,enrollmentId:data.id,status:data.status};
}
