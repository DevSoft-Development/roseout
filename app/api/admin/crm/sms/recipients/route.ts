import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { normalizePhone } from "@/lib/sms/telnyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ROLES = new Set([
  "superadmin",
  "admin",
  "manager",
  "editor",
  "reviewer",
  "viewer",
  "ambassador",
  "partner_ambassador",
  "experience",
  "experience_team",
]);

async function authorized() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return false;
  const { data } = await supabaseAdmin.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  return Boolean(data?.role && READ_ROLES.has(String(data.role)));
}

export async function GET(req: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const locationId = new URL(req.url).searchParams.get("locationId")?.trim();
  if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });

  const { data: accountLinks, error: accountError } = await supabaseAdmin
    .from("crm_account_locations")
    .select("account_id")
    .eq("location_id", locationId)
    .eq("status", "active");

  if (accountError) return NextResponse.json({ error: "Unable to load location accounts" }, { status: 500 });
  const accountIds = [...new Set((accountLinks || []).map((row) => row.account_id).filter(Boolean))];
  if (!accountIds.length) return NextResponse.json({ recipients: [] });

  const { data: relationships, error: relationshipError } = await supabaseAdmin
    .from("crm_account_contacts")
    .select("contact_id,relationship_type,role_label,is_primary,account_id")
    .in("account_id", accountIds)
    .eq("is_active", true);

  if (relationshipError) return NextResponse.json({ error: "Unable to load CRM contacts" }, { status: 500 });
  const contactIds = [...new Set((relationships || []).map((row) => row.contact_id).filter(Boolean))];
  if (!contactIds.length) return NextResponse.json({ recipients: [] });

  const { data: contacts, error: contactError } = await supabaseAdmin
    .from("crm_contacts")
    .select("id,full_name,first_name,last_name,phone,job_title,department,contact_type,is_primary,is_decision_maker,sms_consent_status,do_not_contact")
    .in("id", contactIds)
    .is("archived_at", null);

  if (contactError) return NextResponse.json({ error: "Unable to load CRM contacts" }, { status: 500 });

  const relationshipByContact = new Map((relationships || []).map((row) => [row.contact_id, row]));
  const recipients = (contacts || [])
    .map((contact) => {
      const phone = normalizePhone(contact.phone);
      if (!phone || !/^\+1\d{10}$/.test(phone)) return null;
      const relationship = relationshipByContact.get(contact.id);
      const name = contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "CRM contact";
      const role = relationship?.role_label || contact.job_title || contact.contact_type || relationship?.relationship_type || "Contact";
      return {
        contactId: contact.id,
        name,
        role,
        phone,
        isPrimary: Boolean(relationship?.is_primary || contact.is_primary),
        isDecisionMaker: Boolean(contact.is_decision_maker),
        smsConsentStatus: contact.sms_consent_status || "unknown",
        doNotContact: Boolean(contact.do_not_contact),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => Number(b.isPrimary) - Number(a.isPrimary) || Number(b.isDecisionMaker) - Number(a.isDecisionMaker) || a.name.localeCompare(b.name));

  return NextResponse.json({ recipients });
}
