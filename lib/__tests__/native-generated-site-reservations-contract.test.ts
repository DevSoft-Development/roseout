import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("native generated-site reservations", () => {
  it("upgrades generated website artifacts to native reservation and group-booking widgets", () => {
    const transform = source("lib/websites/native-reservation-artifact.ts");
    const deploy = source("lib/websites/publish-contract.ts");
    const preview = source("app/api/business/website/preview/route.ts");

    expect(transform).toContain("data-theouthaven-reservations");
    expect(transform).toContain('data-group-mounted="1"');
    expect(transform).toContain("/widgets/reservations.js");
    expect(transform).toContain("/widgets/group-booking.js");
    expect(transform).toContain("IFRAME_PATTERN");
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

  it("ships native standard and large-group booking clients without group-booking iframes", () => {
    const standardWidget = source("public/widgets/reservations.js");
    const groupWidget = source("public/widgets/group-booking.js");
    const profile = source("components/reserve/ExpandableGroupBooking.tsx");
    expect(standardWidget).toContain("monthCells");
    expect(standardWidget).toContain('request("availability"');
    expect(standardWidget).toContain('request("lock"');
    expect(standardWidget).toContain('request("book"');
    expect(standardWidget).toContain('request("waitlist"');
    expect(groupWidget).toContain("monthCells");
    expect(groupWidget).toContain("/api/public/large-group-availability");
    expect(groupWidget).toContain("/api/public/large-group-bookings");
    expect(groupWidget).toContain("Open Group Booking");
    expect(groupWidget).not.toContain("<iframe");
    expect(profile).toContain("LargeGroupBookingForm");
    expect(profile).not.toContain("<iframe");
  });
});
