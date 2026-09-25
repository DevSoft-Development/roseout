import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { listPermittedCrmLocationIds } from "@/lib/crm/location-scope";
import { resolveAdminOrganizationPeople } from "@/lib/admin-organization-people";

export type ProductKey =
  | "claim"
  | "essentials"
  | "reserve"
  | "website"
  | "marketing"
  | "promoted_listing"
  | "events_experiences"
  | "renewal_expansion";

export type ProductRecommendation = {
  key: ProductKey;
  label: string;
  status: "sell_now" | "review" | "blocked" | "covered";
  priority: number;
  reason: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  pipelineKey: "business_claim" | "reserve_pro" | "promoted_listing" | "partnership" | "renewal_expansion";
  productKey: string;
  activeOpportunityId?: string | null;
  stage?: string | null;
};

export type SalesLocation = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  category?: string | null;
  claimed: boolean;
  paid: boolean;
  website?: string | null;
  hasReservation: boolean;
  opportunityScore: number;
  demandScore: number;
  contactabilityScore: number;
  activationScore: number;
  lifecycleStage: string;
  nextBestAction: string;
  assignedUserId?: string | null;
  assignedName?: string | null;
  territoryName?: string | null;
  contacts: Array<{ value: string; role?: string | null; confidence?: number | null; verification?: string | null }>;
  recommendations: ProductRecommendation[];
  openOpportunities: any[];
  openTasks: any[];
};

const LABELS: Record<ProductKey,string> = {
  claim:"Business Claim",
  essentials:"Essentials+",
  reserve:"Reserve",
  website:"Website",
  marketing:"Email / SMS Marketing",
  promoted_listing:"Promoted Listing",
  events_experiences:"Events / Experiences",
  renewal_expansion:"Renewal / Expansion",
};

export const SALES_PLAYBOOKS: Record<ProductKey,{
  opener:string;
  discovery:string[];
  value:string;
  objection:string;
  response:string;
}> = {
  claim:{
    opener:"Customers are already finding your business on TheOutHaven. Are you the owner or manager responsible for the listing?",
    discovery:["Who manages your online business information?","Are your hours, photos and links accurate?","Would you like direct control of the profile?"],
    value:"Claiming gives the business control of its profile and opens the path to TheOutHaven business tools.",
    objection:"I do not have time to manage another profile.",
    response:"The claim is primarily about ownership and control. Your team can update the details customers already rely on, and we can guide the setup.",
  },
  essentials:{
    opener:"Your location is already on TheOutHaven. I’d like to show you the customer activity around the business and the tools available to turn that visibility into more customer actions.",
    discovery:["How do you measure discovery traffic today?","Who owns profile and local marketing decisions?","Which customer actions matter most right now?"],
    value:"Essentials+ connects profile management, customer visibility, analytics and business growth tools in one operating layer.",
    objection:"I am already getting customers without another subscription.",
    response:"The value is not simply visibility. It is control, conversion tools and measurable customer activity around demand that already exists.",
  },
  reserve:{
    opener:"How are customers currently reserving a table with you?",
    discovery:["Do you take reservations online today?","Do calls get missed during busy periods?","Are you paying another reservation provider?","Do you manage a waitlist or walk-ins?"],
    value:"Reserve connects TheOutHaven discovery directly to booking, waitlist and front-of-house operations.",
    objection:"We already use another reservation system.",
    response:"Then focus on workflow, discovery integration and economics instead of explaining online reservations. Compare where Reserve fits alongside or instead of the current provider.",
  },
  website:{
    opener:"How are you managing your website today, and can customers easily get from your site to the actions you want them to take?",
    discovery:["Who manages the website?","Can customers easily see menus, events and booking options on mobile?","How often is the site updated?"],
    value:"TheOutHaven Website gives the business a managed first-party destination tied to its profile, offers, events and reservation tools.",
    objection:"We use social media instead of a website.",
    response:"Social is useful for reach, but a first-party site gives customers a stable destination you control for search, menus, booking and conversion.",
  },
  marketing:{
    opener:"What are you doing today to bring previous and local customers back between visits?",
    discovery:["Do you run email or SMS campaigns?","Who creates promotions?","How do you measure campaign response?"],
    value:"TheOutHaven marketing tools turn customer and location activity into targeted email/SMS growth workflows.",
    objection:"We already post on social media.",
    response:"Social is one channel. This opportunity is direct, measurable customer communication tied to business activity and offers.",
  },
  promoted_listing:{
    opener:"Customers are already searching for businesses like yours in this area. Would you like to see how your current visibility compares with that demand?",
    discovery:["Are you trying to increase discovery right now?","Which days or occasions need more traffic?","How do you currently promote locally?"],
    value:"Promoted Listing helps a qualified business capture more of the demand already present inside TheOutHaven.",
    objection:"I do not want to pay for impressions that do not convert.",
    response:"The recommendation should be based on observed demand and actual profile readiness, not generic ad inventory. Focus on measurable customer actions.",
  },
  events_experiences:{
    opener:"Do you currently promote private events, experiences, specials or group occasions online?",
    discovery:["Do you host private events or recurring experiences?","Who manages event promotion?","Do customers have a clear way to discover those offerings?"],
    value:"Events and Experiences give the location additional reasons to be discovered and create more bookable or visit-worthy moments.",
    objection:"We do not run formal events.",
    response:"The offering can also cover recurring experiences, packages and special occasions. If none fit, mark it not applicable rather than forcing the sale.",
  },
  renewal_expansion:{
    opener:"I’d like to review what the location is using today and where there may be additional value before the next renewal cycle.",
    discovery:["Which current tools are delivering value?","What is still manual or disconnected?","What would make the next term more valuable?"],
    value:"Renewal and expansion should connect proven usage to the next relevant product gap.",
    objection:"We are not looking to add anything right now.",
    response:"That is fine. Confirm what is working, identify any service risk, and only surface expansion where there is a demonstrated gap.",
  },
};

