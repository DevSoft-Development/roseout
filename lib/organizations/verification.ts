import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOrganizationManage } from "@/lib/organizations/access";

export async function getOrganizationTrustState(organizationId: string) {
  const [{ data: organization }, { data: organizerProfile }, { data: organizationRequest }, { data: organizerRequest }] = await Promise.all([
    supabaseAdmin.from("organizations").select("id,name,legal_name,organization_type,verification_status,trust_level").eq("id", organizationId).maybeSingle(),
    supabaseAdmin.from("organizer_profiles").select("*").eq("organization_id", organizationId).maybeSingle(),
    supabaseAdmin.from("organization_verification_requests").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("organizer_verification_requests").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { organization, organizerProfile, organizationRequest, organizerRequest };
}

export async function upsertOrganizerProfile(input: {
  actorUserId: string;
  organizationId: string;
  displayName: string;
  bio?: string | null;
  website?: string | null;
  instagram?: string | null;
  phone?: string | null;
}) {
  if (!(await requireOrganizationManage(input.actorUserId, input.organizationId))) throw new Error("Organization management access required.");
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("Organizer display name is required.");

  const { data, error } = await supabaseAdmin.from("organizer_profiles").upsert({
    organization_id: input.organizationId,
    display_name: displayName,
    bio: input.bio?.trim() || null,
    website: input.website?.trim() || null,
    instagram: input.instagram?.trim() || null,
    phone: input.phone?.trim() || null,
    created_by_user_id: input.actorUserId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" }).select("*").single();
  if (error || !data) throw new Error(error?.message || "Unable to save organizer profile.");
  return data;
}

export async function submitOrganizationVerification(input: {
  actorUserId: string;
  organizationId: string;
  legalName?: string | null;
  website?: string | null;
  contactEmail: string;
  contactPhone?: string | null;
  evidence?: Record<string, unknown>;
}) {
  if (!(await requireOrganizationManage(input.actorUserId, input.organizationId))) throw new Error("Organization management access required.");
  if (!input.contactEmail.trim()) throw new Error("Contact email is required.");

  const { data: existing } = await supabaseAdmin.from("organization_verification_requests")
    .select("id,status").eq("organization_id", input.organizationId).in("status", ["pending","needs_more_info"]).maybeSingle();
  if (existing?.id) throw new Error("This organization already has an open verification request.");

  const { data, error } = await supabaseAdmin.from("organization_verification_requests").insert({
    organization_id: input.organizationId,
    submitted_by_user_id: input.actorUserId,
    legal_name: input.legalName?.trim() || null,
    website: input.website?.trim() || null,
    contact_email: input.contactEmail.trim().toLowerCase(),
    contact_phone: input.contactPhone?.trim() || null,
    evidence: input.evidence || {},
    status: "pending",
  }).select("*").single();
  if (error || !data) throw new Error(error?.message || "Unable to submit organization verification.");

  await supabaseAdmin.from("organizations").update({ verification_status: "pending", updated_at: new Date().toISOString() }).eq("id", input.organizationId);
  return data;
}

export async function submitOrganizerVerification(input: {
  actorUserId: string;
  organizationId: string;
  experienceSummary?: string | null;
  socialLinks?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}) {
  if (!(await requireOrganizationManage(input.actorUserId, input.organizationId))) throw new Error("Organization management access required.");
  const { data: profile } = await supabaseAdmin.from("organizer_profiles").select("id").eq("organization_id", input.organizationId).maybeSingle();
  if (!profile?.id) throw new Error("Create the organizer profile before requesting organizer verification.");

  const { data: existing } = await supabaseAdmin.from("organizer_verification_requests")
    .select("id,status").eq("organization_id", input.organizationId).in("status", ["pending","needs_more_info"]).maybeSingle();
  if (existing?.id) throw new Error("This organizer already has an open verification request.");

  const { data, error } = await supabaseAdmin.from("organizer_verification_requests").insert({
    organization_id: input.organizationId,
    organizer_profile_id: profile.id,
    submitted_by_user_id: input.actorUserId,
    experience_summary: input.experienceSummary?.trim() || null,
    social_links: input.socialLinks || {},
    evidence: input.evidence || {},
    status: "pending",
    requested_trust_level: 1,
  }).select("*").single();
  if (error || !data) throw new Error(error?.message || "Unable to submit organizer verification.");
  await supabaseAdmin.from("organizer_profiles").update({ verification_status: "pending", publishing_status: "review_required", updated_at: new Date().toISOString() }).eq("id", profile.id);
  return data;
}

export async function reviewOrganizationVerification(input: {
  actorUserId: string;
  requestId: string;
  decision: "approved" | "rejected" | "needs_more_info";
  notes?: string | null;
}) {
  const { data: admin } = await supabaseAdmin.from("admin_users").select("role").eq("user_id", input.actorUserId).maybeSingle();
  if (!["superadmin","admin"].includes(String(admin?.role || ""))) throw new Error("Admin verification access required.");
  const { data: request } = await supabaseAdmin.from("organization_verification_requests").select("*").eq("id", input.requestId).maybeSingle();
  if (!request) throw new Error("Organization verification request not found.");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("organization_verification_requests").update({ status: input.decision, review_notes: input.notes?.trim() || null, reviewed_by_user_id: input.actorUserId, reviewed_at: now, updated_at: now }).eq("id", input.requestId);
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("organizations").update({
    verification_status: input.decision === "approved" ? "verified" : input.decision === "rejected" ? "rejected" : "pending",
    trust_level: input.decision === "approved" ? 3 : 0,
    legal_name: request.legal_name || undefined,
    updated_at: now,
  }).eq("id", request.organization_id);
  return { ok: true };
}

export async function reviewOrganizerVerification(input: {
  actorUserId: string;
  requestId: string;
  decision: "approved" | "rejected" | "needs_more_info";
  notes?: string | null;
  approvedTrustLevel?: number;
}) {
  const { data: admin } = await supabaseAdmin.from("admin_users").select("role").eq("user_id", input.actorUserId).maybeSingle();
  if (!["superadmin","admin"].includes(String(admin?.role || ""))) throw new Error("Admin verification access required.");
  const { data: request } = await supabaseAdmin.from("organizer_verification_requests").select("*").eq("id", input.requestId).maybeSingle();
  if (!request) throw new Error("Organizer verification request not found.");
  const trustLevel = input.decision === "approved" ? Math.min(5, Math.max(1, Number(input.approvedTrustLevel || 1))) : 0;
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("organizer_verification_requests").update({ status: input.decision, approved_trust_level: input.decision === "approved" ? trustLevel : null, review_notes: input.notes?.trim() || null, reviewed_by_user_id: input.actorUserId, reviewed_at: now, updated_at: now }).eq("id", input.requestId);
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("organizer_profiles").update({
    verification_status: input.decision === "approved" ? "verified" : input.decision === "rejected" ? "rejected" : "pending",
    trust_level: trustLevel,
    publishing_status: input.decision === "approved" && trustLevel >= 4 ? "trusted" : input.decision === "rejected" ? "disabled" : "review_required",
    updated_at: now,
  }).eq("id", request.organizer_profile_id);
  return { ok: true };
}
