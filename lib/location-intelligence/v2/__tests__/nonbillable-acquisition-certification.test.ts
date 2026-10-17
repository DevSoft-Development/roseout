import { describe, expect, it } from "vitest";
import { assessIndependentBusinessProfile } from "../independent-profile-gate";
import { uniquePlaceIds } from "../acquisition-identity-gate";
import { permittedOfficialPhoto, parseOfficialBusinessJsonLd } from "../official-website-resolver";

const base = {
  name: "Controlled Independent Cafe",
  address: "1 Example Street",
  city: "Albany",
  state: "NY",
  latitude: 42.65,
  longitude: -73.75,
  evidenceSource: "official_website" as const,
  sourceUrl: "https://example.org",
  openStatus: "open" as const,
  photoUrl: "https://example.org/photo.jpg",
  photoPermission: "owner" as const,
  photoSource: "independent" as const,
};

describe("LI V2 non-billable independent profile certification", () => {
  it("accepts complete independently sourced photo-rights evidence", () => {
    expect(assessIndependentBusinessProfile(base)).toMatchObject({ publishable: true, importEligible:true, photoReady:true, reasons: [] });
  });
  it.each([
    [{ ...base, photoUrl: undefined }, "approved_photo_missing"],
    [{ ...base, photoPermission: undefined }, "approved_photo_missing"],
    [{ ...base, evidenceSource: undefined }, "independent_evidence_missing"],
    [{ ...base, openStatus: "unknown" as const }, "operating_status_unverified"],
    [{ ...base, openStatus: "closed" as const }, "operating_status_unverified"],
    [{ ...base, duplicate: true }, "existing_business_duplicate"],
    [{ ...base, address: undefined }, "business_identity_incomplete"],
    [{ ...base, latitude: 999 }, "coordinates_unverified"],
  ])("rejects ineligible publication inputs", (candidate, reason) => {
    expect(assessIndependentBusinessProfile(candidate).reasons).toContain(reason);
  });
  it("deduplicates identifiers before purchase and rejects malformed IDs", () => {
    expect(uniquePlaceIds(["abcdEFGH123", "abcdEFGH123", "", "bad", "another_ID_456"]))
      .toEqual(["abcdEFGH123", "another_ID_456"]);
  });
  it("validates actual official-site structured evidence", () => {
    const html = '<script type="application/ld+json">'+
      '{"@type":"Restaurant","name":"Controlled Independent Cafe","address":'+
      '{"streetAddress":"1 Example Street","addressLocality":"Albany","addressRegion":"NY"}}'+
      '</script>';
    expect(parseOfficialBusinessJsonLd(html,"https://example.org")?.name).toBe("Controlled Independent Cafe");
    expect(parseOfficialBusinessJsonLd("<html></html>","https://example.org")).toBeNull();
  });
  it("requires image-specific grant provenance; expired and mismatched grants fail", () => {
    const grant = {websiteOrigin:"https://example.org",imageUrl:"https://example.org/photo.jpg",
      evidenceUrl:"https://example.org/permission",permission:"owner" as const,verifiedBy:"owner",
      expiresAt:"2099-01-01T00:00:00Z"};
    expect(permittedOfficialPhoto(grant,"https://example.org")?.photoPermission).toBe("owner");
    expect(permittedOfficialPhoto({...grant,expiresAt:"2000-01-01T00:00:00Z"},"https://example.org")).toBeNull();
    expect(permittedOfficialPhoto(grant,"https://other.example")).toBeNull();
  });
  it("accepts live Google photo only with verified slot and exact provider proxy URL", () => {
    const google = {...base, photoUrl:"/api/public/google-place-photo?placeId=abcdEFGH123&index=0&maxwidth=800",
      photoSource:"google_live" as const,photoPermission:undefined,googlePlaceId:"abcdEFGH123",
      googlePhotoSlotVerified:true};
    expect(assessIndependentBusinessProfile(google).publishable).toBe(true);
    expect(assessIndependentBusinessProfile({...google,googlePhotoSlotVerified:false}).publishable).toBe(false);
  });
});
