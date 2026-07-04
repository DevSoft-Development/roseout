import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBillingPlanLabel, getBillingStatusLabel } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plans | TheOutHaven Admin",
  description: "Plan distribution, trials, promos, and Reserve enablement.",
};

type LocationPlanRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
  plan?: string | null;
  plan_status?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  stripe_subscription_id?: string | null;
  pro_until?: string | null;
  promo_code_used?: string | null;
  reservation_enabled?: boolean | null;
  reservation_url?: string | null;
  external_reservation_url?: string | null;
  claim_status?: string | null;
  is_claimed?: boolean | null;
  claimed?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type OptionalRow = Record<string, any>;

const FULL_LOCATION_SELECT =
  "id,name,restaurant_name,activity_name,location_type,plan,plan_status,subscription_plan,subscription_status,stripe_subscription_id,pro_until,promo_code_used,reservation_enabled,reservation_url,external_reservation_url,claim_status,is_claimed,claimed,created_at,updated_at";
const SAFE_LOCATION_SELECT =
  "id,name,restaurant_name,activity_name,location_type,reservation_enabled,reservation_url,external_reservation_url,claim_status,is_claimed,claimed,created_at";

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function displayName(row: OptionalRow) {
  return (
    row.name ||
    row.restaurant_name ||
    row.activity_name ||
    row.business_name ||
    "Untitled"
  );
}

function reserveEnabled(row: LocationPlanRow) {
  return Boolean(
    row.reservation_enabled ||
    row.reservation_url ||
    row.external_reservation_url,
  );
}

function planLabel(row: LocationPlanRow) {
  const explicit = row.subscription_plan || row.plan;
  if (explicit) return getBillingPlanLabel(explicit);
  return reserveEnabled(row) ? "Business Pro" : "Free Discovery";
}

function isReserveOrPro(row: LocationPlanRow) {
  const label = `${row.plan || ""} ${row.plan_status || ""}`.toLowerCase();
  return reserveEnabled(row) || /pro|reserve|premium|paid|active/.test(label);
}

function isClaimed(row: LocationPlanRow) {
  return Boolean(
    row.is_claimed || row.claimed || row.claim_status === "claimed",
  );
}

function isInNext30Days(value?: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  const now = Date.now();
  return time >= now && time <= now + 30 * 24 * 60 * 60 * 1000;
}

