import {describe,it,expect} from "vitest";
import {evaluatePosDeviceReadiness} from "../location-readiness";
import {effectivePosSchedule} from "../special-hours";
const schedule={timeZone:"America/New_York",windows:[{day:0,open:"10:00",close:"22:00"}]};
describe("fleet readiness classifier throughput benchmarks",()=>{
  for(const devices of [100,1000,10000]){
    it(`evaluates ${devices.toLocaleString()} synthetic devices without I/O`,()=>{
      const now=new Date("2026-10-11T16:00:00.000Z");
      const start=performance.now();const counts={healthy:0,expected_offline:0,awaiting_startup:0,needs_attention:0,unknown:0};
      for(let i=0;i<devices;i++){
        const result=evaluatePosDeviceReadiness({schedule,now,device:{
          lastSeenAt:i%3===0?now.toISOString():null,
          health:i%3===0?"ready":"offline",required:i%10!==0,
        }});
        counts[result.state]++;
      }
      const elapsed=performance.now()-start;
      expect(Object.values(counts).reduce((a,b)=>a+b,0)).toBe(devices);
      console.info(JSON.stringify({benchmark:"pos_readiness_classifier",devices,elapsedMs:Math.round(elapsed*10)/10,scope:"pure_cpu_only_not_database_or_network"}));
    });
  }
  it("fails safe for closure overrides or stale confirmations",()=>{
    const now=new Date("2026-10-11T16:00:00Z");
    expect(effectivePosSchedule({regularHours:{sunday:["10:00 AM - 10:00 PM"]},specialHours:{"2026-10-11":"closed"},timeZone:"America/New_York",now,confirmedFingerprint:JSON.stringify({sunday:["10:00 AM - 10:00 PM"]})})?.windows).toEqual([]);
    expect(effectivePosSchedule({regularHours:{sunday:["10:00 AM - 10:00 PM"]},specialHours:null,timeZone:"America/New_York",now,confirmedFingerprint:"stale"})).toBeNull();
  });
});
