import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getDemoCenterOverview, tableExists } from "@/lib/demo/demo-center";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";
import * as actions from "./actions";
import DemoActionButton from "./DemoActionButton";

export const dynamic = "force-dynamic";

type ModuleState = "Ready" | "Needs setup" | "Demo only" | "Not installed" | "Warning";

type ToolCard = {
  title: string;
  description: string;
  href?: string;
  label: string;
  status: ModuleState;
};

function human(value: any, fallback = "No data yet") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function countLabel(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Not installed"
    : value > 0
      ? value.toLocaleString()
      : "No data yet";
}

function statusFor(count?: number | null): ModuleState {
  return count === null || count === undefined ? "Not installed" : count > 0 ? "Ready" : "Needs setup";
}

function statusClass(status: string) {
  if (status === "Ready") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (status === "Warning") return "border-amber-300/35 bg-amber-400/10 text-amber-100";
  if (status === "Demo only") return "border-[#ff2142]/35 bg-[#e1062a]/15 text-rose-100";
  if (status === "Not installed") return "border-white/10 bg-white/[0.04] text-white/45";
  return "border-rose-300/25 bg-rose-500/10 text-rose-100";
}

function demoType(loc: any) {
  const value = String(loc?.location_type || loc?.type || loc?.primary_category || loc?.category || "restaurant").toLowerCase();
  return value === "activity" || value === "activities" ? "activity" : "restaurant";
}

function withDemoContext(path: string, locationId?: string, type = "restaurant") {
  if (!locationId) return undefined;
  const params = new URLSearchParams({
    adminLocationId: locationId,
    locationId,
    type,
    demo: "1",
    fromDemoCenter: "1",
  });
  return `${path}${path.includes("?") ? "&" : "?"}${params.toString()}`;
}

function Submit({
  action,
  label,
  hidden,
  variant = "outline",
}: {
  action: any;
  label: string;
  hidden?: Record<string, string>;
  variant?: "primary" | "outline" | "danger" | "compact" | "ghost";
}) {
  return <DemoActionButton action={action} label={label} hidden={hidden} variant={variant} />;
}

async function fetchRows(table: string, locationId?: string, limit = 8) {
  try {
    if (!locationId || !(await tableExists(table))) return null;
    const { data, error } = await supabaseAdmin.from(table).select("*").eq("location_id", locationId).limit(limit);
    return error ? null : data || [];
  } catch {
    return null;
  }
}

