import type {PosOpeningSchedule} from "./location-readiness";

/** Parse authoritative operating_hours JSON only when an explicit IANA zone exists.
 * Unknown/ambiguous hours stay unknown, so closed restaurants are never alerted.
 */
const days=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
function normalizeClock(raw:string, impliedMeridiem?:string):string|null{
  const match=raw.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if(!match)return null;
  let hour=Number(match[1]);const minute=Number(match[2]);
  const meridiem=(match[3]||impliedMeridiem||"").toUpperCase();
  if(minute>59)return null;
  if(meridiem){if(hour<1||hour>12)return null;hour=(hour%12)+(meridiem==="PM"?12:0);}
  else if(hour>23)return null;
  return String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0");
}
export function scheduleFromLocationHours(hours:unknown,timeZone:unknown):PosOpeningSchedule|null{
  if(!hours||typeof hours!=="object"||Array.isArray(hours)||typeof timeZone!=="string"||!timeZone.trim())return null;
  try{new Intl.DateTimeFormat("en-US",{timeZone});}catch{return null;}
  const record=hours as Record<string,unknown>;
  const windows:PosOpeningSchedule["windows"]=[];
  for(let day=0;day<7;day++){
    const raw=record[days[day]];
    if(raw==null)continue;
    const lines=Array.isArray(raw)?raw:[raw];
    if(!lines.every(x=>typeof x==="string"))return null;
    for(const entry of lines as string[]){
      if(/closed/i.test(entry))continue;
      if(/open\s*24\s*hours/i.test(entry)){windows.push({day,open:"00:00",close:"00:00"});continue;}
      const match=entry.match(/^\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*$/i);
      if(!match)return null;
      const endMarker=match[2].match(/(AM|PM)\s*$/i)?.[1];
      const open=normalizeClock(match[1],endMarker);
      const close=normalizeClock(match[2]);
      if(!open||!close)return null;
      windows.push({day,open,close});
    }
  }
  return windows.length?{timeZone,windows}:null;
}
