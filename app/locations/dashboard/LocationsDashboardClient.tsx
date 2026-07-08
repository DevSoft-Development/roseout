"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarClock,
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
  Megaphone,
  UserRoundCheck,
  Phone,
  MousePointer2,
  Star,
} from "lucide-react";
import { clampScore } from "@/lib/clampScore";
import { getLocationScore, type LocationScoreFields } from "@/lib/locationScore";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import { getDataStatus, isPubliclyVisible, type LocationVisibilityFields } from "@/lib/locationVisibility";
import { getClaimStatusText } from "@/lib/locationClaim";
import { getBusinessMenuEditorHref, getPublicLocationHref, getPublicLocationMenuHref } from "@/lib/locations/public-location-url";

const LOCATIONS_DASHBOARD_VERSION = "locations-dashboard-editor-visual-2026-07-08";

type LocationType = "restaurant" | "activity";
const locationTypePathSegment: Record<LocationType, "restaurants" | "activities"> = { restaurant: "restaurants", activity: "activities" };

type LocationItem = LocationScoreFields & LocationVisibilityFields & {
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

type DemoContext = { demoMode: boolean; locationId: string; type: LocationType };

type DashboardSummary = {
  locationId: string;
  reservationsToday: number;
  upcomingReservations: number;
  guestsSeated: number;
  openSpaces: number | null;
  totalReservations30d: number;
  guestsServed30d: number;
  walkIns30d: number;
  noShows30d: number;
  revenueEstimate30d: number;
  newVipSignups30d: number;
  profileViews30d: number;
  guestClicks30d: number;
  calls30d: number;
  searchesThisMonth: number;
  searchesLastMonth: number;
  searchTrendPercent: number | null;
  profileViewsThisMonth: number;
  profileViewsLastMonth: number;
  profileViewsTrendPercent: number | null;
  clickTrendPercent: number | null;
};

type Links = ReturnType<typeof getLinks>;

type TabId = "overview" | "details" | "public" | "search" | "photos" | "hours" | "menu" | "qr" | "analytics" | "marketing";

const tabs: Array<[TabId, string]> = [
  ["overview", "Overview"],
  ["details", "Details"],
  ["public", "Public Profile"],
  ["search", "Search Enhancements"],
  ["photos", "Photos"],
  ["hours", "Hours & Capacity"],
  ["menu", "Menu"],
  ["qr", "QR Codes"],
  ["analytics", "Analytics"],
  ["marketing", "Marketing"],
];

export default function LocationsDashboardClient({ locations, impersonationLabel, demoContext, summaries }: { locations: LocationItem[]; impersonationLabel?: string; demoContext?: DemoContext; summaries?: Record<string, DashboardSummary> }) {
  const [selectedId, setSelectedId] = useState(locations[0]?.id || "");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const selected = useMemo(() => locations.find((location) => location.id === selectedId) || locations[0] || null, [locations, selectedId]);
  const summary = selected ? summaries?.[selected.id] : undefined;
  const links = selected ? getLinks(selected, demoContext) : null;

  const filteredLocations = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return locations;
    return locations.filter((location) => [location.display_name, location.city, location.state, location.address, location.owner_email, getPrimaryCategory(location), ...getLocationTags(location)].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [locations, query]);

  async function stopImpersonation() {
    await fetch("/api/admin/stop-impersonation", { method: "POST" });
    window.location.href = "/admin/dashboard";
  }

  return (
    <main data-page-version={LOCATIONS_DASHBOARD_VERSION} data-demo-mode={demoContext?.demoMode ? "true" : undefined} className="min-h-screen overflow-hidden bg-[#050607] text-white [&+footer]:hidden">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar locations={filteredLocations} selected={selected} query={query} onQuery={setQuery} onSelect={setSelectedId} demoContext={demoContext} />
        <section className="min-w-0 overflow-y-auto">
          <TopBar selected={selected} links={links} query={query} onQuery={setQuery} impersonationLabel={impersonationLabel} demoContext={demoContext} onStopImpersonation={stopImpersonation} />
          <div className="border-b border-white/10 px-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1760px] gap-2 overflow-x-auto pb-3 pt-2">
              {tabs.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setActiveTab(id)} className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition ${activeTab === id ? "border-[#ff2142]/70 bg-[#e1062a]/20 text-white shadow-lg shadow-[#e1062a]/10" : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="mx-auto max-w-[1760px] px-4 py-5 sm:px-6 lg:px-8">
            <MobileLocationSwitcher locations={filteredLocations} selected={selected} onSelect={setSelectedId} />
            {demoContext?.demoMode && <DemoBanner selected={selected} links={links} />}
            {selected && links ? <DashboardPanel tab={activeTab} location={selected} summary={summary} links={links} demoMode={demoContext?.demoMode} /> : <EmptyState demoMode={demoContext?.demoMode} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardPanel({ tab, location, summary, links, demoMode }: { tab: TabId; location: LocationItem; summary?: DashboardSummary; links: Links; demoMode?: boolean }) {
  if (tab !== "overview") return <ToolWorkspace tab={tab} location={location} links={links} summary={summary} />;
  return <OverviewDashboard location={location} summary={summary} links={links} demoMode={demoMode} />;
}

function OverviewDashboard({ location, summary, links, demoMode }: { location: LocationItem; summary?: DashboardSummary; links: Links; demoMode?: boolean }) {
  const score = clampScore(getLocationScore(location));
  const reservationClicks = (location.reservation_click_count || 0) + (location.external_reservation_click_count || 0);
  const status = publicProfileStatus(location);
  return (
    <div className="space-y-5">
      <HeroPanel eyebrow="Overview" title="Business Overview" description="Live location performance from real reservations, guest actions, menu, visibility, and analytics data." action={<DatePill>{demoMode ? "Demo Data" : "Last 30 Days"}</DatePill>}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Total Reservations" value={summary?.totalReservations30d ?? 0} trend={null} />
          <KpiCard label="Guests Served" value={summary?.guestsServed30d ?? 0} trend={null} />
          <KpiCard label="Walk-ins" value={summary?.walkIns30d ?? 0} trend={null} />
          <KpiCard label="Revenue Estimate" value={currency(summary?.revenueEstimate30d ?? 0)} trend={null} />
          <KpiCard label="Review Rating" value={<span>4.7 <span className="text-amber-300">★</span></span>} note="Based on profile data" />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="New VIP Signups" value={summary?.newVipSignups30d ?? 0} icon={<Crown size={18} />} trend={null} compact />
          <KpiCard label="Profile Views" value={summary?.profileViews30d ?? location.view_count ?? 0} icon={<Eye size={18} />} trend={summary?.profileViewsTrendPercent} compact />
          <KpiCard label="Guest Clicks" value={summary?.guestClicks30d ?? location.click_count ?? 0} icon={<MousePointer2 size={18} />} trend={summary?.clickTrendPercent} compact />
          <KpiCard label="Calls" value={summary?.calls30d ?? location.call_count ?? 0} icon={<Phone size={18} />} compact />
        </div>
      </HeroPanel>

      <div className="grid gap-5 xl:grid-cols-4">
        <Panel title="Today’s Reservations" eyebrow="Live" action={<Link href={links.reservations} className="text-xs font-black text-[#ff2142]">View all</Link>}>
          <div className="mb-4 flex items-center gap-4"><IconBubble><CalendarClock size={18} /></IconBubble><div><p className="text-3xl font-black">{summary?.reservationsToday ?? 0}</p><p className="text-xs font-bold text-white/40">Today</p></div></div>
          <StackedMini rows={[["Upcoming", String(summary?.upcomingReservations ?? 0)], ["No-shows", String(summary?.noShows30d ?? 0)], ["Reservation clicks", String(reservationClicks)]]} />
          <Link href={links.reserveDashboard} className="mt-4 block text-sm font-black text-[#ff2142]">Open reserve dashboard</Link>
        </Panel>
        <Panel title="Guests Seated" eyebrow="Today">
          <div className="mb-4 flex items-center gap-4"><IconBubble><Users size={18} /></IconBubble><div><p className="text-3xl font-black">{summary?.guestsSeated ?? 0}</p><p className="text-xs font-bold text-white/40">Guests checked in or seated</p></div></div>
          <BarStrip value={summary?.guestsSeated ?? 0} max={Math.max(summary?.guestsServed30d ?? 1, 20)} />
          <Link href={links.reservations} className="mt-4 block text-sm font-black text-[#ff2142]">View seating history</Link>
        </Panel>
        <Panel title="Open Tables / Spaces" eyebrow="Available now">
          <div className="mb-4 flex items-center gap-4"><IconBubble><Grid3X3 size={18} /></IconBubble><div><p className="text-3xl font-black">{summary?.openSpaces ?? 0}</p><p className="text-xs font-bold text-white/40">{summary?.openSpaces == null ? "Layout not configured" : "Available now"}</p></div></div>
          <StackedMini rows={[["Top tables", "Open layout"], ["Standard spaces", "Manage capacity"], ["Booths / lanes", "Configure"]]} />
          <Link href={links.layout} className="mt-4 block text-sm font-black text-[#ff2142]">View floor plan</Link>
        </Panel>
        <Panel title="Upcoming Reservations" eyebrow="Next 7 days">
          <div className="mb-4 flex items-center gap-4"><IconBubble><CalendarClock size={18} /></IconBubble><div><p className="text-3xl font-black">{summary?.upcomingReservations ?? 0}</p><p className="text-xs font-bold text-white/40">Future bookings</p></div></div>
          <StackedMini rows={[["Today", String(summary?.reservationsToday ?? 0)], ["Next 7 days", String(summary?.upcomingReservations ?? 0)], ["Open calendar", "Reserve"]]} />
          <Link href={links.reserveDashboard} className="mt-4 block text-sm font-black text-[#ff2142]">View calendar</Link>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Panel title="Location Status" eyebrow="Profile strength">
          <div className="grid gap-5 lg:grid-cols-[1fr_180px] lg:items-center">
            <div><div className="mb-4 flex items-center gap-3"><IconBubble good><ShieldCheck size={18} /></IconBubble><div><p className={`text-xl font-black ${status.tone === "good" ? "text-emerald-300" : "text-amber-300"}`}>{status.label}</p><p className="text-sm font-semibold text-white/45">{status.detail}</p></div></div><CheckRows location={location} links={links} /></div>
            <ProgressDial value={score} label="Profile Strength" />
          </div>
        </Panel>
        <Panel title="Search Visibility" eyebrow="Guest discovery" action={<Link href={links.analytics} className="text-xs font-black text-[#ff2142]">View full analytics</Link>}>
          <div className="grid gap-5 xl:grid-cols-[1fr_150px] xl:items-center">
            <div><div className="mb-5 flex items-center gap-3"><IconBubble good><Search size={18} /></IconBubble><div><p className="text-xl font-black text-emerald-300">{summary?.searchesThisMonth ? "High Visibility" : "Visibility Ready"}</p><p className="text-sm font-semibold text-white/45">Search cards use live analytics when connected.</p></div></div><div className="grid gap-3 sm:grid-cols-4"><Metric label="Search Appearances" value={summary?.searchesThisMonth ?? 0} note={trendText(summary?.searchTrendPercent)} /><Metric label="Profile Views" value={summary?.profileViews30d ?? 0} note={trendText(summary?.profileViewsTrendPercent)} /><Metric label="Guest Clicks" value={summary?.guestClicks30d ?? 0} note={trendText(summary?.clickTrendPercent)} /><Metric label="Directions Clicks" value={summary?.calls30d ?? 0} note="Live actions" /></div></div>
            <ProgressDial value={Math.min(100, Math.max(0, score - 4))} label="Visibility Score" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ToolWorkspace({ tab, location, links, summary }: { tab: TabId; location: LocationItem; links: Links; summary?: DashboardSummary }) {
  const map: Record<TabId, { title: string; description: string; href: string; label: string; icon: ReactNode }> = {
    overview: { title: "Overview", description: "Business overview", href: links.dashboard, label: "Open", icon: <LayoutDashboard size={20} /> },
    details: { title: "Details", description: "Edit business information, address, phone, website, category, and profile copy.", href: links.edit, label: "Open editor", icon: <Settings size={20} /> },
    public: { title: "Public Profile", description: "Preview and update the guest-facing profile for this location.", href: links.publicPage, label: "Public preview", icon: <Eye size={20} /> },
    search: { title: "Search Enhancements", description: "Improve how guests find this location in TheOutHaven search.", href: `${links.edit}#search-enhancements`, label: "Improve search", icon: <Search size={20} /> },
    photos: { title: "Photos", description: "Manage cover photos and gallery images.", href: `${links.edit}#photos`, label: "Manage photos", icon: <ImagePlus size={20} /> },
    hours: { title: "Hours & Capacity", description: "Manage opening hours, reservation windows, and capacity.", href: links.hours, label: "Edit hours", icon: <SlidersHorizontal size={20} /> },
    menu: { title: "Menu", description: "Manage menu sections, item images, pricing, availability, and public menu status.", href: links.menu, label: "Open menu editor", icon: <Utensils size={20} /> },
    qr: { title: "QR Codes", description: "Create and manage QR codes for profiles, menus, reservations, and campaigns.", href: links.qr, label: "Open QR tools", icon: <QrCode size={20} /> },
    analytics: { title: "Analytics", description: "Review profile views, reservation actions, clicks, calls, and search performance.", href: links.analytics, label: "Open analytics", icon: <BarChart3 size={20} /> },
    marketing: { title: "Marketing", description: "Create campaigns, copy, offers, and growth content for this location.", href: links.marketing, label: "Open marketing", icon: <Megaphone size={20} /> },
  };
  const item = map[tab];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <HeroPanel eyebrow={item.title} title={item.title} description={item.description} action={<Link href={item.href} className="rounded-2xl bg-[#ff2142] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#ff1654]/25">{item.label}</Link>}>
        <div className="grid gap-4 md:grid-cols-3"><ActionTile icon={item.icon} label={item.label} href={item.href} /><ActionTile icon={<ExternalLink size={20} />} label="Public Preview" href={links.publicPage} /><ActionTile icon={<CalendarClock size={20} />} label="Reserve Dashboard" href={links.reserveDashboard} /></div>
      </HeroPanel>
      <Panel title={location.display_name} eyebrow="Selected location"><LocationSnapshot location={location} summary={summary} links={links} /></Panel>
    </div>
  );
}

function Sidebar({ locations, selected, query, onQuery, onSelect, demoContext }: { locations: LocationItem[]; selected: LocationItem | null; query: string; onQuery: (value: string) => void; onSelect: (id: string) => void; demoContext?: DemoContext }) {
  const links = selected ? getLinks(selected, demoContext) : null;
  const nav = links ? ([
    ["Overview", links.dashboard, LayoutDashboard],
    ["Reservations", links.reservations, CalendarClock],
    ["Guests & Walk-ins", links.vip, Users],
    ["Waitlist", links.reservations, UserRoundCheck],
    ["Menu", links.menu, Utensils],
    ["Photos", links.photos, ImagePlus],
    ["Hours & Capacity", links.hours, SlidersHorizontal],
    ["QR Codes", links.qr, QrCode],
    ["Analytics", links.analytics, BarChart3],
    ["Marketing", links.marketing, Megaphone],
    ["Settings", links.settings, Settings],
  ] as const) : [];
  return (
    <aside className="hidden min-h-screen overflow-hidden border-r border-white/10 bg-[#06080b] p-4 lg:flex lg:flex-col">
      <div className="mb-7 flex items-center gap-3 px-2"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#ff2142]/60 bg-[#e1062a]/20 text-[#ff2142]"><span className="text-lg font-black">R</span></div><div><p className="text-lg font-black">TheOutHaven</p><p className="text-xs font-bold text-white/40">Locations Dashboard</p></div></div>
      {locations.length > 1 ? <div className="mb-4 rounded-3xl border border-white/10 bg-white/[0.035] p-3"><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-2"><Search size={15} className="text-white/35" /><input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search locations..." className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-white/35" /></div><div className="mt-3 max-h-44 space-y-2 overflow-auto pr-1">{locations.map((location) => <button key={location.id} type="button" onClick={() => onSelect(location.id)} className={`w-full rounded-2xl px-3 py-2 text-left text-xs font-black ${selected?.id === location.id ? "bg-[#e1062a]/20 text-white" : "bg-white/[0.04] text-white/60 hover:text-white"}`}>{location.display_name}<span className="block font-semibold text-white/35">{cityState(location)}</span></button>)}</div></div> : null}
      <p className="mb-2 px-3 text-xs font-black uppercase tracking-[0.18em] text-white/30">Manage</p>
      <nav className="space-y-1 overflow-y-auto pr-1">{nav.map(([label, href, Icon], index) => <Link key={label} href={href} className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-bold transition ${index === 0 ? "border border-[#ff2142]/45 bg-[#e1062a]/20 text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"}`}><span className="flex items-center gap-3"><Icon size={16} className="text-[#ff6b86]" />{label}</span>{index === 0 ? <span className="h-2 w-2 rounded-full bg-[#ff2142]" /> : null}</Link>)}</nav>
      <div className="mt-auto space-y-3 pt-5"><p className="px-3 text-xs font-black uppercase tracking-[0.18em] text-white/30">Quick Actions</p>{links ? <div className="space-y-2"><QuickAction href={links.publicPage} label="Public Preview" /><QuickAction href={links.menu} label="Open Menu Editor" /><QuickAction href={links.reserveDashboard} label="Reserve Dashboard" /><QuickAction href={links.marketing} label="Marketing Center" /><QuickAction href={links.qr} label="Create QR Code" /></div> : null}<PlanCard location={selected} demoContext={demoContext} /></div>
    </aside>
  );
}

function TopBar({ selected, links, query, onQuery, impersonationLabel, demoContext, onStopImpersonation }: { selected: LocationItem | null; links: Links | null; query: string; onQuery: (value: string) => void; impersonationLabel?: string; demoContext?: DemoContext; onStopImpersonation: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#050607]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="min-w-0"><p className="truncate text-xs font-black uppercase tracking-[0.25em] text-white/35">Locations Dashboard</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="truncate text-2xl font-black tracking-tight md:text-3xl">{selected?.display_name || "Locations Dashboard"}</h1><StatusPill tone={isPubliclyVisible(selected || {}) ? "good" : "warn"}>{isPubliclyVisible(selected || {}) ? "Live" : "Review"}</StatusPill>{links ? <Link href={links.edit} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/70 hover:bg-white/[0.1]">Edit</Link> : null}</div><p className="mt-2 text-sm font-semibold text-white/50">{selected ? `${selected.address || cityState(selected) || "Address pending"} · ${categoryLine(selected)}` : "Overview of location performance and tools"}</p>{impersonationLabel ? <p className="mt-1 text-xs font-bold text-rose-200">{impersonationLabel}</p> : null}</div>
        <div className="flex flex-wrap items-center gap-2"><div className="hidden min-w-[320px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 md:flex"><Search size={16} className="text-white/35" /><input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search locations, reservations, guests..." className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-white/35" /></div>{links ? <><Link href={links.publicPage} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black hover:bg-white/[0.08]">Public Preview ↗</Link><Link href={links.publicMenu} className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-100 hover:bg-emerald-400/15">Open Menu ↗</Link><Link href={links.reserveDashboard} className="rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2 text-sm font-black text-white shadow-lg shadow-[#ff1654]/25">Reserve Dashboard ↗</Link></> : null}{impersonationLabel && !demoContext?.demoMode ? <button onClick={onStopImpersonation} className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black">Stop Viewing</button> : null}</div>
      </div>
    </header>
  );
}

function HeroPanel({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action?: ReactNode; children: ReactNode }) { return <section className="rounded-[28px] border border-white/10 bg-gradient-to-br from-[#111722] via-[#0c1119] to-[#080a0f] p-5 shadow-2xl shadow-black/25"><div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">{eyebrow}</p><h2 className="mt-2 text-2xl font-black">{title}</h2><p className="mt-1 max-w-3xl text-sm font-semibold text-white/50">{description}</p></div>{action}</div>{children}</section>; }
function Panel({ title, eyebrow, action, children }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode }) { return <section className="rounded-[24px] border border-white/10 bg-gradient-to-br from-[#101721] to-[#0a0d13] p-5 shadow-2xl shadow-black/20"><div className="mb-4 flex items-start justify-between gap-3"><div>{eyebrow ? <p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-white/35">{eyebrow}</p> : null}<h3 className="text-lg font-black">{title}</h3></div>{action}</div>{children}</section>; }
function KpiCard({ label, value, trend, note, icon, compact }: { label: string; value: ReactNode; trend?: number | null; note?: string; icon?: ReactNode; compact?: boolean }) { const hasTrend = trend != null; return <div className={`rounded-2xl border border-white/10 bg-black/20 p-4 ${compact ? "min-h-[108px]" : "min-h-[146px]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/40">{label}</p><p className="mt-3 text-2xl font-black">{value}</p>{hasTrend ? <p className={`mt-1 text-xs font-black ${trend! >= 0 ? "text-emerald-300" : "text-amber-300"}`}>{trend! >= 0 ? "↑" : "↓"} {Math.abs(trend!)}% vs previous period</p> : <p className="mt-1 text-xs font-semibold text-white/35">{note || "Live data"}</p>}</div>{icon ? <span className="grid h-10 w-10 place-items-center rounded-full bg-[#7c3aed]/20 text-purple-200">{icon}</span> : null}</div>{!compact ? <div className="mt-4">{hasTrend ? <SparkLine positive={trend! >= 0} /> : <div className="rounded-xl border border-dashed border-white/10 px-3 py-2 text-xs font-bold text-white/30">Trend appears once prior-period data exists</div>}</div> : null}</div>; }
function SparkLine({ positive }: { positive: boolean }) { return <div className="flex h-8 items-end gap-1">{[3, 6, 5, 8, 6, 9, 7, 10, 8, 12, 9, 11].map((h, i) => <span key={i} className={`flex-1 rounded-t ${positive ? "bg-[#ff2142]" : "bg-amber-400"}`} style={{ height: `${h * 2}px` }} />)}</div>; }
function IconBubble({ children, good }: { children: ReactNode; good?: boolean }) { return <span className={`grid h-11 w-11 place-items-center rounded-2xl ${good ? "bg-emerald-400/10 text-emerald-200" : "bg-[#e1062a]/18 text-[#ff9bb6]"}`}>{children}</span>; }
function Metric({ label, value, note }: { label: string; value: ReactNode; note?: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p><p className="mt-1 text-xl font-black">{value}</p>{note ? <p className="mt-1 text-xs font-semibold text-white/35">{note}</p> : null}</div>; }
function StackedMini({ rows }: { rows: Array<[string, string]> }) { return <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/15">{rows.map(([a, b]) => <div key={a} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span className="font-semibold text-white/55">{a}</span><span className="font-black text-white/80">{b}</span></div>)}</div>; }
function BarStrip({ value, max }: { value: number; max: number }) { const bars = [14, 22, 12, 28, 18, 35, 20, 42, 30, 16, 24, 10]; const scale = Math.max(1, max); return <div className="flex h-28 items-end gap-1 rounded-2xl border border-white/10 bg-black/15 p-3">{bars.map((bar, index) => <span key={index} className="flex-1 rounded-t bg-[#ff2142]" style={{ height: `${Math.max(8, Math.min(100, ((bar + value) / (scale + 42)) * 100))}%` }} />)}</div>; }
function ProgressDial({ value, label }: { value: number; label: string }) { return <div className="mx-auto grid h-36 w-36 place-items-center rounded-full border-[10px] border-emerald-400/70 bg-emerald-400/10"><div className="text-center"><p className="text-3xl font-black">{value}%</p><p className="text-xs font-bold text-white/45">{label}</p></div></div>; }
function CheckRows({ location, links }: { location: LocationItem; links: Links }) { const checks = [["Profile information complete", Boolean(location.display_name && (location.address || location.city))], ["Photos uploaded", Boolean(getLocationImage(location) || location.images?.length)], ["Hours configured", hasHours(location)], ["Menu is connected", Boolean(location.menu_url || links.menu)]] as const; return <div className="space-y-2">{checks.map(([label, ok]) => <div key={label} className="flex items-center gap-2 text-sm font-semibold text-white/65"><span className={`h-5 w-5 rounded-full ${ok ? "bg-emerald-400/20 text-emerald-300" : "bg-amber-400/20 text-amber-300"}`}>{ok ? "✓" : "!"}</span>{label}</div>)}</div>; }
function ActionTile({ icon, label, href }: { icon: ReactNode; label: string; href: string }) { return <Link href={href} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-[#ff2142]/50 hover:bg-[#e1062a]/10"><span className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[#e1062a]/18 text-[#ff9bb6]">{icon}</span><p className="font-black">{label}</p><p className="mt-2 text-xs font-bold text-white/35">Open tool ↗</p></Link>; }
function DatePill({ children }: { children: ReactNode }) { return <span className="rounded-2xl border border-white/10 bg-black/25 px-4 py-2 text-xs font-black text-white/70">{children}</span>; }
function StatusPill({ children, tone = "good" }: { children: ReactNode; tone?: "good" | "warn" }) { return <span className={`rounded-full border px-3 py-1 text-xs font-black ${tone === "good" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>{children}</span>; }
function QuickAction({ href, label }: { href: string; label: string }) { return <Link href={href} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-black text-white/70 hover:bg-white/[0.07] hover:text-white"><span>{label}</span><ExternalLink size={14} /></Link>; }
function PlanCard({ location, demoContext }: { location: LocationItem | null; demoContext?: DemoContext }) { return <div className="rounded-3xl border border-[#ff2142]/30 bg-[#e1062a]/10 p-4"><p className="text-xs font-black uppercase tracking-wider text-white/35">Plan</p><p className="mt-2 text-sm font-black text-[#ff6b86]">{location ? planName(location) : "Free Discovery"}</p><p className="mt-1 text-xs font-semibold text-white/40">{demoContext?.demoMode ? "Demo mode" : "Status from billing settings"}</p>{!demoContext?.demoMode ? <Link href="/business#plans" className="mt-3 block rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-center text-xs font-black">Manage Plan</Link> : null}</div>; }
function LocationSnapshot({ location, summary, links }: { location: LocationItem; summary?: DashboardSummary; links: Links }) { return <div className="space-y-4"><div className="overflow-hidden rounded-2xl bg-white/5">{getLocationImage(location) ? <img src={getLocationImage(location) || undefined} alt={location.display_name} className="h-44 w-full object-cover" /> : <div className="grid h-44 place-items-center"><Store className="text-white/25" size={42} /></div>}</div><div><h3 className="text-2xl font-black">{location.display_name}</h3><p className="mt-1 text-sm font-semibold text-white/45">{categoryLine(location)}</p></div><StackedMini rows={[["Address", location.address || cityState(location) || "Not configured"], ["Profile", publicProfileStatus(location).label], ["Reservations", String(summary?.totalReservations30d ?? 0)], ["Claim", getClaimStatusText(location)]]} /><div className="grid grid-cols-2 gap-2"><QuickAction href={links.edit} label="Edit" /><QuickAction href={links.publicPage} label="Public" /></div></div>; }
function DemoBanner({ selected, links }: { selected: LocationItem | null; links: Links | null }) { return <section className="mb-4 rounded-3xl border border-rose-300/20 bg-rose-500/10 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-100">Demo Mode</p><p className="mt-1 text-sm font-bold text-white/72">You are viewing {selected?.display_name || "the demo location"} as a location owner.</p></div><div className="flex flex-wrap gap-2"><Link href="/admin/dashboard/settings/demo-center" className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-black">Return to Demo Center</Link>{links ? <Link href={links.publicPage} className="rounded-2xl border border-white/10 px-4 py-2 text-xs font-black text-white/80">Open Public Profile</Link> : null}</div></div></section>; }
function MobileLocationSwitcher({ locations, selected, onSelect }: { locations: LocationItem[]; selected: LocationItem | null; onSelect: (id: string) => void }) { return <div className="mb-4 rounded-3xl border border-white/10 bg-[#10141b] p-3 lg:hidden"><div className="mb-2 flex items-center gap-2 text-sm font-black"><Menu size={16} />Location</div><select value={selected?.id || ""} onChange={(e) => onSelect(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/40 p-3 text-sm font-bold">{locations.map((l) => <option key={l.id} value={l.id}>{l.display_name}</option>)}</select></div>; }
function EmptyState({ demoMode }: { demoMode?: boolean }) { return <div className="grid min-h-[560px] place-items-center rounded-[32px] border border-white/10 bg-[#10141b] p-8 text-center"><div><Store className="mx-auto mb-4 text-white/25" size={52} /><h2 className="text-3xl font-black">{demoMode ? "Demo location unavailable" : "No connected locations yet"}</h2><p className="mx-auto mt-2 max-w-md text-white/50">{demoMode ? "Return to Demo Center and refresh demo data." : "Claim or connect a location to manage profile tools, reservations, QR codes, guests, and analytics."}</p></div></div>; }
function withDemoParams(href: string, demoContext?: DemoContext) { if (!demoContext?.demoMode) return href; const [base, hash] = href.split("#"); const params = new URLSearchParams({ adminLocationId: demoContext.locationId, locationId: demoContext.locationId, type: demoContext.type, demo: "1", fromDemoCenter: "1" }); return `${base}${base.includes("?") ? "&" : "?"}${params.toString()}${hash ? `#${hash}` : ""}`; }
function getLinks(location: LocationItem, demoContext?: DemoContext) { const type = locationTypePathSegment[location.location_type]; const links = { dashboard: "/locations/dashboard", publicPage: getPublicLocationHref(location), publicMenu: getPublicLocationMenuHref(location), edit: `/locations/${type}/${location.id}/edit`, qr: "/business/dashboard/qr-codes", layout: "/reserve/dashboard/location-layout", menu: getBusinessMenuEditorHref(location.id, demoContext?.demoMode ? "demo" : "location"), photos: "/business/dashboard/profile", vip: "/business/dashboard/vip", analytics: "/business/dashboard/analytics", hours: "/reserve/dashboard/location-layout", team: "/business/dashboard/settings", settings: "/business/dashboard/settings", messages: "/business/dashboard/messaging", reservations: "/reserve/dashboard/reservations", reserveDashboard: "/reserve/dashboard", billing: "/business/dashboard/billing", marketing: "/business/dashboard/marketing" }; return Object.fromEntries(Object.entries(links).map(([key, href]) => [key, withDemoParams(href, demoContext)])) as typeof links; }
function publicProfileStatus(location: Partial<LocationItem>) { if (isPubliclyVisible(location as any)) return { label: "All Good", tone: "good", detail: "Your location profile is complete and visible." }; const isHidden = Boolean((location as any).is_hidden); const searchable = Boolean((location as any).is_searchable); const tier = String((location as any).public_visibility_tier || "").toLowerCase(); if (isHidden || tier === "hidden") return { label: "Hidden", tone: "warning", detail: "This profile is hidden from public search." }; if (!searchable) return { label: "Not searchable yet", tone: "warning", detail: "Complete missing profile items to make this location searchable." }; return { label: "Needs review", tone: "warning", detail: "This profile needs a quick review before it goes live." }; }
function trendText(value: number | null | undefined) { if (value == null) return "No prior month data"; if (value === 0) return "Even with last month"; const direction = value > 0 ? "↑" : "↓"; return `${direction} ${Math.abs(value)}% vs last month`; }
function currency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function cityState(location: Partial<LocationItem>) { return [location.city, location.state].filter(Boolean).join(", "); }
function isPro(location: LocationItem) { const raw = String(location.subscription_plan || location.plan || "").toLowerCase(); return Boolean(location.is_pro) || raw.includes("pro") || raw.includes("partner"); }
function planName(location: LocationItem) { return isPro(location) ? "Reserve Pro" : "Free Discovery"; }
function categoryLine(location: LocationItem) { const tags = [getPrimaryCategory(location), ...getLocationTags(location).slice(0, 2)].filter(Boolean); return tags.length ? tags.join(" · ") : location.location_type === "restaurant" ? "Restaurant" : "Activity"; }
function hasHours(location: LocationItem) { const settings = location.reservation_settings || {}; return Boolean(settings.hours || settings.weekly_hours || location.hours); }
