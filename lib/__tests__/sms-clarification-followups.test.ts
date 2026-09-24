import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/webhooks/telnyx/messages/route.ts"),
  "utf8",
);

describe("SMS clarification follow-ups", () => {
  it("keeps concierge conversations alive when intent is unclear", () => {
    expect(route).toContain("incoming_concierge_clarification");
    expect(route).toContain("concierge_clarification_sent");
    expect(route).toContain("Tell me a little more and I’ll keep going.");
  });

  it("asks CRM senders for context when no conversation matches", () => {
    expect(route).toContain('text !== "HELP" && !crmRoute?.matched');
    expect(route).toContain("incoming_crm_clarification");
    expect(route).toContain("crm_clarification_sent");
  });

  it("asks marketing senders a routing follow-up instead of stopping", () => {
    expect(route).toContain("incoming_marketing_clarification");
    expect(route).toContain("marketing_clarification_sent");
    expect(route).toContain("Is this about a reservation, support issue, outing recommendation, or one of our updates?");
  });


  it("acknowledges active support follow-ups when AI does not respond", () => {
    const supportRouting = fs.readFileSync(
      path.join(process.cwd(), "lib/support/cross-channel-sms.ts"),
      "utf8",
    );
    expect(supportRouting).toContain("follow_up_acknowledgement");
    expect(supportRouting).toContain("We received your update");
    expect(supportRouting).toContain("It’s been added to your support conversation.");
  });

  it("keeps support clarification available when the AI flag is unset", () => {
    const responder = fs.readFileSync(
      path.join(process.cwd(), "lib/support/ai-responder.ts"),
      "utf8",
    );
    expect(responder).toContain('process.env.SUPPORT_AI_ENABLED !== "false"');
    expect(responder).toContain("ai_unavailable_continued_troubleshooting");
    expect(responder).toContain("routineFallbackQuestion(searchContext)");
  });

  it("tells customers a support ticket was created on human handoff", () => {
    const responder = fs.readFileSync(
      path.join(process.cwd(), "lib/support/ai-responder.ts"),
      "utf8",
    );
    expect(responder).toContain("support ticket");
    expect(responder).toContain("within 24 hours");
    expect(responder).toContain("keep texting");
  });

  it("confirms resolution before routine human handoff", () => {
    const responder = fs.readFileSync(
      path.join(process.cwd(), "lib/support/ai-responder.ts"),
      "utf8",
    );
    expect(responder).toContain("confirm_resolution_before_handoff");
    expect(responder).toContain("did that resolve your issue? Reply YES or NO");
    expect(responder).toContain("unresolved_after_resolution_confirmation");
    expect(responder).toContain("customer_confirmed_resolution_after_troubleshooting");
  });

  it("does not query nonexistent sms_logs metadata for continuation routing", () => {
    const ownership = fs.readFileSync(
      path.join(process.cwd(), "lib/communications/sms-flow-ownership.ts"),
      "utf8",
    );
    expect(ownership).toContain('.select("message_type,created_at")');
    expect(ownership).not.toContain('.select("message_type,metadata,created_at")');
    expect(ownership).toContain('incoming_${params.entryChannel}_routed_%');
  });

  it("preserves reservation clarification behavior", () => {
    expect(route).toContain("incoming_reservation_clarification");
    expect(route).toContain("reservation_clarification_sent");
  });
});
