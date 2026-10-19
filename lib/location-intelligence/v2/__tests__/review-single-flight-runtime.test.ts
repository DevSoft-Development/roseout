import {describe,it,expect,vi} from "vitest";
import {executeSingleFlightReviewTask} from "../review-single-flight";

describe("initial review paid single flight",()=>{
  it("parallel workers issue only one provider POST after atomic claim",async()=>{
    let state:"reserved"|"submitting"="reserved";
    const post=vi.fn(async()=>({id:"provider-task-one"}));
    const claim=async()=>{
      // CAS transition before the first await simulates the Postgres atomic update.
      if(state!=="reserved")return false;
      state="submitting";return true;
    };
    const persist=vi.fn(async()=>{});
    const quarantine=vi.fn(async()=>{});
    const attempts=await Promise.all(Array.from({length:20},()=>executeSingleFlightReviewTask({
      claim,post,persist,quarantine
    })));
    expect(attempts.filter(x=>x.status==="submitted")).toHaveLength(1);
    expect(attempts.filter(x=>x.status==="already_claimed")).toHaveLength(19);
    expect(post).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(quarantine).not.toHaveBeenCalled();
  });
  it("provider timeout quarantines and does not repurchase after restart",async()=>{
    let state:"reserved"|"submitting"|"submission_unknown"="reserved";
    const post=vi.fn().mockRejectedValue(new Error("simulated provider timeout"));
    const claim=async()=>{
      if(state!=="reserved")return false;
      state="submitting";return true;
    };
    const persist=vi.fn(async()=>{});
    const quarantine=vi.fn(async()=>{state="submission_unknown";});
    expect((await executeSingleFlightReviewTask({claim,post,persist,quarantine})).status)
      .toBe("submission_unknown");
    // A restarted worker sees the persisted uncertain state.
    expect((await executeSingleFlightReviewTask({claim,post,persist,quarantine})).status)
      .toBe("already_claimed");
    expect(post).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
    expect(quarantine).toHaveBeenCalledTimes(1);
  });
  it("crash after provider acceptance but before checkpoint cannot repurchase",async()=>{
    let state:"reserved"|"submitting"|"submission_unknown"="reserved";
    const post=vi.fn(async()=>({id:"accepted-provider-id"}));
    const claim=async()=>{
      if(state!=="reserved")return false;
      state="submitting";return true;
    };
    const persist=vi.fn(async()=>{throw new Error("database write lost");});
    const quarantine=vi.fn(async()=>{state="submission_unknown";});
    const args={claim,post,persist,quarantine};
    expect((await executeSingleFlightReviewTask(args)).status).toBe("submission_unknown");
    expect((await executeSingleFlightReviewTask(args)).status).toBe("already_claimed");
    expect(post).toHaveBeenCalledTimes(1);
  });
});