async function fetchLocations() {
  const full = await supabaseAdmin
    .from("locations")
    .select(FULL_LOCATION_SELECT)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (!full.error)
    return {
      rows: (full.data || []) as unknown as LocationPlanRow[],
      safeMode: false,
    };

  const safe = await supabaseAdmin
    .from("locations")
    .select(SAFE_LOCATION_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  return {
    rows: (safe.data || []) as unknown as LocationPlanRow[],
    safeMode: true,
  };
}

async function safeSelect(table: string, columns = "*", limit = 200) {
  const result = await supabaseAdmin.from(table).select(columns).limit(limit);
  if (result.error) return [] as OptionalRow[];
  return (result.data || []) as unknown as OptionalRow[];
}

function groupPlans(locations: LocationPlanRow[]) {
  const map = new Map<string, number>();
  for (const location of locations) {
    const label = planLabel(location);
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

export default async function PlansPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.billing);

  const [
    locationsPayload,
    ownerAccounts,
    businesses,
    promoCodes,
    reservations,
  ] = await Promise.all([
    fetchLocations(),
    safeSelect(
      "owner_accounts",
      "id,email,claim_status,is_claimed,created_at",
      200,
    ),
    safeSelect(
      "businesses",
      "id,name,business_name,plan,plan_status,created_at",
      200,
    ),
    safeSelect(
      "promo_codes",
      "id,code,is_active,expires_at,valid_until,ends_at",
      200,
    ),
    safeSelect(
      "location_reservations",
      "id,location_id,created_at,status",
      200,
    ),
  ]);

  const locations = locationsPayload.rows;
  const proLocations = locations.filter(isReserveOrPro);
  const freeLocations = locations.filter((row) => !isReserveOrPro(row));
  const claimedLocations = locations.filter(isClaimed);
  const claimedOwners = ownerAccounts.filter(
    (row) => row.is_claimed || row.claim_status === "claimed",
  );
  const activePromoCodes = promoCodes.filter((row) => row.is_active !== false);
  const expiringPromos = locations.filter((row) =>
    isInNext30Days(row.pro_until),
  );
  const recentActivity = [...locations]
    .filter((row) => isReserveOrPro(row) || isClaimed(row))
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at || 0).getTime() -
        new Date(a.updated_at || a.created_at || 0).getTime(),
    )
    .slice(0, 8);
  const distribution = groupPlans(locations);

  return (
    <main className="min-h-screen bg-[#090706] p-6 text-white">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200/70">
            Owners
          </p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">Plans</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/60">
                Monitor Free, Reserve/Pro, promo, and claimed-plan adoption from
                live owner and location data.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded-full bg-white px-4 py-2 text-sm font-black text-black"
                href="/admin/dashboard/billing"
              >
                Open Billing
              </Link>
              <Link
                className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white"
                href="/admin/dashboard/businesses"
              >
                Businesses
              </Link>
            </div>
          </div>
        </section>

        {locationsPayload.safeMode ? (
          <div className="rounded-3xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
            Plan columns are partially missing on locations, so this page is
            using reservation and claim fields as a safe fallback.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Total locations" value={locations.length} />
          <Metric label="Free plan locations" value={freeLocations.length} />
          <Metric label="Reserve/Pro enabled" value={proLocations.length} />
          <Metric
            label="Claimed owners/locations"
            value={claimedOwners.length + claimedLocations.length}
          />
          <Metric label="Active promo codes" value={activePromoCodes.length} />
          <Metric label="Expiring in 30 days" value={expiringPromos.length} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel title="Plan distribution">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.05] text-xs uppercase tracking-[0.2em] text-white/45">
                  <tr>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Locations</th>
                    <th className="px-4 py-3">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {distribution.map(([label, count]) => (
                    <tr key={label}>
                      <td className="px-4 py-3 font-bold capitalize">
                        {label}
                      </td>
                      <td className="px-4 py-3">{formatNumber(count)}</td>
                      <td className="px-4 py-3">
                        {locations.length
                          ? Math.round((count / locations.length) * 100)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                  {!distribution.length ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-white/50"
                      >
                        No location plan data found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Recent upgrades or claimed locations">
            <div className="space-y-3">
              {recentActivity.map((row) => (
                <Link
                  key={row.id}
                  href={`/admin/dashboard/crm/${row.id}`}
                  className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.08]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <b>{displayName(row)}</b>
                    <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-black text-rose-100 capitalize">
                      {`${planLabel(row)}${row.stripe_subscription_id ? " · Stripe managed" : row.subscription_status === "comped" ? " · Manually comped" : row.subscription_plan === "enterprise" ? " · Enterprise invoice" : ""}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/45">
                    {row.claim_status ||
                      (isClaimed(row) ? "claimed" : "unclaimed")}{" "}
                    ·{" "}
                    {row.pro_until
                      ? `Pro until ${new Date(row.pro_until).toLocaleDateString()}`
                      : "No pro expiration"}
                  </p>
                </Link>
              ))}
              {!recentActivity.length ? (
                <p className="text-sm text-white/50">
                  No recent upgrades or claimed locations yet.
                </p>
              ) : null}
            </div>
          </Panel>
        </section>

        <Panel title="Supporting data sources">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric
              label="Owner accounts loaded"
              value={ownerAccounts.length}
            />
            <Metric label="Businesses loaded" value={businesses.length} />
            <Metric label="Promo records loaded" value={promoCodes.length} />
            <Metric label="Reservations sampled" value={reservations.length} />
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{formatNumber(value)}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
