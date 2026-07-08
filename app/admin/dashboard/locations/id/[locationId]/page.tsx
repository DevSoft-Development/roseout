import Link from "next/link";
import { notFound } from "next/navigation";
import BusinessCommunicationSection from "@/components/admin/business/BusinessCommunicationSection";
import { requireAdminRole } from "@/lib/admin-auth";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { getLocationScore } from "@/lib/locationScore";
import { listSupportTickets } from "@/lib/support";
import { supabase } from "@/lib/supabase";
import { ensureClaimFields, upsertLocationClaimCode } from "@/lib/claimQrServer";
import { getCanonicalAppUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
type LocationType = "restaurants" | "activities";
type LocationRecord = Record<string, unknown> & {
  id: string;
  locationType: LocationType;
  source_table?: string | null;
  location_type?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  claim_code?: string | null;
  claim_status?: string | null;
  owner_user_id?: string | null;
};

const tabs = [
  "Overview",
  "Analytics",
  "CRM",
  "Reservations",
  "Claim Access",
  "QR Codes",
  "Communication",
  "Experience Inbox",
  "Data Quality",
  "Promotions",
];

const val = (input: unknown, fallback = "—") => {
  const text = String(input ?? "").trim();
  return text || fallback;
};

async function findLocation(id: string): Promise<LocationRecord | null> {
  const normalizedId = id.trim();
  if (!normalizedId) return null;
  const { data: locationData } = await supabase
    .from("locations")
    .select("*")
    .eq("id", normalizedId)
    .maybeSingle();
  if (locationData) {
    const sourceTable = String(locationData.source_table || "").toLowerCase();
    const locationType = String(locationData.location_type || "").toLowerCase();
    const normalizedType: LocationType =
      sourceTable === "activities" ||
      locationType === "activity" ||
      locationType === "activities"
        ? "activities"
        : "restaurants";
    return { ...locationData, locationType: normalizedType, id: normalizedId };
  }
  return null;
}

function Card({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
    >
      <h2 className="text-lg font-black text-white">{title}</h2>
      <div className="mt-4 text-sm text-white/70">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </article>
  );
}

export default async function AdminLocationDetailPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.locations);
  const { locationId } = await params;
  const location = await findLocation(locationId);
  if (!location) notFound();

  const qrValues = [
    location.claim_code,
    (location as any).claim_url,
    (location as any).claim_qr_url,
    (location as any).qr_code_data_url,
    (location as any).qr_link,
  ].map((value) => String(value || ""));
  const needsQrRepair =
    qrValues.some((value) => value.length === 0) ||
    qrValues.some((value) => /roseout\.com|roseout\.vercel\.app|theouthaven\.vercel\.app/i.test(value));

  if (needsQrRepair) {
    const fields = await ensureClaimFields(location, {
      table: "locations",
      forceCanonicalUrl: true,
      regenerateQr: true,
    });
    await supabaseAdmin.from("locations").update(fields).eq("id", location.id).then(undefined, () => undefined);
    await upsertLocationClaimCode(location.id, fields);
    Object.assign(location, fields);
  }

  const name = getLocationName(location, "Untitled location");
  const image = getLocationImage(location);
  const score = getLocationScore(location);
  const publicUrl = `/locations/${location.locationType}/${location.id}`;
  const qrImage = String((location as any).claim_qr_url || (location as any).qr_code_data_url || "");
  const claimUrl = String((location as any).claim_url || (location as any).qr_link || "").replace(/https?:\/\/(www\.)?roseout\.com/gi, getCanonicalAppUrl());
  const printQrHref = `/admin/dashboard/claim-qrs?locationId=${encodeURIComponent(location.id)}`;
  const cityState =
    [val(location.city, ""), val(location.state, "")]
      .filter(Boolean)
      .join(", ") || "City/State missing";
  const claimStatus = val(location.claim_status, "Unclaimed");
  const communicationStatus = [
    "Unclaimed",
    "Contacted",
    "Claimed",
    "Active Free",
    "Upgrade Opportunity",
    "Pro",
    "Enterprise",
    "At Risk",
  ].includes(claimStatus)
    ? (claimStatus as
        | "Unclaimed"
        | "Contacted"
        | "Claimed"
        | "Active Free"
        | "Upgrade Opportunity"
        | "Pro"
        | "Enterprise"
        | "At Risk")
    : "Unclaimed";
  const reservationLink = val(location.reservation_link, "");
  const planStatus = val(
    location.crm_status || location.plan_status,
    "Starter",
  );
  const intentTags = Array.isArray(location.intent_tags)
    ? location.intent_tags
    : [];
  const tickets = (await listSupportTickets(120))
    .filter((ticket) =>
      [ticket.subject, ticket.source]
        .join(" ")
        .toLowerCase()
        .includes(location.id.toLowerCase()),
    )
    .slice(0, 8);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          {image ? (
            <img
              src={image}
              alt={name}
              className="absolute inset-0 h-full w-full object-cover opacity-20"
            />
          ) : null}
          <div className="relative z-10">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">
              Location Command Center
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">{name}</h1>
            <p className="mt-2 text-sm text-white/70">
              {val(location.category, location.locationType)} · {cityState} ·
              Rating {val(location.rating)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                `Claim: ${claimStatus}`,
                `Reservation link: ${reservationLink ? "Found" : "Missing"}`,
                `Plan: ${planStatus}`,
                `Opportunity: ${score}`,
              ].map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold"
                >
                  {b}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-black">
              <Link
                href={publicUrl}
                className="rounded-full bg-white px-5 py-2 text-black"
              >
                View Public Page
              </Link>
              <Link
                href={`/admin/dashboard/locations/edit/${location.locationType}/${location.id}`}
                className="rounded-full border border-white/15 bg-white/10 px-5 py-2"
              >
                Edit Location
              </Link>
              <button
                type="button"
                className="rounded-full border border-white/15 bg-white/10 px-5 py-2"
              >
                Copy Claim Link
              </button>
              <button
                type="button"
                className="rounded-full border border-white/15 bg-white/10 px-5 py-2"
              >
                Add Note
              </button>
            </div>
          </div>
        </header>

        <nav className="sticky top-3 z-20 overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-2 backdrop-blur">
          <div className="flex min-w-max gap-2">
            {tabs.map((tab) => (
              <a
                key={tab}
                href={`#${tab.toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-wide text-white/70 hover:text-white"
              >
                {tab}
              </a>
            ))}
          </div>
        </nav>

        <section id="overview" className="grid gap-4 lg:grid-cols-2">
          <Card title="Public preview">
            <p>{name}</p>
            <p className="mt-1 text-white/55">{cityState}</p>
            {image ? (
              <img
                src={image}
                alt={name}
                className="mt-4 h-44 w-full rounded-2xl object-cover"
              />
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-white/15 p-8 text-center">
                No image available.
              </p>
            )}
          </Card>
          <Card title="Location details">
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["Type", location.locationType],
                ["Address", val(location.address)],
                ["Phone", val(location.phone)],
                ["Website", val(location.website)],
                [
                  "Cuisine/Category",
                  val(location.cuisine || location.category),
                ],
                ["Google Place", val(location.google_place_id)],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-xs uppercase text-white/45">{k}</dt>
                  <dd className="mt-1 font-semibold text-white">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Owner / business account">
            <p>Owner User ID: {val(location.owner_user_id)}</p>
            <p className="mt-2">Claim code: {val(location.claim_code)}</p>
            <p className="mt-2">Claim status: {claimStatus}</p>
          </Card>
          <Card title="Semantic tags">
            <div className="flex flex-wrap gap-2">
              {intentTags.length ? (
                intentTags.map((tag) => (
                  <span
                    key={String(tag)}
                    className="rounded-full border border-white/20 px-2 py-1 text-xs"
                  >
                    {String(tag)}
                  </span>
                ))
              ) : (
                <p className="text-white/50">No semantic tags yet.</p>
              )}
            </div>
          </Card>
        </section>

        <section id="analytics" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Views", location.profile_views_30d || 0],
              ["Clicks", location.search_appearances_30d || 0],
              ["Saves", location.saves_30d || 0],
              ["Bookings", location.reservation_completions_30d || 0],
              [
                "Conversion Rate",
                `${Number(location.conversion_rate_30d || 0) * 100}%`,
              ],
              ["Recommendation", location.recommendation_score || 0],
              ["Quality", location.quality_score || 0],
              ["Popularity", location.popularity_score || 0],
            ].map(([label, value]) => (
              <Metric
                key={String(label)}
                label={String(label)}
                value={String(value)}
              />
            ))}
          </div>
          <Card title="Trend">
            <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-white/50">
              Analytics trend chart will appear when enough daily data exists.
            </div>
          </Card>
        </section>

        <Card id="crm" title="CRM">
          <div className="grid gap-4 md:grid-cols-2">
            <p>
              Opportunity score: <strong className="text-white">{score}</strong>
            </p>
            <p>
              Upgrade flags:{" "}
              <strong className="text-white">
                {val(location.upgrade_flags, "None")}
              </strong>
            </p>
            <p>
              Churn risk:{" "}
              <strong className="text-white">
                {val(location.churn_risk_score, "Low")}
              </strong>
            </p>
            <p>
              Last contacted:{" "}
              <strong className="text-white">
                {val(location.last_contacted_at)}
              </strong>
            </p>
            <p>
              Next follow-up:{" "}
              <strong className="text-white">
                {val(location.next_followup_at)}
              </strong>
            </p>
            <p>
              Notes:{" "}
              <strong className="text-white">{val(location.crm_notes)}</strong>
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Log call", "Schedule follow-up", "Create upgrade task"].map(
              (a) => (
                <button
                  key={a}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold"
                >
                  {a}
                </button>
              ),
            )}
          </div>
        </Card>

        <Card id="reservations" title="Reservations">
          <div className="space-y-2">
            <p>Reservation link: {reservationLink || "Missing"}</p>
            <p>
              Discovery status:{" "}
              {reservationLink ? "Discovered" : "Needs discovery"}
            </p>
            <p>Reservation link found: {reservationLink ? "Yes" : "No"}</p>
            <p>Layout items: {val(location.layout_items_count, "0")}</p>
            <p>
              Recent reservations:{" "}
              {val(location.recent_reservations, "No recent reservations")}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
              Edit Layout
            </button>
            <button className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
              Update Reservation Link
            </button>
          </div>
        </Card>

        <Card id="claim-access" title="Claim Access">
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white p-3 text-black">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt={`Claim QR code for ${name}`}
                  className="aspect-square w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-black/20 p-4 text-center text-xs font-bold text-black/45">
                  No QR image generated yet.
                </div>
              )}
              <p className="mt-2 text-center text-xs font-black uppercase tracking-[0.16em] text-black/45">
                Scan to claim
              </p>
              <p className="text-center text-sm font-black text-black">
                {val(location.claim_code)}
              </p>
            </div>
            <div>
              <p>
                Claim code:{" "}
                <strong className="text-white">
                  {val(location.claim_code)}
                </strong>
              </p>
              <p className="mt-2">
                Claim link:{" "}
                <strong className="break-all text-white">{claimUrl || "—"}</strong>
              </p>
              <p className="mt-2">
                Status: <strong className="text-white">{claimStatus}</strong>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {claimUrl ? (
                  <Link href={claimUrl} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white">
                    Open claim page
                  </Link>
                ) : null}
                <Link href={printQrHref} className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black text-white">
                  Print/download QR
                </Link>
                <Link href={`/admin/dashboard/crm/${location.id}?tab=qr-codes`} className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black text-white">
                  Open CRM QR tab
                </Link>
              </div>
            </div>
          </div>
        </Card>

        <Card id="qr-codes" title="QR Codes">
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white p-3 text-black">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt={`QR code for ${name}`}
                  className="aspect-square w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-black/20 p-4 text-center text-xs font-bold text-black/45">
                  Missing QR image
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p><b>Claim code:</b> {val(location.claim_code)}</p>
              <p className="break-all"><b>Claim URL:</b> {claimUrl || "—"}</p>
              <p><b>Stored image fields:</b> {qrImage ? "claim_qr_url / qr_code_data_url ready" : "missing"}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href={printQrHref} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white">
                  Print/download this QR
                </Link>
                <Link href="/admin/dashboard/claim-qrs" className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black text-white">
                  Open all QR codes
                </Link>
              </div>
            </div>
          </div>
        </Card>

        <section id="communication">
          <BusinessCommunicationSection
            business={{
              id: location.id,
              name,
              crm_status: communicationStatus,
            }}
          />
        </section>

        <Card id="support" title="Experience Inbox">
          <div className="space-y-2">
            {tickets.length ? (
              tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/admin/dashboard/support/${ticket.id}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <span>{ticket.subject}</span>
                  <span className="text-xs text-white/50">
                    {ticket.status || "open"}
                  </span>
                </Link>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-white/50">
                No location-related tickets found.
              </p>
            )}
          </div>
        </Card>

        <Card id="data-quality" title="Data Quality">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              [!location.semantic_search_text, "Missing semantic_search_text"],
              [intentTags.length === 0, "Missing intent_tags"],
              [
                !location.latitude || !location.longitude,
                "Missing coordinates",
              ],
              [!reservationLink, "Missing reservation link"],
              [!location.phone || !location.website, "Missing phone/website"],
              [!location.city || !location.state, "Bad city/state"],
            ].map(([bad, label]) => (
              <div
                key={String(label)}
                className={`rounded-2xl border p-3 ${bad ? "border-rose-300/40 bg-rose-500/10" : "border-emerald-300/30 bg-emerald-500/10"}`}
              >
                <p className="font-semibold text-white">{String(label)}</p>
                <button
                  type="button"
                  className="mt-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs"
                >
                  Repair
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card id="promotions" title="Promotions">
          <div className="grid gap-4 md:grid-cols-3">
            <Metric
              label="Featured outing"
              value={val(location.featured_outing_status, "Inactive")}
            />
            <Metric
              label="Promoted listing"
              value={val(location.promoted_listing_status, "Inactive")}
            />
            <Metric
              label="Campaign"
              value={val(location.campaign_status, "None")}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
              Create Featured Outing
            </button>
            <button className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
              Promote Listing
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}
