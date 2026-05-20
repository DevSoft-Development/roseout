"use client";

import type React from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type SearchResult = {
  type: "user" | "location";
  locationType?: "restaurants" | "activities";
  id: string;
  title: string;
  subtitle: string;
  meta: string;
};

type NavLink = { label: string; href: string; visible: boolean };
type NavGroup = { label: string; links: NavLink[]; visible: boolean };

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
  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const currentUser = data.user;
      setUser(currentUser);
      if (currentUser?.email) {
        const { data: adminUser } = await supabase
          .from("admin_users")
          .select("role")
          .eq("email", currentUser.email.toLowerCase())
          .maybeSingle();
        setRole(adminUser?.role || currentUser.user_metadata?.role || null);
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDesktopMenu(null);
        setOpen(false);
        setShowUserSearch(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const canView = ["superuser", "admin", "editor", "viewer"].includes(role || "");
  const canViewUsers = ["superuser", "admin"].includes(role || "");
  const canClaims = ["superuser", "admin", "reviewer"].includes(role || "");
  const canEdit = ["superuser", "admin", "editor"].includes(role || "");

  const groups: NavGroup[] = [
    {
      label: "Overview",
      visible: canView,
      links: [
        { label: "Dashboard Home", href: "/admin/dashboard", visible: canView },
        { label: "Admin Platform", href: "/admin/dashboard", visible: canView },
        { label: "Analytics", href: "/admin/dashboard/analytics", visible: canView },
        { label: "Reports (Logs)", href: "/admin/dashboard/logs", visible: canView },
      ],
    },
    {
      label: "Locations",
      visible: canView,
      links: [
        { label: "All Locations", href: "/admin/dashboard/locations", visible: canView },
        { label: "Import Locations", href: "/admin/dashboard/import", visible: canView },
        { label: "Claim Requests", href: "/admin/claims", visible: canClaims },
        { label: "Location Layout", href: "/admin/dashboard/location-layout", visible: canView },
        { label: "Create/Edit Layout", href: "/admin/dashboard/location-layout/create", visible: canEdit },
      ],
    },
    {
      label: "Reservations",
      visible: canView,
      links: [
        { label: "Reservations", href: "/admin/dashboard/reservations", visible: canView },
        { label: "Live Hostess View", href: "/admin/dashboard/reserve", visible: canView },
        {
          label: "Reservation Settings",
          href: "/admin/dashboard/reservations/location-layout",
          visible: canView,
        },
      ],
    },
    {
      label: "Businesses",
      visible: canView,
      links: [
        { label: "Business View", href: "/admin/dashboard/businesses/view", visible: canView },
        { label: "CRM Pipeline", href: "/admin/dashboard/business-crm", visible: canView },
        { label: "Upgrade Opportunities", href: "/admin/dashboard/businesses/upgrade-opportunities", visible: canView },
        { label: "Outreach", href: "/admin/dashboard/businesses/outreach", visible: canView },
        { label: "Followups", href: "/admin/dashboard/businesses/followups", visible: canView },
        { label: "Churn Risk", href: "/admin/dashboard/businesses/churn-risk", visible: canView },
        { label: "Communication Center", href: "/admin/dashboard/communication", visible: canView },
        { label: "Admin Locations", href: "/admin/locations", visible: canView },
        { label: "Restaurants", href: "/admin/restaurants", visible: canView },
        { label: "Activities", href: "/admin/activities", visible: canView },
      ],
    },
    {
      label: "Operations",
      visible: canView,
      links: [
        { label: "Semantic Cleanup", href: "/admin/dashboard/data-quality", visible: canView },
        { label: "Test + Tune", href: "/admin/dashboard/operations/test-tune", visible: canView },
        { label: "User Edit", href: "/admin/dashboard/operations/users", visible: canViewUsers },
        { label: "Missing Reservation Links", href: "/admin/dashboard/reservation", visible: canView },
        { label: "Data Quality", href: "/admin/dashboard/data-quality", visible: canView },
        { label: "Background Jobs", href: "/admin/dashboard/logs", visible: canView },
      ],
    },
    {
      label: "Marketing",
      visible: canView,
      links: [
        { label: "Campaigns", href: "/admin/dashboard/marketing", visible: canView },
        { label: "Social Promotions", href: "/admin/dashboard/marketing/settings", visible: canView },
        { label: "Featured Outings", href: "/admin/dashboard/marketing/featured-outings", visible: canView },
      ],
    },
    {
      label: "Settings",
      visible: canView,
      links: [
        { label: "Admin Users", href: "/admin/dashboard/users", visible: canViewUsers },
        { label: "Reviews", href: "/admin/dashboard/reviews", visible: canView },
        { label: "Support", href: "/admin/dashboard/support", visible: canView },
        { label: "API Tools", href: "/admin/search-qa", visible: canView },
        { label: "Settings Home", href: "/admin/dashboard/settings", visible: canView },
        { label: "Promo Codes", href: "/admin/dashboard/settings/promo-codes", visible: canView },
      ],
    },
  ];

  const visibleGroups = useMemo(() => groups.filter((g) => g.visible), [groups]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openDesktopMenu = (label: string) => {
    clearCloseTimer();
    setActiveDesktopMenu(label);
  };

  const closeDesktopMenuWithDelay = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setActiveDesktopMenu(null), 180);
  };

  const goTo = (p: string) => {
    setOpen(false);
    setShowUserSearch(false);
    window.location.href = p;
  };

  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || "Admin";

  return (
    <header className="sticky top-0 z-[100] border-b border-white/10 bg-[#090706]/95 text-white shadow-2xl backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => goTo("/admin/dashboard")}
          className="group flex min-w-0 items-center gap-3"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-300/30 bg-gradient-to-br from-rose-200 to-amber-200 text-lg font-black text-[#6f102a] shadow-xl">
            R
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-lg font-black tracking-tight text-white">TheOutHaven</p>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-rose-200/70">Admin</p>
          </div>
        </button>

        <nav
          ref={desktopNavRef}
          className="relative hidden items-center gap-1 overflow-visible lg:flex"
          aria-label="Admin sections"
        >
          {visibleGroups.map((group) => {
            const isOpen = activeDesktopMenu === group.label;
            const hasActiveChild = group.links.some((l) => pathname === l.href || pathname?.startsWith(`${l.href}/`));
            const isActive = hasActiveChild || (group.label === "Overview" && pathname === "/admin/dashboard");

            return (
              <div key={group.label} className="relative pt-1" onMouseEnter={() => openDesktopMenu(group.label)} onMouseLeave={closeDesktopMenuWithDelay}>
                <button
                  type="button"
                  onMouseEnter={() => openDesktopMenu(group.label)}
                  onFocus={() => openDesktopMenu(group.label)}
                  onClick={() => setActiveDesktopMenu((current) => (current === group.label ? null : group.label))}
                  className={`rounded-full border px-4 py-2 text-sm font-bold transition-all duration-150 ${
                    isActive
                      ? "border-rose-300/40 bg-gradient-to-r from-rose-900/45 to-amber-900/35 text-rose-100 shadow-[0_10px_30px_rgba(120,35,60,0.35)]"
                      : "border-white/10 bg-[#120d0b] text-white/70 hover:border-rose-300/30 hover:text-white"
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  aria-controls={`admin-menu-${group.label.toLowerCase()}`}
                >
                  {group.label}
                </button>

                <div
                  id={`admin-menu-${group.label.toLowerCase()}`}
                  role="menu"
                  aria-label={`${group.label} menu`}
                  className={`absolute left-0 top-full min-w-64 rounded-2xl border border-white/10 bg-[#120d0b] p-2 shadow-2xl transition-all duration-180 ${
                    isOpen
                      ? "pointer-events-auto z-[120] translate-y-0 opacity-100"
                      : "pointer-events-none z-[-1] -translate-y-1 opacity-0"
                  }`}
                >
                  {group.links
                    .filter((l) => l.visible)
                    .map((link) => {
                      const linkActive = pathname === link.href || pathname?.startsWith(`${link.href}/`);
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          role="menuitem"
                          className={`block rounded-xl px-3 py-2 text-sm transition-colors duration-150 ${
                            linkActive
                              ? "border border-rose-300/20 bg-gradient-to-r from-rose-900/45 to-amber-900/35 text-rose-100 shadow-[0_0_25px_rgba(244,63,94,0.12)]"
                              : "text-white/80 hover:bg-white/10 hover:text-white focus:bg-white/10"
                          }`}
                          onClick={() => setActiveDesktopMenu(null)}
                        >
                          {link.label}
                        </Link>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm"
          >
            {name}
          </button>
          {open && (
            <div className="absolute right-0 z-[9999] mt-3 w-[calc(100vw-2rem)] max-w-[24rem] rounded-2xl border border-white/10 bg-[#120d0b] p-3">
              <div className="grid gap-2">
                {visibleGroups.map((g) => (
                  <details key={g.label} className="rounded-xl border border-white/10 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-black">{g.label}</summary>
                    <div className="mt-2 grid gap-1">
                      {g.links
                        .filter((l) => l.visible)
                        .map((l) => (
                          <Link
                            onClick={() => setOpen(false)}
                            key={l.href}
                            href={l.href}
                            className="rounded-lg px-2 py-2 text-sm text-white/80 hover:bg-white/10"
                          >
                            {l.label}
                          </Link>
                        ))}
                    </div>
                  </details>
                ))}
              </div>
              {canViewUsers && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowUserSearch((p) => !p)}
                    className="w-full rounded-xl bg-rose-500/20 px-3 py-2 text-left text-sm font-bold"
                  >
                    View as User or Location
                  </button>
                  {showUserSearch && (
                    <div className="mt-2">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                      />
                      {searching && <p className="mt-2 text-xs text-white/50">Searching...</p>}
                      {results.map((item) => (
                        <button
                          key={item.id}
                          disabled={Boolean(impersonatingId)}
                          className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-left text-xs"
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
                className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-sm"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
