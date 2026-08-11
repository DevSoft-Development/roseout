import fs from "node:fs";
import path from "node:path";

describe("reservation observability production sinks", () => {
  it("writes monitoring events to the existing admin system log sink", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/monitoring.ts"), "utf8");
    expect(source).toContain('from("admin_system_logs")');
    expect(source).not.toContain('from("admin_logs")');
    expect(source).toContain('entity_type: category === "reservation_audit" ? "reservation" : null');
    expect(source).toContain("payload.reservationId");
  });

  it("persists analytics using columns available in production", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/analytics/business-analytics.ts"), "utf8");
    expect(source).toContain('from("location_analytics_events").insert({');
    expect(source).toContain("compatibilityMetadata");
    expect(source).toContain("event_id: input.eventId");
    expect(source).not.toContain('from("location_analytics_events").upsert({');
    expect(source).not.toContain('onConflict: "event_id"');
  });
});
