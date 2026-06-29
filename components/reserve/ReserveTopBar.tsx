"use client";
import { ReactNode } from "react";
import ReserveTabs from "./ReserveTabs";

export default function ReserveTopBar({actions,themeToggle,setupEnabled,activeTab,onTabChange}:{actions?:ReactNode;themeToggle?:ReactNode;setupEnabled?:boolean;activeTab:string;onTabChange:(tab:string)=>void}){
  return <header className="sticky top-0 z-30 -mx-3 mb-4 border-b border-[var(--reserve-border)] bg-[var(--reserve-panel)]/95 px-3 pt-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
    <div className="flex min-h-[76px] flex-col gap-3 py-2 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Reserve Command Center</h1>
          <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-black ${setupEnabled?'border-green-400/20 bg-green-500/10 text-green-400':'border-amber-400/20 bg-amber-500/10 text-amber-400'}`}>{setupEnabled?'Live':'Setup needed'}</span>
        </div>
        <p className="mt-1 text-sm reserve-muted">Today’s bookings, floor status, guests, and waitlist for TheOutHaven Reserve.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}{themeToggle}</div>
    </div>
    <ReserveTabs active={activeTab} onChange={onTabChange} tabs={["today","calendar","floor","guests","waitlist","settings"].map(t=>({label:t[0].toUpperCase()+t.slice(1), value:t}))}/>
  </header>
}
