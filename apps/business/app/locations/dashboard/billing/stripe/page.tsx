import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getLocationName } from "@/lib/locationName";
import StripeConnectWorkspace from "../StripeConnectWorkspace";

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
      <main className="min-h-screen bg-[#050607] text-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">TheOutHaven Payments</p>
            <h1 className="mt-2 text-2xl font-black">Location unavailable</h1>
            <p className="mt-2 text-sm font-semibold text-white/45">We could not resolve this location or your access to it.</p>
            <Link href="/locations/dashboard/billing" className="mt-5 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-black">Back to Billing & Payments</Link>
          </section>
        </div>
      </main>
    );
  }

  const connectReady = Boolean(location.stripe_connect_charges_enabled && location.stripe_connect_payouts_enabled);

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <div className="mx-auto max-w-6xl space-y-5 px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">TheOutHaven Payments</p>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">{getLocationName(location, "Your location")}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/45">Complete Stripe verification, manage business account details, review payments, and manage payouts without leaving TheOutHaven.</p>
            </div>
            <Link href={`/locations/dashboard/billing?locationId=${encodeURIComponent(String(location.id))}`} className="w-fit rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/70 transition hover:bg-white/[0.06] hover:text-white">Back to Billing & Payments</Link>
          </div>
        </section>

        <section className="rounded-3xl border border-[#ff2142]/25 bg-gradient-to-br from-[#171019] via-[#11131a] to-[#090c12] p-4 sm:p-6">
          <StripeConnectWorkspace locationId={String(location.id)} ready={connectReady} />
        </section>
      </div>
    </main>
  );
}
