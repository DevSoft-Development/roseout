import Link from "next/link";
import {
  LOCATION_WORKSPACE_TABS,
  getLocationWorkspaceHref,
  type LocationWorkspaceTab,
} from "@/lib/admin/location-workspace";

export default function LocationWorkspaceNavigation({
  locationId,
  activeTab,
}: {
  locationId: string;
  activeTab: LocationWorkspaceTab;
}) {
  return (
    <nav
      aria-label="Location workspace"
      className="sticky top-3 z-30 max-w-full overflow-x-auto rounded-[1.35rem] border border-white/10 bg-black/80 p-1.5 shadow-2xl shadow-black/40 backdrop-blur"
    >
      <div className="flex min-w-max gap-1.5 text-sm font-black">
        {LOCATION_WORKSPACE_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={getLocationWorkspaceHref(locationId, tab.id)}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-[1rem] px-4 py-3 text-center transition focus:outline-none focus:ring-2 focus:ring-rose-300/40 ${
                active
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-950/40"
                  : "border border-white/10 bg-white/[0.04] text-white/60 hover:border-rose-200/30 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
