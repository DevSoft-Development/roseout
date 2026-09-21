import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getLocationName } from "@/lib/locationName";
import StripeConnectWorkspace from "../StripeConnectWorkspace";
import { BusinessActionButton, BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] || "").trim() : String(value || "").trim();
}

export default async function StripePaymentsWorkspacePage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const locationId = firstParam(params.location_id) || firstParam(params.locationId) || firstParam(params.adminLocationId);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const authorized = user && locationId ? await requireOwnerOrAdminAccessToLocation(user.id, locationId) : null;
  const location = authorized?.location || null;

  if (!location) {
    return (
      <BusinessPageShell>
        <BusinessPageHeader eyebrow="TheOutHaven Payments" title="Location unavailable" subtitle="We could not resolve this location or your access to it." badge={<BusinessStatusBadge tone="amber">Access required</BusinessStatusBadge>} actions={<BusinessActionButton href="/locations/dashboard/billing">Billing & Payments</BusinessActionButton>} />
      </BusinessPageShell>
    );
  }

  const connectReady = Boolean(location.stripe_connect_charges_enabled && location.stripe_connect_payouts_enabled);

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="TheOutHaven Payments"
        title={getLocationName(location, "Your location")}
        subtitle="Complete Stripe verification, manage business account details, review payments, and manage payouts without leaving TheOutHaven."
        badge={<BusinessStatusBadge tone={connectReady ? "green" : "amber"}>{connectReady ? "Payments ready" : "Setup required"}</BusinessStatusBadge>}
        actions={<BusinessActionButton href={`/locations/dashboard/billing?locationId=${encodeURIComponent(String(location.id))}`}>Billing & Payments</BusinessActionButton>}
      />
      <section className="rounded-3xl border border-[#ff2142]/25 bg-[var(--business-panel)] p-4 sm:p-6">
        <StripeConnectWorkspace locationId={String(location.id)} ready={connectReady} />
      </section>
    </BusinessPageShell>
  );
}
