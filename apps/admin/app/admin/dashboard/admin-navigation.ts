import {
  Database,
  Flag,
  Home,
  KeyRound,
  ListChecks,
  Mail,
  MessageSquareText,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Settings,
  TicketPercent,
  type LucideIcon,
} from "lucide-react";
import type { AdminRole } from "@theouthaven/auth/admin-roles";

export type AdminShellNavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  migrated: boolean;
  roles?: readonly AdminRole[];
};

export const adminShellNavigation: readonly AdminShellNavItem[] = [
  { label: "Overview", href: "/admin/dashboard", icon: Home, migrated: true },
  {
    label: "Platform Errors",
    href: "/admin/dashboard/platform-errors",
    icon: ShieldAlert,
    migrated: true,
    roles: ["superadmin"],
  },
  {
    label: "Platform Logs",
    href: "/admin/dashboard/logs",
    icon: ScrollText,
    migrated: true,
    roles: ["superadmin"],
  },
  {
    label: "Feature Flags",
    href: "/admin/dashboard/feature-flags",
    icon: Flag,
    migrated: true,
    roles: ["superadmin"],
  },
  {
    label: "Reviews",
    href: "/admin/dashboard/reviews",
    icon: MessageSquareText,
    migrated: true,
    roles: ["superadmin", "admin", "editor", "experience_team", "viewer"],
  },
  {
    label: "Launch Checklist",
    href: "/admin/dashboard/launch-checklist",
    icon: ListChecks,
    migrated: true,
    roles: ["superadmin"],
  },
  {
    label: "Data Quality",
    href: "/admin/dashboard/data-quality",
    icon: Database,
    migrated: true,
    roles: ["superadmin", "admin"],
  },
  {
    label: "Promo Codes",
    href: "/admin/dashboard/settings/promo-codes",
    icon: TicketPercent,
    migrated: true,
    roles: ["superadmin"],
  },
  {
    label: "Microsoft 365",
    href: "/admin/dashboard/settings/microsoft-365",
    icon: Mail,
    migrated: true,
  },
  {
    label: "Security",
    href: "/admin/dashboard/security",
    icon: ShieldCheck,
    migrated: true,
    roles: ["superadmin"],
  },
  {
    label: "Credentials",
    href: "/admin/dashboard/credentials",
    icon: KeyRound,
    migrated: true,
    roles: ["superadmin"],
  },
  {
    label: "Ticket Orders",
    href: "/admin/dashboard/ticket-orders",
    icon: ShoppingBag,
    migrated: true,
    roles: ["superadmin", "admin", "manager", "reviewer", "experience_team"],
  },
  { label: "Settings", href: "/admin/dashboard/settings", icon: Settings, migrated: true },
] as const;
