import type {PosOpeningSchedule} from "./location-readiness";
import {scheduleFromLocationHours} from "./operating-hours";

/** Safe overrides: without known date-specific hours, do not infer the location is open. */
export function effectivePosSchedule(input:{
 regularHours:unknown;
 specialHours:unknown;
 timeZone:unknown;
 now:Date;
 confirmedFingerprint:unknown;
}):PosOpeningSchedule|null{
  if(input.confirmedFingerprint!==JSON.stringify(input.regularHours))return null;
  const regular=scheduleFromLocationHours(input.regularHours,input.timeZone);
  if(!regular)return null;
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:regular.timeZone,year:"numeric",month:"2-digit",day:"2-digit"})
    .formatToParts(input.now);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  const date=[part("year"),part("month"),part("day")].join("-");
  // Owners may set date-specific overrides in metadata keyed by local calendar date.
  // Require explicit override for every affected date; unsupported shapes fail closed.
  const overrides=input.specialHours;
  if(overrides==null)return regular;
  if(typeof overrides!=="object"||Array.isArray(overrides))return null;
  const raw=(overrides as Record<string,unknown>)[date];
  if(raw===undefined)return regular;
  if(raw==="closed"||raw===null)return {timeZone:regular.timeZone,windows:[]};
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const weekday=new Date(date+"T12:00:00Z").getUTCDay();
  const parsed=scheduleFromLocationHours({[["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][weekday]]:raw},regular.timeZone);
  return parsed;
}

export function isPosSpecialClosure(schedule:PosOpeningSchedule|null):boolean{
  return Boolean(schedule&&schedule.windows.length===0);
}
