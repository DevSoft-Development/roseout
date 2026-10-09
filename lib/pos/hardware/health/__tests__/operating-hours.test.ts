import {describe,it,expect} from "vitest";
import {scheduleFromLocationHours} from "../operating-hours";
describe("POS operating hours normalization",()=>{
  it("parses existing location hours format with explicit timezone",()=>{
    const s=scheduleFromLocationHours({monday:["10:00 AM - 7:00 PM"],friday:["11:00 AM - 8:00 PM"]},"America/New_York");
    expect(s?.windows).toEqual([{day:1,open:"10:00",close:"19:00"},{day:5,open:"11:00",close:"20:00"}]);
  });
  it("handles inherited PM marker",()=>{
    expect(scheduleFromLocationHours({sunday:["12:00 - 4:30 PM"]},"America/New_York")?.windows[0])
      .toEqual({day:0,open:"12:00",close:"16:30"});
  });
  it("allows closed days and 24 hour coverage",()=>{
    expect(scheduleFromLocationHours({sunday:["Closed"],monday:["Open 24 hours"]},"UTC")?.windows)
      .toEqual([{day:1,open:"00:00",close:"00:00"}]);
  });
  it("does not invent a timezone or guess ambiguous hours",()=>{
    expect(scheduleFromLocationHours({monday:["10:00 AM - 8:00 PM"]},null)).toBeNull();
    expect(scheduleFromLocationHours({monday:["Call for hours"]},"UTC")).toBeNull();
  });
});
