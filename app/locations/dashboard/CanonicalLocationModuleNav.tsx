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
  ChevronDown,
  CreditCard,
  Globe2,
  HeartHandshake,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Palette,
  QrCode,
  Settings,
  Sparkles,
  Star,
  Tag,
  UserRound,
  Users,
  X,
} from "lucide-react";

const groups = [
  {
    label: "Essentials",
    defaultOpen: true,
    items: [
      ["Overview", "/locations/dashboard", LayoutDashboard],
      ["Reservations", "/reserve/dashboard/reservations", CalendarClock],
      ["Menu / Packages", "/business/dashboard/menu", BookOpen],
      ["Website", "/locations/dashboard/website", Globe2],
      ["Messaging", "/business/dashboard/messaging", MessageSquare],
      ["Analytics", "/business/dashboard/analytics", BarChart3],
    ],
  },
  {
    label: "Business setup",
    defaultOpen: false,
    items: [
      ["Profile", "/business/dashboard/profile", Building2],
      ["Branding", "/business/dashboard/branding", Palette],
      ["Domain", "/locations/dashboard/domains", Globe2],
      ["QR Codes", "/business/dashboard/qr-codes", QrCode],
    ],
  },
  {
    label: "Customers",
    defaultOpen: false,
    items: [
      ["Leads", "/business/dashboard/leads", BriefcaseBusiness],
      ["Offers", "/business/dashboard/offers", Tag],
      ["VIP List", "/business/dashboard/vip", Users],
      ["Notifications", "/business/dashboard/notifications", Bell],
      ["Reviews / Feedback", "/business/dashboard/reviews", Star],
    ],
  },
  {
    label: "Marketing & growth",
    defaultOpen: false,
    items: [
      ["Marketing Studio", "/business/dashboard/marketing-studio", Sparkles],
      ["Promotions", "/business/dashboard/promotions", HeartHandshake],
    ],
  },
  {
    label: "Account",
    defaultOpen: false,
    items: [
      ["Billing", "/business/dashboard/billing", CreditCard],
      ["Settings", "/business/dashboard/settings", Settings],
    ],
  },
] as const;

function isActivePath(pathname: string, href: string) {
  return href === "/locations/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of groups) {
      initial[group.label] = group.defaultOpen || group.items.some(([, href]) => isActivePath(pathname, href));
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
          const containsActive = group.items.some(([, href]) => isActivePath(pathname, href));
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
                  {group.items.map(([label, href, Icon]) => {
                    const active = isActivePath(pathname, href);
                    const destination = query ? `${href}?${query}` : href;
                    return (
                      <Link
                        key={href}
                        href={destination}
                        onClick={onNavigate}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[13px] font-bold transition ${
                          active
                            ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-white"
                            : "border-transparent text-white/60 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        <Icon size={15} className={active ? "text-[#ff6b86]" : "text-white/35"} />
                        <span className="min-w-0 truncate">{label}</span>
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
