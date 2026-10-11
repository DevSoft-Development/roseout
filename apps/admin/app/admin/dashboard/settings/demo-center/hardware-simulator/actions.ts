"use server";

import {revalidatePath} from "next/cache";
import {requireAdminRole} from "@theouthaven/auth/admin-session";
import {getAdminDatabaseClient} from "@theouthaven/db/admin-client";
import {evaluatePosDeviceReadiness} from "@/lib/pos/hardware/health/location-readiness";

const LOCATION_ID="642a2ad6-c144-47b7-b9ff-f89554edf0da";
const PATH="/admin/dashboard/settings/demo-center/hardware-simulator";
const KINDS=["register","kitchen_printer","receipt_printer","waiter_handheld","network_hub","kds"] as const;
const SCENARIOS=["normal","printer_offline","morning_startup","after_hours","recovery","repeat_outage"] as const;
type Scenario=(typeof SCENARIOS)[number];
type SimRow={slot:number;kind:string;incident_open:boolean;incident_count:number;recovery_count:number};
export type SimulatorResult={ok:boolean;message:string};
const schedule={timeZone:"UTC",windows:Array.from({length:7},(_,day)=>({day,open:"09:00",close:"22:00"}))};
const atHour=(hour:number,minute=0)=>{const date=new Date();date.setUTCHours(hour,minute,0,0);return date;};

async function guardedDb(){
 await requireAdminRole(["superadmin","admin"]);
 const db=getAdminDatabaseClient();
 const {data,error}=await db.from("locations")
   .select("id,is_demo,is_hidden,is_searchable,demo_key").eq("id",LOCATION_ID).maybeSingle();
 if(error||!data||data.is_demo!==true||data.is_hidden!==true||data.is_searchable!==false||
    data.demo_key!=="real_location_mirror_demo")throw new Error("simulator_demo_location_guard_failed");
 return db;
}
function refresh(){revalidatePath(PATH);revalidatePath("/admin/dashboard/settings/demo-center");}
function scenarioState(row:SimRow,scenario:Scenario){
 const now=scenario==="morning_startup"?atHour(9,5):scenario==="after_hours"?atHour(2):atHour(12);
 const offline=scenario==="repeat_outage"||scenario==="printer_offline"&&row.kind.includes("printer")||
   scenario==="morning_startup"||scenario==="after_hours";
 const lastSeenAt=offline?new Date(now.getTime()-30*60_000).toISOString():now.toISOString();
 const readiness=evaluatePosDeviceReadiness({schedule,now,device:{
   health:offline?"offline":"ready",lastSeenAt,required:true
 }});
 const incidentOpen=readiness.state==="needs_attention";
 return {now,health:offline?"offline":"ready",lastSeenAt,readiness,incidentOpen};
}
export async function provisionSimulator():Promise<SimulatorResult>{
 try{
   const db=await guardedDb();
   const {data:existing,error:readError}=await db.from("pos_hardware_simulated_devices")
     .select("slot").eq("location_id",LOCATION_ID);
   if(readError)throw readError;
   const present=new Set((existing||[]).map(x=>x.slot));
   const records=Array.from({length:20},(_,i)=>({
     location_id:LOCATION_ID,slot:i+1,kind:KINDS[i%KINDS.length],
     simulated_health:"ready",last_seen_at:new Date().toISOString(),scenario:"normal"
   })).filter(x=>!present.has(x.slot));
   if(records.length){
     const {error}=await db.from("pos_hardware_simulated_devices").insert(records);
     if(error)throw error;
   }
   refresh();return {ok:true,message:`20-slot fixture ready; ${records.length} new virtual devices provisioned.`};
 }catch(error){return {ok:false,message:error instanceof Error?error.message:"provision_failed"};}
}
export async function runSimulatorScenario(formData:FormData):Promise<SimulatorResult>{
 try{
   const db=await guardedDb();
   const requested=String(formData.get("scenario")||"");
   if(!SCENARIOS.includes(requested as Scenario))return {ok:false,message:"Unknown scenario"};
   const scenario=requested as Scenario;
   const {data,error}=await db.from("pos_hardware_simulated_devices")
     .select("slot,kind,incident_open,incident_count,recovery_count").eq("location_id",LOCATION_ID).order("slot").limit(10000);
   if(error)throw error;
   if(!data?.length)return {ok:false,message:"Provision the 20 virtual devices first."};
   const updates=(data as SimRow[]).map(row=>{
     const result=scenarioState(row,scenario);
     return {
       location_id:LOCATION_ID,slot:row.slot,kind:row.kind,
       simulated_health:result.health,last_seen_at:result.lastSeenAt,
       scenario,incident_open:result.incidentOpen,
       incident_count:row.incident_count+Number(result.incidentOpen&&!row.incident_open),
       recovery_count:row.recovery_count+Number(!result.incidentOpen&&row.incident_open),
       last_classification:result.readiness.state,updated_at:new Date().toISOString()
     };
   });
   const {error:writeError}=await db.from("pos_hardware_simulated_devices")
     .upsert(updates,{onConflict:"location_id,slot"});
   if(writeError)throw writeError;
   refresh();
   const attention=updates.filter(x=>x.last_classification==="needs_attention").length;
   return {ok:true,message:`${scenario}: ${updates.length} simulated devices checked; ${attention} need attention. No merchant alerts sent.`};
 }catch(error){return {ok:false,message:error instanceof Error?error.message:"simulation_failed"};}
}
export async function resetSimulator():Promise<SimulatorResult>{
 try{
   const db=await guardedDb();
   const {error}=await db.from("pos_hardware_simulated_devices").delete().eq("location_id",LOCATION_ID);
   if(error)throw error;
   refresh();return {ok:true,message:"Simulation records cleared. Physical hardware was not touched."};
 }catch(error){return {ok:false,message:error instanceof Error?error.message:"reset_failed"};}
}

export async function provisionSimulatorForm(_state:SimulatorResult,_formData:FormData){return provisionSimulator();}
export async function scenarioSimulatorForm(_state:SimulatorResult,formData:FormData){return runSimulatorScenario(formData);}
export async function resetSimulatorForm(_state:SimulatorResult,_formData:FormData){return resetSimulator();}
