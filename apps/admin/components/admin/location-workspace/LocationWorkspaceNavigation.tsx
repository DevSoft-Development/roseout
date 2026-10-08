import Link from "next/link";
import ClaimCodeSendAction from "@/components/admin/crm/ClaimCodeSendAction";
import {
  getLocationWorkspaceGroupForTab,
  getLocationWorkspaceHref,
} from "@/lib/admin/location-workspace";
import { buildOutreachHref } from "@/lib/crm/context";

export default function LocationWorkspaceNavigation({
  locationId,
  activeTab,
}: {
  locationId: string;
  activeTab: string;
}) {
  const activeGroup = getLocationWorkspaceGroupForTab(activeTab);
  const returnTo = getLocationWorkspaceHref(locationId, activeGroup.id);
  const context = { locationId, returnTo };
  const reservationsHref = `/admin/dashboard/crm/${locationId}?tab=reservations`;
  const communicationsHref = buildOutreachHref(context);
  const salesHref = `/admin/dashboard/crm/sales?location_id=${encodeURIComponent(locationId)}&return_to=${encodeURIComponent(returnTo)}`;
  const tasksHref = `/admin/dashboard/crm/my-work?location=${encodeURIComponent(locationId)}&return_to=${encodeURIComponent(returnTo)}`;
  const tabs = [
    ["Overview", getLocationWorkspaceHref(locationId, "overview"), activeGroup.id === "overview" && activeTab !== "sales" && activeTab !== "tasks"],
    ["Communications", communicationsHref, activeTab === "communication"],
    ["Sales", salesHref, activeTab === "sales"],
    ["Tasks", tasksHref, activeTab === "tasks"],
    ["Reservations", reservationsHref, activeGroup.id === "operations" && activeTab === "reservations"],
    ["Activity", getLocationWorkspaceHref(locationId, "activity"), activeGroup.id === "activity"],
    ["Location Details", getLocationWorkspaceHref(locationId, "profile"), activeGroup.id === "profile" || activeGroup.id === "settings" || activeGroup.id === "menu"],
  ] as const;

  return (
    <div
      id="location-workspace-navigation"
      data-overview={activeGroup.id === "overview" ? "true" : "false"}
      className="sticky top-[116px] z-30"
    >
      <div className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)]/95 p-2 shadow-sm backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <nav aria-label="Location record" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {tabs.map(([label, href, active]) => (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
                  active
                    ? "bg-[var(--admin-shell-accent-soft)] text-[var(--admin-shell-accent)] ring-1 ring-inset ring-[var(--admin-shell-accent-border)]"
                    : "text-[var(--admin-shell-soft)] hover:bg-[var(--admin-shell-card-strong)] hover:text-[var(--admin-shell-text)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <ClaimCodeSendAction locationId={locationId} />
        </div>
      </div>

      <style>{`
        /* CRM V2 keeps operational implementation details out of the default record experience. */
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
          #location-workspace-navigation {
            position: static;
          }

          #location-workspace-navigation > div > div {
            align-items: stretch;
            flex-direction: column;
          }

          #location-workspace-navigation button {
            width: 100%;
            justify-content: center;
          }

          .admin-page-shell .space-y-6:has(> #location-workspace-navigation[data-overview="true"]) > #location-workspace-navigation + section + section > :first-child {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
