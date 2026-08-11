import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const route = fs.readFileSync(
  path.join(repoRoot, "app/api/reserve/location/route.ts"),
  "utf8",
);

describe("reservation notification observability contract", () => {
  it("records a reservation-level summary for all notification channels", () => {
    expect(route).toContain('action: "reservation_notification_summary"');
    expect(route).toContain('"customer_email"');
    expect(route).toContain('"owner_email"');
    expect(route).toContain('"customer_sms"');
    expect(route).toContain('"owner_sms"');
    expect(route).toContain("const outcomes = settled.map");
  });

  it("treats returned email errors and rejected promises as failed delivery", () => {
    expect(route).toContain('rawStatus === "error" ? "failed" : rawStatus');
    expect(route).toContain('result.status === "rejected"');
    expect(route).toContain('status: "failed"');
  });

  it("checks the raw owner Twilio HTTP response instead of silently accepting failures", () => {
    expect(route).toContain("if (!response.ok)");
    expect(route).toContain("Twilio owner SMS failed with HTTP");
    expect(route).toContain('return { status: "failed", error: safeProviderError(error) }');
  });

  it("keeps booking success independent from provider delivery while surfacing partial failure", () => {
    expect(route).toContain("notification_partial_failure");
    expect(route).toContain("notificationOutcomes.some");
    expect(route).toContain("success: true");
  });

  it("redacts provider credentials from persisted error text", () => {
    expect(route).toContain('"[twilio-account]"');
    expect(route).toContain('"Bearer [redacted]"');
    expect(route).toContain(".slice(0, 500)");
  });
});
