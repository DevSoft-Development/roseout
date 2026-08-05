import Link from "next/link";
import {
  LOCATION_WORKSPACE_TABS,
  getLocationWorkspaceGroupForTab,
  getLocationWorkspaceHref,
  type LocationWorkspaceTab,
  type LocationWorkspaceChildTab,
} from "@/lib/admin/location-workspace";
import {
  buildActivityHref,
  buildClaimsHref,
  buildOpportunitiesHref,
  buildOutreachHref,
  buildSupportHref,
  buildTasksHref,
} from "@/lib/crm/context";

export default function LocationWorkspaceNavigation({
  locationId,
  activeTab,
}: {
  locationId: string;
  activeTab: LocationWorkspaceTab | LocationWorkspaceChildTab;
}) {
  const activeGroup = getLocationWorkspaceGroupForTab(activeTab);
  const returnTo = getLocationWorkspaceHref(locationId, activeGroup.id);
  const context = { locationId, returnTo };
  const relatedLinks = [
    ["Claims", buildClaimsHref(context)],
    ["Opportunities", buildOpportunitiesHref(context)],
    ["Outreach", buildOutreachHref(context)],
    ["Support", buildSupportHref(context)],
    ["Tasks", buildTasksHref(context)],
    ["Activity", buildActivityHref(context)],
  ] as const;

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

      <section className="rounded-[1.2rem] border border-white/10 bg-black/55 p-3 shadow-xl shadow-black/25 backdrop-blur" aria-label="Related CRM activity">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-200">Related CRM Activity</p>
            <p className="text-xs text-white/50">Open another CRM module while keeping this location selected.</p>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:justify-end">
            {relatedLinks.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-white/70 transition hover:border-rose-200/30 hover:text-white"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