function clean(value:unknown){return String(value??"").trim();}
function num(value:unknown){const n=Number(value??0);return Number.isFinite(n)?n:0;}
function truthy(value:unknown){return value===true||value===1||value==="true";}
function paid(row:any){
  const status=clean(row.subscription_status||row.plan_status).toLowerCase().replaceAll("_","-");
  const plan=clean(row.subscription_plan||row.plan||row.partner_plan_name).toLowerCase().replaceAll("_","-");
  return truthy(row.is_pro) ||
    ["active","paid","comped"].includes(status) ||
    ["essentials","essentials+","pro","partner","partner-99","reserve","pro-reserve"].some((value)=>plan===value||plan.startsWith(value+"-"));
}
function claimed(row:any){
  const status=clean(row.claim_status).toLowerCase().replaceAll("_","-");
  return truthy(row.is_claimed)||["approved","claimed"].includes(status);
}
function restaurant(row:any){
  return /restaurant/i.test(clean(row.location_type)) ||
    /restaurant|steak|sushi|italian|seafood|thai|mexican|cafe|bar|lounge/i.test(clean(row.primary_category||row.category));
}
function reservation(row:any){
  return Boolean(clean(row.external_reservation_url)||clean(row.reservation_url)||clean(row.reservation_link)||clean(row.booking_url)||clean(row.reservation_provider_url)||truthy(row.internal_reservations_enabled)||truthy(row.uses_internal_reservations));
}
function locationName(row:any){return clean(row.name||row.business_name||row.restaurant_name||row.activity_name)||"Untitled location";}
function openOpp(opps:any[], productKeys:string[], pipelines:string[]){
  return opps.find((o)=>clean(o.status).toLowerCase()==="open" && (productKeys.includes(clean(o.product_key))||pipelines.includes(clean(o.pipeline_key))))||null;
}
function wonOpp(opps:any[], productKeys:string[], pipelines:string[]){
  return opps.find((o)=>clean(o.status).toLowerCase()==="won" && (productKeys.includes(clean(o.product_key))||pipelines.includes(clean(o.pipeline_key))))||null;
}
function rec(input:Omit<ProductRecommendation,"label">):ProductRecommendation{return {...input,label:LABELS[input.key]};}

