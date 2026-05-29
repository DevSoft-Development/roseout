"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  UserCircle,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type AdminRole = "superadmin" | "admin" | "editor" | "viewer";

type AdminTopBarProps = {
  adminName: string;
  adminEmail: string;
  adminRole: AdminRole;
};

type SearchResult = {
  type: "user" | "location";
  locationType?: "restaurants" | "activities";
  id: string;
  title: string;
  subtitle: string;
  meta: string;
};

type NavItem = {
  label: string;
  href: string;
  visible: boolean;
  external?: boolean;
  neverActive?: boolean;
  exact?: boolean;
  activePrefixes?: string[];
};

type NavGroup = { label: string; items: NavItem[] };

const roleLabels: Record<AdminRole, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function searchResultHref(item: SearchResult) {
  if (item.type === "user") {
    return `/admin/dashboard/users/${item.id}`;
  }

  if (item.locationType === "activities") {
    return `/admin/dashboard/locations/activities/${item.id}`;
  }

  return `/admin/dashboard/locations/restaurants/${item.id}`;
}

function initialsFromName(name: string) {
  const initials = name
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return initials || "A";
}

export default function AdminTopBar({ adminName, adminEmail, adminRole }: AdminTopBarProps) {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openMobileGroups, setOpenMobileGroups] = useState<Record<string, boolean>>({});
  const [openNavGroup, setOpenNavGroup] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const canView = ["superadmin", "admin", "editor", "viewer"].includes(adminRole);
  const canViewUsers = ["superadmin", "admin"].includes(adminRole);

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        label: "Overview",
        items: [
          { label: "Dashboard", href: "/admin/dashboard", visible: canView, exact: true },
          { label: "Launch Checklist", href: "/admin/dashboard/launch-checklist", visible: canView },
          { label: "Support", href: "/admin/dashboard/support", visible: canView },
          { label: "Logs", href: "/admin/dashboard/logs", visible: canView },
        ],
      },
      {
        label: "Operations",
        items: [
          { label: "Reviews", href: "/admin/dashboard/reviews", visible: canView },
          { label: "Communication", href: "/admin/dashboard/communication", visible: canView },
          { label: "Search QA", href: "/admin/search-qa", visible: canView },
        ],
      },
      {
        label: "Locations",
        items: [
          { label: "All Locations", href: "/admin/dashboard/locations", visible: canView },
          { label: "Add Location", href: "/admin/dashboard/locations/new", visible: canView },
          { label: "Import", href: "/admin/dashboard/import", visible: canView },
          { label: "Data Quality", href: "/admin/dashboard/data-quality", visible: canView },
          { label: "Claim QRs", href: "/admin/dashboard/claim-qrs", visible: canView },
          { label: "Claim Tools", href: "/admin/dashboard/claim-tools", visible: canView },
        ],
      },
      {
        label: "Owners",
        items: [
          { label: "Claims", href: "/admin/dashboard/claims", visible: canView },
          { label: "Owner Accounts", href: "/admin/dashboard/owner-accounts", visible: canView },
          { label: "Businesses", href: "/admin/dashboard/businesses/view", visible: canView },
          { label: "Business CRM", href: "/admin/dashboard/business-crm", visible: canView },
          { label: "Billing", href: "/admin/dashboard/billing", visible: canView },
          { label: "Plans", href: "/admin/dashboard/plans", visible: canView },
        ],
      },
      {
        label: "Reservations",
        items: [
          { label: "Reservations", href: "/admin/dashboard/reservations", visible: canView },
          { label: "Reservation Layout", href: "/admin/dashboard/reservations/location-layout", visible: canView },
        ],
      },
      {
        label: "Analytics",
        items: [
          { label: "Analytics", href: "/admin/dashboard/analytics", visible: canView },
          { label: "Reservation Opportunities", href: "/admin/dashboard/reservation-opportunities", visible: canView },
          { label: "Upgrade Opportunities", href: "/admin/dashboard/businesses/upgrade-opportunities", visible: canView },
          { label: "Churn Risk", href: "/admin/dashboard/businesses/churn-risk", visible: canView },
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
          { label: "General Settings", href: "/admin/dashboard/settings", visible: canView, exact: true },
          { label: "Promo Codes", href: "/admin/dashboard/settings/promo-codes", visible: canView },
          { label: "Feature Flags", href: "/admin/dashboard/feature-flags", visible: canView },
          { label: "Users", href: "/admin/dashboard/users", visible: canViewUsers },
          { label: "Platform Settings", href: "/admin/platform", visible: canViewUsers },
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

  const isItemActive = (item: NavItem) => {
    if (item.neverActive || !pathname) return false;
    if (item.exact) return pathname === item.href;
    const activePaths = [item.href, ...(item.activePrefixes || [])];
    return activePaths.some((activePath) => pathname === activePath || pathname.startsWith(`${activePath}/`));
  };

  const isGroupActive = (group: NavGroup) => group.items.some((item) => isItemActive(item));

  useEffect(() => {
    const cleanQuery = query.trim();
    if (!searchOpen || cleanQuery.length < 2) {
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
    }, 250);

    return () => clearTimeout(timer);
  }, [query, searchOpen]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setSearchOpen(false);
        setMobileNavOpen(false);
        setOpenNavGroup(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const closeMenus = () => {
    setProfileOpen(false);
    setSearchOpen(false);
    setMobileNavOpen(false);
    setOpenNavGroup(null);
  };

  const handleSearchResultClick = (item: SearchResult) => {
    closeMenus();
    setQuery("");
    router.push(searchResultHref(item));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const roleLabel = roleLabels[adminRole];

  return (
    <header className="sticky top-0 z-[9000] border-b border-white/10 bg-[#090706]/80 text-white shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/admin/dashboard" onClick={closeMenus} className="group flex min-w-0 items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-rose-200/25 bg-gradient-to-br from-rose-200 via-rose-300 to-amber-200 text-sm font-black tracking-tight text-[#5b1022] shadow-[0_12px_35px_rgba(244,114,182,0.18)]">
            TOH
            <span className="absolute inset-x-1 bottom-1 h-px bg-white/50" />
          </div>
          <div className="hidden min-w-0 text-left sm:block">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-black tracking-tight text-white">TheOutHaven</p>
              <span className="rounded-full border border-rose-200/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-rose-100">
                Live Admin
              </span>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-rose-100/60">Admin Console</p>
          </div>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label="Admin sections">
          {visibleGroups.map((group) => {
            const groupActive = isGroupActive(group);
            const groupOpen = openNavGroup === group.label;

            return (
              <div
                key={group.label}
                className="relative"
                onMouseEnter={() => setOpenNavGroup(group.label)}
                onMouseLeave={() => setOpenNavGroup(null)}
                onFocus={() => setOpenNavGroup(group.label)}
              >
                <button
                  type="button"
                  onClick={() => setOpenNavGroup((current) => (current === group.label ? null : group.label))}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-black transition-all duration-150 2xl:px-4 2xl:text-sm ${
                    groupActive
                      ? "border-rose-200/35 bg-gradient-to-r from-rose-900/50 to-amber-900/30 text-rose-50 shadow-[0_10px_30px_rgba(120,35,60,0.28)]"
                      : "border-white/10 bg-white/[0.045] text-white/75 hover:border-rose-200/25 hover:bg-white/[0.07] hover:text-white"
                  }`}
                  aria-expanded={groupOpen}
                >
                  {group.label}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${groupOpen ? "rotate-180" : ""}`} />
                </button>
                <div
                  className={`absolute left-0 top-full z-[9500] mt-3 w-72 rounded-3xl border border-white/10 bg-[#120d0b]/95 p-2 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all duration-150 ${
                    groupOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
                  }`}
                >
                  <div className="border-b border-white/10 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-100/60">{group.label}</p>
                  </div>
                  {group.items.map((item) => {
                    const itemActive = isItemActive(item);
                    return (
                      <Link
                        key={`${group.label}-${item.href}`}
                        href={item.href}
                        onClick={closeMenus}
                        className={`mt-1 flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                          itemActive
                            ? "border-rose-200/30 bg-gradient-to-r from-rose-900/40 to-amber-900/20 text-white shadow-[0_8px_24px_rgba(120,35,60,0.22)]"
                            : "border-transparent text-white/75 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.external && <ExternalLink className="h-3.5 w-3.5" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative" ref={searchRef}>
            <button
              type="button"
              onClick={() => setSearchOpen((current) => !current)}
              className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-white/80 transition hover:border-rose-200/25 hover:bg-white/[0.08] hover:text-white md:inline-flex"
            >
              <Search className="h-4 w-4 text-rose-100/70" />
              <span className="hidden lg:inline">Search</span>
              <span className="hidden rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-white/40 2xl:inline">⌘K</span>
            </button>
            {searchOpen && (
              <div className="absolute right-0 z-[9600] mt-3 w-[min(26rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-[#120d0b]/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                  <Search className="h-4 w-4 text-rose-100/70" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search users, restaurants, activities..."
                    autoFocus
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                  />
                </div>
                <div className="mt-3 max-h-[24rem] overflow-y-auto pr-1">
                  {searching && <p className="px-2 py-3 text-sm text-white/55">Searching TheOutHaven records…</p>}
                  {!searching && query.trim().length < 2 && (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
                      Type at least two characters to find guests, owners, restaurants, or activities.
                    </div>
                  )}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-rose-200/15 bg-rose-950/10 p-4 text-sm text-white/60">
                      No matching admin records yet. Try a name, email, city, or location address.
                    </div>
                  )}
                  {results.map((item) => (
                    <button
                      type="button"
                      key={`${item.type}-${item.id}`}
                      onClick={() => handleSearchResultClick(item)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-left transition hover:border-rose-200/25 hover:bg-white/[0.07]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{item.title}</p>
                          <p className="truncate text-xs text-white/55">{item.subtitle}</p>
                          <p className="truncate text-[11px] uppercase tracking-[0.14em] text-rose-100/50">{item.meta}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/50">
                          {item.type === "user" ? "User" : item.locationType === "activities" ? "Activity" : "Restaurant"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            href="/"
            onClick={closeMenus}
            className="hidden items-center gap-2 rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-2 text-sm font-black text-rose-50 transition hover:border-rose-200/35 hover:bg-rose-500/15 lg:inline-flex"
          >
            View Site
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => setMobileNavOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-black text-white/85 transition hover:bg-white/[0.08] xl:hidden"
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            Menu
          </button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-2 py-1.5 text-sm transition hover:border-rose-200/25 hover:bg-white/[0.08] sm:px-3 sm:py-2"
              aria-expanded={profileOpen}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-xs font-black text-[#5b1022]">
                {initialsFromName(adminName)}
              </span>
              <span className="hidden max-w-32 truncate font-bold text-white/85 lg:inline">{adminName}</span>
              <ChevronDown className={`h-4 w-4 text-white/55 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 z-[9700] mt-3 w-[min(24rem,calc(100vw-1rem))] rounded-3xl border border-white/10 bg-[#120d0b]/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.62)] backdrop-blur-2xl">
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-rose-950/20 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-200 to-amber-200 text-sm font-black text-[#5b1022]">
                      {initialsFromName(adminName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{adminName}</p>
                      <p className="truncate text-xs text-white/55">{adminEmail || "No email on file"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-50">
                          <ShieldCheck className="h-3 w-3" />
                          {roleLabel}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/15 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-50/80">
                          <Sparkles className="h-3 w-3" />
                          Internal Console
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setSearchOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white md:hidden"
                  >
                    <Search className="h-4 w-4 text-rose-100/70" />
                    Search admin records
                  </button>
                  <Link
                    href="/admin/dashboard/settings"
                    onClick={closeMenus}
                    className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    <UserCircle className="h-4 w-4 text-rose-100/70" />
                    Account settings
                  </Link>
                  <Link
                    href="/"
                    onClick={closeMenus}
                    className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
                  >
                    <ExternalLink className="h-4 w-4 text-rose-100/70" />
                    View public site
                  </Link>
                </div>
                <button
                  onClick={handleSignOut}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm font-black text-white/80 transition hover:border-rose-200/25 hover:bg-rose-950/25 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileNavOpen && (
        <div className="border-t border-white/10 bg-[#090706]/95 px-4 pb-4 shadow-2xl backdrop-blur-2xl xl:hidden">
          <div className="mx-auto mt-3 max-w-[1600px] space-y-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-black text-white/85 md:hidden"
            >
              <Search className="h-4 w-4 text-rose-100/70" />
              Search users and locations
            </button>
            {visibleGroups.map((group) => {
              const groupOpen = Boolean(openMobileGroups[group.label]);
              const active = isGroupActive(group);
              return (
                <div key={group.label} className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]/90">
                  <button
                    type="button"
                    onClick={() => setOpenMobileGroups((prev) => ({ ...prev, [group.label]: !prev[group.label] }))}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-black ${
                      active ? "text-rose-50" : "text-white/85"
                    }`}
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
                            onClick={closeMenus}
                            className={`mt-1 flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-semibold ${
                              itemActive
                                ? "border-rose-200/30 bg-gradient-to-r from-rose-900/35 to-amber-900/20 text-white"
                                : "border-transparent text-white/75 hover:bg-white/[0.06]"
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
