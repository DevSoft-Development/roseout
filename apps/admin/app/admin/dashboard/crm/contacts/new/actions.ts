"use server";

import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { normalizePhone } from "@/lib/sms/telnyx";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeReturnTo(value: string) {
  return value.startsWith("/admin/dashboard/crm/") ? value : "/admin/dashboard/crm/contacts";
}

export async function createCrmContactAction(formData: FormData) {
  const actor = await requireAdminRole(CRM_WRITE_ROLES);
  const supabaseAdmin = getAdminDatabaseClient();
  const firstName = field(formData, "first_name");
  const lastName = field(formData, "last_name");
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const phone = field(formData, "phone");
  const phoneE164 = normalizePhone(phone);
  const email = field(formData, "email");
  const jobTitle = field(formData, "job_title");
  const department = field(formData, "department");
  const contactType = field(formData, "contact_type") || "business_contact";
  const locationId = field(formData, "location_id");
  const returnTo = safeReturnTo(field(formData, "return_to"));

  if (!fullName && !phone && !email) {
    throw new Error("Add a name, phone number, or email for the CRM contact.");
  }

  const { data: contact, error } = await supabaseAdmin.from("crm_contacts").insert({
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: fullName || null,
    phone: phone || null,
    phone_e164: phoneE164 || null,
    email: email || null,
    job_title: jobTitle || null,
    department: department || null,
    contact_type: contactType,
    preferred_channel: phoneE164 ? "sms" : email ? "email" : null,
    sms_consent_status: phoneE164 ? "unknown" : null,
    created_by: actor.user_id,
    updated_by: actor.user_id,
    metadata: { source: locationId ? "crm_sms_missing_contact" : "crm_contact_create", location_id: locationId || null },
  }).select("id").single();

  if (error || !contact?.id) throw error || new Error("Unable to create CRM contact.");

  if (locationId) {
    const { data: accountLink, error: accountError } = await supabaseAdmin
      .from("crm_account_locations")
      .select("account_id")
      .eq("location_id", locationId)
      .eq("status", "active")
      .order("is_primary_location", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!accountLink?.account_id) {
      await supabaseAdmin.from("crm_contacts").delete().eq("id", contact.id);
      throw new Error("This location is not linked to an active CRM account yet. Link the location to a CRM account before adding an SMS contact.");
    }

    const { error: relationError } = await supabaseAdmin.from("crm_account_contacts").insert({
      account_id: accountLink.account_id,
      contact_id: contact.id,
      relationship_type: contactType === "owner" ? "owner" : contactType === "manager" ? "manager" : "business_contact",
      role_label: jobTitle || (contactType === "owner" ? "Owner" : contactType === "manager" ? "Manager" : "Contact"),
      is_primary: ["owner", "manager", "decision_maker"].includes(contactType),
      is_active: true,
    });
    if (relationError) {
      await supabaseAdmin.from("crm_contacts").delete().eq("id", contact.id);
      throw relationError;
    }
  }

  redirect(returnTo);
}
