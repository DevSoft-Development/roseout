import Link from "next/link";
import type { CrmRecordContext } from "@/lib/crm/context";
import {
  buildLocationCrmHref,
  buildAccountCrmHref,
  resolveCrmContext,
} from "@/lib/crm/context";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function CrmContextBanner({
  context,
  label,
}: {
  context: CrmRecordContext;
  label?: string;
}) {
  if (!context.accountId && !context.locationId && !context.contactId && !context.opportunityId && !context.claimId && !context.supportCaseId) return null;

  const resolved = await resolveCrmContext(context);
  const [location, account, contact, opportunity] = await Promise.all([
    resolved.locationId
      ? supabaseAdmin.from("locations").select("id,name,city,state").eq("id", resolved.locationId).maybeSingle()
      : Promise.resolve({ data: null }),
    resolved.accountId
      ? supabaseAdmin.from("crm_accounts").select("id,name").eq("id", resolved.accountId).maybeSingle()
      : Promise.resolve({ data: null }),
    resolved.contactId
      ? supabaseAdmin.from("crm_contacts").select("id,full_name,email").eq("id", resolved.contactId).maybeSingle()
      : Promise.resolve({ data: null }),
    resolved.opportunityId
      ? supabaseAdmin.from("crm_opportunities").select("id,name").eq("id", resolved.opportunityId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const title = label || location.data?.name || account.data?.name || contact.data?.full_name || opportunity.data?.name || "Selected CRM relationship";
  const locationLine = location.data
    ? [location.data.city, location.data.state].filter(Boolean).join(", ")
    : null;

  return (
    <section aria-label="CRM context" className="rounded-2xl border border-rose-300/25 bg-rose-950/25 p-4 text-white">
      <p className="text-xs font-black uppercase tracking-[.2em] text-rose-200">Viewing CRM activity for</p>
      <h2 className="mt-1 text-lg font-black">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70">
        {account.data?.name ? <span>Account: {account.data.name}</span> : null}
        {locationLine ? <span>{locationLine}</span> : null}
        {contact.data?.full_name ? <span>Contact: {contact.data.full_name}</span> : null}
        {opportunity.data?.name ? <span>Opportunity: {opportunity.data.name}</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {resolved.accountId ? <Link className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold" href={buildAccountCrmHref(resolved.accountId, resolved)}>Open account</Link> : null}
        {resolved.locationId ? <Link className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold" href={buildLocationCrmHref(resolved.locationId, resolved)}>Open location</Link> : null}
        <Link className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold" href="/admin/dashboard/crm">Clear context</Link>
      </div>
    </section>
  );
}