function Badge({ children, status = "Ready" }: { children: React.ReactNode; status?: string }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${statusClass(status)}`}>{children}</span>;
}

function CommandCard({ title, eyebrow, children, action }: { title: string; eyebrow?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-gradient-to-br from-[#101721] to-[#0a0d13] p-5 shadow-2xl shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? <p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-white/35">{eyebrow}</p> : null}
          <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LaunchLink({ href, children, primary = false }: { href?: string; children: React.ReactNode; primary?: boolean }) {
  if (!href) {
    return <span className="inline-flex rounded-2xl border border-dashed border-white/10 px-4 py-2.5 text-xs font-black text-white/40">Refresh demo data to unlock</span>;
  }
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-[#ff1654]/25 hover:brightness-110"
          : "inline-flex rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white/75 hover:border-[#ff2142]/45 hover:bg-[#e1062a]/10 hover:text-white"
      }
    >
      {children}
    </Link>
  );
}

function StatCard({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      {note ? <p className="mt-1 text-xs font-semibold text-white/35">{note}</p> : null}
    </div>
  );
}

function ToolLaunchCard({ tool }: { tool: ToolCard }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-white">{tool.title}</h3>
          <p className="mt-1 text-sm font-semibold leading-5 text-white/45">{tool.description}</p>
        </div>
        <Badge status={tool.status}>{tool.status}</Badge>
      </div>
      <div className="mt-4">
        <LaunchLink href={tool.href}>{tool.label}</LaunchLink>
      </div>
    </div>
  );
}

export default async function DemoCenterPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);

  const overview = await getDemoCenterOverview();
  const loc = overview.location;
  const locationId = loc?.id as string | undefined;
  const locationName = getLocationName(loc, "Demo business");
  const locationType = demoType(loc);
  const demoHref = (path: string) => withDemoContext(path, locationId, locationType);
  const publicProfile = locationId
    ? demoHref("/admin/dashboard/settings/demo-center/public-profile")
    : overview.links.find((l) => l.label === "Public Profile")?.href;
  const crmHref = overview.links.find((l) => l.label === "Admin CRM")?.href;
  const publicWarning = overview.publicSearchExposed;

  const [reservations, qrCodes, leads, offers, vip, notifications, feedback, analytics, branding, pages, items] = await Promise.all([
    fetchRows("location_reservations", locationId, 30),
    fetchRows("location_qr_codes", locationId),
    fetchRows("location_leads", locationId),
    fetchRows("location_offers", locationId),
    fetchRows("location_vip_signups", locationId),
    fetchRows("location_notification_events", locationId),
    fetchRows("location_private_feedback", locationId),
    fetchRows("location_analytics_events", locationId, 50),
    fetchRows("location_branding_settings", locationId),
    fetchRows("location_commerce_pages", locationId),
    fetchRows("location_commerce_items", locationId),
  ]);

  const dashboardHref = demoHref("/locations/dashboard");
  const editHref = loc?.location_type === "activity" || loc?.location_type === "activities"
    ? demoHref(`/locations/activities/${locationId}/edit`)
    : demoHref(`/locations/restaurants/${locationId}/edit`);

  const profileItems = [
    ["Location name", locationName],
    ["Category/type", loc?.primary_category || loc?.category || loc?.location_type || loc?.type],
    ["Address", [loc?.address, loc?.city, loc?.state].filter(Boolean).join(", ")],
    ["Phone", loc?.phone],
    ["Website", loc?.website],
    ["Market", loc?.market || loc?.city],
  ];

  const tools: ToolCard[] = [
    {
      title: "Open Location Dashboard",
      description: "Launch the new owner command center with demo/admin location context preserved.",
      href: dashboardHref,
      label: "Open dashboard",
      status: loc ? "Ready" : "Needs setup",
    },
    {
      title: "Edit Profile",
      description: "Open the edit-only Location Editor for profile, search fields, photos, and hours.",
      href: editHref,
      label: "Edit profile",
      status: loc ? "Ready" : "Needs setup",
    },
    {
      title: "Reserve Dashboard",
      description: "Open reservations, calendar, seating, layout, and guest handling for this demo location.",
      href: demoHref("/reserve/dashboard"),
      label: "Open reserve",
      status: statusFor(reservations?.length),
    },
    {
      title: "Menu Editor",
      description: "Open the business menu editor with sections, item images, prices, and availability.",
      href: demoHref("/business/dashboard/menu"),
      label: "Open menu editor",
      status: statusFor((pages?.length || 0) + (items?.length || 0)),
    },
    {
      title: "QR Codes",
      description: "Open demo-scoped QR tools for profile, menu, reservations, VIP, and offers.",
      href: demoHref("/business/dashboard/qr-codes"),
      label: "Open QR tools",
      status: statusFor(qrCodes?.length),
    },
    {
      title: "Analytics",
      description: "Review guest actions and demo analytics events for the selected location.",
      href: demoHref("/business/dashboard/analytics"),
      label: "Open analytics",
      status: statusFor(analytics?.length),
    },
    {
      title: "Marketing Center",
      description: "Open demo-safe marketing, offers, campaign copy, and growth tools.",
      href: demoHref("/business/dashboard/marketing-studio"),
      label: "Open marketing",
      status: statusFor((offers?.length || 0) + (leads?.length || 0)),
    },
    {
      title: "Admin CRM",
      description: "Review the admin-side CRM profile without confusing it with the owner dashboard.",
      href: crmHref || undefined,
      label: "Open CRM",
      status: crmHref ? "Ready" : "Needs setup",
    },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050607] px-4 pb-16 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1760px] space-y-6">
        <section className={`rounded-[28px] border p-4 shadow-2xl shadow-black/20 ${publicWarning ? "border-amber-300/40 bg-amber-500/10" : "border-white/10 bg-white/[0.035]"}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Demo Center</p>
              <p className="mt-1 text-sm font-bold text-white/70">
                Admin launcher for the demo location. This page controls demo data and sends you into the new Location Dashboard.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge status={publicWarning ? "Warning" : loc ? "Ready" : "Needs setup"}>{publicWarning ? "Public Exposure Warning" : loc ? "Demo Ready" : "Needs Demo Location"}</Badge>
                <Badge status="Demo only">Admin launcher, not owner dashboard</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Submit action={actions.createOrRefreshMirrorDemoAction} label="Refresh Demo Data" variant="primary" />
              <Submit action={actions.createDemoReservationAction} label="Create Test Reservation" variant="outline" />
              <Submit action={actions.runDemoEmailTestAction} label="Send Test Email" variant="outline" />
              <Submit action={actions.resetMirrorDemoAction} label="Reset Demo Data" variant="danger" />
            </div>
          </div>
        </section>

        <header className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.26),transparent_34%),linear-gradient(135deg,rgba(17,23,34,0.98),rgba(8,10,15,0.98))] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">TheOutHaven Demo Location</p>
              <h1 className="mt-3 max-w-5xl text-4xl font-black tracking-[-0.05em] text-white sm:text-6xl">Launch the location dashboard experience</h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-6 text-white/62">
                Demo Center now matches the dark/red dashboard system while staying a launcher. The owner-style KPIs and Business Overview live inside the Location Dashboard.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-black text-white/70">
                <span className="rounded-full bg-white/10 px-3 py-2">{locationName}</span>
                <span className="rounded-full bg-white/10 px-3 py-2">{human(loc?.primary_category || loc?.category || loc?.location_type, "Category needs setup")}</span>
                <span className="rounded-full bg-white/10 px-3 py-2">{human(loc?.market || loc?.city, "Market needs setup")}</span>
                <span className="rounded-full bg-rose-500/15 px-3 py-2 text-rose-100">Demo account</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <LaunchLink href={dashboardHref} primary>Open Location Dashboard</LaunchLink>
              <LaunchLink href={editHref}>Edit Profile</LaunchLink>
              {publicProfile ? <LaunchLink href={publicProfile}>Public Profile</LaunchLink> : null}
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <StatCard label="Demo Location" value={loc ? "Ready" : "Needs setup"} note="Location context" />
          <StatCard label="Reservations" value={countLabel(reservations?.length)} note="Demo rows" />
          <StatCard label="Menu Items" value={countLabel(items?.length)} note="Commerce items" />
          <StatCard label="QR Codes" value={countLabel(qrCodes?.length)} note="Location scoped" />
          <StatCard label="VIP Signups" value={countLabel(vip?.length)} note="Demo only" />
          <StatCard label="Analytics" value={countLabel(analytics?.length)} note="Tracked events" />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
          <CommandCard title="Launch tools" eyebrow="Dashboard flow" action={<LaunchLink href={dashboardHref}>Owner Dashboard</LaunchLink>}>
            <div className="grid gap-3 md:grid-cols-2">
              {tools.map((tool) => <ToolLaunchCard key={tool.title} tool={tool} />)}
            </div>
          </CommandCard>

          <div className="space-y-6">
            <CommandCard title="Selected demo location" eyebrow="Context">
              <div className="space-y-3">
                {profileItems.map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p>
                    <p className="mt-1 text-sm font-black text-white">{human(value, "Needs setup")}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {crmHref ? <LaunchLink href={crmHref}>Open CRM</LaunchLink> : null}
                {publicProfile ? <LaunchLink href={publicProfile}>Open public profile</LaunchLink> : null}
              </div>
            </CommandCard>

            <CommandCard title="Demo data controls" eyebrow="Safe actions">
              <p className="mb-4 text-sm font-semibold leading-6 text-white/55">
                Use these controls to rebuild the demo dataset, test email delivery, create a test reservation, or reset the demo back to a clean state.
              </p>
              <div className="flex flex-wrap gap-2">
                <Submit action={actions.createOrRefreshMirrorDemoAction} label="Refresh Demo Data" variant="primary" />
                <Submit action={actions.createDemoReservationAction} label="Create Test Reservation" variant="outline" />
                <Submit action={actions.runDemoEmailTestAction} label="Send Test Email" variant="outline" />
                <Submit action={actions.resetMirrorDemoAction} label="Reset Demo Data" variant="danger" />
              </div>
            </CommandCard>
          </div>
        </div>

        <CommandCard title="Module readiness" eyebrow="Demo coverage">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Profile", loc ? "Ready" : "Needs setup", "Core identity for the demo owner experience."],
              ["Branding / Photos", statusFor(branding?.length), "Hero and media readiness for the demo location."],
              ["Menu", statusFor((pages?.length || 0) + (items?.length || 0)), "Menu page and item records."],
              ["Reservations", statusFor(reservations?.length), "Demo reservation rows and actions."],
              ["QR Codes", statusFor(qrCodes?.length), "QR tools and location-scoped codes."],
              ["Leads", statusFor(leads?.length), "Lead capture and follow-up records."],
              ["Offers", statusFor(offers?.length), "Demo-safe promotions."],
              ["Notifications", statusFor(notifications?.length), "Demo notification rows."],
              ["Reviews / Feedback", statusFor(feedback?.length), "Private feedback data."],
              ["Analytics", statusFor(analytics?.length), "Tracked demo events."],
            ].map(([label, status, text]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-white">{label}</b>
                  <Badge status={status as string}>{status}</Badge>
                </div>
                <p className="mt-2 text-xs font-semibold leading-5 text-white/45">{text}</p>
              </div>
            ))}
          </div>
        </CommandCard>
      </div>
    </main>
  );
}
