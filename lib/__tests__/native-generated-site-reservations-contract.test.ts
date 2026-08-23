import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("native generated-site reservations", () => {
  it("upgrades generated website artifacts away from the legacy full reservation iframe", () => {
    const transform = source("lib/websites/native-reservation-artifact.ts");
    const deploy = source("lib/websites/publish-contract.ts");
    const preview = source("app/api/business/website/preview/route.ts");

    expect(transform).toContain("data-theouthaven-reservations");
    expect(transform).toContain("/widgets/reservations.js");
    expect(transform).toContain("IFRAME_PATTERN");
    expect(transform).toContain("Open Group Booking");
    expect(transform).toContain("aria-expanded");
    expect(deploy).toContain("upgradeGeneratedReservationArtifact");
    expect(preview).toContain("upgradeGeneratedReservationArtifact");
  });

  it("lets the deterministic preview execute the same native widget used live", () => {
    const builder = source("components/websites/WebsiteBuilderWorkspace.tsx");
    expect(builder).toContain("allow-scripts");
    expect(builder).toContain("allow-same-origin");
  });

  it("keeps reservation backend logic centralized behind an origin-validated gateway", () => {
    const gateway = source("app/api/widgets/reservations/route.ts");
    expect(gateway).toContain("business_websites");
    expect(gateway).toContain("platform_domain");
    expect(gateway).toContain("/api/reserve/availability");
    expect(gateway).toContain("/api/reservations/lock-slot");
    expect(gateway).toContain("/api/reserve/location");
    expect(gateway).toContain("/api/reserve/portal/waitlist");
    expect(gateway).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it("ships native standard reservations plus an expandable large-group handoff", () => {
    const widget = source("public/widgets/reservations.js");
    const profile = source("components/reserve/ExpandableGroupBooking.tsx");
    expect(widget).toContain("monthCells");
    expect(widget).toContain('request("availability"');
    expect(widget).toContain('request("lock"');
    expect(widget).toContain('request("book"');
    expect(widget).toContain('request("waitlist"');
    expect(widget).toContain('mode=group');
    expect(profile).toContain("Open Group Booking");
    expect(profile).toContain('mode=group');
  });
});
