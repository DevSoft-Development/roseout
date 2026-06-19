"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, CheckSquare, ClipboardCheck, CreditCard, Flag, Gift, Home, LineChart, LogOut, MapPin, QrCode, Search, Settings, ShieldCheck, Users } from "lucide-react";
import type { AdminRole } from "@/lib/users/roles";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-permissions";
import { createClient } from "@/lib/supabase-browser";

type Props = { adminName: string; adminEmail: string; adminRole: AdminRole };

const navItems = [
  ["Overview", "/admin/dashboard", Home],
  ["CRM", "/admin/dashboard/crm", Users],
  ["Partner Launch", "/admin/dashboard/businesses/outreach", Flag],
  ["Claims", "/admin/dashboard/claims", ClipboardCheck],
  ["Claim QRs", "/admin/dashboard/claim-qrs", QrCode],
  ["Locations", "/admin/dashboard/locations", MapPin],
  ["Analytics", "/admin/dashboard/analytics", BarChart3],
  ["Search Health", "/admin/dashboard/search-health", LineChart],
  ["Giveaway", "/admin/dashboard/giveaway", Gift],
  ["Businesses", "/admin/dashboard/businesses", Building2],
  ["Tasks", "/admin/dashboard/my-workspace/tasks", CheckSquare],
  ["Billing", "/admin/dashboard/billing", CreditCard],
  ["Settings", "/admin/dashboard/settings", Settings],
] as const;

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("") || "A";
}

export default function AdminTopBar({ adminName, adminEmail, adminRole }: Props) {
  const pathname = usePathname();
  const roleLabel = ADMIN_ROLE_LABELS[adminRole] || String(adminRole);
  const supabase = createClient();
  const signOut = async () => { await supabase.auth.signOut(); window.location.href = "/login"; };

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-[90] hidden w-64 flex-col border-r border-white/10 bg-[#070707]/98 text-white shadow-2xl shadow-black/50 xl:flex">
        <div className="flex h-24 items-center gap-3 px-6">
          <Image src="/toh_logo.png" alt="TheOutHaven" width={38} height={38} className="rounded-2xl" priority />
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-wide">THEOUTHAVEN</p>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200/60">Admin</p>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4" aria-label="Admin navigation">
          {navItems.map(([label, href, Icon]) => {
            const active = href === "/admin/dashboard" ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${active ? "bg-white/[0.07] text-white" : "text-white/62 hover:bg-white/[0.045] hover:text-white"}`}>
                {active ? <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-[#ec0b5b]" /> : null}
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#ec0b5b]" : "text-white/55 group-hover:text-white/80"}`} />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black">{initials(adminName)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">{adminName}</p>
              <p className="truncate text-xs text-white/45">{adminEmail || roleLabel}</p>
            </div>
            <button type="button" onClick={signOut} aria-label="Sign out" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-[80] border-b border-white/10 bg-[#070707]/95 text-white backdrop-blur-xl">
        <div className="flex h-16 max-w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/admin/dashboard" className="flex min-w-0 items-center gap-3 xl:hidden">
            <Image src="/toh_logo.png" alt="TheOutHaven" width={34} height={34} className="rounded-xl" priority />
            <span className="truncate text-sm font-black">TheOutHaven Admin</span>
          </Link>
          <div className="hidden min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/45 xl:flex"><Search className="h-4 w-4" /> Premium operations console</div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-50 sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" />{roleLabel}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-black">{initials(adminName)}</span>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-2 xl:hidden" aria-label="Mobile admin navigation">
          {navItems.map(([label, href]) => <Link key={href} href={href} className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/70">{label}</Link>)}
        </nav>
      </header>
    </>
  );
}
