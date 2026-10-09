import {describe,it,expect} from "vitest";
import {evaluatePosDeviceReadiness as evaluate,summarizePosReadiness} from "../location-readiness";
const now=new Date("2026-10-12T14:00:00Z"); // Monday 10AM New York (EDT)
const schedule={timeZone:"America/New_York",windows:[{day:1,open:"10:00",close:"22:00"}]};
const offline={lastSeenAt:null,health:"offline",required:true};
describe("POS location opening readiness",()=>{
  it("is healthy with a fresh heartbeat",()=>{
    expect(evaluate({schedule,device:{...offline,lastSeenAt:now.toISOString(),health:"ready"},now}).state).toBe("healthy");
  });
  it("provides a startup grace period",()=>{
    expect(evaluate({schedule,device:offline,now}).state).toBe("awaiting_startup");
  });
  it("alerts after opening grace expires",()=>{
    expect(evaluate({schedule,device:offline,now:new Date("2026-10-12T14:16:00Z")}).state).toBe("needs_attention");
  });
  it("does not alert a closed restaurant",()=>{
    expect(evaluate({schedule,device:offline,now:new Date("2026-10-12T04:30:00Z")}).state).toBe("expected_offline");
  });
  it("warns before opening without escalating",()=>{
    expect(evaluate({schedule,device:offline,now:new Date("2026-10-12T13:35:00Z")}).state).toBe("awaiting_startup");
  });
  it("never escalates optional hardware",()=>{
    expect(evaluate({schedule,device:{...offline,required:false},now:new Date("2026-10-12T14:30:00Z")}).state).toBe("expected_offline");
  });
  it("handles overnight hours",()=>{
    const overnight={timeZone:"America/New_York",windows:[{day:0,open:"20:00",close:"02:00"}]};
    expect(evaluate({schedule:overnight,device:offline,now:new Date("2026-10-12T05:00:00Z")}).state).toBe("needs_attention");
  });
  it("handles always-open schedules",()=>{
    const always={timeZone:"UTC",windows:Array.from({length:7},(_,day)=>({day,open:"00:00",close:"00:00"}))};
    expect(evaluate({schedule:always,device:offline,now}).state).toBe("needs_attention");
  });
  it("fails safely on missing schedules",()=>{
    expect(evaluate({schedule:null,device:offline,now}).state).toBe("unknown");
  });
  it("supports per-state aggregation",()=>{
    const x=[evaluate({schedule,device:offline,now}),evaluate({schedule:null,device:offline,now})];
    expect(summarizePosReadiness(x)).toMatchObject({awaiting_startup:1,unknown:1,needs_attention:0});
  });
});
