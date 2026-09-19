"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Globe2,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MessageSquareText,
  Settings,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  matches?: string[];
};

const dailyItems: NavItem[] = [
  { label: "Overview", href: "/locations/dashboard", icon: LayoutDashboard },
  { label: "Reservations", href: "/locations/dashboard/reservations", icon: CalendarDays, matches: ["/locations/dashboard/reservations/large-group-bookings"] },
  { label: "Events & Experiences", href: "/locations/dashboard/events-experiences", icon: CalendarDays },
  { label: "Messaging", href: "/locations/dashboard/messaging", icon: MessageSquare },
  { label: "Customers", href: "/locations/dashboard/customers", icon: Users, matches: ["/locations/dashboard/leads", "/locations/dashboard/offers", "/locations/dashboard/vip", "/locations/dashboard/notifications"] },
  { label: "Profile", href: "/locations/dashboard/profile", icon: Building2 },
];

const advancedItems: NavItem[] = [
  { label: "Menu / Packages", href: "/locations/dashboard/menu", icon: BookOpen },
  { label: "Website", href: "/locations/dashboard/website", icon: Globe2 },
  { label: "Marketing & Growth", href: "/locations/dashboard/marketing-growth", icon: Sparkles, matches: ["/locations/dashboard/marketing-studio", "/locations/dashboard/social-accounts", "/locations/dashboard/promotions"] },
  { label: "Analytics", href: "/locations/dashboard/analytics", icon: BarChart3 },
  { label: "Reviews / Feedback", href: "/locations/dashboard/reviews", icon: Star },
  { label: "Business Setup", href: "/locations/dashboard/business-setup", icon: Settings, matches: ["/locations/dashboard/branding", "/locations/dashboard/domains", "/locations/dashboard/qr-codes"] },
  { label: "Reservation Settings", href: "/locations/dashboard/reservations/settings", icon: Settings },
  { label: "Billing & Payments", href: "/locations/dashboard/billing", icon: CreditCard },
  { label: "Support", href: "/locations/dashboard/support", icon: MessageSquareText },
  { label: "Settings", href: "/locations/dashboard/settings", icon: Settings },
];

function pathMatches(pathname: string, href: string) {
  return href === "/locations/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function isItemActive(pathname: string, item: NavItem) {
  return pathMatches(pathname, item.href) || Boolean(item.matches?.some((href) => pathMatches(pathname, href)));
}

function buildDestination(item: NavItem, currentQuery: string) {
  const params = new URLSearchParams(currentQuery);
  params.delete("tab");
  params.delete("section");
  params.delete("host");
  const query = params.toString();
  return query ? `${item.href}?${query}` : item.href;
}

function NavLink({ item, pathname, query, onNavigate }: { item: NavItem; pathname: string; query: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  const active = isItemActive(pathname, item);
  return (
    <Link
      href={buildDestination(item, query)}
      onClick={onNavigate}
      className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-[13px] font-bold transition ${active ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-white" : "border-transparent text-white/60 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"}`}
    >
      <Icon size={16} className={active ? "text-[#ff6b86]" : "text-white/35"} />
      <span className="min-w-0 truncate">{item.label}</span>
      {active ? <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff2142]" /> : null}
    </Link>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const advancedActive = advancedItems.some((item) => isItemActive(pathname, item));
  const [advancedOpen, setAdvancedOpen] = useState(advancedActive);

  return (
    <>
      <div className="shrink-0 border-b border-white/10 px-4 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Location Workspace</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black text-white">TheOutHaven</p>
            <p className="text-[11px] font-bold text-white/40">Business dashboard</p>
          </div>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#ff2142]/40 bg-[#e1062a]/15 text-[#ff6b86]"><Building2 size={15} /></span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-8 [scrollbar-gutter:stable]" aria-label="Location workspace navigation">
        <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Daily workspace</p>
        <div className="space-y-0.5">
          {dailyItems.map((item) => <NavLink key={item.href} item={item} pathname={pathname} query={query} onNavigate={onNavigate} />)}
        </div>

        <div className="mt-4 border-t border-white/8 pt-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((current) => !current)}
            className="flex min-h-10 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-white/38 hover:bg-white/[0.04] hover:text-white/65"
            aria-expanded={advancedOpen || advancedActive}
          >
            <span>Advanced</span>
            <ChevronDown size={14} className={`transition-transform ${advancedOpen || advancedActive ? "rotate-180" : ""}`} />
          </button>
          {advancedOpen || advancedActive ? (
            <div className="mt-1 space-y-0.5">
              {advancedItems.map((item) => <NavLink key={item.href} item={item} pathname={pathname} query={query} onNavigate={onNavigate} />)}
            </div>
          ) : null}
        </div>
      </nav>
    </>
  );
}

function TabletRail({ openNavigation }: { openNavigation: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  return (
    <aside className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center overflow-hidden border-r border-white/10 bg-[#06080b] py-4 text-white md:flex xl:hidden">
      <button type="button" onClick={openNavigation} aria-label="Open location workspace navigation" className="mb-4 grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-white"><Menu size={19} /></button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 [scrollbar-gutter:stable]">
        <div className="flex flex-col items-center gap-2">
          {dailyItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item);
            return (
              <Link key={item.href} href={buildDestination(item, query)} title={item.label} aria-label={item.label} className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition ${active ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-[#ff6b86]" : "border-transparent text-white/40 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"}`}>
                <Icon size={19} />
              </Link>
            );
          })}
          <button type="button" onClick={openNavigation} title="Advanced" aria-label="Open advanced business tools" className="mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/40 hover:bg-white/[0.05] hover:text-white"><Settings size={19} /></button>
        </div>
      </div>
    </aside>
  );
}

export default function CanonicalLocationModuleNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchParams = useSearchParams();
  if (searchParams.get("host") === "1") return null;

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#06080b] text-white xl:flex"><SidebarContents /></aside>
      <TabletRail openNavigation={() => setMobileOpen(true)} />
      <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open location workspace navigation" className="fixed left-3 top-[4.65rem] z-[70] grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-[#090b0e]/95 text-white shadow-xl shadow-black/35 backdrop-blur-xl md:hidden"><Menu size={19} /></button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setMobileOpen(false); }}>
          <aside className="flex h-full w-[min(88vw,340px)] flex-col overflow-hidden border-r border-white/10 bg-[#06080b] text-white shadow-2xl shadow-black/60">
            <div className="flex items-center justify-end border-b border-white/10 px-3 py-2 md:hidden"><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white"><X size={18} /></button></div>
            <SidebarContents onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
