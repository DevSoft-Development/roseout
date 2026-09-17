import {
  Home,
  Mail,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type AdminShellNavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  migrated: boolean;
};

export const adminShellNavigation: readonly AdminShellNavItem[] = [
  { label: "Overview", href: "/admin/dashboard", icon: Home, migrated: true },
  {
    label: "Microsoft 365",
    href: "/admin/dashboard/settings/microsoft-365",
    icon: Mail,
    migrated: false,
  },
  { label: "Security", icon: ShieldCheck, migrated: false },
  { label: "Settings", icon: Settings, migrated: false },
] as const;
