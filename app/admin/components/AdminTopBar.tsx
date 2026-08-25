"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { adminNavSections, adminOverview, type AdminNavItem, type AdminNavSection } from "../admin-navigation";
import type { AdminRole } from "@/lib/users/roles";
import { ADMIN_ROLE_LABELS, type AdminPermissionKey } from "@/lib/admin-permissions";
import { createClient } from "@/lib/supabase-browser";

type Props = { adminName: string; adminEmail: string; adminRole: AdminRole; adminPermissions: readonly AdminPermissionKey[] };

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  return href === "/admin/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("") || "A";
}

function getVisibleSections(permissions: readonly AdminPermissionKey[]) {
  const allowed = new Set(permissions);
  return adminNavSections.map((section) => ({ ...section, items: section.items.filter((item) => !item.permission || allowed.has(item.permission)) })).filter((section) => section.items.length);
}

function getActiveHref(pathname: string, sections: readonly AdminNavSection[]) {
  return [adminOverview, ...sections.flatMap((section) => section.items)]
    .filter((item) => isActive(pathname, item.href))
    .sort((a, b) => (b.href?.length || 0) - (a.href?.length || 0))[0]?.href;
}

function NavItem({ item, activeHref, onNavigate }: { item: AdminNavItem; activeHref?: string; onNavigate?: () => void }) {
  const active = item.href === activeHref;
  const Icon = item.icon;
  if (item.status === "planned" || !item.href) {
    return <div aria-disabled="true" className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-white/30"><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{item.label}</span><span className="text-[9px] font-black uppercase tracking-wider text-white/25">Planned</span></div>;
  }
  return <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition ${active ? "bg-white/[0.08] text-white" : "text-white/60 hover:bg-white/[0.045] hover:text-white"}`}>
    {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[#ec0b5b]" /> : null}
    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#ec0b5b]" : "text-white/45 group-hover:text-white/75"}`} />
    <span className="truncate">{item.label}</span>
  </Link>;
}

function NavSection({ section, activeHref, onNavigate }: { section: AdminNavSection; activeHref?: string; onNavigate?: () => void }) {
  const sectionActive = section.items.some((item) => item.href === activeHref);
  const [expanded, setExpanded] = useState(false);
  const open = expanded || sectionActive;
  const Icon = section.icon;
  return <section>
    <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={open} className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-2 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition hover:bg-white/[0.04] ${sectionActive ? "text-rose-200" : "text-white/42"}`}>
      <Icon className="h-4 w-4" /><span className="flex-1 text-left">{section.label}</span><ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open ? <div className="mt-0.5 space-y-0.5 pl-1">{section.items.map((item) => <NavItem key={item.label} item={item} activeHref={activeHref} onNavigate={onNavigate} />)}</div> : null}
  </section>;
}

function Navigation({ permissions, pathname, onNavigate }: { permissions: readonly AdminPermissionKey[]; pathname: string; onNavigate?: () => void }) {
  const sections = getVisibleSections(permissions);
  const activeHref = getActiveHref(pathname, sections);
  return <nav className="space-y-2" aria-label="Admin navigation"><NavItem item={adminOverview} activeHref={activeHref} onNavigate={onNavigate} />{sections.map((section) => <NavSection key={section.label} section={section} activeHref={activeHref} onNavigate={onNavigate} />)}</nav>;
}

function TabletRail({ permissions, pathname, openNavigation }: { permissions: readonly AdminPermissionKey[]; pathname: string; openNavigation: () => void }) {
  const sections = getVisibleSections(permissions);
  const activeHref = getActiveHref(pathname, sections);
  return <aside className="fixed inset-y-0 left-0 z-[85] hidden w-[76px] flex-col items-center border-r border-white/10 bg-[#070707]/98 py-4 text-white md:flex xl:hidden">
    <button type="button" onClick={openNavigation} aria-label="Open admin navigation" className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white"><Menu className="h-5 w-5" /></button>
    <Link href="/admin/dashboard" aria-label="Admin overview" className={`mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl ${activeHref === adminOverview.href ? "bg-white/[0.08] text-[#ec0b5b]" : "text-white/55 hover:bg-white/[0.05] hover:text-white"}`}><adminOverview.icon className="h-5 w-5" /></Link>
    <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 py-1">
      {sections.map((section) => { const Icon = section.icon; const active = section.items.some((item) => item.href === activeHref); return <button key={section.label} type="button" onClick={openNavigation} title={section.label} aria-label={`Open ${section.label}`} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${active ? "border-rose-300/25 bg-rose-500/10 text-rose-100" : "border-transparent text-white/45 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"}`}><Icon className="h-5 w-5" /></button>; })}
    </div>
  </aside>;
}

