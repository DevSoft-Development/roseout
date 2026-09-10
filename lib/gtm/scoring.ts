export type GtmMetrics = {
  searchImpressions30d:number; views30d:number; saves30d:number; reservationClicks30d:number; callClicks30d:number; websiteClicks30d:number; outingInclusions30d:number;
  qrScans30d:number; emailClicks30d:number; claimViews30d:number; claimStarts30d:number; replies30d:number;
};

export type GtmLocation = {
  id:string; rating?:number|null; review_count?:number|null; quality_score?:number|null; business_trust_score?:number|null;
  is_searchable?:boolean|null; is_claimed?:boolean|null; owner_user_id?:string|null; website?:string|null; website_url?:string|null; phone?:string|null; address?:string|null;
  reservation_url?:string|null; reservation_link?:string|null; booking_url?:string|null; external_reservation_url?:string|null; uses_internal_reservations?:boolean|null; internal_reservations_enabled?:boolean|null;
  subscription_plan?:string|null; subscription_status?:string|null; plan?:string|null; is_pro?:boolean|null; profile_completion_score?:number|null;
  neighborhood?:string|null; borough?:string|null; county?:string|null; market?:string|null; do_not_contact?:boolean|null; claim_started_at?:string|null; claim_approved_at?:string|null;
};

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(Number.isFinite(n)?n:0)));
const has=(v:unknown)=>Boolean(String(v??'').trim());
const logScore=(n:number,scale:number)=>Math.min(100,Math.log1p(Math.max(0,n))/Math.log1p(scale)*100);

export function scoreDemand(m:GtmMetrics){
  const raw = logScore(m.searchImpressions30d,120)*.25 + logScore(m.views30d,60)*.2 + logScore(m.outingInclusions30d,30)*.2 + logScore(m.saves30d,20)*.12 + logScore(m.reservationClicks30d,20)*.1 + logScore(m.websiteClicks30d+m.callClicks30d,25)*.13;
  return clamp(raw);
}

export function scoreContactability(l:GtmLocation, discoveredEmail?:boolean){
  let score=0;
  if(has(l.address)) score+=20;
  if(has(l.phone)) score+=30;
  if(has(l.website)||has(l.website_url)) score+=15;
  if(discoveredEmail) score+=35;
  return clamp(score);
}

export function scoreActivation(l:GtmLocation){
  let score=0;
  if(l.is_claimed||l.owner_user_id) score+=25;
  score+=Math.min(25,Math.max(0,Number(l.profile_completion_score||0))*.25);
  if(l.uses_internal_reservations||l.internal_reservations_enabled) score+=20;
  const paid=Boolean(l.is_pro)||/active|paid/i.test(String(l.subscription_status||''))||/essential|pro|paid/i.test(String(l.subscription_plan||l.plan||''));
  if(paid) score+=30;
  return clamp(score);
}

export function calculateOpportunity(l:GtmLocation,m:GtmMetrics,opts:{discoveredEmail?:boolean;eventsOrExperiences?:boolean;territoryStrategic?:boolean}={}){
  const claimed=Boolean(l.is_claimed||l.owner_user_id);
  const hasReservation=Boolean(l.uses_internal_reservations||l.internal_reservations_enabled||has(l.external_reservation_url)||has(l.reservation_url)||has(l.booking_url)||has(l.reservation_link));
  const hasWebsite=has(l.website)||has(l.website_url);
  const paid=Boolean(l.is_pro)||/active|paid/i.test(String(l.subscription_status||''))||/essential|pro|paid/i.test(String(l.subscription_plan||l.plan||''));

  let gap=0;
  if(!hasReservation) gap+=10;
  if(!hasWebsite) gap+=7;
  if(!claimed) gap+=5;
  if(!opts.eventsOrExperiences) gap+=4;
  if(!paid) gap+=4;
  gap=clamp(gap,0,30);

  const rating=Math.max(0,Math.min(5,Number(l.rating||0)));
  const reviews=Math.max(0,Number(l.review_count||0));
  const reputation=(rating/5)*10 + Math.min(6,Math.log10(reviews+1)*2.2);
  const quality=Math.min(4,Math.max(Number(l.quality_score||0),Number(l.business_trust_score||0))/25);
  const businessQuality=clamp(reputation+quality,0,20);

  const demandScore=scoreDemand(m);
  const demandComponent=clamp(demandScore*.2,0,20);

  let engagement=0;
  engagement += Math.min(6,m.qrScans30d*6);
  engagement += Math.min(4,m.claimStarts30d*4);
  engagement += Math.min(3,m.replies30d*3);
  engagement += Math.min(2,m.emailClicks30d*1.5);
  engagement += Math.min(2,m.claimViews30d);
  engagement=clamp(engagement,0,15);

  let territory=3;
  if(has(l.neighborhood)) territory+=3;
  if(has(l.borough)||has(l.county)||has(l.market)) territory+=2;
  if(opts.territoryStrategic) territory+=2;
  territory=clamp(territory,0,10);

  const contactabilityScore=scoreContactability(l,opts.discoveredEmail);
  const contactabilityComponent=clamp(contactabilityScore*.05,0,5);
  const opportunityScore=clamp(gap+businessQuality+demandComponent+engagement+territory+contactabilityComponent);
  const tier=opportunityScore>=80?'hot':opportunityScore>=60?'warm':opportunityScore>=40?'developing':'low';
  const activationScore=scoreActivation(l);

  const reasons:string[]=[];
  if(!hasReservation) reasons.push('No online reservation capability');
  if(!hasWebsite) reasons.push('No website detected');
  if(!claimed) reasons.push('Business is unclaimed');
  if(rating>=4.3&&reviews>=100) reasons.push('Strong public reputation');
  if(demandScore>=50) reasons.push('Above-baseline TheOutHaven demand');
  if(m.qrScans30d>0) reasons.push('Claim QR scanned recently');
  if(m.claimStarts30d>0) reasons.push('Claim process started');
  if(opts.discoveredEmail) reasons.push('Business email discovered');

  return {
    opportunityScore,tier,demandScore,contactabilityScore,activationScore,
    components:{businessGap:gap,businessQuality,demand:demandComponent,engagement,territory,contactability:contactabilityComponent},
    reasons,
    paid,claimed,hasReservation,hasWebsite,
  };
}

export function nextBestAction(input:{location:GtmLocation;score:ReturnType<typeof calculateOpportunity>;metrics:GtmMetrics;hasEmail:boolean;hasAccount:boolean}){
  const {location:l,score:s,metrics:m,hasEmail,hasAccount}=input;
  if(l.do_not_contact) return {type:'suppressed',label:'Do not contact'};
  if(s.paid) return s.activationScore<70?{type:'activation',label:'Help customer complete activation'}:{type:'expansion',label:'Review expansion opportunities'};
  if(l.claim_approved_at||s.claimed) return {type:'activation',label:'Complete activation and show value proof'};
  if(l.claim_started_at||m.claimStarts30d>0) return {type:'claim_follow_up',label:'Help owner complete claim'};
  if(m.qrScans30d>0||m.replies30d>0) return {type:'call',label:'Follow up with this engaged business today'};
  if(hasEmail) return {type:'email',label:'Start business claim email sequence'};
  if(has(l.phone)) return {type:'call',label:'Call the business and ask for the owner or manager'};
  if(has(l.address)) return {type:'postcard',label:'Send tracked claim postcard'};
  if(!hasAccount&&s.opportunityScore>=60) return {type:'research',label:'Research a contact path'};
  return {type:'monitor',label:'Monitor for stronger demand or engagement'};
}
