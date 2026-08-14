"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const modules = [
  ["Overview", "/locations/dashboard"],
  ["Profile", "/locations/dashboard/profile"],
  ["Branding", "/locations/dashboard/branding"],
  ["Website", "/locations/dashboard/website"],
  ["Domain", "/locations/dashboard/domains"],
  ["Menu / Packages", "/locations/dashboard/menu"],
  ["QR Codes", "/locations/dashboard/qr-codes"],
  ["Reservations", "/locations/dashboard/reservations"],
  ["Leads", "/locations/dashboard/leads"],
  ["Offers", "/locations/dashboard/offers"],
  ["VIP", "/locations/dashboard/vip"],
  ["Messaging", "/locations/dashboard/messaging"],
  ["Notifications", "/locations/dashboard/notifications"],
  ["Reviews", "/locations/dashboard/reviews"],
  ["Marketing Studio", "/locations/dashboard/marketing-studio"],
  ["Promotions", "/locations/dashboard/promotions"],
  ["Analytics", "/locations/dashboard/analytics"],
  ["Billing", "/locations/dashboard/billing"],
  ["Settings", "/locations/dashboard/settings"],
] as const;

export default function CanonicalLocationModuleNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-[#07090d]/95 px-4 py-3 text-white backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1760px]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Location Workspace</p>
            <p className="text-sm font-black">Business tools</p>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100">Unified dashboard</span>
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {modules.map(([label, href]) => {
            const active = pathname === href;
            const destination = query ? `${href}?${query}` : href;
            return (
              <Link
                key={href}
                href={destination}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black transition ${
                  active
                    ? "border-[#ff2142]/70 bg-[#e1062a]/20 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
