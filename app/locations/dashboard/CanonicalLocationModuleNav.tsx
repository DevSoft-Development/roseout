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
    label: "Business",
    items: [
      ["Overview", "/locations/dashboard", LayoutDashboard],
      ["Profile", "/locations/dashboard/profile", Building2],
      ["Branding", "/locations/dashboard/branding", Palette],
      ["Website", "/locations/dashboard/website", Globe2],
      ["Domain", "/locations/dashboard/domains", Globe2],
      ["Menu / Packages", "/locations/dashboard/menu", BookOpen],
      ["QR Codes", "/locations/dashboard/qr-codes", QrCode],
      ["Reservations", "/locations/dashboard/reservations", CalendarClock],
    ],
  },
  {
    label: "Customers",
    items: [
      ["Leads", "/locations/dashboard/leads", BriefcaseBusiness],
      ["Offers", "/locations/dashboard/offers", Tag],
      ["VIP List", "/locations/dashboard/vip", Users],
      ["Messaging", "/locations/dashboard/messaging", MessageSquare],
      ["Notifications", "/locations/dashboard/notifications", Bell],
      ["Reviews / Feedback", "/locations/dashboard/reviews", Star],
    ],
  },
  {
    label: "Growth",
    items: [
      ["Marketing Studio", "/locations/dashboard/marketing-studio", Sparkles],
      ["Promotions", "/locations/dashboard/promotions", HeartHandshake],
      ["Analytics", "/locations/dashboard/analytics", BarChart3],
    ],
  },
  {
    label: "Account",
    items: [
      ["Billing", "/locations/dashboard/billing", CreditCard],
      ["Settings", "/locations/dashboard/settings", Settings],
    ],
  },
] as const;

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Location Workspace</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-white">TheOutHaven</p>
            <p className="text-xs font-bold text-white/40">Business dashboard</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#ff2142]/40 bg-[#e1062a]/15 text-[#ff6b86]">
            <UserRound size={17} />
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/30">{group.label}</p>
            <div className="space-y-1">
              {group.items.map(([label, href, Icon]) => {
                const active = href === "/locations/dashboard"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);
                const destination = query ? `${href}?${query}` : href;
                return (
                  <Link
                    key={href}
                    href={destination}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-bold transition ${
                      active
                        ? "border-[#ff2142]/45 bg-[#e1062a]/20 text-white shadow-lg shadow-[#e1062a]/10"
                        : "border-transparent text-white/62 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-[#ff6b86]" : "text-white/35"} />
                    <span>{label}</span>
                    {active ? <span className="ml-auto h-2 w-2 rounded-full bg-[#ff2142]" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.07] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200/70">Unified workspace</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-white/45">All location tools live in this one navigation. No duplicate top menu.</p>
        </div>
      </div>
    </>
  );
}

export default function CanonicalLocationModuleNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-white/10 bg-[#06080b] text-white lg:flex">
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
