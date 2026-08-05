import Link from "next/link";
import {
  EXPLORER_SECTIONS,
  type ExplorerSection,
} from "@/lib/admin/search-explorer";
export default function SearchExplorerTabs({
  eventId,
  active,
}: {
  eventId: string;
  active: ExplorerSection;
}) {
  return (
    <nav
      aria-label="Explorer sections"
      className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1 lg:sticky lg:top-44 lg:block lg:self-start"
    >
      {EXPLORER_SECTIONS.map((section) => (
        <Link
          key={section}
          href={`/admin/dashboard/search-health?tab=explorer&search=${encodeURIComponent(eventId)}&section=${section}`}
          aria-current={active === section ? "page" : undefined}
          className={`block whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-black capitalize focus-visible:outline-2 focus-visible:outline-rose-400 ${active === section ? "bg-rose-600 text-white" : "text-white/45 hover:bg-white/5 hover:text-white"}`}
        >
          {section === "raw" ? "Raw JSON" : section}
        </Link>
      ))}
    </nav>
  );
}
