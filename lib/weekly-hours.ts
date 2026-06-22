const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_KEYS = DAYS.map((d) => d.toLowerCase());
type Range = { open: string; close: string; closes_next_day?: boolean; overnight?: boolean };
export type ParsedWeeklyHours = Record<string, { closed?: boolean; open_24_hours?: boolean; ranges?: Range[] }>;

function pad(n:number){return String(n).padStart(2,"0");}
function parseTime(raw:string, line:number){
  const m=String(raw).trim().match(/^(1[0-2]|[1-9])(?::([0-5]\d))?\s*([ap]m)$/i);
  if(!m) throw new Error(`Line ${line}: invalid time "${raw}". Use AM/PM, for example 10:00 AM.`);
  let h=Number(m[1]); const min=Number(m[2]??"0"); const ap=m[3].toUpperCase();
  if(ap==="AM"&&h===12) h=0; if(ap==="PM"&&h!==12) h+=12;
  return { minutes:h*60+min, value:`${pad(h)}:${pad(min)}` };
}
function formatTime(value:string){
  const [hh,mm]=String(value).split(":").map(Number); if(!Number.isFinite(hh)||!Number.isFinite(mm)) return String(value);
  const ap=hh>=12?"PM":"AM"; let h=hh%12; if(h===0) h=12; return `${h}:${pad(mm)} ${ap}`;
}
function dayLabel(day:string){const i=DAY_KEYS.indexOf(day.toLowerCase()); return i>=0?DAYS[i]:day;}

export function parseWeeklyHoursFromEditor(text:string): ParsedWeeklyHours | null {
  const input=String(text||"").trim(); if(!input) return null;
  const out:ParsedWeeklyHours={};
  input.split(/\r?\n/).forEach((raw,idx)=>{
    const lineNo=idx+1; const line=raw.trim(); if(!line) return;
    const m=line.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[-–—:]\s*(.+)$/i);
    if(!m) throw new Error(`Line ${lineNo}: start with a day, for example Monday - 8:30 AM - 10:30 PM.`);
    const key=m[1].toLowerCase(); const body=m[2].trim();
    if(/^closed$/i.test(body)){ out[key]={closed:true,ranges:[]}; return; }
    if(/^(24\s*hours|open\s*24\s*hours)$/i.test(body)){ out[key]={open_24_hours:true,ranges:[{open:"00:00",close:"23:59"}]}; return; }
    const ranges=body.split(/\s*,\s*/).map((part)=>{
      const pieces=part.split(/\s+-\s+/); if(pieces.length!==2) throw new Error(`Line ${lineNo}: invalid range "${part}".`);
      const open=parseTime(pieces[0],lineNo); const close=parseTime(pieces[1],lineNo);
      const overnight=close.minutes<=open.minutes;
      return {open:open.value, close:close.value, ...(overnight?{closes_next_day:true,overnight:true}:{})};
    });
    out[key]={closed:false,ranges};
  });
  return out;
}

function fromWeekdayText(value:any): string | null {
  const arr=Array.isArray(value)?value:Array.isArray(value?.weekday_text)?value.weekday_text:null;
  if(!arr) return null;
  return arr.map((line:any)=>String(line).replace(/:\s*/," - ")).join("\n");
}
export function formatOperatingHoursForEditor(hours:any, fallbackGoogleHours?:any): string {
  const google=fromWeekdayText(fallbackGoogleHours);
  if(!hours) return google ?? "";
  if(Array.isArray(hours?.weekday_text)) return fromWeekdayText(hours) ?? google ?? "";
  if(typeof hours==="string") return hours;
  if(typeof hours!=="object") return google ?? "";
  const lines:string[]=[];
  for(const day of DAY_KEYS){
    const v=hours[day] ?? hours[dayLabel(day)];
    if(!v) continue;
    if(v.closed) { lines.push(`${dayLabel(day)} - Closed`); continue; }
    if(v.open_24_hours) { lines.push(`${dayLabel(day)} - 24 hours`); continue; }
    const ranges=Array.isArray(v.ranges)?v.ranges:Array.isArray(v)?v:[];
    if(ranges.length) lines.push(`${dayLabel(day)} - ${ranges.map((r:any)=>`${formatTime(r.open)} - ${formatTime(r.close)}`).join(", ")}`);
  }
  return lines.join("\n") || google || "";
}
export function normalizeWeeklyHoursText(text:string){
  const parsed=parseWeeklyHoursFromEditor(text); return parsed ? formatOperatingHoursForEditor(parsed) : "";
}
