"use client";

import { ReactNode } from "react";
import ReserveTabs from "./ReserveTabs";

export default function ReserveTopBar({
  actions,
  themeToggle,
  setupEnabled,
  activeTab,
  onTabChange,
  locationType,
}: {
  actions?: ReactNode;
  themeToggle?: ReactNode;
  setupEnabled?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  locationType?: string;
}) {
  const activityMode = String(locationType || "").toLowerCase().includes("activ");
  const tabs = [
    { label: "Today", value: "today" },
    { label: "Schedule", value: "calendar" },
    { label: activityMode ? "Spaces" : "Floor", value: "floor" },
    { label: "Guests", value: "guests" },
    { label: "Waitlist", value: "waitlist" },
  ];

  return (
    <header className="sticky top-0 z-30 -mx-3 mb-4 border-b border-[var(--reserve-border)] bg-[var(--reserve-panel)]/95 px-3 pt-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
      <div className="flex min-h-[76px] flex-col gap-3 py-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">Reservations</h1>
            <span
              className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-black ${
                setupEnabled
                  ? "border-green-400/20 bg-green-500/10 text-green-300"
                  : "border-[var(--reserve-primary)]/25 bg-[var(--reserve-primary-soft)] text-white/80"
              }`}
            >
              {setupEnabled ? "Ready" : "Needs setup"}
            </span>
          </div>
          <p className="mt-1 text-sm reserve-muted">
            Manage today’s reservations, guest arrivals, seating, and waitlist from one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {themeToggle}
        </div>
      </div>
      <ReserveTabs active={activeTab} onChange={onTabChange} tabs={tabs} />
    </header>
  );
}
