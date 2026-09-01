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
  CalendarDays,
  ChevronDown,
  Clock3,
  CreditCard,
  Globe2,
  HeartHandshake,
  LayoutDashboard,
  Map,
  Maximize2,
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
  host?: boolean;
};
type NavGroup = { label: string; defaultOpen: boolean; items: NavItem[] };
type SearchReader = { get(name: string): string | null };

const groups: NavGroup[] = [
  {
    label: "Essentials",
    defaultOpen: true,
    items: [
      { label: "Overview", href: "/locations/dashboard", icon: LayoutDashboard },
      { label: "Events & Experiences", href: "/locations/dashboard/events-experiences", icon: CalendarDays },
      { label: "Menu / Packages", href: "/locations/dashboard/menu", icon: BookOpen },
      { label: "Website", href: "/locations/dashboard/website", icon: Globe2 },
      { label: "Messaging", href: "/locations/dashboard/messaging", icon: MessageSquare },
      { label: "Analytics", href: "/locations/dashboard/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Reservations",
    defaultOpen: true,
    items: [
      { label: "Host View", href: "/locations/dashboard/reservations", icon: Maximize2, tab: "today", host: true },
      { label: "Today", href: "/locations/dashboard/reservations", icon: Clock3, tab: "today" },
      { label: "Calendar", href: "/locations/dashboard/reservations", icon: CalendarDays, tab: "calendar" },
      { label: "Floor / Tables / Spaces", href: "/locations/dashboard/reservations", icon: Table2, tab: "floor" },
      { label: "Guests", href: "/locations/dashboard/reservations", icon: Users, tab: "guests" },
      { label: "Waitlist", href: "/locations/dashboard/reservations", icon: ClipboardList, tab: "waitlist" },
      { label: "Large Group Bookings", href: "/locations/dashboard/reservations/large-group-bookings", icon: Users },
      { label: "Reservation Settings", href: "/locations/dashboard/reservations/settings", icon: Settings },
      { label: "Layout & Spaces", href: "/locations/dashboard/reservations/settings", icon: Map, section: "layout" },
      { label: "Hours & Capacity", href: "/locations/dashboard/reservations/settings", icon: Clock3, section: "hours" },
      { label: "Reminders", href: "/locations/dashboard/reservations/settings", icon: MessageSquareText, section: "reminders" },
      { label: "Policies & Guarantees", href: "/locations/dashboard/reservations/settings", icon: WalletCards, section: "policies" },
    ],
  },
  {
    label: "Business setup",
    defaultOpen: false,
    items: [
      { label: "Profile", href: "/locations/dashboard/profile", icon: Building2 },
      { label: "Branding", href: "/locations/dashboard/branding", icon: Palette },
      { label: "Domain", href: "/locations/dashboard/domains", icon: Globe2 },
      { label: "QR Codes", href: "/locations/dashboard/qr-codes", icon: QrCode },
    ],
  },
  {
    label: "Customers",
    defaultOpen: false,
    items: [
      { label: "Leads", href: "/locations/dashboard/leads", icon: BriefcaseBusiness },
      { label: "Offers", href: "/locations/dashboard/offers", icon: Tag },
      { label: "VIP List", href: "/locations/dashboard/vip", icon: Users },
      { label: "Notifications", href: "/locations/dashboard/notifications", icon: Bell },
      { label: "Reviews / Feedback", href: "/locations/dashboard/reviews", icon: Star },
    ],
  },
  {
    label: "Marketing & growth",
    defaultOpen: false,
    items: [
      { label: "Marketing Studio", href: "/locations/dashboard/marketing-studio", icon: Sparkles },
      { label: "Social Accounts", href: "/locations/dashboard/social-accounts", icon: Globe2 },
      { label: "Promotions", href: "/locations/dashboard/promotions", icon: HeartHandshake },
    ],
  },
  {
    label: "Account",
    defaultOpen: true,
    items: [
      { label: "Billing & Payments", href: "/locations/dashboard/billing", icon: CreditCard },
      { label: "Support", href: "/locations/dashboard/support", icon: MessageSquareText },
      { label: "Settings", href: "/locations/dashboard/settings", icon: Settings },
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
  else params.delete("section");
  if (item.host) params.set("host", "1");
  else params.delete("host");
  const query = params.toString();
  return query ? `${item.href}?${query}` : item.href;
}

function isItemActive(
  pathname: string,
  searchParams: SearchReader,
  item: NavItem,
) {
  if (!isActivePath(pathname, item.href)) return false;
  if (
    item.href === "/locations/dashboard/reservations" &&
    pathname !== item.href
  ) {
    return false;
  }
  if (item.host) return searchParams.get("host") === "1";
  if (searchParams.get("host") === "1") return false;

  if (item.section) {
    return searchParams.get("section") === item.section;
  }

  if (!item.tab) {
    if (item.href === "/locations/dashboard/reservations/settings") {
      return !searchParams.get("section");
    }
    return true;
  }

  const activeTab = searchParams.get("tab") || "today";
  if (activeTab !== item.tab) return false;
  return true;
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of groups) {
      initial[group.label] =
        group.defaultOpen || group.items.some((item) => isActivePath(pathname, item.href));
    }
    return initial;
  });

  return (
    <>
      <div className="shrink-0 border-b border-white/10 px-4 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">
          Location Workspace
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black text-white">TheOutHaven</p>
            <p className="text-[11px] font-bold text-white/40">Business dashboard</p>
          </div>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#ff2142]/40 bg-[#e1062a]/15 text-[#ff6b86]">
            <UserRound size={15} />
          </span>
        </div>
      </div>
      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-8 [scrollbar-gutter:stable]"
        aria-label="Location workspace navigation"
      >
        {groups.map((group) => {
          const containsActive = group.items.some((item) =>
            isActivePath(pathname, item.href),
          );
          const expanded = openGroups[group.label] || containsActive;
          return (
            <div key={group.label} className="mb-2 last:mb-0">
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((current) => ({
                    ...current,
                    [group.label]: !expanded,
                  }))
                }
                className="flex min-h-10 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-white/38 hover:bg-white/[0.04] hover:text-white/65"
                aria-expanded={expanded}
              >
                <span>{group.label}</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                />
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
                        className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-[13px] font-bold transition ${
                          active
                            ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-white"
                            : "border-transparent text-white/60 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        <Icon
                          size={16}
                          className={active ? "text-[#ff6b86]" : "text-white/35"}
                        />
                        <span className="min-w-0 truncate">{item.label}</span>
                        {active ? (
                          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff2142]" />
                        ) : null}
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

function TabletRail({ openNavigation }: { openNavigation: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <aside className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center overflow-hidden border-r border-white/10 bg-[#06080b] py-4 text-white md:flex xl:hidden">
      <button
        type="button"
        onClick={openNavigation}
        aria-label="Open location workspace navigation"
        className="mb-4 grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-white"
      >
        <Menu size={19} />
      </button>
      <Link
        href={buildDestination(groups[0].items[0], searchParams.toString())}
        aria-label="Location overview"
        className={`mb-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${
          isItemActive(pathname, searchParams, groups[0].items[0])
            ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-[#ff6b86]"
            : "border-transparent text-white/45 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
        }`}
      >
        <LayoutDashboard size={19} />
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 [scrollbar-gutter:stable]">
        <div className="flex flex-col items-center gap-2">
          {groups.map((group) => {
            const active = group.items.some((item) =>
              isItemActive(pathname, searchParams, item),
            );
            const Icon = group.items[0]?.icon || Settings;
            return (
              <button
                key={group.label}
                type="button"
                onClick={openNavigation}
                title={group.label}
                aria-label={`Open ${group.label}`}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition ${
                  active
                    ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-[#ff6b86]"
                    : "border-transparent text-white/40 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <Icon size={19} />
              </button>
            );
          })}
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
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#06080b] text-white xl:flex">
        <SidebarContents />
      </aside>
      <TabletRail openNavigation={() => setMobileOpen(true)} />

      <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-white/10 bg-[#07090d]/95 px-3 py-2.5 text-white backdrop-blur-xl md:hidden">
        <button
          type="button"
          aria-label="Open location workspace navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05]"
        >
          <Menu size={19} />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">
            Location Workspace
          </p>
          <p className="truncate text-sm font-black">Business dashboard</p>
        </div>
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-[90] xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Location workspace navigation"
        >
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col overflow-hidden border-r border-white/10 bg-[#06080b] text-white shadow-2xl">
            <div className="absolute left-3 top-3 z-10">
              <button
                type="button"
                aria-label="Close location workspace navigation"
                onClick={() => setMobileOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 pt-12">
              <SidebarContents onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}