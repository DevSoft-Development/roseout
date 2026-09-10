import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllowedHttpsUrl, readResponseWithLimit } from '@/lib/security/outbound-url';
import { reconcileGtmLocation } from './orchestrator';

const EMAIL_RE=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const GENERIC=/^(info|hello|contact|reservations|events|manager|office|support|catering|privateevents|private-events|bookings?)@/i;
const BLOCKED=/^(noreply|no-reply|donotreply|do-not-reply|privacy|abuse|webmaster)@/i;
const LINK_RE=/href=["']([^"'#]+)["']/gi;
const PAGE_HINT=/(contact|about|team|private[-_ ]?events|catering|reservations?)/i;
const unique=<T,>(rows:T[])=>Array.from(new Set(rows));
const decode=(bytes:Uint8Array)=>new TextDecoder('utf-8',{fatal:false}).decode(bytes);
function roleFor(email:string){const local=email.split('@')[0].toLowerCase(); if(/owner|founder/.test(local))return'owner'; if(/manager|gm|management/.test(local))return'manager'; if(/event|catering/.test(local))return'events'; if(/reservation|booking/.test(local))return'reservations'; return GENERIC.test(email)?'business':'unknown';}
function websiteBase(raw:string){const withProtocol=/^https:\/\//i.test(raw)?raw:`https://${raw.replace(/^http:\/\//i,'')}`; return new URL(withProtocol);}
async function fetchHtml(url:string,allowedHosts:string[]){const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000); try{const res=await fetchAllowedHttpsUrl(url,{allowedHosts,maxRedirects:3,signal:controller.signal,headers:{'user-agent':'TheOutHaven-ContactDiscovery/1.0'}}); if(!res.ok)return''; const type=res.headers.get('content-type')||''; if(!/text\/html|application\/xhtml\+xml/i.test(type))return''; return decode(await readResponseWithLimit(res,512000));}finally{clearTimeout(timer);}}

async function linkBestContact(locationId:string,best:{email:string;url:string;confidence:number;role:string}){
  const rec=await reconcileGtmLocation(locationId);
  if(!rec.accountId)return null;
  let contactId:string|null=null;
  const {data:existing}=await supabaseAdmin.from('crm_contacts').select('id').eq('email',best.email).is('archived_at',null).limit(1).maybeSingle(); contactId=existing?.id||null;
  if(!contactId){const {data,error}=await supabaseAdmin.from('crm_contacts').insert({email:best.email,contact_type:'business',preferred_channel:'email',email_consent_status:'unknown',metadata:{discovered_by:'official_website',source_url:best.url,confidence:best.confidence}}).select('id').single(); if(error)throw error; contactId=data.id;}
  const {data:link}=await supabaseAdmin.from('crm_account_contacts').select('id').eq('account_id',rec.accountId).eq('contact_id',contactId).eq('relationship_type','other').eq('role_label',best.role).eq('is_active',true).limit(1).maybeSingle();
  if(!link){const {error}=await supabaseAdmin.from('crm_account_contacts').insert({account_id:rec.accountId,contact_id:contactId,relationship_type:'other',role_label:best.role,is_primary:true,is_active:true}); if(error&&/crm_account_contacts_primary_uidx/.test(error.message)){await supabaseAdmin.from('crm_account_contacts').insert({account_id:rec.accountId,contact_id:contactId,relationship_type:'other',role_label:best.role,is_primary:false,is_active:true});}else if(error)throw error;}
  await Promise.all([supabaseAdmin.from('gtm_contact_discoveries').update({account_id:rec.accountId,contact_id:contactId}).eq('location_id',locationId).eq('contact_kind','email').eq('contact_value',best.email),supabaseAdmin.from('crm_accounts').update({email:best.email}).eq('id',rec.accountId).is('email',null)]);
  return contactId;
}

export async function discoverBusinessContacts(locationId:string){
  const {data:l,error}=await supabaseAdmin.from('locations').select('id,name,business_name,website,website_url,owner_email,phone,do_not_contact').eq('id',locationId).maybeSingle(); if(error)throw error; if(!l)throw new Error('Location not found'); if(l.do_not_contact)return{locationId,skipped:true,reason:'do_not_contact'};
  const raw=String(l.website||l.website_url||'').trim(); if(!raw)return{locationId,skipped:true,reason:'no_website'};
  const base=websiteBase(raw),host=base.hostname.toLowerCase(),allowedHosts=[host,host.startsWith('www.')?host.slice(4):`www.${host}`],start=base.toString(),home=await fetchHtml(base.toString(),allowedHosts),urls=[start];
  let match:RegExpExecArray|null; while((match=LINK_RE.exec(home))&&urls.length<5){try{const u=new URL(match[1],base); if(allowedHosts.includes(u.hostname.toLowerCase())&&PAGE_HINT.test(u.pathname)&&!urls.includes(u.toString()))urls.push(u.toString());}catch{}}
  const pages=await Promise.all(urls.map(async url=>({url,html:url===start?home:await fetchHtml(url,allowedHosts)}))); const found=new Map<string,{email:string;url:string;confidence:number;role:string;generic:boolean}>();
  for(const p of pages){for(const email of unique((p.html.match(EMAIL_RE)||[]).map(v=>v.toLowerCase()))){if(BLOCKED.test(email)||/example\.(com|org|net)$/.test(email))continue; const domain=email.split('@')[1],baseHost=host.replace(/^www\./,''); const sameDomain=domain===baseHost||domain.endsWith(`.${baseHost}`); const confidence=sameDomain?90:60; if(confidence<65)continue; const prev=found.get(email); if(!prev||confidence>prev.confidence)found.set(email,{email,url:p.url,confidence,role:roleFor(email),generic:GENERIC.test(email)});}}
  const rows=Array.from(found.values()).sort((a,b)=>b.confidence-a.confidence).slice(0,10),now=new Date().toISOString();
  for(const row of rows){const payload={location_id:locationId,contact_kind:'email',contact_value:row.email,contact_role:row.role,source_url:row.url,source_type:'official_website',confidence:row.confidence,verification_status:'discovered',is_generic:row.generic,updated_at:now}; const {error}=await supabaseAdmin.from('gtm_contact_discoveries').upsert(payload,{onConflict:'location_id,contact_kind,contact_value'}); if(error)throw error;}
  if(rows.length)await linkBestContact(locationId,rows[0]); else await reconcileGtmLocation(locationId);
  return{locationId,website:start,pagesChecked:pages.length,emailsFound:rows.length,contacts:rows};
}

export async function discoverContactsForQualifiedLocations(limit=25){const safe=Math.min(100,Math.max(1,Math.trunc(limit))); const {data,error}=await supabaseAdmin.from('gtm_location_state').select('location_id,locations!inner(website,website_url,do_not_contact)').gte('opportunity_score',60).eq('suppressed',false).order('opportunity_score',{ascending:false}).limit(safe); if(error)throw error; const results:any[]=[]; for(const row of data||[]){try{results.push(await discoverBusinessContacts(row.location_id));}catch(error:any){results.push({locationId:row.location_id,error:error.message});}} return{processed:results.length,failed:results.filter(r=>r.error).length,results};}
