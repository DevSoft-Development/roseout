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
    ["Call", `/admin/dashboard/crm/${locationId}/call`],
    ["Claims", buildClaimsHref(context)],
    ["Opportunities", buildOpportunitiesHref(context)],
    ["Outreach", buildOutreachHref(context)],
    ["Support", buildSupportHref(context)],
    ["Tasks", buildTasksHref(context)],
    ["Activity", buildActivityHref(context)],
    [
      "Search diagnostics",
      `/admin/dashboard/crm/${locationId}?tab=analytics&activityTab=search-performance`,
    ],
    ["QR codes", `/admin/dashboard/crm/${locationId}?tab=qr-codes`],
  ] as const;

  return (
    <div
      id="location-workspace-navigation"
      data-overview={activeGroup.id === "overview" ? "true" : "false"}
      className="sticky top-3 z-30"
    >
      <nav
        aria-label="Location workspace"
        className="max-w-full overflow-x-auto rounded-[1.35rem] border border-white/10 bg-black/80 p-1.5 shadow-2xl shadow-black/40 backdrop-blur"
      >
        <div className="flex min-w-max items-center gap-1.5 text-sm font-black">
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

          <details className="group relative shrink-0">
            <summary className="cursor-pointer list-none whitespace-nowrap rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-white/60 transition hover:border-rose-200/30 hover:bg-white/[0.07] hover:text-white [&::-webkit-details-marker]:hidden">
              More ···
            </summary>
            <div className="fixed right-6 mt-2 grid min-w-[220px] gap-1 rounded-2xl border border-white/10 bg-[#101012] p-2 shadow-2xl shadow-black/60">
              {relatedLinks.map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="rounded-xl px-3 py-2 text-sm font-bold text-white/70 transition hover:bg-white/[0.07] hover:text-white"
                >
                  {label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </nav>

      <style>{`
        /* CRM detail hierarchy cleanup. The underlying tools remain available
           in their dedicated tabs and the More menu above. */
        .admin-page-shell .space-y-6:has(> #location-workspace-navigation) > section:nth-child(2) {
          display: none;
        }

        .admin-page-shell .space-y-6:has(> #location-workspace-navigation) > section:first-child > div:nth-child(2) > :nth-child(1),
        .admin-page-shell .space-y-6:has(> #location-workspace-navigation) > section:first-child > div:nth-child(2) > :nth-child(2),
        .admin-page-shell .space-y-6:has(> #location-workspace-navigation) > section:first-child > div:nth-child(2) > :nth-child(4) {
          display: none;
        }

        .admin-page-shell .space-y-6:has(> #location-workspace-navigation) > #location-workspace-navigation + section {
          display: none;
        }

        .admin-page-shell .space-y-6:has(> #location-workspace-navigation) > div.sticky:last-child {
          display: none;
        }

        @media (min-width: 768px) {
          .admin-page-shell .space-y-6:has(> #location-workspace-navigation) > section:first-child > div:nth-child(2) {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        .admin-page-shell .space-y-6:has(> #location-workspace-navigation[data-overview="true"]) > #location-workspace-navigation + section + section > :first-child > article:nth-child(1),
        .admin-page-shell .space-y-6:has(> #location-workspace-navigation[data-overview="true"]) > #location-workspace-navigation + section + section > :first-child > article:nth-child(3),
        .admin-page-shell .space-y-6:has(> #location-workspace-navigation[data-overview="true"]) > #location-workspace-navigation + section + section > :nth-child(2) {
          display: none;
        }

        .admin-page-shell .space-y-6:has(> #location-workspace-navigation[data-overview="true"]) > #location-workspace-navigation + section + section > :first-child {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .admin-page-shell .space-y-6:has(> #location-workspace-navigation[data-overview="true"]) > #location-workspace-navigation + section + section > :first-child > article:nth-child(2) {
          grid-column: 1 / -1;
        }

        @media (max-width: 767px) {
          .admin-page-shell .space-y-6:has(> #location-workspace-navigation[data-overview="true"]) > #location-workspace-navigation + section + section > :first-child {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
