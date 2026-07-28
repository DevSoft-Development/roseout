import { describe, expect, it } from "vitest";
import { evaluateDelivery, isQuietHours } from "../consent";
import { normalizeEmail, normalizePhone } from "../validation";
import { renderTemplate, sanitizeHtml, validateTemplate } from "../template-renderer";
import { assertApproval, canSend } from "../permissions";
describe("Phase 4 communication guardrails", () => {
 it("normalizes destinations",()=>{ expect(normalizeEmail(" Person@Example.COM ")).toBe("person@example.com"); expect(normalizePhone("(212) 555-1212")).toBe("+12125551212"); });
 it("requires explicit marketing consent and never bypasses suppression",()=>{ expect(evaluateDelivery({communicationType:"marketing",consent:"unknown",suppressed:false}).allowed).toBe(false); expect(evaluateDelivery({communicationType:"transactional",consent:"not_required",suppressed:true}).code).toBe("suppressed"); });
 it("uses timezone-aware quiet hours",()=>{ expect(isQuietHours(new Date("2026-07-28T02:00:00Z"),"America/New_York")).toBe(true); });
 it("rejects unresolved or arbitrary template variables",()=>{ expect(validateTemplate("Hi {{contact.first_name}} {{contact.secret}}",{"contact.first_name":"Ana"}).valid).toBe(false); expect(()=>renderTemplate("Hi {{contact.first_name}}",{})).toThrow(/invalid/); expect(renderTemplate("Hi {{contact.first_name}}",{"contact.first_name":"Ana"})).toBe("Hi Ana"); });
 it("removes active HTML content",()=>{ expect(sanitizeHtml('<p onclick="x()">Hi</p><script>alert(1)</script>')).toBe("<p>Hi</p>"); });
 it("keeps read-only roles from sending and prevents self approval",()=>{ expect(canSend("reviewer")).toBe(false); expect(()=>assertApproval({id:"a",role:"manager"},{requestedBy:"a"})).toThrow(/Self-approval/); expect(()=>assertApproval({id:"a",role:"superadmin"},{requestedBy:"a"},"Emergency legal review")).not.toThrow(); });
});
