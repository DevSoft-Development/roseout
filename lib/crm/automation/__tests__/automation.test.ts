import {describe,expect,it} from "vitest";
import {nextRetryAt} from "../retry-policy";
import {calculateWaitUntil} from "../wait-time";
import {executionKey,nextEnrollmentState} from "../enrollment-state";
import {rateLimitRetryAt,nextAllowedAfterQuietHours} from "../rate-limits";
import {evaluateExitRules} from "../exit-rules";
import {AutomationError,normalizeAutomationError} from "../errors";
describe("Phase 5 automation primitives",()=>{
 it("uses bounded retry backoff",()=>{const now=new Date("2026-01-01T00:00:00Z");expect(nextRetryAt(1,now)?.toISOString()).toBe("2026-01-01T00:05:00.000Z");expect(nextRetryAt(3,now)?.toISOString()).toBe("2026-01-01T02:00:00.000Z");expect(nextRetryAt(4,now)).toBeNull()});
 it("calculates waits once",()=>expect(calculateWaitUntil({hours:24},new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-02T00:00:00.000Z"));
 it("rejects malformed waits permanently",()=>{try{calculateWaitUntil({minutes:-1})}catch(e){expect(normalizeAutomationError(e).retryable).toBe(false)}});
 it("generates stable keys and completes at the end",()=>{expect(executionKey("abc",2)).toBe("abc:2:1");expect(nextEnrollmentState(2,[1,2],"now").status).toBe("completed")});
 it("defers daily limits",()=>expect(rateLimitRetryAt([new Date("2026-01-01T00:00:00Z")],new Date("2026-01-01T12:00:00Z"),1,3)?.toISOString()).toBe("2026-01-02T00:00:00.000Z"));
 it("handles quiet hours",()=>expect(nextAllowedAfterQuietHours(new Date("2026-01-01T02:00:00Z"),"UTC")?.toISOString()).toBe("2026-01-01T08:00:00.000Z"));
 it("evaluates only allowed structured rules",()=>{expect(evaluateExitRules([{type:"contact_replied"}],{contact_replied:true}).shouldExit).toBe(true);expect(evaluateExitRules([{type:"metadata_equals",key:"tier",value:"pro"}],{metadata:{tier:"pro"}},[]).shouldExit).toBe(false)});
 it("preserves typed failure semantics",()=>expect(normalizeAutomationError(new AutomationError("DENIED","No",false,"consent")).retryable).toBe(false));
});

