import fs from "node:fs";
import path from "node:path";

describe("hosted website reservation routing contract", () => {
  const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

  it("keeps reservation settings sourced from the canonical location snapshot", () => {
    const locationContent = source("lib/websites/location-content.ts");
    expect(locationContent).toContain("reservation_provider");
    expect(locationContent).toContain("reservation_source");
    expect(locationContent).toContain("uses_internal_reservations");
    expect(locationContent).toContain("allow_external_reservations");
    expect(locationContent).toContain("external_reservation_url");
    expect(locationContent).toContain("booking_url");
  });

  it("routes external-only businesses before the native reservation upgrader", () => {
    const artifact = source("lib/websites/content-artifact.ts");
    const routing = source("lib/websites/reservation-routing-artifact.ts");
    expect(artifact).toContain("routeGeneratedReservationArtifact(enhanced,location)");
    expect(routing).toContain("shouldUseExternalReservations");
    expect(routing).toContain("location.uses_internal_reservations");
    expect(routing).toContain("location.internal_reservations_enabled");
    expect(routing).toContain("Reserve with");
  });

  it("preserves the current native widget upgrade path for TheOutHaven Reserve", () => {
    const publishContract = source("lib/websites/publish-contract.ts");
    const nativeArtifact = source("lib/websites/native-reservation-artifact.ts");
    expect(publishContract).toContain("upgradeGeneratedReservationArtifact");
    expect(nativeArtifact).toContain("data-theouthaven-reservations");
    expect(nativeArtifact).toContain("widgets/reservations.js");
  });
});
