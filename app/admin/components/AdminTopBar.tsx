"use client";

import type React from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { normalizeRole } from "@/lib/users/roles";

type SearchResult = {
  type: "user" | "location";
  locationType?: "restaurants" | "activities";
  id: string;
  title: string;
  subtitle: string;
  meta: string;
};

type NavItem = { label: string; href: string; visible: boolean; external?: boolean; neverActive?: boolean };
type NavGroup = { label: string; items: NavItem[] };

export default function AdminTopBar() {
  const supabase = createClient();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openMobileGroups, setOpenMobileGroups] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const currentUser = data.user;
      setUser(currentUser);
      if (currentUser?.id) {
        const { data: adminUser } = await supabase
          .from("admin_users")
          .select("role")
          .eq("user_id", currentUser.id)
          .maybeSingle();
        setRole(adminUser?.role ? normalizeRole(adminUser.role) : null);
      }
    })();
  }, [supabase]);

  useEffect(() => {
    const cleanQuery = query.trim();
    if (!showUserSearch || cleanQuery.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(cleanQuery)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, showUserSearch]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowUserSearch(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const canView = ["superadmin", "admin", "editor", "viewer"].includes(role || "");
  const canViewUsers = ["superadmin", "admin"].includes(role || "");

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        label: "Operations",
        items: [
          { label: "Dashboard", href: "/admin/dashboard", visible: canView },
          { label: "Reservations", href: "/admin/dashboard/reservations", visible: canView },
          { label: "Reviews", href: "/admin/dashboard/reviews", visible: canView },
          { label: "Communication", href: "/admin/dashboard/communication", visible: canView },
        ],
      },
      {
        label: "Platform",
        items: [
          { label: "Locations", href: "/admin/dashboard/locations", visible: canView },
          { label: "Users", href: "/admin/dashboard/users", visible: canViewUsers },
          { label: "Promo Codes", href: "/admin/dashboard/settings/promo-codes", visible: canView },
          { label: "Analytics", href: "/admin/dashboard/analytics", visible: canView },
          { label: "Launch Checklist", href: "/admin/dashboard/launch-checklist", visible: canView },
        ],
      },
      {
        label: "Business",
        items: [
          { label: "Claims", href: "/admin/dashboard/claims", visible: canView },
          { label: "Billing", href: "/admin/dashboard/billing", visible: canView },
          { label: "Owner Accounts", href: "/admin/dashboard/owner-accounts", visible: canView },
          { label: "Plans", href: "/admin/dashboard/plans", visible: canView },
        ],
      },
      {
        label: "Marketing",
        items: [
          { label: "Campaigns", href: "/admin/dashboard/campaigns", visible: canView },
          { label: "SMS", href: "/admin/dashboard/sms", visible: canView },
          { label: "Email Templates", href: "/admin/dashboard/email-templates", visible: canView },
          { label: "SEO Tools", href: "/admin/dashboard/seo-tools", visible: canView },
        ],
      },
      {
        label: "Settings",
        items: [
          { label: "General Settings", href: "/admin/dashboard/settings", visible: canView },
          { label: "Promo Codes", href: "/admin/dashboard/settings/promo-codes", visible: canView },
          { label: "Feature Flags", href: "/admin/dashboard/feature-flags", visible: canView },
          { label: "System Logs", href: "/admin/dashboard/logs", visible: canView },
        ],
      },
      {
        label: "View Site",
        items: [{ label: "Public Homepage", href: "/", visible: canView, external: true, neverActive: true }],
      },
    ],
    [canView, canViewUsers],
  );

  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.visible) }))
    .filter((group) => group.items.length > 0);

  const isItemActive = (item: NavItem) => !item.neverActive && (pathname === item.href || pathname?.startsWith(`${item.href}/`));
  const isGroupActive = (group: NavGroup) => group.items.some((item) => isItemActive(item));

  const goTo = (p: string) => {
    setOpen(false);
    setShowUserSearch(false);
    window.location.href = p;
  };

  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || "Admin";

  return (
    <header className="sticky top-0 z-[100] border-b border-white/10 bg-[#090706]/95 text-white shadow-2xl backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button type="button" onClick={() => goTo("/admin/dashboard")} className="group flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-300/30 bg-gradient-to-br from-rose-200 to-amber-200 text-lg font-black text-[#6f102a] shadow-xl">
            R
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-lg font-black tracking-tight text-white">TheOutHaven</p>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-rose-200/70">Admin</p>
          </div>
        </button>

        <nav className="hidden items-center gap-2 lg:flex" aria-label="Admin sections">
          {visibleGroups.map((group) => (
            <div key={group.label} className="group relative">
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm font-bold transition-all duration-150 ${
                  isGroupActive(group)
                    ? "border-rose-300/40 bg-gradient-to-r from-rose-900/45 to-amber-900/35 text-rose-100 shadow-[0_10px_30px_rgba(120,35,60,0.35)]"
                    : "border-white/10 bg-[#120d0b] text-white/80 hover:border-rose-300/30 hover:text-white"
                }`}
              >
                {group.label}
                <ChevronDown className="h-4 w-4" />
              </button>
              <div className="invisible absolute left-0 top-full z-[120] mt-2 w-64 rounded-2xl border border-white/10 bg-[#120d0b] p-2 text-white opacity-0 shadow-2xl backdrop-blur-xl transition-all group-hover:visible group-hover:opacity-100">
                {group.items.map((item) => {
                  const itemActive = isItemActive(item);
                  return (
                    <Link
                      key={`${group.label}-${item.href}`}
                      href={item.href}
                      className={`mt-1 flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        itemActive
                          ? "border-rose-300/30 bg-gradient-to-r from-rose-900/30 to-amber-900/20 text-white shadow-[0_8px_24px_rgba(120,35,60,0.28)]"
                          : "border-transparent text-white/80 hover:border-white/10 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.external && <ExternalLink className="h-3.5 w-3.5" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="rounded-full border border-white/10 bg-[#120d0b] px-3 py-2 text-sm font-semibold text-white/90 lg:hidden"
          >
            Menu
          </button>
          <div className="relative" ref={dropdownRef}>
            <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm">
              {name}
            </button>
            {open && (
              <div className="absolute right-0 z-[9999] mt-3 w-[calc(100vw-2rem)] max-w-[24rem] rounded-2xl border border-white/10 bg-[#120d0b] p-3">
                <div className="grid gap-1">
                  {visibleGroups.flatMap((g) => g.items).map((link) => (
                    <Link onClick={() => setOpen(false)} key={link.href} href={link.href} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-white/80 hover:bg-white/5">
                      <span>{link.label}</span>
                      {link.external && <ExternalLink className="h-3.5 w-3.5" />}
                    </Link>
                  ))}
                </div>
                {canViewUsers && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <button type="button" onClick={() => setShowUserSearch((p) => !p)} className="w-full rounded-xl bg-rose-500/20 px-3 py-2 text-left text-sm font-bold">
                      View as User or Location
                    </button>
                    {showUserSearch && <div className="mt-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm" />{searching && <p className="mt-2 text-xs text-white/50">Searching...</p>}{results.map((item) => (<button key={item.id} disabled={Boolean(impersonatingId)} className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-left text-xs">{item.title}</button>))}</div>}
                  </div>
                )}
                <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }} className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-sm">Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileNavOpen && (
        <div className="border-t border-white/10 bg-[#090706] px-4 pb-4 lg:hidden">
          <div className="mt-3 space-y-2">
            {visibleGroups.map((group) => {
              const groupOpen = Boolean(openMobileGroups[group.label]);
              const active = isGroupActive(group);
              return (
                <div key={group.label} className="overflow-hidden rounded-2xl border border-white/10 bg-[#120d0b]">
                  <button
                    type="button"
                    onClick={() => setOpenMobileGroups((prev) => ({ ...prev, [group.label]: !prev[group.label] }))}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold ${active ? "text-rose-100" : "text-white"}`}
                  >
                    {group.label}
                    <ChevronDown className={`h-4 w-4 transition-transform ${groupOpen ? "rotate-180" : ""}`} />
                  </button>
                  {groupOpen && (
                    <div className="border-t border-white/10 p-2">
                      {group.items.map((item) => {
                        const itemActive = isItemActive(item);
                        return (
                          <Link
                            key={`${group.label}-mobile-${item.href}`}
                            href={item.href}
                            onClick={() => setMobileNavOpen(false)}
                            className={`mt-1 flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                              itemActive
                                ? "border-rose-300/30 bg-gradient-to-r from-rose-900/35 to-amber-900/25 text-white"
                                : "border-transparent text-white/80 hover:bg-white/5"
                            }`}
                          >
                            <span>{item.label}</span>
                            {item.external && <ExternalLink className="h-3.5 w-3.5" />}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