export function deriveRecommendations(location:any,state:any,opps:any[],activeMarketing:boolean,activeOffering:boolean):ProductRecommendation[]{
  const isClaimed=claimed(location), isPaid=paid(location), hasWebsite=Boolean(clean(location.website||location.website_url));
  const hasRes=reservation(location), provider=clean(location.reservation_provider_name||location.reservation_platform), demand=num(state?.demand_score), reserveScore=num(location.reservation_opportunity_score);
  const claimOpp=openOpp(opps,["business_claim"],["business_claim"]);
  const essentialOpp=openOpp(opps,["essentials_plus","essentials"],["partnership"]);
  const reserveOpp=openOpp(opps,["reserve","reserve_pro"],["reserve_pro"]);
  const promotedOpp=openOpp(opps,["promoted_listing"],["promoted_listing"]);
  const renewalOpp=openOpp(opps,["renewal_expansion"],["renewal_expansion"]);
  const promotedWon=wonOpp(opps,["promoted_listing"],["promoted_listing"]);
  const reserveEvidence=Array.isArray(location.reservation_opportunity_evidence)?location.reservation_opportunity_evidence.map(clean).filter(Boolean).slice(0,4):[];

  const rows:ProductRecommendation[]=[
    rec({key:"claim",status:isClaimed?"covered":"sell_now",priority:isClaimed?5:100,reason:isClaimed?"Business ownership is already connected.":"The location is unclaimed, so ownership and profile control are the first sales motion.",evidence:[isClaimed?"Claimed business":"Business is unclaimed"],confidence:"high",pipelineKey:"business_claim",productKey:"business_claim",activeOpportunityId:claimOpp?.id||null,stage:claimOpp?.stage||null}),
    rec({key:"essentials",status:isPaid?"covered":isClaimed?"sell_now":"blocked",priority:isPaid?5:isClaimed?92:35,reason:isPaid?"A paid TheOutHaven plan is already active.":isClaimed?"The business is claimed but is not on an active paid plan.":"Claim the business before leading with Essentials+.",evidence:[isClaimed?"Claim verified":"Claim required",isPaid?"Paid plan active":"No active paid plan detected"],confidence:"high",pipelineKey:"partnership",productKey:"essentials_plus",activeOpportunityId:essentialOpp?.id||null,stage:essentialOpp?.stage||null}),
    rec({key:"reserve",status:!restaurant(location)?"covered":hasRes?"review":isClaimed?"sell_now":"blocked",priority:!restaurant(location)?1:hasRes?40:isClaimed?Math.max(75,reserveScore):45,reason:!restaurant(location)?"Reserve is not a primary fit for this location type.":hasRes?`An existing reservation path${provider?` (${provider})`:""} is detected. Use the competitive/integration playbook instead of a missing-system pitch.`:isClaimed?"Restaurant has no recognized online reservation capability.":"Reservation gap is visible, but claiming the business should come first.",evidence:reserveEvidence.length?reserveEvidence:[hasRes?(provider?`Existing provider: ${provider}`:"Existing reservation path detected"):"No recognized online reservation path"],confidence:reserveScore>=50||hasRes?"high":"medium",pipelineKey:"reserve_pro",productKey:"reserve",activeOpportunityId:reserveOpp?.id||null,stage:reserveOpp?.stage||null}),
    rec({key:"website",status:hasWebsite?"review":isClaimed?"sell_now":"blocked",priority:hasWebsite?30:isClaimed?82:40,reason:hasWebsite?"A website is present. Run a quality/conversion review rather than a missing-website pitch.":isClaimed?"No first-party website is stored for this location.":"No website is stored, but claim ownership should be established first.",evidence:hasWebsite?["Website URL present",clean(location.website||location.website_url)]:["No website URL detected"],confidence:"high",pipelineKey:"partnership",productKey:"website"}),
    rec({key:"marketing",status:activeMarketing?"covered":isClaimed?"review":"blocked",priority:activeMarketing?10:isClaimed?62:25,reason:activeMarketing?"An active business marketing campaign exists.":isClaimed?"No active location marketing campaign was detected.":"Claim the location before positioning ongoing customer marketing.",evidence:[activeMarketing?"Active campaign detected":"No active campaign detected"],confidence:"medium",pipelineKey:"partnership",productKey:"marketing"}),
    rec({key:"promoted_listing",status:promotedWon?"covered":promotedOpp?"review":demand>=50&&isClaimed?"sell_now":"review",priority:promotedWon?5:promotedOpp?70:demand>=50&&isClaimed?76:35,reason:promotedWon?"Promoted Listing has already been won/activated.":promotedOpp?"A Promoted Listing opportunity is already in progress.":demand>=50&&isClaimed?"The location is claimed and has meaningful TheOutHaven demand.":"Build more demand/profile readiness before making this a primary pitch.",evidence:[`Demand score ${demand}`,isClaimed?"Claimed location":"Claim required"],confidence:demand>=50?"high":"medium",pipelineKey:"promoted_listing",productKey:"promoted_listing",activeOpportunityId:promotedOpp?.id||null,stage:promotedOpp?.stage||null}),
    rec({key:"events_experiences",status:activeOffering?"covered":isClaimed?"review":"blocked",priority:activeOffering?10:isClaimed?55:20,reason:activeOffering?"An active event or experience is already connected.":isClaimed?"No active event or experience was detected. Confirm whether the business has private events, packages, specials or recurring experiences.":"Claim ownership before expanding into event/experience merchandising.",evidence:[activeOffering?"Active event/experience detected":"No active event/experience detected"],confidence:"medium",pipelineKey:"partnership",productKey:"events_experiences"}),
    rec({key:"renewal_expansion",status:isPaid?"review":"blocked",priority:isPaid?68:10,reason:isPaid?"Existing paid customer should be reviewed for renewal health and the next relevant product gap.":"Renewal/expansion applies after the business becomes a paid customer.",evidence:[isPaid?"Paid customer":"No paid plan"],confidence:isPaid?"high":"medium",pipelineKey:"renewal_expansion",productKey:"renewal_expansion",activeOpportunityId:renewalOpp?.id||null,stage:renewalOpp?.stage||null}),
  ];
  return rows.sort((a,b)=>b.priority-a.priority);
}

