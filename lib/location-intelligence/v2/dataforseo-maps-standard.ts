import "server-only";
import { getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";

/**
 * Low-cost Google Maps SERP Standard Queue adapter.
 * This is discovery metadata, NOT permission to persist Google Maps content.
 * Task submission is billable; result polling is not.
 * Caller MUST complete campaign reservation before calling postMapsStandardTask.
 */
export const MAPS_STANDARD_MAX_USD = 0.0006;
export const MAPS_STANDARD_ENDPOINT = "/v3/serp/google/maps";
type SerpTask = {id?:string;status_code?:number;status_message?:string;cost?:number;result?:Array<{items?:unknown[]}|null>};
type SerpEnvelope = {status_code?:number;tasks?:SerpTask[]};
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildMapsStandardTask(query:string) {
  const keyword=String(query||"").trim();
  if (keyword.length<4||keyword.length>160) throw new Error("maps_standard_invalid_keyword");
  return {keyword,location_code:2840,language_code:"en",priority:1,depth:100,device:"desktop"} as const;
}
async function send(path:string, init:RequestInit={}):Promise<SerpEnvelope> {
  const values=await getCredentialVaultProviderValues("dataforseo");
  const login=String(values.login||"").trim(),password=String(values.password||"").trim();
  if(!login||!password)throw new Error("maps_standard_credentials_missing");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch("https://api.dataforseo.com"+path,{
      ...init,cache:"no-store",signal:controller.signal,
      headers:{"accept":"application/json","content-type":"application/json",
        authorization:"Basic "+Buffer.from(login+":"+password).toString("base64")},
    });
    if(!response.ok)throw new Error("maps_standard_http_"+response.status);
    const data=await response.json() as SerpEnvelope;
    if(Number(data.status_code||0)>=40000 ||
      data.tasks?.some(t=>Number(t.status_code||0)>=40000))throw new Error("maps_standard_provider_failed");
    return data;
  }finally{clearTimeout(timer);}
}

export async function postMapsStandardTask(query:string):Promise<{taskId:string;costUsd:number}> {
  const task=buildMapsStandardTask(query);
  const result=await send(MAPS_STANDARD_ENDPOINT+"/task_post",{
    method:"POST",body:JSON.stringify([task]),
  });
  const first=result.tasks?.[0];
  if(!first?.id||!taskIdPattern.test(first.id))throw new Error("maps_standard_task_id_missing");
  const costUsd=Number(first.cost??MAPS_STANDARD_MAX_USD);
  if(!Number.isFinite(costUsd)||costUsd<0||costUsd>MAPS_STANDARD_MAX_USD+0.000001)
    throw new Error("maps_standard_cost_above_reserved_ceiling_reconcile");
  return {taskId:first.id,costUsd};
}

export async function getMapsStandardTask(taskId:string):Promise<{
  status:"pending"|"ready";taskId:string;items:unknown[];providerCostUsd:number
}> {
  if(!taskIdPattern.test(taskId))throw new Error("maps_standard_task_id_invalid");
  const data=await send(MAPS_STANDARD_ENDPOINT+"/task_get/advanced/"+encodeURIComponent(taskId));
  const first=data.tasks?.[0];
  if(!first)throw new Error("maps_standard_task_missing");
  const result=first.result;
  if(!Array.isArray(result)||!result.length) {
    return {status:"pending",taskId,items:[],providerCostUsd:Number(first.cost||0)};
  }
  const items=result.flatMap(v=>Array.isArray(v?.items)?v.items:[]);
  // Do NOT save or publish this content before independent licensing review.
  return {status:"ready",taskId,items,providerCostUsd:Number(first.cost||0)};
}
