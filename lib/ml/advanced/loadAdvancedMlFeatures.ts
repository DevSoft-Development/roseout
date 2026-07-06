export type AdvancedMlBundle = { byLocation: Record<string, any>; byPair: Record<string, any>; market: Record<string, any>; userPreferences?: any };

async function getSupabaseAdmin() {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return null;
  try {
    const mod = await import('../../supabase-admin');
    return mod.supabaseAdmin;
  } catch {
    return null;
  }
}

async function safe(table:string, select:string, column:string, values:string[]){
  if(!values.length) return [];
  const supabaseAdmin = await getSupabaseAdmin();
  if (!supabaseAdmin) return [];
  try{ const {data}=await supabaseAdmin.from(table).select(select).in(column, values); return data||[]; }catch{return [];}
}
export async function loadAdvancedMlFeatures({ locationIds=[], pairKeys=[], marketKeys=[], userId }: {locationIds?:string[]; pairKeys?:string[]; marketKeys?:string[]; userId?:string|null;}): Promise<AdvancedMlBundle>{ const ids=[...new Set(locationIds.filter(Boolean))]; const pairs=[...new Set(pairKeys.filter(Boolean))]; const markets=[...new Set(marketKeys.filter(Boolean))]; const [review,result,pair,business,photo,booking,market,user] = await Promise.all([
 safe('location_review_ml_features','*','location_id',ids), safe('search_result_ml_features','*','location_id',ids), safe('location_pair_ml_features','*','pair_key',pairs), safe('business_quality_ml_features','*','location_id',ids), safe('photo_quality_ml_features','*','location_id',ids), safe('booking_likelihood_ml_features','*','location_id',ids), safe('market_ml_features','*','market_key',markets), userId?safe('user_preference_ml_features','*','user_id',[userId]):Promise.resolve([])
]); const byLocation:Record<string,any>={}; for(const rows of [review,result,business,photo,booking]) for(const r of rows as any[]) byLocation[r.location_id]={...(byLocation[r.location_id]||{}),...r}; return { byLocation, byPair:Object.fromEntries((pair as any[]).map(r=>[r.pair_key,r])), market:Object.fromEntries((market as any[]).map(r=>[r.market_key,r])), userPreferences:(user as any[])[0] } }
export function calculateAdvancedMlRankingAdjustments(features:any,intent?:any){ const confidence=Number(features?.confidence_score??features?.review_confidence_score??0.35); const reviewMlBoost=Number(features?.overall_review_quality_score||0)*0.025*confidence; const resultQualityBoost=(Number(features?.result_quality_score||50)-50)*0.04*confidence; const bookingLikelihoodBoost= /book|reserve|reservation/i.test(String(intent?.rawQuery||'')) ? Number(features?.booking_likelihood_score||0)*0.025 : Number(features?.booking_likelihood_score||0)*0.008; const businessTrustBoost=Number(features?.business_trust_score||0)*0.02; const photoQualityBoost=Number(features?.photo_quality_score||0)*0.012; const negativeFeedbackPenalty=Math.min(12, Number(features?.negative_feedback_count||0)*2); const duplicateRiskPenalty=Number(features?.duplicate_risk_score||0)*0.08; const total=reviewMlBoost+resultQualityBoost+bookingLikelihoodBoost+businessTrustBoost+photoQualityBoost-negativeFeedbackPenalty-duplicateRiskPenalty; return { advancedMlApplied:true, reviewMlBoost, resultQualityBoost, bookingLikelihoodBoost, businessTrustBoost, photoQualityBoost, negativeFeedbackPenalty, duplicateRiskPenalty, advancedMlBoost: Number(total.toFixed(2)) }; }
