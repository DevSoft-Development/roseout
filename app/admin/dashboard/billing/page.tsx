import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing | TheOutHaven Admin",
  description: "Estimated billing operations and follow-up queue.",
};

const ESTIMATED_RESERVE_MONTHLY_PRICE = 49;
const FULL_LOCATION_SELECT =
  "id,name,restaurant_name,activity_name,location_type,plan,plan_status,pro_until,promo_code_used,reservation_enabled,reservation_url,external_reservation_url,claim_status,is_claimed,claimed,created_at,updated_at,owner_email,claimed_by_email";
const SAFE_LOCATION_SELECT =
  "id,name,restaurant_name,activity_name,location_type,reservation_enabled,reservation_url,external_reservation_url,claim_status,is_claimed,claimed,created_at";

type BillingLocation = Record<string, any> & { id: string };

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function nameOf(row: BillingLocation) {
  return (
    row.name ||
    row.restaurant_name ||
    row.activity_name ||
    row.business_name ||
    "Untitled location"
  );
}

function reserveEnabled(row: BillingLocation) {
  return Boolean(
    row.reservation_enabled ||
    row.reservation_url ||
    row.external_reservation_url,
  );
}

function planText(row: BillingLocation) {
  const explicit = row.plan || row.plan_status;
  if (explicit) return String(explicit).replace(/_/g, " ");
  return reserveEnabled(row) ? "Reserve/Pro" : "Free";
}

function isPro(row: BillingLocation) {
  const label = `${row.plan || ""} ${row.plan_status || ""}`.toLowerCase();
  return reserveEnabled(row) || /pro|reserve|premium|paid|active/.test(label);
}

function isPromo(row: BillingLocation) {
  const label =
    `${row.plan || ""} ${row.plan_status || ""} ${row.promo_code_used || ""}`.toLowerCase();
  return Boolean(row.promo_code_used || /promo|trial/.test(label));
}

function isExpired(row: BillingLocation) {
  if (!row.pro_until) return false;
  return new Date(row.pro_until).getTime() < Date.now();
}

async function fetchLocations() {
  const full = await supabaseAdmin
    .from("locations")
    .select(FULL_LOCATION_SELECT)
    .limit(500);
  if (!full.error)
    return { rows: (full.data || []) as BillingLocation[], safeMode: false };
  const safe = await supabaseAdmin
    .from("locations")
    .select(SAFE_LOCATION_SELECT)
    .limit(500);
  return { rows: (safe.data || []) as BillingLocation[], safeMode: true };
}

async function safeRows(table: string, columns = "*", limit = 200) {
  const result = await supabaseAdmin.from(table).select(columns).limit(limit);
  if (result.error) return [] as BillingLocation[];
  return (result.data || []) as unknown as BillingLocation[];
}

export default async function BillingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.billing);

  const now = new Date();
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();
  const [locationPayload, ownerAccounts, businesses, reservations, promoCodes] =
    await Promise.all([
      fetchLocations(),
      safeRows(
        "owner_accounts",
        "id,email,claim_status,is_claimed,created_at",
        200,
      ),
      safeRows(
        "businesses",
        "id,name,business_name,owner_email,plan,plan_status,created_at",
        200,
      ),
      safeRows(
        "location_reservations",
        "id,location_id,created_at,status",
        500,
      ),
      safeRows("promo_codes", "id,code,is_active,expires_at", 200),
    ]);

  const locations = locationPayload.rows;
  const reserveLocations = locations.filter(isPro);
  const promoLocations = locations.filter(isPromo);
  const expiredLocations = locations.filter(isExpired);
  const claimedBillable = locations.filter(
    (row) => row.is_claimed || row.claimed || row.claim_status === "claimed",
  );
  const reservationsThisMonth = reservations.filter(
    (row) =>
      !row.created_at ||
      new Date(row.created_at).getTime() >= new Date(monthStart).getTime(),
  );
  const potentialMrr =
    reserveLocations.length * ESTIMATED_RESERVE_MONTHLY_PRICE;
  const followUps = [...locations]
    .filter(
      (row) =>
        isPro(row) ||
        isPromo(row) ||
        isExpired(row) ||
        row.claim_status === "claimed",
    )
    .slice(0, 20);

  return (
    <main className="min-h-screen bg-[#090706] p-6 text-white">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200/70">
            Owners
          </p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">Billing</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/60">
                Estimated billing operations view for Reserve/Pro enablement,
                claimed billable accounts, promos, and follow-up.
              </p>
            </div>
            <Link
              href="/admin/dashboard/plans"
              className="rounded-full bg-white px-4 py-2 text-sm font-black text-black"
            >
              Open Plans
            </Link>
          </div>
        </section>

        {locationPayload.safeMode ? (
          <div className="rounded-3xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
            Some plan columns are missing, so billing is using safe location
            fields and Reserve enablement signals.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Estimated potential MRR"
            value={formatMoney(potentialMrr)}
            hint={`Reserve/Pro count × $${ESTIMATED_RESERVE_MONTHLY_PRICE}`}
          />
          <Metric
            label="Reserve-enabled locations"
            value={formatNumber(reserveLocations.length)}
          />
          <Metric
            label="Claimed billable accounts"
            value={formatNumber(claimedBillable.length)}
          />
          <Metric
            label="Promo/trial accounts"
            value={formatNumber(promoLocations.length)}
          />
          <Metric
            label="Reservations this month"
            value={formatNumber(reservationsThisMonth.length)}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Metric
            label="Free"
            value={formatNumber(locations.filter((row) => !isPro(row)).length)}
          />
          <Metric
            label="Reserve/Pro"
            value={formatNumber(reserveLocations.length)}
          />
          <Metric
            label="Promo/trial"
            value={formatNumber(promoLocations.length)}
          />
          <Metric
            label="Expired/follow-up"
            value={formatNumber(expiredLocations.length)}
          />
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5">
          <h2 className="text-xl font-black">Billing follow-up queue</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-white/[0.05] text-xs uppercase tracking-[0.2em] text-white/45">
                <tr>
                  {[
                    "Location/business",
                    "Owner email",
                    "Plan",
                    "Status",
                    "Pro until",
                    "Reserve",
                    "Promo",
                    "Action",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {followUps.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-bold">{nameOf(row)}</td>
                    <td className="px-4 py-3 text-white/60">
                      {row.owner_email || row.claimed_by_email || "—"}
                    </td>
                    <td className="px-4 py-3 capitalize">{planText(row)}</td>
                    <td className="px-4 py-3">
                      {row.claim_status || row.plan_status || "review"}
                    </td>
                    <td className="px-4 py-3">
                      {row.pro_until
                        ? new Date(row.pro_until).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {reserveEnabled(row) ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">{row.promo_code_used || "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black"
                        href={`/admin/dashboard/crm/${row.id}`}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {!followUps.length ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-white/50"
                    >
                      No billing follow-up records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <Metric
            label="Owner accounts sampled"
            value={formatNumber(ownerAccounts.length)}
          />
          <Metric
            label="Businesses sampled"
            value={formatNumber(businesses.length)}
          />
          <Metric
            label="Active promos sampled"
            value={formatNumber(
              promoCodes.filter((row) => row.is_active !== false).length,
            )}
          />
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/45">{hint}</p> : null}
    </div>
  );
}
