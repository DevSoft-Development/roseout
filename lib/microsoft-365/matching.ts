import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type CrmMatch = {
  contactId: string | null;
  accountId: string | null;
  locationId: string | null;
  reason: "contact_email" | "account_email" | "location_email" | null;
};

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function domainOf(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  return at > 0 ? normalized.slice(at + 1) : "";
}

export async function matchCrmByEmails(emails: string[]): Promise<CrmMatch> {
  const candidates = [...new Set(emails.map(normalizeEmail).filter(Boolean))].slice(0, 25);
  for (const email of candidates) {
    const { data: contact, error: contactError } = await supabaseAdmin
      .from("crm_contacts")
      .select("id")
      .ilike("email", email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (contactError) throw contactError;
    if (contact?.id) {
      const { data: link, error: linkError } = await supabaseAdmin
        .from("crm_account_contacts")
        .select("account_id")
        .eq("contact_id", contact.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (linkError) throw linkError;
      let locationId: string | null = null;
      if (link?.account_id) {
        const { data: locationLink, error: locationLinkError } = await supabaseAdmin
          .from("crm_account_locations")
          .select("location_id")
          .eq("account_id", link.account_id)
          .eq("status", "active")
          .order("is_primary_location", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (locationLinkError) throw locationLinkError;
        locationId = locationLink?.location_id || null;
      }
      return { contactId: contact.id, accountId: link?.account_id || null, locationId, reason: "contact_email" };
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from("crm_accounts")
      .select("id")
      .ilike("email", email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (accountError) throw accountError;
    if (account?.id) {
      const { data: locationLink } = await supabaseAdmin
        .from("crm_account_locations")
        .select("location_id")
        .eq("account_id", account.id)
        .eq("status", "active")
        .order("is_primary_location", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { contactId: null, accountId: account.id, locationId: locationLink?.location_id || null, reason: "account_email" };
    }

    const { data: locations, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id")
      .or(`claimed_by_email.ilike.${email},owner_email.ilike.${email},webmaster_email.ilike.${email},reservation_owner_email.ilike.${email}`)
      .limit(1);
    if (locationError) throw locationError;
    if (locations?.[0]?.id) {
      const locationId = locations[0].id;
      const { data: accountLink } = await supabaseAdmin
        .from("crm_account_locations")
        .select("account_id")
        .eq("location_id", locationId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return { contactId: null, accountId: accountLink?.account_id || null, locationId, reason: "location_email" };
    }
  }
  return { contactId: null, accountId: null, locationId: null, reason: null };
}

export function shouldIgnoreMailboxMessage(input: {
  mailboxEmail: string;
  senderEmail: string;
  recipientEmails: string[];
  includeInternalMail: boolean;
}) {
  const sender = normalizeEmail(input.senderEmail);
  if (!sender) return true;
  const local = sender.split("@")[0] || "";
  if (/^(no-?reply|noreply|mailer-daemon|postmaster|notifications?|alerts?)$/.test(local)) return true;
  if (input.includeInternalMail) return false;
  const tenantDomain = domainOf(input.mailboxEmail);
  if (!tenantDomain) return false;
  const participantDomains = [sender, ...input.recipientEmails].map(domainOf).filter(Boolean);
  return participantDomains.length > 0 && participantDomains.every((domain) => domain === tenantDomain);
}
