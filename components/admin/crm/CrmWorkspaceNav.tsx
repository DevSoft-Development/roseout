"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["Overview", "/admin/dashboard/crm"],
  ["Pipeline", "/admin/dashboard/crm?view=all"],
  ["My Queue", "/admin/dashboard/crm/my-queue"],
  ["Tasks", "/admin/dashboard/crm/tasks"],
  ["Follow-Ups", "/admin/dashboard/crm/follow-ups"],
  ["Claims", "/admin/dashboard/crm/claims"],
  ["Claim Codes", "/admin/dashboard/crm/claim-codes"],
  ["Site Visits", "/admin/dashboard/crm/site-visits"],
  ["Social Outreach", "/admin/dashboard/crm/social-outreach"],
  ["Support", "/admin/dashboard/crm/support"],
  ["Change Requests", "/admin/dashboard/crm/change-requests"],
  ["Notifications", "/admin/dashboard/crm/notifications"],
  ["Performance", "/admin/dashboard/crm/performance"],
  ["Knowledge Base", "/admin/dashboard/crm/knowledge-base"],
  ["Demo / Training", "/admin/dashboard/crm/demo"],
  ["Escalations", "/admin/dashboard/crm/escalations"],
] as const;

export default function CrmWorkspaceNav() {
  const pathname = usePathname();
  return <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="CRM workspace navigation">
    {items.map(([label, href]) => {
      const base = href.split("?")[0];
      const active = base === "/admin/dashboard/crm" ? pathname === base : pathname === base || pathname?.startsWith(`${base}/`);
      return <Link key={href} href={href} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${active ? "border-rose-300/40 bg-[#ec0b5b] text-white" : "border-white/10 bg-white/[0.045] text-white/65 hover:bg-white/[0.08] hover:text-white"}`}>{label}</Link>;
    })}
  </nav>;
}
