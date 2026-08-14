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
    description: "Your most-used tools",
    defaultOpen: true,
    items: [
      ["Overview", "/locations/dashboard", LayoutDashboard],
      ["Reservations", "/locations/dashboard/reservations", CalendarClock],
      ["Menu / Packages", "/locations/dashboard/menu", BookOpen],
      ["Website", "/locations/dashboard/website", Globe2],
      ["Messaging", "/locations/dashboard/messaging", MessageSquare],
      ["Analytics", "/locations/dashboard/analytics", BarChart3],
    ],
  },
  {
    label: "Business setup",
    description: "Profile, brand, domain and QR",
    defaultOpen: false,
    items: [
      ["Profile", "/locations/dashboard/profile", Building2],
      ["Branding", "/locations/dashboard/branding", Palette],
      ["Domain", "/locations/dashboard/domains", Globe2],
      ["QR Codes", "/locations/dashboard/qr-codes", QrCode],
    ],
  },
  {
    label: "Customers",
    description: "Leads, loyalty and feedback",
    defaultOpen: false,
    items: [
      ["Leads", "/locations/dashboard/leads", BriefcaseBusiness],
      ["Offers", "/locations/dashboard/offers", Tag],
      ["VIP List", "/locations/dashboard/vip", Users],
      ["Notifications", "/locations/dashboard/notifications", Bell],
      ["Reviews / Feedback", "/locations/dashboard/reviews", Star],
    ],
  },
  {
    label: "Marketing & growth",
    description: "Campaigns and promotion tools",
    defaultOpen: false,
    items: [
      ["Marketing Studio", "/locations/dashboard/marketing-studio", Sparkles],
      ["Promotions", "/locations/dashboard/promotions", HeartHandshake],
    ],
  },
  {
    label: "Account",
    description: "Plan and workspace settings",
    defaultOpen: false,
    items: [
      ["Billing", "/locations/dashboard/billing", CreditCard],
      ["Settings", "/locations/dashboard/settings", Settings],
    ],
  },
] as const;

function routeIsActive(pathname: string, href: string) {
  return href === "/locations/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.label, group.defaultOpen])),
  );

  return (
    <>
      <div className="border-b border-white/10 px-4 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Location Workspace</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-black text-white">Business tools</p>
            <p className="text-[11px] font-semibold text-white/40">Everything for this location</p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-[#ff2142]/40 bg-[#e1062a]/15 text-[#ff6b86]">
            <UserRound size={15} />
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group) => {
          const hasActiveItem = group.items.some(([, href]) => routeIsActive(pathname, href));
          const open = Boolean(openGroups[group.label]) || hasActiveItem;

          return (
            <div key={group.label} className="mb-2 last:mb-0">
              <button
                type="button"
                onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !open }))}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.04]"
                aria-expanded={open}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{group.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-semibold text-white/25">{group.description}</span>
                </span>
                <ChevronDown size={14} className={`shrink-0 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>

              {open ? (
                <div className="mt-1 space-y-0.5">
                  {group.items.map(([label, href, Icon]) => {
                    const active = routeIsActive(pathname, href);
                    const destination = query ? `${href}?${query}` : href;
                    return (
                      <Link
                        key={href}
                        href={destination}
                        onClick={onNavigate}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[13px] font-bold transition ${
                          active
                            ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-white shadow-lg shadow-[#e1062a]/10"
                            : "border-transparent text-white/62 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        <Icon size={15} className={active ? "text-[#ff6b86]" : "text-white/35"} />
                        <span>{label}</span>
                        {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#ff2142]" /> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <p className="text-[10px] font-semibold leading-4 text-white/30">Tip: open a section only when you need it. Your current section stays expanded automatically.</p>
      </div>
    </>
  );
}

export default function CanonicalLocationModuleNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-[272px] shrink-0 flex-col self-start border-r border-white/10 bg-[#06080b] text-white lg:flex">
        <SidebarContents />
      </aside>

      <div className="sticky top-20 z-40 flex items-center justify-between border-b border-white/10 bg-[#07090d]/95 px-4 py-3 text-white backdrop-blur-xl lg:hidden">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Location Workspace</p>
          <p className="text-sm font-black">Business tools</p>
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
