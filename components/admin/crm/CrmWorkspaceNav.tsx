"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["Overview", "/admin/dashboard/crm"],
  ["Accounts", "/admin/dashboard/crm/accounts"],
  ["Work Queue", "/admin/dashboard/crm/work-queue"],
  ["Outreach", "/admin/dashboard/crm/outreach"],
  ["Operations", "/admin/dashboard/crm/operations"],
] as const;

export default function CrmWorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="CRM workspace navigation">
      {items.map(([label, href]) => {
        const active = href === "/admin/dashboard/crm" ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${active ? "border-rose-300/40 bg-[#ec0b5b] text-white" : "border-white/10 bg-white/[0.045] text-white/65 hover:bg-white/[0.08] hover:text-white"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
