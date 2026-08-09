"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { adminNavSections, adminOverview, type AdminNavItem, type AdminNavSection } from "../admin-navigation";
import type { AdminRole } from "@/lib/users/roles";
import { ADMIN_ROLE_LABELS, canAdmin } from "@/lib/admin-permissions";
import { createClient } from "@/lib/supabase-browser";

type Props = { adminName: string; adminEmail: string; adminRole: AdminRole };

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  return href === "/admin/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("") || "A";
}

function NavItem({ item, activeHref, onNavigate }: { item: AdminNavItem; activeHref?: string; onNavigate?: () => void }) {
  const active = item.href === activeHref;
  const Icon = item.icon;
  if (item.status === "planned" || !item.href) {
    return (
      <div aria-disabled="true" className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold text-white/30">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="text-[9px] font-black uppercase tracking-wider text-white/25">Planned</span>
      </div>
    );
  }
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold transition ${active ? "bg-white/[0.08] text-white" : "text-white/60 hover:bg-white/[0.045] hover:text-white"}`}>
      {active ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[#ec0b5b]" /> : null}
      <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[#ec0b5b]" : "text-white/45 group-hover:text-white/75"}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSection({ section, activeHref, onNavigate }: { section: AdminNavSection; activeHref?: string; onNavigate?: () => void }) {
  const sectionActive = section.items.some((item) => item.href === activeHref);
  const [expanded, setExpanded] = useState(false);
  const open = expanded || sectionActive;
  const Icon = section.icon;
  return (
    <section>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={open} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition hover:bg-white/[0.04] ${sectionActive ? "text-rose-200" : "text-white/42"}`}>
        <Icon className="h-3.5 w-3.5" /><span className="flex-1 text-left">{section.label}</span><ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="mt-0.5 space-y-0.5 pl-1">{section.items.map((item) => <NavItem key={item.label} item={item} activeHref={activeHref} onNavigate={onNavigate} />)}</div> : null}
    </section>
  );
}

function Navigation({ role, pathname, onNavigate }: { role: AdminRole; pathname: string; onNavigate?: () => void }) {
  const sections = adminNavSections.map((section) => ({ ...section, items: section.items.filter((item) => !item.permission || canAdmin(role, item.permission)) })).filter((section) => section.items.length);
  const activeHref = [adminOverview, ...sections.flatMap((section) => section.items)]
    .filter((item) => isActive(pathname, item.href))
    .sort((a, b) => (b.href?.length || 0) - (a.href?.length || 0))[0]?.href;
  return <nav className="space-y-2" aria-label="Admin navigation"><NavItem item={adminOverview} activeHref={activeHref} onNavigate={onNavigate} />{sections.map((section) => <NavSection key={section.label} section={section} activeHref={activeHref} onNavigate={onNavigate} />)}</nav>;
}

export default function AdminTopBar({ adminName, adminEmail, adminRole }: Props) {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const roleLabel = ADMIN_ROLE_LABELS[adminRole] || String(adminRole);
  const signOut = async () => { await createClient().auth.signOut(); window.location.href = "/login"; };

  return <>
    <aside className="fixed inset-y-0 left-0 z-[90] hidden w-64 flex-col border-r border-white/10 bg-[#070707]/98 text-white shadow-2xl shadow-black/50 xl:flex">
      <div className="flex h-20 items-center gap-3 px-6"><Image src="/toh_logo.png" alt="TheOutHaven" width={38} height={38} className="rounded-2xl" priority /><div className="min-w-0"><p className="truncate text-sm font-black tracking-wide">THEOUTHAVEN</p><p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200/60">Admin</p></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"><Navigation role={adminRole} pathname={pathname} /></div>
      <div className="border-t border-white/10 p-4"><div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black">{initials(adminName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{adminName}</p><p className="truncate text-xs text-white/45">{adminEmail || roleLabel}</p></div><button type="button" onClick={signOut} aria-label="Sign out" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button></div></div>
    </aside>
    <header className="sticky top-0 z-[80] border-b border-white/10 bg-[#070707]/95 text-white backdrop-blur-xl">
      <div className="flex h-16 max-w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"><Link href="/admin/dashboard" className="flex min-w-0 items-center gap-3 xl:hidden"><Image src="/toh_logo.png" alt="TheOutHaven" width={34} height={34} className="rounded-xl" priority /><span className="truncate text-sm font-black">TheOutHaven Admin</span></Link><div className="hidden min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/45 xl:flex"><Search className="h-4 w-4" /> Premium operations console</div><div className="ml-auto flex items-center gap-2"><span className="hidden items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-50 sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" />{roleLabel}</span><button type="button" onClick={() => setMobileOpen((value) => !value)} aria-expanded={mobileOpen} aria-controls="mobile-admin-navigation" aria-label="Toggle admin navigation" className="rounded-lg border border-white/10 bg-white/[0.06] p-2 xl:hidden">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button><span className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-black sm:flex">{initials(adminName)}</span></div></div>
      {mobileOpen ? <div id="mobile-admin-navigation" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/10 px-4 py-3 xl:hidden"><Navigation role={adminRole} pathname={pathname} onNavigate={() => setMobileOpen(false)} /></div> : null}
    </header>
  </>;
}
