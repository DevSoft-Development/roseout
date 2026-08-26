"use client";

import Link from "next/link";
import {
  CalendarDays,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  Map,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Table2,
  Users,
  ClipboardList,
} from "lucide-react";
import { getReserveDashboardUrl } from "@/lib/reservations/reserveLinks";

export default function ReserveSidebar({
  locationName,
  locationId,
  locationType,
  activeTab,
  activeSection,
  userLabel,
  actingContext,
}: {
  locationName?: string;
  locationId?: string;
  locationType?: string;
  activeTab: string;
  activeSection?: string;
  onTabChange: (tab: string) => void;
  userLabel?: string;
  actingContext?: { adminLocationId?: string; type?: string };
}) {
  const ctx = {
    adminLocationId: actingContext?.adminLocationId,
    locationId: !actingContext?.adminLocationId ? locationId : undefined,
    type: actingContext?.type || locationType,
  };
  const activityMode = String(locationType || "").toLowerCase().includes("activ");
  const floorLabel = activityMode ? "Spaces" : "Floor";
  const locationTypeLabel = activityMode ? "Activity venue" : "Restaurant / venue";

  const groups = [
    {
      title: "RESERVATIONS",
      items: [
        ["Overview", "overview", undefined, LayoutDashboard],
        ["Today", "today", undefined, Clock3],
        ["Schedule", "calendar", undefined, CalendarDays],
        [floorLabel, "floor", undefined, Table2],
        ["Guests", "guests", undefined, Users],
        ["Waitlist", "waitlist", undefined, ClipboardList],
      ],
    },
    {
      title: "RESERVATION SETTINGS",
      items: [
        ["All settings", "settings", undefined, Settings],
        ["Layout & spaces", "settings", "layout", Map],
        ["Hours & capacity", "settings", "hours", Clock3],
        ["Reminders & alerts", "settings", "reminders", MessageSquareText],
        ["Policies & guarantees", "settings", "policies", ShieldCheck],
      ],
    },
    {
      title: "SUPPORT",
      items: [["Help & support", "/help", undefined, CircleHelp]],
    },
  ] as const;

  return (
    <aside className="flex h-dvh min-h-0 flex-col overflow-hidden border-r border-[var(--reserve-border)] bg-[var(--reserve-sidebar)] p-3">
      <div className="shrink-0 px-2 py-3">
        <p className="text-xs font-black uppercase tracking-[.24em] text-[var(--reserve-primary)]">
          TheOutHaven
        </p>
        <h2 className="mt-0.5 text-xl font-black">Reserve</h2>
      </div>

      <div className="reserve-soft mb-3 shrink-0 rounded-2xl p-3">
        <p className="text-[10px] font-black uppercase tracking-[.18em] reserve-muted">
          Managing reservations for
        </p>
        <p className="mt-1 truncate text-sm font-black">
          {locationName || "Choose a location"}
        </p>
        <p className="truncate text-xs reserve-muted">{locationTypeLabel}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="mb-1 px-2 text-[10px] font-black uppercase tracking-[.2em] reserve-muted">
              {group.title}
            </p>
            <nav className="space-y-1" aria-label={group.title.toLowerCase()}>
              {group.items.map(([label, tab, sectionKey, Icon]) => {
                const href = String(tab).startsWith("/")
                  ? String(tab)
                  : getReserveDashboardUrl(
                      String(tab),
                      sectionKey as string | undefined,
                      ctx,
                    );
                const active = String(tab).startsWith("/")
                  ? false
                  : activeTab === tab && (!sectionKey || activeSection === sectionKey);

                return (
                  <Link
                    key={label}
                    href={href}
                    className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
                      active
                        ? "bg-[var(--reserve-primary-soft)] text-white ring-1 ring-[var(--reserve-primary)]/35"
                        : "text-[var(--reserve-muted-strong)] hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="reserve-soft mt-2 flex shrink-0 items-center gap-2 rounded-2xl p-3 text-sm font-bold">
        <ShieldCheck size={16} />
        <span className="truncate">{userLabel || "Owner access"}</span>
      </div>
    </aside>
  );
}
