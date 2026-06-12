import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeAddressForSave } from "@/lib/address-utils";
import { distanceMeters, ensureTeamProfileForCurrentUser, getActiveSession, isWorkspaceLocationPermitted, siteVisitVerification } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

async function uploadProof(file: File, path: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { data, error } = await supabaseAdmin.storage.from("team-proofs").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  const { data: signed } = await supabaseAdmin.storage.from("team-proofs").createSignedUrl(data.path, 60 * 60 * 24 * 7);
  return { path: data.path, url: signed?.signedUrl || data.path };
}

export async function POST(req: Request) {
  try {
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    if (!profile.can_do_site_visits) return Response.json({ error: "Site visits are not enabled for your team profile." }, { status: 403 });
    const active = await getActiveSession(user.id);
    if (!active) return Response.json({ error: "Start a work session before starting a real site visit." }, { status: 400 });
    const form = await req.formData();
    let locationId = String(form.get("locationId") || "").trim();
    const locationName = String(form.get("businessName") || "").trim();
    const address = String(form.get("address") || "").trim();
    const city = String(form.get("city") || "").trim();
    const state = String(form.get("state") || "").trim();
    const zipCode = String(form.get("zipCode") || "").trim();
    const normalizedAddress = normalizeAddressForSave({ address, city, state, zip_code: zipCode });
    const businessLat = Number(form.get("businessLatitude") || NaN);
    const businessLng = Number(form.get("businessLongitude") || NaN);
    if (locationId && !(await isWorkspaceLocationPermitted(profile, locationId))) {
      return Response.json({ error: "This location is not assigned or permitted for your workspace profile." }, { status: 403 });
    }
    if (!locationId) {
      if (!locationName) return Response.json({ error: "Select an existing location or enter a business name." }, { status: 400 });
      const { data: created, error } = await supabaseAdmin.from("locations").insert({ name: locationName, location_name: locationName, location_type: String(form.get("locationType") || "restaurant"), category: String(form.get("category") || ""), address: normalizedAddress || null, city, state, zip_code: zipCode, phone: String(form.get("phone") || ""), website: String(form.get("website") || ""), instagram: String(form.get("instagram") || ""), facebook: String(form.get("facebook") || ""), tiktok: String(form.get("tiktok") || ""), latitude: Number.isFinite(businessLat) ? businessLat : null, longitude: Number.isFinite(businessLng) ? businessLng : null, geocoded_address: [normalizedAddress || address, city, state, zipCode].filter(Boolean).join(", ") || null, created_source: "ambassador_field_visit", created_by_team_member_id: profile.id, created_by_ambassador_id: profile.id, created_during_work_session_id: active.id, admin_review_status: "pending_review", public_visibility_tier: "internal", quality_status: "needs_review", is_searchable: false, is_demo: false, training_only: false }).select("id").single();
      if (error) throw error;
      locationId = created.id;
    }
    const checkLat = Number(form.get("checkInLatitude") || NaN);
    const checkLng = Number(form.get("checkInLongitude") || NaN);
    const accuracy = Number(form.get("checkInAccuracy") || NaN);
    if (!Number.isFinite(checkLat) || !Number.isFinite(checkLng)) return Response.json({ error: "GPS/location verification is required only for physical site visit check-ins." }, { status: 400 });
    const dist = Number.isFinite(businessLat) && Number.isFinite(businessLng) ? distanceMeters(checkLat, checkLng, businessLat, businessLng) : null;
    const verification = siteVisitVerification(dist, Number.isFinite(accuracy) ? accuracy : null);
    const { data: visit, error } = await supabaseAdmin.from("ambassador_site_visits").insert({ team_member_id: profile.id, ambassador_id: profile.id, user_id: user.id, work_session_id: active.id, location_id: locationId, visit_type: form.get("visitType") || "initial_visit", visit_outcome: form.get("visitOutcome") || "needs_admin_review", notes: form.get("notes") || null, follow_up_required: Boolean(form.get("followUpAt")), follow_up_at: form.get("followUpAt") || null, check_in_latitude: checkLat, check_in_longitude: checkLng, check_in_accuracy_meters: Number.isFinite(accuracy) ? accuracy : null, check_in_reverse_geocoded_address: form.get("checkedInAddress") || null, business_latitude: Number.isFinite(businessLat) ? businessLat : null, business_longitude: Number.isFinite(businessLng) ? businessLng : null, distance_from_business_meters: dist, location_verification_status: verification, photo_uploaded: false }).select("*").single();
    if (error) throw error;
    const proof = form.get("proof") as File | null;
    if (!proof || proof.size === 0) return Response.json({ error: "Storefront proof photo is required for real field visits." }, { status: 400 });
    const uploaded = await uploadProof(proof, `${user.id}/${visit.id}/${Date.now()}-${proof.name}`);
    await supabaseAdmin.from("team_proofs").insert({ team_member_id: profile.id, ambassador_id: profile.id, user_id: user.id, location_id: locationId, source_type: "site_visit", source_id: visit.id, proof_type: "storefront", file_url: uploaded.url, storage_bucket: "team-proofs", storage_path: uploaded.path, latitude: checkLat, longitude: checkLng, accuracy_meters: Number.isFinite(accuracy) ? accuracy : null, reverse_geocoded_address: form.get("checkedInAddress") || null });
    await supabaseAdmin.from("ambassador_site_visits").update({ photo_uploaded: true }).eq("id", visit.id);
    await supabaseAdmin.from("team_work_activities").insert({ team_member_id: profile.id, user_id: user.id, work_session_id: active.id, activity_type: "site_visit", source_type: "site_visit", source_id: visit.id, location_id: locationId, notes: form.get("notes") || null });
    await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Site visit completed. Verification: ${verification}.`, note_type: "site_visit", created_by: user.id }).then(undefined, () => undefined);
    revalidatePath("/my-workspace/site-visits"); revalidatePath("/admin/dashboard/team/site-visits");
    return Response.json({ visit: { ...visit, photo_uploaded: true } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save site visit." }, { status: 400 });
  }
}
