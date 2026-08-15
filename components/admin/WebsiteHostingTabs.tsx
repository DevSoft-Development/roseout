import Link from "next/link";

export function WebsiteHostingTabs({ active }: { active: "overview" | "testing" }) {
  const tabs = [
    { key: "overview" as const, label: "Overview", href: "/admin/dashboard/website-hosting" },
    { key: "testing" as const, label: "Testing", href: "/admin/dashboard/website-hosting/testing" },
  ];

  return (
    <nav aria-label="Website hosting sections" className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${selected ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-300/25" : "text-white/55 hover:bg-white/[0.05] hover:text-white"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
