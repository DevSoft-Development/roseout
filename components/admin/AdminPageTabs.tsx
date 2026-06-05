"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminPageTab = {
  label: string;
  href: string;
  exact?: boolean;
};

function isActive(pathname: string | null, tab: AdminPageTab) {
  if (!pathname) return false;
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export default function AdminPageTabs({ tabs }: { tabs: AdminPageTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Admin page sections">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
              active
                ? "border-rose-300 bg-rose-500 text-white shadow-lg shadow-rose-950/25"
                : "border-white/10 bg-white/[0.06] text-white/60 hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
