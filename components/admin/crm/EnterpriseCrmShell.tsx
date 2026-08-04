"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import {
  Activity, Bell, BookOpen, BriefcaseBusiness, Building2, CalendarDays, ChevronLeft, ChevronRight,
  ClipboardCheck, Clock3, Contact, Gauge, Headphones, Home, LayoutDashboard, ListChecks, MapPin,
  Menu, MessageSquare, PieChart, Plus, Search, ShieldAlert, Sparkles, Target, UserRoundCheck, X,
} from "lucide-react";

export type CrmNavItem = { id: string; label: string; href: string; group: string; icon: ComponentType<{ className?: string }>; match?: string[]; badge?: string };

export const enterpriseCrmNavigation: CrmNavItem[] = [
  { id: "home", label: "Home", href: "/admin/dashboard/crm", group: "Workspace", icon: Home },
  { id: "my-work", label: "My Work", href: "/admin/dashboard/crm/work-queue", group: "Workspace", icon: ClipboardCheck, match: ["/admin/dashboard/crm/my-work", "/admin/dashboard/crm/my-queue"] },
  { id: "tasks", label: "Tasks", href: "/admin/dashboard/crm/tasks", group: "Workspace", icon: ListChecks },
  { id: "calendar", label: "Calendar", href: "/admin/dashboard/crm/calendar", group: "Workspace", icon: CalendarDays },
  { id: "notifications", label: "Notifications", href: "/admin/dashboard/crm/notifications", group: "Workspace", icon: Bell },
  { id: "accounts", label: "Accounts", href: "/admin/dashboard/crm/accounts", group: "Relationships", icon: Building2 },
  { id: "contacts", label: "Contacts", href: "/admin/dashboard/crm/contacts", group: "Relationships", icon: Contact },
  { id: "locations", label: "Locations", href: "/admin/dashboard/crm/locations", group: "Relationships", icon: MapPin, match: ["/admin/dashboard/crm/"] },
  { id: "claims", label: "Claims", href: "/admin/dashboard/crm/claims", group: "Relationships", icon: UserRoundCheck },
  { id: "opportunities", label: "Opportunities", href: "/admin/dashboard/crm/opportunities", group: "Sales", icon: Target },
  { id: "outreach", label: "Outreach", href: "/admin/dashboard/crm/outreach", group: "Sales", icon: MessageSquare, match: ["/admin/dashboard/crm/social-outreach"] },
  { id: "follow-ups", label: "Follow-ups", href: "/admin/dashboard/crm/follow-ups", group: "Sales", icon: Clock3 },
  { id: "site-visits", label: "Site Visits", href: "/admin/dashboard/crm/site-visits", group: "Sales", icon: CalendarDays },
  { id: "support", label: "Support", href: "/admin/dashboard/crm/support", group: "Service", icon: Headphones },
  { id: "escalations", label: "Escalations", href: "/admin/dashboard/crm/escalations", group: "Service", icon: ShieldAlert },
  { id: "change-requests", label: "Change Requests", href: "/admin/dashboard/crm/change-requests", group: "Service", icon: BriefcaseBusiness },
  { id: "operations", label: "Operations Center", href: "/admin/dashboard/crm/operations", group: "Operations", icon: Gauge },
  { id: "claim-codes", label: "Claim Codes", href: "/admin/dashboard/crm/claim-codes", group: "Operations", icon: Sparkles },
  { id: "reports", label: "Reports", href: "/admin/dashboard/crm/reports", group: "Intelligence", icon: PieChart },
  { id: "performance", label: "Performance", href: "/admin/dashboard/crm/performance", group: "Intelligence", icon: LayoutDashboard },
  { id: "activity", label: "Activity Audit", href: "/admin/dashboard/crm/activity-audit", group: "Intelligence", icon: Activity },
  { id: "knowledge", label: "Knowledge Base", href: "/admin/dashboard/crm/knowledge-base", group: "Resources", icon: BookOpen },
];

function isActive(pathname: string, item: CrmNavItem) {
  if (item.href === "/admin/dashboard/crm") return pathname === item.href;
  return pathname === item.href.split("?")[0] || pathname.startsWith(`${item.href.split("?")[0]}/`) || item.match?.some((m) => pathname.startsWith(m));
}

function CrmNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname() || "";
  const groups = useMemo(() => enterpriseCrmNavigation.reduce<Record<string, CrmNavItem[]>>((acc, item) => ((acc[item.group] ||= []).push(item), acc), {}), []);
  return <nav aria-label="Enterprise CRM" className="space-y-5 px-3 pb-5">{Object.entries(groups).map(([group, items]) => <section key={group}><p className={`mb-2 px-3 text-[11px] font-bold uppercase tracking-wide text-zinc-500 ${collapsed ? "sr-only" : ""}`}>{group}</p><div className="space-y-1">{items.map((item) => { const Icon = item.icon; const active = isActive(pathname, item); return <Link onClick={onNavigate} title={item.label} aria-current={active ? "page" : undefined} key={item.id} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#ec0b5b] ${active ? "bg-[#ec0b5b] text-white shadow-lg shadow-rose-950/20" : "text-zinc-300 hover:bg-white/8 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" />{collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}{!collapsed && item.badge ? <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{item.badge}</span> : null}</Link>; })}</div></section>)}</nav>;
}

export default function EnterpriseCrmShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false); const [drawer, setDrawer] = useState(false); const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); } if (e.key === "Escape") { setSearchOpen(false); setDrawer(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  const pathname = usePathname() || "/admin/dashboard/crm";
  const current = enterpriseCrmNavigation.find((i) => isActive(pathname, i));
  return <div className="min-h-screen bg-[#070707] text-[#f8f8fa]"><aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-white/10 bg-[#0c0c0e] transition-all lg:block ${collapsed ? "w-[76px]" : "w-72"}`}><div className="flex h-16 items-center gap-3 border-b border-white/10 px-4"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#ec0b5b] font-black">OH</div>{!collapsed && <div><p className="font-black leading-tight">TheOutHaven</p><p className="text-xs text-zinc-400">Admin CRM</p></div>}<button aria-label="Collapse sidebar" onClick={() => setCollapsed(!collapsed)} className="ml-auto rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">{collapsed ? <ChevronRight className="h-4 w-4"/> : <ChevronLeft className="h-4 w-4"/>}</button></div><CrmNav collapsed={collapsed} /></aside>{drawer && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close navigation overlay" className="absolute inset-0 bg-black/70" onClick={() => setDrawer(false)} /><aside className="relative h-full w-[min(86vw,320px)] overflow-y-auto bg-[#0c0c0e] shadow-2xl"><div className="flex h-16 items-center gap-3 border-b border-white/10 px-4"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#ec0b5b] font-black">OH</div><div><p className="font-black">TheOutHaven</p><p className="text-xs text-zinc-400">Admin CRM</p></div><button aria-label="Close CRM navigation" onClick={() => setDrawer(false)} className="ml-auto rounded-lg p-2 text-zinc-300 hover:bg-white/10"><X className="h-4 w-4"/></button></div><CrmNav collapsed={false} onNavigate={() => setDrawer(false)} /></aside></div>}<div className={`min-w-0 transition-all ${collapsed ? "lg:pl-[76px]" : "lg:pl-72"}`}><header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/10 bg-[#121216]/95 px-4 backdrop-blur"><button aria-label="Open CRM navigation" onClick={() => setDrawer(true)} className="rounded-lg p-2 text-zinc-200 hover:bg-white/10 lg:hidden"><Menu className="h-5 w-5"/></button><div className="hidden min-w-0 text-sm text-zinc-400 sm:block"><Link href="/admin/dashboard" className="hover:text-white">Admin</Link><span className="px-2">/</span><Link href="/admin/dashboard/crm" className="hover:text-white">CRM</Link>{current && <><span className="px-2">/</span><span className="text-white">{current.label}</span></>}</div><button onClick={() => setSearchOpen(true)} className="ml-auto flex h-10 w-full max-w-xl items-center gap-2 rounded-xl border border-white/10 bg-[#18181d] px-3 text-left text-sm text-zinc-400 hover:border-white/20"><Search className="h-4 w-4"/><span className="truncate">Search accounts, locations, claims, tasks…</span><kbd className="ml-auto hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd></button><Link href="/admin/dashboard/crm/work-queue/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ec0b5b] px-3 text-sm font-bold text-white hover:bg-[#ff206e]"><Plus className="h-4 w-4"/><span className="hidden sm:inline">Quick create</span></Link><Link aria-label="Notifications" href="/admin/dashboard/crm/notifications" className="rounded-xl border border-white/10 bg-[#18181d] p-2.5 text-zinc-200 hover:text-white"><Bell className="h-4 w-4"/></Link><div aria-label="User menu" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xs font-black">A</div></header><main className="min-w-0 overflow-x-hidden bg-[radial-gradient(circle_at_top_right,rgba(236,11,91,0.08),transparent_26%),#070707] px-3 py-4 sm:px-5 lg:px-6"><div className="mx-auto w-full max-w-[1500px] min-w-0">{children}</div></main></div>{searchOpen && <div role="dialog" aria-modal="true" aria-label="Global CRM search" className="fixed inset-0 z-50 grid place-items-start bg-black/70 px-4 pt-[12vh]" onClick={() => setSearchOpen(false)}><div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#121216] p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#18181d] px-3"><Search className="h-4 w-4 text-zinc-400"/><input autoFocus className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500" placeholder="Type 2+ characters to search real CRM records"/><button onClick={() => setSearchOpen(false)} className="rounded-lg p-1 text-zinc-400 hover:text-white"><X className="h-4 w-4"/></button></div><div className="px-3 py-8 text-center text-sm text-zinc-400">Authorized server search is available from module search fields; global command launcher shell is ready for backend binding.</div></div></div>}</div>;
}
