/** Read-only, schedule-aware POS device readiness. No writes, retries, or failover. */
export type PosOpeningSchedule = {
  timeZone: string;
  // 0=Sunday..6=Saturday. Times are local HH:mm, end may cross midnight.
  windows: { day: number; open: string; close: string }[];
};
export type PosReadinessState = "healthy"|"expected_offline"|"awaiting_startup"|"needs_attention"|"unknown";
export type PosDeviceSnapshot = {
  lastSeenAt: string|null;
  health: string;
  required: boolean;
};
export type PosReadinessResult = {
  state: PosReadinessState;
  reason: string;
  operating: boolean;
  opensWithinMinutes: number|null;
};

function localComponents(now: Date,timeZone:string) {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  }).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  const day=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(part("weekday"));
  if(day<0) throw new Error("pos_monitor_invalid_time_zone");
  return {day,minute:Number(part("hour"))*60+Number(part("minute"))};
}
function parseTime(value:string){
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error("pos_monitor_invalid_hours");
  return Number(value.slice(0,2))*60+Number(value.slice(3));
}
export function evaluatePosDeviceReadiness(input:{
  schedule:PosOpeningSchedule|null;
  device:PosDeviceSnapshot;
  now?:Date;
  heartbeatGraceMinutes?:number;
  openingWarningMinutes?:number;
  openingGraceMinutes?:number;
}):PosReadinessResult {
  const now=input.now||new Date();
  const heartbeatGraceMinutes=input.heartbeatGraceMinutes??5;
  const openingWarningMinutes=input.openingWarningMinutes??30;
  const openingGraceMinutes=input.openingGraceMinutes??15;
  if(!Number.isFinite(now.getTime()))throw new Error("pos_monitor_invalid_now");
  const seen=input.device.lastSeenAt?Date.parse(input.device.lastSeenAt):NaN;
  const heartbeatFresh=Number.isFinite(seen)&&now.getTime()-seen<=heartbeatGraceMinutes*60000&&now.getTime()>=seen-60000;
  const ready=heartbeatFresh&&input.device.health==="ready";
  if(!input.schedule?.windows?.length){
    return {state:ready?"healthy":"unknown",reason:ready?"device_ready":"operating_hours_unconfigured",operating:false,opensWithinMinutes:null};
  }
  const {day,minute}=localComponents(now,input.schedule.timeZone);
  let open=false,elapsedOpen=0,nextOpen=Infinity;
  for(const window of input.schedule.windows){
    if(!Number.isInteger(window.day)||window.day<0||window.day>6)throw Error("pos_monitor_invalid_day");
    const start=parseTime(window.open),end=parseTime(window.close);
    const duration=(end-start+1440)%1440||1440;
    for(const delta of [-1,0,1,2,3,4,5,6,7]){
      const startAbsolute=(window.day-day+delta*7)*1440+start;
      const endAbsolute=startAbsolute+duration;
      if(startAbsolute<=minute&&minute<endAbsolute){open=true;elapsedOpen=Math.max(elapsedOpen,minute-startAbsolute);}
      if(startAbsolute>minute)nextOpen=Math.min(nextOpen,startAbsolute-minute);
    }
  }
  if(ready)return {state:"healthy",reason:"device_ready",operating:open,opensWithinMinutes:open?0:Number.isFinite(nextOpen)?nextOpen:null};
  if(!input.device.required)return {state:"expected_offline",reason:"optional_device_offline",operating:open,opensWithinMinutes:open?0:nextOpen};
  if(open&&elapsedOpen>=openingGraceMinutes)return {state:"needs_attention",reason:"required_device_offline_during_service",operating:true,opensWithinMinutes:0};
  if(open)return {state:"awaiting_startup",reason:"opening_grace_period",operating:true,opensWithinMinutes:0};
  if(nextOpen<=openingWarningMinutes)return {state:"awaiting_startup",reason:"opening_soon",operating:false,opensWithinMinutes:nextOpen};
  return {state:"expected_offline",reason:"outside_operating_hours",operating:false,opensWithinMinutes:nextOpen};
}
export function summarizePosReadiness(states:PosReadinessResult[]) {
  return states.reduce((a,item)=>{a[item.state]++;return a;},{
    healthy:0,expected_offline:0,awaiting_startup:0,needs_attention:0,unknown:0,
  } as Record<PosReadinessState,number>);
}