function lifecycle(row:any,state:any){
  const g=clean(state?.gtm_status);
  if(/churn/.test(g))return g==="churned"?"Canceled":"Needs attention";
  if(g==="renewal")return"Renewal";
  if(paid(row))return state?.activation_score>=70?"Active customer":"Paid customer";
  if(claimed(row))return"Claimed";
  if(row.claim_started_at||g==="claiming")return"Claim in progress";
  if(g==="engaged")return"Interested";
  if(["qualified","sales_active"].includes(g))return"Contacted";
  return"Unclaimed";
}

const LOCATION_SELECT=[
"id","name","business_name","restaurant_name","activity_name","city","state","location_type","primary_category","category",
"is_claimed","claim_status","claim_started_at","website","website_url","phone","owner_email","subscription_status","plan_status","subscription_plan","plan","partner_plan_name","is_pro",
"reservation_url","reservation_link","booking_url","external_reservation_url","reservation_provider_url","reservation_platform","reservation_provider_name","internal_reservations_enabled","uses_internal_reservations",
"reservation_opportunity_score","reservation_opportunity_evidence","search_appearances_30d","profile_views_30d","opportunity_score","next_action","next_action_type","updated_at"
].join(",");

export async function listUnifiedSalesLocations(input:{userId:string;role:string;q?:string;owner?:string;page?:number;pageSize?:number;locationId?:string}){
  const db=getAdminDatabaseClient();
  const permitted=await listPermittedCrmLocationIds(input.userId,input.role as any);
  const page=Math.max(1,input.page||1),pageSize=[25,50,100].includes(input.pageSize||0)?input.pageSize!:25;
  if(Array.isArray(permitted)&&permitted.length===0)return{rows:[] as SalesLocation[],count:0,page,pageSize,totalPages:1};
  let query=db.from("locations").select(LOCATION_SELECT,{count:"exact"}).is("deleted_at",null).order("updated_at",{ascending:false});
  if(Array.isArray(permitted))query=query.in("id",permitted);
  if(input.locationId)query=query.eq("id",input.locationId);
  if(input.q){
    const q=input.q.replace(/[%_,]/g," ");
    query=query.or(`name.ilike.%${q}%,business_name.ilike.%${q}%,restaurant_name.ilike.%${q}%,activity_name.ilike.%${q}%,city.ilike.%${q}%`);
  }
  const {data:locations,error,count}=await query.range((page-1)*pageSize,page*pageSize-1);
  if(error)throw error;
  let pageLocations=locations||[];
  const ids=pageLocations.map((l:any)=>l.id);
  if(!ids.length)return{rows:[] as SalesLocation[],count:count||0,page,pageSize,totalPages:Math.max(1,Math.ceil((count||0)/pageSize))};

  const [states,opps,contacts,tasks,campaigns,events,experiences,links]=await Promise.all([
    db.from("gtm_location_state").select("location_id,gtm_status,opportunity_score,opportunity_tier,demand_score,contactability_score,activation_score,next_best_action,next_best_action_type,last_signal_at").in("location_id",ids),
    db.from("crm_opportunities").select("id,primary_location_id,name,pipeline_key,product_key,stage,status,owner_user_id,next_step,amount,monthly_recurring_revenue,last_activity_at,actual_close_date,updated_at").in("primary_location_id",ids).is("archived_at",null).order("updated_at",{ascending:false}).limit(Math.max(300,ids.length*12)),
    db.from("gtm_contact_discoveries").select("location_id,contact_value,contact_role,confidence,verification_status").in("location_id",ids).in("verification_status",["verified","discovered"]).order("confidence",{ascending:false}).limit(Math.max(200,ids.length*6)),
    db.from("crm_tasks").select("id,location_id,title,status,priority,due_at,assigned_to_user_id,opportunity_id").in("location_id",ids).is("archived_at",null).in("status",["open","in_progress","blocked"]).order("due_at",{ascending:true}).limit(Math.max(200,ids.length*6)),
    db.from("business_marketing_campaigns").select("location_id,status").in("location_id",ids).in("status",["active","scheduled","running"]).limit(Math.max(100,ids.length*3)),
    db.from("events").select("location_id,status").in("location_id",ids).in("status",["published","active"]).limit(Math.max(100,ids.length*3)),
    db.from("experiences").select("location_id,status").in("location_id",ids).in("status",["published","active"]).limit(Math.max(100,ids.length*3)),
    db.from("crm_location_territories").select("location_id,territory_id,territory_name").in("location_id",ids).limit(Math.max(100,ids.length*2)),
  ]);

  const stateMap=new Map((states.data||[]).map((r:any)=>[r.location_id,r]));
  const oppMap=new Map<string,any[]>();for(const r of opps.data||[])oppMap.set(r.primary_location_id,[...(oppMap.get(r.primary_location_id)||[]),r]);
  const contactMap=new Map<string,any[]>();for(const r of contacts.data||[])contactMap.set(r.location_id,[...(contactMap.get(r.location_id)||[]),r]);
  const taskMap=new Map<string,any[]>();for(const r of tasks.data||[])taskMap.set(r.location_id,[...(taskMap.get(r.location_id)||[]),r]);
  const marketing=new Set((campaigns.data||[]).map((r:any)=>r.location_id));
  const offerings=new Set([...(events.data||[]),...(experiences.data||[])].map((r:any)=>r.location_id));
  const linkMap=new Map((links.data||[]).map((r:any)=>[r.location_id,r]));
  const territoryIds=Array.from(new Set((links.data||[]).map((r:any)=>r.territory_id).filter(Boolean)));
  const territoryResult=territoryIds.length?await db.from("crm_territories").select("id,name,owner_user_id").in("id",territoryIds):{data:[] as any[]};
  const territoryMap=new Map((territoryResult.data||[]).map((r:any)=>[r.id,r]));
  const ownerIds=Array.from(new Set((territoryResult.data||[]).map((r:any)=>r.owner_user_id).filter(Boolean)));
  const people=await resolveAdminOrganizationPeople(ownerIds);
  const peopleMap=new Map(people.map((p)=>[p.userId,p]));

  let rows:SalesLocation[]=pageLocations.map((location:any)=>{
    const state:any=stateMap.get(location.id)||{};
    const locationOpps=oppMap.get(location.id)||[];
    const link:any=linkMap.get(location.id);
    const territory:any=link?territoryMap.get(link.territory_id):null;
    const person=territory?.owner_user_id?peopleMap.get(territory.owner_user_id):null;
    return{
      id:location.id,name:locationName(location),city:location.city,state:location.state,category:location.location_type||location.primary_category||location.category,
      claimed:claimed(location),paid:paid(location),website:clean(location.website||location.website_url)||null,hasReservation:reservation(location),
      opportunityScore:num(state.opportunity_score??location.opportunity_score),demandScore:num(state.demand_score),contactabilityScore:num(state.contactability_score),activationScore:num(state.activation_score),
      lifecycleStage:lifecycle(location,state),nextBestAction:clean(state.next_best_action||location.next_action)||"Review product gaps",
      assignedUserId:territory?.owner_user_id||null,assignedName:person?.name||person?.email||null,territoryName:territory?.name||link?.territory_name||null,
      contacts:(contactMap.get(location.id)||[]).slice(0,4).map((r:any)=>({value:r.contact_value,role:r.contact_role,confidence:r.confidence,verification:r.verification_status})),
      recommendations:deriveRecommendations(location,state,locationOpps,marketing.has(location.id),offerings.has(location.id)),
      openOpportunities:locationOpps.filter((o:any)=>clean(o.status).toLowerCase()==="open"),
      openTasks:(taskMap.get(location.id)||[]).slice(0,8),
    };
  });
  if(input.owner)rows=rows.filter((r)=>r.assignedUserId===input.owner);
  return{rows,count:count||0,page,pageSize,totalPages:Math.max(1,Math.ceil((count||0)/pageSize))};
}

