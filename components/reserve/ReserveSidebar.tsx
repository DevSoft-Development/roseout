"use client";

import Link from "next/link";
import { getReserveDashboardUrl } from "@/lib/reservations/reserveLinks";

const reservationTabs = [
  ["today", "Today"],
  ["calendar", "Calendar"],
  ["floor", "Floor"],
  ["guests", "Guests"],
  ["waitlist", "Waitlist"],
] as const;

const setupLinks = [
  ["Layout & Tables", "layout"],
  ["Hours & Capacity", "hours"],
  ["Reminders", "reminders"],
  ["Deposit & Policies", "deposits"],
  ["Booking page", "booking"],
  ["Embed", "embed"],
  ["QR code", "qr"],
] as const;

export default function ReserveSidebar({ locationName, locationId, locationType, activeTab, activeSection, userLabel, actingContext }: { locationName?: string; locationId?: string; locationType?: string; activeTab: string; activeSection?: string; onTabChange: (tab: string) => void; userLabel?: string; actingContext?: { adminLocationId?: string; type?: string } }) {
  const ctx = { adminLocationId: actingContext?.adminLocationId, type: actingContext?.type || locationType };
  return (
    <aside className="reserve-card flex h-dvh min-h-0 flex-col overflow-hidden border-l-0 border-y-0 p-4 lg:sticky lg:top-0">
      <div className="shrink-0 rounded-3xl bg-gradient-to-br from-red-700 to-black p-4 text-white">
        <p className="text-xs font-black uppercase tracking-[.22em]">TheOutHaven</p>
        <h2 className="mt-1 text-2xl font-black">Reserve</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="reserve-soft mt-4 rounded-2xl p-4">
          <p className="text-xs font-black uppercase reserve-muted">Active location</p>
          <p className="mt-1 font-black">{locationName || "Select a location"}</p>
          <p className="text-xs reserve-muted">{locationType || "restaurant"} {locationId ? `· ${locationId.slice(0, 8)}` : ""}</p>
        </div>
        <p className="mt-5 px-2 text-xs font-black uppercase tracking-[.2em] reserve-muted">Main</p>
        <nav className="mt-2 space-y-2">
          <Link className={`block rounded-2xl px-4 py-3 font-bold ${activeTab === "today" ? "reserve-primary" : "reserve-soft"}`} href={getReserveDashboardUrl("today", undefined, ctx)}>Dashboard</Link>
          <Link className={`block rounded-2xl px-4 py-3 font-bold ${activeTab === "settings" && !activeSection ? "reserve-primary" : "reserve-soft"}`} href={getReserveDashboardUrl("settings", undefined, ctx)}>Settings</Link>
        </nav>
        <p className="mt-6 px-2 text-xs font-black uppercase tracking-[.2em] reserve-muted">Reservation</p>
        <div className="mt-2 space-y-1">
          {reservationTabs.map(([value, label]) => (
            <Link key={value} href={getReserveDashboardUrl(value, undefined, ctx)} className={`block w-full rounded-2xl px-4 py-3 text-left text-sm font-black ${activeTab === value ? "reserve-primary" : "reserve-soft"}`}>{label}</Link>
          ))}
        </div>
        <p className="mt-6 px-2 text-xs font-black uppercase tracking-[.2em] reserve-muted">Setup</p>
        <div className="mt-2 space-y-1 text-sm font-bold">
          {setupLinks.map(([label, section]) => (
            <Link key={label} className={`block rounded-2xl px-4 py-3 ${activeTab === "settings" && activeSection === section ? "reserve-primary" : "reserve-soft"}`} href={getReserveDashboardUrl("settings", section, ctx)}>{label}</Link>
          ))}
        </div>
        <p className="mt-6 px-2 text-xs font-black uppercase tracking-[.2em] reserve-muted">Support</p>
        <Link className="mt-2 block reserve-soft rounded-2xl px-4 py-3 text-sm font-black" href="/help">Help & Support</Link>
      </div>
      <div className="reserve-soft mt-4 shrink-0 rounded-2xl p-4 text-sm font-bold">{userLabel || "Signed-in owner"}</div>
    </aside>
  );
}
