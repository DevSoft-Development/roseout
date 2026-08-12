import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";
import { getMirrorDemoLocation, tableExists } from "@/lib/demo/demo-center";
import { supabaseAdmin } from "@/lib/supabase-admin";
import DemoMessagingDraftButton from "./DemoMessagingDraftButton";
import DemoE2ESmokeButton from "./DemoE2ESmokeButton";

export const dynamic = "force-dynamic";

type ModuleState = {
  label: string;
  count: number | null;
  href: string;
  description: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

async function countRows(table: string, locationId: string) {
  if (!(await tableExists(table))) return null;
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { head: true, count: "exact" })
    .eq("location_id", locationId);
  return error ? null : count || 0;
}

async function firstActiveQrCode(locationId: string) {
  if (!(await tableExists("location_qr_codes"))) return null;
  const { data, error } = await supabaseAdmin
    .from("location_qr_codes")
    .select("code")
    .eq("location_id", locationId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return error ? null : data?.code || null;
}

function withContext(path: string, locationId: string) {
  const params = new URLSearchParams({
    adminLocationId: locationId,
    locationId,
    type: "restaurant",
    demo: "1",
    fromDemoCenter: "1",
    fromCreate: "1",
  });
  return `${path}${path.includes("?") ? "&" : "?"}${params.toString()}`;
}

export default async function TheOutHavenLoungeMirrorPage() {
  const viewer = await getInternalDemoViewer();
  if (!viewer) notFound();

  const location = await getMirrorDemoLocation();
  if (!location?.id) notFound();

  const locationId = String(location.id);
  const context = (path: string) => withContext(path, locationId);

  const [
    reservations,
    bookableItems,
    qrCodes,
    qrScans,
    analytics,
    leads,
    offers,
    offerClaims,
    vip,
    feedback,
    visitVerifications,
    notifications,
    menuItems,
    marketingGenerations,
    messagingCampaigns,
    qrCode,
  ] = await Promise.all([
    countRows("location_reservations", locationId),
    countRows("location_bookable_items", locationId),
    countRows("location_qr_codes", locationId),
    countRows("location_qr_scan_events", locationId),
    countRows("location_analytics_events", locationId),
    countRows("location_leads", locationId),
    countRows("location_offers", locationId),
    countRows("location_offer_claims", locationId),
    countRows("location_vip_signups", locationId),
    countRows("location_private_feedback", locationId),
    countRows("outing_visit_verifications", locationId),
    countRows("location_notification_events", locationId),
    countRows("location_commerce_items", locationId),
    countRows("location_marketing_generations", locationId),
    countRows("location_messaging_campaigns", locationId),
    firstActiveQrCode(locationId),
  ]);

  const modules: ModuleState[] = [
    {
      label: "Public profile preview",
      count: 1,
      href: context(`/locations/restaurant/${encodeURIComponent(locationId)}`),
      description:
        "The same location profile surface used by real venues, opened only through authenticated demo context.",
    },
    {
      label: "Reservation booking",
      count: bookableItems,
      href: context(`/reserve/location/${encodeURIComponent(locationId)}`),
      description:
        "Use the real reservation booking route, availability logic, notifications, confirmation, and analytics.",
    },
    {
      label: "Reserve operations",
      count: reservations,
      href: context("/reserve/dashboard"),
      description:
        "Calendar, reservations, seating, tables/booths, status changes, and guest operations.",
    },
    {
      label: "Location dashboard",
      count: 1,
      href: context("/locations/dashboard"),
      description:
        "The real location command center with demo location context preserved.",
    },
    {
      label: "Menu and commerce",
      count: menuItems,
      href: context("/business/dashboard/menu"),
      description:
        "Menu, commerce pages, items, pricing, availability, and guest-facing offerings.",
    },
    {
      label: "QR tools",
      count: qrCodes,
      href: context("/business/dashboard/qr-codes"),
      secondaryHref: qrCode ? `/q/${encodeURIComponent(qrCode)}` : undefined,
      secondaryLabel: qrCode ? `Run live scan · ${qrScans ?? 0} scans` : undefined,
      description:
        "Manage real QR records, then run the production QR redirect so scan events and analytics are written for the Lounge.",
    },
    {
      label: "Analytics",
      count: analytics,
      href: context("/business/dashboard/analytics"),
      description:
        "Views, engagement, reservation, QR, offer, VIP, lead, feedback, check-in, and conversion events scoped to the Lounge.",
    },
    {
      label: "Marketing and offers",
      count: (offers ?? 0) + (marketingGenerations ?? 0),
      href: context("/business/dashboard/marketing-studio"),
      secondaryHref: context(
        `/locations/restaurant/${encodeURIComponent(locationId)}/offers`,
      ),
      secondaryLabel: `Run offer claim · ${offerClaims ?? 0} claims`,
      description:
        "Generate and persist marketing drafts on the production Growth Pro path, then claim a real seeded Lounge offer through the customer flow.",
    },
    {
      label: "Event leads",
      count: leads,
      href: context("/business/dashboard/leads"),
      secondaryHref: context(
        `/locations/restaurant/${encodeURIComponent(locationId)}/events`,
      ),
      secondaryLabel: "Run event inquiry",
      description:
        "Create a private-event lead through the real customer route, with demo contacts isolated from live owner notifications.",
    },
    {
      label: "VIP",
      count: vip,
      href: context("/business/dashboard/vip"),
      secondaryHref: context(
        `/locations/restaurant/${encodeURIComponent(locationId)}/vip`,
      ),
      secondaryLabel: "Run VIP signup",
      description:
        "Review VIP relationships in the owner dashboard or run the real customer signup transaction with isolated demo contact data.",
    },
    {
      label: "Feedback and review",
      count: feedback,
      href: context(`/locations/restaurant/${encodeURIComponent(locationId)}/feedback`),
      secondaryHref: context("/business/dashboard/reviews"),
      secondaryLabel: "Open review dashboard",
      description:
        "Submit real private feedback, write analytics and notifications, then review it through the production owner surface.",
    },
    {
      label: "Check-in",
      count: visitVerifications,
      href: context(`/locations/restaurant/${encodeURIComponent(locationId)}/check-in`),
      description:
        "Run the real check-in transaction. It creates a visit verification plus analytics and a location notification instead of storing a fake feedback row.",
    },
    {
      label: "Messaging",
      count: messagingCampaigns,
      href: context("/business/dashboard/messaging"),
      description:
        "Create production campaign drafts for the Lounge. Demo drafts are hard-marked never-send and contain no recipients.",
    },
    {
      label: "Notifications",
      count: notifications,
      href: context("/business/dashboard/settings/notifications"),
      description:
        "Lead, VIP, offer, feedback, reservation, and check-in activity writes to the normal location notification stream.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#050607] px-4 pb-16 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[30px] border border-white/10 bg-gradient-to-br from-[#171016] via-[#0c0d12] to-black p-6 shadow-2xl shadow-black/30 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-300">
            Internal full-location mirror
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            TheOutHaven Lounge
          </h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/60 sm:text-base">
            This hidden fixture uses the same production location, reservation,
            dashboard, menu, QR, analytics, marketing, leads, VIP, messaging,
            check-in, feedback, and notification surfaces as a real venue. It
            remains excluded from ordinary public search and is available only
            to approved signed-in staff roles.
          </p>
          <div className="mt-5 flex flex-wrap items-start gap-3">
            <Link href="/create" className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white hover:bg-[#ff174f]">
              Search TheOutHaven Lounge
            </Link>
            <Link href="/admin/dashboard/settings/demo-center" className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white/80 hover:bg-white hover:text-black">
              Demo Center
            </Link>
            <DemoE2ESmokeButton />
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <article key={module.label} className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-black text-white">{module.label}</h2>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-white/60">
                  {module.count === null
                    ? "Not installed"
                    : module.count > 0
                      ? `${module.count} demo records`
                      : "Ready / empty"}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-white/50">
                {module.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={module.href} className="inline-flex rounded-full border border-rose-300/25 bg-rose-500/10 px-4 py-2 text-sm font-black text-rose-100 hover:bg-rose-500/20">
                  Open real flow
                </Link>
                {module.secondaryHref && module.secondaryLabel ? (
                  <Link href={module.secondaryHref} className="inline-flex rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
                    {module.secondaryLabel}
                  </Link>
                ) : null}
              </div>
              {module.label === "Messaging" ? (
                <DemoMessagingDraftButton locationId={locationId} />
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