export async function getSalesLeadershipSummary(){
  const db=getAdminDatabaseClient();
  const since=new Date(Date.now()-30*86400000).toISOString();
  const [{data,error},people,territories,openByPipeline]=await Promise.all([
    (db as any).rpc("admin_crm_sales_leadership_summary",{p_since:since}),
    resolveAdminOrganizationPeople((await db.from("admin_users").select("user_id").in("role",["ambassador","manager","admin","superadmin"])).data?.map((r:any)=>r.user_id)||[]),
    db.from("crm_territories").select("id,name,borough,owner_user_id,status").eq("status","active").order("name"),
    db.from("crm_opportunities").select("pipeline_key,status,owner_user_id,amount").is("archived_at",null),
  ]);
  if(error)throw error;
  const summary=(data||{}) as any;
  const peopleMap=new Map(people.map((p)=>[p.userId,p]));
  const reps=(summary.reps||[]).map((r:any)=>({...r,name:peopleMap.get(r.userId)?.name||peopleMap.get(r.userId)?.email||"Unresolved staff member"}));
  const pipelineCounts=new Map<string,{open:number;won:number;lost:number}>();
  for(const row of openByPipeline.data||[]){
    const key=clean(row.pipeline_key)||"unassigned",current=pipelineCounts.get(key)||{open:0,won:0,lost:0};
    const s=clean(row.status).toLowerCase();if(s==="open")current.open++;else if(s==="won")current.won++;else if(s==="lost")current.lost++;
    pipelineCounts.set(key,current);
  }
  return{since,totals:summary.totals||{},reps,territories:territories.data||[],pipelineCounts:Array.from(pipelineCounts.entries()).map(([pipeline,counts])=>({pipeline,...counts}))};
}
