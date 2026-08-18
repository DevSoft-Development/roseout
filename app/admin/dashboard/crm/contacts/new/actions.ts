"use server";

import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeReturnTo(value: string) {
  return value.startsWith("/admin/dashboard/crm/") ? value : "/admin/dashboard/crm/contacts";
}

export async function createCrmContactAction(formData: FormData) {
  const actor = await requireAdminRole(CRM_WRITE_ROLES);
  const firstName = field(formData, "first_name");
  const lastName = field(formData, "last_name");
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const phone = field(formData, "phone");
  const email = field(formData, "email");
  const jobTitle = field(formData, "job_title");
  const department = field(formData, "department");
  const contactType = field(formData, "contact_type") || "business_contact";
  const returnTo = safeReturnTo(field(formData, "return_to"));

  if (!fullName && !phone && !email) {
    throw new Error("Add a name, phone number, or email for the CRM contact.");
  }

  const { error } = await supabaseAdmin.from("crm_contacts").insert({
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: fullName || null,
    phone: phone || null,
    email: email || null,
    job_title: jobTitle || null,
    department: department || null,
    contact_type: contactType,
    preferred_channel: phone ? "sms" : email ? "email" : null,
    created_by: actor.user_id,
    updated_by: actor.user_id,
    metadata: { source: "crm_contact_create" },
  });

  if (error) throw error;
  redirect(returnTo);
}
