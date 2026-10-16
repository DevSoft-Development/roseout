import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Discovery signals are NOT authority to grant location ownership. */
export type ClaimMethod = "email_plus_review" | "dns" | "website" | "phone_plus_review" | "postcard" | "manual_review";
export type ClaimMethodDecision = { methods: ClaimMethod[]; requiresOwnershipReview: true; evidence: { officialWebsite: boolean; sourcedEmail: boolean; businessPhone: boolean; mailingAddress: boolean } };

export async function getClaimMethodDecision(locationId: string): Promise<ClaimMethodDecision> {
  const [{ data: location, error }, { data: contacts, error: contactError }] = await Promise.all([
    supabaseAdmin.from("locations").select("id,website,phone,address,city,state,zip_code").eq("id", locationId).maybeSingle(),
    supabaseAdmin.from("gtm_contact_discoveries").select("contact_value,source_url,source_type,verification_status").eq("location_id",locationId).eq("contact_kind","email").eq("source_type","official_website").in("verification_status",["discovered","verified"]).limit(20),
  ]);
  if (error) throw error;
  if (contactError) throw contactError;
  if (!location) throw new Error("Location not found");
  const officialWebsite = /^https?:\/\//i.test(String(location.website || "")) || /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(String(location.website || ""));
  const sourcedEmail = Boolean((contacts || []).some((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(entry.contact_value || "")) && Boolean(entry.source_url)));
  const businessPhone = Boolean(String(location.phone || "").trim());
  const mailingAddress = Boolean(location.address && location.city && location.state && location.zip_code);
  const methods: ClaimMethod[] = [];
  if (sourcedEmail) methods.push("email_plus_review"); // Including Gmail: email control is never owner proof.
  if (officialWebsite) methods.push("dns","website");
  if (businessPhone) methods.push("phone_plus_review");
  if (mailingAddress) methods.push("postcard");
  methods.push("manual_review");
  return { methods, requiresOwnershipReview: true, evidence: { officialWebsite, sourcedEmail, businessPhone, mailingAddress } };
}
