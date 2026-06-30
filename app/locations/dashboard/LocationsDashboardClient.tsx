"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  CalendarClock,
  ChevronDown,
  CircleHelp,
  Crown,
  ExternalLink,
  Eye,
  Grid3X3,
  ImagePlus,
  LayoutDashboard,
  Menu,
  MessageSquare,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Users,
  Utensils,
} from "lucide-react";
import { clampScore } from "@/lib/clampScore";
import {
  getLocationScore,
  type LocationScoreFields,
} from "@/lib/locationScore";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import {
  getDataStatus,
  getPublicVisibilityWarning,
  isPubliclyVisible,
  type LocationVisibilityFields,
} from "@/lib/locationVisibility";
import { getClaimStatusText } from "@/lib/locationClaim";

const LOCATIONS_DASHBOARD_VERSION = "locations-dashboard-enterprise-2026-06-30";

type LocationType = "restaurant" | "activity";

const locationTypePathSegment: Record<
  LocationType,
  "restaurants" | "activities"
> = {
  restaurant: "restaurants",
  activity: "activities",
};

type LocationItem = LocationScoreFields &
  LocationVisibilityFields & {
    id: string;
    location_type: LocationType;
    display_name: string;
    name?: string | null;
    restaurant_name?: string | null;
    activity_name?: string | null;
    address?: string;
    city?: string;
    state?: string;
    main_image?: string | null;
    image_url?: string | null;
    images?: string[] | null;
    is_claimed?: boolean | null;
    claimed?: boolean | null;
    claim_status?: string | null;
    claim_verification_status?: string | null;
    owner_user_id?: string | null;
    owner_name?: string;
    owner_email?: string;
    owner_phone?: string;
    phone?: string | null;
    website?: string | null;
    reservation_url?: string | null;
    external_reservation_url?: string | null;
    reservation_link?: string | null;
    plan?: string | null;
    subscription_plan?: string | null;
    is_pro?: boolean | null;
    view_count?: number | null;
    click_count?: number | null;
    call_count?: number | null;
    reservation_click_count?: number | null;
    external_reservation_click_count?: number | null;
    reservation_settings?: Record<string, unknown> | null;
    primary_category?: string | null;
    cuisine?: string | null;
    cuisine_type?: string | null;
    food_type?: string | null;
    activity_type?: string | null;
    primary_tag?: string | null;
    tags?: string[] | null;
    google_types?: string[] | null;
    menu_url?: string | null;
    hours?: unknown;
  };

type DemoContext = {
  demoMode: boolean;
  locationId: string;
  type: LocationType;
};

type Links = ReturnType<typeof getLinks>;

