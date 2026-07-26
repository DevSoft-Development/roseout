export type SearchExplanation = { finalScore:number; baseScore:number; qualityAdjustment:number; mlAdjustment:number; geoAdjustment:number; personalizationAdjustment?:number; intentMatch?:string; routeConfidence?:string; routeSource?:string; temporalFeasibility?:string; penalties:string[]; oldRank?:number; newRank?:number; cacheStatus?:string };
const text=(v:unknown,max=160)=>typeof v === "string" ? v.slice(0,max) : undefined;
const num=(v:unknown)=>Number.isFinite(Number(v)) ? Math.max(-10_000,Math.min(10_000,Number(v))) : 0;
export function serializeSearchExplanation(value:unknown): SearchExplanation | null {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const v=value as Record<string,unknown>;
 return {finalScore:num(v.finalScore),baseScore:num(v.baseScore),qualityAdjustment:num(v.qualityAdjustment),mlAdjustment:num(v.mlAdjustment),geoAdjustment:num(v.geoAdjustment),personalizationAdjustment:v.personalizationAdjustment == null?undefined:num(v.personalizationAdjustment),intentMatch:text(v.intentMatch),routeConfidence:text(v.routeConfidence,32),routeSource:text(v.routeSource,32),temporalFeasibility:text(v.temporalFeasibility,32),penalties:Array.isArray(v.penalties)?v.penalties.filter(x=>typeof x==="string").slice(0,12).map(x=>x.slice(0,120)):[],oldRank:v.oldRank==null?undefined:num(v.oldRank),newRank:v.newRank==null?undefined:num(v.newRank),cacheStatus:text(v.cacheStatus,32)};
}
export function serializeSearchExplanations(values:unknown, limit=50){ return (Array.isArray(values)?values:[]).slice(0,limit).map(serializeSearchExplanation).filter((v):v is SearchExplanation=>v!==null); }
