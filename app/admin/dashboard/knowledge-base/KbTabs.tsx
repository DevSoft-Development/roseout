"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { roleCanManageKb } from "@/lib/knowledge-base/access";

const tabs = [
  { label: "Overview", href: "/admin/dashboard/knowledge-base", exact: true },
  { label: "Articles", href: "/admin/dashboard/knowledge-base/articles" },
  { label: "Templates", href: "/admin/dashboard/knowledge-base/templates" },
  { label: "AI Assistant", href: "/admin/dashboard/knowledge-base/ai" },
  { label: "Categories", href: "/admin/dashboard/knowledge-base/categories", managersOnly: true },
  { label: "Public Help", href: "/help", external: true },
];

export default function KbTabs({ role }: { role: string }) {
  const pathname = usePathname();
  const canManage = roleCanManageKb(role);

  return (
    <nav className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0d0d0d]/90 p-2 shadow-[0_18px_50px_rgba(225,6,42,0.10)]" aria-label="Knowledge Base sections">
      <div className="flex min-w-max gap-2">
        {tabs
          .filter((tab) => !tab.managersOnly || canManage)
          .map((tab) => {
            const active = !tab.external && (tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={[
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black transition",
                  active
                    ? "border-[#e1062a]/40 bg-[#e1062a]/15 text-rose-100 shadow-[0_18px_50px_rgba(225,6,42,0.18)]"
                    : "border-white/10 bg-white/[0.035] text-white/70 hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10 hover:text-white",
                ].join(" ")}
              >
                {tab.label}
                {tab.external ? <ExternalLink className="h-3.5 w-3.5" /> : null}
              </Link>
            );
          })}
      </div>
    </nav>
  );
}
