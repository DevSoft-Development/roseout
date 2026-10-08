export const SEARCH_V3_LANES = [
  {
    "id": "structured",
    "providerId": "theouthaven.supabase-structured.v1",
    "core": true
  },
  {
    "id": "bm25",
    "providerId": "theouthaven.supabase-bm25.v1",
    "core": true
  },
  {
    "id": "semantic_dense_li",
    "providerId": "theouthaven.supabase-semantic-dense.v1",
    "core": true
  },
  {
    "id": "food_semantic",
    "providerId": "theouthaven.supabase-semantic-food.azure.v1",
    "core": true
  },
  {
    "id": "menu_semantic",
    "providerId": "theouthaven.supabase-semantic-menu.azure.v1",
    "core": true
  },
  {
    "id": "review_intelligence",
    "providerId": "theouthaven.supabase-review-intelligence.v1",
    "core": false
  }
] as const;
export type SearchV3LaneId = (typeof SEARCH_V3_LANES)[number]["id"];
export type LaneConfig = { enabled: boolean; forceOpen: boolean; threshold: number; cooldownMs: number };
export type SearchV3Controls = { mode: "shadow"|"canary"|"primary"; canaryPercent: number; v2Fallback: true; lanes: Record<SearchV3LaneId,LaneConfig>; updatedAt?: string };
const defaultLane = (): LaneConfig => ({ enabled:true, forceOpen:false, threshold:5, cooldownMs:60000 });
export const DEFAULT_SEARCH_V3_CONTROLS: SearchV3Controls = {
 mode:"shadow",canaryPercent:0,v2Fallback:true,
 lanes:Object.fromEntries(SEARCH_V3_LANES.map(l=>[l.id,defaultLane()])) as Record<SearchV3LaneId,LaneConfig>,
};
export const SEARCH_V3_CONTROLS_KEY = "search_v3_controls";
type SettingsClient = { from(table:string): any };
export function validateSearchV3Controls(value:unknown): SearchV3Controls {
 if(!value||typeof value!=="object") throw new Error("Invalid Search V3 configuration");
 const input=value as Partial<SearchV3Controls>;
 if(!["shadow","canary","primary"].includes(String(input.mode))) throw new Error("Invalid rollout mode");
 if(!Number.isInteger(input.canaryPercent)||Number(input.canaryPercent)<0||Number(input.canaryPercent)>100) throw new Error("Invalid canary percentage");
 if(input.v2Fallback!==true) throw new Error("V2 fallback must remain enabled");
 const lanes={} as SearchV3Controls["lanes"];
 for(const lane of SEARCH_V3_LANES){
  const cfg=input.lanes?.[lane.id]; if(!cfg) throw new Error("Missing lane "+lane.id);
  if(typeof cfg.enabled!=="boolean"||typeof cfg.forceOpen!=="boolean") throw new Error("Invalid lane state: "+lane.id);
  if(!Number.isInteger(cfg.threshold)||cfg.threshold<1||cfg.threshold>100) throw new Error("Invalid error threshold: "+lane.id);
  if(!Number.isInteger(cfg.cooldownMs)||cfg.cooldownMs<1000||cfg.cooldownMs>3600000) throw new Error("Invalid cooldown: "+lane.id);
  lanes[lane.id]={enabled:cfg.enabled,forceOpen:cfg.forceOpen,threshold:cfg.threshold,cooldownMs:cfg.cooldownMs};
 }
 return {mode:input.mode!,canaryPercent:input.mode==="shadow"?0:input.canaryPercent!,v2Fallback:true,lanes};
}
export async function readSearchV3Controls(db:SettingsClient):Promise<SearchV3Controls>{
 const {data,error}=await db.from("app_settings").select("value,updated_at").eq("key",SEARCH_V3_CONTROLS_KEY).maybeSingle();
 if(error) throw new Error("Search V3 controls unavailable: "+error.message);
 if(!data) return DEFAULT_SEARCH_V3_CONTROLS;
 return {...validateSearchV3Controls(data.value),updatedAt:data.updated_at};
}
