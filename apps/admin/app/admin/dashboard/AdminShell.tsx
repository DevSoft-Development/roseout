"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createBrowserSupabaseClient } from "@theouthaven/auth/browser-client";
import type { AdminRole } from "@theouthaven/auth/admin-roles";
import { adminShellNavigation } from "./admin-navigation";

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

  const signOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.assign("/admin/login");
  };

  const navigation = (
    <nav aria-label="Admin navigation" className="admin-shell-nav">
      {adminShellNavigation.map((item) => {
        const Icon = item.icon;
        const active =
          item.href &&
          (item.href === "/admin/dashboard"
            ? pathname === item.href
            : pathname.startsWith(item.href));

        if (!item.migrated || !item.href) {
          return (
            <div className="admin-shell-nav-item is-disabled" key={item.label} aria-disabled="true">
              <Icon size={18} />
              <span>{item.label}</span>
              <small>Moving soon</small>
            </div>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            className={`admin-shell-nav-item${active ? " is-active" : ""}`}
            onClick={() => setOpen(false)}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="admin-shell">
      <aside className="admin-shell-sidebar">
        <div className="admin-shell-brand">
          <span className="admin-shell-logo">OH</span>
          <div>
            <strong>TheOutHaven</strong>
            <small>Admin</small>
          </div>
        </div>
        {navigation}
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
        <div>
          <strong>TheOutHaven Admin</strong>
          <small>{ROLE_LABELS[adminRole]}</small>
        </div>
      </header>

      <main className="admin-shell-content">{children}</main>

      {open ? (
        <div className="admin-shell-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button className="admin-shell-backdrop" type="button" onClick={() => setOpen(false)} aria-label="Close admin navigation" />
          <aside className="admin-shell-drawer-panel">
            <div className="admin-shell-drawer-header">
              <strong>TheOutHaven Admin</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close admin navigation">
                <X size={20} />
              </button>
            </div>
            {navigation}
            <button type="button" className="admin-shell-signout" onClick={signOut}>
              <LogOut size={18} /> Sign out
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
