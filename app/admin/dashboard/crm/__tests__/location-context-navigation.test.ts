import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseClientCrmContext,
  withClientCrmContext,
} from "@/lib/crm/client-context";

const locationId = "550e8400-e29b-41d4-a716-446655440000";

describe("location-aware CRM navigation", () => {
  it("parses the selected location from canonical and legacy parameters", () => {
    expect(parseClientCrmContext(new URLSearchParams(`location_id=${locationId}`)).locationId).toBe(locationId);
    expect(parseClientCrmContext(new URLSearchParams(`business_id=${locationId}`)).locationId).toBe(locationId);
  });

  it("appends the selected location to Outreach", () => {
    expect(withClientCrmContext("/admin/dashboard/crm/outreach", { locationId })).toBe(
      `/admin/dashboard/crm/outreach?location_id=${locationId}`,
    );
  });

  it("preserves existing module filters while adding relationship context", () => {
    expect(withClientCrmContext("/admin/dashboard/crm/outreach?channel=email_outreach", { locationId })).toBe(
      `/admin/dashboard/crm/outreach?channel=email_outreach&location_id=${locationId}`,
    );
  });

  it("excludes primary modules from the All CRM dropdown", () => {
    const source = readFileSync("components/admin/crm/EnterpriseCrmShell.tsx", "utf8");
    expect(source).toContain(".filter((item) => !item.primary)");
    expect(source).toContain("href={contextual(item.href)}");
    expect(source).toContain("useSearchParams");
  });

  it("keeps location context when outreach filters are submitted and queried", () => {
    const pageSource = readFileSync("app/admin/dashboard/crm/outreach/page.tsx", "utf8");
    const querySource = readFileSync("lib/crm/core-modules.ts", "utf8");
    expect(pageSource).toContain('"location_id"');
    expect(pageSource).toContain('type="hidden"');
    expect(querySource).toContain('if (p.location_id) q = q.eq("location_id", p.location_id)');
  });

  it("uses one related CRM activity section instead of child navigation rows", () => {
    const source = readFileSync("components/admin/location-workspace/LocationWorkspaceNavigation.tsx", "utf8");
    expect(source).toContain("Related CRM Activity");
    expect(source).not.toContain("secondaryTabs.map");
    expect(source).toContain("buildOutreachHref(context)");
  });
});
