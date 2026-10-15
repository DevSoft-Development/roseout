export type IndependentBusinessProfile = {
  name?: string; address?: string; city?: string; state?: string;
  latitude?: number; longitude?: number; sourceUrl?: string;
  photoUrl?: string; photoPermission?: "licensed" | "owner" | "public_domain";
  /** Google photos are live, attributed provider content, NOT licensed assets. */
  photoSource?: "google_live" | "independent" | "wikimedia_commons";\n  wikimediaFilePageUrl?: string;
  googlePlaceId?: string;
  googlePhotoSlotVerified?: boolean;
  openStatus?: "open" | "closed" | "unknown";
  duplicate?: boolean; evidenceSource?: "owner" | "official_website" | "licensed_dataset";
};
export function isVerifiedGoogleLivePhoto(p: IndependentBusinessProfile) {
  if (p.photoSource !== "google_live" || p.googlePhotoSlotVerified !== true) return false;
  const id=String(p.googlePlaceId||"");
  if (!/^[A-Za-z0-9_-]{8,255}$/.test(id)) return false;
  const expected="/api/public/google-place-photo?placeId="+encodeURIComponent(id)+"&index=0&maxwidth=800";
  return p.photoUrl===expected && !p.photoPermission;
}
export function assessIndependentBusinessProfile(p: IndependentBusinessProfile) {
  const reasons: string[] = [];
  if (!p.name?.trim() || !p.address?.trim() || !p.city?.trim() || !p.state?.trim())
    reasons.push("business_identity_incomplete");
  if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) ||
      Math.abs(p.latitude ?? 999)>90 || Math.abs(p.longitude ?? 999)>180)
    reasons.push("coordinates_unverified");
  if (!p.evidenceSource) reasons.push("independent_evidence_missing");
  if (p.openStatus !== "open") reasons.push("operating_status_unverified");
  if (p.duplicate) reasons.push("existing_business_duplicate");
  const independentPhoto=Boolean(p.photoUrl?.startsWith("https://") && p.photoPermission &&
    (p.photoSource===undefined || p.photoSource==="independent" || p.photoSource==="wikimedia_commons"));
  if (!independentPhoto && !isVerifiedGoogleLivePhoto(p))
    reasons.push("approved_photo_missing");
  if (!p.sourceUrl?.startsWith("https://")) reasons.push("evidence_url_missing");
  return {publishable:reasons.length===0,reasons};
}
