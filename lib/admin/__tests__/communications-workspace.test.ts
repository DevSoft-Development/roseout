import { describe, expect, it } from "vitest";
import { canRetryDelivery, classifySms, hasUnresolvedTemplateVariables, normalizeCommunicationChildTab, normalizeInboxRecord, orderConversation } from "../communications-workspace";

describe("enterprise communications workspace", () => {
  it("maps backwards-compatible primary tabs into communications child tabs", () => {
    expect(normalizeCommunicationChildTab("communication")).toBe("overview");
    expect(normalizeCommunicationChildTab("messaging")).toBe("inbox");
    expect(normalizeCommunicationChildTab("notifications")).toBe("notifications");
    expect(normalizeCommunicationChildTab("communication", "delivery")).toBe("delivery");
  });

  it("normalizes inbox records without duplicating source identity", () => {
    const item = normalizeInboxRecord({ id: "msg_1", channel: "SMS", recipient: "Jane", direction: "inbound", status: "failed", failure_reason: "Rate limit" });
    expect(item).toMatchObject({ id: "msg_1", contactName: "Jane", channel: "sms", unread: true, priority: "High" });
  });

  it("orders conversation messages chronologically and labels internal notes", () => {
    const ordered = orderConversation([{ id: "b", created_at: "2026-01-02T00:00:00Z", internal: true }, { id: "a", created_at: "2026-01-01T00:00:00Z" }]);
    expect(ordered.map((r) => r.id)).toEqual(["a", "b"]);
    expect(normalizeInboxRecord(ordered[1]).internal).toBe(true);
  });

  it("blocks unresolved variables and permanent failure retries", () => {
    expect(hasUnresolvedTemplateVariables("Hi {{owner_name}}")).toBe(true);
    expect(canRetryDelivery({ status: "failed", failure_reason: "Invalid phone" })).toBe(false);
    expect(canRetryDelivery({ status: "failed", failure_reason: "Rate limit" })).toBe(true);
  });

  it("classifies SMS content for consent enforcement", () => {
    expect(classifySms("Offer promotion")).toBe("promotional");
    expect(classifySms("Reservation confirmation")).toBe("transactional");
  });
});