export default function AdminTopBar({ adminName, adminEmail, adminRole, adminPermissions }: Props) {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const roleLabel = ADMIN_ROLE_LABELS[adminRole] || String(adminRole);
  const signOut = async () => { await createClient().auth.signOut(); window.location.href = "/login"; };
  const closeNavigation = () => setMobileOpen(false);

  return <>
    <aside className="fixed inset-y-0 left-0 z-[90] hidden w-60 flex-col border-r border-white/10 bg-[#070707]/98 text-white shadow-2xl shadow-black/50 xl:flex">
      <div className="flex h-20 items-center gap-3 px-5"><Image src="/toh_logo.png" alt="TheOutHaven" width={38} height={38} className="rounded-2xl" priority /><div className="min-w-0"><p className="truncate text-sm font-black tracking-wide">THEOUTHAVEN</p><p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200/60">Admin</p></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"><Navigation permissions={adminPermissions} pathname={pathname} /></div>
      <div className="border-t border-white/10 p-3"><div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black">{initials(adminName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{adminName}</p><p className="truncate text-xs text-white/45">{adminEmail || roleLabel}</p></div><button type="button" onClick={signOut} aria-label="Sign out" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button></div></div>
    </aside>

    <TabletRail permissions={adminPermissions} pathname={pathname} openNavigation={() => setMobileOpen(true)} />

    <header className="sticky top-0 z-[80] border-b border-white/10 bg-[#070707]/95 text-white backdrop-blur-xl">
      <div className="flex h-16 max-w-full items-center gap-3 px-3 sm:px-4 md:pl-[92px] xl:px-6">
        <button type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-controls="mobile-admin-navigation" aria-label="Open admin navigation" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white md:hidden"><Menu className="h-5 w-5" /></button>
        <Link href="/admin/dashboard" className="flex min-w-0 items-center gap-2 xl:hidden"><Image src="/toh_logo.png" alt="TheOutHaven" width={34} height={34} className="rounded-xl" priority /><span className="truncate text-sm font-black">TheOutHaven Admin</span></Link>
        <div className="hidden min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/45 xl:flex"><Search className="h-4 w-4" /> Premium operations console</div>
        <div className="ml-auto flex items-center gap-2"><span className="hidden items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-50 sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" />{roleLabel}</span><span className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-black sm:flex">{initials(adminName)}</span></div>
      </div>
    </header>

    {mobileOpen ? <div className="fixed inset-0 z-[120] xl:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
      <button type="button" onClick={closeNavigation} aria-label="Close admin navigation" className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <aside id="mobile-admin-navigation" className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col border-r border-white/10 bg-[#070707] text-white shadow-2xl">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4"><button type="button" onClick={closeNavigation} aria-label="Close admin navigation" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"><X className="h-5 w-5" /></button><Image src="/toh_logo.png" alt="TheOutHaven" width={34} height={34} className="rounded-xl" /><div className="min-w-0"><p className="truncate text-sm font-black">TheOutHaven Admin</p><p className="truncate text-xs text-white/45">{roleLabel}</p></div></div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4"><Navigation permissions={adminPermissions} pathname={pathname} onNavigate={closeNavigation} /></div>
        <div className="border-t border-white/10 p-3"><div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black">{initials(adminName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{adminName}</p><p className="truncate text-xs text-white/45">{adminEmail || roleLabel}</p></div><button type="button" onClick={signOut} aria-label="Sign out" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button></div></div>
      </aside>
    </div> : null}
  </>;
}
