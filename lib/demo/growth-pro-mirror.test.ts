import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launchpad = readFileSync(
  "app/internal/demo/theouthaven-lounge/page.tsx",
  "utf8",
);
const publicGrowthProPage = readFileSync(
  "components/growth-pro/PublicGrowthProPage.tsx",
  "utf8",
);
const offerClaimRoute = readFileSync(
  "app/api/offers/[id]/claim/route.ts",
  "utf8",
);
const vipSignupRoute = readFileSync(
  "app/api/vip/signup/route.ts",
  "utf8",
);
const marketingApi = readFileSync(
  "app/api/business/marketing/generate/route.ts",
  "utf8",
);
const qrRoute = readFileSync("app/q/[code]/route.ts", "utf8");

describe("TheOutHaven Lounge Growth Pro mirror transactions", () => {
  it("uses an actual active offer record instead of the legacy demo placeholder", () => {
    expect(publicGrowthProPage).toContain('from("location_offers")');
    expect(publicGrowthProPage).toContain('.eq("location_id", locationId)');
    expect(publicGrowthProPage).toContain('.eq("is_active", true)');
    expect(publicGrowthProPage).toContain(
      '`/api/offers/${activeOffer.id}/claim`',
    );
    expect(publicGrowthProPage).not.toContain(
      'endpoint: "/api/offers/demo/claim"',
    );
    expect(offerClaimRoute).toContain('from("location_offer_claims")');
  });

  it("does not expose hidden mirror customer forms to an unauthorized viewer", () => {
    expect(publicGrowthProPage).toContain("MIRROR_DEMO_KEY");
    expect(publicGrowthProPage).toContain("getInternalDemoViewer");
    expect(publicGrowthProPage).toContain("location.is_hidden === true");
    expect(publicGrowthProPage).toContain("location.is_searchable !== true");
    expect(publicGrowthProPage).toContain("if (!viewer) notFound()");
  });

  it("exposes real transaction launchers from the internal mirror", () => {
    expect(launchpad).toContain("Run offer claim");
    expect(launchpad).toContain("Run VIP signup");
    expect(launchpad).toContain("Run live scan");
    expect(launchpad).toContain('countRows("location_offer_claims"');
    expect(launchpad).toContain('countRows("location_marketing_generations"');
    expect(launchpad).toContain('countRows("location_qr_scan_events"');
  });

  it("writes marketing, VIP, offer, and QR activity to production tables", () => {
    expect(marketingApi).toContain('from("location_marketing_generations")');
    expect(vipSignupRoute).toContain('from("location_vip_signups")');
    expect(offerClaimRoute).toContain('from("location_offer_claims")');
    expect(qrRoute).toContain('from("location_qr_scan_events")');
  });
});
