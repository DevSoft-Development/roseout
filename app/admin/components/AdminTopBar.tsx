"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
  Shield,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AdminRole } from "@/lib/users/roles";
import {
  ADMIN_ROLE_LABELS,
  canAdmin,
  canAnyAdmin,
} from "@/lib/admin-permissions";
import AdminLocationSearch from "@/components/admin/AdminLocationSearch";

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
  ownerUserId?: string | null;
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
  align?: "left" | "right";
  activePaths?: string[];
  activePrefixes?: string[];
};

const roleLabels = ADMIN_ROLE_LABELS;

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

export default function AdminTopBar({
  adminName,
  adminEmail,
  adminRole,
}: AdminTopBarProps) {
  const supabase = createClient();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openMobileGroups, setOpenMobileGroups] = useState<
    Record<string, boolean>
  >({});
  const [openNavGroup, setOpenNavGroup] = useState<string | null>(null);
  const [impersonationOpen, setImpersonationOpen] = useState(false);
  const [impersonationTab, setImpersonationTab] = useState<
    "users" | "locations"
  >("users");
  const [impersonationQuery, setImpersonationQuery] = useState("");
  const [impersonationResults, setImpersonationResults] = useState<
    SearchResult[]
  >([]);
  const [impersonationSearching, setImpersonationSearching] = useState(false);
  const [impersonationStartingId, setImpersonationStartingId] = useState<
    string | null
  >(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  const canView = canAdmin(adminRole, "dashboard");
  const canManagePlatform = canAnyAdmin(adminRole, [
    "settings",
    "featureFlags",
    "logs",
    "adminUsers",
  ]);
  const canImpersonate = canAdmin(adminRole, "impersonation");

  const dashboardItem: NavItem = useMemo(
    () => ({
      label: "Dashboard",
      href: "/admin/dashboard",
      visible: canView,
      exact: true,
    }),
    [canView],
  );

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        label: "CRM",
        activePaths: [
          "/admin/dashboard/claims",
          "/admin/dashboard/claim-qrs",
          "/admin/dashboard/claim-tools",
          "/admin/dashboard/data-quality",
        ],
        activePrefixes: ["/admin/dashboard/crm", "/admin/dashboard/locations"],
        items: [
          {
            label: "All Locations",
            href: "/admin/dashboard/crm",
            visible: canAdmin(adminRole, "crm"),
          },
          {
            label: "Upgrade Opportunities",
            href: "/admin/dashboard/crm?filter=upgrade-opportunities",
            visible: canAdmin(adminRole, "upgradeOpportunities"),
          },
          {
            label: "At Risk Locations",
            href: "/admin/dashboard/crm?filter=at-risk",
            visible: canAdmin(adminRole, "crm"),
          },
          {
            label: "Pending Claims",
            href: "/admin/dashboard/crm?filter=pending-claims",
            visible: canAdmin(adminRole, "claims"),
          },
          {
            label: "Owner Accounts",
            href: "/admin/dashboard/crm?filter=owner-accounts",
            visible: canAdmin(adminRole, "ownerAccounts"),
          },
          {
            label: "Location Tasks",
            href: "/admin/dashboard/crm?filter=location-tasks",
            visible: canView,
          },
          {
            label: "Follow-ups",
            href: "/admin/dashboard/crm?filter=follow-ups",
            visible: canView,
          },
          {
            label: "QR Codes",
            href: "/admin/dashboard/crm?filter=qr-codes",
            visible: canView,
          },
          {
            label: "Legacy Locations",
            href: "/admin/dashboard/locations",
            visible: canAdmin(adminRole, "locations"),
          },
        ],
      },
      {
        label: "Team Tools",
        activePrefixes: ["/admin/dashboard/team"],
        widthClass: "w-[460px] max-w-[calc(100vw-24px)]",
        gridClass: "md:grid-cols-2",
        sections: [
          {
            label: "Work",
            items: [
              { label: "Overview", href: "/admin/dashboard/team", visible: canView, exact: true },
              { label: "Team Members", href: "/admin/dashboard/team/members", visible: canManagePlatform },
              { label: "Work Sessions", href: "/admin/dashboard/team/work-sessions", visible: canView },
              { label: "Site Visit Check-Ins", href: "/admin/dashboard/team/site-visits", visible: canView },
              { label: "Social Outreach", href: "/admin/dashboard/team/social-outreach", visible: canView },
              { label: "Support Work", href: "/admin/dashboard/team/support-work", visible: canView },
            ],
          },
          {
            label: "Review + Payroll",
            items: [
              { label: "Demo / Training Mode", href: "/admin/dashboard/team/demo", visible: canView },
              { label: "Payroll Export", href: "/admin/dashboard/team/payroll", visible: canView },
              { label: "Performance", href: "/admin/dashboard/team/performance", visible: canView },
              { label: "Proof Review", href: "/admin/dashboard/team/proof-review", visible: canView },
            ],
          },
        ],
      },
      {
        label: "Reservations",
        activePaths: ["/admin/dashboard/reservation-opportunities"],
        activePrefixes: [
          "/admin/dashboard/reservations",
          "/admin/dashboard/reservation",
        ],
        items: [
          {
            label: "Reservations Overview",
            href: "/admin/dashboard/reservations",
            visible: canAdmin(adminRole, "reservations"),
          },
          {
            label: "Reservation Opportunities",
            href: "/admin/dashboard/reservation-opportunities",
            visible: canAdmin(adminRole, "reservations"),
          },
        ],
      },
      {
        label: "Owners",
        activePrefixes: [
          "/admin/dashboard/owner-accounts",
          "/admin/dashboard/businesses",
          "/admin/dashboard/billing",
          "/admin/dashboard/plans",
        ],
        items: [
          {
            label: "Owner Accounts",
            href: "/admin/dashboard/owner-accounts",
            visible: canAdmin(adminRole, "ownerAccounts"),
          },
          {
            label: "Businesses",
            href: "/admin/dashboard/businesses",
            visible: canAdmin(adminRole, "businessCrm"),
          },
          {
            label: "Billing",
            href: "/admin/dashboard/billing",
            visible: canAdmin(adminRole, "billing"),
          },
          {
            label: "Plans",
            href: "/admin/dashboard/plans",
            visible: canAdmin(adminRole, "billing"),
          },
          {
            label: "Upgrade Opportunities",
            href: "/admin/dashboard/businesses/upgrade-opportunities",
            visible: canAdmin(adminRole, "upgradeOpportunities"),
          },
          {
            label: "Churn Risk",
            href: "/admin/dashboard/businesses/churn-risk",
            visible: canAdmin(adminRole, "businessCrm"),
          },
        ],
      },
      {
        label: "Analytics",
        activePaths: ["/admin/dashboard/analytics", "/admin/search-qa"],
        items: [
          {
            label: "Analytics",
            href: "/admin/dashboard/analytics",
            visible: canAdmin(adminRole, "analytics"),
            exact: true,
          },
          {
            label: "Search QA",
            href: "/admin/search-qa",
            visible: canAdmin(adminRole, "seoTools"),
          },
        ],
      },
      {
        label: "Admin Tools",
        widthClass: "w-[520px] max-w-[calc(100vw-24px)]",
        align: "right",
        activePaths: [
          "/admin/dashboard/import",
          "/admin/dashboard/reviews",
          "/admin/dashboard/support",
          "/admin/dashboard/communication",
          "/admin/dashboard/campaigns",
          "/admin/dashboard/settings/promo-codes",
          "/admin/dashboard/seo-tools",
          "/admin/dashboard/settings",
          "/admin/dashboard/feature-flags",
          "/admin/dashboard/logs",
          "/admin/dashboard/launch-checklist",
          "/admin/dashboard/knowledge-base",
          "/admin/dashboard/beta",
        ],
        activePrefixes: ["/admin/dashboard/knowledge-base"],
        gridClass: "md:grid-cols-3",
        sections: [
          {
            label: "Operations",
            items: [
              {
                label: "Import Center",
                href: "/admin/dashboard/import",
                visible: canAdmin(adminRole, "import"),
              },
              {
                label: "Reviews",
                href: "/admin/dashboard/reviews",
                visible: canAdmin(adminRole, "reviews"),
              },
              {
                label: "Experience Inbox",
                href: "/admin/dashboard/support",
                visible: canAdmin(adminRole, "experienceInbox"),
              },
              {
                label: "Knowledge Base",
                href: "/admin/dashboard/knowledge-base",
                visible: canAdmin(adminRole, "knowledgeBase"),
                activePrefixes: ["/admin/dashboard/knowledge-base"],
              },
              {
                label: "Beta Testing",
                href: "/admin/dashboard/beta",
                visible: [
                  "superadmin",
                  "admin",
                  "experience",
                  "experience_team",
                ].includes(String(adminRole)),
                activePrefixes: ["/admin/dashboard/beta"],
              },
            ],
          },
          {
            label: "Marketing",
            items: [
              {
                label: "Marketing Center",
                href: "/admin/dashboard/communication",
                visible: canAdmin(adminRole, "communication"),
              },
              {
                label: "Campaigns",
                href: "/admin/dashboard/campaigns",
                visible: canAdmin(adminRole, "campaigns"),
              },
              {
                label: "Promo Codes",
                href: "/admin/dashboard/settings/promo-codes",
                visible: canAdmin(adminRole, "promoCodes"),
              },
              {
                label: "SEO Tools",
                href: "/admin/dashboard/seo-tools",
                visible: canAdmin(adminRole, "seoTools"),
              },
            ],
          },
          {
            label: "System",
            items: [
              {
                label: "Settings",
                href: "/admin/dashboard/settings",
                visible: canAdmin(adminRole, "settings"),
              },
              {
                label: "Feature Flags",
                href: "/admin/dashboard/feature-flags",
                visible: canAdmin(adminRole, "featureFlags"),
              },
              {
                label: "Logs",
                href: "/admin/dashboard/logs",
                visible: canAdmin(adminRole, "logs"),
              },
              {
                label: "Launch Checklist",
                href: "/admin/dashboard/launch-checklist",
                visible: canManagePlatform,
              },
            ],
          },
        ],
      },
    ],
    [adminRole, canManagePlatform, canView],
  );

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items?.filter((item) => item.visible),
      sections: group.sections
        ?.map((section) => ({
          ...section,
          items: section.items.filter((item) => item.visible),
        }))
        .filter((section) => section.items.length > 0),
    }))
    .filter(
      (group) =>
        (group.items?.length ?? 0) > 0 || (group.sections?.length ?? 0) > 0,
    );

  const profileQuickActions: NavSection = {
    label: "Quick actions",
    items: [
      {
        label: "View Public Site",
        href: "/",
        visible: canView,
        external: true,
      },
      {
        label: "Knowledge Base",
        href: "/admin/dashboard/knowledge-base",
        visible: canAdmin(adminRole, "knowledgeBase"),
      },
    ],
  };

  const profileAdminControls: NavSection = {
    label: "Admin controls",
    items: [
      {
        label: "Platform Settings",
        href: "/admin/platform",
        visible: canManagePlatform,
      },
      {
        label: "General Settings",
        href: "/admin/dashboard/settings",
        visible: canManagePlatform,
      },
      {
        label: "Feature Flags",
        href: "/admin/dashboard/feature-flags",
        visible: canManagePlatform,
      },
      {
        label: "Users",
        href: "/admin/dashboard/users",
        visible: canManagePlatform,
      },
      {
        label: "Launch Checklist",
        href: "/admin/dashboard/launch-checklist",
        visible: canManagePlatform,
      },
      {
        label: "Platform Logs",
        href: "/admin/dashboard/logs",
        visible: canManagePlatform,
      },
    ],
  };

  const profileSupport: NavSection = {
    label: "Experience",
    items: [
      {
        label: "Experience Inbox",
        href: "/admin/dashboard/support",
        visible: canAdmin(adminRole, "experienceInbox"),
      },
    ],
  };

  const isPathMatch = (href: string, exact?: boolean) => {
    if (!pathname) return false;
    return exact
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  };

  const isItemActive = (item: NavItem) => {
    if (!pathname) return false;
    if (item.exact) return pathname === item.href;
    if (item.activePaths?.includes(pathname)) return true;
    if (
      item.activePrefixes?.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      )
    )
      return true;
    return isPathMatch(item.href);
  };

  const isGroupActive = (group: NavGroup) => {
    if (!pathname) return false;
    if (group.label === "Team Tools") {
      return pathname === "/admin/dashboard/team" || pathname.startsWith("/admin/dashboard/team/");
    }
    if (group.label === "Reservations") {
      return (
        pathname === "/admin/dashboard/reservation-opportunities" ||
        pathname === "/admin/dashboard/reservations" ||
        pathname.startsWith("/admin/dashboard/reservations/") ||
        pathname.includes("/reservations")
      );
    }
    if (
      group.label === "Analytics" &&
      pathname === "/admin/dashboard/analytics/reservations"
    ) {
      return false;
    }
    if (group.label === "Admin Tools") {
      const adminToolPaths = [
        "/admin/dashboard/import",
        "/admin/dashboard/reviews",
        "/admin/dashboard/support",
        "/admin/dashboard/communication",
        "/admin/dashboard/campaigns",
        "/admin/dashboard/settings/promo-codes",
        "/admin/dashboard/seo-tools",
        "/admin/dashboard/settings",
        "/admin/dashboard/feature-flags",
        "/admin/dashboard/logs",
        "/admin/dashboard/launch-checklist",
        "/admin/dashboard/knowledge-base",
        "/admin/dashboard/beta",
      ];
      return adminToolPaths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
      );
    }
    if (group.activePaths?.includes(pathname)) return true;
    if (
      group.activePrefixes?.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      )
    )
      return true;
    return [
      ...(group.items ?? []),
      ...(group.sections?.flatMap((section) => section.items) ?? []),
    ].some((item) => isItemActive(item));
  };

  useEffect(() => {
    const cleanQuery = impersonationQuery.trim();
    if (!impersonationOpen || cleanQuery.length < 2) {
      setImpersonationResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setImpersonationSearching(true);
      try {
        const res = await fetch(
          `/api/admin/search?q=${encodeURIComponent(cleanQuery)}`,
        );
        const data = await res.json();
        const allResults = (data.results || []) as SearchResult[];
        setImpersonationResults(
          impersonationTab === "users"
            ? allResults.filter((item) => item.type === "user")
            : allResults.filter((item) => item.type === "location"),
        );
      } catch {
        setImpersonationResults([]);
      } finally {
        setImpersonationSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [impersonationOpen, impersonationQuery, impersonationTab]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
      if (navRef.current && !navRef.current.contains(target)) {
        setOpenNavGroup(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setMobileNavOpen(false);
        setOpenNavGroup(null);
        setImpersonationOpen(false);
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
    setMobileNavOpen(false);
    setOpenNavGroup(null);
    setImpersonationOpen(false);
  };

  const openImpersonation = (tab: "users" | "locations") => {
    setImpersonationTab(tab);
    setImpersonationOpen(true);
    setProfileOpen(false);
    setMobileNavOpen(false);
  };

  const startImpersonation = async (item: SearchResult) => {
    const confirmed = window.confirm(
      "You are about to log in as this account. This action will be recorded in the admin audit log.",
    );
    if (!confirmed) return;

    setImpersonationStartingId(item.id);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          item.type === "user"
            ? { targetType: "user", targetUserId: item.id }
            : {
                targetType: "location_owner",
                locationId: item.id,
                locationType: item.locationType,
              },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.redirectTo) {
        window.alert(data.error || "Unable to start secure impersonation.");
        return;
      }
      window.location.href = data.redirectTo;
    } finally {
      setImpersonationStartingId(null);
    }
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
            ? "border-rose-200/30 bg-gradient-to-r from-rose-900/40 to-rose-950/20 text-white shadow-[0_8px_24px_rgba(120,35,60,0.22)]"
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
      <div
        key={section.label}
        className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0"
      >
        <p className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/55">
          {section.label}
        </p>
        <div className="mt-1 grid gap-1">
          {items.map((item) => (
            <Link
              key={`profile-${section.label}-${item.href}`}
              href={item.href}
              onClick={closeMenus}
              className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
            >
              <span>{item.label}</span>
              {item.external && (
                <ExternalLink className="h-3.5 w-3.5 text-rose-100/70" />
              )}
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
        <Link
          href="/admin/dashboard"
          onClick={closeMenus}
          className="group flex min-w-0 shrink-0 items-center gap-3"
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-rose-200/25 bg-gradient-to-br from-rose-200 via-rose-300 to-rose-200 text-[13px] font-black tracking-tight text-[#5b1022] shadow-[0_12px_35px_rgba(244,114,182,0.18)] lg:h-11 lg:w-11">
            TOH
            <span className="absolute inset-x-1 bottom-1 h-px bg-white/50" />
          </div>
          <div className="hidden min-w-0 text-left sm:block">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-black tracking-tight text-white">
                TheOutHaven
              </p>
              <span className="rounded-full border border-rose-200/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-rose-100">
                {roleLabel}
              </span>
            </div>
            <p className="hidden text-[11px] font-bold uppercase tracking-[0.24em] text-rose-100/60 2xl:block">
              Admin Console
            </p>
          </div>
        </Link>

        <nav
          ref={navRef}
          className="hidden min-w-0 flex-1 items-center justify-start gap-1 xl:flex"
          aria-label="Admin sections"
        >
          {dashboardItem.visible && (
            <Link
              href={dashboardItem.href}
              onClick={closeMenus}
              className={cx(
                "inline-flex h-10 items-center rounded-full border px-3 text-sm font-semibold whitespace-nowrap transition-all duration-150 2xl:px-4",
                dashboardActive
                  ? "border-rose-200/35 bg-gradient-to-r from-rose-900/50 to-rose-950/30 text-rose-50 shadow-[0_10px_30px_rgba(120,35,60,0.28)]"
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
                  onClick={() =>
                    setOpenNavGroup((current) =>
                      current === group.label ? null : group.label,
                    )
                  }
                  className={cx(
                    "inline-flex h-10 items-center gap-1 rounded-full border px-3 text-sm font-semibold whitespace-nowrap transition-all duration-150 2xl:px-4",
                    groupActive
                      ? "border-rose-200/35 bg-gradient-to-r from-rose-900/50 to-rose-950/30 text-rose-50 shadow-[0_10px_30px_rgba(120,35,60,0.28)]"
                      : "border-white/10 bg-white/[0.045] text-white/75 hover:border-rose-200/25 hover:bg-white/[0.07] hover:text-white",
                  )}
                  aria-expanded={groupOpen}
                >
                  {group.label}
                  <ChevronDown
                    className={cx(
                      "h-3.5 w-3.5 transition-transform",
                      groupOpen && "rotate-180",
                    )}
                  />
                </button>
                <div
                  className={cx(
                    "absolute top-full z-[160] mt-3 max-h-[calc(100vh-90px)] overflow-y-auto rounded-3xl border border-white/10 bg-[#120d0b]/95 p-2 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all duration-150",
                    group.align === "right" ? "right-0" : "left-0",
                    group.widthClass || "w-80 max-w-[calc(100vw-24px)]",
                    groupOpen
                      ? "visible translate-y-0 opacity-100"
                      : "invisible -translate-y-1 opacity-0",
                  )}
                >
                  {simpleItems.length > 0 && (
                    <>
                      <div className="border-b border-white/10 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-100/60">
                          {group.label}
                        </p>
                      </div>
                      {simpleItems.map((item) =>
                        renderDropdownLink(item, group.label),
                      )}
                    </>
                  )}

                  {sections.length > 0 && (
                    <div className={cx("grid gap-3 p-2", group.gridClass)}>
                      {sections.map((section) => (
                        <div
                          key={`${group.label}-${section.label}`}
                          className="min-w-0"
                        >
                          <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/60">
                            {section.label}
                          </p>
                          {section.items.map((item) =>
                            renderDropdownLink(
                              item,
                              `${group.label}-${section.label}`,
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2">
          <div className="hidden w-[clamp(18rem,28vw,26rem)] min-w-0 xl:block">
            <AdminLocationSearch compact className="w-full" />
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
            {mobileNavOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Menu</span>
          </button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-1.5 text-sm transition hover:border-rose-200/25 hover:bg-white/[0.08] sm:px-2.5"
              aria-expanded={profileOpen}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-200 to-rose-200 text-xs font-black text-[#5b1022]">
                {initialsFromName(adminName)}
              </span>
              <span className="hidden max-w-28 truncate font-bold text-white/85 2xl:inline">
                {adminName}
              </span>
              <ChevronDown
                className={cx(
                  "h-4 w-4 text-white/55 transition-transform",
                  profileOpen && "rotate-180",
                )}
              />
            </button>
            {profileOpen && (
              <div className="absolute right-0 z-[170] mt-3 max-h-[calc(100vh-90px)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-white/10 bg-[#120d0b]/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.62)] backdrop-blur-2xl">
                <div className="rounded-2xl border border-rose-200/15 bg-gradient-to-br from-white/[0.07] to-rose-950/20 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-200 to-rose-200 text-sm font-black text-[#5b1022]">
                      {initialsFromName(adminName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {adminName}
                      </p>
                      <p className="truncate text-xs text-white/55">
                        {adminEmail || "No email on file"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-50">
                          <ShieldCheck className="h-3 w-3" />
                          {roleLabel}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-100/80">
                          <Sparkles className="h-3 w-3" />
                          Internal Console
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  {renderProfileSection(profileQuickActions)}
                  {renderProfileSection(profileAdminControls)}
                  {renderProfileSection(profileSupport)}
                  {canImpersonate && (
                    <div className="border-t border-white/10 pt-3">
                      <p className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/55">
                        Impersonation
                      </p>
                      <div className="mt-1 grid gap-1">
                        <button
                          type="button"
                          onClick={() => openImpersonation("users")}
                          className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                        >
                          Log in as User
                          <Shield className="h-3.5 w-3.5 text-rose-100/70" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openImpersonation("locations")}
                          className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                        >
                          Log in as Location / Location Owner
                          <Shield className="h-3.5 w-3.5 text-rose-100/70" />
                        </button>
                      </div>
                    </div>
                  )}
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

      {impersonationOpen && canImpersonate && (
        <div
          className="fixed inset-0 z-[180] bg-black/70 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto max-h-[calc(100vh-48px)] max-w-2xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#120d0b]/98 p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,0.72)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.26em] text-rose-200/70">
                  Secure admin action
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Log in as user or location owner
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  Search, confirm, and start an audited impersonation session.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImpersonationOpen(false)}
                className="rounded-full border border-white/10 bg-white/[0.05] p-2 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/25 p-1">
              <button
                type="button"
                onClick={() => setImpersonationTab("users")}
                className={cx(
                  "rounded-xl px-3 py-2 text-sm font-black",
                  impersonationTab === "users"
                    ? "bg-rose-500/20 text-rose-50"
                    : "text-white/55 hover:text-white",
                )}
              >
                Users
              </button>
              <button
                type="button"
                onClick={() => setImpersonationTab("locations")}
                className={cx(
                  "rounded-xl px-3 py-2 text-sm font-black",
                  impersonationTab === "locations"
                    ? "bg-rose-500/20 text-rose-50"
                    : "text-white/55 hover:text-white",
                )}
              >
                Location Owners
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
              <Search className="h-4 w-4 text-rose-100/70" />
              <input
                value={impersonationQuery}
                onChange={(event) => setImpersonationQuery(event.target.value)}
                placeholder={
                  impersonationTab === "users"
                    ? "Search by user name or email..."
                    : "Search by location, owner name, or owner email..."
                }
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                autoFocus
              />
            </div>

            <div className="mt-4 max-h-[24rem] overflow-y-auto pr-1">
              {impersonationSearching && (
                <p className="px-2 py-4 text-sm text-white/55">Searching...</p>
              )}
              {!impersonationSearching &&
                impersonationQuery.trim().length < 2 && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
                    Type at least two characters to search.
                  </div>
                )}
              {!impersonationSearching &&
                impersonationQuery.trim().length >= 2 &&
                impersonationResults.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-rose-200/15 bg-rose-950/10 p-4 text-sm text-white/60">
                    No results found.
                  </div>
                )}
              {impersonationResults.map((item) => {
                const canStartLocation =
                  item.type === "user" || Boolean(item.ownerUserId);
                return (
                  <div
                    key={`impersonate-${item.type}-${item.id}`}
                    className="mt-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-white/55">
                          {item.subtitle}
                        </p>
                        <p className="truncate text-[11px] uppercase tracking-[0.14em] text-rose-100/50">
                          {item.meta}
                        </p>
                        {item.type === "location" && !item.ownerUserId && (
                          <p className="mt-1 text-xs font-semibold text-rose-100/70">
                            No owner connected
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={
                          !canStartLocation ||
                          impersonationStartingId === item.id
                        }
                        onClick={() => startImpersonation(item)}
                        className="rounded-full border border-rose-200/25 bg-rose-500/15 px-4 py-2 text-xs font-black text-rose-50 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {impersonationStartingId === item.id
                          ? "Starting secure login..."
                          : item.type === "user"
                            ? "Log in as user"
                            : "Log in as owner"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mobileNavOpen && (
        <div className="max-h-[calc(100vh-72px)] overflow-y-auto border-t border-white/10 bg-[#090706]/98 px-4 pb-4 shadow-2xl backdrop-blur-2xl xl:hidden">
          <div className="mx-auto mt-3 max-w-[1600px] space-y-2">
            <Link
              href="/admin/dashboard"
              onClick={closeMenus}
              className={cx(
                "flex w-full items-center justify-between rounded-3xl border px-4 py-3 text-sm font-black",
                dashboardActive
                  ? "border-rose-200/30 bg-rose-500/10 text-rose-50"
                  : "border-white/10 bg-[#120d0b]/90 text-white/85",
              )}
            >
              Dashboard
            </Link>

            {visibleGroups.map((group) => {
              const groupOpen = Boolean(openMobileGroups[group.label]);
              const active = isGroupActive(group);
              const mobileItems = [
                ...(group.items ?? []),
                ...(group.sections?.flatMap((section) => section.items) ?? []),
              ];
              return (
                <div
                  key={group.label}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]/90"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMobileGroups((prev) => ({
                        ...prev,
                        [group.label]: !prev[group.label],
                      }))
                    }
                    className={cx(
                      "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-black",
                      active ? "text-rose-50" : "text-white/85",
                    )}
                  >
                    {group.label}
                    <ChevronDown
                      className={cx(
                        "h-4 w-4 transition-transform",
                        groupOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {groupOpen && (
                    <div className="border-t border-white/10 p-2">
                      {group.sections
                        ? group.sections.map((section) => (
                            <div
                              key={`${group.label}-mobile-${section.label}`}
                              className="py-1"
                            >
                              <p className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/55">
                                {section.label}
                              </p>
                              {section.items.map((item) =>
                                renderDropdownLink(
                                  item,
                                  `${group.label}-mobile-${section.label}`,
                                ),
                              )}
                            </div>
                          ))
                        : mobileItems.map((item) =>
                            renderDropdownLink(item, `${group.label}-mobile`),
                          )}
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
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-200 to-rose-200 text-xs font-black text-[#5b1022]">
                  {initialsFromName(adminName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">
                    {adminName}
                  </p>
                  <p className="truncate text-xs text-white/55">
                    {adminEmail || "No email on file"}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-50">
                    <ShieldCheck className="h-3 w-3" />
                    {roleLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-100/80">
                    <Sparkles className="h-3 w-3" />
                    Internal Console
                  </span>
                </div>
                {canImpersonate && (
                  <div className="grid gap-2 border-t border-white/10 pt-3">
                    <p className="px-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/55">
                      Impersonation
                    </p>
                    <button
                      type="button"
                      onClick={() => openImpersonation("users")}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm font-black text-white/80"
                    >
                      Log in as User
                    </button>
                    <button
                      type="button"
                      onClick={() => openImpersonation("locations")}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm font-black text-white/80"
                    >
                      Log in as Location / Location Owner
                    </button>
                  </div>
                )}
                <div className="grid gap-1 border-t border-white/10 pt-3">
                  {renderProfileSection(profileQuickActions)}
                  {renderProfileSection(profileAdminControls)}
                  {renderProfileSection(profileSupport)}
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
