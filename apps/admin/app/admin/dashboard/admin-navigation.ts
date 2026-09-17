import {
  Home,
  Mail,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Settings,
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
    label: "Microsoft 365",
    href: "/admin/dashboard/settings/microsoft-365",
    icon: Mail,
    migrated: false,
  },
  { label: "Security", icon: ShieldCheck, migrated: false },
  { label: "Settings", icon: Settings, migrated: false },
] as const;
