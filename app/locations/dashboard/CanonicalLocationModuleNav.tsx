"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Clock3,
  CreditCard,
  Globe2,
  HeartHandshake,
  LayoutDashboard,
  Map,
  Menu,
  MessageSquare,
  MessageSquareText,
  Palette,
  QrCode,
  Settings,
  Sparkles,
  Star,
  Table2,
  Tag,
  UserRound,
  Users,
  WalletCards,
  X,
  ClipboardList,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  tab?: string;
  section?: string;
};

type NavGroup = {
  label: string;
  defaultOpen: boolean;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "Essentials",
    defaultOpen: true,
    items: [
      { label: "Overview", href: "/locations/dashboard", icon: LayoutDashboard },
      { label: "Menu / Packages", href: "/business/dashboard/menu", icon: BookOpen },
      { label: "Website", href: "/locations/dashboard/website", icon: Globe2 },
      { label: "Messaging", href: "/business/dashboard/messaging", icon: MessageSquare },
      { label: "Analytics", href: "/business/dashboard/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Reservations",
    defaultOpen: true,
    items: [
      { label: "Reservation Overview", href: "/locations/dashboard/reservations", icon: CalendarClock, tab: "today" },
      { label: "Today", href: "/locations/dashboard/reservations", icon: Clock3, tab: "today" },
      { label: "Calendar", href: "/locations/dashboard/reservations", icon: CalendarDays, tab: "calendar" },
      { label: "Floor / Tables / Spaces", href: "/locations/dashboard/reservations", icon: Table2, tab: "floor" },
      { label: "Guests", href: "/locations/dashboard/reservations", icon: Users, tab: "guests" },
      { label: "Waitlist", href: "/locations/dashboard/reservations", icon: ClipboardList, tab: "waitlist" },
      { label: "Layout & Spaces", href: "/locations/dashboard/reservations", icon: Map, tab: "settings", section: "layout" },
      { label: "Hours & Capacity", href: "/locations/dashboard/reservations", icon: Clock3, tab: "settings", section: "hours" },
      { label: "Reminders", href: "/locations/dashboard/reservations", icon: MessageSquareText, tab: "settings", section: "reminders" },
      { label: "Deposits & Policies", href: "/locations/dashboard/reservations", icon: WalletCards, tab: "settings", section: "deposits" },
      { label: "Reservation Settings", href: "/locations/dashboard/reservations", icon: Settings, tab: "settings" },
    ],
  },
  {
    label: "Business setup",
    defaultOpen: false,
    items: [
      { label: "Profile", href: "/business/dashboard/profile", icon: Building2 },
      { label: "Branding", href: "/business/dashboard/branding", icon: Palette },
      { label: "Domain", href: "/locations/dashboard/domains", icon: Globe2 },
      { label: "QR Codes", href: "/business/dashboard/qr-codes", icon: QrCode },
    ],
  },
  {
    label: "Customers",
    defaultOpen: false,
    items: [
      { label: "Leads", href: "/business/dashboard/leads", icon: BriefcaseBusiness },
      { label: "Offers", href: "/business/dashboard/offers", icon: Tag },
      { label: "VIP List", href: "/business/dashboard/vip", icon: Users },
      { label: "Notifications", href: "/business/dashboard/notifications", icon: Bell },
      { label: "Reviews / Feedback", href: "/business/dashboard/reviews", icon: Star },
    ],
  },
  {
    label: "Marketing & growth",
    defaultOpen: false,
    items: [
      { label: "Marketing Studio", href: "/business/dashboard/marketing-studio", icon: Sparkles },
      { label: "Promotions", href: "/business/dashboard/promotions", icon: HeartHandshake },
    ],
  },
  {
    label: "Account",
    defaultOpen: false,
    items: [
      { label: "Billing", href: "/business/dashboard/billing", icon: CreditCard },
      { label: "Settings", href: "/business/dashboard/settings", icon: Settings },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/locations/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function buildDestination(item: NavItem, currentQuery: string) {
  const params = new URLSearchParams(currentQuery);
  if (item.tab) params.set("tab", item.tab);
  else params.delete("tab");
  if (item.section) params.set("section", item.section);
  else if (item.tab !== "settings") params.delete("section");
  const query = params.toString();
  return query ? `${item.href}?${query}` : item.href;
}

function isItemActive(pathname: string, searchParams: URLSearchParams, item: NavItem) {
  if (!isActivePath(pathname, item.href)) return false;
  if (!item.tab) return true;
  const activeTab = searchParams.get("tab") || "today";
  const activeSection = searchParams.get("section") || "layout";
  if (activeTab !== item.tab) return false;
  if (item.section) return activeSection === item.section;
  return item.label === "Reservation Overview" ? activeTab === "today" : true;
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of groups) {
      initial[group.label] = group.defaultOpen || group.items.some((item) => isActivePath(pathname, item.href));
    }
    return initial;
  });

  return (
    <>
      <div className="border-b border-white/10 px-4 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Location Workspace</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-black text-white">TheOutHaven</p>
            <p className="text-[11px] font-bold text-white/40">Business dashboard</p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-[#ff2142]/40 bg-[#e1062a]/15 text-[#ff6b86]">
            <UserRound size={15} />
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group) => {
          const containsActive = group.items.some((item) => isActivePath(pathname, item.href));
          const expanded = openGroups[group.label] || containsActive;
          return (
            <div key={group.label} className="mb-2 last:mb-0">
              <button
                type="button"
                onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !expanded }))}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-white/38 hover:bg-white/[0.04] hover:text-white/65"
                aria-expanded={expanded}
              >
                <span>{group.label}</span>
                <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded ? (
                <div className="mt-1 space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isItemActive(pathname, searchParams, item);
                    const destination = buildDestination(item, query);
                    return (
                      <Link
                        key={`${item.label}-${item.tab || "page"}-${item.section || ""}`}
                        href={destination}
                        onClick={onNavigate}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[13px] font-bold transition ${
                          active
                            ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-white"
                            : "border-transparent text-white/60 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        <Icon size={15} className={active ? "text-[#ff6b86]" : "text-white/35"} />
                        <span className="min-w-0 truncate">{item.label}</span>
                        {active ? <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff2142]" /> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}

export default function CanonicalLocationModuleNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-white/10 bg-[#06080b] text-white lg:flex">
        <SidebarContents />
      </aside>

      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-[#07090d]/95 px-4 py-3 text-white backdrop-blur-xl lg:hidden">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Location Workspace</p>
          <p className="text-sm font-black">Business dashboard</p>
        </div>
        <button
          type="button"
          aria-label="Open location workspace navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05]"
        >
          <Menu size={18} />
        </button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside className="relative flex h-full w-[min(88vw,320px)] flex-col border-r border-white/10 bg-[#06080b] text-white shadow-2xl">
            <button
              type="button"
              aria-label="Close location workspace navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/30"
            >
              <X size={17} />
            </button>
            <SidebarContents onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
