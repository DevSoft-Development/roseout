import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  platformCoreApiConfigured,
  readCrmSmsRecipientsViaCoreApi,
} from "@/lib/aws/core-api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone } from "@/lib/sms/telnyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.communicationOneToOne);
  if (authError) return authError;

  const locationId = new URL(req.url).searchParams.get("locationId")?.trim();
  if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });

  if (platformCoreApiConfigured()) {
    try {
      const payload = await readCrmSmsRecipientsViaCoreApi(locationId);
      return NextResponse.json(payload);
    } catch (error) {
      console.warn("[crm-sms-recipients] Core API read failed; using Vercel fallback.", error);
    }
  }

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
