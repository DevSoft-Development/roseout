import Link from "next/link";
import {
  LOCATION_WORKSPACE_TABS,
  getLocationWorkspaceGroupForTab,
  getLocationWorkspaceHref,
  type LocationWorkspaceTab,
  type LocationWorkspaceChildTab,
} from "@/lib/admin/location-workspace";

export default function LocationWorkspaceNavigation({
  locationId,
  activeTab,
}: {
  locationId: string;
  activeTab: LocationWorkspaceTab | LocationWorkspaceChildTab;
}) {
  const activeGroup = getLocationWorkspaceGroupForTab(activeTab);
  const secondaryTabs = activeGroup.tabs.filter((tab) => tab.label !== activeGroup.label);

  return (
    <div className="sticky top-3 z-30 space-y-3">
      <nav
        aria-label="Location workspace"
        className="max-w-full overflow-x-auto rounded-[1.35rem] border border-white/10 bg-black/80 p-1.5 shadow-2xl shadow-black/40 backdrop-blur"
      >
        <div className="flex min-w-max gap-1.5 text-sm font-black">
          {LOCATION_WORKSPACE_TABS.map((tab) => {
            const active = tab.id === activeGroup.id;
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
      {secondaryTabs.length ? (
        <nav
          aria-label={`${activeGroup.label} workspace sections`}
          className="max-w-full overflow-x-auto rounded-[1.2rem] border border-white/10 bg-black/55 p-2 shadow-xl shadow-black/25 backdrop-blur"
        >
          <div className="flex min-w-max flex-wrap gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/55">
            {secondaryTabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <Link
                  key={tab.id}
                  href={`/admin/dashboard/crm/${encodeURIComponent(locationId)}?tab=${tab.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full border px-3 py-2 transition focus:outline-none focus:ring-2 focus:ring-rose-300/40 ${
                    active
                      ? "border-rose-300/30 bg-rose-500/15 text-rose-100"
                      : "border-white/10 bg-black/20 text-white/50 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