export default function LocationsDashboardClient({
  locations,
  impersonationLabel,
  demoContext,
}: {
  locations: LocationItem[];
  impersonationLabel?: string;
  demoContext?: DemoContext;
}) {
  const [selectedId, setSelectedId] = useState(locations[0]?.id || "");
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () =>
      locations.find((location) => location.id === selectedId) ||
      locations[0] ||
      null,
    [locations, selectedId],
  );

  const filteredLocations = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return locations;
    return locations.filter((location) =>
      [
        location.display_name,
        location.city,
        location.state,
        location.address,
        location.owner_email,
        getPrimaryCategory(location),
        ...getLocationTags(location),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [locations, query]);

  async function stopImpersonation() {
    await fetch("/api/admin/stop-impersonation", { method: "POST" });
    window.location.href = "/admin/dashboard";
  }

  return (
    <main
      data-page-version={LOCATIONS_DASHBOARD_VERSION}
      data-demo-mode={demoContext?.demoMode ? "true" : undefined}
      className="min-h-screen bg-[#07090d] text-white"
    >
      <div className="flex min-h-screen">
        <Sidebar
          locations={filteredLocations}
          selected={selected}
          query={query}
          onQuery={setQuery}
          onSelect={setSelectedId}
          demoContext={demoContext}
        />
        <section className="min-w-0 flex-1 lg:pl-[320px]">
          <TopBar
            selected={selected}
            query={query}
            onQuery={setQuery}
            impersonationLabel={impersonationLabel}
            onStopImpersonation={stopImpersonation}
            demoContext={demoContext}
          />
          <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
            <MobileLocationSwitcher
              locations={filteredLocations}
              selected={selected}
              onSelect={setSelectedId}
            />
            {demoContext?.demoMode && (
              <DemoBanner selected={selected} demoContext={demoContext} />
            )}
            {selected ? (
              <DashboardContent location={selected} demoContext={demoContext} />
            ) : (
              <EmptyState demoMode={demoContext?.demoMode} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function DemoBanner({
  selected,
  demoContext,
}: {
  selected: LocationItem | null;
  demoContext: DemoContext;
}) {
  const links = selected ? getLinks(selected, demoContext) : null;

  return (
    <section className="mb-4 rounded-3xl border border-rose-300/20 bg-rose-500/10 p-4 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-100">
            Demo Mode
          </p>
          <p className="mt-1 text-sm font-bold text-white/72">
            You are viewing the demo location as a location owner. Billing and
            production actions are disabled.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/dashboard/settings/demo-center"
            className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-black"
          >
            Return to Demo Center
          </Link>
          {links?.publicPage ? (
            <Link
              href={links.publicPage}
              className="rounded-2xl border border-white/10 px-4 py-2 text-xs font-black text-white/80 hover:bg-white/10"
            >
              Open Public Profile
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DashboardContent({
  location,
  demoContext,
}: {
  location: LocationItem;
  demoContext?: DemoContext;
}) {
  const links = getLinks(location, demoContext);
  const reservationClicks =
    location.reservation_click_count ||
    location.external_reservation_click_count ||
    0;
  const score = clampScore(getLocationScore(location));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={<CalendarClock size={18} />}
          label="Today’s Reservations"
          value="0"
          note="No activity yet"
        />
        <StatCard
          icon={<Users size={18} />}
          label="Guests Seated"
          value="0"
          note="No seating data"
        />
        <StatCard
          icon={<Grid3X3 size={18} />}
          label="Open Tables / Spaces"
          value="0"
          note="Layout not configured"
        />
        <StatCard
          icon={<CalendarClock size={18} />}
          label="Upcoming Reservations"
          value={reservationClicks}
          note="Tracked interest"
        />
        <StatCard
          icon={<ShieldCheck size={18} />}
          label="Location Status"
          value={isPubliclyVisible(location) ? "Public" : "Review"}
          note={getDataStatus(location)}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
        <LocationOverviewCard location={location} links={links} />
        <LocationHealthCard location={location} score={score} links={links} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr_0.9fr]">
        <QuickToolsCard links={links} />
        <TodaySnapshotCard />
        <HoursCapacityCard location={location} links={links} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <BusinessOverviewCard location={location} />
        <TeamAccessCard location={location} links={links} />
      </div>

      <ReservationToolsCard location={location} links={links} />
    </div>
  );
}

function Sidebar({
  locations,
  selected,
  query,
  onQuery,
  onSelect,
  demoContext,
}: {
  locations: LocationItem[];
  selected: LocationItem | null;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  demoContext?: DemoContext;
}) {
  const links = selected ? getLinks(selected, demoContext) : null;
  const nav = links
    ? ([
        ["Dashboard", links.dashboard, LayoutDashboard],
        ["Reservations", links.reservations, CalendarClock],
        ["Layout & Spaces", links.layout, Grid3X3],
        ["QR Booking Tools", links.qr, QrCode],
        ["Guests & VIP", links.vip, Users],
        ["Menus & Photos", links.menu, Utensils],
        ["Hours & Capacity", links.hours, SlidersHorizontal],
        ["Analytics", links.analytics, BarChart3],
        ["Team Access", links.team, ShieldCheck],
        ["Settings", links.settings, Settings],
        ["Billing", links.billing, Crown],
      ] as const)
    : [];
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[320px] border-r border-white/10 bg-[#090b10] p-4 lg:block">
      <div className="mb-5 flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e1062a]">
          <Sparkles size={20} />
        </div>
        <div>
          <p className="text-lg font-black">TheOutHaven</p>
          <p className="text-xs font-bold text-white/40">Owner Console</p>
        </div>
      </div>
      <div className="rounded-3xl border border-white/10 bg-[#121721] p-3">
        {selected ? (
          <LocationMini location={selected} />
        ) : (
          <p className="p-3 text-sm font-bold text-white/45">
            No location selected
          </p>
        )}
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
          <Search size={15} className="text-white/35" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search anything..."
            className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-white/35"
          />
        </div>
        {locations.length > 1 && (
          <div className="mt-3 max-h-44 space-y-2 overflow-auto pr-1">
            {locations.map((location) => (
              <button
                key={location.id}
                onClick={() => onSelect(location.id)}
                className={`w-full rounded-2xl px-3 py-2 text-left text-xs font-black ${selected?.id === location.id ? "bg-[#e1062a]/20 text-white" : "bg-white/[0.04] text-white/60 hover:text-white"}`}
              >
                {location.display_name}
                <span className="block font-semibold text-white/35">
                  {cityState(location)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <nav className="mt-5 space-y-1">
        {nav.map(([label, href, Icon]) => (
          <Link
            key={label}
            href={href}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold text-white/58 hover:bg-white/[0.06] hover:text-white"
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="absolute bottom-4 left-4 right-4 space-y-3">
        <PlanCard location={selected} demoContext={demoContext} />
        <Link
          href={withDemoParams("/help", demoContext)}
          className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black hover:bg-white/[0.08]"
        >
          <span className="flex items-center gap-2">
            <CircleHelp size={16} />
            Get Help
          </span>
          <ExternalLink size={14} />
        </Link>
        <button className="w-full rounded-2xl border border-white/10 py-2 text-xs font-bold text-white/35">
          Collapse sidebar
        </button>
      </div>
    </aside>
  );
}

function TopBar({
  selected,
  query,
  onQuery,
  impersonationLabel,
  onStopImpersonation,
  demoContext,
}: {
  selected: LocationItem | null;
  query: string;
  onQuery: (value: string) => void;
  impersonationLabel?: string;
  onStopImpersonation: () => void;
  demoContext?: DemoContext;
}) {
  const links = selected ? getLinks(selected, demoContext) : null;
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#07090d]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            Locations Dashboard
          </h1>
          <p className="text-sm font-medium text-white/45">
            Overview of your location performance and tools
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden min-w-[280px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 md:flex">
            <Search size={16} className="text-white/35" />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search anything..."
              className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-white/35"
            />
          </div>
          <button className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 text-white/60">
            <Bell size={18} />
          </button>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-xs font-black">
              {selected?.owner_name || "Owner"}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
              {selected?.owner_user_id ? "Owner" : "Location Admin"}
            </p>
          </div>
          {links && (
            <>
              <Link
                href={links.publicPage}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black hover:bg-white/[0.08]"
              >
                View Public Page
              </Link>
              <Link
                href={links.edit}
                className="rounded-2xl bg-[#e1062a] px-4 py-2 text-sm font-black text-white hover:bg-[#ff2142]"
              >
                Edit Location
              </Link>
            </>
          )}
          {impersonationLabel && !demoContext?.demoMode && (
            <button
              onClick={onStopImpersonation}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black"
            >
              Stop Viewing as Location
            </button>
          )}
        </div>
        {impersonationLabel && (
          <p className="text-xs font-black text-rose-200 lg:hidden">
            {impersonationLabel}
          </p>
        )}
      </div>
    </header>
  );
}

function LocationOverviewCard({
  location,
  links,
}: {
  location: LocationItem;
  links: Links;
}) {
  const category = categoryLine(location);
  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#10141b]">
      <div className="grid md:grid-cols-[230px_1fr]">
        <div className="h-56 bg-white/5 md:h-full">
          {getLocationImage(location) ? (
            <img
              src={getLocationImage(location) || undefined}
              alt={location.display_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Store className="text-white/25" size={42} />
            </div>
          )}
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex gap-2">
                <Badge>{location.location_type}</Badge>
                {isPro(location) && <Badge red>Pro</Badge>}
              </div>
              <h2 className="text-3xl font-black">{location.display_name}</h2>
              <p className="mt-2 font-semibold text-white/45">{category}</p>
            </div>
            <Link
              href={links.publicPage}
              className="rounded-2xl border border-white/10 px-3 py-2 text-xs font-black text-white/65 hover:text-white"
            >
              <Eye size={15} className="inline" /> Public
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info
              label="Address"
              value={
                location.address || cityState(location) || "Not configured"
              }
            />
            <Info label="Phone" value={location.phone || "Not configured"} />
            <Info
              label="Public profile"
              value={
                isPubliclyVisible(location)
                  ? "Live"
                  : getPublicVisibilityWarning(location).join(", ") ||
                    "Not configured"
              }
            />
            <Info label="Claim status" value={getClaimStatusText(location)} />
            <Info label="Plan" value={planName(location)} />
            <Info label="Data status" value={getDataStatus(location)} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={links.edit}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black"
            >
              Edit Location
            </Link>
            <Link
              href={links.publicPage}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-black"
            >
              View Public Page
            </Link>
            <Link
              href={links.settings}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-black text-white/65"
            >
              More Actions
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function LocationHealthCard({
  location,
  score,
  links,
}: {
  location: LocationItem;
  score: number;
  links: Links;
}) {
  const checks = [
    ["Bookings", hasReservations(location)],
    ["QR Codes", true],
    ["Hours", hasHours(location)],
    ["Photos", Boolean(getLocationImage(location) || location.images?.length)],
    ["Menu", Boolean(location.menu_url || location.website)],
  ] as const;
  return (
    <Card
      title="Location Health"
      action={
        <Link href={links.edit} className="text-xs font-black text-[#e1062a]">
          Fix Missing Items
        </Link>
      }
    >
      <div className="flex items-center gap-5">
        <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full border-8 border-[#e1062a] bg-black/30">
          <div className="text-center">
            <p className="text-3xl font-black">{score}</p>
            <p className="text-xs text-white/40">ready</p>
          </div>
        </div>
        <div className="w-full space-y-3">
          {checks.map(([label, done]) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-3 py-2"
            >
              <span className="text-sm font-bold text-white/70">{label}</span>
              <span className={done ? "text-emerald-300" : "text-amber-300"}>
                {done ? "Ready" : "Missing"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function QuickToolsCard({ links }: { links: Links }) {
  const tools = [
    ["QR Booking Tools", links.qr, QrCode],
    ["Layout Builder", links.layout, Grid3X3],
    ["Manage Menus", links.menu, Utensils],
    ["Add Photos", links.photos, ImagePlus],
    ["VIP Signups", links.vip, Crown],
    ["Send Message", links.messages, MessageSquare],
  ] as const;
  return (
    <Card title="Quick Tools">
      {" "}
      <div className="grid grid-cols-2 gap-2">
        {tools.map(([label, href, Icon]) => (
          <Link
            key={label}
            href={href}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 hover:bg-white/[0.07]"
          >
            <Icon size={18} className="mb-3 text-[#e1062a]" />
            <p className="text-sm font-black">{label}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
function TodaySnapshotCard() {
  return (
    <Card title="Today’s Snapshot">
      <Metric label="Reservations" value="0" />
      <Metric label="Walk-ins" value="0" />
      <Metric label="No Shows" value="0" />
      <Metric
        label="Revenue estimate"
        value="$0"
        note="Connect Reserve for live revenue"
      />
    </Card>
  );
}
function BusinessOverviewCard({ location }: { location: LocationItem }) {
  return (
    <Card title="Business Overview" eyebrow="Last 30 days">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total Reservations" value="0" />
        <Metric label="Guests Served" value="0" />
        <Metric label="Walk-ins" value="0" />
        <Metric label="Revenue Estimate" value="$0" />
        <Metric label="Review Rating" value="Not configured" />
        <Metric label="New VIP Signups" value="0" />
        <Metric label="Profile views" value={location.view_count || 0} />
        <Metric label="Guest clicks" value={location.click_count || 0} />
        <Metric label="Calls" value={location.call_count || 0} />
      </div>
    </Card>
  );
}
function HoursCapacityCard({
  location,
  links,
}: {
  location: LocationItem;
  links: Links;
}) {
  return (
    <Card
      title="Hours & Capacity"
      action={
        <Link href={links.hours} className="text-xs font-black text-[#e1062a]">
          Edit Hours
        </Link>
      }
    >
      <Metric label="Today’s hours" value={hoursText(location)} />
      <Metric
        label="Open / Closed"
        value={hasHours(location) ? "Configured" : "Hours not configured"}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Total Capacity" value="0" />
        <Metric label="In Use" value="0" />
        <Metric label="Available" value="0" />
        <Metric label="Waitlist" value="0" />
      </div>
    </Card>
  );
}
function TeamAccessCard({
  location,
  links,
}: {
  location: LocationItem;
  links: Links;
}) {
  return (
    <Card
      title="Team Access"
      action={
        <Link href={links.team} className="text-xs font-black text-[#e1062a]">
          Manage Team
        </Link>
      }
    >
      <Metric
        label="Location Admin"
        value={
          location.owner_email
            ? maskEmail(location.owner_email)
            : "Not configured"
        }
      />
      <Metric label="Reservation Manager" value="Not configured" />
      <Metric label="View Only User" value="Not configured" />
      <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm font-semibold text-white/45">
        Team permissions are ready to configure. No saved permissions are shown
        until a team member is added.
      </p>
    </Card>
  );
}
function ReservationToolsCard({
  location,
  links,
}: {
  location: LocationItem;
  links: Links;
}) {
  return (
    <Card
      title="Reservations"
      eyebrow="Reservation center tools stay connected without taking over your owner dashboard"
    >
      <div className="grid gap-3 md:grid-cols-4">
        <ToolLink href={links.reservations} label="View Reservations" />
        <ToolLink
          href={links.reserveDashboard}
          label="Open Reservation Center"
        />
        <ToolLink href={links.layout} label="Open Layout Builder" />
        <ToolLink href={links.qr} label="QR Booking Tools" />
      </div>
      <p className="mt-4 break-all text-xs font-semibold text-white/35">
        Embed URL: https://theouthaven.com/embed/reservations/{location.id}
      </p>
    </Card>
  );
}

function EmptyState({ demoMode }: { demoMode?: boolean }) {
  return (
    <div className="grid min-h-[560px] place-items-center rounded-[32px] border border-white/10 bg-[#10141b] p-8 text-center">
      <div>
        <Store className="mx-auto mb-4 text-white/25" size={52} />
        <h2 className="text-3xl font-black">
          {demoMode ? "Demo location unavailable" : "No connected locations yet"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-white/50">
          {demoMode
            ? "The demo owner dashboard could not load the demo location. Return to Demo Center and refresh demo data."
            : "Claim or connect a location to manage profile tools, reservations, QR codes, guests, and analytics."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {demoMode ? (
            <Link
              href="/admin/dashboard/settings/demo-center"
              className="rounded-2xl bg-[#e1062a] px-5 py-3 font-black"
            >
              Return to Demo Center
            </Link>
          ) : (
            <>
              <Link
                href="/business/claim"
                className="rounded-2xl bg-[#e1062a] px-5 py-3 font-black"
              >
                Claim a location
              </Link>
              <Link
                href="/help"
                className="rounded-2xl border border-white/10 px-5 py-3 font-black"
              >
                Get help
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function MobileLocationSwitcher({
  locations,
  selected,
  onSelect,
}: {
  locations: LocationItem[];
  selected: LocationItem | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-4 rounded-3xl border border-white/10 bg-[#10141b] p-3 lg:hidden">
      <div className="mb-2 flex items-center gap-2 text-sm font-black">
        <Menu size={16} />
        Location
      </div>
      <select
        value={selected?.id || ""}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-black/40 p-3 text-sm font-bold"
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Card({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#10141b] p-5 shadow-2xl shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-white/35">
              {eyebrow}
            </p>
          )}
          <h3 className="text-lg font-black">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function StatCard({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  note: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#10141b] p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-2xl bg-[#e1062a]/15 p-2 text-[#e1062a]">
          {icon}
        </span>
        <span className="text-xs font-bold text-white/30">Live</span>
      </div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-semibold text-white/35">{note}</p>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-base font-black">{value}</p>
      {note && (
        <p className="mt-1 text-xs font-semibold text-white/35">{note}</p>
      )}
    </div>
  );
}
function ToolLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black hover:border-[#e1062a]/50 hover:bg-[#e1062a]/10"
    >
      {label}
      <ExternalLink size={14} className="mt-3 text-white/35" />
    </Link>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[11px] font-black uppercase tracking-wider text-white/35">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-white/75">{value}</p>
    </div>
  );
}
function Badge({ children, red }: { children: ReactNode; red?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${red ? "bg-[#e1062a] text-white" : "bg-white/10 text-white/70"}`}
    >
      {children}
    </span>
  );
}
function LocationMini({ location }: { location: LocationItem }) {
  return (
    <div className="flex gap-3">
      <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white/10">
        {getLocationImage(location) ? (
          <img
            src={getLocationImage(location) || undefined}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Store size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black">{location.display_name}</p>
        <p className="text-xs font-semibold text-white/40">
          {cityState(location) || "Location details"}
        </p>
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-black text-white/45">
          Switch location <ChevronDown size={13} />
        </p>
      </div>
    </div>
  );
}
function PlanCard({
  location,
  demoContext,
}: {
  location: LocationItem | null;
  demoContext?: DemoContext;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#121721] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-white/35">
          Plan
        </p>
        {location && isPro(location) && (
          <span className="rounded-full bg-[#e1062a] px-2 py-0.5 text-[10px] font-black">
            PRO
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-black">
        {location ? planName(location) : "Free Discovery"}
      </p>
      <p className="mt-1 text-xs font-semibold text-white/35">
        Status available from billing settings.
      </p>
      <Link
        href={withDemoParams("/business#plans", demoContext)}
        aria-disabled={demoContext?.demoMode ? "true" : undefined}
        className={`mt-3 block rounded-2xl px-3 py-2 text-center text-xs font-black ${
          demoContext?.demoMode
            ? "border border-white/10 bg-white/10 text-white/45"
            : "bg-white text-black"
        }`}
      >
        {demoContext?.demoMode ? "Demo only" : "Manage Plan"}
      </Link>
    </div>
  );
}
function withDemoParams(href: string, demoContext?: DemoContext) {
  if (!demoContext?.demoMode) return href;
  const [base, hash] = href.split("#");
  const params = new URLSearchParams({
    adminLocationId: demoContext.locationId,
    locationId: demoContext.locationId,
    type: demoContext.type,
    demo: "1",
    fromDemoCenter: "1",
  });
  return `${base}${base.includes("?") ? "&" : "?"}${params.toString()}${
    hash ? `#${hash}` : ""
  }`;
}

function getLinks(location: LocationItem, demoContext?: DemoContext) {
  const type = locationTypePathSegment[location.location_type];
  const links = {
    dashboard: "/locations/dashboard",
    publicPage: `/locations/${type}/${location.id}`,
    edit: `/locations/${type}/${location.id}/edit`,
    qr: "/business/dashboard/qr-codes",
    layout: "/reserve/dashboard/location-layout",
    menu: "/business/dashboard/menu",
    photos: "/business/dashboard/profile",
    vip: "/business/dashboard/vip",
    analytics: "/business/dashboard/analytics",
    hours: "/reserve/dashboard/location-layout",
    team: "/business/dashboard/settings",
    settings: "/business/dashboard/settings",
    messages: "/business/dashboard/messaging",
    reservations: "/reserve/dashboard/reservations",
    reserveDashboard: "/reserve/dashboard",
    billing: "/business/dashboard/billing",
  };

  return Object.fromEntries(
    Object.entries(links).map(([key, href]) => [
      key,
      withDemoParams(href, demoContext),
    ]),
  ) as typeof links;
}
function cityState(location: LocationItem) {
  return [location.city, location.state].filter(Boolean).join(", ");
}
function isPro(location: LocationItem) {
  const raw = String(
    location.subscription_plan || location.plan || "",
  ).toLowerCase();
  return (
    Boolean(location.is_pro) || raw.includes("pro") || raw.includes("partner")
  );
}
function planName(location: LocationItem) {
  return isPro(location) ? "Partner Plan" : "Free Discovery";
}
function categoryLine(location: LocationItem) {
  const tags = [
    getPrimaryCategory(location),
    ...getLocationTags(location).slice(0, 2),
  ].filter(Boolean);
  return tags.length
    ? tags.join(" · ")
    : location.location_type === "restaurant"
      ? "Restaurant"
      : "Activity";
}
function hasReservations(location: LocationItem) {
  return Boolean(
    location.reservation_url ||
    location.external_reservation_url ||
    location.reservation_link ||
    Object.keys(location.reservation_settings || {}).length,
  );
}
function hasHours(location: LocationItem) {
  const settings = location.reservation_settings || {};
  return Boolean(
    getSettingValue(settings, "hours") ||
    getSettingValue(settings, "weekly_hours") ||
    location.hours,
  );
}
function hoursText(location: LocationItem) {
  return hasHours(location) ? "Configured" : "Hours not configured";
}
function getSettingValue(settings: Record<string, unknown>, key: string) {
  return settings[key];
}
function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return name && domain ? `${name[0]}***@${domain}` : email;
}
