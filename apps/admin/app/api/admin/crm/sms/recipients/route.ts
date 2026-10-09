import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { normalizePhone } from "@/lib/sms/telnyx";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRole(CRM_READ_ROLES);
    const locationId = new URL(request.url).searchParams.get("locationId")?.trim();
    if (!locationId) return NextResponse.json({ error: "locationId is required." }, { status: 400 });

    const db = getAdminDatabaseClient();
    const { data: links, error: linkError } = await db
      .from("crm_account_locations")
      .select("account_id")
      .eq("location_id", locationId)
      .eq("status", "active");
    if (linkError) throw linkError;
    const accountIds = [...new Set((links || []).map((row: any) => row.account_id).filter(Boolean))];
    if (!accountIds.length) return NextResponse.json({ recipients: [] });

    const { data: relationships, error: relationshipError } = await db
      .from("crm_account_contacts")
      .select("contact_id,relationship_type,role_label,is_primary,account_id")
      .in("account_id", accountIds)
      .eq("is_active", true);
    if (relationshipError) throw relationshipError;
    const contactIds = [...new Set((relationships || []).map((row: any) => row.contact_id).filter(Boolean))];
    if (!contactIds.length) return NextResponse.json({ recipients: [] });

    const { data: contacts, error: contactError } = await db
      .from("crm_contacts")
      .select("id,full_name,first_name,last_name,phone,job_title,contact_type,is_primary,is_decision_maker,sms_consent_status,do_not_contact")
      .in("id", contactIds)
      .is("archived_at", null);
    if (contactError) throw contactError;

    const relationshipByContact = new Map((relationships || []).map((row: any) => [row.contact_id, row]));
    const recipients = (contacts || [])
      .map((contact: any) => {
        const phone = normalizePhone(contact.phone);
        if (!phone || !/^\+1\d{10}$/.test(phone)) return null;
        const relationship: any = relationshipByContact.get(contact.id);
        return {
          contactId: contact.id,
          name: contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "CRM contact",
          role: relationship?.role_label || contact.job_title || contact.contact_type || relationship?.relationship_type || "Contact",
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
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load CRM contacts." }, { status: 403 });
  }
}
