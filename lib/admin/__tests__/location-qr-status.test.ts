import { describe, expect, it } from "vitest";
import {
  getLocationQrOperationalAlerts,
  getLocationQrStatus,
} from "../location-qr-status";

function status(
  location: Record<string, unknown>,
  qrCodes: Record<string, unknown>[] = [],
) {
  return getLocationQrStatus({ location, qrCodes });
}

describe("getLocationQrStatus", () => {
  it("counts a QR table record", () => {
    expect(
      status({}, [{ qr_url: "https://theouthaven.com/claim/abc" }]),
    ).toMatchObject({
      hasQrCode: true,
      source: "qr_record",
      hasQrRecord: true,
    });
  });

  it.each(["claim_qr_url", "qr_link", "qr_code_data_url", "claim_url"])(
    "counts %s with no QR table row",
    (field) => {
      const value =
        field === "qr_code_data_url"
          ? "data:image/png;base64,abc123"
          : "https://theouthaven.com/claim/abc";
      expect(status({ [field]: value })).toMatchObject({
        hasQrCode: true,
        source: "location_field",
        hasLocationQrFields: true,
      });
    },
  );

  it("counts a claim code as renderable claim QR", () => {
    expect(status({ claim_code: "CLAIM-123" })).toMatchObject({
      hasQrCode: true,
      source: "claim_code",
      hasClaimCode: true,
    });
  });

  it("ignores whitespace and placeholders", () => {
    expect(
      status({
        claim_qr_url: "   ",
        qr_link: "placeholder",
        claim_code: "---",
      }),
    ).toMatchObject({ hasQrCode: false, source: "none" });
  });

  it.each([
    "https://roseout.com/claim/abc",
    "https://roseout.vercel.app/claim/abc",
  ])("marks %s as legacy", (url) => {
    expect(status({ claim_url: url })).toMatchObject({
      hasQrCode: true,
      isLegacyDomain: true,
      isBroken: false,
    });
  });

  it("treats canonical theouthaven.com URLs as valid", () => {
    expect(
      status({ claim_url: "https://theouthaven.com/claim/abc" }),
    ).toMatchObject({
      hasQrCode: true,
      isLegacyDomain: false,
      isBroken: false,
    });
  });

  it("marks malformed URLs as broken", () => {
    expect(status({ claim_url: "https://not a url" })).toMatchObject({
      hasQrCode: false,
      isBroken: true,
      destination: "https://not a url",
    });
  });

  it("does not let duplicate QR records create multiple source states", () => {
    expect(
      status({}, [
        { qr_url: "https://theouthaven.com/claim/abc" },
        { qr_url: "https://theouthaven.com/claim/abc" },
      ]),
    ).toMatchObject({
      hasQrCode: true,
      source: "qr_record",
      hasQrRecord: true,
    });
  });

  it("valid location-level QR suppresses missing state", () => {
    expect(
      status({ qr_link: "https://theouthaven.com/claim/abc" }, []),
    ).toMatchObject({ hasQrCode: true, source: "location_field" });
  });

  it("valid location-level QR suppresses the Operations missing alert", () => {
    const alerts = getLocationQrOperationalAlerts(
      status({ claim_qr_url: "data:image/png;base64,abc123" }),
      "/admin/dashboard/crm/1?tab=qr-codes",
    );
    expect(alerts.map((alert) => alert[1])).not.toContain("QR code missing");
  });
});
