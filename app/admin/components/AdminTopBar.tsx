"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
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
  exact?: boolean;
  activePaths?: string[];
  activePrefixes?: string[];
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type NavGroup = {
  label: string;
  items?: NavItem[];
  sections?: NavSection[];
  widthClass?: string;
  gridClass?: string;
  activePaths?: string[];
  activePrefixes?: string[];
};

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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AdminTopBar({ adminName, adminEmail, adminRole }: AdminTopBarProps) {
  const supabase = createClient();
  const pathname = usePathname();
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
  const navRef = useRef<HTMLElement>(null);

  const canView = ["superadmin", "admin", "editor", "viewer"].includes(adminRole);
  const canManagePlatform = ["superadmin", "admin"].includes(adminRole);

  const dashboardItem: NavItem = useMemo(
    () => ({ label: "Dashboard", href: "/admin/dashboard", visible: canView, exact: true }),
    [canView],
  );

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        label: "Locations",
        activePaths: [
          "/admin/dashboard/claims",
          "/admin/dashboard/claim-qrs",
          "/admin/dashboard/claim-tools",
          "/admin/dashboard/import",
          "/admin/dashboard/data-quality",
        ],
        activePrefixes: ["/admin/dashboard/locations"],
        items: [
          { label: "All Locations", href: "/admin/dashboard/locations", visible: canView },
          { label: "Add Location", href: "/admin/dashboard/locations/new", visible: canView, exact: true },
          { label: "Claims", href: "/admin/dashboard/claims", visible: canView },
          { label: "Claim QRs", href: "/admin/dashboard/claim-qrs", visible: canView },
          { label: "Claim Tools", href: "/admin/dashboard/claim-tools", visible: canView },
          { label: "Import", href: "/admin/dashboard/import", visible: canView },
          { label: "Data Quality", href: "/admin/dashboard/data-quality", visible: canView },
        ],
      },
      {
        label: "Reservations",
        activePaths: ["/admin/dashboard/reservation-opportunities"],
        activePrefixes: ["/admin/dashboard/reservations", "/admin/dashboard/reservation"],
        items: [
          { label: "Reservations Overview", href: "/admin/dashboard/reservations", visible: canView },
          { label: "Reservation Opportunities", href: "/admin/dashboard/reservation-opportunities", visible: canView },
        ],
      },
      {
        label: "Owners",
        activePrefixes: [
          "/admin/dashboard/owner-accounts",
          "/admin/dashboard/businesses",
          "/admin/dashboard/business-crm",
          "/admin/dashboard/billing",
          "/admin/dashboard/plans",
        ],
        items: [
          { label: "Owner Accounts", href: "/admin/dashboard/owner-accounts", visible: canView },
          { label: "Businesses", href: "/admin/dashboard/businesses", visible: canView },
          { label: "Business CRM", href: "/admin/dashboard/business-crm", visible: canView },
          { label: "Billing", href: "/admin/dashboard/billing", visible: canView },
          { label: "Plans", href: "/admin/dashboard/plans", visible: canView },
          {
            label: "Upgrade Opportunities",
            href: "/admin/dashboard/businesses/upgrade-opportunities",
            visible: canView,
          },
          { label: "Churn Risk", href: "/admin/dashboard/businesses/churn-risk", visible: canView },
        ],
      },
      {
        label: "Analytics",
        activePaths: ["/admin/dashboard/analytics", "/admin/search-qa", "/admin/dashboard/logs"],
        items: [
          { label: "Analytics Overview", href: "/admin/dashboard/analytics", visible: canView, exact: true },
          { label: "Search QA", href: "/admin/search-qa", visible: canView },
          { label: "Logs", href: "/admin/dashboard/logs", visible: canView },
        ],
      },
      {
        label: "More",
        widthClass: "w-[min(42rem,calc(100vw-2rem))]",
        gridClass: "sm:grid-cols-3",
        activePaths: [
          "/admin/dashboard/reviews",
          "/admin/dashboard/support",
          "/admin/dashboard/communication",
          "/admin/dashboard/campaigns",
          "/admin/dashboard/sms",
          "/admin/dashboard/email-templates",
          "/admin/dashboard/settings/promo-codes",
          "/admin/dashboard/seo-tools",
          "/admin/dashboard/settings",
          "/admin/dashboard/feature-flags",
          "/admin/dashboard/users",
          "/admin/platform",
          "/admin/dashboard/launch-checklist",
        ],
        sections: [
          {
            label: "Operations",
            items: [
              { label: "Reviews", href: "/admin/dashboard/reviews", visible: canView },
              { label: "Support", href: "/admin/dashboard/support", visible: canView },
              { label: "Communication", href: "/admin/dashboard/communication", visible: canView },
            ],
          },
          {
            label: "Marketing",
            items: [
              { label: "Campaigns", href: "/admin/dashboard/campaigns", visible: canView },
              { label: "SMS", href: "/admin/dashboard/sms", visible: canView },
              { label: "Email Templates", href: "/admin/dashboard/email-templates", visible: canView },
              { label: "Promo Codes", href: "/admin/dashboard/settings/promo-codes", visible: canView },
              { label: "SEO Tools", href: "/admin/dashboard/seo-tools", visible: canView },
            ],
          },
          {
            label: "Settings",
            items: [
              { label: "Settings", href: "/admin/dashboard/settings", visible: canView, exact: true },
              { label: "Feature Flags", href: "/admin/dashboard/feature-flags", visible: canView },
              { label: "Users", href: "/admin/dashboard/users", visible: canManagePlatform },
              { label: "Platform", href: "/admin/platform", visible: canManagePlatform },
              { label: "Launch Checklist", href: "/admin/dashboard/launch-checklist", visible: canView },
            ],
          },
        ],
      },
    ],
    [canManagePlatform, canView],
  );

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items?.filter((item) => item.visible),
      sections: group.sections
        ?.map((section) => ({ ...section, items: section.items.filter((item) => item.visible) }))
        .filter((section) => section.items.length > 0),
    }))
    .filter((group) => (group.items?.length ?? 0) > 0 || (group.sections?.length ?? 0) > 0);

  const profileQuickActions: NavSection = {
    label: "Quick actions",
    items: [
      { label: "View Public Site", href: "/", visible: canView, external: true },
      { label: "Admin Dashboard", href: "/admin/dashboard", visible: canView, exact: true },
    ],
  };

  const profileAdminControls: NavSection = {
    label: "Admin controls",
    items: [
      { label: "Platform Settings", href: "/admin/platform", visible: canManagePlatform },
      { label: "General Settings", href: "/admin/dashboard/settings", visible: canManagePlatform },
      { label: "Feature Flags", href: "/admin/dashboard/feature-flags", visible: canManagePlatform },
      { label: "Logs", href: "/admin/dashboard/logs", visible: canManagePlatform },
    ],
  };

  const profileSupport: NavSection = {
    label: "Support",
    items: [{ label: "Support Inbox", href: "/admin/dashboard/support", visible: canView }],
  };

  const isPathMatch = (href: string, exact?: boolean) => {
    if (!pathname) return false;
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };

  const isItemActive = (item: NavItem) => {
    if (!pathname) return false;
    if (item.exact) return pathname === item.href;
    if (item.activePaths?.includes(pathname)) return true;
    if (item.activePrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
    return isPathMatch(item.href);
  };

  const isGroupActive = (group: NavGroup) => {
    if (!pathname) return false;
    if (group.label === "Reservations") {
      return (
        pathname === "/admin/dashboard/reservation-opportunities" ||
        pathname === "/admin/dashboard/reservations" ||
        pathname.startsWith("/admin/dashboard/reservations/") ||
        pathname.includes("/reservations")
      );
    }
    if (group.label === "Analytics" && pathname === "/admin/dashboard/analytics/reservations") {
      return false;
    }
    if (group.activePaths?.includes(pathname)) return true;
    if (group.activePrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
    return [...(group.items ?? []), ...(group.sections?.flatMap((section) => section.items) ?? [])].some((item) =>
      isItemActive(item),
    );
  };

  useEffect(() => {
    const cleanQuery = query.trim();
    if (!searchOpen || cleanQuery.length < 2) {
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
      if (navRef.current && !navRef.current.contains(target)) {
        setOpenNavGroup(null);
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

  const handleSearchLinkClick = () => {
    closeMenus();
    setQuery("");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const renderDropdownLink = (item: NavItem, keyPrefix: string) => {
    const itemActive = isItemActive(item);
    return (
      <Link
        key={`${keyPrefix}-${item.href}`}
        href={item.href}
        onClick={closeMenus}
        className={cx(
          "mt-1 flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
          itemActive
            ? "border-rose-200/30 bg-gradient-to-r from-rose-900/40 to-amber-900/20 text-white shadow-[0_8px_24px_rgba(120,35,60,0.22)]"
            : "border-transparent text-white/75 hover:border-white/10 hover:bg-white/[0.06] hover:text-white",
        )}
      >
        <span className="truncate">{item.label}</span>
        {item.external && <ExternalLink className="h-3.5 w-3.5 shrink-0" />}
      </Link>
    );
  };

  const renderProfileSection = (section: NavSection) => {
    const items = section.items.filter((item) => item.visible);
    if (items.length === 0) return null;

    return (
      <div key={section.label} className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
        <p className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/55">{section.label}</p>
        <div className="mt-1 grid gap-1">
          {items.map((item) => (
            <Link
              key={`profile-${section.label}-${item.href}`}
              href={item.href}
              onClick={closeMenus}
              className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
            >
              <span>{item.label}</span>
              {item.external && <ExternalLink className="h-3.5 w-3.5 text-rose-100/70" />}
            </Link>
          ))}
        </div>
      </div>
    );
  };

  const roleLabel = roleLabels[adminRole];
  const dashboardActive = isItemActive(dashboardItem);

  return (
    <header className="sticky top-0 z-[100] border-b border-white/10 bg-[#080504]/95 text-white shadow-[0_18px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/admin/dashboard" onClick={closeMenus} className="group flex min-w-0 shrink-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-rose-200/25 bg-gradient-to-br from-rose-200 via-rose-300 to-amber-200 text-[13px] font-black tracking-tight text-[#5b1022] shadow-[0_12px_35px_rgba(244,114,182,0.18)] lg:h-11 lg:w-11">
            TOH
            <span className="absolute inset-x-1 bottom-1 h-px bg-white/50" />
          </div>
          <div className="hidden min-w-0 text-left sm:block">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-black tracking-tight text-white">TheOutHaven</p>
              <span className="rounded-full border border-rose-200/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-rose-100">
                {roleLabel}
              </span>
            </div>
            <p className="hidden text-[11px] font-bold uppercase tracking-[0.24em] text-rose-100/60 2xl:block">
              Admin Console
            </p>
          </div>
        </Link>

        <nav ref={navRef} className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label="Admin sections">
          {dashboardItem.visible && (
            <Link
              href={dashboardItem.href}
              onClick={closeMenus}
              className={cx(
                "inline-flex h-10 items-center rounded-full border px-3 text-sm font-semibold whitespace-nowrap transition-all duration-150 2xl:px-4",
                dashboardActive
                  ? "border-rose-200/35 bg-gradient-to-r from-rose-900/50 to-amber-900/30 text-rose-50 shadow-[0_10px_30px_rgba(120,35,60,0.28)]"
                  : "border-white/10 bg-white/[0.045] text-white/75 hover:border-rose-200/25 hover:bg-white/[0.07] hover:text-white",
              )}
            >
              Dashboard
            </Link>
          )}

          {visibleGroups.map((group) => {
            const groupActive = isGroupActive(group);
            const groupOpen = openNavGroup === group.label;
            const simpleItems = group.items ?? [];
            const sections = group.sections ?? [];

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
                  className={cx(
                    "inline-flex h-10 items-center gap-1 rounded-full border px-3 text-sm font-semibold whitespace-nowrap transition-all duration-150 2xl:px-4",
                    groupActive
                      ? "border-rose-200/35 bg-gradient-to-r from-rose-900/50 to-amber-900/30 text-rose-50 shadow-[0_10px_30px_rgba(120,35,60,0.28)]"
                      : "border-white/10 bg-white/[0.045] text-white/75 hover:border-rose-200/25 hover:bg-white/[0.07] hover:text-white",
                  )}
                  aria-expanded={groupOpen}
                >
                  {group.label}
                  <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", groupOpen && "rotate-180")} />
                </button>
                <div
                  className={cx(
                    "absolute left-0 top-full z-[150] mt-3 rounded-3xl border border-white/10 bg-[#120d0b]/95 p-2 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all duration-150",
                    group.widthClass || "w-80",
                    groupOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
                  )}
                >
                  {simpleItems.length > 0 && (
                    <>
                      <div className="border-b border-white/10 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-100/60">{group.label}</p>
                      </div>
                      {simpleItems.map((item) => renderDropdownLink(item, group.label))}
                    </>
                  )}

                  {sections.length > 0 && (
                    <div className={cx("grid gap-3 p-2", group.gridClass)}>
                      {sections.map((section) => (
                        <div key={`${group.label}-${section.label}`} className="min-w-0">
                          <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/60">
                            {section.label}
                          </p>
                          {section.items.map((item) => renderDropdownLink(item, `${group.label}-${section.label}`))}
                        </div>
                      ))}
                    </div>
                  )}
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
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 text-sm font-semibold text-white/80 transition hover:border-rose-200/25 hover:bg-white/[0.08] hover:text-white md:px-4"
              aria-expanded={searchOpen}
            >
              <Search className="h-4 w-4 text-rose-100/70" />
              <span className="hidden lg:inline">Search</span>
            </button>
            {searchOpen && (
              <div className="absolute right-0 z-[160] mt-3 w-[min(26rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-[#120d0b]/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
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
                  {query.trim().length >= 2 && results.map((item) => (
                    <Link
                      key={`${item.type}-${item.id}`}
                      href={searchResultHref(item)}
                      onClick={handleSearchLinkClick}
                      className="mt-2 block w-full rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-left transition hover:border-rose-200/25 hover:bg-white/[0.07]"
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
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            href="/"
            onClick={closeMenus}
            className="hidden h-10 items-center gap-2 rounded-full border border-rose-200/20 bg-rose-500/10 px-3 text-sm font-black text-rose-50 transition hover:border-rose-200/35 hover:bg-rose-500/15 lg:inline-flex"
          >
            View Site
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => setMobileNavOpen((current) => !current)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 text-sm font-black text-white/85 transition hover:bg-white/[0.08] xl:hidden"
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="hidden sm:inline">Menu</span>
          </button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-1.5 text-sm transition hover:border-rose-200/25 hover:bg-white/[0.08] sm:px-2.5"
              aria-expanded={profileOpen}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-xs font-black text-[#5b1022]">
                {initialsFromName(adminName)}
              </span>
              <span className="hidden max-w-28 truncate font-bold text-white/85 2xl:inline">{adminName}</span>
              <ChevronDown className={cx("h-4 w-4 text-white/55 transition-transform", profileOpen && "rotate-180")} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 z-[160] mt-3 w-[min(21rem,calc(100vw-1rem))] rounded-2xl border border-white/10 bg-[#120d0b]/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.62)] backdrop-blur-2xl">
                <div className="rounded-2xl border border-rose-200/15 bg-gradient-to-br from-white/[0.07] to-rose-950/20 p-4">
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

                <div className="mt-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setSearchOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white md:hidden"
                  >
                    <Search className="h-4 w-4 text-rose-100/70" />
                    Search admin records
                  </button>
                  {renderProfileSection(profileQuickActions)}
                  {renderProfileSection(profileAdminControls)}
                  {renderProfileSection(profileSupport)}
                </div>

                <button
                  onClick={handleSignOut}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-black text-white/80 transition hover:border-rose-200/25 hover:bg-rose-950/30 hover:text-white"
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
        <div className="max-h-[calc(100vh-72px)] overflow-y-auto border-t border-white/10 bg-[#090706]/98 px-4 pb-4 shadow-2xl backdrop-blur-2xl xl:hidden">
          <div className="mx-auto mt-3 max-w-[1600px] space-y-2">
            <Link
              href="/admin/dashboard"
              onClick={closeMenus}
              className={cx(
                "flex w-full items-center justify-between rounded-3xl border px-4 py-3 text-sm font-black",
                dashboardActive ? "border-rose-200/30 bg-rose-500/10 text-rose-50" : "border-white/10 bg-[#120d0b]/90 text-white/85",
              )}
            >
              Dashboard
            </Link>

            {visibleGroups.map((group) => {
              const groupOpen = Boolean(openMobileGroups[group.label]);
              const active = isGroupActive(group);
              const mobileItems = [...(group.items ?? []), ...(group.sections?.flatMap((section) => section.items) ?? [])];
              return (
                <div key={group.label} className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]/90">
                  <button
                    type="button"
                    onClick={() => setOpenMobileGroups((prev) => ({ ...prev, [group.label]: !prev[group.label] }))}
                    className={cx(
                      "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-black",
                      active ? "text-rose-50" : "text-white/85",
                    )}
                  >
                    {group.label}
                    <ChevronDown className={cx("h-4 w-4 transition-transform", groupOpen && "rotate-180")} />
                  </button>
                  {groupOpen && (
                    <div className="border-t border-white/10 p-2">
                      {group.sections
                        ? group.sections.map((section) => (
                            <div key={`${group.label}-mobile-${section.label}`} className="py-1">
                              <p className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/55">
                                {section.label}
                              </p>
                              {section.items.map((item) => renderDropdownLink(item, `${group.label}-mobile-${section.label}`))}
                            </div>
                          ))
                        : mobileItems.map((item) => renderDropdownLink(item, `${group.label}-mobile`))}
                    </div>
                  )}
                </div>
              );
            })}

            <Link
              href="/"
              onClick={closeMenus}
              className="flex w-full items-center justify-between rounded-3xl border border-rose-200/20 bg-rose-500/10 px-4 py-3 text-sm font-black text-rose-50"
            >
              View Site
              <ExternalLink className="h-4 w-4" />
            </Link>

            <div className="rounded-3xl border border-white/10 bg-[#120d0b]/90 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-200 to-amber-200 text-xs font-black text-[#5b1022]">
                  {initialsFromName(adminName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">{adminName}</p>
                  <p className="truncate text-xs text-white/55">{adminEmail || "No email on file"}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-50">
                    <ShieldCheck className="h-3 w-3" />
                    {roleLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/15 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-50/80">
                    <Sparkles className="h-3 w-3" />
                    Internal Console
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-black text-white/80 transition hover:border-rose-200/25 hover:bg-rose-950/30 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
