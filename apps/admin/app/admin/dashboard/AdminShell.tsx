"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createBrowserSupabaseClient } from "@theouthaven/auth/browser-client";
import type { AdminRole } from "@theouthaven/auth/admin-roles";
import { adminShellNavigationGroups } from "./admin-navigation";

const ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  manager: "Manager",
  editor: "Editor",
  reviewer: "Reviewer",
  ambassador: "Ambassador Team",
  experience_team: "Experience Team",
  partner_ambassador: "Partner Ambassador",
  marketing_intern: "Marketing Intern",
  marketing_specialist: "Marketing Specialist",
  marketing_manager: "Marketing Manager",
  viewer: "Viewer",
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("") || "A"
  );
}

function isRouteActive(pathname: string, href?: string) {
  if (!href) return false;
  return href === "/admin/dashboard" ? pathname === href : pathname.startsWith(href);
}

export default function AdminShell({
  children,
  adminName,
  adminEmail,
  adminRole,
}: {
  children: ReactNode;
  adminName: string;
  adminEmail: string;
  adminRole: AdminRole;
}) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);

  const visibleGroups = useMemo(
    () =>
      adminShellNavigationGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.roles || item.roles.includes(adminRole)),
        }))
        .filter((group) => group.items.length > 0),
    [adminRole],
  );

  const activeGroupIds = useMemo(
    () =>
      visibleGroups
        .filter((group) => group.items.some((item) => isRouteActive(pathname, item.href)))
        .map((group) => group.id),
    [pathname, visibleGroups],
  );

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const groupExpanded = (groupId: string, defaultOpen?: boolean) => {
    if (activeGroupIds.includes(groupId)) return true;
    if (groupId in collapsedGroups) return !collapsedGroups[groupId];
    return Boolean(defaultOpen);
  };

  const toggleGroup = (groupId: string, defaultOpen?: boolean) => {
    const expanded = groupExpanded(groupId, defaultOpen);
    setCollapsedGroups((current) => ({ ...current, [groupId]: expanded }));
  };

  const currentItem =
    visibleGroups
      .flatMap((group) => group.items)
      .find((item) => isRouteActive(pathname, item.href)) || null;

  const signOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.assign("/admin/login");
  };

  const navigation = (
    <nav aria-label="Admin navigation" className="admin-shell-nav">
      {visibleGroups.map((group) => {
        const GroupIcon = group.icon;
        const expanded = groupExpanded(group.id, group.defaultOpen);
        const active = group.items.some((item) => isRouteActive(pathname, item.href));

        return (
          <section className={`admin-shell-nav-group${active ? " is-active" : ""}`} key={group.id}>
            <button
              type="button"
              className="admin-shell-nav-group-trigger"
              onClick={() => toggleGroup(group.id, group.defaultOpen)}
              aria-expanded={expanded}
            >
              <span className="admin-shell-nav-group-icon"><GroupIcon size={16} /></span>
              <span>{group.label}</span>
              <ChevronDown className={`admin-shell-nav-chevron${expanded ? " is-open" : ""}`} size={16} />
            </button>

            {expanded ? (
              <div className="admin-shell-nav-group-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const itemActive = isRouteActive(pathname, item.href);

                  if (!item.migrated || !item.href) {
                    return (
                      <div className="admin-shell-nav-item is-disabled" key={item.label} aria-disabled="true">
                        <Icon size={17} />
                        <span>{item.label}</span>
                        <small>Moving soon</small>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`admin-shell-nav-item${itemActive ? " is-active" : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </nav>
  );

  return (
    <div className="admin-shell" data-admin-theme="dark">
      <aside className="admin-shell-sidebar">
        <div className="admin-shell-brand">
          <span className="admin-shell-logo">OH</span>
          <div className="admin-shell-brand-copy">
            <strong>TheOutHaven</strong>
            <small>Administration Cloud</small>
          </div>
        </div>

        <div className="admin-shell-environment">
          <span className="admin-shell-status-dot" />
          <div>
            <strong>Production</strong>
            <small>AWS Admin Runtime</small>
          </div>
        </div>

        <div className="admin-shell-nav-scroll">{navigation}</div>

        <div className="admin-shell-user">
          <span className="admin-shell-avatar">{initials(adminName)}</span>
          <div>
            <strong>{adminName}</strong>
            <small>{adminEmail || ROLE_LABELS[adminRole]}</small>
          </div>
          <button type="button" onClick={signOut} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <header className="admin-shell-header">
        <button type="button" className="admin-shell-menu" onClick={() => setOpen(true)} aria-label="Open admin navigation">
          <Menu size={20} />
        </button>
        <div className="admin-shell-header-copy">
          <small>TheOutHaven Administration</small>
          <strong>{currentItem?.label || "Command Center"}</strong>
        </div>
        <div className="admin-shell-header-status">
          <span className="admin-shell-status-dot" />
          <span>Production</span>
        </div>
      </header>

      <div className="admin-shell-desktop-topbar">
        <div>
          <span className="admin-shell-topbar-eyebrow">TheOutHaven Administration</span>
          <strong>{currentItem?.label || "Command Center"}</strong>
        </div>
        <div className="admin-shell-topbar-actions">
          <Link href="/admin/dashboard/search-health" className="admin-shell-topbar-action">
            <Search size={16} /> Search Health
          </Link>
          <span className="admin-shell-topbar-runtime"><span className="admin-shell-status-dot" /> Production · AWS</span>
        </div>
      </div>

      <main className="admin-shell-content">
        <div className="admin-enterprise-surface">{children}</div>
      </main>

      {open ? (
        <div className="admin-shell-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button className="admin-shell-backdrop" type="button" onClick={() => setOpen(false)} aria-label="Close admin navigation" />
          <aside className="admin-shell-drawer-panel">
            <div className="admin-shell-drawer-header">
              <div>
                <small>TheOutHaven</small>
                <strong>Administration Cloud</strong>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close admin navigation">
                <X size={20} />
              </button>
            </div>
            <div className="admin-shell-nav-scroll">{navigation}</div>
            <button type="button" className="admin-shell-signout" onClick={signOut}>
              <LogOut size={18} /> Sign out
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
